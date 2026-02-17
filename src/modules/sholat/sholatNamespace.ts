import type { NamespaceHandler } from '../../app/commandRouter.js';
import type { CommandInvocation } from '../../app/parseCommand.js';
import { debug, error } from '../../logger.js';
import type {
  SholatDailyScheduleRow,
  SholatLocationRow,
  SholatRepository,
} from './infra/sholatRepository.js';
import type { MyQuranLocation, MyQuranSholatClient } from './infra/myQuranSholatClient.js';

type CreateSholatNamespaceDeps = {
  sholatRepository: SholatRepository;
  sholatClient: MyQuranSholatClient;
  defaultLocation: string;
  defaultTimezone: string;
};

const SHOLAT_NAMESPACE = 'sholat';

type LocationLookup = { ok: true; location: SholatLocationRow } | { ok: false; message: string };

function tokenize(firstLine: string): string[] {
  return firstLine.trim().split(/\s+/).filter(Boolean);
}

function hasFlag(firstLine: string, flag: string): boolean {
  return tokenize(firstLine).some((token) => token.toLowerCase() === `--${flag.toLowerCase()}`);
}

function extractFlagValue(firstLine: string, flag: string): string {
  const tokens = tokenize(firstLine);
  const lowerFlag = `--${flag.toLowerCase()}`;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const tokenLower = token.toLowerCase();

    if (tokenLower === lowerFlag) {
      const values: string[] = [];
      for (let j = i + 1; j < tokens.length; j++) {
        if (tokens[j].startsWith('--')) break;
        values.push(tokens[j]);
      }
      return values.join(' ').trim();
    }

    if (tokenLower.startsWith(`${lowerFlag}=`)) {
      return token.slice(lowerFlag.length + 1).trim();
    }
  }

  return '';
}

function normalizeText(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeForMatch(raw: string): string {
  const normalized = normalizeText(raw)
    .replace(/^KABUPATEN\s+/, 'KAB ')
    .replace(/^KAB\s+/, 'KAB ')
    .replace(/^KOTAMADYA\s+/, 'KOTA ')
    .replace(/^KOTA\s+/, 'KOTA ');

  return normalized;
}

function normalizeUserLocationInput(raw: string): string {
  const compact = raw.trim().replace(/\s+/g, ' ');
  const kabMatch = compact.match(/^kab(?:upaten)?[.\s_-]*(.+)$/i);
  if (kabMatch && kabMatch[1]) {
    return `KAB. ${kabMatch[1].trim().toUpperCase()}`;
  }

  const kotaMatch = compact.match(/^kota[.\s_-]*(.+)$/i);
  if (kotaMatch && kotaMatch[1]) {
    return `KOTA ${kotaMatch[1].trim().toUpperCase()}`;
  }

  return `KOTA ${compact.toUpperCase()}`;
}

function resolveLocation(
  allLocations: SholatLocationRow[],
  locationInput: string,
  fallbackDefaultLocation: string
): LocationLookup {
  const requested = locationInput.trim()
    ? normalizeUserLocationInput(locationInput)
    : normalizeUserLocationInput(fallbackDefaultLocation);
  const requestedNormalized = normalizeForMatch(requested);

  const exact = allLocations.find((row) => row.normalizedLocationName === requestedNormalized);
  if (exact) {
    return { ok: true, location: exact };
  }

  const fuzzyQuery = normalizeForMatch(locationInput.trim() || fallbackDefaultLocation);
  const fuzzyMatches = allLocations.filter((row) =>
    row.normalizedLocationName.includes(fuzzyQuery)
  );

  if (fuzzyMatches.length === 1) {
    return { ok: true, location: fuzzyMatches[0] };
  }

  if (fuzzyMatches.length > 1) {
    const samples = fuzzyMatches
      .slice(0, 5)
      .map((row) => `• ${row.locationName}`)
      .join('\n');

    return {
      ok: false,
      message:
        `Aku nemu beberapa lokasi mirip "${locationInput}" 👀\n\n` +
        `${samples}\n\n` +
        `Biar pas, coba lebih spesifik.\n` +
        `Contoh: #sholat --today --location kab. bandung`,
    };
  }

  return {
    ok: false,
    message:
      `Lokasi "${locationInput}" belum ketemu 😥\n\n` +
      `Contoh format:\n` +
      `• #sholat --today --location kab. bogor\n` +
      `• #sholat --today --location bandung (otomatis jadi Kota Bandung)`,
  };
}

function toDateInTimezone(now: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  return formatter.format(now);
}

function toResponse(locationName: string, schedule: SholatDailyScheduleRow): string {
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

function helpMessage(defaultLocation: string): string {
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

function toSholatLocationRows(locations: MyQuranLocation[]): SholatLocationRow[] {
  return locations.map((row) => ({
    id: row.id,
    locationName: row.locationName,
    normalizedLocationName: normalizeForMatch(row.locationName),
  }));
}

function isLikelyInvalidLocationIdError(err: unknown): boolean {
  const rawMessage = err instanceof Error ? err.message : String(err);
  const message = rawMessage.toLowerCase();

  if (message.includes('404')) {
    return true;
  }

  const hasNotFoundSignal =
    message.includes('404') || message.includes('not found') || message.includes('tidak ditemukan');

  const hasLocationSignal =
    message.includes('id') ||
    message.includes('lokasi') ||
    message.includes('kota') ||
    message.includes('location') ||
    message.includes('jadwal');

  return hasNotFoundSignal && hasLocationSignal;
}

async function syncLocationCatalog(
  sholatRepository: SholatRepository,
  sholatClient: MyQuranSholatClient
): Promise<SholatLocationRow[]> {
  const locations = await sholatClient.fetchAllLocations();
  const locationRows = toSholatLocationRows(locations);
  const nowIso = new Date().toISOString();

  sholatRepository.upsertLocations(
    locationRows.map((row) => ({
      id: row.id,
      locationName: row.locationName,
      normalizedLocationName: row.normalizedLocationName,
      fetchedAtUtc: nowIso,
    }))
  );

  debug(`🕌 Synced ${locations.length} sholat locations from API`);
  return locationRows;
}

async function ensureLocationCatalog(
  sholatRepository: SholatRepository,
  sholatClient: MyQuranSholatClient
): Promise<void> {
  if (sholatRepository.countLocations() > 0) {
    return;
  }

  await syncLocationCatalog(sholatRepository, sholatClient);
}

async function handleSholatToday(
  ctx: Parameters<NamespaceHandler>[0],
  invocation: CommandInvocation,
  deps: CreateSholatNamespaceDeps
): Promise<string> {
  const locationArg = extractFlagValue(invocation.firstLine, 'location');
  const timezone = deps.defaultTimezone;
  const now = ctx.now();

  await ensureLocationCatalog(deps.sholatRepository, deps.sholatClient);

  const allLocations = deps.sholatRepository.listLocations();
  const resolved = resolveLocation(allLocations, locationArg, deps.defaultLocation);
  if (!resolved.ok) {
    return resolved.message;
  }

  const location = resolved.location;
  const todayDate = toDateInTimezone(now, timezone);

  const cached = deps.sholatRepository.findDailySchedule(location.id, todayDate, timezone);
  if (cached) {
    debug(`🕌 Sholat cache hit for ${location.locationName} on ${todayDate}`);
    return toResponse(location.locationName, cached);
  }

  let selectedLocation = location;
  let schedule: Awaited<ReturnType<MyQuranSholatClient['fetchTodaySchedule']>>;

  try {
    schedule = await deps.sholatClient.fetchTodaySchedule(selectedLocation.id, timezone);
  } catch (err) {
    if (!isLikelyInvalidLocationIdError(err)) {
      throw err;
    }

    debug(
      `🕌 Suspected stale location id for ${selectedLocation.locationName}; force-refreshing locations`
    );

    const refreshedLocations = await syncLocationCatalog(deps.sholatRepository, deps.sholatClient);
    const refreshedResolved = resolveLocation(
      refreshedLocations,
      locationArg,
      deps.defaultLocation
    );
    if (!refreshedResolved.ok) {
      return refreshedResolved.message;
    }

    selectedLocation = refreshedResolved.location;

    const refreshedCached = deps.sholatRepository.findDailySchedule(
      selectedLocation.id,
      todayDate,
      timezone
    );
    if (refreshedCached) {
      debug(
        `🕌 Sholat cache hit after location refresh for ${selectedLocation.locationName} on ${todayDate}`
      );
      return toResponse(selectedLocation.locationName, refreshedCached);
    }

    schedule = await deps.sholatClient.fetchTodaySchedule(selectedLocation.id, timezone);
  }

  deps.sholatRepository.upsertDailySchedule({
    locationId: selectedLocation.id,
    scheduleDate: schedule.scheduleDate,
    timezone,
    displayDate: schedule.displayDate,
    imsak: schedule.imsak,
    subuh: schedule.subuh,
    terbit: schedule.terbit,
    dhuha: schedule.dhuha,
    dzuhur: schedule.dzuhur,
    ashar: schedule.ashar,
    maghrib: schedule.maghrib,
    isya: schedule.isya,
    fetchedAtUtc: now.toISOString(),
  });

  debug(
    `🕌 Sholat cache miss; fetched API for ${selectedLocation.locationName} on ${schedule.scheduleDate}`
  );

  const persisted = deps.sholatRepository.findDailySchedule(
    selectedLocation.id,
    schedule.scheduleDate,
    timezone
  );
  if (persisted) {
    return toResponse(selectedLocation.locationName, persisted);
  }

  return (
    `Jadwal sholat untuk ${selectedLocation.locationName} sudah ditemukan, ` +
    `tapi gagal menyimpan data hari ini. Coba lagi sebentar ya 🙏`
  );
}

export function createSholatNamespaceHandler(deps: CreateSholatNamespaceDeps): NamespaceHandler {
  return async (ctx, invocation) => {
    if (invocation.namespace !== SHOLAT_NAMESPACE) return null;

    const isHelp = invocation.subcommand === 'help' || hasFlag(invocation.firstLine, 'help');
    if (isHelp) {
      return helpMessage(deps.defaultLocation);
    }

    const isToday =
      invocation.subcommand === 'today' ||
      invocation.subcommand === 'log' ||
      invocation.subcommand === 'location' ||
      hasFlag(invocation.firstLine, 'today') ||
      hasFlag(invocation.firstLine, 'location');

    if (!isToday) {
      return helpMessage(deps.defaultLocation);
    }

    try {
      return await handleSholatToday(ctx, invocation, deps);
    } catch (err) {
      error('🕌 Failed handling #sholat command:', err);
      return `Maaf, jadwal sholat belum bisa diambil sekarang. Coba lagi sebentar ya 🙏`;
    }
  };
}
