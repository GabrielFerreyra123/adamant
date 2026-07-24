# Adamant · Diseñador de estructuras en seco

App web (Vite + JS vanilla + Three.js) para **diseñar estructuras de steel frame y wood frame en 3D**
sin saber usar programas de diseño: muros con aberturas, pisos, cielorrasos, techos de cabriadas y
ambientes completos. Calcula el cómputo de materiales, la lista de corte optimizada por barra
comercial, el presupuesto (con precios que carga el usuario) y arma un **PDF de obra**.

La raíz es la landing; la herramienta vive en `/app/`.

## Desarrollo

```bash
npm install
npm run dev        # servidor de desarrollo (Vite) — landing + /app/
npm run build      # build de producción a dist/
npm run preview    # sirve el build
npm test           # vitest
```

Las funciones serverless (`/api/*`, Mercado Pago + PDF) corren bajo `vite` en dev mediante un
middleware (ver `vite.config.js`); en producción son Vercel Functions.

## Validación antes de dar por terminado un cambio

```bash
npm test           # el motor y los generadores tienen cobertura de tests (vitest)
npm run build      # el bundle tiene que compilar limpio
```

Regla: cualquier cambio en el motor (`src/engine/`) se valida con los tests correspondientes en
`test/`. La geometría es la única fuente de verdad; cortes y materiales se derivan de las piezas.

## Desarrollo con Claude Code

El archivo **`CLAUDE.md`** tiene el contexto (arquitectura, preferencias, conocimiento técnico
steel/wood, estado de features y limitaciones). Claude Code lo lee automáticamente.

## Requisitos

- Node.js 18+.

## Estructura

```
index.html            Landing (raíz)
app/index.html        Punto de entrada de la app
src/engine/           Motor puro (módulos, geometría, cortes) — sin DOM ni Three
src/viewer/           Visor 3D (Three.js) + paleta
src/ui/               Wizard, licencia, precios
src/export/pdf.mjs    PDF de obra
src/landing/          Landing (CSS/JS propios)
api/                  Vercel Functions (Mercado Pago + PDF)
test/                 Tests (vitest)
```
