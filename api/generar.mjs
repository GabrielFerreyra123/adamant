// POST /api/generar { token, proy, tipo: "pdf", input, img?, precios? }
// → PDF de obra binario. Sin licencia válida no hay archivo: esta es la pared de pago real
// (el cliente no incluye el generador del PDF en su bundle).
import { verificarLicencia, perpetuoDesdePase, limpiarProy, json, soloPost } from "./_lib.mjs";
import { exportPDF } from "../src/export/pdf.mjs";
import { exportDXF } from "../src/export/dxf.mjs";
import { exportOBJ } from "../src/export/obj.mjs";
import { exportDossier } from "../src/export/dossier.mjs";

export const config = { api: { bodyParser: { sizeLimit: "8mb" } } }; // img del 3D viaja como dataURL

export default async function handler(req, res){
  if (!soloPost(req, res)) return;
  const { token, projectHash, tipo, input, img, precios, clima } = req.body || {};
  const ph = limpiarProy(projectHash);
  const lic = verificarLicencia(token, ph);
  if (!lic.ok) return json(res, 402, { error: `Licencia inválida: ${lic.motivo}` });
  if (!input || typeof input !== "object") return json(res, 400, { error: "input requerido" });
  try {
    if (tipo === "pdf"){
      const imgOk = typeof img === "string" && img.startsWith("data:image") && img.length < 6e6 ? img : null;
      const { doc, nombre } = await exportPDF(input, { img: imgOk, precios: precios || {}, out: "buffer" });
      const buf = Buffer.from(doc.output("arraybuffer"));
      // Perpetuidad: lo generado con un pase vigente queda re-exportable para siempre → emitimos el
      // token proyecto perpetuo y lo devolvemos en un header para que el cliente lo guarde.
      const perp = perpetuoDesdePase(lic, ph);
      if (perp) res.setHeader("X-Adamant-Perpetuo", perp);
      res.status(200).setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${nombre}"`);
      return res.end(buf);
    }
    if (tipo === "dxf"){
      const { dxf, nombre } = exportDXF(input);
      const perp = perpetuoDesdePase(lic, ph);
      if (perp) res.setHeader("X-Adamant-Perpetuo", perp);
      res.status(200).setHeader("Content-Type", "application/dxf");
      res.setHeader("Content-Disposition", `attachment; filename="${nombre}"`);
      return res.end(dxf);
    }
    if (tipo === "obj"){
      const { obj, nombre } = exportOBJ(input);
      const perp = perpetuoDesdePase(lic, ph);
      if (perp) res.setHeader("X-Adamant-Perpetuo", perp);
      res.status(200).setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${nombre}"`);
      return res.end(obj);
    }
    if (tipo === "dossier"){
      const { doc, nombre } = await exportDossier(input, { clima: clima || {}, out: "buffer" });
      const buf = Buffer.from(doc.output("arraybuffer"));
      const perp = perpetuoDesdePase(lic, ph);
      if (perp) res.setHeader("X-Adamant-Perpetuo", perp);
      res.status(200).setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${nombre}"`);
      return res.end(buf);
    }
    json(res, 400, { error: "tipo debe ser pdf, dxf, obj o dossier" });
  } catch (e) {
    console.error("[generar]", e);
    json(res, 500, { error: e.message });
  }
}
