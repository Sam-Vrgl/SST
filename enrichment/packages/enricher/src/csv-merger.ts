import { parse } from 'csv-parse/sync';
import type { MasterRecord, MergeInput, MergeStats } from './types.ts';

interface FileConfig {
  pattern: RegExp;
  fileKey: string;
  getEmail: (row: Record<string, string>) => string;
  getName: (row: Record<string, string>) => string;
  getJobTitle: (row: Record<string, string>) => string;
  getAffiliation: (row: Record<string, string>) => string;
  getEmailStatus: (row: Record<string, string>) => string;
  getPaperUrl: (row: Record<string, string>) => string;
}

const FILE_CONFIGS: FileConfig[] = [
  {
    pattern: /google-results/i,
    fileKey: 'google',
    getEmail: () => '',
    getName: (row) => (row['name'] || '').split(' - ')[0].trim(),
    getJobTitle: (row) => {
      const parts = (row['name'] || '').split(' - ');
      return parts.length > 1 ? parts.slice(1).join(' - ').trim() : '';
    },
    getAffiliation: (row) => (row['company/institution'] || '').trim(),
    getEmailStatus: () => '',
    getPaperUrl: () => '',
  },
  {
    pattern: /^Intervenants/i,
    fileKey: 'intervenants',
    getEmail: (row) => (row['Email'] || '').trim().toLowerCase(),
    getName: (row) => (row['Nom'] || '').trim(),
    getJobTitle: () => '',
    getAffiliation: (row) => (row['Affiliation'] || '').trim(),
    getEmailStatus: (row) => (row['Statut_Source'] || '').trim(),
    getPaperUrl: () => '',
  },
  {
    pattern: /PMC/i,
    fileKey: 'pmc',
    getEmail: (row) => (row['Email'] || '').trim().toLowerCase(),
    getName: (row) => (row['Author'] || '').trim(),
    getJobTitle: () => '',
    getAffiliation: (row) => (row['Institution'] || '').trim(),
    getEmailStatus: () => 'Identifié',
    getPaperUrl: (row) => (row['Paper URL'] || '').trim(),
  },
];

function isValidEmail(email: string): boolean {
  return Boolean(email) && email.toLowerCase() !== 'null' && email.includes('@');
}

function getConfig(filename: string): FileConfig | null {
  return FILE_CONFIGS.find(c => c.pattern.test(filename)) ?? null;
}

export function mergeFiles(inputs: MergeInput[]): { records: MasterRecord[]; stats: MergeStats } {
  const records: MasterRecord[] = [];
  const byFile: { name: string; count: number }[] = [];
  const unrecognised: string[] = [];
  let sure = 0, inferred = 0, noEmail = 0;

  for (const { filename, content } of inputs) {
    const config = getConfig(filename);
    if (!config) {
      unrecognised.push(filename);
      continue;
    }

    const stripped = content.replace(/^﻿/, '');
    const rows = parse(stripped, {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
    }) as Record<string, string>[];

    const displayName = filename.replace(/\.csv$/i, '');
    byFile.push({ name: displayName, count: rows.length });

    for (const row of rows) {
      const rawEmail = config.getEmail(row);
      const email = isValidEmail(rawEmail) ? rawEmail : '';
      const emailStatus = config.getEmailStatus(row);
      const email_status = emailStatus && (config.fileKey === 'intervenants' || Boolean(email))
        ? emailStatus
        : '';

      const record: MasterRecord = {
        name: config.getName(row),
        email,
        email_status,
        job_title: config.getJobTitle(row),
        affiliation: config.getAffiliation(row),
        paper_url: config.getPaperUrl(row),
        source_files: displayName,
      };

      records.push(record);

      if (!email) noEmail++;
      else if (emailStatus === 'Identifié') sure++;
      else inferred++;
    }
  }

  return {
    records,
    stats: { total: records.length, byFile, sure, inferred, noEmail, unrecognised },
  };
}
