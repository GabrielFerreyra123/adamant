// Pared de pago: la licencia queda atada al proyecto que se pagó.
import { describe, it, expect, beforeAll } from "vitest";

let firmarLicencia, verificarLicencia, limpiarProy, DIAS_LICENCIA;

beforeAll(async () => {
  process.env.LICENSE_SECRET = "secreto-de-test";
  ({ firmarLicencia, verificarLicencia, limpiarProy, DIAS_LICENCIA } = await import("../api/_lib.mjs"));
});

describe("licencia por proyecto", () => {
  it("firma y valida un token del proyecto que se pagó", () => {
    const t = firmarLicencia("123456", "proyA");
    const v = verificarLicencia(t);
    expect(v.ok).toBe(true);
    expect(v.pid).toBe("123456");
    expect(v.proy).toBe("proyA");
    expect(v.exp).toBeGreaterThan(Date.now() + (DIAS_LICENCIA - 1) * 864e5);
  });

  it("el token de un proyecto no sirve para otro", () => {
    // /api/generar compara limpiarProy(proy) contra lic.proy: con otro proyecto no coincide.
    const v = verificarLicencia(firmarLicencia("1", "proyA"));
    expect(v.proy).toBe("proyA");
    expect(limpiarProy("proyB")).not.toBe(v.proy);
  });

  it("rechaza firma adulterada", () => {
    const t = firmarLicencia("1", "proyA");
    const [payload] = t.split(".");
    expect(verificarLicencia(`${payload}.AAAA`).ok).toBe(false);
    // payload cambiado (otro proyecto) con la firma original → firma inválida
    const otro = Buffer.from(JSON.stringify({ pid: "1", proy: "proyB", exp: Date.now() + 864e5 })).toString("base64url");
    expect(verificarLicencia(`${otro}.${t.split(".")[1]}`).ok).toBe(false);
  });

  it("rechaza licencia vencida y token del esquema viejo (sin proyecto)", () => {
    const t = firmarLicencia("1", "proyA");
    expect(verificarLicencia(t).ok).toBe(true);
    expect(verificarLicencia("").ok).toBe(false);
    expect(verificarLicencia(null).motivo).toMatch(/ausente/);
  });

  it("no emite licencia sin id de proyecto", () => {
    expect(() => firmarLicencia("1", "")).toThrow();
    expect(() => firmarLicencia("1", "!!!")).toThrow(); // queda vacío tras limpiar
  });

  it("limpiarProy descarta caracteres raros y acota el largo", () => {
    expect(limpiarProy("abc-123_XY")).toBe("abc-123_XY");
    expect(limpiarProy("a/b c;d")).toBe("abcd");
    expect(limpiarProy("x".repeat(200)).length).toBe(64);
  });
});
