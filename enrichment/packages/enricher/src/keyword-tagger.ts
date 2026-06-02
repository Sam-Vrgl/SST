import { readFileSync } from 'fs';
import { join } from 'path';
import type { GeminiClient } from './gemini-client.ts';
import type { MasterRecord } from './types.ts';
import { loadPrompt } from './prompt-loader';

let _keywords: string[] | null = null;

export function loadKeywords(): string[] {
  if (_keywords) return _keywords;

  const raw = readFileSync(join(import.meta.dir, 'keywords.json'), 'utf-8');
  const data = JSON.parse(raw) as Record<string, string[]>;
  _keywords = Object.values(data).flat();
  return _keywords;
}

export async function tagKeywords(
  client: GeminiClient,
  record: MasterRecord
): Promise<string[]> {
  const keywords = loadKeywords();
  if (keywords.length === 0) return [];

  const contextLines: string[] = [];
  if (record.name) contextLines.push(`Researcher: ${record.name}`);
  if (record.affiliation) contextLines.push(`Affiliation: ${record.affiliation}`);
  if (record.job_title) contextLines.push(`Job title: ${record.job_title}`);
  if (record.paper_url) contextLines.push(`Paper URL: ${record.paper_url}`);

  const prompt = loadPrompt('keyword-tagger', {
    CONTEXT: contextLines.join('\n'),
    KEYWORDS: keywords.join('\n'),
  });

  const useSearch = /^https?:\/\//i.test(record.paper_url);
  const raw = useSearch
    ? await client.generateWithSearch(prompt, { silent: true })
    : await client.generate(prompt, { silent: true });

  const text = raw.trim();
  if (!text || text.toUpperCase() === 'NONE') return [];

  return text
    .split(',')
    .map(k => k.trim())
    .filter(k => keywords.includes(k))
    .slice(0, 5);
}
