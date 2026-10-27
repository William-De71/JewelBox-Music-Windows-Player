import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RemoteControl } from '../src/playback/remoteControl.js';

function fakePlayback() {
  const listeners = new Set();
  const state = { hasItem: true, isPlaying: false, currentTrackId: 1, queueIndex: 0, position: 0, duration: 100, volume: 1, muted: false, shuffle: false, repeat: 'off', sleepMode: null, sleepEndsAt: 0 };
  return {
    state: () => state,
    subscribe: (fn) => { listeners.add(fn); fn(state); return () => listeners.delete(fn); },
    emit: (changes) => { Object.assign(state, changes); listeners.forEach((fn) => fn(state)); },
    ...Object.fromEntries(['play', 'pause', 'togglePlayPause', 'next', 'previous', 'seek', 'setVolume', 'setMuted', 'setShuffle', 'setRepeat',
      'setSleepTimer', 'jumpTo', 'playAlbum', 'enqueueAlbum', 'playQueueTracks', 'enqueueTracks'].map((name) => [name, vi.fn()])),
  };
}

const track = (id) => ({ id, title: `T${id}`, hasFile: true });

let playback;
let client;
let control;

beforeEach(() => {
  playback = fakePlayback();
  client = {
    deviceId: 'dev',
    remoteEventsUrl: () => 'http://s/events',
    reportLiveState: vi.fn(async () => {}),
    album: vi.fn(async () => ({ id: 7, tracks: [{ id: 70, hasFile: false }, { id: 71, hasFile: true }] })),
    playlist: vi.fn(async () => ({ id: 3, name: 'Soir', tracks: [track(1)] })),
    smartPlaylist: vi.fn(async () => ({ key: 'favourites', tracks: [track(2)] })),
    track: vi.fn(async () => track(9)),
    radio: vi.fn(async () => ({ seedName: 'Air', tracks: [track(4)] })),
  };
  control = new RemoteControl({
    playback, getClient: () => client, getDeviceLabel: () => 'JewelBox Windows · PC', isEnabled: () => false, getRankingSize: () => 100, now: () => 0,
  });
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('RemoteControl', () => {
  it('rapporte l’état en direct, même réglage désactivé', () => {
    control.start();
    expect(client.reportLiveState).toHaveBeenCalledWith(expect.objectContaining({ playback_state: 'paused', device_label: 'JewelBox Windows · PC', track_id: 1 }));
    playback.emit({ isPlaying: true });
    expect(client.reportLiveState).toHaveBeenCalledTimes(2);
    control.stop();
  });

  it('ordres simples et réglages', () => {
    control.execute(client, { command: 'toggle' });
    control.execute(client, { command: 'seek', position_sec: 42 });
    control.execute(client, { command: 'volume', volume: 30 });
    control.execute(client, { command: 'mute', muted: true });
    control.execute(client, { command: 'shuffle', shuffle: true });
    control.execute(client, { command: 'repeat', repeat: 'one' });
    control.execute(client, { command: 'repeat', repeat: 'n-importe' });
    control.execute(client, { command: 'sleep_timer', minutes: 30 });
    control.execute(client, { command: 'inconnu' });
    expect(playback.togglePlayPause).toHaveBeenCalled();
    expect(playback.seek).toHaveBeenCalledWith(42);
    expect(playback.setVolume).toHaveBeenCalledWith(0.3);
    expect(playback.setMuted).toHaveBeenCalledWith(true);
    expect(playback.setShuffle).toHaveBeenCalledWith(true);
    expect(playback.setRepeat).toHaveBeenCalledTimes(1);
    expect(playback.setSleepTimer).toHaveBeenCalledWith(30);
  });

  it('play_index : la piste en cours joue, une autre est lancée', () => {
    control.execute(client, { command: 'play_index', index: 0 });
    expect(playback.play).toHaveBeenCalled();
    control.execute(client, { command: 'play_index', index: 3 });
    expect(playback.jumpTo).toHaveBeenCalledWith(3);
  });

  it('play_media', async () => {
    control.execute(client, { command: 'play_media', media: { type: 'album', id: 7 } });
    control.execute(client, { command: 'play_media', media: { type: 'album', id: 7 }, mode: 'next' });
    control.execute(client, { command: 'play_media', media: { type: 'playlist', id: 3 } });
    control.execute(client, { command: 'play_media', media: { type: 'smart', id: 'favourites' } });
    control.execute(client, { command: 'play_media', media: { type: 'track', id: 9 }, mode: 'append' });
    control.execute(client, { command: 'play_media', media: { type: 'artist_radio', id: 5 } });
    await flush();
    expect(playback.playAlbum).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }), 71);
    expect(playback.enqueueAlbum).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }), { playNext: true });
    expect(playback.playQueueTracks).toHaveBeenCalledWith([track(1)], { reportPlaylistId: 3, sourceName: 'Soir' });
    expect(playback.playQueueTracks).toHaveBeenCalledWith([track(2)], { reportSmartKey: 'favourites', sourceName: 'Favoris' });
    expect(playback.enqueueTracks).toHaveBeenCalledWith([track(9)], { playNext: false });
    expect(client.radio).toHaveBeenCalledWith({ artistId: 5 });
    expect(playback.playQueueTracks).toHaveBeenCalledWith([track(4)], { sourceName: 'Radio · Air' });
  });

  it('lit le flux SSE et exécute les ordres', async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(': ping\n\nevent: command\ndata: {"command":"ne'));
        controller.enqueue(encoder.encode('xt"}\n\n'));
        controller.close();
      },
    });
    const fetchImpl = vi.fn(async () => ({ status: 200, body }));
    control = new RemoteControl({ playback, getClient: () => client, getDeviceLabel: () => 'x', isEnabled: () => true, getRankingSize: () => 100, fetchImpl, now: () => 0 });
    const abort = new AbortController();
    expect(await control._listen(client, abort.signal)).toBe(true);
    expect(fetchImpl.mock.calls[0][1].headers).toEqual({ 'X-Device-Id': 'dev', Accept: 'text/event-stream' });
    expect(playback.next).toHaveBeenCalledTimes(1);
  });

  it('serveur ancien (404) : flux non ouvert', async () => {
    control = new RemoteControl({ playback, getClient: () => client, getDeviceLabel: () => 'x', isEnabled: () => true, getRankingSize: () => 100, fetchImpl: async () => ({ status: 404, body: null }) });
    expect(await control._listen(client, new AbortController().signal)).toBe(false);
  });
});
