# ============================================================
# TeachAssist — Dockerfile للإنتاج
# مرحلتان: بناء ثم تشغيل. LibreOffice + خطوط عربية لتصدير PDF.
# ============================================================

# ---------- 1) مرحلة البناء ----------
FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
# الناتج: dist/index.js (السيرفر) + dist/public (الواجهة)

# ---------- 2) مرحلة التشغيل ----------
FROM node:22-slim
WORKDIR /app

# LibreOffice لتحويل Word→PDF + خطوط عربية (بدونها يطلع الـPDF مربعات)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-writer \
    fonts-noto-core \
    fonts-kacst \
    fonts-hosny-amiri \
    fontconfig \
 && rm -rf /var/lib/apt/lists/* \
 && fc-cache -f

RUN corepack enable
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install --prod --frozen-lockfile

COPY --from=build /app/dist ./dist
# قالب Word الوزاري يُقرأ من المسار المحلي كاحتياط
COPY server/templates ./server/templates
# ملفات الهجرة (drizzle) للرجوع إليها عند الحاجة
COPY drizzle ./drizzle

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/index.js"]
