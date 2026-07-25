// ADAMANT · Glosario integrado (F14): subrayado punteado + tarjeta flotante.
// Los términos técnicos se marcan con <span class="gloss" data-g="slug"> (ver glossHTML del contenido).
// Al tocar/pasar el mouse por uno, aparece una tarjeta con la definición + mini-ilustración.
import { getGloss } from "../content/glosario.js";

let pop = null;
function ensurePop(){
  if (pop) return pop;
  pop = document.createElement("div");
  pop.className = "gloss-pop"; pop.hidden = true;
  document.body.appendChild(pop);
  return pop;
}
function hide(){ if (pop) pop.hidden = true; }

function show(el){
  const g = getGloss(el.dataset.g); if (!g) return;
  const p = ensurePop();
  p.innerHTML = `<div class="gp-ico">${g.svg || ""}</div>
    <div class="gp-txt"><b>${g.t}</b><span>${g.def}</span>${g.fn ? `<em>${g.fn}</em>` : ""}</div>`;
  p.hidden = false;
  const pw = Math.min(300, window.innerWidth - 24);
  p.style.width = pw + "px";
  const r = el.getBoundingClientRect();
  let left = Math.max(12, Math.min(r.left + r.width / 2 - pw / 2, window.innerWidth - pw - 12));
  p.style.left = left + "px";
  p.style.top = (r.bottom + 8) + "px";
  // si se sale por abajo y hay lugar arriba, lo pongo encima del término
  requestAnimationFrame(() => {
    const ph = p.offsetHeight;
    if (r.bottom + 8 + ph > window.innerHeight - 8 && r.top - ph - 8 > 0) p.style.top = (r.top - ph - 8) + "px";
  });
}

let inited = false;
export function initGlosario(){
  if (inited) return; inited = true;
  document.addEventListener("click", e => {
    const g = e.target.closest(".gloss");
    if (g){ e.preventDefault(); e.stopPropagation(); (pop && !pop.hidden && pop._for === g) ? hide() : show(g); if (pop) pop._for = g; return; }
    if (!e.target.closest(".gloss-pop")) hide();
  });
  document.addEventListener("mouseover", e => { const g = e.target.closest(".gloss"); if (g){ show(g); if (pop) pop._for = g; } });
  document.addEventListener("mouseout", e => { const g = e.target.closest(".gloss"); if (g && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest(".gloss-pop"))) hide(); });
  window.addEventListener("scroll", hide, true);
  window.addEventListener("resize", hide);
}
