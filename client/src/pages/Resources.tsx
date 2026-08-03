import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Library, Youtube, Link as LinkIcon, Calendar, FileText, ExternalLink, Lightbulb } from "lucide-react";

const kindConfig: Record<string, { icon: any; label: string; color: string }> = {
  mawqif: { icon: Lightbulb, label: "مواقف تربوية", color: "text-amber-600 bg-amber-50" },
  youtube: { icon: Youtube, label: "يوتيوب", color: "text-red-600 bg-red-50" },
  link: { icon: LinkIcon, label: "روابط مهمة", color: "text-blue-600 bg-blue-50" },
  calendar: { icon: Calendar, label: "تقاويم", color: "text-green-600 bg-green-50" },
  official_form: { icon: FileText, label: "نماذج رسمية", color: "text-purple-600 bg-purple-50" },
};

export default function Resources() {
  const [activeTab, setActiveTab] = useState("mawqif");
  const { data: resources } = trpc.resources.list.useQuery({ kind: activeTab });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">الموارد التربوية</h1>
        <p className="text-muted-foreground">مواقف تربوية، روابط، تقاويم، ونماذج رسمية</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          {Object.entries(kindConfig).map(([key, cfg]) => (
            <TabsTrigger key={key} value={key} className="gap-2">
              <cfg.icon className="w-4 h-4" />
              {cfg.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {Object.entries(kindConfig).map(([key, cfg]) => (
          <TabsContent key={key} value={key} className="mt-4">
            {resources && resources.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {resources.map(r => (
                  <Card key={r.id} className="card-elegant">
                    <CardContent className="p-5">
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-lg ${cfg.color} flex items-center justify-center shrink-0`}>
                          <cfg.icon className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-sm mb-1">{r.title}</h3>
                          {r.body && <p className="text-sm text-muted-foreground leading-relaxed">{r.body}</p>}
                          {r.url && (
                            <a
                              href={r.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-sm text-primary hover:underline mt-2"
                            >
                              <ExternalLink className="w-3 h-3" />
                              فتح الرابط
                            </a>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-16 text-muted-foreground">
                <cfg.icon className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>لا توجد موارد في هذا القسم حالياً</p>
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
