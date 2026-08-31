// ADAMANT · Landing. JS propio, mínimo: la aparición al hacer scroll, el año del pie y los precios de
// los planes (desde PRICING, fuente única). La landing tiene que funcionar aunque este archivo no
// cargue: los precios traen un fallback estático en el HTML que acá se sobrescribe con el valor vigente.
import { PRICING } from "../config/pricing.js";

const fmtARS = n => "ARS $" + new Intl.NumberFormat("es-AR").format(n);
document.querySelectorAll("[data-precio]").forEach(el => {
  const p = PRICING.skus[el.dataset.precio];
  if (p) el.textContent = fmtARS(p.precio);
});

const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const elems = document.querySelectorAll(".reveal");

if (reduce || !("IntersectionObserver" in window)){
  elems.forEach(el => el.classList.add("visible")); // sin animación: todo visible
} else {
  const io = new IntersectionObserver((entradas, obs) => {
    entradas.forEach(e => {
      if (!e.isIntersecting) return;
      e.target.classList.add("visible");
      obs.unobserve(e.target); // una sola vez
    });
  }, { rootMargin: "0px 0px -12% 0px", threshold: 0.08 });
  elems.forEach(el => io.observe(el));
}

const anio = document.getElementById("anio");
if (anio) anio.textContent = new Date().getFullYear();

// CTA sticky en mobile: se muestra una vez que el hero salió de vista (no tapa el CTA principal).
const sticky = document.querySelector(".cta-sticky"), hero = document.querySelector(".hero");
if (sticky && hero){
  if (!("IntersectionObserver" in window)) sticky.classList.add("show");
  else new IntersectionObserver(([e]) => sticky.classList.toggle("show", !e.isIntersecting), { threshold: 0 }).observe(hero);
}
