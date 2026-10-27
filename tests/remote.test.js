import { describe, expect, it } from 'vitest';
import { HEARTBEAT, livePayload, LiveReporter, liveStateOf, reconnectDelay, SseParser } from '../src/core/remote.js';

const ui = (changes = {}) => ({
  hasItem: true, isPlaying: true, currentTrackId: 7, queueIndex: 2, position: 12, duration: 200,
  volume: 0.5, muted: false, shuffle: false, repeat: 'off', sleepMode: null, sleepEndsAt: 0, ...changes,
});
const live = (changes = {}) => ({ ...liveStateOf(ui()), ...changes });

describe('SseParser', () => {
  it('évènements complets', () => {
    expect(new SseParser().feed('retry: 3000\n\nevent: hello\ndata: {"device_id": "d"}\n\n')).toEqual([['hello', { device_id: 'd' }]]);
  });
  it('attend la fin d’un évènement', () => {
    const parser = new SseParser();
    expect(parser.feed('event: command\ndata: {"command":')).toEqual([]);
    expect(parser.feed(' "pause"}\n')).toEqual([]);
    expect(parser.feed('\n')).toEqual([['command', { command: 'pause' }]]);
  });
  it('ignore commentaires et données invalides', () => {
    expect(new SseParser().feed(': ping\n\nevent: command\ndata: nope\n\ndata: {"a": 1}\r\n\r\n')).toEqual([['message', { a: 1 }]]);
  });
});

describe('état en direct', () => {
  it('session en lecture', () => {
    const state = liveStateOf(ui({ repeat: 'all', shuffle: true }));
    expect(livePayload(state, 'Bureau')).toEqual({
      playback_state: 'playing', track_id: 7, current_index: 2, position_sec: 12, duration_sec: 200, volume: 50,
      muted: false, shuffle: true, repeat: 'all', sleep_timer: null, device_label: 'Bureau',
    });
  });
  it('minuteur', () => {
    expect(liveStateOf(ui({ sleepMode: 'track' })).sleep_timer).toEqual({ end_of_track: true });
    expect(liveStateOf(ui({ sleepMode: 'timer', sleepEndsAt: 1793140200400 })).sleep_timer).toEqual({ ends_at: '2026-10-27T22:30:00Z' });
  });
  it('session vide, en pause', () => {
    const empty = liveStateOf(ui({ hasItem: false, isPlaying: false, currentTrackId: null, queueIndex: null }));
    expect(empty).toMatchObject({ playback_state: 'idle', current_index: -1 });
    expect('track_id' in livePayload(empty, 'x')).toBe(false);
    expect(liveStateOf(ui({ isPlaying: false })).playback_state).toBe('paused');
  });
  it('position arrondie au dixième', () => {
    expect(livePayload(live({ position_sec: 12.345 }), 'x').position_sec).toBe(12.3);
  });
});

describe('LiveReporter', () => {
  it('premier état, lecture qui avance', () => {
    const reporter = new LiveReporter();
    expect(reporter.update(live({ position_sec: 10 }), 0)).toBe(true);
    expect(reporter.update(live({ position_sec: 11 }), 1)).toBe(false);
    expect(reporter.update(live({ position_sec: 15 }), 5)).toBe(false);
  });
  it('changement affiché par le contrôleur', () => {
    const reporter = new LiveReporter();
    reporter.update(live(), 0);
    expect(reporter.update(live({ playback_state: 'paused' }), 1)).toBe(true);
    expect(reporter.update(live({ playback_state: 'paused', volume: 80 }), 2)).toBe(true);
    expect(reporter.update(live({ playback_state: 'paused', volume: 80, track_id: 8 }), 3)).toBe(true);
    expect(reporter.update(live({ playback_state: 'paused', volume: 80, track_id: 8 }), 4)).toBe(false);
    expect(reporter.update(live({ playback_state: 'paused', volume: 80, track_id: 8, sleep_timer: { end_of_track: true } }), 5)).toBe(true);
  });
  it('sauts, en lecture et en pause', () => {
    const reporter = new LiveReporter();
    reporter.update(live({ position_sec: 10 }), 0);
    expect(reporter.update(live({ position_sec: 60 }), 1)).toBe(true);
    const paused = new LiveReporter();
    paused.update(live({ playback_state: 'paused', position_sec: 10 }), 0);
    expect(paused.update(live({ playback_state: 'paused', position_sec: 10 }), 50)).toBe(false);
    expect(paused.update(live({ playback_state: 'paused', position_sec: 90 }), 51)).toBe(true);
  });
  it('battement de cœur, oubli', () => {
    const reporter = new LiveReporter();
    reporter.update(live({ position_sec: 0 }), 0);
    expect(reporter.update(live({ position_sec: HEARTBEAT - 1 }), HEARTBEAT - 1)).toBe(false);
    expect(reporter.update(live({ position_sec: HEARTBEAT }), HEARTBEAT)).toBe(true);
    reporter.forget();
    expect(reporter.update(live({ position_sec: HEARTBEAT }), HEARTBEAT)).toBe(true);
  });
  it('délais de reconnexion', () => {
    expect([1, 2, 3, 6, 20].map(reconnectDelay)).toEqual([2, 4, 8, 60, 60]);
    expect(reconnectDelay(0)).toBe(2);
  });
});
