import { Link, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowRight, Loader2 } from "lucide-react";
import { PlanDisplay } from "@/components/plans/PlanDisplay";
import { PlanWorksheet } from "@/components/plans/PlanWorksheet";
import { readPlanContent } from "@/components/plans/plan-content";

export default function PlanDetails() {
  const { id } = useParams<{ id: string }>();
  const planId = Number(id);
  const validId = /^\d+$/.test(id ?? "") && Number.isSafeInteger(planId) && planId > 0;
  const query = trpc.plans.get.useQuery({ id: planId }, { enabled: validId });
  const content = readPlanContent(query.data?.content);
  return <div className="space-y-4" dir="rtl">
    <Button asChild variant="ghost"><Link href="/my-plans"><ArrowRight className="ml-2 h-4 w-4" />العودة إلى خططي وأوراق عملي</Link></Button>
    {validId && query.isLoading ? <p role="status" className="flex items-center justify-center gap-2 py-12 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" />جاري تحميل الخطة…</p> : query.isError ? <Alert variant="destructive"><AlertDescription className="flex flex-wrap items-center gap-3">تعذّر تحميل الخطة.<Button variant="outline" size="sm" onClick={() => query.refetch()}>إعادة المحاولة</Button></AlertDescription></Alert> : !validId || !query.data ? <Alert><AlertDescription>الخطة غير موجودة أو غير متاحة في حسابك.</AlertDescription></Alert> : query.data.status !== "ready" ? <Alert><AlertDescription>هذه الخطة لم يكتمل توليدها. يمكنك توليد خطة جديدة من صفحة <Link href="/generate" className="text-primary underline">توليد خطة درس</Link>.</AlertDescription></Alert> : !content ? <Alert variant="destructive"><AlertDescription>محتوى الخطة المحفوظة غير قابل للعرض. يرجى التواصل مع مسؤول المنصة.</AlertDescription></Alert> : <PlanDisplay plan={content} planId={planId}><PlanWorksheet key={planId} planId={planId} /></PlanDisplay>}
  </div>;
}
