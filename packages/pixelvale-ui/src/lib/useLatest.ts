import { useEffect, useRef } from 'react';

/** Keep a stable reference to the latest prop without re-subscribing effects. */
export function useLatest<T>(value: T): { readonly current: T } {
  const ref = useRef(value);

  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref;
}
