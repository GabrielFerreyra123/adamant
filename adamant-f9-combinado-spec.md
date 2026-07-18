# ADAMANT — F9: Proyecto combinado Piso + 4 Muros ("Ambiente completo")

## Qué es

El primer módulo COMPUESTO: el usuario carga las medidas de un ambiente rectangular (quincho, habitación, taller) una sola vez, y Adamant genera la plataforma de piso + los 4 muros montados sobre ella, con lista de compra, cortes y PDF unificados. Es la promesa central del producto DIY: "armá tu quincho completo".

## Principio de arquitectura (no negociable)

El combinado NO reimplementa geometría. Es un módulo **orquestador** que:
1. Llama al módulo Piso con (largo, ancho, apoyo).
2. Llama 4 veces al módulo Muro (dos de largo `largo`, dos de largo `ancho` menos los espesores de encuentro, ver Esquinas), cada uno con sus vanos.
3. Transforma (traslada/rota/eleva) las piezas de cada submódulo a su posición en el ambiente.
4. Fusiona piezas[], materiales y cortes.

Si para lograrlo hace falta tocar los módulos piso/muro, el único cambio permitido es agregarles parámetros opcionales (ej. omitir un ítem, ajustar un largo) — nunca duplicar su lógica dentro del combinado. Los tests existentes de piso y muro deben seguir pasando sin modificación.

## Decisiones constructivas del MVP combinado

- **Planta rectangular** únicamente (L y formas compuestas quedan en backlog).
- **Montaje platform framing**: muros apoyan SOBRE la plataforma. Elevación de cada muro = altura del entramado de piso (+ placa de piso si está activada — decidir e documentar si el muro apoya sobre placa o sobre entramado; default recomendado: sobre placa).
- **Esquinas**: dos muros "pasantes" (los largos, van de punta a punta) y dos "encajados" (los cortos, largo = ancho − 2 × espesor de muro). En cada esquina, el muro encajado aporta el/los montante(s) de encuentro según la regla de esquina ya usada en el módulo muro (si el módulo muro no tiene regla de esquina, agregar la opción "extremo de encuentro" que suma un montante extra de esquina — documentar la regla elegida, estándar de 2 o 3 montantes por esquina).
- **Vanos por muro**: el wizard permite agregar puertas/ventanas a cada uno de los 4 muros identificados como Frente / Fondo / Lateral izquierdo / Lateral derecho.
- **Solera de implantación**: la maneja el módulo piso (input apoyo), como ya está. El combinado solo pasa el parámetro.
- **Cielorraso**: NO va en esta fase (se agrega como opción del combinado en una fase futura — anotar en TODO.md).

## Wizard del combinado (reemplaza los pasos 1-4 estándar para este tipo)

1. **Tipo**: "Ambiente completo (piso + muros)" aparece como opción en la grilla de tipos.
2. **Sistema y medidas**: steel/wood + largo, ancho, alto de muros (2,40–3,00 default 2,60) + apoyo (platea/pilotines) + toggle placa de piso.
3. **Aberturas**: selector visual de los 4 muros (esquema en planta con Frente/Fondo/Izq/Der) — tap en un muro abre el editor de vanos de ese muro (reusar el editor existente).
4. **Resultado**: mismos tabs (3D / Materiales / Cortes / PDF).

## 3D del combinado

- Piso + 4 muros ensamblados y parados en posición real. Verificación AABB global: bounding box = largo × ancho × (alto entramado piso + alto muro).
- Colores por tipo de pieza como siempre; agregar un selector "ver por partes" (Todo / Solo piso / Muro frente / ...) que muestre u oculte grupos — clave para que el usuario entienda el orden de montaje.
- Test de no-colisión AABB entre TODAS las piezas del combinado (tolerancia de contacto), en particular en las 4 esquinas y en el apoyo muro-piso.

## Materiales, cortes y PDF unificados

- **Materiales**: una sola lista agrupada por rubro (perfiles/maderas, placas, aislación, fijaciones, anclajes) sumando los 5 submódulos, con las cantidades convertidas a unidades de venta al FINAL de la fusión (no por submódulo: 4 medias barras sobrantes de 4 muros pueden compartirse — la optimización de cortes corre sobre el conjunto).
- **Cortes**: First-Fit global por tipo de perfil/escuadría con su barLen, agrupado en el PDF por etapa de montaje (1. Piso, 2. Muro frente, ...) para que el usuario corte por etapas si quiere, pero con el resumen de barras totales optimizado global. Mostrar ambos números si difieren (barras por etapa vs global) con nota "cortando todo junto ahorrás X barras".
- **PDF**: portada con isométrica del conjunto + planta acotada del ambiente + una página por etapa de montaje (piso, cada muro) con su esquema y sus cortes + lista de compra unificada al final.

## Tests mínimos (cantidades a mano)

- Ambiente 3×4×2,60 steel sin vanos: conteo total de piezas = suma exacta de (piso 3×4) + 2×(muro 4,00) + 2×(muro 3,00−2e), verificando el descuento de esquina.
- Mismo ambiente con 1 puerta en frente y 1 ventana en lateral.
- Mismo en wood.
- AABB global y no-colisión.
- Optimización global vs por etapa: caso armado donde compartir barras ahorre al menos 1 barra, verificando el número.

## Orden de trabajo

F9a: orquestador + fusión de piezas/materiales/cortes + tests (sin UI).
F9b: 3D ensamblado + selector "ver por partes".
F9c: wizard (selector de muros en planta) + PDF por etapas.

Una fase por vez, tests en verde, freno para revisión con captura entre fases.
