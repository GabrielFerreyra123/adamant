// POST /api/cortes { input, token?, projectHash?, precios? }
// Muro de valor: la optimización corre SIEMPRE en el servidor y devuelve los AGREGADOS (barras totales,
// barras ahorradas, desperdicio antes/después, ahorro en $) sin licencia. La lista DETALLADA (qué corte
// sale de qué barra) sólo se devuelve con licencia válida — nunca viaja por la red hasta entonces.
import { computeProject, cutPlan, cutOpts } from "../src/engine/index.mjs";
import { verificarLicencia, perpetuoDesdePase, limpiarProy, json, soloPost } from "./_lib.mjs";

// Agregados a partir del plan de corte. Baseline "sin optimizar" = cortar cada largo por separado, sin
// mezclar largos distintos en una misma barra (lo que se hace a ojo). Optimizado = bin-packing First-Fit.
function agregar(plan, precios = {}){
  let barrasOpt = 0, barrasNaive = 0, usado = 0, capOpt = 0, capNaive = 0, ahorroPesos = 0;
  plan.forEach(pl => {
    if (pl.fleje) return; // el fleje viene en rollo, no entra en el ahorro de barras
    const largos = pl.bins.flatMap(b => b.items.map(it => it.largo));
    const bOpt = pl.bins.length;
    // Naive: por cada largo distinto, ceil(cantidad / piezas que entran en una barra).
    const porLargo = {};
    largos.forEach(l => { porLargo[l] = (porLargo[l] || 0) + 1; });
    let bNaive = 0;
    Object.keys(porLargo).forEach(l => { const cap = Math.max(1, Math.floor(pl.barLen / +l)); bNaive += Math.ceil(porLargo[l] / cap); });
    const uso = largos.reduce((s, l) => s + l, 0);
    barrasOpt += bOpt; barrasNaive += bNaive; usado += uso;
    capOpt += bOpt * pl.barLen; capNaive += bNaive * pl.barLen;
    const precio = Number(precios[`perf:${pl.perfil}`]) || 0;
    ahorroPesos += (bNaive - bOpt) * precio;
  });
  const pct = (u, c) => (c ? Math.round((1 - u / c) * 100) : 0);
  return {
    barrasOpt, barrasNaive, ahorroBarras: barrasNaive - barrasOpt,
    desperdicioOpt: pct(usado, capOpt), desperdicioNaive: pct(usado, capNaive),
    ahorroPesos: Math.round(ahorroPesos)
  };
}

export default async function handler(req, res){
  if (!soloPost(req, res)) return;
  const { input, token, projectHash, precios } = req.body || {};
  if (!input || typeof input !== "object") return json(res, 400, { error: "input requerido" });
  try {
    const { piezas } = computeProject(input);
    const plan = cutPlan(piezas, cutOpts(input));
    const agregados = agregar(plan, precios || {});
    const ph = limpiarProy(projectHash);
    const lic = token ? verificarLicencia(token, ph) : { ok: false };
    if (lic.ok){
      const perpetuo = perpetuoDesdePase(lic, ph);
      return json(res, 200, { licenciado: true, agregados, plan, perpetuo });
    }
    // Sin licencia: sólo agregados + un vistazo de 3 barras (para mostrar la FORMA, difuminada).
    const preview = [];
    for (const pl of plan){
      if (pl.fleje) continue;
      for (const b of pl.bins){ preview.push({ perfil: pl.perfil, items: b.items.map(it => ({ code: it.code, largo: it.largo, tipo: it.tipo })), rem: b.rem }); if (preview.length >= 3) break; }
      if (preview.length >= 3) break;
    }
    json(res, 200, { licenciado: false, agregados, preview, totalBarras: agregados.barrasOpt });
  } catch (e) {
    console.error("[cortes]", e);
    json(res, 500, { error: e.message });
  }
}
