import type { ReactNode } from "react";
import type { PlanContent } from "@shared/generation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText } from "lucide-react";
import { ExportButtons } from "./ExportButtons";

export function PlanDisplay({ plan, planId, children }: { plan: PlanContent; planId: number; children?: ReactNode }) {
  return (
    <Card className="overflow-hidden" dir="rtl">
      <CardHeader className="bg-primary/5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 shrink-0 text-primary" />{plan.basic_info.lesson || "خطة الدرس"}</CardTitle>
            <CardDescription className="mt-1">خطة محفوظة #{planId} · راجع المحتوى قبل استخدامه في الحصة</CardDescription>
          </div>
          <ExportButtons kind="plans" id={planId} />
        </div>
      </CardHeader>
      <CardContent className="space-y-6 p-4 sm:p-6">
        <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/50 p-4 md:grid-cols-4">
          <Info label="المادة" value={plan.basic_info.subject} />
          <Info label="الصف" value={plan.basic_info.grade} />
          <Info label="الوحدة" value={plan.basic_info.unit} />
          <Info label="الدرس" value={plan.basic_info.lesson} />
          <Info label="تاريخ التنفيذ" value={plan.basic_info.date} />
          <Info label="عدد الحصص" value={String(plan.basic_info.periods)} />
          <Info label="الصفحات" value={plan.basic_info.pages} />
        </div>
        <Section title="الأهداف التعليمية">
          <div className="space-y-3">
            {([
              ["المعرفية", plan.objectives.cognitive], ["المهارية", plan.objectives.skills], ["الوجدانية", plan.objectives.affective],
            ] as const).filter(([, items]) => items.length > 0).map(([title, items]) => (
              <div key={title} className="rounded-lg bg-muted/50 p-3"><p className="mb-2 text-sm font-medium">{title}</p><TextList items={items} /></div>
            ))}
          </div>
        </Section>
        <Section title="التهيئة"><Text>{plan.warm_up}</Text></Section>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Section title="الاستراتيجيات"><Tags items={plan.strategies} /></Section>
          <Section title="الوسائل التعليمية"><Tags items={plan.materials} /></Section>
        </div>
        <Section title="خطوات التنفيذ">
          <div className="space-y-3">
            {plan.procedures.map((step, index) => (
              <div key={index} className="rounded-lg border p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-medium">الخطوة {index + 1}: {step.step}</h4><Badge>{step.time_minutes} دقيقة</Badge></div>
                <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
                  <div><p className="mb-1 font-medium text-muted-foreground">دور المعلم</p><Text>{step.teacher_role}</Text></div>
                  <div><p className="mb-1 font-medium text-muted-foreground">دور الطالب</p><Text>{step.student_role}</Text></div>
                </div>
              </div>
            ))}
          </div>
        </Section>
        <Section title="التقويم">
          <div className="space-y-3">
            <div><p className="mb-1 text-sm font-medium">القبلي</p><Text>{plan.assessment.diagnostic}</Text></div>
            <div><p className="mb-1 text-sm font-medium">البنائي</p><TextList items={plan.assessment.formative} /></div>
            <div><p className="mb-1 text-sm font-medium">الختامي</p><TextList items={plan.assessment.summative} /></div>
          </div>
        </Section>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Section title="القيم التربوية"><Tags items={plan.values} /></Section>
          <Section title="الدمج التكنولوجي"><Text>{plan.tech_integration}</Text></Section>
        </div>
        <Section title="مراعاة الفروق الفردية">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-lg bg-green-50 p-3 dark:bg-green-950/20"><p className="mb-1 text-sm font-medium text-green-700 dark:text-green-400">دعم المتعثرين</p><Text>{plan.differentiation.support}</Text></div>
            <div className="rounded-lg bg-blue-50 p-3 dark:bg-blue-950/20"><p className="mb-1 text-sm font-medium text-blue-700 dark:text-blue-400">إثراء المتفوقين</p><Text>{plan.differentiation.enrichment}</Text></div>
          </div>
        </Section>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Section title="الواجب المنزلي"><Text>{plan.homework}</Text></Section>
          <Section title="الربط بالحياة"><Text>{plan.real_life_connection}</Text></Section>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-muted-foreground">{label}</p><p className="break-words text-sm font-medium">{value || "غير محدد"}</p></div>;
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section><h3 className="mb-2 text-base font-bold text-primary">{title}</h3>{children}</section>;
}
function Text({ children }: { children: string }) {
  return <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{children || "غير محدد"}</p>;
}
function TextList({ items }: { items: readonly string[] }) {
  return <ul className="list-disc space-y-1 pr-4 text-sm leading-relaxed">{items.map((item, index) => <li key={index} className="whitespace-pre-wrap break-words">{item}</li>)}</ul>;
}
function Tags({ items }: { items: string[] }) {
  return <div className="flex flex-wrap gap-2">{items.map((item, index) => <Badge key={index} variant="secondary" className="whitespace-normal">{item}</Badge>)}</div>;
}
