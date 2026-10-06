import { Router, type Express } from "express";
import { authenticateUser } from "./_core/context";
import * as db from "./db";
import {
  planContentSchema,
  worksheetContentSchema,
} from "../shared/generation";
import {
  generateDocx,
  generateWorksheetDocx,
  generatePdfFromDocx,
} from "./exportDoc";
import { generatePlanHtml, generateWorksheetHtml } from "./documentHtml";
import { checkRateLimit, RATE_LIMITS } from "./rateLimiter";
import { TRPCError } from "@trpc/server";

export const exportRoutes = Router();

exportRoutes.get("/:kind/:id.:format", async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  // Print fallback contains only escaped content and cannot load scripts or remote assets.
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
  );
  try {
    const user = await authenticateUser(req);
    if (!user)
      return void res
        .status(401)
        .json({ error: "يرجى تسجيل الدخول لتنزيل الملف" });
    const id = Number(req.params.id);
    const format = req.params.format;
    const kind = req.params.kind;
    if (
      !Number.isSafeInteger(id) ||
      id <= 0 ||
      !["docx", "pdf"].includes(format) ||
      !["plans", "worksheets"].includes(kind)
    ) {
      return void res.status(404).json({ error: "الملف غير موجود" });
    }
    checkRateLimit(
      user.id,
      format === "pdf" ? RATE_LIMITS.exportPdf : RATE_LIMITS.exportDocx
    );

    let docx: Buffer;
    let fallback: () => string;
    if (kind === "plans") {
      const plan = await db.getPlanById(id, user.id);
      if (!plan || plan.status !== "ready")
        return void res
          .status(404)
          .json({ error: "الخطة غير موجودة أو غير جاهزة" });
      const content = planContentSchema.parse(plan.content);
      // Resolve the original curriculum, even if the book later goes back to draft.
      const lesson = await db.getLessonById(plan.lessonId);
      const unit = lesson && (await db.getUnitById(lesson.unitId));
      const textbook = unit && (await db.getTextbookById(unit.textbookId));
      if (!textbook)
        return void res.status(404).json({ error: "مرجع الخطة غير موجود" });
      fallback = () => generatePlanHtml(content);
      if (format === "pdf") {
        try {
          docx = await generateDocx(
            content,
            textbook.countryId,
            plan.templateId
          );
        } catch {
          return void res.type("html").send(fallback());
        }
      } else {
        docx = await generateDocx(content, textbook.countryId, plan.templateId);
      }
    } else {
      const worksheet = await db.getWorksheetById(id, user.id);
      if (!worksheet)
        return void res.status(404).json({ error: "ورقة العمل غير موجودة" });
      const content = worksheetContentSchema.parse(worksheet.content);
      docx = await generateWorksheetDocx(content);
      fallback = () => generateWorksheetHtml(content);
    }

    if (format === "docx") {
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${kind}_${id}.docx"`
      );
      return void res
        .type(
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        )
        .send(docx);
    }
    try {
      const pdf = await generatePdfFromDocx(docx);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${kind}_${id}.pdf"`
      );
      return void res.type("application/pdf").send(pdf);
    } catch {
      return void res.type("html").send(fallback());
    }
  } catch (error) {
    if (error instanceof TRPCError && error.code === "TOO_MANY_REQUESTS") {
      return void res.status(429).json({ error: error.message });
    }
    console.error(
      "[exports] Download failed",
      error instanceof Error ? error.name : "unknown"
    );
    return void res
      .status(500)
      .json({ error: "تعذّر تجهيز الملف، حاول مرة أخرى" });
  }
});

export function registerExportRoutes(app: Express): void {
  app.use("/api/exports", exportRoutes);
}
