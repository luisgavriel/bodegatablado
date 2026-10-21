// Deja todas las fotos con el mismo aspecto: quita el fondo con un modelo de
// IA que corre en el propio navegador (@imgly/background-removal), recorta el
// margen y centra la botella en un lienzo fijo de 300×900 con fondo
// transparente.
//
// El modelo se ejecuta en un Web Worker (normalizar-worker.js) para que la
// página no se congele mientras trabaja. La librería y el modelo (unos 80 MB)
// solo se descargan la primera vez; después quedan en la caché del navegador.

export const ANCHO = 300;
export const ALTO = 900;
const ALTO_BOTELLA = 0.92; // parte de la altura del lienzo que ocupa la botella
const BASE = 0.98; // línea en la que se apoya la botella (desde arriba)
const UMBRAL_ALFA = 128; // píxeles más transparentes que esto cuentan como fondo
const NIEBLA = 48; // por debajo de esto se borran (restos difusos del modelo)
const ESPERA_PRIMERA = 240_000; // la primera foto incluye la descarga del modelo
const ESPERA = 90_000;

// La función buscar-imagen guarda las fotos normalizadas acabadas en
// "-n.webp" o "-n.png"; así se reconocen sin otra columna.
export const estaNormalizada = (url) => /-n\.(webp|png)(\?|$)/.test(url ?? "");

// Tramo continuo más largo de posiciones con suficientes píxeles: así los
// restos sueltos que deja el modelo lejos de la botella no agrandan el recorte.
function tramo(cuentas) {
  const max = Math.max(...cuentas);
  const minimo = Math.max(2, max * 0.03);
  let mejor = null, inicio = -1;
  for (let i = 0; i <= cuentas.length; i++) {
    if (i < cuentas.length && cuentas[i] >= minimo) {
      if (inicio < 0) inicio = i;
    } else if (inicio >= 0) {
      if (!mejor || i - inicio > mejor[1] - mejor[0]) mejor = [inicio, i];
      inicio = -1;
    }
  }
  return mejor;
}

// Recuadro de la botella y medidas para saber si el recorte es creíble.
export function recuadro(datos, ancho, alto) {
  const filas = new Array(alto).fill(0);
  const columnas = new Array(ancho).fill(0);
  let total = 0;
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      if (datos[(y * ancho + x) * 4 + 3] > UMBRAL_ALFA) {
        filas[y]++;
        columnas[x]++;
        total++;
      }
    }
  }
  if (!total) return null;
  const f = tramo(filas);
  const c = tramo(columnas);
  if (!f || !c) return null;
  const r = { x: c[0], y: f[0], w: c[1] - c[0], h: f[1] - f[0] };
  let dentro = 0;
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) if (datos[(y * ancho + x) * 4 + 3] > UMBRAL_ALFA) dentro++;
  }
  r.densidad = dentro / (r.w * r.h); // cuánto del recuadro es botella
  r.fraccion = dentro / (ancho * alto); // cuánto de la foto es botella
  return r;
}

// Una botella ocupa una parte razonable de la foto, rellena bien su recuadro
// y es más alta que ancha. Si no, el modelo se ha equivocado.
export function esCreible(r) {
  if (!r) return "No se ha encontrado la botella en la foto";
  if (r.fraccion < 0.005) return "Casi no queda nada tras quitar el fondo";
  if (r.densidad < 0.3) return "El recorte tiene demasiados restos del fondo";
  if (r.h < r.w * 1.3) return "El recorte no parece una botella";
  return null;
}

// Coloca el recorte centrado en el lienzo y apoyado en la línea base.
export function encajar(r) {
  const escala = Math.min((ALTO * ALTO_BOTELLA) / r.h, (ANCHO * 0.92) / r.w);
  const w = r.w * escala;
  const h = r.h * escala;
  return { x: (ANCHO - w) / 2, y: ALTO * BASE - h, w, h };
}

function lienzo(ancho, alto) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(ancho, alto);
  const c = document.createElement("canvas");
  c.width = ancho;
  c.height = alto;
  return c;
}

async function aBlob(c, tipo) {
  if (c.convertToBlob) return c.convertToBlob({ type: tipo, quality: 0.9 });
  return new Promise((ok) => c.toBlob(ok, tipo, 0.9));
}

// Recibe la foto ya sin fondo y devuelve el WebP (o PNG si el navegador no
// sabe hacer WebP) del lienzo 300×900. Funciona en la página y en el worker.
export async function encuadrar(sinFondo) {
  const bmp = await createImageBitmap(sinFondo);
  const trabajo = lienzo(bmp.width, bmp.height);
  const ctx = trabajo.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  const img = ctx.getImageData(0, 0, bmp.width, bmp.height);
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i] < NIEBLA) img.data[i] = 0;
  ctx.putImageData(img, 0, 0);
  const r = recuadro(img.data, bmp.width, bmp.height);
  const problema = esCreible(r);
  if (problema) throw new Error(problema);

  const final = lienzo(ANCHO, ALTO);
  const destino = encajar(r);
  const fctx = final.getContext("2d");
  fctx.imageSmoothingQuality = "high";
  fctx.drawImage(trabajo, r.x, r.y, r.w, r.h, destino.x, destino.y, destino.w, destino.h);

  let blob = await aBlob(final, "image/webp");
  if (!blob || blob.type !== "image/webp") blob = await aBlob(final, "image/png");
  return blob;
}

// ---- Worker ----
let worker = null;
let usado = false;
let siguiente = 0;
const pendientes = new Map();

function reiniciarWorker(motivo) {
  worker?.terminate();
  worker = null;
  usado = false;
  for (const p of pendientes.values()) {
    clearTimeout(p.reloj);
    p.mal(new Error(motivo));
  }
  pendientes.clear();
}

function obtenerWorker() {
  if (worker) return worker;
  worker = new Worker(new URL("./normalizar-worker.js", import.meta.url), { type: "module" });
  worker.onmessage = ({ data }) => {
    const p = pendientes.get(data.id);
    if (!p) return;
    if (data.progreso) return p.progreso?.(data.progreso);
    pendientes.delete(data.id);
    clearTimeout(p.reloj);
    if (data.error) p.mal(new Error(data.error));
    else p.ok(data.blob);
  };
  worker.onerror = (e) => reiniciarWorker("La herramienta para quitar fondos falló: " + (e.message || "error desconocido"));
  return worker;
}

// Devuelve el Blob listo para subir. quitarFondo permite probar sin el modelo.
export async function normalizar(urlFoto, { progreso, quitarFondo } = {}) {
  if (quitarFondo) {
    const original = await (await fetch(urlFoto)).blob();
    return encuadrar(await quitarFondo(original));
  }
  const w = obtenerWorker();
  const id = ++siguiente;
  const espera = usado ? ESPERA : ESPERA_PRIMERA;
  usado = true;
  return new Promise((ok, mal) => {
    const reloj = setTimeout(() => {
      reiniciarWorker(`Quitar el fondo tardó más de ${espera / 1000} segundos`);
    }, espera);
    pendientes.set(id, { ok, mal, progreso, reloj });
    w.postMessage({ id, url: urlFoto });
  });
}
