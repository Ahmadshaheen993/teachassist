import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Clock, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { format } from "date-fns";

export default function MyPlans() {
  const { data: plans, isLoading: plansLoading } = trpc.plans.list.useQuery();
  const { data: worksheets, isLoading: wsLoading } = trpc.plans.worksheets.useQuery();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">خططي وأوراق عملي</h1>
        <p className="text-muted-foreground">سجل جميع الخطط وأوراق العمل المولّدة</p>
      </div>

      <Tabs defaultValue="plans">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="plans">الخطط ({plans?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="worksheets">أوراق العمل ({worksheets?.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="plans" className="mt-4">
          {plansLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : plans && plans.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {plans.map(plan => (
                <Card key={plan.id} className="card-elegant">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <FileText className="w-5 h-5 text-primary" />
                      </div>
                      <StatusBadge status={plan.status} />
                    </div>
                    <h3 className="font-bold text-sm mb-1">خطة درس #{plan.id}</h3>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {format(new Date(plan.createdAt), "yyyy/MM/dd HH:mm")}
                    </p>
                    {plan.model && (
                      <p className="text-xs text-muted-foreground mt-1">النموذج: {plan.model}</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState icon={FileText} text="لا توجد خطط بعد" />
          )}
        </TabsContent>

        <TabsContent value="worksheets" className="mt-4">
          {wsLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : worksheets && worksheets.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {worksheets.map(ws => (
                <Card key={ws.id} className="card-elegant">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center">
                        <FileText className="w-5 h-5 text-orange-600" />
                      </div>
                    </div>
                    <h3 className="font-bold text-sm mb-1">ورقة عمل #{ws.id}</h3>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {format(new Date(ws.createdAt), "yyyy/MM/dd HH:mm")}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState icon={FileText} text="لا توجد أوراق عمل بعد" />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { variant: "default" | "secondary" | "destructive"; label: string; icon: any }> = {
    ready: { variant: "default", label: "جاهزة", icon: CheckCircle2 },
    generating: { variant: "secondary", label: "قيد التوليد", icon: Loader2 },
    failed: { variant: "destructive", label: "فشلت", icon: XCircle },
    pending: { variant: "secondary", label: "بانتظار", icon: Clock },
  };
  const cfg = map[status] || map.pending;
  return <Badge variant={cfg.variant} className="gap-1"><cfg.icon className="w-3 h-3" />{cfg.label}</Badge>;
}

function EmptyState({ icon: Icon, text }: { icon: any; text: string }) {
  return (
    <div className="text-center py-16 text-muted-foreground">
      <Icon className="w-12 h-12 mx-auto mb-3 opacity-30" />
      <p>{text}</p>
    </div>
  );
}
