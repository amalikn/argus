/**
 * The vocabulary every adapter uses to say WHY a session produced the events it produced.
 *
 * This exists because of a defect found on 20260902. Six Codex rollouts — complete, well formed, up to 1.9 MB, 1,546 records —
 * parsed to zero events and reported `empty-session: "no parseable records in rollout"`. That sentence was true and useless,
 * because it described the parser's result rather than the file. It collapsed two states that a reader must be able to tell apart:
 *
 *     the source contains nothing        ≠        the parser understood nothing
 *
 * An adapter returning nothing and a session containing nothing render the same empty screen. Nothing in a static suite can
 * separate them: 156 tests and 298 governance checks were green the entire time six sessions were silently unreadable.
 *
 * So the distinction is made structural rather than left to each adapter's wording, and the same five outcomes apply to Claude,
 * Codex, Hermes and any provider added later. A future generation of ANY of them fails the same way; this is what makes it loud.
 */

import { ParseDiagnostic } from './agentSession';

export type ParseOutcomeCode =
  /** The source genuinely holds nothing meaningful: no records, or nothing but records known to carry no content. */
  | 'source-empty'
  /** The source holds records, they were understood, and normalization still produced no events. A defect or a real edge case. */
  | 'parsed-empty'
  /** The source holds records whose structure this adapter does not support. A format generation it cannot read. */
  | 'unsupported-format'
  /** The source could not be read as data at all. */
  | 'malformed-source'
  /** Some records were interpreted and some were not. The session renders with gaps rather than failing. */
  | 'partial-source';

/**
 * What an adapter counted while reading a source.
 *
 * Every record read must land in exactly one of the four outcome buckets, and `recordsSeen` must equal their sum. That is not
 * bookkeeping for its own sake: it is what makes "no event came out of this file" answerable. Without it, an adapter can only
 * report the absence, never the reason.
 */
export interface RecordTally {
  /** Records read from the source, before any interpretation. */
  recordsSeen: number;
  /** Records that produced at least one normalized event. */
  recordsInterpreted: number;
  /** Records DELIBERATELY suppressed as known structural noise. Suppression is a decision and must be counted as one. */
  recordsIgnored: number;
  /** Records preserved as `provider.unknown` because their shape was not recognized. */
  recordsUnrecognized: number;
  /** Records that could not be parsed as data. */
  recordsMalformed: number;
}

export const EMPTY_TALLY: RecordTally = {
  recordsSeen: 0,
  recordsInterpreted: 0,
  recordsIgnored: 0,
  recordsUnrecognized: 0,
  recordsMalformed: 0,
};

/**
 * Classifies a completed parse into at most one outcome diagnostic.
 *
 * **The invariant.** A source that held records but produced no events is an ERROR, not a warning — unless every record it held
 * was explicitly classified as ignorable. That is the exact incident of 20260902 turned into a permanent rule: silence is only
 * acceptable when the adapter can account for every record it chose not to use.
 *
 * Returns `undefined` for the ordinary case — records read, events produced, nothing malformed or unrecognized — because a
 * diagnostic on every successful parse is noise that trains readers to ignore diagnostics.
 */
export function classifyParse(tally: RecordTally, eventsEmitted: number): ParseDiagnostic | undefined {
  const { recordsSeen, recordsInterpreted, recordsIgnored, recordsUnrecognized, recordsMalformed } = tally;

  if (recordsSeen === 0) {
    return {
      severity: 'info',
      code: 'source-empty',
      message: 'the source held no records',
    };
  }

  if (recordsMalformed === recordsSeen) {
    return {
      severity: 'error',
      code: 'malformed-source',
      message: `all ${recordsSeen} record(s) failed to parse as data`,
    };
  }

  if (eventsEmitted === 0) {
    // Every record accounted for as deliberately ignorable. The file really does carry nothing, and saying so is honest.
    if (recordsIgnored === recordsSeen) {
      return {
        severity: 'info',
        code: 'source-empty',
        message: `all ${recordsSeen} record(s) were structural framing carrying no content`,
      };
    }

    // Records present, none understood. This is the shape of an unread format generation.
    if (recordsInterpreted === 0 && recordsUnrecognized > 0) {
      return {
        severity: 'error',
        code: 'unsupported-format',
        message:
          `${recordsUnrecognized} of ${recordsSeen} record(s) had a structure this adapter does not support, ` +
          'and no event could be produced. This is an adapter gap, not an empty session.',
      };
    }

    // Records present and readable, yet nothing came out. Loud by design: this is where the 20260902 defect lived.
    return {
      severity: 'error',
      code: 'parsed-empty',
      message:
        `${recordsSeen} record(s) were read but produced no events ` +
        `(${recordsInterpreted} interpreted, ${recordsIgnored} ignored, ${recordsUnrecognized} unrecognized, ` +
        `${recordsMalformed} malformed). The source is not empty; normalization produced nothing.`,
    };
  }

  if (recordsMalformed > 0 || recordsUnrecognized > 0) {
    return {
      severity: 'warning',
      code: 'partial-source',
      message:
        `${recordsInterpreted} of ${recordsSeen} record(s) were interpreted; ` +
        `${recordsUnrecognized} unrecognized and ${recordsMalformed} malformed. The session renders with gaps.`,
    };
  }

  return undefined;
}
