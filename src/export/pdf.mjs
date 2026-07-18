// ADAMANT · PDF completo (F5), client-side con jsPDF. A4, legible en el celular.
// Resumen + imagen del 3D + esquema frontal acotado + lista de compra + lista de cortes.
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { computeProject, cutPlan, cutOpts, getModule } from "../engine/index.mjs";
import { cortesPorEtapaVsGlobal } from "../engine/modules/combinado.mjs";

const TEAL = [27,182,164], OBS = [10,26,34], TANG = [232,93,42], MUT = [110,128,136];
const unidadBarra = len => `${len >= 6000 ? "barra" : "tira"} ${(len/1000).toFixed(2).replace(".", ",")} m`;
const money = n => "$ " + Math.round(n || 0).toLocaleString("es-AR");

// Precios inyectados por el consumidor (cliente: localStorage vía opts; servidor: mapa del request).
// Este módulo NO toca DOM ni localStorage: corre igual en navegador y en Node (backend).
let getPrice = () => 0;

// rect defensivo: valida que los 4 argumentos sean finitos; si no, loguea la sección y no dibuja
// (en vez de romper toda la exportación con "Invalid arguments passed to jsPDF.rect").
function safeRect(doc, x, y, w, h, style, donde){
  if (![x, y, w, h].every(Number.isFinite)){ console.warn(`[pdf] rect inválido en ${donde}:`, { x, y, w, h }); return false; }
  doc.rect(x, y, w, h, style); return true;
}

// Esquema frontal acotado. Usa los campos del vano del MOTOR: { tipo, x1, x2, h, sill }.
function drawSchema(doc, input, x0, y0, maxW, maxH){
  const L = +input.largo, A = +input.alto;
  if (!Number.isFinite(L) || !Number.isFinite(A) || L <= 0 || A <= 0){ console.warn("[pdf] esquema: medidas inválidas", { L, A }); return y0 + maxH; }
  const sc = Math.min(maxW / L, maxH / A);
  const w = L * sc, h = A * sc, x = x0, y = y0 + (maxH - h); // apoyar abajo
  doc.setDrawColor(...OBS); doc.setFillColor(245,247,248); safeRect(doc, x, y, w, h, "FD", "muro");
  const VCOL = { puerta: TANG, ventana: [232,181,58], arcada: [39,176,201] }, VINI = { puerta:"P", ventana:"V", arcada:"A" };
  (input.vanos || []).forEach((v, i) => {
    const x1 = +v.x1, x2 = +v.x2, hv = +v.h, sill = +v.sill || 0;
    const vx = x + x1 * sc, vw = (x2 - x1) * sc;
    const vy = y + (A - hv) * sc, vh = (hv - sill) * sc;
    doc.setFillColor(...(VCOL[v.tipo] || VCOL.ventana)); doc.setDrawColor(...OBS);
    safeRect(doc, vx, vy, vw, vh, "FD", `vano ${i+1}`);
  });
  // cotas: largo (abajo) y alto (izquierda)
  doc.setDrawColor(...TEAL); doc.setTextColor(...MUT); doc.setFontSize(7);
  doc.line(x, y + h + 3, x + w, y + h + 3);
  doc.text(`${(L/1000).toFixed(2)} m`, x + w/2, y + h + 6, { align: "center" });
  doc.line(x - 3, y, x - 3, y + h);
  doc.text(`${(A/1000).toFixed(2)} m`, x - 4, y + h/2, { align: "center", angle: 90 });
  (input.vanos || []).forEach((v, i) => {
    const cx = x + ((+v.x1 + +v.x2) / 2) * sc, ancho = +v.x2 - +v.x1, alto = +v.h - (+v.sill || 0);
    doc.setTextColor(...OBS); doc.setFontSize(6.5);
    // posición (centro), ancho×alto y antepecho en ventanas
    doc.text(`${VINI[v.tipo]}${i+1} ${ancho}×${alto}${v.tipo === "ventana" ? ` ap${v.sill}` : ""}`, cx, y - 4.5, { align: "center" });
    doc.text(`x${Math.round((+v.x1 + +v.x2) / 2)}`, cx, y - 1.5, { align: "center" });
    doc.setFontSize(7);
  });
  return y + h + 10;
}

// Esquema EN PLANTA acotado (piso): vigas, cenefa perimetral, blocking y cotas. Usa las posiciones de las piezas.
// Esquema en planta genérico (piso y cielo). Dimensiones del recuadro desde metadatos.planta {x,y};
// líneas interiores según el eje de cada pieza portante (viga de piso corre en Y; portante de cielo
// corre en X). El marco perimetral y las cotas son comunes.
function drawPlanta(doc, metadatos, piezas, x0, y0, maxW, maxH){
  const pl = metadatos.planta || {}, L = +pl.x, W = +pl.y; // L = dimensión en X, W = dimensión en Y
  if (!Number.isFinite(L) || !Number.isFinite(W) || L <= 0 || W <= 0){ console.warn("[pdf] planta: medidas inválidas", { L, W }); return; }
  const sc = Math.min(maxW / L, maxH / W), pw = L * sc, ph = W * sc, x = x0, y = y0;
  doc.setDrawColor(...OBS); doc.setFillColor(245, 247, 248); safeRect(doc, x, y, pw, ph, "FD", "planta");
  // líneas portantes interiores: axis 'y' → vertical en x=pos.x (vigas del piso); axis 'x' → horizontal
  // en y=pos.y (montantes del cielo).
  const interior = piezas.filter(p => p.tipo === "VIGA" || p.tipo === "MONTANTE");
  doc.setLineWidth(0.25);
  interior.forEach(p => {
    doc.setDrawColor(...(p.tipo === "MONTANTE" ? [27, 182, 164] : [123, 191, 90]));
    if (p.axis === "y"){ const px = x + p.pos[0] * sc; doc.line(px, y, px, y + ph); }
    else { const py = y + p.pos[1] * sc; doc.line(x, py, x + pw, py); }
  });
  // blocking (fila/s perpendiculares, sólo piso)
  doc.setDrawColor(216, 106, 158);
  [...new Set(piezas.filter(p => p.tipo === "BLOCKING").map(p => p.pos[1]))].forEach(fy => { const py = y + fy * sc; doc.line(x, py, x + pw, py); });
  // vigas maestras del cielo (nivel superior): línea distinta, más gruesa, vertical (corren en Y)
  const maestras = piezas.filter(p => p.tipo === "MAESTRA");
  doc.setDrawColor(61, 153, 112); doc.setLineWidth(0.7);
  maestras.forEach(p => { const px = x + (p.pos[0] + 15) * sc; doc.line(px, y, px, y + ph); });
  // velas del cielo: puntos sobre las maestras (cuelgan de la losa)
  const velas = piezas.filter(p => p.tipo === "VELA");
  if (velas.length){
    doc.setFillColor(242, 128, 61);
    velas.forEach(p => doc.circle(x + (p.pos[0] + 15) * sc, y + (p.pos[1] + 15) * sc, 0.7, "F"));
  }
  // marco perimetral (borde grueso)
  doc.setDrawColor(155, 109, 214); doc.setLineWidth(0.7); doc.rect(x, y, pw, ph); doc.setLineWidth(0.2);
  // cotas: X (abajo), Y (izquierda) y separación de montantes/vigas
  doc.setDrawColor(...TEAL); doc.setTextColor(...MUT); doc.setFontSize(7);
  doc.line(x, y + ph + 3, x + pw, y + ph + 3); doc.text(`${(L/1000).toFixed(2)} m`, x + pw/2, y + ph + 6, { align: "center" });
  doc.line(x - 3, y, x - 3, y + ph); doc.text(`${(W/1000).toFixed(2)} m`, x - 4, y + ph/2, { align: "center", angle: 90 });
  const runY = interior.some(p => p.axis === "y");
  const cs = [...new Set(interior.map(p => runY ? p.pos[0] : p.pos[1]))].sort((a, b) => a - b);
  if (cs.length > 1){
    doc.setTextColor(...OBS); const sep = `${Math.round(cs[1] - cs[0])} mm`; // separación de montantes/vigas
    if (runY) doc.text(sep, x + ((cs[0] + cs[1]) / 2) * sc, y + 7, { align: "center" });
    else doc.text(sep, x + 6, y + ((cs[0] + cs[1]) / 2) * sc + 1);
  }
  // cotas de vigas maestras (centros): borde→primera maestra y separación entre maestras
  const mc = [...new Set(maestras.map(p => p.pos[0] + 15))].sort((a, b) => a - b);
  if (mc.length){
    doc.setDrawColor(61, 153, 112); doc.setTextColor(...OBS); doc.setFontSize(6);
    doc.line(x, y - 3, x + mc[0] * sc, y - 3);
    doc.text(`borde ${Math.round(mc[0])}`, x + (mc[0] * sc) / 2, y - 4.1, { align: "center" });
    if (mc.length > 1){
      doc.line(x + mc[0] * sc, y - 7, x + mc[1] * sc, y - 7);
      doc.text(`maestras ${Math.round(mc[1] - mc[0])}`, x + ((mc[0] + mc[1]) / 2) * sc, y - 8.1, { align: "center" });
    }
  }
}

// Encabezado de página. Devuelve la y siguiente.
function drawHeader(doc, titulo, subt){
  const W = doc.internal.pageSize.getWidth(), M = 14; let y = 16;
  doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(...OBS); doc.text("ADAMANT", M, y);
  doc.setTextColor(...TANG); doc.text("·", M + 34, y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(...MUT); doc.text(titulo, M + 39, y);
  doc.setFontSize(9); doc.text(subt || new Date().toLocaleDateString("es-AR"), W - M, y, { align: "right" });
  return y + 8;
}
// Lista de compra (unidades de venta) desde `materiales`. Devuelve la y siguiente.
function drawCompra(doc, materiales, y){
  const W = doc.internal.pageSize.getWidth(), M = 14;
  doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(...OBS); doc.text("Lista de compra", M, y);
  const rows = []; let total = 0;
  const push = (label, unidad, cant, key) => { const pu = getPrice(key), st = cant * pu; total += st; rows.push([label, unidad, String(cant), pu ? money(pu) : "—", st ? money(st) : "—"]); };
  materiales.perfiles.forEach(p => push(p.perfil, unidadBarra(p.largoBarra), p.barras, `perf:${p.perfil}`));
  (materiales.placas || []).forEach(p => push(`Placa ${p.material} · ${p.cara}`, "placa 1,20×2,40", p.unidades, `placa:${p.material}`));
  if (materiales.aislacion > 0) push("Aislación (lana)", "m²", Math.ceil(materiales.aislacion), "aislacion");
  if (materiales.tornillos?.t1) push("Tornillo T1 (estructura)", "u", materiales.tornillos.t1, "t1");
  if (materiales.tornillos?.t2) push("Tornillo T2 (placa)", "u", materiales.tornillos.t2, "t2");
  (materiales.otros || []).forEach(o => push(o.label, o.unidad, o.cantidad, o.key));
  autoTable(doc, { startY: y + 2, head: [["Material", "Unidad", "Cant", "$ unit.", "Subtotal"]], body: rows, foot: [["", "", "", "TOTAL", money(total)]],
    styles: { fontSize: 8.5, cellPadding: 1.6 }, headStyles: { fillColor: OBS, textColor: 255, fontSize: 8 }, footStyles: { fillColor: [255,255,255], textColor: TEAL, fontStyle: "bold" },
    columnStyles: { 2:{halign:"right"}, 3:{halign:"right"}, 4:{halign:"right"} }, margin: { left: M, right: M } });
  return doc.lastAutoTable.finalY + 6;
}
// Lista de cortes para un conjunto de piezas. Devuelve la y siguiente.
function drawCortesTabla(doc, piezas, input, titulo, y){
  const M = 14;
  doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(...OBS); doc.text(titulo, M, y);
  const plan = cutPlan(piezas, cutOpts(input)), rows = [];
  plan.forEach(pl => pl.bins.forEach((b, i) => rows.push([pl.perfil,
    `${unidadBarra(pl.barLen).split(" ")[0] === "tira" ? "Tira" : "Barra"} ${i+1}`,
    b.items.map(it => `${it.code}·${it.largo}`).join("  "), `${b.rem} mm`])));
  autoTable(doc, { startY: y + 2, head: [["Perfil", "Barra/Tira", "Piezas (código·largo mm)", "Sobra"]], body: rows.length ? rows : [["—","","",""]],
    styles: { fontSize: 8, cellPadding: 1.4 }, headStyles: { fillColor: OBS, textColor: 255, fontSize: 8 }, columnStyles: { 3: { halign: "right" } }, margin: { left: M, right: M } });
  return doc.lastAutoTable.finalY + 6;
}
// Planta acotada del AMBIENTE: recuadro + 4 muros (espesor e) + aberturas marcadas + cotas. Robusto:
// no depende de pos/axis de las piezas (que en el combinado quedan reubicadas).
function drawPlantaAmbiente(doc, input, e, x0, y0, maxW, maxH){
  const L = +input.largo, A = +input.ancho;
  if (!Number.isFinite(L) || !Number.isFinite(A) || L <= 0 || A <= 0) return;
  const sc = Math.min(maxW / L, maxH / A), pw = L * sc, ph = A * sc, x = x0, y = y0, es = Math.max(e * sc, 1.5);
  doc.setDrawColor(...OBS); doc.setFillColor(245, 247, 248); safeRect(doc, x, y, pw, ph, "FD", "ambiente");
  doc.setFillColor(...TEAL);
  safeRect(doc, x, y, pw, es, "F", "fondo"); safeRect(doc, x, y + ph - es, pw, es, "F", "frente");
  safeRect(doc, x, y, es, ph, "F", "izq");   safeRect(doc, x + pw - es, y, es, ph, "F", "der");
  // aberturas como huecos blancos en cada muro (frente/fondo a lo largo de X; izq/der a lo largo de Y)
  doc.setFillColor(255, 255, 255);
  (input.vanoFondo || []).forEach(v => safeRect(doc, x + v.x1*sc, y, (v.x2-v.x1)*sc, es, "F", "vf"));
  (input.vanoFrente || []).forEach(v => safeRect(doc, x + v.x1*sc, y + ph - es, (v.x2-v.x1)*sc, es, "F", "vfr"));
  (input.vanoIzq || []).forEach(v => safeRect(doc, x, y + v.x1*sc, es, (v.x2-v.x1)*sc, "F", "vi"));
  (input.vanoDer || []).forEach(v => safeRect(doc, x + pw - es, y + v.x1*sc, es, (v.x2-v.x1)*sc, "F", "vd"));
  doc.setDrawColor(...TEAL); doc.setTextColor(...MUT); doc.setFontSize(7);
  doc.line(x, y + ph + 3, x + pw, y + ph + 3); doc.text(`${(L/1000).toFixed(2)} m`, x + pw/2, y + ph + 6, { align: "center" });
  doc.line(x - 3, y, x - 3, y + ph); doc.text(`${(A/1000).toFixed(2)} m`, x - 4, y + ph/2, { align: "center", angle: 90 });
}

// PDF del ambiente completo por ETAPAS: portada (iso + planta acotada) + una página por etapa (piso y
// cada muro con sus vanos acotados) + lista de compra unificada y cortes global al final.
async function pdfCombinado(doc, input, piezas, materiales, metadatos, img3d){
  const W = doc.internal.pageSize.getWidth(), M = 14, e = metadatos.espesorMuro;
  // --- Portada ---
  let y = drawHeader(doc, "Ambiente completo en seco");
  const sis = input.sistema === "wood" ? "Wood frame" : "Steel frame";
  autoTable(doc, { startY: y, theme: "plain", styles: { fontSize: 9, cellPadding: 1.2 },
    body: [["Sistema", sis, "Superficie", `${materiales.area} m²`], ["Medidas", `${(input.largo/1000).toFixed(2)} × ${(input.ancho/1000).toFixed(2)} × ${(input.alto/1000).toFixed(2)} m`, "Peso", `${materiales.peso} kg`]],
    columnStyles: { 0: { textColor: MUT, cellWidth: 26 }, 2: { textColor: MUT, cellWidth: 30 } }, margin: { left: M, right: M } });
  y = doc.lastAutoTable.finalY + 4;
  const img = img3d, colW = (W - 2*M - 6) / 2, imgH = colW * 560/900;
  if (img && img.startsWith("data:image") && img.length > 200){ try { doc.addImage(img, "JPEG", M, y, colW, imgH); } catch (err) { console.warn("addImage combinado", err); } }
  drawPlantaAmbiente(doc, input, e, M + colW + 10, y, colW - 12, imgH);
  y += imgH + 10;
  const cortes = cortesPorEtapaVsGlobal(input);
  doc.setFontSize(9); doc.setTextColor(...OBS);
  doc.text(`Cortes: por etapa ${cortes.porEtapa} barras · todo junto ${cortes.global} barras${cortes.ahorro>0?` — cortando todo junto ahorrás ${cortes.ahorro}`:""}`, M, y);

  // --- Etapas: piso + 4 muros ---
  const wallLargo = { frente: input.largo, fondo: input.largo, izq: input.ancho - 2*e, der: input.ancho - 2*e };
  const wallVanos = { frente: input.vanoFrente, fondo: input.vanoFondo, izq: input.vanoIzq, der: input.vanoDer };
  const etapas = [
    { parte: "piso",   t: "Etapa 1 · Piso (plataforma)" },
    { parte: "frente", t: "Etapa 2 · Muro Frente" }, { parte: "fondo", t: "Etapa 3 · Muro Fondo" },
    { parte: "izq",    t: "Etapa 4 · Muro Lateral izq." }, { parte: "der", t: "Etapa 5 · Muro Lateral der." }
  ];
  const pisoInput = { kind:"piso", sistema:input.sistema, largo:input.largo, ancho:input.ancho, separacion:input.separacion||400, apoyo:input.apoyo, placa:input.placa, opciones:input.opciones };
  etapas.forEach(et => {
    doc.addPage(); let yy = drawHeader(doc, et.t);
    if (et.parte === "piso"){
      const pg = getModule("piso").generar(pisoInput);
      drawPlanta(doc, pg.metadatos, pg.piezas, M, yy, W - 2*M, 90); yy += 100;
      drawCortesTabla(doc, pg.piezas, pisoInput, "Cortes del piso", yy);
    } else {
      const wInput = { sistema:input.sistema, largo:wallLargo[et.parte], alto:input.alto, vanos:wallVanos[et.parte]||[], opciones:input.opciones };
      drawSchema(doc, wInput, M, yy, W - 2*M, 90); yy += 104;
      const wp = piezas.filter(p => p.parte === et.parte && !p.superficie);
      drawCortesTabla(doc, wp, wInput, "Cortes del muro", yy);
    }
  });

  // --- Lista de compra unificada + cortes global ---
  doc.addPage(); let yf = drawHeader(doc, "Lista de compra unificada");
  yf = drawCompra(doc, materiales, yf);
  if (yf > 200){ doc.addPage(); yf = 16; }
  drawCortesTabla(doc, piezas.filter(p => !p.superficie), input, "Cortes — todo junto (optimización global)", yf);
  doc.setFontSize(7.5); doc.setTextColor(...MUT);
  doc.text("Cómputo de estimación. El cálculo estructural definitivo lo realiza un profesional habilitado. — Adamant", M, doc.internal.pageSize.getHeight() - 8);
}

// opts: { img: dataURL del 3D (el WebGL vive en el cliente), precios: mapa clave→$, out: "save"|"buffer" }
// Devuelve { doc, nombre }; con out:"save" además dispara la descarga (solo navegador).
export async function exportPDF(input, opts = {}){
  getPrice = k => (opts.precios || {})[k] ?? 0;
  const { piezas, materiales, metadatos } = computeProject(input);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  if (input.kind === "combinado"){
    await pdfCombinado(doc, input, piezas, materiales, metadatos, opts.img);
    const nombre = `adamant-ambiente-${input.sistema}-${(input.largo/1000).toFixed(1)}x${(input.ancho/1000).toFixed(1)}.pdf`;
    if (opts.out !== "buffer") doc.save(nombre);
    return { doc, nombre };
  }
  const W = doc.internal.pageSize.getWidth(), M = 14;
  let y = 16;

  // encabezado
  doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(...OBS);
  doc.text("ADAMANT", M, y);
  doc.setTextColor(...TANG); doc.text("·", M + 34, y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(...MUT);
  doc.text(`${metadatos.nombre} en seco`, M + 39, y);
  doc.setFontSize(9); doc.text(new Date().toLocaleDateString("es-AR"), W - M, y, { align: "right" });
  y += 8;

  // resumen (campos según lo que el módulo aporte)
  const sis = input.sistema === "wood" ? "Wood frame" : "Steel frame";
  const dimB = input.ancho ?? input.alto;
  const medidas = `${input.largo ? (input.largo/1000).toFixed(2) + " × " : ""}${dimB ? (dimB/1000).toFixed(2) + " m" : ""}`;
  const body = [
    ["Sistema", sis, "Piezas", String(materiales.nMont ?? piezas.length)],
    ["Medidas", medidas, "Peso", `${materiales.peso ?? 0} kg`]
  ];
  if (input.tipo) body.splice(1, 0, ["Tipo", input.tipo === "muro" ? "Muro exterior" : "Tabique interior", "Aberturas", String(materiales.nVanos ?? 0)]);
  if (materiales.area) body.push(["Superficie", `${materiales.area} m²`, "Aislación", materiales.aislacion ? `${materiales.aislacion} m²` : "—"]);
  autoTable(doc, {
    startY: y, theme: "plain", styles: { fontSize: 9, cellPadding: 1.2 }, body,
    columnStyles: { 0: { textColor: MUT, cellWidth: 26 }, 2: { textColor: MUT, cellWidth: 30 } },
    margin: { left: M, right: M }
  });
  y = doc.lastAutoTable.finalY + 4;

  // 3D + esquema, lado a lado. El esquema (frontal/planta) lo indica el módulo por metadatos.
  const img = opts.img, colW = (W - 2*M - 6) / 2, imgH = colW * 560/900;
  if (img && img.startsWith("data:image") && img.length > 200){
    try { doc.addImage(img, "JPEG", M, y, colW, imgH); }
    catch (e) { console.warn("addImage falló, se omite la imagen 3D", e); }
  }
  if (metadatos.esquema === "planta") drawPlanta(doc, metadatos, piezas, M + colW + 6, y, colW - 6, imgH);
  else if (metadatos.esquema === "frontal" && input.largo) drawSchema(doc, input, M + colW + 6, y, colW - 6, imgH);
  y += imgH + 8;

  // lista de compra
  doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(...OBS);
  doc.text("Lista de compra", M, y); y += 2;
  const rows = []; let total = 0;
  const push = (label, unidad, cant, key) => { const pu = getPrice(key), st = cant * pu; total += st; rows.push([label, unidad, String(cant), pu ? money(pu) : "—", st ? money(st) : "—"]); };
  materiales.perfiles.forEach(p => push(p.perfil, unidadBarra(p.largoBarra), p.barras, `perf:${p.perfil}`));
  materiales.placas.forEach(p => push(`Placa ${p.material} · ${p.cara}`, "placa 1,20×2,40", p.unidades, `placa:${p.material}`));
  if (materiales.aislacion > 0) push("Aislación (lana)", "m²", Math.ceil(materiales.aislacion), "aislacion");
  if (materiales.tornillos?.t1) push("Tornillo T1 (estructura)", "u", materiales.tornillos.t1, "t1");
  if (materiales.tornillos?.t2) push("Tornillo T2 (placa)", "u", materiales.tornillos.t2, "t2");
  (materiales.otros || []).forEach(o => push(o.label, o.unidad, o.cantidad, o.key));
  autoTable(doc, {
    startY: y + 1, head: [["Material", "Unidad", "Cant", "$ unit.", "Subtotal"]],
    body: rows, foot: [["", "", "", "TOTAL", money(total)]],
    styles: { fontSize: 8.5, cellPadding: 1.6 }, headStyles: { fillColor: OBS, textColor: 255, fontSize: 8 },
    footStyles: { fillColor: [255,255,255], textColor: TEAL, fontStyle: "bold" },
    columnStyles: { 2:{halign:"right"}, 3:{halign:"right"}, 4:{halign:"right"} }, margin: { left: M, right: M }
  });
  y = doc.lastAutoTable.finalY + 6;

  // lista de cortes
  if (y > 250){ doc.addPage(); y = 16; }
  doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(...OBS);
  doc.text("Lista de cortes", M, y); y += 3;
  const plan = cutPlan(piezas, cutOpts(input)); // largo de barra por perfil
  const cutRows = [];
  plan.forEach(pl => {
    pl.bins.forEach((b, i) => cutRows.push([
      `${pl.perfil}`, `${unidadBarra(pl.barLen).split(" ")[0] === "tira" ? "Tira" : "Barra"} ${i+1}`,
      b.items.map(it => `${it.code}·${it.largo}`).join("  "), `${b.rem} mm`
    ]));
  });
  autoTable(doc, {
    startY: y, head: [["Perfil", "Barra/Tira", "Piezas (código·largo mm)", "Sobra"]],
    body: cutRows, styles: { fontSize: 8, cellPadding: 1.4 }, headStyles: { fillColor: OBS, textColor: 255, fontSize: 8 },
    columnStyles: { 3: { halign: "right" } }, margin: { left: M, right: M }
  });

  doc.setFontSize(7.5); doc.setTextColor(...MUT);
  doc.text("Cómputo de estimación. El cálculo estructural definitivo lo realiza un profesional habilitado. — Adamant", M, doc.internal.pageSize.getHeight() - 8);

  const tag = input.largo ? `${(input.largo/1000).toFixed(1)}x${(input.alto/1000).toFixed(1)}` : `${(input.alto/1000).toFixed(1)}`;
  const nombre = `adamant-${input.kind || "muro"}-${input.sistema}-${tag}.pdf`;
  if (opts.out !== "buffer") doc.save(nombre);
  return { doc, nombre };
}
