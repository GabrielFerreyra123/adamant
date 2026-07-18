// POST /api/crear-pago → { init_point } (URL de Checkout Pro).
// El precio vive en el servidor (env PRECIO_PROYECTO), nunca se confía en el cliente.
import { mpFetch, json, soloPost } from "./_lib.mjs";

export default async function handler(req, res){
  if (!soloPost(req, res)) return;
  try {
    const precio = Number(process.env.PRECIO_PROYECTO || 20000);
    const app = process.env.APP_URL || `https://${req.headers.host}`;
    const ref = (req.body?.ref || "proy").toString().slice(0, 60);
    const pref = await mpFetch("/checkout/preferences", {
      method: "POST",
      body: JSON.stringify({
        items: [{
          title: "Adamant — Proyecto desbloqueado (PDF + cortes + SketchUp)",
          description: "PDF completo, lista de cortes optimizada y export a SketchUp. Ediciones libres por 30 días.",
          quantity: 1, currency_id: "ARS", unit_price: precio
        }],
        external_reference: ref,
        back_urls: { success: app, pending: app, failure: app },
        auto_return: "approved",
        statement_descriptor: "ADAMANT"
      })
    });
    json(res, 200, { init_point: pref.init_point, precio });
  } catch (e) {
    json(res, 500, { error: e.message });
  }
}
