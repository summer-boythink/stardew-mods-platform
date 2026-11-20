/**
 * Reference-counted body scroll lock. Nested dialogs unlock the page only after
 * the last one has closed, and the original inline value is restored.
 */
let locks = 0;
let originalOverflow = '';

export function lockBodyScroll(): () => void {
  if (typeof document === 'undefined') return () => undefined;

  if (locks === 0) {
    originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  locks += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    locks = Math.max(0, locks - 1);
    if (locks === 0) {
      document.body.style.overflow = originalOverflow;
    }
  };
}
