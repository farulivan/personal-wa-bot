import { debug } from '../../logger.js';
import type {
  SholatLocationRow,
  SholatRepository,
  SholatDailyScheduleRow,
} from './infra/sholatRepository.js';
import type { MyQuranLocation, MyQuranSholatClient } from './infra/myQuranSholatClient.js';
import { normalizeForMatch, normalizeUserLocationInput } from './sholatParser.js';

export type LocationLookup =
  | { ok: true; location: SholatLocationRow }
  | { ok: false; message: string };

export type TodayScheduleResult =
  | { ok: true; locationName: string; schedule: SholatDailyScheduleRow }
  | { ok: false; message: string };

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

  if (message.includes('404')) return true;

  const hasNotFoundSignal = message.includes('not found') || message.includes('tidak ditemukan');
  const hasLocationSignal =
    message.includes('id') ||
    message.includes('lokasi') ||
    message.includes('kota') ||
    message.includes('location') ||
    message.includes('jadwal');

  return hasNotFoundSignal && hasLocationSignal;
}

export class SholatService {
  constructor(
    private readonly sholatRepository: SholatRepository,
    private readonly sholatClient: MyQuranSholatClient,
    private readonly defaultLocation: string,
    private readonly defaultTimezone: string
  ) {}

  async syncLocationCatalog(): Promise<SholatLocationRow[]> {
    const locations = await this.sholatClient.fetchAllLocations();
    const locationRows = toSholatLocationRows(locations);
    const nowIso = new Date().toISOString();

    await this.sholatRepository.upsertLocations(
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

  async ensureLocationCatalog(): Promise<void> {
    if ((await this.sholatRepository.countLocations()) > 0) return;
    await this.syncLocationCatalog();
  }

  resolveLocation(allLocations: SholatLocationRow[], locationInput: string): LocationLookup {
    const requested = locationInput.trim()
      ? normalizeUserLocationInput(locationInput)
      : normalizeUserLocationInput(this.defaultLocation);
    const requestedNormalized = normalizeForMatch(requested);

    const exact = allLocations.find((row) => row.normalizedLocationName === requestedNormalized);
    if (exact) return { ok: true, location: exact };

    const fuzzyQuery = normalizeForMatch(locationInput.trim() || this.defaultLocation);
    const fuzzyMatches = allLocations.filter((row) =>
      row.normalizedLocationName.includes(fuzzyQuery)
    );

    if (fuzzyMatches.length === 1) {
      return { ok: true, location: fuzzyMatches[0] };
    }

    if (fuzzyMatches.length > 1) {
      const samples = fuzzyMatches.slice(0, 5).map((row) => row.locationName);
      return { ok: false, message: `__ambiguous__:${locationInput}:${samples.join('|')}` };
    }

    return { ok: false, message: `__notfound__:${locationInput}` };
  }

  private toDateInTimezone(now: Date): string {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: this.defaultTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(now);
  }

  async getTodaySchedule(locationArg: string, now: Date): Promise<TodayScheduleResult> {
    const timezone = this.defaultTimezone;

    await this.ensureLocationCatalog();

    const allLocations = await this.sholatRepository.listLocations();
    const resolved = this.resolveLocation(allLocations, locationArg);
    if (!resolved.ok) {
      return { ok: false, message: resolved.message };
    }

    const location = resolved.location;
    const todayDate = this.toDateInTimezone(now);

    const cached = await this.sholatRepository.findDailySchedule(location.id, todayDate, timezone);
    if (cached) {
      debug(`🕌 Sholat cache hit for ${location.locationName} on ${todayDate}`);
      return { ok: true, locationName: location.locationName, schedule: cached };
    }

    let selectedLocation = location;
    let apiSchedule: Awaited<ReturnType<MyQuranSholatClient['fetchTodaySchedule']>>;

    try {
      apiSchedule = await this.sholatClient.fetchTodaySchedule(selectedLocation.id, timezone);
    } catch (err) {
      if (!isLikelyInvalidLocationIdError(err)) throw err;

      debug(
        `🕌 Suspected stale location id for ${selectedLocation.locationName}; force-refreshing locations`
      );

      const refreshedLocations = await this.syncLocationCatalog();
      const refreshedResolved = this.resolveLocation(refreshedLocations, locationArg);
      if (!refreshedResolved.ok) {
        return { ok: false, message: refreshedResolved.message };
      }

      selectedLocation = refreshedResolved.location;

      const refreshedCached = await this.sholatRepository.findDailySchedule(
        selectedLocation.id,
        todayDate,
        timezone
      );
      if (refreshedCached) {
        debug(
          `🕌 Sholat cache hit after location refresh for ${selectedLocation.locationName} on ${todayDate}`
        );
        return { ok: true, locationName: selectedLocation.locationName, schedule: refreshedCached };
      }

      apiSchedule = await this.sholatClient.fetchTodaySchedule(selectedLocation.id, timezone);
    }

    await this.sholatRepository.upsertDailySchedule({
      locationId: selectedLocation.id,
      scheduleDate: apiSchedule.scheduleDate,
      timezone,
      displayDate: apiSchedule.displayDate,
      imsak: apiSchedule.imsak,
      subuh: apiSchedule.subuh,
      terbit: apiSchedule.terbit,
      dhuha: apiSchedule.dhuha,
      dzuhur: apiSchedule.dzuhur,
      ashar: apiSchedule.ashar,
      maghrib: apiSchedule.maghrib,
      isya: apiSchedule.isya,
      fetchedAtUtc: now.toISOString(),
    });

    debug(
      `🕌 Sholat cache miss; fetched API for ${selectedLocation.locationName} on ${apiSchedule.scheduleDate}`
    );

    const persisted = await this.sholatRepository.findDailySchedule(
      selectedLocation.id,
      apiSchedule.scheduleDate,
      timezone
    );

    if (persisted) {
      return { ok: true, locationName: selectedLocation.locationName, schedule: persisted };
    }

    return { ok: false, message: `__persist_error__:${selectedLocation.locationName}` };
  }
}
