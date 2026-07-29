# Adamant — Deploy en Vercel (pared de pago Mercado Pago)

## Arquitectura
- **Gratis (cliente)**: wizard + 3D + materiales + **agregados de la optimización** (barras, ahorro, desperdicio).
- **Pago (servidor, /api)**: `/api/generar` (PDF de obra) y la **lista de cortes detallada** (`/api/cortes`)
  solo con licencia válida. La lista detallada **no viaja por la red** hasta que hay licencia.
- **Dos SKU** (`src/config/pricing.js`, fuente única): `proyecto` (uno, perpetuo) y `pase90` (ilimitados 90 días).
- **Licencias sin base de datos**: token HMAC firmado (`LICENSE_SECRET`), v2 `{ sku, exp, projectHash }`.
  Emitirlo requiere que `/api/canjear` verifique el pago aprobado **y el monto** contra la API de MP y `pricing.js`.
  Ver [`docs/pricing.md`](docs/pricing.md).

## Flujo del usuario
1. Diseña gratis → tab Cortes con el ahorro visible + lista difuminada; tab PDF con las dos tarjetas de compra.
2. `/api/crear-pago { sku }` crea la preferencia (precio = `pricing.js`) → redirect a Checkout Pro.
3. MP redirige de vuelta con `payment_id` → `/api/canjear` verifica y devuelve el token → localStorage.
   Se muestra el **código de acceso** para copiar/descargar (recuperación en otro navegador).
4. Los botones de PDF / cortes llaman `/api/generar` y `/api/cortes` con el token; con un pase, el backend
   devuelve además el token perpetuo del proyecto generado.

## Pasos de deploy
1. Repo en GitHub (el `.gitignore` ya excluye `.env`, `node_modules`, `.vercel`).
2. En vercel.com → Add New Project → importar el repo. Framework: **Vite** (auto). Build `vite build`, output `dist` (defaults).
3. Settings → Environment Variables (ver `.env.example`):
   - `MP_ACCESS_TOKEN` → el TEST-... para probar; el APP_USR-... para cobrar.
   - `LICENSE_SECRET` → generar: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - `APP_URL` → la URL final (https://tu-proyecto.vercel.app) — completar tras el primer deploy y redeploy.
   - (Los precios **no** son env: viven en `src/config/pricing.js`.)
4. Probar el ciclo completo con credenciales TEST y una [tarjeta de prueba](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/additional-content/your-integrations/test/cards) (APRO / 123 / fecha futura).
5. Cambiar `MP_ACCESS_TOKEN` al de producción → Redeploy. Listo para cobrar.

## Notas
- Si cambia `LICENSE_SECRET`, todas las licencias emitidas caducan.
- La licencia vive en el localStorage del navegador donde se pagó. Si se pierde, se recupera con el
  **código de acceso** o con el **N° de operación** de MP (pantalla "Ya compré" → `/api/recuperar`), sin
  reiniciar los días del pase.
- **Reembolsos: manuales**, dentro de los 7 días, desde el panel de Mercado Pago (Actividad → Devolver).
- Los precios se ajustan editando `base` en `src/config/pricing.js` (revisión trimestral por IPC; ver `docs/pricing.md`).
