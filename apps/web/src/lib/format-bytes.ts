/**
 * Formats a byte count as B, KB, MB or GB for display.
 *
 * @param bytes Non-negative size in bytes.
 * @returns A short human-readable size such as `512 B` or `1.5 MB`.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}
