export interface MasterRecord {
  name: string;
  email: string;
  email_status: string;
  job_title: string;
  affiliation: string;
  paper_url: string;
  source_files: string;
}

export type EnrichmentMethod = 'online' | 'pattern' | 'wild-guess' | 'none';

export interface EnrichedRecord extends MasterRecord {
  email_enrichment_method: EnrichmentMethod;
  institution: string;
  keywords: string;
}

export interface RecordResult {
  enriched_email: string;
  email_enrichment_method: EnrichmentMethod;
  institution: string;
  keywords: string;
}

export interface FinalStats {
  total: number;
  enriched: number;
  emailsFoundOnline: number;
  emailsGuessed: number;
  affiliationsClassified: number;
  tagged: number;
}

export type ProgressEventType = 'start' | 'record' | 'complete' | 'error';

export interface ProgressEvent {
  type: ProgressEventType;
  index?: number;
  total?: number;
  name?: string;
  result?: RecordResult;
  stats?: FinalStats;
  message?: string;
}

export interface EmailPattern {
  template: string;
  tokens: string[];
}

export interface MergeInput {
  filename: string;
  content: string;
}

export interface MergeStats {
  total: number;
  byFile: { name: string; count: number }[];
  sure: number;
  inferred: number;
  noEmail: number;
  unrecognised: string[];
}

export interface EnrichmentConfig {
  masterCsvContent?: string;
  masterRecords?: MasterRecord[];
  patternsTxtContent: string;
  companyCsvContent?: string;
  onProgress: (event: ProgressEvent) => void;
}
