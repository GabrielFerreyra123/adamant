// ADAMANT · export DXF (AutoCAD R12+/LWPOLYLINE, unidades = mm). Para que el proyectista/calculista
// abra el despiece en su CAD, lo verifique y lo selle. NO es cálculo: es la geometría pre-armada.
// Puro (sin DOM ni Three): corre igual en el navegador y en Node (backend, pared de pago).
//
// Salida por LÁMINAS (no todo aplanado en un plano): según el módulo se arman una o más vistas
// (planta de piso · planta de techo · elevación) ubicadas lado a lado en el modelspace, cada una con
// su rótulo y sus cotas. Se deduplican entidades coincidentes y se descartan slivers < 2 mm.
import { computeProject } from "../engine/index.mjs";
import { pieceBoxEngine } from "../engine/geometry.mjs";
import { buildBraces } from "../engine/brace.mjs";

// tipo de pieza → capa CAD (nombre + color ACI). Espeja los tags del Ruby/visor.
const CAPAS = {
  SOLERAS:    { color: 3,  tipos: ["SOLERA", "SOLERA_SUP", "SOLERA_INF", "SOLERA_VANO", "PLACA_SUP", "PLACA_INF", "DURMIENTE", "SOL.PANEL", "SOL.VANO", "SOL.DINTEL"] },
  MONTANTES:  { color: 5,  tipos: ["MONTANTE", "STUD"] },
  VANOS:      { color: 1,  tipos: ["KING", "JACK", "DINTEL", "CABEZAL", "CRIPPLE", "CRIPPLE_SUP", "CRIPPLE_INF", "SILL", "TRIMMER"] },
  TECHO:      { color: 2,  tipos: ["CORDON_SUPERIOR", "CORDON_INFERIOR", "DIAGONAL", "MONTANTE_CABRIADA", "MONTANTE_TIMPANO", "CORREA", "PENDOLON", "LIMATESA", "CUMBRERA", "VIGA_COLA"] },
  ENTREPISO:  { color: 4,  tipos: ["VIGA", "VIGA_DOBLE", "CENEFA", "BLOCKING", "MAESTRA", "VELA"] },
  ARRIOSTRE:  { color: 6,  tipos: ["DIAGONAL_FLEJE", "FLEJE", "CRUZ", "RIOSTRA"] },
  ESTRUCTURA: { color: 7,  tipos: [] }
};
const TIPO_CAPA = {};
for (const [nom, c] of Object.entries(CAPAS)) c.tipos.forEach(t => (TIPO_CAPA[t] = nom));
export const capaDe = tipo => TIPO_CAPA[tipo] || "ESTRUCTURA";
const esTecho = tipo => capaDe(tipo) === "TECHO";
const MIN_LADO = 2; // mm: por debajo de esto una pieza proyectada es un sliver ilegible → se descarta

// ---- helpers de escritura DXF (pares grupo/valor) ----
const P = (out, code, val) => { out.push(code, val); };
const R = n => +(+n).toFixed(2);
function layerTable(out){
  P(out, 0, "TABLE"); P(out, 2, "LAYER"); P(out, 70, Object.keys(CAPAS).length + 2);
  const capa = (nom, color) => { P(out, 0, "LAYER"); P(out, 2, nom); P(out, 70, 0); P(out, 62, color); P(out, 6, "CONTINUOUS"); };
  for (const [nom, c] of Object.entries(CAPAS)) capa(nom, c.color);
  capa("COTAS", 8); capa("CARATULA", 7);
  P(out, 0, "ENDTAB");
}
function line(out, capa, x1, y1, x2, y2){
  P(out, 0, "LINE"); P(out, 8, capa); P(out, 10, R(x1)); P(out, 20, R(y1)); P(out, 11, R(x2)); P(out, 21, R(y2));
}
function text(out, capa, x, y, h, s, rot = 0){
  P(out, 0, "TEXT"); P(out, 8, capa); P(out, 10, R(x)); P(out, 20, R(y)); P(out, 40, h); P(out, 1, String(s));
  if (rot) P(out, 50, rot);
}
// Cota dibujada (portable a cualquier CAD): línea de cota + marcas en extremos + texto. No asociativa
// (para que abra igual en LibreCAD/BricsCAD/visores); si el calculista quiere cotas editables, se cambia luego.
function dimH(out, xa, xb, y, txt, th = 100){
  const t = th * 0.9;
  line(out, "COTAS", xa, y, xb, y);
  line(out, "COTAS", xa, y - t, xa, y + t); line(out, "COTAS", xb, y - t, xb, y + t);
  text(out, "COTAS", (xa + xb) / 2 - String(txt).length * th * 0.3, y + t * 0.5, th, txt);
}
function dimV(out, ya, yb, x, txt, th = 100){
  const t = th * 0.9;
  line(out, "COTAS", x, ya, x, yb);
  line(out, "COTAS", x - t, ya, x + t, ya); line(out, "COTAS", x - t, yb, x + t, yb);
  text(out, "COTAS", x - t * 1.6, (ya + yb) / 2 - String(txt).length * th * 0.3, th, txt, 90);
}
const metros = mm => (mm / 1000).toFixed(2).replace(".", ",") + " m";

// ---- proyección de piezas a POLÍGONOS deduplicados ----
// plane: "xy" (planta, horiz=X vert=Y) o "xz" (elevación, horiz=X vert=Z). Cada pieza → 4 puntos:
// las piezas con `orient` (cabriadas, correas, flejes) se dibujan como barra siguiendo su dirección
// real (rectángulo rotado), no como su caja: así el techo lee como triángulo y las diagonales se ven.
const proj2 = (pt, plane) => plane === "xz" ? [pt[0], pt[2]] : [pt[0], pt[1]];
function boxPoly(p, plane){
  const { size, center } = pieceBoxEngine(p);
  const w = size[0], h = plane === "xz" ? size[2] : size[1];
  const cx = center[0], cy = plane === "xz" ? center[2] : center[1];
  if (![w, h, cx, cy].every(Number.isFinite) || Math.min(w, h) < MIN_LADO) return null;
  const x = cx - w / 2, y = cy - h / 2;
  return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
}
function piecePoly(p, plane){
  if (p.orient){
    const o = p.orient, L = p.largo, hw = (o.w || MIN_LADO) / 2;
    const e0 = o.c.map((v, i) => v - o.u[i] * L / 2), e1 = o.c.map((v, i) => v + o.u[i] * L / 2);
    const a = proj2(e0, plane), b = proj2(e1, plane);
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
    if (len < MIN_LADO) return boxPoly(p, plane);       // barra perpendicular a la vista (correa vista de punta) → sección
    const px = -dy / len * hw, py = dx / len * hw;
    return [[a[0] + px, a[1] + py], [b[0] + px, b[1] + py], [b[0] - px, b[1] - py], [a[0] - px, a[1] - py]];
  }
  return boxPoly(p, plane);
}
function polys(piezas, plane, filtro){
  const vistos = new Set(), out = [];
  for (const p of (piezas || [])){
    if (p.superficie) continue;
    if (filtro && !filtro(p)) continue;
    const pts = piecePoly(p, plane);
    if (!pts || !pts.every(q => q.every(Number.isFinite))) continue;
    const key = capaDe(p.tipo) + "|" + pts.map(q => R(q[0]) + "," + R(q[1])).join(";");
    if (vistos.has(key)) continue;                      // coincidente exacta (built-up, soleras sup/inf en planta, cabriadas apiladas)
    vistos.add(key);
    out.push({ capa: capaDe(p.tipo), pts });
  }
  return out;
}
const bbox = rs => rs.reduce((b, r) => {
  r.pts.forEach(([x, y]) => { b.x0 = Math.min(b.x0, x); b.y0 = Math.min(b.y0, y); b.x1 = Math.max(b.x1, x); b.y1 = Math.max(b.y1, y); });
  return b;
}, { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });

// Dibuja una vista (lista de polígonos en coords del modelo) trasladada a (tx,ty), con cotas grales
// y rótulo. `extras(o, tx, ty)` agrega líneas propias (cruces de arriostre en elevación). → bbox global.
function drawView(out, rs, tx, ty, label, extras){
  for (const r of rs){
    P(out, 0, "LWPOLYLINE"); P(out, 8, r.capa); P(out, 90, r.pts.length); P(out, 70, 1);
    for (const [x, y] of r.pts){ P(out, 10, R(x + tx)); P(out, 20, R(y + ty)); }
  }
  if (extras) extras(out, tx, ty);
  const b = bbox(rs);
  if (!Number.isFinite(b.x0)) return null;
  const X0 = b.x0 + tx, X1 = b.x1 + tx, Y0 = b.y0 + ty, Y1 = b.y1 + ty;
  const th = Math.max(60, (X1 - X0) / 45), off = th * 3;
  dimH(out, X0, X1, Y0 - off, metros(b.x1 - b.x0), th);
  dimV(out, Y0, Y1, X0 - off, metros(b.y1 - b.y0), th);
  text(out, "CARATULA", X0, Y0 - off - th * 2.4, th * 1.15, label);
  return { X0: X0 - off * 1.4, X1, Y0: Y0 - off - th * 3, Y1 };
}

// Genera el string DXF de un proyecto. Arma las vistas según el módulo.
export function exportDXF(input){
  const { piezas, metadatos } = computeProject(input);
  const frontal = metadatos.esquema === "frontal" || metadatos.esquema === "cabriada";
  const plane = frontal ? "xz" : "xy";
  const hayTecho = (piezas || []).some(p => esTecho(p.tipo));
  const hayNoTecho = (piezas || []).some(p => !esTecho(p.tipo) && !p.superficie);

  const out = [];
  P(out, 0, "SECTION"); P(out, 2, "HEADER"); P(out, 9, "$INSUNITS"); P(out, 70, 4); P(out, 0, "ENDSEC"); // 4 = mm
  P(out, 0, "SECTION"); P(out, 2, "TABLES"); layerTable(out); P(out, 0, "ENDSEC");
  P(out, 0, "SECTION"); P(out, 2, "ENTITIES");

  // Definición de vistas.
  const vistas = [];
  if (plane === "xz"){
    // Elevación única. Cruces de San Andrés: en elevación SÍ leen como X (en planta son slivers).
    const zonas = (buildBraces(input).zonas) || [];
    const cabriada = metadatos.esquema === "cabriada";
    // Cumbrera (línea de cumbre) + rótulo de pendiente sobre la elevación de la cabriada.
    const roof = cabriada ? (o, tx, ty) => {
      const zc = metadatos.alturaCumbrera || 0, rx = (metadatos.tipo === "dosAguas" ? metadatos.luz / 2 : metadatos.luz);
      const tick = Math.max(150, (metadatos.luz || 4000) / 20);
      line(o, "TECHO", rx + tx, zc + ty, rx + tx, zc + tick + ty);      // marca de cumbrera
      text(o, "COTAS", rx + tx - tick * 2, zc + tick * 1.2 + ty, tick * 0.7, "CUMBRERA");
      const px = (metadatos.tipo === "dosAguas" ? metadatos.luz / 4 : metadatos.luz / 2);
      text(o, "COTAS", px + tx, (zc / 2) + ty, tick * 0.7, `Pendiente ${metadatos.pendiente}% (${metadatos.angulo}°)`);
    } : null;
    const extras = (zonas.length || roof) ? (o, tx, ty) => {
      zonas.forEach(z => {
        line(o, "ARRIOSTRE", z.x0 + tx, ty, z.x0 + z.ancho + tx, z.alto + ty);
        line(o, "ARRIOSTRE", z.x0 + tx, z.alto + ty, z.x0 + z.ancho + tx, ty);
      });
      if (roof) roof(o, tx, ty);
    } : null;
    let label = `${metadatos.nombre || "Proyecto"} — elevación`;
    if (cabriada){
      // contar cabriadas antes de deduplicar (todas coinciden en la elevación → se dibuja 1).
      const ys = new Set((piezas || []).filter(p => esTecho(p.tipo)).map(p => R(pieceBoxEngine(p).center[1] / 10)));
      if (ys.size > 1) label = `Cabriada tipo (repetir ×${ys.size}) — elevación`;
    }
    vistas.push({ rs: polys(piezas, "xz"), label, extras, vanos: input });
  } else if (hayTecho && hayNoTecho){
    // Planta de piso + planta de techo, separadas (no aplanar el techo sobre el piso).
    vistas.push({ rs: polys(piezas, "xy", p => !esTecho(p.tipo)), label: `${metadatos.nombre || "Proyecto"} — planta` });
    vistas.push({ rs: polys(piezas, "xy", p => esTecho(p.tipo)), label: "Planta de techo" });
  } else {
    vistas.push({ rs: polys(piezas, "xy"), label: `${metadatos.nombre || "Proyecto"} — planta` });
  }

  // Ubicación lado a lado (cursor en X) + cotas por abertura en la elevación.
  let cursor = 0, gap = 0, gMinX = Infinity, gMaxY = -Infinity, gMinY = Infinity;
  for (const v of vistas){
    if (!v.rs.length) continue;
    const b = bbox(v.rs), tx = cursor - b.x0, ty = -b.y0;
    const marco = drawView(out, v.rs, tx, ty, v.label, v.extras);
    // Cotas de anchos de vano (elevación): usa los vanos del input, que están en coords X locales.
    if (v.vanos && Array.isArray(v.vanos.vanos)){
      const th = Math.max(60, (b.x1 - b.x0) / 45);
      v.vanos.vanos.forEach(vn => dimH(out, +vn.x1 + tx, +vn.x2 + tx, ty - th * 1.2, metros(+vn.x2 - +vn.x1), th * 0.8));
    }
    if (marco){ gMinX = Math.min(gMinX, marco.X0); gMaxY = Math.max(gMaxY, marco.Y1); gMinY = Math.min(gMinY, marco.Y0); }
    gap = Math.max(400, (b.x1 - b.x0) * 0.15);
    cursor += (b.x1 - b.x0) + gap;
  }

  // Carátula arriba de todo.
  if (Number.isFinite(gMinX)){
    const th = Math.max(80, (cursor) / 90);
    const car = [
      `ADAMANT · ${metadatos.nombre || "Proyecto"}`,
      `Sistema: ${metadatos.sistema || input.sistema || "-"}   Unidades: mm`,
      `DESPIECE ESTIMATIVO — el calculo estructural, arriostres y anclajes los define un profesional habilitado.`
    ];
    car.forEach((s, i) => text(out, "CARATULA", gMinX, gMaxY + th * (car.length - i) * 1.7 + th, th, s));
  }

  P(out, 0, "ENDSEC"); P(out, 0, "EOF");
  const nombre = `adamant-${input.kind || "proyecto"}-${metadatos.sistema || input.sistema || ""}.dxf`.replace(/-+\./, ".");
  return { dxf: out.join("\n") + "\n", nombre };
}
