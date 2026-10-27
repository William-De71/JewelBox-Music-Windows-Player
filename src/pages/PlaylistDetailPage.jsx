// Fiche d'une playlist utilisateur (portage de ui/playlist_detail.py) :
// écouter, renommer, supprimer ; par entrée : monter, descendre, retirer.
// Une piste retirée quitte aussi la file si la playlist est en cours.

import { useEffect, useState } from 'preact/hooks';

import { useActions } from '../app/actions.jsx';
import { useApp, usePlaybackState } from '../app/context.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';
import { Icon } from '../ui/Icon.jsx';
import { ConfirmDelete, TextPrompt } from '../ui/Prompts.jsx';
import { playableIndex, QueueTrackRow } from '../ui/QueueTrackRow.jsx';

const pistes = (n) => (n === 1 ? '1 piste' : `${n} pistes`);

export function PlaylistDetailPage({ playlistId }) {
  const { client, playback, navigation } = useApp();
  const { openDialog, toast, addToPlaylist, queueEntries, toggleTrackFavorite } = useActions();
  const playbackState = usePlaybackState();
  const [playlist, setPlaylist] = useState(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!client) return undefined;
    let cancelled = false;
    setError(false);
    client.playlist(playlistId).then((p) => !cancelled && setPlaylist(p)).catch(() => !cancelled && setError(true));
    return () => { cancelled = true; };
  }, [client, playlistId, attempt]);

  if (error) {
    return (
      <EmptyState icon="error_circle" title="Playlist introuvable">
        <fluent-button onClick={() => setAttempt((n) => n + 1)}>Réessayer</fluent-button>
      </EmptyState>
    );
  }
  if (!playlist) return <div class="page-loading"><fluent-spinner /><span>Chargement de la playlist…</span></div>;

  const tracks = playlist.tracks;
  const play = (startIndex) => playback.playQueueTracks(tracks, { startIndex, reportPlaylistId: playlist.id, sourceName: playlist.name });

  // Mutation qui renvoie la playlist à jour ; la file suit les retraits.
  async function mutate(call) {
    try {
      const updated = await call();
      const before = new Set(playlist.tracks.map((t) => t.id));
      const after = new Set(updated.tracks.map((t) => t.id));
      setPlaylist(updated);
      const removed = [...before].filter((id) => !after.has(id));
      if (removed.length) playback.removeSourceTracks('playlist', playlist.id, removed);
    } catch { /* affichage inchangé */ }
  }

  function moveEntry(entryId, delta) {
    const entryIds = tracks.map((t) => t.entryId).filter((id) => id != null);
    const index = entryIds.indexOf(entryId);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= entryIds.length) return;
    [entryIds[index], entryIds[target]] = [entryIds[target], entryIds[index]];
    mutate(() => client.reorderPlaylist(playlist.id, entryIds));
  }

  const rename = () => openDialog((close) => (
    <TextPrompt title="Renommer la playlist" description="Nouveau nom de la playlist." initial={playlist.name} confirmLabel="Enregistrer" onClose={close}
      onConfirm={(name) => client.renamePlaylist(playlist.id, name).then(setPlaylist).catch(() => toast('Renommage impossible'))} />
  ));

  const remove = () => openDialog((close) => (
    <ConfirmDelete title="Supprimer la playlist ?" body={`« ${playlist.name} » sera définitivement supprimée.`} onClose={close}
      onConfirm={() => client.deletePlaylist(playlist.id).then(() => navigation.pop()).catch(() => toast('Suppression impossible'))} />
  ));

  const setFavorite = (trackId, value) => setPlaylist((current) => current && ({
    ...current, tracks: current.tracks.map((t) => (t.id === trackId ? { ...t, isFavorite: value } : t)),
  }));
  const playingThis = playbackState.sourceType === 'playlist' && playbackState.sourceId === String(playlist.id);

  return (
    <div class="page">
      <header class="list-header">
        <span class="list-header__art"><Icon name="list" size={48} /></span>
        <div class="list-header__info">
          <span class="album-detail__kind">Playlist</span>
          <h1 class="album-detail__title">{playlist.name}</h1>
          <div class="album-detail__meta">{pistes(tracks.length)}</div>
          <div class="album-detail__actions">
            {tracks.some((t) => t.hasFile) && (
              <fluent-button appearance="primary" onClick={() => (playingThis ? playback.togglePlayPause() : play(0))}>
                <Icon name={playingThis && playbackState.isPlaying ? 'pause' : 'play'} filled />
                <span class="button-text">{playingThis && playbackState.isPlaying ? 'Pause' : 'Écouter'}</span>
              </fluent-button>
            )}
            <fluent-button onClick={rename}><Icon name="rename" /><span class="button-text">Renommer</span></fluent-button>
            <fluent-button onClick={remove}><Icon name="delete" /><span class="button-text">Supprimer</span></fluent-button>
          </div>
        </div>
      </header>
      {!tracks.length && <p class="muted">Aucune piste dans cette playlist. Ajoutez-en depuis un album ou la recherche.</p>}
      <div class="track-list">
        {tracks.map((track, index) => {
          const entries = [
            ...queueEntries({
              onPlayNext: () => playback.enqueueTracks([track], { playNext: true }),
              onAddToQueue: () => playback.enqueueTracks([track]),
              onAddToPlaylist: () => addToPlaylist({ trackId: track.id }),
            }),
            null,
            index > 0 && track.entryId != null && { label: 'Monter', icon: 'arrow_up', onSelect: () => moveEntry(track.entryId, -1) },
            index < tracks.length - 1 && track.entryId != null && { label: 'Descendre', icon: 'arrow_down', onSelect: () => moveEntry(track.entryId, 1) },
            track.entryId != null && { label: 'Retirer de la playlist', icon: 'delete', onSelect: () => mutate(() => client.removePlaylistEntry(playlist.id, track.entryId)) },
          ].filter((entry) => entry !== false);
          return (
            <QueueTrackRow
              key={track.entryId ?? `${track.id}-${index}`}
              track={track}
              isCurrent={playingThis && playbackState.currentTrackId === track.id}
              isPlaying={playbackState.isPlaying}
              onPlay={() => play(playableIndex(tracks, index))}
              onFavorite={(t) => toggleTrackFavorite(t, setFavorite)}
              entries={entries}
            />
          );
        })}
      </div>
    </div>
  );
}
