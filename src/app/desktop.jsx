// Intégration au bureau Windows : raccourcis clavier, contrôles multimédias
// du système (Media Session : touches multimédias, panneau de Windows),
// icône de la zone de notification, lecture en arrière-plan fenêtre fermée,
// notification au changement de piste. Équivalent de MPRIS, du notifier et
// de la lecture en arrière-plan du lecteur bureau.

import { useEffect, useRef } from 'preact/hooks';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

import { shortcutAction } from '../core/shortcuts.js';
import { useApp } from './context.jsx';
import { useOverlays } from './overlays.jsx';
import { ShortcutsDialog } from '../ui/ShortcutsDialog.jsx';

// Fenêtre masquée et plus rien ne joue : on quitte au bout de ce délai
// plutôt que de rester indéfiniment en arrière-plan.
const IDLE_QUIT_MS = 10 * 60 * 1000;

async function notify(title, body) {
  try {
    const { isPermissionGranted, requestPermission, sendNotification } = await import('@tauri-apps/plugin-notification');
    let granted = await isPermissionGranted();
    if (!granted) granted = (await requestPermission()) === 'granted';
    if (granted) sendNotification({ title, body });
  } catch { /* notifications indisponibles : sans conséquence */ }
}

async function quitApp(playback) {
  playback.saveNow();
  if (isTauri()) await invoke('quit_app');
}

function playbackAction(playback, action) {
  // File vide : rien à lire, mettre en pause ni passer.
  if (!playback.hasItem) return;
  ({
    'play-pause': () => playback.togglePlayPause(),
    next: () => playback.next(),
    previous: () => playback.previous(),
    'toggle-shuffle': () => playback.toggleShuffle(),
    'cycle-repeat': () => playback.cycleRepeat(),
    'toggle-favorite': () => playback.toggleFavorite(),
  })[action]?.();
}

export function useDesktopIntegration() {
  const { playback, navigation, settings } = useApp();
  const { openDialog } = useOverlays();
  const navRef = useRef(navigation);
  navRef.current = navigation;

  // ── Raccourcis clavier ─────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape' && !event.ctrlKey) {
        // Un dialogue ou un menu ouvert gère lui-même Échap.
        if (document.querySelector('.dialog, .menu')) return;
        if (navRef.current.canGoBack) navRef.current.pop();
        return;
      }
      const action = shortcutAction(event);
      if (!action) return;
      event.preventDefault();
      if (action === 'search') {
        navRef.current.selectTab('search');
        setTimeout(() => document.querySelector('.search-field fluent-text-input')?.focus(), 50);
      } else if (action === 'preferences') {
        navRef.current.selectTab('settings');
      } else if (action === 'shortcuts') {
        openDialog((close) => <ShortcutsDialog onClose={close} />);
      } else if (action === 'quit') {
        quitApp(playback);
      } else {
        playbackAction(playback, action);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playback, openDialog]);

  // ── Contrôles multimédias du système ───────────────────────────────────────
  useEffect(() => {
    const session = navigator.mediaSession;
    if (!session) return undefined;
    const handlers = {
      play: () => playback.play(),
      pause: () => playback.pause(),
      stop: () => playback.pause(),
      previoustrack: () => playback.previous(),
      nexttrack: () => playback.next(),
      seekto: (details) => details.seekTime != null && playback.seek(details.seekTime),
    };
    for (const [action, handler] of Object.entries(handlers)) {
      try {
        session.setActionHandler(action, handler);
      } catch { /* action non prise en charge */ }
    }
    let lastTrack = null;
    const unsubscribe = playback.subscribe((state) => {
      const current = state.current;
      if (!current) {
        session.metadata = null;
        session.playbackState = 'none';
        lastTrack = null;
        return;
      }
      if (current.trackId !== lastTrack || session.metadata?.artist !== current.artistName) {
        lastTrack = current.trackId;
        session.metadata = new MediaMetadata({
          title: current.title,
          artist: current.artistName,
          album: current.albumTitle,
          artwork: current.coverUrl ? [{ src: current.coverUrl, sizes: '512x512' }] : [],
        });
      }
      session.playbackState = state.isPlaying ? 'playing' : 'paused';
      if (state.duration > 0 && state.position <= state.duration) {
        try {
          session.setPositionState({ duration: state.duration, position: state.position, playbackRate: 1 });
        } catch { /* durée encore inconnue */ }
      }
    });
    return () => {
      unsubscribe();
      for (const action of Object.keys(handlers)) {
        try {
          session.setActionHandler(action, null);
        } catch { /* ignoré */ }
      }
    };
  }, [playback]);

  // ── Fenêtre, zone de notification, arrière-plan (application seulement) ────
  useEffect(() => {
    if (!isTauri()) return undefined;
    const appWindow = getCurrentWindow();
    const cleanups = [];
    let hidden = false;
    let idleTimer = null;
    let backgroundNotified = false;

    const updateIdleQuit = () => {
      const shouldQuit = hidden && !playback.isPlaying;
      if (shouldQuit && idleTimer === null) idleTimer = setTimeout(() => quitApp(playback), IDLE_QUIT_MS);
      if (!shouldQuit && idleTimer !== null) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
    };

    // Fermer pendant une lecture : la fenêtre se masque et la musique
    // continue (réglage « Lecture en arrière-plan »).
    appWindow.onCloseRequested(async (event) => {
      if (settings.get('background-playback') && playback.isPlaying) {
        event.preventDefault();
        await appWindow.hide();
        hidden = true;
        updateIdleQuit();
        if (!backgroundNotified) {
          backgroundNotified = true;
          notify('JewelBox continue la lecture', 'La fenêtre est fermée, la musique continue. Rouvrez JewelBox depuis la zone de notification.');
        }
        return;
      }
      playback.saveNow();
    }).then((unlisten) => cleanups.push(unlisten));

    listen('window-shown', () => {
      hidden = false;
      updateIdleQuit();
    }).then((unlisten) => cleanups.push(unlisten));

    listen('tray-action', ({ payload }) => {
      if (payload === 'quit') quitApp(playback);
      else playbackAction(playback, payload);
    }).then((unlisten) => cleanups.push(unlisten));

    // Infobulle de l'icône et notification de changement de piste (quand la
    // fenêtre n'est pas au premier plan).
    let lastTrack = null;
    let lastTooltip = null;
    const unsubscribe = playback.subscribe((state) => {
      updateIdleQuit();
      const current = state.current;
      const tooltip = current ? `${current.title} — ${current.artistName}` : '';
      if (tooltip !== lastTooltip) {
        lastTooltip = tooltip;
        invoke('set_tray_tooltip', { text: tooltip }).catch(() => {});
      }
      if (!current || current.trackId === lastTrack) return;
      const first = lastTrack === null;
      lastTrack = current.trackId;
      if (first || !state.isPlaying || !settings.get('notify-track-change')) return;
      appWindow.isFocused().then((focused) => {
        if (!focused || hidden) notify(current.title, [current.artistName, current.albumTitle].filter(Boolean).join(' — '));
      }).catch(() => {});
    });
    cleanups.push(unsubscribe);

    return () => {
      clearTimeout(idleTimer);
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [playback, settings]);
}
