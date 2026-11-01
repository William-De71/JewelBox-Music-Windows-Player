// La télécommande d'un autre lecteur (portage de RemoteControlPage,
// ui/remote.py), mise en page comme le grand lecteur : ce qu'il joue, en
// direct, et les commandes que ses capacités permettent ; sa file à droite
// (un clic lance ce morceau là-bas).

import { useEffect, useRef, useState } from 'preact/hooks';

import { useApp } from '../app/context.jsx';
import { useListenHere, useRemoteDevices, useRemoteSend } from '../app/remote.jsx';
import {
  deviceName, livePosition, muteCommand, nextRepeat, playIndexCommand, repeatCommand,
  seekCommand, shuffleCommand, simpleCommand, volumeCommand,
} from '../core/remoteController.js';
import { Cover } from '../ui/Cover.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';
import { Icon } from '../ui/Icon.jsx';
import { SeekBar, VolumeControl } from '../ui/PlayerBar.jsx';

const REPEAT_LABELS = { off: 'Répétition désactivée', all: 'Répéter la file', one: 'Répéter la piste' };

// La position avance entre deux rapports (toutes les 30 s en lecture).
function useNow(intervalMs) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

// La file que ce lecteur garde sur le serveur, relue quand il change de
// piste, de place dans la file ou d'ordre (aléatoire).
function useDeviceQueue(deviceId, state, enabled) {
  const { client } = useApp();
  const [tracks, setTracks] = useState([]);
  const key = state ? `${state.trackId}|${state.currentIndex}|${state.shuffle}` : '';
  useEffect(() => {
    if (!client || !enabled) {
      setTracks([]);
      return undefined;
    }
    let cancelled = false;
    client.deviceQueue(deviceId)
      .then((queue) => !cancelled && setTracks(queue.tracks))
      .catch(() => !cancelled && setTracks([]));
    return () => { cancelled = true; };
  }, [client, deviceId, key, enabled]);
  return tracks;
}

export function RemoteControlPage({ deviceId }) {
  const { client } = useApp();
  const devices = useRemoteDevices();
  const send = useRemoteSend();
  const listenHere = useListenHere();
  const now = useNow(500);
  const device = devices?.find((d) => d.deviceId === deviceId) ?? null;
  const state = device?.state ?? null;
  const can = (capability) => Boolean(device?.capabilities.includes(capability));
  const tracks = useDeviceQueue(deviceId, state, can('queue'));
  const command = (body) => send(deviceId, body);

  // Volume : un seul ordre peu après le dernier mouvement du curseur, et la
  // valeur glissée affichée le temps que le lecteur rapporte la sienne.
  const [volumeDraft, setVolumeDraft] = useState(null);
  const volumeTimer = useRef(null);
  const draftTimer = useRef(null);
  useEffect(() => () => {
    clearTimeout(volumeTimer.current);
    clearTimeout(draftTimer.current);
  }, []);
  const onVolume = (value) => {
    setVolumeDraft(value);
    clearTimeout(volumeTimer.current);
    clearTimeout(draftTimer.current);
    volumeTimer.current = setTimeout(() => command(volumeCommand(value * 100)), 250);
    draftTimer.current = setTimeout(() => setVolumeDraft(null), 2000);
  };

  if (devices === null) {
    return <div class="page-loading"><fluent-spinner /><span>Connexion au lecteur…</span></div>;
  }
  if (!device) {
    return (
      <div class="page">
        <EmptyState icon="plug_disconnected" title="Cet appareil n’est plus disponible"
          description="Son lecteur a peut-être été fermé." />
      </div>
    );
  }

  const track = state?.track ?? null;
  const playing = state?.playbackState === 'playing';
  const repeat = state?.repeat ?? 'off';
  const currentIndex = state?.currentIndex ?? -1;

  return (
    <div class="full-player">
      <section class="full-player__main">
        <div class="full-player__cover">
          <Cover url={track ? client.resolveCover(track.coverUrl) : null} alt={track ? `Pochette de ${track.albumTitle}` : ''}
            class="cover--shadow" />
        </div>
        <div class="full-player__titles">
          <div class="full-player__source">{deviceName(device)}</div>
          <h1 class="full-player__title">{track?.title ?? 'Rien en lecture'}</h1>
          {track?.artistName && <div class="full-player__artist">{track.artistName}</div>}
          {track?.albumTitle && <div class="full-player__album">{track.albumTitle}</div>}
        </div>
        {track && (
          <SeekBar
            position={livePosition(state, now)}
            duration={can('seek') ? state.durationSec : 0}
            onSeek={(seconds) => command(seekCommand(seconds))}
            class="seek--wide"
          />
        )}
        <div class="transport transport--large">
          {can('shuffle') && (
            <button type="button" class={`icon-button ${state?.shuffle ? 'icon-button--active' : ''}`}
              aria-pressed={state?.shuffle ? 'true' : 'false'} aria-label="Lecture aléatoire" title="Lecture aléatoire"
              onClick={() => command(shuffleCommand(!state?.shuffle))}>
              <Icon name="arrow_shuffle" />
            </button>
          )}
          <button type="button" class="icon-button" aria-label="Précédent" title="Précédent"
            onClick={() => command(simpleCommand('previous'))}>
            <Icon name="previous" filled />
          </button>
          <button type="button" class="play-button" aria-label={playing ? 'Pause' : 'Lecture'} title={playing ? 'Pause' : 'Lecture'}
            onClick={() => command(simpleCommand('toggle'))}>
            <Icon name={playing ? 'pause' : 'play'} filled size={28} />
          </button>
          <button type="button" class="icon-button" aria-label="Suivant" title="Suivant"
            onClick={() => command(simpleCommand('next'))}>
            <Icon name="next" filled />
          </button>
          {can('repeat') && (
            <button type="button" class={`icon-button ${repeat !== 'off' ? 'icon-button--active' : ''}`}
              aria-label={REPEAT_LABELS[repeat]} title={REPEAT_LABELS[repeat]}
              onClick={() => command(repeatCommand(nextRepeat(repeat)))}>
              <Icon name={repeat === 'one' ? 'arrow_repeat_1' : 'arrow_repeat_all'} />
            </button>
          )}
        </div>
        {can('volume') && state?.volume != null && (
          <div class="full-player__extras">
            <VolumeControl
              volume={volumeDraft ?? state.volume / 100}
              muted={Boolean(state.muted) && volumeDraft === null}
              onVolume={onVolume}
              onMuted={(muted) => can('mute') && command(muteCommand(muted))}
            />
          </div>
        )}
        {track && (
          <fluent-button onClick={() => listenHere(device)}>
            <span slot="start"><Icon name="headphones" size={16} /></span>
            Écouter ici
          </fluent-button>
        )}
      </section>
      {tracks.length > 0 && (
        <section class="full-player__side">
          <h2 class="remote-queue__title">File d’attente ({tracks.length})</h2>
          <div class="full-player__panel">
            <div class="queue" role="list">
              {tracks.map((item, index) => (
                <div
                  key={`${item.id}-${index}`}
                  role="listitem"
                  class={`queue-row ${index === currentIndex ? 'queue-row--current' : ''}`}
                  onClick={() => command(playIndexCommand(index))}
                  onKeyDown={(event) => event.key === 'Enter' && command(playIndexCommand(index))}
                  tabIndex={0}
                >
                  <Cover url={client.resolveCover(item.coverUrl)} size={40} />
                  <span class="queue-row__text">
                    <span class="queue-row__title">{item.title}</span>
                    <span class="queue-row__subtitle">{item.artistName}</span>
                  </span>
                  {index === currentIndex && <Icon name={playing ? 'speaker_2' : 'pause'} size={16} class="queue-row__now" />}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
