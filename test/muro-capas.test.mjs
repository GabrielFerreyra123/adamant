// F11-bis.2 — Muro/Tabique: tipo de muro (perfilería/barLen/arriostramiento) + capas conmutables.
import { test } from "vitest";
import assert from "node:assert/strict";
import { muro } from "../src/engine/modules/muro.mjs";
import { capasDefault, buildCapas, computeCapas, capasDeMuro } from "../src/engine/capas.mjs";
import { cutList } from "../src/engine/cuts.mjs";
import { pieceBoxEngine } from "../src/engine/geometry.mjs";

const M = (tipo, extra = {}) => ({ kind: "muro", sistema: "steel", tipoMuro: tipo, largo: 3000, alto: 2600,
  vanos: [{ tipo: "ventana", x1: 1000, x2: 2200, h: 2000, sill: 900 }],
  opciones: tipo === "tabique" ? { modulo: 400, montPlaca: "Montante 70" } : { modulo: 400, pgc: "PGC 100x1.25", pgu: "PGU 100x1.25" },
  capas: capasDefault(tipo), ...extra });

// 1) CRITERIO 1: el tabique cambia la perfilería, pone barLen en 2,60/3,00 y no arriostra.
test("tabique: perfilería de placa (barLen 3000), dintel simple, sin arriostramiento", () => {
  const inp = M("tabique"), g = muro.generar(inp), m = muro.materiales(g.piezas, inp);
  assert.ok(m.perfiles.every(p => p.largoBarra === 3000), "barra comercial 3,00 m, no 6");
  assert.ok(m.perfiles.some(p => p.perfil === "Montante 70") && m.perfiles.some(p => p.perfil === "Solera 70"), "perfilería de placa");
  assert.equal(g.metadatos.drywall, true);
  assert.deepEqual(g.metadatos.avisos, [], "sin avisos de arriostramiento (no aplica)");
  assert.ok(!g.piezas.some(p => p.categoria === "fleje"), "el tabique no lleva flejes");
  assert.equal(g.piezas.filter(p => p.tipo === "DINTEL").length, 2, "dintel SIMPLE (2 perfiles), no reforzado");
  // el muro portante SÍ arriostra y usa PGC/PGU a 6 m
  const ext = muro.materiales(muro.generar(M("exterior")).piezas, M("exterior"));
  assert.ok(ext.perfiles.some(p => p.perfil.startsWith("PGC") && p.largoBarra === 6000));
});

// 2) CRITERIO 2: activar/desactivar una capa cambia el espesor total y los m².
test("capas: togglear cambia espesor total y m² en vivo", () => {
  const inp = M("exterior");
  const con = computeCapas(inp);
  const sinPlaca = computeCapas({ ...inp, capas: { ...inp.capas, placaExt: "Ninguna" } });
  assert.ok(sinPlaca.espesorTotal < con.espesorTotal, "sacar la placa exterior adelgaza el muro");
  assert.equal(con.espesorTotal - sinPlaca.espesorTotal, 11, "OSB 11,1 mm ≈ 11");
  // la aislación NO suma al espesor (va en la cavidad) pero SÍ suma m²
  const sinLana = computeCapas({ ...inp, capas: { ...inp.capas, aisla: "Ninguna" } });
  assert.equal(sinLana.espesorTotal, con.espesorTotal, "la lana no cambia el espesor total");
  assert.ok(con.aislacion > 0 && sinLana.aislacion === 0, "pero sí aparece/desaparece del cómputo");
  // más placa interior (doble) engrosa
  const doble = computeCapas({ ...inp, capas: { ...inp.capas, placaInt: "Doble placa 25" } });
  assert.ok(doble.espesorTotal > con.espesorTotal);
});

// 3) CRITERIO 3: los defaults de cada tipo producen un muro válido sin configurar nada.
test("defaults por tipo: muro válido sin tocar nada", () => {
  ["exterior", "interior", "tabique"].forEach(tipo => {
    const inp = { kind: "muro", sistema: "steel", tipoMuro: tipo, largo: 3000, alto: 2600, vanos: [],
      opciones: tipo === "tabique" ? { modulo: 400, montPlaca: "Montante 70" } : { modulo: 400, pgc: "PGC 100x1.25", pgu: "PGU 100x1.25" },
      capas: capasDefault(tipo) };
    const g = muro.generar(inp), m = muro.materiales(g.piezas, inp);
    assert.ok(g.piezas.length > 5, `${tipo}: geometría`);
    assert.ok(g.metadatos.espesorTotal > 0, `${tipo}: espesor total`);
    assert.ok(m.placas.length >= 2, `${tipo}: placa en ambas caras`);
    assert.ok(g.piezas.every(p => Number.isFinite(p.largo) && p.largo > 0), `${tipo}: largos válidos`);
  });
  // el default del módulo es un muro exterior armable
  const d = muro.defaults();
  assert.equal(d.tipoMuro, "exterior");
  assert.ok(muro.generar({ kind: "muro", ...d }).metadatos.espesorTotal > 100);
});

// 4) CRITERIO 4: los cortes derivan SÓLO de piezas[]; las capas (superficie) no entran.
test("cortes: las capas no generan despiece", () => {
  const inp = M("exterior"), g = muro.generar(inp);
  const tipos = new Set(cutList(g.piezas).groups.map(x => x.tipo));
  assert.ok(!tipos.has("CAPA"), "CAPA no está en la lista de corte");
  assert.ok(g.piezas.some(p => p.capa && p.capa.startsWith("cap-") && p.superficie), "las capas SÍ están como superficie");
  // byProfile == suma directa de piezas de barra (sin recomputo paralelo)
  const { byProfile } = cutList(g.piezas);
  const directo = {};
  g.piezas.filter(p => !p.superficie && p.categoria !== "fleje").forEach(p => { directo[p.perfil] = (directo[p.perfil] || 0) + p.largo; });
  Object.keys(byProfile).forEach(pf => assert.equal(byProfile[pf].reduce((a, b) => a + b, 0), directo[pf]));
});

// 5) CRITERIO 5: el test AABB pasa con todas las capas activas → las capas son SUPERFICIE (exentas del
// AABB, como el resto de los revestimientos) y no tocan la estructura. La regla del motor: el AABB
// mira sólo `!superficie`, así que activar capas no puede introducir colisiones.
test("AABB: las capas son superficie y no cambian la estructura", () => {
  const todas = { term: "Siding cementicio 12", rastrel: true, membrana: true, placaExt: "OSB 11,1", aisla: "Lana 100", vapor: true, placaInt: "Yeso 12,5" };
  const est = capas => muro.generar(M("exterior", { capas })).piezas.filter(p => !p.superficie).map(p => `${p.tipo}|${p.largo}|${(p.pos||[]).join(",")}`).sort();
  // la estructura (lo que ve el AABB) es idéntica con o sin capas
  assert.deepEqual(est(todas), est({ ...todas, placaExt: "Ninguna", membrana: false, rastrel: false, aisla: "Ninguna", vapor: false, placaInt: "Ninguna", term: "Ninguna" }),
    "prender capas no agrega ni una pieza estructural");
  const caps = muro.generar(M("exterior", { capas: todas })).piezas.filter(p => p.capa && p.capa.startsWith("cap-"));
  assert.equal(caps.length, 7, "las 7 capas activas se dibujan");
  assert.ok(caps.every(c => c.superficie && c.box.size[1] > 0), "cada capa es superficie con espesor real");
  // los vanos siguen recortados (holes) en cada capa
  assert.ok(caps.every(c => c.rev && c.rev.holes.length === 1), "cada capa recorta el vano al paso libre");
});

// 6) Wood: exterior 2×6 arriostrable; tabique 2×3 sin arriostrar.
test("wood: el tabique usa escuadría chica y no arriostra", () => {
  const woodTab = { kind: "muro", sistema: "wood", tipoMuro: "tabique", largo: 3000, alto: 2600, vanos: [],
    arriostramiento: "ninguno", opciones: { modulo: 600, lumber: "2x3 (38×64)" }, capas: capasDefault("tabique") };
  const g = muro.generar(woodTab);
  assert.ok(g.piezas.some(p => p.perfil === "2x3 (38×64)"), "escuadría 2×3");
  assert.deepEqual(g.metadatos.avisos, [], "sin arriostramiento");
});

// La sección de un tabique tiene 3 capas (2 caras de placa + aislación); el exterior, 7.
test("capasDeMuro: set de capas por tipo", () => {
  assert.equal(capasDeMuro("exterior").length, 7);
  assert.equal(capasDeMuro("interior").length, 3);
  assert.equal(capasDeMuro("tabique").length, 3);
  assert.match(capasDeMuro("tabique").find(c => c.id === "aisla").label, /acústica/);
});
