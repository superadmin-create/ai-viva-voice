export type SubjectContent = {
  name: string;
  slug: string;
  modules: {
    title: string;
    topics: string[];
  }[];
};

export const SUBJECTS: Record<string, SubjectContent> = {};

export function getSubjectContent(slug: string): SubjectContent | undefined {
  return SUBJECTS[slug];
}

export function getAllSubjects(): SubjectContent[] {
  return Object.values(SUBJECTS);
}

export function buildSubjectPrompt(subject: SubjectContent): string {
  let prompt = `Subject: ${subject.name}\n\nCourse Content:\n`;
  
  subject.modules.forEach((module, index) => {
    prompt += `\nModule ${index + 1}: ${module.title}\n`;
    module.topics.forEach(topic => {
      prompt += `- ${topic}\n`;
    });
  });
  
  return prompt;
}
