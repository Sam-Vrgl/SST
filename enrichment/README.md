# Researcher Enrichment Pipeline

AI-powered two-step pipeline that merges heterogeneous researcher CSV exports, then enriches each record with a found/guessed email, a canonical institution name, and topic keywords — all via **Gemini 2.5 Flash Lite**.

---

## Setup

**Prerequisites:** [Bun](https://bun.sh) installed, a [Google AI Studio](https://aistudio.google.com) API key.

### Windows — `start.bat` (recommended)

Double-click `start.bat` in the `enrichment/` folder. It will:

1. Check that Bun is installed (prints an error and pauses if not found).
2. Run `bun install` to install dependencies.
3. Launch `start.ts`, which:
   - Creates a `.env` file on first run — you will be **prompted in the terminal to paste your Gemini API key** if the file does not exist yet.
   - Reads the `PORT` from `.env` (default `3001`).
   - Starts the server and **automatically opens `http://localhost:3001` in your browser** after ~2.5 seconds.

On subsequent runs `start.bat` skips the API key prompt (`.env` already exists) and goes straight to starting the server.

> If Bun is not recognised, install it from [bun.sh](https://bun.sh), then open a new terminal so `PATH` is updated before double-clicking `start.bat` again.

### Manual (any platform)

```bash
cd enrichment
bun install
cp .env.example .env
# Edit .env — set GEMINI_API_KEY=your_key_here
bun dev
# → http://localhost:3001
```

---

## Pipeline overview

```
Source CSVs (3 accepted formats)
        │
        ▼
  ┌─────────────┐
  │  Step 1     │  Merge & deduplicate → master.csv   (7 columns)
  │  Merge      │
  └──────┬──────┘
         │
         ▼
  ┌─────────────┐
  │  Step 2     │  AI enrichment       → enriched_master.csv   (11 columns)
  │  Enrich     │  (4 sub-steps, 500 ms rate-limit between Gemini calls)
  └─────────────┘
```

---

## Step 1 — Merge

Upload one or more source CSVs. The merger recognises three file types by filename pattern, normalises their columns, validates emails, and deduplicates rows by researcher name.

### Accepted input files

#### `google-results*.csv`

Exported from a Google search scrape. Recognised columns (case-sensitive):

| Column | Used as |
|--------|---------|
| `name` | `name` (text before ` — ` separator) |
| `company/institution` | `affiliation` |
| `name` (after ` — `) | `job_title` |

All other columns are ignored. No `email` field — records from this source always start with an empty email.

#### `Intervenants*.csv`

Conference or event attendee export. Recognised columns:

| Column | Used as |
|--------|---------|
| `Nom` | `name` |
| `Email` | `email` |
| `Affiliation` | `affiliation` |
| `Statut_Source` | `email_status` |

#### `*PMC*.csv`

PubMed Central author export. Recognised columns:

| Column | Used as |
|--------|---------|
| `Author` | `name` |
| `Email` | `email` |
| `Institution` | `affiliation` |
| `Paper URL` | `paper_url` |

---

### Output — `master.csv` (7 columns)

| # | Column | Type | Description |
|---|--------|------|-------------|
| 1 | `name` | string | Full researcher name |
| 2 | `email` | string | Email address, or empty if absent/invalid |
| 3 | `email_status` | string | `Identifié` (confirmed), `inferred`, or empty |
| 4 | `job_title` | string | Job title from google-results, or empty |
| 5 | `affiliation` | string | Raw institution / company text |
| 6 | `paper_url` | string | Paper URL from PMC, or empty |
| 7 | `source_files` | string | Originating filename(s) |

An email is treated as **confirmed** (`Identifié`) when it comes from an Intervenants or PMC file. It is marked **inferred** when present but from a lower-confidence source. Records from google-results always start with an empty email and `email_status`.

Emails that do not contain `@` or are the literal string `"null"` are discarded and the field is left empty.

After merging, the UI shows a breakdown: **total records · confirmed emails · inferred emails · no email**.

---

## Step 2 — Enrich

Click **Enrich with Gemini AI** to process `master.csv`. Optionally upload a custom `email-patterns.txt` to override the default pattern templates. Each record goes through four parallel sub-steps; progress streams live to the browser.

### 2a — Email Finder (online search)

Runs only when a record has no valid email.

Gemini is called with **Google Search grounding**, given the researcher's name plus any available context (affiliation, job title, paper URL), and asked to return a confirmed institutional email. The response is regex-filtered; anything that does not match a valid email format is discarded.

Result: `email_enrichment_method = online`

### 2b — Email Guesser (pattern-based fallback)

Runs if 2a returns nothing.

1. **Company match** — checks whether `affiliation` matches one of 18+ known pharma/biotech companies in `Formatted_Email_Structure.csv` (AbbVie, AstraZeneca, Bayer, Boehringer Ingelheim, Bristol Myers Squibb, Eli Lilly, Gilead Sciences, GSK, Johnson & Johnson, Merck, Novartis, Pfizer, Roche, Sanofi, Servier, Takeda, …). If matched, Gemini is given the company's exact email pattern, an example address, and any special formatting rules (composed names, particles like "de", middle initials) and asked to generate the address.

2. **Generic domain + templates** — if no company matches, Gemini is asked for the institution's email domain, then the seven templates in `data/email-patterns.txt` are applied in order (`{first}.{last}@{domain}`, `{firstinitial}{last}@{domain}`, etc.) until a valid candidate is produced.

Result: `email_enrichment_method = pattern`

If neither sub-step finds anything, `email_enrichment_method = none`.

### 2c — Institution Resolver

Runs for every record that has a non-empty `affiliation`.

Gemini is given the raw affiliation text and asked to return only the canonical institution name:

| Raw affiliation | `institution` output |
|-----------------|----------------------|
| `Department of Oncology, University of Leeds, UK` | `University of Leeds` |
| `Institut Curie, Paris, France` | `Institut Curie` |
| `MSD Oncology, Merck` | `MSD` |
| `AP-HP, Hôpital Saint-Louis` | `AP-HP` |

If Gemini cannot determine a specific institution the field is set to `Unknown`.

### 2d — Keyword Tagger

Runs for every record (disable with `SKIP_KEYWORDS=true`).

~150 biology keywords from `keywords.json` are split into chunks of 50 and sent to Gemini alongside researcher context. When a `paper_url` is present, Google Search grounding is enabled so Gemini can retrieve the abstract. Up to five matching keywords are returned as a comma-separated string.

**Keyword categories:** Cancer Types · Tumor Biology · Immunology · Cell Signaling · Adipose/Metabolic · Genomics · Experimental Techniques · Clinical

---

### Output — `enriched_master.csv` (11 columns)

The original seven columns are preserved unchanged. Four columns are appended:

| # | Column | Type | Values | Description |
|---|--------|------|--------|-------------|
| 1–7 | *(original)* | | | All columns from `master.csv` |
| 8 | `email` | string | | Updated with found/guessed address if previously empty |
| 9 | `email_enrichment_method` | enum | `online` · `pattern` · `wild-guess` · `none` | How the email was obtained |
| 10 | `institution` | string | | Canonical institution name |
| 11 | `keywords` | string | | Up to 5 comma-separated keywords |

After enrichment, the UI shows a summary: **total · enriched (online) · enriched (pattern) · institutions resolved · records tagged**.

---

## Optional inputs

| File | Required | Description |
|------|----------|-------------|
| Source CSVs | Yes (Step 1) | One or more of the three accepted formats |
| `email-patterns.txt` | No (Step 2) | Custom generic email templates; falls back to `data/email-patterns.txt` |

The keyword list and known-company email patterns are server-side only and cannot be overridden from the UI (company patterns can be provided as an upload if the server is configured to accept them).

---

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GEMINI_API_KEY` | Yes | — | Google AI Studio API key |
| `PORT` | No | `3001` | HTTP server port |
| `SKIP_KEYWORDS` | No | `false` | Set `true` to skip keyword tagging |
| `WILD_GUESS` | No | `false` | Set `true` to enable a last-resort email guess when no pattern matches |
| `LOG_ENABLED` | No | `true` | Set `false` to silence logging |
| `LOG_FILE` | No | — | Path to write a log file (console only if omitted) |

---

## Project layout

```
enrichment/
├── apps/
│   └── web/                  Bun HTTP server + browser UI
│       └── src/
│           ├── server.ts     API routes + SSE progress stream
│           └── public/
│               └── index.html  Single-page UI
├── packages/
│   └── enricher/             Core library
│       └── src/
│           ├── index.ts                     Pipeline orchestrator
│           ├── types.ts                     TypeScript interfaces
│           ├── csv-merger.ts                Step 1 merge logic
│           ├── csv-reader.ts                Parse master.csv
│           ├── csv-writer.ts                Serialise output CSVs
│           ├── email-finder.ts              Step 2a — online search
│           ├── email-guesser.ts             Step 2b — pattern guesser
│           ├── affiliation-classifier.ts    Step 2c — institution resolver
│           ├── keyword-tagger.ts            Step 2d — keyword tagger
│           ├── company-patterns.ts          Load & match pharma patterns
│           ├── pattern-parser.ts            Parse email template strings
│           ├── gemini-client.ts             Gemini API wrapper
│           ├── rate-limiter.ts              500 ms inter-call throttle
│           ├── logger.ts                    Console + file logging
│           ├── prompts/                     Gemini prompt templates
│           ├── keywords.json                ~150 baked-in biology keywords
│           └── Formatted_Email_Structure.csv  Known pharma email patterns
└── data/
    └── email-patterns.txt    Generic fallback email templates (7 patterns)
```
