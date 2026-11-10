import { BASE_SCOPES, GOOGLE_CLIENT_ID, YOUTUBE_SCOPE, isGoogleConfigured } from "../config";
import { AuthExpiredError } from "./errors";

interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
}

interface TokenClient {
  requestAccessToken: (override?: {
    prompt?: string;
    scope?: string;
    include_granted_scopes?: boolean;
  }) => void;
}

interface Session {
  accessToken: string;
  expiresAt: number;
  scopes: string[];
  email: string;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: GoogleTokenResponse) => void;
            error_callback?: (err: { type?: string; message?: string }) => void;
            include_granted_scopes?: boolean;
          }) => TokenClient;
        };
      };
    };
  }
}

const STORAGE_KEY = "mbk-session";
let session: Session | null = null;
let client: TokenClient | null = null;
let gisPromise: Promise<void> | null = null;
let pending: { resolve: (token: string) => void; reject: (error: Error) => void } | null = null;

function readStored(): Session | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    if (!parsed.accessToken || parsed.expiresAt < Date.now() + 60_000) return null;
    session = parsed;
    return parsed;
  } catch {
    return null;
  }
}

function writeStored(next: Session | null) {
  session = next;
  try {
    if (!next) sessionStorage.removeItem(STORAGE_KEY);
    else sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* private mode */
  }
}

export function peekSession(): Session | null {
  if (session && session.expiresAt > Date.now() + 60_000) return session;
  return readStored();
}

export function peekToken(): string | null {
  return peekSession()?.accessToken ?? null;
}

export function invalidateToken() {
  writeStored(null);
}

export function rememberEmail(email: string) {
  if (!session) return;
  writeStored({ ...session, email });
}

function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (!gisPromise) {
    gisPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        gisPromise = null;
        reject(new Error("gis-load"));
      };
      document.head.appendChild(script);
    });
  }
  return gisPromise;
}

function ensureClient(): TokenClient {
  if (client) return client;
  const google = window.google;
  if (!google?.accounts?.oauth2) throw new Error("gis-load");
  client = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: BASE_SCOPES.join(" "),
    include_granted_scopes: true,
    callback: (response) => {
      const waiter = pending;
      pending = null;
      if (!waiter) return;
      if (!response.access_token || response.error) {
        waiter.reject(new AuthExpiredError());
        return;
      }
      const next: Session = {
        accessToken: response.access_token,
        expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000,
        scopes: (response.scope || BASE_SCOPES.join(" ")).split(/\s+/).filter(Boolean),
        email: session?.email ?? "",
      };
      writeStored(next);
      waiter.resolve(next.accessToken);
    },
    error_callback: () => {
      const waiter = pending;
      pending = null;
      waiter?.reject(new AuthExpiredError());
    },
  });
  return client;
}

function hasScopes(extra: string[]): boolean {
  const current = peekSession();
  if (!current) return false;
  return extra.every((scope) => current.scopes.includes(scope));
}

export async function getValidToken(extra: string[] = [], opts?: { interactive?: boolean }): Promise<string> {
  if (!opts?.interactive && hasScopes(extra)) {
    const current = peekSession();
    if (current) return current.accessToken;
  }
  if (!isGoogleConfigured()) throw new Error("gis-missing");
  await loadGis();
  const tokenClient = ensureClient();
  const scope = [...BASE_SCOPES, ...extra].join(" ");
  const prompt = opts?.interactive ? "select_account" : "";
  return new Promise((resolve, reject) => {
    if (pending) {
      reject(new Error("auth-busy"));
      return;
    }
    const timer = window.setTimeout(() => {
      if (!pending) return;
      pending = null;
      reject(new AuthExpiredError());
    }, 90_000);
    pending = {
      resolve: (token) => {
        window.clearTimeout(timer);
        resolve(token);
      },
      reject: (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    };
    try {
      tokenClient.requestAccessToken({ prompt, scope, include_granted_scopes: true });
    } catch (error) {
      pending = null;
      window.clearTimeout(timer);
      reject(error instanceof Error ? error : new AuthExpiredError());
    }
  });
}

export async function ensureYouTubeToken(): Promise<string> {
  const interactive = !hasScopes([YOUTUBE_SCOPE]);
  return getValidToken([YOUTUBE_SCOPE], { interactive });
}

export async function fetchEmail(token: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new Error("profile-network");
  }
  if (response.status === 401) throw new AuthExpiredError();
  if (!response.ok) throw new Error("profile");
  const data = (await response.json()) as { email?: string };
  return data.email ?? "";
}
