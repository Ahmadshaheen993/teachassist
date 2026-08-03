import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock db module
vi.mock("./db", () => ({
  getActiveCountries: vi.fn().mockResolvedValue([
    { id: 1, code: "QA", nameAr: "قطر", currencyCode: "QAR", isActive: true, pricePerPlan: 10, pricePerSemester: 150 },
  ]),
  getStagesByCountry: vi.fn().mockResolvedValue([
    { id: 1, countryId: 1, nameAr: "المرحلة الابتدائية", sortOrder: 1 },
  ]),
  getGradesByStage: vi.fn().mockResolvedValue([
    { id: 1, stageId: 1, nameAr: "الثامن", sortOrder: 8 },
  ]),
  getGradesByCountry: vi.fn().mockResolvedValue([
    { id: 1, stageId: 1, nameAr: "الثامن", sortOrder: 8 },
  ]),
  getSubjectsByCountry: vi.fn().mockResolvedValue([
    { id: 1, countryId: 1, nameAr: "الكيمياء" },
  ]),
  getTextbooks: vi.fn().mockResolvedValue([
    { id: 1, countryId: 1, subjectId: 1, gradeId: 1, title: "الكيمياء للصف الثامن" },
  ]),
  getUnitsByTextbook: vi.fn().mockResolvedValue([
    { id: 1, textbookId: 1, title: "الوحدة الأولى", sortOrder: 1 },
  ]),
  getLessonsByUnit: vi.fn().mockResolvedValue([
    { id: 1, unitId: 1, title: "الدرس 1: المادة وخصائصها", sortOrder: 1, pageFrom: 12, pageTo: 18 },
  ]),
  getLessonById: vi.fn().mockResolvedValue({
    id: 1, unitId: 1, title: "الدرس 1: المادة وخصائصها", sortOrder: 1, pageFrom: 12, pageTo: 18,
  }),
  getUnitById: vi.fn().mockResolvedValue({
    id: 1, textbookId: 1, title: "الوحدة الأولى", sortOrder: 1,
  }),
  getTextbookById: vi.fn().mockResolvedValue({
    id: 1, countryId: 1, subjectId: 1, gradeId: 1, title: "الكيمياء للصف الثامن",
  }),
  getTemplateByCountry: vi.fn().mockResolvedValue({
    id: 1, countryId: 1, nameAr: "قالب قطر", fields: { strategies: ["التعلم التعاوني", "الاستقصاء"], values: ["التعاون", "الإتقان"] },
  }),
  getCachedPlan: vi.fn().mockResolvedValue(undefined),
  createPlan: vi.fn().mockResolvedValue(1),
  updatePlan: vi.fn().mockResolvedValue(undefined),
  deductCredit: vi.fn().mockResolvedValue(undefined),
  canGenerate: vi.fn().mockResolvedValue(true),
  getPlansByUser: vi.fn().mockResolvedValue([]),
  getPlanById: vi.fn().mockResolvedValue(undefined),
  getWorksheetsByUser: vi.fn().mockResolvedValue([]),
  createWorksheet: vi.fn().mockResolvedValue(1),
  getSubscriptionStatus: vi.fn().mockResolvedValue({ active: false, credits: 2, subscription: null }),
  getPurchasesByUser: vi.fn().mockResolvedValue([]),
  createPurchase: vi.fn().mockResolvedValue(1),
  updatePurchaseStatus: vi.fn().mockResolvedValue(undefined),
  addCredits: vi.fn().mockResolvedValue(undefined),
  getSavedSelections: vi.fn().mockResolvedValue([]),
  createSavedSelection: vi.fn().mockResolvedValue(undefined),
  deleteSavedSelection: vi.fn().mockResolvedValue(undefined),
  getReferralCodesByUser: vi.fn().mockResolvedValue([]),
  createReferralCode: vi.fn().mockResolvedValue(undefined),
  getRedemptionsByCode: vi.fn().mockResolvedValue([]),
  getRewardsByCode: vi.fn().mockResolvedValue([]),
  redeemReferralCode: vi.fn().mockResolvedValue({ success: true }),
  getReferralCodeById: vi.fn().mockResolvedValue(undefined),
  getRedemptionByUser: vi.fn().mockResolvedValue(undefined),
  linkRedemptionToPurchase: vi.fn().mockResolvedValue(undefined),
  countPaidSemesterRedemptions: vi.fn().mockResolvedValue(0),
  getRewardByCode: vi.fn().mockResolvedValue(undefined),
  createReferralReward: vi.fn().mockResolvedValue(undefined),
  getUserById: vi.fn().mockResolvedValue({ id: 1, name: "Test Teacher", email: "test@example.com" }),
  getPurchaseById: vi.fn().mockResolvedValue(undefined),
  getCurrentTermForCountry: vi.fn().mockResolvedValue(undefined),
  createSubscription: vi.fn().mockResolvedValue(1),
  getResources: vi.fn().mockResolvedValue([]),
  getAllCountries: vi.fn().mockResolvedValue([]),
  createCountry: vi.fn().mockResolvedValue(undefined),
  createStage: vi.fn().mockResolvedValue(undefined),
  createGrade: vi.fn().mockResolvedValue(undefined),
  createSubject: vi.fn().mockResolvedValue(undefined),
  createTextbook: vi.fn().mockResolvedValue(undefined),
  createUnit: vi.fn().mockResolvedValue(undefined),
  createLesson: vi.fn().mockResolvedValue(undefined),
  createSchool: vi.fn().mockResolvedValue(undefined),
  verifySchool: vi.fn().mockResolvedValue(undefined),
  getUnverifiedSchools: vi.fn().mockResolvedValue([]),
  updateUserProfile: vi.fn().mockResolvedValue(undefined),
}));

// Mock payments
vi.mock("./payments", () => ({
  createCheckout: vi.fn().mockResolvedValue({ success: true, paymentUrl: "https://pay.example.com/checkout" }),
  paymentWebhooks: vi.fn(),
}));

// Mock LLM
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{
      message: {
        content: JSON.stringify({
          basic_info: { subject: "الكيمياء", grade: "الثامن", unit: "الوحدة الأولى", lesson: "الدرس 1", date: "2026-08-03", periods: 1, pages: "12-18" },
          objectives: { cognitive: ["أن يعرّف الطالب المادة"], skills: ["أن يصنف خصائص المادة"], affective: ["أن يقدر أهمية المادة"] },
          warm_up: "سؤال تمهيدي",
          strategies: ["التعلم التعاوني"],
          materials: ["سبورة", "نماذج"],
          procedures: [{ step: "مقدمة", time_minutes: 10, teacher_role: "يقدم", student_role: "يستمع" }],
          assessment: { diagnostic: "ما هي المادة؟", formative: ["اذكر خصائص المادة"], summative: ["صنف المواد"] },
          values: ["التعاون"],
          tech_integration: "عرض فيديو",
          differentiation: { support: "مساعدة", enrichment: "إثراء" },
          homework: "حل تمارين",
          real_life_connection: "ربط بالحياة",
        }),
      },
    }],
    model: "claude-sonnet",
    usage: { prompt_tokens: 500, completion_tokens: 800 },
  }),
}));

function createAuthContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user",
      email: "test@example.com",
      name: "Test Teacher",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as any,
    res: {} as any,
  } as TrpcContext;
}

function createAdminContext(): TrpcContext {
  const ctx = createAuthContext();
  ctx.user!.role = "admin";
  return ctx;
}

describe("Curriculum Router", () => {
  it("fetches active countries", async () => {
    const caller = appRouter.createCaller({});
    const result = await caller.curriculum.countries();
    expect(result).toHaveLength(1);
    expect(result[0].nameAr).toBe("قطر");
  });

  it("fetches stages by country", async () => {
    const caller = appRouter.createCaller({});
    const result = await caller.curriculum.stages({ countryId: 1 });
    expect(result).toHaveLength(1);
    expect(result[0].nameAr).toBe("المرحلة الابتدائية");
  });

  it("fetches grades by stage", async () => {
    const caller = appRouter.createCaller({});
    const result = await caller.curriculum.grades({ stageId: 1 });
    expect(result).toHaveLength(1);
    expect(result[0].nameAr).toBe("الثامن");
  });

  it("fetches textbooks", async () => {
    const caller = appRouter.createCaller({});
    const result = await caller.curriculum.textbooks({ countryId: 1, subjectId: 1, gradeId: 1 });
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("الكيمياء للصف الثامن");
  });

  it("fetches lessons by unit", async () => {
    const caller = appRouter.createCaller({});
    const result = await caller.curriculum.lessons({ unitId: 1 });
    expect(result).toHaveLength(1);
    expect(result[0].title).toContain("الدرس 1");
  });
});

describe("Selections Router", () => {
  it("lists saved selections for authenticated user", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.selections.list();
    expect(result).toEqual([]);
  });

  it("saves a new selection", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.selections.save({
      countryId: 1, gradeId: 1, subjectId: 1, isDefault: false,
    });
    expect(result.success).toBe(true);
  });
});

describe("Subscription Router", () => {
  it("gets subscription status", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.subscription.status();
    expect(result.active).toBe(false);
    expect(result.credits).toBe(2);
  });

  it("creates a single plan purchase with checkout URL", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.subscription.buyPlan({ gateway: "myfatoorah" });
    expect(result.success).toBe(true);
    expect(result.paymentUrl).toContain("checkout");
  });

  it("creates a semester purchase with checkout URL", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.subscription.buySemester({ gateway: "tap" });
    expect(result.success).toBe(true);
    expect(result.paymentUrl).toContain("checkout");
  });
});

describe("Referral Router", () => {
  it("creates a referral code", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.referral.createCode();
    expect(result.success).toBe(true);
    expect(result.code).toHaveLength(8);
  });

  it("redeems a referral code", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.referral.redeem({ code: "TESTCODE" });
    expect(result.success).toBe(true);
  });
});

describe("Resources Router", () => {
  it("lists resources", async () => {
    const caller = appRouter.createCaller({});
    const result = await caller.resources.list({});
    expect(result).toEqual([]);
  });
});

describe("Admin Router", () => {
  it("rejects non-admin users", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.admin.countries()).rejects.toThrow();
  });

  it("allows admin to list countries", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.admin.countries();
    expect(result).toEqual([]);
  });

  it("allows admin to add a country", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.admin.addCountry({
      code: "SA", nameAr: "السعودية", currencyCode: "SAR",
    });
    expect(result.success).toBe(true);
  });
});

describe("Plan Generation", () => {
  it("generates a plan successfully", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.plans.generate({ lessonId: 1, templateId: 1, periods: 1 });
    expect(result.success).toBe(true);
    expect(result.content).toBeDefined();
    expect(result.content.basic_info.subject).toBe("الكيمياء");
  });
});
