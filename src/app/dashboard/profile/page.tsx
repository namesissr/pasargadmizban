import type { Metadata } from 'next';
import prisma from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { PageHeader } from '@/components/app/shell';
import { ProfileClient } from './client';

export const metadata: Metadata = { title: 'حساب کاربری' };
export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const user = await requireUser();

  const profile = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      email: true,
      emailVerifiedAt: true,
      phone: true,
      firstName: true,
      lastName: true,
      company: true,
      nationalId: true,
      address: true,
      city: true,
      province: true,
      postalCode: true,
      role: true,
      status: true,
      discountPct: true,
      maxServers: true,
      referralCode: true,
      createdAt: true,
      lastLoginAt: true,
      lastLoginIp: true,
      _count: { select: { servers: true, tickets: true, referrals: true } },
    },
  });

  if (!profile) return null;

  return (
    <>
      <PageHeader
        title="حساب کاربری"
        description="اطلاعات شخصی، امنیت حساب و نشست‌های فعال."
        breadcrumb={[{ href: '/dashboard', label: 'داشبورد' }]}
      />
      <ProfileClient
        profile={{
          ...profile,
          emailVerifiedAt: profile.emailVerifiedAt?.toISOString() ?? null,
          createdAt: profile.createdAt.toISOString(),
          lastLoginAt: profile.lastLoginAt?.toISOString() ?? null,
        }}
      />
    </>
  );
}
