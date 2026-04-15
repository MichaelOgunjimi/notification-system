const TOKEN_KEY = "beacon_token";
const IS_MASTER_KEY = "beacon_is_master";
const KEY_NAME_KEY = "beacon_key_name";
const KEY_PREFIX_KEY = "beacon_key_prefix";

export interface AuthInfo {
  token: string;
  isMaster: boolean;
  name: string;
  keyPrefix: string;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function setAuthInfo(info: AuthInfo): void {
  localStorage.setItem(TOKEN_KEY, info.token);
  localStorage.setItem(IS_MASTER_KEY, String(info.isMaster));
  localStorage.setItem(KEY_NAME_KEY, info.name);
  localStorage.setItem(KEY_PREFIX_KEY, info.keyPrefix);
}

export function getAuthInfo(): AuthInfo | null {
  if (typeof window === "undefined") return null;
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return null;
  return {
    token,
    isMaster: localStorage.getItem(IS_MASTER_KEY) === "true",
    name: localStorage.getItem(KEY_NAME_KEY) ?? "",
    keyPrefix: localStorage.getItem(KEY_PREFIX_KEY) ?? token.slice(0, 10),
  };
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(IS_MASTER_KEY);
  localStorage.removeItem(KEY_NAME_KEY);
  localStorage.removeItem(KEY_PREFIX_KEY);
}

export function isAuthenticated(): boolean {
  return !!getToken();
}
