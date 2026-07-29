// POST /api/canjear { payment_id } → { token, exp, sku, projectHash }.
// Verifica contra MP que el pago exista, esté aprobado, sea un SKU de Adamant y que el monto coincida
// con pricing.js. El sku/projectHash salen del external_reference que devuelve MP (no del cliente).
import { mpFetch, firmarLicencia, verificarLicencia, json, soloPost, unpackRef } from "./_lib.mjs";
import { esSkuValido, montoCoincide } from "../src/config/pricing.js";

export default async function handler(req, res){
  if (!soloPost(req, res)) return;
  const pid = String(req.body?.payment_id || "").replace(/\D/g, "");
  if (!pid) return json(res, 400, { error: "payment_id requerido" });
  try {
    const pago = await mpFetch(`/v1/payments/${pid}`);
    if (pago.status !== "approved") return json(res, 402, { error: `Pago no aprobado (estado: ${pago.status})` });
    const { sku, projectHash } = unpackRef(pago.external_reference);
    if (!esSkuValido(sku)) return json(res, 409, { error: "El pago no corresponde a un SKU de Adamant" });
    const monto = pago.transaction_amount ?? pago.transaction_details?.total_paid_amount;
    if (!montoCoincide(sku, monto)) return json(res, 409, { error: "El monto pagado no coincide con el precio vigente" });
    const compraTs = pago.date_approved ? Date.parse(pago.date_approved) : Date.now();
    const token = firmarLicencia({ sku, projectHash: sku === "proyecto" ? projectHash : null, orderId: pid, compraTs });
    const { exp } = verificarLicencia(token, projectHash);
    json(res, 200, { token, exp: exp || null, sku, projectHash: sku === "proyecto" ? projectHash : null });
  } catch (e) {
    json(res, 500, { error: e.message });
  }
}
