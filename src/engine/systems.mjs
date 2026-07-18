// ADAMANT · motor de entramado — parámetros por sistema (steel / wood)
// Portado de las tablas y constantes del generador HTML existente (IRAM-IAS U 500-205 Barbieri / Wood framing).

export const PGC = {
  "PGC 90x0.90":{a:90,e:0.9,kg:1.42},"PGC 90x1.25":{a:90,e:1.25,kg:1.97},"PGC 90x1.60":{a:90,e:1.6,kg:2.52},
  "PGC 100x0.90":{a:100,e:0.9,kg:1.51},"PGC 100x1.25":{a:100,e:1.25,kg:2.1},"PGC 100x1.60":{a:100,e:1.6,kg:2.68},
  "PGC 140x0.90":{a:140,e:0.9,kg:1.87},"PGC 140x1.25":{a:140,e:1.25,kg:2.6},"PGC 140x1.60":{a:140,e:1.6,kg:3.32},"PGC 140x2.00":{a:140,e:2.0,kg:4.15},
  "PGC 150x1.60":{a:150,e:1.6,kg:3.48},"PGC 200x1.60":{a:200,e:1.6,kg:4.28},"PGC 250x2.00":{a:250,e:2.0,kg:6.35}
};
export const PGU = {
  "PGU 90x0.90":{a:92,e:0.9,kg:1.11},"PGU 90x1.25":{a:93,e:1.25,kg:1.54},"PGU 90x1.60":{a:94,e:1.6,kg:1.97},
  "PGU 100x0.90":{a:102,e:0.9,kg:1.18},"PGU 100x1.25":{a:103,e:1.25,kg:1.64},"PGU 100x1.60":{a:104,e:1.6,kg:2.1},
  "PGU 140x0.90":{a:142,e:0.9,kg:1.46},"PGU 140x1.25":{a:143,e:1.25,kg:2.04},"PGU 140x1.60":{a:144,e:1.6,kg:2.6},"PGU 140x2.00":{a:145,e:2.0,kg:3.25},
  "PGU 150x1.60":{a:154,e:1.6,kg:2.73},"PGU 200x1.60":{a:204,e:1.6,kg:3.35},"PGU 250x2.00":{a:255,e:2.0,kg:4.98}
};
export const REVEST = {
  "Ninguno":0,"Durlock 12.5":8.9,"Durlock 9.5":7.0,"OSB / Fenólico 10":7.0,
  "Placa cementicia 12":15.97,"Placa cementicia 8":13.19,"Siding cementicio 12":13.91,"PVC (aprox)":3.5
};
export const LUMBER = {
  "2x3 (38×64)":{e:38,a:64},"2x4 (38×89)":{e:38,a:89},"2x6 (38×140)":{e:38,a:140},
  "2x8 (38×184)":{e:38,a:184},"2x10 (38×235)":{e:38,a:235},"2x12 (38×286)":{e:38,a:286}
};
// Perfiles de cielorraso suspendido (PGO/solera galvanizada). a = alma, fl = ala, e = espesor, kg = kg/m.
// El perímetro y los portantes usan el mismo perfil (como en el generador legacy scriptCielo).
export const CIELO = {
  "Solera/montante 70":  { a:70,  fl:30, e:0.94, kg:0.75 },
  "Solera/montante 100": { a:100, fl:30, e:1.25, kg:1.05 }
};
// Cielorraso suspendido de dos niveles (configurable, mm):
//   VELA_SEP     — separación máx. de velas a lo largo de cada viga maestra (cuelgan de la losa).
//   MAESTRA_SEP  — separación máx. de vigas maestras (nivel superior, continuas, transversales).
//   MONTANTE_SEP — separación de montantes (nivel inferior, continuos, reciben la placa).
//   BORDE_LIBRE  — ninguna maestra ni vela puede quedar a menos de esta distancia de las soleras
//                  (el perímetro ya lo rigidiza la solera fijada al muro; maestras/velas son del CENTRO).
//   RIGIDIZA_MARGEN — si la luz ≤ 2·BORDE_LIBRE + este margen, el tramo NO lleva maestras/velas.
export const VELA_SEP = 1000, MAESTRA_SEP = 1200, MONTANTE_SEP = 400;
export const BORDE_LIBRE = 600, RIGIDIZA_MARGEN = 1000;
// Dintel: hasta este ancho de vano va simple; si lo supera, se refuerza (dintel DOBLE = 2 perfiles/
// tirantes adicionales espejados). Aplica a los tres tipos de vano (puerta/ventana/arcada). Configurable.
export const DINTEL_SIMPLE_MAX = 1500;
export const PGC_ALA = 40, PGC_LABIO = 15, PGU_ALA = 35, WOOD_DENS = 480;
// PGO (Omega) — perfil de cielorraso suspendido (IRAM, kg/m estimado).
export const PGO = { a: 37, b: 22, c: 12.5, kg: 0.47 };

export function lumberKg(sz){ const L = LUMBER[sz]; return L.e * L.a * WOOD_DENS / 1e6; } // kg/m

// Largo de barra/tira COMERCIAL por familia de perfil (mm). No es global: la optimización de cortes
// elige el largo del perfil de cada grupo de piezas. Variantes reales de fábrica:
//   PGC/PGU (muro/piso)       → 6,00 m
//   riel/portante cielorraso  → 2,60 / 3,00 m  (default 3,00)
//   tirante de madera         → 3,05 / 3,66 / 4,88 m (default 3,05; el piso usa 4,88)
// `opts` permite override por proyecto: { barLen, cieloLen, tiraLen }.
export const BAR_LEN = { steel: 6000, cielo: 3000, wood: 3050 };
export function barLenOf(perfil, opts = {}){
  if (CIELO[perfil])  return +opts.cieloLen || BAR_LEN.cielo;
  if (LUMBER[perfil]) return +opts.tiraLen  || BAR_LEN.wood;
  return +opts.barLen || BAR_LEN.steel; // PGC / PGU (y perfiles desconocidos)
}
// Overrides de largo comercial que declara el proyecto (desde input.opciones), para pasar a cortes.
export function cutOpts(input){
  const o = (input && input.opciones) || {};
  return { barLen: o.barLen, cieloLen: o.cieloLen, tiraLen: o.tiraLen };
}

export const DEFAULTS = { modulo:400, pgc:"PGC 100x0.90", pgu:"PGU 100x0.90", lumber:"2x6 (38×140)",
  revInt:"Durlock 12.5", revExt:"Ninguno", aislacion:false, barLen:6000, tiraLen:3050 };

// Devuelve los parámetros de sección/altura de un muro según el sistema.
// La geometría (montantes, soleras, vanos) es idéntica; solo cambian secciones, nombres y fijaciones.
export function resolveSystem(input){
  const o = { ...DEFAULTS, ...(input.opciones||{}) };
  const modulo = +o.modulo || 400;
  if (input.sistema === "wood"){
    const lumber = LUMBER[o.lumber] ? o.lumber : "2x6 (38×140)";
    const L = LUMBER[lumber];
    return { wood:true, modulo, perfilMont:lumber, perfilSol:lumber,
      te:L.e, a:L.a, cf:L.e, headH:L.a,
      tS:L.e, ntop:2, kgM:lumberKg(lumber), kgP:lumberKg(lumber),
      barLen:+o.tiraLen || 3050, opt:o };
  }
  const pgc = PGC[o.pgc] ? o.pgc : "PGC 100x0.90";
  const pgu = PGU[o.pgu] ? o.pgu : "PGU 100x0.90";
  const C = PGC[pgc], U = PGU[pgu];
  return { wood:false, modulo, perfilMont:pgc, perfilSol:pgu,
    a:U.a, fl:PGU_ALA, t:U.e, cf:PGC_ALA, ca:C.a, cl:PGC_LABIO, ct:C.e, headH:C.a,
    tS:U.e, ntop:1, kgM:C.kg, kgP:U.kg,
    barLen:+o.barLen || 6000, opt:o };
}
