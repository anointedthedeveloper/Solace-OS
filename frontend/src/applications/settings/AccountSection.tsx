import { Group, Row } from '@/components/ui/Section';
import { useSettings } from '@/stores/settingsStore';

export function AccountSection() {
  const name = useSettings((s) => s.settings.displayName);
  const update = useSettings((s) => s.update);
  return (
    <Group title="Profile">
      <Row title="Display name" hint="Shown in the launcher and used by the terminal. Stored only in this browser.">
        <input className="s-input w-48" aria-label="Display name" maxLength={40} value={name} onChange={(e) => update({ displayName: e.target.value })} />
      </Row>
      <Row title="Account" hint="You're using Solace in guest mode: all data stays in this browser.">
        <span className="text-[12.5px] text-dim">Guest</span>
      </Row>
    </Group>
  );
}
