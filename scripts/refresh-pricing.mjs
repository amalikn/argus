#!/usr/bin/env node
// Refresh the vendored model pricing table from the LiteLLM public dataset.
//
// WHY VENDORED: the extension is local-first and must never make a network call at runtime (plan section 20). Pricing is therefore a
// build-time asset refreshed by a developer running this script, not something fetched while a user browses sessions. The vendored file
// records where it came from and when, so a stale price is visible rather than silent.
//
// REFERENCE: CodeBurn (https://github.com/getagentseal/codeburn, MIT) solves the same problem for the same agents and normalizes the
// LiteLLM dataset into a compact per-model shape. The normalized field names here follow that shape so the two remain comparable. This
// is an independent implementation of that idea rather than a copy of its code.
//
// SOURCE: https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json (BerriAI/litellm, MIT).
//
// Usage:
//   node scripts/refresh-pricing.mjs            # fetch and write src/pricing/model-pricing.json
//   node scripts/refresh-pricing.mjs --check    # report drift against the vendored file, write nothing, exit 1 if stale
//   node scripts/refresh-pricing.mjs --out PATH # write somewhere else

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_URL = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';
const SOURCE_REPO = 'BerriAI/litellm';
const SOURCE_LICENSE = 'MIT';
const SCHEMA_VERSION = 1;

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT = resolve(HERE, '..', 'src', 'pricing', 'model-pricing.json');

// Modes that represent a conversational agent turn. Embedding, rerank, image and audio models are dropped: no agent transcript this tool
// reads attributes cost to them, and carrying them would roughly double the vendored file for nothing.
const KEEP_MODES = new Set(['chat', 'responses', 'completion']);

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const outIndex = args.indexOf('--out');
const outPath = outIndex >= 0 ? resolve(args[outIndex + 1]) : DEFAULT_OUT;

/**
 * Collect tiered overrides such as input_cost_per_token_above_200k_tokens.
 *
 * Long agent sessions cross these thresholds routinely, so dropping them would understate cost on exactly the sessions a user is most
 * likely to be investigating. They are kept verbatim rather than flattened, because which tier applies depends on per-turn context size
 * that only the parser knows.
 */
function collectTiers(entry) {
  const tiers = {};
  for (const [key, value] of Object.entries(entry)) {
    if (typeof value !== 'number') continue;
    if (/^(input|output|cache_creation_input_token|cache_read_input_token)_cost(_per_token)?_above_.+$/.test(key)) {
      tiers[key] = value;
    }
  }
  return Object.keys(tiers).length ? tiers : undefined;
}

/**
 * Normalize one LiteLLM entry.
 *
 * Returns null for anything without an input price. A model we cannot cost is deliberately ABSENT from the table rather than present
 * with a zero, so the consumer reports unknown instead of free. That distinction is the whole point of the metrics contract in the plan:
 * undefined means the source does not expose it, zero means the source said zero.
 */
function normalize(entry) {
  if (!entry || typeof entry !== 'object') return null;
  if (entry.mode && !KEEP_MODES.has(entry.mode)) return null;
  const input = entry.input_cost_per_token;
  const output = entry.output_cost_per_token;
  if (typeof input !== 'number' || typeof output !== 'number') return null;

  const record = {
    inputCostPerToken: input,
    outputCostPerToken: output,
    provider: entry.litellm_provider ?? 'unknown',
  };

  if (typeof entry.cache_read_input_token_cost === 'number') {
    record.cacheReadCostPerToken = entry.cache_read_input_token_cost;
  }
  // Only ever emitted when the publisher actually publishes it. A derived cache-write price would be a fabricated number wearing the
  // same field name as a real one, which is worse than having no number at all.
  if (typeof entry.cache_creation_input_token_cost === 'number') {
    record.cacheWriteCostPerToken = entry.cache_creation_input_token_cost;
    record.cacheWriteCostIsExplicit = true;
  }
  if (typeof entry.max_input_tokens === 'number') {
    record.maxInputTokens = entry.max_input_tokens;
  }
  const tiers = collectTiers(entry);
  if (tiers) record.tiers = tiers;

  return record;
}

async function fetchSource() {
  const response = await fetch(SOURCE_URL, { headers: { accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`fetch failed: HTTP ${response.status} ${response.statusText}`);
  }
  return { body: await response.text(), etag: response.headers.get('etag') ?? null };
}

async function main() {
  process.stdout.write(`source: ${SOURCE_URL}\n`);
  const { body, etag } = await fetchSource();
  const raw = JSON.parse(body);

  const models = {};
  let skipped = 0;
  for (const [name, entry] of Object.entries(raw)) {
    if (name === 'sample_spec') continue;
    const record = normalize(entry);
    if (record) {
      models[name] = record;
    } else {
      skipped += 1;
    }
  }

  const sorted = Object.fromEntries(Object.keys(models).sort().map((k) => [k, models[k]]));
  const payload = {
    schemaVersion: SCHEMA_VERSION,
    source: { url: SOURCE_URL, repo: SOURCE_REPO, license: SOURCE_LICENSE, etag },
    retrievedAt: new Date().toISOString(),
    upstreamSha256: createHash('sha256').update(body).digest('hex'),
    modelCount: Object.keys(sorted).length,
    models: sorted,
  };
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;

  process.stdout.write(`upstream models: ${Object.keys(raw).length} | kept: ${payload.modelCount} | skipped: ${skipped}\n`);
  process.stdout.write(`vendored size: ${(serialized.length / 1024).toFixed(0)} KB\n`);

  let existing = null;
  try {
    existing = JSON.parse(await readFile(outPath, 'utf8'));
  } catch {
    existing = null;
  }

  if (checkOnly) {
    if (!existing) {
      process.stdout.write('CHECK: no vendored file present, run without --check to create it\n');
      return 1;
    }
    if (existing.upstreamSha256 === payload.upstreamSha256) {
      process.stdout.write(`CHECK: up to date (retrieved ${existing.retrievedAt})\n`);
      return 0;
    }
    const before = new Set(Object.keys(existing.models ?? {}));
    const after = new Set(Object.keys(sorted));
    const added = [...after].filter((m) => !before.has(m));
    const removed = [...before].filter((m) => !after.has(m));
    const repriced = [...after].filter((m) => before.has(m) && JSON.stringify(existing.models[m]) !== JSON.stringify(sorted[m]));
    process.stdout.write(`CHECK: STALE, vendored ${existing.retrievedAt}\n`);
    process.stdout.write(`  added: ${added.length}  removed: ${removed.length}  repriced: ${repriced.length}\n`);
    for (const m of repriced.slice(0, 10)) {
      process.stdout.write(`  repriced: ${m}\n`);
    }
    return 1;
  }

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, serialized, 'utf8');
  process.stdout.write(`wrote ${outPath}\n`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`refresh-pricing failed: ${err.message}\n`);
    process.exit(2);
  },
);
