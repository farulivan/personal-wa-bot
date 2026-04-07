import type { CommandInvocation } from '../../app/parseCommand.js';

const MAX_DAILY_PAGES_WITHOUT_APPROVAL = 50;
const MAX_QURAN_PAGE = 604;

export type ReadInput = {
  pages: number;
  noMark: boolean;
};

export type ParseReadResult = { ok: true; input: ReadInput } | { ok: false; message: string };

export type ParseMarkResult = { ok: true; page: number } | { ok: false; message: string };

export function tokenize(firstLine: string): string[] {
  return firstLine.trim().split(/\s+/).filter(Boolean);
}

export function parsePageNumber(firstLine: string): number {
  const tokens = tokenize(firstLine);
  const pageToken = tokens.find((t) => /^\d+$/.test(t));
  return pageToken ? Math.max(1, Number(pageToken)) : 1;
}

export function parseReadInput(firstLine: string): ParseReadResult {
  const normalized = firstLine.trim().replace(/\s+/g, ' ');
  const readPrefix = /^#quran\s+(?:read|log)\s+(.+)$/i;
  const match = normalized.match(readPrefix);

  if (!match || !match[1]) {
    return {
      ok: false,
      message:
        `Aku belum nangkep jumlah halamannya 🙏\n\n` + `Contoh yang benar:\n` + `#quran read 3`,
    };
  }

  const parts = match[1].trim().split(/\s+/);
  const noMark = parts.some((p) => p.toLowerCase() === '--no-mark');
  const unknownFlags = parts.filter((p) => p.startsWith('--') && p.toLowerCase() !== '--no-mark');

  if (unknownFlags.length > 0) {
    return {
      ok: false,
      message:
        `Flag *${unknownFlags[0]}* tidak dikenali 🤔\n\n` +
        `Flag yang tersedia:\n` +
        `--no-mark — catat bacaan tanpa geser mark\n\n` +
        `Contoh:\n` +
        `#quran read 3 --no-mark`,
    };
  }

  const rawValue = parts.filter((p) => p.toLowerCase() !== '--no-mark').join(' ');

  if (!rawValue) {
    return {
      ok: false,
      message:
        `Aku belum nangkep jumlah halamannya 🙏\n\n` + `Contoh yang benar:\n` + `#quran read 3`,
    };
  }

  if (/^\d+(?:[.,]\d+)\b/.test(rawValue)) {
    return {
      ok: false,
      message:
        `Aku hanya bisa catat bilangan bulat halaman, bukan desimal 🙂\n\n` +
        `Contoh yang benar:\n` +
        `#quran read 3`,
    };
  }

  const withUnitMatch = rawValue.match(/^(\d+)\s+(.+)$/);
  if (withUnitMatch) {
    const pageValue = Number(withUnitMatch[1]);
    return {
      ok: false,
      message:
        `Maksudmu *${pageValue} halaman* ya? 😊\n` +
        `Aku cuma catat tilawah pakai satuan halaman.\n\n` +
        `Kalau ${pageValue} halaman, kirim:\n` +
        `#quran read ${pageValue}`,
    };
  }

  if (!/^\d+$/.test(rawValue)) {
    return {
      ok: false,
      message:
        `Aku cuma bisa terima angka halaman ya 🙌\n\n` +
        `Contoh:\n` +
        `#quran read 2\n` +
        `#quran read 10`,
    };
  }

  const pages = Number(rawValue);
  if (!Number.isFinite(pages) || pages <= 0) {
    return {
      ok: false,
      message: `Jumlah halaman harus lebih dari 0 ya 👀\n\n` + `Contoh:\n#quran read 3`,
    };
  }

  if (pages > MAX_DAILY_PAGES_WITHOUT_APPROVAL) {
    return {
      ok: false,
      message:
        `MasyaAllah ${pages} halaman? Kamu lagi mode turbo tilawah ya 🚀📖\n\n` +
        `Angka di atas ${MAX_DAILY_PAGES_WITHOUT_APPROVAL} halaman butuh approval admin dulu biar catatan tetap valid 🙏`,
    };
  }

  return { ok: true, input: { pages, noMark } };
}

export function parseMarkPage(rawValue: string): ParseMarkResult {
  const value = rawValue.trim();

  if (!value) {
    return {
      ok: false,
      message:
        `Aku belum menangkap nomor halamannya 🙏\n\n` + `Contoh yang benar:\n` + `#quran mark 145`,
    };
  }

  if (/^\d+(?:[.,]\d+)\b/.test(value)) {
    return {
      ok: false,
      message:
        `Mark hanya menerima angka bulat halaman ya 🙂\n\n` + `Contoh:\n` + `#quran mark 145`,
    };
  }

  if (!/^\d+$/.test(value)) {
    return {
      ok: false,
      message:
        `Format mark belum sesuai. Gunakan angka halaman saja ya 🙌\n\n` +
        `Contoh:\n` +
        `#quran mark 145`,
    };
  }

  const page = Number(value);
  if (!Number.isFinite(page) || page < 1 || page > MAX_QURAN_PAGE) {
    return {
      ok: false,
      message:
        `Sejauh yang aku tahu, halaman Qur'an maksimal ${MAX_QURAN_PAGE} ya 🙂\n` +
        `Kalau kamu isi di atas itu, coba pastikan kembali ya.\n\n` +
        `Coba cek lagi lalu set ulang dengan: #quran mark <halaman>\n` +
        `Contoh:\n` +
        `#quran mark 145`,
    };
  }

  return { ok: true, page };
}

export function detectAction(invocation: CommandInvocation): string {
  const tokens = tokenize(invocation.firstLine);
  const actionToken = (tokens[1] || '').toLowerCase();
  return actionToken;
}
