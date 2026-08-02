// Feature 3.2 — Fases de obra (timeline de montaje). Verifica que el orden y las etapas se deriven
// del modelo real (computeProject) y respeten la secuencia de armado.
import { test, describe } from "vitest";
import assert from "node:assert/strict";
import { fasesDeObra } from "../src/engine/fases.mjs";

const OPC = { pgc: "PGC 100x0.90", pgu: "PGU 100x0.90", lumber: "2x6 (38×140)", modulo: 400 };
const ids = fases => fases.map(f => f.id);

describe("fases de obra", () => {
  test("muro: soleras → montantes → aberturas → arriostres, en ese orden", () => {
    const { fases } = fasesDeObra({ kind: "muro", sistema: "steel", tipoMuro: "exterior", largo: 4000, alto: 2600,
      arriostramiento: "cruz", vanos: [{ tipo: "puerta", x1: 900, x2: 1800, h: 2050, sill: 0 }], opciones: OPC });
    assert.deepEqual(ids(fases), ["soleras", "montantes", "vanos", "arriostre"]);
    fases.forEach((f, i) => assert.equal(f.orden, i + 1)); // orden correlativo
    assert.ok(fases.every(f => f.piezas > 0));            // no hay fases vacías
  });

  test("combinado completo: fundación primero, cubierta y cielo al final", () => {
    const { fases } = fasesDeObra({ kind: "combinado", sistema: "steel", largo: 6000, ancho: 4000, alto: 2600,
      apoyo: "platea", placa: true, vanoFrente: [{ tipo: "puerta", x1: 2500, x2: 3400, h: 2050, sill: 0 }],
      llevaTecho: true, techoTipo: "dosAguas", techoCubierta: true, llevaCielo: true, opciones: OPC });
    const orden = ids(fases);
    assert.equal(orden[0], "fundacion");
    assert.ok(orden.indexOf("techo") < orden.indexOf("cubierta"));   // techo antes de la chapa
    assert.ok(orden.indexOf("montantes") < orden.indexOf("techo"));  // muros antes del techo
    assert.equal(orden[orden.length - 1], "cielo");                  // cielorraso último
  });

  test("la fundación refleja el tipo de apoyo elegido", () => {
    const platea = fasesDeObra({ kind: "combinado", sistema: "steel", largo: 4000, ancho: 3000, alto: 2600, apoyo: "platea", opciones: OPC });
    const pilo = fasesDeObra({ kind: "combinado", sistema: "steel", largo: 4000, ancho: 3000, alto: 2600, apoyo: "pilotines", opciones: OPC });
    assert.match(platea.fases.find(f => f.id === "fundacion").nota, /[Pp]latea/);
    assert.match(pilo.fases.find(f => f.id === "fundacion").nota, /[Pp]ilotines/);
  });

  test("techo suelto: sin muros, arranca por el techo", () => {
    const { fases } = fasesDeObra({ kind: "techo", sistema: "steel", tipo: "dosAguas", luz: 4000, largo: 6000, pendiente: 25, cubierta: true, opciones: OPC });
    assert.ok(ids(fases).includes("techo"));
    assert.ok(!ids(fases).includes("montantes"));
  });
});
