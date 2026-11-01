// Les autres lecteurs pilotables (téléphone, lecteur bureau…), en direct ; un
// clic ouvre leur télécommande. Portage de RemoteDevicesPage (ui/remote.py).

import { useApp } from '../app/context.jsx';
import { useRemoteDevices, useRemoteSend } from '../app/remote.jsx';
import { deviceIcon, deviceName, simpleCommand } from '../core/remoteController.js';
import { Cover } from '../ui/Cover.jsx';
import { EmptyState, NoServer } from '../ui/EmptyState.jsx';
import { Icon } from '../ui/Icon.jsx';

const STATE_LABELS = { playing: 'En lecture', paused: 'En pause' };

function DeviceCard({ device }) {
  const { client, navigation } = useApp();
  const send = useRemoteSend();
  const state = device.state;
  const track = state?.track;
  const playing = state?.playbackState === 'playing';
  const open = () => navigation.push({ kind: 'remote-device', id: device.deviceId });
  return (
    <div class="remote-device" role="button" tabIndex={0} onClick={open}
      onKeyDown={(event) => event.key === 'Enter' && open()}>
      <Cover url={track ? client.resolveCover(track.coverUrl) : null} size={56} />
      <span class="remote-device__text">
        <span class="remote-device__name">
          <Icon name={deviceIcon(device.deviceLabel)} size={16} />
          {deviceName(device)}
        </span>
        <span class="remote-device__track">
          {track ? (track.artistName ? `${track.title} — ${track.artistName}` : track.title) : 'Rien en lecture'}
        </span>
        <span class="remote-device__state">{STATE_LABELS[state?.playbackState] ?? 'À l’arrêt'}</span>
      </span>
      {track && (
        <button type="button" class="icon-button" aria-label={playing ? 'Pause' : 'Lecture'} title={playing ? 'Pause' : 'Lecture'}
          onClick={(event) => { event.stopPropagation(); send(device.deviceId, simpleCommand('toggle')); }}>
          <Icon name={playing ? 'pause' : 'play'} filled />
        </button>
      )}
    </div>
  );
}

export function RemoteDevicesPage() {
  const { client } = useApp();
  const devices = useRemoteDevices();

  let body;
  if (!client) {
    body = <NoServer />;
  } else if (devices === null) {
    body = <div class="page-loading"><fluent-spinner /><span>Recherche des lecteurs…</span></div>;
  } else if (!devices.length) {
    body = (
      <EmptyState
        icon="phone_desktop"
        title="Aucun autre lecteur à piloter"
        description="Sur l’appareil voulu, activez « Autoriser le contrôle à distance » et laissez le lecteur ouvert."
      />
    );
  } else {
    body = <div class="remote-devices">{devices.map((device) => <DeviceCard key={device.deviceId} device={device} />)}</div>;
  }

  return (
    <div class="page page--narrow">
      <h1 class="page__title">Appareils</h1>
      {body}
    </div>
  );
}
