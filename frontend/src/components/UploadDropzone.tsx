import { useRef, useState } from 'react';
import { Badge, Button, PixelIcon } from '@pixelvale/ui';
import { formatBytes } from '../types';

export interface PickedFiles {
  files: File[];
  /** 自动判断的上传形态 */
  kind: 'zip' | 'single' | 'folder';
}

function classify(files: File[]): PickedFiles['kind'] {
  if (files.length === 0) return 'single';
  // A folder picker populates webkitRelativePath with a directory prefix, even
  // when the folder happens to contain only one file.
  const fromFolder = files.some((file) => {
    const withPath = file as File & { webkitRelativePath?: string };
    return Boolean(withPath.webkitRelativePath?.includes('/'));
  });
  if (fromFolder) return 'folder';
  if (files.every((file) => file.name.toLowerCase().endsWith('.zip'))) return 'zip';
  if (files.length === 1) return 'single';
  return 'folder';
}

function relOf(file: File): string {
  const withPath = file as File & { webkitRelativePath?: string };
  return withPath.webkitRelativePath || file.name;
}

const MAX_FILES = 2000;

export function UploadDropzone({
  onPick,
  disabled,
}: {
  onPick: (picked: PickedFiles | null) => void;
  disabled?: boolean;
}): JSX.Element {
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<PickedFiles | null>(null);
  const [truncated, setTruncated] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  const accept = (list: FileList | File[], options: { keepEmpty?: boolean } = {}): void => {
    // A dropped folder can surface as a zero-byte pseudo-file. File/folder
    // pickers, however, may legitimately contain empty files, so only filter
    // empty entries for drops.
    const files = Array.from(list).filter(
      (file) => options.keepEmpty || file.size > 0,
    );
    if (files.length === 0) return;
    // 手机端一次可能选择很多文件；后端也会校验 2000 个，前端先截断并明确提示。
    const sliced = files.slice(0, MAX_FILES);
    setTruncated(files.length - sliced.length);
    const picked: PickedFiles = { files: sliced, kind: classify(sliced) };
    setPreview(picked);
    onPick(picked);
  };

  const clear = (): void => {
    setPreview(null);
    setTruncated(0);
    onPick(null);
    if (fileRef.current) fileRef.current.value = '';
    if (folderRef.current) folderRef.current.value = '';
  };

  const total = preview ? preview.files.reduce((sum, file) => sum + file.size, 0) : 0;
  const kindLabel =
    preview?.kind === 'zip'
      ? '压缩包上传'
      : preview?.kind === 'folder'
        ? '文件夹上传'
        : '单个文件上传';

  return (
    <div className="dropzone">
      <button
        type="button"
        className="dropzone__target"
        data-dragging={dragOver ? 'true' : undefined}
        disabled={disabled}
        onClick={() => fileRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setDragOver(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          if (disabled || !event.dataTransfer?.files?.length) return;
          accept(event.dataTransfer.files);
        }}
        aria-label="选择要上传的 Mod 文件或压缩包"
      >
        <span className="dropzone__icon" aria-hidden="true">
          <PixelIcon name="upload" size={28} />
        </span>
        <span className="dropzone__title">把 Mod 拖进谷仓</span>
        <span className="dropzone__hint">
          点击选择，或把文件拖到这里。文件夹请使用下方按钮。
        </span>
        <span className="dropzone__formats">
          单个 Mod 文件 · .zip 压缩包（可含多个 Mod） · 整个文件夹
        </span>
      </button>

      <div className="dropzone__actions">
        <Button
          variant="gold"
          leftIcon={<PixelIcon name="file" size={16} />}
          disabled={disabled}
          onClick={() => fileRef.current?.click()}
        >
          选文件 / 压缩包
        </Button>
        <Button
          leftIcon={<PixelIcon name="upload" size={16} />}
          disabled={disabled}
          onClick={() => folderRef.current?.click()}
        >
          选整个文件夹
        </Button>
        {preview ? (
          <Button variant="ghost" disabled={disabled} onClick={clear}>
            清空选择
          </Button>
        ) : null}
      </div>

      {/* 普通文件选择（含 zip 与单个 mod，手机端表现为文件选择器） */}
      <input
        ref={fileRef}
        type="file"
        multiple
        className="visually-hidden-input"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          if (event.target.files?.length) accept(event.target.files, { keepEmpty: true });
          event.target.value = '';
        }}
      />
      {/* 文件夹选择：webkitdirectory 在 PC Chrome/Edge 生效，手机端自动降级为文件选择 */}
      <input
        ref={folderRef}
        type="file"
        multiple
        className="visually-hidden-input"
        tabIndex={-1}
        aria-hidden="true"
        // @ts-expect-error webkitdirectory 非标准属性但浏览器广泛支持
        webkitdirectory=""
        onChange={(event) => {
          if (event.target.files?.length) accept(event.target.files, { keepEmpty: true });
          event.target.value = '';
        }}
      />

      {preview ? (
        <div className="picked-box">
          <div className="picked-box__head">
            <div className="picked-box__title">
              <Badge variant={preview.kind === 'zip' ? 'gold' : 'success'}>
                {kindLabel}
              </Badge>
              <span>
                {preview.files.length} 个文件 · 共 {formatBytes(total)}
              </span>
            </div>
            {truncated > 0 ? (
              <span className="picked-box__warning" role="status">
                超过 {MAX_FILES} 个，已自动截取前 {MAX_FILES} 个（忽略 {truncated} 个）
              </span>
            ) : null}
          </div>
          <ul className="picked-list">
            {preview.files.slice(0, 12).map((file, index) => (
              <li key={`${relOf(file)}-${file.size}-${index}`}>
                <PixelIcon name="file" size={13} />
                <span className="picked-list__path">{relOf(file)}</span>
                <span className="picked-list__size">{formatBytes(file.size)}</span>
              </li>
            ))}
            {preview.files.length > 12 ? (
              <li className="picked-list__more">
                ……等 {preview.files.length - 12} 个文件
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
