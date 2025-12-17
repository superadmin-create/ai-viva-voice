import { 
  type User, type InsertUser, 
  type VivaResult, type InsertVivaResult, 
  type Subject, type InsertSubject,
  type ManualQuestion, type InsertManualQuestion,
  users, vivaResults, subjects, manualQuestions 
} from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "../db";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  createVivaResult(result: InsertVivaResult): Promise<VivaResult>;
  getVivaResults(): Promise<VivaResult[]>;
  getVivaResultById(id: number): Promise<VivaResult | undefined>;
  getVivaResultsBySubject(subject: string): Promise<VivaResult[]>;
  updateSheetSyncStatus(id: number, status: string): Promise<void>;

  createSubject(subject: InsertSubject): Promise<Subject>;
  getSubjects(): Promise<Subject[]>;
  getSubjectBySlug(slug: string): Promise<Subject | undefined>;
  updateSubject(id: number, subject: Partial<InsertSubject>): Promise<Subject | undefined>;
  deleteSubject(id: number): Promise<void>;

  createManualQuestion(question: InsertManualQuestion): Promise<ManualQuestion>;
  getManualQuestionsBySubject(subjectSlug: string): Promise<ManualQuestion[]>;
  deleteManualQuestion(id: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return result[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await db.insert(users).values(insertUser).returning();
    return result[0];
  }

  async createVivaResult(result: InsertVivaResult): Promise<VivaResult> {
    const inserted = await db.insert(vivaResults).values([result as any]).returning();
    return inserted[0];
  }

  async getVivaResults(): Promise<VivaResult[]> {
    return await db.select().from(vivaResults).orderBy(desc(vivaResults.timestamp));
  }

  async getVivaResultById(id: number): Promise<VivaResult | undefined> {
    const result = await db.select().from(vivaResults).where(eq(vivaResults.id, id)).limit(1);
    return result[0];
  }

  async getVivaResultsBySubject(subject: string): Promise<VivaResult[]> {
    return await db.select().from(vivaResults).where(eq(vivaResults.subject, subject)).orderBy(desc(vivaResults.timestamp));
  }

  async updateSheetSyncStatus(id: number, status: string): Promise<void> {
    await db.update(vivaResults).set({ sheetSynced: status }).where(eq(vivaResults.id, id));
  }

  async createSubject(subject: InsertSubject): Promise<Subject> {
    const result = await db.insert(subjects).values([subject as any]).returning();
    return result[0];
  }

  async getSubjects(): Promise<Subject[]> {
    return await db.select().from(subjects).orderBy(desc(subjects.createdAt));
  }

  async getSubjectBySlug(slug: string): Promise<Subject | undefined> {
    const result = await db.select().from(subjects).where(eq(subjects.slug, slug)).limit(1);
    return result[0];
  }

  async updateSubject(id: number, subject: Partial<InsertSubject>): Promise<Subject | undefined> {
    const result = await db.update(subjects).set(subject).where(eq(subjects.id, id)).returning();
    return result[0];
  }

  async deleteSubject(id: number): Promise<void> {
    await db.delete(subjects).where(eq(subjects.id, id));
  }

  async createManualQuestion(question: InsertManualQuestion): Promise<ManualQuestion> {
    const result = await db.insert(manualQuestions).values([question as any]).returning();
    return result[0];
  }

  async getManualQuestionsBySubject(subjectSlug: string): Promise<ManualQuestion[]> {
    return await db.select().from(manualQuestions).where(eq(manualQuestions.subjectSlug, subjectSlug));
  }

  async deleteManualQuestion(id: number): Promise<void> {
    await db.delete(manualQuestions).where(eq(manualQuestions.id, id));
  }
}

export const storage = new DatabaseStorage();
