import { parse } from 'csv-parse/sync';
import type { MasterRecord } from './types.ts';

export function parseMasterCsv(content: string): MasterRecord[] {
  const stripped = content.replace(/^﻿/, '');
  const rows = parse(stripped, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as Record<string, string>[];

  return rows.map(row => ({
    name: row['name'] ?? '',
    email: row['email'] ?? '',
    email_status: row['email_status'] ?? '',
    job_title: row['job_title'] ?? '',
    affiliation: row['affiliation'] ?? '',
    paper_url: row['paper_url'] ?? '',
    source_files: row['source_files'] ?? '',
  }));
}
