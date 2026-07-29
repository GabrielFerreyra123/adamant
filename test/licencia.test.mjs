// Pared de pago v2: SKUs (pase90 / proyecto), token firmado, compat con tokens v1.
import { describe, it, expect, beforeAll } from "vitest";
import { createHmac } from "node:crypto";

let firmarLicencia, verificarLicencia, perpetuoDesdePase, esPase, limpiarProy, packRef, unpackRef;
let PRICING, precioDe, montoCoincide, esSkuValido;
const SECRET = "secreto-de-test";

beforeAll(async () => {
  process.env.LICENSE_SECRET = SECRET;
  ({ firmarLicencia, verificarLicencia, perpetuoDesdePase, esPase, limpiarProy, packRef, unpackRef } = await import("../api/_lib.mjs"));
  ({ PRICING, precioDe, montoCoincide, esSkuValido } = await import("../src/config/pricing.js"));
});

describe("pricing (fuente única)", () => {
  it("deriva los tres precios de base (pase90 = 2×base)", () => {
    const b = PRICING.base;
    expect(precioDe("proyecto")).toBe(b);
    expect(precioDe("pase90")).toBe(b * 2);
    expect(precioDe("pase90_renov")).toBe(b);
  });
  it("montoCoincide tolera centavos y rechaza montos ajenos", () => {
    expect(montoCoincide("pase90", PRICING.base * 2)).toBe(true);
    expect(montoCoincide("pase90", PRICING.base * 2 + 0.4)).toBe(true);
    expect(montoCoincide("pase90", PRICING.base)).toBe(false);
    expect(esSkuValido("otro")).toBe(false);
  });
});

describe("token v2", () => {
  it("pase90: exp en el futuro, sin projectHash, autoriza cualquier proyecto", () => {
    const t = firmarLicencia({ sku: "pase90", orderId: "1" });
    const v = verificarLicencia(t, "cualquierProyecto");
    expect(v.ok).toBe(true);
    expect(v.sku).toBe("pase90");
    expect(v.exp).toBeGreaterThan(Date.now());
    expect(v.projectHash).toBe(null);
  });

  it("proyecto: perpetuo (exp null), atado a su projectHash", () => {
    const t = firmarLicencia({ sku: "proyecto", projectHash: "proyA", orderId: "1" });
    expect(verificarLicencia(t, "proyA").ok).toBe(true);
    expect(verificarLicencia(t, "proyA").exp).toBe(null);
    // No sirve para otro proyecto.
    expect(verificarLicencia(t, "proyB").ok).toBe(false);
  });

  it("proyecto requiere projectHash", () => {
    expect(() => firmarLicencia({ sku: "proyecto" })).toThrow();
  });

  it("pase vencido no autoriza", () => {
    // compraTs 100 días atrás → exp pasado (90 días).
    const t = firmarLicencia({ sku: "pase90", orderId: "1", compraTs: Date.now() - 100 * 864e5 });
    const v = verificarLicencia(t, "x");
    expect(v.ok).toBe(false);
    expect(v.motivo).toMatch(/vencido/);
  });

  it("rechaza firma adulterada", () => {
    const t = firmarLicencia({ sku: "pase90", orderId: "1" });
    const [payload] = t.split(".");
    expect(verificarLicencia(`${payload}.AAAA`, "x").ok).toBe(false);
  });

  it("perpetuoDesdePase mintea un proyecto perpetuo de un pase vigente", () => {
    const pase = verificarLicencia(firmarLicencia({ sku: "pase90", orderId: "9" }), "z");
    expect(esPase(pase)).toBe(true);
    const perp = perpetuoDesdePase(pase, "z");
    const v = verificarLicencia(perp, "z");
    expect(v.ok).toBe(true);
    expect(v.sku).toBe("proyecto");
    expect(v.exp).toBe(null);
    // De un proyecto (no pase) no se mintea nada.
    expect(perpetuoDesdePase(verificarLicencia(perp, "z"), "z")).toBe(null);
  });
});

describe("compatibilidad v1 (no invalidar compras previas)", () => {
  // Reconstruye un token del esquema viejo { pid, proy, exp } firmado con el mismo secreto.
  function firmarV1(pid, proy){
    const b64u = b => Buffer.from(b).toString("base64url");
    const payload = b64u(JSON.stringify({ pid, proy, exp: Date.now() + 30 * 864e5 }));
    const sig = b64u(createHmac("sha256", SECRET).update(payload).digest());
    return `${payload}.${sig}`;
  }
  it("un token v1 vale como proyecto perpetuo atado a su proy", () => {
    const t = firmarV1("123456", "proyViejo");
    const v = verificarLicencia(t, "proyViejo");
    expect(v.ok).toBe(true);
    expect(v.sku).toBe("proyecto");
    expect(verificarLicencia(t, "otro").ok).toBe(false);
  });
});

describe("helpers", () => {
  it("packRef / unpackRef round-trip", () => {
    expect(unpackRef(packRef("proyecto", "abc"))).toEqual({ sku: "proyecto", projectHash: "abc" });
    expect(unpackRef(packRef("pase90", "")).sku).toBe("pase90");
  });
  it("limpiarProy descarta caracteres raros y acota el largo", () => {
    expect(limpiarProy("abc-123_XY")).toBe("abc-123_XY");
    expect(limpiarProy("a/b c;d")).toBe("abcd");
    expect(limpiarProy("x".repeat(200)).length).toBe(64);
  });
});
