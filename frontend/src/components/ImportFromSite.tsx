import { Alert, Badge, Button, PixelIcon, Spinner, TextField } from '@pixelvale/ui';
import type { ImportPreview, ImportProviderStatus } from '../api/client';
import { formatBytes, type ModSource } from '../types';
import { SourceBadge } from './ModBits';

function sourceOf(preview: ImportPreview): ModSource {
  return {
    provider: preview.provider,
    url: preview.sourceUrl,
    modId: preview.modId,
    fileId: preview.fileId,
    fileVersionId: preview.fileVersionId,
  };
}

export function ImportFromSite({
  url,
  onUrlChange,
  providers,
  preview,
  resolving,
  error,
  onResolve,
}: {
  url: string;
  onUrlChange: (url: string) => void;
  providers: ImportProviderStatus[];
  preview: ImportPreview | null;
  resolving: boolean;
  error: string;
  onResolve: () => void;
}): JSX.Element {
  const isModDrop = /moddrop\.com/i.test(url);
  let manualHref: string | null = null;
  if (isModDrop) {
    try {
      const parsed = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        manualHref = parsed.toString();
      }
    } catch {
      manualHref = null;
    }
  }
  const providerMap = new Map(providers.map((provider) => [provider.provider, provider]));
  const imageSrc =
    preview?.imageUrl && /^https?:\/\//i.test(preview.imageUrl) ? preview.imageUrl : null;
  const nexus = providerMap.get('nexus');
  const curseforge = providerMap.get('curseforge');
  const moddrop = providerMap.get('moddrop');

  return (
    <div className="import-panel">
      <p className="import-panel__lede">
        粘贴 <strong>Nexus Mods</strong> 或 <strong>CurseForge</strong> 的 Stardew Valley
        Mod 页面链接。平台会通过官方 API 获取最新主文件，下载后自动解析 manifest、分类并存入你选择的空间。
      </p>

      <div className="import-providers" aria-label="导入来源状态">
        <span className="import-providers__label">来源</span>
        {nexus ? (
          <Badge variant={nexus.configured ? 'success' : 'default'}>
            Nexus Mods · {nexus.configured ? '可下载' : '仅元数据'}
          </Badge>
        ) : (
          <Badge variant="warning">Nexus Mods</Badge>
        )}
        {curseforge ? (
          <Badge variant={curseforge.configured ? 'success' : 'default'}>
            CurseForge · {curseforge.configured ? '可下载' : '需 API Key'}
          </Badge>
        ) : (
          <Badge variant="info">CurseForge</Badge>
        )}
        {moddrop ? (
          <Badge variant="warning">ModDrop · 手动下载</Badge>
        ) : (
          <Badge variant="warning">ModDrop</Badge>
        )}
      </div>

      {providers.length > 0 && !nexus?.configured && !curseforge?.configured ? (
        <p className="import-panel__help">
          服务端尚未配置 <span className="mono">NEXUS_API_KEY</span> 或{' '}
          <span className="mono">CURSEFORGE_API_KEY</span>。参考 README 配置后即可自动下载；
          Nexus 目前仍可解析公开元数据。
        </p>
      ) : null}

      <form
        className="import-url-row"
        onSubmit={(event) => {
          event.preventDefault();
          if (!resolving) onResolve();
        }}
      >
        <TextField
          className="import-url-row__field"
          leadingIcon={<PixelIcon name="search" size={16} />}
          value={url}
          onChange={(event) => onUrlChange(event.target.value)}
          placeholder="https://www.nexusmods.com/stardewvalley/mods/2400"
          aria-label="Mod 页面链接"
          disabled={resolving}
          enterKeyHint="go"
        />
        <Button
          type="submit"
          variant="gold"
          loading={resolving}
          disabled={resolving || url.trim().length === 0 || isModDrop}
          leftIcon={<PixelIcon name="sparkle" size={16} />}
        >
          解析链接
        </Button>
      </form>

      {isModDrop ? (
        <Alert variant="warning" title="ModDrop 暂不支持自动下载">
          <p>
            ModDrop 的公共 API 目前没有文件下载端点，我们不会抓取网页或绕过作者权限。
            请打开原页面下载文件，然后切换到「上传文件」导入。
          </p>
          {manualHref ? (
            <p>
              <a href={manualHref} target="_blank" rel="noreferrer">
                打开 ModDrop 页面 ↗
              </a>
            </p>
          ) : null}
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="error" title="链接解析失败">
          {error}
          {manualHref ? (
            <p>
              <a href={manualHref} target="_blank" rel="noreferrer">
                打开原页面手动下载 ↗
              </a>
            </p>
          ) : null}
        </Alert>
      ) : null}

      {resolving ? (
        <div className="import-loading">
          <Spinner size="md" showLabel label="正在读取 Mod 元数据…" />
          <span>只调用官方 API，不会抓取网页。</span>
        </div>
      ) : null}

      {preview ? (
        <div className="import-preview">
          <div className="import-preview__head">
            <div className="import-preview__badges">
              <SourceBadge source={sourceOf(preview)} />
              <Badge variant={preview.downloadable ? 'success' : 'warning'}>
                {preview.downloadable ? '可以自动导入' : '不可自动下载'}
              </Badge>
            </div>
            <span className="import-preview__provider">{preview.provider}</span>
          </div>

          <div className="import-preview__body">
            {imageSrc ? (
              <img
                className="import-preview__image"
                src={imageSrc}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="import-preview__image import-preview__image--empty" aria-hidden="true">
                <PixelIcon name="file" size={28} />
              </span>
            )}
            <div className="import-preview__copy">
              <h3>{preview.title}</h3>
              <p className="import-preview__meta">
                {preview.author}
                {preview.version ? ` · v${preview.version}` : ''}
                {preview.category ? ` · ${preview.category}` : ''}
              </p>
              <p className="import-preview__meta">
                {preview.fileName}
                {preview.fileSize > 0 ? ` · ${formatBytes(preview.fileSize)}` : ''}
              </p>
              {preview.description ? (
                <p className="import-preview__desc">{preview.description}</p>
              ) : null}
              {preview.tags.length > 0 ? (
                <div className="mod-card__tags">
                  {preview.tags.slice(0, 6).map((tag) => (
                    <Badge key={tag}>{tag}</Badge>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          {!preview.downloadable ? (
            <Alert variant="warning" title="暂时无法自动下载">
              {preview.reason || '服务端缺少下载权限；请前往原页面下载后手动上传。'}
            </Alert>
          ) : null}
        </div>
      ) : null}

      <p className="import-panel__legal">
        只使用官方 API；下载与存储前请确认 Mod 作者允许该用途。不会抓取网页、不会绕过登录或付费下载限制。
      </p>
    </div>
  );
}
