// FASE B — Pre-dimensionado orientativo (semáforo). Verifica que los rangos de manual clasifiquen
// bien 🟢/🟡/🔴 por módulo y que la zona de viento module el chequeo de arriostramiento.
import { test, describe } from "vitest";
import assert from "node:assert/strict";
import { predimensionar } from "../src/engine/predimensionado.mjs";

const OPC = { pgc: "PGC 100x0.90", pgu: "PGU 100x0.90", lumber: "2x6 (38×140)", modulo: 400 };
const de = (checks, label) => checks.find(c => c.label === label);

describe("pre-dimensionado · muro", () => {
  test("muro exterior estándar arriostrado → todo en rango", () => {
    const r = predimensionar({ kind: "muro", sistema: "steel", tipoMuro: "exterior", largo: 4000, alto: 2600,
      arriostramiento: "cruz", vanos: [{ x1: 900, x2: 1800 }], opciones: OPC }, { zona: "alta" });
    assert.equal(r.resumen.peor, "atencion"); // el anclaje en viento alto queda como recordatorio 🟡
    assert.equal(de(r.checks, "Separación de montantes").estado, "ok");
  });

  test("modulación abierta, sin arriostrar y vano ancho → fuera de rango", () => {
    const r = predimensionar({ kind: "muro", sistema: "steel", tipoMuro: "exterior", largo: 6000, alto: 3200,
      arriostramiento: "ninguno", vanos: [{ x1: 500, x2: 4000 }], opciones: { ...OPC, modulo: 800 } }, { zona: "alta" });
    assert.equal(de(r.checks, "Separación de montantes").estado, "fuera");
    assert.equal(de(r.checks, "Dintel sobre aberturas").estado, "fuera");
    assert.equal(de(r.checks, "Arriostramiento (viento)").estado, "fuera");
    assert.equal(r.resumen.peor, "fuera");
    // el fix de separación vuelve a 400
    assert.deepEqual(de(r.checks, "Separación de montantes").fix?.tipo, "modulo");
  });

  test("zona de viento modula el arriostramiento sin cruz", () => {
    const base = { kind: "muro", sistema: "steel", tipoMuro: "exterior", largo: 4000, alto: 2600, arriostramiento: "ninguno", opciones: OPC };
    assert.equal(de(predimensionar(base, { zona: "alta" }).checks, "Arriostramiento (viento)").estado, "fuera");
    assert.equal(de(predimensionar(base, { zona: "baja" }).checks, "Arriostramiento (viento)").estado, "atencion");
  });

  test("tabique NO se marca por viento ni anclaje", () => {
    const r = predimensionar({ kind: "muro", sistema: "steel", tipoMuro: "tabique", largo: 4000, alto: 2600,
      arriostramiento: "ninguno", opciones: { ...OPC, montPlaca: "Montante 70" } }, { zona: "alta" });
    assert.equal(de(r.checks, "Arriostramiento (viento)"), undefined);
    assert.equal(de(r.checks, "Anclaje a la fundación"), undefined);
  });
});

describe("pre-dimensionado · techo y piso", () => {
  test("techo: luz grande + pendiente baja → a revisar", () => {
    const r = predimensionar({ kind: "techo", sistema: "steel", luz: 8000, largo: 6000, pendiente: 15, opciones: OPC }, {});
    assert.equal(de(r.checks, "Luz de cabriada").estado, "atencion");
    assert.equal(de(r.checks, "Pendiente de techo").estado, "atencion");
  });

  test("techo: luz enorme → fuera", () => {
    const r = predimensionar({ kind: "techo", sistema: "steel", luz: 11000, largo: 6000, pendiente: 30, opciones: OPC }, {});
    assert.equal(de(r.checks, "Luz de cabriada").estado, "fuera");
    assert.equal(de(r.checks, "Pendiente de techo").estado, "ok");
  });

  test("piso: perfil chico para la luz → fuera", () => {
    const r = predimensionar({ kind: "piso", sistema: "steel", largo: 5000, ancho: 4200, opciones: OPC }, {});
    assert.equal(de(r.checks, "Luz de vigas de entrepiso").estado, "fuera");
  });

  test("piso: perfil adecuado para la luz → en rango", () => {
    const r = predimensionar({ kind: "piso", sistema: "steel", largo: 3000, ancho: 2500,
      opciones: { ...OPC, pgc: "PGC 100x0.90" } }, {});
    assert.equal(de(r.checks, "Luz de vigas de entrepiso").estado, "ok");
  });
});
