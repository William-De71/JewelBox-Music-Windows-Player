// Fiche d'une liste intelligente (portage de ui/smart_playlist_detail.py),
// en lecture seule ; le mix dynamique ajoute « Relancer un mix complet » et
// « Retirer du mix », et suit les rotations faites pendant la lecture.

import { useEffect, useState } from 'preact/hooks';

import { useActions } from '../app/actions.jsx';
import { useApp, usePlaybackState, useSetting } from '../app/context.jsx';
import { DYNAMIC_MIX_KEY } from '../core/dynamicMix.js';
import { smartSpec } from '../core/smartSpecs.js';
import { EmptyState } from '../ui/EmptyState.jsx';
import { Icon } from '../ui/Icon.jsx';
import { playableIndex, QueueTrackRow } from '../ui/QueueTrackRow.jsx';

const pistes = (n) => (n === 1 ? '1 piste' : `${n} pistes`);

export function SmartPlaylistDetailPage({ smartKey }) {
  const { client, playback } = useApp();
  const { addToPlaylist, queueEntries, toggleTrackFavorite } = useActions();
  const [rankingSize] = useSetting('smart-ranking-size');
  const playbackState = usePlaybackState();
  const [tracks, setTracks] = useState(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const spec = smartSpec(smartKey);
  const title = spec?.label ?? smartKey;
  const isDynamic = smartKey === DYNAMIC_MIX_KEY;

  useEffect(() => {
    if (!client) return undefined;
    let cancelled = false;
    setError(false);
    client.smartPlaylist(smartKey, rankingSize || undefined)
      .then((smart) => !cancelled && setTracks(smart.tracks))
      .catch(() => !cancelled && setError(true));
    return () => { cancelled = true; };
  }, [client, smartKey, rankingSize, attempt]);

  // Une piste du mix jouée jusqu'au bout : la fiche suit la rotation.
  useEffect(() => (isDynamic ? playback.subscribeMix(setTracks) : undefined), [playback, isDynamic]);

  if (error) {
    return (
      <EmptyState icon="error_circle" title="Liste introuvable">
        <fluent-button onClick={() => setAttempt((n) => n + 1)}>Réessayer</fluent-button>
      </EmptyState>
    );
  }
  if (!tracks) return <div class="page-loading"><fluent-spinner /><span>Chargement de la liste…</span></div>;

  const play = (startIndex) => playback.playQueueTracks(tracks, { startIndex, reportSmartKey: smartKey, sourceName: title });
  const playingThis = playbackState.sourceType === 'smart' && playbackState.sourceId === smartKey;

  async function runMix(call, syncQueue) {
    try {
      const result = await call();
      setTracks(result.tracks);
      if (syncQueue) playback.syncDynamicMix(result.tracks, { yankCurrent: true });
    } catch { /* affichage inchangé */ }
  }

  const setFavorite = (trackId, value) => setTracks((current) => current?.map((t) => (t.id === trackId ? { ...t, isFavorite: value } : t)));

  return (
    <div class="page">
      <header class="list-header">
        <span class="list-header__art list-header__art--smart"><Icon name={spec?.icon ?? 'list'} size={48} /></span>
        <div class="list-header__info">
          <span class="album-detail__kind">Liste intelligente</span>
          <h1 class="album-detail__title">{title}</h1>
          <div class="album-detail__meta">{pistes(tracks.length)}</div>
          <div class="album-detail__actions">
            {tracks.some((t) => t.hasFile) && (
              <fluent-button appearance="primary" onClick={() => (playingThis ? playback.togglePlayPause() : play(0))}>
                <Icon name={playingThis && playbackState.isPlaying ? 'pause' : 'play'} filled />
                <span class="button-text">{playingThis && playbackState.isPlaying ? 'Pause' : 'Écouter'}</span>
              </fluent-button>
            )}
            {isDynamic && (
              <fluent-button onClick={() => runMix(() => client.dynamicMixRefresh(), false)} title="Relancer un mix complet">
                <Icon name="arrow_clockwise" /><span class="button-text">Nouveau mix</span>
              </fluent-button>
            )}
          </div>
        </div>
      </header>
      {!tracks.some((t) => t.hasFile) && <p class="muted">Aucune piste jouable dans cette liste</p>}
      <div class="track-list">
        {tracks.map((track, index) => (
          <QueueTrackRow
            key={`${track.id}-${index}`}
            track={track}
            isCurrent={playingThis && playbackState.currentTrackId === track.id}
            isPlaying={playbackState.isPlaying}
            onPlay={() => play(playableIndex(tracks, index))}
            onFavorite={(t) => toggleTrackFavorite(t, setFavorite)}
            trailing={isDynamic && (
              <button type="button" class="icon-button" aria-label="Retirer du mix" title="Retirer du mix"
                onClick={() => runMix(() => client.dynamicMixRemove(track.id), true)}>
                <Icon name="dismiss" />
              </button>
            )}
            entries={queueEntries({
              onPlayNext: () => playback.enqueueTracks([track], { playNext: true }),
              onAddToQueue: () => playback.enqueueTracks([track]),
              onAddToPlaylist: () => addToPlaylist({ trackId: track.id }),
            })}
          />
        ))}
      </div>
    </div>
  );
}
