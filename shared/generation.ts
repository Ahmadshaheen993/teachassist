import { z } from "zod";

const text = z.string().trim().min(1);
const texts = z.array(text);

export const planContentSchema = z.object({
  basic_info: z.object({
    subject: text,
    grade: text,
    unit: text,
    lesson: text,
    date: z.iso.date(),
    periods: z.number().int().min(1).max(10),
    pages: z.string(),
  }),
  objectives: z.object({ cognitive: texts, skills: texts, affective: texts }),
  warm_up: text,
  strategies: texts.min(1),
  materials: texts.min(1),
  procedures: z.array(z.object({
    step: text,
    time_minutes: z.number().positive().max(450),
    teacher_role: text,
    student_role: text,
  })).min(1),
  assessment: z.object({
    diagnostic: text,
    formative: texts.min(1),
    summative: texts.min(1),
  }),
  values: texts,
  tech_integration: text,
  differentiation: z.object({ support: text, enrichment: text }),
  homework: text,
  real_life_connection: text,
});

export const worksheetContentSchema = z.object({
  title: text,
  instructions: text,
  questions: z.array(z.object({
    type: text,
    text,
    options: texts.optional(),
    left: texts.optional(),
    right: texts.optional(),
    points: z.number().positive(),
  })).min(5).max(8),
  answer_key: z.array(z.object({ q: z.number().int().positive(), answer: text })),
}).superRefine((worksheet, ctx) => {
  const answers = new Set(worksheet.answer_key.map(answer => answer.q));
  if (answers.size !== worksheet.questions.length || worksheet.answer_key.length !== answers.size ||
      worksheet.answer_key.some(answer => answer.q > worksheet.questions.length)) {
    ctx.addIssue({ code: "custom", path: ["answer_key"], message: "Each question requires exactly one numbered answer" });
  }
  worksheet.questions.forEach((question, index) => {
    if ((question.left === undefined) !== (question.right === undefined) ||
        (question.left && question.right && question.left.length !== question.right.length)) {
      ctx.addIssue({ code: "custom", path: ["questions", index], message: "Matching columns must have equal lengths" });
    }
  });
});

export type PlanContent = z.infer<typeof planContentSchema>;
export type WorksheetContent = z.infer<typeof worksheetContentSchema>;
const worksheetOptionLabels = ["أ", "ب", "ج", "د", "هـ", "و", "ز", "ح"];
export function worksheetOptionLabel(index: number): string {
  return worksheetOptionLabels[index] ?? String(index + 1);
}

/** Accept a single fenced JSON block, then validate the parsed value before storage. */
export function parseGeneratedJson(content: unknown): unknown {
  if (typeof content !== "string") throw new Error("Missing generated JSON text");
  const trimmed = content.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return JSON.parse(fenced ? fenced[1] : trimmed);
}
