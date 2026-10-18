import { useEffect, useState } from 'react';
import { fetchAuthedObjectUrl, modPreviewUrl } from '../api/client';
import type { ModRecord } from '../types';

/**
 * Mod 预览图：公开 Mod 直接用 URL（浏览器可缓存）；
 * 私有/团队 Mod 的 <img src> 不会携带 Authorization 头（会 403），
 * 改为带 Token fetch 成 Blob 再展示。
 */
export function AuthedImage({
  mod,
  file,
  alt,
  className,
}: {
  mod: ModRecord;
  file: string;
  alt: string;
  className?: string;
}): JSX.Element | null {
  const url = modPreviewUrl(mod.id, file);
  const isPublic = mod.visibility === 'public';
  const [src, setSrc] = useState(isPublic ? url : '');

  useEffect(() => {
    if (isPublic) {
      setSrc(url);
      return () => undefined;
    }
    let cancelled = false;
    let objectUrl = '';
    fetchAuthedObjectUrl(url)
      .then((u) => {
        if (cancelled) {
          URL.revokeObjectURL(u);
          return;
        }
        objectUrl = u;
        setSrc(u);
      })
      .catch(() => {
        if (!cancelled) setSrc('');
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, isPublic]);

  if (!src) return null;
  return <img src={src} alt={alt} className={className} loading="lazy" />;
}
