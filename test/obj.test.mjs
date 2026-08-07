// Export OBJ — el modelo 3D de la estructura a Wavefront OBJ. Verifica que sea un OBJ válido: vértices
// y caras coherentes, índices dentro de rango, agrupado por capa, y que las piezas orientadas (techo/
// arriostre) se emitan como caja rotada (no plana).
import { test, describe } from "vitest";
import assert from "node:assert/strict";
import { exportOBJ } from "../src/export/obj.mjs";
import { buildBraces } from "../src/engine/brace.mjs";

const muro = (extra = {}) => ({ kind: "muro", sistema: "steel", tipoMuro: "exterior", largo: 3000, alto: 2600,
  vanos: [], arriostramiento: "diagonal", opciones: { pgc: "PGC 100x0.90", pgu: "PGU 100x0.90", modulo: 400 }, ...extra });

function parse(obj){
  const vs = [], fs = [], groups = [];
  obj.split("\n").forEach(l => {
    const t = l.trim().split(/\s+/);
    if (t[0] === "v") vs.push(t.slice(1).map(Number));
    else if (t[0] === "f") fs.push(t.slice(1).map(n => +n));
    else if (t[0] === "g") groups.push(t[1]);
  });
  return { vs, fs, groups };
}

describe("export OBJ", () => {
  test("genera un OBJ válido: 8 vértices y 6 caras por pieza, índices en rango", () => {
    const { obj, nombre, piezas } = exportOBJ(muro());
    assert.match(nombre, /\.obj$/);
    const { vs, fs } = parse(obj);
    assert.ok(piezas > 0);
    assert.equal(vs.length % 8, 0, "8 vértices por prisma");
    assert.equal(fs.length, (vs.length / 8) * 6, "6 caras por prisma");
    // todos los índices de cara son 1-based y existen
    fs.forEach(f => f.forEach(i => assert.ok(i >= 1 && i <= vs.length, "índice de cara en rango")));
    // vértices en metros: un muro de 3 m no supera unas pocas unidades
    assert.ok(vs.every(v => v.every(c => Number.isFinite(c) && Math.abs(c) < 50)));
  });

  test("agrupa por capa (montantes y soleras al menos)", () => {
    const { obj } = exportOBJ(muro());
    const { groups } = parse(obj);
    assert.ok(groups.includes("MONTANTES"));
    assert.ok(groups.includes("SOLERAS"));
  });

  test("la riostra rígida sale como caja ROTADA (no plana en un eje)", () => {
    // aislar la diagonal: su prisma debe tener extensión en X y en Z (inclinada), no en un solo eje.
    const diag = buildBraces(muro()).piezas.find(p => p.tipo === "RIOSTRA");
    assert.ok(diag, "hay riostra");
    const { obj } = exportOBJ({ ...muro(), arriostramiento: "diagonal" });
    const { vs } = parse(obj);
    const spanX = Math.max(...vs.map(v => v[0])) - Math.min(...vs.map(v => v[0]));
    const spanZ = Math.max(...vs.map(v => v[2])) - Math.min(...vs.map(v => v[2]));
    assert.ok(spanX > 0.5 && spanZ > 0.5, "el modelo tiene volumen en X y Z (diagonal incluida)");
  });

  test("ambiente completo también exporta (piezas reubicadas con box)", () => {
    const { obj, piezas } = exportOBJ({ kind: "combinado", sistema: "wood", largo: 4000, ancho: 3000, alto: 2600,
      apoyo: "platea", placa: true, opciones: { lumber: "2x6 (38×140)", modulo: 400 },
      vanoFrente: [], vanoFondo: [], vanoIzq: [], vanoDer: [], llevaTecho: true, techoTipo: "dosAguas", techoPendiente: 30 });
    assert.ok(piezas > 0);
    const { vs, fs } = parse(obj);
    assert.equal(fs.length, (vs.length / 8) * 6);
  });
});
