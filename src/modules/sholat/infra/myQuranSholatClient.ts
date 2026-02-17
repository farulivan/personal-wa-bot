type ApiBaseResponse<T> = {
  status: boolean;
  message: string;
  data: T;
};

type ApiLocation = {
  id: string;
  lokasi: string;
};

type ApiTodaySchedule = {
  tanggal: string;
  imsak: string;
  subuh: string;
  terbit: string;
  dhuha: string;
  dzuhur: string;
  ashar: string;
  maghrib: string;
  isya: string;
};

type ApiTodayData = {
  id: string;
  kabko: string;
  prov: string;
  jadwal: Record<string, ApiTodaySchedule>;
};

export type MyQuranLocation = {
  id: string;
  locationName: string;
};

export type MyQuranTodaySchedule = {
  locationId: string;
  locationName: string;
  province: string;
  scheduleDate: string;
  displayDate: string;
  imsak: string;
  subuh: string;
  terbit: string;
  dhuha: string;
  dzuhur: string;
  ashar: string;
  maghrib: string;
  isya: string;
};

export class MyQuranSholatClient {
  private readonly baseUrl = 'https://api.myquran.com/v3/sholat';

  async fetchAllLocations(): Promise<MyQuranLocation[]> {
    const payload = await this.fetchJson<ApiBaseResponse<ApiLocation[]>>(
      `${this.baseUrl}/kota/all`
    );

    if (!payload.status || !Array.isArray(payload.data)) {
      throw new Error(`Failed to load sholat locations: ${payload.message}`);
    }

    return payload.data.map((row) => ({ id: row.id, locationName: row.lokasi }));
  }

  async fetchTodaySchedule(locationId: string, timezone: string): Promise<MyQuranTodaySchedule> {
    const encodedTimezone = encodeURIComponent(timezone);
    const payload = await this.fetchJson<ApiBaseResponse<ApiTodayData>>(
      `${this.baseUrl}/jadwal/${locationId}/today?tz=${encodedTimezone}`
    );

    if (!payload.status || !payload.data || !payload.data.jadwal) {
      throw new Error(`Failed to load sholat schedule: ${payload.message}`);
    }

    const scheduleDate = Object.keys(payload.data.jadwal)[0];
    if (!scheduleDate) {
      throw new Error('Sholat schedule response did not include today schedule key');
    }

    const schedule = payload.data.jadwal[scheduleDate];

    return {
      locationId: payload.data.id,
      locationName: payload.data.kabko,
      province: payload.data.prov,
      scheduleDate,
      displayDate: schedule.tanggal,
      imsak: schedule.imsak,
      subuh: schedule.subuh,
      terbit: schedule.terbit,
      dhuha: schedule.dhuha,
      dzuhur: schedule.dzuhur,
      ashar: schedule.ashar,
      maghrib: schedule.maghrib,
      isya: schedule.isya,
    };
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`myQuran API error ${res.status}: ${res.statusText}`);
    }

    return (await res.json()) as T;
  }
}
