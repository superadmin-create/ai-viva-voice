import type { Express, Request, Response, NextFunction } from "express";
import { type Server } from "http";
import { storage } from "./storage";
import { insertVivaResultSchema, insertSubjectSchema, insertManualQuestionSchema } from "@shared/schema";
import { generateVivaQuestions, evaluateAnswer, evaluateAnswersBatch, textToSpeech, transcribeAudio } from "./lib/openai-service";
import { syncVivaResultToSheet } from "./lib/google-sheets-service";
import { getAllSubjects, getSubjectContent } from "./lib/subject-content";
import { z } from "zod";
import { scryptSync, randomBytes, timingSafeEqual } from "crypto";
import multer from "multer";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import { sendOTP, verifyOTP } from "./lib/email-service";

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    cb(null, allowed.includes(file.mimetype));
  }
});

const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype.startsWith('audio/'));
  }
});

declare module "express-session" {
  interface SessionData {
    userId: string;
  }
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  const hashBuffer = Buffer.from(hash, "hex");
  const derivedHash = scryptSync(password, salt, 64);
  return timingSafeEqual(hashBuffer, derivedHash);
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  next();
}

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  const user = await storage.getUser(req.session.userId);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

async function seedDefaultAdmin() {
  const existing = await storage.getUserByUsername("admin");
  if (!existing) {
    await storage.createUser({
      username: "admin",
      password: hashPassword("admin123"),
      role: "admin",
    });
    console.log("Default admin user created (username: admin, password: admin123)");
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  await seedDefaultAdmin();

  // Auth routes
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
      }
      const user = await storage.getUserByUsername(username);
      if (!user || !verifyPassword(password, user.password)) {
        return res.status(401).json({ error: "Invalid username or password" });
      }
      req.session.userId = user.id;
      res.json({ id: user.id, username: user.username, role: user.role });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Login failed" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) return res.status(500).json({ error: "Logout failed" });
      res.json({ success: true });
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const user = await storage.getUser(req.session.userId);
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }
    res.json({ id: user.id, username: user.username, role: user.role });
  });

  // User management routes (admin only)
  app.get("/api/admin/users", requireAdmin, async (req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      res.json(allUsers.map(u => ({ id: u.id, username: u.username, role: u.role })));
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to fetch users" });
    }
  });

  app.post("/api/admin/users", requireAdmin, async (req, res) => {
    try {
      const { username, password, role } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
      }
      const existing = await storage.getUserByUsername(username);
      if (existing) {
        return res.status(400).json({ error: "Username already exists" });
      }
      const user = await storage.createUser({
        username,
        password: hashPassword(password),
        role: role || "admin",
      });
      res.json({ id: user.id, username: user.username, role: user.role });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to create user" });
    }
  });

  app.delete("/api/admin/users/:id", requireAdmin, async (req, res) => {
    try {
      if (req.params.id === req.session.userId) {
        return res.status(400).json({ error: "Cannot delete your own account" });
      }
      await storage.deleteUser(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to delete user" });
    }
  });

  app.put("/api/admin/users/:id/password", requireAdmin, async (req, res) => {
    try {
      const { password } = req.body;
      if (!password) {
        return res.status(400).json({ error: "Password is required" });
      }
      await storage.updateUserPassword(req.params.id, hashPassword(password));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to update password" });
    }
  });

  // Get list of available subjects (combines built-in and custom)
  // Includes createdBy for authenticated users only
  app.get("/api/subjects", async (req, res) => {
    try {
      const isAuthenticated = !!req.session.userId;
      const builtInSubjects = getAllSubjects().map(s => ({ 
        name: s.name, 
        slug: s.slug,
        isBuiltIn: true,
        ...(isAuthenticated ? { createdBy: null } : {}),
      }));
      
      const customSubjects = await storage.getSubjects();
      const customFormatted = customSubjects.map(s => ({
        id: s.id,
        name: s.name,
        slug: s.slug,
        isBuiltIn: false,
        ...(isAuthenticated ? { createdBy: s.createdBy } : {}),
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
          instructions: custom.instructions ?? null,
          isBuiltIn: false 
        });
      }
      
      res.status(404).json({ error: "Subject not found" });
    } catch (error: any) {
      console.error("Error fetching subject:", error);
      res.status(500).json({ error: error.message || "Failed to fetch subject" });
    }
  });

  // Create a new custom subject (any authenticated user)
  app.post("/api/admin/subjects", requireAuth, async (req, res) => {
    try {
      const validatedData = insertSubjectSchema.parse({
        ...req.body,
        createdBy: req.session.userId,
      });
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

  // Update a custom subject (admin: any, user: own only)
  app.put("/api/admin/subjects/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid ID" });
      }
      const currentUser = await storage.getUser(req.session.userId!);
      if (currentUser?.role !== "admin") {
        const existing = await storage.getSubjects();
        const target = existing.find(s => s.id === id);
        if (!target || target.createdBy !== req.session.userId) {
          return res.status(403).json({ error: "You can only update your own subjects" });
        }
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

  // Delete a custom subject (admin: any, user: own only)
  app.delete("/api/admin/subjects/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid ID" });
      }
      const currentUser = await storage.getUser(req.session.userId!);
      if (currentUser?.role !== "admin") {
        const existing = await storage.getSubjects();
        const target = existing.find(s => s.id === id);
        if (!target || target.createdBy !== req.session.userId) {
          return res.status(403).json({ error: "You can only delete your own subjects" });
        }
      }
      await storage.deleteSubject(id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting subject:", error);
      res.status(500).json({ error: error.message || "Failed to delete subject" });
    }
  });

  // Get manual questions for a subject (admin: any, user: own subjects only)
  app.get("/api/admin/subjects/:slug/questions", requireAuth, async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      if (currentUser?.role !== "admin") {
        const subject = await storage.getSubjectBySlug(req.params.slug);
        if (subject && subject.createdBy !== req.session.userId) {
          return res.status(403).json({ error: "Access denied" });
        }
      }
      const questions = await storage.getManualQuestionsBySubject(req.params.slug);
      res.json(questions);
    } catch (error: any) {
      console.error("Error fetching questions:", error);
      res.status(500).json({ error: error.message || "Failed to fetch questions" });
    }
  });

  // Add a manual question (admin: any, user: own subjects only)
  app.post("/api/admin/questions", requireAuth, async (req, res) => {
    try {
      const validatedData = insertManualQuestionSchema.parse(req.body);
      const currentUser = await storage.getUser(req.session.userId!);
      if (currentUser?.role !== "admin") {
        const subject = await storage.getSubjectBySlug(validatedData.subjectSlug);
        if (subject && subject.createdBy !== req.session.userId) {
          return res.status(403).json({ error: "You can only add questions to your own subjects" });
        }
      }
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

  // Add multiple manual questions at once
  app.post("/api/admin/questions/bulk", requireAuth, async (req, res) => {
    try {
      const { subjectSlug, questions } = req.body;
      if (!subjectSlug || !Array.isArray(questions) || questions.length === 0) {
        return res.status(400).json({ error: "subjectSlug and questions array are required" });
      }
      const currentUser = await storage.getUser(req.session.userId!);
      if (currentUser?.role !== "admin") {
        const subject = await storage.getSubjectBySlug(subjectSlug);
        if (subject && subject.createdBy !== req.session.userId) {
          return res.status(403).json({ error: "You can only add questions to your own subjects" });
        }
      }
      const created = await Promise.all(
        questions.map((q: string) =>
          storage.createManualQuestion({ subjectSlug, questionText: q.trim() })
        )
      );
      res.json({ count: created.length, questions: created });
    } catch (error: any) {
      console.error("Error creating bulk questions:", error);
      res.status(500).json({ error: error.message || "Failed to create questions" });
    }
  });

  // Delete a manual question (admin: any, user: own subjects only)
  app.delete("/api/admin/questions/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid ID" });
      }
      const currentUser = await storage.getUser(req.session.userId!);
      if (currentUser?.role !== "admin") {
        const allSubjectQuestions = await Promise.all(
          (await storage.getSubjectsByCreator(req.session.userId!)).map(async s => {
            const qs = await storage.getManualQuestionsBySubject(s.slug);
            return qs.map(q => q.id);
          })
        );
        const ownedQuestionIds = allSubjectQuestions.flat();
        if (!ownedQuestionIds.includes(id)) {
          return res.status(403).json({ error: "You can only delete questions from your own subjects" });
        }
      }
      await storage.deleteManualQuestion(id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting question:", error);
      res.status(500).json({ error: error.message || "Failed to delete question" });
    }
  });

  app.put("/api/admin/questions/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid ID" });
      }
      const { questionText } = req.body;
      if (!questionText || !questionText.trim()) {
        return res.status(400).json({ error: "Question text is required" });
      }
      const currentUser = await storage.getUser(req.session.userId!);
      if (currentUser?.role !== "admin") {
        const allSubjectQuestions = await Promise.all(
          (await storage.getSubjectsByCreator(req.session.userId!)).map(async s => {
            const qs = await storage.getManualQuestionsBySubject(s.slug);
            return qs.map(q => q.id);
          })
        );
        const ownedQuestionIds = allSubjectQuestions.flat();
        if (!ownedQuestionIds.includes(id)) {
          return res.status(403).json({ error: "You can only edit questions from your own subjects" });
        }
      }
      const updated = await storage.updateManualQuestion(id, questionText.trim());
      if (!updated) {
        return res.status(404).json({ error: "Question not found" });
      }
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating question:", error);
      res.status(500).json({ error: error.message || "Failed to update question" });
    }
  });

  // Upload document for a subject
  app.post("/api/admin/documents", requireAuth, (req: any, res, next) => {
    upload.single('file')(req, res, (err: any) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ error: "File is too large. Maximum size is 50MB." });
        }
        return res.status(400).json({ error: err.message || "File upload failed" });
      }
      next();
    });
  }, async (req: any, res) => {
    try {
      const file = req.file;
      const { subjectSlug } = req.body;
      if (!file || !subjectSlug) {
        return res.status(400).json({ error: "File and subjectSlug are required" });
      }

      const subject = await storage.getSubjectBySlug(subjectSlug);
      if (!subject) {
        return res.status(404).json({ error: "Subject not found. Documents can only be uploaded to existing custom subjects." });
      }
      const currentUser = await storage.getUser(req.session.userId!);
      if (currentUser?.role !== "admin" && subject.createdBy !== req.session.userId) {
        return res.status(403).json({ error: "You can only upload documents to your own subjects" });
      }

      let extractedText = "";
      if (file.mimetype === 'application/pdf') {
        const parser = new PDFParse({ data: new Uint8Array(file.buffer), verbosity: 0 });
        await parser.load();
        const pdfResult = await parser.getText();
        extractedText = pdfResult.text || "";
        parser.destroy();
      } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const result = await mammoth.extractRawText({ buffer: file.buffer });
        extractedText = result.value;
      }

      if (!extractedText.trim()) {
        return res.status(400).json({ error: "Could not extract text from the uploaded file" });
      }

      const fileData = file.buffer.toString('base64');
      const doc = await storage.createSubjectDocument({
        subjectSlug,
        fileName: file.originalname,
        fileType: file.mimetype,
        fileData,
        extractedText,
      });

      res.json({ id: doc.id, fileName: doc.fileName, fileType: doc.fileType, createdAt: doc.createdAt, textLength: extractedText.length });
    } catch (error: any) {
      console.error("Error uploading document:", error);
      res.status(500).json({ error: error.message || "Failed to upload document" });
    }
  });

  // Get documents for a subject
  app.get("/api/admin/documents/:subjectSlug", requireAuth, async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      if (currentUser?.role !== "admin") {
        const subject = await storage.getSubjectBySlug(req.params.subjectSlug);
        if (subject && subject.createdBy !== req.session.userId) {
          return res.status(403).json({ error: "Access denied" });
        }
      }
      const docs = await storage.getDocumentsBySubject(req.params.subjectSlug);
      res.json(docs.map(d => ({ id: d.id, fileName: d.fileName, fileType: d.fileType, subjectSlug: d.subjectSlug, createdAt: d.createdAt, textLength: d.extractedText.length })));
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to fetch documents" });
    }
  });

  // Delete a document
  app.delete("/api/admin/documents/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

      const doc = await storage.getSubjectDocument(id);
      if (!doc) return res.status(404).json({ error: "Document not found" });

      const currentUser = await storage.getUser(req.session.userId!);
      if (currentUser?.role !== "admin") {
        const subject = await storage.getSubjectBySlug(doc.subjectSlug);
        if (!subject || subject.createdBy !== req.session.userId) {
          return res.status(403).json({ error: "You can only delete documents from your own subjects" });
        }
      }

      await storage.deleteSubjectDocument(id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to delete document" });
    }
  });

  // Record a terminated viva attempt (tab-switch / navigation away)
  app.post("/api/viva/record-terminated", async (req, res) => {
    try {
      const { studentName, studentEmail, studentPhone, studentClass, studentDivision, studentRollNumber, subject } = req.body;
      if (!studentEmail || !subject) {
        return res.status(400).json({ error: "studentEmail and subject are required" });
      }
      await storage.createVivaResult({
        studentName: studentName || "",
        studentEmail,
        studentPhone: studentPhone || "",
        studentClass: studentClass || "",
        studentDivision: studentDivision || "",
        studentRollNumber: studentRollNumber || "",
        subject,
        score: 0,
        maxScore: 0,
        transcript: [],
        status: "terminated",
        sheetSynced: "skip",
      });
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error recording terminated attempt:", error);
      res.status(500).json({ error: "Failed to record attempt" });
    }
  });

  // Send OTP to student email
  app.post("/api/otp/send", async (req, res) => {
    try {
      const { email, subject } = req.body;
      if (!email || !email.includes('@')) {
        return res.status(400).json({ error: "Valid email is required" });
      }
      // Check attempt limit before sending OTP
      if (subject) {
        const attempts = await storage.countVivaAttempts(email, subject);
        if (attempts >= 2) {
          return res.status(400).json({ error: "You have reached the maximum number of attempts (2) for this subject." });
        }
      }
      const result = await sendOTP(email);
      if (result.success) {
        res.json({ success: true, message: "OTP sent to your email" });
      } else {
        res.status(400).json({ error: result.error || "Failed to send OTP" });
      }
    } catch (error: any) {
      console.error("Error sending OTP:", error);
      res.status(500).json({ error: "Failed to send OTP" });
    }
  });

  // Verify OTP
  app.post("/api/otp/verify", async (req, res) => {
    try {
      const { email, otp } = req.body;
      if (!email || !otp) {
        return res.status(400).json({ error: "Email and OTP are required" });
      }
      const result = verifyOTP(email, otp);
      if (result.valid) {
        res.json({ success: true, message: "Email verified" });
      } else {
        res.status(400).json({ error: result.error || "Invalid OTP" });
      }
    } catch (error: any) {
      console.error("Error verifying OTP:", error);
      res.status(500).json({ error: "Failed to verify OTP" });
    }
  });

  // Check attempt limit for a student/subject combo
  app.get("/api/viva/check-attempts", async (req, res) => {
    try {
      const { email, subject } = req.query as { email?: string; subject?: string };
      if (!email || !subject) {
        return res.json({ limitReached: false, count: 0 });
      }
      const count = await storage.countVivaAttempts(email, subject);
      res.json({ limitReached: count >= 2, count });
    } catch (error) {
      console.error("Error checking attempts:", error);
      res.json({ limitReached: false, count: 0 });
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

      const shuffle = <T>(arr: T[]): T[] =>
        arr.map(v => ({ v, sort: Math.random() })).sort((a, b) => a.sort - b.sort).map(({ v }) => v);

      if (manualQuestions.length >= (count || 5)) {
        // Use manual questions only, shuffled
        const questions = shuffle(manualQuestions).slice(0, count || 5).map(q => q.questionText);
        return res.json({ questions });
      } else if (manualQuestions.length > 0) {
        // Mix manual and AI questions, shuffle the whole set
        const manualTexts = shuffle(manualQuestions).map(q => q.questionText);
        const aiCount = (count || 5) - manualTexts.length;
        const aiQuestions = await generateVivaQuestions(subject, aiCount);
        return res.json({ questions: shuffle([...manualTexts, ...aiQuestions]) });
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

  app.post("/api/viva/transcribe", audioUpload.single("audio"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "Audio file is required" });
      }

      const mimeType = req.file.mimetype || "audio/webm";
      const text = await transcribeAudio(req.file.buffer, mimeType);
      res.json({ text });
    } catch (error: any) {
      console.error("Error transcribing audio:", error);
      res.status(500).json({ error: error.message || "Failed to transcribe audio" });
    }
  });

  // Submit viva results with raw answers - evaluates in background
  app.post("/api/viva/submit-fast", async (req, res) => {
    try {
      const { studentName, studentEmail, studentPhone, studentClass, studentDivision, studentRollNumber, subject, rawAnswers } = req.body;
      
      if (!studentName || !studentEmail || !studentPhone || !subject || !rawAnswers) {
        return res.status(400).json({ error: "Missing required fields" });
      }

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
        studentClass: studentClass || "",
        studentDivision: studentDivision || "",
        studentRollNumber: studentRollNumber || "",
        subject,
        score: 0,
        maxScore: rawAnswers.length * 10,
        transcript: placeholderTranscript,
        status: "evaluating",
        sheetSynced: "pending",
      });

      // Return immediately
      res.json({ success: true, id: result.id });

      // Evaluate all answers in background using batch evaluation (single API call)
      (async () => {
        try {
          const evaluations = await evaluateAnswersBatch(rawAnswers, subject);
          const evaluatedTranscript = rawAnswers.map((ra: { question: string; answer: string }, i: number) => ({
            question: ra.question,
            answer: ra.answer,
            feedback: evaluations[i]?.feedback || "Evaluation failed",
            score: evaluations[i]?.score || 0,
          }));

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

  // Upload student photo for a viva result
  app.post("/api/viva/upload-photo", async (req, res) => {
    try {
      const { id, photo } = req.body;
      if (!id || !photo) return res.status(400).json({ error: "Missing id or photo" });
      if (!photo.startsWith("data:image/")) return res.status(400).json({ error: "Invalid photo format" });
      // Limit to ~500KB base64
      if (photo.length > 700000) return res.status(400).json({ error: "Photo too large" });
      await storage.updateVivaPhoto(Number(id), photo);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Photo upload error:", error);
      res.status(500).json({ error: "Failed to save photo" });
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

  // Get viva results (admin: all, user: only own subjects)
  app.get("/api/admin/results", requireAuth, async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      if (currentUser?.role === "admin") {
        const results = await storage.getVivaResults();
        return res.json(results);
      }
      const userSubjects = await storage.getSubjectsByCreator(req.session.userId!);
      const slugs = userSubjects.map(s => s.slug);
      const results = await storage.getVivaResultsBySubjectSlugs(slugs);
      res.json(results);
    } catch (error: any) {
      console.error("Error fetching results:", error);
      res.status(500).json({ error: error.message || "Failed to fetch results" });
    }
  });

  // Get viva result by ID (admin: any, user: own subjects only)
  app.get("/api/admin/results/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid ID" });
      }
      const result = await storage.getVivaResultById(id);
      if (!result) {
        return res.status(404).json({ error: "Result not found" });
      }
      const currentUser = await storage.getUser(req.session.userId!);
      if (currentUser?.role !== "admin") {
        const userSubjects = await storage.getSubjectsByCreator(req.session.userId!);
        const slugs = userSubjects.map(s => s.slug);
        if (!slugs.includes(result.subject)) {
          return res.status(403).json({ error: "Access denied" });
        }
      }
      res.json(result);
    } catch (error: any) {
      console.error("Error fetching result:", error);
      res.status(500).json({ error: error.message || "Failed to fetch result" });
    }
  });

  // Get results by subject (admin: any, user: own subjects only)
  app.get("/api/admin/results/subject/:subject", requireAuth, async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      if (currentUser?.role !== "admin") {
        const subject = await storage.getSubjectBySlug(req.params.subject);
        if (subject && subject.createdBy !== req.session.userId) {
          return res.status(403).json({ error: "Access denied" });
        }
      }
      const results = await storage.getVivaResultsBySubject(req.params.subject);
      res.json(results);
    } catch (error: any) {
      console.error("Error fetching results by subject:", error);
      res.status(500).json({ error: error.message || "Failed to fetch results" });
    }
  });

  return httpServer;
}
