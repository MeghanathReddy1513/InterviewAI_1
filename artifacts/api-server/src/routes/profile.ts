import { Router, type IRouter, type Response } from "express";
import {
  GetProfileResponse,
  UpdateProfileBody,
  UpdateProfileResponse,
} from "@workspace/api-zod";
import {
  requireSession,
  SupabaseError,
  supabaseRest,
  type SessionUser,
} from "../lib/supabase";

type ProfileRow = {
  id: string;
  full_name: string;
  username: string;
  preferred_role: string | null;
  preferred_programming_language: string | null;
  preferred_interview_language: string;
};

type InterviewStatsRow = {
  id: string;
  percentage: number | string;
  overall_score: number | string;
  total_marks: number;
  status: string;
};

type AnswerCountRow = { id: string };

const router: IRouter = Router();

function errorResponse(res: Response, error: unknown): void {
  if (error instanceof SupabaseError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: "Could not load your profile right now." });
}

function profileQuery(userId: string): URLSearchParams {
  const query = new URLSearchParams();
  query.set("select", "id,full_name,username,preferred_role,preferred_programming_language,preferred_interview_language");
  query.set("id", `eq.${userId}`);
  query.set("limit", "1");
  return query;
}

async function loadOrCreateProfile(
  accessToken: string,
  user: SessionUser,
): Promise<ProfileRow> {
  const data = await supabaseRest<ProfileRow[]>(
    accessToken,
    "profiles",
    profileQuery(user.id),
  );
  if (data[0]) return data[0];
  const insertQuery = new URLSearchParams();
  insertQuery.set("select", "id,full_name,username,preferred_role,preferred_programming_language,preferred_interview_language");
  const rows = await supabaseRest<ProfileRow[]>(accessToken, "profiles", insertQuery, {
    method: "POST",
    body: {
      id: user.id,
      full_name: user.fullName || "Candidate",
      username: user.username || `candidate_${user.id.slice(0, 8)}`,
    },
  });
  if (!rows[0]) throw new SupabaseError("Your profile could not be created.", 500);
  return rows[0];
}

async function getMetrics(
  accessToken: string,
  userId: string,
): Promise<{
  totalInterviews: number;
  averageScore: number;
  bestScore: number;
  questionsAnswered: number;
  readinessScore: number;
}> {
  const interviewQuery = new URLSearchParams();
  interviewQuery.set("select", "id,percentage,overall_score,total_marks,status");
  interviewQuery.set("user_id", `eq.${userId}`);
  interviewQuery.set("status", "eq.completed");
  interviewQuery.set("order", "created_at.desc");
  interviewQuery.set("limit", "500");
  const answerQuery = new URLSearchParams();
  answerQuery.set("select", "id");
  answerQuery.set("user_id", `eq.${userId}`);
  answerQuery.set("limit", "5000");
  const [interviews, answers] = await Promise.all([
    supabaseRest<InterviewStatsRow[]>(accessToken, "interviews", interviewQuery),
    supabaseRest<AnswerCountRow[]>(accessToken, "answers", answerQuery),
  ]);
  const scores = interviews.map((row) => Number(row.percentage) || 0);
  const averageScore = scores.length
    ? Math.round(scores.reduce((total, current) => total + current, 0) / scores.length)
    : 0;
  return {
    totalInterviews: interviews.length,
    averageScore,
    bestScore: scores.length ? Math.max(...scores) : 0,
    questionsAnswered: answers.length,
    readinessScore: averageScore,
  };
}

function toProfile(
  row: ProfileRow,
  user: SessionUser,
  metrics: Awaited<ReturnType<typeof getMetrics>>,
) {
  return {
    id: row.id,
    fullName: row.full_name || user.fullName,
    username: row.username || user.username,
    email: user.email,
    preferredRole: row.preferred_role,
    preferredProgrammingLanguage: row.preferred_programming_language,
    preferredInterviewLanguage: row.preferred_interview_language || "English",
    ...metrics,
  };
}

router.get("/profile", async (req, res): Promise<void> => {
  try {
    const { user, accessToken } = await requireSession(req, res);
    const [profile, metrics] = await Promise.all([
      loadOrCreateProfile(accessToken, user),
      getMetrics(accessToken, user.id),
    ]);
    res.json(GetProfileResponse.parse(toProfile(profile, user, metrics)));
  } catch (error) {
    errorResponse(res, error);
  }
});

router.put("/profile", async (req, res): Promise<void> => {
  const parsed = UpdateProfileBody.safeParse(req.body);
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
    const { user, accessToken } = await requireSession(req, res);
    const query = new URLSearchParams();
    query.set("id", `eq.${user.id}`);
    query.set("select", "id,full_name,username,preferred_role,preferred_programming_language,preferred_interview_language");
    const rows = await supabaseRest<ProfileRow[]>(accessToken, "profiles", query, {
      method: "PATCH",
      body: {
        full_name: parsed.data.fullName.trim(),
        username,
        preferred_role: parsed.data.preferredRole,
        preferred_programming_language: parsed.data.preferredProgrammingLanguage,
        preferred_interview_language: parsed.data.preferredInterviewLanguage,
      },
    });
    if (!rows[0]) {
      res.status(404).json({ error: "Profile not found. Please sign in again." });
      return;
    }
    const metrics = await getMetrics(accessToken, user.id);
    res.json(
      UpdateProfileResponse.parse({
        ...toProfile(rows[0], user, metrics),
        fullName: rows[0].full_name,
        username: rows[0].username,
      }),
    );
  } catch (error) {
    errorResponse(res, error);
  }
});

export default router;
