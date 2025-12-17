import OpenAI from "openai";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type QuestionGenerationResult = {
  questions: Array<{
    question: string;
    keywords: string[];
  }>;
};

export async function generateVivaQuestions(subject: string, count: number = 5): Promise<string[]> {
  const response = await openai.chat.completions.create({
    model: "gpt-5",
    messages: [
      {
        role: "system",
        content: `You are an expert examiner creating oral examination questions. Generate ${count} challenging but fair viva voce questions for the subject: ${subject}. Return ONLY a JSON array of question strings.`
      },
      {
        role: "user",
        content: `Generate ${count} viva questions for ${subject}.`
      }
    ],
    response_format: { type: "json_object" }
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
  subject: string
): Promise<AnswerEvaluation> {
  const response = await openai.chat.completions.create({
    model: "gpt-5",
    messages: [
      {
        role: "system",
        content: `You are an expert examiner evaluating student responses in ${subject}. Evaluate the answer and provide:
1. A score from 0-10
2. Constructive feedback
3. Whether the answer is correct

Respond in JSON format: { "score": number, "feedback": string, "isCorrect": boolean }`
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
  });

  const buffer = Buffer.from(await mp3.arrayBuffer());
  return buffer;
}
