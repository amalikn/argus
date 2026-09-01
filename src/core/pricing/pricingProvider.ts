/**
 * Model pricing resolution for every provider.
 *
 * Replaces the two hardcoded Claude-only tables that upstream carried (finding F5). Those disagreed with each
 * other and with published pricing — `claude-opus-4-6` was hardcoded at 15/75 per million against a published
 * 5/25 — and both silently fell back to Sonnet rates for any unrecognized model, so a Codex or Hermes session
 * would have been costed at Anthropic rates and shown with full confidence.
 *
 * The rule this file exists to enforce: an unknown model produces `undefined`, never a guess and never a zero.
 * See .archcore/rules/undefined-is-not-zero.rule.md and .archcore/specs/pricing-table-contract.spec.md.
 *
 * Data comes from the vendored table, refreshed by `just pricing-refresh`. Nothing here touches the network.
 */

import table from '../../pricing/model-pricing.json';

export interface ModelRates {
  inputCostPerToken: number;
  outputCostPerToken: number;
  provider: string;
  cacheReadCostPerToken?: number;
  cacheWriteCostPerToken?: number;
  /** True only when the publisher publishes a cache-write price. A derived one would be a fabricated number. */
  cacheWriteCostIsExplicit?: boolean;
  maxInputTokens?: number;
  tiers?: Record<string, number>;
}

/** Token counts as a provider reports them. Every field is optional because not every provider reports every one. */
export interface TokenUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

interface PricingTable {
  schemaVersion: number;
  source: { url: string; repo: string; license: string; etag: string | null };
  retrievedAt: string;
  upstreamSha256: string;
  modelCount: number;
  models: Record<string, ModelRates>;
}

const DATA = table as unknown as PricingTable;

/**
 * Model ids appear in transcripts in several shapes. A Bedrock or Vertex deployment prefixes the vendor and
 * suffixes a revision, and a provider may report a dated id where the table carries the alias. Try the exact id
 * first, then progressively looser forms — but never fall through to a DIFFERENT model, which is the upstream
 * defect this class exists to remove.
 */
function candidates(model: string): string[] {
  const out = [model];
  const withoutVendor = model.replace(/^(anthropic|openai|google|us|eu|apac)[./]/, '');
  if (withoutVendor !== model) {
    out.push(withoutVendor);
  }
  const withoutRevision = withoutVendor.replace(/-v\d+:\d+$/, '');
  if (withoutRevision !== withoutVendor) {
    out.push(withoutRevision);
  }
  return out;
}

export class PricingProvider {
  private readonly models: Record<string, ModelRates>;

  constructor(models: Record<string, ModelRates> = DATA.models) {
    this.models = models;
  }

  /** Provenance of the vendored table, so a stale price is visible rather than silent. */
  get source(): { retrievedAt: string; modelCount: number; url: string } {
    return { retrievedAt: DATA.retrievedAt, modelCount: DATA.modelCount, url: DATA.source.url };
  }

  /** Rates for a model, or `undefined` when the model is not in the table. Never another model's rates. */
  getRates(model: string | undefined): ModelRates | undefined {
    if (!model) {
      return undefined;
    }
    for (const candidate of candidates(model)) {
      const hit = this.models[candidate];
      if (hit) {
        return hit;
      }
    }
    return undefined;
  }

  /** Whether cost can be computed at all for this model. Drives the `cost` capability flag. */
  hasPricing(model: string | undefined): boolean {
    return this.getRates(model) !== undefined;
  }

  /**
   * Cost in USD for one usage record.
   *
   * Returns `undefined` when the model is unknown or when the provider reported no usage — the two cases where
   * a number would be an invention. Returns 0 only when the provider genuinely reported zero tokens.
   *
   * Cache-write tokens are charged only when the publisher publishes a cache-write price. Where it does not,
   * those tokens contribute nothing rather than being charged at a guessed multiple of the input rate.
   */
  calculateCost(usage: TokenUsage | undefined, model: string | undefined): number | undefined {
    if (!usage) {
      return undefined;
    }
    const rates = this.getRates(model);
    if (!rates) {
      return undefined;
    }

    const input = usage.input_tokens ?? 0;
    const output = usage.output_tokens ?? 0;
    const cacheRead = usage.cache_read_input_tokens ?? 0;
    const cacheWrite = usage.cache_creation_input_tokens ?? 0;

    let total = input * rates.inputCostPerToken + output * rates.outputCostPerToken;

    if (cacheRead > 0 && rates.cacheReadCostPerToken !== undefined) {
      total += cacheRead * rates.cacheReadCostPerToken;
    }
    if (cacheWrite > 0 && rates.cacheWriteCostPerToken !== undefined) {
      total += cacheWrite * rates.cacheWriteCostPerToken;
    }

    return total;
  }
}

/** Shared instance. The table is a frozen build-time asset, so a single instance is safe to share. */
export const pricing = new PricingProvider();
