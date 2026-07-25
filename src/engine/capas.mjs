// ADAMANT · Composición de capas del muro (F11-bis.2, rework). El usuario elige RESULTADOS (un
// "sistema de terminación" por cara = un paquete de capas válido), no toggles sueltos. Adamant arma el
// sándwich completo y decide solo la barrera de vapor, la membrana y el rastrel. La edición capa por
// capa (nivel 2) resuelve las dependencias sola y nunca tira un aviso de error.
//
// Cada capa activa se dibuja como SUPERFICIE (recorta los vanos al paso libre) y suma m² — NO genera
// cortes. La aislación va en la cavidad: no suma al espesor total.
import { resolveSystem } from "./systems.mjs";

// Materiales base: espesor (mm), tornillo (T2 mecha yeso / alas OSB-cementicia-siding), color 3D
// (consistente en el corte y el visor), kg/m². `cav` = va en la cavidad; `locked` = no se puede quitar.
export const MAT = {
  osb11:      { label: "OSB 11,1",             esp: 11.1, t2: "alas",  color: 0xc9a66b, kg: 7.0 },
  fenolico:   { label: "Fenólico 12",          esp: 12,   t2: "alas",  color: 0xbf9a58, kg: 8.4 },
  cem8:       { label: "Placa cementicia 8",   esp: 8,    t2: "alas",  color: 0xb8b0a4, kg: 13.19 },
  cem12:      { label: "Placa cementicia 12",  esp: 12,   t2: "alas",  color: 0xb0a89c, kg: 15.97 },
  membrana:   { label: "Membrana hidrófuga",   esp: 0.5,  color: 0xcfcfc4, kg: 0.2, solape: 0.10, auto: true },
  malla:      { label: "Malla + fijaciones",   esp: 1,    color: 0xd8d8cc, kg: 0.3, auto: true },
  rastrel20:  { label: "Rastrel + cámara 20",  esp: 20,   color: 0x7a6a52, kg: 1.5, auto: true },
  sidingCem12:{ label: "Siding cementicio 12", esp: 12,   t2: "alas",  color: 0x9a8c7a, kg: 13.91 },
  sidingVin:  { label: "Siding vinílico",      esp: 5,    t2: "alas",  color: 0x8fa0a8, kg: 2.5 },
  revoque:    { label: "Revoque plástico",     esp: 6,    color: 0xb0a090, kg: 9.0 },
  chapaC25:   { label: "Chapa sinusoidal C25", esp: 5,    t2: "alas",  color: 0x9fb0b8, kg: 5.0 },
  yeso125:    { label: "Yeso 12,5",            esp: 12.5, t2: "mecha", color: 0xe6e6df, kg: 8.9 },
  yesoVerde:  { label: "Yeso verde 12,5",      esp: 12.5, t2: "mecha", color: 0xbfe0c8, kg: 9.5 },
  yesoRojo:   { label: "Yeso rojo 12,5",       esp: 12.5, t2: "mecha", color: 0xe6b0a8, kg: 10.0 },
  vapor:      { label: "Barrera de vapor",     esp: 0.2,  color: 0x88b0d0, kg: 0.15, solape: 0.10, locked: true, auto: true },
  lana50:     { label: "Lana de vidrio 50",    esp: 50,   color: 0xf2d98a, kg: 0.7, cav: true },
  lana100:    { label: "Lana de vidrio 100",   esp: 100,  color: 0xf2d98a, kg: 1.4, cav: true }
};

// Sistemas de terminación EXTERIOR (cara de afuera del muro exterior). Cada uno = paquete válido,
// del frame hacia afuera. Ilustración por ícono en la UI.
export const SIST_EXT = {
  "siding-cem": { label: "Siding cementicio",   ico: "siding", desc: "Terminación robusta y clásica.",         capas: ["osb11","membrana","rastrel20","sidingCem12"] },
  "siding-vin": { label: "Siding vinílico",     ico: "siding", desc: "Liviano, bajo mantenimiento.",           capas: ["osb11","membrana","rastrel20","sidingVin"] },
  "revoque":    { label: "Revoque sobre placa", ico: "revoque",desc: "Look de mampostería, revocado.",         capas: ["cem8","membrana","malla","revoque"] },
  "chapa":      { label: "Chapa sinusoidal",    ico: "chapa",  desc: "Económico, tipo galpón o quincho.",      capas: ["osb11","membrana","rastrel20","chapaC25"] },
  "obra":       { label: "Sin terminación",     ico: "obra",   desc: "OSB + membrana, terminás después.",      capas: ["osb11","membrana"] }
};
// Sistemas INTERIORES (cara interior del exterior; Caras A y B de portantes/tabiques).
export const SIST_INT = {
  "yeso":       { label: "Yeso pintado",        ico: "yeso",   desc: "Placa 12,5 estándar, lista para pintar.", capas: ["yeso125"] },
  "yeso-verde": { label: "Baño o cocina",       ico: "agua",   desc: "Yeso verde 12,5, resiste humedad.",       capas: ["yesoVerde"] },
  "doble":      { label: "Doble placa",         ico: "doble",  desc: "Más rígido y mejor aislación acústica.",  capas: ["yeso125","yeso125"] },
  "fuego":      { label: "Resistente al fuego", ico: "fuego",  desc: "Yeso rojo 12,5 (RF).",                    capas: ["yesoRojo"] },
  "obra":       { label: "Sin terminación",     ico: "obra",   desc: "Estructura a la vista.",                  capas: [] }
};
export const AISLA = {
  no:       { label: "Sin aislación",                mat: null },
  estandar: { label: "Aislación estándar",           mat: "lana50",  desc: "Lana de vidrio 50 mm." },
  fria:     { label: "Zona fría o techo expuesto",   mat: "lana100", desc: "Lana de vidrio 100 mm." }
};

// Los sistemas ofrecidos para una cara según el tipo de muro. Cara "A" = afuera, "B" = adentro.
export function sistemasCara(tipoMuro, cara){
  return (tipoMuro === "exterior" && cara === "A") ? SIST_EXT : SIST_INT;
}

// Defaults por tipo (producen un muro válido sin tocar nada). Exterior: siding cementicio + yeso +
// lana 100. Interior portante: yeso ambas caras + lana 50. Tabique: yeso ambas caras, sin aislación.
export function capasDefault(tipoMuro){
  if (tipoMuro === "exterior") return { caraA: "siding-cem", caraB: "yeso", aislacion: "fria", custom: false, off: [] };
  if (tipoMuro === "interior") return { caraA: "yeso", caraB: "yeso", aislacion: "estandar", custom: false, off: [] };
  return { caraA: "yeso", caraB: "yeso", aislacion: "no", custom: false, off: [] }; // tabique
}

// Instancia de capa a partir de un material.
function mkLayer(matId, lado, id){
  const m = MAT[matId];
  return { id, matId, label: m.label, esp: m.esp, color: m.color, t2: m.t2 || null,
    kg: m.kg, solape: m.solape || 0, locked: !!m.locked, auto: !!m.auto,
    lado: m.cav ? "cav" : lado };
}

// COMPOSICIÓN: la lista ordenada de capas del muro (afuera → adentro), derivada de los sistemas
// elegidos + aislación, con la barrera de vapor puesta sola. Si `custom`, respeta las capas apagadas
// (cfg.off) sin romper dependencias (ver resolverCustom).
export function composicion(input){
  const tipo = input.tipoMuro, cfg = input.capas || capasDefault(tipo);
  const sA = sistemasCara(tipo, "A"), sB = sistemasCara(tipo, "B");
  const defA = Object.keys(sA)[0], defB = Object.keys(sB)[0];
  const L = [];
  (sA[cfg.caraA] || sA[defA]).capas.forEach((mId, i) => L.push(mkLayer(mId, "ext", "A" + i)));
  const aisMat = AISLA[cfg.aislacion]?.mat;
  if (aisMat) L.push(mkLayer(aisMat, "cav", "aisla"));
  // barrera de vapor: sola, del lado calefaccionado (cara interior del muro exterior), cuando hay aislación.
  if (tipo === "exterior" && aisMat) L.push(mkLayer("vapor", "int", "vapor"));
  (sB[cfg.caraB] || sB[defB]).capas.forEach((mId, i) => L.push(mkLayer(mId, "int", "B" + i)));
  // Bloqueos: la barrera de vapor (ya viene locked) + las capas automáticas (membrana/rastrel/malla,
  // vienen con el sistema) + la placa estructural del muro exterior (la primera capa ext = sheathing).
  L.forEach(l => { if (l.auto) l.locked = true; });
  if (tipo === "exterior"){ const sheat = L.find(l => l.lado === "ext"); if (sheat) sheat.locked = true; }
  // modo custom: apagar las capas marcadas (nunca las locked/estructura).
  const off = new Set(cfg.custom ? (cfg.off || []) : []);
  return L.filter(l => !(off.has(l.id) && !l.locked));
}

// Área del muro menos vanos (m²).
function areaMuro(input){
  const larg = +input.largo, alt = +input.alto;
  let a = (larg/1000) * (alt/1000);
  (input.vanos || []).forEach(v => { a -= ((+v.x2 - +v.x1)/1000) * ((+v.h - (+v.sill||0))/1000); });
  return Math.max(0, a);
}

// Piezas de superficie de las capas (para el visor; AABB-exentas por `superficie`).
// Muro canónico: X∈[0,larg], espesor Y∈[0,a], altura Z∈[0,alto]. Cara EXTERIOR = Y=0 (capas ext crecen
// hacia −Y); INTERIOR = Y=a (capas int crecen hacia +Y). `orden` numera las capas para el despiece.
export function buildCapas(input){
  if (!input.capas) return [];   // sin composición declarada (p. ej. muros del ambiente): no dibuja capas
  const layers = composicion(input); if (!layers.length) return [];
  const s = resolveSystem(input), a = s.a, cf = s.cf, tS = s.tS;
  const larg = +input.largo, alt = +input.alto;
  const vanos = (input.vanos || []).map(v => ({ x1:+v.x1, x2:+v.x2, h:+v.h, sill:+v.sill||0 }));
  const holes = vanos.map(v => ({ u0: v.x1 + 2*cf, u1: v.x2 - 2*cf, v0: v.sill > 0 ? v.sill + tS : 0, v1: v.h }))
    .filter(h => h.u1 - h.u0 > 5 && h.v1 - h.v0 > 5);
  const surf = (l, esp, yStart, orden, lejos) => ({
    tipo: "CAPA", capa: "cap-" + l.id, capaLabel: l.label, color: l.color, superficie: true, perfil: "a definir",
    capOrden: orden, capLejos: lejos, // para el despiece: orden y "distancia hacia afuera" (−1 int, +1 ext)
    largo: larg, box: { size: [larg, esp, alt], center: [larg/2, yStart + esp/2, alt/2] },
    rev: { u: larg, v: alt, esp, holes, eu: [1,0,0], ev: [0,0,1], en: [0,1,0], origin: [0, yStart, 0] }
  });
  const P = [];
  let yExt = 0, nE = 0;
  layers.filter(l => l.lado === "ext").forEach(l => { yExt -= l.esp; P.push(surf(l, l.esp, yExt, ++nE, -1)); });
  let yInt = a, nI = 0;
  layers.filter(l => l.lado === "int").forEach(l => { P.push(surf(l, l.esp, yInt, ++nI, 1)); yInt += l.esp; });
  const cav = layers.find(l => l.lado === "cav");
  if (cav) P.push(surf(cav, a, 0, 0, 0));
  return P;
}

// Cómputo de las capas: espesor total, m² y datos por capa (para el impacto en vivo), tornillos.
export function computeCapas(input){
  const s = resolveSystem(input), a = s.a;
  const area = areaMuro(input);
  const layers = composicion(input);
  const placas = [], otros = [], detalle = [];
  let espesorTotal = a, aislacion = 0, m2mecha = 0, m2alas = 0;
  const caraNom = { ext: input.tipoMuro === "exterior" ? "exterior" : "Cara A",
    int: input.tipoMuro === "exterior" ? "interior" : "Cara B" };
  layers.forEach(l => {
    if (l.esp <= 0) return;
    if (l.lado !== "cav") espesorTotal += l.esp;
    const m2 = +(area * (1 + l.solape)).toFixed(2);
    detalle.push({ id: l.id, matId: l.matId, label: l.label, esp: l.esp, color: l.color, lado: l.lado,
      locked: l.locked, t2: l.t2, m2, kg: +(m2 * l.kg).toFixed(1) });
    if (l.lado === "cav"){ aislacion = m2; return; }
    if (l.t2){                                   // placa "dura" (yeso/OSB/cementicia/siding)
      placas.push({ cara: caraNom[l.lado], material: l.label, m2, unidades: Math.ceil(m2 / 2.88) });
      if (l.t2 === "mecha") m2mecha += area; else m2alas += area;
    } else {                                     // membranas/rastrel/malla/vapor → por m²
      otros.push({ key: "cap-" + l.id, label: l.label, unidad: "m²", cantidad: Math.ceil(m2) });
    }
  });
  if (m2mecha) otros.push({ key: "t2-mecha", label: "Tornillo T2 punta mecha (yeso)", unidad: "u", cantidad: Math.round(m2mecha * 14) });
  if (m2alas)  otros.push({ key: "t2-alas",  label: "Tornillo T2 con alas (OSB/fenólico/cementicia/siding)", unidad: "u", cantidad: Math.round(m2alas * 14) });
  return { espesorTotal: Math.round(espesorTotal), placas, aislacion, otros, t2: 0, detalle, area: +area.toFixed(2) };
}
