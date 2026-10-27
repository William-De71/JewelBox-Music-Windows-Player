import { describe, expect, it } from 'vitest';
import {
  deviceSummary, parseServerTimestamp, pickResumable, PROGRESS_INTERVAL, QueueSyncPlanner, RESUME_WINDOW, resumeStart, timeAgo,
} from '../src/core/queueSync.js';

describe('QueueSyncPlanner', () => {
  it('nouvelle file : PUT complet ; resend force le PUT', () => {
    const planner = new QueueSyncPlanner();
    expect(planner.update([1, 2, 3], 1, 12.5, true, 0)).toEqual({ kind: 'save', trackIds: [1, 2, 3], currentIndex: 1, positionSec: 12.5 });
    planner.resend();
    expect(planner.update([1, 2, 3], 1, 3, true, 1).kind).toBe('save');
  });
  it('rien de neuf, changement de piste, progression, pause', () => {
    const planner = new QueueSyncPlanner();
    planner.update([1, 2], 0, 0, true, 0);
    expect(planner.update([1, 2], 0, 5, true, 5)).toBeNull();
    expect(planner.update([1, 2], 1, 0.4, true, 6)).toEqual({ kind: 'state', currentIndex: 1, positionSec: 0.4 });
    expect(planner.update([1, 2], 1, 10, true, 6 + PROGRESS_INTERVAL - 1)).toBeNull();
    expect(planner.update([1, 2], 1, 31, true, 6 + PROGRESS_INTERVAL + 1)).toEqual({ kind: 'state', currentIndex: 1, positionSec: 31 });
    expect(planner.update([1, 2], 1, 32, true, 6 + PROGRESS_INTERVAL + 2)).toBeNull();
    expect(planner.update([1, 2], 1, 33.25, false, 6 + PROGRESS_INTERVAL + 3)).toEqual({ kind: 'state', currentIndex: 1, positionSec: 33.25 });
  });
  it('pas de ping en pause', () => {
    const planner = new QueueSyncPlanner();
    planner.update([1], 0, 0, false, 0);
    expect(planner.update([1], 0, 0, false, 10 * PROGRESS_INTERVAL)).toBeNull();
  });
  it('pistes changées, file vidée une fois, vide d’emblée', () => {
    const planner = new QueueSyncPlanner();
    planner.update([1, 2], 0, 0, true, 0);
    expect(planner.update([1, 2, 9], 0, 3, true, 1).kind).toBe('save');
    expect(planner.update([], null, 0, false, 2)).toEqual({ kind: 'clear' });
    expect(planner.update([], null, 0, false, 3)).toBeNull();
    expect(new QueueSyncPlanner().update([], null, 0, false, 0)).toBeNull();
  });
  it('file épuisée : pas de courante, position bornée', () => {
    const planner = new QueueSyncPlanner();
    planner.update([1], 0, 0, true, 0);
    expect(planner.update([1], null, -3, false, 1)).toEqual({ kind: 'state', currentIndex: -1, positionSec: 0 });
  });
});

describe('resumeStart', () => {
  it('cas', () => {
    expect(resumeStart([true, false, true, true], 2)).toEqual({ index: 1, sameTrack: true });
    expect(resumeStart([true, false, true], 1)).toEqual({ index: 1, sameTrack: false });
    expect(resumeStart([true, true, false], 2)).toEqual({ index: 1, sameTrack: false });
    expect(resumeStart([true, true], -1)).toEqual({ index: 0, sameTrack: false });
    expect(resumeStart([true, true], 9)).toEqual({ index: 0, sameTrack: false });
    expect(resumeStart([true], null)).toEqual({ index: 0, sameTrack: false });
    expect(resumeStart([false, false], 0)).toBeNull();
    expect(resumeStart([], 0)).toBeNull();
  });
});

describe('reprise à l’accueil', () => {
  const NOON = parseServerTimestamp('2026-10-19 12:00:00');
  const device = (deviceId, updatedAt, trackCount = 3) => ({ deviceId, updatedAt, trackCount });

  it('horodatages UTC', () => {
    expect(parseServerTimestamp('1970-01-01 00:01:00')).toBe(60);
    expect(parseServerTimestamp(' 1970-01-01 00:00:05 ')).toBe(5);
    for (const bad of [null, '', 'hier soir', '2026-02-31 00:00:00']) expect(parseServerTimestamp(bad)).toBeNull();
  });
  it('le plus récent', () => {
    const older = device('a', '2026-10-19 10:00:00');
    const newer = device('b', '2026-10-19 11:30:00');
    expect(pickResumable([older, newer], NOON)).toBe(newer);
    expect(pickResumable([newer, older], NOON)).toBe(newer);
  });
  it('écarte vide, périmé, inconnu, futur ; fenêtre inclusive', () => {
    expect(pickResumable([
      device('empty', '2026-10-19 11:59:00', 0), device('stale', '2026-10-18 11:59:59'),
      device('unknown', null), device('future', '2026-10-19 12:00:01'),
    ], NOON)).toBeNull();
    const edge = device('edge', '2026-10-18 12:00:00');
    expect(pickResumable([edge], NOON)).toBe(edge);
    expect(NOON - parseServerTimestamp(edge.updatedAt)).toBe(RESUME_WINDOW);
  });
  it('écarté revient quand il rejoue', () => {
    const dismissed = new Set(['phone|2026-10-19 11:00:00']);
    expect(pickResumable([device('phone', '2026-10-19 11:00:00')], NOON, dismissed)).toBeNull();
    const again = device('phone', '2026-10-19 11:45:00');
    expect(pickResumable([again], NOON, dismissed)).toBe(again);
  });
  it('rien de ce que cet appareil a joué depuis', () => {
    const phone = device('phone', '2026-10-19 11:00:00');
    expect(pickResumable([phone], NOON, new Set(), '2026-10-19 11:05:00')).toBeNull();
    expect(pickResumable([phone], NOON, new Set(), '2026-10-19 11:00:00')).toBeNull();
    expect(pickResumable([phone], NOON, new Set(), '2026-10-19 10:30:00')).toBe(phone);
    expect(pickResumable([phone], NOON, new Set(), null)).toBe(phone);
    expect(pickResumable([phone], NOON, new Set(), '?')).toBe(phone);
  });
  it('libellés', () => {
    const now = NOON * 1000;
    expect(timeAgo('2026-10-19 11:59:40', now)).toBe('à l’instant');
    expect(timeAgo('2026-10-19 11:55:00', now)).toBe('il y a 5 min');
    expect(timeAgo('2026-10-19 09:00:00', now)).toBe('il y a 3 h');
    expect(timeAgo('2026-10-17 12:00:00', now)).toBe('il y a 2 j');
    expect(timeAgo(null, now)).toBe('');
    expect(deviceSummary({ deviceLabel: 'JewelBox Android · Pixel', currentTitle: 'Sexy Boy', currentArtist: 'Air', sourceLabel: 'Moon Safari', trackCount: 10, updatedAt: '2026-10-19 11:55:00' }, now))
      .toEqual({ title: 'Sexy Boy — Air', subtitle: 'Moon Safari · JewelBox Android · Pixel · 10 pistes · il y a 5 min' });
    expect(deviceSummary({ deviceLabel: null, sourceLabel: null, trackCount: 1, updatedAt: null }, now))
      .toEqual({ title: 'Appareil sans nom', subtitle: '1 piste' });
  });
});
