// Joins class names, skipping falsy parts: cx('ui-button', primary && 'ui-button--primary').
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
