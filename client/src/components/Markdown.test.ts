import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { tidyText } from '../lib/pasteMarkdown';

// The test runner compiles JSX in classic mode (React.createElement), unlike Vite.
(globalThis as { React?: unknown }).React = React;
const { default: Markdown } = await import('./Markdown');

const html = (src: string) => renderToStaticMarkup(React.createElement(Markdown, { source: src }));
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

test('bullets pasted from a document (•) render as one list', () => {
  const out = html('Who this policy covers\n\n• Merchants\n• People who join the waitlist\n• Reviewers');
  assert.equal(count(out, /<ul/g), 1);
  assert.equal(count(out, /<li/g), 3);
});

test('a wrapped, indented line stays inside its bullet instead of breaking the list', () => {
  const out = html('• Review data: reviews from your store, plus replies\n    posted through Eqence.\n\n• Billing information: your plan.');
  assert.equal(count(out, /<ul/g), 1, 'blank line between items does not split the list');
  assert.equal(count(out, /<li/g), 2);
  assert.match(out, /plus replies posted through Eqence\./);
  assert.equal(count(out, /<p/g), 0);
});

test('titles, subtitles and bold', () => {
  const out = html('## Information we collect\n\n### Account\n\n**Important:** read this.');
  assert.match(out, /<h2[^>]*>Information we collect<\/h2>/);
  assert.match(out, /<h3[^>]*>Account<\/h3>/);
  assert.match(out, /<strong>Important:<\/strong> read this\./);
});

test('a paragraph after a list (after a blank line) ends the list', () => {
  const out = html('- one\n- two\n\nWe do not sell personal information.');
  assert.equal(count(out, /<li/g), 2);
  assert.match(out, /<\/ul><p[^>]*>We do not sell/);
});

test('still no HTML passes through', () => {
  const out = html('• <img src=x onerror=alert(1)>\n\n<script>alert(1)</script>');
  assert.doesNotMatch(out, /<img|<script/);
});

test('tidyText turns document bullets into Markdown bullets', () => {
  assert.equal(tidyText('Intro\r\n• one\r\n·\ttwo\r\n   three\r\n\r\n\r\n\r\nEnd'), 'Intro\n- one\n- two\n  - three\n\nEnd');
});

test('tidyText joins a list Word pasted as separate paragraphs', () => {
  assert.equal(tidyText('Intro\n\n- one\n\n- two\n\n1. a\n\n2. b\n\nEnd'), 'Intro\n\n- one\n- two\n1. a\n2. b\n\nEnd');
});
