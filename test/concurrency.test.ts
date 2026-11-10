import { describe, expect, it } from "vitest";
import { apiOrder, postWebhook, setupTestApp } from "./helpers.js";

const ctx = setupTestApp();

const shuffle = <T>(xs: T[]): T[] => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** Внешний API шлёт вебхуки с повторами, не по порядку и параллельно (наблюдали до 3 одновременных запросов). */
describe("параллельные вебхуки по одному заказу", () => {
  it("побеждает самая свежая версия, сколько бы версий ни пришло одновременно", async () => {
    for (let round = 0; round < 5; round++) {
      const base = apiOrder();
      const versions = Array.from({ length: 8 }, (_, i) => ({
        ...base,
        amount: 100 + i,
        status: i === 7 ? "refunded" : "paid",
        updatedAt: new Date(Date.parse("2026-02-10T12:00:00Z") + i * 60_000).toISOString(),
      }));
      // каждую версию — дважды (повторная доставка), всё — одновременно
      await Promise.all(shuffle([...versions, ...versions]).map((v) => postWebhook(ctx.app, v)));
      const { rows } = await ctx.db.query(`SELECT amount_kop, status, updated_at FROM orders WHERE id = $1`, [base.id]);
      expect(rows[0]).toMatchObject({ amount_kop: "10700", status: "refunded" });
      expect(rows[0].updated_at.toISOString()).toBe(versions[7].updatedAt);
    }
  });

  it("одновременная доставка нового заказа: ровно один created, остальные stale", async () => {
    const o = apiOrder();
    const results = await Promise.all(Array.from({ length: 6 }, () => postWebhook(ctx.app, o)));
    const bodies = results.map((r) => r.json().result).sort();
    expect(bodies).toEqual(["created", "stale", "stale", "stale", "stale", "stale"]);
  });
});
