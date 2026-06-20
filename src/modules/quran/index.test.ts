import { describe, it, expect } from 'vitest';
import { registerQuranModule } from './index.js';
import type { QuranModuleDeps } from './index.js';
import type { QuranRepository } from './infra/quranRepository.js';
import type { UserRepository } from '../users/infra/userRepository.js';
import type { GroupMembershipPort, MessageSenderPort } from '../../adapters/whatsapp/ports.js';

function makeDeps(overrides: Partial<QuranModuleDeps> = {}): QuranModuleDeps {
  return {
    quranRepository: {} as QuranRepository,
    userRepository: {} as UserRepository,
    membershipPort: {} as GroupMembershipPort,
    senderPort: {} as MessageSenderPort,
    timezoneOffsetMinutes: 420,
    digestGroupIds: [],
    quranReminderHour: 22,
    quranReminderMinute: 0,
    monthlyDigestHour: 8,
    monthlyDigestMinute: 0,
    quranListLimit: 10,
    ramadhanCountEnabled: false,
    ramadhanStartDate: '',
    ramadhanEndDate: '',
    ...overrides,
  };
}

describe('registerQuranModule digest jobs', () => {
  it('registers no jobs when no groups are configured', () => {
    const { jobs } = registerQuranModule(makeDeps({ digestGroupIds: [] }));
    expect(jobs).toHaveLength(0);
  });

  it('registers a nightly reminder and monthly recap per group with unique names', () => {
    const groupIds = ['120363a@g.us', '120363b@g.us'];
    const { jobs } = registerQuranModule(makeDeps({ digestGroupIds: groupIds }));

    expect(jobs).toHaveLength(4);

    const names = jobs.map((job) => job.name);
    expect(new Set(names).size).toBe(names.length);

    for (const groupId of groupIds) {
      expect(names).toContain(`Quran Night Reminder · ${groupId}`);
      expect(names).toContain(`Monthly Quran Recap · ${groupId}`);
    }
  });

  it('marks the monthly recap to fire on day 1', () => {
    const { jobs } = registerQuranModule(makeDeps({ digestGroupIds: ['g@g.us'] }));
    const monthly = jobs.find((job) => job.name.startsWith('Monthly Quran Recap'));
    expect(monthly?.dayOfMonth).toBe(1);
  });
});
