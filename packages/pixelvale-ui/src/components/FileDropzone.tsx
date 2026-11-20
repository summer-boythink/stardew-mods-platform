import {
  useEffect,
  useId,
  useRef,
  useState,
  type DragEvent,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { cx } from '../lib/cx';
import { useControllableState } from '../lib/useControllableState';
import { useLocale } from './PixelValeProvider';
import { PixelIcon } from './PixelIcon';

export type FileRejectionReason = 'type' | 'size' | 'count';

export interface FileRejection {
  file: File;
  reason: FileRejectionReason;
}

export interface FileDropzoneProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  'onChange'
> {
  files?: File[];
  defaultFiles?: File[];
  onFilesChange?: (files: File[]) => void;
  onReject?: (rejections: FileRejection[]) => void;
  accept?: string;
  multiple?: boolean;
  /** Maximum size per file in bytes. */
  maxSize?: number;
  maxFiles?: number;
  disabled?: boolean;
  label?: ReactNode;
  hint?: string;
  error?: string;
  emptyLabel?: string;
  browseLabel?: string;
  name?: string;
  id?: string;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function matchesAccept(file: File, accept?: string): boolean {
  if (!accept) return true;
  const tokens = accept
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0) return true;

  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return tokens.some((token) => {
    if (token.startsWith('.')) return name.endsWith(token);
    if (token.endsWith('/*')) return type.startsWith(token.slice(0, -1));
    return type === token;
  });
}

/**
 * Drag-and-drop file field with a native file input, accept/size/count
 * validation, per-file removal, and optional controlled file state.
 */
export function FileDropzone({
  files,
  defaultFiles,
  onFilesChange,
  onReject,
  accept,
  multiple = false,
  maxSize,
  maxFiles,
  disabled = false,
  label,
  hint,
  error,
  emptyLabel,
  browseLabel,
  name,
  id,
  className,
  'aria-describedby': describedBy,
  ...rest
}: FileDropzoneProps) {
  const generatedId = useId();
  const controlId = id ?? `pv-file-${generatedId}`;
  const inputId = `${controlId}-input`;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const feedbackId = `${controlId}-feedback`;
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [feedback, setFeedback] = useState<FileRejection[]>([]);
  const { t } = useLocale();

  const [current, setCurrent] = useControllableState<File[]>({
    value: files,
    defaultValue: defaultFiles ?? [],
    onChange: onFilesChange,
  });

  const limit = multiple
    ? typeof maxFiles === 'number' && Number.isFinite(maxFiles)
      ? Math.max(0, Math.floor(maxFiles))
      : Infinity
    : 1;
  const sizeLimit =
    typeof maxSize === 'number' && Number.isFinite(maxSize)
      ? Math.max(0, maxSize)
      : undefined;
  const describedIds =
    [describedBy, hintId, error ? errorId : feedback.length > 0 ? feedbackId : undefined]
      .filter(Boolean)
      .join(' ') || undefined;

  useEffect(() => {
    const input = inputRef.current;
    if (!input || typeof DataTransfer === 'undefined') return;
    try {
      const transfer = new DataTransfer();
      for (const file of current) transfer.items.add(file);
      input.files = transfer.files;
    } catch {
      // Some browsers expose a read-only FileList; the callback API still works.
    }
  }, [current]);

  const rejectionText = (rejection: FileRejection): string => {
    switch (rejection.reason) {
      case 'type':
        return t('fileTypeRejected', { name: rejection.file.name });
      case 'size':
        return t('fileTooLarge', { name: rejection.file.name });
      case 'count':
        return t('tooManyFiles', { count: limit });
      default:
        return '';
    }
  };

  const addFiles = (incoming: readonly File[]) => {
    if (disabled || incoming.length === 0) return;

    const rejections: FileRejection[] = [];
    let next = multiple ? [...current] : [];
    let changed = false;

    for (const file of incoming) {
      if (!matchesAccept(file, accept)) {
        rejections.push({ file, reason: 'type' });
        continue;
      }
      if (sizeLimit !== undefined && file.size > sizeLimit) {
        rejections.push({ file, reason: 'size' });
        continue;
      }
      if (next.length >= limit) {
        rejections.push({ file, reason: 'count' });
        continue;
      }
      if (
        next.some(
          (existing) =>
            existing.name === file.name &&
            existing.size === file.size &&
            existing.lastModified === file.lastModified,
        )
      ) {
        continue;
      }
      next.push(file);
      changed = true;
    }

    if (changed) {
      setCurrent(next);
    }

    if (rejections.length > 0) {
      setFeedback(rejections);
      onReject?.(rejections);
    } else {
      setFeedback([]);
    }
  };

  const removeFile = (index: number) => {
    if (disabled) return;
    setCurrent(current.filter((_, fileIndex) => fileIndex !== index));
    setFeedback([]);
  };

  const handleDragEnter = (event: DragEvent<HTMLButtonElement>) => {
    if (disabled) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    setDragging(true);
  };

  const handleDragOver = (event: DragEvent<HTMLButtonElement>) => {
    if (disabled) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    setDragging(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLButtonElement>) => {
    if (disabled) return;
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragging(false);
  };

  const handleDrop = (event: DragEvent<HTMLButtonElement>) => {
    if (disabled) return;
    event.preventDefault();
    dragDepthRef.current = 0;
    setDragging(false);
    if (event.dataTransfer?.files) {
      addFiles(Array.from(event.dataTransfer.files));
    }
  };

  const message = error
    ? [error]
    : feedback.length > 0
      ? [
          ...feedback.slice(0, 2).map(rejectionText),
          ...(feedback.length > 2 ? [t('filesSkipped')] : []),
        ]
      : [];

  return (
    <div
      className={cx(
        'pv-file-dropzone',
        disabled && 'pv-file-dropzone--disabled',
        error && 'pv-file-dropzone--invalid',
        className,
      )}
      {...rest}
    >
      {label ? (
        <label
          id={`${controlId}-label`}
          className="pv-file-dropzone__label"
          htmlFor={controlId}
        >
          {label}
        </label>
      ) : null}

      <button
        id={controlId}
        type="button"
        className="pv-file-dropzone__target"
        data-dragging={dragging ? 'true' : undefined}
        disabled={disabled}
        aria-describedby={describedIds}
        onClick={() => inputRef.current?.click()}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <span className="pv-file-dropzone__icon" aria-hidden="true">
          <PixelIcon name="upload" size={22} />
        </span>
        <span className="pv-file-dropzone__title">{emptyLabel ?? t('dropFiles')}</span>
        <span className="pv-file-dropzone__browse">
          {browseLabel ?? t('browseFiles')}
        </span>
      </button>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        className="pv-file-dropzone__input"
        accept={accept}
        multiple={multiple}
        name={name}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const selectedFiles = event.currentTarget.files;
          if (selectedFiles) addFiles(Array.from(selectedFiles));
        }}
      />

      {current.length > 0 ? (
        <ul className="pv-file-dropzone__files" aria-label={t('selectedFiles')}>
          {current.map((file, index) => (
            <li
              className="pv-file-dropzone__file"
              key={`${file.name}-${file.size}-${index}`}
            >
              <span className="pv-file-dropzone__file-icon" aria-hidden="true">
                <PixelIcon name="file" size={14} />
              </span>
              <span className="pv-file-dropzone__file-name" title={file.name}>
                {file.name}
              </span>
              <span className="pv-file-dropzone__file-size">
                {formatBytes(file.size)}
              </span>
              <button
                type="button"
                className="pv-file-dropzone__remove"
                aria-label={t('removeFile', { name: file.name })}
                disabled={disabled}
                onClick={() => removeFile(index)}
              >
                <PixelIcon name="close" size={11} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {message.length > 0 ? (
        <p
          id={error ? errorId : feedbackId}
          className={cx(
            'pv-file-dropzone__help',
            error && 'pv-file-dropzone__help--error',
          )}
          role="alert"
        >
          {message.map((line, index) => (
            <span className="pv-file-dropzone__feedback-line" key={index}>
              {line}
            </span>
          ))}
        </p>
      ) : hint ? (
        <p id={hintId} className="pv-file-dropzone__help">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
