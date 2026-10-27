// Ligne de piste au format QueueTrack (recherche, playlists, listes
// intelligentes) : pochette, titre, artiste · album, durée, menu. Un clic
// sur la piste en cours bascule lecture/pause.

import { useApp } from '../app/context.jsx';
import { Cover } from './Cover.jsx';
import { Icon } from './Icon.jsx';
import { MenuButton } from './Menu.jsx';

// Indice d'une piste parmi les seules jouables : la session écarte d'abord
// les pistes sans fichier, puis applique l'indice de départ.
export function playableIndex(tracks, index) {
  return tracks.slice(0, index).filter((t) => t.hasFile).length;
}

export function QueueTrackRow({ track, isCurrent, isPlaying, onPlay, entries, number, onFavorite, trailing }) {
  const { client, playback } = useApp();
  const playable = track.hasFile;
  const activate = () => {
    if (!playable) return;
    if (isCurrent) playback.togglePlayPause();
    else onPlay();
  };
  const subtitle = [track.artistName, track.albumTitle].filter(Boolean).join(' · ');
  return (
    <div
      class={`track-row track-row--rich ${isCurrent ? 'track-row--current' : ''} ${playable ? '' : 'track-row--unavailable'}`}
      role="row"
      tabIndex={playable ? 0 : -1}
      onClick={activate}
      onKeyDown={(event) => event.key === 'Enter' && activate()}
    >
      <span class="track-row__cover">
        <Cover url={client?.resolveCover(track.coverUrl)} size={40} />
        {playable && (
          <span class="track-row__cover-play">
            <Icon name={isCurrent && isPlaying ? 'pause' : 'play'} filled size={16} />
          </span>
        )}
      </span>
      <span class="track-row__main">
        <span class="track-row__title">{number != null && <span class="track-row__rank">{number}</span>}{track.title}</span>
        <span class="track-row__subtitle">{subtitle}</span>
      </span>
      <span class="track-row__duration">{track.duration || ''}</span>
      <span class="track-row__actions" onClick={(event) => event.stopPropagation()}>
        {onFavorite && (
          <button type="button" class={`icon-button ${track.isFavorite ? 'icon-button--active' : ''}`}
            aria-pressed={track.isFavorite ? 'true' : 'false'} aria-label="Favori" title="Favori" onClick={() => onFavorite(track)}>
            <Icon name="heart" filled={track.isFavorite} />
          </button>
        )}
        {trailing}
        {playable && entries?.length > 0 && <MenuButton entries={entries} />}
      </span>
    </div>
  );
}
