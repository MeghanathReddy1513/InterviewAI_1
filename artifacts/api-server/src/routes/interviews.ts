import { Router, type IRouter, type Response } from "express";
import {
  CompleteInterviewParams,
  CompleteInterviewResponse,
  CreateInterviewBody,
  CreateInterviewResponse,
  GetDashboardResponse,
  DeleteInterviewParams,
  DeleteInterviewResponse,
  GetInterviewParams,
  GetInterviewResponse,
  InterviewReport as InterviewReportSchema,
  ListInterviewsQueryParams,
  ListInterviewsResponse,
  SubmitInterviewAnswerBody,
  SubmitInterviewAnswerParams,
  SubmitInterviewAnswerResponse,
} from "@workspace/api-zod";
import {
  calculateMarks,
  evaluateAnswer,
  generateFinalReport,
  generateQuestion,
  type InterviewContext,
  type Scorecard,
} from "../lib/interview-ai";
import {
  requireSession,
  SupabaseError,
  supabaseRest,
} from "../lib/supabase";

type InterviewRow = {
  id: string;
  user_id: string;
  job_role: string;
  interview_type: string;
  programming_language: string;
  difficulty: string;
  experience_level: string;
  interview_language: string;
  interviewer_persona: string;
  voice_enabled: boolean;
  number_of_questions: number;
  total_marks: number;
  time_limit_minutes: number | null;
  resume_context: string | null;
  job_description: string | null;
  marks_obtained: number;
  percentage: number | string;
  overall_score: number | string;
  performance_rating: string | null;
  status: "in_progress" | "completed";
  report_data: Record<string, unknown> | null;
  created_at: string;
  completed_at: string | null;
};

type QuestionRow = {
  id: string;
  interview_id: string;
  user_id: string;
  question_number: number;
  question_text: string;
  question_type: string;
  topic: string;
  difficulty: string;
  max_marks: number;
  created_at: string;
};

type AnswerRow = {
  id: string;
  question_id: string;
  user_id: string;
  answer_text: string;
  skipped: boolean;
  marks_obtained: number;
  technical_score: number | string;
  answer_quality_score: number | string;
  relevance_score: number | string;
  communication_score: number | string;
  clarity_score: number | string;
  strengths: unknown;
  weaknesses: unknown;
  improvement_tips: unknown;
  sample_answer: string;
  topics_to_revise: unknown;
  performance_category: string;
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

type InterviewSummary = {
  id: string;
  role: string;
  interviewType: string;
  programmingLanguage: string;
  difficulty: string;
  questionCount: number;
  totalMarks: number;
  marksObtained: number;
  percentage: number;
  performanceRating: string | null;
  status: "in_progress" | "completed";
  createdAt: string;
};

const router: IRouter = Router();

function sendError(
  res: Response,
  error: unknown,
  fallback = "The interview service is temporarily unavailable.",
): void {
  if (error instanceof SupabaseError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: fallback });
}

function queryForUser(userId: string, select: string): URLSearchParams {
  const query = new URLSearchParams();
  query.set("select", select);
  query.set("user_id", `eq.${userId}`);
  return query;
}

function mapSummary(row: InterviewRow): InterviewSummary {
  return {
    id: row.id,
    role: row.job_role,
    interviewType: row.interview_type,
    programmingLanguage: row.programming_language,
    difficulty: row.difficulty,
    questionCount: row.number_of_questions,
    totalMarks: row.total_marks,
    marksObtained: row.marks_obtained,
    percentage: Number(row.percentage) || 0,
    performanceRating: row.performance_rating,
    status: row.status,
    createdAt: row.created_at,
  };
}

function mapQuestion(row: QuestionRow) {
  return {
    id: row.id,
    questionNumber: row.question_number,
    questionText: row.question_text,
    topic: row.topic,
    difficulty: row.difficulty,
    questionType: row.question_type,
    maxMarks: row.max_marks,
  };
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function numberValue(value: number | string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapScorecard(row: AnswerRow): Scorecard {
  return {
    technicalScore: numberValue(row.technical_score),
    answerQualityScore: numberValue(row.answer_quality_score),
    relevanceScore: numberValue(row.relevance_score),
    communicationScore: numberValue(row.communication_score),
    clarityScore: numberValue(row.clarity_score),
    strengths: arrayOfStrings(row.strengths),
    weaknesses: arrayOfStrings(row.weaknesses),
    improvementTips: arrayOfStrings(row.improvement_tips),
    sampleAnswer: row.sample_answer,
    topicsToRevise: arrayOfStrings(row.topics_to_revise),
    performanceCategory: row.performance_category,
  };
}

function mapEvaluation(questionId: string, row: AnswerRow) {
  return {
    id: row.id,
    questionId,
    answerText: row.answer_text,
    marksObtained: row.marks_obtained,
    ...mapScorecard(row),
  };
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

function contextFromRow(row: InterviewRow): InterviewContext {
  return {
    role: row.job_role,
    interviewType: row.interview_type,
    programmingLanguage: row.programming_language,
    difficulty: row.difficulty,
    experienceLevel: row.experience_level,
    interviewLanguage: row.interview_language,
    persona: row.interviewer_persona,
    resumeContext: row.resume_context,
    jobDescription: row.job_description,
  };
}

async function loadInterview(
  accessToken: string,
  userId: string,
  id: string,
): Promise<InterviewRow | null> {
  const query = queryForUser(userId, "*");
  query.set("id", `eq.${id}`);
  query.set("limit", "1");
  const rows = await supabaseRest<InterviewRow[]>(accessToken, "interviews", query);
  return rows[0] ?? null;
}

async function loadQuestions(
  accessToken: string,
  userId: string,
  interviewId: string,
): Promise<QuestionRow[]> {
  const query = queryForUser(userId, "*");
  query.set("interview_id", `eq.${interviewId}`);
  query.set("order", "question_number.asc");
  query.set("limit", "100");
  return supabaseRest<QuestionRow[]>(accessToken, "questions", query);
}

async function loadAnswers(
  accessToken: string,
  userId: string,
): Promise<AnswerRow[]> {
  const query = queryForUser(userId, "*");
  query.set("order", "created_at.asc");
  query.set("limit", "5000");
  return supabaseRest<AnswerRow[]>(accessToken, "answers", query);
}

async function loadInterviewRows(
  accessToken: string,
  userId: string,
  status?: string,
): Promise<InterviewRow[]> {
  const query = queryForUser(userId, "*");
  if (status) query.set("status", `eq.${status}`);
  query.set("order", "created_at.desc");
  query.set("limit", "500");
  return supabaseRest<InterviewRow[]>(accessToken, "interviews", query);
}

async function insertQuestion(
  accessToken: string,
  userId: string,
  interviewId: string,
  number: number,
  maxMarks: number,
  draft: Awaited<ReturnType<typeof generateQuestion>>,
) {
  const query = new URLSearchParams();
  query.set("select", "*");
  const rows = await supabaseRest<QuestionRow[]>(accessToken, "questions", query, {
    method: "POST",
    body: {
      interview_id: interviewId,
      user_id: userId,
      question_number: number,
      question_text: draft.data.questionText,
      topic: draft.data.topic,
      difficulty: draft.data.difficulty,
      question_type: draft.data.questionType,
      max_marks: maxMarks,
    },
  });
  if (!rows[0]) throw new SupabaseError("The question could not be saved.", 500);
  return { question: mapQuestion(rows[0]), aiMode: draft.aiMode };
}

function ratingFor(percentage: number): string {
  if (percentage >= 90) return "Excellent";
  if (percentage >= 75) return "Very Good";
  if (percentage >= 60) return "Good";
  if (percentage >= 40) return "Needs Improvement";
  return "Needs Significant Improvement";
}

function reportFromRow(row: InterviewRow) {
  const stored = row.report_data;
  if (!stored) return null;
  return {
    interview: mapSummary(row),
    overallScore: numberValue(row.overall_score),
    percentage: numberValue(row.percentage),
    performanceRating: row.performance_rating ?? ratingFor(numberValue(row.percentage)),
    technicalScore: numberValue(stored.technicalScore as number | string),
    communicationScore: numberValue(stored.communicationScore as number | string),
    answerQualityScore: numberValue(stored.answerQualityScore as number | string),
    relevanceScore: numberValue(stored.relevanceScore as number | string),
    clarityScore: numberValue(stored.clarityScore as number | string),
    strengths: arrayOfStrings(stored.strengths),
    weaknesses: arrayOfStrings(stored.weaknesses),
    topicsToRevise: arrayOfStrings(stored.topicsToRevise),
    finalFeedback: typeof stored.finalFeedback === "string" ? stored.finalFeedback : "",
    aiMode: stored.aiMode === "live" ? "live" : "demo",
  };
}

router.get("/interviews", async (req, res): Promise<void> => {
  const parsed = ListInterviewsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const { user, accessToken } = await requireSession(req, res);
    const rows = await loadInterviewRows(accessToken, user.id, parsed.data.status);
    res.json(ListInterviewsResponse.parse(rows.map(mapSummary)));
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/interviews", async (req, res): Promise<void> => {
  const parsed = CreateInterviewBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const { user, accessToken } = await requireSession(req, res);
    const input = parsed.data;
    const query = new URLSearchParams();
    query.set("select", "*");
    const created = await supabaseRest<InterviewRow[]>(accessToken, "interviews", query, {
      method: "POST",
      body: {
        user_id: user.id,
        job_role: input.role.trim(),
        interview_type: input.interviewType,
        programming_language: input.programmingLanguage,
        difficulty: input.difficulty,
        experience_level: input.experienceLevel,
        interview_language: input.interviewLanguage,
        interviewer_persona: input.persona,
        voice_enabled: input.voiceEnabled,
        number_of_questions: input.numberOfQuestions,
        total_marks: input.totalMarks,
        time_limit_minutes: input.timeLimitMinutes,
        resume_context: input.resumeContext,
        job_description: input.jobDescription,
      },
    });
    const interview = created[0];
    if (!interview) throw new SupabaseError("The interview session could not be created.", 500);
    const question = await generateQuestion(contextFromRow(interview), []);
    const savedQuestion = await insertQuestion(
      accessToken,
      user.id,
      interview.id,
      1,
      Math.round(interview.total_marks / interview.number_of_questions),
      question,
    );
    res.status(201).json(
      CreateInterviewResponse.parse({
        interview: mapSummary(interview),
        question: savedQuestion.question,
        aiMode: savedQuestion.aiMode,
      }),
    );
  } catch (error) {
    sendError(res, error, "Could not start the interview.");
  }
});

router.get("/interviews/:id", async (req, res): Promise<void> => {
  const parsed = GetInterviewParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const { user, accessToken } = await requireSession(req, res);
    const interview = await loadInterview(accessToken, user.id, parsed.data.id);
    if (!interview) {
      res.status(404).json({ error: "Interview not found." });
      return;
    }
    const [questions, allAnswers] = await Promise.all([
      loadQuestions(accessToken, user.id, interview.id),
      loadAnswers(accessToken, user.id),
    ]);
    const answerByQuestion = new Map(allAnswers.map((answer) => [answer.question_id, answer]));
    const report = reportFromRow(interview);
    res.json(
      GetInterviewResponse.parse({
        interview: mapSummary(interview),
        config: {
          role: interview.job_role,
          interviewType: interview.interview_type,
          programmingLanguage: interview.programming_language,
          difficulty: interview.difficulty,
          experienceLevel: interview.experience_level,
          numberOfQuestions: interview.number_of_questions,
          totalMarks: interview.total_marks,
          timeLimitMinutes: interview.time_limit_minutes,
          interviewLanguage: interview.interview_language,
          persona: interview.interviewer_persona,
          voiceEnabled: interview.voice_enabled,
          resumeContext: interview.resume_context,
          jobDescription: interview.job_description,
        },
        questions: questions.map((question) => {
          const answer = answerByQuestion.get(question.id);
          return {
            question: mapQuestion(question),
            evaluation: answer ? mapEvaluation(question.id, answer) : null,
          };
        }),
        report,
      }),
    );
  } catch (error) {
    sendError(res, error, "Could not load this interview.");
  }
});

router.delete("/interviews/:id", async (req, res): Promise<void> => {
  const parsed = DeleteInterviewParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const { user, accessToken } = await requireSession(req, res);
    const query = queryForUser(user.id, "id");
    query.set("id", `eq.${parsed.data.id}`);
    const rows = await supabaseRest<Array<{ id: string }>>(
      accessToken,
      "interviews",
      query,
      { method: "DELETE" },
    );
    if (!rows.length) {
      res.status(404).json({ error: "Interview not found." });
      return;
    }
    res.json(DeleteInterviewResponse.parse({ message: "Interview deleted." }));
  } catch (error) {
    sendError(res, error, "Could not delete this interview.");
  }
});

router.post("/interviews/:id/answer", async (req, res): Promise<void> => {
  const params = SubmitInterviewAnswerParams.safeParse(req.params);
  const parsed = SubmitInterviewAnswerBody.safeParse(req.body);
  if (params.success === false) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (parsed.success === false) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const { user, accessToken } = await requireSession(req, res);
    const interview = await loadInterview(accessToken, user.id, params.data.id);
    if (!interview || interview.status !== "in_progress") {
      res.status(404).json({ error: "Active interview not found." });
      return;
    }
    const questionQuery = queryForUser(user.id, "*");
    questionQuery.set("id", `eq.${parsed.data.questionId}`);
    questionQuery.set("interview_id", `eq.${interview.id}`);
    questionQuery.set("limit", "1");
    const questionRows = await supabaseRest<QuestionRow[]>(
      accessToken,
      "questions",
      questionQuery,
    );
    const question = questionRows[0];
    if (!question) {
      res.status(404).json({ error: "Question not found in this interview." });
      return;
    }
    const existingQuery = queryForUser(user.id, "id");
    existingQuery.set("question_id", `eq.${question.id}`);
    existingQuery.set("limit", "1");
    const existingAnswers = await supabaseRest<Array<{ id: string }>>(
      accessToken,
      "answers",
      existingQuery,
    );
    if (existingAnswers.length) {
      res.status(409).json({ error: "This answer has already been submitted." });
      return;
    }
    const answerText = parsed.data.skipped ? "" : parsed.data.answerText.trim();
    const evaluated = await evaluateAnswer(
      contextFromRow(interview),
      {
        questionText: question.question_text,
        topic: question.topic,
        maxMarks: question.max_marks,
      },
      answerText,
    );
    const marks = parsed.data.skipped
      ? 0
      : calculateMarks(evaluated.data, question.max_marks, interview.interview_type);
    const insertAnswer = new URLSearchParams();
    insertAnswer.set("select", "*");
    const savedAnswers = await supabaseRest<AnswerRow[]>(
      accessToken,
      "answers",
      insertAnswer,
      {
        method: "POST",
        body: {
          question_id: question.id,
          user_id: user.id,
          answer_text: answerText,
          skipped: parsed.data.skipped,
          marks_obtained: marks,
          technical_score: parsed.data.skipped ? 0 : evaluated.data.technicalScore,
          answer_quality_score: parsed.data.skipped ? 0 : evaluated.data.answerQualityScore,
          relevance_score: parsed.data.skipped ? 0 : evaluated.data.relevanceScore,
          communication_score: parsed.data.skipped ? 0 : evaluated.data.communicationScore,
          clarity_score: parsed.data.skipped ? 0 : evaluated.data.clarityScore,
          strengths: parsed.data.skipped ? [] : evaluated.data.strengths,
          weaknesses: parsed.data.skipped
            ? ["No answer was submitted."]
            : evaluated.data.weaknesses,
          improvement_tips: evaluated.data.improvementTips,
          sample_answer: evaluated.data.sampleAnswer,
          topics_to_revise: evaluated.data.topicsToRevise,
          performance_category: parsed.data.skipped
            ? "Weak"
            : evaluated.data.performanceCategory,
        },
      },
    );
    const answer = savedAnswers[0];
    if (!answer) throw new SupabaseError("The evaluation could not be saved.", 500);
    const allQuestions = await loadQuestions(accessToken, user.id, interview.id);
    const answersBeforeNext = await loadAnswers(accessToken, user.id);
    const answerByQuestion = new Map(
      answersBeforeNext.map((saved) => [saved.question_id, saved]),
    );
    const previous = allQuestions.map((item) => {
      const pastAnswer = answerByQuestion.get(item.id);
      return {
        questionText: item.question_text,
        topic: item.topic,
        ...(pastAnswer
          ? { performanceCategory: pastAnswer.performance_category }
          : {}),
      };
    });
    const nextNumber = question.question_number + 1;
    const isComplete = nextNumber > interview.number_of_questions;
    let nextQuestion = null;
    let aiMode: "live" | "demo" = evaluated.aiMode;
    if (!isComplete) {
      const next = await generateQuestion(contextFromRow(interview), previous);
      const saved = await insertQuestion(
        accessToken,
        user.id,
        interview.id,
        nextNumber,
        Math.round(interview.total_marks / interview.number_of_questions),
        next,
      );
      nextQuestion = saved.question;
      if (saved.aiMode === "demo") aiMode = "demo";
    }
    const allSavedAnswers = await loadAnswers(accessToken, user.id);
    const currentQuestions = new Set(allQuestions.map((item) => item.id));
    const sessionTotal = allSavedAnswers
      .filter((row) => currentQuestions.has(row.question_id))
      .reduce((total, row) => total + row.marks_obtained, 0);
    const updateQuery = new URLSearchParams();
    updateQuery.set("user_id", `eq.${user.id}`);
    updateQuery.set("id", `eq.${interview.id}`);
    await supabaseRest<InterviewRow[]>(accessToken, "interviews", updateQuery, {
      method: "PATCH",
      body: { marks_obtained: sessionTotal },
    });
    res.json(
      SubmitInterviewAnswerResponse.parse({
        evaluation: mapEvaluation(question.id, answer),
        nextQuestion,
        isComplete,
        aiMode,
      }),
    );
  } catch (error) {
    sendError(res, error, "Could not submit this answer.");
  }
});

router.post("/interviews/:id/complete", async (req, res): Promise<void> => {
  const parsed = CompleteInterviewParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const { user, accessToken } = await requireSession(req, res);
    const interview = await loadInterview(accessToken, user.id, parsed.data.id);
    if (!interview) {
      res.status(404).json({ error: "Interview not found." });
      return;
    }
    if (interview.status === "completed") {
      const report = reportFromRow(interview);
      if (report) {
        res.json(CompleteInterviewResponse.parse(report));
        return;
      }
    }
    const [questions, allAnswers] = await Promise.all([
      loadQuestions(accessToken, user.id, interview.id),
      loadAnswers(accessToken, user.id),
    ]);
    const questionById = new Map(questions.map((question) => [question.id, question]));
    const answers = allAnswers.filter((answer) => questionById.has(answer.question_id));
    const marksObtained = answers.reduce((sum, answer) => sum + answer.marks_obtained, 0);
    const percentage = interview.total_marks
      ? Math.round((marksObtained / interview.total_marks) * 100)
      : 0;
    const scorecards = answers.map(mapScorecard);
    const average = (key: keyof Pick<
      Scorecard,
      "technicalScore" | "answerQualityScore" | "relevanceScore" | "communicationScore" | "clarityScore"
    >) =>
      scorecards.length
        ? Math.round(scorecards.reduce((sum, card) => sum + card[key], 0) / scorecards.length)
        : 0;
    const history = answers.map((answer) => {
      const question = questionById.get(answer.question_id);
      return {
        questionText: question?.question_text ?? "",
        topic: question?.topic ?? "Interview skills",
        answerText: answer.answer_text,
        marksObtained: answer.marks_obtained,
        maxMarks: question?.max_marks ?? 0,
        scorecard: mapScorecard(answer),
      };
    });
    const reportDraft = await generateFinalReport(contextFromRow(interview), history);
    const feedback = {
      overallScore: marksObtained,
      percentage,
      technicalScore: average("technicalScore"),
      communicationScore: average("communicationScore"),
      answerQualityScore: average("answerQualityScore"),
      relevanceScore: average("relevanceScore"),
      clarityScore: average("clarityScore"),
      strengths: reportDraft.data.strengths,
      weaknesses: reportDraft.data.weaknesses,
      topicsToRevise: reportDraft.data.topicsToRevise,
      finalFeedback: reportDraft.data.finalFeedback,
      aiMode: reportDraft.aiMode,
    };

    if (reportDraft.data.roadmap.length) {
      const roadmapQuery = new URLSearchParams();
      roadmapQuery.set("select", "*");
      await supabaseRest<RoadmapRow[]>(accessToken, "roadmap_items", roadmapQuery, {
        method: "POST",
        body: reportDraft.data.roadmap.map((item, index) => ({
          user_id: user.id,
          interview_id: interview.id,
          topic: item.topic,
          description: item.description,
          priority: item.priority,
          practice_task: item.practiceTask,
          estimated_minutes: item.estimatedMinutes,
          order_index: index,
        })),
      });
    }
    const updateQuery = new URLSearchParams();
    updateQuery.set("user_id", `eq.${user.id}`);
    updateQuery.set("id", `eq.${interview.id}`);
    updateQuery.set("select", "*");
    const updatedRows = await supabaseRest<InterviewRow[]>(
      accessToken,
      "interviews",
      updateQuery,
      {
        method: "PATCH",
        body: {
          marks_obtained: marksObtained,
          percentage,
          overall_score: percentage,
          performance_rating: ratingFor(percentage),
          status: "completed",
          completed_at: new Date().toISOString(),
          report_data: feedback,
        },
      },
    );
    const updated = updatedRows[0];
    if (!updated) throw new SupabaseError("The final report could not be saved.", 500);
    const response = {
      interview: mapSummary(updated),
      ...feedback,
    };
    res.json(CompleteInterviewResponse.parse(response));
  } catch (error) {
    sendError(res, error, "Could not complete this interview.");
  }
});

router.get("/dashboard", async (req, res): Promise<void> => {
  try {
    const { user, accessToken } = await requireSession(req, res);
    const [interviews, answers, questions, roadmap] = await Promise.all([
      loadInterviewRows(accessToken, user.id),
      loadAnswers(accessToken, user.id),
      supabaseRest<QuestionRow[]>(accessToken, "questions", queryForUser(user.id, "*")),
      supabaseRest<RoadmapRow[]>(
        accessToken,
        "roadmap_items",
        queryForUser(user.id, "*"),
      ),
    ]);
    const completed = interviews.filter((row) => row.status === "completed");
    const scores = completed.map((row) => Number(row.percentage) || 0);
    const averageScore = scores.length
      ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
      : 0;
    const questionById = new Map(questions.map((question) => [question.id, question]));
    const topicTotals = new Map<string, { score: number; count: number }>();
    for (const answer of answers) {
      const question = questionById.get(answer.question_id);
      if (!question) continue;
      const existing = topicTotals.get(question.topic) ?? { score: 0, count: 0 };
      existing.score += answer.marks_obtained / Math.max(1, question.max_marks);
      existing.count += 1;
      topicTotals.set(question.topic, existing);
    }
    const topicScores = [...topicTotals.entries()]
      .map(([topic, value]) => ({ topic, score: value.score / value.count }))
      .sort((a, b) => b.score - a.score);
    const completedRoadmap = roadmap.filter((item) => item.status === "Completed").length;
    const dashboard = {
      totalInterviews: completed.length,
      averageScore,
      bestScore: scores.length ? Math.max(...scores) : 0,
      questionsAnswered: answers.length,
      readinessScore: averageScore,
      recentInterviews: interviews.slice(0, 5).map(mapSummary),
      strongestTopics: topicScores.slice(0, 3).map((item) => item.topic),
      weakestTopics: topicScores.slice(-3).reverse().map((item) => item.topic),
      nextRecommendation:
        topicScores.length > 0
          ? `Practice ${topicScores.at(-1)?.topic} in your next ${interviews[0]?.job_role ?? "role"} interview.`
          : null,
      roadmapProgress: roadmap.length
        ? Math.round((completedRoadmap / roadmap.length) * 100)
        : 0,
    };
    res.json(GetDashboardResponse.parse(dashboard));
  } catch (error) {
    sendError(res, error, "Could not load the dashboard.");
  }
});

export default router;
