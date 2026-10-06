import { Link, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowRight, Loader2 } from "lucide-react";
import { WorksheetDisplay } from "@/components/plans/WorksheetDisplay";
import { readWorksheetContent } from "@/components/plans/plan-content";

export default function WorksheetDetails() {
  const { id } = useParams<{ id: string }>();
  const worksheetId = Number(id);
  const validId = /^\d+$/.test(id ?? "") && Number.isSafeInteger(worksheetId) && worksheetId > 0;
  const query = trpc.plans.worksheetGet.useQuery({ id: worksheetId }, { enabled: validId });
  const content = readWorksheetContent(query.data?.content);
  return <div className="space-y-4" dir="rtl">
    <div className="flex flex-wrap gap-2"><Button asChild variant="ghost"><Link href="/my-plans"><ArrowRight className="ml-2 h-4 w-4" />العودة إلى خططي وأوراق عملي</Link></Button>{query.data?.planId && <Button asChild variant="outline"><Link href={`/my-plans/${query.data.planId}`}>فتح خطة الدرس المرتبطة</Link></Button>}</div>
    {validId && query.isLoading ? <p role="status" className="flex items-center justify-center gap-2 py-12 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" />جاري تحميل ورقة العمل…</p> : query.isError ? <Alert variant="destructive"><AlertDescription className="flex flex-wrap items-center gap-3">تعذّر تحميل ورقة العمل.<Button variant="outline" size="sm" onClick={() => query.refetch()}>إعادة المحاولة</Button></AlertDescription></Alert> : !validId || !query.data ? <Alert><AlertDescription>ورقة العمل غير موجودة أو غير متاحة في حسابك.</AlertDescription></Alert> : !content ? <Alert variant="destructive"><AlertDescription>محتوى ورقة العمل المحفوظة غير قابل للعرض. يرجى التواصل مع مسؤول المنصة.</AlertDescription></Alert> : <WorksheetDisplay key={worksheetId} worksheet={content} worksheetId={worksheetId} />}
  </div>;
}
