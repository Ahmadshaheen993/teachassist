import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import { z } from "zod";
import { nanoid } from "nanoid";
import * as db from "./db";

// ==================== Plan Generation System Prompt ====================
const PLAN_SYSTEM_PROMPT = `أنت خبير مناهج وطرائق تدريس متخصص في إعداد خطط الدروس اليومية وفق النماذج الوزارية الخليجية.

مهمتك: إنتاج خطة درس يومية كاملة وعالية الجودة اعتماداً على بيانات الدرس المرسلة إليك، بصيغة JSON فقط.

قواعد إلزامية:
1. أخرج JSON صالحاً فقط، دون أي نص قبله أو بعده، ودون علامات Markdown.
2. الأهداف سلوكية قابلة للقياس بصيغة: "أن + فعل إجرائي + الطالب + المحتوى + المعيار"، موزعة على المجالات الثلاثة (معرفي، مهاري، وجداني) وفق تصنيف بلوم، بواقع 3-5 أهداف إجمالاً.
3. اختر الاستراتيجيات من قائمة "الاستراتيجيات المتاحة" المرسلة فقط، ولا تخترع غيرها، واربط كل خطوة تنفيذ باستراتيجية.
4. مجموع أزمنة خطوات التنفيذ يساوي زمن الحصة بالضبط.
5. التقويم ثلاثي: قبلي (سؤال تشخيصي واحد)، بنائي (2-3 أسئلة أثناء الدرس)، ختامي (2-3 أسئلة أو مهمة قصيرة) — أسئلة فعلية جاهزة للطرح، لا أوصافاً عامة.
6. القيمة التربوية مستمدة من محتوى الدرس نفسه، لا قيمة عامة منفصلة عنه.
7. الدمج التكنولوجي واقعي وقابل للتطبيق في صف عادي (محاكاة، فيديو قصير، سبورة تفاعلية، تجربة افتراضية...).
8. مراعاة الفروق الفردية ببندين: دعم للمتعثرين، وإثراء للمتفوقين.
9. اللغة عربية فصيحة سليمة، وبمصطلحات المادة العلمية المعتمدة في كتب الدولة المحددة.
10. إن نقصت بعض المدخلات (كالأهداف)، استنتجها من عنوان الدرس ومستوى الصف، ولا تختلق أرقام صفحات أو مراجع لم تُرسل إليك.`;

const WORKSHEET_SYSTEM_PROMPT = `أنت معلم خبير في تصميم أوراق العمل. أنتج ورقة عمل داعمة لأنشطة خطة الدرس المرسلة إليك، بصيغة JSON فقط.

القواعد:
1. 5-8 أسئلة متدرجة الصعوبة تغطي أهداف الخطة المرسلة.
2. نوّع الأنماط: اختيار من متعدد، أكمل الفراغ، مطابقة، سؤال قصير، ومسألة تطبيقية إن ناسبت المادة.
3. أرفق نموذج إجابة كاملاً.
4. لغة مناسبة تماماً لمستوى الصف.
5. JSON صالح فقط دون أي نص آخر.`;

const PLAN_JSON_SCHEMA = {
  type: "object",
  properties: {
    basic_info: {
      type: "object",
      properties: {
        subject: { type: "string" }, grade: { type: "string" },
        unit: { type: "string" }, lesson: { type: "string" },
        date: { type: "string" }, periods: { type: "number" }, pages: { type: "string" },
      },
      required: ["subject", "grade", "unit", "lesson", "date", "periods", "pages"],
    },
    objectives: {
      type: "object",
      properties: {
        cognitive: { type: "array", items: { type: "string" } },
        skills: { type: "array", items: { type: "string" } },
        affective: { type: "array", items: { type: "string" } },
      },
      required: ["cognitive", "skills", "affective"],
    },
    warm_up: { type: "string" },
    strategies: { type: "array", items: { type: "string" } },
    materials: { type: "array", items: { type: "string" } },
    procedures: {
      type: "array",
      items: {
        type: "object",
        properties: {
          step: { type: "string" }, time_minutes: { type: "number" },
          teacher_role: { type: "string" }, student_role: { type: "string" },
        },
        required: ["step", "time_minutes", "teacher_role", "student_role"],
      },
    },
    assessment: {
      type: "object",
      properties: {
        diagnostic: { type: "string" },
        formative: { type: "array", items: { type: "string" } },
        summative: { type: "array", items: { type: "string" } },
      },
      required: ["diagnostic", "formative", "summative"],
    },
    values: { type: "array", items: { type: "string" } },
    tech_integration: { type: "string" },
    differentiation: {
      type: "object",
      properties: { support: { type: "string" }, enrichment: { type: "string" } },
      required: ["support", "enrichment"],
    },
    homework: { type: "string" },
    real_life_connection: { type: "string" },
  },
  required: ["basic_info", "objectives", "warm_up", "strategies", "materials", "procedures", "assessment", "values", "tech_integration", "differentiation", "homework", "real_life_connection"],
};

const WORKSHEET_JSON_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    instructions: { type: "string" },
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string" },
          text: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          left: { type: "array", items: { type: "string" } },
          right: { type: "array", items: { type: "string" } },
          points: { type: "number" },
        },
        required: ["type", "text", "points"],
      },
    },
    answer_key: {
      type: "array",
      items: {
        type: "object",
        properties: { q: { type: "number" }, answer: { type: "string" } },
        required: ["q", "answer"],
      },
    },
  },
  required: ["title", "instructions", "questions", "answer_key"],
};

// ==================== Plan HTML Generator for PDF Export ====================
function generatePlanHtml(plan: any): string {
  const obj = plan.objectives || {};
  const proc = plan.procedures || [];
  const assess = plan.assessment || {};
  const diff = plan.differentiation || {};
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<style>
  body { font-family: 'Tajawal', 'Noto Sans Arabic', sans-serif; padding: 40px; color: #1a1a1a; }
  h1 { text-align: center; color: #0d6b56; font-size: 22px; margin-bottom: 24px; }
  h2 { color: #0d6b56; font-size: 16px; border-bottom: 2px solid #0d6b56; padding-bottom: 4px; margin-top: 20px; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; }
  td, th { border: 1px solid #ddd; padding: 8px; font-size: 13px; text-align: right; }
  th { background: #f0f9f6; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 8px; margin-bottom: 16px; }
  .info-item { background: #f0f9f6; padding: 8px; border-radius: 6px; }
  .info-label { font-size: 11px; color: #666; }
  .info-value { font-size: 13px; font-weight: bold; }
  ul { padding-right: 20px; }
  li { margin-bottom: 4px; font-size: 13px; }
  .section { margin-bottom: 16px; }
  .badge { display: inline-block; background: #e8f5f0; padding: 2px 10px; border-radius: 12px; font-size: 12px; margin: 2px; }
</style>
</head>
<body>
  <h1>خطة درس يومية</h1>
  <div class="info-grid">
    <div class="info-item"><div class="info-label">المادة</div><div class="info-value">${plan.basic_info?.subject || ''}</div></div>
    <div class="info-item"><div class="info-label">الصف</div><div class="info-value">${plan.basic_info?.grade || ''}</div></div>
    <div class="info-item"><div class="info-label">الوحدة</div><div class="info-value">${plan.basic_info?.unit || ''}</div></div>
    <div class="info-item"><div class="info-label">الدرس</div><div class="info-value">${plan.basic_info?.lesson || ''}</div></div>
    <div class="info-item"><div class="info-label">التاريخ</div><div class="info-value">${plan.basic_info?.date || ''}</div></div>
    <div class="info-item"><div class="info-label">عدد الحصص</div><div class="info-value">${plan.basic_info?.periods || 1}</div></div>
    <div class="info-item"><div class="info-label">الصفحات</div><div class="info-value">${plan.basic_info?.pages || ''}</div></div>
  </div>
  <h2>الأهداف التعليمية</h2>
  <div class="section">
    <p><strong>المعرفية:</strong></p><ul>${(obj.cognitive||[]).map((o:string)=>`<li>${o}</li>`).join('')}</ul>
    <p><strong>المهارية:</strong></p><ul>${(obj.skills||[]).map((o:string)=>`<li>${o}</li>`).join('')}</ul>
    <p><strong>الوجدانية:</strong></p><ul>${(obj.affective||[]).map((o:string)=>`<li>${o}</li>`).join('')}</ul>
  </div>
  <h2>التهيئة</h2><p>${plan.warm_up || ''}</p>
  <h2>الاستراتيجيات والوسائل</h2>
  <p><strong>الاستراتيجيات:</strong> ${(plan.strategies||[]).map((s:string)=>`<span class="badge">${s}</span>`).join('')}</p>
  <p><strong>الوسائل:</strong> ${(plan.materials||[]).map((m:string)=>`<span class="badge">${m}</span>`).join('')}</p>
  <h2>خطوات التنفيذ</h2>
  <table><tr><th>الخطوة</th><th>الزمن</th><th>دور المعلم</th><th>دور الطالب</th></tr>
  ${proc.map((p:any)=>`<tr><td>${p.step}</td><td>${p.time_minutes} دقيقة</td><td>${p.teacher_role}</td><td>${p.student_role}</td></tr>`).join('')}
  </table>
  <h2>التقويم</h2>
  <p><strong>القبلي:</strong> ${assess.diagnostic || ''}</p>
  <p><strong>البنائي:</strong></p><ul>${(assess.formative||[]).map((q:string)=>`<li>${q}</li>`).join('')}</ul>
  <p><strong>الختامي:</strong></p><ul>${(assess.summative||[]).map((q:string)=>`<li>${q}</li>`).join('')}</ul>
  <h2>القيم التربوية</h2><p>${(plan.values||[]).map((v:string)=>`<span class="badge">${v}</span>`).join('')}</p>
  <h2>الدمج التكنولوجي</h2><p>${plan.tech_integration || ''}</p>
  <h2>مراعاة الفروق الفردية</h2>
  <p><strong>دعم المتعثرين:</strong> ${diff.support || ''}</p>
  <p><strong>إثراء المتفوقين:</strong> ${diff.enrichment || ''}</p>
  <h2>الواجب المنزلي</h2><p>${plan.homework || ''}</p>
  <h2>الربط بالحياة</h2><p>${plan.real_life_connection || ''}</p>
</body>
</html>`;
}

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    updateProfile: protectedProcedure
      .input(z.object({
        fullName: z.string().optional(),
        countryId: z.number().optional(),
        schoolId: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.updateUserProfile(ctx.user.id, input);
        return { success: true };
      }),
  }),

  // ==================== Curriculum ====================
  curriculum: router({
    countries: publicProcedure.query(async () => {
      return await db.getActiveCountries();
    }),
    stages: publicProcedure
      .input(z.object({ countryId: z.number() }))
      .query(async ({ input }) => {
        return await db.getStagesByCountry(input.countryId);
      }),
    grades: publicProcedure
      .input(z.object({ stageId: z.number().optional(), countryId: z.number().optional() }))
      .query(async ({ input }) => {
        if (input.stageId) return await db.getGradesByStage(input.stageId);
        if (input.countryId) return await db.getGradesByCountry(input.countryId);
        return [];
      }),
    subjects: publicProcedure
      .input(z.object({ countryId: z.number() }))
      .query(async ({ input }) => {
        return await db.getSubjectsByCountry(input.countryId);
      }),
    schools: publicProcedure
      .input(z.object({ countryId: z.number() }))
      .query(async ({ input }) => {
        return await db.getSchoolsByCountry(input.countryId);
      }),
    textbooks: publicProcedure
      .input(z.object({ countryId: z.number(), subjectId: z.number(), gradeId: z.number() }))
      .query(async ({ input }) => {
        return await db.getTextbooks(input.countryId, input.subjectId, input.gradeId);
      }),
    units: publicProcedure
      .input(z.object({ textbookId: z.number() }))
      .query(async ({ input }) => {
        return await db.getUnitsByTextbook(input.textbookId);
      }),
    lessons: publicProcedure
      .input(z.object({ unitId: z.number() }))
      .query(async ({ input }) => {
        return await db.getLessonsByUnit(input.unitId);
      }),
    lesson: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await db.getLessonById(input.id);
      }),
  }),

  // ==================== Saved Selections ====================
  selections: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return await db.getSavedSelections(ctx.user.id);
    }),
    save: protectedProcedure
      .input(z.object({
        label: z.string().optional(),
        countryId: z.number(),
        schoolId: z.number().optional(),
        gradeId: z.number(),
        subjectId: z.number(),
        textbookId: z.number().optional(),
        isDefault: z.boolean().default(false),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.createSavedSelection({ ...input, userId: ctx.user.id });
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await db.deleteSavedSelection(input.id, ctx.user.id);
        return { success: true };
      }),
  }),

  // ==================== Plan Generation ====================
  plans: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return await db.getPlansByUser(ctx.user.id);
    }),
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        return await db.getPlanById(input.id, ctx.user.id);
      }),
    generate: protectedProcedure
      .input(z.object({
        lessonId: z.number(),
        templateId: z.number(),
        planDate: z.string().optional(),
        periods: z.number().default(1),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user.id;
        // Check eligibility
        const eligible = await db.canGenerate(userId);
        if (!eligible) {
          return { success: false, error: "لا يوجد لديك اشتراك فعال أو رصيد كافٍ. يرجى الاشتراك أو شراء خطط فردية." };
        }
        // Check cache first
        const cached = await db.getCachedPlan(userId, input.lessonId, input.templateId);
        if (cached) {
          return { success: true, plan: cached, cached: true };
        }
        // Gather lesson data
        const lesson = await db.getLessonById(input.lessonId);
        if (!lesson) return { success: false, error: "الدرس غير موجود" };
        const unit = await db.getUnitById(lesson.unitId);
        const textbook = unit ? await db.getTextbookById(unit.textbookId) : null;
        const template = await db.getTemplateByCountry(textbook?.countryId ?? 1);
        const templateFields = template?.fields as any;
        // Build user message
        const userMessage = `بيانات الدرس:
- الدولة: قطر
- المرحلة / الصف: ${textbook?.title ?? ""}
- المادة: الكيمياء
- الوحدة: ${unit?.title ?? ""}
- الدرس: ${lesson.title}
- الصفحات: ${lesson.pageFrom ?? ""}-${lesson.pageTo ?? ""}
- عدد الحصص: ${input.periods} | زمن الحصة: 45 دقيقة
- تاريخ التنفيذ: ${input.planDate ?? new Date().toISOString().slice(0, 10)}
- أهداف دليل المعلم (إن وجدت): ${JSON.stringify(lesson.objectives ?? [])}
- الاستراتيجيات المتاحة: ${JSON.stringify(templateFields?.strategies ?? [])}
- القيم المعتمدة في الدولة: ${JSON.stringify(templateFields?.values ?? [])}

أنتج الخطة وفق هذا المخطط حرفياً:
${JSON.stringify(PLAN_JSON_SCHEMA)}`;
        // Create plan record
        const planId = await db.createPlan({
          userId, lessonId: input.lessonId, templateId: input.templateId,
          planDate: input.planDate as any, periods: input.periods,
          status: "generating",
        });
        try {
          const response = await invokeLLM({
            messages: [
              { role: "system", content: PLAN_SYSTEM_PROMPT },
              { role: "user", content: userMessage },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "lesson_plan",
                strict: true,
                schema: PLAN_JSON_SCHEMA as any,
              },
            },
          });
          const rawContent = response.choices?.[0]?.message?.content;
          const contentStr = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
          let planContent: any;
          try { planContent = JSON.parse(contentStr); }
          catch { planContent = JSON.parse(contentStr.replace(/```json\n?/g, "").replace(/```/g, "")); }
          await db.updatePlan(planId!, {
            status: "ready", content: planContent,
            model: response.model ?? "claude",
            inputTokens: response.usage?.prompt_tokens,
            outputTokens: response.usage?.completion_tokens,
          });
          // Deduct credit only if no active subscription
          const subStatus = await db.getSubscriptionStatus(userId);
          if (!subStatus.active) {
            await db.deductCredit(userId);
          }
          return { success: true, planId, content: planContent, cached: false };
        } catch (error: any) {
          await db.updatePlan(planId!, { status: "failed" });
          return { success: false, error: `فشل التوليد: ${error.message}` };
        }
      }),
    worksheet: protectedProcedure
      .input(z.object({
        planId: z.number(),
        lessonId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user.id;
        const plan = await db.getPlanById(input.planId, userId);
        if (!plan || plan.status !== "ready") {
          return { success: false, error: "الخطة غير موجودة أو غير جاهزة" };
        }
        // Check cache first
        const cachedWs = await db.getCachedWorksheet(input.planId);
        if (cachedWs) {
          return { success: true, worksheetId: cachedWs.id, content: cachedWs.content, cached: true };
        }
        const lesson = await db.getLessonById(input.lessonId);
        const userMessage = `خطة الدرس كاملة (JSON):
${JSON.stringify(plan.content)}

عدد الأسئلة المطلوب: 6
أنتج ورقة عمل وفق هذا المخطط:
${JSON.stringify(WORKSHEET_JSON_SCHEMA)}`;
        try {
          const response = await invokeLLM({
            messages: [
              { role: "system", content: WORKSHEET_SYSTEM_PROMPT },
              { role: "user", content: userMessage },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "worksheet",
                strict: true,
                schema: WORKSHEET_JSON_SCHEMA as any,
              },
            },
          });
          const rawWsContent = response.choices?.[0]?.message?.content;
          const wsContentStr = typeof rawWsContent === "string" ? rawWsContent : JSON.stringify(rawWsContent);
          let wsContent: any;
          try { wsContent = JSON.parse(wsContentStr); }
          catch { wsContent = JSON.parse(wsContentStr.replace(/```json\n?/g, "").replace(/```/g, "")); }
          const wsId = await db.createWorksheet({
            userId, planId: input.planId, lessonId: input.lessonId, content: wsContent,
          });
          return { success: true, worksheetId: wsId, content: wsContent };
        } catch (error: any) {
          return { success: false, error: `فشل توليد ورقة العمل: ${error.message}` };
        }
      }),
    worksheets: protectedProcedure.query(async ({ ctx }) => {
      return await db.getWorksheetsByUser(ctx.user.id);
    }),
    exportPdf: protectedProcedure
      .input(z.object({ planId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const plan = await db.getPlanById(input.planId, ctx.user.id);
        if (!plan || plan.status !== "ready") {
          return { success: false, error: "الخطة غير جاهزة" };
        }
        const content = plan.content as any;
        const html = generatePlanHtml(content);
        return { success: true, html };
      }),
  }),

  // ==================== Subscription & Credits ====================
  subscription: router({
    status: protectedProcedure.query(async ({ ctx }) => {
      return await db.getSubscriptionStatus(ctx.user.id);
    }),
    purchases: protectedProcedure.query(async ({ ctx }) => {
      return await db.getPurchasesByUser(ctx.user.id);
    }),
    buyPlan: protectedProcedure
      .input(z.object({ gateway: z.enum(["myfatoorah", "tap"]) }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user.id;
        const country = await db.getActiveCountries();
        const c = country[0];
        if (!c) return { success: false, error: "لا توجد دولة نشطة" };
        const purchaseId = await db.createPurchase({
          userId, kind: "single_plan", quantity: 1,
          amount: c.pricePerPlan, currency: c.currencyCode,
          gateway: input.gateway, status: "pending",
        });
        return { success: true, purchaseId, amount: c.pricePerPlan, currency: c.currencyCode, gateway: input.gateway };
      }),
    buySemester: protectedProcedure
      .input(z.object({ gateway: z.enum(["myfatoorah", "tap"]), termId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user.id;
        const country = await db.getActiveCountries();
        const c = country[0];
        if (!c) return { success: false, error: "لا توجد دولة نشطة" };
        const purchaseId = await db.createPurchase({
          userId, kind: "semester", quantity: 1,
          amount: c.pricePerSemester, currency: c.currencyCode,
          gateway: input.gateway, status: "pending",
        });
        return { success: true, purchaseId, amount: c.pricePerSemester, currency: c.currencyCode, gateway: input.gateway };
      }),
    confirmPayment: protectedProcedure
      .input(z.object({ purchaseId: z.number(), gatewayRef: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await db.updatePurchaseStatus(input.purchaseId, "paid", input.gatewayRef);
        // Add credits or subscription based on purchase kind
        const purchases = await db.getPurchasesByUser(ctx.user.id);
        const purchase = purchases.find(p => p.id === input.purchaseId);
        if (purchase?.kind === "single_plan") {
          await db.addCredits(ctx.user.id, 1);
        }
        return { success: true };
      }),
  }),

  // ==================== Referrals ====================
  referral: router({
    codes: protectedProcedure.query(async ({ ctx }) => {
      return await db.getReferralCodesByUser(ctx.user.id);
    }),
    createCode: protectedProcedure.mutation(async ({ ctx }) => {
      const code = nanoid(8).toUpperCase();
      await db.createReferralCode(ctx.user.id, code);
      return { success: true, code };
    }),
    redemptions: protectedProcedure
      .input(z.object({ codeId: z.number() }))
      .query(async ({ input }) => {
        return await db.getRedemptionsByCode(input.codeId);
      }),
    rewards: protectedProcedure
      .input(z.object({ codeId: z.number() }))
      .query(async ({ input }) => {
        return await db.getRewardsByCode(input.codeId);
      }),
  }),

  // ==================== Resources ====================
  resources: router({
    list: publicProcedure
      .input(z.object({ countryId: z.number().optional(), kind: z.string().optional() }))
      .query(async ({ input }) => {
        return await db.getResources(input.countryId, input.kind);
      }),
  }),

  // ==================== Admin ====================
  admin: router({
    countries: adminProcedure.query(async () => {
      return await db.getAllCountries();
    }),
    addCountry: adminProcedure
      .input(z.object({
        code: z.string(), nameAr: z.string(), currencyCode: z.string(),
        pricePerPlan: z.number().default(10), pricePerSemester: z.number().default(150),
      }))
      .mutation(async ({ input }) => {
        await db.createCountry({ ...input, isActive: true } as any);
        return { success: true };
      }),
    addStage: adminProcedure
      .input(z.object({ countryId: z.number(), nameAr: z.string(), sortOrder: z.number().default(0) }))
      .mutation(async ({ input }) => {
        await db.createStage(input as any);
        return { success: true };
      }),
    addGrade: adminProcedure
      .input(z.object({ stageId: z.number(), nameAr: z.string(), sortOrder: z.number().default(0) }))
      .mutation(async ({ input }) => {
        await db.createGrade(input as any);
        return { success: true };
      }),
    addSubject: adminProcedure
      .input(z.object({ countryId: z.number(), nameAr: z.string() }))
      .mutation(async ({ input }) => {
        await db.createSubject(input as any);
        return { success: true };
      }),
    addTextbook: adminProcedure
      .input(z.object({
        countryId: z.number(), subjectId: z.number(), gradeId: z.number(),
        termId: z.number().optional(), title: z.string(), editionYear: z.number().optional(),
        sourceNote: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        await db.createTextbook(input as any);
        return { success: true };
      }),
    addUnit: adminProcedure
      .input(z.object({ textbookId: z.number(), title: z.string(), sortOrder: z.number().default(0) }))
      .mutation(async ({ input }) => {
        await db.createUnit(input as any);
        return { success: true };
      }),
    addLesson: adminProcedure
      .input(z.object({
        unitId: z.number(), title: z.string(), sortOrder: z.number().default(0),
        objectives: z.array(z.string()).optional(), pageFrom: z.number().optional(),
        pageTo: z.number().optional(), suggestedPeriods: z.number().default(1),
      }))
      .mutation(async ({ input }) => {
        await db.createLesson(input as any);
        return { success: true };
      }),
    unverifiedSchools: adminProcedure.query(async () => {
      return await db.getUnverifiedSchools();
    }),
    verifySchool: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.verifySchool(input.id);
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
