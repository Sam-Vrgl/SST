import { parseMasterCsv } from './csv-reader';
import { serializeEnrichedCsv } from './csv-writer';
import { parsePatterns } from './pattern-parser';
import { GeminiClient } from './gemini-client';
import { findEmailOnline } from './email-finder';
import { guessEmail, wildGuessEmail } from './email-guesser';
import { resolveInstitution } from './affiliation-classifier';
import { tagKeywords } from './keyword-tagger';
import { Logger } from './logger';
import type {
  EnrichedRecord,
  EnrichmentConfig,
  EnrichmentMethod,
  FinalStats,
} from './types.ts';

export type { EnrichedRecord, EnrichmentConfig, FinalStats, MasterRecord, MergeInput, MergeStats, ProgressEvent } from './types.ts';
export { serializeEnrichedCsv, serializeMasterCsv } from './csv-writer';
export { mergeFiles } from './csv-merger';

export async function runEnrichment(config: EnrichmentConfig): Promise<EnrichedRecord[]> {
  const { patternsTxtContent, onProgress } = config;

  const records = config.masterRecords ?? parseMasterCsv(config.masterCsvContent ?? '');
  const patterns = parsePatterns(patternsTxtContent);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY environment variable is not set');

  const logger = new Logger();
  const client = new GeminiClient(apiKey, 500, logger);
  const results: EnrichedRecord[] = [];

  const stats: FinalStats = {
    total: records.length,
    enriched: 0,
    emailsFoundOnline: 0,
    emailsGuessed: 0,
    affiliationsClassified: 0,
    tagged: 0,
  };

  onProgress({ type: 'start', total: records.length });

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const needsEmail = !record.email
      || record.email.toLowerCase() === 'null'
      || record.email.includes('(guessed)')
      || !/^[\w.+\-]+@[\w.\-]+\.[a-z]{2,}$/i.test(record.email.trim());

    const hasNoEmail = !record.email || record.email.toLowerCase() === 'null';

    let enriched_email = '';
    let email_enrichment_method: EnrichmentMethod = 'none';
    let institution = '';
    let foundKeywords: string[] = [];

    try {
      const emailTask = async () => {
        if (!needsEmail) return;
        const found = await findEmailOnline(client, record);
        if (found) {
          enriched_email = found;
          email_enrichment_method = 'online';
          stats.emailsFoundOnline++;
          stats.enriched++;
          return;
        }
        const guessed = await guessEmail(client, record, patterns);
        if (guessed) {
          enriched_email = guessed;
          email_enrichment_method = 'pattern';
          stats.emailsGuessed++;
          stats.enriched++;
        }
      };

      const institutionTask = async () => {
        if (!record.affiliation) return;
        institution = await resolveInstitution(client, record.affiliation);
        if (institution) stats.affiliationsClassified++;
      };

      const keywordsTask = async () => {
        if (process.env.SKIP_KEYWORDS === 'true') return;
        foundKeywords = await tagKeywords(client, record);
        if (foundKeywords.length > 0) stats.tagged++;
      };

      await Promise.all([emailTask(), institutionTask(), keywordsTask()]);

      if (process.env.WILD_GUESS === 'true' && hasNoEmail && !enriched_email) {
        const guessed = await wildGuessEmail(client, record);
        if (guessed) {
          enriched_email = guessed;
          email_enrichment_method = 'wild-guess';
          stats.enriched++;
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.recordError(i, record.name, message);
      onProgress({ type: 'error', index: i, name: record.name, message });
    }

    logger.enriched(i, record.name, {
      email: enriched_email,
      method: email_enrichment_method,
      institution,
    });

    const enrichedRecord: EnrichedRecord = {
      ...record,
      email: enriched_email || record.email,
      email_status: enriched_email ? email_enrichment_method : record.email_status,
      email_enrichment_method,
      institution,
      keywords: foundKeywords.join(', '),
    };

    results.push(enrichedRecord);

    onProgress({
      type: 'record',
      index: i,
      total: records.length,
      name: record.name,
      result: {
        enriched_email,
        email_enrichment_method,
        institution,
        keywords: foundKeywords.join(', '),
      },
    });
  }

  onProgress({ type: 'complete', stats });
  return results;
}
