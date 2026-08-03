import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Gift, Plus, Copy, Users, Award, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export default function Referrals() {
  const { data: codes, refetch } = trpc.referral.codes.useQuery();
  const createMutation = trpc.referral.createCode.useMutation({
    onSuccess: (data) => { toast.success(`تم إنشاء كود: ${data.code}`); refetch(); },
    onError: () => toast.error("فشل إنشاء الكود"),
  });

  const copyToClipboard = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("تم نسخ الكود");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">الإحالات</h1>
          <p className="text-muted-foreground">شارك أكواد الإحالة واحصل على فصل مجاني عند اكتمال 5 اشتراكات مدفوعة</p>
        </div>
        <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
          <Plus className="ml-2 h-4 w-4" /> إنشاء كود جديد
        </Button>
      </div>

      {/* How it works */}
      <Card className="bg-gradient-to-l from-primary/5 to-accent/10">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Gift className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h3 className="font-bold mb-2">كيف يعمل نظام الإحالات؟</h3>
              <ol className="text-sm text-muted-foreground space-y-1 list-decimal pr-4">
                <li>أنشئ كود إحالة وشاركه مع زملائك المعلمين</li>
                <li>كل معلم يستخدم كودك عند التسجيل يُحتسب ضمن إحالاتك</li>
                <li>عند اكتمال 5 اشتراكات مدفوعة من إحالاتك، تحصل على فصل دراسي مجاني</li>
                <li>يمكن لكل كود أن يستخدمه 10 أشخاص كحد أقصى</li>
              </ol>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Codes */}
      {codes && codes.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {codes.map(code => (
            <CodeCard key={code.id} code={code} onCopy={copyToClipboard} />
          ))}
        </div>
      ) : (
        <div className="text-center py-16 text-muted-foreground">
          <Gift className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>لا توجد أكواد إحالة بعد. أنشئ كوداً للبدء!</p>
        </div>
      )}
    </div>
  );
}

function CodeCard({ code, onCopy }: { code: any; onCopy: (c: string) => void }) {
  const { data: redemptions } = trpc.referral.redemptions.useQuery({ codeId: code.id });
  const { data: rewards } = trpc.referral.rewards.useQuery({ codeId: code.id });

  const paidCount = redemptions?.filter((r: any) => r.purchaseId).length ?? 0;
  const hasReward = rewards && rewards.length > 0;

  return (
    <Card className="card-elegant">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="px-4 py-2 rounded-lg bg-primary/10 font-mono font-bold text-primary text-lg tracking-wider">
              {code.code}
            </div>
            <button onClick={() => onCopy(code.code)} className="text-muted-foreground hover:text-primary transition-colors">
              <Copy className="w-4 h-4" />
            </button>
          </div>
          <Badge variant={code.isActive ? "default" : "secondary"}>
            {code.isActive ? "نشط" : "موقوف"}
          </Badge>
        </div>

        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="p-2 rounded-lg bg-muted/50">
            <Users className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">الإحالات</p>
            <p className="font-bold">{redemptions?.length ?? 0}/{code.maxUses}</p>
          </div>
          <div className="p-2 rounded-lg bg-muted/50">
            <Award className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">مدفوعة</p>
            <p className="font-bold">{paidCount}/{code.rewardThreshold}</p>
          </div>
          <div className="p-2 rounded-lg bg-muted/50">
            <CheckCircle2 className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">المكافأة</p>
            <p className="font-bold">{hasReward ? "حصل" : "—"}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
