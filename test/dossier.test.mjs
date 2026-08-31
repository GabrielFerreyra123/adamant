// Dossier de cumplimiento — entregable premium para el profesional que revisa y firma. NO calcula:
// ordena identificación + datos de sitio (clima) + resultados del semáforo + supuestos/descargo + un
// bloque de firma. Método (D0): se extrae el texto del PDF y se LEE que estén las piezas que importan.
import { test, describe, expect, beforeAll } from "vitest";
import { exportDossier } from "../src/export/dossier.mjs";

const OPC = { pgc: "PGC 100x0.90", pgu: "PGU 100x0.90", modulo: 400 };
const MURO = { kind: "muro", sistema: "steel", tipoMuro: "exterior", largo: 4000, alto: 2600,
  vanos: [{ x1: 900, x2: 1800, h: 2050, sill: 0 }], arriostramiento: "cruz", opciones: OPC };
const CLIMA = { ciudad: "bahiablanca", zonaViento: "alta", nieve: "baja", zonaBio: "IV" };

async function dossierText(input, opts){
  const { doc } = await exportDossier(input, { ...opts, out: "buffer" });
  return Buffer.from(doc.output("arraybuffer")).toString("latin1");
}

let txt;
beforeAll(async () => { txt = await dossierText(MURO, { clima: CLIMA }); });

describe("dossier · contenido para el profesional", () => {
  test("lleva el descargo: Adamant dibuja, no calcula (regla 4)", () => {
    expect(txt).toMatch(/no calcula|profesional habilitado/i);
  });
  test("declara los datos de sitio usados (ciudad + zona bioambiental)", () => {
    expect(txt).toMatch(/Bah/);   // Bahía Blanca
    expect(txt).toMatch(/\bIV\b/); // zona bioambiental IV
  });
  test("las medidas usan coma decimal (es-AR), consistente con el resto del entregable", () => {
    expect(txt).toMatch(/4,00 × 2,60 m/);
  });
  test("incluye los resultados del pre-dimensionado (semáforo)", () => {
    expect(txt).toMatch(/pre-?dimensionad/i);
    expect(txt).toMatch(/arriostr/i); // el chequeo de arriostramiento del muro exterior
  });
  test("los rangos del semáforo se leen sin glifos rotos (≤ no está en la fuente del PDF)", () => {
    // El rango de altura ("...típico ≤ 2,80 m") tiene que quedar contiguo, no 'p o r t a n t e' por
    // un glifo que jsPDF no puede componer.
    expect(txt).toMatch(/2,80 m/);
    expect(txt).not.toContain("≤");
  });
  test("tiene bloque de revisión profesional: normas + firma + matrícula", () => {
    expect(txt).toMatch(/CIRSOC/);
    expect(txt).toMatch(/IRAM/);
    expect(txt).toMatch(/firma/i);
    expect(txt).toMatch(/matr[ií]cula/i);
  });
  test("nombre de archivo .pdf de dossier", async () => {
    const { nombre } = await exportDossier(MURO, { clima: CLIMA, out: "buffer" });
    expect(nombre).toMatch(/dossier.*\.pdf$/i);
  });
});

describe("dossier · robustez", () => {
  test("sin clima no rompe y mantiene el descargo (defaults)", async () => {
    const t = await dossierText(MURO, {});
    expect(t).toMatch(/no calcula|profesional habilitado/i);
  });
  test("funciona para un ambiente completo", async () => {
    const amb = { kind: "combinado", sistema: "wood", largo: 5000, ancho: 4000, alto: 2600, apoyo: "platea",
      placa: true, opciones: OPC, vanoFrente: [], vanoFondo: [], vanoIzq: [], vanoDer: [], llevaTecho: true,
      techoTipo: "dosAguas", techoPendiente: 30 };
    const t = await dossierText(amb, { clima: { ciudad: "bariloche", zonaViento: "alta", nieve: "alta", zonaBio: "VI" } });
    expect(t).toMatch(/Baril/);
    expect(t).toMatch(/firma/i);
  });
});
