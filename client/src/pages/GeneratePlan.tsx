import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import type { PlanContent } from "@shared/generation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BookOpen, Sparkles, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { PlanDisplay } from "@/components/plans/PlanDisplay";
import { PlanWorksheet } from "@/components/plans/PlanWorksheet";

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function GeneratePlan() {
  const [countryId, setCountryId] = useState<number | null>(null);
  const [stageId, setStageId] = useState<number | null>(null);
  const [gradeId, setGradeId] = useState<number | null>(null);
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [textbookId, setTextbookId] = useState<number | null>(null);
  const [unitId, setUnitId] = useState<number | null>(null);
  const [lessonId, setLessonId] = useState<number | null>(null);
  const [periods, setPeriods] = useState(1);
  const [planDate, setPlanDate] = useState(today);
  const [generatedPlan, setGeneratedPlan] = useState<{ id: number; content: PlanContent } | null>(null);
  const utils = trpc.useUtils();

  const countriesQuery = trpc.curriculum.countries.useQuery();
  const stagesQuery = trpc.curriculum.stages.useQuery({ countryId: countryId! }, { enabled: countryId !== null });
  const gradesQuery = trpc.curriculum.grades.useQuery({ stageId: stageId! }, { enabled: stageId !== null });
  const subjectsQuery = trpc.curriculum.subjects.useQuery({ countryId: countryId! }, { enabled: countryId !== null });
  const textbooksQuery = trpc.curriculum.textbooks.useQuery(
    { countryId: countryId!, subjectId: subjectId!, gradeId: gradeId! },
    { enabled: countryId !== null && subjectId !== null && gradeId !== null },
  );
  const unitsQuery = trpc.curriculum.units.useQuery({ textbookId: textbookId! }, { enabled: textbookId !== null });
  const lessonsQuery = trpc.curriculum.lessons.useQuery({ unitId: unitId! }, { enabled: unitId !== null });

  const generateMutation = trpc.plans.generate.useMutation({
    onMutate() { setGeneratedPlan(null); },
    onSuccess(data) {
      if (data.success && typeof data.planId === "number" && data.content) {
        setGeneratedPlan({ id: data.planId, content: data.content });
        void utils.plans.list.invalidate();
        void utils.subscription.status.invalidate();
        toast.success(data.cached ? "تم فتح الخطة المحفوظة" : "تم توليد الخطة وحفظها بنجاح");
      } else toast.error(data.error || "تعذّر توليد الخطة.");
    },
    onError() { toast.error("تعذّر توليد الخطة. تحقق من الاتصال ثم حاول مرة أخرى."); },
  });

  const queries = [countriesQuery, stagesQuery, gradesQuery, subjectsQuery, textbooksQuery, unitsQuery, lessonsQuery];
  const failedQuery = queries.find(query => query.isError);
  const generating = generateMutation.isPending;

  function resetAfter(level: "country" | "stage" | "grade" | "subject" | "textbook" | "unit") {
    setGeneratedPlan(null);
    setLessonId(null);
    if (level === "country") { setStageId(null); setGradeId(null); setSubjectId(null); }
    if (level === "stage") setGradeId(null);
    if (["country", "stage", "grade", "subject"].includes(level)) setTextbookId(null);
    if (level !== "unit") setUnitId(null);
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div><h1 className="text-2xl font-bold tracking-tight">توليد خطة درس</h1><p className="text-muted-foreground">اختر الدرس من المنهج، ثم حدّد تاريخ التنفيذ وعدد الحصص</p></div>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5 text-primary" />اختيار الدرس</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          {failedQuery && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription className="flex flex-wrap items-center gap-3">تعذّر تحميل خيارات المنهج.<Button variant="outline" size="sm" onClick={() => failedQuery.refetch()}>إعادة المحاولة</Button></AlertDescription></Alert>}
          {!countriesQuery.isLoading && !countriesQuery.isError && countriesQuery.data?.length === 0 && <Alert><AlertDescription>لم تُضف مناهج متاحة بعد. يرجى التواصل مع مسؤول المنصة.</AlertDescription></Alert>}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <CurriculumSelect label="الدولة" value={countryId} loading={countriesQuery.isLoading} disabled={generating} options={countriesQuery.data?.map(item => ({ id: item.id, label: item.nameAr }))} onChange={id => { setCountryId(id); resetAfter("country"); }} />
            <CurriculumSelect label="المرحلة" value={stageId} loading={countryId !== null && stagesQuery.isLoading} disabled={generating || countryId === null} options={stagesQuery.data?.map(item => ({ id: item.id, label: item.nameAr }))} onChange={id => { setStageId(id); resetAfter("stage"); }} />
            <CurriculumSelect label="الصف" value={gradeId} loading={stageId !== null && gradesQuery.isLoading} disabled={generating || stageId === null} options={gradesQuery.data?.map(item => ({ id: item.id, label: item.nameAr }))} onChange={id => { setGradeId(id); resetAfter("grade"); }} />
            <CurriculumSelect label="المادة" value={subjectId} loading={countryId !== null && subjectsQuery.isLoading} disabled={generating || countryId === null} options={subjectsQuery.data?.map(item => ({ id: item.id, label: item.nameAr }))} onChange={id => { setSubjectId(id); resetAfter("subject"); }} />
            <CurriculumSelect label="الكتاب" value={textbookId} loading={gradeId !== null && subjectId !== null && textbooksQuery.isLoading} disabled={generating || gradeId === null || subjectId === null} options={textbooksQuery.data?.map(item => ({ id: item.id, label: item.title }))} onChange={id => { setTextbookId(id); resetAfter("textbook"); }} />
            <CurriculumSelect label="الوحدة" value={unitId} loading={textbookId !== null && unitsQuery.isLoading} disabled={generating || textbookId === null} options={unitsQuery.data?.map(item => ({ id: item.id, label: item.title }))} onChange={id => { setUnitId(id); resetAfter("unit"); }} />
          </div>
          {unitId !== null && <div className="space-y-2">
            <p className="text-sm font-medium">الدرس</p>
            {lessonsQuery.isLoading ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />جاري تحميل الدروس…</p> : lessonsQuery.data?.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد دروس مضافة لهذه الوحدة.</p> : <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {lessonsQuery.data?.map(lesson => <button key={lesson.id} type="button" disabled={generating} aria-pressed={lessonId === lesson.id} onClick={() => { setLessonId(lesson.id); setGeneratedPlan(null); }} className={`flex items-center justify-between gap-3 rounded-lg border p-3 text-right transition-colors disabled:opacity-60 ${lessonId === lesson.id ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border hover:bg-accent/50"}`}>
                <div><p className="text-sm font-medium">{lesson.title}</p>{lesson.pageFrom !== null && lesson.pageTo !== null && <p className="text-xs text-muted-foreground">صفحات {lesson.pageFrom}–{lesson.pageTo}</p>}</div>{lessonId === lesson.id && <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />}
              </button>)}
            </div>}
          </div>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div><label htmlFor="plan-date" className="mb-2 block text-sm font-medium">تاريخ التنفيذ</label><Input id="plan-date" type="date" value={planDate} disabled={generating} onChange={event => { setPlanDate(event.target.value); setGeneratedPlan(null); }} /></div>
            <div><label htmlFor="plan-periods" className="mb-2 block text-sm font-medium">عدد الحصص</label><Select value={String(periods)} disabled={generating} onValueChange={value => { setPeriods(Number(value)); setGeneratedPlan(null); }}><SelectTrigger id="plan-periods"><SelectValue /></SelectTrigger><SelectContent>{Array.from({ length: 10 }, (_, index) => <SelectItem key={index + 1} value={String(index + 1)}>{index + 1}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <Button size="lg" className="w-full md:w-auto" disabled={!lessonId || !planDate || generating} onClick={() => { if (lessonId) generateMutation.mutate({ lessonId, periods, planDate }); }}>
            {generating ? <Loader2 className="ml-2 h-5 w-5 animate-spin" /> : <Sparkles className="ml-2 h-5 w-5" />}{generating ? "جاري توليد الخطة…" : "توليد الخطة"}
          </Button>
          {generating && <p role="status" className="text-sm text-muted-foreground">قد يستغرق التوليد بعض الوقت. انتظر ظهور الخطة قبل الانتقال إلى صفحة أخرى.</p>}
        </CardContent>
      </Card>
      {generatedPlan && <div className="space-y-3"><p className="text-sm text-muted-foreground">الخطة محفوظة ويمكنك العودة إليها من <Link href={`/my-plans/${generatedPlan.id}`} className="font-medium text-primary underline">سجل خططك</Link>.</p><PlanDisplay plan={generatedPlan.content} planId={generatedPlan.id}><PlanWorksheet key={generatedPlan.id} planId={generatedPlan.id} /></PlanDisplay></div>}
    </div>
  );
}

function CurriculumSelect({ label, value, options, disabled, loading, onChange }: {
  label: string; value: number | null; options?: { id: number; label: string }[];
  disabled: boolean; loading: boolean; onChange: (value: number) => void;
}) {
  const placeholder = loading ? "جاري التحميل…" : options?.length === 0 && !disabled ? "لا توجد خيارات متاحة" : `اختر ${label}`;
  return <div><label className="mb-2 block text-sm font-medium">{label}</label><Select dir="rtl" value={value === null ? "" : String(value)} disabled={disabled || loading || !options?.length} onValueChange={selected => onChange(Number(selected))}><SelectTrigger aria-label={label}><SelectValue placeholder={placeholder} /></SelectTrigger><SelectContent>{options?.map(option => <SelectItem key={option.id} value={String(option.id)}>{option.label}</SelectItem>)}</SelectContent></Select></div>;
}
