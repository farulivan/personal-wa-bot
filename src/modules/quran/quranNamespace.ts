import type { NamespaceHandler } from '../../app/commandRouter.js';
import type { CommandInvocation } from '../../app/parseCommand.js';
import { debug } from '../../logger.js';
import { computeQuranStreaks } from './quranStreaks.js';
import type { QuranRepository } from './infra/quranRepository.js';

const QURAN_NAMESPACE = 'quran';
const MAX_DAILY_PAGES_WITHOUT_APPROVAL = 50;

function tokenize(firstLine: string): string[] {
  return firstLine.trim().split(/\s+/).filter(Boolean);
}

function helpMessage(): string {
  return (
    `Bismillah, kita jaga konsistensi tilawah harian 🤲\n\n` +
    `Perintah utama:\n` +
    `• #quran read 3\n\n` +
    `Artinya: hari ini baca 3 halaman.\n` +
    `Kalau kirim lagi di hari yang sama, nilainya akan ditambahkan ke total hari ini.`
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

    if (actionToken !== 'read' && actionToken !== 'log') {
      return helpMessage();
    }

    return handleQuranRead(ctx, invocation, quranRepository);
  };
}
