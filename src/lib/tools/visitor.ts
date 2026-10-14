import { headers } from 'next/headers';
import { isIP } from 'node:net';

/**
 * نشانی آی‌پی بازدیدکننده.
 *
 * nginx نشانی واقعی را در X-Real-IP می‌گذارد ($remote_addr) و همان قابل
 * اعتمادترین است؛ اولین مقدار X-Forwarded-For را خود کاربر هم می‌تواند جعل
 * کند، پس فقط وقتی X-Real-IP نیست به آن رجوع می‌شود.
 */
export async function visitorIp(): Promise<string | null> {
  const h = await headers();
  const candidates = [
    h.get('x-real-ip'),
    h.get('x-forwarded-for')?.split(',')[0],
  ];
  for (const raw of candidates) {
    const ip = raw?.trim().replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/, '');
    if (ip && isIP(ip)) return ip;
  }
  return null;
}
