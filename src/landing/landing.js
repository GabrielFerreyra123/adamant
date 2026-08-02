// ADAMANT · Landing. JS propio, mínimo y sin dependencias: sólo la aparición al hacer scroll
// y el año del pie. La landing tiene que funcionar aunque este archivo no cargue.
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
