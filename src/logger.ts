// Debug logging utility
// Set DEBUG=true in environment to enable debug logs

const DEBUG = process.env.DEBUG === 'true' || process.env.DEBUG === '1';

export function debug(...args: unknown[]): void {
  if (DEBUG) {
    console.log(...args);
  }
}

export function debugError(...args: unknown[]): void {
  if (DEBUG) {
    console.error(...args);
  }
}

// Always log these (critical events)
export function log(...args: unknown[]): void {
  console.log(...args);
}

export function error(...args: unknown[]): void {
  console.error(...args);
}
