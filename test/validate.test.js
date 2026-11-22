import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMoney, parseWholeNumber, cleanText } from '../src/lib/validate.js';

test('parseMoney accepts plain amounts and normalises them to two decimals', () => {
  const cases = {
    '12': '12.00',
    '12.5': '12.50',
    ' 7.25 ': '7.25',
    '0': '0.00',
    '0.05': '0.05',
    '007.5': '7.50',
    '9999999999.99': '9999999999.99',
  };
  for (const [input, want] of Object.entries(cases)) {
    assert.equal(parseMoney(input), want, JSON.stringify(input));
  }
});

test('parseMoney rejects anything that is not a plain non-negative amount', () => {
  const bad = ['-1', '1,000', '1e3', '12.345', '99999999999', '', '   ', '.5', '5.', 'abc', '+5', '0x10',
    'NaN', 'Infinity', '১২', '1 000'];
  for (const input of bad) {
    assert.equal(parseMoney(input), null, JSON.stringify(input));
  }
  for (const input of [undefined, null, 12, ['1', '2'], { a: '1' }]) {
    assert.equal(parseMoney(input), null, JSON.stringify(input));
  }
});

test('parseWholeNumber accepts integers within the bounds', () => {
  assert.equal(parseWholeNumber('5', { min: 1, max: 10 }), 5);
  assert.equal(parseWholeNumber(' 10 ', { min: 1, max: 10 }), 10);
  assert.equal(parseWholeNumber('007', { min: 0, max: 10 }), 7);
  assert.equal(parseWholeNumber('-3', { min: -5, max: 5 }), -3);
  assert.ok(Object.is(parseWholeNumber('-0', { min: -5, max: 5 }), 0));
});

test('parseWholeNumber rejects out-of-range, fractional and malformed input', () => {
  const bounds = { min: 1, max: 10 };
  for (const input of ['0', '11', '-1', '1.5', '1.0', 'abc', '', '1e1', '+5', '5 5', '99999999999999999999']) {
    assert.equal(parseWholeNumber(input, bounds), null, JSON.stringify(input));
  }
  for (const input of [undefined, null, 5, ['1'], { a: '1' }]) {
    assert.equal(parseWholeNumber(input, bounds), null, JSON.stringify(input));
  }
});

test('cleanText trims and enforces a maximum length', () => {
  assert.equal(cleanText('  Rice  ', { maxLength: 100 }), 'Rice');
  assert.equal(cleanText('চাল', { maxLength: 3 }), 'চাল');
  assert.equal(cleanText('a'.repeat(100), { maxLength: 100 }), 'a'.repeat(100));
  assert.equal(cleanText('a'.repeat(101), { maxLength: 100 }), null);
  assert.equal(cleanText('   ', { maxLength: 100 }), null);
  assert.equal(cleanText(['a', 'b'], { maxLength: 100 }), null);
  assert.equal(cleanText(undefined, { maxLength: 100 }), null);
});
