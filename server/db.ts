import { eq, and, desc, sql, gte, lte, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users,
  countries, stages, grades, subjects, schools, terms,
  textbooks, units, lessons,
  savedSelections, planTemplates, plans, worksheets,
  purchases, planCredits, subscriptions,
  paymentAuditLogs, paymentWebhookEvents,
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
    await addCredits(insertedUser[0].id, 2);
    console.log(`[Database] Granted 2 free plans to new user: ${user.openId}`);
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

export async function getCountryById(countryId: number) {
  const db = await getDb(); if (!db) return undefined;
  const result = await db.select().from(countries).where(eq(countries.id, countryId)).limit(1);
  return result[0];
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
    and(eq(textbooks.countryId, countryId), eq(textbooks.subjectId, subjectId), eq(textbooks.gradeId, gradeId), eq(textbooks.status, "approved"))
  );
}

export async function getUnitsByTextbook(textbookId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(units).where(and(eq(units.textbookId, textbookId), eq(units.status, "approved"))).orderBy(units.sortOrder);
}

export async function getLessonsByUnit(unitId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(lessons).where(and(eq(lessons.unitId, unitId), eq(lessons.status, "approved"))).orderBy(lessons.sortOrder);
}

// Admin: get all textbooks (including drafts)
export async function getAllTextbooks(includeDrafts: boolean = true) {
  const db = await getDb(); if (!db) return [];
  if (includeDrafts) {
    return db.select().from(textbooks).orderBy(textbooks.id);
  }
  return db.select().from(textbooks).where(eq(textbooks.status, "approved")).orderBy(textbooks.id);
}

// Admin: get units for a textbook (including drafts)
export async function getAllUnitsByTextbook(textbookId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(units).where(eq(units.textbookId, textbookId)).orderBy(units.sortOrder);
}

// Admin: get lessons for a unit (including drafts)
export async function getAllLessonsByUnit(unitId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(lessons).where(eq(lessons.unitId, unitId)).orderBy(lessons.sortOrder);
}

// Admin: approve a textbook and all its units/lessons
export async function approveTextbook(textbookId: number) {
  const db = await getDb(); if (!db) return;
  await db.update(textbooks).set({ status: "approved" }).where(eq(textbooks.id, textbookId));
  const unitRows = await db.select().from(units).where(eq(units.textbookId, textbookId));
  for (const u of unitRows) {
    await db.update(units).set({ status: "approved" }).where(eq(units.id, u.id));
    await db.update(lessons).set({ status: "approved" }).where(eq(lessons.unitId, u.id));
  }
}

// Admin: update a unit
export async function updateUnit(unitId: number, data: { title?: string; sortOrder?: number }) {
  const db = await getDb(); if (!db) return;
  const updates: any = {};
  if (data.title !== undefined) updates.title = data.title;
  if (data.sortOrder !== undefined) updates.sortOrder = data.sortOrder;
  if (Object.keys(updates).length > 0) {
    await db.update(units).set(updates).where(eq(units.id, unitId));
  }
}

// Admin: update a lesson
export async function updateLesson(lessonId: number, data: { title?: string; sortOrder?: number; pageFrom?: number; pageTo?: number; suggestedPeriods?: number; objectives?: any }) {
  const db = await getDb(); if (!db) return;
  const updates: any = {};
  if (data.title !== undefined) updates.title = data.title;
  if (data.sortOrder !== undefined) updates.sortOrder = data.sortOrder;
  if (data.pageFrom !== undefined) updates.pageFrom = data.pageFrom;
  if (data.pageTo !== undefined) updates.pageTo = data.pageTo;
  if (data.suggestedPeriods !== undefined) updates.suggestedPeriods = data.suggestedPeriods;
  if (data.objectives !== undefined) updates.objectives = data.objectives;
  if (Object.keys(updates).length > 0) {
    await db.update(lessons).set(updates).where(eq(lessons.id, lessonId));
  }
}

// Admin: delete a unit and its lessons
export async function deleteUnitCascade(unitId: number) {
  const db = await getDb(); if (!db) return;
  await db.delete(lessons).where(eq(lessons.unitId, unitId));
  await db.delete(units).where(eq(units.id, unitId));
}

// Admin: delete a lesson
export async function deleteLesson(lessonId: number) {
  const db = await getDb(); if (!db) return;
  await db.delete(lessons).where(eq(lessons.id, lessonId));
}

// Admin: delete a textbook and all its units/lessons
export async function deleteTextbookCascade(textbookId: number) {
  const db = await getDb(); if (!db) return;
  const unitRows = await db.select().from(units).where(eq(units.textbookId, textbookId));
  for (const u of unitRows) {
    await db.delete(lessons).where(eq(lessons.unitId, u.id));
  }
  await db.delete(units).where(eq(units.textbookId, textbookId));
  await db.delete(textbooks).where(eq(textbooks.id, textbookId));
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
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("Credit amount must be a positive integer");
  const db = await getDb(); if (!db) return;
  await db.insert(planCredits)
    .values({ userId, balance: amount })
    .onDuplicateKeyUpdate({
      set: { balance: sql`${planCredits.balance} + ${amount}` },
    });
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

// ============================================================
// إضافات db-additions.ts — دوال جديدة للدفع والإحالات
// ============================================================

// ==================== Users ====================

export async function getUserById(id: number) {
  const db = await getDb(); if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}

// ==================== Purchases ====================

export async function getPurchaseById(id: number) {
  const db = await getDb(); if (!db) return undefined;
  const result = await db.select().from(purchases).where(eq(purchases.id, id)).limit(1);
  return result[0];
}

export type PaymentGateway = "myfatoorah" | "tap";
export type PaymentAuditStatus = "success" | "failed" | "rejected" | "mismatch" | "duplicate";

export class PaymentActivationError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "PaymentActivationError";
  }
}

export async function createPaymentAuditLog(data: {
  purchaseId?: number | null;
  userId?: number | null;
  gateway: PaymentGateway;
  status: PaymentAuditStatus;
  gatewayRef?: string | null;
  eventId?: string | null;
  errorCode?: string | null;
  details?: Record<string, unknown> | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(paymentAuditLogs).values({
    purchaseId: data.purchaseId ?? null,
    userId: data.userId ?? null,
    gateway: data.gateway,
    status: data.status,
    gatewayRef: data.gatewayRef ?? null,
    eventId: data.eventId ?? null,
    errorCode: data.errorCode ?? null,
    details: data.details ?? null,
  });
}

export type ActivateVerifiedPurchaseInput = {
  purchaseId: number;
  gateway: PaymentGateway;
  gatewayRef: string;
  eventId: string;
  payloadHash: string;
};

export type ActivateVerifiedPurchaseResult = {
  outcome: "activated" | "already_activated";
  purchase: typeof purchases.$inferSelect;
};

/**
 * Grants the purchased entitlement and marks the purchase paid in one DB transaction.
 * The gateway HTTP verification must happen before calling this function.
 */
export async function activateVerifiedPurchase(
  input: ActivateVerifiedPurchaseInput,
): Promise<ActivateVerifiedPurchaseResult> {
  const db = await getDb();
  if (!db) throw new PaymentActivationError("DATABASE_UNAVAILABLE");

  return db.transaction(async (tx) => {
    await tx.insert(paymentWebhookEvents)
      .values({
        gateway: input.gateway,
        eventId: input.eventId,
        purchaseId: input.purchaseId,
        payloadHash: input.payloadHash,
      })
      .onDuplicateKeyUpdate({
        set: { eventId: sql`${paymentWebhookEvents.eventId}` },
      });

    const eventRows = await tx.select().from(paymentWebhookEvents).where(and(
      eq(paymentWebhookEvents.gateway, input.gateway),
      eq(paymentWebhookEvents.eventId, input.eventId),
    )).limit(1).for("update");
    const event = eventRows[0];
    if (!event || event.purchaseId !== input.purchaseId || event.payloadHash !== input.payloadHash) {
      throw new PaymentActivationError("WEBHOOK_EVENT_CONFLICT");
    }

    const purchaseRows = await tx.select().from(purchases)
      .where(eq(purchases.id, input.purchaseId))
      .limit(1)
      .for("update");
    const purchase = purchaseRows[0];
    if (!purchase) throw new PaymentActivationError("PURCHASE_NOT_FOUND");
    if (purchase.gateway !== input.gateway) {
      throw new PaymentActivationError("PURCHASE_GATEWAY_MISMATCH");
    }

    if (purchase.status === "paid") {
      await tx.insert(paymentAuditLogs).values({
        purchaseId: purchase.id,
        userId: purchase.userId,
        gateway: input.gateway,
        status: "duplicate",
        gatewayRef: input.gatewayRef,
        eventId: input.eventId,
        errorCode: "ALREADY_ACTIVATED",
      });
      return { outcome: "already_activated", purchase };
    }
    if (purchase.status !== "pending") {
      throw new PaymentActivationError("PURCHASE_NOT_PENDING");
    }

    if (purchase.kind === "single_plan") {
      const quantity = purchase.quantity ?? 1;
      if (!Number.isInteger(quantity) || quantity <= 0) {
        throw new PaymentActivationError("INVALID_PURCHASE_QUANTITY");
      }
      await tx.insert(planCredits)
        .values({ userId: purchase.userId, balance: quantity })
        .onDuplicateKeyUpdate({
          set: { balance: sql`${planCredits.balance} + ${quantity}` },
        });
    } else if (purchase.kind === "semester") {
      if (!purchase.termId) throw new PaymentActivationError("PURCHASE_TERM_MISSING");

      // Serialise semester grants for the same user as well as for this purchase.
      const buyerRows = await tx.select().from(users)
        .where(eq(users.id, purchase.userId))
        .limit(1)
        .for("update");
      const buyer = buyerRows[0];
      if (!buyer) throw new PaymentActivationError("BUYER_NOT_FOUND");
      if (!purchase.countryId) throw new PaymentActivationError("PURCHASE_COUNTRY_MISSING");

      const termRows = await tx.select().from(terms)
        .where(eq(terms.id, purchase.termId))
        .limit(1);
      const term = termRows[0];
      const today = new Date().toISOString().slice(0, 10);
      const termEndDate = term?.endDate instanceof Date
        ? term.endDate.toISOString().slice(0, 10)
        : String(term?.endDate ?? "").slice(0, 10);
      if (!term || term.countryId !== purchase.countryId || termEndDate < today) {
        throw new PaymentActivationError("PURCHASE_TERM_INVALID");
      }

      await tx.insert(subscriptions).values({
        userId: purchase.userId,
        termId: term.id,
        source: "paid",
        purchaseId: purchase.id,
        startsAt: term.startDate,
        endsAt: term.endDate,
      }).onDuplicateKeyUpdate({
        set: { userId: sql`${subscriptions.userId}` },
      });
    } else {
      throw new PaymentActivationError("PURCHASE_KIND_INVALID");
    }

    await tx.update(purchases).set({
      status: "paid",
      gatewayRef: input.gatewayRef,
    }).where(and(
      eq(purchases.id, purchase.id),
      eq(purchases.status, "pending"),
    ));

    await tx.insert(paymentAuditLogs).values({
      purchaseId: purchase.id,
      userId: purchase.userId,
      gateway: input.gateway,
      status: "success",
      gatewayRef: input.gatewayRef,
      eventId: input.eventId,
    });

    return {
      outcome: "activated",
      purchase: { ...purchase, status: "paid", gatewayRef: input.gatewayRef },
    };
  });
}

// ==================== Terms ====================

// الفصل الحالي لدولة ما، وإن لم يوجد فأقرب فصل قادم
export async function getCurrentTermForCountry(countryId: number) {
  const db = await getDb(); if (!db) return undefined;
  const today = new Date().toISOString().slice(0, 10);
  const current = await db.select().from(terms).where(
    and(eq(terms.countryId, countryId), lte(terms.startDate, today as any), gte(terms.endDate, today as any))
  ).limit(1);
  if (current.length > 0) return current[0];
  const upcoming = await db.select().from(terms).where(
    and(eq(terms.countryId, countryId), gte(terms.startDate, today as any))
  ).orderBy(terms.startDate).limit(1);
  return upcoming[0];
}

export async function getTermById(termId: number) {
  const db = await getDb(); if (!db) return undefined;
  const result = await db.select().from(terms).where(eq(terms.id, termId)).limit(1);
  return result[0];
}

// ==================== Subscriptions ====================

export async function hasSubscriptionForTerm(userId: number, termId: number): Promise<boolean> {
  const db = await getDb(); if (!db) return false;
  const result = await db.select({ id: subscriptions.id }).from(subscriptions).where(
    and(eq(subscriptions.userId, userId), eq(subscriptions.termId, termId))
  ).limit(1);
  return result.length > 0;
}

// إنشاء اشتراك — آمن ضد التكرار: اشتراك واحد لكل (مستخدم، فصل)
export async function createSubscription(data: {
  userId: number;
  termId: number;
  source: "paid" | "referral_reward" | "admin_grant";
  purchaseId?: number;
  startsAt: any;
  endsAt: any;
}): Promise<number | undefined> {
  const db = await getDb(); if (!db) return undefined;
  await db.insert(subscriptions).values({
    userId: data.userId,
    termId: data.termId,
    source: data.source,
    purchaseId: data.purchaseId,
    startsAt: data.startsAt,
    endsAt: data.endsAt,
  }).onDuplicateKeyUpdate({
    set: { userId: sql`${subscriptions.userId}` },
  });
  const result = await db.select({ id: subscriptions.id }).from(subscriptions).where(
    and(eq(subscriptions.userId, data.userId), eq(subscriptions.termId, data.termId))
  ).limit(1);
  return result[0]?.id;
}

// ==================== Referrals: الاسترداد والمكافآت ====================

// استرداد كود إحالة — يُستدعى مرة واحدة للمستخدم الجديد
export async function redeemReferralCode(code: string, userId: number):
  Promise<{ success: boolean; error?: string }> {
  const db = await getDb(); if (!db) return { success: false, error: "قاعدة البيانات غير متاحة" };

  const found = await db.select().from(referralCodes).where(eq(referralCodes.code, code)).limit(1);
  const rc = found[0];
  if (!rc || !rc.isActive) return { success: false, error: "الكود غير صالح" };
  if (rc.ownerUserId === userId) return { success: false, error: "لا يمكنك استخدام كودك الخاص" };

  // مستخدم واحد = استرداد واحد فقط (لأي كود)
  const prior = await db.select().from(referralRedemptions)
    .where(eq(referralRedemptions.redeemedBy, userId)).limit(1);
  if (prior.length > 0) return { success: false, error: "سبق أن استخدمت كود إحالة" };

  // احترام حد الاستخدامات
  const uses = await db.select({ c: sql<number>`count(*)` }).from(referralRedemptions)
    .where(eq(referralRedemptions.codeId, rc.id));
  if ((uses[0]?.c ?? 0) >= rc.maxUses) return { success: false, error: "اكتمل عدد استخدامات هذا الكود" };

  await db.insert(referralRedemptions).values({ codeId: rc.id, redeemedBy: userId });
  return { success: true };
}

export async function getRedemptionByUser(userId: number) {
  const db = await getDb(); if (!db) return undefined;
  const result = await db.select().from(referralRedemptions)
    .where(eq(referralRedemptions.redeemedBy, userId)).limit(1);
  return result[0];
}

export async function getReferralCodeById(id: number) {
  const db = await getDb(); if (!db) return undefined;
  const result = await db.select().from(referralCodes).where(eq(referralCodes.id, id)).limit(1);
  return result[0];
}

// ربط استرداد المستخدم بأول شراء فصلي مدفوع له (يُستدعى من activatePurchase)
export async function linkRedemptionToPurchase(userId: number, purchaseId: number): Promise<void> {
  const db = await getDb(); if (!db) return;
  await db.update(referralRedemptions)
    .set({ purchaseId })
    .where(and(eq(referralRedemptions.redeemedBy, userId), isNull(referralRedemptions.purchaseId)));
}

// عدد الاشتراكات الفصلية "المدفوعة" عبر كود معيّن
export async function countPaidSemesterRedemptions(codeId: number): Promise<number> {
  const db = await getDb(); if (!db) return 0;
  const result = await db.select({ c: sql<number>`count(*)` })
    .from(referralRedemptions)
    .innerJoin(purchases, eq(purchases.id, referralRedemptions.purchaseId))
    .where(and(
      eq(referralRedemptions.codeId, codeId),
      eq(purchases.status, "paid"),
      eq(purchases.kind, "semester"),
    ));
  return result[0]?.c ?? 0;
}

export async function getRewardByCode(codeId: number) {
  const db = await getDb(); if (!db) return undefined;
  const result = await db.select().from(referralRewards)
    .where(eq(referralRewards.codeId, codeId)).limit(1);
  return result[0];
}

export async function createReferralReward(codeId: number, subscriptionId: number): Promise<void> {
  const db = await getDb(); if (!db) return;
  await db.insert(referralRewards).values({ codeId, subscriptionId });
}
