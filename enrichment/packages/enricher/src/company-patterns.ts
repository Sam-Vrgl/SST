import { parse } from 'csv-parse/sync';
import { readFileSync } from 'fs';
import { join } from 'path';

export interface CompanyPattern {
  company: string;
  emailStructure: string;
  example: string;
  rules: string;
}

let _patterns: CompanyPattern[] | null = null;

export function loadCompanyPatterns(): CompanyPattern[] {
  if (_patterns) return _patterns;

  const csvPath = join(import.meta.dir, 'Formatted_Email_Structure.csv');
  const raw = readFileSync(csvPath, 'utf-8');

  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];

  _patterns = rows
    .map(r => ({
      company: r['Company Name'] ?? '',
      emailStructure: r['Email structure'] ?? '',
      example: r['example'] ?? '',
      rules: r['Rules'] ?? '',
    }))
    .filter(p => p.company && p.emailStructure);

  return _patterns;
}

export function matchCompany(affiliation: string): CompanyPattern | null {
  const patterns = loadCompanyPatterns();
  const needle = affiliation.toLowerCase();

  for (const p of patterns) {
    // Match any significant word of the company name against the affiliation text
    const companyWords = p.company
      .toLowerCase()
      .replace(/[()]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3);

    if (companyWords.some(word => needle.includes(word))) {
      return p;
    }
  }
  return null;
}
