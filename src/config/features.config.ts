// Feature flags configuration
// Enable/disable features here

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

export const featuresConfig = {
  // Workout tracking feature
  workout: {
    enabled: parseBoolean(process.env.FEATURE_WORKOUT, true),
    listLimit: Number(process.env.WORKOUT_LIST_LIMIT) || 10,
  },

  // Future features - disabled by default
  notes: {
    enabled: parseBoolean(process.env.FEATURE_NOTES, false),
  },

  todo: {
    enabled: parseBoolean(process.env.FEATURE_TODO, false),
  },

  reminder: {
    enabled: parseBoolean(process.env.FEATURE_REMINDER, false),
  },
} as const;

export type FeatureName = keyof typeof featuresConfig;

export function isFeatureEnabled(feature: FeatureName): boolean {
  return featuresConfig[feature].enabled;
}
