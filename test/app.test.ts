import { describe, expect, it } from "vitest";
import { setupTestApp } from "./helpers.js";

const ctx = setupTestApp();

describe("обработка ошибок HTTP-слоя", () => {
  it("битый JSON во вебхуке — 400, а не 500 (иначе отправитель будет ретраить бесконечно)", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/webhooks/order",
      headers: { "content-type": "application/json" },
      payload: "{not json",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: "bad_request" });
  });

  it("неподдерживаемый content-type — 415", async () => {
    const res = await ctx.app.inject({ method: "POST", url: "/webhooks/order", headers: { "content-type": "text/xml" }, payload: "<x/>" });
    expect(res.statusCode).toBe(415);
  });

  it("неожиданная ошибка — 500 без деталей", async () => {
    const original = ctx.api.getCustomer;
    ctx.api.getCustomer = async () => {
      throw new Error("boom: secret details");
    };
    try {
      const res = await ctx.app.inject({ method: "GET", url: "/customers/c_x/daily-totals?from=2026-02-10&to=2026-02-10" });
      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({ error: "internal", message: "Internal error" });
    } finally {
      ctx.api.getCustomer = original;
    }
  });
});
