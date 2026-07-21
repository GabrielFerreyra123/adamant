// ADAMANT · arriostramiento del muro — Cruz de San Andrés (fleje galvanizado).
// Fuente constructiva: manuales Barbieri / ConsulSteel. El fleje se atornilla SÓLO en los extremos
// (nunca en montantes intermedios), lleva 1 tensor y va sobre la CARA EXTERIOR del paño.
//
// Coordenadas del motor (iguales a frame.mjs): X = largo del muro · Y = espesor (0 = cara exterior)
// · Z = altura (piso z=0). El fleje es la primera pieza DIAGONAL del motor: en vez de `axis` trae
// `orient` = { c(centro), u(eje del largo), v(eje del ancho), n(eje del espesor), w, t }, y todo lo
// que consume geometría (pieceBoxEngine, visor, export) resuelve la caja desde esa base.
import { resolveSystem, FLEJE, FLEJE_PERFIL } from "./systems.mjs";

const rad = g => g * Math.PI / 180;
export const anguloGrados = (ancho, alto) => Math.atan2(alto, ancho) * 180 / Math.PI;

// Tramos llenos del muro: [0, largo] menos la franja de cada vano. El límite es el KING (que ocupa
// desde x1 y hasta x2), no el vano estructural: por eso se descuenta [v.x1, v.x2] completo.
export function tramosLlenos(largo, vanos){
  const bloq = (vanos || []).map(v => [+v.x1, +v.x2]).sort((a, b) => a[0] - b[0]);
  const out = [];
  let x = 0;
  bloq.forEach(([a, b]) => { if (a > x) out.push([x, a]); x = Math.max(x, b); });
  if (largo > x) out.push([x, largo]);
  return out.filter(([a, b]) => b - a > 0);
}

// N mínimo de sub-tramos para que el ángulo del fleje entre en el rango (zona muy ancha → ángulo chico).
// ángulo(sub) = atan(alto / (ancho/N)) ≥ angMin  ⟺  N ≥ ancho·tan(angMin)/alto
export function subdivisiones(ancho, alto, angMin = FLEJE.angMin){
  if (!(alto > 0)) return 1;
  return Math.max(1, Math.ceil(ancho * Math.tan(rad(angMin)) / alto - 1e-9));
}

// Los dos flejes de una cruz sobre la zona [x0, x0+ancho] × [0, alto].
// Van APOYADOS sobre la cara exterior del frame (no lo penetran): el primero a medio espesor de la
// cara y el segundo montado sobre el primero (un espesor más afuera), para que la X no se auto-interseque.
// `yCara`/`sentido` definen cuál de las dos caras del muro es la exterior (ver buildBraces).
function cruz(x0, ancho, alto, yCara, haciaAfuera){
  const { ancho: w, esp: t } = FLEJE;
  const L = Math.hypot(ancho, alto);
  const cx = x0 + ancho / 2, cz = alto / 2;
  return [1, -1].map((sentido, i) => {
    const u = [ancho / L, 0, (sentido * alto) / L];          // eje del largo (en el plano del muro)
    const v = [-u[2], 0, u[0]];                              // ancho del fleje, perpendicular en el plano
    const cy = yCara + haciaAfuera * (t / 2 + i * t);        // fuera de la cara; el 2º, un espesor más
    return {
      tipo: "FLEJE", categoria: "fleje", perfil: FLEJE_PERFIL, mat: "fleje",
      largo: Math.round(L),
      orient: { c: [cx, cy, cz], u, v, n: [0, 1, 0], w, t }
    };
  });
}

// Arriostramiento del muro. → { piezas, avisos, zonas }
// `zonas` (para el PDF/esquema): [{ x0, ancho, alto, angulo }] de cada cruz colocada.
export function buildBraces(input){
  const piezas = [], avisos = [], zonas = [];
  if ((input.arriostramiento || "ninguno") !== "cruz") return { piezas, avisos, zonas };

  const largo = +input.largo, alto = +input.alto;
  if (!(largo > 0) || !(alto > 0)) return { piezas, avisos, zonas };
  const vanos = (input.vanos || []).map(v => ({ x1: +v.x1, x2: +v.x2 }));
  // Cara exterior del muro. Por defecto es Y=0 (el fleje sale hacia Y negativo). El orquestador del
  // ambiente pide `caraExterior:"ymax"` en los muros cuyo lado exterior es el opuesto (fondo/der),
  // para que el fleje no quede dentro del ambiente.
  const eMuro = resolveSystem(input).a;
  const ymax = input.caraExterior === "ymax";
  const yCara = ymax ? eMuro : 0, haciaAfuera = ymax ? 1 : -1;

  // Zona arriostrable: el muro completo si no hay vanos; si los hay, el tramo lleno más ancho.
  const tramos = tramosLlenos(largo, vanos);
  const zona = tramos.reduce((mej, t) => (!mej || (t[1] - t[0]) > (mej[1] - mej[0]) ? t : mej), null);
  const ancho = zona ? zona[1] - zona[0] : 0;
  if (!zona || ancho < FLEJE.tramoMin){
    avisos.push("Sin tramo lleno suficiente para arriostrar. Consultar solución con un profesional.");
    return { piezas, avisos, zonas };
  }

  const ang = anguloGrados(ancho, alto);
  // Zona muy ancha (ángulo bajo): se subdivide en N sub-tramos iguales, una cruz por sub-tramo.
  const n = ang < FLEJE.angMin ? subdivisiones(ancho, alto) : 1;
  const wSub = ancho / n;
  const angSub = anguloGrados(wSub, alto);
  // Zona muy angosta: se coloca igual, con advertencia (no hay subdivisión que baje el ángulo).
  if (angSub > FLEJE.angMax){
    avisos.push(`Tramo angosto: ángulo de fleje ${angSub.toFixed(1)}° fuera del rango recomendado ` +
      `${FLEJE.angMin}–${FLEJE.angMax}°. Consultar arriostramiento con un profesional.`);
  }
  for (let i = 0; i < n; i++){
    const x0 = zona[0] + i * wSub;
    piezas.push(...cruz(x0, wSub, alto, yCara, haciaAfuera));
    zonas.push({ x0, ancho: wSub, alto, angulo: +angSub.toFixed(1) });
  }
  return { piezas, avisos, zonas };
}

// Cómputo del fleje a partir de las PIEZAS (regla del motor: todo sale de la geometría).
// El fleje viene en ROLLO, no en barra: metros lineales + rollos (redondeo hacia arriba).
export function computeFlejes(piezas){
  const fl = (piezas || []).filter(p => p.categoria === "fleje");
  if (!fl.length) return null;
  const mm = fl.reduce((a, p) => a + p.largo, 0);
  return {
    unidades: fl.length,
    metros: +(mm / 1000).toFixed(2),
    rollos: Math.ceil(mm / FLEJE.rollo),
    largoRollo: FLEJE.rollo,
    tensores: fl.length,                        // 1 tensor por fleje
    t1: fl.length * 2 * FLEJE.tornExtremo       // 4 tornillos T1 por extremo
  };
}
