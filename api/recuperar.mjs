// POST /api/recuperar { operacion } → { token, exp, sku, projectHash }.
// Recupera el acceso desde el N° de operación de Mercado Pago, SIN pedir el código. Reemite el token
// con la fecha de compra ORIGINAL (no reinicia los 90 días). Anti-abuso: rate-limit por IP + tope de
// 5 reemisiones por operación (best-effort en memoria; el estado no persiste entre instancias).
import { mpFetch, firmarLicencia, verificarLicencia, json, soloPost, unpackRef } from "./_lib.mjs";
import { esSkuValido, montoCoincide } from "../src/config/pricing.js";

const reemisiones = new Map(); // pid → nº de veces reemitido
const ipHits = new Map();      // ip → { n, t }
const MAX_REEMIT = 5, VENTANA = 60000, MAX_IP = 10;

export default async function handler(req, res){
  if (!soloPost(req, res)) return;
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket?.remoteAddress || "anon";
  const now = Date.now();
  const h = ipHits.get(ip);
  if (h && now - h.t < VENTANA){
    if (h.n >= MAX_IP){ console.warn("[recuperar] rate-limit IP", ip); return json(res, 429, { error: "Demasiados intentos. Probá en un minuto." }); }
    h.n++;
  } else ipHits.set(ip, { n: 1, t: now });

  const pid = String(req.body?.operacion || "").replace(/\D/g, "");
  if (!pid) return json(res, 400, { error: "Número de operación requerido" });
  const usos = reemisiones.get(pid) || 0;
  if (usos >= MAX_REEMIT){ console.warn("[recuperar] tope de reemisiones", pid); return json(res, 429, { error: "Esta operación ya se recuperó varias veces. Escribinos para reemitir a mano." }); }

  try {
    const pago = await mpFetch(`/v1/payments/${pid}`);
    if (pago.status !== "approved") return json(res, 402, { error: `Pago no aprobado (estado: ${pago.status})` });
    const { sku, projectHash } = unpackRef(pago.external_reference);
    if (!esSkuValido(sku)) return json(res, 409, { error: "La operación no corresponde a Adamant" });
    const monto = pago.transaction_amount ?? pago.transaction_details?.total_paid_amount;
    if (!montoCoincide(sku, monto)) return json(res, 409, { error: "El monto no coincide con el precio vigente" });
    const compraTs = pago.date_approved ? Date.parse(pago.date_approved) : Date.now();
    reemisiones.set(pid, usos + 1);
    console.log("[recuperar] reemisión", pid, sku, "uso", usos + 1);
    const token = firmarLicencia({ sku, projectHash: sku === "proyecto" ? projectHash : null, orderId: pid, compraTs });
    const { exp } = verificarLicencia(token, projectHash);
    json(res, 200, { token, exp: exp || null, sku, projectHash: sku === "proyecto" ? projectHash : null });
  } catch (e) {
    json(res, 500, { error: e.message });
  }
}
