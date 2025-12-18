import type { Express } from "express";
import { type Server } from "http";
import { storage } from "./storage";
import { insertVivaResultSchema, insertSubjectSchema, insertManualQuestionSchema } from "@shared/schema";
import { generateVivaQuestions, evaluateAnswer, textToSpeech } from "./lib/openai-service";
import { syncVivaResultToSheet } from "./lib/google-sheets-service";
import { getAllSubjects, getSubjectContent } from "./lib/subject-content";
import { z } from "zod";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Get list of available subjects (combines built-in and custom)
  app.get("/api/subjects", async (req, res) => {
    try {
      const builtInSubjects = getAllSubjects().map(s => ({ 
        name: s.name, 
        slug: s.slug,
        isBuiltIn: true 
      }));
      
      const customSubjects = await storage.getSubjects();
      const customFormatted = customSubjects.map(s => ({
        id: s.id,
        name: s.name,
        slug: s.slug,
        isBuiltIn: false
      }));
      
      res.json([...builtInSubjects, ...customFormatted]);
    } catch (error: any) {
      console.error("Error fetching subjects:", error);
      res.status(500).json({ error: error.message || "Failed to fetch subjects" });
    }
  });

  // Get subject details
  app.get("/api/subjects/:slug", async (req, res) => {
    try {
      // Check built-in first
      const builtIn = getSubjectContent(req.params.slug);
      if (builtIn) {
        return res.json({ ...builtIn, isBuiltIn: true });
      }
      
      // Check custom subjects
      const custom = await storage.getSubjectBySlug(req.params.slug);
      if (custom) {
        return res.json({ 
          name: custom.name, 
          slug: custom.slug, 
          modules: custom.curriculum,
          isBuiltIn: false 
        });
      }
      
      res.status(404).json({ error: "Subject not found" });
    } catch (error: any) {
      console.error("Error fetching subject:", error);
      res.status(500).json({ error: error.message || "Failed to fetch subject" });
    }
  });

  // Create a new custom subject
  app.post("/api/admin/subjects", async (req, res) => {
    try {
      const validatedData = insertSubjectSchema.parse(req.body);
      const subject = await storage.createSubject(validatedData);
      res.json(subject);
    } catch (error: any) {
      console.error("Error creating subject:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: "Invalid data format", details: error.errors });
      }
      res.status(500).json({ error: error.message || "Failed to create subject" });
    }
  });

  // Update a custom subject
  app.put("/api/admin/subjects/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid ID" });
      }
      const subject = await storage.updateSubject(id, req.body);
      if (!subject) {
        return res.status(404).json({ error: "Subject not found" });
      }
      res.json(subject);
    } catch (error: any) {
      console.error("Error updating subject:", error);
      res.status(500).json({ error: error.message || "Failed to update subject" });
    }
  });

  // Delete a custom subject
  app.delete("/api/admin/subjects/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid ID" });
      }
      await storage.deleteSubject(id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting subject:", error);
      res.status(500).json({ error: error.message || "Failed to delete subject" });
    }
  });

  // Get manual questions for a subject
  app.get("/api/admin/subjects/:slug/questions", async (req, res) => {
    try {
      const questions = await storage.getManualQuestionsBySubject(req.params.slug);
      res.json(questions);
    } catch (error: any) {
      console.error("Error fetching questions:", error);
      res.status(500).json({ error: error.message || "Failed to fetch questions" });
    }
  });

  // Add a manual question
  app.post("/api/admin/questions", async (req, res) => {
    try {
      const validatedData = insertManualQuestionSchema.parse(req.body);
      const question = await storage.createManualQuestion(validatedData);
      res.json(question);
    } catch (error: any) {
      console.error("Error creating question:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: "Invalid data format", details: error.errors });
      }
      res.status(500).json({ error: error.message || "Failed to create question" });
    }
  });

  // Delete a manual question
  app.delete("/api/admin/questions/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid ID" });
      }
      await storage.deleteManualQuestion(id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting question:", error);
      res.status(500).json({ error: error.message || "Failed to delete question" });
    }
  });

  // Generate viva questions for a subject
  app.post("/api/viva/generate-questions", async (req, res) => {
    try {
      const { subject, count } = req.body;
      
      if (!subject) {
        return res.status(400).json({ error: "Subject is required" });
      }

      // First check for manual questions
      const manualQuestions = await storage.getManualQuestionsBySubject(subject);
      
      if (manualQuestions.length >= (count || 5)) {
        // Use manual questions only
        const questions = manualQuestions.slice(0, count || 5).map(q => q.questionText);
        return res.json({ questions });
      } else if (manualQuestions.length > 0) {
        // Mix manual and AI questions
        const manualTexts = manualQuestions.map(q => q.questionText);
        const aiCount = (count || 5) - manualQuestions.length;
        const aiQuestions = await generateVivaQuestions(subject, aiCount);
        return res.json({ questions: [...manualTexts, ...aiQuestions] });
      }

      // All AI questions
      const questions = await generateVivaQuestions(subject, count || 5);
      res.json({ questions });
    } catch (error: any) {
      console.error("Error generating questions:", error);
      res.status(500).json({ error: error.message || "Failed to generate questions" });
    }
  });

  // Evaluate a student's answer
  app.post("/api/viva/evaluate", async (req, res) => {
    try {
      const { question, answer, subject } = req.body;
      
      if (!question || !answer || !subject) {
        return res.status(400).json({ error: "Question, answer, and subject are required" });
      }

      const evaluation = await evaluateAnswer(question, answer, subject);
      res.json(evaluation);
    } catch (error: any) {
      console.error("Error evaluating answer:", error);
      res.status(500).json({ error: error.message || "Failed to evaluate answer" });
    }
  });

  // Convert text to speech
  app.post("/api/viva/text-to-speech", async (req, res) => {
    try {
      const { text } = req.body;
      
      if (!text) {
        return res.status(400).json({ error: "Text is required" });
      }

      const audioBuffer = await textToSpeech(text);
      
      res.set({
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.length
      });
      res.send(audioBuffer);
    } catch (error: any) {
      console.error("Error generating speech:", error);
      res.status(500).json({ error: error.message || "Failed to generate speech" });
    }
  });

  // Submit viva results with raw answers - evaluates in background
  app.post("/api/viva/submit-fast", async (req, res) => {
    try {
      const { studentName, studentEmail, studentPhone, subject, rawAnswers } = req.body;
      
      if (!studentName || !studentEmail || !studentPhone || !subject || !rawAnswers) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Create initial result with placeholder scores
      const placeholderTranscript = rawAnswers.map((ra: { question: string; answer: string }) => ({
        question: ra.question,
        answer: ra.answer,
        feedback: "Evaluating...",
        score: 0,
      }));

      const result = await storage.createVivaResult({
        studentName,
        studentEmail,
        studentPhone,
        subject,
        score: 0,
        maxScore: rawAnswers.length * 10,
        transcript: placeholderTranscript,
        status: "evaluating",
        sheetSynced: "pending",
      });

      // Return immediately
      res.json({ success: true, id: result.id });

      // Evaluate all answers in background
      (async () => {
        try {
          const evaluatedTranscript = await Promise.all(
            rawAnswers.map(async (ra: { question: string; answer: string }) => {
              try {
                const evaluation = await evaluateAnswer(ra.question, ra.answer, subject);
                return {
                  question: ra.question,
                  answer: ra.answer,
                  feedback: evaluation.feedback,
                  score: evaluation.score,
                };
              } catch (e) {
                return {
                  question: ra.question,
                  answer: ra.answer,
                  feedback: "Evaluation failed",
                  score: 5,
                };
              }
            })
          );

          const totalScore = evaluatedTranscript.reduce((sum, t) => sum + t.score, 0);
          
          // Update the result with evaluations
          await storage.updateVivaResult(result.id, {
            transcript: evaluatedTranscript,
            score: totalScore,
            status: "completed",
          });

          // Sync to Google Sheets
          const updatedResult = await storage.getVivaResultById(result.id);
          if (updatedResult) {
            try {
              await syncVivaResultToSheet(updatedResult);
              await storage.updateSheetSyncStatus(result.id, "synced");
            } catch (e) {
              await storage.updateSheetSyncStatus(result.id, "failed");
            }
          }
          
          console.log(`Viva ${result.id} evaluated: ${totalScore}/${rawAnswers.length * 10}`);
        } catch (error) {
          console.error("Background evaluation error:", error);
        }
      })();

    } catch (error: any) {
      console.error("Error submitting viva:", error);
      res.status(500).json({ error: error.message || "Failed to submit" });
    }
  });

  // Submit viva results - immediately syncs to Google Sheets
  app.post("/api/viva/submit", async (req, res) => {
    try {
      const validatedData = insertVivaResultSchema.parse(req.body);
      const result = await storage.createVivaResult(validatedData);
      
      // Immediately sync to Google Sheets and wait for completion
      try {
        await syncVivaResultToSheet(result);
        await storage.updateSheetSyncStatus(result.id, "synced");
        console.log(`Viva result ${result.id} synced to Google Sheets successfully`);
      } catch (sheetError: any) {
        console.error("Failed to sync to Google Sheets:", sheetError.message);
        await storage.updateSheetSyncStatus(result.id, "failed");
      }
      
      res.json(result);
    } catch (error: any) {
      console.error("Error submitting viva result:", error);
      
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: "Invalid data format", details: error.errors });
      }
      
      res.status(500).json({ error: error.message || "Failed to submit viva result" });
    }
  });

  // Get all viva results (admin only)
  app.get("/api/admin/results", async (req, res) => {
    try {
      const results = await storage.getVivaResults();
      res.json(results);
    } catch (error: any) {
      console.error("Error fetching results:", error);
      res.status(500).json({ error: error.message || "Failed to fetch results" });
    }
  });

  // Get viva result by ID (admin only)
  app.get("/api/admin/results/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid ID" });
      }

      const result = await storage.getVivaResultById(id);
      
      if (!result) {
        return res.status(404).json({ error: "Result not found" });
      }
      
      res.json(result);
    } catch (error: any) {
      console.error("Error fetching result:", error);
      res.status(500).json({ error: error.message || "Failed to fetch result" });
    }
  });

  // Get results by subject
  app.get("/api/admin/results/subject/:subject", async (req, res) => {
    try {
      const subject = req.params.subject;
      const results = await storage.getVivaResultsBySubject(subject);
      res.json(results);
    } catch (error: any) {
      console.error("Error fetching results by subject:", error);
      res.status(500).json({ error: error.message || "Failed to fetch results" });
    }
  });

  return httpServer;
}
