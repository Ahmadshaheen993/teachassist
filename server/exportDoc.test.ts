import { describe, expect, it, vi } from "vitest";
import PizZip from "pizzip";
const template = vi.hoisted(() => ({
  path: "templates/plan_template_qa.docx",
}));

vi.mock("./db", () => ({
  getDb: vi.fn(async () => ({
    select: (columns?: unknown) => ({
      from: () => ({
        where: () => ({
          limit: async () =>
            columns
              ? [{ code: "QA" }]
              : [{ id: 1, countryId: 1, docxStoragePath: template.path }],
        }),
      }),
    }),
  })),
}));
vi.mock("./storage", () => ({
  storageGetSignedUrl: vi.fn(async () => {
    throw new Error("No storage configured");
  }),
}));

import { generateDocx, generateWorksheetDocx } from "./exportDoc";
import { generatePlanHtml, generateWorksheetHtml } from "./documentHtml";
import type { PlanContent, WorksheetContent } from "../shared/generation";

export const fixturePlan: PlanContent = {
  basic_info: {
    subject: "الكيمياء",
    grade: "الحادي عشر",
    unit: "الذرة",
    lesson: "التوزيع الإلكتروني",
    date: "2026-10-06",
    periods: 1,
    pages: "12–15",
  },
  objectives: {
    cognitive: ["يفسر الطالب التوزيع الإلكتروني", "يطبق الطالب قاعدة هوند"],
    skills: ["يرسم الطالب مخطط المدارات"],
    affective: ["يقدر الطالب دور النماذج"],
  },
  warm_up: "ما عدد إلكترونات النيتروجين؟",
  strategies: ["التعلم التعاوني"],
  materials: ["السبورة"],
  procedures: [
    {
      step: "التوزيع",
      time_minutes: 45,
      teacher_role: "يشرح المعلم",
      student_role: "يبرر الطالب",
    },
  ],
  assessment: {
    diagnostic: "ما العدد الذري؟",
    formative: ["لماذا تتوزع الإلكترونات منفردة؟"],
    summative: ["وزع إلكترونات النيتروجين"],
  },
  values: ["الدقة"],
  tech_integration: "عرض محاكاة",
  differentiation: { support: "مخطط مساعد", enrichment: "مقارنة ذرتين" },
  homework: "تدريب",
  real_life_connection: "مصابيح الإضاءة",
};
const worksheet: WorksheetContent = {
  title: "التوزيع الإلكتروني",
  instructions: "أجب عن الأسئلة.",
  questions: [
    {
      type: "اختيار",
      text: "اختر التوزيع الصحيح",
      options: ["1s² 2s² 2p³", "اختيار آخر"],
      points: 2,
    },
  ],
  answer_key: [{ q: 1, answer: "1s² 2s² 2p³" }],
};

describe("Document export output", () => {
  it("renders the shipped template with nested fields and all loop values without R2", async () => {
    const bytes = await generateDocx(fixturePlan, 1, 1);
    const zip = new PizZip(bytes);
    const xml = zip.file("word/document.xml")!.asText();
    for (const value of [
      "الكيمياء",
      "الحادي عشر",
      "التوزيع الإلكتروني",
      ...fixturePlan.objectives.cognitive,
      "لماذا تتوزع الإلكترونات منفردة؟",
      "يبرر الطالب",
    ])
      expect(xml).toContain(value);
    expect(xml).not.toContain("undefined");
    expect(xml).not.toMatch(/\{[#/]/);
    expect(zip.file("[Content_Types].xml")).not.toBeNull();
  });

  it("does not silently use the Qatar template for another country", async () => {
    await expect(generateDocx(fixturePlan, 2, 1)).rejects.toThrow(
      "country mismatch"
    );
  });
  it("does not replace an unavailable custom Qatar template with the generic template", async () => {
    template.path = "custom/school-ministry-template.docx";
    try {
      await expect(generateDocx(fixturePlan, 1, 1)).rejects.toThrow(
        "No storage configured"
      );
    } finally {
      template.path = "templates/plan_template_qa.docx";
    }
  });

  it("builds a real worksheet DOCX with Arabic content, options, escaped XML and separate answer page", async () => {
    const bytes = await generateWorksheetDocx({
      ...worksheet,
      title: "<عنوان & نص>",
    });
    const zip = new PizZip(bytes);
    const xml = zip.file("word/document.xml")!.asText();
    expect(xml).toContain("&lt;عنوان &amp; نص&gt;");
    expect(xml).toContain("1s² 2s² 2p³");
    expect(xml).toContain('<w:br w:type="page"/>');
    expect(xml).toContain("نموذج الإجابة");
    expect(zip.file("_rels/.rels")!.asText()).toContain("word/document.xml");
  });

  it("escapes generated content in browser PDF fallback", () => {
    const payload = '<img src=x onerror="alert(1)"><script>alert(1)</script>';
    const html = generatePlanHtml({ ...fixturePlan, warm_up: payload });
    const wsHtml = generateWorksheetHtml({ ...worksheet, title: payload });
    for (const value of [html, wsHtml]) {
      expect(value).not.toContain("<script>");
      expect(value).not.toContain("<img");
      expect(value).toContain("&lt;");
    }
  });
  it("keeps Arabic option and matching labels consistent with letter-based answer keys", async () => {
    const content: WorksheetContent = {
      ...worksheet,
      questions: [
        { type: "اختيار", text: "اختر", options: ["الخيار الأول", "الخيار الثاني"], points: 1 },
        { type: "مطابقة", text: "صل", left: ["العنصر الأول", "العنصر الثاني"], right: ["التفسير الأول", "التفسير الثاني"], points: 2 },
      ],
      answer_key: [{ q: 1, answer: "ب" }, { q: 2, answer: "1-ب، 2-أ" }],
    };
    const xml = new PizZip(await generateWorksheetDocx(content)).file("word/document.xml")!.asText();
    const html = generateWorksheetHtml(content);
    for (const output of [xml, html]) {
      expect(output).toContain("ب) الخيار الثاني");
      expect(output).toContain("ب) التفسير الثاني");
      expect(output).toContain("1-ب، 2-أ");
    }
  });
});
