import { describe, it, expect } from 'vitest';
import { registerWorkoutModule } from './index.js';
import type { WorkoutModuleDeps } from './index.js';
import type { WorkoutRepository } from './infra/workoutRepository.js';
import type { UserRepository } from '../users/infra/userRepository.js';
import type { GroupMembershipPort, MessageSenderPort } from '../../adapters/whatsapp/ports.js';

function makeDeps(overrides: Partial<WorkoutModuleDeps> = {}): WorkoutModuleDeps {
  return {
    workoutRepository: {} as WorkoutRepository,
    userRepository: {} as UserRepository,
    senderPort: {} as MessageSenderPort,
    membershipPort: {} as GroupMembershipPort,
    timezoneOffsetMinutes: 420,
    digestGroupIds: [],
    dailyDigestHour: 8,
    dailyDigestMinute: 0,
    monthlyDigestHour: 8,
    monthlyDigestMinute: 0,
    minWorkoutsForStreak: 3,
    workoutListLimit: 10,
    ...overrides,
  };
}

describe('registerWorkoutModule digest jobs', () => {
  it('registers no jobs when no groups are configured', () => {
    const { jobs } = registerWorkoutModule(makeDeps({ digestGroupIds: [] }));
    expect(jobs).toHaveLength(0);
  });

  it('registers a daily and monthly job per group with unique names', () => {
    const groupIds = ['120363a@g.us', '120363b@g.us'];
    const { jobs } = registerWorkoutModule(makeDeps({ digestGroupIds: groupIds }));

    expect(jobs).toHaveLength(4);

    const names = jobs.map((job) => job.name);
    expect(new Set(names).size).toBe(names.length);

    for (const groupId of groupIds) {
      expect(names).toContain(`Daily Workout Leaderboard · ${groupId}`);
      expect(names).toContain(`Monthly Workout Recap · ${groupId}`);
    }
  });

  it('marks the monthly job to fire on day 1', () => {
    const { jobs } = registerWorkoutModule(makeDeps({ digestGroupIds: ['g@g.us'] }));
    const monthly = jobs.find((job) => job.name.startsWith('Monthly Workout Recap'));
    expect(monthly?.dayOfMonth).toBe(1);
  });
});
