import { expect, it } from 'vitest';
import { deviceLabel, ensureDeviceId } from '../src/core/device.js';

it('garde un identifiant existant, même étrange', () => {
  expect(ensureDeviceId('legacy-id', () => 'new')).toBe('legacy-id');
  expect(ensureDeviceId('  abc  ', () => 'new')).toBe('abc');
});

it('en génère un si absent', () => {
  expect(ensureDeviceId('', () => 'new')).toBe('new');
  expect(ensureDeviceId(null, () => 'new')).toBe('new');
  expect(ensureDeviceId('   ', () => 'new')).toBe('new');
});

it('UUID par défaut', () => {
  expect(ensureDeviceId('')).toMatch(/^[0-9a-f-]{36}$/);
});

it('libellé de l’appareil', () => {
  expect(deviceLabel('PC-SALON')).toBe('JewelBox Windows · PC-SALON');
  expect(deviceLabel('')).toBe('JewelBox Windows');
  expect(deviceLabel(null)).toBe('JewelBox Windows');
});
