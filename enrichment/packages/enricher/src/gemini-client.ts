import { GoogleGenAI } from '@google/genai';
import { RateLimiter } from './rate-limiter';
import type { Logger } from './logger';

const MODEL = 'gemini-2.5-flash-lite';

export class GeminiClient {
  private ai: GoogleGenAI;
  private limiter: RateLimiter;
  private logger?: Logger;

  constructor(apiKey: string, minGapMs = 500, logger?: Logger) {
    this.ai = new GoogleGenAI({ apiKey });
    this.limiter = new RateLimiter(minGapMs);
    this.logger = logger;
  }

  async generate(prompt: string, options?: { silent?: boolean }): Promise<string> {
    await this.limiter.wait();
    if (!options?.silent) this.logger?.request('generate', prompt);
    const response = await this.ai.models.generateContent({
      model: MODEL,
      contents: prompt,
    });
    const text = response.text ?? '';
    if (!options?.silent) this.logger?.response('generate', text);
    return text;
  }

  async generateWithSearch(prompt: string, options?: { silent?: boolean }): Promise<string> {
    await this.limiter.wait();
    if (!options?.silent) this.logger?.request('search', prompt);
    const response = await this.ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });
    const text = response.text ?? '';
    if (!options?.silent) this.logger?.response('search', text);
    return text;
  }
}
