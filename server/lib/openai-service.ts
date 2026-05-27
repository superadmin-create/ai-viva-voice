import OpenAI from "openai";
import { getSubjectContent, buildSubjectPrompt } from "./subject-content";
import { storage } from "../storage";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type QuestionGenerationResult = {
  questions: Array<{
    question: string;
    keywords: string[];
  }>;
};

export type DimensionScores = {
  contentAccuracy: number;
  confidence: number;
  clarity: number;
  salesEffectiveness: number;
};

export type AnswerEvaluation = {
  score: number;
  feedback: string;
  isCorrect: boolean;
  dimensionScores?: DimensionScores;
};

async function getDocumentContext(subjectSlug: string): Promise<string> {
  const docs = await storage.getDocumentsBySubject(subjectSlug);
  if (docs.length === 0) return "";
  const combined = docs.map(d => d.extractedText).join("\n\n");
  return combined;
}

export async function generateVivaQuestions(subjectSlug: string, count: number = 5): Promise<string[]> {
  const subjectContent = getSubjectContent(subjectSlug);
  const documentContext = await getDocumentContext(subjectSlug);
  const subjectRecord = await storage.getSubjectBySlug(subjectSlug);
  const isSales = subjectRecord?.subjectType === "sales";

  let prompt: string;

  if (isSales) {
    const context = documentContext
      ? `Use the following sales training material to make your questions highly specific and relevant:\n\n${documentContext}\n\n`
      : "";
    prompt = `${context}You are a skeptical but realistic B2B/B2C prospect being approached by a sales rep for the subject: "${subjectRecord?.name || subjectSlug}".

Generate ${count} roleplay-style sales conversation questions that a prospect would naturally ask or that test key sales skills. Focus on objection handling, product knowledge, value proposition, and closing. Each question should feel like something a real prospect would say or challenge the salesperson with.

Examples of the style:
- "Why should I choose your product over the competition?"
- "What's the ROI if I invest in this?"
- "I've heard mixed reviews — can you convince me?"
- "We already have a solution. Why switch?"

Return JSON: {"questions":["q1","q2",...]}`;
  } else {
    if (subjectContent) {
      const topics = subjectContent.modules.flatMap(m => m.topics).slice(0, 10).join(", ");
      prompt = `Generate ${count} short oral exam questions for "${subjectContent.name}". Topics: ${topics}.`;
    } else {
      prompt = `Generate ${count} short oral exam questions for "${subjectSlug}".`;
    }

    if (documentContext) {
      prompt += `\n\nAlso use the following reference material from uploaded documents to form relevant questions:\n\n${documentContext}`;
    }

    if (subjectRecord?.instructions?.trim()) {
      prompt += `\n\nSpecial exam instructions from the examiner (follow these strictly when generating questions):\n${subjectRecord.instructions.trim()}`;
    }

    prompt += `\n\nReturn JSON: {"questions":["q1","q2",...]}`;
  }

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_tokens: 500,
  });

  const result = JSON.parse(response.choices[0].message.content || "{}");
  return result.questions || [];
}

export async function evaluateAnswer(
  question: string,
  answer: string,
  subjectSlug: string
): Promise<AnswerEvaluation> {
  const subjectContent = getSubjectContent(subjectSlug);
  const subjectName = subjectContent?.name || subjectSlug;
  const documentContext = await getDocumentContext(subjectSlug);
  
  let systemPrompt = `You are an expert examiner evaluating student responses in ${subjectName}.`;
  
  if (subjectContent) {
    const contentPrompt = buildSubjectPrompt(subjectContent);
    systemPrompt += `\n\nCourse Content for Reference:\n${contentPrompt}`;
  }

  if (documentContext) {
    systemPrompt += `\n\nReference Material from Uploaded Documents:\n${documentContext}`;
  }
  
  systemPrompt += `\n\nEvaluate the student's answer and provide:
1. A score from 0-10 (be fair but rigorous)
2. Constructive feedback explaining what was good and what could be improved
3. Whether the answer demonstrates understanding of the concept

Respond in JSON format: { "score": number, "feedback": string, "isCorrect": boolean }`;

  const response = await openai.chat.completions.create({
    model: "gpt-5",
    messages: [
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "user",
        content: `Question: ${question}\n\nStudent Answer: ${answer}\n\nEvaluate this answer.`
      }
    ],
    response_format: { type: "json_object" }
  });

  const result = JSON.parse(response.choices[0].message.content || "{}");
  return {
    score: result.score || 0,
    feedback: result.feedback || "No feedback available",
    isCorrect: result.isCorrect || false
  };
}

export async function evaluateAnswersBatch(
  answers: Array<{ question: string; answer: string }>,
  subjectSlug: string
): Promise<AnswerEvaluation[]> {
  const subjectContent = getSubjectContent(subjectSlug);
  const subjectName = subjectContent?.name || subjectSlug;
  const documentContext = await getDocumentContext(subjectSlug);
  const subjectRecord = await storage.getSubjectBySlug(subjectSlug);
  const isSales = subjectRecord?.subjectType === "sales";

  if (isSales) {
    return evaluateSalesAnswersBatch(answers, subjectName, documentContext, subjectRecord?.instructions);
  }

  let systemPrompt = `You are an expert examiner evaluating student responses in ${subjectName}.`;

  if (subjectContent) {
    const contentPrompt = buildSubjectPrompt(subjectContent);
    systemPrompt += `\n\nCourse Content for Reference:\n${contentPrompt}`;
  }

  if (documentContext) {
    systemPrompt += `\n\nReference Material from Uploaded Documents:\n${documentContext}`;
  }

  if (subjectRecord?.instructions?.trim()) {
    systemPrompt += `\n\nSpecial exam instructions from the examiner (follow these strictly when evaluating):\n${subjectRecord.instructions.trim()}`;
  }

  systemPrompt += `\n\nYou will receive multiple question-answer pairs. Evaluate each one individually and provide:
1. A score from 0-10 (be fair but rigorous)
2. Constructive feedback explaining what was good and what could be improved
3. Whether the answer demonstrates understanding of the concept

Respond in JSON format: { "evaluations": [{ "score": number, "feedback": string, "isCorrect": boolean }, ...] }
The evaluations array must be in the same order as the questions provided.`;

  const qaList = answers.map((a, i) => `--- Answer ${i + 1} ---\nQuestion: ${a.question}\nStudent Answer: ${a.answer}`).join("\n\n");

  const response = await openai.chat.completions.create({
    model: "gpt-5",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Evaluate all of the following answers:\n\n${qaList}` }
    ],
    response_format: { type: "json_object" }
  });

  const result = JSON.parse(response.choices[0].message.content || "{}");
  const evaluations: AnswerEvaluation[] = (result.evaluations || []).map((e: any) => ({
    score: e.score || 0,
    feedback: e.feedback || "No feedback available",
    isCorrect: e.isCorrect || false,
  }));

  while (evaluations.length < answers.length) {
    evaluations.push({ score: 0, feedback: "Evaluation failed", isCorrect: false });
  }

  return evaluations;
}

async function evaluateSalesAnswersBatch(
  answers: Array<{ question: string; answer: string }>,
  subjectName: string,
  documentContext: string,
  instructions?: string | null
): Promise<AnswerEvaluation[]> {
  let systemPrompt = `You are an expert sales coach evaluating a sales representative's performance during a mock sales roleplay for "${subjectName}".

You will evaluate each response across 4 dimensions, each scored 0–10:
1. **Content Accuracy** — Is the information factually correct, relevant, and well-informed about the product/service?
2. **Confidence** — Does the response sound assured, not hesitant or vague?
3. **Clarity** — Is the answer clear, concise, and easy for a prospect to understand?
4. **Sales Effectiveness** — Does the answer address the prospect's concern, overcome objections, and move the sale forward?

The overall score (0–10) should be the average of the four dimension scores, rounded to the nearest integer.`;

  if (documentContext) {
    systemPrompt += `\n\nReference Material from Uploaded Training Documents:\n${documentContext}`;
  }

  if (instructions?.trim()) {
    systemPrompt += `\n\nAdditional evaluation instructions:\n${instructions.trim()}`;
  }

  systemPrompt += `\n\nRespond in JSON format:
{
  "evaluations": [
    {
      "score": number,
      "feedback": string,
      "isCorrect": boolean,
      "dimensionScores": {
        "contentAccuracy": number,
        "confidence": number,
        "clarity": number,
        "salesEffectiveness": number
      }
    },
    ...
  ]
}
The evaluations array must be in the same order as the questions provided.`;

  const qaList = answers.map((a, i) => `--- Response ${i + 1} ---\nProspect: ${a.question}\nSales Rep: ${a.answer}`).join("\n\n");

  const response = await openai.chat.completions.create({
    model: "gpt-5",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Evaluate all of the following sales roleplay responses:\n\n${qaList}` }
    ],
    response_format: { type: "json_object" }
  });

  const result = JSON.parse(response.choices[0].message.content || "{}");
  const evaluations: AnswerEvaluation[] = (result.evaluations || []).map((e: any) => ({
    score: e.score || 0,
    feedback: e.feedback || "No feedback available",
    isCorrect: e.isCorrect || false,
    dimensionScores: e.dimensionScores ? {
      contentAccuracy: e.dimensionScores.contentAccuracy || 0,
      confidence: e.dimensionScores.confidence || 0,
      clarity: e.dimensionScores.clarity || 0,
      salesEffectiveness: e.dimensionScores.salesEffectiveness || 0,
    } : undefined,
  }));

  while (evaluations.length < answers.length) {
    evaluations.push({ score: 0, feedback: "Evaluation failed", isCorrect: false });
  }

  return evaluations;
}

// Known Whisper hallucinations that appear when audio is silence/noise
const WHISPER_HALLUCINATIONS = new Set([
  "you", "you.", "you you", "you you.", "you you you", "you you you.",
  "thank you", "thank you.", "thank you for watching", "thank you for watching.",
  "thanks", "thanks.", "thanks for watching", "thanks for watching.",
  "bye", "bye.", "goodbye", "goodbye.",
  "ok", "ok.", "okay", "okay.",
  "yeah", "yeah.", "yep", "yep.", "yes", "yes.",
  "hmm", "hmm.", "mm-hmm", "mm-hmm.", "uh-huh", "uh-huh.",
  "um", "um.", "uh", "uh.", "ah", "ah.",
  ".", "..", "...",
  "subtitles by", "subtitles by the", "[music]", "[applause]",
]);

export async function transcribeAudio(audioBuffer: Buffer, mimeType: string = "audio/webm"): Promise<string> {
  // Reject audio that is too small to contain real speech (< 10 KB)
  if (audioBuffer.length < 10000) return "";

  const ext = mimeType.includes("wav") ? "wav" : mimeType.includes("mp4") ? "mp4" : "webm";
  const file = new File([audioBuffer], `audio.${ext}`, { type: mimeType });

  const transcription = await openai.audio.transcriptions.create({
    model: "whisper-1",
    file,
    language: "en",
    // Prompt steers Whisper toward academic speech and away from hallucinations on silence
    prompt: "Student answering an oral exam question in English. Spoken academic response:",
  });

  const text = (transcription.text || "").trim();

  // Filter out known Whisper hallucinations (common when audio is near-silence)
  if (!text || WHISPER_HALLUCINATIONS.has(text.toLowerCase())) return "";

  return text;
}

export async function textToSpeech(text: string): Promise<Buffer> {
  const mp3 = await openai.audio.speech.create({
    model: "tts-1",
    voice: "alloy",
    input: text,
  });

  const buffer = Buffer.from(await mp3.arrayBuffer());
  return buffer;
}
