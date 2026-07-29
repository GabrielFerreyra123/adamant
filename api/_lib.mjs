// ADAMANT · backend compartido. Licencias SIN base de datos: token HMAC firmado con LICENSE_SECRET,
// stateless. Emitirlo requiere verificar el pago contra Mercado Pago; validarlo es solo criptografía.
//
// Token v2: { v:2, sku, exp, projectHash|null, iat, orderId }
//   · pase90 / pase90_renov → exp = compra + dias, projectHash = null  (proyectos ilimitados hasta exp)
//   · proyecto              → exp = null (perpetuo), projectHash = id del proyecto pagado
// Un export se autoriza si la firma es válida Y (exp en el futuro  O  projectHash coincide con el pedido).
// Tokens v1 { pid, proy, exp } (esquema viejo) siguen valiendo como `proyecto` perpetuo (no se invalidan).
import { createHmac, timingSafeEqual } from "node:crypto";
import { esSkuValido, diasDe } from "../src/config/pricing.js";

const SECRET = () => {
  const s = process.env.LICENSE_SECRET;
  if (!s) throw new Error("Falta LICENSE_SECRET");
  return s;
};
const b64u = buf => Buffer.from(buf).toString("base64url");
const hmac = payload => createHmac("sha256", SECRET()).update(payload).digest();

export const limpiarProy = v => String(v || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);

// Firma un token v2. `compraTs` (ms) fija el arranque de la vigencia — al reemitir por recuperación
// se pasa la fecha original del pago para NO reiniciar los 90 días.
export function firmarLicencia({ sku, projectHash = null, orderId = "", compraTs = Date.now() }){
  if (!esSkuValido(sku)) throw new Error("SKU inválido");
  const dias = diasDe(sku);
  const ph = projectHash ? limpiarProy(projectHash) : null;
  let exp = null;
  if (dias > 0) exp = compraTs + dias * 864e5;               // pase: vence
  else if (!ph) throw new Error("proyecto requiere projectHash"); // proyecto: perpetuo, atado al proyecto
  const payload = b64u(JSON.stringify({ v: 2, sku, exp, projectHash: ph, iat: compraTs, orderId: String(orderId || "") }));
  return `${payload}.${b64u(hmac(payload))}`;
}

// Verifica firma + parsea; NO decide autorización (eso lo hace verificarLicencia con el projectHash).
// → { ok, data } donde data ya viene normalizado a la forma v2.
function abrir(token){
  if (typeof token !== "string" || !token.includes(".")) return { ok: false, motivo: "token ausente" };
  const [payload, sig] = token.split(".");
  let esperada, dada;
  try { esperada = hmac(payload); dada = Buffer.from(sig, "base64url"); } catch { return { ok: false, motivo: "token corrupto" }; }
  if (dada.length !== esperada.length || !timingSafeEqual(dada, esperada)) return { ok: false, motivo: "firma inválida" };
  let d;
  try { d = JSON.parse(Buffer.from(payload, "base64url").toString()); } catch { return { ok: false, motivo: "token corrupto" }; }
  if (d.v === 2) return { ok: true, data: d };
  // v1 (o legacy sin v): { pid, proy, exp } → proyecto perpetuo atado a `proy`.
  if (d.proy) return { ok: true, data: { v: 1, sku: "proyecto", exp: null, projectHash: limpiarProy(d.proy), iat: d.exp ? d.exp - 30 * 864e5 : Date.now(), orderId: String(d.pid || "") } };
  return { ok: false, motivo: "token desconocido" };
}

// Autoriza (o no) el token para `projectHash`. → { ok, sku?, exp?, projectHash?, iat?, orderId?, motivo? }
export function verificarLicencia(token, projectHash = null){
  const r = abrir(token);
  if (!r.ok) return { ok: false, motivo: r.motivo };
  const d = r.data;
  const ph = projectHash ? limpiarProy(projectHash) : null;
  const paseVigente = d.exp && Date.now() < d.exp;
  const proyMatch = d.projectHash && ph && d.projectHash === ph;
  if (paseVigente || proyMatch) return { ok: true, ...d };
  if (d.exp && Date.now() >= d.exp) return { ok: false, motivo: "pase vencido", ...d };
  return { ok: false, motivo: "la licencia no corresponde a este proyecto", ...d };
}

// ¿El token autorizado es un PASE vigente? (para mintear el perpetuo de lo generado con el pase).
export const esPase = d => !!(d && d.exp && !d.projectHash);

// Perpetuidad de lo generado con el pase: emite un `proyecto` perpetuo para `projectHash`,
// conservando el origen del pase (mismo orderId). Devuelve null si no aplica o falta projectHash.
export function perpetuoDesdePase(lic, projectHash){
  if (!esPase(lic) || !projectHash) return null;
  try { return firmarLicencia({ sku: "proyecto", projectHash, orderId: lic.orderId }); }
  catch { return null; }
}

export async function mpFetch(path, init = {}){
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) throw new Error("Falta MP_ACCESS_TOKEN");
  const r = await fetch(`https://api.mercadopago.com${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) }
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`MP ${r.status}: ${body.message || JSON.stringify(body)}`);
  return body;
}

// external_reference codifica sku + projectHash: "sku:projectHash" (projectHash vacío para pases).
export const packRef = (sku, projectHash) => `${sku}:${projectHash || ""}`;
export const unpackRef = ref => { const i = String(ref || "").indexOf(":"); return i < 0 ? { sku: null, projectHash: null } : { sku: String(ref).slice(0, i), projectHash: limpiarProy(String(ref).slice(i + 1)) }; };

// Helpers de handler (Vercel Node functions)
export function json(res, status, data){ res.status(status).setHeader("Content-Type", "application/json"); res.end(JSON.stringify(data)); }
export function soloPost(req, res){ if (req.method !== "POST"){ json(res, 405, { error: "POST only" }); return false; } return true; }
