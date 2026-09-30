// One AI layer for every channel: classification runs on every ingested Interaction and
// is never billed; drafting a reply is the billable action (merge-spec §3.7). The model
// provider is configuration (AI_PROVIDER = openai | anthropic) so Arabic quality can be
// compared without code changes. Calls go straight to each provider's REST API.

export type Sentiment = 'positive' | 'neutral' | 'negative' | 'mixed';
export type Intent = 'complaint' | 'praise' | 'question' | 'purchase_intent' | 'spam' | 'other';

export interface Usage { model: string; tokensIn: number; tokensOut: number }

export interface Classification {
  language: string;           // BCP-47 primary tag, e.g. 'ar', 'en'
  sentiment: Sentiment;
  sentimentScore: number;     // -1 .. 1
  intent: Intent;
}

export interface InteractionForAI {
  channelType: string;
  subject?: string | null;
  title?: string | null;
  body: string;
  rating?: number | null;
  authorName?: string | null;
}

export interface BrandVoiceForAI {
  tone: string;
  bannedPhrases: string[];
  signature?: string | null;
  dialectNotes?: string | null;
  storeName: string;
}

export interface AiConfig {
  provider: 'openai' | 'anthropic';
  apiKey: string;
  classifyModel: string;
  draftModel: string;
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
}

const SENTIMENTS: Sentiment[] = ['positive', 'neutral', 'negative', 'mixed'];
const INTENTS: Intent[] = ['complaint', 'praise', 'question', 'purchase_intent', 'spam', 'other'];

async function complete(cfg: AiConfig, model: string, system: string, user: string, maxTokens: number):
  Promise<{ text: string; usage: Usage }> {
  const f = cfg.fetchImpl ?? fetch;
  if (!cfg.apiKey) throw new Error('AI provider API key is not configured');
  if (cfg.provider === 'anthropic') {
    const res = await f('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
    });
    if (!res.ok) throw new Error(`Anthropic returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const j = (await res.json()) as { content: Array<{ type: string; text?: string }>; usage: { input_tokens: number; output_tokens: number } };
    return {
      text: j.content.filter((c) => c.type === 'text').map((c) => c.text).join(''),
      usage: { model, tokensIn: j.usage.input_tokens, tokensOut: j.usage.output_tokens },
    };
  }
  const res = await f('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model, max_tokens: maxTokens,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error(`OpenAI returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = (await res.json()) as { choices: Array<{ message: { content: string } }>; usage: { prompt_tokens: number; completion_tokens: number } };
  return {
    text: j.choices[0]?.message.content ?? '',
    usage: { model, tokensIn: j.usage.prompt_tokens, tokensOut: j.usage.completion_tokens },
  };
}

/** Pulls the first JSON object out of a model reply (tolerates code fences and prose). */
export function parseJsonObject(text: string): Record<string, unknown> {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('model reply contained no JSON object');
  return JSON.parse(text.slice(start, end + 1));
}

function describe(i: InteractionForAI): string {
  return [
    `Channel: ${i.channelType}`,
    i.subject ? `About: ${i.subject}` : null,
    i.rating != null ? `Star rating: ${i.rating}/5` : null,
    i.authorName ? `Customer name: ${i.authorName}` : null,
    i.title ? `Title: ${i.title}` : null,
    `Text:\n"""\n${i.body}\n"""`,
  ].filter(Boolean).join('\n');
}

export const CLASSIFY_SYSTEM = `You classify one customer message for an online store.
Return only a JSON object with exactly these keys:
  "language": the BCP-47 primary language tag of the customer's text (e.g. "ar", "en", "fr"); for mixed Arabic-English text use the dominant language,
  "sentiment": one of "positive", "neutral", "negative", "mixed",
  "sentiment_score": a number from -1 (very negative) to 1 (very positive),
  "intent": one of "complaint", "praise", "question", "purchase_intent", "spam", "other".
Read Gulf and other Arabic dialects as they are; do not translate first. A star rating is a strong signal but the text wins when they disagree.`;

export function parseClassification(obj: Record<string, unknown>): Classification {
  const sentiment = String(obj.sentiment) as Sentiment;
  const intent = String(obj.intent) as Intent;
  const score = Number(obj.sentiment_score);
  const language = String(obj.language ?? '').toLowerCase().split(/[-_]/)[0];
  if (!SENTIMENTS.includes(sentiment)) throw new Error(`invalid sentiment "${obj.sentiment}"`);
  if (!INTENTS.includes(intent)) throw new Error(`invalid intent "${obj.intent}"`);
  if (!Number.isFinite(score)) throw new Error('invalid sentiment_score');
  if (!/^[a-z]{2,3}$/.test(language)) throw new Error(`invalid language "${obj.language}"`);
  return { language, sentiment, intent, sentimentScore: Math.max(-1, Math.min(1, score)) };
}

export async function classify(cfg: AiConfig, i: InteractionForAI): Promise<{ result: Classification; usage: Usage }> {
  const { text, usage } = await complete(cfg, cfg.classifyModel, CLASSIFY_SYSTEM, describe(i), 200);
  return { result: parseClassification(parseJsonObject(text)), usage };
}

export function draftSystemPrompt(v: BrandVoiceForAI): string {
  return `You write the public reply from ${v.storeName} to one customer review or comment.
Rules:
- Reply in the same language as the customer. If they wrote Arabic, write natural Arabic that a Gulf customer reads as warm and human${v.dialectNotes ? ` (${v.dialectNotes})` : ''}; do not write a word-for-word translation of English.
- Tone: ${v.tone}. Two to four sentences. Address what they actually said.
- Never invent facts: no refunds, discounts, delivery dates, policies or promises the text does not already establish, and never promise changes to how the store operates (faster delivery, better packaging, new processes). For a problem, apologise and invite them to contact the store privately.
- Never mention AI, and never repeat personal data such as emails, phone numbers or order numbers.${v.bannedPhrases.length ? `\n- Never use these phrases: ${v.bannedPhrases.map((p) => JSON.stringify(p)).join(', ')}.` : ''}${v.signature ? `\n- End with this signature: ${v.signature}` : ''}
Return only a JSON object: {"language": "<BCP-47 primary tag of your reply>", "reply": "<the reply text>"}.`;
}

export async function draftReply(cfg: AiConfig, i: InteractionForAI, v: BrandVoiceForAI):
  Promise<{ reply: string; language: string; usage: Usage }> {
  const { text, usage } = await complete(cfg, cfg.draftModel, draftSystemPrompt(v), describe(i), 600);
  const obj = parseJsonObject(text);
  const reply = String(obj.reply ?? '').trim();
  if (!reply) throw new Error('model returned an empty reply');
  const lower = reply.toLowerCase();
  const banned = v.bannedPhrases.find((p) => p && lower.includes(p.toLowerCase()));
  if (banned) throw new Error(`draft used a banned phrase: ${banned}`);
  return { reply, language: String(obj.language ?? '').toLowerCase().split(/[-_]/)[0] || 'und', usage };
}
