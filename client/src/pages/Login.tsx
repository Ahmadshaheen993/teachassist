import { useState, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";

export default function Login() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  // عدّاد إعادة الإرسال
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  // طلب OTP
  const handleRequestOtp = useCallback(async () => {
    setError(null);
    setInfo(null);

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("يرجى إدخال بريد إلكتروني صالح");
      return;
    }

    setLoading(true);
    try {
      const resp = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        setError(data.error || "فشل إرسال الرمز");
        return;
      }

      setInfo("تم إرسال رمز التحقق إلى بريدك الإلكتروني");
      setStep("otp");
      setResendCooldown(60);
    } catch {
      setError("حدث خطأ في الاتصال، حاول مرة أخرى");
    } finally {
      setLoading(false);
    }
  }, [email]);

  // التحقق من OTP
  const handleVerifyOtp = useCallback(async () => {
    setError(null);
    setInfo(null);

    if (!otp || !/^\d{6}$/.test(otp)) {
      setError("الرمز يجب أن يكون 6 أرقام");
      return;
    }

    setLoading(true);
    try {
      const resp = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: otp }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        setError(data.error || "رمز غير صحيح");
        return;
      }

      // تسجيل دخول ناجح — أعد التوجيه
      navigate("/");
      // إعادة تحميل الصفحة لتحديث حالة المصادقة
      window.location.reload();
    } catch {
      setError("حدث خطأ في الاتصال، حاول مرة أخرى");
    } finally {
      setLoading(false);
    }
  }, [email, otp, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">تسجيل الدخول</CardTitle>
          <CardDescription>
            {step === "email"
              ? "أدخل بريدك الإلكتروني لتسجيل الدخول"
              : "أدخل الرمز المرسل إلى بريدك"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === "email" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="email">البريد الإلكتروني</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="teacher@school.qa"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleRequestOtp()}
                  disabled={loading}
                  dir="ltr"
                  className="text-left"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button
                className="w-full"
                onClick={handleRequestOtp}
                disabled={loading || !email}
              >
                {loading ? <Spinner className="size-4" /> : "إرسال الرمز"}
              </Button>
            </>
          )}

          {step === "otp" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="otp">رمز التحقق (6 أرقام)</Label>
                <Input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  placeholder="123456"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  onKeyDown={(e) => e.key === "Enter" && handleVerifyOtp()}
                  disabled={loading}
                  dir="ltr"
                  className="text-center text-2xl tracking-widest"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              {info && <p className="text-sm text-muted-foreground">{info}</p>}
              <Button
                className="w-full"
                onClick={handleVerifyOtp}
                disabled={loading || otp.length !== 6}
              >
                {loading ? <Spinner className="size-4" /> : "تأكيد الرمز"}
              </Button>
              <div className="flex justify-between text-sm">
                <button
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setStep("email");
                    setOtp("");
                    setError(null);
                    setInfo(null);
                  }}
                  disabled={loading}
                >
                  ← تغيير البريد
                </button>
                <button
                  className="text-muted-foreground hover:text-foreground disabled:opacity-50"
                  onClick={handleRequestOtp}
                  disabled={loading || resendCooldown > 0}
                >
                  {resendCooldown > 0 ? `إعادة الإرسال (${resendCooldown}s)` : "إعادة إرسال الرمز"}
                </button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
