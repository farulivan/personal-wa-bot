import { describe, it, expect, vi, afterEach } from 'vitest';
import { startReminderScheduler } from './remindScheduler.js';

type Deps = Parameters<typeof startReminderScheduler>[0];

function makeDeps(over: { isConnected?: () => boolean; due?: unknown[] } = {}) {
  const claimDueReminders = vi.fn().mockResolvedValue(over.due ?? []);
  const sendMessage = vi.fn().mockResolvedValue(undefined);

  const deps = {
    client: { sendMessage },
    remindRepository: { claimDueReminders },
    userRepository: {
      getDisplayNamesByIds: vi.fn().mockResolvedValue(new Map()),
      getPhoneNumbersByIds: vi.fn().mockResolvedValue(new Map()),
    },
    timezoneOffsetMinutes: 420,
    intervalMs: 60_000,
    isConnected: over.isConnected,
  } as unknown as Deps;

  return { deps, claimDueReminders, sendMessage };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const handles: Array<{ stop: () => void }> = [];
function start(deps: Deps) {
  const handle = startReminderScheduler(deps);
  handles.push(handle);
  return handle;
}

afterEach(() => {
  while (handles.length) handles.pop()?.stop();
});

describe('startReminderScheduler — connection gating', () => {
  it('does not claim reminders while whatsapp is disconnected', async () => {
    const { deps, claimDueReminders } = makeDeps({ isConnected: () => false });

    start(deps);
    await flush();

    // Claiming stamps sent_at and is never retried (ADR 0001), so a claim made
    // while the socket is down destroys the reminder outright.
    expect(claimDueReminders).not.toHaveBeenCalled();
  });

  it('claims reminders once connected', async () => {
    const { deps, claimDueReminders } = makeDeps({ isConnected: () => true });

    start(deps);
    await flush();

    expect(claimDueReminders).toHaveBeenCalledOnce();
  });

  it('claims reminders when no connection check is supplied', async () => {
    const { deps, claimDueReminders } = makeDeps();

    start(deps);
    await flush();

    expect(claimDueReminders).toHaveBeenCalledOnce();
  });

  it('resumes claiming after the connection comes back', async () => {
    let connected = false;
    const { deps, claimDueReminders } = makeDeps({ isConnected: () => connected });

    const handle = start(deps);
    await flush();
    expect(claimDueReminders).not.toHaveBeenCalled();

    connected = true;
    handle.stop();
    const resumed = makeDeps({ isConnected: () => connected });
    start(resumed.deps);
    await flush();

    expect(resumed.claimDueReminders).toHaveBeenCalledOnce();
  });
});
