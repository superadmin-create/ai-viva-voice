import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("admin"),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  role: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const vivaResults = pgTable("viva_results", {
  id: serial("id").primaryKey(),
  studentName: text("student_name").notNull(),
  studentEmail: text("student_email").notNull(),
  studentPhone: text("student_phone").notNull(),
  studentClass: text("student_class").notNull().default(""),
  studentDivision: text("student_division").notNull().default(""),
  subject: text("subject").notNull(),
  score: integer("score").notNull().default(0),
  maxScore: integer("max_score").notNull().default(10),
  transcript: jsonb("transcript").notNull().$type<Array<{
    question: string;
    answer: string;
    feedback: string;
    score: number;
  }>>(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  status: text("status").notNull().default("completed"),
  sheetSynced: text("sheet_synced").default("pending"),
  studentPhoto: text("student_photo"),
});

export const insertVivaResultSchema = createInsertSchema(vivaResults).omit({
  id: true,
  timestamp: true,
});

export type InsertVivaResult = z.infer<typeof insertVivaResultSchema>;
export type VivaResult = typeof vivaResults.$inferSelect;

// Custom subjects table
export const subjects = pgTable("subjects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  curriculum: jsonb("curriculum").notNull().$type<Array<{
    title: string;
    topics: string[];
  }>>(),
  instructions: text("instructions"),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSubjectSchema = createInsertSchema(subjects).omit({
  id: true,
  createdAt: true,
});

export type InsertSubject = z.infer<typeof insertSubjectSchema>;
export type Subject = typeof subjects.$inferSelect;

// Manual questions table
export const manualQuestions = pgTable("manual_questions", {
  id: serial("id").primaryKey(),
  subjectSlug: text("subject_slug").notNull(),
  questionText: text("question_text").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertManualQuestionSchema = createInsertSchema(manualQuestions).omit({
  id: true,
  createdAt: true,
});

export type InsertManualQuestion = z.infer<typeof insertManualQuestionSchema>;
export type ManualQuestion = typeof manualQuestions.$inferSelect;

export const subjectDocuments = pgTable("subject_documents", {
  id: serial("id").primaryKey(),
  subjectSlug: text("subject_slug").notNull(),
  fileName: text("file_name").notNull(),
  fileType: text("file_type").notNull(),
  fileData: text("file_data").notNull(),
  extractedText: text("extracted_text").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSubjectDocumentSchema = createInsertSchema(subjectDocuments).omit({
  id: true,
  createdAt: true,
});

export type InsertSubjectDocument = z.infer<typeof insertSubjectDocumentSchema>;
export type SubjectDocument = typeof subjectDocuments.$inferSelect;
