const IS_MASTER_KEY = "beacon_is_master";
const KEY_NAME_KEY = "beacon_key_name";
const KEY_PREFIX_KEY = "beacon_key_prefix";

export interface AuthInfo {
  isMaster: boolean;
  name: string;
  keyPrefix: string;
}

export function setAuthInfo(info: AuthInfo): void {
  localStorage.setItem(IS_MASTER_KEY, String(info.isMaster));
  localStorage.setItem(KEY_NAME_KEY, info.name);
  localStorage.setItem(KEY_PREFIX_KEY, info.keyPrefix);
}

export function getAuthInfo(): AuthInfo | null {
  if (typeof window === "undefined") return null;
  if (!isAuthenticated()) return null;

  const keyPrefix = localStorage.getItem(KEY_PREFIX_KEY);
  if (!keyPrefix) return null;

  return {
    isMaster: localStorage.getItem(IS_MASTER_KEY) === "true",
    name: localStorage.getItem(KEY_NAME_KEY) ?? "",
    keyPrefix,
  };
}

export function clearAuthInfo(): void {
  localStorage.removeItem(IS_MASTER_KEY);
  localStorage.removeItem(KEY_NAME_KEY);
  localStorage.removeItem(KEY_PREFIX_KEY);
}

export function isAuthenticated(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie
    .split(";")
    .map((item) => item.trim())
    .some((item) => item.startsWith("beacon_session="));
}
