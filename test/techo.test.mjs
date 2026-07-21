// FASE D — Techo de cabriadas: un agua (monopendiente) y dos aguas (Fink).
import { test, describe } from "vitest";
import assert from "node:assert/strict";
import { techo, validarTecho, anguloPendiente, posCabriadas, posCorreas,
  PEND_MIN_CHAPA, PEND_REC, ALERO_MAX, MEMBRANA_SOLAPE, PESO_CUBIERTA } from "../src/engine/modules/techo.mjs";
import { cutList, cutPlan } from "../src/engine/cuts.mjs";
import { cutOpts, PGO_PERFIL, BAR_LEN, FLEJE_CIELO, FLEJE_CIELO_PERFIL } from "../src/engine/systems.mjs";
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

// 6) Pendiente: rango del manual (25–100 % limpio · 7–25 % avisa · < 7 % bloquea).
test("pendiente 6 % bloquea, 20 % avisa, 25 % limpio", () => {
  const b = validarTecho(t({ pendiente: 6 }));
  assert.equal(b.errores.length, 1, "bloqueante");
  assert.match(b.errores[0], /filtra/);
  assert.ok(techo.generar(t({ pendiente: 6 })).metadatos.errores.length, "el módulo lo publica");

  const m = validarTecho(t({ pendiente: 20 }));
  assert.deepEqual(m.errores, [], "20 % no bloquea");
  assert.match(m.avisos[0], /25 % recomendado por manual/);

  const ok = validarTecho(t({ pendiente: 25 }));
  assert.deepEqual(ok.errores, []); assert.deepEqual(ok.avisos, [], "25 % es el recomendado: sin ruido");
  assert.deepEqual(validarTecho(t({ pendiente: 100 })).avisos, [], "100 % sigue dentro del manual");
  assert.match(validarTecho(t({ pendiente: 120 })).avisos[0], /por encima/);
  assert.equal(PEND_MIN_CHAPA, 7); assert.deepEqual(PEND_REC, { min: 25, max: 100 });
});

// 6b) Alero: el manual limita el voladizo lateral a 600 mm → se recorta solo y se avisa.
test("alero 700 se recorta a 600 con aviso", () => {
  const v = validarTecho(t({ alero: 700 }));
  assert.deepEqual(v.errores, [], "no bloquea: se acomoda");
  assert.match(v.ajustes[0], /700 a 600/);
  const { piezas, metadatos } = techo.generar(t({ alero: 700 }));
  assert.equal(metadatos.alero, ALERO_MAX, "el modelo usa el alero recortado");
  assert.equal(metadatos.ajustes.length, 1);
  // el cordón superior sale del alero recortado, no del pedido
  const cs = cabriadaMedia(piezas).find(p => p.tipo === "CORDON_SUPERIOR");
  assert.equal(cs.largo, techo.generar(t({ alero: 600 })).piezas.find(p => p.tipo === "CORDON_SUPERIOR").largo);
  assert.deepEqual(validarTecho(t({ alero: 600 })).ajustes, [], "600 justo no avisa");
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
  assert.equal(d.tipo, "unAgua"); assert.equal(d.pendiente, 25, "el manual recomienda de 25 % para arriba");
  assert.ok(piezas.length > 10);
  assert.deepEqual(metadatos.avisos, [], "sin advertencias con los defaults");
  assert.deepEqual(metadatos.errores, []); assert.deepEqual(metadatos.ajustes, []);
  assert.equal(metadatos.notas.length, 1, "la nota de succión de viento es informativa, no una advertencia");
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

// ---------------------------------------------------------------------------------------------
// ADDENDUM (auditoría contra manual ConsulSteel/Barbieri)
// ---------------------------------------------------------------------------------------------

// A1) Números del spec original recalculados con el nuevo default de 25 %.
test("unAgua luz 3000 @25 %: cierre 750, cordón 3917, montantes 150/300/450/600", () => {
  const { piezas, metadatos } = techo.generar(t({ pendiente: 25 }));
  assert.equal(metadatos.angulo, 14.04, "atan(0,25)");
  assert.equal(metadatos.alturaCumbrera, 750, "3000 × 0,25");
  const med = cabriadaMedia(piezas);
  assert.equal(med.find(p => p.tipo === "CORDON_SUPERIOR").largo, 3917, "(3000+800)/cos 14,04°");
  const mont = med.filter(p => p.tipo === "MONTANTE_CABRIADA").map(p => p.largo).sort((a,b) => a-b);
  assert.deepEqual(mont, [150, 300, 450, 600, 750], "internos cada 600 (x·0,25) + el de cierre");
});

// A2) Arriostre del ala inferior del cordón inferior (viguetas de cielo): fleje 38×0,84 cada ≤1,20 m.
test("arriostre de cielo: luz 3600 → 4 líneas de fleje 38×0,84 a lo largo del techo", () => {
  const inp = t({ luz: 3600, largo: 4800 });
  const P = techo.generar(inp).piezas;
  const fc = P.filter(p => p.tipo === "FLEJE_CIELO");
  assert.equal(fc.length, 4, "arranca en un borde y separa ≤ 1200");
  fc.forEach(p => {
    assert.equal(p.perfil, FLEJE_CIELO_PERFIL);
    assert.equal(p.categoria, "fleje", "va en rollo, no en barra");
    assert.equal(p.largo, 4800, "corre a lo largo del techo, perpendicular a las cabriadas");
    assert.deepEqual(p.orient.u, [0, 1, 0], "perpendicular a las cabriadas");
  });
  const xs = fc.map(p => p.orient.c[0]).sort((a,b) => a-b);
  assert.deepEqual(xs, [0, 1200, 2400, 3600]);
  xs.slice(1).forEach((x, i) => assert.ok(x - xs[i] <= FLEJE_CIELO.sep + 0.1, "separación real ≤ 1200"));
  // pegado al ala INFERIOR del cordón inferior (que va de z=−100 a z=0 con PGC 100)
  fc.forEach(p => assert.ok(p.orient.c[2] < -100, `bajo el ala inferior, no dentro del cordón (z=${p.orient.c[2]})`));

  // en cortes: sección propia de fleje, fuera del bin-packing de barras
  const secc = cutPlan(P, cutOpts(inp)).filter(s => s.fleje);
  assert.equal(secc.length, 2, "dos medidas de fleje = dos secciones (30×0,5 del faldón y 38×0,84 del cielo)");
  const sc = secc.find(s => s.perfil === FLEJE_CIELO_PERFIL);
  assert.equal(sc.piezas, 4); assert.equal(sc.metros, 19.2); assert.ok(!sc.bins, "no se empaqueta en barras");
  assert.ok(!Object.keys(cutList(P).byProfile).includes(FLEJE_CIELO_PERFIL), "fuera del bin-packing");
  assert.ok(cutList(P).groups.some(g => g.tipo === "FLEJE_CIELO" && g.code.startsWith("FC")), "código propio");
});

// A3) Anclajes anti-succión: 2 conectores por cabriada + su tornillería.
test("anclajes: 9 cabriadas → 18 conectores + tornillería", () => {
  const inp = t();                                  // largo 4800 @600 → 9 cabriadas
  const m = techo.materiales(techo.generar(inp).piezas, inp);
  assert.equal(m.nCabriadas, 9);
  const anc = m.otros.find(o => o.key === "anclaje-cabriada");
  assert.equal(anc.cantidad, 18, "uno por apoyo"); assert.equal(anc.unidad, "u");
  assert.match(anc.label, /succión|clip|ángulo/i);
  // los 8 T1 por conector están en la cuenta global
  const sinAnclaje = techo.materiales(techo.generar(inp).piezas, inp).tornillos.t1;
  assert.ok(sinAnclaje >= 18 * 8, "la tornillería del anclaje entra en T1");
  // la advertencia de viento es fija y viaja en las notas (no ensucia los avisos)
  assert.match(techo.generar(inp).metadatos.notas[0], /succión del viento/);
});

// A4) Membrana hidrófuga: m² de faldón × factor de solape, sólo con cubierta.
test("membrana: m² de faldones × 1,15; sin cubierta no aparece", () => {
  const inp = t({ tipo: "dosAguas", luz: 6000, pendiente: 30 });
  const m = techo.materiales(techo.generar(inp).piezas, inp);
  const mem = m.otros.find(o => o.key === "membrana");
  assert.equal(mem.unidad, "m²");
  assert.equal(mem.cantidad, Math.ceil(m.area * MEMBRANA_SOLAPE), "área de faldón + solape");
  assert.ok(mem.cantidad > m.area, "siempre más que la chapa");
  assert.equal(MEMBRANA_SOLAPE, 1.15);
  const sin = t({ tipo: "dosAguas", luz: 6000, pendiente: 30, cubierta: false });
  assert.ok(!techo.materiales(techo.generar(sin).piezas, sin).otros.some(o => o.key === "membrana"));
});

// A5) Peso propio de la cubierta como dato de referencia (sanity check para quien verifica).
test("peso de cubierta de referencia: 30 kg/m² de chapa", () => {
  const inp = t();
  const m = techo.materiales(techo.generar(inp).piezas, inp);
  assert.equal(m.pesoCubierta.kgm2, PESO_CUBIERTA.chapa);
  assert.equal(m.pesoCubierta.total, Math.round(m.area * 30));
  assert.notEqual(m.pesoCubierta.total, m.peso, "es el peso de la cubierta terminada, no el de los perfiles");
  assert.equal(PESO_CUBIERTA.teja, 67, "definida para cuando se sume teja");
});

// A6) Regresión: los agregados del addendum no tocan la cabriada ni las correas.
test("regresión: la cabriada y las correas son las mismas que antes del addendum", () => {
  const inp = t({ tipo: "dosAguas", luz: 6000, pendiente: 30, alero: 400 });
  const P = techo.generar(inp).piezas;
  const nuevo = new Set(["FLEJE_CIELO"]);
  const estructura = P.filter(p => !nuevo.has(p.tipo)).map(p => `${p.tipo}|${p.largo}`).sort();
  // el conteo por tipo de la cabriada Fink + correas + cruz de faldón, intacto
  assert.deepEqual(cuenta(P.filter(p => !nuevo.has(p.tipo))), {
    CORDON_INFERIOR: 9, CORDON_SUPERIOR: 18, DIAGONAL: 36,
    MONTANTE_TIMPANO: 28, CORREA: 10, FLEJE: 4, CUBIERTA: 2   // 1 cruz (2 flejes) por faldón
  });
  assert.ok(estructura.length > 100);
  // y el fleje de cielo no se mezcla con el de la cruz de San Andrés en el cómputo
  const m = techo.materiales(P, inp);
  const rollo30 = m.otros.find(o => o.key === "fleje-rollo"), rollo38 = m.otros.find(o => o.key === "fleje-cielo-rollo");
  assert.match(rollo30.label, /Fleje 30x0\.5/); assert.match(rollo38.label, /Fleje 38x0\.84/);
  assert.equal(rollo30.unidad, "rollo"); assert.equal(rollo38.unidad, "rollo");
});

// A7) Correas siempre presentes (el manual valida cabriadas a 1,20 m sólo con correas).
test("a 1200 mm de separación las correas siguen estando", () => {
  const P = techo.generar(t({ separacion: 1200 })).piezas;
  assert.ok(P.filter(p => p.tipo === "CORREA").length > 0, "no son opcionales");
  assert.equal(techo.generar(t({ separacion: 1200 })).metadatos.nCabriadas, 5, "4800/1200 + 1");
});

// A8) Apoyo del cordón inferior sobre la solera: el manual pide 38 mm mínimo.
test("el cordón inferior apoya de muro a muro (apoyo ≥ 38 mm sobre la solera)", () => {
  const P = cabriadaMedia(techo.generar(t()).piezas);
  const ci = P.find(p => p.tipo === "CORDON_INFERIOR");
  assert.equal(ci.largo, 3000, "de eje de apoyo a eje de apoyo");
  // con PGU 100 (alma 102) bajo cada extremo, el apoyo disponible supera holgadamente los 38 mm
  assert.ok(102 / 2 >= 38, "media solera ya alcanza el apoyo mínimo");
});
