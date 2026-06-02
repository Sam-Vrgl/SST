import { appendFileSync } from 'fs';

function ts(): string {
  return new Date().toISOString();
}

function truncate(text: string, max = 300): string {
  const single = text.replace(/\n/g, ' ').trim();
  return single.length > max ? `${single.slice(0, max)}…` : single;
}

export class Logger {
  private readonly enabled: boolean;
  private readonly logFile: string | null;

  constructor() {
    this.enabled = process.env.LOG_ENABLED !== 'false';
    this.logFile = process.env.LOG_FILE ?? null;
  }

  private write(line: string): void {
    if (!this.enabled) return;
    console.log(line);
    if (this.logFile) {
      try {
        appendFileSync(this.logFile, line + '\n', 'utf-8');
      } catch {
        // don't crash enrichment over a logging failure
      }
    }
  }

  request(type: 'generate' | 'search', prompt: string): void {
    this.write(`[${ts()}] → GEMINI(${type}) ${truncate(prompt)}`);
  }

  response(type: 'generate' | 'search', raw: string): void {
    this.write(`[${ts()}] ← GEMINI(${type}) ${truncate(raw)}`);
  }

  enriched(
    index: number,
    name: string,
    result: { email: string; method: string; institution: string },
  ): void {
    const parts: string[] = [`[${ts()}] ✓ [${index + 1}] ${name}`];
    if (result.email) parts.push(`email=${result.email} (${result.method})`);
    if (result.institution) parts.push(`institution=${result.institution}`);
    if (!result.email && !result.institution) parts.push('no enrichment');
    this.write(parts.join('  '));
  }

  recordError(index: number, name: string, message: string): void {
    this.write(`[${ts()}] ✗ [${index + 1}] ${name}  ${message}`);
  }
}
