import prisma from './prisma';
import type { Prisma, TxType } from '@prisma/client';
import { nanoid } from 'nanoid';

/**
 * کیف پول: تمام تغییرات موجودی فقط از طریق این ماژول انجام می‌شود تا
 * دفتر تراکنش‌ها همیشه با موجودی هم‌خوان بماند.
 *
 * برای جلوگیری از race condition از `UPDATE ... SET balance = balance + x`
 * داخل یک تراکنش دیتابیس استفاده می‌کنیم (نه خواندن-سپس-نوشتن).
 */

export class InsufficientFundsError extends Error {
  needed: bigint;
  available: bigint;
  constructor(needed: bigint, available: bigint) {
    super('موجودی کیف پول کافی نیست.');
    this.name = 'InsufficientFundsError';
    this.needed = needed;
    this.available = available;
  }
}

export function txRef(prefix = 'TX'): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${nanoid(6).toUpperCase()}`;
}

type Client = Prisma.TransactionClient | typeof prisma;

/**
 * اجرای یک عملیات داخل تراکنش دیتابیس.
 * اگر کلاینتی داده نشود، تراکنش جدیدی باز می‌شود؛ اگر کلاینتِ تراکنشِ جاری
 * داده شود، از همان استفاده می‌کند تا تراکنش تودرتو ساخته نشود.
 */
async function runInTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  client?: Client,
): Promise<T> {
  if (!client) return prisma.$transaction(fn);
  if ('$transaction' in client) return (client as typeof prisma).$transaction(fn);
  return fn(client as Prisma.TransactionClient);
}

export type CreditInput = {
  userId: string;
  amount: bigint;
  type: Extract<TxType, 'DEPOSIT' | 'REFUND' | 'BONUS' | 'ADJUSTMENT'>;
  description?: string;
  gateway?: string;
  gatewayRefId?: string;
  trackId?: string;
  authority?: string;
  cardNumber?: string;
  receiptPath?: string;
  invoiceId?: string;
  serverId?: string;
  meta?: Prisma.InputJsonValue;
  ref?: string;
};

/** افزایش موجودی */
export async function credit(input: CreditInput, client?: Client) {
  const run = async (tx: Prisma.TransactionClient) => {
    if (input.amount <= 0n) throw new Error('مبلغ باید بزرگ‌تر از صفر باشد.');

    const updated = await tx.user.update({
      where: { id: input.userId },
      data: { balance: { increment: input.amount } },
      select: { balance: true },
    });

    return tx.transaction.create({
      data: {
        ref: input.ref ?? txRef('DP'),
        userId: input.userId,
        type: input.type,
        direction: 'CREDIT',
        amount: input.amount,
        balanceAfter: updated.balance,
        status: 'SUCCESS',
        description: input.description,
        gateway: input.gateway,
        gatewayRefId: input.gatewayRefId,
        trackId: input.trackId,
        authority: input.authority,
        cardNumber: input.cardNumber,
        receiptPath: input.receiptPath,
        invoiceId: input.invoiceId,
        serverId: input.serverId,
        meta: input.meta ?? {},
        paidAt: new Date(),
      },
    });
  };

  return runInTransaction(run, client);
}

export type DebitInput = {
  userId: string;
  amount: bigint;
  type: Extract<TxType, 'CHARGE' | 'ADJUSTMENT' | 'WITHDRAW'>;
  description?: string;
  invoiceId?: string;
  serverId?: string;
  meta?: Prisma.InputJsonValue;
  /** اجازه منفی شدن موجودی تا سقف اعتبار کاربر */
  allowCredit?: boolean;
  ref?: string;
};

/** کاهش موجودی — در صورت کمبود موجودی خطا می‌دهد */
export async function debit(input: DebitInput, client?: Client) {
  const run = async (tx: Prisma.TransactionClient) => {
    if (input.amount <= 0n) throw new Error('مبلغ باید بزرگ‌تر از صفر باشد.');

    const user = await tx.user.findUnique({
      where: { id: input.userId },
      select: { balance: true, creditLimit: true },
    });
    if (!user) throw new Error('کاربر یافت نشد.');

    const floor = input.allowCredit ? -user.creditLimit : 0n;
    if (user.balance - input.amount < floor) {
      throw new InsufficientFundsError(input.amount, user.balance);
    }

    const updated = await tx.user.update({
      where: { id: input.userId },
      data: { balance: { decrement: input.amount } },
      select: { balance: true },
    });

    return tx.transaction.create({
      data: {
        ref: input.ref ?? txRef('CH'),
        userId: input.userId,
        type: input.type,
        direction: 'DEBIT',
        amount: input.amount,
        balanceAfter: updated.balance,
        status: 'SUCCESS',
        description: input.description,
        invoiceId: input.invoiceId,
        serverId: input.serverId,
        meta: input.meta ?? {},
        paidAt: new Date(),
      },
    });
  };

  return runInTransaction(run, client);
}

/** آیا کاربر توان پرداخت این مبلغ را دارد؟ */
export async function canAfford(userId: string, amount: bigint): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { balance: true, creditLimit: true },
  });
  if (!user) return false;
  return user.balance + user.creditLimit >= amount;
}

export async function getBalance(userId: string): Promise<bigint> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { balance: true } });
  return user?.balance ?? 0n;
}

/** ثبت تراکنش در انتظار پرداخت (قبل از رفتن به درگاه) */
export async function createPendingDeposit(params: {
  userId: string;
  amount: bigint;
  gateway: string;
  description?: string;
  meta?: Prisma.InputJsonValue;
}) {
  return prisma.transaction.create({
    data: {
      ref: txRef('DP'),
      userId: params.userId,
      type: 'DEPOSIT',
      direction: 'CREDIT',
      amount: params.amount,
      status: 'PENDING',
      gateway: params.gateway,
      description: params.description ?? 'شارژ کیف پول',
      meta: params.meta ?? {},
    },
  });
}

/**
 * نهایی کردن یک واریز در انتظار.
 * ایمن در برابر فراخوانی تکراری (callback + verify همزمان).
 */
export async function settleDeposit(params: {
  transactionId: string;
  gatewayRefId?: string;
  trackId?: string;
  cardNumber?: string;
  meta?: Prisma.InputJsonValue;
}): Promise<{ alreadySettled: boolean; amount: bigint; userId: string }> {
  return prisma.$transaction(async (tx) => {
    const trx = await tx.transaction.findUnique({ where: { id: params.transactionId } });
    if (!trx) throw new Error('تراکنش یافت نشد.');
    if (trx.status === 'SUCCESS') {
      return { alreadySettled: true, amount: trx.amount, userId: trx.userId };
    }
    if (trx.status !== 'PENDING') {
      throw new Error('این تراکنش قبلاً باطل شده است.');
    }

    const updated = await tx.user.update({
      where: { id: trx.userId },
      data: { balance: { increment: trx.amount } },
      select: { balance: true },
    });

    await tx.transaction.update({
      where: { id: trx.id },
      data: {
        status: 'SUCCESS',
        paidAt: new Date(),
        balanceAfter: updated.balance,
        gatewayRefId: params.gatewayRefId,
        trackId: params.trackId,
        cardNumber: params.cardNumber,
        // متای قبلی (مثل کد شارژ بیشتر) نباید با متای تسویه پاک شود
        meta: {
          ...((trx.meta as Prisma.JsonObject) ?? {}),
          ...((params.meta as Prisma.JsonObject) ?? {}),
        } as Prisma.InputJsonValue,
      },
    });

    return { alreadySettled: false, amount: trx.amount, userId: trx.userId };
  });
}

export async function failDeposit(transactionId: string, reason: string) {
  await prisma.transaction.updateMany({
    where: { id: transactionId, status: 'PENDING' },
    data: { status: 'FAILED', description: reason.slice(0, 500) },
  });
}
