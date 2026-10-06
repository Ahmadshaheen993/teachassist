import { useState } from "react";
import { trpc } from "@/lib/trpc";
import type { WorksheetContent } from "@shared/generation";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { WorksheetDisplay } from "./WorksheetDisplay";
import { readWorksheetContent } from "./plan-content";

export function PlanWorksheet({ planId }: { planId: number }) {
  const [worksheet, setWorksheet] = useState<{ id: number; content: WorksheetContent } | null>(null);
  const utils = trpc.useUtils();
  const mutation = trpc.plans.worksheet.useMutation({
    onSuccess(data) {
      const content = readWorksheetContent(data.content);
      if (data.success && typeof data.worksheetId === "number" && content) {
        setWorksheet({ id: data.worksheetId, content });
        void utils.plans.worksheets.invalidate();
        toast.success(data.cached ? "تم فتح ورقة العمل المحفوظة" : "تم توليد ورقة العمل وحفظها");
      } else toast.error(data.error || "تعذّر توليد ورقة العمل.");
    },
    onError() { toast.error("تعذّر توليد ورقة العمل. حاول مرة أخرى."); },
  });
  return (
    <div className="space-y-4">
      <Separator />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h3 className="text-lg font-bold">ورقة عمل للدرس</h3><p className="text-sm text-muted-foreground">أسئلة متدرجة مع نموذج إجابة، محفوظة في سجلك</p></div>
        {!worksheet && <Button variant="outline" disabled={mutation.isPending} onClick={() => mutation.mutate({ planId })}>
          {mutation.isPending ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Sparkles className="ml-2 h-4 w-4" />}
          {mutation.isPending ? "جاري التوليد…" : "توليد أو فتح ورقة العمل"}
        </Button>}
      </div>
      {worksheet && <WorksheetDisplay worksheet={worksheet.content} worksheetId={worksheet.id} />}
    </div>
  );
}
