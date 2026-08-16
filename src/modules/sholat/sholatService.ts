import { debug } from '../../logger.js';
import type {
  SholatLocationRow,
  SholatRepository,
  SholatDailyScheduleRow,
} from './infra/sholatRepository.js';
import {
  LocationNotFoundError,
  type MyQuranLocation,
  type MyQuranSholatClient,
} from './infra/myQuranSholatClient.js';
import { normalizeForMatch, parseLocationQuery } from './sholatParser.js';
import { ok, err } from '../../shared/result.js';
import type { Result } from '../../shared/result.js';

/**
 * Why the resolved location differs from what the user typed. Wording lives in
 * the presenter.
 *
 * Only raised when there is something to act on. A bare name that matches only a
 * regency needs no note: the reply already shows the resolved name in bold, and
 * there is no city of that name to offer instead.
 */
export type LocationResolutionNote = {
  kind: 'city_with_regency_twin';
  regencyName: string;
};

export type ResolvedLocation = { row: SholatLocationRow; note?: LocationResolutionNote };

export type TodaySchedule = {
  locationName: string;
  schedule: SholatDailyScheduleRow;
  /** Present only when the resolved location differs from what the user typed. */
  note?: LocationResolutionNote;
};

export type SholatError =
  | { type: 'ambiguous'; input: string; samples: string[] }
  /** Nothing matched, but a near-miss is worth offering back. */
  | { type: 'suggestion'; input: string; suggestion: string }
  | { type: 'notfound'; input: string }
  | { type: 'persist_error'; locationName: string };

export type LocationLookupResult = Result<ResolvedLocation, SholatError>;
export type TodayScheduleResult = Result<TodaySchedule, SholatError>;

export type SetReminderOutcome = 'enabled' | 'disabled' | 'group_not_allowed';

function toSholatLocationRows(locations: MyQuranLocation[]): SholatLocationRow[] {
  return locations.map((row) => ({
    id: row.id,
    locationName: row.locationName,
    normalizedLocationName: normalizeForMatch(row.locationName),
  }));
}

export class SholatService {
  constructor(
    private readonly sholatRepository: SholatRepository,
    private readonly sholatClient: MyQuranSholatClient,
    private readonly defaultLocation: string,
    private readonly defaultTimezone: string,
    private readonly digestGroupIds: string[]
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

  /**
   * Resolves a user's location input against the catalogue, exact matches first.
   *
   * Order matters more than it looks. Substring matching used to run before the
   * obvious candidates, so a correctly-typed "pidie" lost to KAB. PIDIE JAYA and
   * came back as ambiguous. Trying KOTA/KAB. candidates first settles those, and
   * demoting substring matching to a last resort keeps partial names like "deli"
   * working. See ADR 0006.
   */
  resolveLocation(allLocations: SholatLocationRow[], locationInput: string): LocationLookupResult {
    const input = locationInput.trim();
    const query = parseLocationQuery(input || this.defaultLocation);
    const byKey = new Map(allLocations.map((row) => [row.normalizedLocationName, row]));

    const exact = byKey.get(query.exactKey);
    if (exact) return ok({ row: exact });

    // A typed prefix is taken at face value; only bare or glued input gets guesses.
    if (query.form !== 'explicit') {
      const city = byKey.get(query.cityKey);
      if (city) {
        const twin = byKey.get(query.regencyKey);
        return ok(
          twin
            ? {
                row: city,
                note: { kind: 'city_with_regency_twin', regencyName: twin.locationName },
              }
            : { row: city }
        );
      }

      const regency = byKey.get(query.regencyKey);
      if (regency) return ok({ row: regency });
    }

    const fuzzyMatches = allLocations.filter((row) =>
      row.normalizedLocationName.includes(query.exactKey)
    );

    if (fuzzyMatches.length === 1) return ok({ row: fuzzyMatches[0] });

    if (fuzzyMatches.length > 1) {
      const samples = fuzzyMatches.slice(0, 5).map((row) => row.locationName);
      return err({ type: 'ambiguous', input, samples });
    }

    // Last: the input looked like a glued prefix and separating it names a real place.
    if (query.form === 'glued') {
      const split = byKey.get(query.splitKey);
      if (split) return err({ type: 'suggestion', input, suggestion: split.locationName });
    }

    return err({ type: 'notfound', input });
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
      return err(resolved.error);
    }

    let selected = resolved.value;
    const todayDate = this.toDateInTimezone(now);

    const cached = await this.sholatRepository.findDailySchedule(
      selected.row.id,
      todayDate,
      timezone
    );
    if (cached) {
      debug(`🕌 Sholat cache hit for ${selected.row.locationName} on ${todayDate}`);
      return ok({ locationName: selected.row.locationName, schedule: cached, note: selected.note });
    }

    let apiSchedule: Awaited<ReturnType<MyQuranSholatClient['fetchScheduleForDate']>>;

    try {
      apiSchedule = await this.sholatClient.fetchScheduleForDate(selected.row.id, todayDate);
    } catch (fetchErr) {
      if (!(fetchErr instanceof LocationNotFoundError)) throw fetchErr;

      debug(
        `🕌 Suspected stale location id for ${selected.row.locationName}; force-refreshing locations`
      );

      const refreshedLocations = await this.syncLocationCatalog();
      const refreshedResolved = this.resolveLocation(refreshedLocations, locationArg);
      if (!refreshedResolved.ok) {
        return err(refreshedResolved.error);
      }

      selected = refreshedResolved.value;

      const refreshedCached = await this.sholatRepository.findDailySchedule(
        selected.row.id,
        todayDate,
        timezone
      );
      if (refreshedCached) {
        debug(
          `🕌 Sholat cache hit after location refresh for ${selected.row.locationName} on ${todayDate}`
        );
        return ok({
          locationName: selected.row.locationName,
          schedule: refreshedCached,
          note: selected.note,
        });
      }

      apiSchedule = await this.sholatClient.fetchScheduleForDate(selected.row.id, todayDate);
    }

    await this.sholatRepository.upsertDailySchedule({
      locationId: selected.row.id,
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
      `🕌 Sholat cache miss; fetched API for ${selected.row.locationName} on ${apiSchedule.scheduleDate}`
    );

    const persisted = await this.sholatRepository.findDailySchedule(
      selected.row.id,
      apiSchedule.scheduleDate,
      timezone
    );

    if (persisted) {
      return ok({
        locationName: selected.row.locationName,
        schedule: persisted,
        note: selected.note,
      });
    }

    return err({ type: 'persist_error', locationName: selected.row.locationName });
  }

  /**
   * Read-only lookup of today's cached schedule for the default location. Never calls the
   * upstream API — the daily prefetch job is responsible for warming the cache. Returns null
   * when the catalog or today's schedule isn't cached yet.
   */
  async getCachedTodaySchedule(now: Date): Promise<TodaySchedule | null> {
    const timezone = this.defaultTimezone;
    const allLocations = await this.sholatRepository.listLocations();
    const resolved = this.resolveLocation(allLocations, '');
    if (!resolved.ok) return null;

    const todayDate = this.toDateInTimezone(now);
    const schedule = await this.sholatRepository.findDailySchedule(
      resolved.value.row.id,
      todayDate,
      timezone
    );
    if (!schedule) return null;

    return { locationName: resolved.value.row.locationName, schedule };
  }

  async setReminder(params: {
    chatId: string;
    isGroupChat: boolean;
    enabled: boolean;
    now: Date;
  }): Promise<SetReminderOutcome> {
    if (params.enabled && params.isGroupChat && !this.digestGroupIds.includes(params.chatId)) {
      return 'group_not_allowed';
    }

    await this.sholatRepository.setReminderEnabled(
      params.chatId,
      params.enabled,
      params.now.toISOString()
    );

    return params.enabled ? 'enabled' : 'disabled';
  }

  async getReminderStatus(chatId: string): Promise<boolean> {
    return this.sholatRepository.isReminderEnabled(chatId);
  }
}
