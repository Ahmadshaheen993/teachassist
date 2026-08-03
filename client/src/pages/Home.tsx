import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BookOpen, FileText, Sparkles, TrendingUp, Clock, Wallet, ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";
import { format } from "date-fns";

export default function Home() {
  const { user } = useAuth();
  const [location, setLocation] = useLocation();
  const { data: subStatus } = trpc.subscription.status.useQuery();
  const { data: plans } = trpc.plans.list.useQuery();

  const recentPlans = plans?.slice(0, 5) ?? [];

  const stats = [
    {
      icon: FileText,
      label: "الخطط المولّدة",
      value: plans?.length ?? 0,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      icon: Wallet,
      label: "الرصيد المتبقي",
      value: subStatus?.credits ?? 0,
      color: "text-orange-600",
      bg: "bg-orange-50",
    },
    {
      icon: Sparkles,
      label: "حالة الاشتراك",
      value: subStatus?.active ? "نشط" : "غير نشط",
      color: subStatus?.active ? "text-green-600" : "text-red-500",
      bg: subStatus?.active ? "bg-green-50" : "bg-red-50",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">
          أهلاً، {user?.name || "معلم"}
        </h1>
        <p className="text-muted-foreground">
          منصتك الذكية لتوليد خطط الدروس وأوراق العمل بضغطة زر
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stats.map((stat, i) => (
          <Card key={i} className="card-elegant">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">{stat.label}</p>
                  <p className="text-2xl font-bold">{stat.value}</p>
                </div>
                <div className={`w-12 h-12 rounded-xl ${stat.bg} flex items-center justify-center`}>
                  <stat.icon className={`w-6 h-6 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="card-elegant cursor-pointer" onClick={() => setLocation("/generate")}>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
              <BookOpen className="w-7 h-7 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-lg mb-1">توليد خطة درس جديدة</h3>
              <p className="text-sm text-muted-foreground">اختر الدرس ودع الذكاء الاصطناعي يحضّر لك</p>
            </div>
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </CardContent>
        </Card>

        <Card className="card-elegant cursor-pointer" onClick={() => setLocation("/resources")}>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-accent flex items-center justify-center shrink-0">
              <Sparkles className="w-7 h-7 text-accent-foreground" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-lg mb-1">الموارد التربوية</h3>
              <p className="text-sm text-muted-foreground">مواقف تربوية، روابط، وتقاويم</p>
            </div>
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </div>

      {/* Recent Plans */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>أحدث الخطط</CardTitle>
              <CardDescription>آخر خطط الدروس المولّدة</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setLocation("/my-plans")}>
              عرض الكل
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {recentPlans.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>لا توجد خطط بعد. ابدأ بتوليد خطة درس جديدة!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentPlans.map((plan) => (
                <div
                  key={plan.id}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-accent/50 transition-colors cursor-pointer"
                  onClick={() => setLocation("/my-plans")}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">خطة درس #{plan.id}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {format(new Date(plan.createdAt), "yyyy/MM/dd HH:mm")}
                      </p>
                    </div>
                  </div>
                  <Badge variant={plan.status === "ready" ? "default" : plan.status === "failed" ? "destructive" : "secondary"}>
                    {plan.status === "ready" ? "جاهزة" : plan.status === "failed" ? "فشلت" : plan.status === "generating" ? "قيد التوليد" : "بانتظار"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
