// F11-bis.2 — Muro/Tabique: tipo de muro (perfilería/barLen/arriostramiento) + composición de capas
// por SISTEMA de terminación (paquetes válidos, sin toggles sueltos).
import { test } from "vitest";
import assert from "node:assert/strict";
import { muro } from "../src/engine/modules/muro.mjs";
import { capasDefault, buildCapas, composicion, computeCapas, sistemasCara, SIST_EXT, SIST_INT, AISLA } from "../src/engine/capas.mjs";
import { cutList } from "../src/engine/cuts.mjs";
import { combinado } from "../src/engine/modules/combinado.mjs";
import { pieceBoxEngine } from "../src/engine/geometry.mjs";

const M = (tipo, extra = {}) => ({ kind: "muro", sistema: "steel", tipoMuro: tipo, largo: 3000, alto: 2600,
  vanos: [{ tipo: "ventana", x1: 1000, x2: 2200, h: 2000, sill: 900 }],
  opciones: tipo === "tabique" ? { modulo: 400, montPlaca: "Montante 70" } : { modulo: 400, pgc: "PGC 100x1.25", pgu: "PGU 100x1.25" },
  capas: capasDefault(tipo), ...extra });

// 1) El tabique cambia perfilería, barLen 2,60/3,00 y no arriostra.
test("tabique: perfilería de placa (barLen 3000), dintel simple, sin arriostramiento", () => {
  const inp = M("tabique"), g = muro.generar(inp), m = muro.materiales(g.piezas, inp);
  assert.ok(m.perfiles.every(p => p.largoBarra === 3000), "barra 3,00 m");
  assert.ok(m.perfiles.some(p => p.perfil === "Montante 70") && m.perfiles.some(p => p.perfil === "Solera 70"));
  assert.equal(g.metadatos.drywall, true);
  assert.deepEqual(g.metadatos.avisos, []);
  assert.equal(g.piezas.filter(p => p.tipo === "DINTEL").length, 2, "dintel simple");
  const ext = muro.materiales(muro.generar(M("exterior")).piezas, M("exterior"));
  assert.ok(ext.perfiles.some(p => p.perfil.startsWith("PGC") && p.largoBarra === 6000));
});

// 2) CRIT 1: elegir un sistema arma un paquete de capas válido sin tocar un solo toggle.
test("sistema de terminación = paquete de capas válido (sin toggles)", () => {
  // siding cementicio → OSB + membrana + rastrel + siding, del frame hacia afuera
  const sid = composicion(M("exterior", { capas: { caraA: "siding-cem", caraB: "yeso", aislacion: "no", custom: false, off: [] } }));
  assert.deepEqual(sid.filter(l => l.lado === "ext").map(l => l.matId), ["osb11", "membrana", "rastrel20", "sidingCem12"]);
  // cambiar a chapa cambia sólo la terminación, mantiene el paquete válido
  const cha = composicion(M("exterior", { capas: { caraA: "chapa", caraB: "yeso", aislacion: "no", custom: false, off: [] } }));
  assert.equal(cha.filter(l => l.lado === "ext").at(-1).matId, "chapaC25");
  assert.ok(cha.some(l => l.matId === "rastrel20"), "la chapa trae el rastrel solo");
});

// 3) CRIT 2: barrera de vapor puesta sola (bloqueada), del lado calefaccionado, sólo con aislación.
test("barrera de vapor: automática, bloqueada, del lado interior y sólo si hay aislación", () => {
  const con = composicion(M("exterior", { capas: { caraA: "siding-cem", caraB: "yeso", aislacion: "estandar", custom: false, off: [] } }));
  const vapor = con.find(l => l.matId === "vapor");
  assert.ok(vapor && vapor.lado === "int" && vapor.locked, "vapor interior y bloqueada");
  const sin = composicion(M("exterior", { capas: { caraA: "siding-cem", caraB: "yeso", aislacion: "no", custom: false, off: [] } }));
  assert.ok(!sin.some(l => l.matId === "vapor"), "sin aislación no hay barrera de vapor");
  // la estructura (sheathing) del muro exterior también queda bloqueada
  assert.ok(con.find(l => l.lado === "ext").locked, "la placa estructural no se apaga");
});

// 4) CRIT 3: espesor total en vivo; la aislación no suma espesor pero sí m².
test("espesor total y m² reaccionan a la composición", () => {
  const base = computeCapas(M("exterior"));
  const sinOSB = computeCapas(M("exterior", { capas: { ...capasDefault("exterior"), caraA: "obra" } }));
  assert.ok(sinOSB.espesorTotal < base.espesorTotal || sinOSB.espesorTotal !== base.espesorTotal, "cambiar el sistema cambia el espesor");
  const sinLana = computeCapas(M("exterior", { capas: { ...capasDefault("exterior"), aislacion: "no" } }));
  assert.equal(sinLana.espesorTotal, computeCapas(M("exterior", { capas: { ...capasDefault("exterior"), aislacion: "estandar" } })).espesorTotal - 0, "la lana (50 o 100) no cambia el espesor total");
  assert.ok(base.aislacion > 0 && sinLana.aislacion === 0, "pero sí aparece/desaparece del cómputo");
  // detalle por capa con kg (para el impacto en vivo)
  assert.ok(base.detalle.every(d => d.esp > 0 && d.kg >= 0 && d.m2 > 0));
});

// 5) CRIT 2 (no error avisos): ninguna composición dispara un aviso. El muro no publica avisos por capas.
test("las capas nunca generan un aviso de error", () => {
  ["exterior", "interior", "tabique"].forEach(tipo => {
    const g = muro.generar(M(tipo));
    // sólo pueden aparecer avisos de arriostramiento (portantes); nunca de capas
    assert.ok(g.metadatos.avisos.every(a => /fleje|arriostrar|tramo/i.test(a) || g.metadatos.avisos.length === 0));
  });
});

// 6) CRIT 6+7: cortes derivan sólo de piezas[]; las capas son superficie (exentas del AABB).
test("cortes: las capas no despiezan; son superficie", () => {
  const inp = M("exterior"), g = muro.generar(inp);
  assert.ok(!new Set(cutList(g.piezas).groups.map(x => x.tipo)).has("CAPA"), "CAPA no está en cortes");
  const est = capas => muro.generar(M("exterior", { capas })).piezas.filter(p => !p.superficie).map(p => `${p.tipo}|${p.largo}`).sort();
  const d = capasDefault("exterior");
  assert.deepEqual(est(d), est({ ...d, caraA: "obra", caraB: "obra", aislacion: "no" }), "prender/apagar capas no toca la estructura");
  const caps = g.piezas.filter(p => p.capa && p.capa.startsWith("cap-"));
  assert.ok(caps.length >= 5 && caps.every(c => c.superficie && c.box.size[1] > 0 && c.rev.holes.length === 1), "capas superficie, con espesor y recorte de vano");
});

// 7) CRIT 3 (proporcional/orden): las capas traen orden y "lejanía" para el despiece del 3D.
test("capas: orden y dirección para el despiece", () => {
  const caps = buildCapas(M("exterior"));
  const ext = caps.filter(c => c.capLejos === -1), int = caps.filter(c => c.capLejos === 1);
  assert.ok(ext.length >= 3 && int.length >= 1);
  assert.ok(ext.every(c => c.capOrden >= 1) && int.every(c => c.capOrden >= 1), "cada capa numerada desde el frame");
});

// 9) CRIT 5: una composición se aplica a los 4 muros del ambiente de un click; AABB estructural intacto.
test("ambiente: una composición se aplica a los 4 muros a la vez", () => {
  const base = { kind: "combinado", sistema: "steel", largo: 4000, ancho: 3000, alto: 2600, apoyo: "platea", placa: true,
    opciones: { pgc: "PGC 100x1.25", pgu: "PGU 100x1.25", modulo: 400 },
    vanoFrente: [], vanoFondo: [], vanoIzq: [], vanoDer: [],
    arriostraFrente: "cruz", arriostraFondo: "cruz", arriostraIzq: "cruz", arriostraDer: "cruz" };
  const con = { ...base, muroTipo: "exterior", muroCapas: capasDefault("exterior") };
  const P = combinado.generar(con).piezas;
  const porParte = {};
  P.filter(p => p.capa && p.capa.startsWith("cap-")).forEach(p => porParte[p.parte] = (porParte[p.parte] || 0) + 1);
  assert.deepEqual(Object.keys(porParte).sort(), ["der", "fondo", "frente", "izq"], "los 4 muros tienen capas");
  assert.ok(Object.values(porParte).every(n => n === 7), "las 7 capas en cada muro");
  assert.ok(!P.some(p => p.capa === "rev-ext"), "con composición NO va el revestimiento estándar");
  assert.ok(combinado.generar(base).piezas.some(p => p.capa === "rev-ext"), "sin composición sí va");
  // AABB: la estructura (no superficie) es la misma con o sin composición → activar capas no colisiona
  const est = inp => combinado.generar(inp).piezas.filter(p => !p.superficie && p.categoria !== "fleje").length;
  assert.equal(est(con), est(base), "las capas no agregan piezas estructurales al ambiente");
});
test("sistemas ofrecidos por tipo de muro", () => {
  assert.equal(sistemasCara("exterior", "A"), SIST_EXT, "la cara de afuera del exterior ofrece siding/revoque/chapa");
  assert.equal(sistemasCara("exterior", "B"), SIST_INT, "la interior ofrece yeso");
  assert.equal(sistemasCara("tabique", "A"), SIST_INT, "el tabique: yeso ambas caras");
  assert.ok("no" in AISLA && "estandar" in AISLA && "fria" in AISLA);
});
