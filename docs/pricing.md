# Modelo de pago (F16)

Dos SKU visibles, uno recomendado. **Sin suscripción, sin tarjeta en garantía, sin débito automático.**

| SKU | Precio | Habilita | Vigencia |
|---|---|---|---|
| `proyecto` | base | Un proyecto, ediciones y re-exportaciones ilimitadas | Perpetuo |
| `pase90` (recomendado) | 2 × base | Proyectos ilimitados | 90 días desde la compra |
| `pase90_renov` | base | Renovación del pase | 90 días más |

## Fuente única de precios

Todos los precios salen de [`src/config/pricing.js`](../src/config/pricing.js). **Ningún precio se
hardcodea en otro archivo** (ni en el copy, ni en el backend, ni en `.env`). El backend valida el monto
que reporta Mercado Pago contra ese archivo (`montoCoincide`) antes de emitir la licencia.

Relación estructural (expresada en código, no en números sueltos):

```
pase90 = 2 × base
proyecto = pase90_renov = base
```

Para actualizar precios se toca **un solo número**: `base`. Los tres precios se derivan de ahí.

## Revisión trimestral

`PRICING.revisarCada = 90` días. En cada revisión se ajusta `base` por el IPC acumulado y se redondea a
$100 hacia arriba. `PRICING.vigenteDesde` marca la fecha de la última revisión.

- **Vigente desde:** 2026-07-25 · `base` = $17.400
- **Próxima revisión:** 2026-10-23 (90 días)

## Reglas de producto

- Lo generado durante un `pase90` vigente queda **accesible y re-exportable para siempre**: al autorizar
  un export con el pase, el backend emite además un token `proyecto` perpetuo para ese proyecto y lo
  devuelve (header `X-Adamant-Perpetuo` en `/api/generar`, campo `perpetuo` en `/api/cortes`). El cliente
  lo guarda. Al vencer el pase, todo lo hecho sigue funcionando **sin estado en el servidor**.
- `pase90_renov` se ofrece **una sola vez**, a ≤15 días del vencimiento del pase (no se insiste después).
- Tokens **v1** (esquema viejo `{pid, proy, exp}`) siguen valiendo como `proyecto` perpetuo. No se
  invalida ninguna compra previa.

## Token de licencia (v2)

HMAC firmado, stateless, sin base de datos. Payload: `{ v:2, sku, exp, projectHash|null, iat, orderId }`.

- `pase90` / `pase90_renov`: `exp` = compra + 90 días, `projectHash` = null.
- `proyecto`: `exp` = null (perpetuo), `projectHash` = id estable del proyecto pagado.
- Un export se autoriza si la firma es válida **y** (`exp` en el futuro **o** `projectHash` coincide).

`projectHash` es un id opaco y **estable** por proyecto (no se deriva de las medidas editables, para que
editar el proyecto no rompa la licencia). Editar el proyecto no cambia el hash; "Empezar un proyecto
nuevo" mintea otro.

## Recuperación de acceso (sin mail, sin dominio)

`localStorage` no alcanza para un pase de 90 días (se pierde al limpiar el navegador o cambiar de
dispositivo). Dos caminos, ninguno requiere infraestructura de mail:

1. **Código de acceso** (el token). Se muestra al confirmar el pago con botones Copiar / Descargar `.txt`;
   no se avanza hasta que la persona confirma que lo guardó. Se pega en "Ya compré" y se restaura.
2. **N° de operación de Mercado Pago** → `/api/recuperar`: consulta la API de MP, verifica que el pago
   esté aprobado, sea de un SKU de Adamant y que el monto coincida, y **reemite el token con la fecha de
   compra original** (no reinicia los 90 días). Anti-abuso: rate-limit por IP + tope de 5 reemisiones por
   operación (best-effort en memoria; el estado no persiste entre instancias serverless).

Red de contención: link de contacto visible en la compra y en "Ya compré" para reemisión manual.

## Reembolsos

**Manuales.** Devolución sin preguntas dentro de los 7 días, procesada a mano desde el panel de Mercado
Pago (Actividad → la operación → Devolver). **No se automatiza** ningún reembolso.

## Qué NO hay

Suscripción, débito recurrente, preapproval de MP, tarjeta en garantía, trial con tarjeta, packs de
créditos, tercer SKU, mail transaccional, base de datos de licencias. El B2B (corralones) es otra página
y otra venta — no aparece en esta pantalla de compra.
