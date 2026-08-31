// ADAMANT · Dossier de cumplimiento (PDF premium). El papel que el profesional revisa y firma. NO es
// cálculo: ordena identificación + datos de sitio (clima) + resultados del pre-dimensionado (semáforo) +
// supuestos/descargo + un bloque de firma. Puro (jsPDF, sin DOM): corre en el navegador y en Node.
//
// Los datos de clima viven en el estado de la UI, no en el input del motor: llegan por `opts.clima`
// ({ ciudad, zonaViento, nieve, zonaBio }); si faltan, defaults neutros. Respeta CLAUDE.md: regla 4
// (Adamant dibuja, no calcula) y regla 3 (nada se afirma como cálculo: todo es orientativo).
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { computeProject } from "../engine/index.mjs";
import { predimensionar } from "../engine/predimensionado.mjs";
import { CIUDADES, BIO_LBL, VIENTO_LBL, NIEVE_LBL } from "../engine/clima.mjs";

const OBS = [10, 26, 34], TANG = [232, 93, 42], MUT = [110, 128, 136], TEAL = [27, 182, 164];
const EST = { ok: "OK", atencion: "A revisar", fuera: "Fuera de rango" };
const NOM_TIPO = { exterior: "Muro exterior", interior: "Muro interior portante", tabique: "Tabique divisorio" };
const m2 = mm => (mm / 1000).toFixed(2).replace(".", ",");  // coma decimal (es-AR), como el resto del entregable
// jsPDF (fuentes estándar, WinAnsi) no compone algunos glifos y rompe la línea con letter-spacing.
// Reemplazo los que aparecen en los rangos del semáforo por su equivalente ASCII.
const safe = s => String(s).replace(/≤/g, "<=").replace(/≥/g, ">=");

// exportDossier(input, opts) → { doc, nombre }. opts: { clima:{ciudad,zonaViento,nieve,zonaBio}, out }.
export async function exportDossier(input, opts = {}){
  const { materiales, metadatos, piezas } = computeProject(input);
  const cl = opts.clima || {};
  const ciudad = CIUDADES[cl.ciudad] || null;
  const zonaViento = cl.zonaViento || ciudad?.viento || "media";
  const nieve = cl.nieve || ciudad?.nieve || "baja";
  const zonaBio = cl.zonaBio || ciudad?.bio || "IV";
  const { checks } = predimensionar(input, { zona: zonaViento, nieve });

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 14;
  let y = 16;

  // — Encabezado —
  doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(...OBS); doc.text("ADAMANT", M, y);
  doc.setTextColor(...TANG); doc.text("·", M + 34, y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(...MUT); doc.text("Dossier de cumplimiento", M + 39, y);
  doc.setFontSize(9); doc.text(new Date().toLocaleDateString("es-AR"), W - M, y, { align: "right" });
  y += 9;

  // — 1. Identificación —
  const sis = input.sistema === "wood" ? "Wood frame" : "Steel frame";
  const dimB = input.ancho ?? input.alto;
  const medidas = `${input.largo ? m2(input.largo) + " × " : ""}${dimB ? m2(dimB) + " m" : ""}`;
  const idBody = [
    ["Sistema", sis, "Superficie", materiales.area ? `${materiales.area} m²` : "—"],
    ["Tipo", input.tipoMuro ? (NOM_TIPO[input.tipoMuro] || input.tipoMuro) : (metadatos.nombre || input.kind || "—"), "Peso estimado", `${materiales.peso ?? 0} kg`],
    ["Medidas", medidas || "—", "Ubicación", ciudad ? `${ciudad.label} (${ciudad.prov})` : "sin especificar"]
  ];
  autoTable(doc, { startY: y, theme: "plain", styles: { fontSize: 9, cellPadding: 1.3 }, body: idBody,
    columnStyles: { 0: { textColor: MUT, cellWidth: 26 }, 2: { textColor: MUT, cellWidth: 32 } }, margin: { left: M, right: M } });
  y = doc.lastAutoTable.finalY + 5;

  // — 2. Datos de sitio (clima) —
  doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(...OBS); doc.text("Datos de sitio", M, y); y += 5;
  autoTable(doc, { startY: y, head: [["Viento", "Nieve", "Zona bioambiental"]],
    body: [[VIENTO_LBL[zonaViento] || zonaViento, NIEVE_LBL[nieve] || nieve, `Zona ${BIO_LBL[zonaBio] || zonaBio}`]],
    styles: { fontSize: 9, cellPadding: 1.6 }, headStyles: { fillColor: OBS, textColor: 255, fontSize: 8 }, margin: { left: M, right: M } });
  y = doc.lastAutoTable.finalY + 3;
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...MUT);
  doc.text("Valores orientativos por ciudad (CIRSOC 102 viento · 104 nieve · IRAM 11603 zonas), a verificar por el profesional.", M, y);
  y += 6;

  // — 3. Pre-dimensionado (semáforo) —
  doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(...OBS); doc.text("Pre-dimensionado (semáforo)", M, y); y += 2;
  const filas = checks.map(c => [safe(c.label), safe(c.valor), safe(c.rango), EST[c.estado] || c.estado]);
  autoTable(doc, { startY: y + 2, head: [["Ítem", "Tu proyecto", "Referencia", "Estado"]],
    body: filas.length ? filas : [["Sin chequeos para este módulo", "", "", ""]],
    styles: { fontSize: 8, cellPadding: 1.4 }, headStyles: { fillColor: OBS, textColor: 255, fontSize: 8 },
    didParseCell: d => { if (d.section === "body" && d.column.index === 3){
      const e = filas[d.row.index]?.[3];
      if (e === "Fuera de rango") d.cell.styles.textColor = TANG;
      else if (e === "A revisar") d.cell.styles.textColor = [176, 122, 0];
      else d.cell.styles.textColor = TEAL;
      d.cell.styles.fontStyle = "bold";
    } }, margin: { left: M, right: M } });
  y = doc.lastAutoTable.finalY + 3;
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...MUT);
  doc.text("El semáforo compara tus medidas contra rangos típicos publicados. Es orientativo, no un cálculo estructural.", M, y);
  y += 7;

  // — 4. Supuestos y alcances (descargo, regla 4) —
  if (y > H - 70){ doc.addPage(); y = 16; }
  doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(...OBS); doc.text("Supuestos y alcances", M, y); y += 5;
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...OBS);
  const descargo = [
    "Adamant dibuja la estructura; no la calcula. El cálculo estructural, los arriostres y los anclajes los define un profesional habilitado según viento, nieve y cargas (CIRSOC).",
    "Los datos de sitio y el pre-dimensionado de este dossier son orientativos (comparación contra rangos típicos), no un cálculo verificado.",
    "El cómputo es una estimación de materiales; los precios, cuando aparecen, son de referencia de mercado. El plan de corte no descuenta la merma de sierra.",
    "La geometría es la fuente de verdad: cortes, cómputo y presupuesto se derivan de ella."
  ];
  descargo.forEach(t => { doc.splitTextToSize(`• ${t}`, W - 2 * M).forEach(l => { doc.text(l, M, y); y += 4.2; }); y += 1; });
  y += 4;

  // — 5. Revisión profesional (normas + firma) —
  if (y > H - 55){ doc.addPage(); y = 16; }
  doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(...OBS); doc.text("Revisión profesional", M, y); y += 5;
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...OBS);
  doc.text("Normas aplicables:", M, y); y += 4.5;
  doc.setFontSize(8); doc.setTextColor(...MUT);
  doc.splitTextToSize("CIRSOC 101 (cargas) · 102 (viento) · 103 (sismo) · 104 (nieve) · CIRSOC 303 (perfiles conformados en frío) · IRAM 11601/11605/11603 (térmica y zonas bioambientales).", W - 2 * M).forEach(l => { doc.text(l, M, y); y += 4; });
  y += 8;
  doc.setDrawColor(...MUT); doc.setTextColor(...OBS); doc.setFontSize(9);
  const colW = (W - 2 * M - 10) / 2;
  doc.line(M, y, M + colW, y); doc.line(M + colW + 10, y, W - M, y); y += 4;
  doc.setFontSize(8); doc.setTextColor(...MUT);
  doc.text("Firma del profesional", M, y); doc.text("Aclaración", M + colW + 10, y); y += 10;
  doc.setDrawColor(...MUT);
  doc.line(M, y, M + colW, y); doc.line(M + colW + 10, y, W - M, y); y += 4;
  doc.text("Matrícula", M, y); doc.text("Fecha", M + colW + 10, y);

  doc.setFontSize(7.5); doc.setTextColor(...MUT);
  doc.text("Dossier orientativo generado por Adamant · no sustituye el cálculo y la firma de un profesional habilitado.", M, H - 8);

  const nombre = `adamant-dossier-${input.kind || "proyecto"}-${input.sistema || ""}.pdf`.replace(/-+\./, ".");
  if (opts.out !== "buffer") doc.save(nombre);
  return { doc, nombre };
}
