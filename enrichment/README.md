# CSV Enricher

AI-powered post-processing for the CSV Merger output. Takes `master.csv` and enriches each researcher record with missing emails, a resolved institution name, and topic keywords — all via Gemini AI.

---

## Setup

**Prerequisites:** [Bun](https://bun.sh) installed, a [Google AI Studio](https://aistudio.google.com) API key.

```bash
cd enrichment
bun install
cp .env.example .env
# Edit .env and set GEMINI_API_KEY=your_key_here
bun dev
# → http://localhost:3001
```

---

## How it works

Each record from `master.csv` goes through a 4-step pipeline. All AI calls use **Gemini 2.0 Flash Lite** with a 500 ms rate-limit gap between requests.

### 1 — Email finder (online search)

Only runs for records that have no email. Uses Gemini with **Google Search grounding** to look up the researcher's institutional email on the web. The prompt provides name, affiliation, job title, and paper URL as context. Gemini's response is regex-filtered to extract a valid email address.

Result tagged as `email_enrichment_method = online`.

### 2 — Email guesser (pattern-based fallback)

If the online search finds nothing, the guesser runs. It first checks whether the researcher's affiliation matches a **known pharma/company** in `Formatted_Email_Structure.csv` (Johnson & Johnson, Roche, Pfizer, GSK, etc.). If matched, Gemini is given the company's exact email pattern, an example, and any special rules (composed names, particles like "de", middle initials) and asked to generate the address.

If no company is matched, Gemini is asked for the institution's email domain, then the templates in `data/email-patterns.txt` are applied (`{first}.{last}@{domain}`, `{firstinitial}{last}@{domain}`, etc.).

Result tagged as `email_enrichment_method = pattern`.

### 3 — Institution resolver

Runs for every record that has a non-empty `affiliation` field. Gemini is given the raw affiliation text (e.g. `"Department of Oncology, University of Leeds, UK"`) and asked to return only the canonical institution name (`"University of Leeds"`). The result goes into the `institution` column.

### 4 — Keyword tagger

Runs for every record. Keywords are baked into `packages/enricher/src/keywords.json` (~150 terms across 8 biology categories: Cancer Types, Tumor Biology, Immunology, Cell Signaling, Adipose/Metabolic, Genomics, Experimental Techniques, Clinical). The keyword list is split into chunks of 50 and sent to Gemini alongside the researcher's name, affiliation, job title, and paper URL. For records with a paper URL, Google Search grounding is enabled so Gemini can retrieve the abstract. Matched keywords are returned as a comma-separated list in the `keywords` column.

---

## Output

The enriched file adds four columns to the original seven:

| Column | Description |
|--------|-------------|
| `enriched_email` | Email found or guessed (empty if already had one or none found) |
| `email_enrichment_method` | `online`, `pattern`, or `none` |
| `institution` | Canonical institution name extracted from `affiliation` |
| `keywords` | Comma-separated matched keywords |

Download as `enriched_master.csv` from the UI when processing is complete.

---

## Input files

| File | Required | Description |
|------|----------|-------------|
| `master.csv` | Yes | Output from the CSV Merger |
| `email-patterns.txt` | Optional | Custom pattern templates — uses `data/email-patterns.txt` if omitted |

The keyword list and known-company email structures are server-side only and cannot be overridden from the UI.

---

## Project layout

```
enrichment/
├── apps/web/          Bun HTTP server + browser UI
├── packages/enricher/ Core enrichment logic + Gemini client
│   └── src/
│       ├── keywords.json               Baked-in keyword list
│       └── Formatted_Email_Structure.csv  Known pharma email patterns
└── data/
    └── email-patterns.txt             Generic fallback patterns
```
