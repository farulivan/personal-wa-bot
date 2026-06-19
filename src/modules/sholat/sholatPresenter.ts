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
    `• #sholat --today --location bandung\n` +
    `• #sholat reminder on / off\n\n` +
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

export function formatReminderEnabled(): string {
  return (
    `Pengingat sholat dinyalakan untuk chat ini ✅\n\n` +
    `Nanti aku kabari tiap masuk waktu sholat (Subuh, Dzuhur, Ashar, Maghrib, Isya) ya 🤲\n\n` +
    `Mau matiin lagi? Ketik: #sholat reminder off`
  );
}

export function formatReminderDisabled(): string {
  return (
    `Oke, pengingat sholat dimatikan untuk chat ini 🌙\n\n` +
    `Kalau mau dinyalakan lagi: #sholat reminder on`
  );
}

export function formatReminderStatus(enabled: boolean): string {
  const state = enabled ? '*aktif* ✅' : '*nonaktif* 🌙';
  return (
    `Pengingat sholat untuk chat ini saat ini ${state}\n\n` +
    `• Nyalakan: #sholat reminder on\n` +
    `• Matikan: #sholat reminder off`
  );
}

export function formatReminderGroupNotAllowed(): string {
  return (
    `Pengingat sholat cuma bisa dinyalakan di grup utama ya 🙏\n\n` +
    `Tapi kamu tetap bisa mengaktifkannya di chat pribadi dengan: #sholat reminder on`
  );
}

export function formatPrayerReminder(
  prayerLabel: string,
  timeHHMM: string,
  locationName: string
): string {
  return (
    `🕌 Waktunya sholat *${prayerLabel}* untuk *${locationName}*\n\n` +
    `Sudah masuk pukul ${timeHHMM}.\n` +
    `Yuk segera tunaikan 🤲\n\n` +
    `Semoga harimu berkah ✨`
  );
}
