// Cuándo beber un vino según su ventana de consumo, para que la categoría
// sea coherente con las fechas:
//   urg     la ventana ya terminó
//   ya      termina este año o el siguiente
//   guardar aún no ha empezado
//   punto   abierta y termina más adelante
// Entiende textos como «2027–2035», «hasta 2028», «antes de 2027»,
// «desde 2030», «acabó en 2022» o «2027». Sin años devuelve null.
// La misma regla está en supabase/functions/reconocer-vino/index.ts.

export function leerVentana(texto) {
  const t = String(texto ?? "").toLowerCase();
  const anos = [...t.matchAll(/\b(1[89]\d\d|20\d\d|2100)\b/g)].map((m) => Number(m[1]));
  if (!anos.length) return null;
  if (anos.length >= 2) return { desde: Math.min(...anos), hasta: Math.max(...anos) };
  const [a] = anos;
  if (/antes de/.test(t)) return { desde: null, hasta: a - 1 };
  if (/hasta|acab|termin/.test(t)) return { desde: null, hasta: a };
  if (/desde|a partir/.test(t)) return { desde: a, hasta: null };
  return { desde: a, hasta: a };
}

export function estadoSegunFechas({ desde, hasta }, ano = new Date().getFullYear()) {
  if (hasta != null && hasta < ano) return "urg";
  if (hasta != null && hasta <= ano + 1) return "ya";
  if (desde != null && desde > ano) return "guardar";
  return "punto";
}

export function estadoSegunVentana(texto, ano) {
  const v = leerVentana(texto);
  return v ? estadoSegunFechas(v, ano) : null;
}
