// Tests the request shapes and the parsing/validation around the model. They do not
// judge model quality; that needs a live key and real reviews (Phase 2 proof).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classify, draftReply, draftSystemPrompt, parseClassification, parseJsonObject, type AiConfig } from '../src/index';

function fakeProvider(provider: 'openai' | 'anthropic', text: string) {
  const calls: Array<{ url: string; headers: Record<string, string>; body: any }> = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    calls.push({ url, headers: init?.headers as Record<string, string>, body: JSON.parse(String(init?.body)) });
    const body = provider === 'anthropic'
      ? { content: [{ type: 'text', text }], usage: { input_tokens: 11, output_tokens: 7 } }
      : { choices: [{ message: { content: text } }], usage: { prompt_tokens: 11, completion_tokens: 7 } };
    return new Response(JSON.stringify(body), { status: 200 });
  };
  const cfg: AiConfig = { provider, apiKey: 'k', classifyModel: 'm-classify', draftModel: 'm-draft', fetchImpl };
  return { cfg, calls };
}

const review = { channelType: 'review', subject: 'Oud perfume', rating: 1, body: 'وصلني العطر مكسور والريحة ما تثبت', authorName: 'Salem' };
const voice = { tone: 'warm, concise', bannedPhrases: ['valued customer'], storeName: 'Example Store' };

test('classify via Anthropic: request shape, parsing and usage', async () => {
  const { cfg, calls } = fakeProvider('anthropic', '{"language":"ar","sentiment":"negative","sentiment_score":-0.8,"intent":"complaint"}');
  const { result, usage } = await classify(cfg, review);
  assert.equal(calls[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(calls[0].headers['x-api-key'], 'k');
  assert.equal(calls[0].body.model, 'm-classify');
  assert.match(calls[0].body.messages[0].content, /Star rating: 1\/5/);
  assert.deepEqual(result, { language: 'ar', sentiment: 'negative', sentimentScore: -0.8, intent: 'complaint' });
  assert.deepEqual(usage, { model: 'm-classify', tokensIn: 11, tokensOut: 7 });
});

test('classify via OpenAI asks for a JSON object', async () => {
  const { cfg, calls } = fakeProvider('openai', '{"language":"en","sentiment":"positive","sentiment_score":0.9,"intent":"praise"}');
  const { result } = await classify(cfg, { channelType: 'review', body: 'Love it' });
  assert.equal(calls[0].url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(calls[0].headers.Authorization, 'Bearer k');
  assert.deepEqual(calls[0].body.response_format, { type: 'json_object' });
  assert.equal(result.sentiment, 'positive');
});

test('classification output is validated, not trusted', () => {
  assert.throws(() => parseClassification({ language: 'ar', sentiment: 'angry', sentiment_score: -1, intent: 'complaint' }), /invalid sentiment/);
  assert.throws(() => parseClassification({ language: 'ar', sentiment: 'negative', sentiment_score: 'x', intent: 'complaint' }), /sentiment_score/);
  assert.throws(() => parseClassification({ language: 'arabic language', sentiment: 'negative', sentiment_score: -1, intent: 'complaint' }), /language/);
  assert.equal(parseClassification({ language: 'en-US', sentiment: 'mixed', sentiment_score: 5, intent: 'other' }).sentimentScore, 1);
});

test('parseJsonObject tolerates code fences and prose', () => {
  assert.deepEqual(parseJsonObject('Here:\n```json\n{"a":1}\n```'), { a: 1 });
  assert.throws(() => parseJsonObject('no json here'));
});

test('draftReply returns the reply and rejects banned phrases', async () => {
  const ok = fakeProvider('anthropic', '{"language":"ar","reply":"نعتذر يا سالم عن وصول العطر مكسوراً، تواصل معنا وسنرتب الأمر."}');
  const out = await draftReply(ok.cfg, review, voice);
  assert.equal(out.language, 'ar');
  assert.match(out.reply, /سالم/);
  assert.equal(ok.calls[0].body.model, 'm-draft');

  const bad = fakeProvider('anthropic', '{"language":"en","reply":"Dear valued customer, sorry."}');
  await assert.rejects(draftReply(bad.cfg, { channelType: 'review', body: 'bad' }, voice), /banned phrase/);

  const empty = fakeProvider('anthropic', '{"language":"en","reply":"  "}');
  await assert.rejects(draftReply(empty.cfg, { channelType: 'review', body: 'x' }, voice), /empty reply/);
});

test('the draft prompt forbids invented promises and carries the brand voice', () => {
  const p = draftSystemPrompt({ ...voice, signature: '- The Example team', dialectNotes: 'Gulf Arabic' });
  assert.match(p, /Never invent facts/);
  assert.match(p, /never promise changes to how the store operates/);
  assert.match(p, /Gulf Arabic/);
  assert.match(p, /"valued customer"/);
  assert.match(p, /- The Example team/);
});

test('a missing API key fails loudly', async () => {
  await assert.rejects(classify({ provider: 'openai', apiKey: '', classifyModel: 'm', draftModel: 'm' }, review), /not configured/);
});
