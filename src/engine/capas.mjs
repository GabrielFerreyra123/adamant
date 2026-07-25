// ADAMANT · Capas de revestimiento del muro (F11-bis.2). De AFUERA hacia ADENTRO.
// Cada capa activa se dibuja como SUPERFICIE (capa visual conmutable, recorta los vanos al paso libre)
// y suma m² al cómputo — NO genera cortes (el despiece real de placas es una fase aparte). La aislación
// va DENTRO de la cavidad: no suma al espesor total del muro.
import { resolveSystem } from "./systems.mjs";

// Opciones de material por familia: espesor (mm) y tornillo (T2 mecha para yeso / T2 con alas para
// OSB, fenólico, cementicia y siding).
export const CAP_OPC = {
  term:     { "Siding cementicio 12":{esp:12,t2:"alas"}, "Siding vinílico":{esp:5,t2:"alas"}, "Revoque sobre cementicia":{esp:20,t2:"alas"}, "Ninguna":{esp:0} },
  placaExt: { "OSB 11,1":{esp:11.1,t2:"alas"}, "Fenólico 12":{esp:12,t2:"alas"}, "Cementicia 8":{esp:8,t2:"alas"}, "Cementicia 12":{esp:12,t2:"alas"}, "Ninguna":{esp:0} },
  yeso:     { "Yeso 12,5":{esp:12.5,t2:"mecha"}, "Yeso verde 12,5":{esp:12.5,t2:"mecha"}, "Yeso rojo 12,5":{esp:12.5,t2:"mecha"}, "Doble placa 25":{esp:25,t2:"mecha"}, "Ninguna":{esp:0} },
  aisla:    { "Lana 50":{esp:50}, "Lana 80":{esp:80}, "Lana 100":{esp:100}, "Ninguna":{esp:0} }
};
const RASTREL_ESP = 25, MEMBRANA_ESP = 0.5, VAPOR_ESP = 0.2, SOLAPE = 0.10;

// Capas de un muro según su tipo, de AFUERA hacia ADENTRO. `lado`: ext (afuera del frame) · cav
// (dentro de la cavidad, no suma espesor) · int (adentro del frame). `kind`: 'sel' (material) o 'toggle'.
export function capasDeMuro(tipoMuro){
  if (tipoMuro === "exterior") return [
    { id:"term",     lado:"ext", label:"Terminación exterior",       kind:"sel",    opc:"term",     color:0x9a8c7a },
    { id:"rastrel",  lado:"ext", label:"Rastrel + cámara de aire",   kind:"toggle", esp:RASTREL_ESP, color:0x7a6a52 },
    { id:"membrana", lado:"ext", label:"Barrera de agua y viento",   kind:"toggle", esp:MEMBRANA_ESP, solape:SOLAPE, color:0xcfcfc4 },
    { id:"placaExt", lado:"ext", label:"Placa estructural exterior", kind:"sel",    opc:"placaExt", color:0xc9a66b },
    { id:"aisla",    lado:"cav", label:"Aislación",                  kind:"sel",    opc:"aisla",    color:0xf2d98a },
    { id:"vapor",    lado:"int", label:"Barrera de vapor",           kind:"toggle", esp:VAPOR_ESP, solape:SOLAPE, color:0x88b0d0 },
    { id:"placaInt", lado:"int", label:"Placa interior",             kind:"sel",    opc:"yeso",     color:0xe6e6df }
  ];
  // interior portante / tabique: dos caras de placa + aislación (acústica en el tabique).
  const acust = tipoMuro === "tabique" ? " acústica" : "";
  return [
    { id:"placaExt", lado:"ext", label:"Placa Cara A",     kind:"sel", opc:"yeso",  color:0xe6e6df },
    { id:"aisla",    lado:"cav", label:"Aislación" + acust, kind:"sel", opc:"aisla", color:0xf2d98a },
    { id:"placaInt", lado:"int", label:"Placa Cara B",     kind:"sel", opc:"yeso",  color:0xe6e6df }
  ];
}

// Defaults de capas por tipo (producen un muro válido sin tocar nada).
export function capasDefault(tipoMuro){
  if (tipoMuro === "exterior") return { term:"Siding cementicio 12", rastrel:false, membrana:true, placaExt:"OSB 11,1", aisla:"Lana 100", vapor:true, placaInt:"Yeso 12,5" };
  if (tipoMuro === "interior") return { placaExt:"Yeso 12,5", aisla:"Lana 50", placaInt:"Yeso 12,5" };
  return { placaExt:"Yeso 12,5", aisla:"Ninguna", placaInt:"Yeso 12,5" }; // tabique
}

// Espesor y datos de material de una capa según su valor actual. (Exportado para la UI de la sección.)
export function datoCapa(cap, val){
  if (cap.kind === "toggle") return { esp: val ? cap.esp : 0, t2: null, material: val ? cap.label : null };
  const o = CAP_OPC[cap.opc][val]; if (!o || o.esp <= 0) return { esp: 0, t2: null, material: null };
  return { esp: o.esp, t2: o.t2 || null, material: val };
}

// Área del muro menos vanos (m²), común al cómputo de capas.
function areaMuro(input){
  const larg = +input.largo, alt = +input.alto;
  let a = (larg/1000) * (alt/1000);
  (input.vanos || []).forEach(v => { a -= ((+v.x2 - +v.x1)/1000) * ((+v.h - (+v.sill||0))/1000); });
  return Math.max(0, a);
}

// Piezas de superficie de las capas activas (para el visor + AABB-exentas por `superficie`).
// El muro canónico corre en X∈[0,larg], espesor en Y∈[0,a], altura Z∈[0,alto]. La cara EXTERIOR es
// Y=0 (las capas ext crecen hacia −Y); la INTERIOR es Y=a (las capas int crecen hacia +Y).
export function buildCapas(input){
  if (!input.capas) return [];
  const s = resolveSystem(input), a = s.a, cf = s.cf, tS = s.tS;
  const larg = +input.largo, alt = +input.alto;
  const vanos = (input.vanos || []).map(v => ({ x1:+v.x1, x2:+v.x2, h:+v.h, sill:+v.sill||0 }));
  // huecos = paso libre: lateral entre caras interiores de los jacks; arriba cara inferior del dintel;
  // abajo (ventana) cara superior de la solera de antepecho. Igual criterio que el revestimiento del ambiente.
  const holes = vanos.map(v => ({ u0: v.x1 + 2*cf, u1: v.x2 - 2*cf, v0: v.sill > 0 ? v.sill + tS : 0, v1: v.h }))
    .filter(h => h.u1 - h.u0 > 5 && h.v1 - h.v0 > 5);
  const surf = (cap, esp, yStart) => ({
    tipo: "CAPA", capa: "cap-" + cap.id, capaLabel: cap.label, color: cap.color, superficie: true, perfil: "a definir",
    largo: larg, box: { size: [larg, esp, alt], center: [larg/2, yStart + esp/2, alt/2] },
    rev: { u: larg, v: alt, esp, holes, eu: [1,0,0], ev: [0,0,1], en: [0,1,0], origin: [0, yStart, 0] }
  });
  const caps = capasDeMuro(input.tipoMuro);
  const P = [];
  // exterior: apilar hacia −Y desde la cara del frame (Y=0), en orden placaExt (pegada) → membrana → rastrel → term.
  let yExt = 0;
  ["placaExt","membrana","rastrel","term"].forEach(id => {
    const cap = caps.find(c => c.id === id && c.lado === "ext"); if (!cap) return;
    const { esp } = datoCapa(cap, input.capas[id]); if (esp <= 0) return;
    yExt -= esp; P.push(surf(cap, esp, yExt));
  });
  // interior: apilar hacia +Y desde Y=a, en orden vapor (pegada) → placaInt.
  let yInt = a;
  ["vapor","placaInt"].forEach(id => {
    const cap = caps.find(c => c.id === id && c.lado === "int"); if (!cap) return;
    const { esp } = datoCapa(cap, input.capas[id]); if (esp <= 0) return;
    P.push(surf(cap, esp, yInt)); yInt += esp;
  });
  // aislación: rellena la cavidad Y∈[0,a] (no suma espesor exterior).
  const cav = caps.find(c => c.id === "aisla");
  if (cav){ const { esp } = datoCapa(cav, input.capas.aisla); if (esp > 0) P.push(surf(cav, a, 0)); }
  return P;
}

// Cómputo de las capas: espesor total del muro, m² por capa, tornillos por material, aislación.
export function computeCapas(input){
  const s = resolveSystem(input), a = s.a;
  const area = areaMuro(input);
  const caps = capasDeMuro(input.tipoMuro);
  const placas = [], otros = [];
  let espesorTotal = a, aislacion = 0, m2mecha = 0, m2alas = 0;
  const nombreCara = { placaExt: input.tipoMuro === "exterior" ? "exterior" : "Cara A",
    placaInt: input.tipoMuro === "exterior" ? "interior" : "Cara B" };
  caps.forEach(cap => {
    const d = datoCapa(cap, input.capas[cap.id]);
    if (d.esp <= 0) return;
    if (cap.lado !== "cav") espesorTotal += d.esp;               // la aislación (cav) no suma espesor
    if (cap.id === "aisla"){ aislacion = +area.toFixed(2); return; }
    if (cap.kind === "sel"){
      const solape = cap.solape || 0;
      placas.push({ cara: nombreCara[cap.id] || cap.label, material: d.material,
        m2: +(area * (1 + solape)).toFixed(2), unidades: Math.ceil(area * (1 + solape) / 2.88) });
      if (d.t2 === "mecha") m2mecha += area; else if (d.t2 === "alas") m2alas += area;
    } else { // toggle (membrana / rastrel / barrera de vapor)
      const solape = cap.solape || 0;
      otros.push({ key: "cap-" + cap.id, label: cap.label, unidad: "m²", cantidad: Math.ceil(area * (1 + solape)) });
    }
  });
  // T2 ajustado al material real: punta mecha para yeso, con alas para OSB/fenólico/cementicia/siding.
  if (m2mecha) otros.push({ key: "t2-mecha", label: "Tornillo T2 punta mecha (yeso)", unidad: "u", cantidad: Math.round(m2mecha * 14) });
  if (m2alas)  otros.push({ key: "t2-alas",  label: "Tornillo T2 con alas (OSB/fenólico/cementicia/siding)", unidad: "u", cantidad: Math.round(m2alas * 14) });
  return { espesorTotal: Math.round(espesorTotal), placas, aislacion, otros, t2: 0 };
}
