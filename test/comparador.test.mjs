// Feature 3.3 — Comparador de sistemas (steel · wood · tradicional). Verifica que el costo de estructura
// y el peso de steel/wood sean reales (de computeProject) y que la construcción en seco gane en tiempo/peso.
import { test, describe } from "vitest";
import assert from "node:assert/strict";
import { comparar } from "../src/engine/comparador.mjs";

const OPC = { pgc: "PGC 100x0.90", pgu: "PGU 100x0.90", lumber: "2x6 (38×140)", modulo: 400 };
const combinado = (extra = {}) => ({ kind: "combinado", sistema: "steel", largo: 6000, ancho: 4000, alto: 2600,
  apoyo: "platea", placa: true, vanoFrente: [{ tipo: "puerta", x1: 2500, x2: 3400, h: 2050, sill: 0 }],
  llevaTecho: true, techoTipo: "dosAguas", techoCubierta: true, opciones: OPC, ...extra });

describe("comparador de sistemas", () => {
  test("área de obra = planta del ambiente", () => {
    const r = comparar(combinado());
    assert.equal(r.area, +(6000 * 4000 / 1e6).toFixed(1)); // 24 m²
  });

  test("costo y peso de estructura reales (>0) para steel y wood", () => {
    const r = comparar(combinado());
    assert.ok(r.sistemas.steel.estructura > 0 && r.sistemas.wood.estructura > 0);
    assert.ok(r.sistemas.steel.peso > 0 && r.sistemas.wood.peso > 0);
    assert.equal(r.sistemas.tradicional.estructura, null); // Adamant no computa mampostería
  });

  test("el steel pesa mucho menos que la estructura tradicional", () => {
    const r = comparar(combinado());
    assert.ok(r.sistemas.steel.peso < r.sistemas.tradicional.peso / 2);
  });

  test("la obra en seco tarda menos que la tradicional", () => {
    const r = comparar(combinado());
    assert.ok(r.sistemas.steel.dias < r.sistemas.tradicional.dias);
    assert.ok(r.destacados.length >= 2);
  });

  test("wood y steel dan costos de estructura distintos (misma geometría, otra escuadría)", () => {
    const r = comparar(combinado());
    assert.notEqual(r.sistemas.steel.estructura, r.sistemas.wood.estructura);
  });
});
