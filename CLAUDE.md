# Adamant · Generador de scripts Steel/Wood Frame

App HTML de una sola página que **genera scripts Ruby** para pegar en la Consola Ruby de
SketchUp 2026 (Extensions → Developer → Ruby Console). Al correr el script, dibuja la
estructura (steel frame o wood frame) dentro de SketchUp y calcula el cómputo de materiales.
Objetivo: modelar muros, cielorrasos y casas completas + su presupuesto sin saber usar SketchUp.

Todo el código vive en un único archivo: **`adamant-generador-scripts.html`** (HTML + CSS + JS
embebidos). No hay build ni dependencias; se abre directo en el navegador.

Contexto del usuario (Gaby): negocio de construcción Adamant (steel frame + perfilería de
aluminio con PVC para cielorrasos). Tiene SketchUp 2026 + V-Ray de escritorio.

---

## Cómo trabajar (preferencias — respetar siempre)

- Respuestas concisas, sin preámbulos ni resúmenes largos, sin adulación ("excelente", "perfecto").
- Soluciones mínimas, sin abstracciones prematuras. No narrar planes antes de ejecutar.
- **Edición puntual** sobre lo existente (str_replace / ediciones chicas). No reescribir de más
  ni duplicar código ya editado.
- **Validar antes de decir "listo"** (ver sección Validación).
- Si hay una objeción, decirla en 1 oración y proceder.
- El HTML es un archivo grande: al editar, buscar el bloque exacto y reemplazar sólo eso.

## Marca (usar en todo lo visual)

- Paleta: Ocean Obsidian `#0A1A22` (fondo), Teal Tide `#1BB6A4`, Tangerine Tango `#E85D2A`.
- Tipografías: Space Grotesk (texto), Barlow Condensed (títulos), JetBrains Mono (código).
- Variables CSS ya definidas en el `<style>`: `--teal`, `--tangerine`, `--panel`, `--line`, `--muted`, etc.

---

## Validación (obligatoria antes de "listo")

```bash
npm run validate      # 1) extrae el <script>, node --check (sintaxis JS)
                      # 2) evalúa los generadores y produce .rb de muestra
                      # 3) si hay ruby instalado: ruby -c + ejecución contra el stub de SketchUp
```

- `tools/su_stub.rb` es un **stub mínimo de la API de SketchUp** (Geom, Entities, Group,
  Transformation.axes/scaling/rotation, materials, add_text…). Permite ejecutar el Ruby generado
  fuera de SketchUp y contar piezas / detectar errores de runtime.
- `tools/validate.js` hace todo el pipeline. `npm run gen` sólo regenera los `.rb` de muestra en `tools/out/`.
- Regla: **cualquier cambio al JS que genera Ruby se valida generando el Ruby y corriéndolo contra el stub**
  (steel y wood, y para Casa los 4 tipos de techo). Si `ruby` no está instalado, al menos `node --check`.

---

## Flujo de uso en SketchUp

1. Unidades en **milímetros** (Window → Model Info → Units).
2. Extensions → Developer → Ruby Console.
3. Copiar el código de la app, pegar en la barra inferior → Enter.
4. Aparece la estructura; cada perfil es un grupo en su capa/tag. Al final se hace `.explode`
   del contenedor para que las piezas queden sueltas y editables (salvo con etiquetado activo,
   que las deja como grupos nombrados).

---

## Arquitectura del Ruby generado

**Helper central** (constante `HELPER`, compartido por todos los módulos):

```ruby
_profile(parent, pts2d, mapper, dist, axis, origin, mat, tag, xf=nil)
```
Crea un grupo, `add_face` de la sección 2D, `pushpull(dist.mm)`, corrige la dirección si el
`bounds.min` del eje quedó negativo, traslada a `origin` (mm) y luego aplica la transformación
opcional `xf` (para rotar/ubicar el muro en planta). Si `ETIQUETAS` está activo, nombra la pieza
(M-01, K-01…) y agrega texto 3D.

**Mappers** (cómo se extruye la sección 2D):
- `MAP_YZ` → sección en Y-Z, extruye en X.
- `MAP_XZ` → sección en X-Z, extruye en Y.
- `MAP_XY` → sección en X-Y, extruye en Z (montantes/studs verticales).

**Helpers adicionales** (definidos en el script de Casa):
- `_T(x,y,z)` → traslación en mm. `ROTZ90` → rotación 90° en Z (para muros que corren en Y).
- `_beam3d(we, p0, p1, sec, mat, tag)` → perfil recto entre dos puntos 3D (cordones inclinados,
  limatesas, vigas, correas). Alinea el eje X local del perfil con el vector p0→p1 vía
  `Geom::Transformation.axes`.
- `_csec` / `_usec` → sección C/U (steel) **o rectángulo sólido** (wood) según `SIS`.
- `_wall(we, larg, xf, vanos)` → un muro completo corriendo en X local; `xf` lo ubica en planta.
  Dibuja soleras (simple steel / **doble en madera** = double top plate), montantes en la
  modulación (salteando vanos) y por cada vano: King, Jack, Dintel, Cripples, solera/durmiente de vano.
- `_corner(we, x, y, sx, sy)` → poste de esquina multi-montante (L de 2 piezas), `sx/sy` = cuadrante interior.
- `_brace(we, larg, xf, vanos)` → Cruz de San Andrés (fleje 30×0.5) en paños sin vano.
- `_plate(we, larg, xf, lado, esp, mat)` → placa de revestimiento (`:ext`/`:int`) sobre la cara del muro.

**Convenciones de coordenadas**
- Muro canónico: corre en X∈[0,larg], espesor en Y∈[0,a] (a = alma PGU steel / ancho de la pieza wood),
  altura en Z∈[0,ALTURA]. Se dibuja siempre así y `xf` lo lleva a su posición/orientación real.
- Muros que corren en Y (laterales): `xf = _T(...)*ROTZ90`.
- Steel: el PGC **encastra dentro** del PGU → `hmon = ALTURA − 2·PGU_ESP`, montante desde `z=PGU_ESP`.
- Wood: studs **entre** plates → `hmon = ALTURA − 3·WOOD_ESP` (solera inferior + double top plate),
  montante desde `z=WOOD_ESP`.

**Capas (tags)**: `Estructura-Soleras`, `Estructura-Montantes`, `Estructura-Vanos`,
`Estructura-Techo`, `Estructura-Entrepiso`, `Estructura-Arriostres`, `Revestimientos`, `Hormigon`.

---

## Generadores JS (dónde tocar)

Todo dentro del `<script>` del HTML.

**Tablas de datos**: `PGC`, `PGU` (perfiles IRAM Barbieri, kg/m), `REVEST` (kg/m² revestimientos),
`LUMBER` (escuadrías 2x, mm reales), `WOOD_DENS`, `PGO_KG`. Helpers `lumberKg()`, `wallThk(p)`.

**Módulos**:
- `scriptMuro(p)` — Muro/Tabique. Sensible al sistema (steel C/U simple · wood sólido + double top).
- `scriptCielo(p)` — Cielorraso suspendido (sólo steel/aluminio; es la línea PVC de Gaby).
- `scriptCasa(p)` — Casa completa. Es el módulo grande.

**Casa — pipeline de planta**:
- `roomWalls(r, alma)` → 4 muros de una habitación con sus vanos en coords locales.
- `planWalls(p)` → convierte habitaciones (posX/posY) en segmentos absolutos y **fusiona muros
  compartidos colineales** (un solo paño, no doble). `planBBox(p)` → bounding box de la planta.
- `computeCasa(p)` → cómputo (metros, peso, m², techo, entrepiso, platea, volumen madera). Wood-aware.
- `techoRuby(p,bb)` → Ruby del techo por tipo: **Dos aguas / Una agua / Plano / Cuatro aguas**
  (cabriadas + pendolón/webs + correas; cuatro aguas con cumbrera + 4 limatesas).
- `entrepisoRuby(p,bb)` → cenefas PGU + vigas PGC + rigidizadores.
- `cutList(p)` → lista de corte por pieza, agrupada por tipo+perfil+largo con código (M1, K1, D1…).
- `optimizeCuts(byProfile, barLen)` → bin-packing First-Fit sobre barras comerciales (6 m).
- `presupuesto(p,c,cl)` / `precios` (localStorage) / `exportCSV(p,c,cl)` → negocio.

**UI**: `renderForm()` (Muro/Cielo, con selector de sistema en Muro), `renderCasaForm()`,
`renderRooms()` (habitaciones + vanos), `genCasa()` (arma script + panel de cómputo/corte/presupuesto).
`onImageUpload()` → sube un boceto/plano y llama a la API de Claude (visión) para inferir las
habitaciones en JSON (modelo `claude-sonnet-4-6`; requiere sesión de Claude).

---

## Estado actual de features

**Muro**: steel + wood. **Cielorraso**: steel/aluminio.
**Casa** (steel + wood):
- Habitaciones con posición en planta (posX/posY); ensamblado real con **muros compartidos fusionados**.
- **Vanos** por muro: Puerta, Puerta balcón, Ventana, Abertura, Arcada → King, Jack, Dintel
  (2 PGC+1 PGU steel / built-up 2 piezas wood), Cripples sup/inf, solera/durmiente de vano,
  corte de solera inferior en umbrales.
- **Esquinas** multi-montante. **Cruz de San Andrés**. **Placas** de revestimiento (capa Revestimientos).
- **Techo** 4 tipos + correas. **Entrepiso**. **Platea** de hormigón.
- **Wood framing**: secciones sólidas (2x3…2x12), double top plate, dintel built-up, volumen m³, peso Douglas Fir.
- **Boceto/plano → estructura** con IA (visión).
- **Lista de corte** por pieza, **presupuestador** con precios en localStorage, **CSV**, **optimizador de corte**,
  **etiquetado 3D** (M-01/K-01… + texto, piezas quedan como grupos nombrados).

---

## Conocimiento técnico

### Steel frame (IRAM-IAS U 500-205 · Barbieri / ConsulSteel)
- **PGC** (C, montante): ala 40, labio 15. Almas 90/100/140/150/200/250 × esp 0,9/1,25/1,6/2,0.
- **PGU** (U, solera): ala 35, sin labio. Alma ≈ PGC +2 (el PGC encastra dentro; 100→102).
- **PGO** (Omega): 37/22/12,5 — correas y cielorrasos.
- Armado: el PGC encastra dentro del PGU (extremo contra el alma). Modulación estándar 400 mm.
- Vano: solera sup/inf (PGU), montante (PGC), King (montante completo lateral), Jack (corto, sostiene
  dintel), Dintel (2 PGC + 1 PGU), Cripple sup/inf, solera de vano (PGU) largo = ancho + 200 mm.
- Arriostre: Cruz de San Andrés (fleje 30×0,5, atornillado sólo en extremos) o placa OSB/fenólico ≥12 mm.
- Tornillos: T1 hexagonal (estructural), T1 mecha (recibe placa), T2 punta mecha (yeso), T2 con alas (cementicia/OSB/siding).
- Revest kg/m²: yeso 9,5→7 / 12,5→8,9 / 15→10,7 · cementicia 8→13,19 / 12→15,97 · OSB/fenólico 10→7 · siding 12→13,91 · PVC ≈3,5.
- Entrepiso: cenefas PGU + vigas PGC + rigidizador de alma en apoyos. Cabriada: cordones sup/inf + arriostres + correas + Cruz de San Andrés.

### Wood framing (manuales cargados: EWP, entramado ligero, estándares, BIM)
- Escuadrías 2x reales (mm): 2x4=38×89, 2x6=38×140, 2x8=38×184, 2x10=38×235, 2x12=38×286. Douglas Fir ~480 kg/m³.
- Modulación 16"/24" O.C. (406/610 mm). **Double top plate** (solera superior doble) + sole plate simple.
- Studs, king/jack studs, cripples, header (dintel built-up: 2 piezas o LVL), sill plate.
- EWP: LVL (vigas/dinteles), PSL (columnas), LSL (dinteles/rim), Glulam (vigas/curvos), I-Joist (viguetas).
- Sheathing OSB/plywood = muro de corte (shear wall), clavado perimetral. Load path continuo hasta fundación.
- Conectores (Simpson): hold-downs, anchor bolts, straps — no modelados aún.

> Descargo: el cómputo es estimación de costos; el cálculo estructural, arriostres y anclajes los
> define un profesional habilitado. Mantener este descargo en la UI.

---

## Limitaciones conocidas / roadmap

- Arcada = dintel recto (sin arco curvo real).
- Etiquetado 3D matchea por **tipo/prefijo**, no 1:1 por fila de la lista de corte (para exacto: emparejar por largo).
- Optimizador de corte: no descuenta ancho de sierra ni resuelve empalmes de piezas > barra.
- Placas de revestimiento: paño completo, no descuentan vanos.
- Cuatro aguas: sin cabios secundarios (jack rafters) ni correas en faldones de las puntas.
- Cruz de San Andrés: se omite en paños con vano.
- Esquina: aproximación (no arma el poste de 3 montantes exacto de ConsulSteel).
- Sin conectores/herrajes (hold-downs, anchor bolts).
- Cielorraso todavía no tiene variante wood.
- Herramientas externas sugeridas para el flujo (uso, no desarrollo): Profile Builder 4, OpenCutList.

---

## Mapa de archivos

```
adamant-generador-scripts.html   App completa (editar acá)
CLAUDE.md                        Este archivo
README.md                        Setup humano
package.json                     Scripts npm (validate / gen / serve)
tools/su_stub.rb                 Stub de la API de SketchUp para testear el Ruby generado
tools/validate.js                Pipeline de validación (node --check + genera .rb + ruby -c + run)
tools/gen-samples.js             Genera .rb de muestra en tools/out/
tools/out/                       Salida de muestras (git-ignored)
```
