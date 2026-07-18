# ADAMANT — Pivot a producto DIY (spec para Claude Code)

## Contexto del proyecto existente

Este repo contiene el **Adamant Steel Frame Script Generator**: una single-page HTML app (paleta Ocean Obsidian / Teal Tide / Tangerine Tango; tipografías Space Grotesk / Barlow Condensed / JetBrains Mono) que genera scripts Ruby para la consola de SketchUp 2026 y dibuja estructuras de steel frame. Hay tres módulos funcionando: **Muro/Tabique**, **Cielorraso suspendido** y **Casa Completa** con cómputo de materiales en vivo.

Antes de escribir código: leé el código existente del módulo Muro/Tabique y del cómputo de materiales. Toda la lógica geométrica (montantes, soleras, separaciones, cálculo de cantidades) se **porta**, no se reescribe desde cero.

## El pivot (leer con atención, esto redefine el producto)

Adamant deja de ser un generador de scripts para usuarios de SketchUp y pasa a ser una **web app para gente común que quiere autoconstruir en steel frame o wood frame** (un quincho, una habitación, una ampliación, un tabique). El profesional sigue siendo usuario, pero el diseño se hace para el autoconstructor: si él puede usarlo, el profesional también.

Consecuencias de diseño:

1. **SketchUp sale del camino crítico.** El usuario nunca ve Ruby ni necesita SketchUp. La visualización pasa a ser 3D en el navegador con **Three.js**. "Exportar script para SketchUp" queda como botón secundario en un modo avanzado (reutiliza el generador Ruby actual, no se tira nada).
2. **El motor se vuelve agnóstico del material.** Una sola lógica de entramado parametrizada por sistema:
   - `steel`: perfiles PGC/PGU (montante/solera), separaciones 400/600 mm, tornillería.
   - `wood`: escuadrías 2x4 / 2x6 (38x89 / 38x140 mm), mismas separaciones, clavos/tirafondos.
   La geometría de montantes, soleras, y vanos (King, Jack, Dintel, Cripples, Solera de vano) es idéntica en ambos sistemas; solo cambian secciones, nombres comerciales y fijaciones.
3. **Wizard, no formulario técnico.** El usuario responde preguntas simples en pasos; los defaults técnicos (separación, tipo de perfil/escuadría) vienen pre-elegidos con opción "avanzado" colapsada.
4. **Salida orientada al corralón:** lista de compra en unidades de venta reales (perfiles de 6 m, tiras de 3,05 m, placas de 1,20x2,40, paquetes de tornillos), no en metros lineales abstractos.

## Alcance del MVP (solo esto — no construir nada fuera de esta lista)

Un único flujo: **Muro/Tabique con vanos**, ambos sistemas (steel/wood).

Fuera de alcance del MVP (no tocar): casa completa, cielorraso, cabreadas/techo, Cruz de San Andrés, cuentas de usuario, pagos, backend. Todo corre client-side.

### Wizard (4 pasos)

1. **Sistema y proyecto**: toggle Steel frame / Wood frame + tipo ("Tabique interior" / "Muro exterior") — el tipo define defaults (placa de yeso vs OSB+placa cementicia, con/sin aislación).
2. **Medidas**: largo y alto del muro (inputs grandes, en metros, validación de rangos razonables 0,5–12 m largo, 2–3,5 m alto).
3. **Aberturas**: agregar 0..N vanos (puerta/ventana) con ancho, alto y posición (slider sobre una vista frontal esquemática del muro). Cada vano genera King, Jack, Dintel, Cripples y Solera de vano en el motor.
4. **Resultado** (una sola pantalla con tabs):
   - **3D**: visor Three.js navegable (orbit/zoom/pan), cada tipo de pieza con color distinto y leyenda; tap sobre una pieza muestra nombre y dimensión.
   - **Materiales**: lista de compra agrupada (perfiles/maderas, placas, aislación, fijaciones) en unidades de venta, con cantidad y campo de precio unitario editable → total. Precios persisten en `localStorage`.
   - **Cortes**: lista de cortes por pieza (etiqueta, cantidad, largo de corte, de qué barra/tira sale) con optimización simple de aprovechamiento por barra de 6 m (steel) o tirante de 3,05 m (wood).
   - **Descargar PDF**: un solo PDF con resumen del proyecto, imagen del 3D, lista de compra, lista de cortes y esquema frontal acotado del muro. Generar client-side (jsPDF o similar por CDN).
   - Botón secundario "Exportar para SketchUp (.rb)" que reutiliza el generador Ruby existente.

## Stack y estructura

- Migrar de HTML único a proyecto **Vite + vanilla JS** (sin React ni frameworks). Módulos ES:
  - `src/engine/` — motor de entramado puro (sin DOM): `frame.js` (geometría), `materials.js` (cómputo y unidades de venta), `cuts.js` (despiece), `systems.js` (parámetros steel/wood).
  - `src/viewer/` — Three.js.
  - `src/ui/` — wizard y pantalla de resultado.
  - `src/export/` — `pdf.js` y `ruby.js` (portar generador actual).
- El motor debe ser **testeable**: funciones puras que reciben `{sistema, largo, alto, vanos[], opciones}` y devuelven `{piezas[], materiales[], cortes[]}`. Agregar tests con Vitest para: muro sin vanos, muro con 1 puerta, muro con 2 vanos, ambos sistemas (mínimo 8 casos con cantidades esperadas calculadas a mano).
- Mobile-first: el autoconstructor está en el corralón o en la obra con el celular. Probar todo a 390 px de ancho.
- Mantener identidad visual actual: paleta Ocean Obsidian / Teal Tide / Tangerine Tango y las tres tipografías.
- Sin backend, sin claves, sin analytics en el MVP. Deploy estático (el `dist/` debe funcionar en cualquier hosting).

## Orden de trabajo (una fase por vez, validar antes de seguir)

1. **F1 — Motor JS**: portar la geometría del módulo Muro/Tabique de Ruby a `src/engine/`, parametrizada steel/wood, con lógica de vanos completa (King/Jack/Dintel/Cripples/Solera de vano). Entregar con los tests pasando. Sin UI todavía.
2. **F2 — Visor 3D**: render del resultado del motor en Three.js con colores por tipo de pieza, leyenda y selección táctil.
3. **F3 — Wizard**: los 4 pasos, mobile-first, con defaults y modo avanzado colapsado.
4. **F4 — Materiales, cortes y presupuesto**: tabs de resultado con unidades de venta, precios editables persistidos y optimización de cortes.
5. **F5 — Exportables**: PDF completo y export Ruby reutilizando el generador existente.

Al terminar cada fase: correr los tests, verificar en viewport móvil, y frenar para revisión antes de la fase siguiente.

## Criterios de aceptación del MVP

- Un usuario sin conocimientos técnicos arma un tabique de 3x2,6 m con una puerta en menos de 2 minutos y descarga el PDF.
- Las cantidades de materiales coinciden con el cálculo manual en los 8 casos de test.
- El toggle steel/wood recalcula todo (piezas, materiales, cortes, precios) sin recargar.
- El PDF se genera en el celular y es legible impreso en A4.
- El export Ruby produce un script que corre sin errores en la consola de SketchUp 2026 (paridad con el generador actual).
