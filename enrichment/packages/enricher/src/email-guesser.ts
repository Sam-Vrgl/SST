import type { GeminiClient } from './gemini-client.ts';
import type { MasterRecord, EmailPattern } from './types.ts';
import { applyPattern, splitName } from './pattern-parser';
import { matchCompany } from './company-patterns';
import type { CompanyPattern } from './company-patterns';
import { loadPrompt } from './prompt-loader';

const DOMAIN_RE = /^[\w.\-]+\.[a-z]{2,}$/i;
const EMAIL_RE = /[\w.+\-]+@[\w.\-]+\.[a-z]{2,}/i;

export async function guessEmail(
  client: GeminiClient,
  record: MasterRecord,
  patterns: EmailPattern[]
): Promise<string | null> {
  if (!record.affiliation.trim()) return null;

  // Try known company patterns first
  const company = matchCompany(record.affiliation);
  if (company) {
    return guessFromCompanyPattern(client, record, company);
  }

  // Fall back to generic domain lookup + pattern file
  if (patterns.length === 0) return null;
  return guessFromGenericPatterns(client, record, patterns);
}

async function guessFromCompanyPattern(
  client: GeminiClient,
  record: MasterRecord,
  company: CompanyPattern
): Promise<string | null> {
  const raw = (await client.generate(loadPrompt('email-guesser-company', {
    NAME: record.name,
    COMPANY: company.company,
    PATTERN: company.emailStructure,
    EXAMPLE: company.example,
    RULES_LINE: company.rules ? `  Rules   : ${company.rules}` : '',
  }))).trim();
  if (!raw || raw.toUpperCase() === 'NONE') return null;

  const match = raw.match(EMAIL_RE);
  return match ? match[0].toLowerCase() : null;
}

async function guessFromGenericPatterns(
  client: GeminiClient,
  record: MasterRecord,
  patterns: EmailPattern[]
): Promise<string | null> {
  const domain = await lookupDomain(client, record.affiliation);
  if (!domain) return null;

  const { first, last } = splitName(record.name);
  for (const pattern of patterns) {
    const candidate = applyPattern(pattern, first, last, domain);
    if (candidate.includes('@') && candidate.split('@')[1] === domain) {
      return candidate;
    }
  }
  return null;
}

export async function wildGuessEmail(
  client: GeminiClient,
  record: MasterRecord,
): Promise<string | null> {
  const lookupText = record.affiliation.trim() || record.job_title.trim();
  if (!lookupText) return null;
  const domain = await lookupDomain(client, lookupText);
  if (!domain) return null;

  const { first, last } = splitName(record.name);
  const normalize = (s: string) =>
    s.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase().replace(/[^a-z0-9\-]/g, '');
  return `${normalize(first)}.${normalize(last)}@${domain}`;
}

async function lookupDomain(client: GeminiClient, affiliation: string): Promise<string | null> {
  const prompt = loadPrompt('email-guesser-domain', { AFFILIATION: affiliation });

  const raw = (await client.generate(prompt)).trim().toLowerCase();
  if (!raw || raw === 'none' || !DOMAIN_RE.test(raw)) return null;
  return raw;
}
