import { describe, expect, it, vi } from 'vitest';
import { JewelBoxClient } from '../src/api/client.js';
import { parseRemoteDevice } from '../src/api/parsing.js';
import {
  applyWatchEvent, controllableOthers, deviceIcon, deviceName, livePosition, muteCommand, nextRepeat,
  playIndexCommand, playMediaCommand, repeatCommand, seekCommand, shuffleCommand, simpleCommand, volumeCommand,
} from '../src/core/remoteController.js';

const DESK = {
  device_id: 'desk', device_label: 'JewelBox bureau · fedora', controllable: true,
  capabilities: ['seek', 'volume', 42],
  state: {
    playback_state: 'playing', position_sec: 12.5, volume: 80.4, muted: false, shuffle: false, repeat: 'all',
    track: { id: 7, title: 'Leave Me Out', artist_name: 'Silverchair' }, extra: 1,
  },
};

describe('applyWatchEvent', () => {
  it('la liste, puis un lecteur ajouté, changé et parti', () => {
    let devices = applyWatchEvent([], 'devices', { data: [DESK] });
    expect(devices).toHaveLength(1);
    expect(devices[0].capabilities).toEqual(['seek', 'volume']);
    expect(devices[0].state).toMatchObject({ playbackState: 'playing', volume: 80, repeat: 'all', shuffle: false });
    expect(devices[0].state.track.title).toBe('Leave Me Out');

    devices = applyWatchEvent(devices, 'device', { device_id: 'web', controllable: false });
    expect(devices.map((d) => d.deviceId)).toEqual(['desk', 'web']);

    devices = applyWatchEvent(devices, 'device', { device_id: 'desk', controllable: true, state: { playback_state: 'paused' } });
    expect(devices.map((d) => d.deviceId)).toEqual(['desk', 'web']);
    expect(devices[0].state).toMatchObject({ playbackState: 'paused', track: null, volume: null, muted: null });

    devices = applyWatchEvent(devices, 'gone', { device_id: 'web' });
    expect(devices.map((d) => d.deviceId)).toEqual(['desk']);
  });

  it('évènement inconnu ou données illisibles : liste inchangée', () => {
    const devices = [parseRemoteDevice({ device_id: 'desk' })];
    expect(applyWatchEvent(devices, 'hello', { x: 1 })).toBe(devices);
    expect(applyWatchEvent(devices, 'device', { no_id: true })).toBe(devices);
    expect(applyWatchEvent(devices, 'devices', 'pas un objet')).toBe(devices);
    expect(applyWatchEvent(devices, 'gone', null)).toBe(devices);
  });

  it('une piste mal formée est écartée, pas le lecteur', () => {
    const [device] = applyWatchEvent([], 'device', { device_id: 'desk', state: { track: { title: 'sans id' } } });
    expect(device.state.track).toBeNull();
    expect(device.state.playbackState).toBe('idle');
  });

  it('seuls les autres lecteurs pilotables', () => {
    const devices = ['me', 'desk'].map((id) => parseRemoteDevice({ device_id: id, controllable: true }))
      .concat(parseRemoteDevice({ device_id: 'web' }));
    expect(controllableOthers(devices, 'me').map((d) => d.deviceId)).toEqual(['desk']);
  });
});

describe('livePosition', () => {
  const reported = '2026-10-31T13:34:22.588Z';
  const at = Date.parse(reported);
  const playing = { playbackState: 'playing', positionSec: 60, durationSec: 183.3, reportedAt: reported };

  it('avance en lecture, jusqu’à la fin, jamais en arrière', () => {
    expect(livePosition(playing, at + 10000)).toBeCloseTo(70);
    expect(livePosition(playing, at + 600000)).toBe(183.3);
    expect(livePosition(playing, at - 5000)).toBe(60);
    expect(livePosition({ ...playing, durationSec: 0 }, at + 10000)).toBeCloseTo(70);
  });

  it('immobile en pause ou sans date', () => {
    expect(livePosition({ ...playing, playbackState: 'paused' }, at + 10000)).toBe(60);
    expect(livePosition({ ...playing, reportedAt: 'hier' }, at + 10000)).toBe(60);
    expect(livePosition({ ...playing, reportedAt: null }, at + 10000)).toBe(60);
  });
});

describe('ordres et affichage', () => {
  it('répétition : off → all → one → off', () => {
    expect(nextRepeat('off')).toBe('all');
    expect(nextRepeat('all')).toBe('one');
    expect(nextRepeat('one')).toBe('off');
    expect(nextRepeat(null)).toBe('all');
  });

  it('les corps d’ordres suivent la validation du serveur', () => {
    expect(simpleCommand('toggle')).toEqual({ command: 'toggle' });
    expect(seekCommand(-3)).toEqual({ command: 'seek', position_sec: 0 });
    expect(volumeCommand(140.4)).toEqual({ command: 'volume', volume: 100 });
    expect(volumeCommand(42.6)).toEqual({ command: 'volume', volume: 43 });
    expect(muteCommand(1)).toEqual({ command: 'mute', muted: true });
    expect(shuffleCommand(0)).toEqual({ command: 'shuffle', shuffle: false });
    expect(repeatCommand('one')).toEqual({ command: 'repeat', repeat: 'one' });
    expect(playIndexCommand(4)).toEqual({ command: 'play_index', index: 4 });
    expect(playMediaCommand('smart', 'dynamic_mix')).toEqual({
      command: 'play_media', mode: 'replace', media: { type: 'smart', id: 'dynamic_mix' },
    });
  });

  it('icône et nom du lecteur', () => {
    expect(deviceIcon('JewelBox Android · 2412DPC0AG')).toBe('phone');
    expect(deviceIcon('JewelBox bureau · fedora')).toBe('desktop');
    expect(deviceIcon('JewelBox Windows · PC')).toBe('desktop');
    expect(deviceIcon('Chrome')).toBe('globe');
    expect(deviceIcon(null)).toBe('globe');
    expect(deviceName({ deviceLabel: 'Chrome' })).toBe('Chrome');
    expect(deviceName({ deviceLabel: null })).toBe('Lecteur sans nom');
  });
});

describe('client', () => {
  const fakeFetch = (body = '') => vi.fn(async () => ({ ok: true, status: 200, text: async () => body }));

  it('liste des lecteurs, ordres et URL du flux', async () => {
    const fetchImpl = fakeFetch(JSON.stringify({ data: [DESK] }));
    const client = new JewelBoxClient('http://s:3001', { deviceId: 'me', fetchImpl });
    const [device] = await client.remoteDevices();
    expect(device.deviceLabel).toBe('JewelBox bureau · fedora');
    expect(fetchImpl.mock.calls[0][0]).toBe('http://s:3001/api/player/remote/devices');

    await client.remoteCommand('a b', { command: 'toggle' });
    const [url, init] = fetchImpl.mock.calls[1];
    expect(url).toBe('http://s:3001/api/player/remote/devices/a%20b/commands');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ command: 'toggle' });

    expect(client.remoteWatchUrl()).toBe('http://s:3001/api/player/remote/watch');
  });
});
