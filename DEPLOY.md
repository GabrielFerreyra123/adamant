# Adamant — Deploy en Vercel (pared de pago Mercado Pago)

## Arquitectura
- **Gratis (cliente)**: wizard + 3D + materiales. Los generadores de PDF y Ruby **no viajan en el bundle**.
- **Pago (servidor, /api)**: `/api/generar` produce el PDF y el script Ruby solo con licencia válida.
- **Licencias sin base de datos**: token HMAC firmado (`LICENSE_SECRET`) con `payment_id` + vencimiento a 30 días.
  Emitirlo requiere que `/api/canjear` verifique el pago aprobado contra la API de Mercado Pago.

## Flujo del usuario
1. Diseña gratis → pestaña Cortes borrosa + pestaña PDF con botón "Desbloquear con Mercado Pago".
2. `/api/crear-pago` crea la preferencia (precio = env `PRECIO_PROYECTO`) → redirect a Checkout Pro.
3. MP redirige de vuelta con `payment_id` → `/api/canjear` verifica y devuelve el token → localStorage.
4. Botones de PDF / Ruby llaman `/api/generar` con el token (el PDF incluye el snapshot 3D capturado en el cliente y los precios cargados).

## Pasos de deploy
1. Repo en GitHub (el `.gitignore` ya excluye `.env`, `node_modules`, `.vercel`).
2. En vercel.com → Add New Project → importar el repo. Framework: **Vite** (auto). Build `vite build`, output `dist` (defaults).
3. Settings → Environment Variables (ver `.env.example`):
   - `MP_ACCESS_TOKEN` → el TEST-... para probar; el APP_USR-... para cobrar.
   - `LICENSE_SECRET` → generar: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - `PRECIO_PROYECTO` → en ARS (default 20000).
   - `APP_URL` → la URL final (https://tu-proyecto.vercel.app) — completar tras el primer deploy y redeploy.
4. Probar el ciclo completo con credenciales TEST y una [tarjeta de prueba](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/additional-content/your-integrations/test/cards) (APRO / 123 / fecha futura).
5. Cambiar `MP_ACCESS_TOKEN` al de producción → Redeploy. Listo para cobrar.

## Notas
- Si cambia `LICENSE_SECRET`, todas las licencias emitidas caducan.
- La licencia vive en el localStorage del navegador donde se pagó. Si el cliente la pierde (otro dispositivo,
  borrado de datos), se re-emite canjeando de nuevo el mismo `payment_id` (pedirle el nº de operación de MP).
- Próxima mejora si hay volumen: guardar licencias en una DB (Turso/Vercel KV) para atarlas a un email
  y evitar reuso compartido del payment_id.
