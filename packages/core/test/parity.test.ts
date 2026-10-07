import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  apiSecretMatches, banHours, cleanIp, cleanList, cleanSequence, csvCell, generateApiKey, parseApiKey,
  planAllowsSequences, sequencesMinPlan, toCsv, viewAsOptions,
} from '../src/parity';
import { SITE_LADDER } from '../src/pricing';

const step = (body = 'Hi, thanks for your interest!', delayMinutes = 0) => ({ body, delayMinutes });

test('sequence: a valid one is cleaned and kept', () => {
  const r = cleanSequence({ name: '  Welcome  ', triggerIntent: 70, triggerKeywords: ' price, buy ', steps: [step(), step('Still interested?', 1440)] });
  assert.ok('value' in r);
  assert.deepEqual(r.value, { name: 'Welcome', triggerIntent: 70, triggerKeywords: 'price, buy', isActive: true,
    steps: [{ delayMinutes: 0, body: 'Hi, thanks for your interest!' }, { delayMinutes: 1440, body: 'Still interested?' }] });
});

test('sequence: the limits C2C enforced', () => {
  const bad = (b: Record<string, unknown>) => { const r = cleanSequence(b); assert.ok('error' in r, JSON.stringify(b).slice(0, 60)); return r.error; };
  const ok = { name: 'A', triggerIntent: 50, steps: [step()] };
  assert.match(bad({ ...ok, name: '' }), /name/);
  assert.match(bad({ ...ok, name: 'x'.repeat(121) }), /name/);
  assert.match(bad({ ...ok, triggerIntent: 101 }), /0 to 100/);
  assert.match(bad({ ...ok, triggerIntent: 'abc' }), /0 to 100/);
  assert.match(bad({ ...ok, steps: [] }), /at least one/);
  assert.match(bad({ ...ok, steps: 'nope' }), /list/);
  assert.match(bad({ ...ok, steps: Array.from({ length: 11 }, () => step()) }), /At most 10/);
  assert.match(bad({ ...ok, steps: [step('')] }), /needs a message/);
  assert.match(bad({ ...ok, steps: [step('x'.repeat(1001))] }), /1000/);
  assert.match(bad({ ...ok, steps: [step('hi', 43201)] }), /43200/);
  assert.match(bad({ ...ok, steps: [step('hi', -1)] }), /43200/);
  assert.match(bad({ ...ok, steps: [null] }), /needs a message/);
});

test('sequences are sold from the second plan up, as in C2C', () => {
  assert.equal(sequencesMinPlan(SITE_LADDER)?.slug, 'eqence-basic');
  assert.equal(planAllowsSequences('eqence-starter', SITE_LADDER), false);
  assert.equal(planAllowsSequences('eqence-basic', SITE_LADDER), true);
  assert.equal(planAllowsSequences('eqence-premium', SITE_LADDER), true);
  assert.equal(planAllowsSequences(null, SITE_LADDER), false);
  assert.equal(planAllowsSequences('pro', SITE_LADDER), false, 'an old C2C tier name is not a plan');
  assert.equal(planAllowsSequences('eqence-basic', []), false, 'no ladder, no feature');
});

test('API key: round trip, and only the right secret matches', () => {
  const k = generateApiKey();
  assert.match(k.plaintext, /^eqk_[0-9a-f]{12}_[0-9a-f]{48}$/);
  const parsed = parseApiKey(`Bearer ${k.plaintext}`);
  assert.equal(parsed?.keyId, k.keyId);
  assert.equal(apiSecretMatches(parsed!.secret, k.keyHash), true);
  assert.equal(apiSecretMatches('0'.repeat(48), k.keyHash), false);
  assert.equal(apiSecretMatches(parsed!.secret, 'not-hex'), false);
  assert.ok(!k.keyHash.includes(parsed!.secret), 'the stored hash does not contain the secret');
  for (const bad of [undefined, '', 'Bearer', 'Bearer abc', `eqk_${k.keyId}_short`, k.plaintext + 'x']) assert.equal(parseApiKey(bad), null);
});

test('IP ban input: one real address only', () => {
  assert.equal(cleanIp(' 203.0.113.9 '), '203.0.113.9');
  assert.equal(cleanIp('2001:DB8::1'), '2001:db8::1');
  for (const bad of ['203.0.113.0/24', 'example.com', '999.1.1.1', '', null, "1.1.1.1'; drop table"]) assert.equal(cleanIp(bad), null);
  assert.equal(banHours(undefined), 24);
  assert.equal(banHours(0), 24);
  assert.equal(banHours(72.9), 72);
  assert.equal(banHours(1e9), 24 * 365);
});

test('CSV: quoting, and formula cells are defused', () => {
  assert.equal(csvCell('plain'), 'plain');
  assert.equal(csvCell('a,b "c"'), '"a,b ""c"""');
  assert.equal(csvCell('=HYPERLINK("http://x")'), `"'=HYPERLINK(""http://x"")"`);
  assert.equal(csvCell('+1'), "'+1");
  assert.equal(csvCell(null), '');
  assert.equal(csvCell({ a: 1 }), '"{""a"":1}"');
  assert.equal(toCsv(['id', 'action'], [[1, 'x'], [2, 'y,z']]), 'id,action\r\n1,x\r\n2,"y,z"\r\n');
});

test('lists and view-as options', () => {
  assert.deepEqual(cleanList(' a, b ,a,, c '), ['a', 'b', 'c']);
  assert.deepEqual(cleanList(['x', 'x', 2]), ['x', '2']);
  assert.deepEqual(viewAsOptions(SITE_LADDER), ['unlimited', 'none', ...SITE_LADDER.map((p) => p.slug)]);
});
