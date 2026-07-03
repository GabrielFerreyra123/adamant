# Adamant · Generador de scripts Steel/Wood Frame

App HTML de una página que **genera scripts Ruby** para pegar en la Consola Ruby de SketchUp 2026
y dibujar estructuras de **steel frame** o **wood frame** (muros, cielorrasos, casas completas),
con cómputo de materiales, lista de corte, presupuesto y optimizador de corte.

Todo el código está en un único archivo: `adamant-generador-scripts.html`.

## Abrir la app

Opción A — doble clic en `adamant-generador-scripts.html` (se abre en el navegador).

Opción B — servidor local (útil para que la carga de imagen por IA funcione mejor):

```bash
npm run serve      # http://localhost:5173
```

## Usar en SketchUp

1. Window → Model Info → Units → **milímetros**.
2. Extensions → Developer → Ruby Console.
3. Copiar el código que muestra la app, pegar en la barra inferior → Enter.

## Desarrollo con Claude Code

El archivo **`CLAUDE.md`** tiene todo el contexto (arquitectura, preferencias, conocimiento
técnico steel/wood, estado de features y limitaciones). Claude Code lo lee automáticamente.

Antes de dar por terminado cualquier cambio, validar:

```bash
npm run validate
```

Esto: (1) corre `node --check` sobre el JS embebido, (2) genera scripts `.rb` de muestra y
(3) si tenés **ruby** instalado, hace `ruby -c` y los ejecuta contra un stub de la API de
SketchUp (`tools/su_stub.rb`) para detectar errores de runtime sin abrir SketchUp.

- `npm run gen` — sólo regenera los `.rb` de muestra en `tools/out/`.
- Instalar ruby (opcional, recomendado): `sudo apt install ruby` / `brew install ruby`.

## Requisitos

- Node.js (para validar; no hace falta build ni dependencias — no hay `node_modules`).
- Ruby (opcional, para el test completo del Ruby generado).
- SketchUp 2026 para usar los scripts.

## Estructura

```
adamant-generador-scripts.html   App completa
CLAUDE.md                        Contexto para Claude Code
README.md                        Este archivo
package.json                     Scripts npm
tools/su_stub.rb                 Stub de SketchUp para testear el Ruby generado
tools/validate.js                Pipeline de validación
tools/gen-samples.js             Genera .rb de muestra
```
