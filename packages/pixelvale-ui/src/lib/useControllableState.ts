import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseControllableStateOptions<T> {
  value?: T;
  defaultValue: T;
  onChange?: (value: T) => void;
}

/**
 * Small controlled/uncontrolled state helper used by Tabs and Select.
 * The callback never fires for no-op updates and always receives the latest value.
 */
export function useControllableState<T>({
  value,
  defaultValue,
  onChange,
}: UseControllableStateOptions<T>): readonly [
  T,
  (next: T | ((previous: T) => T)) => void,
] {
  const isControlled = value !== undefined;
  const [internal, setInternal] = useState<T>(defaultValue);
  const currentRef = useRef(isControlled ? (value as T) : internal);
  const controlledRef = useRef(isControlled);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  controlledRef.current = isControlled;
  currentRef.current = isControlled ? (value as T) : internal;

  const setValue = useCallback((next: T | ((previous: T) => T)) => {
    const previous = currentRef.current;
    const resolved =
      typeof next === 'function' ? (next as (value: T) => T)(previous) : next;

    if (Object.is(previous, resolved)) return;

    currentRef.current = resolved;
    if (!controlledRef.current) setInternal(resolved);
    onChangeRef.current?.(resolved);
  }, []);

  return [isControlled ? (value as T) : internal, setValue] as const;
}
