import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blogAssist, BLOG_LENGTHS, type AiConfig, type BlogLength } from '../src/index';

function provider(provider: 'anthropic' | 'openai') {
  const sent: any[] = [];
  const cfg: AiConfig = {
    provider, apiKey: 'k', classifyModel: 'small', draftModel: 'writer',
    fetchImpl: async (_url, init) => {
      sent.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify(provider === 'anthropic'
        ? { content: [{ type: 'text', text: '## Intro\nText' }], usage: { input_tokens: 1, output_tokens: 1 } }
        : { choices: [{ message: { content: '## Intro\nText' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }));
    },
  };
  return { cfg, sent };
}
const promptOf = (b: any) => b.messages[b.messages.length - 1].content as string;

test('full post: each length asks for its word count and gets room to finish', async () => {
  for (const p of ['anthropic', 'openai'] as const) {
    const { cfg, sent } = provider(p);
    const want: Record<BlogLength, RegExp> = { short: /Length: about 600 words\./, medium: /Length: about 1,500 words\./, long: /between 3,000 and 3,500 words, and never more than 3,500/ };
    for (const len of ['short', 'medium', 'long'] as const) {
      await blogAssist(cfg, 'full_post', 'Replying to negative reviews', '', len);
      const body = sent[sent.length - 1];
      assert.match(promptOf(body), want[len]);
      assert.equal(body.max_tokens, BLOG_LENGTHS[len].maxTokens);
      assert.equal(body.model, 'writer');
    }
    assert.ok(BLOG_LENGTHS.short.maxTokens < BLOG_LENGTHS.medium.maxTokens && BLOG_LENGTHS.medium.maxTokens < BLOG_LENGTHS.long.maxTokens);
    await blogAssist(cfg, 'full_post', 'A topic', '');
    assert.match(promptOf(sent[sent.length - 1]), /about 600 words/, 'short is the default');
    assert.match(promptOf(sent[sent.length - 1]), /never with filler or repetition/);
  }
});

test('length only changes full posts, and an unknown length is refused', async () => {
  const { cfg, sent } = provider('anthropic');
  await blogAssist(cfg, 'titles', 'A topic', '', 'long');
  assert.equal(sent[0].max_tokens, 3000);
  assert.doesNotMatch(promptOf(sent[0]), /3,500/);
  await assert.rejects(blogAssist(cfg, 'full_post', 'A topic', '', 'epic' as BlogLength), /unknown length/);
  await assert.rejects(blogAssist(cfg, 'full_post', 'A topic', '', 'constructor' as BlogLength), /unknown length/);
});

test('translate and improve get room in proportion to the text; nothing cut off is passed on as complete', async () => {
  const { reworkTokens } = await import('../src/index');
  assert.equal(reworkTokens('short text'), 3000, 'never less than before');
  assert.equal(reworkTokens('x'.repeat(22000)), 22000, 'a 3,500 word post gets room for its Arabic');
  assert.equal(reworkTokens('x'.repeat(60000)), 28000, 'capped');
  const { cfg, sent } = provider('anthropic');
  await blogAssist(cfg, 'translate_ar', '', 'x'.repeat(22000));
  assert.equal(sent[0].max_tokens, 22000);
  await blogAssist(cfg, 'improve', '', 'x'.repeat(100));
  assert.equal(sent[1].max_tokens, 3000);

  for (const p of ['anthropic', 'openai'] as const) {
    const cut: AiConfig = {
      provider: p, apiKey: 'k', classifyModel: 's', draftModel: 'w',
      fetchImpl: async () => new Response(JSON.stringify(p === 'anthropic'
        ? { content: [{ type: 'text', text: 'Half a tran' }], stop_reason: 'max_tokens', usage: { input_tokens: 1, output_tokens: 1 } }
        : { choices: [{ message: { content: 'Half a tran' }, finish_reason: 'length' }], usage: { prompt_tokens: 1, completion_tokens: 1 } })),
    };
    await assert.rejects(blogAssist(cut, 'translate_ar', '', 'some text'), /cut off before the end/);
  }
});
