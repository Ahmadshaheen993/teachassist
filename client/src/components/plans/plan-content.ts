import type { PlanContent, WorksheetContent } from "@shared/generation";

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const text = (value: unknown) => typeof value === "string" ? value : "";
const texts = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
const number = (value: unknown, fallback = 0) => typeof value === "number" && Number.isFinite(value) ? value : fallback;

// Older saved records may predate generation validation. Render only known fields as text.
export function readPlanContent(value: unknown): PlanContent | null {
  const plan = record(value);
  const basic = record(plan?.basic_info);
  if (!plan || !basic) return null;
  const objectives = record(plan.objectives);
  const assessment = record(plan.assessment);
  const differentiation = record(plan.differentiation);
  return {
    basic_info: {
      subject: text(basic.subject), grade: text(basic.grade), unit: text(basic.unit),
      lesson: text(basic.lesson), date: text(basic.date), periods: number(basic.periods, 1), pages: text(basic.pages),
    },
    objectives: { cognitive: texts(objectives?.cognitive), skills: texts(objectives?.skills), affective: texts(objectives?.affective) },
    warm_up: text(plan.warm_up), strategies: texts(plan.strategies), materials: texts(plan.materials),
    procedures: (Array.isArray(plan.procedures) ? plan.procedures : []).flatMap(item => {
      const step = record(item);
      return step ? [{ step: text(step.step), time_minutes: number(step.time_minutes), teacher_role: text(step.teacher_role), student_role: text(step.student_role) }] : [];
    }),
    assessment: { diagnostic: text(assessment?.diagnostic), formative: texts(assessment?.formative), summative: texts(assessment?.summative) },
    values: texts(plan.values), tech_integration: text(plan.tech_integration),
    differentiation: { support: text(differentiation?.support), enrichment: text(differentiation?.enrichment) },
    homework: text(plan.homework), real_life_connection: text(plan.real_life_connection),
  };
}

export function readWorksheetContent(value: unknown): WorksheetContent | null {
  const worksheet = record(value);
  if (!worksheet || !Array.isArray(worksheet.questions)) return null;
  return {
    title: text(worksheet.title), instructions: text(worksheet.instructions),
    questions: worksheet.questions.flatMap(item => {
      const question = record(item);
      return question ? [{
        type: text(question.type), text: text(question.text), points: number(question.points),
        options: Array.isArray(question.options) ? texts(question.options) : undefined,
        left: Array.isArray(question.left) ? texts(question.left) : undefined,
        right: Array.isArray(question.right) ? texts(question.right) : undefined,
      }] : [];
    }),
    answer_key: (Array.isArray(worksheet.answer_key) ? worksheet.answer_key : []).flatMap(item => {
      const answer = record(item);
      return answer ? [{ q: number(answer.q), answer: text(answer.answer) }] : [];
    }),
  };
}
