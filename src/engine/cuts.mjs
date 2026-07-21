// ADAMANT · lista de corte por pieza + optimización sobre barra comercial.
// (B) La lista de corte se deriva SIEMPRE de las piezas de la geometría (`buildPieces`).
// No recalcula largos por su cuenta: así geometría y cómputo no pueden divergir
// (p. ej. el largo del cripple sale del que dibuja el motor, descontando el cap PGU en steel).
import { barLenOf, FLEJE } from "./systems.mjs";

const CODE_PREF = { MONTANTE:"M", KING:"K", JACK:"J", CRIPPLE:"C", DINTEL:"D",
  "SOL.PANEL":"SP", "SOL.VANO":"SV", "SOL.DINTEL":"SD",
  VIGA:"V", VIGA_DOBLE:"VD", CENEFA:"CE", BLOCKING:"B", SOLERA:"S", MAESTRA:"VM", VELA:"VL", FLEJE:"F",
  TRIMMER:"TR", CABEZAL:"CB", VIGA_COLA:"VC" };

// Largo de barra por perfil. `opts` puede ser un objeto de overrides (barLen/cieloLen/tiraLen) o,
// por compatibilidad, un número (mismo largo para todos los perfiles).
const resolveBar = (perfil, opts) => typeof opts === "number" ? opts : barLenOf(perfil, opts || {});

// piezas: array de { tipo, perfil, largo, ... } (salida de buildPieces).
export function cutList(piezas){
  const map = new Map();
  (piezas || []).forEach(p => {
    if (p.superficie) return; // superficies (placa de piso, revestimientos): m², no salen de una barra
    const k = p.tipo + "|" + p.perfil + "|" + p.largo;
    if (map.has(k)) map.get(k).cant += 1;
    else map.set(k, { tipo:p.tipo, perfil:p.perfil, largo:p.largo, cant:1, categoria:p.categoria || null });
  });
  const groups = [...map.values()].sort((a,b) => a.tipo < b.tipo ? -1 : a.tipo > b.tipo ? 1 : a.largo - b.largo);
  const seq = {};
  groups.forEach(g => { const pf = CODE_PREF[g.tipo] || "P"; seq[pf] = (seq[pf]||0) + 1; g.code = pf + seq[pf]; });
  // `byProfile` alimenta el bin-packing de BARRAS. El fleje viene en ROLLO, no en barra: queda en
  // `groups` (aparece en la lista de corte, sección FLEJES) pero fuera del empaquetado.
  const byProfile = {};
  groups.forEach(g => {
    if (g.categoria === "fleje") return;
    (byProfile[g.perfil] = byProfile[g.perfil] || []).push(...Array(g.cant).fill(g.largo));
  });
  return { groups, byProfile };
}

// Plan de corte detallado: por perfil, las barras/tiras con las piezas (código+largo) que salen de
// cada una (First-Fit). Sirve para la pestaña Cortes: "de qué barra sale" cada pieza.
export function cutPlan(piezas, opts){
  const { groups } = cutList(piezas);
  const byPerfil = {}, flejes = [];
  groups.forEach(g => {
    const dest = g.categoria === "fleje" ? flejes : (byPerfil[g.perfil] || (byPerfil[g.perfil] = []));
    for (let i = 0; i < g.cant; i++) dest.push({ code: g.code, tipo: g.tipo, largo: g.largo, perfil: g.perfil });
  });
  const out = [];
  Object.keys(byPerfil).sort().forEach(perfil => {
    const barLen = resolveBar(perfil, opts);
    const items = byPerfil[perfil].slice().sort((a,b) => b.largo - a.largo);
    const bins = [];
    let over = 0;
    items.forEach(it => {
      if (it.largo > barLen){ over++; return; }
      let bin = bins.find(b => b.rem >= it.largo);
      if (!bin){ bin = { items: [], usado: 0, rem: barLen }; bins.push(bin); }
      bin.items.push(it); bin.usado += it.largo; bin.rem -= it.largo;
    });
    const usadoTot = bins.reduce((s,b) => s + b.usado, 0);
    const waste = bins.length ? +(1 - usadoTot / (bins.length * barLen)).toFixed(3) * 100 : 0;
    out.push({ perfil, barLen, bins, piezas: items.length - over, over, waste: +waste.toFixed(1) });
  });
  // Sección FLEJES: se listan los largos por pieza, pero NO se empaquetan en barras (vienen en rollo).
  if (flejes.length){
    const mm = flejes.reduce((a, it) => a + it.largo, 0);
    out.push({ perfil: flejes[0].perfil, fleje: true, items: flejes, piezas: flejes.length,
      metros: +(mm/1000).toFixed(2), rollos: Math.ceil(mm / FLEJE.rollo), largoRollo: FLEJE.rollo });
  }
  return out;
}

// Bin-packing First-Fit sobre la barra comercial DE CADA PERFIL (barLenOf). Sin merma de sierra.
// `opts`: overrides {barLen,cieloLen,tiraLen} o un número (mismo largo para todos, compat).
export function optimizeCuts(byProfile, opts){
  const out = [];
  Object.keys(byProfile).forEach(perfil => {
    const barLen = resolveBar(perfil, opts);
    const all = byProfile[perfil];
    const lens = all.filter(l => l <= barLen).slice().sort((a,b) => b - a);
    const over = all.filter(l => l > barLen).length;
    const bars = [];
    lens.forEach(l => { const b = bars.find(x => x.rem >= l); if (b) b.rem -= l; else bars.push({ rem: barLen - l }); });
    const usado = lens.reduce((s,l) => s + l, 0);
    const waste = bars.length ? (1 - usado / (bars.length * barLen)) * 100 : 0;
    out.push({ perfil, piezas: lens.length, bars: bars.length, waste:+waste.toFixed(1), over, barLen });
  });
  return out.sort((a,b) => a.perfil < b.perfil ? -1 : 1);
}
