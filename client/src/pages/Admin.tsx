import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShieldCheck, Plus, School, BookOpen, FileText, Building2, CheckCircle2, Sparkles, FolderOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function Admin() {
  const { user } = useAuth();

  if (user?.role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <ShieldCheck className="w-16 h-16 text-muted-foreground mb-4 opacity-30" />
        <h2 className="text-xl font-bold mb-2">صلاحية محدودة</h2>
        <p className="text-muted-foreground">هذه الصفحة متاحة للمديرين فقط</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">لوحة المدير</h1>
        <p className="text-muted-foreground">إدارة المناهج، الكتب، المدارس، والقوالب</p>
      </div>

      <Tabs defaultValue="schools">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="schools" className="gap-2"><Building2 className="w-4 h-4" /> المدارس</TabsTrigger>
          <TabsTrigger value="curriculum" className="gap-2"><BookOpen className="w-4 h-4" /> المناهج</TabsTrigger>
          <TabsTrigger value="add-lesson" className="gap-2"><FileText className="w-4 h-4" /> إضافة درس</TabsTrigger>
          <TabsTrigger value="indexer" className="gap-2"><Sparkles className="w-4 h-4" /> الفهرسة الذكية</TabsTrigger>
          <TabsTrigger value="review" className="gap-2"><CheckCircle2 className="w-4 h-4" /> مراجعة الفهارس</TabsTrigger>
        </TabsList>

        <TabsContent value="schools" className="mt-4">
          <SchoolsTab />
        </TabsContent>
        <TabsContent value="curriculum" className="mt-4">
          <CurriculumTab />
        </TabsContent>
        <TabsContent value="add-lesson" className="mt-4">
          <AddLessonTab />
        </TabsContent>
        <TabsContent value="indexer" className="mt-4">
          <SmartIndexerTab />
        </TabsContent>
        <TabsContent value="review" className="mt-4">
          <ReviewIndexTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SchoolsTab() {
  const { data: schools, refetch } = trpc.admin.unverifiedSchools.useQuery();
  const verifyMutation = trpc.admin.verifySchool.useMutation({
    onSuccess: () => { toast.success("تم توثيق المدرسة"); refetch(); },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>المدارس غير الموثقة</CardTitle>
        <CardDescription>المدارس المضافة من المستخدمين بانتظار المراجعة</CardDescription>
      </CardHeader>
      <CardContent>
        {schools && schools.length > 0 ? (
          <div className="space-y-3">
            {schools.map(s => (
              <div key={s.id} className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-3">
                  <School className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-sm">{s.nameAr}</p>
                    <p className="text-xs text-muted-foreground">{s.city || "—"}</p>
                  </div>
                </div>
                <Button size="sm" onClick={() => verifyMutation.mutate({ id: s.id })}>
                  <CheckCircle2 className="ml-2 h-4 w-4" /> توثيق
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center py-8 text-muted-foreground">لا توجد مدارس بانتظار التوثيق</p>
        )}
      </CardContent>
    </Card>
  );
}

function CurriculumTab() {
  const { data: countries } = trpc.admin.countries.useQuery();
  const addCountryMutation = trpc.admin.addCountry.useMutation({
    onSuccess: () => toast.success("تمت إضافة الدولة"),
    onError: () => toast.error("فشل الإضافة"),
  });

  const [newCountry, setNewCountry] = useState({ code: "", nameAr: "", currencyCode: "" });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>الدول الحالية</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {countries?.map(c => (
              <div key={c.id} className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-3">
                  <Badge variant="outline">{c.code}</Badge>
                  <span className="font-medium">{c.nameAr}</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span>{c.currencyCode}</span>
                  <Badge variant={c.isActive ? "default" : "secondary"}>
                    {c.isActive ? "نشط" : "متوقف"}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>إضافة دولة جديدة</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="mb-2 block">رمز الدولة</Label>
              <Input value={newCountry.code} onChange={(e) => setNewCountry({ ...newCountry, code: e.target.value })} placeholder="QA" maxLength={4} />
            </div>
            <div>
              <Label className="mb-2 block">اسم الدولة (عربي)</Label>
              <Input value={newCountry.nameAr} onChange={(e) => setNewCountry({ ...newCountry, nameAr: e.target.value })} placeholder="قطر" />
            </div>
            <div>
              <Label className="mb-2 block">رمز العملة</Label>
              <Input value={newCountry.currencyCode} onChange={(e) => setNewCountry({ ...newCountry, currencyCode: e.target.value })} placeholder="QAR" maxLength={8} />
            </div>
          </div>
          <Button
            onClick={() => {
              if (!newCountry.code || !newCountry.nameAr || !newCountry.currencyCode) { toast.error("يرجى إكمال الحقول"); return; }
              addCountryMutation.mutate({ ...newCountry, pricePerPlan: 10, pricePerSemester: 150 });
            }}
            disabled={addCountryMutation.isPending}
          >
            <Plus className="ml-2 h-4 w-4" /> إضافة
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function AddLessonTab() {
  const { data: countries } = trpc.curriculum.countries.useQuery();
  const [countryId, setCountryId] = useState<number | null>(null);
  const { data: stages } = trpc.curriculum.stages.useQuery({ countryId: countryId! }, { enabled: !!countryId });
  const [stageId, setStageId] = useState<number | null>(null);
  const { data: grades } = trpc.curriculum.grades.useQuery({ stageId: stageId! }, { enabled: !!stageId }) as any;
  const [gradeId, setGradeId] = useState<number | null>(null);
  const { data: subjects } = trpc.curriculum.subjects.useQuery({ countryId: countryId! }, { enabled: !!countryId });
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const { data: textbooks } = trpc.curriculum.textbooks.useQuery(
    { countryId: countryId!, subjectId: subjectId!, gradeId: gradeId! },
    { enabled: !!countryId && !!subjectId && !!gradeId }
  );
  const [textbookId, setTextbookId] = useState<number | null>(null);
  const { data: units } = trpc.curriculum.units.useQuery({ textbookId: textbookId! }, { enabled: !!textbookId });
  const [unitId, setUnitId] = useState<number | null>(null);

  const [lessonData, setLessonData] = useState({ title: "", pageFrom: "", pageTo: "", suggestedPeriods: "1" });

  const addLessonMutation = trpc.admin.addLesson.useMutation({
    onSuccess: () => { toast.success("تمت إضافة الدرس"); setLessonData({ title: "", pageFrom: "", pageTo: "", suggestedPeriods: "1" }); },
    onError: () => toast.error("فشل الإضافة"),
  });

  const addUnitMutation = trpc.admin.addUnit.useMutation({
    onSuccess: () => toast.success("تمت إضافة الوحدة"),
    onError: () => toast.error("فشل الإضافة"),
  });

  const [newUnitTitle, setNewUnitTitle] = useState("");

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>إضافة درس جديد</CardTitle>
          <CardDescription>اختر الكتاب والوحدة ثم أضف الدرس</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="mb-2 block">الدولة</Label>
              <Select onValueChange={(v) => { setCountryId(+v); setStageId(null); setGradeId(null); setSubjectId(null); setTextbookId(null); setUnitId(null); }}>
                <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                <SelectContent>{countries?.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.nameAr}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-2 block">المرحلة</Label>
              <Select disabled={!stages} onValueChange={(v) => { setStageId(+v); setGradeId(null); setTextbookId(null); setUnitId(null); }}>
                <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                <SelectContent>{stages?.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.nameAr}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-2 block">الصف</Label>
              <Select disabled={!grades} onValueChange={(v) => { setGradeId(+v); setTextbookId(null); setUnitId(null); }}>
                <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                <SelectContent>{grades?.map((g: any) => <SelectItem key={g.id} value={String(g.id)}>{g.nameAr}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-2 block">المادة</Label>
              <Select disabled={!subjects} onValueChange={(v) => { setSubjectId(+v); setTextbookId(null); setUnitId(null); }}>
                <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                <SelectContent>{subjects?.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.nameAr}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-2 block">الكتاب</Label>
              <Select disabled={!textbooks} onValueChange={(v) => { setTextbookId(+v); setUnitId(null); }}>
                <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                <SelectContent>{textbooks?.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.title}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-2 block">الوحدة</Label>
              <Select disabled={!units} onValueChange={(v) => setUnitId(+v)}>
                <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                <SelectContent>{units?.map(u => <SelectItem key={u.id} value={String(u.id)}>{u.title}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          {unitId && (
            <div className="space-y-4 pt-4 border-t">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="mb-2 block">عنوان الدرس</Label>
                  <Input value={lessonData.title} onChange={(e) => setLessonData({ ...lessonData, title: e.target.value })} placeholder="الدرس 1: ..." />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="mb-2 block">من صفحة</Label>
                    <Input type="number" value={lessonData.pageFrom} onChange={(e) => setLessonData({ ...lessonData, pageFrom: e.target.value })} />
                  </div>
                  <div>
                    <Label className="mb-2 block">إلى صفحة</Label>
                    <Input type="number" value={lessonData.pageTo} onChange={(e) => setLessonData({ ...lessonData, pageTo: e.target.value })} />
                  </div>
                  <div>
                    <Label className="mb-2 block">عدد الحصص</Label>
                    <Input type="number" value={lessonData.suggestedPeriods} onChange={(e) => setLessonData({ ...lessonData, suggestedPeriods: e.target.value })} />
                  </div>
                </div>
              </div>
              <Button
                onClick={() => {
                  if (!lessonData.title) { toast.error("يرجى إدخال عنوان الدرس"); return; }
                  addLessonMutation.mutate({
                    unitId,
                    title: lessonData.title,
                    pageFrom: lessonData.pageFrom ? +lessonData.pageFrom : undefined,
                    pageTo: lessonData.pageTo ? +lessonData.pageTo : undefined,
                    suggestedPeriods: +lessonData.suggestedPeriods,
                  });
                }}
                disabled={addLessonMutation.isPending}
              >
                <Plus className="ml-2 h-4 w-4" /> إضافة الدرس
              </Button>
            </div>
          )}

          {textbookId && (
            <div className="space-y-2 pt-4 border-t">
              <Label>إضافة وحدة جديدة للكتاب</Label>
              <div className="flex gap-2">
                <Input value={newUnitTitle} onChange={(e) => setNewUnitTitle(e.target.value)} placeholder="عنوان الوحدة" />
                <Button onClick={() => {
                  if (!newUnitTitle) { toast.error("يرجى إدخال عنوان الوحدة"); return; }
                  addUnitMutation.mutate({ textbookId, title: newUnitTitle });
                  setNewUnitTitle("");
                }}>إضافة</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Edit, Save, X, CheckCircle } from "lucide-react";

function SmartIndexerTab() {
  const { data: countries } = trpc.admin.countries.useQuery();
  const { data: qatarTree } = trpc.drive.qatarTree.useQuery() as any;
  const [countryId, setCountryId] = useState<number | null>(null);
  const { data: stages } = trpc.curriculum.stages.useQuery({ countryId: countryId! }, { enabled: !!countryId });
  const [stageId, setStageId] = useState<number | null>(null);
  const { data: grades } = trpc.curriculum.grades.useQuery({ stageId: stageId! }, { enabled: !!stageId }) as any;
  const [gradeId, setGradeId] = useState<number | null>(null);
  const { data: subjects } = trpc.curriculum.subjects.useQuery({ countryId: countryId! }, { enabled: !!countryId });
  const [subjectId, setSubjectId] = useState<number | null>(null);

  // Drive folder navigation state
  const [currentFolderId, setCurrentFolderId] = useState<string>("");
  const [selectedFileId, setSelectedFileId] = useState<string>("");
  const [selectedFileName, setSelectedFileName] = useState<string>("");
  const [textbookTitle, setTextbookTitle] = useState("");
  const [maxPages, setMaxPages] = useState(30);
  const [indexResult, setIndexResult] = useState<any>(null);

  const { data: folderContents } = trpc.drive.listFolder.useQuery(
    { folderId: currentFolderId },
    { enabled: !!currentFolderId }
  );

  const indexPdfMutation = trpc.admin.indexPdf.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`تمت الفهرسة بنجاح: ${data.units} وحدة، ${data.lessons} درس`);
        setIndexResult(data);
      } else {
        toast.error(data.error || "فشلت الفهرسة");
      }
    },
    onError: (err: any) => toast.error(`خطأ: ${err.message}`),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-primary" /> الفهرسة الذكية لكتب Google Drive</CardTitle>
          <CardDescription>اختر كتاب PDF من Google Drive، سيقوم Claude بقراءة الفهرس واستخراج الوحدات والدروس تلقائياً وكتابتها في قاعدة البيانات</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Step 1: Select curriculum metadata */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground">الخطوة 1: بيانات الكتاب</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label className="mb-2 block">الدولة</Label>
                <Select onValueChange={(v) => { setCountryId(+v); setStageId(null); setGradeId(null); setSubjectId(null); }}>
                  <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                  <SelectContent>{countries?.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.nameAr}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-2 block">المرحلة</Label>
                <Select disabled={!stages} onValueChange={(v) => { setStageId(+v); setGradeId(null); }}>
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
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="mb-2 block">عنوان الكتاب</Label>
                <Input value={textbookTitle} onChange={(e) => setTextbookTitle(e.target.value)} placeholder="مثال: العلوم للصف الثامن - الفصل الأول" />
              </div>
              <div>
                <Label className="mb-2 block">عدد صفحات الفهرسة (افتراضي 30)</Label>
                <Input type="number" value={maxPages} onChange={(e) => setMaxPages(+e.target.value)} min={5} max={100} />
              </div>
            </div>
          </div>

          {/* Step 2: Browse Drive folders and select PDF */}
          <div className="space-y-3 pt-4 border-t">
            <h3 className="text-sm font-semibold text-muted-foreground">الخطوة 2: اختيار كتاب PDF من Google Drive</h3>
            {!currentFolderId ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">تصفح مجلدات مناهج قطر:</p>
                <div className="flex flex-wrap gap-2">
                  {qatarTree?.semesters?.map((sem: any) => (
                    <Button key={sem.folderId} variant="outline" size="sm" onClick={() => setCurrentFolderId(sem.folderId)}>
                      <FolderOpen className="ml-2 h-4 w-4" /> {sem.name}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => { setCurrentFolderId(""); setSelectedFileId(""); setSelectedFileName(""); }}>
                    ← رجوع
                  </Button>
                  <span className="text-sm text-muted-foreground">المجلد الحالي</span>
                </div>
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {folderContents?.map((item: any) => {
                    const isFolder = item.mimeType === "application/vnd.google-apps.folder";
                    const isPdf = item.mimeType === "application/pdf";
                    return (
                      <div
                        key={item.id}
                        className={`flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition-colors ${
                          selectedFileId === item.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                        }`}
                        onClick={() => {
                          if (isFolder) {
                            setCurrentFolderId(item.id);
                            setSelectedFileId("");
                            setSelectedFileName("");
                          } else if (isPdf) {
                            setSelectedFileId(item.id);
                            setSelectedFileName(item.name);
                            if (!textbookTitle) setTextbookTitle(item.name.replace(/\.pdf$/i, ""));
                          }
                        }}
                      >
                        {isFolder ? (
                          <FolderOpen className="h-5 w-5 text-primary" />
                        ) : isPdf ? (
                          <FileText className="h-5 w-5 text-orange-500" />
                        ) : (
                          <FileText className="h-5 w-5 text-muted-foreground" />
                        )}
                        <div className="flex-1">
                          <p className="text-sm font-medium">{item.name}</p>
                          {item.size && (
                            <p className="text-xs text-muted-foreground">
                              {(Number(item.size) / 1024 / 1024).toFixed(1)} MB
                            </p>
                          )}
                        </div>
                        {selectedFileId === item.id && (
                          <CheckCircle2 className="h-4 w-4 text-primary" />
                        )}
                      </div>
                    );
                  })}
                  {folderContents?.length === 0 && (
                    <p className="text-center py-4 text-muted-foreground text-sm">المجلد فارغ</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Step 3: Run indexer */}
          {selectedFileId && (
            <div className="space-y-3 pt-4 border-t">
              <h3 className="text-sm font-semibold text-muted-foreground">الخطوة 3: تشغيل الفهرسة</h3>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <FileText className="h-8 w-8 text-orange-500" />
                <div className="flex-1">
                  <p className="font-medium text-sm">{selectedFileName}</p>
                  <p className="text-xs text-muted-foreground">سيتم استخراج أول {maxPages} صفحة وإرسالها لـ Claude</p>
                </div>
              </div>
              <Button
                onClick={() => {
                  if (!countryId || !subjectId || !gradeId || !textbookTitle) {
                    toast.error("يرجى إكمال بيانات الكتاب أولاً");
                    return;
                  }
                  setIndexResult(null);
                  indexPdfMutation.mutate({
                    fileId: selectedFileId,
                    countryId,
                    subjectId,
                    gradeId,
                    textbookTitle,
                    maxPages,
                  });
                }}
                disabled={indexPdfMutation.isPending || !countryId || !subjectId || !gradeId}
                className="w-full"
              >
                {indexPdfMutation.isPending ? (
                  <><Loader2 className="ml-2 h-4 w-4 animate-spin" /> جاري الفهرسة... قد يستغرق دقيقة</>
                ) : (
                  <><Sparkles className="ml-2 h-4 w-4" /> ابدأ الفهرسة الذكية</>
                )}
              </Button>
            </div>
          )}

          {/* Results */}
          {indexResult && indexResult.success && (
            <div className="space-y-3 pt-4 border-t">
              <h3 className="text-sm font-semibold text-green-600">نتيجة الفهرسة</h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-4 rounded-lg bg-green-50 dark:bg-green-950/20">
                  <p className="text-2xl font-bold text-green-600">{indexResult.units}</p>
                  <p className="text-sm text-muted-foreground">وحدة</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-green-50 dark:bg-green-950/20">
                  <p className="text-2xl font-bold text-green-600">{indexResult.lessons}</p>
                  <p className="text-sm text-muted-foreground">درس</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-green-50 dark:bg-green-950/20">
                  <p className="text-2xl font-bold text-green-600">#{indexResult.textbookId}</p>
                  <p className="text-sm text-muted-foreground">رقم الكتاب</p>
                </div>
              </div>
              {indexResult.index?.units?.map((unit: any, i: number) => (
                <div key={i} className="p-3 rounded-lg border">
                  <p className="font-semibold text-sm mb-2">{unit.title}</p>
                  <div className="space-y-1">
                    {unit.lessons?.map((lesson: any, j: number) => (
                      <div key={j} className="text-xs text-muted-foreground flex justify-between">
                        <span>{lesson.title}</span>
                        <span>ص{lesson.pageFrom}-{lesson.pageTo}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ReviewIndexTab() {
  const [selectedTextbookId, setSelectedTextbookId] = useState<number | null>(null);
  const [editingUnitId, setEditingUnitId] = useState<number | null>(null);
  const [editingLessonId, setEditingLessonId] = useState<number | null>(null);
  const [editUnitTitle, setEditUnitTitle] = useState("");
  const [editLessonTitle, setEditLessonTitle] = useState("");
  const [editLessonPages, setEditLessonPages] = useState({ from: "", to: "" });

  const { data: textbooks, refetch: refetchTextbooks } = trpc.admin.listTextbooks.useQuery({ includeDrafts: true });
  const { data: units } = trpc.admin.reviewUnits.useQuery({ textbookId: selectedTextbookId! }, { enabled: !!selectedTextbookId });
  const [expandedUnitId, setExpandedUnitId] = useState<number | null>(null);
  const { data: lessons } = trpc.admin.reviewLessons.useQuery({ unitId: expandedUnitId! }, { enabled: !!expandedUnitId });

  const approveMutation = trpc.admin.approveTextbook.useMutation({
    onSuccess: () => { toast.success("تم اعتماد الكتاب وجميع وحداته ودروسه"); refetchTextbooks(); },
    onError: (e: any) => toast.error(`خطأ: ${e.message}`),
  });
  const deleteTextbookMutation = trpc.admin.deleteTextbook.useMutation({
    onSuccess: () => { toast.success("تم حذف الكتاب"); setSelectedTextbookId(null); refetchTextbooks(); },
    onError: (e: any) => toast.error(`خطأ: ${e.message}`),
  });
  const updateUnitMutation = trpc.admin.updateUnit.useMutation({
    onSuccess: () => { toast.success("تم تحديث الوحدة"); setEditingUnitId(null); },
    onError: (e: any) => toast.error(`خطأ: ${e.message}`),
  });
  const updateLessonMutation = trpc.admin.updateLesson.useMutation({
    onSuccess: () => { toast.success("تم تحديث الدرس"); setEditingLessonId(null); },
    onError: (e: any) => toast.error(`خطأ: ${e.message}`),
  });
  const deleteUnitMutation = trpc.admin.deleteUnit.useMutation({
    onSuccess: () => { toast.success("تم حذف الوحدة"); setExpandedUnitId(null); },
    onError: (e: any) => toast.error(`خطأ: ${e.message}`),
  });
  const deleteLessonMutation = trpc.admin.deleteLesson.useMutation({
    onSuccess: () => { toast.success("تم حذف الدرس"); },
    onError: (e: any) => toast.error(`خطأ: ${e.message}`),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CheckCircle className="w-5 h-5 text-primary" /> مراجعة واعتماد الفهارس</CardTitle>
          <CardDescription>راجع الفهارس المولّدة تلقائياً، عدّل العناوين والصفحات، ثم اعتمدها لظهورها للمعلمين</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {textbooks?.map((t: any) => (
              <div key={t.id} className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${selectedTextbookId === t.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`} onClick={() => setSelectedTextbookId(t.id)}>
                <div className="flex-1">
                  <p className="font-medium text-sm">{t.title}</p>
                  <p className="text-xs text-muted-foreground">#{t.id} — {t.sourceNote || "إدخال يدوي"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={t.status === "approved" ? "default" : "secondary"}>{t.status === "approved" ? "معتمد" : "مسودة"}</Badge>
                  {t.status === "draft" && (
                    <Button size="sm" variant="default" onClick={(e) => { e.stopPropagation(); approveMutation.mutate({ textbookId: t.id }); }}>
                      <CheckCircle className="ml-1 h-3 w-3" /> اعتماد
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); if (confirm("حذف هذا الكتاب وجميع وحداته ودروسه؟")) deleteTextbookMutation.mutate({ textbookId: t.id }); }}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
            {textbooks?.length === 0 && <p className="text-center py-4 text-muted-foreground">لا توجد كتب</p>}
          </div>

          {selectedTextbookId && units && (
            <div className="space-y-2 pt-4 border-t">
              <h3 className="text-sm font-semibold">الوحدات</h3>
              {units.map((u: any) => (
                <div key={u.id} className="border rounded-lg">
                  <div className="flex items-center justify-between p-3">
                    {editingUnitId === u.id ? (
                      <div className="flex items-center gap-2 flex-1">
                        <Input value={editUnitTitle} onChange={(e) => setEditUnitTitle(e.target.value)} className="flex-1" />
                        <Button size="sm" onClick={() => { updateUnitMutation.mutate({ unitId: u.id, title: editUnitTitle }); }}><Save className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingUnitId(null)}><X className="h-4 w-4" /></Button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 flex-1 cursor-pointer" onClick={() => setExpandedUnitId(expandedUnitId === u.id ? null : u.id)}>
                          <span className="text-xs text-muted-foreground">#{u.sortOrder}</span>
                          <span className="font-medium text-sm">{u.title}</span>
                          <Badge variant={u.status === "approved" ? "default" : "secondary"} className="text-xs">{u.status === "approved" ? "معتمد" : "مسودة"}</Badge>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" onClick={() => { setEditingUnitId(u.id); setEditUnitTitle(u.title); }}><Edit className="h-4 w-4" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => { if (confirm("حذف هذه الوحدة ودروسه؟")) deleteUnitMutation.mutate({ unitId: u.id }); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      </>
                    )}
                  </div>
                  {expandedUnitId === u.id && lessons && (
                    <div className="border-t bg-muted/30 p-3 space-y-1">
                      {lessons.map((l: any) => (
                        <div key={l.id} className="flex items-center justify-between p-2 rounded hover:bg-muted/50">
                          {editingLessonId === l.id ? (
                            <div className="flex items-center gap-2 flex-1">
                              <Input value={editLessonTitle} onChange={(e) => setEditLessonTitle(e.target.value)} className="flex-1" placeholder="عنوان الدرس" />
                              <Input type="number" value={editLessonPages.from} onChange={(e) => setEditLessonPages({ ...editLessonPages, from: e.target.value })} className="w-20" placeholder="من" />
                              <Input type="number" value={editLessonPages.to} onChange={(e) => setEditLessonPages({ ...editLessonPages, to: e.target.value })} className="w-20" placeholder="إلى" />
                              <Button size="sm" onClick={() => { updateLessonMutation.mutate({ lessonId: l.id, title: editLessonTitle, pageFrom: +editLessonPages.from || undefined, pageTo: +editLessonPages.to || undefined }); }}><Save className="h-4 w-4" /></Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditingLessonId(null)}><X className="h-4 w-4" /></Button>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-center gap-2 flex-1">
                                <span className="text-xs text-muted-foreground">#{l.sortOrder}</span>
                                <span className="text-sm">{l.title}</span>
                                {l.pageFrom && l.pageTo && <span className="text-xs text-muted-foreground">ص{l.pageFrom}-{l.pageTo}</span>}
                                <Badge variant={l.status === "approved" ? "default" : "secondary"} className="text-xs">{l.status === "approved" ? "معتمد" : "مسودة"}</Badge>
                              </div>
                              <div className="flex items-center gap-1">
                                <Button size="sm" variant="ghost" onClick={() => { setEditingLessonId(l.id); setEditLessonTitle(l.title); setEditLessonPages({ from: String(l.pageFrom || ""), to: String(l.pageTo || "") }); }}><Edit className="h-3 w-3" /></Button>
                                <Button size="sm" variant="ghost" onClick={() => { if (confirm("حذف هذا الدرس؟")) deleteLessonMutation.mutate({ lessonId: l.id }); }}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                      {lessons.length === 0 && <p className="text-center text-xs text-muted-foreground py-2">لا توجد دروس</p>}
                    </div>
                  )}
                </div>
              ))}
              {units.length === 0 && <p className="text-center py-4 text-muted-foreground">لا توجد وحدات</p>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
