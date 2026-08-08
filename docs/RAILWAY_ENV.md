# Railway — متغيرات البيئة المطلوبة

انسخ هذه المتغيرات إلى Railway → Settings → Variables:

## أساسي (مطلوب فوراً)

```
DATABASE_URL                = [سلسلة TiDB من الخطوة 2]
JWT_SECRET                  = [openssl rand -hex 32]
APP_BASE_URL                = https://prep.q-genius.com
NODE_ENV                    = production
PAYMENTS_ENABLED            = false
```

## الذكاء الاصطناعي

```
ANTHROPIC_API_KEY           = [مفتاحك المباشر من Anthropic]
```

## Google Drive

```
GOOGLE_DRIVE_API_KEY        = [مفتاح API]
GOOGLE_SERVICE_ACCOUNT_JSON = [JSON حساب الخدمة]
```

## Cloudflare R2 (تخزين الملفات)

```
R2_ACCOUNT_ID               = [من لوحة Cloudflare → R2]
R2_ACCESS_KEY_ID            = [من R2 → Manage API Tokens]
R2_SECRET_ACCESS_KEY        = [مفتاح الوصول السري]
R2_BUCKET                   = teachassist
R2_PUBLIC_BASE_URL          = [اختياري: دومين عام للحاوية]
```

## المصادقة المستقلة (AUTH_SPEC_V2 — لاحقاً)

```
SMTP_HOST                   = [مزود البريد]
SMTP_PORT                   = 465
SMTP_USER                   = [اسم المستخدم]
SMTP_PASS                   = [كلمة المرور]
FROM_EMAIL                  = noreply@q-genius.com
OTP_EXPIRY_MINUTES          = 5
OTP_MAX_ATTEMPTS            = 5
```

## الدفع (لاحقاً — عند تفعيل البوابات)

```
MYFATOORAH_BASE_URL         = https://api.myfatoorah.com
MYFATOORAH_API_KEY          = [مفتاح MyFatoorah]
TAP_BASE_URL                = https://api.tap.company
TAP_SECRET_KEY              = [مفتاح Tap]
```

## متغيرات Manus (تبقى مؤقتاً حتى اكتمال AUTH_SPEC_V2)

```
VITE_APP_ID                 = [معرّف التطبيق الحالي]
VITE_OAUTH_PORTAL_URL       = [بوابة تسجيل الدخول الحالية]
OAUTH_SERVER_URL            = [خادم OAuth الحالي]
OWNER_OPEN_ID               = [معرّف المالك]
OWNER_NAME                  = [اسم المالك]
```
