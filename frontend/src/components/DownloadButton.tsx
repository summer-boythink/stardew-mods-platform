import { useState, type ReactNode } from 'react';
import { downloadModFile, modDownloadUrl } from '../api/client';
import type { ModRecord } from '../types';

function DownloadGlyph(): JSX.Element {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinecap="square"
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 3v12M7 10l5 5 5-5" />
      <path d="M4 19h16" />
    </svg>
  );
}

/**
 * 下载按钮：公开 Mod 用普通链接（浏览器流式下载、零内存占用）；
 * 私有/团队 Mod 必须带 Token 请求（<a href> 不会带 Authorization 头，会 403），
 * 走 fetch → Blob → 临时链接保存。
 */
export function DownloadButton({
  mod,
  className = 'pv-btn pv-btn--primary',
  label,
  size,
  onError,
}: {
  mod: ModRecord;
  className?: string;
  label?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** Optional themed error handler; falls back to a native alert in isolation. */
  onError?: (message: string) => void;
}): JSX.Element {
  const [busy, setBusy] = useState(false);
  const text = label ?? '下载';
  const sizeClass = size ? ` pv-btn--${size}` : '';
  const classes = `${className}${sizeClass}`;

  if (mod.visibility === 'public') {
    return (
      <a className={classes} href={modDownloadUrl(mod.id)}>
        <DownloadGlyph />
        <span className="pv-btn__label">{text}</span>
      </a>
    );
  }

  return (
    <button
      type="button"
      className={classes}
      disabled={busy}
      onClick={() => {
        setBusy(true);
        downloadModFile(mod.id, mod.fileName)
          .catch((e) => {
            const message = e instanceof Error ? e.message : '下载失败';
            if (onError) onError(message);
            else window.alert(message);
          })
          .finally(() => setBusy(false));
      }}
    >
      <DownloadGlyph />
      <span className="pv-btn__label">{busy ? '下载中…' : text}</span>
    </button>
  );
}
