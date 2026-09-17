const PORTAL_TOKEN_KEY = "bb_client_portal_token";
const PORTAL_CLIENT_KEY = "bb_client_portal_client";

export type PortalClientInfo = {
  id: string;
  name: string;
  portal_username?: string | null;
};

export function getPortalToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(PORTAL_TOKEN_KEY);
}

export function getPortalClient(): PortalClientInfo | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(PORTAL_CLIENT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PortalClientInfo;
  } catch {
    return null;
  }
}

export function setPortalSession(token: string, client: PortalClientInfo) {
  window.localStorage.setItem(PORTAL_TOKEN_KEY, token);
  window.localStorage.setItem(PORTAL_CLIENT_KEY, JSON.stringify(client));
}

export function clearPortalSession() {
  window.localStorage.removeItem(PORTAL_TOKEN_KEY);
  window.localStorage.removeItem(PORTAL_CLIENT_KEY);
}
