import { getUserHour } from './date.js';

// Get a dynamic response based on time of day
export function getTimeBasedResponse(): string {
  const hour = getUserHour();

  if (hour >= 5 && hour < 11) {
    return 'Early grind 💯\nStarting the day right.';
  } else if (hour >= 11 && hour < 16) {
    return 'Midday work 👊\nStaying consistent.';
  } else if (hour >= 16 && hour < 21) {
    return 'After-hours effort 💪\nWay to show up.';
  } else {
    return 'Late session 👀\nThat\'s commitment.';
  }
}

// Get a random item from an array
export function randomChoice<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

// Format weight for display
export function formatWeight(weight: number): string {
  return weight === 0 ? 'bodyweight' : `${weight}kg`;
}
