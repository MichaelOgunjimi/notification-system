"use client";

import { useCallback, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const COOKIE_PREFIX = "beaco_filters_";
const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

function cookieName(pathname: string): string {
  return `${COOKIE_PREFIX}${encodeURIComponent(pathname)}`;
}

function rememberedQuery(search: URLSearchParams): string {
  const remembered = new URLSearchParams(search);
  remembered.delete("page");
  return remembered.toString();
}

function readRememberedQuery(pathname: string): string {
  if (typeof document === "undefined") return "";
  const prefix = `${cookieName(pathname)}=`;
  const value = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);

  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
}

function writeRememberedQuery(pathname: string, search: URLSearchParams): void {
  if (typeof document === "undefined") return;
  const query = rememberedQuery(search);
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  const maxAge = query ? ONE_YEAR_IN_SECONDS : 0;
  document.cookie = `${cookieName(pathname)}=${encodeURIComponent(query)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

/**
 * Binds a filter surface to URL parameters and remembers its last non-paging
 * query in a page-specific browser cookie.
 *
 * The full pathname is part of the cookie name, so every organization,
 * project, and dashboard surface restores independently. Page numbers are not
 * remembered because returning to an old result page can produce an empty
 * view after the underlying data changes.
 *
 * @param enabled Whether this surface should persist and restore filter state.
 * @returns Current search parameters and a replacement function that updates both the URL and, when enabled, its preference cookie.
 * @sideEffect Restores a remembered query on mount and writes same-site preference cookies after filter changes.
 */
export function useRememberedSearchParams(enabled = true): {
  params: ReturnType<typeof useSearchParams>;
  replace: (search: URLSearchParams) => void;
} {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const query = params.toString();

  useEffect(() => {
    if (!enabled) return;
    if (query) {
      writeRememberedQuery(pathname, new URLSearchParams(query));
      return;
    }

    const remembered = readRememberedQuery(pathname);
    if (remembered) router.replace(`${pathname}?${remembered}`, { scroll: false });
  }, [enabled, pathname, query, router]);

  const replace = useCallback(
    (search: URLSearchParams) => {
      if (enabled) writeRememberedQuery(pathname, search);
      const next = search.toString();
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    },
    [enabled, pathname, router],
  );

  return { params, replace };
}
