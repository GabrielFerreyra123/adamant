// ADAMANT · pre-dimensionado ORIENTATIVO (semáforo). NO es cálculo estructural: compara las luces,
// separaciones y escuadrías del proyecto contra RANGOS TÍPICOS publicados (ConsulSteel / IRAM-IAS
// U 500-205 · Barbieri · manuales de entramado ligero de madera) y devuelve 🟢/🟡/🔴 con el motivo
// en criollo. La idea es guiar: 🟡/🔴 = "esto amerita que lo verifique un profesional habilitado".
//
// Cada chequeo trae (además del valor/rango técnicos) un `titulo` en llano y, cuando la app puede
// resolverlo, un `fix` = { tipo, valor, label } que la UI aplica con un botón.
//
// ⚠ Los umbrales son valores SEMILLA de literatura para vivienda; calibrar contra la tabla real del
// manual. El cálculo (viento/nieve por CIRSOC, cargas, deformaciones) lo hace el calculista.
import { PGC, LUMBER } from "./systems.mjs";
import { secDims } from "./geometry.mjs";
import { sugerirPerfil } from "./modules/piso.mjs";

// ---- rangos de referencia (orientativos, vivienda) ----
const SEP_MONT = { ok: 400, warn: 600 };                 // modulación de montantes/studs (mm)
const LUZ_CABRIADA = { ok: 6000, warn: 9000 };           // luz que salva una cabriada de steel (mm)
const DINTEL_VANO = { ok: 1200, warn: 3000 };            // ancho de vano con dintel built-up (mm)
// altura de muro PORTANTE sin verificación especial (mm), por alma de PGC / por escuadría de madera:
const ALT_STEEL = { 90: 2600, 100: 2800, 140: 3400, 150: 3600, 200: 4200, 250: 4800 };
const ALT_WOOD  = { 89: 3000, 140: 3600, 184: 4300, 235: 4900, 286: 5500 };

const nivel = (v, ok, warn) => v <= ok ? "ok" : v <= warn ? "atencion" : "fuera";
const almaDe = name => secDims(name || "").h || 0;       // alma (steel) / ancho (madera/placa), mm
const seccionDe = (input, tabique) => tabique ? input.opciones?.montPlaca
  : input.sistema === "wood" ? input.opciones?.lumber : input.opciones?.pgc;
const m = mm => (mm / 1000).toFixed(2).replace(".", ",") + " m";

// check(...) — titulo: llano (tarjeta) · label: técnico (detalle) · fix: acción opcional que la UI aplica.
const check = (o) => ({ estado: "ok", fix: null, ...o });

// --- chequeos ---
function chkSeparacion(sep){
  const s = +sep || 400;
  const estado = nivel(s, SEP_MONT.ok, SEP_MONT.warn);
  return check({ id: "sep", titulo: "Separación entre montantes", label: "Separación de montantes",
    valor: `${s} mm`, rango: `estándar ${SEP_MONT.ok} · máx ${SEP_MONT.warn} mm`, estado,
    detalle: s <= SEP_MONT.ok ? "Los montantes están a la distancia de manual (40 cm). Todo bien."
      : s <= SEP_MONT.warn ? "Están un poco más separados de lo habitual. Suele andar, pero conviene revisarlo."
      : "Están demasiado separados: la pared puede pandear entre montantes. Volvelos a 40 cm o consultá.",
    fix: estado === "ok" ? null : { tipo: "modulo", valor: 400, label: "Volver a 40 cm" } });
}
function chkAltura(input, tipoMuro){
  const alto = +input.alto || 2600, tabique = tipoMuro === "tabique";
  const sec = seccionDe(input, tabique) || "—", alma = almaDe(sec);
  let lim = tabique ? (alma >= 70 ? 3000 : 2600) : (ALT_STEEL[alma] || ALT_WOOD[alma] || 2800);
  if (!tabique && (+input.opciones?.modulo || 400) > 400) lim = Math.round(lim * 0.85); // más separación, menos altura
  const estado = alto <= lim ? "ok" : alto <= lim * 1.15 ? "atencion" : "fuera";
  return check({ id: "altura", titulo: "Altura del muro", label: "Altura de muro",
    valor: m(alto), rango: `${tabique ? "tabique" : "portante"} típico ≤ ${m(lim)} (${sec})`, estado,
    detalle: estado === "ok" ? `La altura entra bien para ${tabique ? "un tabique" : "un muro que carga"} con esa perfilería.`
      : estado === "atencion" ? "El muro es alto para esa perfilería. Puede necesitar un montante más grande o refuerzo."
      : "El muro es demasiado alto para esa perfilería. Subí la escuadría o pedí un cálculo." });
}
function chkArriostre(tieneCruz, zona){
  if (tieneCruz) return check({ id: "viento", titulo: "Resistencia al viento", label: "Arriostramiento (viento)",
    valor: "Cruz de San Andrés / placa", rango: "presente", estado: "ok",
    detalle: "La pared tiene arriostramiento: aguanta el empuje del viento." });
  const estado = zona === "alta" ? "fuera" : "atencion";
  return check({ id: "viento", titulo: "Resistencia al viento", label: "Arriostramiento (viento)",
    valor: "sin arriostrar", rango: "requerido en zona de viento", estado,
    detalle: zona === "alta"
      ? "En zona de viento fuerte, una pared sin arriostrar se puede desaplomar. Agregale una Cruz de San Andrés (o placa de corte)."
      : "Conviene arriostrar la pared (Cruz de San Andrés o placa) para el empuje del viento.",
    fix: { tipo: "arriostrar", label: "Agregar Cruz de San Andrés" } });
}
function chkAnclaje(zona){
  if (zona !== "alta") return null;
  return check({ id: "anclaje", titulo: "Anclaje contra el viento", label: "Anclaje a la fundación",
    valor: "verificar", rango: "crítico en viento alto", estado: "atencion",
    detalle: "En viento fuerte, lo primero que falla es el anclaje: asegurate de fijar la estructura a la platea (bulones) y poner hold-downs en las esquinas. Esto lo define el calculista." });
}
function chkDintel(vanos){
  const anchos = (vanos || []).map(v => +v.x2 - +v.x1).filter(a => a > 0);
  if (!anchos.length) return null;
  const mx = Math.max(...anchos);
  return check({ id: "dintel", titulo: "Aberturas anchas", label: "Dintel sobre aberturas",
    valor: `vano máx ${mx} mm`, rango: `built-up ≤ ${DINTEL_VANO.ok} · límite ${DINTEL_VANO.warn} mm`,
    estado: nivel(mx, DINTEL_VANO.ok, DINTEL_VANO.warn),
    detalle: mx <= DINTEL_VANO.ok ? "El refuerzo arriba de las aberturas (dintel) alcanza para ese ancho."
      : mx <= DINTEL_VANO.warn ? "La abertura es ancha: verificá el refuerzo de arriba, puede pedir una sección mayor."
      : "La abertura es muy ancha para un dintel común: probablemente necesite una viga calculada (tipo LVL)." });
}
function chkCabriada(luz){
  return check({ id: "cabriada", titulo: "Ancho que cruza el techo", label: "Luz de cabriada",
    valor: m(luz), rango: `común ≤ ${m(LUZ_CABRIADA.ok)} · límite ${m(LUZ_CABRIADA.warn)}`,
    estado: nivel(luz, LUZ_CABRIADA.ok, LUZ_CABRIADA.warn),
    detalle: luz <= LUZ_CABRIADA.ok ? "Es un ancho habitual para una cabriada de steel de vivienda."
      : luz <= LUZ_CABRIADA.warn ? "El techo cruza un ancho grande: la cabriada necesita verificación."
      : "El ancho es muy grande: es una cabriada de cálculo específico, no un armado estándar." });
}
function chkPendiente(pend){
  const p = +pend;
  const estado = p >= 25 && p <= 100 ? "ok" : (p >= 7 && p < 25) || (p > 100 && p <= 130) ? "atencion" : "fuera";
  return check({ id: "pendiente", titulo: "Inclinación del techo", label: "Pendiente de techo",
    valor: `${p} %`, rango: "recomendado 25 – 100 %", estado,
    detalle: estado === "ok" ? "La inclinación está en el rango que recomienda el manual para chapa."
      : p < 25 ? "El techo está muy plano: el agua escurre lento y la chapa puede filtrar."
      : "El techo está muy empinado: se complica anclar la cubierta.",
    fix: estado === "ok" ? null : p < 25 ? { tipo: "pendiente", valor: 25, label: "Subir a 25 %" } : { tipo: "pendiente", valor: 100, label: "Bajar a 100 %" } });
}
function chkEntrepiso(input){
  const luz = Math.min(+input.largo || 0, +input.ancho || 0);
  if (!(luz > 0)) return null;
  const rec = sugerirPerfil(luz, input.sistema), sec = seccionDe(input, false) || rec;
  const aC = almaDe(sec), aR = almaDe(rec);
  const estado = aC >= aR ? "ok" : aC >= aR * 0.85 ? "atencion" : "fuera";
  return check({ id: "entrepiso", titulo: "Piso alto (entrepiso)", label: "Luz de vigas de entrepiso",
    valor: `${m(luz)} · ${sec}`, rango: `sugerido ${rec}`, estado,
    detalle: estado === "ok" ? "La viga elegida cubre esa luz según la tabla orientativa."
      : "Para esa luz la tabla pide una viga más grande, si no el piso flexa. Verificá con el calculista.",
    fix: estado === "ok" ? null : { tipo: "seccion", valor: rec, label: `Usar ${rec}` } });
}

// Pre-dimensionado del proyecto. → { zona, checks:[...], resumen:{ok,atencion,fuera,peor} }
export function predimensionar(input, opts = {}){
  const zona = opts.zona || "media";                       // default neutro; el usuario ajusta su zona
  const kind = input.kind, checks = [];
  const add = c => c && checks.push(c);

  if (kind === "muro"){
    add(chkSeparacion(input.opciones?.modulo));
    add(chkAltura(input, input.tipoMuro));
    if (input.tipoMuro === "exterior"){                     // sólo el muro que ve el viento
      add(chkArriostre(input.arriostramiento === "cruz" || input.arriostramiento === "placa", zona));
      add(chkAnclaje(zona));
    }
    add(chkDintel(input.vanos));
  } else if (kind === "combinado"){
    add(chkSeparacion(input.opciones?.modulo));
    add(chkAltura(input, "exterior"));
    const lados = ["Frente", "Fondo", "Izq", "Der"];
    const algo = lados.some(l => { const a = input["arriostra" + l]; return a === "cruz" || a === "placa"; });
    add(chkArriostre(algo, zona));
    add(chkAnclaje(zona));
    add(chkDintel(lados.flatMap(l => input["vano" + l] || [])));
    if (input.llevaTecho) add(chkCabriada(Math.min(+input.largo || 0, +input.ancho || 0)));
  } else if (kind === "techo"){
    add(chkCabriada(+input.luz || 0));
    add(chkPendiente(input.pendiente));
  } else if (kind === "piso"){
    add(chkEntrepiso(input));
  }

  const cnt = { ok: 0, atencion: 0, fuera: 0 };
  checks.forEach(c => cnt[c.estado]++);
  const peor = cnt.fuera ? "fuera" : cnt.atencion ? "atencion" : "ok";
  return { zona, checks, resumen: { ...cnt, peor } };
}
