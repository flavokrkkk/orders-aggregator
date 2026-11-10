import { describe, expect, it } from "vitest";
import { apiOrder, dailyTotals, postWebhook, setupTestApp } from "./helpers.js";

const ctx = setupTestApp();

/** Заказ «нового» формата — со скидкой. */
const discounted = (amount: number | string, discountPercent: number | string, amountPaid: number | string, over: Record<string, unknown> = {}) =>
  apiOrder({ amount, discountPercent, amountPaid, ...over });

describe("скидки в daily-totals", () => {
  it("отдаёт gross / discount / net, total = gross (пример из задания)", async () => {
    await postWebhook(ctx.app, discounted(2500, 16.5, 2087.5));
    const res = await dailyTotals(ctx.app, "c_1", "2026-02-10", "2026-02-10");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([{ date: "2026-02-10", total: 2500, gross: 2500, discount: 412.5, net: 2087.5 }]);
  });

  it("суммирует по дням, дни без оплат — нули", async () => {
    await postWebhook(ctx.app, discounted(1000, 10, 900, { createdAt: "2026-02-10T08:00:00Z" }));
    await postWebhook(ctx.app, discounted(3441, 25, 2580.75, { createdAt: "2026-02-10T09:00:00Z" }));
    await postWebhook(ctx.app, discounted(500, 0, 500, { createdAt: "2026-02-12T09:00:00Z" }));

    const res = await dailyTotals(ctx.app, "c_1", "2026-02-10", "2026-02-12");
    expect(res.json()).toEqual([
      { date: "2026-02-10", total: 4441, gross: 4441, discount: 960.25, net: 3480.75 },
      { date: "2026-02-11", total: 0, gross: 0, discount: 0, net: 0 },
      { date: "2026-02-12", total: 500, gross: 500, discount: 0, net: 500 },
    ]);
  });

  it("не теряет копейки на суммах, которые неточно представимы в float (4723.9 * 100 = 472389.999…)", async () => {
    await postWebhook(ctx.app, discounted(5248.78, 10, 4723.9));
    await postWebhook(ctx.app, discounted(140, 7, 130.2));
    await postWebhook(ctx.app, discounted(4547, 3, 4410.61));
    await postWebhook(ctx.app, discounted(669, 3, 648.93));
    const [day] = (await dailyTotals(ctx.app, "c_1", "2026-02-10", "2026-02-10")).json();
    expect(day).toEqual({ date: "2026-02-10", total: 10604.78, gross: 10604.78, discount: 691.14, net: 9913.64 });
  });

  it("строковые amount / discountPercent / amountPaid", async () => {
    await postWebhook(ctx.app, discounted("5584.00", "7", "5193.12"));
    const [day] = (await dailyTotals(ctx.app, "c_1", "2026-02-10", "2026-02-10")).json();
    expect(day).toMatchObject({ gross: 5584, discount: 390.88, net: 5193.12 });
  });

  it("заказ без полей скидки (старый формат API) — скидки нет, net = gross", async () => {
    await postWebhook(ctx.app, apiOrder({ amount: 1000 }));
    const [day] = (await dailyTotals(ctx.app, "c_1", "2026-02-10", "2026-02-10")).json();
    expect(day).toMatchObject({ total: 1000, gross: 1000, discount: 0, net: 1000 });
  });

  it("есть discountPercent, нет amountPaid — оплату считаем по проценту, доли копейки отбрасываем", async () => {
    await postWebhook(ctx.app, apiOrder({ amount: 999.99, discountPercent: 33 }));
    const [day] = (await dailyTotals(ctx.app, "c_1", "2026-02-10", "2026-02-10")).json();
    // 99999 коп * 0.67 = 66999.33 → 66999
    expect(day).toMatchObject({ gross: 999.99, net: 669.99, discount: 330 });
  });

  it("pending и refunded в скидки не попадают", async () => {
    await postWebhook(ctx.app, discounted(1000, 10, 900));
    await postWebhook(ctx.app, discounted(2000, 50, 1000, { status: "pending" }));
    await postWebhook(ctx.app, discounted(3000, 50, 1500, { status: "refunded" }));
    const [day] = (await dailyTotals(ctx.app, "c_1", "2026-02-10", "2026-02-10")).json();
    expect(day).toMatchObject({ gross: 1000, discount: 100, net: 900 });
  });

  it("вебхук с новой скидкой обновляет net", async () => {
    const o = discounted(1000, 10, 900);
    await postWebhook(ctx.app, o);
    await postWebhook(ctx.app, { ...o, discountPercent: 33, amountPaid: 670, updatedAt: "2026-02-10T13:00:00Z" });
    const [day] = (await dailyTotals(ctx.app, "c_1", "2026-02-10", "2026-02-10")).json();
    expect(day).toMatchObject({ gross: 1000, discount: 330, net: 670 });
  });

  it("невалидные скидки — 400", async () => {
    expect((await postWebhook(ctx.app, discounted(1000, 150, 900))).statusCode).toBe(400);
    expect((await postWebhook(ctx.app, discounted(1000, -5, 900))).statusCode).toBe(400);
    expect((await postWebhook(ctx.app, discounted(1000, 10, 1200))).statusCode).toBe(400);
    expect((await postWebhook(ctx.app, discounted(1000, 10, "abc"))).statusCode).toBe(400);
    const { rows } = await ctx.db.query(`SELECT count(*)::int AS n FROM orders`);
    expect(rows[0].n).toBe(0);
  });

  it("хранит скидку и оплату в копейках", async () => {
    const o = discounted("4999.00", 33, 3349.33);
    await postWebhook(ctx.app, o);
    const { rows } = await ctx.db.query(`SELECT amount_kop, discount_percent, amount_paid_kop FROM orders WHERE id = $1`, [o.id]);
    expect(rows[0]).toEqual({ amount_kop: "499900", discount_percent: "33.00", amount_paid_kop: "334933" });
  });
});

describe("заказы, сохранённые до учёта скидок", () => {
  it("синк дозаполняет скидку даже при той же версии (updatedAt), повтор — stale", async () => {
    const o = discounted(1000, 20, 800);
    // Так строку сохранила прошлая версия сервиса: без скидочных колонок
    await ctx.db.query(
      `INSERT INTO orders (id, customer_id, amount_kop, status, created_at, updated_at) VALUES ($1, $2, 100000, 'paid', $3, $3)`,
      [o.id, o.customerId, o.updatedAt],
    );
    let [day] = (await dailyTotals(ctx.app, "c_1", "2026-02-10", "2026-02-10")).json();
    expect(day).toMatchObject({ gross: 1000, discount: 0, net: 1000 });

    ctx.api.pages.set(null, { items: [o], nextCursor: null });
    expect((await ctx.app.inject({ method: "POST", url: "/sync" })).json()).toMatchObject({ applied: 1, stale: 0 });
    [day] = (await dailyTotals(ctx.app, "c_1", "2026-02-10", "2026-02-10")).json();
    expect(day).toMatchObject({ gross: 1000, discount: 200, net: 800 });

    expect((await ctx.app.inject({ method: "POST", url: "/sync" })).json()).toMatchObject({ applied: 0, stale: 1 });
  });
});
