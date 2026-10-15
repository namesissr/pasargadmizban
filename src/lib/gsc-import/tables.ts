import { isZip, unzip, ZipError } from './zip';

/**
 * تبدیل فایل‌های بارگذاری‌شده به جدول ساده (ردیف‌هایی از رشته).
 *
 * سرچ کنسول سه جور خروجی می‌دهد: ZIP چند CSV، فایل Excel، و Google Sheets
 * (که خودش باز هم CSV یا Excel دانلود می‌شود). هر سه اینجا به یک شکل
 * درمی‌آیند تا تشخیص محتوا یک جا انجام شود.
 */

export type Table = {
  /** نام فایل یا برگه؛ فقط برای تشخیص نوع جدول وقتی سرستون گویا نیست */
  name: string;
  rows: string[][];
};

/** CSV استاندارد با پشتیبانی از نقل‌قول؛ جداکننده از خط اول تشخیص داده می‌شود */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.slice(0, src.indexOf('\n') >>> 0);
  const delimiter = [',', ';', '\t'].reduce((best, d) =>
    firstLine.split(d).length > firstLine.split(best).length ? d : best,
  );

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell === '') quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

function decodeXml(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** متن همه تگ‌های <t> یک بخش (رشته‌های چندتکه Excel) */
function textRuns(xml: string): string {
  let out = '';
  for (const m of xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) out += m[1];
  return decodeXml(out);
}

function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() ?? 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** برگه‌های یک فایل xlsx، به ترتیب و با نامشان */
export function parseXlsx(files: Map<string, Buffer>): Table[] {
  const workbook = files.get('xl/workbook.xml')?.toString('utf8');
  if (!workbook) throw new ZipError('فایل Excel معتبر نیست.');

  const rels = files.get('xl/_rels/workbook.xml.rels')?.toString('utf8') ?? '';
  const targets = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = /\bId="([^"]+)"/.exec(m[1])?.[1];
    const target = /\bTarget="([^"]+)"/.exec(m[1])?.[1];
    if (id && target) targets.set(id, target.replace(/^\/?(xl\/)?/, 'xl/'));
  }

  const shared: string[] = [];
  const sst = files.get('xl/sharedStrings.xml')?.toString('utf8') ?? '';
  for (const m of sst.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) shared.push(textRuns(m[1]));

  const tables: Table[] = [];
  for (const m of workbook.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const name = decodeXml(/\bname="([^"]*)"/.exec(m[1])?.[1] ?? 'Sheet');
    const rid = /\br:id="([^"]+)"/.exec(m[1])?.[1];
    const path = (rid && targets.get(rid)) || null;
    const xml = path ? files.get(path)?.toString('utf8') : undefined;
    if (!xml) continue;

    const rows: string[][] = [];
    for (const r of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const row: string[] = [];
      for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1];
        const inner = c[2] ?? '';
        const ref = /\br="([^"]+)"/.exec(attrs)?.[1];
        const type = /\bt="([^"]+)"/.exec(attrs)?.[1];
        const raw = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
        let value = '';
        if (type === 's') value = shared[Number(raw)] ?? '';
        else if (type === 'inlineStr') value = textRuns(inner);
        else if (raw !== undefined) value = decodeXml(raw);
        const index = ref ? columnIndex(ref) : row.length;
        while (row.length < index) row.push('');
        row[index] = value;
      }
      if (row.some((v) => v.trim() !== '')) rows.push(row);
    }
    tables.push({ name, rows });
  }
  return tables;
}

/** یک فایل بارگذاری‌شده → جدول‌هایش */
export function readTables(fileName: string, buf: Buffer): Table[] {
  if (isZip(buf)) {
    const files = unzip(buf);
    if (files.has('xl/workbook.xml')) return parseXlsx(files);
    const tables: Table[] = [];
    for (const [name, content] of files) {
      if (/\.csv$/i.test(name)) tables.push({ name: name.replace(/^.*\//, ''), rows: parseCsv(content.toString('utf8')) });
      else if (/\.(xlsx|zip)$/i.test(name)) tables.push(...readTables(name, content));
    }
    return tables;
  }
  // CSV تنها (یا هر متن جداشده با ویرگول)
  const text = buf.toString('utf8');
  if (text.includes('\u0000')) throw new ZipError(`فایل «${fileName}» نه CSV است، نه ZIP، نه Excel.`);
  return [{ name: fileName, rows: parseCsv(text) }];
}
