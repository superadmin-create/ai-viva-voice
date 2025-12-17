export type Question = {
  id: string;
  text: string;
  keywords: string[]; // Simple keyword matching for mock scoring
};

export const SUBJECTS: Record<string, Question[]> = {
  javascript: [
    {
      id: "js1",
      text: "Explain the difference between let, const, and var.",
      keywords: ["block scope", "reassign", "function scope", "hoisting"]
    },
    {
      id: "js2",
      text: "What is the Event Loop in JavaScript?",
      keywords: ["call stack", "queue", "asynchronous", "single threaded"]
    },
    {
      id: "js3",
      text: "How does 'this' keyword work?",
      keywords: ["context", "object", "execution", "arrow function"]
    }
  ],
  react: [
    {
      id: "r1",
      text: "What are React Hooks and why do we use them?",
      keywords: ["state", "lifecycle", "functional components", "class"]
    },
    {
      id: "r2",
      text: "Explain the Virtual DOM.",
      keywords: ["performance", "copy", "diffing", "render"]
    },
    {
      id: "r3",
      text: "What is prop drilling and how can we avoid it?",
      keywords: ["context", "redux", "state management", "passing data"]
    }
  ],
  history: [
    {
      id: "h1",
      text: "What were the main causes of World War 1?",
      keywords: ["alliances", "imperialism", "militarism", "nationalism", "assassination"]
    },
    {
      id: "h2",
      text: "Who was the first President of the United States?",
      keywords: ["washington", "george"]
    }
  ],
  general: [
    {
      id: "g1",
      text: "Tell me about yourself.",
      keywords: ["name", "student", "study"]
    },
    {
      id: "g2",
      text: "Why did you choose this subject?",
      keywords: ["interest", "career", "passion"]
    }
  ]
};

export function getQuestionsForSubject(subject: string): Question[] {
  const normalized = subject.toLowerCase();
  return SUBJECTS[normalized] || SUBJECTS['general'];
}
