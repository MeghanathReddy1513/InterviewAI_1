import { Router, type IRouter, type Response } from "express";
import {
  GetAppConfigResponse,
  GetCurrentAccountResponse,
  LoginAccountBody,
  LoginAccountResponse,
  LogoutAccountResponse,
  RegisterAccountBody,
  RegisterAccountResponse,
} from "@workspace/api-zod";
import {
  clearSessionCookies,
  getSupabaseSetupStatus,
  getPublicSupabaseConfig,
  isAiConfigured,
  isSupabaseConfigured,
  readSessionUser,
  requireSession,
  setSessionCookies,
  SupabaseError,
  supabaseAuthRequest,
} from "../lib/supabase";

type SupabaseAuthPayload = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user?: {
    id: string;
    email?: string;
    user_metadata?: Record<string, unknown>;
  };
};

const router: IRouter = Router();

function sendAuthError(
  res: Response,
  error: unknown,
): void {
  if (error instanceof SupabaseError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  res.status(503).json({ error: "Authentication service is temporarily unavailable." });
}

router.get("/config", async (_req, res): Promise<void> => {
  const supabaseConfigured = isSupabaseConfigured();
  const status = await getSupabaseSetupStatus();
  res.json(
    GetAppConfigResponse.parse({
      supabaseConfigured,
      supabaseReachable: status.reachable,
      databaseSchemaReady: status.schemaReady,
      aiConfigured: isAiConfigured(),
    }),
  );
});

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterAccountBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const username = parsed.data.username.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,32}$/.test(username)) {
    res.status(400).json({ error: "Username must be 3–32 characters using letters, numbers, and underscores." });
    return;
  }
  try {
    getPublicSupabaseConfig();
    const result = await supabaseAuthRequest<SupabaseAuthPayload>("signup", {
      email: parsed.data.email.trim().toLowerCase(),
      password: parsed.data.password,
      data: {
        full_name: parsed.data.fullName.trim(),
        username,
      },
    });
    if (!result.user) {
      res.status(502).json({ error: "Supabase did not return a new account." });
      return;
    }
    if (result.access_token && result.refresh_token) {
      setSessionCookies(res, {
        access_token: result.access_token,
        refresh_token: result.refresh_token,
        expires_in: result.expires_in,
        user: result.user,
      });
    }
    const response = RegisterAccountResponse.parse({
      user: readSessionUser(result.user),
      message: result.access_token
        ? "Your account is ready."
        : "Check your email to confirm your account, then sign in.",
      emailConfirmationRequired: !result.access_token,
    });
    res.status(201).json(response);
  } catch (error) {
    sendAuthError(res, error);
  }
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginAccountBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    getPublicSupabaseConfig();
    const result = await supabaseAuthRequest<SupabaseAuthPayload>("token?grant_type=password", {
      email: parsed.data.email.trim().toLowerCase(),
      password: parsed.data.password,
    });
    if (!result.user || !result.access_token || !result.refresh_token) {
      res.status(401).json({ error: "Supabase did not return a valid session." });
      return;
    }
    setSessionCookies(res, {
      access_token: result.access_token,
      refresh_token: result.refresh_token,
      expires_in: result.expires_in,
      user: result.user,
    });
    res.json(
      LoginAccountResponse.parse({
        user: readSessionUser(result.user),
        message: "Signed in successfully.",
        emailConfirmationRequired: false,
      }),
    );
  } catch (error) {
    sendAuthError(res, error);
  }
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  const accessToken = (req.cookies as Record<string, string | undefined> | undefined)
    ?.interviewai_access;
  if (accessToken && isSupabaseConfigured()) {
    try {
      await supabaseAuthRequest("logout", {}, accessToken);
    } catch {
      // The local session is cleared even if the upstream revoke request fails.
    }
  }
  clearSessionCookies(res);
  res.json(LogoutAccountResponse.parse({ message: "Signed out." }));
});

router.get("/auth/me", async (req, res): Promise<void> => {
  try {
    const { user } = await requireSession(req, res);
    res.json(GetCurrentAccountResponse.parse(user));
  } catch (error) {
    sendAuthError(res, error);
  }
});

export default router;
