// POST /api/generar { token, tipo: "pdf"|"ruby", input, img?, precios? }
// → PDF binario o script Ruby en texto. Sin licencia válida no hay archivo: esta es la pared de pago
// real (el cliente no incluye los generadores en su bundle).
import { verificarLicencia, json, soloPost } from "./_lib.mjs";
import { exportPDF } from "../src/export/pdf.mjs";
import { exportRuby } from "../src/export/ruby.mjs";

export const config = { api: { bodyParser: { sizeLimit: "8mb" } } }; // img del 3D viaja como dataURL

export default async function handler(req, res){
  if (!soloPost(req, res)) return;
  const { token, tipo, input, img, precios } = req.body || {};
  const lic = verificarLicencia(token);
  if (!lic.ok) return json(res, 402, { error: `Licencia inválida: ${lic.motivo}` });
  if (!input || typeof input !== "object") return json(res, 400, { error: "input requerido" });
  try {
    if (tipo === "ruby"){
      const rb = exportRuby(input);
      res.status(200).setHeader("Content-Type", "text/plain; charset=utf-8");
      return res.end(rb);
    }
    if (tipo === "pdf"){
      const imgOk = typeof img === "string" && img.startsWith("data:image") && img.length < 6e6 ? img : null;
      const { doc, nombre } = await exportPDF(input, { img: imgOk, precios: precios || {}, out: "buffer" });
      const buf = Buffer.from(doc.output("arraybuffer"));
      res.status(200)
        .setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${nombre}"`);
      return res.end(buf);
    }
    json(res, 400, { error: "tipo debe ser pdf o ruby" });
  } catch (e) {
    console.error("[generar]", e);
    json(res, 500, { error: e.message });
  }
}
