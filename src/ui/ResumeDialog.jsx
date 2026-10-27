// « Reprendre depuis un autre appareil » (portage de ui/resume_dialog.py) :
// les files laissées par les AUTRES appareils, la plus récente en tête.

import { useEffect, useState } from 'preact/hooks';

import { deviceSummary } from '../core/queueSync.js';
import { Dialog } from './Dialog.jsx';
import { Icon } from './Icon.jsx';

export function ResumeDialog({ client, resumeDevice, onClose }) {
  const [devices, setDevices] = useState(null);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!client) {
      setMessage({ title: 'Aucun serveur configuré', description: '' });
      return;
    }
    client.queueDevices()
      .then((all) => {
        const withTracks = all.filter((d) => d.trackCount > 0);
        if (withTracks.length) setDevices(withTracks);
        else setMessage({ title: 'Rien à reprendre', description: 'Aucun autre appareil n’a laissé de file d’attente.' });
      })
      .catch(() => setMessage({ title: 'Serveur injoignable', description: '' }));
  }, [client]);

  async function pick(device) {
    setBusy(true);
    const outcome = await resumeDevice(device);
    if (outcome === 'error') setBusy(false);
    else if (outcome === 'empty') setMessage({ title: 'Rien à reprendre', description: 'Aucune piste jouable dans cette file.' });
    else onClose();
  }

  return (
    <Dialog title="Reprendre depuis un autre appareil" onClose={onClose} width={480} footer={<fluent-button onClick={onClose}>Fermer</fluent-button>}>
      {message && (
        <div class="dialog__message">
          <strong>{message.title}</strong>
          {message.description && <p class="muted">{message.description}</p>}
        </div>
      )}
      {!message && !devices && <div class="dialog__loading"><fluent-spinner size="small" /></div>}
      {!message && devices && (
        <div class={`pick-list ${busy ? 'pick-list--busy' : ''}`}>
          {devices.map((device) => {
            const { title, subtitle } = deviceSummary(device);
            return (
              <button key={device.deviceId} type="button" class="pick-list__item" disabled={busy} onClick={() => pick(device)}>
                <Icon name="phone_laptop" />
                <span class="pick-list__text">
                  <span class="pick-list__title">{title}</span>
                  <span class="pick-list__subtitle">{subtitle}</span>
                </span>
                <Icon name="play" filled size={16} />
              </button>
            );
          })}
        </div>
      )}
    </Dialog>
  );
}
