// F1 — tests del motor de entramado (Muro/Tabique con vanos, steel + wood).
// Cantidades calculadas a mano. Corre con: npx vitest run  (o npm test).
import { test } from "vitest";
import assert from "node:assert/strict";
import { computeProject, computeMaterials, buildPieces, cutPlan, resolveSystem, listModules } from "../src/engine/index.mjs";

const wall = (sistema, largo, alto, vanos = [], opciones = {}) => ({ sistema, largo, alto, vanos, opciones });
const grpCant = (cortes, tipo) => cortes.grupos.filter(g => g.tipo === tipo).reduce((a,g) => a + g.cant, 0);
const barras = (mat, prefijo) => (mat.perfiles.find(p => p.perfil.startsWith(prefijo)) || {}).barras;
const cuentaPorTipo = P => P.reduce((m,p) => ((m[p.tipo] = (m[p.tipo]||0) + 1), m), {});

// Config 1 — muro liso 3000×2600, sin vanos
for (const sis of ["steel","wood"]){
  test(`C1 ${sis}: 3000×2600 sin vanos`, () => {
    const { materiales, cortes } = computeProject(wall(sis, 3000, 2600));
    assert.equal(materiales.nVanos, 0);
    // (A) ceil(3000/400)+1 = 9: montante en cada línea de modulación + montante de cierre
    assert.equal(materiales.nMont, 9);
    assert.equal(grpCant(cortes, "MONTANTE"), 9);
    assert.equal(grpCant(cortes, "KING"), 0);
    assert.equal(grpCant(cortes, "DINTEL"), 0);
    // 1 solera inferior + top plates: steel 2 piezas, wood 3 (double top plate)
    assert.equal(grpCant(cortes, "SOL.PANEL"), sis === "wood" ? 3 : 2);
  });
}

// Config 2 — 3000×2600, 1 puerta 900×2050 (sill 0) en x 1000..1900
for (const sis of ["steel","wood"]){
  test(`C2 ${sis}: 1 puerta`, () => {
    const v = [{ x1:1000, x2:1900, h:2050, sill:0 }];
    const { materiales, cortes } = computeProject(wall(sis, 3000, 2600, v));
    assert.equal(materiales.nVanos, 1);
    assert.equal(materiales.nMont, 7);          // 9 - floor(900/400)=2
    assert.equal(grpCant(cortes, "MONTANTE"), 7);
    assert.equal(grpCant(cortes, "KING"), 2);
    assert.equal(grpCant(cortes, "JACK"), 2);
    assert.equal(grpCant(cortes, "DINTEL"), 2);
    assert.equal(grpCant(cortes, "CRIPPLE"), 2); // solo cripples superiores (puerta a piso, sin antepecho)
    // (B) puerta sin antepecho: no lleva solera de vano (durmiente)
    assert.equal(grpCant(cortes, "SOL.VANO"), 0);
  });
}

// Config 3 — 4000×2600, 1 ventana 1200 ancho, h 2100, sill 900, x 1400..2600
for (const sis of ["steel","wood"]){
  test(`C3 ${sis}: 1 ventana con antepecho`, () => {
    const v = [{ x1:1400, x2:2600, h:2100, sill:900 }];
    const { materiales, cortes } = computeProject(wall(sis, 4000, 2600, v));
    assert.equal(materiales.nVanos, 1);
    assert.equal(materiales.nMont, 8);          // ceil(4000/400)+1=11 - floor(1200/400)=3
    assert.equal(grpCant(cortes, "KING"), 2);
    assert.equal(grpCant(cortes, "DINTEL"), 2);
    // (B) cripples desde la geometría: 3 superiores + 2 antepecho (se excluyen las líneas de los jacks)
    assert.equal(grpCant(cortes, "CRIPPLE"), 5);
    // (B) ventana con antepecho: 1 durmiente (solera de vano). El dintel steel lleva su cap SOL.DINTEL aparte.
    assert.equal(grpCant(cortes, "SOL.VANO"), 1);
  });
}

// Config 4 — 5000×2600, puerta + ventana
for (const sis of ["steel","wood"]){
  test(`C4 ${sis}: puerta + ventana`, () => {
    const v = [{ x1:500, x2:1400, h:2050, sill:0 }, { x1:2500, x2:4000, h:2100, sill:900 }];
    const { materiales, cortes } = computeProject(wall(sis, 5000, 2600, v));
    assert.equal(materiales.nVanos, 2);
    // (B) nMont sale de la geometría: 14 líneas de grilla − 6 tapadas por vanos
    // (puerta 500–1400 tapa 2: 800,1200 · ventana 2500–4000 tapa 4: 2800,3200,3600,4000) = 8
    assert.equal(materiales.nMont, 8);
    assert.equal(grpCant(cortes, "KING"), 4);
    assert.equal(grpCant(cortes, "DINTEL"), 4);
  });
}

// Config 5 — ventana 1,20 × 1,10, antepecho 0,90 (sill 900, h = 900+1100 = 2000), muro 3000×2600
for (const sis of ["steel","wood"]){
  test(`C5 ${sis}: ventana con solera de vano`, () => {
    const v = [{ x1:900, x2:2100, h:2000, sill:900 }];
    const { materiales, cortes } = computeProject(wall(sis, 3000, 2600, v));
    assert.equal(materiales.nVanos, 1);
    // grilla 0..2800,3000 (9) − 3 líneas tapadas por el vano (1200,1600,2000) = 6
    assert.equal(materiales.nMont, 6);
    assert.equal(grpCant(cortes, "KING"), 2);
    assert.equal(grpCant(cortes, "DINTEL"), 2);
    // ventana CON antepecho → 1 solera de vano (durmiente). La puerta (C2) tiene 0.
    assert.equal(grpCant(cortes, "SOL.VANO"), 1);
    assert.equal(grpCant(cortes, "CRIPPLE"), 5); // 3 superiores + 2 de antepecho
  });
}

// Unidades de venta (barras) — bin-packing First-Fit
test("C1 steel: barras 6 m (PGC=5, PGU=1)", () => {
  const mat = computeMaterials(wall("steel", 3000, 2600));
  assert.equal(barras(mat, "PGC"), 5);          // 9 montantes de 2598 → 2 por barra → 5
  assert.equal(barras(mat, "PGU"), 1);          // 2 soleras de 3000 → 1 barra
  assert.equal(mat.barLen, 6000);
});

test("C1 wood: tiras 3,05 m (12 tiras)", () => {
  const mat = computeMaterials(wall("wood", 3000, 2600));
  // 9 montantes de 2486 (1 por tira) + 3 soleras de 3000 (1 por tira) = 12
  assert.equal(mat.perfiles.length, 1);         // montante y solera comparten escuadría
  assert.equal(mat.perfiles[0].piezas, 12);
  assert.equal(mat.perfiles[0].barras, 12);
  assert.equal(mat.barLen, 3050);
});

// Geometría: piezas 3D
test("buildPieces: muro liso genera 9 montantes + soleras", () => {
  const P = buildPieces(wall("steel", 3000, 2600));
  assert.equal(P.filter(p => p.tipo === "MONTANTE").length, 9);
  assert.ok(P.filter(p => p.tipo === "SOL.PANEL").length >= 2);
  assert.ok(P.every(p => p.largo > 0 && Array.isArray(p.pos) && p.pos.length === 3));
});

// (B) La lista de corte usa el largo de la geometría (cripple con cap PGU descontado, no el viejo 449)
test("Cripple: el largo del corte = el de la pieza (steel 380 / wood 334)", () => {
  const door = [{ x1:1050, x2:1950, h:2050, sill:0 }];
  for (const [sis, esperado] of [["steel", 380], ["wood", 334]]){
    const { piezas, cortes } = computeProject(wall(sis, 3000, 2600, door));
    const crGeo = piezas.find(p => p.tipo === "CRIPPLE").largo;
    const crCut = cortes.grupos.find(g => g.tipo === "CRIPPLE").largo;
    assert.equal(crGeo, esperado);
    assert.equal(crCut, crGeo);                 // corte === geometría (no puede divergir)
  }
});

// Placas y área
test("Placas: revestimiento interior descuenta el vano", () => {
  const v = [{ x1:1000, x2:1900, h:2050, sill:0 }];
  const mat = computeMaterials(wall("steel", 3000, 2600, v, { revInt:"Durlock 12.5" }));
  // área = 3*2.6 - 0.9*2.05 = 5.955 m² → placas = ceil(5.955/2.88)=3
  assert.equal(mat.area, 5.96);
  assert.equal(mat.placas.find(p => p.cara === "interior").unidades, 3);
});

// (F6) Registro de módulos: dispatch por kind, default muro
test("F6 módulos: registro + default muro", () => {
  assert.ok(listModules().map(m => m.id).includes("muro"));
  // sin kind → muro (compatibilidad con el MVP)
  const a = computeProject({ sistema:"steel", largo:3000, alto:2600, vanos:[], opciones:{ modulo:400 } });
  assert.equal(a.metadatos.nombre, "Muro / Tabique");
  assert.equal(a.metadatos.esquema, "frontal");
});

// (F4) Plan de corte: barras coinciden con el cómputo y cada pieza sale con su código, sin exceder la barra
test("cutPlan: barras == cómputo, piezas con código, sin exceder la barra", () => {
  const inp = { sistema:"steel", largo:5000, alto:2600, vanos:[{ x1:500, x2:1400, h:2050, sill:0 }, { x1:2500, x2:4000, h:2100, sill:900 }], opciones:{ modulo:400 } };
  const { piezas, materiales } = computeProject(inp);
  const plan = cutPlan(piezas, resolveSystem(inp).barLen);
  plan.forEach(pl => {
    const m = materiales.perfiles.find(p => p.perfil === pl.perfil);
    assert.equal(pl.bins.length, m.barras);                 // mismo nº de barras que el presupuesto
    pl.bins.forEach(b => {
      assert.ok(b.usado <= pl.barLen, `barra usa ${b.usado} > ${pl.barLen}`);
      b.items.forEach(it => assert.match(it.code, /^[A-Z]+\d+$/));
    });
  });
});

// (C) Paridad steel/wood: misma topología de entramado y mismas líneas de modulación (no coord. al mm)
test("Paridad steel/wood: topología + líneas de modulación", () => {
  const inp = sis => wall(sis, 4000, 2600, [{ x1:1400, x2:2600, h:2100, sill:900 }]);
  const st = computeProject(inp("steel")), wd = computeProject(inp("wood"));
  // entramado (todo lo que no es solera): mismas piezas por tipo. Las soleras difieren por sistema
  // (double top plate en wood, cap SOL.DINTEL solo en steel), así que se excluyen.
  const framing = P => cuentaPorTipo(P.filter(p => !p.tipo.startsWith("SOL.")));
  assert.deepEqual(framing(st.piezas), framing(wd.piezas));
  // montantes en las mismas líneas de modulación (tolerancia por ancho de perfil propio → redondeo a 10 mm)
  const lineas = P => P.filter(p => p.tipo === "MONTANTE").map(p => Math.round(p.pos[0]/10)*10).sort((a,b) => a - b);
  assert.deepEqual(lineas(st.piezas), lineas(wd.piezas));
  // el peso difiere (secciones distintas)
  assert.notEqual(st.materiales.peso, wd.materiales.peso);
});
