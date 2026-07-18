// ADAMANT · backend compartido. Licencias SIN base de datos: token HMAC firmado con
// LICENSE_SECRET que embebe { pid (payment_id de MP), exp (vencimiento) }. Emitirlo requiere
// verificar el pago contra la API de Mercado Pago; validarlo es solo criptografía (stateless).
import { createHmac, timingSafeEqual } from "node:crypto";

const SECRET = () => {
  const s = process.env.LICENSE_SECRET;
  if (!s) throw new Error("Falta LICENSE_SECRET");
  return s;
};
const b64u = buf => Buffer.from(buf).toString("base64url");
const hmac = payload => createHmac("sha256", SECRET()).update(payload).digest();

export const DIAS_LICENCIA = 30;

export function firmarLicencia(paymentId){
  const payload = b64u(JSON.stringify({ pid: String(paymentId), exp: Date.now() + DIAS_LICENCIA * 864e5 }));
  return `${payload}.${b64u(hmac(payload))}`;
}

// → { ok, pid?, exp?, motivo? }
export function verificarLicencia(token){
  if (typeof token !== "string" || !token.includes(".")) return { ok: false, motivo: "token ausente" };
  const [payload, sig] = token.split(".");
  let esperada, dada;
  try { esperada = hmac(payload); dada = Buffer.from(sig, "base64url"); } catch { return { ok: false, motivo: "token corrupto" }; }
  if (dada.length !== esperada.length || !timingSafeEqual(dada, esperada)) return { ok: false, motivo: "firma inválida" };
  let data;
  try { data = JSON.parse(Buffer.from(payload, "base64url").toString()); } catch { return { ok: false, motivo: "token corrupto" }; }
  if (!data.exp || Date.now() > data.exp) return { ok: false, motivo: "licencia vencida" };
  return { ok: true, pid: data.pid, exp: data.exp };
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

// Helpers de handler (Vercel Node functions)
export function json(res, status, data){ res.status(status).setHeader("Content-Type", "application/json"); res.end(JSON.stringify(data)); }
export function soloPost(req, res){ if (req.method !== "POST"){ json(res, 405, { error: "POST only" }); return false; } return true; }
