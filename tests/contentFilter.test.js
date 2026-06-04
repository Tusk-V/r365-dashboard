const test = require('node:test');
const assert = require('node:assert/strict');
const { maskText } = require('../lib/contentFilter');

test('masks profanity, case-insensitive, matching length', () => {
  const r = maskText('What the FUCK is this shit');
  assert.equal(r.filtered, true);
  assert.equal(r.text, 'What the **** is this ****');
});

test('masks whole words only — no Scunthorpe problem', () => {
  // "Scunthorpe" contains "cunt"; "class" contains "ass" — neither masked.
  const r = maskText('Welcome to Scunthorpe class assassin');
  assert.equal(r.filtered, false);
  assert.equal(r.text, 'Welcome to Scunthorpe class assassin');
});

test('masks slurs', () => {
  const r = maskText('that is retarded');
  assert.equal(r.filtered, true);
  assert.equal(r.text, 'that is ********');
});

test('masks the longest matching variant fully', () => {
  // "Fucking" (7 letters) masks fully rather than leaving "ing".
  assert.equal(maskText('Fucking broken again').text, '******* broken again');
});

test('leaves clean text untouched and unflagged', () => {
  const r = maskText('Great shift today, team!');
  assert.equal(r.filtered, false);
  assert.equal(r.text, 'Great shift today, team!');
});

test('handles empty / null', () => {
  assert.deepEqual(maskText(''), { text: '', filtered: false });
  assert.deepEqual(maskText(null), { text: '', filtered: false });
});

test('idempotent on already-masked text', () => {
  const once = maskText('fuck this').text;
  const twice = maskText(once).text;
  assert.equal(once, twice);
  assert.equal(maskText(once).filtered, false);
});
