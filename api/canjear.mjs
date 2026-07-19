// POST /api/canjear { payment_id } → { token, exp, proy }.
// Verifica contra la API de MP que el pago exista y esté aprobado; si sí, emite la licencia firmada.
// El proyecto sale del external_reference que devuelve MP: el cliente no elige a qué proyecto se ata.
import { mpFetch, firmarLicencia, verificarLicencia, limpiarProy, json, soloPost } from "./_lib.mjs";

export default async function handler(req, res){
  if (!soloPost(req, res)) return;
  const pid = String(req.body?.payment_id || "").replace(/\D/g, "");
  if (!pid) return json(res, 400, { error: "payment_id requerido" });
  try {
    const pago = await mpFetch(`/v1/payments/${pid}`);
    if (pago.status !== "approved") return json(res, 402, { error: `Pago no aprobado (estado: ${pago.status})` });
    const proy = limpiarProy(pago.external_reference);
    if (!proy) return json(res, 409, { error: "El pago no tiene proyecto asociado" });
    const token = firmarLicencia(pid, proy);
    const { exp } = verificarLicencia(token);
    json(res, 200, { token, exp, proy });
  } catch (e) {
    json(res, 500, { error: e.message });
  }
}
