import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { getDb } from "./db";
import { planTemplates } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { storageGetSignedUrl } from "./storage";

// ==================== Fetch Template from S3 ====================
async function fetchTemplateFile(storagePath: string): Promise<ArrayBuffer> {
  const signedUrl = await storageGetSignedUrl(storagePath);
  const resp = await fetch(signedUrl);
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
      cognitive: (plan.objectives?.cognitive || []).map((o: string) => ({ text: o })),
      skills: (plan.objectives?.skills || []).map((o: string) => ({ text: o })),
      affective: (plan.objectives?.affective || []).map((o: string) => ({ text: o })),
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
      formative: (plan.assessment?.formative || []).map((q: string) => ({ text: q })),
      summative: (plan.assessment?.summative || []).map((q: string) => ({ text: q })),
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
export async function generateDocx(plan: any, countryId: number): Promise<Buffer> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const templates = await db.select().from(planTemplates).where(eq(planTemplates.countryId, countryId)).limit(1);
  if (templates.length === 0) throw new Error("No template found for country");

  const templatePath = templates[0].docxStoragePath;
  const templateBuffer = await fetchTemplateFile(templatePath);

  const zip = new PizZip(templateBuffer);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{", end: "}" },
  });

  const data = prepareData(plan);

  doc.render(data);

  const generated = doc.getZip().generate({ type: "nodebuffer" });
  return Buffer.from(generated);
}

// ==================== Generate PDF from DOCX ====================
export async function generatePdfFromDocx(docxBuffer: Buffer): Promise<Buffer> {
  // Use LibreOffice to convert DOCX to PDF
  const { execSync } = await import("child_process");
  const fs = await import("fs");
  const path = await import("path");
  const os = await import("os");

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "plan-export-"));
  const docxPath = path.join(tmpDir, "plan.docx");
  const pdfPath = path.join(tmpDir, "plan.pdf");

  fs.writeFileSync(docxPath, docxBuffer);

  try {
    execSync(`libreoffice --headless --convert-to pdf --outdir "${tmpDir}" "${docxPath}"`, {
      timeout: 30000,
      stdio: "pipe",
    });
    const pdfBuffer = fs.readFileSync(pdfPath);
    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return pdfBuffer;
  } catch (error) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    throw new Error(`PDF conversion failed: ${error}`);
  }
}
