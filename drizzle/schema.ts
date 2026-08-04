import {
  boolean,
  date,
  decimal,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  // Teacher profile fields
  countryId: int("countryId"),
  schoolId: int("schoolId"),
  fullName: varchar("fullName", { length: 255 }),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ================= 1) المرجعيات: الدول والمناهج =================

export const countries = mysqlTable("countries", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 4 }).notNull().unique(),
  nameAr: varchar("nameAr", { length: 100 }).notNull(),
  currencyCode: varchar("currencyCode", { length: 8 }).notNull(),
  pricePerPlan: decimal("pricePerPlan", { precision: 8, scale: 2 }).notNull().default("10"),
  pricePerSemester: decimal("pricePerSemester", { precision: 8, scale: 2 }).notNull().default("150"),
  isActive: boolean("isActive").notNull().default(false),
});

export const stages = mysqlTable("stages", {
  id: int("id").autoincrement().primaryKey(),
  countryId: int("countryId").notNull(),
  nameAr: varchar("nameAr", { length: 100 }).notNull(),
  sortOrder: int("sortOrder").notNull().default(0),
});

export const grades = mysqlTable("grades", {
  id: int("id").autoincrement().primaryKey(),
  stageId: int("stageId").notNull(),
  nameAr: varchar("nameAr", { length: 100 }).notNull(),
  sortOrder: int("sortOrder").notNull().default(0),
});

export const subjects = mysqlTable("subjects", {
  id: int("id").autoincrement().primaryKey(),
  countryId: int("countryId").notNull(),
  nameAr: varchar("nameAr", { length: 100 }).notNull(),
});

export const schools = mysqlTable("schools", {
  id: int("id").autoincrement().primaryKey(),
  countryId: int("countryId").notNull(),
  nameAr: varchar("nameAr", { length: 255 }).notNull(),
  city: varchar("city", { length: 100 }),
  isVerified: boolean("isVerified").notNull().default(false),
});

export const terms = mysqlTable("terms", {
  id: int("id").autoincrement().primaryKey(),
  countryId: int("countryId").notNull(),
  academicYear: varchar("academicYear", { length: 20 }).notNull(),
  nameAr: varchar("nameAr", { length: 50 }).notNull(),
  startDate: date("startDate").notNull(),
  endDate: date("endDate").notNull(),
});

// ========= 2) الكتب وفهارسها =========

export const textbooks = mysqlTable("textbooks", {
  id: int("id").autoincrement().primaryKey(),
  countryId: int("countryId").notNull(),
  subjectId: int("subjectId").notNull(),
  gradeId: int("gradeId").notNull(),
  termId: int("termId"),
  title: varchar("title", { length: 255 }).notNull(),
  editionYear: int("editionYear"),
  sourceNote: text("sourceNote"),
  status: mysqlEnum("status", ["draft", "approved"]).notNull().default("draft"),
});

export const units = mysqlTable("units", {
  id: int("id").autoincrement().primaryKey(),
  textbookId: int("textbookId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  sortOrder: int("sortOrder").notNull().default(0),
  status: mysqlEnum("status", ["draft", "approved"]).notNull().default("draft"),
});

export const lessons = mysqlTable("lessons", {
  id: int("id").autoincrement().primaryKey(),
  unitId: int("unitId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  sortOrder: int("sortOrder").notNull().default(0),
  objectives: json("objectives"),
  keywords: json("keywords"),
  pageFrom: int("pageFrom"),
  pageTo: int("pageTo"),
  suggestedPeriods: int("suggestedPeriods").notNull().default(1),
  status: mysqlEnum("status", ["draft", "approved"]).notNull().default("draft"),
});

// ================= 3) اختيارات المعلم المحفوظة =================

export const savedSelections = mysqlTable("saved_selections", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  label: varchar("label", { length: 255 }),
  countryId: int("countryId").notNull(),
  schoolId: int("schoolId"),
  gradeId: int("gradeId").notNull(),
  subjectId: int("subjectId").notNull(),
  textbookId: int("textbookId"),
  isDefault: boolean("isDefault").notNull().default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ================= 4) القوالب والخطط =================

export const planTemplates = mysqlTable("plan_templates", {
  id: int("id").autoincrement().primaryKey(),
  countryId: int("countryId").notNull(),
  nameAr: varchar("nameAr", { length: 255 }).notNull(),
  docxStoragePath: varchar("docxStoragePath", { length: 500 }).notNull(),
  fields: json("fields").notNull(),
});

export const plans = mysqlTable("plans", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  lessonId: int("lessonId").notNull(),
  templateId: int("templateId").notNull(),
  planDate: date("planDate"),
  periods: int("periods").notNull().default(1),
  status: mysqlEnum("status", ["pending", "generating", "ready", "failed"]).notNull().default("pending"),
  content: json("content"),
  docxPath: varchar("docxPath", { length: 500 }),
  pdfPath: varchar("pdfPath", { length: 500 }),
  model: varchar("model", { length: 100 }),
  inputTokens: int("inputTokens"),
  outputTokens: int("outputTokens"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const worksheets = mysqlTable("worksheets", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  planId: int("planId"),
  lessonId: int("lessonId"),
  content: json("content"),
  docxPath: varchar("docxPath", { length: 500 }),
  pdfPath: varchar("pdfPath", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ================= 5) الدفع والاشتراكات =================

export const purchases = mysqlTable("purchases", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  countryId: int("countryId"),
  kind: mysqlEnum("kind", ["single_plan", "semester"]).notNull(),
  termId: int("termId"),
  quantity: int("quantity").notNull().default(1),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 8 }).notNull(),
  gateway: varchar("gateway", { length: 50 }).notNull(),
  gatewayRef: varchar("gatewayRef", { length: 255 }),
  status: mysqlEnum("status", ["pending", "paid", "failed", "refunded"]).notNull().default("pending"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("purchases_user_status_idx").on(table.userId, table.status),
  uniqueIndex("purchases_gateway_ref_unique").on(table.gateway, table.gatewayRef),
]);

export const planCredits = mysqlTable("plan_credits", {
  userId: int("userId").primaryKey(),
  balance: int("balance").notNull().default(0),
});

export const subscriptions = mysqlTable("subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  termId: int("termId").notNull(),
  source: mysqlEnum("source", ["paid", "referral_reward", "admin_grant"]).notNull(),
  purchaseId: int("purchaseId"),
  startsAt: date("startsAt").notNull(),
  endsAt: date("endsAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("subscriptions_user_term_unique").on(table.userId, table.termId),
  uniqueIndex("subscriptions_purchase_unique").on(table.purchaseId),
]);

export const paymentWebhookEvents = mysqlTable("payment_webhook_events", {
  id: int("id").autoincrement().primaryKey(),
  gateway: varchar("gateway", { length: 50 }).notNull(),
  eventId: varchar("eventId", { length: 255 }).notNull(),
  purchaseId: int("purchaseId"),
  payloadHash: varchar("payloadHash", { length: 64 }).notNull(),
  processedAt: timestamp("processedAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("payment_webhook_gateway_event_unique").on(table.gateway, table.eventId),
  index("payment_webhook_purchase_idx").on(table.purchaseId),
]);

export const paymentAuditLogs = mysqlTable("payment_audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  purchaseId: int("purchaseId"),
  userId: int("userId"),
  gateway: varchar("gateway", { length: 50 }).notNull(),
  status: mysqlEnum("status", ["success", "failed", "rejected", "mismatch", "duplicate"]).notNull(),
  gatewayRef: varchar("gatewayRef", { length: 255 }),
  eventId: varchar("eventId", { length: 255 }),
  errorCode: varchar("errorCode", { length: 100 }),
  details: json("details"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("payment_audit_purchase_idx").on(table.purchaseId),
  index("payment_audit_user_idx").on(table.userId),
  index("payment_audit_created_idx").on(table.createdAt),
]);

// ================= 6) نظام الإحالة =================

export const referralCodes = mysqlTable("referral_codes", {
  id: int("id").autoincrement().primaryKey(),
  ownerUserId: int("ownerUserId").notNull(),
  code: varchar("code", { length: 20 }).notNull().unique(),
  maxUses: int("maxUses").notNull().default(10),
  rewardThreshold: int("rewardThreshold").notNull().default(5),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const referralRedemptions = mysqlTable("referral_redemptions", {
  id: int("id").autoincrement().primaryKey(),
  codeId: int("codeId").notNull(),
  redeemedBy: int("redeemedBy").notNull(),
  purchaseId: int("purchaseId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const referralRewards = mysqlTable("referral_rewards", {
  id: int("id").autoincrement().primaryKey(),
  codeId: int("codeId").notNull().unique(),
  subscriptionId: int("subscriptionId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ========= 7) المحتوى الإضافي (مواقف، روابط، تقاويم) =========

export const resources = mysqlTable("resources", {
  id: int("id").autoincrement().primaryKey(),
  countryId: int("countryId"),
  kind: mysqlEnum("kind", ["mawqif", "youtube", "link", "calendar", "official_form"]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  url: varchar("url", { length: 500 }),
  body: text("body"),
  tags: json("tags"),
  sortOrder: int("sortOrder").notNull().default(0),
  isPublished: boolean("isPublished").notNull().default(false),
});

// ================= Export all types =================

export type Country = typeof countries.$inferSelect;
export type Stage = typeof stages.$inferSelect;
export type Grade = typeof grades.$inferSelect;
export type Subject = typeof subjects.$inferSelect;
export type School = typeof schools.$inferSelect;
export type Term = typeof terms.$inferSelect;
export type Textbook = typeof textbooks.$inferSelect;
export type Unit = typeof units.$inferSelect;
export type Lesson = typeof lessons.$inferSelect;
export type SavedSelection = typeof savedSelections.$inferSelect;
export type PlanTemplate = typeof planTemplates.$inferSelect;
export type Plan = typeof plans.$inferSelect;
export type Worksheet = typeof worksheets.$inferSelect;
export type Purchase = typeof purchases.$inferSelect;
export type PlanCredit = typeof planCredits.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type ReferralCode = typeof referralCodes.$inferSelect;
export type ReferralRedemption = typeof referralRedemptions.$inferSelect;
export type ReferralReward = typeof referralRewards.$inferSelect;
export type Resource = typeof resources.$inferSelect;
