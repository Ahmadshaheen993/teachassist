import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

type ExportKind = "plans" | "worksheets";
type ExportFormat = "pdf" | "docx";

export function ExportButtons({ kind, id }: { kind: ExportKind; id: number }) {
  const [pending, setPending] = useState<ExportFormat | null>(null);

  async function download(format: ExportFormat) {
    // Open while handling the click so browser print fallback is not popup-blocked.
    const printWindow = format === "pdf" ? window.open("", "_blank") : null;
    if (printWindow) printWindow.document.title = "جاري إعداد الملف…";
    setPending(format);
    try {
      const response = await fetch(`/api/exports/${kind}/${id}.${format}`, { credentials: "same-origin" });
      if (!response.ok) {
        let errorMessage = "تعذّر تصدير الملف. حاول مرة أخرى.";
        if (response.headers.get("content-type")?.includes("application/json")) {
          const result: unknown = await response.json();
          if (result && typeof result === "object" && "error" in result && typeof result.error === "string") errorMessage = result.error;
        }
        throw new Error(errorMessage);
      }
      const contentType = response.headers.get("content-type") ?? "";
      if (format === "pdf" && contentType.includes("text/html")) {
        const html = await response.text();
        if (!printWindow) throw new Error("اسمح بالنوافذ المنبثقة لاستخدام الطباعة، ثم حاول مرة أخرى.");
        // This authenticated endpoint produces escaped HTML, never raw generated markup.
        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
        if (printWindow.document.readyState === "complete") printWindow.print();
        else printWindow.addEventListener("load", () => printWindow.print(), { once: true });
        toast.info("اختر «حفظ بصيغة PDF» من نافذة الطباعة.");
        return;
      }
      printWindow?.close();
      if ((format === "pdf" && !contentType.includes("application/pdf")) ||
          (format === "docx" && !contentType.includes("application/vnd.openxmlformats-officedocument.wordprocessingml.document"))) {
        throw new Error("لم يصل ملف صالح. أعد تسجيل الدخول ثم حاول مرة أخرى.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${kind === "plans" ? "خطة_درس" : "ورقة_عمل"}_${id}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(`تم تنزيل ملف ${format === "docx" ? "Word" : "PDF"}`);
    } catch (error) {
      printWindow?.close();
      toast.error(error instanceof Error ? error.message : "تعذّر تصدير الملف.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {(["docx", "pdf"] as const).map(format => (
        <Button key={format} variant="outline" size="sm" disabled={pending !== null} onClick={() => download(format)}>
          {pending === format ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Download className="ml-2 h-4 w-4" />}
          {pending === format ? "جاري الإعداد…" : format === "docx" ? "تنزيل Word" : "تنزيل PDF"}
        </Button>
      ))}
    </div>
  );
}
