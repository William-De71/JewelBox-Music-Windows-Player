import { describe, expect, it } from 'vitest';
import { apiUrl, normalize, resolveUrl, ServerUrlError, streamUrl } from '../src/core/serverUrl.js';

describe('normalize', () => {
  it('ajoute http://', () => expect(normalize('192.168.1.10:3001')).toBe('http://192.168.1.10:3001'));
  it('garde https', () => expect(normalize('https://music.local')).toBe('https://music.local'));
  it('retire les espaces', () => expect(normalize('  192.168.1.10:3001  ')).toBe('http://192.168.1.10:3001'));
  it('retire les barres finales', () => expect(normalize('http://music.local:3001///')).toBe('http://music.local:3001'));
  it('garde le nom d’hôte', () => expect(normalize('mon-nas.home:3001')).toBe('http://mon-nas.home:3001'));
  it.each(['', null, undefined, '   ', 'ftp://music.local', 'http://'])('refuse %j', (value) => {
    expect(() => normalize(value)).toThrow(ServerUrlError);
  });
});

describe('apiUrl', () => {
  it('joint le chemin', () => expect(apiUrl('http://s:3001', '/api/health')).toBe('http://s:3001/api/health'));
  it('tolère les barres', () => expect(apiUrl('http://s:3001/', 'api/health')).toBe('http://s:3001/api/health'));
  it('encode la requête', () => {
    expect(apiUrl('http://s:3001', '/api/player/search', { q: 'aïr & co' }))
      .toBe('http://s:3001/api/player/search?q=a%C3%AFr+%26+co');
  });
  it('booléens en minuscules', () => {
    expect(apiUrl('http://s:3001', '/api/albums', { wanted: false })).toBe('http://s:3001/api/albums?wanted=false');
  });
  it('omet null et undefined', () => {
    expect(apiUrl('http://s:3001', '/api/albums', { page: 2, sort: null, x: undefined }))
      .toBe('http://s:3001/api/albums?page=2');
  });
  it('requête vide', () => {
    expect(apiUrl('http://s:3001', '/api/albums', { sort: null })).toBe('http://s:3001/api/albums');
    expect(apiUrl('http://s:3001', '/api/albums', {})).toBe('http://s:3001/api/albums');
  });
});

describe('resolveUrl / streamUrl', () => {
  it('pochette relative', () => expect(resolveUrl('http://s:3001', '/covers/42.jpg')).toBe('http://s:3001/covers/42.jpg'));
  it('garde l’absolu', () => expect(resolveUrl('http://s:3001', 'https://i.discogs.com/c.jpg')).toBe('https://i.discogs.com/c.jpg'));
  it('null et vide → null', () => {
    expect(resolveUrl('http://s:3001', null)).toBeNull();
    expect(resolveUrl('http://s:3001', '')).toBeNull();
  });
  it('flux', () => expect(streamUrl('http://s:3001', 42)).toBe('http://s:3001/api/player/tracks/42/stream'));
});
