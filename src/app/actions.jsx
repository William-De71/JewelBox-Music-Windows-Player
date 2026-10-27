// Actions partagées par plusieurs pages : radio, ajout à une playlist,
// lecture d'un album depuis une carte (les cartes n'ont pas les pistes).

import { resumeStart } from '../core/queueSync.js';
import { smartSpec } from '../core/smartSpecs.js';
import { AddToPlaylistDialog } from '../ui/AddToPlaylistDialog.jsx';
import { useApp } from './context.jsx';
import { useOverlays } from './overlays.jsx';

export function useActions() {
  const { client, playback, settings } = useApp();
  const { toast, openDialog } = useOverlays();

  // Radio autour d'un album ou d'un artiste (serveur >= 1.16) : un tiers de
  // l'artiste, le reste d'artistes du même genre, ordre aléatoire.
  async function startRadio({ albumId, artistId }) {
    if (!client) return;
    try {
      const radio = await client.radio({ albumId, artistId });
      if (radio.tracks.length) playback.playQueueTracks(radio.tracks, { sourceName: `Radio · ${radio.seedName}` });
    } catch (error) {
      toast(error.status === 404 ? 'Radio indisponible : mettez le serveur à jour' : 'Radio indisponible');
    }
  }

  function addToPlaylist({ trackId = null, albumId = null }) {
    if (!client) return;
    openDialog((close) => (
      <AddToPlaylistDialog
        client={client}
        trackId={trackId}
        albumId={albumId}
        onClose={close}
        onAdded={(name, added) => toast(albumId != null
          ? (added === 1 ? `1 piste ajoutée à « ${name} »` : `${added} pistes ajoutées à « ${name} »`)
          : `Ajoutée à « ${name} »`)}
      />
    ));
  }

  async function playAlbumById(albumId) {
    if (!client) return;
    try {
      const album = await client.album(albumId);
      const first = album.tracks.find((t) => t.hasFile);
      if (first) playback.playAlbum(album, first.id);
    } catch { /* best-effort, comme le reste de l'app */ }
  }

  // Liste intelligente lancée depuis une tuile (accueil, onglet Playlists).
  async function playSmart(key) {
    if (!client) return;
    try {
      const smart = await client.smartPlaylist(key, settings.get('smart-ranking-size') || undefined);
      playback.playQueueTracks(smart.tracks, { reportSmartKey: key, sourceName: smartSpec(key)?.label ?? key });
    } catch { /* best-effort */ }
  }

  // Charge la file d'un autre appareil et la lance à la même piste, à la même
  // position. Rend 'ok', 'empty' (rien de jouable) ou 'error'.
  async function resumeDevice(device) {
    if (!client) return 'error';
    let queue;
    try {
      queue = await client.deviceQueue(device.deviceId);
    } catch {
      return 'error';
    }
    const start = resumeStart(queue.tracks.map((t) => t.hasFile), queue.currentIndex);
    if (!start) return 'empty';
    playback.playQueueTracks(queue.tracks, {
      startIndex: start.index,
      sourceName: queue.sourceLabel || `Repris de ${device.deviceLabel || 'un autre appareil'}`,
      startPosition: start.sameTrack ? queue.positionSec : 0,
    });
    return 'ok';
  }

  // Favori d'une piste affichée dans une liste : bascule optimiste via
  // apply(trackId, valeur), reflétée dans la file, annulée sur refus.
  function toggleTrackFavorite(track, apply) {
    if (!client) return;
    const value = !track.isFavorite;
    apply(track.id, value);
    playback.favoriteChanged(track.id, value);
    client.setFavorite(track.id, value).catch(() => {
      apply(track.id, !value);
      playback.favoriteChanged(track.id, !value);
    });
  }

  function enqueued(playNext) {
    toast(playNext ? 'Sera lu juste après' : 'Ajouté à la file d’attente');
  }

  // Entrées « Lire ensuite / Ajouter à la file / Ajouter à une playlist… ».
  function queueEntries({ onPlayNext, onAddToQueue, onAddToPlaylist }) {
    return [
      { label: 'Lire ensuite', icon: 'next', onSelect: () => { onPlayNext(); enqueued(true); } },
      { label: 'Ajouter à la file d’attente', icon: 'list', onSelect: () => { onAddToQueue(); enqueued(false); } },
      null,
      { label: 'Ajouter à une playlist…', icon: 'add', onSelect: onAddToPlaylist },
    ];
  }

  return { startRadio, addToPlaylist, playAlbumById, playSmart, resumeDevice, queueEntries, toggleTrackFavorite, toast, openDialog };
}
