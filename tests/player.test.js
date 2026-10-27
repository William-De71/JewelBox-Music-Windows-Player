import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioPlayer } from '../src/playback/player.js';

class FakeAudio extends EventTarget {
  constructor() {
    super();
    this.attrs = {};
    this.currentTime = 0;
    this.duration = NaN;
    this.volume = 1;
    this.muted = false;
    this.paused = true;
    this.error = null;
  }
  set src(value) { this.attrs.src = value; this.currentTime = 0; }
  get src() { return this.attrs.src ?? ''; }
  getAttribute(name) { return this.attrs[name] ?? null; }
  removeAttribute(name) { delete this.attrs[name]; }
  load() {}
  play() { this.paused = false; this.dispatchEvent(new Event('playing')); return Promise.resolve(); }
  pause() { if (!this.paused) { this.paused = true; this.dispatchEvent(new Event('pause')); } }
}

let elements;
let tick;
let player;

beforeEach(() => {
  elements = [];
  tick = null;
  player = new AudioPlayer({
    createElement: () => { const a = new FakeAudio(); elements.push(a); return a; },
    setInterval: (fn) => { tick = fn; return 1; },
    clearInterval: () => { tick = null; },
  });
});

describe('AudioPlayer', () => {
  it('charge et joue, signale l’état', () => {
    const onState = vi.fn();
    player.onStateChanged = onState;
    player.load('http://s/1');
    expect(elements[0].src).toBe('http://s/1');
    expect(player.isPlaying).toBe(true);
    expect(onState).toHaveBeenCalledWith(true);
    player.pause();
    expect(player.isPlaying).toBe(false);
  });

  it('charge sans jouer', () => {
    player.load('http://s/1', { play: false });
    expect(player.isPlaying).toBe(false);
    expect(elements[0].paused).toBe(true);
  });

  it('volume = choisi × fondu × transition × ReplayGain', () => {
    player.load('http://s/1', { gain: 0.5 });
    player.setVolume(0.8);
    player.setFade(0.5);
    player.setTransition(0.5);
    expect(elements[0].volume).toBeCloseTo(0.1);
    expect(player.getVolume()).toBe(0.8);
    player.setVolume(7);
    expect(player.getVolume()).toBe(1);
  });

  it('muet sur les deux éléments', () => {
    player.setMute(true);
    expect(elements.every((e) => e.muted)).toBe(true);
    expect(player.getMute()).toBe(true);
  });

  it('approche de la fin : une seule demande, puis relais sans blanc', () => {
    const about = vi.fn();
    const started = vi.fn();
    const ended = vi.fn();
    Object.assign(player, { onAboutToFinish: about, onStreamStarted: started, onTrackEnded: ended });
    player.load('http://s/1');
    elements[0].duration = 200;
    elements[0].currentTime = 100;
    tick();
    expect(about).not.toHaveBeenCalled();
    elements[0].currentTime = 190;
    tick();
    tick();
    expect(about).toHaveBeenCalledTimes(1);
    player.setNextUri('http://s/2', { gain: 0.5 });
    expect(elements[1].src).toBe('http://s/2');
    elements[0].dispatchEvent(new Event('ended'));
    expect(started).toHaveBeenCalledTimes(1);
    expect(ended).not.toHaveBeenCalled();
    expect(elements[1].paused).toBe(false);
    expect(elements[1].volume).toBe(0.5);
    expect(elements[0].getAttribute('src')).toBeNull();
    // Les évènements de l'ancien élément ne comptent plus.
    elements[0].dispatchEvent(new Event('ended'));
    expect(started).toHaveBeenCalledTimes(1);
  });

  it('fin sans suivante', () => {
    const ended = vi.fn();
    player.onTrackEnded = ended;
    player.load('http://s/1');
    player.setNextUri(null);
    elements[0].dispatchEvent(new Event('ended'));
    expect(ended).toHaveBeenCalledTimes(1);
    expect(player.isPlaying).toBe(false);
  });

  it('un nouveau chargement oublie la suivante préchargée', () => {
    const ended = vi.fn();
    player.onTrackEnded = ended;
    player.load('http://s/1');
    player.setNextUri('http://s/2');
    player.load('http://s/5');
    expect(elements[1].getAttribute('src')).toBeNull();
    elements[0].dispatchEvent(new Event('ended'));
    expect(ended).toHaveBeenCalled();
  });

  it('erreurs lisibles', () => {
    const onError = vi.fn();
    player.onError = onError;
    player.load('http://s/1');
    elements[0].error = { code: 4 };
    elements[0].dispatchEvent(new Event('error'));
    expect(onError).toHaveBeenCalledWith('format non pris en charge');
  });

  it('position et durée nulles sans flux ou inconnues', () => {
    expect(player.position()).toBe(0);
    player.load('http://s/1');
    expect(player.duration()).toBe(0);
    elements[0].duration = 120;
    player.seek(30);
    expect(player.position()).toBe(30);
    player.stop();
    expect(player.position()).toBe(0);
    expect(player.isPlaying).toBe(false);
  });

  it('positions publiées pendant la lecture seulement', () => {
    const onPosition = vi.fn();
    player.onPosition = onPosition;
    player.load('http://s/1');
    elements[0].duration = 100;
    elements[0].currentTime = 3;
    tick();
    expect(onPosition).toHaveBeenCalledWith(3, 100);
    player.pause();
    expect(tick).toBeNull();
  });
});
