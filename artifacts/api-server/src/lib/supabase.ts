import type { Request, Response } from "express";

const ACCESS_COOKIE = "interviewai_access";
const REFRESH_COOKIE = "interviewai_refresh";
const ACCESS_COOKIE_MAX_AGE = 60 * 60 * 1000;
const REFRESH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

type SupabaseUser = {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
};

type AuthTokens = {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  user?: SupabaseUser;
};

export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  username: string;
};

export class SupabaseError extends Error {
  constructor(
    message: string,
    readonly status = 500,
  ) {
    super(message);
    this.name = "SupabaseError";
  }
}

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
}

export function isAiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

let setupStatusCache:
  | { checkedAt: number; reachable: boolean; schemaReady: boolean }
  | undefined;

export async function getSupabaseSetupStatus(): Promise<{
  reachable: boolean;
  schemaReady: boolean;
}> {
  if (!isSupabaseConfigured()) return { reachable: false, schemaReady: false };
  if (setupStatusCache && Date.now() - setupStatusCache.checkedAt < 30000) {
    return {
      reachable: setupStatusCache.reachable,
      schemaReady: setupStatusCache.schemaReady,
    };
  }
  let reachable = false;
  let schemaReady = false;
  try {
    const { url, anonKey } = getPublicSupabaseConfig();
    const settings = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: anonKey },
      signal: AbortSignal.timeout(6000),
    });
    reachable = settings.ok;
    if (reachable) {
      const schema = await fetch(
        `${url}/rest/v1/profiles?select=id&limit=0`,
        {
          headers: { apikey: anonKey, Accept: "application/json" },
          signal: AbortSignal.timeout(6000),
        },
      );
      schemaReady = schema.ok;
    }
  } catch {
    reachable = false;
    schemaReady = false;
  }
  setupStatusCache = { checkedAt: Date.now(), reachable, schemaReady };
  return { reachable, schemaReady };
}

export function getPublicSupabaseConfig(): {
  url: string;
  anonKey: string;
} {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new SupabaseError(
      "Supabase is not configured. Add SUPABASE_URL and SUPABASE_ANON_KEY in Replit Secrets and environment variables.",
      503,
    );
  }
  return { url: url.replace(/\/+$/, ""), anonKey };
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export function setSessionCookies(res: Response, tokens: AuthTokens): void {
  res.cookie(ACCESS_COOKIE, tokens.access_token, cookieOptions(ACCESS_COOKIE_MAX_AGE));
  res.cookie(REFRESH_COOKIE, tokens.refresh_token, cookieOptions(REFRESH_COOKIE_MAX_AGE));
}

export function clearSessionCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, { ...cookieOptions(0), maxAge: undefined });
  res.clearCookie(REFRESH_COOKIE, { ...cookieOptions(0), maxAge: undefined });
}

export function readSessionUser(user: SupabaseUser): SessionUser {
  const metadata = user.user_metadata ?? {};
  const fullName = typeof metadata.full_name === "string" ? metadata.full_name : "";
  const username = typeof metadata.username === "string" ? metadata.username : "";
  return {
    id: user.id,
    email: user.email ?? "",
    fullName,
    username,
  };
}

export async function supabaseAuthRequest<T>(
  path: string,
  body?: Record<string, unknown>,
  accessToken?: string,
): Promise<T> {
  const { url, anonKey } = getPublicSupabaseConfig();
  const response = await fetch(`${url}/auth/v1/${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      apikey: anonKey,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(12000),
  });
  const raw = await response.text();
  let data: unknown = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const payload = data as Record<string, unknown> | null;
    const message =
      typeof payload?.msg === "string"
        ? payload.msg
        : typeof payload?.message === "string"
          ? payload.message
          : typeof payload?.error_description === "string"
            ? payload.error_description
            : "Supabase authentication request failed.";
    throw new SupabaseError(message, response.status);
  }
  return data as T;
}

function requestCookies(req: Request): Record<string, string | undefined> {
  return (req.cookies ?? {}) as Record<string, string | undefined>;
}

async function refreshSession(
  req: Request,
  res: Response,
): Promise<AuthTokens | null> {
  const refreshToken = requestCookies(req)[REFRESH_COOKIE];
  if (!refreshToken) return null;
  try {
    const tokens = await supabaseAuthRequest<AuthTokens>("token?grant_type=refresh_token", {
      refresh_token: refreshToken,
    });
    setSessionCookies(res, tokens);
    return tokens;
  } catch {
    clearSessionCookies(res);
    return null;
  }
}

export async function requireSession(
  req: Request,
  res: Response,
): Promise<{ user: SessionUser; accessToken: string }> {
  const cookies = requestCookies(req);
  let accessToken = cookies[ACCESS_COOKIE];
  if (!accessToken) {
    const refreshed = await refreshSession(req, res);
    accessToken = refreshed?.access_token;
  }
  if (!accessToken) {
    throw new SupabaseError("Please sign in to continue.", 401);
  }

  try {
    const user = await supabaseAuthRequest<SupabaseUser>("user", undefined, accessToken);
    return { user: readSessionUser(user), accessToken };
  } catch (error) {
    if (error instanceof SupabaseError && error.status === 401) {
      const refreshed = await refreshSession(req, res);
      if (refreshed?.access_token) {
        const user = await supabaseAuthRequest<SupabaseUser>(
          "user",
          undefined,
          refreshed.access_token,
        );
        return { user: readSessionUser(user), accessToken: refreshed.access_token };
      }
      clearSessionCookies(res);
    }
    throw error;
  }
}

export async function supabaseRest<T>(
  accessToken: string,
  table: string,
  query: URLSearchParams,
  options: { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown } = {},
): Promise<T> {
  const { url, anonKey } = getPublicSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/${table}?${query.toString()}`, {
    method: options.method ?? "GET",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      Prefer: "return=representation",
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    signal: AbortSignal.timeout(15000),
  });
  const raw = await response.text();
  let data: unknown = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    throw new SupabaseError("Supabase returned an unreadable database response.", 502);
  }
  if (!response.ok) {
    const payload = data as Record<string, unknown> | null;
    const message =
      typeof payload?.message === "string"
        ? payload.message
        : "Supabase database request failed.";
    throw new SupabaseError(message, response.status);
  }
  return data as T;
}

export function requireSupabase(req: Request, res: Response) {
  return requireSession(req, res);
}
