// POST /api/crear-pago { sku, projectHash? } → { init_point, precio } (URL de Checkout Pro).
// El precio SIEMPRE sale de src/config/pricing.js; nunca se confía en el cliente.
import { mpFetch, json, soloPost, limpiarProy, packRef } from "./_lib.mjs";
import { esSkuValido, precioDe, PRICING } from "../src/config/pricing.js";

const TITULO = {
  proyecto: "Adamant — Proyecto suelto (PDF de obra + cortes optimizados)",
  pase90: "Adamant — Pase de obra 90 días (proyectos ilimitados)",
  pase90_renov: "Adamant — Renovación del pase de obra (90 días)"
};
const DESC = {
  proyecto: "Un proyecto: PDF de obra y lista de cortes optimizada, con ediciones ilimitadas. Tuyo para siempre.",
  pase90: "Todos los proyectos que quieras durante 90 días. Lo que armes queda tuyo para siempre.",
  pase90_renov: "90 días más de proyectos ilimitados."
};

export default async function handler(req, res){
  if (!soloPost(req, res)) return;
  const sku = String(req.body?.sku || "");
  if (!esSkuValido(sku)) return json(res, 400, { error: "SKU inválido" });
  const projectHash = limpiarProy(req.body?.projectHash);
  if (sku === "proyecto" && !projectHash) return json(res, 400, { error: "projectHash requerido para proyecto" });
  try {
    const precio = precioDe(sku);
    // El retorno de MP tiene que caer en el MISMO origen desde el que se abrió el checkout (mismo
    // localStorage). Priorizamos el origen real del pedido sobre APP_URL.
    const proto = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const base = (req.headers.origin || (host ? `${proto}://${host}` : process.env.APP_URL || "")).replace(/\/+$/, "");
    const app = `${base}/`; // MP vuelve a la raíz; la landing reenvía a /app con los params del pago.
    const publica = /^https:\/\//.test(base) && !/localhost|127\.0\.0\.1/.test(base);
    const body = {
      items: [{
        title: TITULO[sku], description: DESC[sku],
        quantity: 1, currency_id: PRICING.moneda, unit_price: precio
      }],
      external_reference: packRef(sku, projectHash),
      back_urls: { success: app, pending: app, failure: app },
      statement_descriptor: "ADAMANT"
    };
    if (publica) body.auto_return = "approved";
    const pref = await mpFetch("/checkout/preferences", { method: "POST", body: JSON.stringify(body) });
    json(res, 200, { init_point: pref.init_point, precio });
  } catch (e) {
    json(res, 500, { error: e.message });
  }
}
