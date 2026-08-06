// Feature — Clima por ciudad. La ciudad deduce viento / nieve / zona bioambiental, y eso alimenta el
// semáforo (viento + nieve) y la calculadora de aislación (nivel K por zona).
import { test, describe } from "vitest";
import assert from "node:assert/strict";
import { CIUDADES, CIUDAD_ORDEN, climaDeCiudad, nivelKporZona, NIVEL_K_ZONA } from "../src/engine/clima.mjs";
import { aislacion } from "../src/engine/aislacion.mjs";
import { predimensionar } from "../src/engine/predimensionado.mjs";

describe("clima · tabla de ciudades", () => {
  test("cada ciudad del orden existe y trae viento/nieve/bio válidos", () => {
    CIUDAD_ORDEN.forEach(id => {
      const c = CIUDADES[id];
      assert.ok(c, `${id} en la tabla`);
      assert.ok(["baja", "media", "alta"].includes(c.viento));
      assert.ok(["baja", "media", "alta"].includes(c.nieve));
      assert.ok(NIVEL_K_ZONA[c.bio], `zona ${c.bio} tiene nivel K`);
    });
  });
  test("climaDeCiudad devuelve null si no existe", () => {
    assert.equal(climaDeCiudad("atlantis"), null);
    assert.equal(climaDeCiudad("bahiablanca").viento, "alta");
  });
});

describe("clima · nivel K por zona bioambiental", () => {
  test("zona más fría pide K más bajo (mejor aislado)", () => {
    assert.ok(nivelKporZona("VI").B < nivelKporZona("II").B);
  });
  test("default IV si la zona no existe (retrocompatibilidad)", () => {
    assert.deepEqual(nivelKporZona(undefined), NIVEL_K_ZONA.IV);
    assert.deepEqual(nivelKporZona("X"), NIVEL_K_ZONA.IV);
  });
  test("aislación usa el nivel de la zona pasada", () => {
    const muro = { kind: "muro", sistema: "steel", largo: 4000, alto: 2600, vanos: [] };
    const fria = aislacion(muro, { tipo: "Lana de vidrio", espesor: 100, ubicacion: "continua", zonaBio: "VI" });
    assert.equal(fria.nivel.B, NIVEL_K_ZONA.VI.B);
    assert.equal(fria.bio, "VI");
  });
});

describe("clima · nieve en el semáforo", () => {
  const casa = (pend) => ({ kind: "combinado", sistema: "steel", largo: 4000, ancho: 3000, alto: 2600,
    opciones: { pgc: "PGC 100x0.90", pgu: "PGU 100x0.90", modulo: 400 }, llevaTecho: true, techoPendiente: pend,
    arriostraFrente: "cruz", arriostraFondo: "cruz", arriostraIzq: "cruz", arriostraDer: "cruz" });
  const de = (checks, id) => checks.find(c => c.id === id);

  test("sin nieve (zona baja) no aparece el chequeo", () => {
    const r = predimensionar(casa(15), { zona: "media", nieve: "baja" });
    assert.equal(de(r.checks, "nieve"), undefined);
  });
  test("mucha nieve + techo plano → 🔴 con fix de pendiente", () => {
    const r = predimensionar(casa(15), { zona: "alta", nieve: "alta" });
    const n = de(r.checks, "nieve");
    assert.equal(n.estado, "fuera");
    assert.equal(n.fix.tipo, "pendiente");
  });
  test("mucha nieve + techo empinado → 🟢", () => {
    const r = predimensionar(casa(50), { zona: "alta", nieve: "alta" });
    assert.equal(de(r.checks, "nieve").estado, "ok");
  });
});
