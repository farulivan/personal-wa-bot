import { toUserDate } from '../../shared/dateRange.js';
import type { QuranDailyReadRow, QuranHistoryRow } from './infra/quranRepository.js';
import type { QuranLeaderboardEntry, QuranLeaderboardMode } from './quranService.js';
import { QURAN_UNDO_WINDOW_MS } from './quranService.js';
import type { StreakInfo } from '../../shared/streaks.js';
import { formatMentionTag } from '../../shared/mentions.js';

const QURAN_LEADERBOARD_LIMIT = 10;

export type UserReminder = {
  phoneNumber: string | null;
  name: string;
  hasRead: boolean;
  currentStreak: number;
};

function joinHumanNames(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} dan ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, dan ${names[names.length - 1]}`;
}

export function formatQuranHelpMessage(): string {
  const undoWindowMinutes = QURAN_UNDO_WINDOW_MS / 60_000;
  return (
    `Bismillah, yuk jaga konsistensi tilawah harian 🤲\n\n` +
    `Perintah yang tersedia:\n\n` +
    `1) Catat bacaan hari ini\n` +
    `• #quran read 3\n` +
    `• #quran read 3 --no-mark\n` +
    `Fungsi: menambahkan 3 halaman ke catatan hari ini.\n` +
    `Kalau kirim lagi di hari yang sama, otomatis dijumlahkan.\n` +
    `Tambah --no-mark kalau mau catat bacaan tanpa geser mark.\n\n` +
    `2) Lihat riwayat bacaan\n` +
    `• #quran list\n` +
    `Fungsi: tampilkan riwayat terbaru + total halaman yang sudah dibaca.\n\n` +
    `3) Pindah halaman riwayat\n` +
    `• #quran list 2\n` +
    `Fungsi: buka halaman ke-2 dari riwayat tilawah.\n\n` +
    `4) Lihat leaderboard tilawah\n` +
    `• #quran leaderboard\n` +
    `Fungsi: ranking berdasarkan current streak, best streak, lalu total halaman periode aktif.\n\n` +
    `5) Simpan dan cek mark bacaan\n` +
    `• #quran mark 145\n` +
    `• #quran mark\n` +
    `Fungsi: simpan posisi halaman terakhir dan cek mark aktif kamu.\n\n` +
    `6) Batalkan catatan tilawah hari ini\n` +
    `• #quran undo\n` +
    `Fungsi: hapus catatan tilawah hari ini (hanya bisa dalam ${undoWindowMinutes} menit setelah catat).`
  );
}

export function formatReadLoggedResponse(
  pagesAdded: number,
  totalToday: number,
  streakDays: number
): string {
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

export function formatMarkSection(
  pagesAdded: number,
  noMark: boolean,
  maxQuranPage: number,
  existingMarkPage: number | null,
  newMarkPage: number | null
): string {
  if (noMark) {
    return `\n\n📍 Mark tidak diubah karena kamu pakai --no-mark.` + `\nCek mark kamu: #quran mark`;
  }

  if (existingMarkPage === null) {
    return (
      `\n\n📍 Aku belum bisa auto-geser mark karena kamu belum punya mark awal.` +
      `\nKamu tadi baca sampai halaman berapa?` +
      `\nSet dulu pakai:\n#quran mark <halaman>`
    );
  }

  if (newMarkPage !== null && newMarkPage > maxQuranPage) {
    return (
      `\n\n📍 Aku coba geser mark berdasarkan bacaan +${pagesAdded} halaman,` +
      ` tapi hasilnya jadi halaman ${existingMarkPage + pagesAdded} (melewati batas ${maxQuranPage}).` +
      `\nSejauh yang aku tahu, halaman Qur'an maksimal ${maxQuranPage}.` +
      `\nMasyaAllah, kamu sudah khatam ya berarti 🎉` +
      `\nMark Qur'an aku reset jadi halaman 0 yaa.`
    );
  }

  return (
    `\n\n📍 Mark otomatis aku geser dari halaman *${existingMarkPage}* ke *${newMarkPage}*` +
    ` berdasarkan bacaan +${pagesAdded} halaman.` +
    `\nKalau kurang pas, koreksi manual: #quran mark <halaman>`
  );
}

export function formatHistoryList(
  rows: QuranHistoryRow[],
  timezoneOffsetMinutes: number,
  now: Date
): string {
  const today = toUserDate(now, timezoneOffsetMinutes);
  const yesterday = toUserDate(new Date(now.getTime() - 86400000), timezoneOffsetMinutes);

  return rows
    .map((row) => {
      const readDate = toUserDate(new Date(row.createdAtUtc), timezoneOffsetMinutes);

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

export function formatStreakSection(streaks: StreakInfo): string {
  if (streaks.current <= 0 && streaks.best <= 0) return '';

  let section = `\n\n🔥 Streak: ${streaks.current} hari`;
  if (streaks.best > streaks.current) {
    section += ` | Best: ${streaks.best} hari`;
  }
  return section;
}

export function formatListPageFooter(page: number, totalPages: number): string {
  if (totalPages <= 1) return '';

  let footer = `\n\n📄 Halaman ${page} dari ${totalPages}`;
  if (page < totalPages) {
    footer += ` — #quran list ${page + 1} untuk lanjut`;
  }
  return footer;
}

export function formatEmptyListMessage(): string {
  return (
    `Belum ada catatan tilawah 👀\n\n` +
    `Mulai dengan:\n` +
    `#quran read 1\n\n` +
    `Bismillah, kita mulai dari 1 halaman hari ini 🤲`
  );
}

export function formatListPageOverflowMessage(page: number, totalPages: number): string {
  return (
    `Riwayatnya sudah habis di situ 👀\n` +
    `Kamu di halaman ${page}, padahal halaman terakhir ${totalPages}.\n\n` +
    `Coba: #quran list${totalPages > 1 ? ` ${totalPages}` : ''}`
  );
}

export function rankLeaderboardEntries(
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

export function formatLeaderboardMessage(
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

export function formatMonthlyQuranDigestMessage(
  entries: QuranLeaderboardEntry[],
  monthLabel: string
): string {
  if (entries.length === 0) {
    return (
      `📅 Monthly Quran Recap — ${monthLabel} 📖\n\n` +
      `No reading was logged last month 👀\n\n` +
      `A new month begins. May your consistency carry forward. 🤲`
    );
  }

  const medals = ['🥇', '🥈', '🥉'];
  const list = entries
    .map((entry, index) => {
      const prefix = medals[index] || '🌱';
      const bestStreakPart =
        entry.bestStreak > entry.currentStreak ? ` (Best ${entry.bestStreak} days)` : '';
      const currentStreakLabel = `${entry.currentStreak} day${entry.currentStreak !== 1 ? 's' : ''}`;
      const pageLabel = `${entry.pagesRead} page${entry.pagesRead !== 1 ? 's' : ''}`;
      return `${prefix} ${entry.user}\n   🔥 Streak ${currentStreakLabel}${bestStreakPart} | 📖 ${pageLabel}`;
    })
    .join('\n');

  return (
    `📅 Monthly Quran Recap — ${monthLabel} 📖\n\n` +
    `${list}\n\n` +
    `A new month begins. May your consistency carry forward. 🤲`
  );
}

export function formatUndoSuccess(entry: QuranDailyReadRow, timezoneOffsetMinutes: number): string {
  const dateLabel = toUserDate(new Date(entry.updatedAtUtc), timezoneOffsetMinutes);
  return (
    `Catatan tilawah berhasil dibatalkan 🗑️\n` +
    `Tanggal: ${dateLabel}\n` +
    `Halaman yang dibatalkan: ${entry.pages} halaman\n\n` +
    `Kalau mau catat ulang, kirim lagi:\n#quran read <jumlah halaman>`
  );
}

export function formatUndoNoReads(): string {
  return (
    `Tidak ada catatan tilawah hari ini yang bisa dibatalkan 👀\n\n` +
    `Belum ada yang tercatat hari ini.`
  );
}

export function formatUndoTooLate(entry: QuranDailyReadRow, timezoneOffsetMinutes: number): string {
  const undoWindowMinutes = QURAN_UNDO_WINDOW_MS / 60_000;
  const dateLabel = toUserDate(new Date(entry.updatedAtUtc), timezoneOffsetMinutes);
  return (
    `Tidak bisa lagi dibatalkan ⏳\n` +
    `Undo hanya tersedia dalam ${undoWindowMinutes} menit setelah mencatat.\n\n` +
    `Catatan terakhir hari ini:\n` +
    `[${dateLabel}] ${entry.pages} halaman`
  );
}

export function formatReminderMessage(reminders: UserReminder[]): {
  text: string;
  mentions: string[];
} {
  if (reminders.length === 0) {
    return {
      text:
        `Pengingat tilawah 22:00 🌙\n\n` +
        `Belum ada data #quran di grup ini. Yuk mulai dengan:\n#quran read 1`,
      mentions: [],
    };
  }

  const readToday = reminders.filter((u) => u.hasRead);
  const notReadYet = reminders.filter((u) => !u.hasRead);
  const notReadWithStreak = reminders.filter((u) => !u.hasRead && u.currentStreak > 0);
  const notReadNoStreak = reminders.filter((u) => !u.hasRead && u.currentStreak <= 0);

  const sections: string[] = [];

  if (readToday.length > 0) {
    sections.push(
      `✅ MasyaAllah, ${joinHumanNames(readToday.map((u) => u.name))} sudah tilawah hari ini.` +
        `\nKalau masih ada waktu malam ini, boleh ditambah lagi biar makin berkah 📖✨`
    );
  }

  if (notReadWithStreak.length > 0) {
    sections.push(
      `🔥 ${joinHumanNames(notReadWithStreak.map((u) => (u.phoneNumber ? formatMentionTag(u.phoneNumber) : u.name)))} kemarin sudah baca, tapi hari ini belum.` +
        `\nJangan sampai streak putus malam ini ya 🤲`
    );
  }

  if (notReadNoStreak.length > 0) {
    sections.push(
      `🌱 ${joinHumanNames(notReadNoStreak.map((u) => (u.phoneNumber ? formatMentionTag(u.phoneNumber) : u.name)))} masih belum mulai dari kemarin.` +
        `\nYuk buka 1-2 halaman dulu malam ini, pelan-pelan yang penting jalan ✨`
    );
  }

  const mentions = [
    ...notReadWithStreak.filter((u) => u.phoneNumber !== null).map((u) => u.phoneNumber!),
    ...notReadNoStreak.filter((u) => u.phoneNumber !== null).map((u) => u.phoneNumber!),
  ];

  if (notReadYet.length === 0) {
    return {
      text:
        `MasyaAllah tabarakallah 🤲\n\n` +
        `${sections.join('\n\n')}\n\n` +
        `Semoga Allah jaga istiqamah kita semua 📖✨`,
      mentions,
    };
  }

  return {
    text:
      `Pengingat tilawah 22:00 🌙\n` +
      `Masih ada 2 jam sebelum lose streak (00:00 GMT+7).\n\n` +
      `${sections.join('\n\n')}\n\n` +
      `Gas baca dulu, lalu catat dengan #quran read 📖`,
    mentions,
  };
}
