const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');

const cliArgs = Object.fromEntries(
  process.argv.slice(2).filter(a => a.startsWith('--')).map(a => a.slice(2).split('='))
);
const ENTRY_DIR = cliArgs.dir ? path.resolve(cliArgs.dir) : path.join(__dirname, 'Entry');
const OUTPUT_FILE = cliArgs.out ? path.resolve(cliArgs.out) : path.join(__dirname, 'master.csv');

// namePriority: lower = preferred canonical name source
const FILE_CONFIGS = [
  {
    pattern: /google-results/i,
    fileKey: 'google',
    hasEmail: false,
    namePriority: 3,
    getEmail: () => null,
    getName: (row) => (row['name'] || '').split(' - ')[0].trim(),
    getJobTitle: (row) => {
      const parts = (row['name'] || '').split(' - ');
      return parts.length > 1 ? parts.slice(1).join(' - ').trim() : '';
    },
    getAffiliation: () => '',
    getEmailStatus: () => '',
    getPaperUrl: () => '',
  },
  {
    pattern: /^Intervenants/i,
    fileKey: 'intervenants',
    hasEmail: true,
    namePriority: 1,
    getEmail: (row) => (row['Email'] || '').trim().toLowerCase(),
    getName: (row) => (row['Nom'] || '').trim(),
    getJobTitle: () => '',
    getAffiliation: (row) => (row['Affiliation'] || '').trim(),
    getEmailStatus: (row) => (row['Statut_Source'] || '').trim(),
    getPaperUrl: () => '',
  },
  {
    pattern: /PMC/i,
    fileKey: 'pmc',
    hasEmail: true,
    namePriority: 2,
    getEmail: (row) => (row['Email'] || '').trim().toLowerCase(),
    getName: (row) => (row['Author'] || '').trim(),
    getJobTitle: () => '',
    getAffiliation: (row) => (row['Institution'] || '').trim(),
    getEmailStatus: () => 'Identifié',
    getPaperUrl: (row) => (row['Paper URL'] || '').trim(),
  },
];

const OUTPUT_COLUMNS = ['name', 'email', 'email_status', 'job_title', 'affiliation', 'paper_url', 'source_files'];

function normalizeName(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isValidEmail(email) {
  return Boolean(email) && email.toLowerCase() !== 'null' && email.includes('@');
}

function getConfig(filename) {
  return FILE_CONFIGS.find((c) => c.pattern.test(filename)) || null;
}

function emptyRecord() {
  return {
    _sourceFiles: new Set(),
    _canonicalEmail: null,
    _canonicalName: '',
    _namePriority: 999,
    name: '',
    email: '',
    email_status: '',
    job_title: '',
    _affiliation: '',   // from Intervenants
    _institution: '',   // from PMC
    paper_url: '',
  };
}

function mergeInto(record, row, config, displayName) {
  // Name: use highest-priority source
  const rawName = config.getName(row);
  if (rawName && config.namePriority < record._namePriority) {
    record.name = rawName;
    record._namePriority = config.namePriority;
  } else if (rawName && !record.name) {
    record.name = rawName;
    record._namePriority = config.namePriority;
  }

  // Email: first valid value wins
  const rawEmail = config.getEmail(row);
  const canonicalEmail = isValidEmail(rawEmail) ? rawEmail : null;
  if (canonicalEmail) {
    if (!record.email) {
      record.email = canonicalEmail;
    } else if (record.email !== canonicalEmail) {
      process.stderr.write(
        `Warning: Email conflict for "${record.name}": "${record.email}" vs "${canonicalEmail}" — keeping first\n`
      );
    }
  }

  // Email status: always capture intervenant's Statut_Source (even when email is NULL/missing);
  // PMC sets "Identifié" only when a valid email is present and status not yet set.
  const emailStatus = config.getEmailStatus(row);
  if (emailStatus && !record.email_status) {
    if (config.fileKey === 'intervenants' || canonicalEmail) {
      record.email_status = emailStatus;
    }
  }

  // Job title: from Google name extraction
  const jobTitle = config.getJobTitle(row);
  if (jobTitle && !record.job_title) {
    record.job_title = jobTitle;
  }

  // Affiliation: track per-source so we can deduplicate later
  const affil = config.getAffiliation(row);
  if (affil) {
    if (config.fileKey === 'intervenants' && !record._affiliation) record._affiliation = affil;
    if (config.fileKey === 'pmc' && !record._institution) record._institution = affil;
  }

  // Paper URL: only PMC
  const paperUrl = config.getPaperUrl(row);
  if (paperUrl && !record.paper_url) record.paper_url = paperUrl;

  record._sourceFiles.add(displayName);
}

function computeAffiliation(record) {
  const a = record._affiliation;
  const b = record._institution;
  if (!a && !b) return '';
  if (!a) return b;
  if (!b) return a;
  // Deduplicate if normalized values match
  if (normalizeName(a) === normalizeName(b)) return a;
  return a + ' / ' + b;
}

function main() {
  const filenames = fs.readdirSync(ENTRY_DIR).filter((f) => f.endsWith('.csv'));

  const files = filenames
    .map((name) => ({ name, config: getConfig(name) }))
    .filter(({ name, config }) => {
      if (!config) {
        process.stderr.write(`Warning: No config matched for file "${name}" — skipping\n`);
        return false;
      }
      return true;
    });

  // Process email-having files first so nameToKey is populated before Google
  files.sort((a, b) => (b.config.hasEmail ? 1 : 0) - (a.config.hasEmail ? 1 : 0));

  const mergeIndex = new Map(); // emailKey or canonicalName -> record
  const nameToKey = new Map();  // canonicalName -> key in mergeIndex

  for (const { name, config } of files) {
    const content = fs.readFileSync(path.join(ENTRY_DIR, name), 'utf8');
    const rows = parse(content, {
      columns: true,
      skip_empty_lines: true,
      bom: true,
      relax_column_count: true,
      trim: true,
    });

    for (const row of rows) {
      const rawEmail = config.getEmail(row);
      const canonicalEmail = isValidEmail(rawEmail) ? rawEmail : null;
      const rawName = config.getName(row);
      const canonicalName = normalizeName(rawName);

      // Determine lookup key: email > existing name match > name
      let key;
      if (canonicalEmail) {
        key = canonicalEmail;
      } else if (nameToKey.has(canonicalName)) {
        key = nameToKey.get(canonicalName);
      } else {
        key = canonicalName;
      }

      if (!mergeIndex.has(key)) {
        const record = emptyRecord();
        record._canonicalEmail = canonicalEmail;
        record._canonicalName = canonicalName;
        mergeIndex.set(key, record);
      }

      mergeInto(mergeIndex.get(key), row, config, name.replace(/\.csv$/i, ''));

      if (!nameToKey.has(canonicalName)) {
        nameToKey.set(canonicalName, key);
      }
    }
  }

  const output = [...mergeIndex.values()].map((record) => ({
    name: record.name,
    email: record.email,
    email_status: record.email_status,
    job_title: record.job_title,
    affiliation: computeAffiliation(record),
    paper_url: record.paper_url,
    source_files: [...record._sourceFiles].join(', '),
  }));

  const csv = stringify(output, { header: true, columns: OUTPUT_COLUMNS });
  fs.writeFileSync(OUTPUT_FILE, '﻿' + csv, 'utf8'); // BOM for Excel compatibility
  console.log(`Done. ${output.length} records written to ${OUTPUT_FILE}`);
}

main();
