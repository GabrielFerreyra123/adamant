// Feature 3.1 — Aislación térmica (calculadora orientativa). Verifica K por capas, efecto del puente
// térmico del acero, niveles IRAM y cálculo de área/m².
import { test, describe } from "vitest";
import assert from "node:assert/strict";
import { aislacion } from "../src/engine/aislacion.mjs";

const muro = (extra = {}) => ({ kind: "muro", sistema: "steel", largo: 4000, alto: 2600,
  vanos: [{ x1: 900, x2: 1800, h: 2050, sill: 0 }], ...extra });

describe("aislación · K y puente térmico", () => {
  test("más espesor → menor K (mejor)", () => {
    const a = aislacion(muro(), { tipo: "EPS (telgopor)", espesor: 50, ubicacion: "continua" });
    const b = aislacion(muro(), { tipo: "EPS (telgopor)", espesor: 120, ubicacion: "continua" });
    assert.ok(b.K < a.K);
  });

  test("en steel, continua aísla mejor que entre montantes (puente térmico)", () => {
    const entre = aislacion(muro(), { tipo: "Lana de vidrio", espesor: 100, ubicacion: "entre" });
    const cont = aislacion(muro(), { tipo: "Lana de vidrio", espesor: 100, ubicacion: "continua" });
    assert.ok(cont.K < entre.K);
    assert.ok(entre.avisos.some(a => /puente térmico/i.test(a.titulo + a.texto)));
    assert.equal(entre.avisos.find(a => a.fix)?.fix.ubicacion, "continua");
  });

  test("madera puentea menos que acero a igual armado", () => {
    const acero = aislacion(muro({ sistema: "steel" }), { tipo: "Lana de vidrio", espesor: 100, ubicacion: "entre" });
    const mad = aislacion(muro({ sistema: "wood" }), { tipo: "Lana de vidrio", espesor: 100, ubicacion: "entre" });
    assert.ok(mad.K < acero.K);
  });

  test("aislación pobre cae de nivel", () => {
    const r = aislacion(muro(), { tipo: "Lana de vidrio", espesor: 50, ubicacion: "entre" });
    assert.ok(["atencion", "fuera"].includes(r.estado));
  });

  test("aislación buena → ok (verde)", () => {
    const r = aislacion(muro(), { tipo: "EPS (telgopor)", espesor: 100, ubicacion: "continua" });
    assert.equal(r.estado, "ok");
  });
});

describe("aislación · área", () => {
  test("descuenta las aberturas del muro", () => {
    const sin = aislacion(muro({ vanos: [] }), { ubicacion: "continua" });
    const con = aislacion(muro(), { ubicacion: "continua" });
    assert.ok(con.area < sin.area);
    assert.equal(sin.area, +(4000 * 2600 / 1e6).toFixed(1)); // 10,4 m²
  });

  test("combinado suma el perímetro de los 4 muros", () => {
    const r = aislacion({ kind: "combinado", sistema: "steel", largo: 6000, ancho: 4000, alto: 2600 },
      { tipo: "EPS (telgopor)", espesor: 100, ubicacion: "continua" });
    assert.equal(r.area, +(2 * (6000 + 4000) * 2600 / 1e6).toFixed(1)); // 52,0 m²
  });
});
