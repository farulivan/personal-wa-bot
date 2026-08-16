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
  // KAB. PIDIE JAYA is the sibling that used to win the substring match (#58).
  { id: '1305', locationName: 'KAB. PIDIE' },
  { id: '1306', locationName: 'KAB. PIDIE JAYA' },
  // A real name whose bare form starts with prefix letters.
  { id: '1307', locationName: 'KAB. KOTABARU' },
  // A row carrying no administrative prefix at all.
  { id: '1308', locationName: 'PULAU TAMBELAN KAB. BINTAN' },
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
  'fetchAllLocations' | 'fetchScheduleForDate'
> {
  fetchAllLocationsCalls = 0;
  fetchScheduleCalls = 0;
  private nextFetchError: Error | null = null;

  async fetchAllLocations(): Promise<MyQuranLocation[]> {
    this.fetchAllLocationsCalls++;
    return LOCATIONS;
  }

  async fetchScheduleForDate(locationId: string, dateStr: string): Promise<MyQuranTodaySchedule> {
    this.fetchScheduleCalls++;
    if (this.nextFetchError) {
      const err = this.nextFetchError;
      this.nextFetchError = null; // only throw once
      throw err;
    }
    return { ...makeSchedule(locationId), scheduleDate: dateStr };
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
  const digestGroupId = '120363MAINGROUP@g.us';

  beforeEach(() => {
    repo = new InMemorySholatRepository();
    client = new MockSholatClient();
    service = new SholatService(
      repo,
      client as unknown as MyQuranSholatClient,
      defaultLocation,
      defaultTimezone,
      [digestGroupId]
    );
  });

  describe('reminder settings', () => {
    const dmChat = '628111111111@c.us';
    const otherGroup = '120363OTHERGROUP@g.us';

    it('enables reminders for a DM chat', async () => {
      const outcome = await service.setReminder({
        chatId: dmChat,
        isGroupChat: false,
        enabled: true,
        now,
      });
      expect(outcome).toBe('enabled');
      expect(await service.getReminderStatus(dmChat)).toBe(true);
      expect(await repo.listEnabledReminderChats()).toEqual([dmChat]);
    });

    it('enables reminders in the configured main group', async () => {
      const outcome = await service.setReminder({
        chatId: digestGroupId,
        isGroupChat: true,
        enabled: true,
        now,
      });
      expect(outcome).toBe('enabled');
      expect(await service.getReminderStatus(digestGroupId)).toBe(true);
    });

    it('enables reminders in any of several configured groups', async () => {
      const secondGroupId = '120363SECONDGROUP@g.us';
      const multiGroupService = new SholatService(
        repo,
        client as unknown as MyQuranSholatClient,
        defaultLocation,
        defaultTimezone,
        [digestGroupId, secondGroupId]
      );

      const outcome = await multiGroupService.setReminder({
        chatId: secondGroupId,
        isGroupChat: true,
        enabled: true,
        now,
      });
      expect(outcome).toBe('enabled');
      expect(await multiGroupService.getReminderStatus(secondGroupId)).toBe(true);
    });

    it('refuses to enable in a non-main group and does not persist', async () => {
      const outcome = await service.setReminder({
        chatId: otherGroup,
        isGroupChat: true,
        enabled: true,
        now,
      });
      expect(outcome).toBe('group_not_allowed');
      expect(await service.getReminderStatus(otherGroup)).toBe(false);
      expect(await repo.listEnabledReminderChats()).toEqual([]);
    });

    it('disables reminders for any chat', async () => {
      await service.setReminder({ chatId: dmChat, isGroupChat: false, enabled: true, now });
      const outcome = await service.setReminder({
        chatId: dmChat,
        isGroupChat: false,
        enabled: false,
        now,
      });
      expect(outcome).toBe('disabled');
      expect(await service.getReminderStatus(dmChat)).toBe(false);
      expect(await repo.listEnabledReminderChats()).toEqual([]);
    });

    it('refuses group enable when no main group is configured', async () => {
      const noGroupService = new SholatService(
        repo,
        client as unknown as MyQuranSholatClient,
        defaultLocation,
        defaultTimezone,
        []
      );
      const outcome = await noGroupService.setReminder({
        chatId: otherGroup,
        isGroupChat: true,
        enabled: true,
        now,
      });
      expect(outcome).toBe('group_not_allowed');
    });
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
        expect(result.value.row.id).toBe('1302');
      }
    });

    it('resolves a bare name to its KOTA row', async () => {
      await service.ensureLocationCatalog();
      const result = service.resolveLocation(repo.locations, 'bandung');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.row.id).toBe('1304');
        expect(result.value.note).toBeUndefined();
      }
    });

    it('prefers an exact regency over its longer sibling', async () => {
      // The regression this whole change exists for: "pidie" used to fall through
      // to substring matching and tie with KAB. PIDIE JAYA, so a correctly-typed
      // name came back as ambiguous.
      await service.ensureLocationCatalog();
      const result = service.resolveLocation(repo.locations, 'pidie');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.row.locationName).toBe('KAB. PIDIE');
        expect(result.value.note).toEqual({ kind: 'resolved_to_regency' });
      }
    });

    it('prefers the city and flags the regency twin', async () => {
      await service.ensureLocationCatalog();
      const result = service.resolveLocation(repo.locations, 'bogor');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.row.locationName).toBe('KOTA BOGOR');
        expect(result.value.note).toEqual({
          kind: 'city_with_regency_twin',
          regencyName: 'KAB. BOGOR',
        });
      }
    });

    it('resolves a real name that merely starts with the prefix letters', async () => {
      // KAB. KOTABARU would be unreachable if "glued" short-circuited.
      await service.ensureLocationCatalog();
      const result = service.resolveLocation(repo.locations, 'kotabaru');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.row.locationName).toBe('KAB. KOTABARU');
    });

    it('resolves a row that carries no administrative prefix', async () => {
      await service.ensureLocationCatalog();
      const result = service.resolveLocation(repo.locations, 'pulau tambelan kab. bintan');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.row.id).toBe('1308');
    });

    it('suggests the separated form for a glued prefix', async () => {
      await service.ensureLocationCatalog();
      const result = service.resolveLocation(repo.locations, 'kabbogor');
      expect(result.ok).toBe(false);
      if (!result.ok && result.error.type === 'suggestion') {
        expect(result.error.suggestion).toBe('KAB. BOGOR');
      } else {
        throw new Error('expected a suggestion');
      }
    });

    it('does not split a name that only looks prefixed', async () => {
      await service.ensureLocationCatalog();
      const result = service.resolveLocation(repo.locations, 'kabanjahe');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.type).toBe('notfound');
    });

    it('still resolves a unique partial name via the fuzzy fallback', async () => {
      await service.ensureLocationCatalog();
      const result = service.resolveLocation(repo.locations, 'tambelan');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.row.id).toBe('1308');
    });

    it('returns ambiguous when a partial name matches several rows', async () => {
      // "pidi" is not an exact city or regency, so it reaches the fuzzy fallback
      // and hits both KAB. PIDIE and KAB. PIDIE JAYA.
      await service.ensureLocationCatalog();
      const result = service.resolveLocation(repo.locations, 'pidi');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.type).toBe('ambiguous');
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
        expect(result.value.row.id).toBe('1302'); // KAB. BOGOR
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
      expect(client.fetchScheduleCalls).toBe(1);

      // Second call should hit cache
      client.fetchScheduleCalls = 0;
      const cached = await service.getTodaySchedule('bandung', now);
      expect(cached.ok).toBe(true);
      expect(client.fetchScheduleCalls).toBe(0);
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
