import type { Express } from "express";
import { type Server } from "http";
import { storage } from "./storage";
import { insertVivaResultSchema } from "@shared/schema";
import { generateVivaQuestions, evaluateAnswer, textToSpeech } from "./lib/openai-service";
import { syncVivaResultToSheet, createVivaResultsSheet } from "./lib/google-sheets-service";
import { getAllSubjects, getSubjectContent } from "./lib/subject-content";
import { z } from "zod";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Get list of available subjects
  app.get("/api/subjects", async (req, res) => {
    try {
      const subjects = getAllSubjects();
      res.json(subjects.map(s => ({ name: s.name, slug: s.slug })));
    } catch (error: any) {
      console.error("Error fetching subjects:", error);
      res.status(500).json({ error: error.message || "Failed to fetch subjects" });
    }
  });

  // Get subject details
  app.get("/api/subjects/:slug", async (req, res) => {
    try {
      const subject = getSubjectContent(req.params.slug);
      if (!subject) {
        return res.status(404).json({ error: "Subject not found" });
      }
      res.json(subject);
    } catch (error: any) {
      console.error("Error fetching subject:", error);
      res.status(500).json({ error: error.message || "Failed to fetch subject" });
    }
  });

  // Generate viva questions for a subject
  app.post("/api/viva/generate-questions", async (req, res) => {
    try {
      const { subject, count } = req.body;
      
      if (!subject) {
        return res.status(400).json({ error: "Subject is required" });
      }

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

  // Create a new Google Sheet for results (admin utility)
  app.post("/api/admin/create-sheet", async (req, res) => {
    try {
      const spreadsheetId = await createVivaResultsSheet();
      res.json({ 
        spreadsheetId,
        message: "Spreadsheet created successfully. Set GOOGLE_SHEET_ID environment variable to use it."
      });
    } catch (error: any) {
      console.error("Error creating sheet:", error);
      res.status(500).json({ error: error.message || "Failed to create sheet" });
    }
  });

  return httpServer;
}
