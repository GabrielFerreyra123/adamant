// D1 — El PDF de obra es el papel que va al taller. Lo que se avisa en pantalla tiene que estar en el
// PDF (regla 2), y ningún número se estima en silencio (regla 3): las piezas que no entran en la barra
// (`over`, regla 5) y el hecho de que el corte no descuenta merma de sierra tienen que leerse en el PDF.
//
// Método (D0): el texto del PDF se extrae del binario y se LEE el número; el test cae si el aviso falta.
import { test, describe, expect, beforeAll } from "vitest";
import { computeProject, cutPlan, cutOpts } from "../src/engine/index.mjs";
import { exportPDF } from "../src/export/pdf.mjs";

// Un muro largo (8 m) → sus soleras (PGU) superan la barra comercial de 6 m → `over` > 0.
const CON_OVER = { kind: "muro", sistema: "steel", tipoMuro: "exterior", largo: 8000, alto: 2600, vanos: [],
  opciones: { pgc: "PGC 100x0.90", pgu: "PGU 100x0.90", modulo: 400 } };
// Un muro normal (3 m) → todo entra en la barra → NO tiene que aparecer el aviso de empalme.
const SIN_OVER = { ...CON_OVER, largo: 3000 };

async function pdfText(input){
  const { doc } = await exportPDF(input, { out: "buffer" });
  return Buffer.from(doc.output("arraybuffer")).toString("latin1");
}

let txtOver, txtOk, overCount;
beforeAll(async () => {
  const plan = cutPlan(computeProject(CON_OVER).piezas, cutOpts(CON_OVER));
  overCount = plan.filter(p => !p.fleje).reduce((a, p) => a + (p.over || 0), 0);
  [txtOver, txtOk] = await Promise.all([pdfText(CON_OVER), pdfText(SIN_OVER)]);
});

describe("PDF de obra · piezas que no entran en la barra (D1 / reglas 2 y 5)", () => {
  test("precondición: el muro de 8 m realmente genera piezas `over`", () => {
    expect(overCount).toBeGreaterThan(0);
  });
  test("el PDF avisa que hay piezas que requieren empalme", () => {
    expect(txtOver).toMatch(/empalme/i);
    expect(txtOver).toMatch(/m\S*s largas/i); // "más largas que la barra"
  });
  test("el PDF dice CUÁNTAS piezas no entran (el número, no sólo el dibujo)", () => {
    expect(txtOver).toMatch(new RegExp(`${overCount}\\s+pieza`, "i"));
  });
  test("sin piezas largas, el PDF NO mete el aviso de empalme", () => {
    expect(txtOk).not.toMatch(/empalme/i);
  });
});

describe("PDF de obra · ningún número se estima en silencio (regla 3)", () => {
  test("declara que el corte no descuenta la merma de sierra", () => {
    expect(txtOver).toMatch(/sierra/i);
  });
  test("declara que los precios son de referencia", () => {
    expect(txtOver).toMatch(/referencia/i);
  });
});
