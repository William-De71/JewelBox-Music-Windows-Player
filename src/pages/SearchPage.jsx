// Recherche (portage de ui/search.py) : GET /api/player/search dès deux
// caractères (serveur >= 1.7), temporisé ; albums en grille puis pistes. Un
// clic sur une piste lance toute la liste trouvée à partir de celle-ci.

import { useEffect, useState } from 'preact/hooks';

import { useActions } from '../app/actions.jsx';
import { useApp, usePlaybackState } from '../app/context.jsx';
import { TextInput } from '../ui/controls.jsx';
import { EmptyState, NoServer } from '../ui/EmptyState.jsx';
import { Icon } from '../ui/Icon.jsx';
import { playableIndex, QueueTrackRow } from '../ui/QueueTrackRow.jsx';
import { AlbumCard } from './LibraryPage.jsx';

const MIN_QUERY = 2;
const DEBOUNCE_MS = 350;

// La saisie survit au changement d'onglet, comme le champ du bureau.
let lastQuery = '';

export function SearchPage() {
  const { client, navigation, playback } = useApp();
  const { addToPlaylist, queueEntries, toggleTrackFavorite } = useActions();
  const playbackState = usePlaybackState();
  const [draft, setDraft] = useState(lastQuery);
  const [results, setResults] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const setFavorite = (trackId, value) => setResults((current) => current && ({
    ...current, tracks: current.tracks.map((t) => (t.id === trackId ? { ...t, isFavorite: value } : t)),
  }));

  useEffect(() => {
    lastQuery = draft;
    const query = draft.trim();
    if (!client || query.length < MIN_QUERY) {
      setStatus('idle');
      setResults(null);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setStatus('loading');
      client.search(query)
        .then((found) => {
          if (cancelled) return;
          setResults(found);
          setStatus(found.albums.length || found.tracks.length ? 'results' : 'empty');
        })
        .catch((err) => {
          if (cancelled) return;
          setError(err.message);
          setStatus('error');
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [client, draft]);

  if (!client) return <div class="page"><h1 class="page__title">Recherche</h1><NoServer /></div>;

  const tracks = results?.tracks ?? [];
  let body = null;
  if (status === 'idle') {
    body = <EmptyState icon="search" title="Rechercher dans votre bibliothèque" description="Tapez au moins deux caractères pour trouver un album, un artiste ou un titre." />;
  } else if (status === 'loading' && !results) {
    body = <div class="page-loading"><fluent-spinner /><span>Recherche en cours…</span></div>;
  } else if (status === 'empty') {
    body = <EmptyState icon="search" title="Aucun résultat" description={`Rien ne correspond à « ${draft.trim()} ».`} />;
  } else if (status === 'error') {
    body = <EmptyState icon="error_circle" title="Recherche impossible" description={error} />;
  } else if (results) {
    body = (
      <>
        {results.albums.length > 0 && (
          <section class="home-section">
            <h2 class="home-section__title">Albums</h2>
            <div class="album-grid">
              {results.albums.map((album) => <AlbumCard key={album.id} album={album} onOpen={(id) => navigation.push({ kind: 'album', id })} />)}
            </div>
          </section>
        )}
        {tracks.length > 0 && (
          <section class="home-section">
            <h2 class="home-section__title">Pistes</h2>
            <div class="track-list">
              {tracks.map((track, index) => (
                <QueueTrackRow
                  key={`${track.id}-${index}`}
                  track={track}
                  isCurrent={playbackState.currentTrackId === track.id}
                  isPlaying={playbackState.isPlaying}
                  onPlay={() => playback.playQueueTracks(tracks, { startIndex: playableIndex(tracks, index) })}
                  onFavorite={(t) => toggleTrackFavorite(t, setFavorite)}
                  entries={queueEntries({
                    onPlayNext: () => playback.enqueueTracks([track], { playNext: true }),
                    onAddToQueue: () => playback.enqueueTracks([track]),
                    onAddToPlaylist: () => addToPlaylist({ trackId: track.id }),
                  })}
                />
              ))}
            </div>
          </section>
        )}
      </>
    );
  }

  return (
    <div class="page">
      <h1 class="page__title">Recherche</h1>
      <div class="search-field">
        <TextInput value={draft} onInput={setDraft} label="Rechercher" placeholder="Rechercher un album, un artiste, un titre…" autofocus>
          <span slot="start"><Icon name="search" size={16} /></span>
        </TextInput>
      </div>
      {body}
    </div>
  );
}
