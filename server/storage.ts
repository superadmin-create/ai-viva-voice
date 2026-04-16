import { 
  type User, type InsertUser, 
  type VivaResult, type InsertVivaResult, 
  type Subject, type InsertSubject,
  type ManualQuestion, type InsertManualQuestion,
  type SubjectDocument, type InsertSubjectDocument,
  users, vivaResults, subjects, manualQuestions, subjectDocuments 
} from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "../db";
import { eq, desc, inArray, and, count, ne } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;
  deleteUser(id: string): Promise<void>;
  updateUserPassword(id: string, password: string): Promise<void>;
  
  createVivaResult(result: InsertVivaResult): Promise<VivaResult>;
  getVivaResults(): Promise<VivaResult[]>;
  getVivaResultById(id: number): Promise<VivaResult | undefined>;
  getVivaResultsBySubject(subject: string): Promise<VivaResult[]>;
  updateSheetSyncStatus(id: number, status: string): Promise<void>;
  updateVivaResult(id: number, data: Partial<{ transcript: any; score: number; maxScore: number; status: string; sheetSynced: string }>): Promise<void>;
  updateVivaPhoto(id: number, photo: string): Promise<void>;
  countVivaAttempts(email: string, subject: string): Promise<number>;
  resetVivaAttempts(email: string, subject: string): Promise<void>;
  resetVivaAttemptsByIds(ids: number[]): Promise<void>;

  createSubject(subject: InsertSubject): Promise<Subject>;
  getSubjects(): Promise<Subject[]>;
  getSubjectsByCreator(userId: string): Promise<Subject[]>;
  getSubjectBySlug(slug: string): Promise<Subject | undefined>;
  updateSubject(id: number, subject: Partial<InsertSubject>): Promise<Subject | undefined>;
  deleteSubject(id: number): Promise<void>;
  getVivaResultsBySubjectSlugs(slugs: string[]): Promise<VivaResult[]>;

  createManualQuestion(question: InsertManualQuestion): Promise<ManualQuestion>;
  getManualQuestionsBySubject(subjectSlug: string): Promise<ManualQuestion[]>;
  deleteManualQuestion(id: number): Promise<void>;
  updateManualQuestion(id: number, questionText: string): Promise<ManualQuestion | undefined>;

  createSubjectDocument(doc: InsertSubjectDocument): Promise<SubjectDocument>;
  getDocumentsBySubject(subjectSlug: string): Promise<SubjectDocument[]>;
  deleteSubjectDocument(id: number): Promise<void>;
  getSubjectDocument(id: number): Promise<SubjectDocument | undefined>;
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

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  async deleteUser(id: string): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  async updateUserPassword(id: string, password: string): Promise<void> {
    await db.update(users).set({ password }).where(eq(users.id, id));
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

  async updateVivaResult(id: number, data: Partial<{ transcript: any; score: number; maxScore: number; status: string; sheetSynced: string }>): Promise<void> {
    await db.update(vivaResults).set(data).where(eq(vivaResults.id, id));
  }

  async updateVivaPhoto(id: number, photo: string): Promise<void> {
    await db.update(vivaResults).set({ studentPhoto: photo }).where(eq(vivaResults.id, id));
  }

  async countVivaAttempts(email: string, subject: string): Promise<number> {
    const result = await db
      .select({ value: count() })
      .from(vivaResults)
      .where(and(
        eq(vivaResults.studentEmail, email),
        eq(vivaResults.subject, subject),
        ne(vivaResults.status, "reset_by_admin"),
      ));
    return result[0]?.value ?? 0;
  }

  async resetVivaAttempts(email: string, subject: string): Promise<void> {
    await db
      .update(vivaResults)
      .set({ status: "reset_by_admin" })
      .where(and(eq(vivaResults.studentEmail, email), eq(vivaResults.subject, subject)));
  }

  async resetVivaAttemptsByIds(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    await db
      .update(vivaResults)
      .set({ status: "reset_by_admin" })
      .where(inArray(vivaResults.id, ids));
  }

  async createSubject(subject: InsertSubject): Promise<Subject> {
    const result = await db.insert(subjects).values([subject as any]).returning();
    return result[0];
  }

  async getSubjects(): Promise<Subject[]> {
    return await db.select().from(subjects).orderBy(desc(subjects.createdAt));
  }

  async getSubjectsByCreator(userId: string): Promise<Subject[]> {
    return await db.select().from(subjects).where(eq(subjects.createdBy, userId)).orderBy(desc(subjects.createdAt));
  }

  async getVivaResultsBySubjectSlugs(slugs: string[]): Promise<VivaResult[]> {
    if (slugs.length === 0) return [];
    return await db.select().from(vivaResults).where(inArray(vivaResults.subject, slugs)).orderBy(desc(vivaResults.timestamp));
  }

  async getSubjectBySlug(slug: string): Promise<Subject | undefined> {
    const result = await db.select().from(subjects).where(eq(subjects.slug, slug)).limit(1);
    return result[0];
  }

  async updateSubject(id: number, subject: Partial<InsertSubject>): Promise<Subject | undefined> {
    const result = await db.update(subjects).set(subject as any).where(eq(subjects.id, id)).returning();
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

  async updateManualQuestion(id: number, questionText: string): Promise<ManualQuestion | undefined> {
    const result = await db.update(manualQuestions).set({ questionText }).where(eq(manualQuestions.id, id)).returning();
    return result[0];
  }

  async createSubjectDocument(doc: InsertSubjectDocument): Promise<SubjectDocument> {
    const result = await db.insert(subjectDocuments).values([doc as any]).returning();
    return result[0];
  }

  async getDocumentsBySubject(subjectSlug: string): Promise<SubjectDocument[]> {
    return await db.select().from(subjectDocuments).where(eq(subjectDocuments.subjectSlug, subjectSlug)).orderBy(desc(subjectDocuments.createdAt));
  }

  async deleteSubjectDocument(id: number): Promise<void> {
    await db.delete(subjectDocuments).where(eq(subjectDocuments.id, id));
  }

  async getSubjectDocument(id: number): Promise<SubjectDocument | undefined> {
    const result = await db.select().from(subjectDocuments).where(eq(subjectDocuments.id, id)).limit(1);
    return result[0];
  }
}

export const storage = new DatabaseStorage();
