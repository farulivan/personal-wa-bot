import type { NamespaceHandler } from '../../app/commandRouter.js';
import type { CommandInvocation } from '../../app/parseCommand.js';
import { debug } from '../../logger.js';
import { computeQuranStreaks } from './quranStreaks.js';
import type { QuranStreakDateRange } from './infra/quranRepository.js';
import {
  QURAN_LIST_LIMIT,
  QURAN_RAMADHAN_COUNT_ENABLED,
  QURAN_RAMADHAN_END_DATE,
  QURAN_RAMADHAN_START_DATE,
} from '../../config/env.js';
import type { QuranHistoryRow, QuranRepository } from './infra/quranRepository.js';
import type { UserRepository } from '../users/infra/userRepository.js';

const QURAN_NAMESPACE = 'quran';
const MAX_DAILY_PAGES_WITHOUT_APPROVAL = 50;
const QURAN_LEADERBOARD_LIMIT = 10;
const MAX_QURAN_PAGE = 604;

export type QuranLeaderboardMode = 'monthly' | 'ramadhan';

export type QuranLeaderboardEntry = {
  user: string;
  currentStreak: number;
  bestStreak: number;
  pagesRead: number;
};

function tokenize(firstLine: string): string[] {
  return firstLine.trim().split(/\s+/).filter(Boolean);
}

function parsePageNumber(firstLine: string): number {
  const tokens = tokenize(firstLine);
  const pageToken = tokens.find((t) => /^\d+$/.test(t));
  return pageToken ? Math.max(1, Number(pageToken)) : 1;
}

function isIsoDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;

  return parsed.toISOString().slice(0, 10) === value;
}

function getDateRangeMode(): { mode: QuranLeaderboardMode; range?: QuranStreakDateRange } {
  const hasRamadhanRange =
    isIsoDateOnly(QURAN_RAMADHAN_START_DATE) && isIsoDateOnly(QURAN_RAMADHAN_END_DATE);
  const isValidRamadhanRange =
    hasRamadhanRange && QURAN_RAMADHAN_START_DATE <= QURAN_RAMADHAN_END_DATE;

  if (QURAN_RAMADHAN_COUNT_ENABLED && isValidRamadhanRange) {
    return {
      mode: 'ramadhan',
      range: {
        startDateInclusive: QURAN_RAMADHAN_START_DATE,
        endDateInclusive: QURAN_RAMADHAN_END_DATE,
      },
    };
  }

  return { mode: 'monthly' };
}

function getCurrentMonthDateRange(now: Date, timezoneOffsetMinutes: number): QuranStreakDateRange {
  const local = new Date(now.getTime() + timezoneOffsetMinutes * 60000);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return {
    startDateInclusive: `${year}-${String(month).padStart(2, '0')}-01`,
    endDateInclusive: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  };
}

export function rankQuranLeaderboardEntries(
  entries: QuranLeaderboardEntry[],
  limit: number = QURAN_LEADERBOARD_LIMIT
): QuranLeaderboardEntry[] {
  return [...entries]
    .sort(
      (a, b) =>
        b.currentStreak - a.currentStreak ||
        b.bestStreak - a.bestStreak ||
        b.pagesRead - a.pagesRead ||
        a.user.localeCompare(b.user)
    )
    .slice(0, limit);
}

export function renderQuranLeaderboardMessage(
  mode: QuranLeaderboardMode,
  entries: QuranLeaderboardEntry[]
): string {
  if (entries.length === 0) {
    if (mode === 'ramadhan') {
      return (
        `Ramadhan Leaderboard 🌙🏆\n\n` +
        `Belum ada data tilawah di periode ini 👀\n\n` +
        `Yuk mulai: #quran read 1`
      );
    }

    return (
      `Leaderboard Tilawah Bulan Ini 🏆\n\n` +
      `Belum ada data tilawah bulan ini 👀\n\n` +
      `Yuk mulai: #quran read 1`
    );
  }

  const title =
    mode === 'ramadhan' ? 'Ramadhan Leaderboard 🌙🏆' : 'Leaderboard Tilawah Bulan Ini 🏆';

  const medals = ['🥇', '🥈', '🥉'];
  const list = entries
    .map((entry, index) => {
      const prefix = medals[index] || '🌱';
      const bestStreakPart =
        entry.bestStreak > entry.currentStreak ? ` (Best ${entry.bestStreak} hari)` : '';
      return `${prefix} ${entry.user}\n   🔥 Streak ${entry.currentStreak} hari${bestStreakPart} | 📖 ${entry.pagesRead} halaman`;
    })
    .join('\n');

  return `${title}\n\n${list}`;
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
    `• #quran read 3 --no-mark\n` +
    `Fungsi: menambahkan 3 halaman ke catatan hari ini.\n` +
    `Kalau kirim lagi di hari yang sama, otomatis dijumlahkan.\n` +
    `Tambah --no-mark kalau mau catat bacaan tanpa geser mark.\n\n` +
    `2) Lihat riwayat bacaan\n` +
    `• #quran --list\n` +
    `Fungsi: tampilkan riwayat terbaru + total halaman yang sudah dibaca.\n\n` +
    `3) Pindah halaman riwayat\n` +
    `• #quran --list 2\n` +
    `Fungsi: buka halaman ke-2 dari riwayat tilawah.\n\n` +
    `4) Lihat leaderboard tilawah\n` +
    `• #quran --leaderboard\n` +
    `Fungsi: ranking berdasarkan current streak, best streak, lalu total halaman periode aktif.\n\n` +
    `5) Simpan dan cek mark bacaan\n` +
    `• #quran mark 145\n` +
    `• #quran mark\n` +
    `• #quran --mark\n` +
    `Fungsi: simpan posisi halaman terakhir dan cek mark aktif kamu.`
  );
}

function parseMarkPage(
  rawValue: string
): { ok: true; page: number } | { ok: false; message: string } {
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

function parseReadInput(
  firstLine: string
): { ok: true; pages: number; noMark: boolean } | { ok: false; message: string } {
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

  return { ok: true, pages, noMark };
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

  await quranRepository.addDailyReadPages({
    user: ctx.sender,
    pages: parseResult.pages,
    timezoneOffsetMinutes: ctx.timezoneOffsetMinutes,
    nowIsoUtc,
    createdAtIsoUtc: nowIsoUtc,
    updatedAtUtc: nowIsoUtc,
  });

  const todayRecord = await quranRepository.findTodayByUser(
    ctx.sender,
    ctx.timezoneOffsetMinutes,
    nowIsoUtc
  );
  const totalToday = todayRecord?.pages ?? parseResult.pages;
  const days = await quranRepository.getReadDays(ctx.sender, ctx.timezoneOffsetMinutes);
  const streaks = computeQuranStreaks(days, ctx.timezoneOffsetMinutes, now);

  let markSection: string;
  if (parseResult.noMark) {
    markSection =
      `\n\n📍 Mark tidak diubah karena kamu pakai --no-mark.` + `\nCek mark kamu: #quran mark`;
  } else {
    const existingMark = await quranRepository.findMarkByUser(ctx.sender);

    if (!existingMark) {
      markSection =
        `\n\n📍 Aku belum bisa auto-geser mark karena kamu belum punya mark awal.` +
        `\nKamu tadi baca sampai halaman berapa?` +
        `\nSet dulu pakai:\n#quran mark <halaman>`;
    } else {
      const nextMark = existingMark.page + parseResult.pages;

      if (nextMark > MAX_QURAN_PAGE) {
        await quranRepository.upsertMark(ctx.sender, 0, existingMark.createdAtUtc, nowIsoUtc);
        markSection =
          `\n\n📍 Aku coba geser mark berdasarkan bacaan +${parseResult.pages} halaman,` +
          ` tapi hasilnya jadi halaman ${nextMark} (melewati batas ${MAX_QURAN_PAGE}).` +
          `\nSejauh yang aku tahu, halaman Qur'an maksimal ${MAX_QURAN_PAGE}.` +
          `\nMasyaAllah, kamu sudah khatam ya berarti 🎉` +
          `\nMark Qur'an aku reset jadi halaman 0 yaa.`;
      } else {
        await quranRepository.upsertMark(
          ctx.sender,
          nextMark,
          existingMark.createdAtUtc,
          nowIsoUtc
        );
        markSection =
          `\n\n📍 Mark otomatis aku geser dari halaman *${existingMark.page}* ke *${nextMark}*` +
          ` berdasarkan bacaan +${parseResult.pages} halaman.` +
          `\nKalau kurang pas, koreksi manual: #quran mark <halaman>`;
      }
    }
  }

  debug(`📖 Quran read logged: +${parseResult.pages} page(s) by ${ctx.sender} at ${nowIsoUtc}`);

  return toReadLoggedResponse(parseResult.pages, totalToday, streaks.current) + markSection;
}

async function handleQuranList(
  ctx: Parameters<NamespaceHandler>[0],
  invocation: CommandInvocation,
  quranRepository: QuranRepository
): Promise<string> {
  const now = ctx.now();
  const page = parsePageNumber(invocation.firstLine);
  const offset = (page - 1) * QURAN_LIST_LIMIT;

  const totalDays = await quranRepository.countByUser(ctx.sender);
  const totalPagesRead = await quranRepository.sumPagesByUser(ctx.sender);
  const currentMark = await quranRepository.findMarkByUser(ctx.sender);
  const totalPages = Math.max(1, Math.ceil(totalDays / QURAN_LIST_LIMIT));

  let ramadhanSummary = '';
  const dateRangeMode = getDateRangeMode();
  if (dateRangeMode.mode === 'ramadhan' && dateRangeMode.range) {
    const ramadhanPagesRead = await quranRepository.sumPagesByUserInDateRange(
      ctx.sender,
      ctx.timezoneOffsetMinutes,
      dateRangeMode.range.startDateInclusive,
      dateRangeMode.range.endDateInclusive
    );
    ramadhanSummary = `\nRamadhan: ${ramadhanPagesRead} halaman`;
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

  const rows = await quranRepository.listByUser(ctx.sender, QURAN_LIST_LIMIT, offset);
  const list = formatQuranHistoryList(rows, ctx.timezoneOffsetMinutes, now);
  const readDays = await quranRepository.getReadDays(ctx.sender, ctx.timezoneOffsetMinutes);
  const streaks = computeQuranStreaks(readDays, ctx.timezoneOffsetMinutes, now);

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

  const markSummary = currentMark ? `\n📍 Mark terakhir: halaman ${currentMark.page}` : '';

  return (
    `Riwayat tilawah 📖\n` +
    `Total: ${totalPagesRead} halaman (${totalDays} hari)` +
    `${ramadhanSummary}${markSummary}\n\n` +
    `${list}${streakSection}${pageFooter}`
  );
}

async function handleQuranMark(
  ctx: Parameters<NamespaceHandler>[0],
  invocation: CommandInvocation,
  quranRepository: QuranRepository
): Promise<string> {
  const tokens = tokenize(invocation.firstLine);
  const secondToken = (tokens[1] || '').toLowerCase();
  const isDashMarkAlias = secondToken.startsWith('--mark');

  if (isDashMarkAlias && tokens.length > 2) {
    return (
      `Untuk set mark, gunakan format ini ya 👇\n` +
      `#quran mark <halaman>\n\n` +
      `Contoh:\n` +
      `#quran mark 145\n\n` +
      `Sedangkan #quran --mark dipakai untuk cek mark saat ini.`
    );
  }

  if (tokens.length === 2) {
    const mark = await quranRepository.findMarkByUser(ctx.sender);
    if (!mark) {
      return (
        `Kamu belum punya mark tilawah 👀\n\n` +
        `Simpan dulu dengan:\n` +
        `#quran mark 145\n\n` +
        `Nanti untuk cek lagi cukup kirim:\n` +
        `#quran mark atau #quran --mark`
      );
    }

    return (
      `Mark tilawah kamu saat ini ada di halaman *${mark.page}* 📍\n\n` +
      `Semoga Allah mudahkan lanjut bacanya hari ini 🤲`
    );
  }

  if (secondToken !== 'mark') {
    return helpMessage();
  }

  if (tokens.length > 3) {
    return (
      `Perintah mark cukup satu angka halaman ya 🙂\n\n` +
      `Contoh yang benar:\n` +
      `#quran mark 145`
    );
  }

  const parseResult = parseMarkPage(tokens[2] || '');
  if (!parseResult.ok) {
    return parseResult.message;
  }

  const nowIsoUtc = ctx.now().toISOString();
  const existing = await quranRepository.findMarkByUser(ctx.sender);

  await quranRepository.upsertMark(
    ctx.sender,
    parseResult.page,
    existing?.createdAtUtc ?? nowIsoUtc,
    nowIsoUtc
  );

  if (!existing) {
    return (
      `Mark tilawah berhasil disimpan ✅\n` +
      `Sekarang posisi bacaan kamu: halaman *${parseResult.page}* 📍`
    );
  }

  if (existing.page === parseResult.page) {
    return (
      `Mark kamu sudah di halaman *${parseResult.page}* ✅\n\n` +
      `Kalau nanti lanjut baca, tinggal update lagi dengan format yang sama.`
    );
  }

  return (
    `Mark tilawah berhasil diperbarui ✅\n` +
    `Dari halaman *${existing.page}* → *${parseResult.page}* 📍`
  );
}

async function handleQuranLeaderboard(
  ctx: Parameters<NamespaceHandler>[0],
  quranRepository: QuranRepository,
  userRepository: UserRepository
): Promise<string> {
  const now = ctx.now();
  const dateRangeMode = getDateRangeMode();
  const pageRange =
    dateRangeMode.mode === 'ramadhan' && dateRangeMode.range
      ? dateRangeMode.range
      : getCurrentMonthDateRange(now, ctx.timezoneOffsetMinutes);

  const userIds = await quranRepository.listDistinctUsers();

  const entriesWithMetricsRaw = await Promise.all(
    userIds.map(async (user) => {
      const readDays = await quranRepository.getReadDays(
        user,
        ctx.timezoneOffsetMinutes,
        dateRangeMode.mode === 'ramadhan' ? dateRangeMode.range : undefined
      );
      const streak = computeQuranStreaks(readDays, ctx.timezoneOffsetMinutes, now);

      const pagesRead = await quranRepository.sumPagesByUserInDateRange(
        user,
        ctx.timezoneOffsetMinutes,
        pageRange.startDateInclusive,
        pageRange.endDateInclusive
      );

      return {
        userId: user,
        currentStreak: streak.current,
        bestStreak: streak.best,
        pagesRead,
      };
    })
  );

  const entriesWithMetrics = entriesWithMetricsRaw.filter(
    (entry) => entry.currentStreak > 0 || entry.bestStreak > 0 || entry.pagesRead > 0
  );

  const entries: QuranLeaderboardEntry[] = await Promise.all(
    entriesWithMetrics.map(async (entry) => ({
      user: await userRepository.getDisplayName(entry.userId),
      currentStreak: entry.currentStreak,
      bestStreak: entry.bestStreak,
      pagesRead: entry.pagesRead,
    }))
  );

  const rankedEntries = rankQuranLeaderboardEntries(entries);
  const message = renderQuranLeaderboardMessage(dateRangeMode.mode, rankedEntries);

  debug(
    `📖 Quran leaderboard generated: mode=${dateRangeMode.mode}, entries=${rankedEntries.length}`
  );

  return message;
}

export function createQuranNamespaceHandler(
  quranRepository: QuranRepository,
  userRepository: UserRepository
): NamespaceHandler {
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

    const isLeaderboard = invocation.subcommand === 'leaderboard' || actionToken === 'leaderboard';
    if (isLeaderboard) {
      return handleQuranLeaderboard(ctx, quranRepository, userRepository);
    }

    const isMark = invocation.subcommand === 'mark' || actionToken === 'mark';
    if (isMark) {
      return handleQuranMark(ctx, invocation, quranRepository);
    }

    if (actionToken !== 'read' && actionToken !== 'log') {
      return helpMessage();
    }

    return handleQuranRead(ctx, invocation, quranRepository);
  };
}
