export type ClassValue = string | false | null | undefined;

/** Join truthy class names without pulling in a dependency. */
export function cx(...values: ClassValue[]): string {
  return values.filter(Boolean).join(' ');
}
