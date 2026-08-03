import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Wallet, CheckCircle2, Clock, Receipt } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

export default function Subscription() {
  const { data: subStatus } = trpc.subscription.status.useQuery();
  const { data: purchases } = trpc.subscription.purchases.useQuery();
  const { data: countries } = trpc.curriculum.countries.useQuery();

  const buyPlanMutation = trpc.subscription.buyPlan.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`تم إنشاء طلب شراء خطة واحدة — المبلغ: ${data.amount} ${data.currency} عبر ${data.gateway}`);
      } else {
        toast.error(data.error || "فشل إنشاء الطلب");
      }
    },
  });

  const buySemesterMutation = trpc.subscription.buySemester.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`تم إنشاء طلب اشتراك فصلي — المبلغ: ${data.amount} ${data.currency} عبر ${data.gateway}`);
      } else {
        toast.error(data.error || "فشل إنشاء الطلب");
      }
    },
  });

  const country = countries?.[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">الاشتراك والدفع</h1>
        <p className="text-muted-foreground">إدارة اشتراكك ورصيدك من الخطط</p>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">حالة الاشتراك</p>
                <p className="text-xl font-bold">
                  {subStatus?.active ? "نشط" : "غير نشط"}
                </p>
                {subStatus?.subscription && (
                  <p className="text-xs text-muted-foreground mt-1">
                    ينتهي في: {format(new Date(subStatus.subscription.endsAt), "yyyy/MM/dd")}
                  </p>
                )}
              </div>
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${subStatus?.active ? "bg-green-50" : "bg-red-50"}`}>
                <Clock className={`w-6 h-6 ${subStatus?.active ? "text-green-600" : "text-red-500"}`} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">رصيد الخطط الفردية</p>
                <p className="text-xl font-bold">{subStatus?.credits ?? 0} خطة</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center">
                <Wallet className="w-6 h-6 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Purchase Options */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="card-elegant">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-primary" />
              خطة فردية
            </CardTitle>
            <CardDescription>اشتر خطة درس واحدة</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-3xl font-bold">
              {country?.pricePerPlan ?? 10} <span className="text-base font-normal text-muted-foreground">{country?.currencyCode ?? "QAR"}</span>
            </div>
            <ul className="text-sm space-y-2">
              <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-600" /> خطة درس واحدة كاملة</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-600" /> ورقة عمل اختيارية</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-600" /> تصدير PDF و Word</li>
            </ul>
            <div className="flex gap-2">
              <Button onClick={() => buyPlanMutation.mutate({ gateway: "myfatoorah" })} disabled={buyPlanMutation.isPending} variant="outline" className="flex-1">
                MyFatoorah
              </Button>
              <Button onClick={() => buyPlanMutation.mutate({ gateway: "tap" })} disabled={buyPlanMutation.isPending} variant="outline" className="flex-1">
                Tap
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="card-elegant border-primary/30 ring-2 ring-primary/10">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-primary" />
                اشتراك فصلي
              </CardTitle>
              <Badge>الأفضل قيمة</Badge>
            </div>
            <CardDescription>اشتراك لفصل دراسي كامل</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-3xl font-bold">
              {country?.pricePerSemester ?? 150} <span className="text-base font-normal text-muted-foreground">{country?.currencyCode ?? "QAR"}</span>
            </div>
            <ul className="text-sm space-y-2">
              <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-600" /> خطط غير محدودة طوال الفصل</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-600" /> أوراق عمل غير محدودة</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-600" /> تصدير PDF و Word</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-600" /> أولوية في التوليد</li>
            </ul>
            <div className="flex gap-2">
              <Button onClick={() => buySemesterMutation.mutate({ gateway: "myfatoorah", termId: 1 })} disabled={buySemesterMutation.isPending} className="flex-1">
                MyFatoorah
              </Button>
              <Button onClick={() => buySemesterMutation.mutate({ gateway: "tap", termId: 1 })} disabled={buySemesterMutation.isPending} className="flex-1">
                Tap
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Purchase History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-primary" />
            سجل المشتريات
          </CardTitle>
        </CardHeader>
        <CardContent>
          {purchases && purchases.length > 0 ? (
            <div className="space-y-2">
              {purchases.map(p => (
                <div key={p.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-accent/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                      <CreditCard className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">
                        {p.kind === "single_plan" ? "خطة فردية" : "اشتراك فصلي"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(p.createdAt), "yyyy/MM/dd HH:mm")} — {p.gateway}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">{p.amount} {p.currency}</span>
                    <Badge variant={p.status === "paid" ? "default" : p.status === "failed" ? "destructive" : "secondary"}>
                      {p.status === "paid" ? "مدفوع" : p.status === "failed" ? "فشل" : p.status === "refunded" ? "مسترد" : "بانتظار"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Receipt className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>لا توجد مشتريات بعد</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
