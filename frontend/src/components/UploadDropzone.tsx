import { useRef, useState } from 'react';
import { formatBytes } from '../types';

export interface PickedFiles {
  files: File[];
  /** 自动判断的上传形态 */
  kind: 'zip' | 'single' | 'folder';
}

function classify(files: File[]): PickedFiles['kind'] {
  if (files.length === 0) return 'single';
  if (files.length === 1) {
    return files[0].name.toLowerCase().endsWith('.zip') ? 'zip' : 'single';
  }
  return 'folder';
}

function relOf(f: File): string {
  const w = f as File & { webkitRelativePath?: string };
  return w.webkitRelativePath || f.name;
}

export function UploadDropzone({
  onPick,
  disabled,
}: {
  onPick: (picked: PickedFiles) => void;
  disabled?: boolean;
}): JSX.Element {
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<PickedFiles | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  const accept = (list: FileList | File[]): void => {
    const files = Array.from(list).filter((f) => f.size > 0);
    if (files.length === 0) return;
    // 手机端一次可能选很多图，截断保护（后端同样会校验 2000 个）
    const sliced = files.slice(0, 2000);
    const kind = classify(sliced);
    const picked = { files: sliced, kind };
    setPreview(picked);
    onPick(picked);
  };

  const total = preview ? preview.files.reduce((s, f) => s + f.size, 0) : 0;

  return (
    <div>
      <div
        className={`dropzone${dragOver ? ' over' : ''}${disabled ? ' disabled' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (disabled || !e.dataTransfer?.files?.length) return;
          accept(e.dataTransfer.files);
        }}
        onClick={() => {
          if (!disabled) fileRef.current?.click();
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !disabled) fileRef.current?.click();
        }}
        aria-label="选择要上传的 Mod 文件"
      >
        <div className="drop-emoji">📥</div>
        <div className="drop-title">点击选择 / 拖拽到此处</div>
        <div className="drop-sub">支持：单个 Mod 文件 · .zip 压缩包（含多 Mod 自动拆分） · 整个文件夹</div>
      </div>

      <div className="pick-row">
        <button type="button" className="btn" disabled={disabled} onClick={() => fileRef.current?.click()}>
          📄 选文件 / 压缩包
        </button>
        <button type="button" className="btn" disabled={disabled} onClick={() => folderRef.current?.click()}>
          📁 选整个文件夹
        </button>
      </div>

      {/* 普通文件选择（含 zip 与单个 mod，手机端表现为相册/文件） */}
      <input
        ref={fileRef}
        type="file"
        multiple
        className="hidden-input"
        onChange={(e) => {
          if (e.target.files?.length) accept(e.target.files);
          e.target.value = '';
        }}
      />
      {/* 文件夹选择：webkitdirectory 在 PC Chrome/Edge 生效，手机端自动降级为文件选择 */}
      <input
        ref={folderRef}
        type="file"
        multiple
        className="hidden-input"
        // @ts-expect-error webkitdirectory 非标准属性但浏览器广泛支持
        webkitdirectory=""
        onChange={(e) => {
          if (e.target.files?.length) accept(e.target.files);
          e.target.value = '';
        }}
      />

      {preview && (
        <div className="picked-box">
          <div className="picked-head">
            <strong>
              {preview.kind === 'zip' ? '📦 压缩包上传' : preview.kind === 'folder' ? '📁 文件夹上传' : '📄 单个文件上传'}
            </strong>
            <span>
              {preview.files.length} 个文件 · 共 {formatBytes(total)}
            </span>
          </div>
          <ul className="picked-list">
            {preview.files.slice(0, 12).map((f, i) => (
              <li key={`${f.name}-${i}`}>
                {relOf(f)} <em>({formatBytes(f.size)})</em>
              </li>
            ))}
            {preview.files.length > 12 && <li>……等 {preview.files.length - 12} 个文件</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
