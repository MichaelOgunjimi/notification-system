import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parseUTC(date));
}

export function formatRelativeTime(date: string | Date): string {
  const diff = Date.now() - parseUTC(date).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Parse a datetime string from the API as UTC.
 *  The backend returns naive UTC timestamps without a 'Z' suffix
 *  (e.g. "2026-04-16T06:53:04.448408"). Without the suffix, browsers
 *  treat them as local time. Appending 'Z' forces correct UTC parsing.
 */
function parseUTC(date: string | Date): Date {
  if (date instanceof Date) return date;
  return new Date(date.endsWith("Z") || date.includes("+") ? date : date + "Z");
}
