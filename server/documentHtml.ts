import type { PlanContent, WorksheetContent } from "../shared/generation";
import { worksheetOptionLabel } from "../shared/generation";

export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(
    /[&<>"']/g,
    character =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!
  );
}

function page(title: string, body: string): string {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font-family:Arial,'Noto Sans Arabic',sans-serif;color:#202020;margin:30px;line-height:1.7}h1{font-size:24px;text-align:center}h2{font-size:18px;color:#0d6b56;border-bottom:1px solid #bbb}table{width:100%;border-collapse:collapse}td,th{border:1px solid #aaa;padding:8px;text-align:right;vertical-align:top}p,li{white-space:pre-wrap}ul{padding-right:25px}.answers{break-before:page;page-break-before:always}@page{size:A4;margin:18mm}@media print{body{margin:0}h2{break-after:avoid}tr{break-inside:avoid}}</style></head><body>${body}</body></html>`;
}
const list = (items: string[]) =>
  `<ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
const section = (title: string, text: unknown) =>
  `<h2>${escapeHtml(title)}</h2><p>${escapeHtml(text)}</p>`;

export function generatePlanHtml(plan: PlanContent): string {
  const info = plan.basic_info;
  return page(
    "خطة درس يومية",
    `<h1>خطة درس يومية</h1><table>${[
      ["المادة", info.subject],
      ["الصف", info.grade],
      ["الوحدة", info.unit],
      ["الدرس", info.lesson],
      ["التاريخ", info.date],
      ["عدد الحصص", info.periods],
      ["الصفحات", info.pages],
    ]
      .map(
        ([label, value]) =>
          `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`
      )
      .join(
        ""
      )}</table><h2>الأهداف التعليمية</h2><h3>المعرفية</h3>${list(plan.objectives.cognitive)}<h3>المهارية</h3>${list(plan.objectives.skills)}<h3>الوجدانية</h3>${list(plan.objectives.affective)}${section("التهيئة", plan.warm_up)}<h2>الاستراتيجيات</h2>${list(plan.strategies)}<h2>الوسائل</h2>${list(plan.materials)}<h2>خطوات التنفيذ</h2><table><tr><th>الخطوة</th><th>الدقائق</th><th>دور المعلم</th><th>دور الطالب</th></tr>${plan.procedures.map(procedure => `<tr><td>${escapeHtml(procedure.step)}</td><td>${escapeHtml(procedure.time_minutes)}</td><td>${escapeHtml(procedure.teacher_role)}</td><td>${escapeHtml(procedure.student_role)}</td></tr>`).join("")}</table>${section("التقويم القبلي", plan.assessment.diagnostic)}<h2>التقويم البنائي</h2>${list(plan.assessment.formative)}<h2>التقويم الختامي</h2>${list(plan.assessment.summative)}<h2>القيم</h2>${list(plan.values)}${section("الدمج التكنولوجي", plan.tech_integration)}${section("دعم المتعثرين", plan.differentiation.support)}${section("إثراء المتفوقين", plan.differentiation.enrichment)}${section("الواجب المنزلي", plan.homework)}${section("الربط بالحياة", plan.real_life_connection)}`
  );
}

export function generateWorksheetHtml(worksheet: WorksheetContent): string {
  return page(
    worksheet.title,
    `<h1>${escapeHtml(worksheet.title)}</h1><p>اسم الطالب: ................................    الصف: ................    التاريخ: ................</p><p>${escapeHtml(worksheet.instructions)}</p>${worksheet.questions.map((question, index) => `<h2>${index + 1}. ${escapeHtml(question.text)} (${escapeHtml(question.points)} درجات)</h2>${question.options ? list(question.options.map((option, i) => `${worksheetOptionLabel(i)}) ${option}`)) : ""}${question.left ? `<table>${question.left.map((item, i) => `<tr><td>${i + 1}. ${escapeHtml(item)}</td><td>${worksheetOptionLabel(i)}) ${escapeHtml(question.right?.[i] ?? "")}</td></tr>`).join("")}</table>` : ""}<p>الإجابة: ................................................................</p>`).join("")}<div class="answers"><h1>نموذج الإجابة — للمعلم</h1>${worksheet.answer_key.map(answer => `<p>${escapeHtml(answer.q)}. ${escapeHtml(answer.answer)}</p>`).join("")}</div>`
  );
}
