// ADAMANT · emisión MANUAL de un código de licencia (para pago por transferencia en los primeros
// usuarios). Genera el mismo token HMAC que /api/canjear, sin pasar por Mercado Pago. Correr con el
// MISMO LICENSE_SECRET que está en Vercel (si no, el código no valida en producción).
//
// Uso:
//   LICENSE_SECRET=xxxx node scripts/emitir-codigo.mjs pase90
//   LICENSE_SECRET=xxxx node scripts/emitir-codigo.mjs proyecto <projectHash>
//   (PowerShell)  $env:LICENSE_SECRET="xxxx"; node scripts/emitir-codigo.mjs proyecto abc123
//
// - pase90 / pase90_renov: sirve para CUALQUIER proyecto de ese navegador, 90 días. No necesita hash.
// - proyecto: perpetuo, atado al `projectHash` que te pasa el comprador (lo ve en la pantalla de compra,
//   "Tu código de proyecto"). Sin ese hash no se puede emitir un `proyecto`.
//
// El comprador pega el código en "Ya compré → Pegar código de acceso".
import { firmarLicencia } from "../api/_lib.mjs";

const [, , sku, projectHash] = process.argv;
if (!sku){
  console.error("Uso: node scripts/emitir-codigo.mjs <pase90|proyecto|pase90_renov> [projectHash]");
  process.exit(1);
}
try {
  const token = firmarLicencia({ sku, projectHash: sku === "proyecto" ? projectHash : null, orderId: "manual-" + Date.now() });
  console.log(`\nSKU: ${sku}${projectHash ? `  ·  projectHash: ${projectHash}` : ""}`);
  console.log("\n── Código para mandar por WhatsApp ──\n");
  console.log(token);
  console.log('\nEl comprador lo pega en "Ya compré → Pegar código de acceso".\n');
} catch (e) {
  console.error("Error:", e.message);
  console.error("(¿falta LICENSE_SECRET? ¿un `proyecto` sin projectHash?)");
  process.exit(1);
}
