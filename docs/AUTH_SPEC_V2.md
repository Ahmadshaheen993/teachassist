# AUTH_SPEC_V2 — مواصفات المصادقة المستقلة لـ TeachAssist

> **الهدف**: استبدال Manus OAuth بنظام مصادقة مستقل (بريد إلكتروني + OTP) يعمل على أي دومين، مع ترحيل المستخدمين الحاليين بسلاسة.

---

## 1. نظرة عامة على النظام الحالي

يعتمد TeachAssist حالياً على Manus OAuth لتسجيل الدخول:

| المكوّن | الموقع | الوظيفة |
|---|---|---|
| `client/src/const.ts` | الواجهة | `startLogin()` يوجّه المستخدم إلى `VITE_OAUTH_PORTAL_URL` |
| `server/_core/oauth.ts` | الخادم | `/api/oauth/callback` يستلم الكود ويستبدله بـ token |
| `server/_core/sdk.ts` | الخادم | `createSessionToken` يوقّع JWT بـ HS256 باستخدام `JWT_SECRET` |
| `server/_core/sdk.ts` | الخادم | `verifySession` يتحقق من JWT ويستخرج `openId` |
| `server/_core/sdk.ts` | الخادم | `authenticateRequest` يفضل cookie ثم Bearer header |
| `server/db.ts` | قاعدة البيانات | `upsertUser` يربط `openId` بـ user record، يمنح 2 خطة مجانية للمستخدمين الجدد |
| `shared/const.ts` | مشترك | `COOKIE_NAME = "app_session_id"`، `OAUTH_STATE_COOKIE` |

**المشكلة**: Manus OAuth مربوط بنطاق `manus.space`، ولن يعمل على دومين مستقل مثل `prep.q-genius.com`.

---

## 2. التصميم المقترح: بريد + OTP

### 2.1 تدفق تسجيل الدخول

```
المستخدم → أدخل البريد → الخادم يرسل OTP (6 أرقام) → المستخدم يدخل OTP → الخادم يتحقق → يصدر JWT session
```

### 2.2 تدفق تسجيل مستخدم جديد

```
المستخدم → أدخل البريد → الخادم يرسل OTP → المستخدم يدخل OTP → الخادم ينشئ حساب → يصدر JWT session
```

### 2.3 ترحيل المستخدمين الحاليين

```
للمستخدمين الحاليين (من Manus OAuth):
- openId موجود في جدول users
- بريدهم الإلكتروني موجود في حقل email
- عند أول دخول بالبريد + OTP، نربط الجلسة بالـ openId الموجود
- لا حاجة لكلمة مرور — OTP يكفي
```

---

## 3. التغييرات المطلوبة

### 3.1 قاعدة البيانات

```sql
-- جدول رموز OTP
CREATE TABLE IF NOT EXISTS `otp_codes` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `email` varchar(320) NOT NULL,
  `code` varchar(6) NOT NULL,
  `purpose` enum('login', 'register') NOT NULL DEFAULT 'login',
  `expiresAt` timestamp NOT NULL,
  `consumedAt` timestamp NULL,
  `attempts` int NOT NULL DEFAULT 0,
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_email` (`email`),
  KEY `idx_expiresAt` (`expiresAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 3.2 تعديل جدول users

```sql
-- جعل email فريداً ومفهرساً (لربط المستخدمين المُرحّلين)
ALTER TABLE `users` ADD UNIQUE KEY `unique_email` (`email`);
-- جعل openId اختيارياً (المستخدمون الجدد لن يكون لديهم openId من Manus)
ALTER TABLE `users` MODIFY COLUMN `openId` varchar(64) NULL;
-- إضافة حقل passwordHash اختياري (للمستقبل إن أردنا كلمات مرور)
ALTER TABLE `users` ADD COLUMN `passwordHash` varchar(255) NULL;
```

### 3.3 مسارات API الجديدة

| المسار | الطريقة | الوظيفة |
|---|---|---|
| `/api/auth/request-otp` | POST | إرسال OTP إلى البريد الإلكتروني |
| `/api/auth/verify-otp` | POST | التحقق من OTP وإصدار JWT session |
| `/api/auth/me` | GET | إرجاع بيانات المستخدم الحالي (موجود بالفعل عبر tRPC) |

### 3.4 توقيع JWT

يبقى كما هو — HS256 مع `JWT_SECRET`. لكن بدلاً من `openId` من Manus، نستخدم `userId` من قاعدة البيانات:

```typescript
// قبل (Manus OAuth):
{ openId: "manus-xxx", appId: "xxx", name: "..." }

// بعد (مستقل):
{ userId: 42, email: "teacher@school.qa", name: "..." }
```

### 3.5 ملفات يجب تعديلها

| الملف | التغيير |
|---|---|
| `shared/const.ts` | إضافة `OTP_COOKIE_NAME`، `OTP_EXPIRY_MS = 5 * 60 * 1000` |
| `server/_core/sdk.ts` | `authenticateRequest` يدعم `userId` بدلاً من `openId` |
| `server/_core/oauth.ts` | استبدال `/api/oauth/callback` بـ `/api/auth/verify-otp` |
| `server/db.ts` | `upsertUser` يدعم إنشاء مستخدم ببريد فقط (بدون openId) |
| `client/src/const.ts` | `startLogin()` يوجّه إلى صفحة `/login` بدلاً من Manus |
| `client/src/_core/hooks/useAuth.ts` | `startLogin()` يوجّه إلى `/login` |
| `client/src/pages/Login.tsx` | صفحة جديدة: بريد + OTP |
| `server/_core/env.ts` | إضافة `smtpHost`, `smtpPort`, `smtpUser`, `smtpPass`, `fromEmail` |

### 3.6 إرسال البريد

استخدام `nodemailer` مع SMTP (يمكن استخدام Resend أو SendGrid أو أي مزود):

```typescript
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: true,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

await transporter.sendMail({
  from: process.env.FROM_EMAIL || "noreply@q-genius.com",
  to: email,
  subject: "رمز الدخول — TeachAssist",
  text: `رمز الدخول الخاص بك هو: ${otpCode}\n\nينتهي خلال 5 دقائق.`,
});
```

### 3.7 متغيرات البيئة الجديدة

```
SMTP_HOST=smtp.your-provider.com
SMTP_PORT=465
SMTP_USER=your-username
SMTP_PASS=your-password
FROM_EMAIL=noreply@q-genius.com
OTP_EXPIRY_MINUTES=5
OTP_MAX_ATTEMPTS=5
```

---

## 4. ترحيل المستخدمين الحاليين

### 4.1 الاستراتيجية

1. **المستخدمون الحاليون لديهم `openId` و `email`** في جدول `users`
2. عند أول محاولة دخول بالبريد + OTP:
   - نبحث عن مستخدم بـ `email = entered_email`
   - إن وُجد: نربط الجلسة بـ `userId` الموجود
   - إن لم يُوجد: ننشئ مستخدماً جديداً (مع منح 2 خطة مجانية كما هو حالياً)
3. **لا حاجة لتغيير `openId`** — يبقى كما هو للتوافق مع البيانات القديمة

### 4.2 سكربت الترحيل

```sql
-- تأكد من أن كل بريد فريد (مطلوب لربط المستخدمين)
SELECT email, COUNT(*) as cnt FROM users
WHERE email IS NOT NULL
GROUP BY email HAVING cnt > 1;
-- لو تكرّر بريد، حلّه يدوياً قبل تفعيل unique constraint
```

---

## 5. الأمان

### 5.1 حماية OTP

- **العمر**: 5 دقائق فقط
- **الطول**: 6 أرقام
- **محاولات**: 5 كحد أقصى ثم يُلغى
- **توليد**: `crypto.randomInt(100000, 999999)`
- **تخزين**: hashed بـ SHA-256 (لا نخزن OTP كنص صريح)

### 5.2 Rate Limiting

- طلب OTP: 3 محاولات / 10 دقائق لكل بريد
- التحقق من OTP: 5 محاولات / 5 دقائق لكل OTP
- حظر IP بعد 20 محاولة فاشلة / ساعة

### 5.3 CSRF Protection

- OTP يُرسل عبر POST فقط
- `Content-Type: application/json` مطلوب
- CORS محصور على الدومين المعتمد

---

## 6. خطة التنفيذ

| الخطوة | المدة التقديرية | المخرجات |
|---|---|---|
| 1. إضافة جدول `otp_codes` و migration | 30 دقيقة | SQL migration |
| 2. تثبيت `nodemailer` | 5 دقائق | package.json |
| 3. إنشاء `server/auth.ts` | ساعة | دوال OTP + إرسال بريد |
| 4. تعديل `sdk.ts` لـ `userId` | ساعة | authenticateRequest محدّث |
| 5. إنشاء `client/src/pages/Login.tsx` | ساعتين | صفحة بريد + OTP |
| 6. تعديل `const.ts` و `useAuth.ts` | 30 دقيقة | توجيه إلى /login |
| 7. اختبارات | ساعة | vitest specs |
| 8. اختبار على Railway | 30 دقيقة | smoke test |

**الإجمالي**: ~6 ساعات عمل.

---

## 7. ما لا يتغير

- **JWT signing**: نفس `JWT_SECRET` ونفس HS256
- **Session cookie**: نفس `app_session_id` ونفس `getSessionCookieOptions`
- **tRPC context**: نفس `protectedProcedure` و `adminProcedure`
- **قاعدة البيانات**: نفس جدول `users` (مع إضافات طفيفة)
- **الرصيد والاشتراكات**: لا تتأثر
- **توليد الخطط**: لا يتأثر
- **تصدير Word/PDF**: لا يتأثر

---

## 8. الاختبار

### 8.1 اختبارات الوحدة

```typescript
describe("Auth V2", () => {
  it("should generate 6-digit OTP", () => { ... });
  it("should reject expired OTP", () => { ... });
  it("should reject consumed OTP", () => { ... });
  it("should reject after 5 attempts", () => { ... });
  it("should link existing user by email", () => { ... });
  it("should create new user if email not found", () => { ... });
  it("should issue JWT with userId", () => { ... });
});
```

### 8.2 اختبار الدخان (Smoke Test)

1. افتح `prep.q-genius.com/login`
2. أدخل بريداً مسجلاً → استلم OTP → أدخله → يجب أن تدخل
3. أدخل بريداً غير مسجل → استلم OTP → أدخله → يجب أن يُنشأ حساب
4. تحقق من أن الرصيد (2 خطط مجانية) مُمنوح للمستخدم الجديد
5. تحقق من أن المستخدم القديم احتفظ ببياناته واشتراكاته

---

## 9. المتغيرات النهائية المطلوبة لـ Railway

```
DATABASE_URL                = سلسلة TiDB
JWT_SECRET                  = سلسلة عشوائية طويلة
SMTP_HOST                   = smtp.your-provider.com
SMTP_PORT                   = 465
SMTP_USER                   = your-username
SMTP_PASS                   = your-password
FROM_EMAIL                  = noreply@q-genius.com
OTP_EXPIRY_MINUTES          = 5
OTP_MAX_ATTEMPTS            = 5
APP_BASE_URL                = https://prep.q-genius.com
PAYMENTS_ENABLED            = false
ANTHROPIC_API_KEY           = مفتاحك المباشر
GOOGLE_SERVICE_ACCOUNT_JSON = حساب الخدمة
R2_ACCOUNT_ID               = من Cloudflare
R2_ACCESS_KEY_ID            = من Cloudflare
R2_SECRET_ACCESS_KEY        = من Cloudflare
R2_BUCKET                   = teachassist
R2_PUBLIC_BASE_URL          = (اختياري)
```
