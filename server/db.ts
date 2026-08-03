import { eq, and, desc, sql, gte, lte, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users,
  countries, stages, grades, subjects, schools, terms,
  textbooks, units, lessons,
  savedSelections, planTemplates, plans, worksheets,
  purchases, planCredits, subscriptions,
  referralCodes, referralRedemptions, referralRewards,
  resources,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ==================== User Management ====================

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }
  try {
    // Check if this is a new user before insert
    const existing = await db.select().from(users).where(eq(users.openId, user.openId)).limit(1);
    const isNewUser = existing.length === 0;
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    textFields.forEach((field) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    });
    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    else if (user.openId === ENV.ownerOpenId) { values.role = 'admin'; updateSet.role = 'admin'; }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
    // Grant 5 free plans to new users
    if (isNewUser) {
      const insertedUser = await db.select().from(users).where(eq(users.openId, user.openId)).limit(1);
      if (insertedUser.length > 0) {
        await addCredits(insertedUser[0].id, 5);
        console.log(`[Database] Granted 5 free plans to new user: ${user.openId}`);
      }
    }
  } catch (error) { console.error("[Database] Failed to upsert user:", error); throw error; }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateUserProfile(userId: number, data: { fullName?: string; countryId?: number; schoolId?: number }) {
  const db = await getDb();
  if (!db) return;
  const updateSet: Record<string, unknown> = {};
  if (data.fullName !== undefined) updateSet.fullName = data.fullName;
  if (data.countryId !== undefined) updateSet.countryId = data.countryId;
  if (data.schoolId !== undefined) updateSet.schoolId = data.schoolId;
  if (Object.keys(updateSet).length === 0) return;
  await db.update(users).set(updateSet).where(eq(users.id, userId));
}

// ==================== Curriculum ====================

export async function getActiveCountries() {
  const db = await getDb(); if (!db) return [];
  return db.select().from(countries).where(eq(countries.isActive, true));
}

export async function getAllCountries() {
  const db = await getDb(); if (!db) return [];
  return db.select().from(countries);
}

export async function getStagesByCountry(countryId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(stages).where(eq(stages.countryId, countryId)).orderBy(stages.sortOrder);
}

export async function getGradesByStage(stageId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(grades).where(eq(grades.stageId, stageId)).orderBy(grades.sortOrder);
}

export async function getGradesByCountry(countryId: number) {
  const db = await getDb(); if (!db) return [];
  const stageRows = await db.select().from(stages).where(eq(stages.countryId, countryId)).orderBy(stages.sortOrder);
  if (stageRows.length === 0) return [];
  const stageIds = stageRows.map(s => s.id);
  const allGrades = await db.select().from(grades).where(sql`${grades.stageId} IN (${sql.join(stageIds.map(id => sql`${id}`), sql`, `)})`).orderBy(grades.sortOrder);
  return allGrades;
}

export async function getSubjectsByCountry(countryId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(subjects).where(eq(subjects.countryId, countryId));
}

export async function getSchoolsByCountry(countryId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(schools).where(eq(schools.countryId, countryId));
}

export async function getTermsByCountry(countryId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(terms).where(eq(terms.countryId, countryId));
}

export async function getTextbooks(countryId: number, subjectId: number, gradeId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(textbooks).where(
    and(eq(textbooks.countryId, countryId), eq(textbooks.subjectId, subjectId), eq(textbooks.gradeId, gradeId))
  );
}

export async function getUnitsByTextbook(textbookId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(units).where(eq(units.textbookId, textbookId)).orderBy(units.sortOrder);
}

export async function getLessonsByUnit(unitId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(lessons).where(eq(lessons.unitId, unitId)).orderBy(lessons.sortOrder);
}

export async function getLessonById(id: number) {
  const db = await getDb(); if (!db) return undefined;
  const result = await db.select().from(lessons).where(eq(lessons.id, id)).limit(1);
  return result[0];
}

export async function getUnitById(id: number) {
  const db = await getDb(); if (!db) return undefined;
  const result = await db.select().from(units).where(eq(units.id, id)).limit(1);
  return result[0];
}

export async function getTextbookById(id: number) {
  const db = await getDb(); if (!db) return undefined;
  const result = await db.select().from(textbooks).where(eq(textbooks.id, id)).limit(1);
  return result[0];
}

// ==================== Saved Selections ====================

export async function getSavedSelections(userId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(savedSelections).where(eq(savedSelections.userId, userId)).orderBy(desc(savedSelections.createdAt));
}

export async function createSavedSelection(data: typeof savedSelections.$inferInsert) {
  const db = await getDb(); if (!db) return;
  await db.insert(savedSelections).values(data);
}

export async function deleteSavedSelection(id: number, userId: number) {
  const db = await getDb(); if (!db) return;
  await db.delete(savedSelections).where(and(eq(savedSelections.id, id), eq(savedSelections.userId, userId)));
}

// ==================== Plan Templates ====================

export async function getTemplateByCountry(countryId: number) {
  const db = await getDb(); if (!db) return undefined;
  const result = await db.select().from(planTemplates).where(eq(planTemplates.countryId, countryId)).limit(1);
  return result[0];
}

// ==================== Plans ====================

export async function getPlansByUser(userId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(plans).where(eq(plans.userId, userId)).orderBy(desc(plans.createdAt));
}

export async function getPlanById(id: number, userId: number) {
  const db = await getDb(); if (!db) return undefined;
  const result = await db.select().from(plans).where(and(eq(plans.id, id), eq(plans.userId, userId))).limit(1);
  return result[0];
}

export async function getCachedPlan(userId: number, lessonId: number, templateId: number) {
  const db = await getDb(); if (!db) return undefined;
  const result = await db.select().from(plans).where(
    and(eq(plans.lessonId, lessonId), eq(plans.templateId, templateId), eq(plans.status, "ready"))
  ).orderBy(desc(plans.createdAt)).limit(1);
  return result[0];
}

export async function createPlan(data: typeof plans.$inferInsert) {
  const db = await getDb(); if (!db) return undefined;
  const result = await db.insert(plans).values(data);
  return result[0]?.insertId;
}

export async function updatePlan(id: number, data: Partial<typeof plans.$inferInsert>) {
  const db = await getDb(); if (!db) return;
  await db.update(plans).set(data).where(eq(plans.id, id));
}

// ==================== Worksheets ====================

export async function getWorksheetsByUser(userId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(worksheets).where(eq(worksheets.userId, userId)).orderBy(desc(worksheets.createdAt));
}

export async function getCachedWorksheet(planId: number) {
  const db = await getDb(); if (!db) return undefined;
  const result = await db.select().from(worksheets).where(eq(worksheets.planId, planId)).orderBy(desc(worksheets.createdAt)).limit(1);
  return result[0];
}

export async function createWorksheet(data: typeof worksheets.$inferInsert) {
  const db = await getDb(); if (!db) return undefined;
  const result = await db.insert(worksheets).values(data);
  return result[0]?.insertId;
}

// ==================== Subscription & Credits ====================

export async function canGenerate(userId: number): Promise<boolean> {
  const db = await getDb(); if (!db) return false;
  const today = new Date().toISOString().slice(0, 10);
  const activeSub = await db.select().from(subscriptions).where(
    and(eq(subscriptions.userId, userId), lte(subscriptions.startsAt, today as any), gte(subscriptions.endsAt, today as any))
  ).limit(1);
  if (activeSub.length > 0) return true;
  const credits = await db.select().from(planCredits).where(eq(planCredits.userId, userId)).limit(1);
  return credits.length > 0 && (credits[0].balance ?? 0) > 0;
}

export async function deductCredit(userId: number): Promise<void> {
  const db = await getDb(); if (!db) return;
  const credits = await db.select().from(planCredits).where(eq(planCredits.userId, userId)).limit(1);
  if (credits.length > 0 && credits[0].balance > 0) {
    await db.update(planCredits).set({ balance: credits[0].balance - 1 }).where(eq(planCredits.userId, userId));
  }
}

export async function addCredits(userId: number, amount: number): Promise<void> {
  const db = await getDb(); if (!db) return;
  const existing = await db.select().from(planCredits).where(eq(planCredits.userId, userId)).limit(1);
  if (existing.length > 0) {
    await db.update(planCredits).set({ balance: existing[0].balance + amount }).where(eq(planCredits.userId, userId));
  } else {
    await db.insert(planCredits).values({ userId, balance: amount });
  }
}

export async function getSubscriptionStatus(userId: number) {
  const db = await getDb(); if (!db) return { active: false, credits: 0 };
  const today = new Date().toISOString().slice(0, 10);
  const activeSub = await db.select().from(subscriptions).where(
    and(eq(subscriptions.userId, userId), lte(subscriptions.startsAt, today as any), gte(subscriptions.endsAt, today as any))
  ).limit(1);
  const credits = await db.select().from(planCredits).where(eq(planCredits.userId, userId)).limit(1);
  return {
    active: activeSub.length > 0,
    subscription: activeSub[0] ?? null,
    credits: credits[0]?.balance ?? 0,
  };
}

export async function getPurchasesByUser(userId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(purchases).where(eq(purchases.userId, userId)).orderBy(desc(purchases.createdAt));
}

export async function createPurchase(data: typeof purchases.$inferInsert) {
  const db = await getDb(); if (!db) return undefined;
  const result = await db.insert(purchases).values(data);
  return result[0]?.insertId;
}

export async function updatePurchaseStatus(id: number, status: string, gatewayRef?: string) {
  const db = await getDb(); if (!db) return;
  const updateSet: Record<string, unknown> = { status };
  if (gatewayRef) updateSet.gatewayRef = gatewayRef;
  await db.update(purchases).set(updateSet).where(eq(purchases.id, id));
}

// ==================== Referrals ====================

export async function getReferralCodesByUser(userId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(referralCodes).where(eq(referralCodes.ownerUserId, userId));
}

export async function createReferralCode(userId: number, code: string, maxUses = 10, rewardThreshold = 5) {
  const db = await getDb(); if (!db) return;
  await db.insert(referralCodes).values({ ownerUserId: userId, code, maxUses, rewardThreshold, isActive: true });
}

export async function getRedemptionsByCode(codeId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(referralRedemptions).where(eq(referralRedemptions.codeId, codeId));
}

export async function getRewardsByCode(codeId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(referralRewards).where(eq(referralRewards.codeId, codeId));
}

// ==================== Resources ====================

export async function getResources(countryId?: number, kind?: string) {
  const db = await getDb(); if (!db) return [];
  let query = db.select().from(resources).where(eq(resources.isPublished, true));
  if (countryId && kind) {
    return db.select().from(resources).where(and(eq(resources.isPublished, true), eq(resources.countryId, countryId), eq(resources.kind, kind as any)));
  } else if (countryId) {
    return db.select().from(resources).where(and(eq(resources.isPublished, true), eq(resources.countryId, countryId)));
  } else if (kind) {
    return db.select().from(resources).where(and(eq(resources.isPublished, true), eq(resources.kind, kind as any)));
  }
  return query;
}

export async function createResource(data: typeof resources.$inferInsert) {
  const db = await getDb(); if (!db) return;
  await db.insert(resources).values(data);
}

// ==================== Admin ====================

export async function createCountry(data: typeof countries.$inferInsert) {
  const db = await getDb(); if (!db) return;
  await db.insert(countries).values(data);
}

export async function createStage(data: typeof stages.$inferInsert) {
  const db = await getDb(); if (!db) return;
  await db.insert(stages).values(data);
}

export async function createGrade(data: typeof grades.$inferInsert) {
  const db = await getDb(); if (!db) return;
  await db.insert(grades).values(data);
}

export async function createSubject(data: typeof subjects.$inferInsert) {
  const db = await getDb(); if (!db) return;
  await db.insert(subjects).values(data);
}

export async function createTextbook(data: typeof textbooks.$inferInsert) {
  const db = await getDb(); if (!db) return;
  await db.insert(textbooks).values(data);
}

export async function createUnit(data: typeof units.$inferInsert) {
  const db = await getDb(); if (!db) return;
  await db.insert(units).values(data);
}

export async function createLesson(data: typeof lessons.$inferInsert) {
  const db = await getDb(); if (!db) return;
  await db.insert(lessons).values(data);
}

export async function createSchool(data: typeof schools.$inferInsert) {
  const db = await getDb(); if (!db) return;
  await db.insert(schools).values(data);
}

export async function verifySchool(id: number) {
  const db = await getDb(); if (!db) return;
  await db.update(schools).set({ isVerified: true }).where(eq(schools.id, id));
}

export async function getUnverifiedSchools() {
  const db = await getDb(); if (!db) return [];
  return db.select().from(schools).where(eq(schools.isVerified, false));
}
