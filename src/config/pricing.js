// ADAMANT · precios — FUENTE ÚNICA. Ningún precio hardcodeado en otro archivo (ni copy ni backend).
// Revisión trimestral por IPC: se actualiza SOLO `base` y los tres precios se derivan de ahí.
// Relación estructural: pase90 = 2 × base · proyecto = pase90_renov = base.
const base = 17400; // ← único número a tocar en cada revisión (redondear a $100 arriba)

export const PRICING = {
  moneda: "ARS",
  vigenteDesde: "2026-07-25",
  revisarCada: 90,            // días — ajustar por IPC acumulado
  base,
  skus: {
    proyecto:     { precio: base,     label: "Proyecto suelto" },
    pase90:       { precio: base * 2, label: "Pase de obra", dias: 90, destacado: true },
    pase90_renov: { precio: base,     label: "Renovar pase", dias: 90 }
  }
};

export const SKUS = Object.keys(PRICING.skus);
export const esSkuValido = sku => Object.prototype.hasOwnProperty.call(PRICING.skus, sku);
export const precioDe = sku => (esSkuValido(sku) ? PRICING.skus[sku].precio : null);
export const diasDe = sku => (esSkuValido(sku) ? PRICING.skus[sku].dias || 0 : 0);
// El monto de MP puede venir con centavos; validamos con tolerancia de $1.
export const montoCoincide = (sku, monto) => { const p = precioDe(sku); return p != null && Math.abs(Number(monto) - p) < 1; };
