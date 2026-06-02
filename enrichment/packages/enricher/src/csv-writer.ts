import { stringify } from 'csv-stringify/sync';
import type { EnrichedRecord, MasterRecord } from './types.ts';

const COLUMNS = [
  'name', 'email', 'email_status', 'job_title', 'affiliation',
  'paper_url', 'source_files', 'email_enrichment_method',
  'institution', 'keywords',
];

export function serializeEnrichedCsv(records: EnrichedRecord[]): string {
  // BOM ensures Excel and other tools read the file as UTF-8
  return '﻿' + stringify(records, { header: true, columns: COLUMNS });
}

const MASTER_COLUMNS = [
  'name', 'email', 'email_status', 'job_title', 'affiliation', 'paper_url', 'source_files',
];

export function serializeMasterCsv(records: MasterRecord[]): string {
  return '﻿' + stringify(records, { header: true, columns: MASTER_COLUMNS });
}
