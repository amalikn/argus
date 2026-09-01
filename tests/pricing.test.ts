import { describe, expect, it } from 'vitest';
import { PricingProvider, pricing } from '../src/core/pricing/pricingProvider';

describe('PricingProvider', () => {
  it('carries the provenance of the vendored table', () => {
    expect(pricing.source.modelCount).toBeGreaterThan(1000);
    expect(pricing.source.url).toContain('litellm');
    expect(Date.parse(pricing.source.retrievedAt)).not.toBeNaN();
  });

  it('resolves a known model to published rates', () => {
    const rates = pricing.getRates('claude-sonnet-4-5-20250929')!;
    expect(rates.inputCostPerToken * 1e6).toBeCloseTo(3, 6);
    expect(rates.outputCostPerToken * 1e6).toBeCloseTo(15, 6);
  });

  // The specific defect from finding F5: upstream hardcoded opus-4-6 at 15/75 per million, a threefold
  // overstatement against the published 5/25.
  it('prices opus-4-6 at the published rate, not the upstream hardcoded one', () => {
    const rates = pricing.getRates('claude-opus-4-6')!;
    expect(rates.inputCostPerToken * 1e6).toBeCloseTo(5, 6);
    expect(rates.outputCostPerToken * 1e6).toBeCloseTo(25, 6);
  });

  it('prices non-Anthropic models too', () => {
    expect(pricing.getRates('gpt-5.5')).toBeDefined();
  });

  // This is the whole reason the class exists. Upstream returned Sonnet rates here, with no signal to the user.
  it('returns undefined for an unknown model rather than another model rates', () => {
    expect(pricing.getRates('some-model-that-does-not-exist')).toBeUndefined();
    expect(pricing.calculateCost({ input_tokens: 1000, output_tokens: 1000 }, 'some-model-that-does-not-exist'))
      .toBeUndefined();
    expect(pricing.hasPricing('some-model-that-does-not-exist')).toBe(false);
  });

  it('returns undefined when the provider reported no usage at all', () => {
    expect(pricing.calculateCost(undefined, 'claude-sonnet-4-5-20250929')).toBeUndefined();
  });

  it('returns zero, not undefined, when the provider reported zero tokens', () => {
    expect(pricing.calculateCost({ input_tokens: 0, output_tokens: 0 }, 'claude-sonnet-4-5-20250929')).toBe(0);
  });

  it('charges cache reads at the published cache rate', () => {
    const model = 'claude-sonnet-4-5-20250929';
    const rates = pricing.getRates(model)!;
    const cost = pricing.calculateCost({ cache_read_input_tokens: 1_000_000 }, model)!;
    expect(cost).toBeCloseTo(rates.cacheReadCostPerToken! * 1_000_000, 9);
  });

  it('does not charge cache writes when no cache-write price is published', () => {
    const custom = new PricingProvider({
      'no-cache-write': { inputCostPerToken: 1e-6, outputCostPerToken: 2e-6, provider: 'test' },
    });
    expect(custom.calculateCost({ cache_creation_input_tokens: 1_000_000 }, 'no-cache-write')).toBe(0);
  });

  it('resolves vendor-prefixed and revision-suffixed deployment ids', () => {
    expect(pricing.getRates('anthropic.claude-opus-4-1-20250805-v1:0')).toBeDefined();
  });

  it('never resolves one model to a different model rates', () => {
    const sonnet = pricing.getRates('claude-sonnet-4-5-20250929')!;
    const unknown = pricing.getRates('claude-sonnet-9-9-99999999');
    expect(unknown).not.toEqual(sonnet);
    expect(unknown).toBeUndefined();
  });
});
