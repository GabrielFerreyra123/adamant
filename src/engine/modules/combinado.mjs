// Módulo COMPUESTO: Ambiente completo (piso + 4 muros) — F9a (orquestador, sin UI).
// NO reimplementa geometría: llama a los módulos Piso y Muro y REUBICA sus piezas al ambiente
// (traslada / rota 90° / eleva sobre la plataforma) fijando p.box (AABB en coords del motor). Los
// submódulos quedan intactos (mismos tests). Materiales y cortes se fusionan y se optimizan GLOBAL.
//
// Ambiente: X = largo, Y = ancho, Z = altura (piso desde z=0). Esquinas: 2 muros PASANTES (frente/fondo,
// largo = largo, corren en X) + 2 ENCAJADOS (izq/der, largo = ancho − 2·espesor, corren en Y). El muro
// encajado butt-ea contra el pasante → cada esquina queda con 2 montantes de extremo (el del pasante y
// el del encajado), sin superponerse.  Montaje platform framing: los muros apoyan SOBRE la placa de piso.
import { piso } from "./piso.mjs";
import { muro } from "./muro.mjs";
import { cielo } from "./cielo.mjs";
import { techo } from "./techo.mjs";
import { resolveSystem, cutOpts, FLEJE, FLEJE_PERFIL, FLEJE_CIELO, FLEJE_CIELO_PERFIL, CIELO } from "../systems.mjs";
import { computeFlejes } from "../brace.mjs";
import { postesEsquina, t1Esquina } from "../esquina.mjs";
import { pieceBoxEngine, boundsEngine } from "../geometry.mjs";
import { cutList, optimizeCuts } from "../cuts.mjs";

const PLACA_ESP = 18;        // espesor de la placa de piso (diafragma) (mm); el muro apoya sobre ella

// Reubica piezas de un submódulo: rot 0|90 (CCW en Z) + traslación. Setea:
//   p.box   — AABB en coords del motor (para el visor y el test AABB),
//   p.parte — piso/frente/fondo/izq/der (para "ver por partes" y el PDF por etapas).
function reubicar(piezas, { rot = 0, tx = 0, ty = 0, tz = 0, parte } = {}){
  // rot 90° CCW en Z: un punto (x,y) → (−y, x); lo mismo vale para los vectores de una base.
  const rotV = v => rot === 90 ? [-v[1], v[0], v[2]] : v;
  const rotP = ([x, y, z]) => rot === 90 ? [-y + tx, x + ty, z + tz] : [x + tx, y + ty, z + tz];
  return piezas.map(p => {
    const { size: [sx, sy, sz], center: [cx, cy, cz] } = pieceBoxEngine(p);
    const box = rot === 90
      ? { size: [sy, sx, sz], center: [-cy + tx, cx + ty, cz + tz] } // (x,y) → (−y, x)
      : { size: [sx, sy, sz], center: [cx + tx, cy + ty, cz + tz] };
    // Las piezas DIAGONALES (flejes) llevan su propia base: hay que transformarla igual que la caja,
    // si no el visor las dibujaría en la posición del submódulo.
    const orient = p.orient && { ...p.orient, c: rotP(p.orient.c),
      u: rotV(p.orient.u), v: rotV(p.orient.v), n: rotV(p.orient.n) };
    return { ...p, box, ...(orient ? { orient } : {}), parte };
  });
}

// Descompone el ambiente en sub-inputs (piso + 4 muros) y el espesor de muro. Usado por generar y
// materiales para no duplicar la lógica de esquinas.
function descomponer(input){
  const largo = +input.largo, ancho = +input.ancho, alto = +input.alto || 2600, placa = input.placa !== false;
  const muroBase = { sistema: input.sistema, alto, opciones: input.opciones, tipo: input.tipo || "tabique" };
  // `arriostraFrente/Fondo/Izq/Der`: selector por muro (default 'cruz', son perimetrales portantes).
  const arr = lado => input["arriostra" + lado] || "cruz";
  const front = muro.generar({ ...muroBase, largo, vanos: input.vanoFrente || [], arriostramiento: arr("Frente") });
  // Espesor del muro = profundidad (Y) del FRAME. Se miden sólo las piezas estructurales: los flejes
  // van apoyados por fuera de la cara y falsearían el espesor (y con él la posición de los 4 muros).
  const e = Math.round(boundsEngine(front.piezas.filter(p => p.categoria !== "fleje")).size[1]);
  const encaj = Math.max(ancho - 2 * e, 1);
  const modulo = +input.opciones?.modulo || 400;

  // NIVELES OPCIONALES (F13): cielorraso y techo se integran como submódulos (el orquestador llama, no
  // reimplementa). Sólo se arman si el ambiente los "lleva" (checkbox del wizard).
  //   TECHO: la cabriada salva por DEFECTO la luz MENOR del ambiente; `techoInvertir` la cambia. Su
  //   separación toma la modulación del muro (cabriadas sobre los montantes). `luzEnX` = la luz corre
  //   sobre el eje X del ambiente → no hay que rotar el techo al reubicarlo.
  let techoInput = null, techoMap = null;
  if (input.llevaTecho){
    const invert = !!input.techoInvertir;
    const luz = invert ? Math.max(largo, ancho) : Math.min(largo, ancho);
    const largoTecho = invert ? Math.min(largo, ancho) : Math.max(largo, ancho);
    techoInput = { sistema: input.sistema, tipo: input.techoTipo === "unAgua" ? "unAgua" : "dosAguas",
      luz, largo: largoTecho, pendiente: +input.techoPendiente || 30,
      alero: input.techoAlero == null ? 400 : +input.techoAlero, separacion: modulo,
      timpanos: input.techoTimpanos !== false, cubierta: input.techoCubierta !== false,
      moduloMuro: modulo, opciones: input.opciones };
    techoMap = { luzEnX: luz === largo };
  }
  //   CIELORRASO: grilla suspendida en el INTERIOR (largo/ancho − 2·espesor), cuelga de la estructura
  //   de techo (o de la losa) hasta su cota. Sólo steel/aluminio.
  const cieloInput = input.llevaCielo
    ? { sistema: "steel", largo: Math.max(largo - 2*e, 100), ancho: Math.max(ancho - 2*e, 100),
        alt: 0, suspension: +input.cieloSusp || 400, modulo, opciones: { perfil: input.cieloPerfil || "Solera/montante 70" } }
    : null;

  // PASANTE / ENCAJADO (F11-bis.3): por defecto Frente y Fondo corren de punta a punta (pasantes) y los
  // Laterales encajan entre ellos. `pasante:"laterales"` invierte la regla para todo el ambiente. El
  // pasante usa la medida exterior completa; el encajado, la exterior − 2·espesor del pasante.
  const pasanteFF = input.pasante !== "laterales";
  const largoFF = largo, largoLat = ancho, encajFF = Math.max(largo - 2*e, 1);
  const M = (parte, largoM, rol, vanos, arrL, caraExt) => ({ parte,
    input: { ...muroBase, largo: largoM, rol, vanos: vanos || [], arriostramiento: arr(arrL), ...(caraExt ? { caraExterior: caraExt } : {}) } });
  // Cada muro con su ubicación (rot/tx/ty en coords del ambiente); `tz` lo pone generar (= tope del piso).
  const muros = pasanteFF ? [
    { ...M("frente", largo, "pasante", input.vanoFrente, "Frente"),          place: { rot: 0,  tx: 0,     ty: 0 } },
    { ...M("fondo",  largo, "pasante", input.vanoFondo,  "Fondo", "ymax"),   place: { rot: 0,  tx: 0,     ty: ancho - e } },
    { ...M("izq",    encaj, "encajado", input.vanoIzq,   "Izq",  "ymax"),    place: { rot: 90, tx: e,     ty: e } },
    { ...M("der",    encaj, "encajado", input.vanoDer,   "Der"),             place: { rot: 90, tx: largo, ty: e } }
  ] : [
    { ...M("izq",    largoLat, "pasante", input.vanoIzq,  "Izq",  "ymax"),   place: { rot: 90, tx: e,     ty: 0 } },
    { ...M("der",    largoLat, "pasante", input.vanoDer,  "Der"),            place: { rot: 90, tx: largo, ty: 0 } },
    { ...M("frente", encajFF,  "encajado", input.vanoFrente, "Frente"),      place: { rot: 0,  tx: e,     ty: 0 } },
    { ...M("fondo",  encajFF,  "encajado", input.vanoFondo,  "Fondo", "ymax"), place: { rot: 0, tx: e,   ty: ancho - e } }
  ];
  // Las 4 esquinas (encuentro pasante↔encajado): punto EXTERIOR + versor del pasante (p) y del encajado
  // (q) hacia el interior. El solver arma el poste (doble del pasante + arranque del encajado).
  const corners = pasanteFF ? [
    { c: [0, 0],         p: [1, 0],  q: [0, 1],  pP: "frente", pE: "izq" },
    { c: [largo, 0],     p: [-1, 0], q: [0, 1],  pP: "frente", pE: "der" },
    { c: [0, ancho],     p: [1, 0],  q: [0, -1], pP: "fondo",  pE: "izq" },
    { c: [largo, ancho], p: [-1, 0], q: [0, -1], pP: "fondo",  pE: "der" }
  ] : [
    { c: [0, 0],         p: [0, 1],  q: [1, 0],  pP: "izq", pE: "frente" },
    { c: [0, ancho],     p: [0, -1], q: [1, 0],  pP: "izq", pE: "fondo" },
    { c: [largo, 0],     p: [0, 1],  q: [-1, 0], pP: "der", pE: "frente" },
    { c: [largo, ancho], p: [0, -1], q: [-1, 0], pP: "der", pE: "fondo" }
  ];

  return {
    largo, ancho, alto, placa, e, encaj, front, modulo, techoInput, techoMap, cieloInput,
    interior: { x: Math.max(largo - 2*e, 0), y: Math.max(ancho - 2*e, 0) }, corners,
    // `vano`: passthrough del vano de escalera/trampa del piso (mismas coords que el entramado).
    pisoInput: { sistema: input.sistema, largo, ancho, separacion: input.separacion || 400,
      apoyo: input.apoyo || "platea", placa, opciones: input.opciones, vano: input.vano || null },
    muros
  };
}

export const combinado = {
  id: "combinado",
  nombre: "Ambiente completo",
  descripcion: "Piso y 4 muros, ensamblados.",
  icono: "🏠",

  defaults(){
    return { sistema: "steel", largo: 4000, ancho: 3000, alto: 2600, apoyo: "platea", placa: true, pasante: "frenteFondo",
      opciones: { pgc: "PGC 100x0.90", pgu: "PGU 100x0.90", lumber: "2x6 (38×140)", modulo: 400 },
      vanoFrente: [], vanoFondo: [], vanoIzq: [], vanoDer: [],
      arriostraFrente: "cruz", arriostraFondo: "cruz", arriostraIzq: "cruz", arriostraDer: "cruz",
      // niveles opcionales (F13)
      llevaCielo: false, cieloSusp: 400, cieloPerfil: "Solera/montante 70",
      llevaTecho: false, techoTipo: "dosAguas", techoPendiente: 30, techoAlero: 400,
      techoInvertir: false, techoTimpanos: true, techoCubierta: true };
  },

  // Flujo por NIVELES (F13): Suelo → Muros y vanos → Cielorraso → Techo. Cielo y techo son opcionales
  // (checkbox "¿lleva…?") pero viven dentro del mismo flujo. El wizard es genérico: `soloSi` oculta los
  // campos de un nivel apagado.
  schema: {
    pasos: [
      { id: "suelo", titulo: "Suelo",
        intro: "Arrancás por el suelo: el entramado de vigas sobre el que se para todo. Definís el tamaño del ambiente y sobre qué apoya (platea de hormigón o pilotines). Todo lo demás se acomoda a estas medidas.",
        campos: [
        { k: "sistema", tipo: "sistema" },
        { k: "largo", tipo: "medida", label: "Largo", rango: [2000, 12000] },
        { k: "ancho", tipo: "medida", label: "Ancho", rango: [2000, 12000] },
        { k: "alto",  tipo: "medida", label: "Alto de muros", rango: [2400, 3000] }
      ], avanzado: [
        { k: "apoyo", tipo: "seg", label: "Apoyo", opciones: [{ v: "platea", l: "Platea" }, { v: "pilotines", l: "Pilotines" }] },
        { k: "placa", tipo: "seg", label: "Placa de piso", opciones: [{ v: true, l: "Sí" }, { v: false, l: "No" }] },
        // Cuáles de las 4 paredes cruzan enteras en la esquina (las otras encajan entre ellas). Detalle
        // del encuentro de esquina; no cambia qué paredes hay. Por eso va en avanzadas, no en el plano.
        { k: "pasante", tipo: "seg", label: "Paredes que cruzan enteras (esquinas)",
          opciones: [{ v: "frenteFondo", l: "Frente y Fondo" }, { v: "laterales", l: "Laterales" }] }
      ] },
      { id: "muros", titulo: "Muros y vanos", componente: "murosPlanta",
        intro: "Ahora las paredes. Cada muro es una grilla de montantes parados entre dos soleras. Donde va una puerta o ventana se arma el vano: king a los lados, jack sosteniendo el dintel, y cripples para completar la modulación." },
      { id: "cielo", titulo: "Cielorraso",
        intro: "El cielorraso cuelga de la estructura de arriba con velas y vigas maestras; abajo lleva los montantes que reciben la placa. Es opcional: si este ambiente no lleva, seguí de largo.",
        campos: [
        { k: "llevaCielo", tipo: "seg", label: "¿Este ambiente lleva cielorraso?", opciones: [{ v: false, l: "No" }, { v: true, l: "Sí" }] },
        { k: "cieloSusp", tipo: "medida", label: "Cuánto cuelga de la estructura", rango: [50, 1500], soloSi: p => p.llevaCielo }
      ], avanzado: [
        { k: "cieloPerfil", tipo: "seg", label: "Perfil del cielorraso", opciones: Object.keys(CIELO).map(k => ({ v: k, l: k })), soloSi: p => p.llevaCielo }
      ] },
      { id: "techo", titulo: "Techo",
        intro: "El techo son cabriadas: triángulos armados con cordones y diagonales que apoyan sobre los muros y salvan la luz del ambiente. Encima van las correas y la chapa. Es opcional.",
        campos: [
        { k: "llevaTecho", tipo: "seg", label: "¿Este ambiente lleva techo?", opciones: [{ v: false, l: "No" }, { v: true, l: "Sí" }] },
        { k: "techoTipo", tipo: "cards", label: "¿Cómo cae el agua?", soloSi: p => p.llevaTecho, opciones: [
          { v: "dosAguas", titulo: "Dos aguas", desc: "Dos faldones con cumbrera al medio, tipo casita." },
          { v: "unAgua", titulo: "Un agua", desc: "Una sola pendiente. Típico de ampliación o quincho." }
        ] },
        { k: "techoPendiente", tipo: "seg", label: "Pendiente", soloSi: p => p.llevaTecho,
          opciones: [{ v: 15, l: "15 %" }, { v: 25, l: "25 %" }, { v: 30, l: "30 %" }, { v: 50, l: "50 %" }] }
      ], avanzado: [
        { k: "techoInvertir", tipo: "seg", label: "Las cabriadas salvan", soloSi: p => p.llevaTecho, opciones: [{ v: false, l: "La luz menor" }, { v: true, l: "La luz mayor" }] },
        { k: "techoAlero", tipo: "medida", label: "Alero", rango: [0, 600], soloSi: p => p.llevaTecho },
        { k: "techoTimpanos", tipo: "seg", label: "Cerrar los tímpanos", soloSi: p => p.llevaTecho, opciones: [{ v: true, l: "Sí" }, { v: false, l: "No" }] },
        { k: "techoCubierta", tipo: "seg", label: "Chapa de cubierta", soloSi: p => p.llevaTecho, opciones: [{ v: true, l: "Sí" }, { v: false, l: "No" }] }
      ] }
    ]
  },

  generar(input){
    const d = descomponer(input);
    const P = [];

    // --- PISO (plataforma) --- el piso pone la corrida (lado mayor) en su X; si el ambiente tiene
    // largo < ancho queda transpuesto → rotarlo 90° para alinearlo con el ambiente (X=largo, Y=ancho).
    const pisoGen = piso.generar(d.pisoInput);
    // Sólo el entramado ESTRUCTURAL define la altura: los apoyos (platea/pilotines) son superficies
    // que viven bajo z=0 y falsearían la cota sobre la que apoyan la placa y los muros.
    const hEntramado = boundsEngine(pisoGen.piezas.filter(p => !p.superficie)).size[2];
    const rotPiso = d.largo < d.ancho;
    P.push(...(rotPiso
      ? reubicar(pisoGen.piezas, { rot: 90, tx: d.largo, ty: 0, tz: 0, parte: "piso" })
      : reubicar(pisoGen.piezas, { parte: "piso" })));

    // Placa de piso (diafragma estructural, 18 mm) como SUPERFICIE sobre el entramado, si el toggle está
    // activo. Es una CAPA visual conmutable (arranca apagada); su geometría igual eleva los muros. El
    // cómputo lo lleva piso.materiales en `otros`; no entra en cortes (skip en cutList por `superficie`).
    if (d.placa) P.push({ tipo: "PLACA", perfil: "Placa de piso (diafragma) 18 mm", largo: d.largo, axis: "z", parte: "piso",
      capa: "placa-piso", superficie: true,
      box: { size: [d.largo, d.ancho, PLACA_ESP], center: [d.largo/2, d.ancho/2, hEntramado + PLACA_ESP/2] } });

    // --- MUROS --- apoyan SOBRE la placa si va (entramado + 18 mm) o directamente sobre el entramado.
    // En ambos casos el borde inferior del muro queda en CONTACTO con lo que tiene debajo. Cada muro se
    // genera con su rol (pasante/encajado → sin montantes de extremo, los pone el poste de esquina) y se
    // reubica con su `place`. Los muros NO se reutilizan de descomponer (front era sólo para medir `e`).
    const hp = hEntramado + (d.placa ? PLACA_ESP : 0);
    const e = d.e;
    const gens = {};
    d.muros.forEach(m => { const g = muro.generar(m.input); gens[m.parte] = g;
      P.push(...reubicar(g.piezas, { ...m.place, tz: hp, parte: m.parte })); });

    // --- POSTES DE ESQUINA --- 3 montantes por esquina en contacto real (doble del pasante + arranque
    // del encajado). El solver es puro; el orquestador sólo le pasa la geometría del encuentro.
    const s = resolveSystem(input);
    const zb = s.wood ? s.te : s.t, hmon = s.wood ? d.alto - 3*s.te : d.alto - 2*s.t;
    d.corners.forEach(k => P.push(...postesEsquina({
      c: k.c, p: k.p, q: k.q, e, cf: s.cf, perfil: s.perfilMont, hmon, zb: hp + zb, mat: "montante", parteP: k.pP, parteE: k.pE })));

    // --- CIELORRASO (opcional) --- grilla interior que cuelga hasta su cota. La referencia de cuelgue
    // es el tope de los muros (cara inferior del cordón de la cabriada si hay techo, o la losa): las
    // velas llegan ahí y la grilla queda `2·alma + suspensión` más abajo.
    const nivelAvisos = [], nivelNotas = [];
    if (d.cieloInput){
      const cieloGen = cielo.generar(d.cieloInput);
      const alma = cieloGen.metadatos.planoSuperior, susp = +d.cieloInput.suspension;
      const ref = hp + d.alto, elev = ref - (2 * alma + susp);
      P.push(...reubicar(cieloGen.piezas, { rot: 0, tx: e, ty: e, tz: elev, parte: "cielo" }));
    }

    // --- TECHO (opcional) --- el cordón inferior apoya sobre la solera superior de los muros (z = tope
    // de muros). Si la luz corre en Y (ancho), el techo se rota 90° igual que el piso transpuesto.
    if (d.techoInput){
      const techoGen = techo.generar(d.techoInput), tz = hp + d.alto;
      P.push(...(d.techoMap.luzEnX
        ? reubicar(techoGen.piezas, { rot: 0,  tx: 0,       ty: 0, tz, parte: "techo" })
        : reubicar(techoGen.piezas, { rot: 90, tx: d.largo, ty: 0, tz, parte: "techo" })));
      nivelAvisos.push(...(techoGen.metadatos.avisos || []).map(a => `Techo: ${a}`));
      nivelNotas.push(...(techoGen.metadatos.notas || []));
    }

    // envolvente ESTRUCTURAL: los rev (superficie) y los flejes van apoyados por FUERA del frame
    const bb = boundsEngine(P.filter(p => !p.superficie && p.categoria !== "fleje"));
    // Avisos de arriostramiento de los 4 muros, prefijados con el lado (los consume la UI y el PDF).
    const LADO = { frente: "Frente", fondo: "Fondo", izq: "Lateral izq.", der: "Lateral der." };
    const avisos = [...Object.entries(gens).flatMap(([k, g]) => (g.metadatos.avisos || []).map(a => `${LADO[k]}: ${a}`)), ...nivelAvisos];
    const partes = [{ id: "piso", l: "Piso" }, { id: "frente", l: "Frente" }, { id: "fondo", l: "Fondo" }, { id: "izq", l: "Lateral izq." }, { id: "der", l: "Lateral der." }];
    if (d.cieloInput) partes.push({ id: "cielo", l: "Cielorraso" });
    if (d.techoInput) partes.push({ id: "techo", l: "Techo" });

    return { piezas: P, metadatos: { nombre: "Ambiente completo", esquema: "planta", avisos, notas: nivelNotas,
      sistema: input.sistema, planta: { x: d.largo, y: d.ancho }, elevacion: 0,
      barLen: pisoGen.metadatos.barLen, espesorMuro: e, hMuro: hp, niveles: { cielo: !!d.cieloInput, techo: !!d.techoInput },
      exterior: { x: d.largo, y: d.ancho }, interior: d.interior, esquinas: d.corners.map(k => k.c),
      partes, vistaDefault: "iso", bbox: bb.size } };
  },

  materiales(piezas, input){
    const d = descomponer(input);
    const sub = p => piezas.filter(x => x.parte === p && !x.superficie); // la placa de piso (superficie) no computa acá
    // materiales por submódulo (tornillos T1 / otros); los perfiles se optimizan GLOBAL. Sólo estructura.
    const pisoMat = piso.materiales(sub("piso"), d.pisoInput);
    const muroMats = d.muros.map(m => muro.materiales(sub(m.parte), m.input));
    const all = [pisoMat, ...muroMats];
    if (d.cieloInput) all.push(cielo.materiales(sub("cielo"), d.cieloInput));
    if (d.techoInput) all.push(techo.materiales(sub("techo"), d.techoInput));

    // perfiles: First-Fit GLOBAL sobre el conjunto (comparte sobrantes entre muros y con el piso).
    const { byProfile } = cutList(piezas);
    const perfiles = optimizeCuts(byProfile, cutOpts(input)).map(o => ({
      perfil: o.perfil, metros: +(byProfile[o.perfil].reduce((a, b) => a + b, 0) / 1000).toFixed(2),
      piezas: o.piezas, barras: o.bars, largoBarra: o.barLen, sobrantes: o.over
    }));

    // otros (implantación del piso + carpintería de los muros): fusionar por key sumando cantidades
    const om = {};
    all.flatMap(m => m.otros || []).forEach(o => {
      (om[o.key] = om[o.key] || { ...o, cantidad: 0 }).cantidad += o.cantidad;
    });
    // El FLEJE viene en rollo: sumar los rollos ya redondeados de cada submódulo sobre-estima (4×1 rollo
    // para 47 m que entran en 2). Se recalcula GLOBAL desde todas las piezas, por MEDIDA de fleje: el
    // 30×0,5 (cruz de San Andrés de muros + faldón de techo) y el 38×0,84 (arriostre de cielo del techo).
    const otros = Object.values(om).filter(o => !["fleje-rollo", "tensor", "fleje-cielo-rollo"].includes(o.key));
    const flejes = computeFlejes(piezas, { perfil: FLEJE_PERFIL });
    if (flejes){
      otros.push({ key:"fleje-rollo", label:`${FLEJE_PERFIL} galvanizado (rollo ${FLEJE.rollo/1000} m) — ${flejes.metros} m`,
        unidad:"rollo", cantidad: flejes.rollos });
      otros.push({ key:"tensor", label:"Tensor para fleje", unidad:"u", cantidad: flejes.tensores });
    }
    const flejeCielo = computeFlejes(piezas, { perfil: FLEJE_CIELO_PERFIL });
    if (flejeCielo)
      otros.push({ key:"fleje-cielo-rollo", label:`Fleje ${FLEJE_CIELO.ancho}x${FLEJE_CIELO.esp} arriostre de cielo (rollo ${FLEJE_CIELO.rollo/1000} m) — ${flejeCielo.metros} m`,
        unidad:"rollo", cantidad: flejeCielo.rollos });
    // T1 de esquinas: 4 esquinas × (unión del doble + unión arranque↔doble), cada una cada 600 mm en altura.
    const t1Esq = d.corners.length * t1Esquina(d.alto, 600);
    const tornillos = { t1: all.reduce((a, m) => a + (m.tornillos?.t1 || 0), 0) + t1Esq };
    const peso = +all.reduce((a, m) => a + (m.peso || 0), 0).toFixed(1);
    const nMont = muroMats.reduce((a, m) => a + (m.nMont || 0), 0);
    const nVanos = d.muros.reduce((a, m) => a + (m.input.vanos?.length || 0), 0);

    return { sistema: input.sistema, area: +(d.largo * d.ancho / 1e6).toFixed(2), peso, nMont, nVanos,
      perfiles, tornillos, otros, flejes, barLen: perfiles[0]?.largoBarra || 6000 };
  }
};

// Los 4 muros del ambiente con su largo real (para el editor de vanos en planta del wizard). El espesor
// se detecta de un muro vano-less (no afecta la profundidad). Frente/Fondo = largo; Izq/Der = ancho − 2·e.
export function murosDelAmbiente(input){
  const largo = +input.largo, ancho = +input.ancho, alto = +input.alto || 2600;
  const front = muro.generar({ sistema: input.sistema, largo, alto, vanos: [], opciones: input.opciones });
  const e = Math.round(boundsEngine(front.piezas).size[1]);
  const encaj = Math.max(ancho - 2 * e, 1);
  return [
    { parte: "frente", l: "Frente", largo }, { parte: "fondo", l: "Fondo", largo },
    { parte: "izq", l: "Lateral izq.", largo: encaj }, { parte: "der", l: "Lateral der.", largo: encaj }
  ];
}

// Optimización POR ETAPA vs GLOBAL (para el PDF de F9c y el test de ahorro de barras): cuántas barras
// usa cada perfil si se corta por etapa (piso, cada muro por separado) vs todo junto.
export function cortesPorEtapaVsGlobal(input){
  const d = descomponer(input);
  const s = resolveSystem(input);
  const zb = s.wood ? s.te : s.t, hmon = s.wood ? d.alto - 3*s.te : d.alto - 2*s.t;
  const esquinasP = d.corners.flatMap(k => postesEsquina({ c: k.c, p: k.p, q: k.q, e: d.e, cf: s.cf, perfil: s.perfilMont, hmon, zb, parteP: k.pP, parteE: k.pE }));
  const etapas = [
    { parte: "piso", piezas: piso.generar(d.pisoInput).piezas },
    ...d.muros.map(m => ({ parte: m.parte, piezas: muro.generar(m.input).piezas })),
    { parte: "esquinas", piezas: esquinasP },
    ...(d.cieloInput ? [{ parte: "cielo", piezas: cielo.generar(d.cieloInput).piezas }] : []),
    ...(d.techoInput ? [{ parte: "techo", piezas: techo.generar(d.techoInput).piezas }] : [])
  ];
  const opts = cutOpts(input);
  const barsDe = piezas => optimizeCuts(cutList(piezas).byProfile, opts).reduce((a, o) => a + o.bars, 0);
  const porEtapa = etapas.reduce((a, e) => a + barsDe(e.piezas), 0);
  const global = barsDe(etapas.flatMap(e => e.piezas));
  return { porEtapa, global, ahorro: porEtapa - global };
}
