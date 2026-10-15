/**
 * Pure three-way merge used by sync. Given what's on this device, what's on the server, and the
 * signature of each item as of the last successful sync ("meta"), decide what to keep, push and delete.
 * Keeping this free of I/O makes the conflict rules easy to test.
 */
export type Meta = Record<string, string>;

export interface Plan<T> {
  /** The list this device should hold after applying server changes. */
  nextLocal: T[];
  /** Items to upload (new or changed locally). */
  push: T[];
  /** Ids that were deleted on this device since the last sync and must be deleted on the server. */
  deleteRemote: string[];
  /** Signatures to record for everything already identical on both sides. */
  synced: Meta;
}

export interface PlanOps<T> {
  id: (t: T) => string;
  sig: (t: T) => string;
  /** Last-modified time if the item carries one (used to break ties on first sync). */
  modified?: (t: T) => number | null;
}

export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
    .join(',')}}`;
}

export function planMerge<T>(local: T[], remote: T[], meta: Meta, ops: PlanOps<T>): Plan<T> {
  const l = new Map(local.map((t) => [ops.id(t), t]));
  const r = new Map(remote.map((t) => [ops.id(t), t]));
  const plan: Plan<T> = { nextLocal: [], push: [], deleteRemote: [], synced: {} };

  // Preserve local ordering, then append server-only items.
  const order = [...l.keys(), ...[...r.keys()].filter((id) => !l.has(id))];

  for (const id of order) {
    const lt = l.get(id);
    const rt = r.get(id);
    const m = meta[id];

    if (lt && rt) {
      const ls = ops.sig(lt);
      const rs = ops.sig(rt);
      if (ls === rs) {
        plan.nextLocal.push(lt);
        plan.synced[id] = ls;
      } else if (m === undefined) {
        // Never synced before and they differ: the more recently modified side wins (server if unknown).
        const lm = ops.modified?.(lt) ?? null;
        const rm = ops.modified?.(rt) ?? null;
        if (lm !== null && rm !== null && lm > rm) {
          plan.nextLocal.push(lt);
          plan.push.push(lt);
        } else {
          plan.nextLocal.push(rt);
          plan.synced[id] = rs;
        }
      } else if (ls === m) {
        plan.nextLocal.push(rt); // only the server changed
        plan.synced[id] = rs;
      } else if (rs === m) {
        plan.nextLocal.push(lt); // only this device changed
        plan.push.push(lt);
      } else {
        // Both changed since the last sync: newest wins; if we can't tell, keep the server's copy.
        const lm = ops.modified?.(lt) ?? null;
        const rm = ops.modified?.(rt) ?? null;
        if (lm !== null && rm !== null && lm >= rm) {
          plan.nextLocal.push(lt);
          plan.push.push(lt);
        } else {
          plan.nextLocal.push(rt);
          plan.synced[id] = rs;
        }
      }
    } else if (lt && !rt) {
      if (m === undefined) {
        plan.nextLocal.push(lt); // brand new here
        plan.push.push(lt);
      } else if (ops.sig(lt) === m) {
        // Synced before, unchanged here, gone from the server → deleted elsewhere.
      } else {
        plan.nextLocal.push(lt); // edited here after being deleted elsewhere → keep it
        plan.push.push(lt);
      }
    } else if (!lt && rt) {
      if (m !== undefined) plan.deleteRemote.push(id); // we deleted it here since the last sync
      else {
        plan.nextLocal.push(rt); // new on the server
        plan.synced[id] = ops.sig(rt);
      }
    }
  }
  return plan;
}

/** What changed on this device since the last sync (used for fast push-only flushes). */
export function localChanges<T>(local: T[], meta: Meta, ops: PlanOps<T>): { push: T[]; deleteRemote: string[] } {
  const push: T[] = [];
  const present = new Set<string>();
  for (const t of local) {
    const id = ops.id(t);
    present.add(id);
    if (meta[id] !== ops.sig(t)) push.push(t);
  }
  const deleteRemote = Object.keys(meta).filter((id) => !present.has(id));
  return { push, deleteRemote };
}
