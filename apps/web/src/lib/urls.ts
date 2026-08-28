const DOCS_BASE_URL = process.env.NEXT_PUBLIC_DOCS_URL ?? "http://localhost:3001";

export function docsUrl(pathname = "/"): string {
  return new URL(pathname, DOCS_BASE_URL).toString();
}
