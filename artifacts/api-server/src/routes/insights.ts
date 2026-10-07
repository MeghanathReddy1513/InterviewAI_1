import { Router, type IRouter, type Response } from "express";
import {
  GetAnalyticsResponse,
  GetRoadmapResponse,
  UpdateRoadmapItemBody,
  UpdateRoadmapItemParams,
  UpdateRoadmapItemResponse,
} from "@workspace/api-zod";
import {
  requireSession,
  SupabaseError,
  supabaseRest,
} from "../lib/supabase";

type InterviewRow = {
  id: string;
  job_role: string;
  percentage: number | string;
  status: "in_progress" | "completed";
  created_at: string;
};

type AnswerRow = {
  technical_score: number | string;
  answer_quality_score: number | string;
  relevance_score: number | string;
  communication_score: number | string;
  clarity_score: number | string;
  user_id: string;
};

type RoadmapRow = {
  id: string;
  topic: string;
  description: string;
  priority: string;
  practice_task: string;
  estimated_minutes: number;
  status: "Not Started" | "In Progress" | "Completed";
  order_index: number;
};

const router: IRouter = Router();

function sendError(res: Response, error: unknown): void {
  if (error instanceof SupabaseError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: "Could not load your progress right now." });
}

function userQuery(userId: string, select: string): URLSearchParams {
  const query = new URLSearchParams();
  query.set("select", select);
  query.set("user_id", `eq.${userId}`);
  return query;
}

function mapRoadmap(row: RoadmapRow) {
  return {
    id: row.id,
    topic: row.topic,
    description: row.description,
    priority: row.priority,
    practiceTask: row.practice_task,
    estimatedMinutes: row.estimated_minutes,
    status: row.status,
    orderIndex: row.order_index,
  };
}

function avg(rows: AnswerRow[], key: keyof AnswerRow): number {
  if (!rows.length) return 0;
  const total = rows.reduce((sum, row) => sum + (Number(row[key]) || 0), 0);
  return Math.round(total / rows.length);
}

router.get("/analytics", async (req, res): Promise<void> => {
  try {
    const { user, accessToken } = await requireSession(req, res);
    const interviewQuery = userQuery(user.id, "id,job_role,percentage,status,created_at");
    interviewQuery.set("status", "eq.completed");
    interviewQuery.set("order", "created_at.asc");
    interviewQuery.set("limit", "500");
    const answerQuery = userQuery(user.id, "technical_score,answer_quality_score,relevance_score,communication_score,clarity_score,user_id");
    answerQuery.set("limit", "5000");
    const [interviews, answers] = await Promise.all([
      supabaseRest<InterviewRow[]>(accessToken, "interviews", interviewQuery),
      supabaseRest<AnswerRow[]>(accessToken, "answers", answerQuery),
    ]);
    const scores = interviews.map((row) => Number(row.percentage) || 0);
    const scoreTrend = interviews.map((row) => ({
      date: row.created_at,
      score: Number(row.percentage) || 0,
      role: row.job_role,
    }));
    const improvement =
      scores.length > 1
        ? Math.round((scores[scores.length - 1]! - scores[0]!) * 10) / 10
        : 0;
    res.json(
      GetAnalyticsResponse.parse({
        averageScore: scores.length
          ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length)
          : 0,
        bestScore: scores.length ? Math.max(...scores) : 0,
        worstScore: scores.length ? Math.min(...scores) : 0,
        improvement,
        scoreTrend,
        categoryScores: [
          { category: "Technical", score: avg(answers, "technical_score") },
          { category: "Communication", score: avg(answers, "communication_score") },
          { category: "Answer quality", score: avg(answers, "answer_quality_score") },
          { category: "Relevance", score: avg(answers, "relevance_score") },
          { category: "Clarity", score: avg(answers, "clarity_score") },
        ],
      }),
    );
  } catch (error) {
    sendError(res, error);
  }
});

router.get("/roadmap", async (req, res): Promise<void> => {
  try {
    const { user, accessToken } = await requireSession(req, res);
    const query = userQuery(user.id, "*");
    query.set("order", "order_index.asc");
    query.set("limit", "200");
    const rows = await supabaseRest<RoadmapRow[]>(
      accessToken,
      "roadmap_items",
      query,
    );
    res.json(GetRoadmapResponse.parse(rows.map(mapRoadmap)));
  } catch (error) {
    sendError(res, error);
  }
});

router.patch("/roadmap/:id", async (req, res): Promise<void> => {
  const params = UpdateRoadmapItemParams.safeParse(req.params);
  const body = UpdateRoadmapItemBody.safeParse(req.body);
  if (params.success === false) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (body.success === false) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  try {
    const { user, accessToken } = await requireSession(req, res);
    const query = userQuery(user.id, "*");
    query.set("id", `eq.${params.data.id}`);
    const rows = await supabaseRest<RoadmapRow[]>(
      accessToken,
      "roadmap_items",
      query,
      { method: "PATCH", body: { status: body.data.status } },
    );
    if (!rows[0]) {
      res.status(404).json({ error: "Roadmap topic not found." });
      return;
    }
    res.json(UpdateRoadmapItemResponse.parse(mapRoadmap(rows[0])));
  } catch (error) {
    sendError(res, error);
  }
});

export default router;
