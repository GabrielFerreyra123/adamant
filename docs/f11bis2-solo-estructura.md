# F11-bis.2 — Adamant = solo estructura (eliminación de revestimientos y aislación)

**Decisión de producto DEFINITIVA**, al mismo nivel que la Fase C descartada. **No reintroducir.**

Adamant calcula y dibuja **estructura**: perfilería, vanos, dinteles, arriostramiento, cortes, apoyos
de fundación y la placa de piso (diafragma estructural). Nada más.

## Qué se eliminó (borrado, no detrás de un flag)

- **Composición de capas / revestimientos** por cara (sistemas de terminación, edición capa por capa,
  corte vivo, slider de despiece, composiciones guardadas). Se borró `src/engine/capas.mjs` y toda su UI.
- **Geometría de superficies de revestimiento** en el visor (`_revGeo`, Shape + holes con recorte de
  vanos) y el revestimiento del Ambiente completo (`revPieza`, `REV.EXT`/`REV.INT`).
- **Aislación** (lana de vidrio, espesores, aislación acústica).
- **Membranas y barreras** (hidrófuga, barrera de vapor, film, rastrel, cámara de aire) — incluida la
  membrana bajo chapa del Techo.
- **Terminaciones** (siding cementicio/vinílico, revoque, chapa como terminación, placa de yeso
  estándar/verde/roja/doble, OSB/fenólico **como revestimiento**).
- **Tabla `REVEST`** (kg/m²) y todo cálculo que la usaba.
- **Cómputo de m² de revestimiento y placas**, e **inputs de precio** de placas/membranas/aislación.
- **Tornillos T2** (mecha y con alas). Queda sólo la familia **T1** (unión de perfiles); su conteo
  nunca dependió de superficies de placa.

## Qué se conserva

- **Placa de piso (diafragma estructural), 18 mm**: es estructura, no revestimiento. Sigue en el módulo
  Piso, suma al cómputo y define la cota de apoyo de los muros en Ambiente (elevación = entramado + 18 mm).
  Renombrada a **«Placa de piso (diafragma estructural)»**.
- **Apoyos** (platea / pilotines).
- **Tipo de muro** (exterior / interior portante / tabique): es una decisión de **perfilería** (el
  tabique usa perfilería liviana 0,52 mm a barras de 2,60/3,00 m, sin arriostramiento), no de revestimiento.
- Perfilería, vanos, dinteles, arriostramiento, cortes, AABB y la conversión de ejes motor→Three.js.

## Backlog DESCARTADO definitivamente

- ~~Despiece real de revestimientos (medida comercial 1,20 × 2,40, desperdicio, recorte por vano)~~ —
  **descartado**. Adamant no computa placas.
- ~~Composición de capas por sistema / aislación / barrera de vapor~~ — **descartado**.

## Migración

Las claves de localStorage viejas (precios de placas/membranas/aislación, `adamant_composiciones`) se
**ignoran** silenciosamente: `getPrice` devuelve 0 para claves sin fila, y las composiciones guardadas
ya no se leen. No hay que borrarlas ni migrarlas.
