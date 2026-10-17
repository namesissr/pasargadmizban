'use client';

import { usePathname } from 'next/navigation';

/**
 * کارفرما و برنامه‌نویس هر کدام پنل جدا دارند ولی اجزای صفحه مشترک است؛
 * این هوک از روی آدرس صفحه می‌گوید کدام پنل باز است و پیوندها به کجا بروند.
 */

export type Panel = {
  kind: 'employer' | 'developer';
  home: string;
  list: string;
  board: string;
  newTask: string;
  detail: (number: number) => string;
};

const EMPLOYER: Panel = {
  kind: 'employer',
  home: '/tasks',
  list: '/tasks/list',
  board: '/tasks/board',
  newTask: '/tasks/new',
  detail: (n) => `/tasks/${n}`,
};

const DEVELOPER: Panel = {
  kind: 'developer',
  home: '/dev',
  list: '/dev/tasks',
  board: '/dev/board',
  newTask: '/dev/new',
  detail: (n) => `/dev/tasks/${n}`,
};

export function usePanel(): Panel {
  const pathname = usePathname();
  return pathname === '/dev' || pathname.startsWith('/dev/') ? DEVELOPER : EMPLOYER;
}
