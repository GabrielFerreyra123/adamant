// Config de Vite. Sólo agrega un middleware de DESARROLLO que monta las funciones de `api/`
// (en producción las sirve Vercel). Sin esto, `npm run dev` no puede probar la pared de pago.
// Lee las variables de `.env.local` (LICENSE_SECRET, MP_ACCESS_TOKEN, PRECIO_PROYECTO, APP_URL).
import { defineConfig, loadEnv } from "vite";
import { resolve } from "node:path";

function apiDev(env){
  return {
    name: "adamant-api-dev",
    apply: "serve",
    configureServer(server){
      Object.assign(process.env, env);
      server.middlewares.use("/api", async (req, res, next) => {
        const ruta = (req.url || "").split("?")[0].replace(/^\/|\/$/g, "");
        if (!ruta || ruta.startsWith("_")) return next();
        // shim de la firma de Vercel (req.body ya parseado · res.status().setHeader().end())
        res.status = c => { res.statusCode = c; return res; };
        req.body = await new Promise(ok => {
          const trozos = [];
          req.on("data", d => trozos.push(d));
          req.on("end", () => { try { ok(JSON.parse(Buffer.concat(trozos).toString() || "{}")); } catch { ok({}); } });
        });
        try {
          const mod = await server.ssrLoadModule(`/api/${ruta}.mjs`);
          await mod.default(req, res);
        } catch (e) {
          console.error(`[api dev] ${ruta}:`, e);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: e.message }));
        }
      });
    }
  };
}

// Multi-page: la raíz es la landing (estática, sin JS) y la herramienta vive en /app/.
export default defineConfig(({ mode }) => ({
  plugins: [apiDev(loadEnv(mode, process.cwd(), ""))],
  build: {
    rollupOptions: {
      input: {
        landing: resolve(process.cwd(), "index.html"),
        app: resolve(process.cwd(), "app/index.html")
      }
    }
  }
}));
