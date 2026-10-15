import { inflateRawSync } from 'node:zlib';

/**
 * خواندن فایل ZIP بدون وابستگی بیرونی.
 *
 * خروجی CSV سرچ کنسول یک ZIP است و فایل Excel (xlsx) هم در اصل ZIP است؛
 * همین چند ده خط برای هر دو بس است. سقف حجم بازشده برای جلوگیری از
 * «بمب ZIP» است: خروجی واقعی سرچ کنسول چند صد کیلوبایت بیشتر نیست.
 */

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

export const MAX_UNZIPPED = 40 * 1024 * 1024;

export class ZipError extends Error {}

export function isZip(buf: Buffer): boolean {
  return buf.length > 4 && buf.readUInt32LE(0) === LOCAL;
}

/** همه فایل‌های داخل ZIP: نام → محتوا */
export function unzip(buf: Buffer): Map<string, Buffer> {
  // رکورد پایانی در ۲۲ بایت آخر است، مگر ZIP توضیح داشته باشد
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === EOCD) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new ZipError('فایل ZIP سالم نیست.');

  const count = buf.readUInt16LE(end + 10);
  let ptr = buf.readUInt32LE(end + 16);
  const files = new Map<string, Buffer>();
  let total = 0;

  for (let n = 0; n < count; n++) {
    if (ptr + 46 > buf.length || buf.readUInt32LE(ptr) !== CENTRAL) throw new ZipError('فهرست فایل‌های ZIP خراب است.');
    const method = buf.readUInt16LE(ptr + 10);
    const compressed = buf.readUInt32LE(ptr + 20);
    const size = buf.readUInt32LE(ptr + 24);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localOffset = buf.readUInt32LE(ptr + 42);
    const name = buf.subarray(ptr + 46, ptr + 46 + nameLen).toString('utf8');
    ptr += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith('/')) continue;
    total += size;
    if (total > MAX_UNZIPPED) throw new ZipError('حجم بازشده فایل ZIP بیش از حد مجاز است.');

    if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== LOCAL) {
      throw new ZipError(`فایل «${name}» داخل ZIP خراب است.`);
    }
    const start = localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28);
    const data = buf.subarray(start, start + compressed);

    if (method === 0) files.set(name, Buffer.from(data));
    else if (method === 8) files.set(name, inflateRawSync(data, { maxOutputLength: Math.max(size, 1) }));
    else throw new ZipError(`روش فشرده‌سازی فایل «${name}» پشتیبانی نمی‌شود.`);
  }

  return files;
}
