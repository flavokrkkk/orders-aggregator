import { describe, expect, it } from "vitest";
import { fromKop, parsePercent, parseRub, toKop } from "../src/utils/money.js";

describe("parseRub", () => {
  it("принимает число и строку с числом", () => {
    expect(parseRub(2500)).toBe(2500);
    expect(parseRub("2500.00")).toBe(2500);
    expect(parseRub(" 99 ")).toBe(99);
  });

  it("отклоняет мусор и отрицательные суммы", () => {
    expect(() => parseRub("abc")).toThrow();
    expect(() => parseRub(null)).toThrow();
    expect(() => parseRub(-1)).toThrow();
  });
});

describe("toKop / fromKop", () => {
  it("рубли в копейки", () => {
    expect(toKop(2500)).toBe(250000);
    expect(toKop(99)).toBe(9900);
  });

  it("отбрасывает доли копейки", () => {
    expect(toKop(10.999)).toBe(1099);
  });

  it("копейки в рубли", () => {
    expect(fromKop(250000)).toBe(2500);
    expect(fromKop(1099)).toBe(10.99);
  });
});

describe("toKop: погрешность float", () => {
  it("не теряет копейку на суммах, неточно представимых в двоичном виде", () => {
    // Math.floor(x * 100) дал бы на копейку меньше во всех этих случаях
    expect(toKop(4723.9)).toBe(472390);
    expect(toKop(1217.61)).toBe(121761);
    expect(toKop(19.99)).toBe(1999);
    expect(toKop(0.1 + 0.2)).toBe(30);
  });

  it("реальные доли копейки по-прежнему отбрасывает", () => {
    expect(toKop(2087.555)).toBe(208755);
    expect(toKop(0.009)).toBe(0);
  });

  it("слишком большие суммы — ошибка", () => {
    expect(() => toKop(1e20)).toThrow();
  });
});

describe("parseRub / parsePercent", () => {
  it("пустая строка — не ноль, а ошибка", () => {
    expect(() => parseRub("")).toThrow();
    expect(() => parsePercent(" ")).toThrow();
  });

  it("процент: число или строка, 0..100", () => {
    expect(parsePercent(0)).toBe(0);
    expect(parsePercent("16.5")).toBe(16.5);
    expect(parsePercent(100)).toBe(100);
    expect(() => parsePercent(101)).toThrow();
    expect(() => parsePercent(-1)).toThrow();
    expect(() => parsePercent("abc")).toThrow();
  });
});
