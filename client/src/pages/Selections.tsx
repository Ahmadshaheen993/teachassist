import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FolderOpen, Plus, Trash2, Star } from "lucide-react";
import { toast } from "sonner";

export default function Selections() {
  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState("");
  const [countryId, setCountryId] = useState<number | null>(null);
  const [stageId, setStageId] = useState<number | null>(null);
  const [gradeId, setGradeId] = useState<number | null>(null);
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [textbookId, setTextbookId] = useState<number | null>(null);

  const { data: selections, refetch } = trpc.selections.list.useQuery();
  const { data: countries } = trpc.curriculum.countries.useQuery();
  const { data: stages } = trpc.curriculum.stages.useQuery({ countryId: countryId! }, { enabled: !!countryId });
  const { data: grades } = trpc.curriculum.grades.useQuery({ stageId: stageId! }, { enabled: !!stageId }) as any;
  const { data: subjects } = trpc.curriculum.subjects.useQuery({ countryId: countryId! }, { enabled: !!countryId });
  const { data: textbooks } = trpc.curriculum.textbooks.useQuery(
    { countryId: countryId!, subjectId: subjectId!, gradeId: gradeId! },
    { enabled: !!countryId && !!subjectId && !!gradeId }
  );

  const saveMutation = trpc.selections.save.useMutation({
    onSuccess: () => { toast.success("تم حفظ الاختيار"); setShowForm(false); refetch(); resetForm(); },
    onError: () => toast.error("فشل الحفظ"),
  });

  const deleteMutation = trpc.selections.delete.useMutation({
    onSuccess: () => { toast.success("تم الحذف"); refetch(); },
    onError: () => toast.error("فشل الحذف"),
  });

  const handleSave = () => {
    if (!countryId || !gradeId || !subjectId) { toast.error("يرجى إكمال الاختيار"); return; }
    saveMutation.mutate({
      label: label || undefined,
      countryId, gradeId, subjectId,
      textbookId: textbookId || undefined,
      isDefault: false,
    });
  };

  const resetForm = () => {
    setLabel(""); setCountryId(null); setStageId(null);
    setGradeId(null); setSubjectId(null); setTextbookId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">اختياراتي المحفوظة</h1>
          <p className="text-muted-foreground">احفظ تركيبات (دولة/صف/مادة) للوصول السريع</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="ml-2 h-4 w-4" /> إضافة اختيار
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>حفظ تركيبة جديدة</CardTitle>
            <CardDescription>اختر الدولة، المرحلة، الصف، والمادة</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="mb-2 block">تسمية الاختيار (اختياري)</Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="مثال: كيمياء - ثامن/1" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <Label className="mb-2 block">الدولة</Label>
                <Select onValueChange={(v) => setCountryId(+v)}>
                  <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                  <SelectContent>{countries?.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.nameAr}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-2 block">المرحلة</Label>
                <Select disabled={!stages} onValueChange={(v) => setStageId(+v)}>
                  <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                  <SelectContent>{stages?.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.nameAr}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-2 block">الصف</Label>
                <Select disabled={!grades} onValueChange={(v) => setGradeId(+v)}>
                  <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                  <SelectContent>{grades?.map((g: any) => <SelectItem key={g.id} value={String(g.id)}>{g.nameAr}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-2 block">المادة</Label>
                <Select disabled={!subjects} onValueChange={(v) => setSubjectId(+v)}>
                  <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                  <SelectContent>{subjects?.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.nameAr}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-2 block">الكتاب (اختياري)</Label>
                <Select disabled={!textbooks} onValueChange={(v) => setTextbookId(+v)}>
                  <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                  <SelectContent>{textbooks?.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.title}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={saveMutation.isPending}>حفظ</Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>إلغاء</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {selections && selections.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {selections.map(sel => (
            <Card key={sel.id} className="card-elegant">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <FolderOpen className="w-5 h-5 text-primary" />
                  </div>
                  <button onClick={() => deleteMutation.mutate({ id: sel.id })} className="text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <h3 className="font-bold text-sm mb-1">{sel.label || `اختيار #${sel.id}`}</h3>
                <p className="text-xs text-muted-foreground">الدولة: {countries?.find(c => c.id === sel.countryId)?.nameAr || "-"}</p>
                <p className="text-xs text-muted-foreground">الصف: {grades?.find?.((g: { id: number; nameAr: string }) => g.id === sel.gradeId)?.nameAr || `#${sel.gradeId}`}</p>
                <p className="text-xs text-muted-foreground">المادة: {subjects?.find(s => s.id === sel.subjectId)?.nameAr || `#${sel.subjectId}`}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        !showForm && (
          <div className="text-center py-16 text-muted-foreground">
            <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>لا توجد اختيارات محفوظة بعد</p>
          </div>
        )
      )}
    </div>
  );
}
