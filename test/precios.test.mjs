// FASE C — Lista de precios ÚNICA compartida por todos los módulos.
// El resolver es puro (motor): recibe cómputo + lista y devuelve el presupuesto. La persistencia y la
// migración viven en una capa fina aparte, que acá se prueba con un localStorage simulado.
import { test, describe, beforeEach } from "vitest";
import assert from "node:assert/strict";
import { listaCompra, resolverPresupuesto, precioDe, diasDesde } from "../src/engine/precios.mjs";
import { CATALOGO, CAT_POR_ID, idDePerfil, idDePlaca } from "../src/engine/catalogo.mjs";
import { computeProject } from "../src/engine/index.mjs";

const OPCM = { pgc:"PGC 100x0.90", pgu:"PGU 100x0.90", lumber:"2x6 (38×140)", modulo:400 };
const OPCP = { pgc:"PGC 150x1.60", pgu:"PGU 150x1.60", lumber:"2x8 (38×184)", tiraLen:4880 };
const muroCompleto = { kind:"muro", sistema:"steel", largo:3000, alto:2600, arriostramiento:"cruz",
  vanos:[{ tipo:"puerta", x1:1100, x2:1900, h:2050, sill:0 }],
  opciones:{ ...OPCM, revInt:"Durlock 12.5", revExt:"OSB / Fenólico 10", aislacion:true } };

// 1) Resolver: con todos los precios cargados, total y subtotales por categoría correctos.
test("resolver: total y subtotales por categoría", () => {
  const items = [
    { id:"pgc-100-0.90", nombre:"PGC", unidad:"barra", cantidad:3, categoria:"perfil" },
    { id:"pgu-100-0.90", nombre:"PGU", unidad:"barra", cantidad:2, categoria:"perfil" },
    { id:"tornillo-t1",  nombre:"T1",  unidad:"u",     cantidad:100, categoria:"tornilleria" }
  ];
  const lista = { "pgc-100-0.90":{ precio:10000 }, "pgu-100-0.90":{ precio:8000 }, "tornillo-t1":{ precio:25 } };
  const r = resolverPresupuesto(items, lista);
  assert.equal(r.parcial, false);
  assert.equal(r.categorias.perfil, 3*10000 + 2*8000);
  assert.equal(r.categorias.tornilleria, 100*25);
  assert.equal(r.total, 30000 + 16000 + 2500);
  assert.ok(r.filas.every(f => !f.sinPrecio));
});

// 2) Un ítem sin precio → flag `parcial`, no suma, fila marcada. Nunca suma 0 en silencio.
test("resolver: ítem sin precio marca parcial y queda fuera del total", () => {
  const items = [
    { id:"pgc-100-0.90", nombre:"PGC", unidad:"barra", cantidad:3, categoria:"perfil" },
    { id:"tensor",       nombre:"Tensor", unidad:"u", cantidad:4, categoria:"fleje" }
  ];
  const r = resolverPresupuesto(items, { "pgc-100-0.90":{ precio:10000 } });
  assert.equal(r.parcial, true);
  assert.equal(r.total, 30000, "el ítem sin precio no aporta");
  assert.equal(r.sinPrecio.length, 1);
  assert.equal(r.sinPrecio[0].id, "tensor");
  assert.equal(r.filas.find(f => f.id === "tensor").subtotal, 0);
  assert.equal(r.categorias.fleje, undefined, "no aparece una categoría en $0");
  // precio 0 explícito = sigue siendo "sin precio"
  assert.equal(resolverPresupuesto(items, { tensor:{ precio:0 } }).sinPrecio.length, 2);
});

test("resolver: acepta mapa plano {id: precio} además del store", () => {
  const items = [{ id:"tornillo-t1", nombre:"T1", unidad:"u", cantidad:10, categoria:"tornilleria" }];
  assert.equal(resolverPresupuesto(items, { "tornillo-t1": 30 }).total, 300);
  assert.equal(precioDe({ "tornillo-t1": 30 }, "tornillo-t1"), 30);
  assert.equal(precioDe({ "tornillo-t1": { precio: 30 } }, "tornillo-t1"), 30);
});

// 4) Catálogo: TODO id que emite cualquier módulo existe en el catálogo base (evita ids huérfanos
//    cuando se agreguen módulos futuros).
test("catálogo: ningún módulo emite un id fuera del catálogo", () => {
  const casos = [
    ["muro steel", muroCompleto],
    ["muro wood", { kind:"muro", sistema:"wood", largo:3000, alto:2600, vanos:[], opciones:{ ...OPCM, revInt:"Placa cementicia 12", revExt:"Siding cementicio 12" } }],
    ["piso steel", { kind:"piso", sistema:"steel", largo:4000, ancho:3000, separacion:400, apoyo:"platea", placa:true, opciones:OPCP, vano:{ x:1000, y:800, ancho:800, largo:1200 } }],
    ["piso wood", { kind:"piso", sistema:"wood", largo:4000, ancho:3000, separacion:400, apoyo:"platea", placa:true, opciones:OPCP }],
    ["cielo", { kind:"cielo", sistema:"steel", largo:4000, ancho:3000, alt:2600, suspension:400, modulo:400, opciones:{ perfil:"Solera/montante 70" } }],
    ["combinado", { kind:"combinado", sistema:"steel", largo:4000, ancho:3000, alto:2600, apoyo:"platea", placa:true,
      opciones:OPCM, vanoFrente:[{ tipo:"puerta", x1:1100, x2:1900, h:2050, sill:0 }], vanoFondo:[], vanoIzq:[], vanoDer:[] }]
  ];
  const huerfanos = [];
  casos.forEach(([nom, inp]) => {
    const items = listaCompra(computeProject(inp).materiales);
    assert.ok(items.length, `${nom} no computó ítems`);
    items.forEach(i => { if (!i.id || !CAT_POR_ID[i.id]) huerfanos.push(`${nom}: ${i.id || "(sin id)"} — ${i.nombre}`); });
  });
  assert.deepEqual(huerfanos, [], "hay ids fuera del catálogo");
});

test("catálogo: ids estables y únicos, derivados de tipo+medida", () => {
  const ids = CATALOGO.map(i => i.id);
  assert.equal(ids.length, new Set(ids).size, "sin ids duplicados");
  assert.equal(idDePerfil("PGC 100x0.90"), "pgc-100-0.90");
  assert.equal(idDePerfil("PGU 150x1.60"), "pgu-150-1.60");
  assert.equal(idDePerfil("2x6 (38×140)"), "madera-2x6");
  assert.equal(idDePerfil("Solera/montante 70"), "cielo-70");
  assert.equal(idDePlaca("Durlock 12.5"), "placa-yeso-12.5", "el id no depende del rótulo comercial");
  assert.ok(CATALOGO.every(i => i.categoria && i.unidad), "todo ítem con categoría y unidad");
});

// 6) Regresión: con los mismos precios cargados, el total del muro es el mismo que con el esquema viejo.
test("regresión: mismo total que el esquema por módulo", () => {
  const mat = computeProject(muroCompleto).materiales;
  // total "a la vieja": clave por nombre, sumando cantidad × precio
  const viejos = { "perf:PGC 100x0.90":12000, "perf:PGU 100x0.90":9000, "placa:Durlock 12.5":15000,
    "placa:OSB / Fenólico 10":22000, aislacion:4500, t1:25, t2:12,
    "carp-puerta":180000, "fleje-rollo":30000, tensor:2500 };
  let totalViejo = 0;
  mat.perfiles.forEach(p => totalViejo += p.barras * (viejos[`perf:${p.perfil}`] || 0));
  mat.placas.forEach(p => totalViejo += p.unidades * (viejos[`placa:${p.material}`] || 0));
  totalViejo += Math.ceil(mat.aislacion) * viejos.aislacion;
  totalViejo += mat.tornillos.t1 * viejos.t1 + mat.tornillos.t2 * viejos.t2;
  mat.otros.forEach(o => totalViejo += o.cantidad * (viejos[o.key] || 0));
  // total nuevo: mismos precios, cargados por id del catálogo
  const nuevos = { "pgc-100-0.90":12000, "pgu-100-0.90":9000, "placa-yeso-12.5":15000,
    "placa-osb-10":22000, "aislacion-lana":4500, "tornillo-t1":25, "tornillo-t2":12,
    "carp-puerta":180000, "fleje-rollo":30000, tensor:2500 };
  const r = resolverPresupuesto(listaCompra(mat), nuevos);
  assert.equal(r.parcial, false, "todos los ítems del muro tienen precio en el mapa de prueba");
  assert.equal(r.total, totalViejo, "el total no cambia al unificar la lista");
});

test("aviso de precios viejos: días desde la actualización", () => {
  const ahora = Date.parse("2026-03-01T00:00:00Z");
  assert.equal(diasDesde("2026-01-01T00:00:00Z", ahora), 59);
  assert.equal(diasDesde(null), null);
  const r = resolverPresupuesto(
    [{ id:"tornillo-t1", nombre:"T1", unidad:"u", cantidad:1, categoria:"tornilleria" }],
    { "tornillo-t1":{ precio:10, actualizado:"2026-01-01T00:00:00Z" } });
  assert.equal(r.masViejo, "2026-01-01T00:00:00Z");
});

// --- capa de persistencia: migración idempotente + export/import ------------------------------
describe("store de precios (localStorage simulado)", () => {
  let store, mod;
  beforeEach(async () => {
    store = {};
    globalThis.localStorage = {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; }
    };
    mod = await import("../src/ui/precios-store.js?" + Math.random()); // instancia limpia
  });

  // 3) Migración: por id y por nombre normalizado; idempotente; no pisa ediciones posteriores.
  test("migra las claves viejas y es idempotente", () => {
    store["adamant_precios"] = JSON.stringify({
      "perf:PGC 100x0.90": 12000, "placa:Durlock 12.5": 15000, t1: 25, aislacion: 4500,
      "placa-piso": 33000, tensor: 2500, "clave-inexistente": 999
    });
    const r1 = mod.migrarPrecios();
    assert.equal(r1.migrados, 6, "6 claves con equivalencia en el catálogo");
    const p = mod.cargarPrecios();
    assert.equal(p["pgc-100-0.90"].precio, 12000);
    assert.equal(p["placa-yeso-12.5"].precio, 15000);
    assert.equal(p["tornillo-t1"].precio, 25);
    assert.equal(p["aislacion-lana"].precio, 4500);
    assert.equal(p["placa-piso-osb-18"].precio, 33000);
    assert.equal(p["tensor"].precio, 2500);
    assert.ok(p["pgc-100-0.90"].actualizado, "queda fechado");
    assert.ok(store["adamant_precios"], "la clave vieja NO se borra (rollback barato)");

    // idempotencia: segunda corrida no duplica ni pisa una edición posterior
    mod.setPrecio("pgc-100-0.90", 20000);
    const r2 = mod.migrarPrecios();
    assert.equal(r2.migrados, 0, "no vuelve a migrar");
    assert.equal(mod.cargarPrecios()["pgc-100-0.90"].precio, 20000, "respeta la edición posterior");
    assert.equal(Object.keys(mod.cargarPrecios()).length, 6, "sin duplicados");
  });

  test("migración por nombre normalizado cuando la clave no matchea directo", () => {
    assert.equal(mod.idDesdeClaveVieja("perf:PGC 100x0.90"), "pgc-100-0.90");
    assert.equal(mod.idDesdeClaveVieja("banda-estanca"), "banda-estanca", "la que ya era id estable, igual");
    assert.equal(mod.idDesdeClaveVieja("Banda estanca / aislador de apoyo"), "banda-estanca", "match por nombre");
    assert.equal(mod.idDesdeClaveVieja("no-existe-nada"), null);
  });

  test("sin claves viejas no rompe", () => {
    assert.deepEqual(mod.migrarPrecios(), { migrados: 0, saltados: 0 });
    assert.deepEqual(mod.cargarPrecios(), {});
  });

  // 5) Export → import round-trip sin pérdida.
  test("export → import mantiene precios y fechas", () => {
    mod.setPrecio("pgc-100-0.90", 12345);
    mod.setPrecio("tornillo-t1", 25);
    const json = mod.exportarPrecios();
    const antes = mod.cargarPrecios();
    store = {}; // simula otra máquina
    const r = mod.importarPrecios(json);
    assert.equal(r.ok, true); assert.equal(r.n, 2);
    assert.deepEqual(mod.cargarPrecios(), antes, "round-trip sin pérdida");
  });

  test("import: acepta mapa plano y rechaza basura", () => {
    assert.equal(mod.importarPrecios('{"pgc-100-0.90": 9999}').n, 1);
    assert.equal(mod.cargarPrecios()["pgc-100-0.90"].precio, 9999);
    assert.equal(mod.importarPrecios("no es json").ok, false);
    assert.equal(mod.importarPrecios('{"id-inventado": 100}').n, 0, "ignora ids fuera del catálogo");
  });

  test("borrar el precio lo devuelve a 'sin precio' (no a cero)", () => {
    mod.setPrecio("tensor", 500);
    mod.setPrecio("tensor", 0);
    assert.equal(mod.cargarPrecios().tensor, undefined);
  });
});

// 7) Los inputs de precio llevan autocomplete="off" + name descriptivo (anti-autofill de Chrome).
test("UI: inputs de precio con autocomplete off y name propio", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../src/ui/wizard.js", import.meta.url), "utf8");
  const inputs = src.match(/<input[^>]*class="p(input|busca)"[^>]*>/g) || [];
  assert.ok(inputs.length >= 2, "hay inputs de precio y de búsqueda");
  inputs.forEach(i => {
    assert.match(i, /autocomplete="off"/, `falta autocomplete: ${i.slice(0,60)}`);
    assert.match(i, /name="[^"]+"/, `falta name: ${i.slice(0,60)}`);
    assert.match(i, /aria-label=/, `falta aria-label: ${i.slice(0,60)}`);
  });
});
