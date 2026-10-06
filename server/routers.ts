import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { revokeOtpSession } from "./auth";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { invokeLLM } from "./_core/llm";
import { z } from "zod";
import { nanoid } from "nanoid";
import * as db from "./db";
import { generatePlanHtml } from "./documentHtml";
import {
  listFolderContents,
  buildQatarCurriculumTree,
  QATAR_FOLDERS,
  getFileViewUrl,
  getFileDownloadUrl,
  downloadFile,
} from "./googleDrive";
import { extractPdfText } from "./pdfExtract";
import { createCheckout, getPaymentReadiness, getPaymentUnavailableReason, isCurrentPaymentTerm } from "./payments";
import { checkRateLimit, RATE_LIMITS } from "./rateLimiter";
import { parseGeneratedJson, planContentSchema, worksheetContentSchema } from "../shared/generation";

// ==================== Plan Generation System Prompt ====================
const PLAN_SYSTEM_PROMPT = `أنت خبير مناهج وطرائق تدريس متخصص في إعداد خطط الدروس اليومية وفق النماذج الوزارية الخليجية.

مهمتك: إنتاج خطة درس يومية كاملة وعالية الجودة اعتماداً على بيانات الدرس المرسلة إليك، بصيغة JSON فقط.

قواعد إلزامية:
1. أخرج JSON صالحاً فقط، دون أي نص قبله أو بعده، ودون علامات Markdown.
2. الأهداف سلوكية قابلة للقياس بصيغة: "أن + فعل إجرائي + الطالب + المحتوى + المعيار"، موزعة على المجالات الثلاثة (معرفي، مهاري، وجداني) وفق تصنيف بلوم، بواقع 3-5 أهداف إجمالاً.
3. اختر الاستراتيجيات من قائمة "الاستراتيجيات المتاحة" المرسلة فقط، ولا تخترع غيرها، واربط كل خطوة تنفيذ باستراتيجية.
4. مجموع أزمنة خطوات التنفيذ يساوي عدد الحصص × 45 دقيقة بالضبط.
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

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(async ({ ctx }) => {
      await revokeOtpSession(ctx.req);
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
        lessonId: z.number().int().positive(),
        templateId: z.number().int().positive().optional(),
        planDate: z.iso.date().optional(),
        periods: z.number().int().min(1).max(10).default(1),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user.id;
        const context = await db.getGenerationLessonContext(input.lessonId);
        if (!context) return { success: false, error: "الدرس غير موجود أو لم يُعتمد منهجه بعد" };
        const { lesson, unit, textbook, country, subject, grade } = context;
        const template = await db.getTemplateByCountry(country.id);
        if (!template) return { success: false, error: "لم يُضف قالب تحضير معتمد لهذه الدولة بعد" };
        if (input.templateId !== undefined && input.templateId !== template.id) {
          return { success: false, error: "قالب التحضير لا يطابق دولة المنهج المختار" };
        }
        const planDate = input.planDate ?? new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Qatar", year: "numeric", month: "2-digit", day: "2-digit",
        }).format(new Date());
        // Already owned content remains accessible even after the last credit.
        const cached = await db.getCachedPlan(userId, lesson.id, template.id, planDate, input.periods);
        if (cached) {
          const validated = planContentSchema.safeParse(cached.content);
          if (validated.success) {
            return { success: true, planId: cached.id, content: validated.data, cached: true };
          }
        }
        checkRateLimit(userId, RATE_LIMITS.generate);
        const subscription = await db.getSubscriptionStatus(userId);
        const creditReserved = !subscription.active && await db.reserveGenerationCredit(userId);
        if (!subscription.active && !creditReserved) {
          return { success: false, error: "لقد استخدمت جميع خططك المجانية. يرجى الاشتراك أو شراء خطط فردية للمتابعة." };
        }
        let planId: number | undefined;
        try {
        const templateFields = template.fields as any;
        const pages = lesson.pageFrom != null && lesson.pageTo != null
          ? `${lesson.pageFrom}-${lesson.pageTo}` : "";
        // Build user message
        const userMessage = `بيانات الدرس:
- الدولة: ${country.nameAr}
- الصف: ${grade.nameAr}
- المادة: ${subject.nameAr}
- الكتاب: ${textbook.title}
- الوحدة: ${unit.title}
- الدرس: ${lesson.title}
- الصفحات: ${pages}
- عدد الحصص: ${input.periods} | زمن الحصة: 45 دقيقة | الزمن الإجمالي: ${input.periods * 45} دقيقة
- تاريخ التنفيذ: ${planDate}
- أهداف دليل المعلم (إن وجدت): ${JSON.stringify(lesson.objectives ?? [])}
- الاستراتيجيات المتاحة: ${JSON.stringify(templateFields?.strategies ?? [])}
- القيم المعتمدة في الدولة: ${JSON.stringify(templateFields?.values ?? [])}

أنتج الخطة وفق هذا المخطط حرفياً:
${JSON.stringify(PLAN_JSON_SCHEMA)}`;
        // Create plan record
        planId = await db.createPlan({
          userId, lessonId: lesson.id, templateId: template.id,
          planDate: new Date(`${planDate}T00:00:00.000Z`), periods: input.periods,
          status: "generating",
        });
          if (!planId) throw new Error("Plan could not be saved");
          const response = await invokeLLM({
            model: "claude-sonnet-4-6",
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
          if (["length", "max_tokens"].includes(response.choices?.[0]?.finish_reason ?? "")) {
            throw new Error("Generated plan was truncated");
          }
          const planContent = planContentSchema.parse(parseGeneratedJson(response.choices?.[0]?.message?.content));
          // These values come from the reviewed curriculum and the teacher's
          // request, rather than trusting the model to reproduce them exactly.
          planContent.basic_info = {
            subject: subject.nameAr, grade: grade.nameAr, unit: unit.title,
            lesson: lesson.title, date: planDate, periods: input.periods, pages,
          };
          const minutes = planContent.procedures.reduce((total, step) => total + step.time_minutes, 0);
          if (Math.abs(minutes - input.periods * 45) > 0.001) {
            throw new Error("Generated plan duration does not match the requested periods");
          }
          if (planContent.objectives.cognitive.length + planContent.objectives.skills.length + planContent.objectives.affective.length === 0) {
            throw new Error("Generated plan has no objectives");
          }
          await db.updatePlan(planId, {
            status: "ready", content: planContent,
            model: response.model ?? "claude",
            inputTokens: response.usage?.prompt_tokens,
            outputTokens: response.usage?.completion_tokens,
          });
          return { success: true, planId, content: planContent, cached: false };
        } catch (error) {
          console.error("[plans.generate] Generation failed", error);
          if (planId) {
            try { await db.updatePlan(planId, { status: "failed" }); }
            catch (updateError) { console.error("[plans.generate] Could not mark failed plan", updateError); }
          }
          if (creditReserved) await db.refundGenerationCredit(userId);
          return { success: false, error: "تعذر توليد خطة سليمة. لم يُخصم رصيد لهذه المحاولة؛ حاول مرة أخرى لاحقاً." };
        }
      }),
    worksheet: protectedProcedure
      .input(z.object({
        planId: z.number().int().positive(),
        lessonId: z.number().int().positive().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user.id;
        const plan = await db.getPlanById(input.planId, userId);
        if (!plan || plan.status !== "ready") {
          return { success: false, error: "الخطة غير موجودة أو غير جاهزة" };
        }
        if (input.lessonId !== undefined && input.lessonId !== plan.lessonId) {
          return { success: false, error: "الدرس لا يطابق الخطة المختارة" };
        }
        // Check cache first
        const cachedWs = await db.getCachedWorksheet(plan.id, userId);
        if (cachedWs) {
          return { success: true, worksheetId: cachedWs.id, content: cachedWs.content, cached: true };
        }
        checkRateLimit(userId, RATE_LIMITS.worksheet);
        const userMessage = `خطة الدرس كاملة (JSON):
${JSON.stringify(plan.content)}

عدد الأسئلة المطلوب: 6
أنتج ورقة عمل وفق هذا المخطط:
${JSON.stringify(WORKSHEET_JSON_SCHEMA)}`;
        try {
          const response = await invokeLLM({
            model: "claude-haiku-4-5-20251001",
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
          if (["length", "max_tokens"].includes(response.choices?.[0]?.finish_reason ?? "")) {
            throw new Error("Generated worksheet was truncated");
          }
          const wsContent = worksheetContentSchema.parse(parseGeneratedJson(response.choices?.[0]?.message?.content));
          const wsId = await db.createWorksheet({
            userId, planId: plan.id, lessonId: plan.lessonId, content: wsContent,
          });
          if (!wsId) throw new Error("Worksheet could not be saved");
          return { success: true, worksheetId: wsId, content: wsContent, cached: false };
        } catch (error) {
          console.error("[plans.worksheet] Generation failed", error);
          return { success: false, error: "تعذر توليد ورقة عمل سليمة. حاول مرة أخرى لاحقاً." };
        }
      }),
    worksheets: protectedProcedure.query(async ({ ctx }) => {
      return await db.getWorksheetsByUser(ctx.user.id);
    }),
    worksheetGet: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .query(async ({ ctx, input }) => db.getWorksheetById(input.id, ctx.user.id)),
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
    exportDocx: protectedProcedure
      .input(z.object({ planId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const plan = await db.getPlanById(input.planId, ctx.user.id);
        if (!plan || plan.status !== "ready") return { success: false, error: "الخطة غير جاهزة" };
        return { success: true, url: `/api/exports/plans/${plan.id}.docx` };
      }),
    exportRealPdf: protectedProcedure
      .input(z.object({ planId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const plan = await db.getPlanById(input.planId, ctx.user.id);
        if (!plan || plan.status !== "ready") return { success: false, error: "الخطة غير جاهزة" };
        return { success: true, url: `/api/exports/plans/${plan.id}.pdf` };
      }),
  }),

  // ==================== Subscription & Credits ====================
  subscription: router({
    paymentConfig: protectedProcedure.query(async ({ ctx }) => {
      const readiness = getPaymentReadiness();
      const user = await db.getUserById(ctx.user.id);
      const country = user?.countryId
        ? (await db.getActiveCountries()).find(c => c.id === user.countryId && c.isActive) ?? null
        : null;
      const term = country ? await db.getCurrentTermForCountry(country.id) : null;
      return {
        enabled: readiness.enabled,
        gateways: readiness.gateways,
        message: readiness.message,
        country,
        semesterTerm: country && isCurrentPaymentTerm(term, country.id) ? term : null,
      };
    }),
    status: protectedProcedure.query(async ({ ctx }) => {
      return await db.getSubscriptionStatus(ctx.user.id);
    }),
    purchases: protectedProcedure.query(async ({ ctx }) => {
      return await db.getPurchasesByUser(ctx.user.id);
    }),
    buyPlan: protectedProcedure
      .input(z.object({ gateway: z.enum(["myfatoorah", "tap", "lemonsqueezy"]) }))
      .mutation(async ({ ctx, input }) => {
        const unavailable = getPaymentUnavailableReason(input.gateway);
        if (unavailable) return unavailable;
        const userId = ctx.user.id;
        checkRateLimit(userId, RATE_LIMITS.buyPlan);
        const user = await db.getUserById(userId);
        if (!user?.countryId) return { success: false, error: "اختر دولتك من الملف الشخصي أولاً" };
        const c = (await db.getActiveCountries()).find(c => c.id === user.countryId && c.isActive);
        if (!c) return { success: false, error: "الدولة المحددة غير متاحة للدفع" };
        if (!Number.isFinite(Number(c.pricePerPlan)) || Number(c.pricePerPlan) <= 0 || !/^[A-Z]{3}$/.test(c.currencyCode)) {
          return { success: false, error: "سعر الخطة غير متاح حالياً" };
        }
        const purchaseId = await db.createPurchase({
          userId, kind: "single_plan", quantity: 1,
          amount: c.pricePerPlan, currency: c.currencyCode,
          gateway: input.gateway, status: "pending",
        });
        if (!purchaseId || !Number.isSafeInteger(purchaseId)) return { success: false, error: "تعذر إنشاء الطلب حالياً" };
        const checkout = await createCheckout({
          gateway: input.gateway,
          purchaseId,
          amount: c.pricePerPlan,
          currency: c.currencyCode,
          customerName: user.fullName || user.name || "Teacher",
          customerEmail: user.email,
          description: "خطة درس واحدة — مساعد المعلم",
        });
        if (!checkout.success) return { success: false, error: checkout.error };
        return { success: true, purchaseId, paymentUrl: checkout.paymentUrl };
      }),
    buySemester: protectedProcedure
      .input(z.object({ gateway: z.enum(["myfatoorah", "tap", "lemonsqueezy"]) }))
      .mutation(async ({ ctx, input }) => {
        const unavailable = getPaymentUnavailableReason(input.gateway);
        if (unavailable) return unavailable;
        const userId = ctx.user.id;
        checkRateLimit(userId, RATE_LIMITS.buySemester);
        const user = await db.getUserById(userId);
        if (!user?.countryId) return { success: false, error: "اختر دولتك من الملف الشخصي أولاً" };
        const c = (await db.getActiveCountries()).find(c => c.id === user.countryId && c.isActive);
        if (!c) return { success: false, error: "الدولة المحددة غير متاحة للدفع" };
        const term = await db.getCurrentTermForCountry(c.id);
        if (!isCurrentPaymentTerm(term, c.id)) return { success: false, error: "لا يوجد فصل دراسي صالح للدفع حالياً" };
        if (!Number.isFinite(Number(c.pricePerSemester)) || Number(c.pricePerSemester) <= 0 || !/^[A-Z]{3}$/.test(c.currencyCode)) {
          return { success: false, error: "سعر الاشتراك غير متاح حالياً" };
        }
        const purchaseId = await db.createPurchase({
          userId, kind: "semester", quantity: 1,
          amount: c.pricePerSemester, currency: c.currencyCode,
          gateway: input.gateway, status: "pending",
        });
        if (!purchaseId || !Number.isSafeInteger(purchaseId)) return { success: false, error: "تعذر إنشاء الطلب حالياً" };
        const checkout = await createCheckout({
          gateway: input.gateway,
          purchaseId,
          amount: c.pricePerSemester,
          currency: c.currencyCode,
          customerName: user.fullName || user.name || "Teacher",
          customerEmail: user.email,
          description: "اشتراك فصل دراسي — مساعد المعلم",
        });
        if (!checkout.success) return { success: false, error: checkout.error };
        return { success: true, purchaseId, paymentUrl: checkout.paymentUrl };
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
    redeem: protectedProcedure
      .input(z.object({ code: z.string().min(4).max(20) }))
      .mutation(async ({ ctx, input }) => {
        checkRateLimit(ctx.user.id, RATE_LIMITS.redeem);
        return await db.redeemReferralCode(input.code.trim().toUpperCase(), ctx.user.id);
      }),
    redemptions: protectedProcedure
      .input(z.object({ codeId: z.number() }))
      .query(async ({ ctx, input }) => {
        const code = await db.getReferralCodeById(input.codeId);
        if (!code || code.ownerUserId !== ctx.user.id) return [];
        return await db.getRedemptionsByCode(input.codeId);
      }),
    rewards: protectedProcedure
      .input(z.object({ codeId: z.number() }))
      .query(async ({ ctx, input }) => {
        const code = await db.getReferralCodeById(input.codeId);
        if (!code || code.ownerUserId !== ctx.user.id) return [];
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
    // Smart PDF Indexer: download a PDF from Drive, extract text, use Claude to parse the table of contents
    indexPdf: adminProcedure
      .input(z.object({
        fileId: z.string(),
        countryId: z.number(),
        subjectId: z.number(),
        gradeId: z.number(),
        termId: z.number().optional(),
        textbookTitle: z.string(),
        editionYear: z.number().optional(),
        maxPages: z.number().int().min(1).max(200).default(30),
      }))
      .mutation(async ({ ctx, input }) => {
        checkRateLimit(ctx.user.id, RATE_LIMITS.indexPdf);
        try {
          // 1. Download PDF from Drive
          const pdfBuffer = await downloadFile(input.fileId);

          // 2. Extract text from first N pages (table of contents is usually at the beginning)
          const extractedText = await extractPdfText(pdfBuffer, input.maxPages);

          // 3. Use Claude to parse the table of contents
          const indexPrompt = `أنت خبير في تحليل فهوس كتب العلوم المدرسية. إليك نص أول ${input.maxPages} صفحة من كتاب مدرسي. استخرج الفهرس الكامل بشكل منظم.

أنتج JSON يحتوي على:
- units: مصفوفة من الوحدات، كل وحدة فيها: title (عنوان الوحدة)، sortOrder (رقمها)، lessons (مصفوفة من الدروس)
- كل درس فيه: title (عنوان الدرس)، sortOrder (رقمه)، pageFrom (صفحة البداية)، pageTo (صفحة النهاية)، suggestedPeriods (عدد الحصص المقترح، افترض 1 إن لم يوجد)

إليك النص المستخرج:
${extractedText.slice(0, 50000)}`;

          const response = await invokeLLM({
            model: "claude-sonnet-4-6",
            messages: [
              { role: "system", content: "أنت مساعد فهرسة كتب مدرسية. استخرج الفهرس بدقة من النص المعطى." },
              { role: "user", content: indexPrompt },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "textbook_index",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    units: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          title: { type: "string" },
                          sortOrder: { type: "number" },
                          lessons: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                title: { type: "string" },
                                sortOrder: { type: "number" },
                                pageFrom: { type: "number" },
                                pageTo: { type: "number" },
                                suggestedPeriods: { type: "number" },
                              },
                              required: ["title", "sortOrder", "pageFrom", "pageTo", "suggestedPeriods"],
                            },
                          },
                        },
                        required: ["title", "sortOrder", "lessons"],
                      },
                    },
                  },
                  required: ["units"],
                },
              },
            },
          });

          const rawContent = response.choices?.[0]?.message?.content;
          const contentStr = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
          let index: { units: Array<{ title: string; sortOrder: number; lessons: Array<any> }> };
          try { index = JSON.parse(contentStr); }
          catch { index = JSON.parse(contentStr.replace(/```json\n?/g, "").replace(/```/g, "")); }

          // 4. Create textbook record
          const textbookId = await db.createTextbook({
            countryId: input.countryId,
            subjectId: input.subjectId,
            gradeId: input.gradeId,
            termId: input.termId,
            title: input.textbookTitle,
            editionYear: input.editionYear,
            sourceNote: `Auto-indexed from Google Drive file: ${input.fileId}`,
          } as any);

          // 5. Create units and lessons
          let unitCount = 0;
          let lessonCount = 0;
          for (const unit of index.units) {
            const unitId = await db.createUnit({
              textbookId: textbookId!,
              title: unit.title,
              sortOrder: unit.sortOrder,
            } as any);
            unitCount++;
            for (const lesson of unit.lessons) {
              await db.createLesson({
                unitId: unitId!,
                title: lesson.title,
                sortOrder: lesson.sortOrder,
                pageFrom: lesson.pageFrom,
                pageTo: lesson.pageTo,
                suggestedPeriods: lesson.suggestedPeriods || 1,
              } as any);
              lessonCount++;
            }
          }

          return {
            success: true,
            textbookId,
            units: unitCount,
            lessons: lessonCount,
            index,
          };
        } catch (error: any) {
          return { success: false, error: `فشل الفهرسة: ${error.message}` };
        }
      }),

    // List all textbooks (including drafts) for admin review
    listTextbooks: adminProcedure
      .input(z.object({ includeDrafts: z.boolean().default(true) }))
      .query(async ({ input }) => {
        return await db.getAllTextbooks(input.includeDrafts);
      }),

    // Get units for a textbook (including drafts) for admin review
    reviewUnits: adminProcedure
      .input(z.object({ textbookId: z.number() }))
      .query(async ({ input }) => {
        return await db.getAllUnitsByTextbook(input.textbookId);
      }),

    // Get lessons for a unit (including drafts) for admin review
    reviewLessons: adminProcedure
      .input(z.object({ unitId: z.number() }))
      .query(async ({ input }) => {
        return await db.getAllLessonsByUnit(input.unitId);
      }),

    // Approve a textbook and all its units/lessons
    approveTextbook: adminProcedure
      .input(z.object({ textbookId: z.number() }))
      .mutation(async ({ input }) => {
        await db.approveTextbook(input.textbookId);
        return { success: true };
      }),

    // Update a unit
    updateUnit: adminProcedure
      .input(z.object({
        unitId: z.number(),
        title: z.string().optional(),
        sortOrder: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        await db.updateUnit(input.unitId, { title: input.title, sortOrder: input.sortOrder });
        return { success: true };
      }),

    // Update a lesson
    updateLesson: adminProcedure
      .input(z.object({
        lessonId: z.number(),
        title: z.string().optional(),
        sortOrder: z.number().optional(),
        pageFrom: z.number().optional(),
        pageTo: z.number().optional(),
        suggestedPeriods: z.number().optional(),
        objectives: z.any().optional(),
      }))
      .mutation(async ({ input }) => {
        const { lessonId, ...data } = input;
        await db.updateLesson(lessonId, data);
        return { success: true };
      }),

    // Delete a unit and its lessons
    deleteUnit: adminProcedure
      .input(z.object({ unitId: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteUnitCascade(input.unitId);
        return { success: true };
      }),

    // Delete a lesson
    deleteLesson: adminProcedure
      .input(z.object({ lessonId: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteLesson(input.lessonId);
        return { success: true };
      }),

    // Delete a textbook and all its units/lessons
    deleteTextbook: adminProcedure
      .input(z.object({ textbookId: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteTextbookCascade(input.textbookId);
        return { success: true };
      }),
  }),

  // ==================== Google Drive — Curriculum Files ====================
  drive: router({
    // List contents of a specific Drive folder — admin only, restricted to Qatar curriculum folders
    listFolder: adminProcedure
      .input(z.object({ folderId: z.string() }))
      .query(async ({ input }) => {
        // Whitelist of allowed folder IDs (Qatar curriculum + their sub-folders discovered dynamically)
        const allowedRoots = Object.values(QATAR_FOLDERS);
        // Allow if the folder is a known Qatar folder, or if it was discovered as a child of one
        // For security, we check against the known roots. Sub-folder browsing is allowed because
        // the admin navigates from a known root folder.
        if (!allowedRoots.includes(input.folderId as any)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "غير مصرح بالوصول لهذا المجلد" });
        }
        return await listFolderContents(input.folderId);
      }),
    // Get the full Qatar curriculum tree from Google Drive — admin only
    qatarTree: adminProcedure.query(async () => {
      return await buildQatarCurriculumTree();
    }),
    // Get Qatar folder IDs (for navigation) — admin only
    qatarFolders: adminProcedure.query(() => QATAR_FOLDERS),
    // Get view/download URLs for a file — admin only
    fileUrls: adminProcedure
      .input(z.object({ fileId: z.string() }))
      .query(({ input }) => ({
        viewUrl: getFileViewUrl(input.fileId),
        downloadUrl: getFileDownloadUrl(input.fileId),
      })),
    // Download a file from Drive (returns base64) — admin only
    downloadFile: adminProcedure
      .input(z.object({ fileId: z.string() }))
      .mutation(async ({ input }) => {
        const buffer = await downloadFile(input.fileId);
        return {
          success: true,
          base64: buffer.toString("base64"),
          size: buffer.length,
        };
      }),
  }),
});

export type AppRouter = typeof appRouter;
