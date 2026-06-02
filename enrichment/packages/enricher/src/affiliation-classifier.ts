import type { GeminiClient } from './gemini-client.ts';
import { loadPrompt } from './prompt-loader';

export async function resolveInstitution(
  client: GeminiClient,
  affiliation: string
): Promise<string> {
  if (!affiliation.trim()) return '';

  const prompt = loadPrompt('affiliation-classifier', { AFFILIATION: affiliation });

  const raw = (await client.generate(prompt)).trim();
  return raw === 'Unknown' ? '' : raw;
}
