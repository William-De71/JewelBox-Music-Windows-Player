import { describe, expect, it } from 'vitest';
import { fadeFactor, followsOnAlbum } from '../src/core/transitionFade.js';

describe('followsOnAlbum', () => {
  it('pistes consécutives du même album', () => {
    expect(followsOnAlbum({ albumId: 7, trackNumber: 3 }, { albumId: 7, trackNumber: 4 })).toBe(true);
  });
  it.each([
    [{ albumId: 7, trackNumber: 3 }, { albumId: 7, trackNumber: 5 }],
    [{ albumId: 7, trackNumber: 3 }, { albumId: 8, trackNumber: 4 }],
    [{ albumId: null, trackNumber: 3 }, { albumId: null, trackNumber: 4 }],
    [null, { albumId: 7, trackNumber: 1 }],
    [{ albumId: 7, trackNumber: 3 }, null],
  ])('sinon non (%j → %j)', (before, after) => expect(followsOnAlbum(before, after)).toBe(false));
});

describe('fadeFactor', () => {
  it('désactivé', () => expect(fadeFactor({ position: 0, duration: 200, fade: 0 })).toBe(1));
  it('montée au début', () => {
    expect(fadeFactor({ position: 0, duration: 200, fade: 4 })).toBe(0);
    expect(fadeFactor({ position: 2, duration: 200, fade: 4 })).toBe(0.5);
    expect(fadeFactor({ position: 10, duration: 200, fade: 4 })).toBe(1);
  });
  it('descente à la fin', () => {
    expect(fadeFactor({ position: 198, duration: 200, fade: 4 })).toBe(0.5);
    expect(fadeFactor({ position: 201, duration: 200, fade: 4 })).toBe(0);
  });
  it('sans montée ni descente quand la piste suit sur l’album', () => {
    expect(fadeFactor({ position: 0, duration: 200, fade: 4, fadeIn: false })).toBe(1);
    expect(fadeFactor({ position: 199, duration: 200, fade: 4, fadeOut: false })).toBe(1);
  });
  it('piste trop courte : pas de descente', () => {
    expect(fadeFactor({ position: 7, duration: 8, fade: 4 })).toBe(1);
  });
  it('durée inconnue', () => expect(fadeFactor({ position: 50, duration: NaN, fade: 4 })).toBe(1));
});
