# ─────────────────────────────────────────────────────────────
#  ایمیج پنل پاسارگاد میزبان
#
#  یک ایمیج برای دو نقش: وب (npm run start) و ورکر (npm run worker).
#  وابستگی‌های توسعه هم نصب می‌شوند چون ورکر و اسکریپت‌ها با tsx اجرا
#  می‌شوند و prisma برای db:push لازم است.
# ─────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim

# openssl برای موتور Prisma لازم است
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# نصب وابستگی‌ها — لایه جدا تا با تغییر کد، دوباره دانلود نشوند
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --include=dev

# کد و بیلد (مقادیر .env در زمان بیلد لازم نیستند)
COPY . .
RUN npm run build

EXPOSE 3000

# پیش‌فرض: وب. سرویس ورکر در docker-compose همین ایمیج را با فرمان دیگر اجرا می‌کند.
CMD ["npm", "run", "start"]
