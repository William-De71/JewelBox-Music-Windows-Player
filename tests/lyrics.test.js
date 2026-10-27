import { expect, it } from 'vitest';
import { currentLineIndex, parseLyrics } from '../src/core/lyrics.js';

it('lignes synchronisées triées, entrées invalides écartées', () => {
  const lyrics = parseLyrics({ synced: true, lines: [{ time: 12, text: 'b' }, { time: 1.5, text: 'a' }, { text: 'x' }, { time: 'n/a' }, null], source: 'lrclib' });
  expect(lyrics.lines).toEqual([{ time: 1.5, text: 'a' }, { time: 12, text: 'b' }]);
  expect(lyrics).toMatchObject({ synced: true, empty: false, source: 'lrclib' });
});

it('texte brut, instrumental, vide', () => {
  expect(parseLyrics({ synced: false, plain: 'la la' })).toMatchObject({ synced: false, plain: 'la la', empty: false });
  expect(parseLyrics({ instrumental: true })).toMatchObject({ instrumental: true, empty: false });
  expect(parseLyrics({ plain: '   ' }).empty).toBe(true);
  expect(parseLyrics(null).empty).toBe(true);
  expect(parseLyrics([]).empty).toBe(true);
});

it('ligne en cours, avec une petite avance', () => {
  const lines = [{ time: 5 }, { time: 10 }, { time: 20 }];
  expect(currentLineIndex(lines, 0)).toBe(-1);
  expect(currentLineIndex(lines, 4.8)).toBe(0);
  expect(currentLineIndex(lines, 12)).toBe(1);
  expect(currentLineIndex(lines, 99)).toBe(2);
  expect(currentLineIndex([], 3)).toBe(-1);
});
