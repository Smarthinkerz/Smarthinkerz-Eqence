import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authorKey, cleanEmail, cleanManual, cleanPhone, cleanStage, cleanTags } from '../src/crm';

test('customer identity: platform id first, else handle or name, per platform', () => {
  assert.equal(authorKey('judgeme', { externalId: '2658654809', displayName: 'Emma' }), 'judgeme:2658654809');
  assert.equal(authorKey('instagram', { handle: '@Sarah_M ' }), 'instagram:name:sarah_m');
  assert.equal(authorKey('instagram', { displayName: '  Sarah   M ' }), 'instagram:name:sarah m');
  assert.equal(authorKey('whatsapp', { displayName: 'سالم' }), 'whatsapp:name:سالم');
  assert.notEqual(authorKey('instagram', { handle: 'sarah_m' }), authorKey('facebook', { handle: 'sarah_m' }), 'the same name on two platforms is two records');
  assert.equal(authorKey('judgeme', {}), null, 'an anonymous author gets no record');
  assert.equal(authorKey('judgeme', { displayName: '   ' }), null);
});

test('a comment added by hand is validated', () => {
  const ok = cleanManual({ platform: 'instagram', authorName: ' sarah_m ', body: ' How much is this?\r\nI need 5. ' });
  assert.deepEqual(ok, { value: { platform: 'instagram', channelType: 'comment', authorName: 'sarah_m', body: 'How much is this?\nI need 5.' } });
  assert.equal((cleanManual({ platform: 'whatsapp', channelType: 'dm', authorName: 'A', body: 'hi' }) as any).value.channelType, 'dm');
  const bad = (b: Record<string, unknown>) => { const r = cleanManual(b); assert.ok('error' in r, JSON.stringify(b).slice(0, 50)); return r.error; };
  assert.match(bad({ platform: 'judgeme', authorName: 'A', body: 'x' }), /Choose where/, 'connected sources cannot be faked by hand');
  assert.match(bad({ platform: 'instagram', channelType: 'review', authorName: 'A', body: 'x' }), /comment or dm/);
  assert.match(bad({ platform: 'instagram', authorName: '', body: 'x' }), /name or handle/);
  assert.match(bad({ platform: 'instagram', authorName: 'A', body: '  ' }), /Paste what/);
  assert.match(bad({ platform: 'instagram', authorName: 'A', body: 'x'.repeat(2001) }), /2,000/);
});

test('what the merchant types about a customer is cleaned', () => {
  assert.equal(cleanStage('won'), 'won');
  assert.equal(cleanStage('vip'), null);
  assert.deepEqual(cleanTags(' VIP, wholesale ,vip,, Muscat '), ['vip', 'wholesale', 'muscat']);
  assert.equal(cleanTags(Array.from({ length: 30 }, (_, i) => `t${i}`)).length, 12);
  assert.equal(cleanEmail(' a@b.co '), 'a@b.co');
  assert.equal(cleanEmail(''), null, 'empty clears the field');
  assert.equal(cleanEmail('not an email'), undefined, 'invalid is refused');
  assert.equal(cleanPhone('+968 9123 4567'), '+968 9123 4567');
  assert.equal(cleanPhone(''), null);
  assert.equal(cleanPhone('call me'), undefined);
});
