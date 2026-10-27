// Grand lecteur (portage de ui/full_player.py), à la manière de la vue
// « En cours de lecture » du Lecteur multimédia de Windows : pochette (un
// clic ouvre l'album ou la playlist d'origine), titres, progression,
// transport, minuteur ; à droite, file d'attente ou paroles synchronisées.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';

import { useActions } from '../app/actions.jsx';
import { useApp, usePlaybackState } from '../app/context.jsx';
import { currentLineIndex, parseLyrics } from '../core/lyrics.js';
import { SLEEP_TIMER_MINUTES } from '../core/sleepTimer.js';
import { Cover } from '../ui/Cover.jsx';
import { Icon } from '../ui/Icon.jsx';
import { MenuButton } from '../ui/Menu.jsx';
import { SeekBar, TransportControls, VolumeControl } from '../ui/PlayerBar.jsx';

const SOURCE_LABELS = { album: 'Aller à l’album', playlist: 'Aller à la playlist', smart: 'Aller à la liste' };

function sleepLabel(state) {
  if (state.sleepMode === 'timer') return `Arrêt dans ${Math.max(1, Math.ceil(state.sleepRemaining / 60))} min`;
  if (state.sleepMode === 'track') return 'Arrêt en fin de piste';
  return 'Minuterie';
}

function QueuePanel({ state }) {
  const { playback } = useApp();
  const listRef = useRef(null);
  const items = state.queueItems;

  // La piste en cours reste en vue quand elle change.
  useEffect(() => {
    listRef.current?.querySelector('.queue-row--current')?.scrollIntoView({ block: 'nearest' });
  }, [state.queueIndex]);

  return (
    <div class="queue" ref={listRef} role="list">
      {items.map((item, index) => {
        const isCurrent = index === state.queueIndex;
        const entries = [
          index > 0 && { label: 'Monter', icon: 'arrow_up', onSelect: () => playback.moveInQueue(index, index - 1) },
          index < items.length - 1 && { label: 'Descendre', icon: 'arrow_down', onSelect: () => playback.moveInQueue(index, index + 1) },
          { label: 'Retirer de la file', icon: 'delete', onSelect: () => playback.removeFromQueue(index) },
        ].filter(Boolean);
        return (
          <div
            key={`${item.trackId}-${index}`}
            role="listitem"
            class={`queue-row ${isCurrent ? 'queue-row--current' : ''}`}
            onClick={() => playback.jumpTo(index)}
            onKeyDown={(event) => event.key === 'Enter' && playback.jumpTo(index)}
            tabIndex={0}
          >
            <Cover url={item.coverUrl} size={40} />
            <span class="queue-row__text">
              <span class="queue-row__title">{item.title}</span>
              <span class="queue-row__subtitle">{item.artistName}</span>
            </span>
            {isCurrent && <Icon name={state.isPlaying ? 'speaker_2' : 'pause'} size={16} class="queue-row__now" />}
            <span onClick={(event) => event.stopPropagation()}>
              <MenuButton entries={entries} label="Options de la file" />
            </span>
          </div>
        );
      })}
    </div>
  );
}

function LyricsPanel({ state }) {
  const { client, playback } = useApp();
  const trackId = state.currentTrackId;
  const [lyrics, setLyrics] = useState(null);
  const [message, setMessage] = useState('Recherche des paroles…');
  const currentRef = useRef(null);

  useEffect(() => {
    if (!client || trackId == null) return undefined;
    let cancelled = false;
    setLyrics(null);
    setMessage('Recherche des paroles…');
    client.lyrics(trackId)
      .then((payload) => {
        if (cancelled) return;
        const parsed = parseLyrics(payload);
        if (parsed.instrumental) setMessage('Morceau instrumental.');
        else if (parsed.empty) setMessage('Pas de paroles trouvées pour ce titre.');
        else setLyrics(parsed);
      })
      .catch(() => !cancelled && setMessage('Paroles indisponibles (serveur injoignable ou antérieur à la 1.20).'));
    return () => { cancelled = true; };
  }, [client, trackId]);

  const index = lyrics?.synced ? currentLineIndex(lyrics.lines, state.position) : -1;
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [index]);

  if (!lyrics) return <p class="lyrics__message">{message}</p>;
  if (!lyrics.synced) return <div class="lyrics lyrics--plain">{lyrics.plain}</div>;
  return (
    <div class="lyrics">
      {lyrics.lines.map((line, i) => (
        <button
          key={`${line.time}-${i}`}
          type="button"
          ref={i === index ? currentRef : undefined}
          class={`lyrics__line ${i === index ? 'lyrics__line--current' : ''} ${i < index ? 'lyrics__line--past' : ''}`}
          onClick={() => playback.seek(line.time)}
        >
          {line.text || '♪'}
        </button>
      ))}
      {lyrics.source === 'lrclib' && <p class="lyrics__credit">Paroles : LRCLIB</p>}
    </div>
  );
}

export function FullPlayerPage() {
  const { playback, navigation } = useApp();
  const { addToPlaylist } = useActions();
  const state = usePlaybackState();
  const [panel, setPanel] = useState('queue');

  // La file s'est vidée : plus rien à montrer, retour à la page d'avant.
  useEffect(() => {
    if (!state.hasItem) navigation.pop();
  }, [state.hasItem]);

  const sleepEntries = useMemo(() => [
    ...SLEEP_TIMER_MINUTES.map((minutes) => ({
      label: minutes < 60 ? `${minutes} minutes` : minutes === 60 ? '1 heure' : '1 h 30',
      onSelect: () => playback.setSleepTimer(minutes),
    })),
    { label: 'Fin de la piste en cours', onSelect: () => playback.setSleepTimer('track') },
    null,
    { label: 'Désactiver la minuterie', disabled: state.sleepMode === null, onSelect: () => playback.setSleepTimer(null) },
  ], [playback, state.sleepMode]);

  const current = state.current;
  if (!current) return null;

  const sourceLabel = SOURCE_LABELS[state.sourceType];
  const canOpenSource = Boolean(sourceLabel && state.sourceId != null);
  const openSource = () => {
    if (!canOpenSource) return;
    navigation.pop();
    if (state.sourceType === 'smart') navigation.push({ kind: 'smart', id: state.sourceId });
    else navigation.push({ kind: state.sourceType, id: Number(state.sourceId) });
  };
  const destination = state.sourceName || current.albumTitle;

  return (
    <div class="full-player">
      <section class="full-player__main">
        <button type="button" class="full-player__cover" disabled={!canOpenSource} onClick={openSource}
          title={canOpenSource ? (destination ? `Ouvrir « ${destination} »` : sourceLabel) : undefined}>
          <Cover url={current.coverUrl} alt={`Pochette de ${current.albumTitle}`} class="cover--shadow" />
        </button>
        <div class="full-player__titles">
          <div class="full-player__heading">
            <h1 class="full-player__title">{current.title}</h1>
            <button type="button" class={`icon-button ${state.isFavorite ? 'icon-button--active' : ''}`}
              aria-pressed={state.isFavorite ? 'true' : 'false'} aria-label="Favori" title="Favori (Ctrl+D)"
              onClick={() => playback.toggleFavorite()}>
              <Icon name="heart" filled={state.isFavorite} />
            </button>
            <button type="button" class="icon-button" aria-label="Ajouter à une playlist" title="Ajouter à une playlist"
              onClick={() => addToPlaylist({ trackId: current.trackId })}>
              <Icon name="add" />
            </button>
          </div>
          <div class="full-player__artist">{current.artistName}</div>
          <div class="full-player__album">{current.albumTitle}</div>
          {state.sourceName && <div class="full-player__source">Depuis : {state.sourceName}</div>}
        </div>
        <SeekBar position={state.position} duration={state.duration} onSeek={(s) => playback.seek(s)} class="seek--wide" />
        <TransportControls state={state} playback={playback} size="large" />
        <div class="full-player__extras">
          <MenuButton entries={sleepEntries} icon="weather_moon" text={sleepLabel(state)} label="Minuterie de sommeil"
            appearance={state.sleepMode ? 'primary' : 'subtle'} />
          <VolumeControl volume={state.volume} muted={state.muted} onVolume={(v) => playback.setVolume(v)} onMuted={(m) => playback.setMuted(m)} />
        </div>
      </section>
      <section class="full-player__side">
        <div class="segmented" role="tablist" aria-label="Panneau">
          <button type="button" role="tab" aria-selected={panel === 'queue' ? 'true' : 'false'}
            class={`segmented__item ${panel === 'queue' ? 'segmented__item--active' : ''}`} onClick={() => setPanel('queue')}>
            File d’attente ({state.queueItems.length})
          </button>
          <button type="button" role="tab" aria-selected={panel === 'lyrics' ? 'true' : 'false'}
            class={`segmented__item ${panel === 'lyrics' ? 'segmented__item--active' : ''}`} onClick={() => setPanel('lyrics')}>
            Paroles
          </button>
        </div>
        <div class="full-player__panel">
          {panel === 'queue' ? <QueuePanel state={state} /> : <LyricsPanel state={state} />}
        </div>
      </section>
    </div>
  );
}
