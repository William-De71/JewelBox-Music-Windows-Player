import { expect, it } from 'vitest';
import { shortcutAction } from '../src/core/shortcuts.js';

const key = (k, mods = {}) => ({ key: k, ctrlKey: true, altKey: false, metaKey: false, shiftKey: false, ...mods });

it('raccourcis de lecture et généraux', () => {
  expect(shortcutAction(key(' '))).toBe('play-pause');
  expect(shortcutAction(key('N'))).toBe('next');
  expect(shortcutAction(key('b'))).toBe('previous');
  expect(shortcutAction(key('d'))).toBe('toggle-favorite');
  expect(shortcutAction(key('f'))).toBe('search');
  expect(shortcutAction(key(','))).toBe('preferences');
  expect(shortcutAction(key('?', { shiftKey: true }))).toBe('shortcuts');
});

it('sans Ctrl, avec Alt ou Maj : rien', () => {
  expect(shortcutAction(key('n', { ctrlKey: false }))).toBeNull();
  expect(shortcutAction(key('n', { altKey: true }))).toBeNull();
  expect(shortcutAction(key('n', { shiftKey: true }))).toBeNull();
  expect(shortcutAction(key('x'))).toBeNull();
  expect(shortcutAction(key('ArrowLeft'))).toBeNull();
});
