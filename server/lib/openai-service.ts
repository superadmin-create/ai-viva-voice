import OpenAI from "openai";
import { getSubjectContent, buildSubjectPrompt } from "./subject-content";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type QuestionGenerationResult = {
  questions: Array<{
    question: string;
    keywords: string[];
  }>;
};

export async function generateVivaQuestions(subjectSlug: string, count: number = 5): Promise<string[]> {
  const subjectContent = getSubjectContent(subjectSlug);
  
  let prompt: string;
  
  if (subjectContent) {
    const topics = subjectContent.modules.flatMap(m => m.topics).slice(0, 10).join(", ");
    prompt = `Generate ${count} short oral exam questions for "${subjectContent.name}". Topics: ${topics}. Return JSON: {"questions":["q1","q2",...]}`;
  } else {
    prompt = `Generate ${count} short oral exam questions for "${subjectSlug}". Return JSON: {"questions":["q1","q2",...]}`;
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
  
  let systemPrompt = `You are an expert examiner evaluating student responses in ${subjectName}.`;
  
  if (subjectContent) {
    const contentPrompt = buildSubjectPrompt(subjectContent);
    systemPrompt += `\n\nCourse Content for Reference:\n${contentPrompt}`;
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

export async function textToSpeech(text: string): Promise<Buffer> {
  const mp3 = await openai.audio.speech.create({
    model: "tts-1",
    voice: "alloy",
    input: text,
    speed: 1.15,
  });

  const buffer = Buffer.from(await mp3.arrayBuffer());
  return buffer;
}
