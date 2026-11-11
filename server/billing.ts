import fs from "node:fs";
import path from "node:path";

export interface ProviderBilling {
  checkedAt: number;
  dayStart: number;
  monthStart: number;
  dayBilledUsd: number | null;
  monthBilledUsd: number | null;
  status: "available" | "pending";
}

/** Read-only account billing. Empty billing buckets remain pending, not free. */
export function createBillingGuard(options: { directory?: string; now?: () => number } = {}) {
  const enabled = process.env.RUNPOD_BILLING_GUARD_ENABLED === "true";
  const now = options.now || Date.now;
  let snapshot: ProviderBilling | null = null;
  let pending: Promise<ProviderBilling> | null = null;
  const periods = () => {
    const d = new Date(now());
    return { dayStart: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), monthStart: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) };
  };
  const valid = () => {
    const p = periods();
    return snapshot && snapshot.dayStart === p.dayStart && snapshot.monthStart === p.monthStart && now() - snapshot.checkedAt <= 10 * 60 * 1000;
  };
  async function refresh() {
    if (!enabled) return null;
    if (pending) return pending;
    pending = (async () => {
      const key = process.env.RUNPOD_API_KEY?.trim();
      if (!key) throw new Error("Runpod billing is not configured");
      const p = periods();
      const read = async (bucketSize: "day" | "month") => {
        const url = `https://api.runpod.io/v2/billing?bucketSize=${bucketSize}&lastN=1`;
        const response = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error("Runpod billing check failed");
        const body = await response.json();
        const amount = body?.metadata?.totals?.totalAmount;
        const count = body?.metadata?.recordCount;
        if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0 || typeof count !== "number")
          throw new Error("Runpod billing returned an invalid response");
        return count > 0 ? amount : null;
      };
      const [dayBilledUsd, monthBilledUsd] = await Promise.all([read("day"), read("month")]);
      // Discard a response that crossed a UTC period boundary; retry on next refresh.
      const current = periods();
      if (current.dayStart !== p.dayStart || current.monthStart !== p.monthStart) throw new Error("Billing period changed");
      const next: ProviderBilling = { checkedAt: now(), ...p, dayBilledUsd, monthBilledUsd, status: dayBilledUsd === null || monthBilledUsd === null ? "pending" : "available" };
      if (options.directory) {
        fs.mkdirSync(options.directory, { recursive: true, mode: 0o700 });
        const file = path.join(options.directory, "provider-billing.json");
        fs.writeFileSync(file + ".tmp", JSON.stringify(next, null, 2), { mode: 0o600 }); fs.renameSync(file + ".tmp", file);
      }
      snapshot = next;
      return next;
    })();
    try { return await pending; } finally { pending = null; }
  }
  return {
    enabled, refresh,
    summary: () => ({ enabled, fresh: Boolean(valid()), snapshot }),
    admission: () => {
      if (!enabled) return { day: 0, month: 0 };
      if (!valid()) throw new Error("Provider billing is unavailable or stale. New generation is paused; saved media is still available.");
      return { day: snapshot!.dayBilledUsd ?? 0, month: snapshot!.monthBilledUsd ?? 0 };
    },
  };
}
