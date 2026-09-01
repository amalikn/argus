/**
 * The shapes Codex actually writes into a rollout, as observed on 20260901.
 *
 * These are DESCRIPTIVE, not a contract Codex has published. Every field is optional and every record is
 * validated at the boundary, because this format changes without notice and an adapter that assumes a shape
 * breaks on the first release that adds a field.
 */

export interface RolloutLine {
  /** Outer discriminant: session_meta, response_item, event_msg, turn_context. */
  type?: string;
  timestamp?: string;
  payload?: unknown;
}

export interface SessionMetaPayload {
  id?: string;
  timestamp?: string;
  cwd?: string;
  originator?: string;
  cli_version?: string;
  source?: string;
  model_provider?: string;
}

export interface TurnContextPayload {
  cwd?: string;
  model?: string;
  effort?: string;
  approval_policy?: string;
  sandbox_policy?: unknown;
  current_date?: string;
}

export interface ExecCommandEndPayload {
  type?: string;
  call_id?: string;
  command?: string | string[];
  cwd?: string;
  duration?: unknown;
  exit_code?: number;
  aggregated_output?: string;
  formatted_output?: string;
  parsed_cmd?: unknown;
}

export interface TokenUsage {
  input_tokens?: number;
  cached_input_tokens?: number;
  output_tokens?: number;
  reasoning_output_tokens?: number;
  total_tokens?: number;
}

export interface TokenCountPayload {
  type?: string;
  /** Null on many records; only some carry the counts, so token capability is decided from the data. */
  info?: {
    total_token_usage?: TokenUsage;
    last_token_usage?: TokenUsage;
    model_context_window?: number;
  } | null;
}

export interface PatchApplyEndPayload {
  type?: string;
  call_id?: string;
  success?: boolean;
  status?: string;
  stdout?: string;
  stderr?: string;
  /** path -> { type: add | update | delete, unified_diff, move_path } */
  changes?: Record<string, { type?: string; unified_diff?: string; move_path?: string | null }>;
}

export interface FunctionCallPayload {
  type?: string;
  call_id?: string;
  name?: string;
  arguments?: string;
}

export interface FunctionCallOutputPayload {
  type?: string;
  call_id?: string;
  output?: unknown;
}

export interface MessagePayload {
  type?: string;
  role?: string;
  content?: unknown;
}

export interface ReasoningPayload {
  type?: string;
  content?: unknown;
  summary?: unknown;
  encrypted_content?: unknown;
}
