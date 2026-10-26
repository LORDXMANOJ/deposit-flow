import "server-only";
import { q } from "./db";
import type { Role } from "./rbac";

export type Actor = { id: string | null; name: string; role: Role | "system" | null };

type Runner = Parameters<typeof q>[2];

const SENSITIVE = /pass(word)?|token|secret|authorization|cookie/i;

/** Strip anything that looks like a credential before it can reach the append-only log. */
function scrub(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (SENSITIVE.test(k)) continue;
    out[k] = typeof v === "string" && v.length > 500 ? v.slice(0, 500) + "…" : v;
  }
  return out;
}

export async function audit(
  actor: Actor,
  action: string,
  entityType: string,
  entityId: string | null,
  entityLabel: string | null,
  meta: Record<string, unknown> = {},
  run?: Runner,
): Promise<void> {
  await q(
    `insert into audit_logs (actor_id, actor_name, actor_role, action, entity_type, entity_id, entity_label, meta)
     values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [actor.id, actor.name, actor.role, action, entityType, entityId, entityLabel, JSON.stringify(scrub(meta))],
    run,
  );
}

export async function workflowEvent(
  entityType: string,
  entityId: string,
  from: string | null,
  to: string,
  actor: Actor,
  note?: string | null,
  run?: Runner,
): Promise<void> {
  await q(
    `insert into workflow_events (entity_type, entity_id, from_status, to_status, actor_id, actor_name, note)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [entityType, entityId, from, to, actor.id, actor.name, note ?? null],
    run,
  );
}
