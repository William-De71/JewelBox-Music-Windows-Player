// Onglet Playlists (portage de ui/playlists.py) : listes intelligentes (dans
// l'ordre canonique, seulement celles que le serveur renvoie), puis « Mes
// playlists » avec création, renommage et suppression.

import { useEffect, useState } from 'preact/hooks';

import { useActions } from '../app/actions.jsx';
import { useApp, useSetting } from '../app/context.jsx';
import { formatDuration } from '../core/formats.js';
import { SMART_SPECS } from '../core/smartSpecs.js';
import { EmptyState, NoServer } from '../ui/EmptyState.jsx';
import { Icon } from '../ui/Icon.jsx';
import { MenuButton } from '../ui/Menu.jsx';
import { ConfirmDelete, TextPrompt } from '../ui/Prompts.jsx';

const pistes = (n) => (n === 1 ? '1 piste' : `${n} pistes`);

export function PlaylistsPage() {
  const { client, navigation } = useApp();
  const { openDialog, toast } = useActions();
  const [rankingSize] = useSetting('smart-ranking-size');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!client) return undefined;
    let cancelled = false;
    setError(null);
    Promise.all([client.smartPlaylists(rankingSize || undefined), client.playlists()])
      .then(([smart, playlists]) => {
        if (cancelled) return;
        const counts = new Map(smart.map((s) => [s.key, s.trackCount]));
        setData({
          smart: SMART_SPECS.filter((spec) => counts.has(spec.key)).map((spec) => ({ ...spec, trackCount: counts.get(spec.key) })),
          playlists,
        });
      })
      .catch((err) => !cancelled && setError(err.message));
    return () => { cancelled = true; };
  }, [client, rankingSize, attempt]);

  if (!client) return <div class="page"><h1 class="page__title">Playlists</h1><NoServer /></div>;

  const reload = () => setAttempt((n) => n + 1);

  const create = () => openDialog((close) => (
    <TextPrompt title="Créer une playlist" confirmLabel="Créer" onClose={close} onConfirm={async (name) => {
      try {
        const playlist = await client.createPlaylist(name);
        navigation.push({ kind: 'playlist', id: playlist.id });
      } catch {
        toast('Création impossible');
      }
    }} />
  ));

  const rename = (playlist) => openDialog((close) => (
    <TextPrompt title="Renommer la playlist" initial={playlist.name} confirmLabel="Enregistrer" onClose={close} onConfirm={async (name) => {
      try {
        await client.renamePlaylist(playlist.id, name);
        reload();
      } catch {
        toast('Renommage impossible');
      }
    }} />
  ));

  const remove = (playlist) => openDialog((close) => (
    <ConfirmDelete title="Supprimer la playlist ?" body={`« ${playlist.name} » sera définitivement supprimée.`} onClose={close} onConfirm={async () => {
      try {
        await client.deletePlaylist(playlist.id);
        reload();
      } catch {
        toast('Suppression impossible');
      }
    }} />
  ));

  let body;
  if (error) {
    body = (
      <EmptyState icon="plug_disconnected" title="Serveur injoignable" description={error}>
        <fluent-button onClick={reload}>Réessayer</fluent-button>
      </EmptyState>
    );
  } else if (!data) {
    body = <div class="page-loading"><fluent-spinner /><span>Chargement des playlists…</span></div>;
  } else {
    body = (
      <>
        {data.smart.length > 0 && (
          <section class="home-section">
            <h2 class="home-section__title">Listes intelligentes</h2>
            <div class="smart-grid">
              {data.smart.map((spec) => (
                <button key={spec.key} type="button" class="smart-tile" onClick={() => navigation.push({ kind: 'smart', id: spec.key })}>
                  <span class="smart-tile__icon"><Icon name={spec.icon} size={24} /></span>
                  <span class="smart-tile__text">
                    <span class="smart-tile__title">{spec.label}</span>
                    <span class="smart-tile__subtitle">{pistes(spec.trackCount)}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}
        <section class="home-section">
          <div class="home-section__header">
            <h2 class="home-section__title">Mes playlists</h2>
            <fluent-button appearance="subtle" onClick={create}>
              <Icon name="add" />
              <span class="button-text">Nouvelle playlist</span>
            </fluent-button>
          </div>
          {data.playlists.length === 0 ? (
            <EmptyState icon="list" title="Aucune playlist" description="Créez votre première playlist pour organiser vos morceaux préférés.">
              <fluent-button appearance="primary" onClick={create}>Nouvelle playlist</fluent-button>
            </EmptyState>
          ) : (
            <div class="list-rows">
              {data.playlists.map((playlist) => (
                <div key={playlist.id} class="list-row" role="button" tabIndex={0}
                  onClick={() => navigation.push({ kind: 'playlist', id: playlist.id })}
                  onKeyDown={(event) => event.key === 'Enter' && navigation.push({ kind: 'playlist', id: playlist.id })}>
                  <span class="list-row__icon"><Icon name="list" /></span>
                  <span class="list-row__text">
                    <span class="list-row__title">{playlist.name}</span>
                    <span class="list-row__subtitle">
                      {[pistes(playlist.trackCount), playlist.totalDurationSeconds ? formatDuration(playlist.totalDurationSeconds) : null].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span onClick={(event) => event.stopPropagation()}>
                    <MenuButton label="Options" entries={[
                      { label: 'Renommer', icon: 'rename', onSelect: () => rename(playlist) },
                      { label: 'Supprimer', icon: 'delete', onSelect: () => remove(playlist) },
                    ]} />
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </>
    );
  }

  return (
    <div class="page">
      <h1 class="page__title">Playlists</h1>
      {body}
    </div>
  );
}
