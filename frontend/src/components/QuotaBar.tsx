import type { QuotaInfo } from '../types';

function Bar({ used, limit }: { used: number; limit: number }): JSX.Element {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div className="quota-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="quota-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function QuotaBar({ quota }: { quota: QuotaInfo }): JSX.Element {
  return (
    <div className="quota-grid">
      <div className="quota-card">
        <div className="quota-title">🏠 个人空间</div>
        <div className="quota-num">
          {quota.personal.usedHuman} / {quota.personal.limitHuman} · {quota.personal.modCount} 个 Mod
        </div>
        <Bar used={quota.personal.usedBytes} limit={quota.personal.limitBytes} />
      </div>
      {quota.teams.map((t) => (
        <div className="quota-card" key={t.teamId}>
          <div className="quota-title">
            👥 {t.teamName}（{t.role === 'owner' ? '创建者' : '成员'}）
          </div>
          <div className="quota-num">
            {t.usedHuman} / {t.limitHuman} · {t.modCount} 个 Mod
          </div>
          <Bar used={t.usedBytes} limit={t.limitBytes} />
        </div>
      ))}
      <div className="quota-hint">单次上传上限 {quota.serverLimits.maxUploadHuman} · 公开 Mod 仍计入上传者所在空间配额</div>
    </div>
  );
}
