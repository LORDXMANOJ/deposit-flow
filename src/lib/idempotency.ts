import "server-only";
import { one, q } from "./db";

type Runner = Parameters<typeof q>[2];

/**
 * Idempotent create. The client generates a UUID when the form opens and sends it with every
 * submit/retry of that same action. The first call runs `fn` and stores its result; a repeat
 * (double click, network retry) returns the stored result and does NOT create a second record.
 * Same key used for a different scope is rejected.
 */
export async function withIdempotency<T extends Record<string, unknown>>(
  key: string | undefined,
  scope: string,
  fn: (run?: Runner) => Promise<T>,
  run?: Runner,
): Promise<T & { replayed?: boolean }> {
  if (!key) return fn(run);
  const claimed = await q<{ key: string }>(
    "insert into idempotency_keys (key, scope) values ($1,$2) on conflict (key) do nothing returning key",
    [key, scope], run);
  if (!claimed.length) {
    const prev = await one<{ scope: string; result: T | null }>("select scope, result from idempotency_keys where key=$1", [key], run);
    if (prev && prev.scope !== scope) throw new Error("This idempotency key was already used for a different action.");
    if (prev?.result) return { ...prev.result, replayed: true };
    throw new Error("This request is already being processed. Please wait a moment.");
  }
  try {
    const result = await fn(run);
    await q("update idempotency_keys set result=$2 where key=$1", [key, JSON.stringify(result)], run);
    return result;
  } catch (e) {
    // The work rolled back, so release the key and let the user correct and retry the same submission.
    await q("delete from idempotency_keys where key=$1", [key], run);
    throw e;
  }
}
