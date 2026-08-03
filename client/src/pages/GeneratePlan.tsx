import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BookOpen, ChevronLeft, Sparkles, FileText, Loader2, CheckCircle2, AlertCircle, Download } from "lucide-react";
import { toast } from "sonner";

export default function GeneratePlan() {
  // Selection state
  const [countryId, setCountryId] = useState<number | null>(null);
  const [stageId, setStageId] = useState<number | null>(null);
  const [gradeId, setGradeId] = useState<number | null>(null);
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [textbookId, setTextbookId] = useState<number | null>(null);
  const [unitId, setUnitId] = useState<number | null>(null);
  const [lessonId, setLessonId] = useState<number | null>(null);

  // Generation state
  const [generatedPlan, setGeneratedPlan] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [worksheet, setWorksheet] = useState<any>(null);
  const [isGeneratingWorksheet, setIsGeneratingWorksheet] = useState(false);

  // Queries
  const { data: countries } = trpc.curriculum.countries.useQuery();
  const { data: stages } = trpc.curriculum.stages.useQuery({ countryId: countryId! }, { enabled: !!countryId });
  const { data: grades } = trpc.curriculum.grades.useQuery({ stageId: stageId! }, { enabled: !!stageId });
  const { data: subjects } = trpc.curriculum.subjects.useQuery({ countryId: countryId! }, { enabled: !!countryId });
  const { data: textbooks } = trpc.curriculum.textbooks.useQuery(
    { countryId: countryId!, subjectId: subjectId!, gradeId: gradeId! },
    { enabled: !!countryId && !!subjectId && !!gradeId }
  );
  const { data: units } = trpc.curriculum.units.useQuery({ textbookId: textbookId! }, { enabled: !!textbookId });
  const { data: lessons } = trpc.curriculum.lessons.useQuery({ unitId: unitId! }, { enabled: !!unitId });

  // Mutations
  const generateMutation = trpc.plans.generate.useMutation({
    onMutate: () => { setIsGenerating(true); setGeneratedPlan(null); },
    onSuccess: (data) => {
      setIsGenerating(false);
      if (data.success && data.content) {
        setGeneratedPlan(data.content);
        toast.success(data.cached ? "تم استرجاع الخطة من الذاكرة!" : "تم توليد الخطة بنجاح!");
      } else {
        toast.error(data.error || "فشل التوليد");
      }
    },
    onError: (err) => { setIsGenerating(false); toast.error(`خطأ: ${err.message}`); },
  });

  const exportPdfMutation = trpc.plans.exportPdf.useMutation({
    onSuccess: (data) => {
      if (data.success && data.html) {
        const printWindow = window.open("", "_blank");
        if (printWindow) {
          printWindow.document.write(data.html);
          printWindow.document.close();
          setTimeout(() => { printWindow.print(); }, 500);
        }
      } else {
        toast.error(data.error || "فشل التصدير");
      }
    },
  });

  const exportWord = () => {
    if (!generatedPlan) return;
    const plan = generatedPlan;
    const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"></head><body>` +
      `<h1>خطة درس: ${plan.basic_info?.lesson || ""}</h1>` +
      `<p>المادة: ${plan.basic_info?.subject || ""} — الصف: ${plan.basic_info?.grade || ""} — الوحدة: ${plan.basic_info?.unit || ""}</p>` +
      `<h2>الأهداف</h2><ul>` +
      [...(plan.objectives?.cognitive || []), ...(plan.objectives?.skills || []), ...(plan.objectives?.affective || [])].map((o: string) => `<li>${o}</li>`).join("") +
      `</ul><h2>خطوات التنفيذ</h2><table border="1"><tr><th>الخطوة</th><th>الزمن</th><th>المعلم</th><th>الطالب</th></tr>` +
      (plan.procedures || []).map((p: any) => `<tr><td>${p.step}</td><td>${p.time_minutes} دقيقة</td><td>${p.teacher_role}</td><td>${p.student_role}</td></tr>`).join("") +
      `</table><h2>التقويم</h2><p>القبلي: ${plan.assessment?.diagnostic || ""}</p><p>البنائي: ${(plan.assessment?.formative || []).join("، ")}</p><p>الختامي: ${(plan.assessment?.summative || []).join("، ")}</p>` +
      `<h2>الواجب</h2><p>${plan.homework || ""}</p>` +
      `</body></html>`;
    const blob = new Blob([html], { type: "application/vnd.ms-word" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `خطة_درس_${plan.basic_info?.lesson || ""}.doc`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("تم تصدير ملف Word");
  };

  const worksheetMutation = trpc.plans.worksheet.useMutation({
    onMutate: () => { setIsGeneratingWorksheet(true); setWorksheet(null); },
    onSuccess: (data) => {
      setIsGeneratingWorksheet(false);
      if (data.success && data.content) {
        setWorksheet(data.content);
        toast.success("تم توليد ورقة العمل بنجاح!");
      } else {
        toast.error(data.error || "فشل توليد ورقة العمل");
      }
    },
    onError: (err) => { setIsGeneratingWorksheet(false); toast.error(`خطأ: ${err.message}`); },
  });

  const handleGenerate = () => {
    if (!lessonId) { toast.error("يرجى اختيار الدرس أولاً"); return; }
    generateMutation.mutate({ lessonId, templateId: 1, periods: 1 });
  };

  const handleGenerateWorksheet = () => {
    if (!generatedPlan || !lessonId) return;
    // Get planId from the mutation result
    const planId = (generateMutation.data as any)?.planId;
    if (!planId) { toast.error("يرجى توليد الخطة أولاً"); return; }
    worksheetMutation.mutate({ planId, lessonId });
  };

  const canGenerate = countryId && stageId && gradeId && subjectId && textbookId && unitId && lessonId;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">توليد خطة درس</h1>
        <p className="text-muted-foreground">اختر الدولة، المرحلة، الصف، المادة، الكتاب، الوحدة، ثم الدرس</p>
      </div>

      {/* Selection Flow */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            اختيار الدرس
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Country */}
            <div>
              <label className="text-sm font-medium mb-2 block">الدولة</label>
              <Select onValueChange={(v) => { setCountryId(+v); resetSelectionsAfter("country"); }}>
                <SelectTrigger><SelectValue placeholder="اختر الدولة" /></SelectTrigger>
                <SelectContent>
                  {countries?.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.nameAr}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Stage */}
            <div>
              <label className="text-sm font-medium mb-2 block">المرحلة</label>
              <Select disabled={!stages} onValueChange={(v) => { setStageId(+v); resetSelectionsAfter("stage"); }}>
                <SelectTrigger><SelectValue placeholder="اختر المرحلة" /></SelectTrigger>
                <SelectContent>
                  {stages?.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.nameAr}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Grade */}
            <div>
              <label className="text-sm font-medium mb-2 block">الصف</label>
              <Select disabled={!grades} onValueChange={(v) => { setGradeId(+v); resetSelectionsAfter("grade"); }}>
                <SelectTrigger><SelectValue placeholder="اختر الصف" /></SelectTrigger>
                <SelectContent>
                  {grades?.map(g => <SelectItem key={g.id} value={String(g.id)}>{g.nameAr}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Subject */}
            <div>
              <label className="text-sm font-medium mb-2 block">المادة</label>
              <Select disabled={!subjects} onValueChange={(v) => { setSubjectId(+v); resetSelectionsAfter("subject"); }}>
                <SelectTrigger><SelectValue placeholder="اختر المادة" /></SelectTrigger>
                <SelectContent>
                  {subjects?.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.nameAr}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Textbook */}
            <div>
              <label className="text-sm font-medium mb-2 block">الكتاب</label>
              <Select disabled={!textbooks} onValueChange={(v) => { setTextbookId(+v); resetSelectionsAfter("textbook"); }}>
                <SelectTrigger><SelectValue placeholder="اختر الكتاب" /></SelectTrigger>
                <SelectContent>
                  {textbooks?.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Unit */}
            <div>
              <label className="text-sm font-medium mb-2 block">الوحدة</label>
              <Select disabled={!units} onValueChange={(v) => { setUnitId(+v); resetSelectionsAfter("unit"); }}>
                <SelectTrigger><SelectValue placeholder="اختر الوحدة" /></SelectTrigger>
                <SelectContent>
                  {units?.map(u => <SelectItem key={u.id} value={String(u.id)}>{u.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Lessons */}
          {lessons && lessons.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium">الدرس</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {lessons.map(l => (
                  <button
                    key={l.id}
                    onClick={() => setLessonId(l.id)}
                    className={`flex items-center justify-between p-3 rounded-lg border transition-all text-right ${
                      lessonId === l.id
                        ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                        : "border-border hover:bg-accent/50"
                    }`}
                  >
                    <div>
                      <p className="font-medium text-sm">{l.title}</p>
                      {l.pageFrom && l.pageTo && (
                        <p className="text-xs text-muted-foreground">صفحات {l.pageFrom}-{l.pageTo}</p>
                      )}
                    </div>
                    {lessonId === l.id && <CheckCircle2 className="w-5 h-5 text-primary" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          <Button
            onClick={handleGenerate}
            disabled={!canGenerate || isGenerating}
            size="lg"
            className="w-full md:w-auto"
          >
            {isGenerating ? (
              <><Loader2 className="ml-2 h-5 w-5 animate-spin" /> جاري التوليد...</>
            ) : (
              <><Sparkles className="ml-2 h-5 w-5" /> توليد الخطة</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Generated Plan Display */}
      {generatedPlan && (
        <PlanDisplay plan={generatedPlan} isGeneratingWorksheet={isGeneratingWorksheet} worksheet={worksheet} onGenerateWorksheet={handleGenerateWorksheet} onExportPdf={(planId) => exportPdfMutation.mutate({ planId })} exportPdfPending={exportPdfMutation.isPending} onExportWord={exportWord} planId={(generateMutation.data as any)?.planId ?? 0} />
      )}
    </div>
  );

  function resetSelectionsAfter(level: string) {
    if (level === "country") { setStageId(null); setGradeId(null); setSubjectId(null); setTextbookId(null); setUnitId(null); setLessonId(null); }
    else if (level === "stage") { setGradeId(null); setTextbookId(null); setUnitId(null); setLessonId(null); }
    else if (level === "grade") { setTextbookId(null); setUnitId(null); setLessonId(null); }
    else if (level === "subject") { setTextbookId(null); setUnitId(null); setLessonId(null); }
    else if (level === "textbook") { setUnitId(null); setLessonId(null); }
    else if (level === "unit") { setLessonId(null); }
  }
}

function PlanDisplay({ plan, isGeneratingWorksheet, worksheet, onGenerateWorksheet, onExportPdf, exportPdfPending, onExportWord, planId }: { plan: any; isGeneratingWorksheet: boolean; worksheet: any; onGenerateWorksheet: () => void; onExportPdf: (planId: number) => void; exportPdfPending: boolean; onExportWord: () => void; planId: number; }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-primary/5">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              خطة الدرس المولّدة
            </CardTitle>
            <CardDescription>محتوى الخطة جاهز للمراجعة والتصدير</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onExportPdf(planId)} disabled={exportPdfPending}>
              <Download className="ml-2 h-4 w-4" /> {exportPdfPending ? "جاري..." : " PDF"}
            </Button>
            <Button variant="outline" size="sm" onClick={onExportWord}>
              <Download className="ml-2 h-4 w-4" /> Word
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-6 space-y-6">
        {/* Basic Info */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 rounded-lg bg-muted/50">
          <InfoItem label="المادة" value={plan.basic_info?.subject} />
          <InfoItem label="الصف" value={plan.basic_info?.grade} />
          <InfoItem label="الوحدة" value={plan.basic_info?.unit} />
          <InfoItem label="الدرس" value={plan.basic_info?.lesson} />
        </div>

        {/* Objectives */}
        <Section title="الأهداف التعليمية">
          <div className="space-y-3">
            {plan.objectives?.cognitive?.length > 0 && (
              <ObjectiveGroup title="المعرفية" items={plan.objectives.cognitive} color="blue" />
            )}
            {plan.objectives?.skills?.length > 0 && (
              <ObjectiveGroup title="المهارية" items={plan.objectives.skills} color="green" />
            )}
            {plan.objectives?.affective?.length > 0 && (
              <ObjectiveGroup title="الوجدانية" items={plan.objectives.affective} color="purple" />
            )}
          </div>
        </Section>

        {/* Warm Up */}
        {plan.warm_up && (
          <Section title="التهيئة">
            <p className="text-sm leading-relaxed">{plan.warm_up}</p>
          </Section>
        )}

        {/* Strategies & Materials */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Section title="الاستراتيجيات">
            <div className="flex flex-wrap gap-2">
              {plan.strategies?.map((s: string, i: number) => (
                <Badge key={i} variant="secondary">{s}</Badge>
              ))}
            </div>
          </Section>
          <Section title="الوسائل التعليمية">
            <div className="flex flex-wrap gap-2">
              {plan.materials?.map((m: string, i: number) => (
                <Badge key={i} variant="outline">{m}</Badge>
              ))}
            </div>
          </Section>
        </div>

        {/* Procedures */}
        <Section title="خطوات التنفيذ">
          <div className="space-y-3">
            {plan.procedures?.map((p: any, i: number) => (
              <div key={i} className="border rounded-lg p-4 hover:bg-accent/30 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-sm">الخطوة {i + 1}: {p.step}</h4>
                  <Badge variant="default">{p.time_minutes} دقيقة</Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                  <div><span className="text-muted-foreground">دور المعلم: </span>{p.teacher_role}</div>
                  <div><span className="text-muted-foreground">دور الطالب: </span>{p.student_role}</div>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Assessment */}
        <Section title="التقويم">
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium mb-1">القبلي:</p>
              <p className="text-sm text-muted-foreground">{plan.assessment?.diagnostic}</p>
            </div>
            <div>
              <p className="text-sm font-medium mb-1">البنائي:</p>
              <ul className="text-sm text-muted-foreground list-disc pr-4 space-y-1">
                {plan.assessment?.formative?.map((q: string, i: number) => <li key={i}>{q}</li>)}
              </ul>
            </div>
            <div>
              <p className="text-sm font-medium mb-1">الختامي:</p>
              <ul className="text-sm text-muted-foreground list-disc pr-4 space-y-1">
                {plan.assessment?.summative?.map((q: string, i: number) => <li key={i}>{q}</li>)}
              </ul>
            </div>
          </div>
        </Section>

        {/* Values & Tech */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Section title="القيم التربوية">
            <div className="flex flex-wrap gap-2">
              {plan.values?.map((v: string, i: number) => (
                <Badge key={i} variant="secondary">{v}</Badge>
              ))}
            </div>
          </Section>
          <Section title="الدمج التكنولوجي">
            <p className="text-sm">{plan.tech_integration}</p>
          </Section>
        </div>

        {/* Differentiation */}
        <Section title="مراعاة الفروق الفردية">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/20">
              <p className="text-sm font-medium mb-1 text-green-700 dark:text-green-400">دعم المتعثرين:</p>
              <p className="text-sm">{plan.differentiation?.support}</p>
            </div>
            <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20">
              <p className="text-sm font-medium mb-1 text-blue-700 dark:text-blue-400">إثراء المتفوقين:</p>
              <p className="text-sm">{plan.differentiation?.enrichment}</p>
            </div>
          </div>
        </Section>

        {/* Homework & Real Life */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Section title="الواجب المنزلي">
            <p className="text-sm">{plan.homework}</p>
          </Section>
          <Section title="الربط بالحياة">
            <p className="text-sm">{plan.real_life_connection}</p>
          </Section>
        </div>

        {/* Worksheet Section */}
        <Separator />
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-lg">ورقة عمل للدرس</h3>
            <p className="text-sm text-muted-foreground">توليد ورقة عمل اختيارية مرتبطة بالخطة</p>
          </div>
          <Button onClick={onGenerateWorksheet} disabled={isGeneratingWorksheet} variant="outline">
            {isGeneratingWorksheet ? (
              <><Loader2 className="ml-2 h-4 w-4 animate-spin" /> جاري التوليد...</>
            ) : worksheet ? (
              <><CheckCircle2 className="ml-2 h-4 w-4 text-green-600" /> ولّد مرة أخرى</>
            ) : (
              <><Sparkles className="ml-2 h-4 w-4" /> توليد ورقة عمل</>
            )}
          </Button>
        </div>

        {worksheet && (
          <div className="space-y-4 p-4 rounded-lg border bg-muted/30">
            <div>
              <h4 className="font-bold">{worksheet.title}</h4>
              <p className="text-sm text-muted-foreground mt-1">{worksheet.instructions}</p>
            </div>
            <div className="space-y-3">
              {worksheet.questions?.map((q: any, i: number) => (
                <div key={i} className="p-3 rounded-lg bg-background border">
                  <div className="flex items-start gap-2">
                    <Badge variant="default" className="shrink-0">{i + 1}</Badge>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{q.text}</p>
                      {q.options && (
                        <div className="mt-2 space-y-1">
                          {q.options.map((opt: string, j: number) => (
                            <p key={j} className="text-sm text-muted-foreground pr-4">
                              {String.fromCharCode(1571 + j)}) {opt}
                            </p>
                          ))}
                        </div>
                      )}
                      {q.left && q.right && (
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          <div>{q.left.map((l: string, j: number) => <p key={j} className="text-sm">{j + 1}. {l}</p>)}</div>
                          <div>{q.right.map((r: string, j: number) => <p key={j} className="text-sm">{String.fromCharCode(1571 + j)}) {r}</p>)}</div>
                        </div>
                      )}
                    </div>
                    <Badge variant="outline">{q.points} نقطة</Badge>
                  </div>
                </div>
              ))}
            </div>
            <Separator />
            <div>
              <h5 className="font-medium mb-2">نموذج الإجابة:</h5>
              <div className="space-y-1">
                {worksheet.answer_key?.map((a: any, i: number) => (
                  <p key={i} className="text-sm"><span className="font-medium">{a.q}.</span> {a.answer}</p>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-bold text-base mb-2 text-primary">{title}</h3>
      {children}
    </div>
  );
}

function ObjectiveGroup({ title, items, color }: { title: string; items: string[]; color: string }) {
  const colorMap: Record<string, string> = {
    blue: "bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300",
    green: "bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-300",
    purple: "bg-purple-50 dark:bg-purple-950/20 text-purple-700 dark:text-purple-300",
  };
  return (
    <div className={`p-3 rounded-lg ${colorMap[color]}`}>
      <p className="text-sm font-medium mb-2">{title}:</p>
      <ul className="text-sm list-disc pr-4 space-y-1">
        {items.map((item, i) => <li key={i}>{item}</li>)}
      </ul>
    </div>
  );
}
