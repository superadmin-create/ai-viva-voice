import { type User, type InsertUser, type VivaResult, type InsertVivaResult, users, vivaResults } from "@shared/schema";
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
    const inserted = await db.insert(vivaResults).values([result]).returning();
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
}

export const storage = new DatabaseStorage();
