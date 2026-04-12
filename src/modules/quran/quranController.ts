import type { NamespaceHandler, CommandContext } from '../../app/commandRouter.js';
import type { CommandInvocation } from '../../app/parseCommand.js';
import { debug } from '../../logger.js';
import {
  parseReadInput,
  parseMarkPage,
  parsePageNumber,
  tokenize,
  detectAction,
} from './quranParser.js';
import {
  formatQuranHelpMessage,
  formatReadLoggedResponse,
  formatMarkSection,
  formatHistoryList,
  formatStreakSection,
  formatListPageFooter,
  formatEmptyListMessage,
  formatListPageOverflowMessage,
  rankLeaderboardEntries,
  formatLeaderboardMessage,
} from './quranPresenter.js';
import type { QuranService } from './quranService.js';

const QURAN_NAMESPACE = 'quran';
const MAX_QURAN_PAGE = 604;

export function createQuranController(quranService: QuranService): NamespaceHandler {
  async function handleRead(ctx: CommandContext, invocation: CommandInvocation): Promise<string> {
    const parseResult = parseReadInput(invocation.firstLine);
    if (!parseResult.ok) {
      return parseResult.error;
    }

    const now = ctx.now();
    const { pages, noMark } = parseResult.value;

    const result = await quranService.logRead(
      ctx.sender,
      ctx.timezoneOffsetMinutes,
      pages,
      noMark,
      now
    );

    const base = formatReadLoggedResponse(
      result.pagesAdded,
      result.totalToday,
      result.streaks.current
    );
    const markSection = formatMarkSection(
      result.pagesAdded,
      result.noMark,
      MAX_QURAN_PAGE,
      result.existingMarkPage,
      result.newMarkPage
    );

    return base + markSection;
  }

  async function handleList(ctx: CommandContext, invocation: CommandInvocation): Promise<string> {
    const now = ctx.now();
    const page = parsePageNumber(invocation.firstLine);

    const result = await quranService.listHistory(ctx.sender, page, ctx.timezoneOffsetMinutes, now);

    if (result.totalDays === 0) {
      return formatEmptyListMessage();
    }

    if (page > result.totalPages) {
      return formatListPageOverflowMessage(page, result.totalPages);
    }

    const list = formatHistoryList(result.rows, ctx.timezoneOffsetMinutes, now);
    const streakSection = formatStreakSection(result.streaks);
    const pageFooter = formatListPageFooter(result.page, result.totalPages);

    const ramadhanSummary =
      result.ramadhanPagesRead !== null ? `\nRamadhan: ${result.ramadhanPagesRead} halaman` : '';
    const markSummary =
      result.currentMarkPage !== null
        ? `\n📍 Mark terakhir: halaman ${result.currentMarkPage}`
        : '';

    debug(
      `📖 Listed ${result.rows.length} quran history rows (page ${result.page}/${result.totalPages})`
    );

    return (
      `Riwayat tilawah 📖\n` +
      `Total: ${result.totalPagesRead} halaman (${result.totalDays} hari)` +
      `${ramadhanSummary}${markSummary}\n\n` +
      `${list}${streakSection}${pageFooter}`
    );
  }

  async function handleMark(ctx: CommandContext, invocation: CommandInvocation): Promise<string> {
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

    // Check-only: #quran mark or #quran --mark with no page arg
    if (tokens.length === 2) {
      const page = await quranService.getMark(ctx.sender);
      if (page === null) {
        return (
          `Kamu belum punya mark tilawah 👀\n\n` +
          `Simpan dulu dengan:\n` +
          `#quran mark 145\n\n` +
          `Nanti untuk cek lagi cukup kirim:\n` +
          `#quran mark atau #quran --mark`
        );
      }
      return (
        `Mark tilawah kamu saat ini ada di halaman *${page}* 📍\n\n` +
        `Semoga Allah mudahkan lanjut bacanya hari ini 🤲`
      );
    }

    if (secondToken !== 'mark') {
      return formatQuranHelpMessage();
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
      return parseResult.error;
    }

    const now = ctx.now();
    const { existed, previousPage } = await quranService.setMark(
      ctx.sender,
      parseResult.value,
      now
    );

    if (!existed) {
      return (
        `Mark tilawah berhasil disimpan ✅\n` +
        `Sekarang posisi bacaan kamu: halaman *${parseResult.value}* 📍`
      );
    }

    if (previousPage === parseResult.value) {
      return (
        `Mark kamu sudah di halaman *${parseResult.value}* ✅\n\n` +
        `Kalau nanti lanjut baca, tinggal update lagi dengan format yang sama.`
      );
    }

    return (
      `Mark tilawah berhasil diperbarui ✅\n` +
      `Dari halaman *${previousPage}* → *${parseResult.value}* 📍`
    );
  }

  async function handleLeaderboard(ctx: CommandContext): Promise<string> {
    const now = ctx.now();
    const { mode, entries } = await quranService.getLeaderboard(ctx.timezoneOffsetMinutes, now);
    const ranked = rankLeaderboardEntries(entries);
    return formatLeaderboardMessage(mode, ranked);
  }

  return async (ctx, invocation) => {
    if (invocation.namespace !== QURAN_NAMESPACE) return null;

    const actionToken = detectAction(invocation);
    const tokens = tokenize(invocation.firstLine);

    const isHelp =
      invocation.subcommand === 'help' ||
      invocation.firstLine.toLowerCase().includes('--help') ||
      actionToken === 'help' ||
      tokens.length === 1;
    if (isHelp) {
      return formatQuranHelpMessage();
    }

    if (invocation.subcommand === 'list' || actionToken === 'list') {
      return handleList(ctx, invocation);
    }

    if (invocation.subcommand === 'leaderboard' || actionToken === 'leaderboard') {
      return handleLeaderboard(ctx);
    }

    if (invocation.subcommand === 'mark' || actionToken === 'mark') {
      return handleMark(ctx, invocation);
    }

    if (actionToken !== 'read' && actionToken !== 'log') {
      return formatQuranHelpMessage();
    }

    return handleRead(ctx, invocation);
  };
}
