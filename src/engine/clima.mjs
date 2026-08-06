// ADAMANT · clima por CIUDAD (orientativo). El usuario elige su ciudad y la app deduce, en criollo,
// cuánto viento, cuánta nieve y en qué zona bioambiental está — para no tener que preguntarle datos
// técnicos que no conoce. Los valores son SEMILLA de literatura (CIRSOC 102 viento · CIRSOC 104 nieve
// · IRAM 11603 zonas bioambientales); los números finos y firmados van en el dossier profesional.
//
// - viento: "baja" | "media" | "alta"  → alimenta el semáforo y la recomendación de arriostre.
// - nieve:  "baja" | "media" | "alta"  → alimenta el aviso de acumulación en techos de poca pendiente.
// - bio:    "II".."VI"                  → zona bioambiental IRAM 11603 → nivel K de la aislación.

export const CIUDADES = {
  // — Buenos Aires y CABA —
  buenosaires:  { label: "Buenos Aires (CABA)",     prov: "CABA",             viento: "media", nieve: "baja",  bio: "III" },
  laplata:      { label: "La Plata",                prov: "Buenos Aires",     viento: "media", nieve: "baja",  bio: "III" },
  marplata:     { label: "Mar del Plata",           prov: "Buenos Aires",     viento: "alta",  nieve: "baja",  bio: "IV"  },
  bahiablanca:  { label: "Bahía Blanca",            prov: "Buenos Aires",     viento: "alta",  nieve: "baja",  bio: "IV"  },
  tandil:       { label: "Tandil",                  prov: "Buenos Aires",     viento: "media", nieve: "baja",  bio: "IV"  },
  sannicolas:   { label: "San Nicolás",             prov: "Buenos Aires",     viento: "media", nieve: "baja",  bio: "III" },
  // — Litoral —
  rosario:      { label: "Rosario",                 prov: "Santa Fe",         viento: "media", nieve: "baja",  bio: "III" },
  santafe:      { label: "Santa Fe",                prov: "Santa Fe",         viento: "media", nieve: "baja",  bio: "II"  },
  parana:       { label: "Paraná",                  prov: "Entre Ríos",       viento: "media", nieve: "baja",  bio: "II"  },
  concordia:    { label: "Concordia",               prov: "Entre Ríos",       viento: "media", nieve: "baja",  bio: "II"  },
  corrientes:   { label: "Corrientes",              prov: "Corrientes",       viento: "media", nieve: "baja",  bio: "II"  },
  resistencia:  { label: "Resistencia",             prov: "Chaco",            viento: "media", nieve: "baja",  bio: "II"  },
  posadas:      { label: "Posadas",                 prov: "Misiones",         viento: "media", nieve: "baja",  bio: "II"  },
  formosa:      { label: "Formosa",                 prov: "Formosa",          viento: "media", nieve: "baja",  bio: "I"   },
  // — Centro / Cuyo —
  cordoba:      { label: "Córdoba",                 prov: "Córdoba",          viento: "media", nieve: "baja",  bio: "III" },
  riocuarto:    { label: "Río Cuarto",              prov: "Córdoba",          viento: "media", nieve: "baja",  bio: "III" },
  sanluis:      { label: "San Luis",                prov: "San Luis",         viento: "media", nieve: "baja",  bio: "III" },
  sanjuan:      { label: "San Juan",                prov: "San Juan",         viento: "media", nieve: "baja",  bio: "III" },
  mendoza:      { label: "Mendoza",                 prov: "Mendoza",          viento: "media", nieve: "baja",  bio: "IV"  },
  sanrafael:    { label: "San Rafael",              prov: "Mendoza",          viento: "media", nieve: "media", bio: "IV"  },
  santarosa:    { label: "Santa Rosa",              prov: "La Pampa",         viento: "media", nieve: "baja",  bio: "IV"  },
  // — Noroeste (NOA) —
  tucuman:      { label: "San Miguel de Tucumán",   prov: "Tucumán",          viento: "baja",  nieve: "baja",  bio: "II"  },
  salta:        { label: "Salta",                   prov: "Salta",            viento: "baja",  nieve: "baja",  bio: "II"  },
  jujuy:        { label: "San Salvador de Jujuy",   prov: "Jujuy",            viento: "baja",  nieve: "baja",  bio: "II"  },
  catamarca:    { label: "San Fernando del Valle de Catamarca", prov: "Catamarca", viento: "baja", nieve: "baja", bio: "II" },
  larioja:      { label: "La Rioja",                prov: "La Rioja",         viento: "baja",  nieve: "baja",  bio: "II"  },
  santiago:     { label: "Santiago del Estero",     prov: "Santiago del Estero", viento: "baja", nieve: "baja", bio: "I"  },
  // — Patagonia —
  neuquen:      { label: "Neuquén",                 prov: "Neuquén",          viento: "alta",  nieve: "media", bio: "IV"  },
  generalroca:  { label: "General Roca",            prov: "Río Negro",        viento: "alta",  nieve: "baja",  bio: "IV"  },
  viedma:       { label: "Viedma",                  prov: "Río Negro",        viento: "alta",  nieve: "baja",  bio: "IV"  },
  bariloche:    { label: "San Carlos de Bariloche", prov: "Río Negro",        viento: "alta",  nieve: "alta",  bio: "VI"  },
  trelew:       { label: "Trelew / Rawson",         prov: "Chubut",           viento: "alta",  nieve: "baja",  bio: "V"   },
  comodoro:     { label: "Comodoro Rivadavia",      prov: "Chubut",           viento: "alta",  nieve: "baja",  bio: "V"   },
  esquel:       { label: "Esquel",                  prov: "Chubut",           viento: "alta",  nieve: "alta",  bio: "VI"  },
  riogallegos:  { label: "Río Gallegos",            prov: "Santa Cruz",       viento: "alta",  nieve: "media", bio: "VI"  },
  calafate:     { label: "El Calafate",             prov: "Santa Cruz",       viento: "alta",  nieve: "alta",  bio: "VI"  },
  ushuaia:      { label: "Ushuaia",                 prov: "Tierra del Fuego", viento: "alta",  nieve: "alta",  bio: "VI"  }
};

// Orden de aparición en el selector (agrupado por región: Buenos Aires → Litoral → Centro/Cuyo → NOA → Patagonia).
export const CIUDAD_ORDEN = [
  "buenosaires", "laplata", "marplata", "bahiablanca", "tandil", "sannicolas",
  "rosario", "santafe", "parana", "concordia", "corrientes", "resistencia", "posadas", "formosa",
  "cordoba", "riocuarto", "sanluis", "sanjuan", "mendoza", "sanrafael", "santarosa",
  "tucuman", "salta", "jujuy", "catamarca", "larioja", "santiago",
  "neuquen", "generalroca", "viedma", "bariloche", "trelew", "comodoro", "esquel", "riogallegos", "calafate", "ushuaia"
];

export function climaDeCiudad(id){ return CIUDADES[id] || null; }

// Etiquetas en criollo para mostrar el clima sin jerga.
export const VIENTO_LBL = { baja: "viento suave", media: "viento moderado", alta: "viento fuerte" };
export const NIEVE_LBL  = { baja: "poca nieve", media: "algo de nieve", alta: "mucha nieve" };
export const BIO_LBL = { I: "I · muy cálida", II: "II · cálida", III: "III · templada",
  IV: "IV · templada fría", V: "V · fría", VI: "VI · muy fría" };

// Nivel K (W/m²K) de la aislación por zona bioambiental IRAM 11605, muros: B = recomendado · C = mínimo.
// Zonas más frías piden K más bajo (mejor aislado). Valores semilla, orientativos.
export const NIVEL_K_ZONA = {
  I:   { B: 1.80, C: 2.00 },
  II:  { B: 1.25, C: 2.00 },
  III: { B: 1.10, C: 1.85 },
  IV:  { B: 1.00, C: 1.85 },
  V:   { B: 0.86, C: 1.50 },
  VI:  { B: 0.72, C: 1.25 }
};
export function nivelKporZona(bio){ return NIVEL_K_ZONA[bio] || NIVEL_K_ZONA.IV; }
