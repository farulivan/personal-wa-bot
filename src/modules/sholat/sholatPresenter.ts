import type { SholatDailyScheduleRow } from './infra/sholatRepository.js';

export function formatScheduleResponse(
  locationName: string,
  schedule: SholatDailyScheduleRow
): string {
  return (
    `Siap ✨\n` +
    `Jadwal sholat hari ini untuk *${locationName}*\n` +
    `${schedule.displayDate}\n\n` +
    `• Imsak: ${schedule.imsak}\n` +
    `• Subuh: ${schedule.subuh}\n` +
    `• Terbit: ${schedule.terbit}\n` +
    `• Dhuha: ${schedule.dhuha}\n` +
    `• Dzuhur: ${schedule.dzuhur}\n` +
    `• Ashar: ${schedule.ashar}\n` +
    `• Maghrib: ${schedule.maghrib}\n` +
    `• Isya: ${schedule.isya}\n\n` +
    `Semoga dimudahkan ibadahnya hari ini 🤲`
  );
}

export function formatHelpMessage(defaultLocation: string): string {
  return (
    `Perintah sholat yang tersedia:\n` +
    `• #sholat\n` +
    `• #sholat --today\n` +
    `• #sholat --today --location kab. bogor\n` +
    `• #sholat --location kab-bandung\n` +
    `• #sholat --today --location bandung\n\n` +
    `Default lokasi saat ini: ${defaultLocation}`
  );
}

export function formatAmbiguousLocationMessage(locationInput: string, samples: string[]): string {
  const sampleList = samples.map((s) => `• ${s}`).join('\n');
  return (
    `Aku nemu beberapa lokasi mirip "${locationInput}" 👀\n\n` +
    `${sampleList}\n\n` +
    `Biar pas, coba lebih spesifik.\n` +
    `Contoh: #sholat --today --location kab. bandung`
  );
}

export function formatLocationNotFoundMessage(locationInput: string): string {
  return (
    `Lokasi "${locationInput}" belum ketemu 😥\n\n` +
    `Contoh format:\n` +
    `• #sholat --today --location kab. bogor\n` +
    `• #sholat --today --location bandung (otomatis jadi Kota Bandung)`
  );
}

export function formatPersistErrorMessage(locationName: string): string {
  return (
    `Jadwal sholat untuk ${locationName} sudah ditemukan, ` +
    `tapi gagal menyimpan data hari ini. Coba lagi sebentar ya 🙏`
  );
}

export function formatFetchErrorMessage(): string {
  return `Maaf, jadwal sholat belum bisa diambil sekarang. Coba lagi sebentar ya 🙏`;
}
