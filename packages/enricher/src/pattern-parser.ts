import type { EmailPattern } from './types.ts';

export function parsePatterns(content: string): EmailPattern[] {
  return content
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith('#'))
    .map(template => {
      const tokens = [...template.matchAll(/\{(\w+)\}/g)].map(m => m[1]);
      return { template, tokens };
    });
}

export function parseKeywords(content: string): string[] {
  return content
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith('#'));
}

export function applyPattern(
  pattern: EmailPattern,
  first: string,
  last: string,
  domain: string
): string {
  return pattern.template
    .replace('{first}', first.toLowerCase())
    .replace('{last}', last.toLowerCase())
    .replace('{firstinitial}', (first[0] ?? '').toLowerCase())
    .replace('{lastinitial}', (last[0] ?? '').toLowerCase())
    .replace('{domain}', domain.toLowerCase());
}

export function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: parts[0] };
  return { first: parts[0], last: parts[parts.length - 1] };
}
