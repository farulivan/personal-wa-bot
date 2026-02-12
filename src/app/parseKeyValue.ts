const KEY_ALIASES: Record<string, string> = {
  weights: 'weight',
};

export function parseKeyValue(text: string): Record<string, string> {
  const lines = text.split('\n').slice(1);
  const data: Record<string, string> = {};

  for (const line of lines) {
    const [rawKey, value] = line.split(':').map(s => s.trim());
    if (rawKey && value) {
      const key = KEY_ALIASES[rawKey.toLowerCase()] || rawKey.toLowerCase();
      data[key] = value;
    }
  }

  return data;
}
