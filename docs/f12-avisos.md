# F12 — Inventario de avisos con tono de derivación a terceros

Barrido de `src/` (F10, Parte C) buscando mensajes de validación con **"profesional", "consultá",
"verificar con", "revisá"** y similares. Este archivo es sólo el **inventario**: los mensajes NO se
modificaron todavía. F12 los reescribe con tono de autonomía (misma premisa DIY que el resto de la
app: la herramienta cuida la estructura, el usuario decide).

Convención de columnas: **archivo:línea** · **mensaje actual** · **cuándo se dispara**.

---

## 1. Arriostramiento — `src/engine/brace.mjs`

| Ubicación | Mensaje actual | Condición que lo dispara |
|---|---|---|
| `brace.mjs:43` (`cruzEnPlano`) | «Tramo angosto: ángulo de fleje N° fuera del rango recomendado 30–60°. **Consultar arriostramiento con un profesional.**» | El ángulo del fleje de la cruz supera `FLEJE.angMax` (60°) aun tras subdividir el paño → paño demasiado angosto respecto de la altura. Aplica a la cruz del **faldón del techo** (usa `cruzEnPlano`). |
| `brace.mjs:91` (`buildBraces`) | «Sin tramo lleno suficiente para arriostrar. **Consultar solución con un profesional.**» | No hay ningún tramo lleno ≥ `FLEJE.tramoMin` (400 mm) donde colocar la cruz (muro muy cargado de vanos). |
| `brace.mjs:103` (`buildBraces`) | «Tramo angosto: ángulo de fleje N° fuera del rango recomendado 30–60°. **Consultar arriostramiento con un profesional.**» | Ídem `:43` pero para la Cruz de San Andrés del **muro**: el ángulo supera 60° y no hay subdivisión que lo baje (paño angosto y alto). |

## 2. Techo — `src/engine/modules/techo.mjs`

| Ubicación | Mensaje actual | Condición que lo dispara |
|---|---|---|
| `techo.mjs:141` (`validarTecho`, aviso) | «Pendiente N %: por debajo del 25 % recomendado por manual. Es usual en chapa (mínimo 7 %), **verificá con el proveedor de chapa y un profesional.**» | Pendiente en `[7 %, 25 %)` — permitida pero por debajo del rango recomendado del manual. |
| `techo.mjs:144` (`validarTecho`, aviso) | «Pendiente N %: por encima del 100 % (45°) que cubre el manual. **Consultá el anclaje de la cubierta con un profesional.**» | Pendiente `> 100 %` (más de 45°). |
| `techo.mjs:287` (`generar`, aviso) | «Cabriadas no alineadas con montantes: **verificar transmisión de cargas con un profesional.**» | Sólo en **Ambiente completo**: `moduloMuro` presente y `separacion` de cabriadas ≠ modulación de montantes (in-line framing roto). |
| `techo.mjs:289` (`generar`, **nota fija**) | «Los anclajes del techo al muro resisten la succión del viento y deben dimensionarse **por cálculo profesional** según la zona. Bahía Blanca es una de las zonas de mayor viento del país.» | **Siempre** que hay techo (nota informativa, `metadatos.notas`, no depende de parámetros). |

## 3. Piso — `src/engine/modules/piso.mjs`

| Ubicación | Mensaje actual | Condición que lo dispara |
|---|---|---|
| `piso.mjs:100` (`validarVanoPiso`, aviso) | «Vano ancho: **verificar dimensionado de cabezales con un profesional** (N mm entre trimmers).» | Vano de escalera/trampa con `ancho > CABEZAL_LUZ_AVISO` (1200 mm) entre trimmers. |
| `piso.mjs:83` (`validarVanoPiso`, error) | «Vano inválido: **revisá** posición y medidas.» | El vano trae valores no finitos o `ancho`/`largo ≤ 0`. Tono self-directed (no deriva a tercero); revisar si entra en el alcance de F12. |

---

## Fuera del alcance de este inventario (no son mensajes de validación)

- `piso.mjs:9` — **comentario de código** «Luces máximas ORIENTATIVAS (verificar con profesional)». No se muestra al usuario.
- `src/export/pdf.mjs:245` y `:354` — pie del PDF. **Ya reescrito en F10** (dejó de decir «lo realiza un profesional habilitado»; ahora cita la norma y pide verificar medidas en obra).
- `index.html` (landing) y el copy del checkout — **ya reescritos en F10** con tono de autonomía.

## Nota para F12

El patrón a evitar es **derivar la decisión a un tercero** («consultá / verificá con un profesional»).
El reemplazo pedido es de **autonomía**: explicitar la regla constructiva que Adamant ya aplica y, si
hace falta, el dato concreto que el usuario tiene que mirar — sin mandar a buscar a alguien afuera.
La **nota fija de succión de viento del techo** (`techo.mjs:289`) es el caso más delicado: Bahía Blanca
es zona de viento fuerte, así que conviene conservar la información técnica (por qué importa el anclaje)
aunque se le quite el tono de derivación.
