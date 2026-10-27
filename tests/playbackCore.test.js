// Briques pures du lecteur : mix dynamique, scrobbling, instantané de
// reprise, minuteur de sommeil, ReplayGain (portages des tests du bureau).
import { describe, expect, it } from 'vitest';
import { KEEP_BEHIND, plan, trimIds } from '../src/core/dynamicMix.js';
import { ScrobbleTracker } from '../src/core/scrobble.js';
import { PlaybackStateStore } from '../src/core/playbackState.js';
import { fadeFactor, FADE_SECONDS, liveSleepTimer, modeFromCommand } from '../src/core/sleepTimer.js';
import { replayGainFactor } from '../src/core/replayGain.js';

describe('mix dynamique', () => {
  it('plan : retirer ce qui a disparu, ajouter le nouveau à la fin', () => {
    expect(plan([1, 2, 3], [2, 3, 4, 5])).toEqual({ removeIds: [1], appendIds: [4, 5] });
    expect(plan([1, 2], [1, 2])).toEqual({ removeIds: [], appendIds: [] });
    expect(plan([], [7])).toEqual({ removeIds: [], appendIds: [7] });
  });
  it('trimIds à partir de KEEP_BEHIND pistes passées', () => {
    expect(KEEP_BEHIND).toBe(4);
    expect(trimIds([1, 2, 3])).toEqual([]);
    expect(trimIds([1, 2, 3, 4])).toEqual([1, 2, 3, 4]);
  });
});

describe('scrobbling', () => {
  const play = (tracker, until, duration, from = 0) => {
    let result = null;
    for (let p = from; p <= until; p += 1) result = tracker.tick(p, duration) ?? result;
    return result;
  };
  it('rien sans piste, ou après effacement', () => {
    const tracker = new ScrobbleTracker();
    expect(tracker.tick(10, 200)).toBeNull();
    tracker.trackStarted(1, 1000);
    tracker.trackStarted(null);
    expect(tracker.tick(10, 200)).toBeNull();
  });
  it('heure courante par défaut', () => {
    const before = Math.floor(Date.now() / 1000);
    const tracker = new ScrobbleTracker();
    tracker.trackStarted(1);
    expect(play(tracker, 40, 60).startedAt).toBeGreaterThanOrEqual(before);
  });
  it('piste courte : jamais', () => {
    const tracker = new ScrobbleTracker();
    tracker.trackStarted(1, 1000);
    expect(play(tracker, 29, 29)).toBeNull();
  });
  it('à la moitié', () => {
    const tracker = new ScrobbleTracker();
    tracker.trackStarted(42, 1000);
    expect(play(tracker, 59, 120)).toBeNull();
    expect(tracker.tick(60, 120)).toEqual({ trackId: 42, startedAt: 1000 });
  });
  it('à 4 minutes pour une piste longue', () => {
    const tracker = new ScrobbleTracker();
    tracker.trackStarted(1, 500);
    expect(play(tracker, 240, 1000)).not.toBeNull();
  });
  it('une seule fois par piste, réarmé au redémarrage', () => {
    const tracker = new ScrobbleTracker();
    tracker.trackStarted(1, 1000);
    const fired = Array.from({ length: 60 }, (_, p) => tracker.tick(p, 60)).filter(Boolean);
    expect(fired).toHaveLength(1);
    tracker.trackStarted(1, 2000);
    expect(play(tracker, 40, 60).startedAt).toBe(2000);
  });
  it('sauts, pause et retour arrière ne comptent pas', () => {
    const tracker = new ScrobbleTracker();
    tracker.trackStarted(1, 1000);
    play(tracker, 10, 100);
    expect(tracker.tick(60, 100)).toBeNull();
    expect(tracker.tick(60, 100)).toBeNull();
    expect(tracker.tick(5, 100)).toBeNull();
  });
});

describe('instantané de reprise', () => {
  it('écrit, relit, efface sur file vide', () => {
    const store = new PlaybackStateStore();
    expect(store.load()).toBeNull();
    expect(store.save({ tracks: [{ trackId: 1 }], index: 0 })).toBe(true);
    expect(store.load()).toEqual({ tracks: [{ trackId: 1 }], index: 0 });
    expect(store.save({ tracks: [] })).toBe(true);
    expect(store.load()).toBeNull();
  });
  it('formes inattendues → null', () => {
    const store = new PlaybackStateStore();
    for (const raw of ['{oups', '[]', '"texte"', '{"tracks":"x"}', '{"tracks":[]}', 'null']) {
      localStorage.setItem('jewelbox-playback-state', raw);
      expect(store.load()).toBeNull();
    }
  });
  it('stockage refusé : jamais d’exception', () => {
    const broken = { getItem() { throw new Error(); }, setItem() { throw new Error(); }, removeItem() { throw new Error(); } };
    const store = new PlaybackStateStore(broken);
    expect(store.load()).toBeNull();
    expect(store.save({ tracks: [{ trackId: 1 }] })).toBe(false);
    expect(store.clear()).toBe(false);
  });
});

describe('minuteur de sommeil', () => {
  it('fondu', () => {
    expect(fadeFactor(FADE_SECONDS + 1)).toBe(1);
    expect(fadeFactor(FADE_SECONDS)).toBe(1);
    expect(fadeFactor(FADE_SECONDS / 2)).toBe(0.5);
    expect(fadeFactor(-3)).toBe(0);
  });
  it('ordre du contrôle à distance', () => {
    expect(modeFromCommand({ minutes: 30 })).toBe(30);
    expect(modeFromCommand({ end_of_track: true, minutes: 5 })).toBe('track');
    expect(modeFromCommand({ minutes: 0 })).toBeNull();
    expect(modeFromCommand({ minutes: 2.5 })).toBeNull();
    expect(modeFromCommand({ minutes: '30' })).toBeNull();
    expect(modeFromCommand(null)).toBeNull();
  });
  it('forme rapportée', () => {
    expect(liveSleepTimer(null, 0)).toBeNull();
    expect(liveSleepTimer('track', 0)).toEqual({ end_of_track: true });
    expect(liveSleepTimer('timer', 0)).toEqual({ ends_at: '1970-01-01T00:00:00Z' });
    expect(liveSleepTimer('timer', 1400)).toEqual({ ends_at: '1970-01-01T00:00:01Z' });
  });
});

describe('ReplayGain', () => {
  const rg = { trackGain: -6, albumGain: -8 };
  it('désactivé ou sans tags', () => {
    expect(replayGainFactor(rg, 'off')).toBe(1);
    expect(replayGainFactor(null, 'album')).toBe(1);
    expect(replayGainFactor({ trackGain: null, albumGain: null }, 'album')).toBe(1);
  });
  it('par album, par piste, repli sur l’autre', () => {
    expect(replayGainFactor(rg, 'album')).toBeCloseTo(10 ** (-8 / 20));
    expect(replayGainFactor(rg, 'track')).toBeCloseTo(10 ** (-6 / 20));
    expect(replayGainFactor({ trackGain: -6, albumGain: null }, 'album')).toBeCloseTo(10 ** (-6 / 20));
  });
  it('jamais au-delà du plein volume', () => {
    expect(replayGainFactor({ trackGain: 4, albumGain: 3 }, 'album')).toBe(1);
  });
});
