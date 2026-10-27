import { expect, it, vi } from 'vitest';
import { createSettings, DEFAULTS } from '../src/core/settings.js';

it('défauts identiques au lecteur bureau', () => {
  const settings = createSettings();
  expect(settings.get('replaygain')).toBe('album');
  expect(settings.get('remote-control')).toBe(true);
  expect(settings.get('smart-ranking-size')).toBe(100);
  expect(Object.keys(DEFAULTS)).toHaveLength(11);
});

it('persiste et relit', () => {
  createSettings().set('server-url', 'http://njord:3001');
  expect(createSettings().get('server-url')).toBe('http://njord:3001');
});

it('ignore un type inattendu dans le stockage', () => {
  localStorage.setItem('jewelbox-settings', JSON.stringify({ 'transition-fade': 'beaucoup', 'sort-order': 'year' }));
  const settings = createSettings();
  expect(settings.get('transition-fade')).toBe(0);
  expect(settings.get('sort-order')).toBe('year');
});

it('stockage illisible → défauts', () => {
  localStorage.setItem('jewelbox-settings', '{oups');
  expect(createSettings().get('server-url')).toBe('');
});

it('refuse clé inconnue et mauvais type', () => {
  const settings = createSettings();
  expect(() => settings.get('volume')).toThrow();
  expect(() => settings.set('volume', 1)).toThrow();
  expect(() => settings.set('transition-fade', '4')).toThrow(TypeError);
});

it('prévient les abonnés, seulement sur un vrai changement', () => {
  const settings = createSettings();
  const listener = vi.fn();
  const unsubscribe = settings.subscribe(listener);
  settings.set('transition-fade', 4);
  settings.set('transition-fade', 4);
  expect(listener).toHaveBeenCalledTimes(1);
  expect(listener).toHaveBeenCalledWith('transition-fade', 4);
  unsubscribe();
  settings.set('transition-fade', 6);
  expect(listener).toHaveBeenCalledTimes(1);
});

it('stockage refusé : la session continue', () => {
  const storage = { getItem: () => { throw new Error('refusé'); }, setItem: () => { throw new Error('refusé'); } };
  const settings = createSettings(storage);
  settings.set('server-url', 'http://x');
  expect(settings.get('server-url')).toBe('http://x');
});
