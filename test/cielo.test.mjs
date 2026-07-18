// Cielorraso suspendido de DOS NIVELES — tests del motor. Cantidades a mano.
// Solera (PGU perimetral) + Montante (PGC, plano inferior, cada 0,40) + Viga maestra (continua, plano
// superior, cada 1,20) + Vela (vertical, cuelga de la losa, cada 1,00 sobre cada maestra).
import { test } from "vitest";
import assert from "node:assert/strict";
import { cielo } from "../src/engine/modules/cielo.mjs";
import { optimizeCuts } from "../src/engine/cuts.mjs";
import { pieceBoxEngine } from "../src/viewer/geometry.js";

const PERFIL = "Solera/montante 70";
const MONT = 400, FL = 30, ALMA = 70, BORDE = 600;
const ceil = (largo, ancho) => ({ sistema: "steel", largo, ancho, alt: 2600, suspension: 400, modulo: MONT, opciones: { perfil: PERFIL } });
const cnt = (P, t) => P.filter(p => p.tipo === t).length;
const centros = (P, t, ejeIdx) => [...new Set(P.filter(p => p.tipo === t).map(p => p.pos[ejeIdx] + FL / 2))].sort((a, b) => a - b);

// Maestras y velas CENTRADAS (no desde el borde). Conteos a mano:
//   2×2: luz 2,0 ≤ 2·0,6+1,0=2,2 → sin maestras ni velas.
//   3×3: maestras 2 (centros 1000,2000), velas/maestra 2 (1000,2000) → 4 velas.
//   4×5: maestras 3 (centros 1000,2000,3000), velas/maestra 4 (1000..4000) → 12 velas.
const casos = [
  // nombre, largo, ancho, montantes, maestras, velas/maestra
  ["2×2", 2000, 2000, 4,  0, 0],
  ["3×3", 3000, 3000, 7,  2, 2],
  ["4×5", 4000, 5000, 12, 3, 4]
];
for (const [nombre, L, W, nMont, nMaestra, velaPorM] of casos){
  test(`cielo ${nombre}: conteos (rigidización centrada)`, () => {
    const { piezas, metadatos } = cielo.generar(ceil(L, W));
    assert.equal(cnt(piezas, "SOLERA"), 4, "4 soleras perimetrales");
    assert.equal(cnt(piezas, "MONTANTE"), nMont, "montantes");
    assert.equal(cnt(piezas, "MONTANTE") + 2, Math.ceil(W / MONT) + 1, "grillado montantes = ceil(ancho/0,40)+1");
    assert.equal(cnt(piezas, "MAESTRA"), nMaestra, "maestras centradas");
    assert.equal(metadatos.nVelaPorMaestra, velaPorM, "velas por maestra");
    assert.equal(cnt(piezas, "VELA"), nMaestra * velaPorM, "velas = maestras × velas/maestra");
  });
}

// 2×2: la solera sola alcanza (sin rigidización central).
test("cielo 2×2: sin maestras ni velas (solera perimetral alcanza)", () => {
  const P = cielo.generar(ceil(2000, 2000)).piezas;
  assert.equal(cnt(P, "MAESTRA"), 0);
  assert.equal(cnt(P, "VELA"), 0);
});

// 4×5: simetría respecto del centro, separaciones máximas, y borde libre (nada dentro de BORDE_LIBRE).
test("cielo 4×5: maestras/velas simétricas, sep ≤ máx, y fuera de la franja de borde", () => {
  const P = cielo.generar(ceil(4000, 5000)).piezas;
  const mx = centros(P, "MAESTRA", 0);          // centros de maestras en X
  const vy = centros(P, "VELA", 1);             // posiciones Y de velas (por maestra, mismas en todas)
  // simetría respecto del centro de la luz
  const simetrico = (arr, span) => arr.every((v, i) => Math.abs(v + arr[arr.length - 1 - i] - span) < 1);
  assert.ok(simetrico(mx, 4000), `maestras simétricas en X: ${mx}`);
  assert.ok(simetrico(vy, 5000), `velas simétricas en Y: ${vy}`);
  // separaciones máximas
  const maxGap = arr => Math.max(...arr.slice(1).map((v, i) => v - arr[i]));
  assert.ok(maxGap(mx) <= 1200 + 1, "separación de maestras ≤ 1,20 m");
  assert.ok(maxGap(vy) <= 1000 + 1, "separación de velas ≤ 1,00 m");
  // borde libre: ninguna maestra/vela a menos de BORDE_LIBRE de las soleras
  assert.ok(mx[0] >= BORDE && mx[mx.length - 1] <= 4000 - BORDE, "maestras fuera de la franja de borde (X)");
  assert.ok(vy[0] >= BORDE && vy[vy.length - 1] <= 5000 - BORDE, "velas fuera de la franja de borde (Y)");
});

// Largos y planos: soleras a tope, montantes encastrados (inferior), maestras continuas (superior).
test("cielo 4×5: largos y dos planos (inferior montantes / superior maestras)", () => {
  const { piezas } = cielo.generar(ceil(4000, 5000));
  const sol = piezas.filter(p => p.tipo === "SOLERA");
  assert.deepEqual(sol.filter(p => p.axis === "x").map(p => p.largo).sort(), [4000, 4000], "soleras en X completas");
  assert.deepEqual(sol.filter(p => p.axis === "y").map(p => p.largo).sort(), [5000 - 2 * FL, 5000 - 2 * FL], "soleras en Y = ancho − 2·fl");
  const m = piezas.find(p => p.tipo === "MONTANTE");
  assert.equal(m.largo, 4000 - 2 * FL, "montante encastrado = largo − 2·fl");
  assert.equal(m.pos[2], 0, "montantes en el plano inferior (z=0)");
  const vm = piezas.find(p => p.tipo === "MAESTRA");
  assert.equal(vm.largo, 5000, "maestra continua = ancho completo");
  assert.equal(vm.pos[2], ALMA, "maestras en el plano superior (z = alma)");
  const vela = piezas.find(p => p.tipo === "VELA");
  assert.equal(vela.largo, 400, "vela = suspensión");
  assert.equal(vela.axis, "z");
  assert.equal(vela.pos[2], 2 * ALMA, "velas nacen del plano superior hacia la losa");
});

// AABB: nada se interpenetra; los dos niveles (z 0..alma y alma..2·alma) sólo se TOCAN en z=alma.
for (const [nombre, L, W] of [["3×3", 3000, 3000], ["4×5", 4000, 5000]]){
  test(`cielo ${nombre}: AABB — dos niveles se tocan, no se interpenetran`, () => {
    const P = cielo.generar(ceil(L, W)).piezas;
    const box = p => { const { size, center } = pieceBoxEngine(p); return [0,1,2].map(i => [center[i]-size[i]/2, center[i]+size[i]/2]); };
    const bs = P.map(box), eps = 0.5;
    const solapa = (a, b) => [0,1,2].every(i => a[i][0] < b[i][1] - eps && b[i][0] < a[i][1] - eps);
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++)
      assert.ok(!solapa(bs[i], bs[j]), `${P[i].tipo}#${i} y ${P[j].tipo}#${j} se interpenetran`);
    // el plano de montantes llega hasta z=alma; el de maestras arranca en z=alma (contacto, no solape)
    const maxMont = Math.max(...P.filter(p => p.tipo === "MONTANTE").map(p => box(p)[2][1]));
    const minMaestra = Math.min(...P.filter(p => p.tipo === "MAESTRA").map(p => box(p)[2][0]));
    assert.equal(maxMont, minMaestra, "los dos niveles se tocan en z = alma");
  });
}

// Materiales/cortes: maestras = barras largas (First-Fit con barLen del perfil, 3 m); velas = recortes,
// cantidad = suma sobre maestras de ceil(ancho/1,00).
test("cielo 4×5: materiales (barra 3 m, fija-vela = nVelas, T1 con cruces)", () => {
  const inp = ceil(4000, 5000);
  const m = cielo.materiales(cielo.generar(inp).piezas, inp);
  assert.ok(m.perfiles.every(p => p.largoBarra === 3000), "perfil de cielorraso en barra de 3 m");
  assert.equal(m.otros.find(o => o.key === "fija-vela").cantidad, 12, "una fijación por vela (3 maestras × 4)");
  assert.equal(m.tornillos.t1, 12 * 3 + 12 + 12 * 2, "T1 = cruces montante·maestra + velas + montante·2");
  assert.ok(m.area === 20 && m.peso > 0);
  assert.ok(m.perfiles[0].sobrantes > 0, "maestras de 5 m > barra de 3 m → empalme");
});

// La optimización usa el largo de barra DE CADA PERFIL: PGC 6 m junto a riel de cielorraso 3 m.
test("optimizeCuts: barra por perfil (PGC 6 m vs riel cielorraso 3 m)", () => {
  const out = optimizeCuts({ "PGC 100x0.90": [5800, 5800], [PERFIL]: [2600, 2600] }, {});
  assert.equal(out.find(o => o.perfil.startsWith("PGC")).barLen, 6000);
  assert.equal(out.find(o => o.perfil === PERFIL).barLen, 3000);
});
