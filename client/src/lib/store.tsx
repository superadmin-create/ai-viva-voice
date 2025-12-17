import React, { createContext, useContext, useState, ReactNode } from "react";

export type VivaResult = {
  id: string;
  studentName: string;
  studentEmail: string;
  studentPhone: string;
  subject: string;
  score: number;
  maxScore: number;
  transcript: { question: string; answer: string; feedback: string }[];
  timestamp: string;
  status: "completed" | "pending";
};

type AppContextType = {
  results: VivaResult[];
  addResult: (result: VivaResult) => void;
};

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [results, setResults] = useState<VivaResult[]>([
    {
      id: "1",
      studentName: "John Doe",
      studentEmail: "john@example.com",
      studentPhone: "555-0123",
      subject: "javascript",
      score: 8,
      maxScore: 10,
      transcript: [
        { 
          question: "What is a closure?", 
          answer: "A closure is the combination of a function bundled together with references to its surrounding state.", 
          feedback: "Correct. Good explanation." 
        }
      ],
      timestamp: new Date(Date.now() - 86400000).toISOString(),
      status: "completed"
    },
    {
      id: "2",
      studentName: "Jane Smith",
      studentEmail: "jane@example.com",
      studentPhone: "555-0199",
      subject: "react",
      score: 9,
      maxScore: 10,
      transcript: [],
      timestamp: new Date().toISOString(),
      status: "completed"
    }
  ]);

  const addResult = (result: VivaResult) => {
    setResults((prev) => [result, ...prev]);
  };

  return (
    <AppContext.Provider value={{ results, addResult }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppStore() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error("useAppStore must be used within an AppProvider");
  }
  return context;
}
