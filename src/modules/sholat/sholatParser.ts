export function tokenize(firstLine: string): string[] {
  return firstLine.trim().split(/\s+/).filter(Boolean);
}

export function hasFlag(firstLine: string, flag: string): boolean {
  return tokenize(firstLine).some((token) => token.toLowerCase() === `--${flag.toLowerCase()}`);
}

export function extractFlagValue(firstLine: string, flag: string): string {
  const tokens = tokenize(firstLine);
  const lowerFlag = `--${flag.toLowerCase()}`;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const tokenLower = token.toLowerCase();

    if (tokenLower === lowerFlag) {
      const values: string[] = [];
      for (let j = i + 1; j < tokens.length; j++) {
        if (tokens[j].startsWith('--')) break;
        values.push(tokens[j]);
      }
      return values.join(' ').trim();
    }

    if (tokenLower.startsWith(`${lowerFlag}=`)) {
      return token.slice(lowerFlag.length + 1).trim();
    }
  }

  return '';
}

export function normalizeText(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeForMatch(raw: string): string {
  const normalized = normalizeText(raw)
    .replace(/^KABUPATEN\s+/, 'KAB ')
    .replace(/^KAB\s+/, 'KAB ')
    .replace(/^KOTAMADYA\s+/, 'KOTA ')
    .replace(/^KOTA\s+/, 'KOTA ');

  return normalized;
}

export function normalizeUserLocationInput(raw: string): string {
  const compact = raw.trim().replace(/\s+/g, ' ');
  const kabMatch = compact.match(/^kab(?:upaten)?[.\s_-]*(.+)$/i);
  if (kabMatch && kabMatch[1]) {
    return `KAB. ${kabMatch[1].trim().toUpperCase()}`;
  }

  const kotaMatch = compact.match(/^kota[.\s_-]*(.+)$/i);
  if (kotaMatch && kotaMatch[1]) {
    return `KOTA ${kotaMatch[1].trim().toUpperCase()}`;
  }

  return `KOTA ${compact.toUpperCase()}`;
}
