// Barre de lecture en bas de la fenêtre (portage de ui/player_bar.py), à la
// manière du Lecteur multimédia de Windows 11 : pochette et titre à gauche
// (un clic ouvre le grand lecteur), transport et progression au centre,
// favori, playlist, volume et fermeture à droite.

import { useEffect, useState } from 'preact/hooks';

import { useActions } from '../app/actions.jsx';
import { useApp, usePlaybackState } from '../app/context.jsx';
import { formatDuration } from '../core/formats.js';
import { Cover } from './Cover.jsx';
import { Icon } from './Icon.jsx';

// Barre de progression : la position suit la lecture, sauf pendant qu'on la
// fait glisser (le seek n'est envoyé qu'au relâchement).
export function SeekBar({ position, duration, onSeek, class: className = '' }) {
  const [dragging, setDragging] = useState(null);
  const shown = dragging ?? position;
  const max = duration > 0 ? duration : 1;
  return (
    <div class={`seek ${className}`}>
      <span class="seek__time">{formatDuration(shown)}</span>
      <input
        type="range"
        class="range"
        min="0"
        max={max}
        step="0.5"
        value={Math.min(shown, max)}
        disabled={duration <= 0}
        aria-label="Position dans la piste"
        style={{ '--fill': `${(Math.min(shown, max) / max) * 100}%` }}
        onInput={(event) => setDragging(Number(event.currentTarget.value))}
        onChange={(event) => { onSeek(Number(event.currentTarget.value)); setDragging(null); }}
      />
      <span class="seek__time">{formatDuration(duration)}</span>
    </div>
  );
}

export function VolumeControl({ volume, muted, onVolume, onMuted }) {
  const silent = muted || volume <= 0;
  return (
    <div class="volume">
      <button type="button" class="icon-button" aria-label={silent ? 'Rétablir le son' : 'Couper le son'}
        title={silent ? 'Rétablir le son' : 'Couper le son'} onClick={() => onMuted(!muted)}>
        <Icon name={silent ? 'speaker_mute' : 'speaker_2'} />
      </button>
      <input
        type="range"
        class="range volume__slider"
        min="0"
        max="1"
        step="0.01"
        value={muted ? 0 : volume}
        aria-label="Volume"
        style={{ '--fill': `${(muted ? 0 : volume) * 100}%` }}
        onInput={(event) => {
          if (muted) onMuted(false);
          onVolume(Number(event.currentTarget.value));
        }}
      />
    </div>
  );
}

export function TransportControls({ state, playback, size = 'normal' }) {
  const repeatIcon = state.repeat === 'one' ? 'arrow_repeat_1' : 'arrow_repeat_all';
  const repeatLabel = { off: 'Répétition désactivée', all: 'Répéter la file', one: 'Répéter la piste' }[state.repeat];
  return (
    <div class={`transport transport--${size}`}>
      <button type="button" class={`icon-button ${state.shuffle ? 'icon-button--active' : ''}`}
        aria-pressed={state.shuffle ? 'true' : 'false'} aria-label="Lecture aléatoire" title="Lecture aléatoire (Ctrl+S)"
        onClick={() => playback.toggleShuffle()}>
        <Icon name="arrow_shuffle" />
      </button>
      <button type="button" class="icon-button" aria-label="Précédent" title="Précédent (Ctrl+B)" onClick={() => playback.previous()}>
        <Icon name="previous" filled />
      </button>
      <button type="button" class="play-button" aria-label={state.isPlaying ? 'Pause' : 'Lecture'}
        title={`${state.isPlaying ? 'Pause' : 'Lecture'} (Ctrl+Espace)`} onClick={() => playback.togglePlayPause()}>
        <Icon name={state.isPlaying ? 'pause' : 'play'} filled size={size === 'large' ? 28 : 20} />
      </button>
      <button type="button" class="icon-button" aria-label="Suivant" title="Suivant (Ctrl+N)" disabled={!state.hasNext} onClick={() => playback.next()}>
        <Icon name="next" filled />
      </button>
      <button type="button" class={`icon-button ${state.repeat !== 'off' ? 'icon-button--active' : ''}`}
        aria-label={repeatLabel} title={`${repeatLabel} (Ctrl+R)`} onClick={() => playback.cycleRepeat()}>
        <Icon name={repeatIcon} />
      </button>
    </div>
  );
}

export function PlayerBar({ onOpenFullPlayer }) {
  const { playback } = useApp();
  const { addToPlaylist } = useActions();
  const state = usePlaybackState();
  const current = state.current;
  const [error, setError] = useState(null);

  useEffect(() => {
    if (state.error) setError(state.error);
  }, [state.error]);
  useEffect(() => setError(null), [state.currentTrackId]);

  if (!state.hasItem || !current) return null;

  const subtitle = [current.artistName, state.sourceName].filter(Boolean).join(' · ');

  return (
    <footer class="player-bar" aria-label="Lecture en cours">
      <button type="button" class="player-bar__info" onClick={onOpenFullPlayer} title="Ouvrir le lecteur">
        <Cover url={current.coverUrl} size={56} alt="" />
        <span class="player-bar__text">
          <span class="player-bar__title">{current.title}</span>
          <span class="player-bar__subtitle">{error ? `Lecture impossible : ${error}` : subtitle}</span>
        </span>
      </button>
      <div class="player-bar__center">
        <TransportControls state={state} playback={playback} />
        <SeekBar position={state.position} duration={state.duration} onSeek={(s) => playback.seek(s)} />
      </div>
      <div class="player-bar__right">
        <button type="button" class={`icon-button ${state.isFavorite ? 'icon-button--active' : ''}`}
          aria-pressed={state.isFavorite ? 'true' : 'false'} aria-label="Favori" title="Favori (Ctrl+D)"
          onClick={() => playback.toggleFavorite()}>
          <Icon name="heart" filled={state.isFavorite} />
        </button>
        <button type="button" class="icon-button" aria-label="Ajouter à une playlist" title="Ajouter à une playlist"
          onClick={() => addToPlaylist({ trackId: current.trackId })}>
          <Icon name="add" />
        </button>
        <VolumeControl volume={state.volume} muted={state.muted} onVolume={(v) => playback.setVolume(v)} onMuted={(m) => playback.setMuted(m)} />
        <button type="button" class="icon-button" aria-label="Fermer le lecteur" title="Fermer le lecteur" onClick={() => playback.close()}>
          <Icon name="dismiss" />
        </button>
      </div>
    </footer>
  );
}
