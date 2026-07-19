// POST /api/crear-pago → { init_point } (URL de Checkout Pro).
// El precio vive en el servidor (env PRECIO_PROYECTO), nunca se confía en el cliente.
import { mpFetch, json, soloPost, limpiarProy } from "./_lib.mjs";

export default async function handler(req, res){
  if (!soloPost(req, res)) return;
  // El id de proyecto viaja como external_reference: MP nos lo devuelve en /canjear y ata la
  // licencia a ese proyecto. Sin él no se puede emitir licencia.
  const proy = limpiarProy(req.body?.proy);
  if (!proy) return json(res, 400, { error: "proy requerido" });
  try {
    const precio = Number(process.env.PRECIO_PROYECTO || 20000);
    // La app vive en /app/ (la raíz es la landing): el retorno de MP tiene que caer ahí, que es
    // donde corre canjearSiVuelve(). Si cae en la raíz, el pago no se canjea nunca.
    const base = (process.env.APP_URL || `https://${req.headers.host}`).replace(/\/+$/, "");
    const app = `${base}/app/`;
    const pref = await mpFetch("/checkout/preferences", {
      method: "POST",
      body: JSON.stringify({
        items: [{
          title: "Adamant — Proyecto desbloqueado (PDF + cortes + SketchUp)",
          description: "PDF completo, lista de cortes optimizada y export a SketchUp. Ediciones libres por 30 días.",
          quantity: 1, currency_id: "ARS", unit_price: precio
        }],
        external_reference: proy,
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
