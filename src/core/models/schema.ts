/**
 * Version of the normalized session schema.
 *
 * Established at version 1 before there is anything to migrate, because the alternative is discovering the need
 * for it after a provider changes shape, at which point every cached session on every machine is unversioned and
 * indistinguishable from the new one. A version field costs nothing now and is unaddable later.
 */
export const NORMALIZED_SCHEMA_VERSION = 1;

/**
 * One step of a migration chain. Migrations are composed in order, so a v1 session reaches v3 by running
 * 1->2 then 2->3 rather than by a single function that has to know every historical shape.
 */
export interface SessionMigration {
  readonly fromVersion: number;
  readonly toVersion: number;
  migrate(input: unknown): unknown;
}

/**
 * Apply the registered migrations to bring a stored session up to the current version.
 *
 * Throws rather than guessing when no path exists: a session from a FUTURE version cannot be safely downgraded,
 * and silently returning it as-is would let newer fields flow into code that has never seen them.
 */
export function migrateSession(input: unknown, fromVersion: number, migrations: SessionMigration[]): unknown {
  if (fromVersion === NORMALIZED_SCHEMA_VERSION) {
    return input;
  }
  if (fromVersion > NORMALIZED_SCHEMA_VERSION) {
    throw new Error(
      `session schema v${fromVersion} is newer than this build understands (v${NORMALIZED_SCHEMA_VERSION})`
    );
  }

  let current = input;
  let version = fromVersion;
  while (version < NORMALIZED_SCHEMA_VERSION) {
    const step = migrations.find((m) => m.fromVersion === version);
    if (!step) {
      throw new Error(`no migration registered from session schema v${version}`);
    }
    current = step.migrate(current);
    version = step.toVersion;
  }
  return current;
}
