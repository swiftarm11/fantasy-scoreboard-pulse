// src/utils/strings.ts
export const safeString = (value: unknown, fallback = ''): string => {
  try {
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && (value as any).toString) return (value as any).toString();
    return String(value);
  } catch {
    return fallback;
  }
};

export const safeLower = (value: unknown, fallback = ''): string =>
  safeString(value, fallback).toLowerCase();

export const safeUpper = (value: unknown, fallback = ''): string =>
  safeString(value, fallback).toUpperCase();

export const safeIncludes = (value: unknown, searchString: string, fallback = ''): boolean =>
  safeString(value, fallback).includes(searchString);

export const normalizeNameKey = (name: unknown, team?: unknown, pos?: unknown): string =>
  [safeLower(name), safeLower(team || ''), safeLower(pos || '')].filter(Boolean).join('|');

export const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;