import { Badge, PixelIcon, PixelSprite, ProgressBar } from '@pixelvale/ui';
import type { QuotaInfo } from '../types';

interface QuotaCardProps {
  title: string;
  subtitle: string;
  usedBytes: number;
  limitBytes: number;
  usedHuman: string;
  limitHuman: string;
  modCount: number;
  icon: 'personal' | 'team';
}

function QuotaCard({
  title,
  subtitle,
  usedBytes,
  limitBytes,
  usedHuman,
  limitHuman,
  modCount,
  icon,
}: QuotaCardProps): JSX.Element {
  const pct = limitBytes > 0 ? Math.min(100, Math.round((usedBytes / limitBytes) * 100)) : 0;
  return (
    <div className="quota-card">
      <div className="quota-card__head">
        <span className="quota-card__icon" aria-hidden="true">
          {icon === 'personal' ? (
            <PixelSprite name="parsnip" size={24} />
          ) : (
            <PixelIcon name="heart" size={18} />
          )}
        </span>
        <div className="quota-card__title">
          <strong>{title}</strong>
          <span>{subtitle}</span>
        </div>
        <Badge variant={pct >= 90 ? 'danger' : pct >= 70 ? 'warning' : 'success'}>
          {pct}%
        </Badge>
      </div>
      <ProgressBar
        value={usedBytes}
        max={limitBytes || 1}
        variant={pct >= 90 ? 'health' : 'energy'}
        label={`${usedHuman} / ${limitHuman}`}
        aria-label={`${title}已使用 ${pct}%`}
      />
      <p className="quota-card__hint">
        {modCount} 个 Mod · 剩余 {formatRemaining(limitBytes - usedBytes)}
      </p>
    </div>
  );
}

function formatRemaining(bytes: number): string {
  const safe = Math.max(0, bytes);
  if (safe >= 1024 * 1024 * 1024) return `${(safe / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (safe >= 1024 * 1024) return `${(safe / (1024 * 1024)).toFixed(0)} MB`;
  if (safe >= 1024) return `${(safe / 1024).toFixed(0)} KB`;
  return `${safe} B`;
}

export function QuotaBar({ quota }: { quota: QuotaInfo }): JSX.Element {
  return (
    <div className="quota-grid">
      <QuotaCard
        title="个人空间"
        subtitle="默认私有，可单独公开"
        icon="personal"
        usedBytes={quota.personal.usedBytes}
        limitBytes={quota.personal.limitBytes}
        usedHuman={quota.personal.usedHuman}
        limitHuman={quota.personal.limitHuman}
        modCount={quota.personal.modCount}
      />
      {quota.teams.map((team) => (
        <QuotaCard
          key={team.teamId}
          title={team.teamName}
          subtitle={team.role === 'owner' ? '我创建的团队' : '我加入的团队'}
          icon="team"
          usedBytes={team.usedBytes}
          limitBytes={team.limitBytes}
          usedHuman={team.usedHuman}
          limitHuman={team.limitHuman}
          modCount={team.modCount}
        />
      ))}
      <p className="quota-note">
        单次上传上限 {quota.serverLimits.maxUploadHuman} · 公开 Mod 仍计入上传者所在空间的配额
      </p>
    </div>
  );
}
