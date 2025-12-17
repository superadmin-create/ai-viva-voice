export type SubjectContent = {
  name: string;
  slug: string;
  modules: {
    title: string;
    topics: string[];
  }[];
};

export const SUBJECTS: Record<string, SubjectContent> = {
  "stock-market": {
    name: "Introduction to Stock Market",
    slug: "stock-market",
    modules: [
      {
        title: "Time Value of Money, Compounding and Equity Market Basics",
        topics: [
          "Introduction to investing",
          "Why Invest and not just save",
          "Curiosity is mind in search of Knowledge",
          "8th Wonder of the World - Compound Interest",
          "Asset Classes and their peculiarities",
          "The big picture of financial markets",
          "Market Microstructure",
          "Trading vs Investing differences"
        ]
      },
      {
        title: "Introduction to Technical Analysis",
        topics: [
          "The Trade Saga",
          "Traders Dictionary & Jargons",
          "Support and Resistance levels",
          "Momentum Indicators and Oscillators"
        ]
      },
      {
        title: "Introduction to Fundamental Analysis and Behavioural Aspects",
        topics: [
          "Understanding Fundamental Analysis",
          "Wealth creation principles",
          "Using Screener tools",
          "Stock Analysis methods",
          "Case Studies of successful companies",
          "Financial Analysis Documents"
        ]
      },
      {
        title: "Components and Execution of a Trading System",
        topics: [
          "Trading psychology mental cycle",
          "Behavioural Biases in trading",
          "Self Check for Traders",
          "Self Check for Investors",
          "Automated Trade Checker",
          "GTT Orders and Types of orders",
          "Price Alerts"
        ]
      }
    ]
  },
  "personal-finance": {
    name: "Personal Finance",
    slug: "personal-finance",
    modules: [
      {
        title: "Time Value of Money, Compounding and Financial Planning",
        topics: [
          "Rules of Money",
          "Plan for Life",
          "SMART Goals for financial planning",
          "Understanding Inflation",
          "Rule of 72",
          "Annuities and their types",
          "Government Financial Initiatives"
        ]
      },
      {
        title: "Savings and Investments",
        topics: [
          "Types of Equity investments",
          "Types of Debt Investment",
          "Real Estate Investment Types",
          "Gold Investment options"
        ]
      },
      {
        title: "Insurance",
        topics: [
          "Insurance fundamentals",
          "Life Insurance Types",
          "Health Insurance",
          "Auto Insurance",
          "Home Insurance",
          "Key Insurance Terms"
        ]
      },
      {
        title: "Loans",
        topics: [
          "Types of Loan",
          "Business Loan",
          "Credit Card management",
          "CIBIL Score importance",
          "EMI calculations"
        ]
      },
      {
        title: "Financial Planning (Bonus)",
        topics: [
          "Budgeting basics",
          "Savings & Investment strategies",
          "Retirement Planning",
          "Insurance Planning",
          "Tax Planning",
          "Estate Planning",
          "Creating a sample financial plan"
        ]
      }
    ]
  }
};

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
