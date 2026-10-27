// Session de lecture avec un moteur et un client factices : on vérifie
// l'enchaînement des appels (ce que le bureau n'exerce qu'à la main).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlaybackSession } from '../src/playback/session.js';
import { PlaybackStateStore } from '../src/core/playbackState.js';

class FakePlayer {
  constructor() {
    this.isPlaying = false;
    this.loads = [];
    this.next = null;
    this._position = 0;
    this._duration = 0;
    this.volume = 1;
    this.muted = false;
    this.fade = 1;
    this.transition = 1;
    this.gain = 1;
    this.seeks = [];
  }
  load(uri, { play = true, gain = 1 } = {}) { this.loads.push({ uri, play, gain }); this.uri = uri; this.gain = gain; this.isPlaying = play; this._position = 0; }
  setNextUri(uri, { gain = 1 } = {}) { this.next = uri; this.nextGain = gain; }
  play() { this.isPlaying = true; }
  pause() { this.isPlaying = false; }
  stop() { this.isPlaying = false; this.uri = null; }
  seek(s) { this.seeks.push(s); this._position = s; }
  position() { return this._position; }
  duration() { return this._duration; }
  setVolume(v) { this.volume = v; }
  getVolume() { return this.volume; }
  setMute(m) { this.muted = m; }
  getMute() { return this.muted; }
  setFade(f) { this.fade = f; }
  setTransition(f) { this.transition = f; }
  setGain(g) { this.gain = g; }
  // Simulations d'évènements moteur.
  aboutToFinish() { this.onAboutToFinish(); }
  streamStarted() { this.uri = this.next; this.next = null; this.onStreamStarted(); }
  ended() { this.isPlaying = false; this.onTrackEnded(); }
}

function fakeClient() {
  return {
    baseUrl: 'http://s:3001',
    streamUrl: (id) => `http://s:3001/stream/${id}`,
    resolveCover: (url) => (url ? `http://s:3001${url}` : null),
    nowPlaying: vi.fn(async () => {}),
    reportPlay: vi.fn(async () => {}),
    reportSmartPlay: vi.fn(async () => {}),
    markPlayed: vi.fn(async () => {}),
    scrobble: vi.fn(async () => {}),
    setFavorite: vi.fn(async () => {}),
    dynamicMixPlayed: vi.fn(async () => ({ removed: true, tracks: [] })),
  };
}

const ALBUM = {
  id: 7, title: 'Moon Safari', coverUrl: '/covers/7.jpg', artist: { id: 3, name: 'Air' },
  tracks: [
    { id: 70, title: 'Sans fichier', position: 1, hasFile: false, isFavorite: false },
    { id: 71, title: 'La femme d’argent', position: 2, hasFile: true, isFavorite: false, replayGain: { albumGain: -6, trackGain: -4 } },
    { id: 72, title: 'Sexy Boy', position: 3, hasFile: true, isFavorite: true },
    { id: 73, title: 'All I Need', position: 4, hasFile: true, isFavorite: false },
  ],
};

const queueTrack = (id, extra = {}) => ({
  id, title: `T${id}`, hasFile: true, isFavorite: false, albumId: 100 + id, albumTitle: `A${id}`, artistName: 'X', coverUrl: null, position: 1, ...extra,
});

let player;
let client;
let timers;
let session;
let states;

beforeEach(() => {
  player = new FakePlayer();
  client = fakeClient();
  timers = [];
  session = new PlaybackSession({
    getClient: () => client,
    player,
    stateStore: new PlaybackStateStore(),
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: () => {},
    now: () => 1_000_000,
  });
  states = [];
  session.subscribe((state) => states.push(state));
});

const last = () => states.at(-1);
const runTimers = () => { while (timers.length) timers.shift().fn(); };

describe('lecture d’un album', () => {
  it('pistes jouables seulement, départ sur la piste demandée', () => {
    session.playAlbum(ALBUM, 72);
    expect(player.loads.at(-1)).toMatchObject({ uri: 'http://s:3001/stream/72', play: true });
    expect(last().queueItems.map((i) => i.trackId)).toEqual([71, 72, 73]);
    expect(last().current).toMatchObject({ trackId: 72, albumTitle: 'Moon Safari', artistName: 'Air', coverUrl: 'http://s:3001/covers/7.jpg', albumId: 7, trackNumber: 3 });
    expect(client.nowPlaying).toHaveBeenCalledWith(72);
    expect(client.reportPlay).toHaveBeenCalledWith('album', 7);
    expect(last().sourceType).toBe('album');
  });
  it('id inconnu : première jouable', () => {
    session.playAlbum(ALBUM, 999);
    expect(last().currentTrackId).toBe(71);
  });
  it('sans client ou sans piste : rien', () => {
    client = null;
    session.playAlbum(ALBUM, 71);
    expect(player.loads).toHaveLength(0);
  });
  it('ReplayGain appliqué au chargement et au changement de mode', () => {
    session.setReplayGain('album');
    session.playAlbum(ALBUM, 71);
    expect(player.loads.at(-1).gain).toBeCloseTo(10 ** (-6 / 20));
    session.setReplayGain('track');
    expect(player.gain).toBeCloseTo(10 ** (-4 / 20));
    session.setReplayGain('off');
    expect(player.gain).toBe(1);
  });
});

describe('enchaînement', () => {
  it('préchargement puis relais : la file avance sans recharger', () => {
    session.playAlbum(ALBUM, 71);
    player.aboutToFinish();
    expect(player.next).toBe('http://s:3001/stream/72');
    const loads = player.loads.length;
    player.streamStarted();
    expect(player.loads).toHaveLength(loads);
    expect(last().currentTrackId).toBe(72);
    expect(client.nowPlaying).toHaveBeenLastCalledWith(72);
  });
  it('fin de file : arrêt, instantané conservé', () => {
    session.playAlbum(ALBUM, 73);
    player.aboutToFinish();
    expect(player.next).toBeNull();
    player.ended();
    expect(last().hasItem).toBe(false);
    expect(new PlaybackStateStore().load().tracks).toHaveLength(3);
  });
  it('relais sans préchargement demandé : ignoré', () => {
    session.playAlbum(ALBUM, 71);
    player.onStreamStarted();
    expect(last().currentTrackId).toBe(71);
  });
});

describe('contrôles', () => {
  it('précédent : redémarre au-delà de 3 s, sinon recule', () => {
    session.playAlbum(ALBUM, 72);
    player._position = 10;
    session.previous();
    expect(player.seeks).toEqual([0]);
    player._position = 1;
    session.previous();
    expect(last().currentTrackId).toBe(71);
  });
  it('jumpTo : autre piste, ou bascule sur la courante, hors bornes ignoré', () => {
    session.playAlbum(ALBUM, 71);
    session.jumpTo(2);
    expect(last().currentTrackId).toBe(73);
    session.jumpTo(2);
    expect(player.isPlaying).toBe(false);
    const loads = player.loads.length;
    session.jumpTo(9);
    expect(player.loads).toHaveLength(loads);
  });
  it('favori optimiste, annulé sur refus', async () => {
    session.playAlbum(ALBUM, 71);
    client.setFavorite.mockRejectedValueOnce(new Error('refus'));
    session.toggleFavorite();
    expect(last().isFavorite).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(last().isFavorite).toBe(false);
  });
  it('fermer vide la file et l’instantané', () => {
    session.playAlbum(ALBUM, 71);
    session.close();
    expect(last().hasItem).toBe(false);
    expect(new PlaybackStateStore().load()).toBeNull();
  });
  it('volume, muet, aléatoire, répétition', () => {
    session.playAlbum(ALBUM, 71);
    session.setVolume(0.4);
    session.setMuted(true);
    session.setShuffle(true);
    session.setRepeat('all');
    expect(last()).toMatchObject({ volume: 0.4, muted: true, shuffle: true, repeat: 'all' });
  });
});

describe('ajouts à la file', () => {
  it('file vide : la lecture démarre sans source', () => {
    session.enqueueTracks([queueTrack(1), queueTrack(2)]);
    expect(last()).toMatchObject({ currentTrackId: 1, sourceType: null });
  });
  it('lire ensuite / ajouter à la fin', () => {
    session.playAlbum(ALBUM, 71);
    session.enqueueTracks([queueTrack(9)], { playNext: true });
    session.enqueueAlbum(ALBUM, { trackId: 71 });
    expect(last().queueItems.map((i) => i.trackId)).toEqual([71, 9, 72, 73, 71]);
  });
  it('file épuisée : « ajouter » attend, « lire ensuite » relance', () => {
    session.playAlbum(ALBUM, 73);
    player.ended();
    session.enqueueTracks([queueTrack(4)]);
    expect(last().currentTrackId).toBeNull();
    session.enqueueTracks([queueTrack(5)], { playNext: true });
    expect(last().currentTrackId).toBe(5);
    expect(player.loads.at(-1).uri).toBe('http://s:3001/stream/5');
  });
  it('retrait de la courante : passe à la suivante', () => {
    session.playAlbum(ALBUM, 71);
    session.removeFromQueue(0);
    expect(last().currentTrackId).toBe(72);
  });
  it('pistes retirées de la source en cours', () => {
    session.playQueueTracks([queueTrack(1), queueTrack(2), queueTrack(3)], { reportPlaylistId: 4 });
    expect(client.reportPlay).toHaveBeenCalledWith('playlist', 4);
    session.removeSourceTracks('playlist', 5, [2]);
    expect(last().queueItems).toHaveLength(3);
    session.removeSourceTracks('playlist', 4, [2, 1]);
    expect(last().queueItems.map((i) => i.trackId)).toEqual([3]);
    expect(last().currentTrackId).toBe(3);
  });
});

describe('scrobbling', () => {
  it('compteur local puis Last.fm, une fois', async () => {
    session.playAlbum(ALBUM, 71);
    for (let p = 0; p <= 40; p += 1) player.onPosition(p, 60);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(client.markPlayed).toHaveBeenCalledTimes(1);
    expect(client.scrobble).toHaveBeenCalledTimes(1);
    expect(client.scrobble.mock.calls[0][0]).toBe(71);
  });
});

describe('fondu entre les morceaux', () => {
  it('pas entre deux pistes qui se suivent sur l’album', () => {
    session.setTransitionFade(4);
    session.playAlbum(ALBUM, 72);
    player.onPosition(1, 200);
    expect(player.transition).toBe(1);
  });
  it('fondu à l’entrée d’une piste venue d’ailleurs', () => {
    session.setTransitionFade(4);
    session.playQueueTracks([queueTrack(1), queueTrack(2)], { startIndex: 1 });
    player.onPosition(2, 200);
    expect(player.transition).toBe(0.5);
    session.setTransitionFade(0);
    expect(player.transition).toBe(1);
  });
});

describe('minuteur de sommeil', () => {
  it('délai : fondu puis pause', () => {
    let now = 0;
    session = new PlaybackSession({ getClient: () => client, player, setTimeout: (fn, ms) => { timers.push({ fn, ms }); }, clearTimeout: () => {}, now: () => now });
    session.subscribe((s) => states.push(s));
    session.playAlbum(ALBUM, 71);
    session.setSleepTimer(15);
    expect(timers.at(-1).ms).toBe((15 * 60 - 10) * 1000);
    expect(last()).toMatchObject({ sleepMode: 'timer', sleepRemaining: 900 });
    now = (15 * 60 - 5) * 1000;
    timers.shift().fn();
    expect(player.fade).toBe(0.5);
    now = 15 * 60 * 1000;
    timers.shift().fn();
    expect(player.isPlaying).toBe(false);
    expect(player.fade).toBe(1);
    expect(last().sleepMode).toBeNull();
  });
  it('fin de piste : la suivante est chargée sans jouer', () => {
    session.playAlbum(ALBUM, 71);
    session.setSleepTimer('track');
    player.aboutToFinish();
    expect(player.next).toBeNull();
    player.ended();
    expect(player.loads.at(-1)).toMatchObject({ uri: 'http://s:3001/stream/72', play: false });
    expect(last().sleepMode).toBeNull();
  });
});

describe('reprise', () => {
  it('restaurée en pause à sa position, signalée à la première lecture', () => {
    session.playQueueTracks([queueTrack(1), queueTrack(2)], { reportSmartKey: 'favorites', sourceName: 'Favoris', startIndex: 1 });
    player._position = 42.5;
    session.saveNow();

    const player2 = new FakePlayer();
    const client2 = fakeClient();
    const timers2 = [];
    const restored = new PlaybackSession({ getClient: () => client2, player: player2, stateStore: new PlaybackStateStore(), setTimeout: (fn) => timers2.push(fn) });
    const seen = [];
    restored.subscribe((s) => seen.push(s));
    restored.restore();
    expect(player2.loads.at(-1)).toMatchObject({ uri: 'http://s:3001/stream/2', play: false });
    expect(seen.at(-1)).toMatchObject({ currentTrackId: 2, position: 42.5, sourceName: 'Favoris', isPlaying: false });
    expect(client2.nowPlaying).not.toHaveBeenCalled();
    player2._duration = 200;
    timers2.shift()();
    expect(player2.seeks).toEqual([42.5]);
    restored.togglePlayPause();
    expect(client2.nowPlaying).toHaveBeenCalledWith(2);
    expect(client2.reportSmartPlay).toHaveBeenCalledWith('favorites');
  });
  it('instantané d’un autre serveur : ignoré', () => {
    session.playAlbum(ALBUM, 71);
    const other = fakeClient();
    other.baseUrl = 'http://autre:3001';
    const player2 = new FakePlayer();
    const restored = new PlaybackSession({ getClient: () => other, player: player2, stateStore: new PlaybackStateStore() });
    restored.restore();
    expect(player2.loads).toHaveLength(0);
  });
  it('fermer avant d’appuyer sur lecture garde le point de reprise', () => {
    session.playAlbum(ALBUM, 72);
    player._position = 30;
    session.saveNow();
    const player2 = new FakePlayer();
    const restored = new PlaybackSession({ getClient: () => client, player: player2, stateStore: new PlaybackStateStore(), setTimeout: () => {} });
    restored.restore();
    restored.saveNow();
    expect(new PlaybackStateStore().load().positionMs).toBe(30000);
  });
});

describe('mix dynamique', () => {
  const mix = (ids) => ids.map((id) => queueTrack(id));
  it('piste écoutée jusqu’au bout : consommée, liste recomplétée', async () => {
    session.playQueueTracks(mix([1, 2, 3]), { reportSmartKey: 'dynamic_mix' });
    client.dynamicMixPlayed.mockResolvedValueOnce({ removed: true, tracks: mix([2, 3, 4]) });
    player.aboutToFinish();
    player.streamStarted();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(client.dynamicMixPlayed).toHaveBeenCalledWith(1);
    expect(last().queueItems.map((i) => i.trackId)).toEqual([2, 3, 4]);
    expect(last().currentTrackId).toBe(2);
  });
  it('passées à la main : consommées à la 5e', async () => {
    session.playQueueTracks(mix([1, 2, 3, 4, 5, 6]), { reportSmartKey: 'dynamic_mix' });
    for (let k = 0; k < 3; k += 1) session.next();
    expect(client.dynamicMixPlayed).not.toHaveBeenCalled();
    client.dynamicMixPlayed.mockResolvedValue({ removed: true, tracks: mix([5, 6, 7, 8]) });
    session.next();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(client.dynamicMixPlayed.mock.calls.map((c) => c[0])).toEqual([1, 2, 3, 4]);
    expect(last().queueItems.map((i) => i.trackId)).toEqual([5, 6, 7, 8]);
    expect(last().currentTrackId).toBe(5);
  });
  it('retrait manuel de la courante (yank)', () => {
    session.playQueueTracks(mix([1, 2, 3]), { reportSmartKey: 'dynamic_mix' });
    session.syncDynamicMix(mix([2, 3]));
    expect(last().currentTrackId).toBe(1);
    session.syncDynamicMix(mix([2, 3]), { yankCurrent: true });
    expect(last().currentTrackId).toBe(2);
  });
  it('sans effet hors mix', () => {
    session.playAlbum(ALBUM, 71);
    session.syncDynamicMix(mix([1]));
    expect(last().queueItems).toHaveLength(3);
  });
});
