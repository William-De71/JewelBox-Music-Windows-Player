import { describe, expect, it } from 'vitest';
import * as library from '../src/core/library.js';

const album = (title, artist, extra = {}) => ({ title, artist: { id: artist.length, name: artist }, ...extra });

const COLLECTION = [
  album('The Angel and the Dark River', 'My Dying Bride'),
  album('Master of Puppets', 'Metallica'),
  album('Ace of Spades', 'Motörhead'),
  album('Rheia', 'Oathbreaker'),
  album('Nemesis', '7th Nemesis'),
];
COLLECTION[0].title = 'Turn Loose the Swans';

describe('tri', () => {
  it('paramètres', () => {
    expect(library.sortParams('artist')).toEqual({ sort: 'artist', order: 'asc' });
    expect(library.sortParams('year')).toEqual({ sort: 'year', order: 'desc' });
    expect(library.sortParams('n-importe-quoi')).toEqual({ sort: 'artist', order: 'asc' });
  });
  it('limite', () => expect(library.FETCH_LIMIT).toBeGreaterThanOrEqual(10000));
});

describe('filtre', () => {
  it('normalize', () => {
    expect(library.normalize('Motörhead')).toBe('motorhead');
    expect(library.normalize('ÉLECTRIQUE')).toBe('electrique');
    expect(library.normalize('  My   Dying  Bride ')).toBe('my dying bride');
    expect(library.normalize(null)).toBe('');
  });
  it('casse et accents', () => {
    expect(library.matches(COLLECTION[2], 'motorhead')).toBe(true);
    expect(library.matches(COLLECTION[2], 'MOTÖRHEAD')).toBe(true);
  });
  it('titre et artiste, mots indépendants, sous-chaînes', () => {
    expect(library.matches(COLLECTION[0], 'swans')).toBe(true);
    expect(library.matches(COLLECTION[0], 'bride dying')).toBe(true);
    expect(library.matches(COLLECTION[0], 'swans bride')).toBe(true);
    expect(library.matches(COLLECTION[0], 'dying metallica')).toBe(false);
    expect(library.matches(COLLECTION[1], 'metal')).toBe(true);
  });
  it('requête vide', () => {
    expect(library.filterAlbums(COLLECTION, '   ')).toEqual(COLLECTION);
    expect(library.filterAlbums(COLLECTION, 'zzzz')).toEqual([]);
  });
});

describe('initiales', () => {
  it('liste', () => {
    expect(library.INITIALS).toHaveLength(27);
    expect(library.INITIALS[0]).toBe('#');
    expect(library.INITIALS.at(-1)).toBe('Z');
  });
  it('initialOf', () => {
    expect(library.initialOf(COLLECTION[0])).toBe('M');
    expect(library.initialOf(album('x', 'Ötzi'))).toBe('O');
    expect(library.initialOf(COLLECTION[4])).toBe('#');
    expect(library.initialOf(album('x', '!!!'))).toBe('#');
    expect(library.initialOf(album('x', ''))).toBe('#');
    expect(library.initialOf(album('x', 'Æon'))).toBe('#');
  });
  it('présentes et première position', () => {
    expect(library.availableInitials(COLLECTION)).toEqual(new Set(['M', 'O', '#']));
    expect(library.firstIndexForInitial(COLLECTION, 'O')).toBe(3);
    expect(library.firstIndexForInitial(COLLECTION, 'Z')).toBe(-1);
  });
});

describe('artistes', () => {
  it('compte et trie sans accents', () => {
    const albums = [album('a', 'Opeth'), album('b', 'Ötzi'), album('c', 'Anathema'), album('d', 'Opeth'), album('e', 'korn')];
    expect(library.artistEntries(albums).map((e) => [e.name, e.count])).toEqual([
      ['Anathema', 1], ['korn', 1], ['Opeth', 2], ['Ötzi', 1],
    ]);
    expect(library.artistEntries([])).toEqual([]);
  });
  it('filtre et albums d’un artiste', () => {
    const entries = library.artistEntries(COLLECTION);
    expect(library.filterArtistEntries(entries, 'moto').map((e) => e.name)).toEqual(['Motörhead']);
    expect(library.filterArtistEntries(entries, '')).toHaveLength(5);
    expect(library.albumsByArtist(COLLECTION, 'Metallica')).toEqual([COLLECTION[1]]);
  });
});

describe('genres', () => {
  it('fusionne les variantes', () => {
    const albums = [
      album('a', 'x', { genre: 'rock' }), album('b', 'x', { genre: 'Rock' }), album('c', 'x', { genre: 'Électro' }),
      album('d', 'x', { genre: 'electro' }), album('e', 'x', { genre: 'electro' }), album('f', 'x', { genre: '  ' }),
      album('g', 'x', { genre: null }),
    ];
    expect(library.genreEntries(albums)).toEqual([{ name: 'electro', count: 3 }, { name: 'Rock', count: 2 }]);
    expect(library.albumsByGenre(albums, 'ELECTRO').map((a) => a.title)).toEqual(['c', 'd', 'e']);
  });
});
