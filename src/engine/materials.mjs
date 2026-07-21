// ADAMANT · cómputo de materiales en unidades de venta (corralón).
// (B) Todo lo cuantitativo sale de la geometría (`buildPieces`): conteos, metros, peso y
// la lista de corte. El área de revestimiento es lo único que no es una pieza (se calcula
// como superficie de muro menos vanos).
import { resolveSystem, PGC, PGU, LUMBER, REVEST, lumberKg, cutOpts, FLEJE, FLEJE_PERFIL } from "./systems.mjs";
import { buildPieces } from "./frame.mjs";
import { computeFlejes } from "./brace.mjs";
import { cutList, optimizeCuts } from "./cuts.mjs";

const MONT_FAM = new Set(["MONTANTE","KING","JACK","DINTEL","CRIPPLE"]); // familia montante (perfil vertical/dintel)

function kgPerfil(perfil){
  if (PGC[perfil]) return PGC[perfil].kg;
  if (PGU[perfil]) return PGU[perfil].kg;
  if (LUMBER[perfil]) return lumberKg(perfil);
  return 0;
}

export function computeMaterials(input, piezas){
  piezas = piezas || buildPieces(input);
  const s = resolveSystem(input);
  const larg = +input.largo, ALT = +input.alto;
  const vanos = (input.vanos||[]).map(v => ({ tipo:v.tipo, x1:+v.x1, x2:+v.x2, h:+v.h, sill:+v.sill||0 }));

  // conteos, metros y peso desde la geometría
  const nMont = piezas.filter(p => p.tipo === "MONTANTE").length;
  const nVanos = vanos.length;
  let mMont = 0, mSol = 0, peso = 0;
  piezas.forEach(p => {
    if (p.categoria === "fleje") return; // el fleje se computa aparte (rollo, no barra); ver `flejes`
    const m = p.largo/1000; if (MONT_FAM.has(p.tipo)) mMont += m; else mSol += m; peso += m * kgPerfil(p.perfil);
  });

  // área de muro menos vanos (no es una pieza)
  let area = (larg/1000) * (ALT/1000);
  vanos.forEach(v => { area -= ((v.x2 - v.x1)/1000) * ((v.h - v.sill)/1000); });
  area = Math.max(0, area);

  // unidades de venta: barras por perfil, desde la lista de corte (que sale de las piezas)
  const { byProfile } = cutList(piezas);
  const opt = optimizeCuts(byProfile, cutOpts(input)); // largo de barra por perfil (PGC/PGU 6 m, madera 3,05 m)
  const perfiles = opt.map(o => ({
    perfil: o.perfil,
    metros: +(byProfile[o.perfil].reduce((a,b) => a + b, 0) / 1000).toFixed(2),
    piezas: o.piezas,
    barras: o.bars,
    largoBarra: o.barLen,
    sobrantes: o.over
  }));

  // placas de revestimiento (1,20 × 2,40 m = 2,88 m²)
  const o = { ...(input.opciones||{}) };
  const placas = [];
  [["interior", o.revInt], ["exterior", o.revExt]].forEach(([cara, rev]) => {
    if (rev && rev !== "Ninguno" && REVEST[rev] !== undefined)
      placas.push({ cara, material: rev, m2: +area.toFixed(2), unidades: Math.ceil(area / 2.88) });
  });
  const aislacion = o.aislacion ? +area.toFixed(2) : 0;

  // arriostramiento: el fleje viene en rollo (metros lineales + rollos), 1 tensor por fleje y
  // 4 tornillos T1 por extremo (se suman a los T1 de estructura).
  const flejes = computeFlejes(piezas);

  // fijaciones (estimación): T1 estructura (perfil-perfil) + T2 placa
  const t1 = Math.round(nMont * 2 + nVanos * 12) + (flejes ? flejes.t1 : 0);
  const m2placa = placas.reduce((a,p) => a + p.m2, 0);
  const t2 = Math.round(m2placa * 14);

  // carpintería (hoja) según el tipo de vano: puerta y ventana son ítems "a definir" (sin precio
  // default); la arcada (paso libre) NO lleva carpintería. El dintel reforzado ya está en `perfiles`.
  const nPuerta = vanos.filter(v => v.tipo === "puerta").length;
  const nVent   = vanos.filter(v => v.tipo === "ventana").length;
  const otros = [];
  if (nPuerta) otros.push({ key:"carp-puerta", label:"Puerta (hoja) — a definir por el usuario", unidad:"u", cantidad:nPuerta });
  if (nVent)   otros.push({ key:"carp-ventana", label:"Ventana — a definir por el usuario", unidad:"u", cantidad:nVent });
  if (flejes){
    otros.push({ key:"fleje-rollo", label:`${FLEJE_PERFIL} galvanizado (rollo ${FLEJE.rollo/1000} m) — ${flejes.metros} m`,
      unidad:"rollo", cantidad:flejes.rollos });
    otros.push({ key:"tensor", label:"Tensor para fleje", unidad:"u", cantidad:flejes.tensores });
  }

  return {
    sistema: input.sistema, larg, alto: ALT, modulo: s.modulo,
    area: +area.toFixed(2), nMont, nVanos,
    mMont: +mMont.toFixed(2), mSol: +mSol.toFixed(2), peso: +peso.toFixed(1),
    perfiles, placas, aislacion, otros, flejes,
    tornillos: { t1, t2 },
    barLen: s.barLen
  };
}
