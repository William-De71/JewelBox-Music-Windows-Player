import { beforeEach, expect, it, vi } from 'vitest';
import { QueueSync } from '../src/playback/queueSync.js';

let listener;
let timers;
let now;
let client;
let sync;

const state = (changes = {}) => ({ queueItems: [{ trackId: 1 }, { trackId: 2 }], queueIndex: 0, position: 0, isPlaying: true, sourceName: 'Moon Safari', ...changes });

beforeEach(() => {
  timers = [];
  now = 0;
  client = { saveQueue: vi.fn(async () => {}), updateQueueState: vi.fn(async () => {}), clearQueue: vi.fn(async () => {}) };
  sync = new QueueSync({
    playback: { subscribe: (fn) => { listener = fn; return () => { listener = null; }; } },
    getClient: () => client,
    getDeviceLabel: () => 'JewelBox Windows · PC',
    now: () => now,
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    clearTimeout: () => { timers.length = 0; },
  });
  sync.start();
});

it('regroupe le PUT et y reporte le dernier état', () => {
  listener(state());
  listener(state({ queueIndex: 1, position: 2 }));
  expect(client.saveQueue).not.toHaveBeenCalled();
  timers.shift()();
  expect(client.saveQueue).toHaveBeenCalledWith({ trackIds: [1, 2], currentIndex: 1, positionSec: 2, deviceLabel: 'JewelBox Windows · PC', sourceLabel: 'Moon Safari' });
});

it('PATCH après le PUT, DELETE à la file vidée', () => {
  listener(state());
  timers.shift()();
  listener(state({ queueIndex: 1 }));
  expect(client.updateQueueState).toHaveBeenCalledWith(1, 0);
  listener(state({ queueItems: [], queueIndex: null, sourceName: null }));
  expect(client.clearQueue).toHaveBeenCalled();
});

it('même pistes, autre source : renvoyée entière', () => {
  listener(state());
  timers.shift()();
  listener(state({ sourceName: 'Repris de Pixel' }));
  timers.shift()();
  expect(client.saveQueue).toHaveBeenCalledTimes(2);
  expect(client.saveQueue.mock.calls[1][0].sourceLabel).toBe('Repris de Pixel');
});

it('sans serveur : rien, et stop désabonne', () => {
  client = null;
  listener(state());
  timers.shift()();
  sync.stop();
  expect(listener).toBeNull();
});
