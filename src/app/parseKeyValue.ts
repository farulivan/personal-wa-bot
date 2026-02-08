export function parseKeyValue(text: string): Record<string, string> {
  const lines = text.split('\n').slice(1);
  const data: Record<string, string> = {};

  for (const line of lines) {
    const [key, value] = line.split(':').map(s => s.trim());
    if (key && value) {
      data[key] = value;
    }
  }

  return data;
}
