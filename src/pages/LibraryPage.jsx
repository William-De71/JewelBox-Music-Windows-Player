// Bibliothèque (portage de ui/library.py) : toute la collection en un appel,
// filtrée localement (titre/artiste, genre, artiste choisi), vue Albums ou
// Artistes, tri par artiste ou par année, barre A–Z en tri par artiste.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';

import { useActions } from '../app/actions.jsx';
import { useApp, useSetting } from '../app/context.jsx';
import * as core from '../core/library.js';
import { Dropdown, TextInput } from '../ui/controls.jsx';
import { Cover } from '../ui/Cover.jsx';
import { EmptyState, NoServer } from '../ui/EmptyState.jsx';
import { Icon } from '../ui/Icon.jsx';

const SORT_OPTIONS = [
  { value: 'artist', label: 'Par artiste' },
  { value: 'year', label: 'Par année' },
];

const albumsLabel = (n) => (n === 1 ? '1 album' : `${n} albums`);

export function AlbumCard({ album, onOpen }) {
  const { client } = useApp();
  const { playAlbumById } = useActions();
  return (
    <div class="album-card" role="listitem">
      <button type="button" class="album-card__open" onClick={() => onOpen(album.id)} title={album.title}>
        <Cover url={client?.resolveCover(album.coverUrl)} alt="" />
        <span class="album-card__title">{album.title}</span>
        <span class="album-card__artist">{album.artist.name}</span>
      </button>
      {album.hasAudio && (
        <button type="button" class="album-card__play" aria-label={`Lire ${album.title}`} title="Lire l’album"
          onClick={() => playAlbumById(album.id)}>
          <Icon name="play" filled />
        </button>
      )}
    </div>
  );
}

export function LibraryPage() {
  const { client, navigation } = useApp();
  const { startRadio } = useActions();
  const [sortOrder, setSortOrder] = useSetting('sort-order');
  const [albums, setAlbums] = useState(null);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [view, setView] = useState('albums');
  const [genre, setGenre] = useState('');
  const [artist, setArtist] = useState(null);
  const gridRef = useRef(null);

  useEffect(() => {
    if (!client) return undefined;
    let cancelled = false;
    setAlbums(null);
    setError(null);
    client.albums({ page: 1, limit: core.FETCH_LIMIT, ...core.sortParams(sortOrder) })
      .then((page) => {
        if (cancelled) return;
        setAlbums(page.data);
        // Un rechargement repart de la collection entière.
        setArtist(null);
      })
      .catch((err) => !cancelled && setError(err.message));
    return () => { cancelled = true; };
  }, [client, sortOrder, attempt]);

  // Anti-rebond : inutile de refiltrer à chaque caractère d'une frappe rapide.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(draft), 120);
    return () => clearTimeout(timer);
  }, [draft]);

  const genreEntries = useMemo(() => core.genreEntries(albums ?? []), [albums]);
  // Le genre retenu peut disparaître après un rechargement.
  const activeGenre = genreEntries.some((g) => core.normalize(g.name) === core.normalize(genre)) ? genre : '';
  const genreAlbums = useMemo(
    () => (activeGenre ? core.albumsByGenre(albums ?? [], activeGenre) : albums ?? []),
    [albums, activeGenre],
  );
  const visible = useMemo(() => {
    const base = artist !== null ? core.albumsByArtist(genreAlbums, artist) : genreAlbums;
    return core.filterAlbums(base, query);
  }, [genreAlbums, artist, query]);
  const artistEntries = useMemo(
    () => core.filterArtistEntries(core.artistEntries(genreAlbums), query),
    [genreAlbums, query],
  );
  const initials = useMemo(() => core.availableInitials(visible), [visible]);

  if (!client) return <div class="page"><h1 class="page__title">Bibliothèque</h1><NoServer /></div>;

  // Le filtre texte servait à trouver l'artiste : on l'efface en le choisissant.
  function selectArtist(name) {
    setArtist(name);
    setDraft('');
    setQuery('');
    setView('albums');
  }

  function jumpTo(initial) {
    const index = core.firstIndexForInitial(visible, initial);
    gridRef.current?.children[index]?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  const openAlbum = (id) => navigation.push({ kind: 'album', id });
  const showInitials = view === 'albums' && sortOrder === 'artist' && artist === null && visible.length > 0;
  const countLabel = visible.length === genreAlbums.length
    ? albumsLabel(genreAlbums.length)
    : `${visible.length} sur ${genreAlbums.length} albums`;

  let body;
  if (error) {
    body = (
      <EmptyState icon="plug_disconnected" title="Serveur injoignable" description={error}>
        <fluent-button onClick={() => setAttempt((n) => n + 1)}>Réessayer</fluent-button>
      </EmptyState>
    );
  } else if (!albums) {
    body = <div class="page-loading"><fluent-spinner /><span>Chargement de la bibliothèque…</span></div>;
  } else if (!albums.length) {
    body = (
      <EmptyState icon="album" title="Bibliothèque vide" description="Aucun album avec fichiers audio sur ce serveur pour le moment.">
        <fluent-button onClick={() => setAttempt((n) => n + 1)}>Actualiser</fluent-button>
      </EmptyState>
    );
  } else if (view === 'artists') {
    body = (
      <div class="artist-list" role="list">
        {artistEntries.map((entry) => (
          <button key={entry.name} type="button" class="artist-row" role="listitem" onClick={() => selectArtist(entry.name)}>
            <span class="artist-row__avatar">{(entry.name || '?').charAt(0).toUpperCase()}</span>
            <span class="artist-row__name">{entry.name || 'Artiste inconnu'}</span>
            <span class="artist-row__count">{albumsLabel(entry.count)}</span>
          </button>
        ))}
      </div>
    );
  } else if (!visible.length) {
    body = <EmptyState icon="search" title="Aucun résultat" description={`Aucun album ne correspond à « ${query} ».`} />;
  } else {
    body = (
      <div class="album-grid" role="list" ref={gridRef}>
        {visible.map((album) => <AlbumCard key={album.id} album={album} onOpen={openAlbum} />)}
      </div>
    );
  }

  const artistRadioId = artist !== null ? albums?.find((a) => (a.artist.name ?? '') === artist)?.artist.id : null;

  return (
    <div class="page">
      <h1 class="page__title">Bibliothèque</h1>
      {albums?.length > 0 && (
        <div class="toolbar">
          <div class="segmented" role="tablist" aria-label="Vue">
            {[['albums', 'Albums'], ['artists', 'Artistes']].map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={view === key ? 'true' : 'false'}
                class={`segmented__item ${view === key ? 'segmented__item--active' : ''}`}
                onClick={() => setView(key)}>{label}</button>
            ))}
          </div>
          <div class="toolbar__search">
            <TextInput value={draft} onInput={setDraft} label="Filtrer" placeholder="Filtrer par titre ou artiste…">
              <span slot="start"><Icon name="search" size={16} /></span>
            </TextInput>
          </div>
          {genreEntries.length > 0 && (
            <Dropdown
              label="Filtrer par genre"
              value={activeGenre}
              options={[{ value: '', label: 'Tous les genres' }, ...genreEntries.map((g) => ({ value: g.name, label: `${g.name} (${g.count})` }))]}
              onChange={setGenre}
            />
          )}
          <Dropdown label="Tri de la bibliothèque" value={sortOrder} options={SORT_OPTIONS} onChange={setSortOrder} />
        </div>
      )}
      {artist !== null && (
        <div class="artist-banner">
          <span class="artist-banner__name">{artist || 'Artiste inconnu'}</span>
          {artistRadioId != null && (
            <fluent-button appearance="subtle" onClick={() => startRadio({ artistId: artistRadioId })} title="Radio de cet artiste">
              <Icon name="arrow_shuffle" />
              <span class="button-text">Radio</span>
            </fluent-button>
          )}
          <fluent-button appearance="subtle" icon-only aria-label="Voir tous les artistes" title="Voir tous les artistes" onClick={() => selectArtist(null)}>
            <Icon name="dismiss" />
          </fluent-button>
        </div>
      )}
      {showInitials && (
        <div class="initials" aria-label="Aller aux artistes par initiale">
          {core.INITIALS.map((initial) => (
            <button key={initial} type="button" class="initials__item" disabled={!initials.has(initial)}
              title={`Aller aux artistes en « ${initial} »`} onClick={() => jumpTo(initial)}>{initial}</button>
          ))}
        </div>
      )}
      {albums?.length > 0 && (
        <div class="count-label">{view === 'artists' ? (artistEntries.length === 1 ? '1 artiste' : `${artistEntries.length} artistes`) : countLabel}</div>
      )}
      {body}
    </div>
  );
}
