import { describe, expect, it } from "vitest";
import { apiOrder, dailyTotals, postWebhook, setupTestApp } from "./helpers.js";

const ctx = setupTestApp();

/**
 * Регрессия по жалобе на c_7 (Europe/Berlin): день заказа считался по смещению таймзоны «на сейчас»,
 * а не на момент заказа. В 2026 году Берлин переходит на летнее время 29.03 в 01:00 UTC (UTC+1 → UTC+2)
 * и обратно 25.10 в 01:00 UTC. Тест не зависит от текущей даты: при любом фиксированном смещении
 * часть заказов ниже попадёт не в тот день.
 */
describe("daily-totals и переход на летнее/зимнее время", () => {
  const paid = (amount: number, createdAt: string) => postWebhook(ctx.app, apiOrder({ customerId: "c_b", amount, createdAt, updatedAt: createdAt }));
  const totals = async (from: string, to: string) =>
    ((await dailyTotals(ctx.app, "c_b", from, to)).json() as { date: string; total: number }[]).map((d) => [d.date, d.total]);

  it("весна: до перехода — UTC+1, после — UTC+2", async () => {
    ctx.api.customers.set("c_b", "Europe/Berlin");
    await paid(1, "2026-03-27T22:30:00Z"); // 23:30 (+1) → 27.03
    await paid(2, "2026-03-27T23:30:00Z"); // 00:30 (+1) → 28.03
    await paid(4, "2026-03-28T23:00:00Z"); // 00:00 (+1) → 29.03, ровно полночь
    await paid(8, "2026-03-29T00:30:00Z"); // 01:30 (+1), ещё до перехода → 29.03
    await paid(16, "2026-03-29T21:30:00Z"); // 23:30 (+2) → 29.03
    await paid(32, "2026-03-29T22:30:00Z"); // 00:30 (+2) → 30.03
    await paid(64, "2026-03-30T21:59:59Z"); // 23:59:59 (+2) → 30.03
    await paid(128, "2026-03-30T22:00:00Z"); // 00:00 (+2) → 31.03

    expect(await totals("2026-03-27", "2026-03-31")).toEqual([
      ["2026-03-27", 1],
      ["2026-03-28", 2],
      ["2026-03-29", 4 + 8 + 16],
      ["2026-03-30", 32 + 64],
      ["2026-03-31", 128],
    ]);
  });

  it("осень: до перехода — UTC+2, после — UTC+1", async () => {
    ctx.api.customers.set("c_b", "Europe/Berlin");
    await paid(1, "2026-10-24T22:30:00Z"); // 00:30 (+2) → 25.10
    await paid(2, "2026-10-25T22:30:00Z"); // 23:30 (+1) → 25.10
    await paid(4, "2026-10-25T23:30:00Z"); // 00:30 (+1) → 26.10
    expect(await totals("2026-10-24", "2026-10-26")).toEqual([
      ["2026-10-24", 0],
      ["2026-10-25", 3],
      ["2026-10-26", 4],
    ]);
  });

  it("границы периода считаются в таймзоне клиента", async () => {
    ctx.api.customers.set("c_b", "Europe/Berlin");
    await paid(1, "2026-03-30T21:59:59Z"); // 30.03 — вне периода
    await paid(2, "2026-03-30T22:00:00Z"); // 31.03 00:00 — в периоде
    await paid(4, "2026-03-31T21:59:59Z"); // 31.03 23:59:59 — в периоде
    await paid(8, "2026-03-31T22:00:00Z"); // 01.04 — вне периода
    expect(await totals("2026-03-31", "2026-03-31")).toEqual([["2026-03-31", 6]]);
  });

  it("южное полушарие и отрицательные смещения", async () => {
    ctx.api.customers.set("c_s", "America/Santiago"); // 2026-04-05 03:00 UTC: UTC-3 → UTC-4
    await postWebhook(ctx.app, apiOrder({ customerId: "c_s", amount: 10, createdAt: "2026-04-05T02:30:00Z" })); // 23:30 (-3) → 04.04
    await postWebhook(ctx.app, apiOrder({ customerId: "c_s", amount: 20, createdAt: "2026-04-06T03:30:00Z" })); // 23:30 (-4) → 05.04
    const res = (await dailyTotals(ctx.app, "c_s", "2026-04-04", "2026-04-06")).json();
    expect(res.map((d: { date: string; total: number }) => [d.date, d.total])).toEqual([
      ["2026-04-04", 10],
      ["2026-04-05", 20],
      ["2026-04-06", 0],
    ]);
  });

  it("период длиннее 366 дней — 400", async () => {
    expect((await dailyTotals(ctx.app, "c_1", "2026-01-01", "2027-01-02")).statusCode).toBe(400);
    const ok = await dailyTotals(ctx.app, "c_1", "2026-01-01", "2027-01-01");
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toHaveLength(366);
  });
});
