import type { GeminiClient } from './gemini-client.ts';
import type { MasterRecord } from './types.ts';
import { loadPrompt } from './prompt-loader';

const EMAIL_RE = /[\w.+\-]+@[\w.\-]+\.[a-z]{2,}/i;

export async function findEmailOnline(
  client: GeminiClient,
  record: MasterRecord
): Promise<string | null> {
  const prompt = buildPrompt(record);
  const raw = await client.generateWithSearch(prompt);
  const text = raw.trim();

  if (!text || text.toUpperCase() === 'NONE') return null;

  const match = text.match(EMAIL_RE);
  return match ? match[0].toLowerCase() : null;
}

function buildPrompt(record: MasterRecord): string {
  const contextLines: string[] = [];
  if (record.affiliation) contextLines.push(`Their affiliation is: "${record.affiliation}".`);
  if (record.job_title) contextLines.push(`Their job title is: "${record.job_title}".`);
  if (record.paper_url) contextLines.push(`A paper they authored: ${record.paper_url}`);
  return loadPrompt('email-finder', {
    NAME: record.name,
    CONTEXT: contextLines.join('\n'),
  });
}
