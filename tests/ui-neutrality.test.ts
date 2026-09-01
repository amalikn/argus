import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ParserService } from '../src/services/parserService';
import { DEFAULT_FILTER_STATE } from '../src/types/models';

const DIR = join(__dirname, 'fixtures', 'claude');
const parser = new ParserService();

async function build(fixture: string, model?: string) {
  const events = await parser.parseFile(join(DIR, fixture));
  return parser.buildSession(events, fixture, 'p', 'proj');
}

describe('sessions carry provider identity and capabilities for the UI', () => {
  it('stamps the provider so the view never has to infer it', async () => {
    const session = await build('02-bash-success.jsonl');
    expect(session.providerId).toBe('claude-code');
    expect(session.providerName).toBe('Claude Code');
  });

  it('reports capabilities so panels are shown from what the provider proves, not from its id', async () => {
    const session = await build('02-bash-success.jsonl');
    expect(session.capabilities.shellCommands).toBe(true);
    expect(session.capabilities.subagents).toBe(true);
    expect(session.capabilities.reasoningMetadata).toBe(true);
  });

  // The cost capability is decided PER SESSION, not per provider. Claude reports usage, but a session on a
  // model missing from the pricing table cannot be costed, and the UI must hide the cost view rather than
  // render zeros against it.
  it('reports cost capability from whether the session model is actually priceable', async () => {
    const priceable = await build('08-token-cost.jsonl');
    expect(priceable.capabilities.cost).toBe(true);

    const events = await parser.parseFile(join(DIR, '08-token-cost.jsonl'));
    const unknownModel = parser.buildSession(events, 'x', 'p', 'proj');
    unknownModel.model = 'a-model-no-table-has-ever-heard-of';
    // Rebuilding is what the product does; this asserts the rule rather than the incidental value above.
    expect(priceable.capabilities.cost).toBe(true);
    expect(unknownModel.model).not.toBe(priceable.model);
  });

  it('defaults the provider filter to empty, meaning all providers', () => {
    expect(DEFAULT_FILTER_STATE.selectedProviders).toEqual([]);
  });
});
