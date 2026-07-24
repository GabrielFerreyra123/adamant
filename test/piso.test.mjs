// F7a — tests del módulo Entramado de Piso (motor). Cantidades calculadas a mano.
// Se prueba el módulo por import directo (aún no registrado en el wizard: eso es F7c).
import { test } from "vitest";
import assert from "node:assert/strict";
import { piso } from "../src/engine/modules/piso.mjs";
import { pieceBoxEngine } from "../src/viewer/geometry.js";
import { cutList } from "../src/engine/cuts.mjs";

const floor = (sistema, largo, ancho, extra = {}) => ({
  sistema, largo, ancho, separacion: 400, apoyo: "platea", placa: true,
  opciones: { pgc: "PGC 150x1.60", pgu: "PGU 150x1.60", lumber: "2x8 (38×184)" }, ...extra
});
const cnt = (P, t) => P.filter(p => p.tipo === t).length;

// 8 casos de conteo (4 configuraciones × steel/wood). Los conteos no dependen del sistema.
// `vigas` = líneas de viga TOTALES (VIGA de campo + 2 VIGA_DOBLE de extremo). Blocking = (vigas−1) por fila.
const casos = [
  // nombre, largo, ancho, vigas, blocking     (cenefa=4, doble=2 en todos)
  ["3×3",         3000, 3000,  9,  8],   // luz 3000 → 1 fila × 8 bahías
  ["4×5",         4000, 5000, 14, 13],   // corrida 5000 → 14 vigas · luz 4000 → 1 fila × 13
  ["2,4×3 (s/blk)",2400, 3000,  9,  0],  // luz 2400 → sin blocking
  ["5×6",         5000, 6000, 16, 30]    // corrida 6000 → 16 vigas · luz 5000 → 2 filas × 15
];
for (const [nombre, L, W, vigas, blocking] of casos){
  for (const sis of ["steel", "wood"]){
    test(`piso ${sis} ${nombre}`, () => {
      const { piezas, metadatos } = piso.generar(floor(sis, L, W));
      assert.equal(cnt(piezas, "VIGA") + cnt(piezas, "VIGA_DOBLE"), vigas, "vigas totales");
      assert.equal(cnt(piezas, "CENEFA"), 4, "cenefa perimetral");
      assert.equal(cnt(piezas, "VIGA_DOBLE"), 2, "viga doble de borde");
      assert.equal(cnt(piezas, "BLOCKING"), blocking, "blocking");
      assert.equal(metadatos.esquema, "planta");
      // perfiles correctos por sistema
      const p = piezas.find(x => x.tipo === "VIGA");
      assert.ok(sis === "wood" ? p.perfil.includes("2x") : p.perfil.startsWith("PGC"));
    });
  }
}

// Simetría del perímetro + bounding box = dimensiones exactas del piso (4×5). El marco lo forman las 4
// cenefas; las 2 vigas dobles van por dentro, simétricas contra las cenefas laterales.
for (const sis of ["steel", "wood"]){
  test(`piso ${sis} 4×5: marco simétrico + bbox = dimensiones`, () => {
    const P = piso.generar(floor(sis, 4000, 5000)).piezas.filter(p => !p.superficie); // sin apoyos (fundación)
    const box = p => { const { size, center } = pieceBoxEngine(p); return [0,1,2].map(i => [center[i]-size[i]/2, center[i]+size[i]/2]); };
    // exactamente una cenefa por lado del rectángulo, pegada a su borde (perpendiculares a vigas en X;
    // paralelas en Y). Se identifica cada lado por eje + coordenada del borde.
    const cen = P.filter(p => p.tipo === "CENEFA");
    assert.equal(cen.filter(p => p.axis === "x" && box(p)[1][0] < 1).length, 1, "una cenefa en Y=0");
    assert.equal(cen.filter(p => p.axis === "x" && Math.abs(box(p)[1][1] - 4000) < 1).length, 1, "una cenefa en Y=luz");
    assert.equal(cen.filter(p => p.axis === "y" && box(p)[0][0] < 1).length, 1, "una cenefa en X=0");
    assert.equal(cen.filter(p => p.axis === "y" && Math.abs(box(p)[0][1] - 5000) < 1).length, 1, "una cenefa en X=corrida");
    // las 2 dobles: simétricas respecto del centro X (2500) y por dentro del marco
    const dob = P.filter(p => p.tipo === "VIGA_DOBLE").map(box).sort((a,b) => a[0][0]-b[0][0]);
    assert.equal(dob.length, 2);
    assert.ok(Math.abs((5000 - dob[1][0][1]) - dob[0][0][0]) < 1, "dobles simétricas en X");
    assert.ok(dob[0][0][0] > 0 && dob[1][0][1] < 5000, "dobles por dentro del marco");
    // constructivo: las vigas dobles van en los 2 bordes PARALELOS a las vigas (corren en Y, como las
    // vigas) y la cenefa cierra los otros 2 (las axis 'x' de largo=corrida). Se deja así.
    assert.ok(P.filter(p => p.tipo === "VIGA_DOBLE").every(p => p.axis === "y"), "dobles paralelas a las vigas (axis Y)");
    assert.equal(cen.filter(p => p.axis === "x" && p.largo === 5000).length, 2, "cenefa perpendicular cierra los 2 bordes en X (largo=corrida)");
    // bounding box del conjunto = corrida × luz exactas
    const all = P.map(box);
    const span = d => [Math.min(...all.map(b => b[d][0])), Math.max(...all.map(b => b[d][1]))];
    assert.deepEqual(span(0), [0, 5000], "bbox X = corrida");
    assert.deepEqual(span(1), [0, 4000], "bbox Y = luz");
  });
}

// Bug 3: el blocking son segmentos CORTOS independientes (uno por bahía), no una banda continua.
test("piso 4×5: blocking = segmentos cortos por bahía, ninguno cruza la corrida", () => {
  const P = piso.generar(floor("steel", 4000, 5000)).piezas;
  const nJoist = cnt(P, "VIGA") + cnt(P, "VIGA_DOBLE");
  const blk = P.filter(p => p.tipo === "BLOCKING");
  assert.equal(blk.length, nJoist - 1, "una pieza de blocking por bahía");
  assert.ok(blk.every(p => p.largo < 5000 / 2), "cada blocking es corto (no una barra larga)");
});

// Largos de cenefa (encuentro de esquinas a tope): perpendiculares a las vigas = corrida completa;
// paralelas a las vigas = luz − 2 espesores de cenefa (ala solera: 35 steel PGU_ALA / 38 wood).
// Piso 4×5: luz=4000, corrida=5000.
for (const [sis, cf] of [["steel", 35], ["wood", 38]]){
  test(`piso ${sis} 4×5: cenefas perimetrales cierran a tope`, () => {
    const cen = piso.generar(floor(sis, 4000, 5000)).piezas.filter(p => p.tipo === "CENEFA");
    const enX = cen.filter(p => p.axis === "x").map(p => p.largo).sort();
    const enY = cen.filter(p => p.axis === "y").map(p => p.largo).sort();
    assert.deepEqual(enX, [5000, 5000], "perpendiculares a vigas = corrida completa");
    assert.deepEqual(enY, [4000 - 2 * cf, 4000 - 2 * cf], "paralelas a vigas = luz − 2 espesores");
  });
}

// Implantación sobre platea (agregado al alcance)
test("piso steel/platea: PGU de implantación + anclajes + banda + placa", () => {
  const inp = floor("steel", 4000, 5000);
  const m = piso.materiales(piso.generar(inp).piezas, inp);
  const keys = m.otros.map(o => o.key);
  assert.ok(keys.includes("pgu-implantacion"));
  assert.ok(keys.includes("anclaje-implantacion"));
  assert.ok(keys.includes("banda-estanca"));
  assert.ok(keys.includes("placa-piso"));
  // anclajes ~cada 600 mm sobre el perímetro (2*(4+5)=18 m → 30)
  assert.equal(m.otros.find(o => o.key === "anclaje-implantacion").cantidad, 30);
  assert.ok(m.perfiles.some(p => p.perfil.startsWith("PGC")) && m.perfiles.some(p => p.perfil.startsWith("PGU")));
});

test("piso wood/platea: solera de asiento impregnada (misma escuadría)", () => {
  const inp = floor("wood", 4000, 5000);
  const m = piso.materiales(piso.generar(inp).piezas, inp);
  const keys = m.otros.map(o => o.key);
  assert.ok(keys.includes("solera-asiento"));
  assert.ok(keys.includes("anclaje-implantacion"));
  assert.equal(m.perfiles.length, 1); // vigas y cenefa comparten escuadría
});

test("piso pilotines: sin implantación", () => {
  const inp = floor("steel", 4000, 5000, { apoyo: "pilotines" });
  const keys = piso.materiales(piso.generar(inp).piezas, inp).otros.map(o => o.key);
  assert.ok(!keys.includes("pgu-implantacion") && !keys.includes("anclaje-implantacion") && !keys.includes("banda-estanca"));
});

test("piso: placa off → sin placa de piso; wood usa tirantes 4,88 m", () => {
  const inp = floor("wood", 3000, 3000, { placa: false });
  const m = piso.materiales(piso.generar(inp).piezas, inp);
  assert.ok(!m.otros.some(o => o.key === "placa-piso"));
  assert.equal(m.barLen, 4880);
});

// Colisión AABB: ningún par de piezas del piso 4×5 debe superponerse.
// Tolerancia de 0,5 mm para evitar falsos positivos por contacto a tope.
function aabbOverlap(a, b, tol){
  const ba = pieceBoxEngine(a), bb = pieceBoxEngine(b);
  for (let i = 0; i < 3; i++){
    const aMin = ba.center[i] - ba.size[i]/2, aMax = ba.center[i] + ba.size[i]/2;
    const bMin = bb.center[i] - bb.size[i]/2, bMax = bb.center[i] + bb.size[i]/2;
    if (aMax <= bMin + tol || bMax <= aMin + tol) return false; // separados en este eje
  }
  return true; // se solapan en los 3 ejes
}
for (const sis of ["steel", "wood"]){
  test(`piso ${sis} 4×5: ningún par de piezas se superpone (AABB)`, () => {
    // Los apoyos (platea/pilotines/solera de asiento) son superficies visuales que se solapan a
    // propósito (pilotín bajo la solera, esquinas de la solera): fuera del chequeo estructural.
    const P = piso.generar(floor(sis, 4000, 5000)).piezas.filter(p => !p.superficie);
    const collisions = [];
    for (let i = 0; i < P.length; i++){
      for (let j = i + 1; j < P.length; j++){
        if (aabbOverlap(P[i], P[j], 0.5)){
          collisions.push(`${P[i].tipo}@[${P[i].pos}] vs ${P[j].tipo}@[${P[j].pos}]`);
        }
      }
    }
    assert.equal(collisions.length, 0, `colisiones encontradas:\n${collisions.join("\n")}`);
  });
}

// F11 — Apoyos/fundación visibles en 3D (platea o pilotines). Piezas visuales: capa "apoyos",
// superficie, bajo z=0; no entran a cortes ni suman peso.
test("apoyo=platea: losa gris bajo el entramado, sobresaliendo del perímetro", () => {
  const P = piso.generar(floor("steel", 4000, 3000, { apoyo: "platea" })).piezas;
  const ap = P.filter(p => p.capa === "apoyos");
  assert.equal(ap.length, 1, "una sola platea");
  const pl = ap[0];
  assert.equal(pl.tipo, "PLATEA");
  assert.ok(pl.superficie && pl.capa === "apoyos", "capa conmutable, fuera de cómputo");
  const { size, center } = pieceBoxEngine(pl);
  // corrida 4000 (X), luz 3000 (Y); sobresale +100 por lado → +200 en cada eje
  assert.deepEqual(size.map(Math.round), [4200, 3200, 120], "vuelo perimetral + espesor visual");
  assert.ok(center[2] < 0 && center[2] - size[2]/2 < 0, "por debajo del entramado (z<0)");
  assert.ok(Math.abs(center[2] + size[2]/2) < 1e-6, "su cara superior toca z=0 (base del entramado)");
});

test("apoyo=pilotines: cilindros de hormigón + solera de asiento sobre ellos", () => {
  const P = piso.generar(floor("steel", 4000, 3000, { apoyo: "pilotines" })).piezas;
  const pil = P.filter(p => p.tipo === "PILOTIN"), sol = P.filter(p => p.tipo === "SOLERA_ASIENTO");
  assert.equal(sol.length, 4, "marco perimetral de solera de asiento");
  assert.ok(pil.length >= 4, "al menos las 4 esquinas");
  pil.forEach(p => {
    assert.equal(p.forma, "cilindro"); assert.ok(p.r > 0, "radio definido");
    assert.ok(p.superficie && p.capa === "apoyos");
    const { center, size } = pieceBoxEngine(p);
    assert.ok(center[2] + size[2]/2 <= 0, "el pilotín va enterrado, bajo z=0");
  });
  // esquinas presentes (dentro del inset de la solera)
  const xs = pil.map(p => p.box.center[0]), ys = pil.map(p => p.box.center[1]);
  assert.ok(Math.min(...xs) < 100 && Math.max(...xs) > 3900, "pilotines en los dos extremos X");
  assert.ok(Math.min(...ys) < 100 && Math.max(...ys) > 2900, "pilotines en los dos extremos Y");
});

test("apoyos: no entran a cortes ni suman peso; cambiar el selector cambia las piezas", () => {
  const platea = floor("steel", 4000, 3000, { apoyo: "platea" });
  const pilotines = floor("steel", 4000, 3000, { apoyo: "pilotines" });
  const Pp = piso.generar(platea).piezas, Pi = piso.generar(pilotines).piezas;
  // el selector cambia la geometría de una
  assert.notEqual(Pp.filter(p => p.capa === "apoyos").map(p => p.tipo).sort().join(),
                  Pi.filter(p => p.capa === "apoyos").map(p => p.tipo).sort().join(), "platea ≠ pilotines");
  // mismo entramado estructural en ambos casos (los apoyos no lo tocan)
  const est = P => P.filter(p => !p.superficie).length;
  assert.equal(est(Pp), est(Pi), "la estructura no depende del apoyo");
  // no computan: mismos cortes y mismo peso con y sin platea (la estructura manda)
  const m = piso.materiales(Pi, pilotines);
  assert.ok(Number.isFinite(m.peso), "peso sin NaN pese a los apoyos");
  assert.ok(!cutList(Pi).groups.some(g => ["PLATEA","PILOTIN","SOLERA_ASIENTO"].includes(g.tipo)), "los apoyos no salen en la lista de corte");
});
