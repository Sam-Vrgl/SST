import { readFileSync } from 'fs';
import { join } from 'path';

export function loadPrompt(name: string, vars: Record<string, string> = {}): string {
  const text = readFileSync(join(import.meta.dir, 'prompts', `${name}.txt`), 'utf-8');
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}
