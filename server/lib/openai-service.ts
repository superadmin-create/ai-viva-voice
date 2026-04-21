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
  
  let prompt: string;
  
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

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_tokens: 500,
  });

  const result = JSON.parse(response.choices[0].message.content || "{}");
  return result.questions || [];
}

export type AnswerEvaluation = {
  score: number;
  feedback: string;
  isCorrect: boolean;
};

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
