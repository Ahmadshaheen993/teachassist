import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FileText, Clock, CheckCircle2, XCircle, Loader2, AlertCircle } from "lucide-react";
import { readPlanContent, readWorksheetContent } from "@/components/plans/plan-content";

function dateLabel(value: Date | string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("ar-QA", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function MyPlans() {
  const plansQuery = trpc.plans.list.useQuery();
  const worksheetsQuery = trpc.plans.worksheets.useQuery();
  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="text-2xl font-bold tracking-tight">خططي وأوراق عملي</h1><p className="text-muted-foreground">افتح المحتوى المحفوظ للمراجعة أو التنزيل</p></div><Button asChild><Link href="/generate">توليد خطة جديدة</Link></Button></div>
      <Tabs defaultValue="plans" dir="rtl">
        <TabsList className="grid w-full max-w-md grid-cols-2"><TabsTrigger value="plans">الخطط ({plansQuery.data?.length ?? 0})</TabsTrigger><TabsTrigger value="worksheets">أوراق العمل ({worksheetsQuery.data?.length ?? 0})</TabsTrigger></TabsList>
        <TabsContent value="plans" className="mt-4">
          {plansQuery.isLoading ? <Loading /> : plansQuery.isError ? <LoadError onRetry={() => plansQuery.refetch()} /> : plansQuery.data?.length ? <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {plansQuery.data.map(plan => {
              const content = readPlanContent(plan.content);
              return <Card key={plan.id} className="card-elegant"><CardContent className="flex h-full flex-col space-y-3 p-5">
                <div className="flex items-start justify-between"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><FileText className="h-5 w-5 text-primary" /></div><StatusBadge status={plan.status} /></div>
                <div className="flex-1"><h3 className="text-sm font-bold">{content?.basic_info.lesson || `خطة درس #${plan.id}`}</h3>{content && <p className="mt-1 text-xs text-muted-foreground">{[content.basic_info.subject, content.basic_info.grade].filter(Boolean).join(" · ")}</p>}<p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3 w-3" />{dateLabel(plan.createdAt)}</p></div>
                {plan.status === "ready" ? <Button asChild variant="outline" className="w-full"><Link href={`/my-plans/${plan.id}`}>فتح الخطة وتنزيلها</Link></Button> : plan.status === "failed" ? <p className="text-xs text-muted-foreground">تعذّر توليد هذه الخطة. يمكنك المحاولة مجددًا من صفحة التوليد.</p> : <p className="text-xs text-muted-foreground">ستتمكن من فتح الخطة بعد اكتمال التوليد.</p>}
              </CardContent></Card>;
            })}
          </div> : <EmptyState text="لا توجد خطط محفوظة بعد" />}
        </TabsContent>
        <TabsContent value="worksheets" className="mt-4">
          {worksheetsQuery.isLoading ? <Loading /> : worksheetsQuery.isError ? <LoadError onRetry={() => worksheetsQuery.refetch()} /> : worksheetsQuery.data?.length ? <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {worksheetsQuery.data.map(worksheet => {
              const content = readWorksheetContent(worksheet.content);
              return <Card key={worksheet.id} className="card-elegant"><CardContent className="flex h-full flex-col space-y-3 p-5"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50 dark:bg-orange-950/20"><FileText className="h-5 w-5 text-orange-600" /></div><div className="flex-1"><h3 className="text-sm font-bold">{content?.title || `ورقة عمل #${worksheet.id}`}</h3>{content && <p className="mt-1 text-xs text-muted-foreground">{content.questions.length} أسئلة</p>}<p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3 w-3" />{dateLabel(worksheet.createdAt)}</p></div><Button asChild variant="outline" className="w-full"><Link href={`/worksheets/${worksheet.id}`}>فتح ورقة العمل وتنزيلها</Link></Button></CardContent></Card>;
            })}
          </div> : <EmptyState text="لا توجد أوراق عمل محفوظة بعد" />}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "ready") return <Badge className="gap-1"><CheckCircle2 className="h-3 w-3" />جاهزة</Badge>;
  if (status === "failed") return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />لم يكتمل التوليد</Badge>;
  if (status === "generating") return <Badge variant="secondary" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" />قيد التوليد</Badge>;
  return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />بانتظار التوليد</Badge>;
}
function EmptyState({ text }: { text: string }) {
  return <div className="py-16 text-center text-muted-foreground"><FileText className="mx-auto mb-3 h-12 w-12 opacity-30" /><p>{text}</p><Button asChild variant="link"><Link href="/generate">ابدأ بتوليد خطة درس</Link></Button></div>;
}
function Loading() { return <div role="status" className="flex items-center justify-center gap-2 py-12 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" />جاري تحميل السجل…</div>; }
function LoadError({ onRetry }: { onRetry: () => void }) { return <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription className="flex flex-wrap items-center gap-3">تعذّر تحميل السجل.<Button size="sm" variant="outline" onClick={onRetry}>إعادة المحاولة</Button></AlertDescription></Alert>; }
