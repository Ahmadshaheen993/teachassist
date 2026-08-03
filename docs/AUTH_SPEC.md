# مواصفة المصادقة المستقلة — نظام OTP بالبريد والجوال

## 1. نظرة عامة

تستبدل هذه المواصفة نظام Manus OAuth الحالي بنظام مصادقة مستقل يعتمد على رمز التحقق المؤقت (OTP) المرسل عبر البريد الإلكتروني أو الرسائل النصية القصيرة (SMS). الهدف هو امتلاك الباب الرئيسي للمنصة بالكامل، مع الحفاظ على أمان الجلسات وحدود الاستهلاك.

### المتطلبات غير الوظيفية

| المتطلب | القيمة |
|---|---|
| زمن إرسال OTP | أقل من 30 ثانية |
| صلاحية رمز OTP | 5 دقائق فقط |
| حد محاولات الدخول | 5 محاولات ثم انتظار 15 دقيقة |
| نوع الجلسة | httpOnly + Secure + SameSite=Lax |
| صلاحية الجلسة | 7 أيام مع تجديد تلقائي |
| خوارزمية OTP | HMAC-SHA256 (6 أرقام) |

---

## 2. مخطط قاعدة البيانات

### 2.1 تعديل جدول users

```sql
ALTER TABLE users
  ADD COLUMN phone VARCHAR(20) NULL,
  ADD COLUMN phoneVerified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN emailVerified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN passwordHash VARCHAR(255) NULL,
  ADD COLUMN lastOtpSentAt TIMESTAMP NULL,
  ADD COLUMN failedLoginAttempts INT NOT NULL DEFAULT 0,
  ADD COLUMN lockedUntil TIMESTAMP NULL;
```

> **ملاحظة:** حقل `passwordHash` اختياري — النظام يعتمد على OTP فقط افتراضياً، لكن نترك الحقل لمن يريد إضافة كلمة مرور لاحقاً.

### 2.2 جدول otp_codes جديد

```sql
CREATE TABLE otp_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  channel ENUM('email', 'sms') NOT NULL,
  codeHash VARCHAR(255) NOT NULL,
  expiresAt TIMESTAMP NOT NULL,
  usedAt TIMESTAMP NULL,
  attempts INT NOT NULL DEFAULT 0,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  INDEX idx_user_expires (userId, expiresAt)
);
```

> نُخزّن **hash** الرمز وليس الرمز نفسه — حتى لو تسرّبت قاعدة البيانات، لا يمكن استخدام الأكواد المنتهية.

### 2.3 جدول sessions جديد

```sql
CREATE TABLE sessions (
  id VARCHAR(64) PRIMARY KEY,
  userId INT NOT NULL,
  ipHash VARCHAR(64),
  userAgent VARCHAR(500),
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  expiresAt TIMESTAMP NOT NULL,
  revokedAt TIMESTAMP NULL,
  INDEX idx_user (userId),
  INDEX idx_expires (expiresAt)
);
```

### 2.4 ترحيل حسابات Manus الحالية

```sql
-- ربط حسابات Manus الحالية بالنظام الجديد
UPDATE users SET emailVerified = TRUE WHERE email IS NOT NULL AND email != '';
-- openId يُحافظ عليه للتوافق مع الكود الحالي أثناء المرحلة الانتقالية
```

---

## 3. تدفق المصادقة

### 3.1 التسجيل (Register)

```
المستخدم ←  البريد/الجوال  ←  [POST /api/auth/request-otp]
                              │
                              ├─ التحقق من عدم وجود الحساب مسبقاً
                              ├─ توليد OTP (6 أرقام عشوائية)
                              ├─ تخزين hash الرمز في otp_codes
                              ├─ إرسال البريد أو SMS
                              └─ الرد: { success: true, expiresIn: 300 }
```

### 3.2 التحقق وتسجيل الدخول (Verify)

```
المستخدم ←  البريد/الجوال + OTP  ←  [POST /api/auth/verify-otp]
                                    │
                                    ├─ البحث عن أحدث OTP غير منتهي
                                    ├─ مقارنة hash الرمز
                                    ├─ فحص محاولات الفشل (5 كحد أقصى)
                                    ├─ إنشاء حساب جديد (إن لم يوجد)
                                    ├─ إنشاء session في قاعدة البيانات
                                    ├─ تعيين cookie: session_id (httpOnly + Secure)
                                    └─ الرد: { success: true, user: {...} }
```

### 3.3 التحقق من الجلسة (Middleware)

```
كل طلب ←  [Cookie: session_id=xxx]
          │
          ├─ البحث عن session في قاعدة البيانات
          ├─ فحص: غير ملغى + غير منتهي
          ├─ تجديد تلقائي إن قارب على الانتهاء (آخر 24 ساعة)
          └─ ctx.user = المستخدم المرتبط
```

### 3.4 تسجيل الخروج (Logout)

```
[POST /api/auth/logout]
  ├─ تعيين revokedAt = NOW() للجلسة
  ├─ مسح cookie
  └─ الرد: { success: true }
```

---

## 4. حدود الأمان

### 4.1 حدود OTP

| الحد | القيمة | التطبيق |
|---|---|---|
| إرسال OTP لكل مستخدم | 1 كل 60 ثانية | فحص `lastOtpSentAt` |
| محاولات التحقق لكل OTP | 5 محاولات | حقل `attempts` في `otp_codes` |
| صلاحية OTP | 5 دقائق | حقل `expiresAt` |
| قفل الحساب | 15 دقيقة بعد 5 محاولات فاشلة | حقل `lockedUntil` |

### 4.2 حدود الجلسات

| الحد | القيمة |
|---|---|
| جلسات نشطة لكل مستخدم | 5 كحد أقصى (أقدم جلسة تُلغى) |
| مدة الجلسة | 7 أيام |
| التجديد التلقائي | آخر 24 ساعة من الانتهاء |
| إلغاء جميع الجلسات | عند تغيير البريد/الجوال |

---

## 5. إعدادات الـ Cookie

```typescript
const sessionCookieOptions = {
  httpOnly: true,     // لا يمكن الوصول عبر JavaScript
  secure: true,       // HTTPS فقط
  sameSite: 'lax',    // حماية من CSRF
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 أيام
  signed: true,       // توقيع الـ cookie
};
```

---

## 6. مزودو الإرسال

### 6.1 البريد الإلكتروني

**المزود الموصى به:** Resend (https://resend.com)
- حد مجاني: 3000 بريد/شهر
- سعر البداية: 20$/شهر (50,000 بريد)
- API بسيط: `POST /emails` مع `from`, `to`, `subject`, `html`

**القالب:**
```
من: noreply@teachassist.app
الموضوع: رمز التحقق — مساعد المعلم
النص:
رمز التحقق الخاص بك هو: 123456
صالح لمدة 5 دقائق.
إن لم تطلب هذا الرمز، تجاهل هذه الرسالة.
```

### 6.2 الرسائل النصية (SMS)

**المزود الموصى به:** Twilio (https://twilio.com)
- حد مجاني: رقم تجريبي فقط
- سعر البداية: ~0.05$/رسالة
- API: `POST /Messages` مع `From`, `To`, `Body`

> **بديل إقليمي:** Unifonic (https://unifonic.com) — يدعم الدول العربية وأرخص للرسائل المحلية.

---

## 7. خطة الترحيل من Manus OAuth

### المرحلة 1: البناء (بدون توقف الخدمة)

1. إضافة جداول `otp_codes` و `sessions` وتعديل `users`
2. بناء مسارات `/api/auth/request-otp` و `/api/auth/verify-otp` و `/api/auth/logout`
3. بناء middleware جديد يقرأ من `sessions` (مع fallback لـ Manus OAuth)
4. بناء واجهة تسجيل دخول جديدة (بريد/جوال + OTP)

### المرحلة 2: الترحيل التدريجي

1. تفعيل النظام الجديد إلى جانب القديم
2. عند تسجيل دخول مستخدم عبر Manus OAuth:
   - إن كان لديه بريد مسجل: إنشاء session جديد تلقائياً
   - إن لم يكن: توجيهه لصفحة "أكمل بياناتك" (بريد/جوال)
3. إرسال إشعار لجميع المستخدمين الحاليين: "يرجى تحديث طريقة تسجيل الدخول"

### المرحلة 3: الإيقاف النهائي

1. تعطيل Manus OAuth بعد 30 يوماً من المرحلة 2
2. حذف `server/_core/oauth.ts` و `server/_core/sdk.ts` (المتعلق بالمصادقة)
3. إزالة `OAUTH_SERVER_URL` و `VITE_OAUTH_PORTAL_URL` من متغيرات البيئة

---

## 8. متغيرات البيئة المطلوبة

| المتغير | الوصف | مثال |
|---|---|---|
| `RESEND_API_KEY` | مفتاح Resend لإرسال البريد | `re_12345...` |
| `RESEND_FROM_EMAIL` | عنوان المرسل | `noreply@teachassist.app` |
| `TWILIO_ACCOUNT_SID` | معرف حساب Twilio | `AC12345...` |
| `TWILIO_AUTH_TOKEN` | توكن Twilio | `abc123...` |
| `TWILIO_FROM_NUMBER` | رقم المرسل | `+974XXXXXXX` |
| `SESSION_SECRET` | مفتاح توقيع الـ cookie (32+ حرف) | `random-64-chars...` |
| `OTP_EXPIRY_SECONDS` | صلاحية OTP بالثواني | `300` |

---

## 9. مخطط الكود المقترح

```
server/
  auth/
    otp.ts          ← توليد والتحقق من OTP
    email.ts        ← إرسال البريد عبر Resend
    sms.ts          ← إرسال SMS عبر Twilio
    sessions.ts     ← إدارة الجلسات في DB
    middleware.ts   ← middleware للتحقق من الجلسة
  routers/
    auth.ts         ← مسارات tRPC: requestOtp, verifyOtp, logout, me
```

---

## 10. اختبار القبول

| الاختبار | المعيار |
|---|---|
| تسجيل مستخدم جديد بالبريد | OTP يصل خلال 30 ثانية |
| تسجيل دخول بـ OTP صحيح | جلسة تُنشأ، cookie يُضبط |
| رفض OTP خاطئ 5 مرات | قفل الحساب 15 دقيقة |
| رفض OTP منتهي | خطأ واضح "انتهت صلاحية الرمز" |
| تسجيل الخروج | الجلسة تُلغى، cookie يُمسح |
| تجديد الجلسة التلقائي | آخر 24 ساعة: تُجدّد |
| حد إرسال OTP | 1 كل 60 ثانية |
| ترحيل مستخدم Manus OAuth | session جديد يُنشأ تلقائياً |

---

## 11. ملاحظات أمنية إضافية

- **توليد OTP:** استخدم `crypto.randomInt(100000, 999999)` من Node.js — ليس `Math.random()`
- **تخزين OTP:** خزّن `bcrypt.hash(code, 10)` وليس الرمز نفسه
- **تنظيف آلي:** احذف سجلات `otp_codes` المنتهية كل ساعة
- **مراقبة:** سجّل كل محاولة تسجيل دخول (نجاح/فشل) مع IP و User-Agent
- **CSRF:** الـ cookie `SameSite=Lax` يحمي من CSRF للطلبات غير GET
- **Brute force:** قفل 15 دقيقة بعد 5 محاولات + CAPTCHA اختياري بعد 3 محاولات
