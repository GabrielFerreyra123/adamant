// POST /api/canjear { payment_id } → { token, exp }.
// Verifica contra la API de MP que el pago exista y esté aprobado; si sí, emite la licencia firmada.
import { mpFetch, firmarLicencia, verificarLicencia, json, soloPost } from "./_lib.mjs";

export default async function handler(req, res){
  if (!soloPost(req, res)) return;
  const pid = String(req.body?.payment_id || "").replace(/\D/g, "");
  if (!pid) return json(res, 400, { error: "payment_id requerido" });
  try {
    const pago = await mpFetch(`/v1/payments/${pid}`);
    if (pago.status !== "approved") return json(res, 402, { error: `Pago no aprobado (estado: ${pago.status})` });
    const token = firmarLicencia(pid);
    const { exp } = verificarLicencia(token);
    json(res, 200, { token, exp });
  } catch (e) {
    json(res, 500, { error: e.message });
  }
}
