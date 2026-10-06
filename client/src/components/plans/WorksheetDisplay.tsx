import { useState } from "react";
import type { WorksheetContent } from "@shared/generation";
import { worksheetOptionLabel as optionLabel } from "@shared/generation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Eye, EyeOff } from "lucide-react";
import { ExportButtons } from "./ExportButtons";

export function WorksheetDisplay({ worksheet, worksheetId }: { worksheet: WorksheetContent; worksheetId: number }) {
  const [showAnswers, setShowAnswers] = useState(false);
  return (
    <Card dir="rtl">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><CardTitle>{worksheet.title || "ورقة العمل"}</CardTitle><CardDescription className="mt-1">ورقة محفوظة #{worksheetId} · {worksheet.questions.length} أسئلة</CardDescription></div>
          <ExportButtons kind="worksheets" id={worksheetId} />
        </div>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{worksheet.instructions}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {worksheet.questions.map((question, index) => (
          <div key={index} className="rounded-lg border p-4">
            <div className="flex items-start gap-3">
              <Badge className="shrink-0">{index + 1}</Badge>
              <div className="min-w-0 flex-1">
                <p className="whitespace-pre-wrap break-words text-sm font-medium leading-relaxed">{question.text}</p>
                {question.options && <div className="mt-3 space-y-2">{question.options.map((option, optionIndex) => <p key={optionIndex} className="text-sm">{optionLabel(optionIndex)}) {option}</p>)}</div>}
                {question.left && question.right && <div className="mt-3 grid grid-cols-2 gap-4 text-sm"><div className="space-y-2">{question.left.map((item, itemIndex) => <p key={itemIndex}>{itemIndex + 1}. {item}</p>)}</div><div className="space-y-2">{question.right.map((item, itemIndex) => <p key={itemIndex}>{optionLabel(itemIndex)}) {item}</p>)}</div></div>}
              </div>
              <Badge variant="outline" className="shrink-0">{question.points} نقطة</Badge>
            </div>
          </div>
        ))}
        <Separator />
        <Button variant="outline" onClick={() => setShowAnswers(value => !value)} aria-expanded={showAnswers}>
          {showAnswers ? <EyeOff className="ml-2 h-4 w-4" /> : <Eye className="ml-2 h-4 w-4" />}
          {showAnswers ? "إخفاء نموذج الإجابة" : "إظهار نموذج الإجابة"}
        </Button>
        {showAnswers && <section className="rounded-lg bg-muted/50 p-4"><h3 className="mb-3 font-bold">نموذج الإجابة</h3><div className="space-y-2">{worksheet.answer_key.map((answer, index) => <p key={index} className="whitespace-pre-wrap text-sm leading-relaxed"><span className="font-medium">{answer.q}. </span>{answer.answer}</p>)}</div></section>}
      </CardContent>
    </Card>
  );
}
