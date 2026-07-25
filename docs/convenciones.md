# Convenciones del motor — medidas y encuentro de muros

## Medidas del ambiente (F11-bis.3)

El usuario ingresa **medidas EXTERIORES** del ambiente: de cara exterior de montante a cara exterior de
montante. Es lo que una persona mide con cinta en obra.

El motor deriva todo de ahí, en **un solo lugar** (`descomponer` en `src/engine/modules/combinado.mjs`):

- `largo_pasante` = medida exterior completa del muro pasante.
- `largo_encajado` = medida exterior − 2 × **espesor estructural del muro pasante** (`e`).
  - `e` = profundidad (Y) del frame: alma del PGU en steel, ancho real del tirante en wood. Se mide de
    la geometría real (`boundsEngine` de un muro, sin flejes), no se hardcodea.
- **Interior libre** = (largo − 2e) × (ancho − 2e). Se publica en `metadatos.interior` y se muestra en
  vivo junto a los inputs. Es el dato con el que el usuario compra y replantea.

Ningún módulo recalcula esta derivación: el orquestador la hace y pasa `largo` a cada muro.

## Pasante / encajado

- **Regla por defecto:** Frente y Fondo son **pasantes** (corren de punta a punta, `largo` = medida
  exterior en X); Lateral izq. y der. son **encajados** (`largo` = ancho − 2e, encajan entre los pasantes).
- `input.pasante = "laterales"` invierte la regla para todo el ambiente (los laterales pasan a pasantes).
- El módulo Muro individual recibe el rol como `input.rol: 'pasante' | 'encajado' | 'aislado'`
  (default `aislado` cuando se usa suelto). Un muro pasante/encajado **no dibuja sus montantes de
  extremo**: los reemplaza el poste de esquina.
- Las soleras (PGU) del muro encajado terminan en la **cara interior** del muro pasante
  (`largo_encajado` = ancho − 2e las hace terminar justo ahí). Nunca se interpenetran ni quedan al aire.

## Encuentro de esquina (y encuentro en T)

Solver único: `postesEsquina` en `src/engine/esquina.mjs`. Por cada encuentro genera **3 montantes en
contacto real**:

1. **Muro pasante:** montante extremo **doble** (dos perfiles, cajón), etiquetados `MONTANTE_ESQUINA`.
2. **Muro encajado:** montante de **arranque** apoyado contra el alma del doble, etiquetado
   `MONTANTE_ARRANQUE`.
3. Contacto cara a cara a 0 mm (el test AABB tolera 0 mm de contacto y falla sólo ante interpenetración
   real > 0,5 mm).

T1 de esquina: 4 esquinas × 2 uniones × `ceil(alto / 600)`, sumados al cómputo.

El **encuentro en T** (un tabique llega contra un muro) usa el MISMO solver `postesEsquina` (montante
doble en el receptor + arranque del tabique). Todavía no se expone en la UI, pero no es un caso aparte.
