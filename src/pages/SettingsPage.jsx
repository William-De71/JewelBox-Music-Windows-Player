// Paramètres : serveur JewelBox, lecture, à propos. Mêmes réglages et même
// logique que le dialogue Préférences du lecteur bureau : « Enregistrer »
// persiste l'URL normalisée tout de suite (même serveur éteint), puis tente
// en best-effort de récupérer server_id ; « Tester » interroge /api/health
// sans rien persister.

import { useEffect, useState } from 'preact/hooks';

import { useOverlays } from '../app/overlays.jsx';
import { ShortcutsDialog } from '../ui/ShortcutsDialog.jsx';

import { ApiError, JewelBoxClient } from '../api/client.js';
import { useApp, useSetting } from '../app/context.jsx';
import { TRANSITION_FADE_CHOICES } from '../core/transitionFade.js';
import { Dropdown, SettingCard, Switch, TextInput } from '../ui/controls.jsx';
import { Dialog } from '../ui/Dialog.jsx';
import { Icon } from '../ui/Icon.jsx';

const RANKING_SIZES = [50, 100, 200, 500, 1000];

const REPLAYGAIN_CHOICES = [
  { value: 'off', label: 'Désactivée' },
  { value: 'track', label: 'Par piste' },
  { value: 'album', label: 'Par album' },
];

const VERSION = import.meta.env.VITE_APP_VERSION ?? 'dev';

function ServerSection() {
  const { deviceId } = useApp();
  const [savedUrl, setSavedUrl] = useSetting('server-url');
  const [, setServerId] = useSetting('server-id');
  const [draft, setDraft] = useState(savedUrl);
  const [status, setStatus] = useState({ text: 'Non testée', error: false });
  const [busy, setBusy] = useState(false);

  function clientOrError() {
    try {
      return new JewelBoxClient(draft, { deviceId });
    } catch (error) {
      setStatus({ text: error.message, error: true });
      return null;
    }
  }

  async function test() {
    const client = clientOrError();
    if (!client) return;
    setBusy(true);
    try {
      setStatus(await client.health()
        ? { text: 'Connecté — le serveur répond.', error: false }
        : { text: 'Le serveur répond, mais pas comme un JewelBox.', error: true });
    } catch (error) {
      setStatus({ text: `Échec : ${error.message}`, error: true });
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    const client = clientOrError();
    if (!client) return;
    setSavedUrl(client.baseUrl);
    setDraft(client.baseUrl);
    setBusy(true);
    try {
      const info = await client.serverInfo();
      if (info.isJewelbox && info.serverId.trim()) {
        setServerId(info.serverId);
        setStatus({ text: `Enregistré — ${info.name || 'JewelBox'} (v${info.version || '?'}).`, error: false });
      } else {
        setStatus({ text: 'Adresse enregistrée, mais ce ne semble pas être un serveur JewelBox.', error: true });
      }
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      setStatus({ text: 'Adresse enregistrée. Serveur injoignable pour le moment.', error: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section class="settings-section">
      <h2 class="settings-section__title">Serveur</h2>
      <div class="setting-card setting-card--stacked">
        <span class="setting-card__icon"><Icon name="server" /></span>
        <div class="setting-card__text">
          <div class="setting-card__title">Serveur JewelBox</div>
          <div class="setting-card__description">
            Adresse du serveur sur le réseau local, ex. 192.168.1.10:3001 (http:// est ajouté si absent).
          </div>
          <div class="server-form">
            <TextInput
              value={draft}
              label="Adresse du serveur"
              placeholder="192.168.1.10:3001"
              onInput={(value) => { setDraft(value); setStatus({ text: 'Non testée', error: false }); }}
              onEnter={save}
            />
            <fluent-button appearance="primary" disabled={busy || undefined} onClick={save}>Enregistrer</fluent-button>
            <fluent-button disabled={busy || undefined} onClick={test}>Tester</fluent-button>
          </div>
          <div class={`server-status ${status.error ? 'server-status--error' : ''}`} role="status">
            {busy ? <fluent-spinner size="tiny" /> : <Icon name={status.error ? 'error_circle' : 'checkmark_circle'} size={16} />}
            <span>{status.text}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function SwitchSetting({ settingKey, icon, title, description }) {
  const [value, setValue] = useSetting(settingKey);
  return (
    <SettingCard icon={<Icon name={icon} />} title={title} description={description}>
      <span class="switch-state">{value ? 'Activé' : 'Désactivé'}</span>
      <Switch checked={value} onChange={setValue} label={title} />
    </SettingCard>
  );
}

function PlaybackSection() {
  const [ranking, setRanking] = useSetting('smart-ranking-size');
  const [replaygain, setReplaygain] = useSetting('replaygain');
  const [fade, setFade] = useSetting('transition-fade');

  // Valeur hors liste (fichier édité à la main) : affichée telle quelle.
  const rankingSizes = RANKING_SIZES.includes(ranking) ? RANKING_SIZES : [...RANKING_SIZES, ranking];

  return (
    <section class="settings-section">
      <h2 class="settings-section__title">Lecture</h2>
      <SwitchSetting
        settingKey="background-playback" icon="music_note_2" title="Lecture en arrière-plan"
        description="Fermer la fenêtre pendant une lecture la masque : la musique continue, pilotable depuis les contrôles multimédias de Windows et l’icône de la zone de notification."
      />
      <SwitchSetting
        settingKey="remote-control" icon="phone_laptop" title="Autoriser le contrôle à distance"
        description="Un autre client du serveur, comme Gladys, peut piloter ce lecteur."
      />
      <SwitchSetting
        settingKey="notify-track-change" icon="info" title="Notifier le changement de piste"
        description="Quand la fenêtre n’est pas au premier plan."
      />
      <SettingCard
        icon={<Icon name="list" />} title="Taille des classements"
        description="Pistes des listes Ajouts récents, Écoutées récemment et Les plus écoutées."
      >
        <Dropdown
          label="Taille des classements" value={String(ranking)}
          options={rankingSizes.map((n) => ({ value: String(n), label: String(n) }))}
          onChange={(next) => setRanking(Number(next))}
        />
      </SettingCard>
      <SettingCard
        icon={<Icon name="speaker_2" />} title="Normalisation du volume"
        description="D’après les tags ReplayGain des fichiers (ajoutés par JewelBox Ripper). Par album, chaque disque garde ses nuances."
      >
        <Dropdown label="Normalisation du volume" value={replaygain} options={REPLAYGAIN_CHOICES} onChange={setReplaygain} />
      </SettingCard>
      <SettingCard
        icon={<Icon name="arrow_shuffle" />} title="Fondu entre les morceaux"
        description="Le son baisse à la fin d’un morceau et remonte au début du suivant. Jamais entre deux pistes qui se suivent sur un même album."
      >
        <Dropdown
          label="Fondu entre les morceaux" value={String(fade)}
          options={TRANSITION_FADE_CHOICES.map((s) => ({ value: String(s), label: s === 0 ? 'Désactivé' : `${s} secondes` }))}
          onChange={(next) => setFade(Number(next))}
        />
      </SettingCard>
      <MixBlocklistCard />
    </section>
  );
}

// Liste noire du mix dynamique (« Ne plus jamais jouer »), gardée par le
// serveur pour tous les appareils : combien de titres, et de quoi la vider.
function MixBlocklistCard() {
  const { client } = useApp();
  const { openDialog, toast } = useOverlays();
  const [count, setCount] = useState(null);

  useEffect(() => {
    if (!client) return undefined;
    let cancelled = false;
    client.dynamicMixBlocked()
      .then((tracks) => !cancelled && setCount(tracks.length))
      .catch(() => !cancelled && setCount(null));
    return () => { cancelled = true; };
  }, [client]);

  async function clear() {
    try {
      await client.dynamicMixClearBlocked();
      setCount(0);
      toast('Liste noire vidée');
    } catch {
      toast('Impossible de vider la liste noire');
    }
  }

  const confirm = () => openDialog((close) => (
    <Dialog
      title="Vider la liste noire ?"
      onClose={close}
      footer={(
        <>
          <fluent-button appearance="primary" class="button--danger" onClick={() => { close(); clear(); }}>Vider</fluent-button>
          <fluent-button onClick={close}>Annuler</fluent-button>
        </>
      )}
    >
      <p class="dialog__description">Tous les titres exclus pourront de nouveau être tirés dans le mix dynamique.</p>
    </Dialog>
  ));

  let status = 'Indisponible (serveur 1.22 ou plus requis)';
  if (count === 0) status = 'Aucun titre exclu';
  else if (count) status = count === 1 ? '1 titre exclu' : `${count} titres exclus`;

  return (
    <SettingCard
      icon={<Icon name="prohibited" />} title="Mix dynamique : titres exclus"
      description="Les titres marqués « Ne plus jamais jouer » ne sont plus tirés dans le mix, sur tous vos appareils."
    >
      <span class="muted">{status}</span>
      <fluent-button disabled={!count || undefined} onClick={confirm}>Vider</fluent-button>
    </SettingCard>
  );
}

function AboutSection() {
  const { deviceLabel } = useApp();
  const { openDialog } = useOverlays();
  return (
    <section class="settings-section">
      <h2 class="settings-section__title">À propos</h2>
      <SettingCard
        icon={<img src="/jewelbox.svg" alt="" width="20" height="20" />}
        title="JewelBox Music Player"
        description={`Client de streaming pour le serveur JewelBox Music Library · version ${VERSION} · licence MIT`}
      >
        <span class="muted">© William Deren</span>
      </SettingCard>
      <SettingCard icon={<Icon name="phone_laptop" />} title="Nom de cet appareil"
        description="Tel que le voient les autres lecteurs JewelBox et Gladys.">
        <span class="muted">{deviceLabel}</span>
      </SettingCard>
      <SettingCard icon={<Icon name="keyboard" />} title="Raccourcis clavier" description="Ctrl+Espace, Ctrl+N, Ctrl+B… la liste complète (Ctrl+?).">
        <fluent-button onClick={() => openDialog((close) => <ShortcutsDialog onClose={close} />)}>Afficher</fluent-button>
      </SettingCard>
    </section>
  );
}

export function SettingsPage() {
  return (
    <div class="page page--narrow">
      <h1 class="page__title">Paramètres</h1>
      <ServerSection />
      <PlaybackSection />
      <AboutSection />
    </div>
  );
}
