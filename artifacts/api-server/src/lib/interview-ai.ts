import { isAiConfigured } from "./supabase";

export type InterviewContext = {
  role: string;
  interviewType: string;
  programmingLanguage: string;
  difficulty: string;
  experienceLevel: string;
  interviewLanguage: string;
  persona: string;
  resumeContext: string | null;
  jobDescription: string | null;
};

export type QuestionDraft = {
  questionText: string;
  topic: string;
  difficulty: string;
  questionType: string;
};

export type Scorecard = {
  technicalScore: number;
  answerQualityScore: number;
  relevanceScore: number;
  communicationScore: number;
  clarityScore: number;
  strengths: string[];
  weaknesses: string[];
  improvementTips: string[];
  sampleAnswer: string;
  topicsToRevise: string[];
  performanceCategory: string;
};

export type RoadmapDraft = {
  topic: string;
  description: string;
  priority: string;
  practiceTask: string;
  estimatedMinutes: number;
};

export type AiResult<T> = {
  data: T;
  aiMode: "live" | "demo";
};

type QuestionHistory = {
  questionText: string;
  topic: string;
  performanceCategory?: string;
};

type EvaluationHistory = {
  questionText: string;
  topic: string;
  answerText: string;
  marksObtained: number;
  maxMarks: number;
  scorecard: Scorecard;
};

type ReportDraft = {
  strengths: string[];
  weaknesses: string[];
  topicsToRevise: string[];
  finalFeedback: string;
  roadmap: RoadmapDraft[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function list(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function score(value: unknown, fallback = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function levels(): string[] {
  return ["Beginner", "Intermediate", "Advanced", "Expert"];
}

function adaptedDifficulty(
  requested: string,
  previous: QuestionHistory[],
): string {
  const previousCategory = previous.at(-1)?.performanceCategory;
  const index = levels().indexOf(requested);
  if (index < 0 || !previousCategory) return requested;
  if (previousCategory === "Weak" || previousCategory === "Needs Improvement") {
    return levels()[Math.max(0, index - 1)] ?? requested;
  }
  if (previousCategory === "Excellent" || previousCategory === "Strong") {
    return levels()[Math.min(levels().length - 1, index + 1)] ?? requested;
  }
  return requested;
}

function demoQuestion(
  context: InterviewContext,
  previous: QuestionHistory[],
): QuestionDraft {
  const topicSet =
    context.interviewType === "HR" || context.interviewType === "Behavioral"
      ? [
          "Collaboration",
          "Handling setbacks",
          "Prioritization",
          "Giving and receiving feedback",
          "Motivation",
          "Learning from mistakes",
          "Conflict resolution",
          "Ownership",
          "Decision making",
          "Communication",
          "Adaptability",
          "Leadership",
          "Problem solving",
          "Time management",
          "Career goals",
          "Working under pressure",
          "Customer focus",
          "Teamwork",
          "Self-awareness",
          "Professional growth",
        ]
      : [
          "Core concepts",
          "Data structures",
          "API design",
          "Testing",
          "Performance",
          "Error handling",
          "System design",
          "Security",
          "Debugging",
          "Database design",
          "Scalability",
          "Caching",
          "Code quality",
          "Concurrency",
          "Architecture",
          "Observability",
          "Trade-offs",
          "Deployment",
          "Reliability",
          "Technical decisions",
        ];
  const asked = new Set(previous.map((item) => item.topic.toLowerCase()));
  const topic =
    topicSet.find((candidate) => !asked.has(candidate.toLowerCase())) ??
    topicSet[previous.length % topicSet.length] ??
    "Problem solving";
  const difficulty = adaptedDifficulty(context.difficulty, previous);
  const questionType =
    context.interviewType === "HR" || context.interviewType === "Behavioral"
      ? "behavioral"
      : context.interviewType === "Coding"
        ? "coding"
        : "technical";
  const questionText =
    questionType === "behavioral"
      ? `Tell me about a time you demonstrated ${topic.toLowerCase()} in a work, academic, or personal project. What was the situation, what did you do, and what did you learn?`
      : `For a ${context.role} role, explain how you would approach ${topic.toLowerCase()} when building with ${context.programmingLanguage}. What trade-offs would you consider, and how would you validate your solution?`;
  return { questionText, topic, difficulty, questionType };
}

async function askJson<T>(system: string, user: unknown): Promise<T | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_completion_tokens: 1600,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: JSON.stringify(user) },
        ],
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) return null;
    const payload: unknown = await response.json();
    if (!isRecord(payload)) return null;
    const choices = payload.choices;
    if (!Array.isArray(choices) || !isRecord(choices[0])) return null;
    const message = choices[0].message;
    if (!isRecord(message) || typeof message.content !== "string") return null;
    const parsed: unknown = JSON.parse(message.content);
    return isRecord(parsed) ? (parsed as T) : null;
  } catch {
    return null;
  }
}

export async function generateQuestion(
  context: InterviewContext,
  previous: QuestionHistory[],
): Promise<AiResult<QuestionDraft>> {
  const difficulty = adaptedDifficulty(context.difficulty, previous);
  const generated = await askJson<unknown>(
    `You are a mock interviewer. Return one original, role-specific interview question in ${context.interviewLanguage}. Keep it appropriate to the candidate experience and selected difficulty. Adapt difficulty: simplify after weak performance, maintain it after average performance, and increase it after strong performance. Do not repeat previous questions or topics. Use resume/job details only if provided, and never invent candidate experience. Do not reveal hidden reasoning. Return JSON with questionText, topic, difficulty, questionType.`,
    { ...context, nextDifficulty: difficulty, previous },
  );
  if (isRecord(generated)) {
    const questionText = text(generated.questionText);
    const topic = text(generated.topic);
    if (questionText && topic) {
      return {
        data: {
          questionText,
          topic,
          difficulty: text(generated.difficulty, difficulty),
          questionType: text(generated.questionType, context.interviewType),
        },
        aiMode: "live",
      };
    }
  }
  return { data: demoQuestion(context, previous), aiMode: "demo" };
}

function demoEvaluation(
  questionText: string,
  answerText: string,
  maxMarks: number,
  interviewType: string,
): Scorecard {
  const answer = answerText.trim();
  if (!answer) {
    return {
      technicalScore: 0,
      answerQualityScore: 0,
      relevanceScore: 0,
      communicationScore: 0,
      clarityScore: 0,
      strengths: [],
      weaknesses: ["No answer was submitted."],
      improvementTips: ["Try to give a concise answer that addresses the question directly."],
      sampleAnswer: "Start by stating your approach, explain the key reasoning, then mention a trade-off or example.",
      topicsToRevise: ["Answer structure"],
      performanceCategory: "Weak",
    };
  }
  const words = answer.split(/\s+/).filter(Boolean);
  const lengthScore = Math.min(1, words.length / 55);
  const concreteSignals =
    (answer.match(/\b(example|because|trade-?off|measure|test|first|then|result|impact|approach|edge case|complexity)\b/gi) ?? []).length;
  const detailScore = Math.min(1, concreteSignals / 4);
  const questionWords = new Set(
    questionText
      .toLowerCase()
      .split(/[^a-z0-9+#]+/)
      .filter((word) => word.length > 4),
  );
  const answerWords = new Set(
    answer
      .toLowerCase()
      .split(/[^a-z0-9+#]+/)
      .filter((word) => word.length > 4),
  );
  const overlap = [...questionWords].filter((word) => answerWords.has(word)).length;
  const relevance = Math.min(88, 38 + overlap * 8 + detailScore * 16);
  const clarity = Math.min(88, 42 + lengthScore * 26 + detailScore * 12);
  const quality = Math.min(88, 35 + lengthScore * 28 + detailScore * 22);
  const communication = Math.min(88, 45 + lengthScore * 20 + detailScore * 12);
  const technical = interviewType === "HR" || interviewType === "Behavioral"
    ? relevance
    : Math.min(88, 32 + detailScore * 33 + overlap * 4);
  const strengths = [
    ...(overlap > 0 ? ["Your response addressed terms from the question."] : []),
    ...(concreteSignals > 1 ? ["You included reasoning or a concrete example."] : []),
  ];
  const weaknesses = [
    ...(words.length < 35 ? ["The answer could use more detail and a specific example."] : []),
    ...(concreteSignals < 2 ? ["Explain why you chose the approach and how you would validate it."] : []),
  ];
  if (strengths.length === 0) strengths.push("You made an attempt to address the question.");
  if (weaknesses.length === 0) weaknesses.push("Include a trade-off or edge case to make the answer more complete.");
  const average =
    interviewType === "HR" || interviewType === "Behavioral"
      ? (relevance + quality + communication + clarity) / 4
      : (technical * 0.4 + relevance * 0.2 + quality * 0.2 + communication * 0.1 + clarity * 0.1);
  const category =
    average >= 88 ? "Excellent" : average >= 75 ? "Strong" : average >= 50 ? "Average" : "Weak";
  return {
    technicalScore: score(technical),
    answerQualityScore: score(quality),
    relevanceScore: score(relevance),
    communicationScore: score(communication),
    clarityScore: score(clarity),
    strengths,
    weaknesses,
    improvementTips: [
      "Use a clear opening sentence, then explain your reasoning step by step.",
      "Add one concrete example, trade-off, or result to support your answer.",
    ],
    sampleAnswer: `A stronger response would directly answer the question, explain the reasoning, and support it with a specific example. For “${questionText}”, describe the approach you would take, why it fits the constraints, and how you would test the result.`,
    topicsToRevise: ["Structured explanations", "Examples and trade-offs"],
    performanceCategory: category,
  };
}

export function calculateMarks(
  card: Scorecard,
  maxMarks: number,
  interviewType: string,
): number {
  const weighted =
    interviewType === "HR" || interviewType === "Behavioral"
      ? (card.relevanceScore * 0.25 +
          card.communicationScore * 0.2 +
          card.answerQualityScore * 0.2 +
          card.clarityScore * 0.2 +
          card.technicalScore * 0.15)
      : card.technicalScore * 0.4 +
        card.relevanceScore * 0.2 +
        card.answerQualityScore * 0.2 +
        card.communicationScore * 0.1 +
        card.clarityScore * 0.1;
  return Math.max(0, Math.min(maxMarks, Math.round((weighted / 100) * maxMarks)));
}

export async function evaluateAnswer(
  context: InterviewContext,
  question: { questionText: string; topic: string; maxMarks: number },
  answerText: string,
): Promise<AiResult<Scorecard>> {
  const generated = await askJson<unknown>(
    `Evaluate a mock interview answer in ${context.interviewLanguage}. Grade the substance honestly; do not reward length alone. Category scores are 0-100. For HR/behavioral answers, weigh relevance, communication, structure, clarity, and completeness. For technical answers, weigh technical correctness, relevance, answer quality, communication, and clarity. Give concise actionable strengths, weaknesses, improvement tips, a short better sample answer, and topics to revise. Return JSON with technicalScore, answerQualityScore, relevanceScore, communicationScore, clarityScore, strengths[], weaknesses[], improvementTips[], sampleAnswer, topicsToRevise[]. Do not disclose hidden reasoning.`,
    { context, question, answerText },
  );
  if (isRecord(generated)) {
    const card: Scorecard = {
      technicalScore: score(generated.technicalScore, 50),
      answerQualityScore: score(generated.answerQualityScore, 50),
      relevanceScore: score(generated.relevanceScore, 50),
      communicationScore: score(generated.communicationScore, 50),
      clarityScore: score(generated.clarityScore, 50),
      strengths: list(generated.strengths, ["You responded to the prompt."]),
      weaknesses: list(generated.weaknesses, ["Add one concrete example or detail."]),
      improvementTips: list(generated.improvementTips, ["Structure the answer and explain your reasoning."]),
      sampleAnswer: text(generated.sampleAnswer, "Answer directly, explain your reasoning, and add a concrete example."),
      topicsToRevise: list(generated.topicsToRevise, [question.topic]),
      performanceCategory: "",
    };
    const total = calculateMarks(card, 100, context.interviewType);
    card.performanceCategory =
      total >= 90 ? "Excellent" : total >= 75 ? "Strong" : total >= 50 ? "Average" : "Weak";
    return { data: card, aiMode: "live" };
  }
  return {
    data: demoEvaluation(question.questionText, answerText, question.maxMarks, context.interviewType),
    aiMode: "demo",
  };
}

export async function generateFinalReport(
  context: InterviewContext,
  history: EvaluationHistory[],
): Promise<AiResult<ReportDraft>> {
  const generated = await askJson<unknown>(
    `Write a supportive but candid final mock-interview report in ${context.interviewLanguage}. Use only the supplied interview evidence; do not invent background or scores. Return JSON with strengths[], weaknesses[], topicsToRevise[], finalFeedback (short practical summary), and roadmap[] where each item has topic, description, priority (High/Medium/Low), practiceTask, estimatedMinutes (15-120). Create at most 5 roadmap items from observed gaps. Do not disclose hidden reasoning.`,
    { context, answers: history },
  );
  if (isRecord(generated)) {
    const roadmapInput = Array.isArray(generated.roadmap) ? generated.roadmap : [];
    const roadmap: RoadmapDraft[] = roadmapInput
      .filter(isRecord)
      .slice(0, 5)
      .map((item) => ({
        topic: text(item.topic, "Interview practice"),
        description: text(item.description, "Review this topic and practice explaining your approach."),
        priority: ["High", "Medium", "Low"].includes(text(item.priority))
          ? text(item.priority)
          : "Medium",
        practiceTask: text(item.practiceTask, "Write and rehearse a concise answer with one example."),
        estimatedMinutes: Math.max(15, Math.min(120, Math.round(score(item.estimatedMinutes, 30)))),
      }));
    return {
      data: {
        strengths: list(generated.strengths, ["You completed the interview."]),
        weaknesses: list(generated.weaknesses, ["Continue practicing clear, structured answers."]),
        topicsToRevise: list(generated.topicsToRevise, ["Structured interview answers"]),
        finalFeedback: text(generated.finalFeedback, "Review the feedback for each answer and practice the identified topics."),
        roadmap,
      },
      aiMode: "live",
    };
  }

  const strengths = history.flatMap((item) => item.scorecard.strengths).slice(0, 5);
  const weaknesses = history.flatMap((item) => item.scorecard.weaknesses).slice(0, 5);
  const topicsToRevise = [...new Set(history.flatMap((item) => item.scorecard.topicsToRevise))].slice(0, 5);
  const roadmap = topicsToRevise.slice(0, 5).map((topic, index) => ({
    topic,
    description: `Practice the concepts and explanations related to ${topic.toLowerCase()}.`,
    priority: index === 0 ? "High" : "Medium",
    practiceTask: `Write a concise explanation of ${topic.toLowerCase()} and answer one practice question aloud.`,
    estimatedMinutes: 30,
  }));
  return {
    data: {
      strengths: strengths.length ? strengths : ["You completed the interview."],
      weaknesses: weaknesses.length ? weaknesses : ["Keep building confidence with structured practice."],
      topicsToRevise: topicsToRevise.length ? topicsToRevise : ["Structured interview answers"],
      finalFeedback: "Review your answer-level feedback, then practice the topics listed below before your next interview.",
      roadmap,
    },
    aiMode: "demo",
  };
}
