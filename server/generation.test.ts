import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  getGenerationLessonContext: vi.fn(), getTemplateByCountry: vi.fn(), getCachedPlan: vi.fn(),
  getSubscriptionStatus: vi.fn(), reserveGenerationCredit: vi.fn(), refundGenerationCredit: vi.fn(),
  createPlan: vi.fn(), updatePlan: vi.fn(), getPlanById: vi.fn(),
  getCachedWorksheet: vi.fn(), createWorksheet: vi.fn(), getWorksheetById: vi.fn(),
  invokeLLM: vi.fn(),
}));
vi.mock("./db", () => mocks);
vi.mock("./_core/llm", () => ({ invokeLLM: mocks.invokeLLM }));
vi.mock("./rateLimiter", () => ({ checkRateLimit: vi.fn(), RATE_LIMITS: { generate: {}, worksheet: {} } }));

import { appRouter } from "./routers";

const curriculum = {
  lesson: { id: 14, unitId: 3, title: "التوزيع الإلكتروني", pageFrom: 27, pageTo: 32, objectives: ["تفسير التوزيع"] },
  unit: { id: 3, textbookId: 5, title: "بنية الذرة" },
  textbook: { id: 5, countryId: 2, subjectId: 9, gradeId: 11, title: "الكيمياء للصف الحادي عشر" },
  country: { id: 2, nameAr: "الأردن" },
  subject: { id: 9, nameAr: "الكيمياء" },
  grade: { id: 11, nameAr: "الحادي عشر العلمي" },
};
const plan = {
  basic_info: { subject: "العلوم", grade: "الثامن", unit: "وحدة", lesson: "درس", date: "2026-10-06", periods: 1, pages: "" },
  objectives: { cognitive: ["أن يفسر الطالب التوزيع"], skills: ["أن يوزع الطالب الإلكترونات"], affective: ["أن يبرر الطالب إجابته"] },
  warm_up: "كيف نرتب الإلكترونات؟", strategies: ["الاستقصاء"], materials: ["السبورة"],
  procedures: [{ step: "التنفيذ", time_minutes: 45, teacher_role: "يسأل ويوجه", student_role: "يحل ويبرر" }],
  assessment: { diagnostic: "ما الإلكترون؟", formative: ["فسر التوزيع"], summative: ["وزع إلكترونات النيتروجين"] },
  values: ["الدقة"], tech_integration: "عرض محاكاة", differentiation: { support: "بطاقة إرشاد", enrichment: "سؤال استنتاج" },
  homework: "حل تمرين", real_life_connection: "خصائص العناصر",
};
const worksheet = {
  title: "ورقة التوزيع الإلكتروني", instructions: "أجب وفسر",
  questions: Array.from({ length: 6 }, (_, i) => ({ type: "short_answer", text: `سؤال ${i + 1}`, points: 1 })),
  answer_key: Array.from({ length: 6 }, (_, i) => ({ q: i + 1, answer: `إجابة ${i + 1}` })),
};

function caller(userId = 7) {
  return appRouter.createCaller({ user: { id: userId, role: "user" }, req: {}, res: {} } as TrpcContext);
}
function llmResponse(content: unknown) {
  return { choices: [{ message: { content: JSON.stringify(content) }, finish_reason: "end_turn" }], model: "test-model" };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getGenerationLessonContext.mockResolvedValue(curriculum);
  mocks.getTemplateByCountry.mockResolvedValue({ id: 8, countryId: 2, fields: { strategies: ["الاستقصاء"], values: ["الدقة"] } });
  mocks.getCachedPlan.mockResolvedValue(undefined);
  mocks.getSubscriptionStatus.mockResolvedValue({ active: false, credits: 1 });
  mocks.reserveGenerationCredit.mockResolvedValue(true);
  mocks.refundGenerationCredit.mockResolvedValue(undefined);
  mocks.createPlan.mockResolvedValue(21);
  mocks.updatePlan.mockResolvedValue(undefined);
  mocks.invokeLLM.mockResolvedValue(llmResponse(plan));
  mocks.getPlanById.mockResolvedValue({ id: 21, userId: 7, lessonId: 14, status: "ready", content: plan });
  mocks.getCachedWorksheet.mockResolvedValue(undefined);
  mocks.createWorksheet.mockResolvedValue(33);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("Teacher generation workflow", () => {
  it("uses reviewed country, subject, grade and server-selected template", async () => {
    const result = await caller().plans.generate({ lessonId: 14, planDate: "2026-10-07", periods: 1 });
    expect(result).toMatchObject({ success: true, planId: 21, cached: false, content: { basic_info: {
      subject: "الكيمياء", grade: "الحادي عشر العلمي", unit: "بنية الذرة", lesson: "التوزيع الإلكتروني",
      date: "2026-10-07", pages: "27-32", periods: 1,
    } } });
    expect(mocks.getTemplateByCountry).toHaveBeenCalledWith(2);
    expect(mocks.createPlan).toHaveBeenCalledWith(expect.objectContaining({ userId: 7, templateId: 8, planDate: new Date("2026-10-07T00:00:00Z") }));
    const prompt = mocks.invokeLLM.mock.calls[0][0].messages[1].content;
    expect(prompt).toContain("- الدولة: الأردن");
    expect(prompt).toContain("- المادة: الكيمياء");
    expect(prompt).toContain("- الصف: الحادي عشر العلمي");
    expect(mocks.reserveGenerationCredit.mock.invocationCallOrder[0]).toBeLessThan(mocks.invokeLLM.mock.invocationCallOrder[0]);
    expect(mocks.refundGenerationCredit).not.toHaveBeenCalled();
  });

  it("returns the same response fields from cache without eligibility, credit or model calls", async () => {
    mocks.getCachedPlan.mockResolvedValue({ id: 20, content: plan });
    mocks.getSubscriptionStatus.mockResolvedValue({ active: false, credits: 0 });
    const result = await caller().plans.generate({ lessonId: 14, planDate: "2026-10-07", periods: 2 });
    expect(result).toMatchObject({ success: true, planId: 20, content: plan, cached: true });
    expect(mocks.getCachedPlan).toHaveBeenCalledWith(7, 14, 8, "2026-10-07", 2);
    expect(mocks.getSubscriptionStatus).not.toHaveBeenCalled();
    expect(mocks.reserveGenerationCredit).not.toHaveBeenCalled();
    expect(mocks.invokeLLM).not.toHaveBeenCalled();
  });

  it("does not charge or call the model when the last credit is unavailable", async () => {
    mocks.reserveGenerationCredit.mockResolvedValue(false);
    expect(await caller().plans.generate({ lessonId: 14 })).toMatchObject({ success: false });
    expect(mocks.createPlan).not.toHaveBeenCalled();
    expect(mocks.invokeLLM).not.toHaveBeenCalled();
    expect(mocks.refundGenerationCredit).not.toHaveBeenCalled();
  });

  it("only one concurrent generation may claim the final credit", async () => {
    mocks.reserveGenerationCredit.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const results = await Promise.all([caller().plans.generate({ lessonId: 14 }), caller().plans.generate({ lessonId: 14 })]);
    expect(results.filter(result => result.success)).toHaveLength(1);
    expect(mocks.invokeLLM).toHaveBeenCalledTimes(1);
    expect(mocks.createPlan).toHaveBeenCalledTimes(1);
  });

  it("does not reserve a credit for an active subscriber", async () => {
    mocks.getSubscriptionStatus.mockResolvedValue({ active: true, credits: 0 });
    expect(await caller().plans.generate({ lessonId: 14 })).toMatchObject({ success: true });
    expect(mocks.reserveGenerationCredit).not.toHaveBeenCalled();
    expect(mocks.refundGenerationCredit).not.toHaveBeenCalled();
  });

  it.each(["missing", "template"])("rejects invalid %s curriculum before reserving credit", async invalid => {
    if (invalid === "missing") mocks.getGenerationLessonContext.mockResolvedValue(undefined);
    else mocks.getTemplateByCountry.mockResolvedValue(undefined);
    expect(await caller().plans.generate({ lessonId: 14 })).toMatchObject({ success: false });
    expect(mocks.reserveGenerationCredit).not.toHaveBeenCalled();
    expect(mocks.invokeLLM).not.toHaveBeenCalled();
  });

  it("rejects a template from another country", async () => {
    expect(await caller().plans.generate({ lessonId: 14, templateId: 1 })).toMatchObject({ success: false });
    expect(mocks.getCachedPlan).not.toHaveBeenCalled();
    expect(mocks.reserveGenerationCredit).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, 11])("rejects invalid period count %s before any database call", async periods => {
    await expect(caller().plans.generate({ lessonId: 14, periods })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.getGenerationLessonContext).not.toHaveBeenCalled();
  });

  it("rejects an impossible date", async () => {
    await expect(caller().plans.generate({ lessonId: 14, planDate: "2026-02-30" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it.each(["provider", "invalid-json", "invalid-schema", "duration", "save"])("refunds reserved credit exactly once after %s failure", async failure => {
    if (failure === "provider") mocks.invokeLLM.mockRejectedValue(new Error("private upstream error"));
    if (failure === "invalid-json") mocks.invokeLLM.mockResolvedValue({ choices: [{ message: { content: "not json" } }] });
    if (failure === "invalid-schema") mocks.invokeLLM.mockResolvedValue(llmResponse({ ...plan, procedures: "wrong" }));
    if (failure === "duration") mocks.invokeLLM.mockResolvedValue(llmResponse({ ...plan, procedures: [{ ...plan.procedures[0], time_minutes: 10 }] }));
    if (failure === "save") mocks.createPlan.mockRejectedValue(new Error("private DB details"));
    const result = await caller().plans.generate({ lessonId: 14 });
    expect(result).toMatchObject({ success: false });
    expect(result.error).not.toContain("private");
    expect(mocks.refundGenerationCredit).toHaveBeenCalledOnce();
    expect(mocks.refundGenerationCredit).toHaveBeenCalledWith(7);
    expect(mocks.updatePlan).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: "ready" }));
  });

  it("marks a failed record even when generation output is truncated", async () => {
    mocks.invokeLLM.mockResolvedValue({ ...llmResponse(plan), choices: [{ message: { content: JSON.stringify(plan) }, finish_reason: "max_tokens" }] });
    expect(await caller().plans.generate({ lessonId: 14 })).toMatchObject({ success: false });
    expect(mocks.updatePlan).toHaveBeenCalledWith(21, { status: "failed" });
    expect(mocks.refundGenerationCredit).toHaveBeenCalledOnce();
  });

  it("refunds even if saving the failed state also fails", async () => {
    mocks.invokeLLM.mockRejectedValue(new Error("provider failed"));
    mocks.updatePlan.mockRejectedValue(new Error("database failed"));
    expect(await caller().plans.generate({ lessonId: 14 })).toMatchObject({ success: false });
    expect(mocks.refundGenerationCredit).toHaveBeenCalledOnce();
  });

  it("never reports a refunded balance when the refund itself fails", async () => {
    mocks.invokeLLM.mockRejectedValue(new Error("provider failed"));
    mocks.refundGenerationCredit.mockRejectedValue(new Error("refund failed"));
    await expect(caller().plans.generate({ lessonId: 14 })).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
});

describe("Owned worksheets", () => {
  it("gets worksheet detail with both worksheet ID and current user ID", async () => {
    mocks.getWorksheetById.mockResolvedValue({ id: 33, userId: 7, content: worksheet });
    expect(await caller().plans.worksheetGet({ id: 33 })).toMatchObject({ id: 33 });
    expect(mocks.getWorksheetById).toHaveBeenCalledOnce();
    expect(mocks.getWorksheetById).toHaveBeenCalledWith(33, 7);
  });

  it("derives the worksheet lesson from the owned plan", async () => {
    mocks.invokeLLM.mockResolvedValue(llmResponse(worksheet));
    expect(await caller().plans.worksheet({ planId: 21 })).toMatchObject({ success: true, worksheetId: 33, content: worksheet, cached: false });
    expect(mocks.getPlanById).toHaveBeenCalledWith(21, 7);
    expect(mocks.createWorksheet).toHaveBeenCalledWith({ userId: 7, planId: 21, lessonId: 14, content: worksheet });
  });

  it("rejects another teacher's plan before looking up a cached worksheet", async () => {
    mocks.getPlanById.mockResolvedValue(undefined);
    expect(await caller(8).plans.worksheet({ planId: 21 })).toMatchObject({ success: false });
    expect(mocks.getPlanById).toHaveBeenCalledWith(21, 8);
    expect(mocks.getCachedWorksheet).not.toHaveBeenCalled();
    expect(mocks.invokeLLM).not.toHaveBeenCalled();
  });

  it("rejects a mismatched lesson supplied by an older client", async () => {
    expect(await caller().plans.worksheet({ planId: 21, lessonId: 999 })).toMatchObject({ success: false });
    expect(mocks.getCachedWorksheet).not.toHaveBeenCalled();
    expect(mocks.createWorksheet).not.toHaveBeenCalled();
  });

  it("rejects an incomplete answer key before persisting it", async () => {
    mocks.invokeLLM.mockResolvedValue(llmResponse({ ...worksheet, answer_key: worksheet.answer_key.slice(1) }));
    expect(await caller().plans.worksheet({ planId: 21 })).toMatchObject({ success: false });
    expect(mocks.createWorksheet).not.toHaveBeenCalled();
  });

  it("returns a cached worksheet without a model call", async () => {
    mocks.getCachedWorksheet.mockResolvedValue({ id: 30, content: worksheet });
    expect(await caller().plans.worksheet({ planId: 21 })).toMatchObject({ success: true, worksheetId: 30, content: worksheet, cached: true });
    expect(mocks.getCachedWorksheet).toHaveBeenCalledWith(21, 7);
    expect(mocks.invokeLLM).not.toHaveBeenCalled();
  });
});
