import { afterEach, describe, expect, it, vi } from 'vitest';
import { RemoteWatch } from '../src/playback/remoteWatch.js';

const encoder = new TextEncoder();

// Un flux SSE : les morceaux donnés, puis reste ouvert (ou se ferme).
function streamOf(chunks, { close = true } = {}) {
  return new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      if (close) controller.close();
    },
  });
}

const device = (id, extra = {}) => ({ device_id: id, controllable: true, ...extra });
const event = (name, data) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
const client = { remoteWatchUrl: () => 'http://s/watch' };
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.useRealTimers();
});

describe('RemoteWatch', () => {
  it('lit le flux : la liste, puis les changements, sans ce lecteur ni les non pilotables', async () => {
    const body = streamOf([
      ': ping\n\n',
      event('devices', { data: [device('me'), device('desk'), device('web', { controllable: false })] }),
      event('device', device('phone')),
      event('gone', { device_id: 'desk' }),
    ]);
    const fetchImpl = vi.fn(async () => ({ status: 200, body }));
    const watch = new RemoteWatch({ getClient: () => client, getDeviceId: () => 'me', fetchImpl });
    const seen = [];
    watch.subscribe((devices) => seen.push(devices?.map((d) => d.deviceId) ?? null));
    expect(await watch._listen(client, new AbortController().signal)).toBe(true);
    expect(fetchImpl.mock.calls[0]).toEqual(['http://s/watch', expect.objectContaining({ headers: { Accept: 'text/event-stream' } })]);
    expect(seen).toEqual([null, ['desk'], ['desk', 'phone'], ['phone']]);
    expect(watch.devices.map((d) => d.deviceId)).toEqual(['phone']);
  });

  it('serveur ancien (404) ou injoignable : flux non ouvert', async () => {
    let watch = new RemoteWatch({ getClient: () => client, getDeviceId: () => 'me', fetchImpl: async () => ({ status: 404, body: null }) });
    expect(await watch._listen(client, new AbortController().signal)).toBe(false);
    watch = new RemoteWatch({ getClient: () => client, getDeviceId: () => 'me', fetchImpl: async () => { throw new Error('réseau'); } });
    expect(await watch._listen(client, new AbortController().signal)).toBe(false);
  });

  it('un flux qui ne s’ouvre pas donne une liste vide (plus de chargement)', async () => {
    const fetchImpl = vi.fn(async () => ({ status: 404, body: null }));
    const watch = new RemoteWatch({ getClient: () => client, getDeviceId: () => 'me', fetchImpl });
    const listener = vi.fn();
    watch.subscribe(listener);
    watch.acquire();
    await flush();
    await flush();
    expect(watch.devices).toEqual([]);
    expect(listener).toHaveBeenLastCalledWith([]);
    watch.stop();
  });

  it('sans serveur configuré : liste vide aussi', async () => {
    const fetchImpl = vi.fn();
    const watch = new RemoteWatch({ getClient: () => null, getDeviceId: () => 'me', fetchImpl });
    watch.acquire();
    await flush();
    expect(watch.devices).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
    watch.stop();
  });

  it('ouvert tant qu’on regarde, fermé peu après le dernier départ', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(async () => ({ status: 200, body: streamOf([event('devices', { data: [device('desk')] })], { close: false }) }));
    const watch = new RemoteWatch({ getClient: () => client, getDeviceId: () => 'me', fetchImpl });
    watch.acquire();
    watch.acquire();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(watch.devices.map((d) => d.deviceId)).toEqual(['desk']);

    // Une page remplace l'autre : le flux reste ouvert.
    watch.release();
    watch.release();
    watch.acquire();
    await vi.advanceTimersByTimeAsync(10000);
    expect(watch.devices).not.toBeNull();

    // Plus personne : fermé après le délai.
    watch.release();
    await vi.advanceTimersByTimeAsync(4000);
    expect(watch.devices).not.toBeNull();
    await vi.advanceTimersByTimeAsync(2000);
    expect(watch.devices).toBeNull();
  });

  it('serveur changé : la liste repart de zéro et le flux est rouvert', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(async () => ({ status: 200, body: streamOf([event('devices', { data: [device('desk')] })], { close: false }) }));
    const watch = new RemoteWatch({ getClient: () => client, getDeviceId: () => 'me', fetchImpl });
    watch.restart(); // rien d'ouvert : rien à faire
    expect(fetchImpl).not.toHaveBeenCalled();
    watch.acquire();
    await vi.advanceTimersByTimeAsync(0);
    const listener = vi.fn();
    watch.subscribe(listener);
    watch.restart();
    expect(listener).toHaveBeenLastCalledWith(null);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(watch.devices.map((d) => d.deviceId)).toEqual(['desk']);
    watch.stop();
  });

  it('reconnexion après un flux terminé', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(async () => ({ status: 200, body: streamOf([event('devices', { data: [] })]) }));
    const watch = new RemoteWatch({ getClient: () => client, getDeviceId: () => 'me', fetchImpl });
    watch.acquire();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    watch.stop();
  });
});
