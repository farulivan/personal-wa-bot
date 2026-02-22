import type { NamespaceHandler } from '../../app/commandRouter.js';
import type { CommandInvocation } from '../../app/parseCommand.js';
import { debug } from '../../logger.js';
import { computeQuranStreaks } from './quranStreaks.js';
import {
  QURAN_LIST_LIMIT,
  QURAN_RAMADHAN_COUNT_ENABLED,
  QURAN_RAMADHAN_END_DATE,
  QURAN_RAMADHAN_START_DATE,
} from '../../app/constants.js';
import type { QuranHistoryRow, QuranRepository } from './infra/quranRepository.js';

const QURAN_NAMESPACE = 'quran';
const MAX_DAILY_PAGES_WITHOUT_APPROVAL = 50;

function tokenize(firstLine: string): string[] {
  return firstLine.trim().split(/\s+/).filter(Boolean);
}

function parsePageNumber(firstLine: string): number {
  const tokens = tokenize(firstLine);
  const pageToken = tokens.find((t) => /^\d+$/.test(t));
  return pageToken ? Math.max(1, Number(pageToken)) : 1;
}

function isIsoDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function toUserDate(utcIso: string, timezoneOffsetMinutes: number): string {
  const utcDate = new Date(utcIso);
  const local = new Date(utcDate.getTime() + timezoneOffsetMinutes * 60000);
  const y = local.getUTCFullYear();
  const m = String(local.getUTCMonth() + 1).padStart(2, '0');
  const d = String(local.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatQuranHistoryList(
  rows: QuranHistoryRow[],
  timezoneOffsetMinutes: number,
  now: Date
): string {
  const today = toUserDate(now.toISOString(), timezoneOffsetMinutes);
  const yesterday = toUserDate(
    new Date(now.getTime() - 86400000).toISOString(),
    timezoneOffsetMinutes
  );

  return rows
    .map((row) => {
      const readDate = toUserDate(row.createdAtUtc, timezoneOffsetMinutes);

      let dateLabel: string;
      if (readDate === today) {
        dateLabel = 'Today';
      } else if (readDate === yesterday) {
        dateLabel = 'Yesterday';
      } else {
        const [year, month, day] = readDate.split('-');
        dateLabel = `${year}/${month}/${day}`;
      }

      return `• ${dateLabel} — ${row.pages} halaman`;
    })
    .join('\n');
}

function helpMessage(): string {
  return (
    `Bismillah, yuk jaga konsistensi tilawah harian 🤲\n\n` +
    `Perintah yang tersedia:\n\n` +
    `1) Catat bacaan hari ini\n` +
    `• #quran read 3\n` +
    `• #quran log 3\n` +
    `Fungsi: menambahkan 3 halaman ke catatan hari ini.\n` +
    `Kalau kirim lagi di hari yang sama, otomatis dijumlahkan.\n\n` +
    `2) Lihat riwayat bacaan\n` +
    `• #quran --list\n` +
    `Fungsi: tampilkan riwayat terbaru + total halaman yang sudah dibaca.\n\n` +
    `3) Pindah halaman riwayat\n` +
    `• #quran --list 2\n` +
    `Fungsi: buka halaman ke-2 dari riwayat tilawah.`
  );
}

function parseReadInput(
  firstLine: string
): { ok: true; pages: number } | { ok: false; message: string } {
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

  const rawValue = match[1].trim();

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

  return { ok: true, pages };
}

function toReadLoggedResponse(pagesAdded: number, totalToday: number, streakDays: number): string {
  const streakLine =
    streakDays > 0
      ? `🔥 Streak kamu sekarang: ${streakDays} hari. Jaga terus ya!`
      : `Mulai hari ini, ayo bangun streak tilawahmu ✨`;

  return (
    `Alhamdulillah, tercatat ✅\n` +
    `Kamu barusan baca: ${pagesAdded} halaman\n` +
    `Total tilawah hari ini: ${totalToday} halaman\n\n` +
    `${streakLine}`
  );
}

async function handleQuranRead(
  ctx: Parameters<NamespaceHandler>[0],
  invocation: CommandInvocation,
  quranRepository: QuranRepository
): Promise<string> {
  const parseResult = parseReadInput(invocation.firstLine);
  if (!parseResult.ok) {
    return parseResult.message;
  }

  const now = ctx.now();
  const nowIsoUtc = now.toISOString();

  quranRepository.addDailyReadPages({
    user: ctx.sender,
    pages: parseResult.pages,
    timezoneOffsetMinutes: ctx.timezoneOffsetMinutes,
    nowIsoUtc,
    createdAtIsoUtc: nowIsoUtc,
    updatedAtUtc: nowIsoUtc,
  });

  const todayRecord = quranRepository.findTodayByUser(
    ctx.sender,
    ctx.timezoneOffsetMinutes,
    nowIsoUtc
  );
  const totalToday = todayRecord?.pages ?? parseResult.pages;
  const streaks = computeQuranStreaks(ctx.db, ctx.sender, ctx.timezoneOffsetMinutes, now);

  debug(`📖 Quran read logged: +${parseResult.pages} page(s) by ${ctx.sender} at ${nowIsoUtc}`);

  return toReadLoggedResponse(parseResult.pages, totalToday, streaks.current);
}

async function handleQuranList(
  ctx: Parameters<NamespaceHandler>[0],
  invocation: CommandInvocation,
  quranRepository: QuranRepository
): Promise<string> {
  const now = ctx.now();
  const page = parsePageNumber(invocation.firstLine);
  const offset = (page - 1) * QURAN_LIST_LIMIT;

  const totalDays = quranRepository.countByUser(ctx.sender);
  const totalPagesRead = quranRepository.sumPagesByUser(ctx.sender);
  const totalPages = Math.max(1, Math.ceil(totalDays / QURAN_LIST_LIMIT));

  let ramadhanSummary = '';
  const hasRamadhanRange =
    isIsoDateOnly(QURAN_RAMADHAN_START_DATE) && isIsoDateOnly(QURAN_RAMADHAN_END_DATE);
  if (QURAN_RAMADHAN_COUNT_ENABLED && hasRamadhanRange) {
    const ramadhanPagesRead = quranRepository.sumPagesByUserInDateRange(
      ctx.sender,
      ctx.timezoneOffsetMinutes,
      QURAN_RAMADHAN_START_DATE,
      QURAN_RAMADHAN_END_DATE
    );
    ramadhanSummary =
      `\nRamadhan: ${ramadhanPagesRead} halaman` +
      ` (${QURAN_RAMADHAN_START_DATE} s/d ${QURAN_RAMADHAN_END_DATE})`;
  }

  if (totalDays === 0) {
    return (
      `Belum ada catatan tilawah 👀\n\n` +
      `Mulai dengan:\n` +
      `#quran read 1\n\n` +
      `Bismillah, kita mulai dari 1 halaman hari ini 🤲`
    );
  }

  if (page > totalPages) {
    return (
      `Riwayatnya sudah habis di situ 👀\n` +
      `Kamu di halaman ${page}, padahal halaman terakhir ${totalPages}.\n\n` +
      `Coba: #quran --list${totalPages > 1 ? ` ${totalPages}` : ''}`
    );
  }

  const rows = quranRepository.listByUser(ctx.sender, QURAN_LIST_LIMIT, offset);
  const list = formatQuranHistoryList(rows, ctx.timezoneOffsetMinutes, now);
  const streaks = computeQuranStreaks(ctx.db, ctx.sender, ctx.timezoneOffsetMinutes, now);

  let streakSection = '';
  if (streaks.current > 0 || streaks.best > 0) {
    streakSection = `\n\n🔥 Streak: ${streaks.current} hari`;
    if (streaks.best > streaks.current) {
      streakSection += ` | Best: ${streaks.best} hari`;
    }
  }

  let pageFooter = '';
  if (totalPages > 1) {
    pageFooter = `\n\n📄 Halaman ${page} dari ${totalPages}`;
    if (page < totalPages) {
      pageFooter += ` — #quran --list ${page + 1} untuk lanjut`;
    }
  }

  debug(`📖 Listed ${rows.length} quran history rows (page ${page}/${totalPages})`);

  return (
    `Riwayat tilawah 📖\n` +
    `Total: ${totalPagesRead} halaman (${totalDays} hari)` +
    `${ramadhanSummary}\n\n` +
    `${list}${streakSection}${pageFooter}`
  );
}

export function createQuranNamespaceHandler(quranRepository: QuranRepository): NamespaceHandler {
  return async (ctx, invocation) => {
    if (invocation.namespace !== QURAN_NAMESPACE) return null;

    const tokens = tokenize(invocation.firstLine);
    const actionToken = (tokens[1] || '').toLowerCase();

    const isHelp =
      invocation.subcommand === 'help' ||
      invocation.firstLine.toLowerCase().includes('--help') ||
      actionToken === 'help' ||
      tokens.length === 1;
    if (isHelp) {
      return helpMessage();
    }

    const isList = invocation.subcommand === 'list' || actionToken === 'list';
    if (isList) {
      return handleQuranList(ctx, invocation, quranRepository);
    }

    if (actionToken !== 'read' && actionToken !== 'log') {
      return helpMessage();
    }

    return handleQuranRead(ctx, invocation, quranRepository);
  };
}
