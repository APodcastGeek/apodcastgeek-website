/**
 * Unit tests for the pure helpers in triage.js — the ones that keep payloads
 * inside Notion's limits. Run with: node test.js
 */

const t = require('./triage.js');

let failures = 0;

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name);
  if (!ok) {
    console.log('   expected: ' + JSON.stringify(expected));
    console.log('   actual:   ' + JSON.stringify(actual));
    failures++;
  }
}

const long = 'x'.repeat(5000);

// truncate stays under Notion's 2000-char rich_text ceiling
check('truncate caps length', t.truncate(long, 1900).length, 1900);
check('truncate leaves short strings alone', t.truncate('hi', 1900), 'hi');

// chunk must never emit a piece over the limit (transcript -> page blocks)
const chunks = t.chunk('y'.repeat(4501), 1900);
check('chunk count', chunks.length, 3);
check('chunk max size', Math.max.apply(null, chunks.map(function (c) { return c.length; })), 1900);
check('chunk is lossless', chunks.join('').length, 4501);

// commas break Notion multi-select options
check('multiSelect strips commas', t.multiSelect(['Reel hooks, short form']),
  { multi_select: [{ name: 'Reel hooks  short form' }] });
check('multiSelect dedupes', t.multiSelect(['A', 'A', 'B']),
  { multi_select: [{ name: 'A' }, { name: 'B' }] });
check('multiSelect drops empties', t.multiSelect(['', '  ', 'Real']),
  { multi_select: [{ name: 'Real' }] });
check('multiSelect caps at 10',
  t.multiSelect(Array.from({ length: 20 }, function (_, i) { return 't' + i; })).multi_select.length, 10);

// rating must land in 1-10 whatever the model returns
check('clamp high', t.clampRating(47), 10);
check('clamp low', t.clampRating(0), 1);
check('clamp rounds', t.clampRating(7.6), 8);
check('clamp handles garbage', t.clampRating('abc'), 5);
check('clamp handles null', t.clampRating(null), 1);

// a long summary must still produce a valid Notion property
check('textProp truncates', t.textProp(long).rich_text[0].text.content.length, 1900);
check('textProp handles empty', t.textProp('').rich_text, []);

// schema sanity: every required field is declared
check('schema required fields all declared',
  t.ANALYSIS_SCHEMA.required.filter(function (r) { return !(r in t.ANALYSIS_SCHEMA.properties); }), []);

console.log(failures === 0 ? '\nAll tests passed.' : '\n' + failures + ' test(s) failed.');
process.exit(failures === 0 ? 0 : 1);
