// Fiche album (portage de ui/album_detail.py) : pochette, titre, artiste,
// année · genre · label · durée, notes ; radio et « Ajouter » pour l'album
// entier ; pistes avec lecture, favori et menu. Un clic sur la piste en cours
// bascule lecture/pause au lieu de la relancer.

import { useEffect, useState } from 'preact/hooks';

import { useActions } from '../app/actions.jsx';
import { useApp, usePlaybackState } from '../app/context.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';
import { Cover } from '../ui/Cover.jsx';
import { Icon } from '../ui/Icon.jsx';
import { MenuButton } from '../ui/Menu.jsx';

function TrackRow({ album, track, isCurrent, isPlaying, onFavorite }) {
  const { playback } = useApp();
  const { addToPlaylist, queueEntries } = useActions();
  const playable = track.hasFile;

  const toggleOrPlay = () => {
    if (!playable) return;
    if (isCurrent) playback.togglePlayPause();
    else playback.playAlbum(album, track.id);
  };

  const playIcon = isCurrent && isPlaying ? 'pause' : 'play';
  const playLabel = isCurrent ? (isPlaying ? 'Pause' : 'Reprendre') : 'Lire';

  return (
    <div
      class={`track-row ${isCurrent ? 'track-row--current' : ''} ${playable ? '' : 'track-row--unavailable'}`}
      role="row"
      onClick={toggleOrPlay}
      onKeyDown={(event) => event.key === 'Enter' && toggleOrPlay()}
      tabIndex={playable ? 0 : -1}
    >
      <span class="track-row__number">
        <span class="track-row__position">{track.position}</span>
        {playable && (
          <button type="button" class="track-row__play" aria-label={playLabel} title={playLabel}
            onClick={(event) => { event.stopPropagation(); toggleOrPlay(); }}>
            <Icon name={playIcon} filled size={16} />
          </button>
        )}
      </span>
      <span class="track-row__title">{track.title}</span>
      <span class="track-row__duration">{track.duration || '0:00'}</span>
      <button
        type="button"
        class={`icon-button ${track.isFavorite ? 'icon-button--active' : ''}`}
        aria-pressed={track.isFavorite ? 'true' : 'false'}
        aria-label="Favori"
        title="Favori"
        onClick={(event) => { event.stopPropagation(); onFavorite(track); }}
      >
        <Icon name="heart" filled={track.isFavorite} />
      </button>
      <span class="track-row__menu" onClick={(event) => event.stopPropagation()}>
        {playable && (
          <MenuButton entries={queueEntries({
            onPlayNext: () => playback.enqueueAlbum(album, { trackId: track.id, playNext: true }),
            onAddToQueue: () => playback.enqueueAlbum(album, { trackId: track.id }),
            onAddToPlaylist: () => addToPlaylist({ trackId: track.id }),
          })} />
        )}
      </span>
    </div>
  );
}

export function AlbumDetailPage({ albumId }) {
  const { client, playback } = useApp();
  const { startRadio, addToPlaylist, queueEntries } = useActions();
  const playbackState = usePlaybackState();
  const [album, setAlbum] = useState(null);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!client) return undefined;
    let cancelled = false;
    setAlbum(null);
    setError(null);
    client.album(albumId)
      .then((result) => !cancelled && setAlbum(result))
      .catch((err) => !cancelled && setError(err.message));
    return () => { cancelled = true; };
  }, [client, albumId, attempt]);

  // Favori : bascule optimiste ici, reflétée dans la file si la piste y est.
  function toggleFavorite(track) {
    const value = !track.isFavorite;
    const flip = (v) => setAlbum((current) => current && ({
      ...current,
      tracks: current.tracks.map((t) => (t.id === track.id ? { ...t, isFavorite: v } : t)),
    }));
    flip(value);
    playback.favoriteChanged(track.id, value);
    client.setFavorite(track.id, value).catch(() => {
      flip(!value);
      playback.favoriteChanged(track.id, !value);
    });
  }

  if (error) {
    return (
      <EmptyState icon="error_circle" title="Album introuvable" description={error}>
        <fluent-button onClick={() => setAttempt((n) => n + 1)}>Réessayer</fluent-button>
      </EmptyState>
    );
  }
  if (!album) return <div class="page-loading"><fluent-spinner /></div>;

  const meta = [album.year, album.genre, album.label?.name, album.totalDuration].filter(Boolean).join(' · ');
  const hasPlayable = album.tracks.some((t) => t.hasFile);
  const firstPlayable = album.tracks.find((t) => t.hasFile);
  const playingThisAlbum = playbackState.sourceType === 'album' && playbackState.sourceId === String(album.id);

  return (
    <div class="page album-detail">
      <header class="album-detail__header">
        <Cover url={client.resolveCover(album.coverUrl)} size={232} alt={`Pochette de ${album.title}`} class="cover--shadow" />
        <div class="album-detail__info">
          <span class="album-detail__kind">Album</span>
          <h1 class="album-detail__title">{album.title}</h1>
          <div class="album-detail__artist">{album.artist.name}</div>
          {meta && <div class="album-detail__meta">{meta}</div>}
          {album.notes && <p class="album-detail__notes">{album.notes}</p>}
          {hasPlayable && (
            <div class="album-detail__actions">
              <fluent-button appearance="primary" onClick={() => (playingThisAlbum ? playback.togglePlayPause() : playback.playAlbum(album, firstPlayable.id))}>
                <Icon name={playingThisAlbum && playbackState.isPlaying ? 'pause' : 'play'} filled />
                <span class="button-text">{playingThisAlbum && playbackState.isPlaying ? 'Pause' : 'Lire'}</span>
              </fluent-button>
              <fluent-button onClick={() => startRadio({ albumId: album.id })} title="Radio autour de cet album">
                <Icon name="arrow_shuffle" />
                <span class="button-text">Radio</span>
              </fluent-button>
              <MenuButton
                appearance="outline"
                icon="add"
                text="Ajouter"
                label="Ajouter l’album à la file ou à une playlist"
                entries={queueEntries({
                  onPlayNext: () => playback.enqueueAlbum(album, { playNext: true }),
                  onAddToQueue: () => playback.enqueueAlbum(album),
                  onAddToPlaylist: () => addToPlaylist({ albumId: album.id }),
                })}
              />
            </div>
          )}
        </div>
      </header>
      <div class="track-list" role="table" aria-label="Pistes">
        {album.tracks.map((track) => (
          <TrackRow
            key={track.id}
            album={album}
            track={track}
            isCurrent={playbackState.currentTrackId === track.id}
            isPlaying={playbackState.isPlaying}
            onFavorite={toggleFavorite}
          />
        ))}
      </div>
    </div>
  );
}
