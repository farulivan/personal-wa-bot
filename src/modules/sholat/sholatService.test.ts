import { describe, it, expect, beforeEach } from 'vitest';
import { SholatService } from './sholatService.js';
import type {
  SholatRepository,
  SholatLocationRow,
  NewSholatLocation,
  NewSholatDailySchedule,
  SholatDailyScheduleRow,
} from './infra/sholatRepository.js';
import {
  LocationNotFoundError,
  UpstreamUnavailableError,
  type MyQuranSholatClient,
  type MyQuranLocation,
  type MyQuranTodaySchedule,
} from './infra/myQuranSholatClient.js';

const LOCATIONS: MyQuranLocation[] = [
  { id: '1301', locationName: 'KOTA JAKARTA' },
  { id: '1302', locationName: 'KAB. BOGOR' },
  { id: '1303', locationName: 'KOTA BOGOR' },
  { id: '1304', locationName: 'KOTA BANDUNG' },
];

function makeSchedule(locationId: string): MyQuranTodaySchedule {
  return {
    locationId,
    locationName: 'Test',
    province: 'Test',
    scheduleDate: '2026-04-08',
    displayDate: 'Rabu, 08 Apr 2026',
    imsak: '04:30',
    subuh: '04:40',
    terbit: '05:50',
    dhuha: '06:15',
    dzuhur: '11:55',
    ashar: '15:10',
    maghrib: '17:50',
    isya: '19:00',
  };
}

class InMemorySholatRepository implements SholatRepository {
  locations: SholatLocationRow[] = [];
  schedules: SholatDailyScheduleRow[] = [];

  async countLocations(): Promise<number> {
    return this.locations.length;
  }

  async upsertLocations(rows: NewSholatLocation[]): Promise<void> {
    for (const row of rows) {
      const idx = this.locations.findIndex((l) => l.id === row.id);
      const locationRow = {
        id: row.id,
        locationName: row.locationName,
        normalizedLocationName: row.normalizedLocationName,
      };
      if (idx >= 0) {
        this.locations[idx] = locationRow;
      } else {
        this.locations.push(locationRow);
      }
    }
  }

  async listLocations(): Promise<SholatLocationRow[]> {
    return this.locations;
  }

  async findDailySchedule(
    locationId: string,
    scheduleDate: string,
    timezone: string
  ): Promise<SholatDailyScheduleRow | null> {
    return (
      this.schedules.find(
        (s) =>
          s.locationId === locationId && s.scheduleDate === scheduleDate && s.timezone === timezone
      ) ?? null
    );
  }

  async upsertDailySchedule(row: NewSholatDailySchedule): Promise<void> {
    const scheduleRow: SholatDailyScheduleRow = {
      locationId: row.locationId,
      scheduleDate: row.scheduleDate,
      timezone: row.timezone,
      displayDate: row.displayDate,
      imsak: row.imsak,
      subuh: row.subuh,
      terbit: row.terbit,
      dhuha: row.dhuha,
      dzuhur: row.dzuhur,
      ashar: row.ashar,
      maghrib: row.maghrib,
      isya: row.isya,
    };
    const idx = this.schedules.findIndex(
      (s) =>
        s.locationId === row.locationId &&
        s.scheduleDate === row.scheduleDate &&
        s.timezone === row.timezone
    );
    if (idx >= 0) {
      this.schedules[idx] = scheduleRow;
    } else {
      this.schedules.push(scheduleRow);
    }
  }

  reminderSettings = new Map<string, { enabled: boolean; createdAt: string; updatedAt: string }>();

  async setReminderEnabled(chatId: string, enabled: boolean, nowIso: string): Promise<void> {
    const existing = this.reminderSettings.get(chatId);
    this.reminderSettings.set(chatId, {
      enabled,
      createdAt: existing?.createdAt ?? nowIso,
      updatedAt: nowIso,
    });
  }

  async isReminderEnabled(chatId: string): Promise<boolean> {
    return this.reminderSettings.get(chatId)?.enabled ?? false;
  }

  async listEnabledReminderChats(): Promise<string[]> {
    return [...this.reminderSettings.entries()]
      .filter(([, value]) => value.enabled)
      .map(([chatId]) => chatId);
  }
}

class MockSholatClient implements Pick<
  MyQuranSholatClient,
  'fetchAllLocations' | 'fetchTodaySchedule'
> {
  fetchAllLocationsCalls = 0;
  fetchTodayScheduleCalls = 0;
  private nextFetchError: Error | null = null;

  async fetchAllLocations(): Promise<MyQuranLocation[]> {
    this.fetchAllLocationsCalls++;
    return LOCATIONS;
  }

  async fetchTodaySchedule(locationId: string): Promise<MyQuranTodaySchedule> {
    this.fetchTodayScheduleCalls++;
    if (this.nextFetchError) {
      const err = this.nextFetchError;
      this.nextFetchError = null; // only throw once
      throw err;
    }
    return makeSchedule(locationId);
  }

  simulateNextFetchLocationNotFound(): void {
    this.nextFetchError = new LocationNotFoundError('Schedule unavailable for location');
  }

  simulateNextFetchUpstreamUnavailable(): void {
    this.nextFetchError = new UpstreamUnavailableError('myQuran API error 503');
  }
}

describe('SholatService', () => {
  let repo: InMemorySholatRepository;
  let client: MockSholatClient;
  let service: SholatService;

  const now = new Date('2026-04-08T10:00:00Z');
  const defaultLocation = 'KAB. BOGOR';
  const defaultTimezone = 'Asia/Jakarta';

  beforeEach(() => {
    repo = new InMemorySholatRepository();
    client = new MockSholatClient();
    service = new SholatService(
      repo,
      client as unknown as MyQuranSholatClient,
      defaultLocation,
      defaultTimezone
    );
  });

  describe('ensureLocationCatalog', () => {
    it('fetches locations when catalog is empty', async () => {
      await service.ensureLocationCatalog();
      expect(client.fetchAllLocationsCalls).toBe(1);
      expect(repo.locations).toHaveLength(LOCATIONS.length);
    });

    it('skips fetch when catalog already populated', async () => {
      await service.ensureLocationCatalog();
      await service.ensureLocationCatalog();
      expect(client.fetchAllLocationsCalls).toBe(1);
    });
  });

  describe('resolveLocation', () => {
    it('finds exact match', async () => {
      await service.ensureLocationCatalog();
      const result = service.resolveLocation(repo.locations, 'KAB. BOGOR');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBe('1302');
      }
    });

    it('finds fuzzy match when only one result', async () => {
      await service.ensureLocationCatalog();
      const result = service.resolveLocation(repo.locations, 'bandung');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBe('1304');
      }
    });

    it('returns ambiguous error when multiple fuzzy matches', async () => {
      // Add locations that share a common substring not matching any exact normalized form
      repo.locations.push(
        { id: '2001', locationName: 'KAB. TANGERANG', normalizedLocationName: 'KAB TANGERANG' },
        {
          id: '2002',
          locationName: 'KOTA TANGERANG SELATAN',
          normalizedLocationName: 'KOTA TANGERANG SELATAN',
        }
      );
      // "tangerang" normalizes to "KOTA TANGERANG" via normalizeUserLocationInput,
      // then normalizeForMatch gives "KOTA TANGERANG". Exact match on KOTA TANGERANG
      // fails (only KOTA TANGERANG SELATAN exists). Fuzzy .includes("KOTA TANGERANG")
      // matches both entries.
      const result = service.resolveLocation(repo.locations, 'tangerang');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('ambiguous');
      }
    });

    it('returns not found for unknown location', async () => {
      await service.ensureLocationCatalog();
      const result = service.resolveLocation(repo.locations, 'atlantis');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('notfound');
      }
    });

    it('uses default location when input is empty', async () => {
      await service.ensureLocationCatalog();
      const result = service.resolveLocation(repo.locations, '');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBe('1302'); // KAB. BOGOR
      }
    });
  });

  describe('getTodaySchedule', () => {
    it('fetches from API on cache miss and caches result', async () => {
      const result = await service.getTodaySchedule('bandung', now);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.schedule.subuh).toBe('04:40');
      }
      expect(client.fetchTodayScheduleCalls).toBe(1);

      // Second call should hit cache
      client.fetchTodayScheduleCalls = 0;
      const cached = await service.getTodaySchedule('bandung', now);
      expect(cached.ok).toBe(true);
      expect(client.fetchTodayScheduleCalls).toBe(0);
    });

    it('uses default location when no location arg given', async () => {
      const result = await service.getTodaySchedule('', now);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.locationName).toBe('KAB. BOGOR');
      }
    });

    it('refreshes location catalog on LocationNotFoundError and retries', async () => {
      // Pre-populate catalog
      await service.ensureLocationCatalog();
      const initialFetchCalls = client.fetchAllLocationsCalls;

      // Simulate stale location ID surfacing as a typed not-found error
      client.simulateNextFetchLocationNotFound();
      const result = await service.getTodaySchedule('bandung', now);

      expect(result.ok).toBe(true);
      // Should have re-fetched locations after the typed error
      expect(client.fetchAllLocationsCalls).toBe(initialFetchCalls + 1);
    });

    it('rethrows UpstreamUnavailableError without refreshing the catalog', async () => {
      await service.ensureLocationCatalog();
      const initialFetchCalls = client.fetchAllLocationsCalls;

      client.simulateNextFetchUpstreamUnavailable();

      await expect(service.getTodaySchedule('bandung', now)).rejects.toBeInstanceOf(
        UpstreamUnavailableError
      );
      // No catalog refresh — only LocationNotFoundError triggers that path
      expect(client.fetchAllLocationsCalls).toBe(initialFetchCalls);
    });

    it('returns not found when location does not exist', async () => {
      const result = await service.getTodaySchedule('atlantis', now);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('notfound');
      }
    });
  });
});
