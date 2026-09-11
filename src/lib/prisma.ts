import { PrismaClient } from '@prisma/client';

// BigInt به صورت پیش‌فرض در JSON.stringify خطا می‌دهد؛ آن را به رشته تبدیل می‌کنیم.
// (در لایه API با کمک serialize() به عدد یا رشته امن تبدیل می‌شود)
if (!(BigInt.prototype as unknown as { toJSON?: unknown }).toJSON) {
  Object.defineProperty(BigInt.prototype, 'toJSON', {
    value: function () {
      return this.toString();
    },
    configurable: true,
    writable: true,
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['warn', 'error']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
