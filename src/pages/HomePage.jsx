// Accueil (portage de ui/home.py) : carte « Reprendre depuis… » (la file
// récente d'un autre appareil), « Récemment écouté » (8 albums, playlists ou
// listes intelligentes), « Derniers ajouts » (10 albums) et « Suggestions ».

import { useEffect, useRef, useState } from 'preact/hooks';

import { useActions } from '../app/actions.jsx';
import { useApp, useSetting } from '../app/context.jsx';
import { deviceSummary, pickResumable } from '../core/queueSync.js';
import { smartSpec } from '../core/smartSpecs.js';
import { Cover } from '../ui/Cover.jsx';
import { EmptyState, NoServer } from '../ui/EmptyState.jsx';
import { Icon } from '../ui/Icon.jsx';
import { AlbumCard } from './LibraryPage.jsx';

const LATEST_COUNT = 10;
const pistes = (n) => (n === 1 ? '1 piste' : `${n} pistes`);

// Écartées par « Ignorer » le temps de la session ; un appareil revient dès
// qu'il a rejoué (sa date change).
const dismissedResumes = new Set();

function ResumeCard({ refreshKey }) {
  const { client } = useApp();
  const { resumeDevice, toast } = useActions();
  const [device, setDevice] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let devices = [];
      try {
        devices = await client.queueDevices();
      } catch { /* serveur sans file par appareil, ou injoignable */ }
      let own = null;
      if (devices.length) {
        try {
          own = (await client.ownQueue()).updatedAt;
        } catch { /* pas encore de file ici */ }
      }
      if (!cancelled) setDevice(pickResumable(devices, Date.now() / 1000, dismissedResumes, own));
    })();
    return () => { cancelled = true; };
  }, [client, refreshKey]);

  if (!device) return null;
  const dismiss = () => {
    dismissedResumes.add(`${device.deviceId}|${device.updatedAt}`);
    setDevice(null);
  };
  const { title, subtitle } = deviceSummary(device);
  const isPhone = (device.deviceLabel ?? '').toLowerCase().includes('android');

  return (
    <div class="resume-card">
      <span class="resume-card__icon"><Icon name="phone_laptop" size={24} /></span>
      <span class="resume-card__text">
        <span class="resume-card__kicker">{isPhone ? 'Reprendre depuis le téléphone' : 'Reprendre depuis un autre appareil'}</span>
        <span class="resume-card__title">{title}</span>
        <span class="resume-card__subtitle">{subtitle}</span>
      </span>
      <fluent-button appearance="primary" disabled={busy || undefined} onClick={async () => {
        setBusy(true);
        const outcome = await resumeDevice(device);
        setBusy(false);
        if (outcome !== 'error') dismiss();
        if (outcome === 'empty') toast('Aucune piste jouable dans cette file');
      }}>
        <Icon name="play" filled />
        <span class="button-text">Reprendre</span>
      </fluent-button>
      <button type="button" class="icon-button" aria-label="Ignorer" title="Ignorer" onClick={dismiss}>
        <Icon name="dismiss" />
      </button>
    </div>
  );
}

function RecentTile({ item }) {
  const { client, navigation } = useApp();
  const { playAlbumById, playSmart } = useActions();
  const { album, playlist, smart } = item;
  const spec = smart ? smartSpec(smart.key) : null;

  let title;
  let subtitle;
  let coverUrl = null;
  let open;
  let play = null;
  if (album) {
    title = album.title;
    subtitle = album.artist.name;
    coverUrl = client.resolveCover(album.coverUrl);
    open = () => navigation.push({ kind: 'album', id: album.id });
    if (album.hasAudio) play = () => playAlbumById(album.id);
  } else if (playlist) {
    title = playlist.name;
    subtitle = pistes(playlist.trackCount);
    coverUrl = client.resolveCover(playlist.coverUrl);
    open = () => navigation.push({ kind: 'playlist', id: playlist.id });
  } else {
    title = spec?.label ?? smart.key;
    subtitle = pistes(smart.trackCount);
    open = () => navigation.push({ kind: 'smart', id: smart.key });
    if (smart.trackCount > 0) play = () => playSmart(smart.key);
  }

  return (
    <div class="recent-tile">
      <button type="button" class="recent-tile__open" onClick={open} title={title}>
        {smart
          ? <span class="cover smart-cover" style={{ width: '56px', height: '56px' }}><Icon name={spec?.icon ?? 'list'} size={28} /></span>
          : <Cover url={coverUrl} size={56} />}
        <span class="recent-tile__text">
          <span class="recent-tile__title">{title}</span>
          <span class="recent-tile__subtitle">{subtitle}</span>
        </span>
      </button>
      {play && (
        <button type="button" class="recent-tile__play" aria-label={`Lire ${title}`} title="Lire" onClick={play}>
          <Icon name="play" filled size={16} />
        </button>
      )}
    </div>
  );
}

function Section({ title, action, children }) {
  return (
    <section class="home-section">
      {action
        ? <div class="home-section__header"><h2 class="home-section__title">{title}</h2>{action}</div>
        : <h2 class="home-section__title">{title}</h2>}
      {children}
    </section>
  );
}

export function HomePage() {
  const { client, navigation, playback } = useApp();
  const { toast } = useActions();
  const [rankingSize] = useSetting('smart-ranking-size');
  const [data, setData] = useState(null);
  const [redrawing, setRedrawing] = useState(false);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [resumeKey, setResumeKey] = useState(0);
  const lastSource = useRef(null);

  useEffect(() => {
    if (!client) return undefined;
    let cancelled = false;
    setError(null);
    (async () => {
      try {
        const home = await client.home(rankingSize || undefined);
        // Derniers albums enregistrés (best-effort : la ligne reste masquée).
        let latest = [];
        try {
          latest = (await client.albums({ page: 1, limit: LATEST_COUNT, sort: 'created_at', order: 'desc' })).data;
        } catch { /* ligne masquée */ }
        if (cancelled) return;
        const recent = home.recent.filter((item) => item.album || item.playlist || item.smart).slice(0, 8);
        setData({ recent, latest, suggestions: home.suggestions });
      } catch (err) {
        if (!cancelled) setError(err);
      }
    })();
    return () => { cancelled = true; };
  }, [client, rankingSize, attempt]);

  // Une nouvelle file a démarré : les récents ont changé.
  useEffect(() => playback.subscribe((state) => {
    const source = state.hasItem ? `${state.sourceType}:${state.sourceId}` : null;
    if (lastSource.current !== null && source !== null && source !== lastSource.current) setAttempt((n) => n + 1);
    lastSource.current = source;
  }), [playback]);

  // Fenêtre revenue au premier plan : on a pu écouter sur le téléphone.
  useEffect(() => {
    const onFocus = () => setResumeKey((n) => n + 1);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  // Bouton « Nouvelles suggestions » : le serveur refait le tirage du jour.
  const redrawSuggestions = async () => {
    setRedrawing(true);
    try {
      const suggestions = await client.refreshSuggestions();
      setData((current) => current && { ...current, suggestions });
    } catch (err) {
      toast(err.status === 404 ? 'Le serveur JewelBox 1.21 ou plus récent est nécessaire' : 'Impossible de renouveler les suggestions');
    } finally {
      setRedrawing(false);
    }
  };

  if (!client) return <div class="page"><h1 class="page__title">Accueil</h1><NoServer /></div>;

  let body;
  if (error) {
    body = error.status === 404
      ? (
        <EmptyState icon="server" title="Serveur trop ancien" description="L’accueil nécessite un serveur JewelBox 1.9 ou plus récent.">
          <fluent-button onClick={() => setAttempt((n) => n + 1)}>Réessayer</fluent-button>
        </EmptyState>
      ) : (
        <EmptyState icon="plug_disconnected" title="Serveur injoignable" description={error.message}>
          <fluent-button onClick={() => setAttempt((n) => n + 1)}>Réessayer</fluent-button>
        </EmptyState>
      );
  } else if (!data) {
    body = <div class="page-loading"><fluent-spinner /><span>Chargement de l’accueil…</span></div>;
  } else if (!data.recent.length && !data.latest.length && !data.suggestions.length) {
    body = (
      <EmptyState icon="home" title="Rien à afficher pour l’instant" description="Vos écoutes récentes et des suggestions apparaîtront ici une fois la musique lancée.">
        <fluent-button onClick={() => setAttempt((n) => n + 1)}>Actualiser</fluent-button>
      </EmptyState>
    );
  } else {
    const openAlbum = (id) => navigation.push({ kind: 'album', id });
    body = (
      <>
        {data.recent.length > 0 && (
          <Section title="Récemment écouté">
            <div class="recent-grid">{data.recent.map((item, i) => <RecentTile key={i} item={item} />)}</div>
          </Section>
        )}
        {data.latest.length > 0 && (
          <Section title="Derniers ajouts">
            <div class="album-row">{data.latest.map((album) => <AlbumCard key={album.id} album={album} onOpen={openAlbum} />)}</div>
          </Section>
        )}
        {data.suggestions.length > 0 && (
          <Section
            title="Suggestions"
            action={(
              <fluent-button appearance="subtle" icon-only aria-label="Nouvelles suggestions" title="Nouvelles suggestions"
                disabled={redrawing || undefined} onClick={redrawSuggestions}>
                <Icon name="arrow_clockwise" />
              </fluent-button>
            )}
          >
            <div class="album-grid">{data.suggestions.map((album) => <AlbumCard key={album.id} album={album} onOpen={openAlbum} />)}</div>
          </Section>
        )}
      </>
    );
  }

  return (
    <div class="page">
      <h1 class="page__title">Accueil</h1>
      <ResumeCard refreshKey={`${attempt}-${resumeKey}`} />
      {body}
    </div>
  );
}
