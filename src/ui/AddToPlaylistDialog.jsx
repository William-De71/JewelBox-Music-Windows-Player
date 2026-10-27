// « Ajouter à une playlist » (portage de ui/add_to_playlist.py) : une piste
// (trackId) ou un album entier (albumId) ; « Nouvelle playlist… » en fin de
// liste crée la playlist puis y ajoute.

import { useEffect, useState } from 'preact/hooks';

import { Dialog } from './Dialog.jsx';
import { Icon } from './Icon.jsx';
import { TextInput } from './controls.jsx';

const pistes = (n) => (n === 1 ? '1 piste' : `${n} pistes`);

export function AddToPlaylistDialog({ client, trackId = null, albumId = null, onClose, onAdded }) {
  const [playlists, setPlaylists] = useState(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  useEffect(() => {
    client.playlists().then(setPlaylists).catch(() => setError(true));
  }, [client]);

  async function add(playlistId, playlistName) {
    setBusy(true);
    try {
      const result = trackId != null
        ? await client.addTrackToPlaylist(playlistId, trackId)
        : await client.addAlbumToPlaylist(playlistId, albumId);
      onClose();
      onAdded?.(playlistName, result.added);
    } catch {
      setBusy(false);
    }
  }

  async function createAndAdd() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      const playlist = await client.createPlaylist(trimmed);
      await add(playlist.id, playlist.name);
    } catch {
      setBusy(false);
    }
  }

  const title = trackId != null ? 'Ajouter à une playlist' : 'Ajouter l’album à une playlist';

  if (creating) {
    return (
      <Dialog
        title="Créer une playlist"
        onClose={onClose}
        footer={(
          <>
            <fluent-button appearance="primary" disabled={busy || !name.trim() || undefined} onClick={createAndAdd}>Créer et ajouter</fluent-button>
            <fluent-button onClick={() => setCreating(false)}>Annuler</fluent-button>
          </>
        )}
      >
        <TextInput value={name} label="Nom de la playlist" placeholder="Nom de la playlist" onInput={setName} onEnter={createAndAdd} autofocus />
      </Dialog>
    );
  }

  return (
    <Dialog title={title} onClose={onClose} footer={<fluent-button onClick={onClose}>Annuler</fluent-button>}>
      {error && <p class="muted">Playlists indisponibles.</p>}
      {!error && !playlists && <div class="dialog__loading"><fluent-spinner size="small" /></div>}
      {playlists && (
        <div class={`pick-list ${busy ? 'pick-list--busy' : ''}`}>
          {playlists.map((playlist) => (
            <button key={playlist.id} type="button" class="pick-list__item" disabled={busy} onClick={() => add(playlist.id, playlist.name)}>
              <Icon name="list" />
              <span class="pick-list__text">
                <span class="pick-list__title">{playlist.name}</span>
                <span class="pick-list__subtitle">{pistes(playlist.trackCount)}</span>
              </span>
            </button>
          ))}
          <button type="button" class="pick-list__item pick-list__item--accent" disabled={busy} onClick={() => setCreating(true)}>
            <Icon name="add" />
            <span class="pick-list__title">Nouvelle playlist…</span>
          </button>
        </div>
      )}
    </Dialog>
  );
}
