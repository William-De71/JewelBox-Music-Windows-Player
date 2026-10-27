import { expect, it } from 'vitest';
import { formatDuration } from '../src/core/formats.js';

it.each([
  [0, '0:00'], [7, '0:07'], [245, '4:05'], [60, '1:00'], [3725, '1:02:05'], [245.9, '4:05'],
  [null, '0:00'], [undefined, '0:00'], [-3, '0:00'], [Infinity, '0:00'], ['abc', '0:00'],
])('formatDuration(%j) = %s', (input, expected) => {
  expect(formatDuration(input)).toBe(expected);
});
