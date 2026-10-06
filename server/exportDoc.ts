import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { getDb } from "./db";
import { planTemplates, countries } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { storageGetSignedUrl } from "./storage";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import type { WorksheetContent } from "../shared/generation";
import { worksheetOptionLabel } from "../shared/generation";

const execFileAsync = promisify(execFile);
const BUNDLED_TEMPLATE = path.resolve("server/templates/plan_template_qa.docx");
let activePdfConversions = 0;

// ==================== Fetch Template from S3 ====================
async function fetchTemplateFile(storagePath: string): Promise<ArrayBuffer> {
  const signedUrl = await storageGetSignedUrl(storagePath);
  const resp = await fetch(signedUrl, { signal: AbortSignal.timeout(15000) });
  if (!resp.ok) throw new Error(`Failed to fetch template: ${resp.status}`);
  return await resp.arrayBuffer();
}

// ==================== Prepare Data for docxtemplater ====================
function prepareData(plan: any): any {
  return {
    basic_info: {
      subject: plan.basic_info?.subject || "",
      grade: plan.basic_info?.grade || "",
      unit: plan.basic_info?.unit || "",
      lesson: plan.basic_info?.lesson || "",
      date: plan.basic_info?.date || "",
      periods: String(plan.basic_info?.periods || 1),
      pages: plan.basic_info?.pages || "",
    },
    objectives: {
      cognitive: (plan.objectives?.cognitive || []).map((o: string) => ({
        text: o,
      })),
      skills: (plan.objectives?.skills || []).map((o: string) => ({ text: o })),
      affective: (plan.objectives?.affective || []).map((o: string) => ({
        text: o,
      })),
    },
    warm_up: plan.warm_up || "",
    strategies: (plan.strategies || []).map((s: string) => ({ text: s })),
    materials: (plan.materials || []).map((m: string) => ({ text: m })),
    procedures: (plan.procedures || []).map((p: any) => ({
      step: p.step || "",
      time_minutes: String(p.time_minutes || 0),
      teacher_role: p.teacher_role || "",
      student_role: p.student_role || "",
    })),
    assessment: {
      diagnostic: plan.assessment?.diagnostic || "",
      formative: (plan.assessment?.formative || []).map((q: string) => ({
        text: q,
      })),
      summative: (plan.assessment?.summative || []).map((q: string) => ({
        text: q,
      })),
    },
    values: (plan.values || []).map((v: string) => ({ text: v })),
    tech_integration: plan.tech_integration || "",
    differentiation: {
      support: plan.differentiation?.support || "",
      enrichment: plan.differentiation?.enrichment || "",
    },
    homework: plan.homework || "",
    real_life_connection: plan.real_life_connection || "",
  };
}

// ==================== Generate DOCX ====================
export async function generateDocx(
  plan: any,
  countryId: number,
  templateId?: number
): Promise<Buffer> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const templates = await db
    .select()
    .from(planTemplates)
    .where(
      templateId
        ? eq(planTemplates.id, templateId)
        : eq(planTemplates.countryId, countryId)
    )
    .limit(1);
  if (templates.length === 0) throw new Error("No template found for country");
  if (templates[0].countryId !== countryId)
    throw new Error("Template country mismatch");

  const templatePath = templates[0].docxStoragePath;
  // The shipped general Qatar template works without remote storage. Other
  // countries must retain their configured template, not silently use Qatar's.
  const countryRows = await db
    .select({ code: countries.code })
    .from(countries)
    .where(eq(countries.id, countryId))
    .limit(1);
  const isQatar = countryRows[0]?.code.toUpperCase() === "QA";
  let templateBuffer: Buffer | ArrayBuffer;
  if (
    isQatar &&
    (!templatePath ||
      templatePath === "templates/plan_template_qa.docx" ||
      templatePath === "plan_template_qa.docx" ||
      templatePath === "server/templates/plan_template_qa.docx")
  ) {
    templateBuffer = await readFile(BUNDLED_TEMPLATE);
  } else {
    templateBuffer = await fetchTemplateFile(templatePath);
  }

  const zip = new PizZip(templateBuffer);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{", end: "}" },
    parser: tag => ({
      get: scope =>
        tag === "."
          ? scope
          : tag.split(".").reduce((value, key) => value?.[key], scope),
    }),
    nullGetter: () => "",
  });

  const data = prepareData(plan);

  doc.render(data);

  const generated = doc.getZip().generate({ type: "nodebuffer" });
  return Buffer.from(generated);
}

// ==================== Generate PDF from DOCX ====================
export async function generatePdfFromDocx(docxBuffer: Buffer): Promise<Buffer> {
  if (activePdfConversions >= 2) throw new Error("PDF conversion busy");
  activePdfConversions++;
  try {
    // Use LibreOffice to convert DOCX to PDF
    const fs = await import("fs");
    const path = await import("path");
    const os = await import("os");

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "plan-export-"));
    const docxPath = path.join(tmpDir, "plan.docx");
    const pdfPath = path.join(tmpDir, "plan.pdf");

    fs.writeFileSync(docxPath, docxBuffer);

    try {
      await execFileAsync(
        "libreoffice",
        [
          `-env:UserInstallation=${(await import("node:url")).pathToFileURL(path.join(tmpDir, "profile")).href}`,
          "--headless",
          "--convert-to",
          "pdf",
          "--outdir",
          tmpDir,
          docxPath,
        ],
        { timeout: 30000, maxBuffer: 2 * 1024 * 1024 }
      );
      const pdfBuffer = fs.readFileSync(pdfPath);
      // Cleanup
      fs.rmSync(tmpDir, { recursive: true, force: true });
      return pdfBuffer;
    } catch (error) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      throw new Error("PDF conversion unavailable", { cause: error });
    }
  } finally {
    activePdfConversions--;
  }
}

function xml(value: unknown): string {
  return String(value ?? "").replace(
    /[&<>\"']/g,
    character =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[character]!
  );
}

function paragraph(text: unknown, bold = false): string {
  const lines = String(text ?? "").split(/\r?\n/);
  return `<w:p><w:pPr><w:bidi/><w:jc w:val="right"/><w:spacing w:after="150"/></w:pPr><w:r><w:rPr><w:rtl/><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>${bold ? "<w:b/><w:bCs/>" : ""}<w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>${lines.map((line, index) => `${index ? "<w:br/>" : ""}<w:t xml:space="preserve">${xml(line)}</w:t>`).join("")}</w:r></w:p>`;
}

/** A real OOXML worksheet, with answers starting on a separate page. */
export async function generateWorksheetDocx(
  worksheet: WorksheetContent
): Promise<Buffer> {
  const zip = new PizZip();
  zip.file(
    "[Content_Types].xml",
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
  );
  zip.file(
    "_rels/.rels",
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
  );
  const questions = worksheet.questions
    .map((question, index) => {
      const options =
        question.options
          ?.map((option, i) =>
            paragraph(`${worksheetOptionLabel(i)}) ${option}`)
          )
          .join("") ?? "";
      const pairs =
        question.left
          ?.map((left, i) =>
            paragraph(
              `${i + 1}. ${left}     |     ${worksheetOptionLabel(i)}) ${question.right?.[i] ?? ""}`
            )
          )
          .join("") ?? "";
      return (
        paragraph(
          `${index + 1}. ${question.text} (${question.points} درجات)`,
          true
        ) +
        options +
        pairs +
        paragraph(
          "الإجابة: ................................................................"
        )
      );
    })
    .join("");
  const answers = worksheet.answer_key
    .map(answer => paragraph(`${answer.q}. ${answer.answer}`))
    .join("");
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraph(worksheet.title, true)}${paragraph("اسم الطالب: ................................    الصف: ................    التاريخ: ................")}${paragraph(worksheet.instructions)}${questions}<w:p><w:r><w:br w:type="page"/></w:r></w:p>${paragraph("نموذج الإجابة — للمعلم", true)}${answers}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/><w:bidi/></w:sectPr></w:body></w:document>`
  );
  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
}
