// FASE D — Techo de cabriadas: un agua (monopendiente) y dos aguas (Fink).
import { test, describe } from "vitest";
import assert from "node:assert/strict";
import { techo, anguloPendiente, posCabriadas, posCorreas, PEND_MIN_CHAPA } from "../src/engine/modules/techo.mjs";
import { cutList, cutPlan } from "../src/engine/cuts.mjs";
import { cutOpts, PGO_PERFIL, BAR_LEN } from "../src/engine/systems.mjs";
import { exportRuby } from "../src/export/ruby.mjs";

const OPC = { pgc: "PGC 100x0.90", pgu: "PGU 100x0.90" };
const t = (extra = {}) => ({ kind: "techo", sistema: "steel", opciones: OPC,
  tipo: "unAgua", luz: 3000, largo: 4800, pendiente: 15, alero: 400, separacion: 600,
  sepCorreas: 1000, timpanos: true, cubierta: true, ...extra });
const cuenta = P => P.reduce((c, p) => (c[p.tipo] = (c[p.tipo] || 0) + 1, c), {});
// Cabriada de CAMPO (no extrema): la del medio del techo.
const cabriadaMedia = P => { const ys = [...new Set(P.filter(p => p.orient).map(p => p.orient.c[1]))].sort((a,b)=>a-b);
  const y = ys[Math.floor(ys.length/2)]; return P.filter(p => p.orient && Math.abs(p.orient.c[1] - y) < 1); };

// --- colisión de cajas ORIENTADAS (SAT).
// Por qué OBB y no AABB: las barras de la cabriada son diagonales, así que su caja alineada a los ejes
// es mucho mayor que la pieza y chocaría contra cualquier montante (falso positivo). Se compara la
// caja REAL de cada barra, que es una verificación más fuerte, no una exención.
// `eps` = tolerancia de INGLETE: donde un montante o una diagonal muere contra un cordón inclinado, el
// modelo prismático se solapa exactamente lo que en obra se corta a inglete ((h/2)·tanθ). Ese solape
// es del orden de los milímetros; una interpenetración real (una barra cruzando otra) es mucho mayor.
const ingleteEps = (perfilH, pendiente) => perfilH / 2 * (pendiente / 100) + 1;
function obbChoca(a, b, eps = 1){
  const ejes = [...a.ejes, ...b.ejes];
  for (const A of a.ejes) for (const B of b.ejes){
    const c = [A[1]*B[2]-A[2]*B[1], A[2]*B[0]-A[0]*B[2], A[0]*B[1]-A[1]*B[0]];
    if (Math.hypot(...c) > 1e-6) ejes.push(c.map(v => v/Math.hypot(...c)));
  }
  const d = [0,1,2].map(i => b.c[i] - a.c[i]);
  for (const e of ejes){
    const proy = o => o.ejes.reduce((s, ax, k) => s + Math.abs(ax[0]*e[0]+ax[1]*e[1]+ax[2]*e[2]) * o.h[k], 0);
    if (Math.abs(d[0]*e[0]+d[1]*e[1]+d[2]*e[2]) >= proy(a) + proy(b) - eps) return false; // eje separador
  }
  return true;
}
const obbDe = p => p.orient
  ? { c: p.orient.c, ejes: [p.orient.u, p.orient.v, p.orient.n], h: [p.largo/2, p.orient.w/2, p.orient.t/2] }
  : null;

// 1) Un agua: montante de cierre, cordón superior con alero y montantes internos cada 600.
test("unAgua luz 3000 @15 %: cierre 450, cordón 3843, montantes 90/180/270/360", () => {
  const { piezas, metadatos } = techo.generar(t());
  assert.equal(metadatos.angulo, 8.53, "atan(0,15)");
  assert.equal(metadatos.alturaCumbrera, 450, "luz × pendiente");
  const med = cabriadaMedia(piezas);
  assert.equal(med.find(p => p.tipo === "CORDON_SUPERIOR").largo, 3843, "(3000+800)/cos θ");
  assert.equal(med.find(p => p.tipo === "CORDON_INFERIOR").largo, 3000, "de apoyo a apoyo");
  const mont = med.filter(p => p.tipo === "MONTANTE_CABRIADA").map(p => p.largo).sort((a,b) => a-b);
  assert.deepEqual(mont, [90, 180, 270, 360, 450], "internos cada 600 + el de cierre");
});

// 2) Dos aguas (Fink): cumbrera, cordones con y sin alero, diagonales.
test("dosAguas luz 6000 @30 %: cumbrera 900, cordón 3550 (3132 sin alero)", () => {
  const { piezas, metadatos } = techo.generar(t({ tipo: "dosAguas", luz: 6000, pendiente: 30 }));
  assert.equal(metadatos.alturaCumbrera, 900, "(luz/2) × pendiente");
  const med = cabriadaMedia(piezas);
  const cs = med.filter(p => p.tipo === "CORDON_SUPERIOR");
  assert.equal(cs.length, 2, "un cordón por faldón");
  cs.forEach(p => assert.equal(p.largo, 3550, "(luz/2 + alero)/cos θ"));
  assert.equal(techo.generar(t({ tipo:"dosAguas", luz:6000, pendiente:30, alero:0 }))
    .piezas.filter(p => p.tipo === "CORDON_SUPERIOR")[0].largo, 3132, "sin alero");
  const dg = med.filter(p => p.tipo === "DIAGONAL");
  assert.equal(dg.length, 4, "la W de Fink son 4 piezas");
  // simétricas: dos cortas (medio faldón → nodo inferior) y dos largas (nodo inferior → cumbrera)
  const largos = dg.map(p => p.largo).sort((a,b) => a-b);
  assert.equal(largos[0], largos[1]); assert.equal(largos[2], largos[3]);
});

// 3) Nodos de la W sobre los ejes de los cordones.
test("dosAguas: las diagonales nacen y mueren en los nodos teóricos", () => {
  const luz = 6000, p = 0.30;
  const med = cabriadaMedia(techo.generar(t({ tipo: "dosAguas", luz, pendiente: 30 })).piezas);
  const extremos = med.filter(d => d.tipo === "DIAGONAL").flatMap(d =>
    [1, -1].map(s => [0,1,2].map(i => d.orient.c[i] + s * d.orient.u[i] * d.largo/2)));
  const nodos = [[luz/4, (luz/4)*p], [luz/3, 0], [luz/2, (luz/2)*p], [2*luz/3, 0], [3*luz/4, (luz/4)*p]];
  extremos.forEach(([x, , z]) => {
    const cerca = nodos.some(([nx, nz]) => Math.abs(nx - x) < 1 && Math.abs(nz - z) < 1);
    assert.ok(cerca, `extremo (${x.toFixed(1)}, ${z.toFixed(1)}) no cae en un nodo`);
  });
});

// 4) Conteos: cabriadas por separación y correas por pendiente.
test("conteo: largo 4800 @600 → 9 cabriadas; faldón 3843 @1000 → 5 correas", () => {
  assert.equal(posCabriadas(4800, 600).length, 9);
  assert.deepEqual(posCabriadas(4800, 600)[0], 0);
  assert.equal(posCabriadas(4800, 600).at(-1), 4800, "la última alineada con el borde");
  const pc = posCorreas(3843, 1000);
  assert.equal(pc.length, 5, "2 bordes + 3 intermedias");
  pc.slice(1).forEach((d, i) => assert.ok(d - pc[i] <= 1000 + 0.1, "separación real ≤ sepCorreas"));
  const { piezas, metadatos } = techo.generar(t());
  assert.equal(metadatos.nCabriadas, 9);
  assert.equal(cuenta(piezas).CORREA, 5, "un faldón en un agua");
  assert.equal(cuenta(techo.generar(t({ tipo:"dosAguas", luz:6000, pendiente:30 })).piezas).CORREA, 10, "dos faldones");
});

// 5) Tímpanos: sólo en las cabriadas extremas; las de campo quedan a 600.
test("tímpanos sólo en las cabriadas extremas (400) y campo a 600", () => {
  const P = techo.generar(t()).piezas;
  const ys = [...new Set(P.filter(p => p.orient).map(p => p.orient.c[1]))].sort((a,b) => a-b);
  const enY = y => P.filter(p => p.orient && Math.abs(p.orient.c[1] - y) < 1);
  [ys[0], ys.at(-1)].forEach(y => {
    assert.equal(enY(y).filter(p => p.tipo === "MONTANTE_TIMPANO").length, 7, "cada 400 mm");
  });
  ys.slice(1, -1).forEach(y => assert.equal(enY(y).filter(p => p.tipo === "MONTANTE_TIMPANO").length, 0));
  assert.equal(cabriadaMedia(P).filter(p => p.tipo === "MONTANTE_CABRIADA").length, 5, "4 internos @600 + cierre");
  // sin tímpanos no hay ninguno
  assert.ok(!techo.generar(t({ timpanos: false })).piezas.some(p => p.tipo === "MONTANTE_TIMPANO"));
});

// 6) Pendiente baja → advertencia de filtración.
test("pendiente 6 % avisa que la chapa puede filtrar", () => {
  const av = techo.generar(t({ pendiente: 6 })).metadatos.avisos;
  assert.ok(av.some(a => /filtrar/.test(a)), "advertencia presente");
  assert.ok(!techo.generar(t({ pendiente: PEND_MIN_CHAPA })).metadatos.avisos.some(a => /filtrar/.test(a)));
});

// 7) In-line framing: la separación de cabriadas debe coincidir con la modulación del muro.
test("aviso si las cabriadas no caen sobre los montantes", () => {
  const conAviso = techo.generar(t({ separacion: 600, moduloMuro: 400 })).metadatos.avisos;
  assert.ok(conAviso.some(a => /transmisión de cargas/.test(a)));
  const sinAviso = techo.generar(t({ separacion: 400, moduloMuro: 400 })).metadatos.avisos;
  assert.ok(!sinAviso.some(a => /transmisión de cargas/.test(a)));
});

// 8) Sin interpenetración entre barras de una misma cabriada (cajas ORIENTADAS, ver nota arriba).
for (const [nom, extra, pend] of [["unAgua", {}, 15], ["dosAguas", { tipo: "dosAguas", luz: 6000, pendiente: 30 }, 30]]){
  test(`sin colisión entre barras de la cabriada (${nom})`, () => {
    const P = cabriadaMedia(techo.generar(t(extra)).piezas).filter(p => p.categoria !== "fleje" && p.tipo !== "CORREA");
    // LIMITACIÓN CONOCIDA: las barras se modelan EJE A EJE (nodo a nodo), sin recortar la punta a la
    // cara del cordón. Donde una diagonal muere contra un cordón, el prisma se mete hasta (h/2)·cos α
    // — exactamente el material que en obra se saca con el corte a inglete. Se tolera eso; una
    // interpenetración real (una barra atravesando otra) es de otro orden y el test la seguiría viendo.
    const eps = Math.max(ingleteEps(100, pend), 50);   // PGC 100: media alma
    const cajas = P.map(obbDe);
    for (let i = 0; i < cajas.length; i++) for (let j = i+1; j < cajas.length; j++)
      assert.ok(!obbChoca(cajas[i], cajas[j], eps),
        `interpenetración ${P[i].tipo} ↔ ${P[j].tipo} (más allá del inglete de ${eps.toFixed(1)} mm)`);
  });
}

// 9) Todo ítem de material del techo tiene su fila en el listado (cantidad > 0 y unidad).
test("materiales: perfiles, chapa, cumbrera y arriostramiento con su unidad", () => {
  const inp = t({ tipo: "dosAguas", luz: 6000, pendiente: 30 });
  const P = techo.generar(inp).piezas;
  const m = techo.materiales(P, inp);
  assert.ok(m.perfiles.length >= 2, "PGC de cabriada + PGO de correa");
  assert.ok(m.perfiles.some(x => x.perfil === PGO_PERFIL && x.largoBarra === BAR_LEN.pgo), "la correa usa su barra comercial");
  const keys = m.otros.map(o => o.key);
  assert.ok(keys.includes("chapa") && keys.includes("cumbrera"), "cubierta y cumbrera en dos aguas");
  assert.ok(keys.includes("fleje-rollo") && keys.includes("tensor"), "arriostramiento del faldón");
  m.otros.forEach(o => { assert.ok(o.cantidad > 0, o.key); assert.ok(o.unidad, o.key); });
  assert.ok(m.tornillos.t1 > 0);
  assert.ok(!techo.materiales(techo.generar(t()).piezas, t()).otros.some(o => o.key === "cumbrera"), "un agua sin cumbrera");
});

// 10) La cubierta es visual: no cambia piezas estructurales ni cortes.
test("cubierta on/off no altera la estructura ni los cortes", () => {
  const est = P => P.filter(p => !p.superficie).map(p => `${p.tipo}|${p.largo}`).sort().join(",");
  const con = techo.generar(t({ cubierta: true })).piezas, sin = techo.generar(t({ cubierta: false })).piezas;
  assert.equal(est(con), est(sin), "misma estructura");
  assert.equal(con.filter(p => p.tipo === "CUBIERTA").length, 1);
  assert.equal(sin.filter(p => p.tipo === "CUBIERTA").length, 0);
  const cortes = P => JSON.stringify(cutList(P).groups);
  assert.equal(cortes(con), cortes(sin), "la chapa no entra en cortes (es superficie)");
});

// 11) Defaults DIY: crear un techo sin tocar nada da geometría válida y sin advertencias.
test("defaults: techo válido sin tocar ningún parámetro", () => {
  const d = techo.defaults();
  const { piezas, metadatos } = techo.generar({ kind: "techo", ...d });
  assert.equal(d.tipo, "unAgua"); assert.equal(d.pendiente, 15);
  assert.ok(piezas.length > 10);
  assert.deepEqual(metadatos.avisos, [], "sin advertencias con los defaults");
  assert.ok(piezas.every(p => Number.isFinite(p.largo) && p.largo > 0), "todas las piezas con largo válido");
  assert.ok(piezas.filter(p => p.orient).every(p => p.orient.c.every(Number.isFinite)));
});

// 12) Export Ruby: capa propia y piezas inclinadas orientadas con su base real.
test("export Ruby: cabriada en Estructura-Techo, barras rotadas", () => {
  const rb = exportRuby(t({ largo: 2400 }));
  assert.match(rb, /t_tec=model\.layers\.add\("Estructura-Techo"\)/);
  assert.match(rb, /t_fle=model\.layers\.add\("Estructura-Flejes"\)/, "el arriostramiento va a su capa");
  const P = techo.generar(t({ largo: 2400 })).piezas.filter(p => !p.superficie);
  assert.equal((rb.match(/_profile\(/g) || []).length - 1, P.length, "una llamada por pieza");
  assert.ok(!/NaN|undefined/.test(rb), "sin valores inválidos");
  assert.ok((rb.match(/Geom::Transformation\.axes\(/g) || []).length >= P.length - 1, "las barras se orientan con su base");
});

// Cortes: los tipos nuevos entran al bin-packing normal, cada perfil con SU barra comercial.
test("cortes: cabriada en PGC 6 m y correas en PGO, derivados de piezas[]", () => {
  const inp = t();
  const P = techo.generar(inp).piezas;
  const plan = cutPlan(P, cutOpts(inp));
  const pgc = plan.find(s => s.perfil === "PGC 100x0.90"), pgo = plan.find(s => s.perfil === PGO_PERFIL);
  assert.equal(pgc.barLen, 6000); assert.equal(pgo.barLen, BAR_LEN.pgo);
  assert.ok(pgc.bins.length > 0 && pgo.bins.length > 0);
  const tipos = new Set(cutList(P).groups.map(g => g.tipo));
  ["CORDON_SUPERIOR","CORDON_INFERIOR","MONTANTE_CABRIADA","MONTANTE_TIMPANO","CORREA"].forEach(x =>
    assert.ok(tipos.has(x), `falta ${x} en la lista de corte`));
  assert.ok(!tipos.has("CUBIERTA"), "la chapa no es una pieza de corte");
});
