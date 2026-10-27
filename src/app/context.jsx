// État partagé de l'application : réglages, identité de l'appareil, client
// API et navigation. Équivalent de JewelboxApplication + JewelboxWindow côté
// lecteur bureau.

import { createContext } from 'preact';
import { useContext, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { invoke, isTauri } from '@tauri-apps/api/core';

import { JewelBoxClient } from '../api/client.js';
import { deviceLabel, ensureDeviceId } from '../core/device.js';
import { PlaybackStateStore } from '../core/playbackState.js';
import { createSettings } from '../core/settings.js';
import { AudioPlayer } from '../playback/player.js';
import { QueueSync } from '../playback/queueSync.js';
import { RemoteControl } from '../playback/remoteControl.js';
import { PlaybackSession } from '../playback/session.js';

const AppContext = createContext(null);

export const TABS = ['home', 'library', 'search', 'playlists'];

// Client reconstruit quand l'adresse change ; null tant qu'aucun serveur
// valide n'est configuré (chaque page affiche alors son état « Aucun serveur »).
function buildClient(url, deviceId) {
  if (!url) return null;
  try {
    return new JewelBoxClient(url, { deviceId });
  } catch {
    return null;
  }
}

// Session de lecture unique, indépendante des pages (comme celle construite
// au démarrage de l'application côté bureau). getClient lit toujours le
// client courant : un changement d'adresse est vu sans reconstruire.
function createPlayback(clientRef) {
  return new PlaybackSession({
    getClient: () => clientRef.current,
    player: new AudioPlayer(),
    stateStore: new PlaybackStateStore(),
  });
}

export function AppProvider({ settings: injected, playback: injectedPlayback, children }) {
  const settings = useMemo(() => injected ?? createSettings(), [injected]);
  const [serverUrl, setServerUrl] = useState(() => settings.get('server-url'));
  const [hostname, setHostname] = useState('');

  // Identité de cet appareil (en-tête X-Device-Id) : générée une seule fois,
  // jamais régénérée — le serveur y attache la file de lecture.
  const deviceId = useMemo(() => {
    const id = ensureDeviceId(settings.get('device-id'));
    settings.set('device-id', id);
    return id;
  }, [settings]);

  useEffect(() => settings.subscribe((key, value) => {
    if (key === 'server-url') setServerUrl(value);
  }), [settings]);

  useEffect(() => {
    if (!isTauri()) return;
    invoke('device_hostname').then(setHostname).catch(() => {});
  }, []);

  const client = useMemo(() => buildClient(serverUrl, deviceId), [serverUrl, deviceId]);
  const clientRef = useRef(client);
  clientRef.current = client;

  const playback = useMemo(() => injectedPlayback ?? createPlayback(clientRef), [injectedPlayback]);

  // Réglages du moteur, appliqués au démarrage puis à chaque changement.
  useEffect(() => {
    playback.setReplayGain(settings.get('replaygain'));
    playback.setTransitionFade(settings.get('transition-fade'));
    return settings.subscribe((key, value) => {
      if (key === 'replaygain') playback.setReplayGain(value);
      if (key === 'transition-fade') playback.setTransitionFade(value);
    });
  }, [settings, playback]);

  // Reprise là où l'écoute s'était arrêtée, dès qu'un serveur est connu ;
  // dernier instantané à la fermeture de la fenêtre.
  useEffect(() => {
    if (client) playback.restore();
  }, [client, playback]);

  // File publiée sur le serveur : un autre appareil peut la reprendre.
  const labelRef = useRef('');
  labelRef.current = deviceLabel(hostname);
  useEffect(() => {
    const sync = new QueueSync({ playback, getClient: () => clientRef.current, getDeviceLabel: () => labelRef.current });
    sync.start();
    return () => sync.stop();
  }, [playback]);

  // Pilotage par un autre client (Gladys…), si le réglage l'autorise. L'état
  // en direct est rapporté dans tous les cas.
  const remoteRef = useRef(null);
  useEffect(() => {
    const control = new RemoteControl({
      playback,
      getClient: () => clientRef.current,
      getDeviceLabel: () => labelRef.current,
      isEnabled: () => settings.get('remote-control'),
      getRankingSize: () => settings.get('smart-ranking-size'),
    });
    remoteRef.current = control;
    control.start();
    const unsubscribe = settings.subscribe((key) => {
      if (key === 'remote-control') control.restart();
    });
    return () => {
      unsubscribe();
      control.stop();
    };
  }, [playback, settings]);
  // Nouveau serveur : le flux est rouvert vers lui.
  useEffect(() => {
    remoteRef.current?.restart();
  }, [client]);
  useEffect(() => {
    const save = () => playback.saveNow();
    window.addEventListener('pagehide', save);
    return () => window.removeEventListener('pagehide', save);
  }, [playback]);

  // Navigation : un onglet racine, et par-dessus une pile de fiches (album,
  // playlist…) comme le NavigationView du lecteur bureau. Changer d'onglet
  // vide la pile.
  const [nav, setNav] = useState({ tab: 'home', stack: [] });
  const navigation = useMemo(() => ({
    tab: nav.tab,
    page: nav.stack.at(-1) ?? null,
    canGoBack: nav.stack.length > 0,
    depth: nav.stack.length,
    selectTab: (tab) => setNav({ tab, stack: [] }),
    push: (page) => setNav((current) => ({ ...current, stack: [...current.stack, page] })),
    pop: () => setNav((current) => ({ ...current, stack: current.stack.slice(0, -1) })),
  }), [nav]);

  const value = useMemo(() => ({
    settings,
    deviceId,
    deviceLabel: deviceLabel(hostname),
    client,
    playback,
    navigation,
  }), [settings, deviceId, hostname, client, playback, navigation]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp hors de AppProvider');
  return value;
}

// [valeur, setter] d'un réglage, rafraîchi quand il change ailleurs.
export function useSetting(key) {
  const { settings } = useApp();
  const [value, setValue] = useState(() => settings.get(key));
  useEffect(() => {
    setValue(settings.get(key));
    return settings.subscribe((changed, next) => {
      if (changed === key) setValue(next);
    });
  }, [settings, key]);
  return [value, (next) => settings.set(key, next)];
}

// État de lecture courant (barre de lecture, surbrillance des pistes).
export function usePlaybackState() {
  const { playback } = useApp();
  const [state, setState] = useState(() => playback.state());
  useEffect(() => playback.subscribe(setState), [playback]);
  return state;
}
