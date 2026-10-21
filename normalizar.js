// Deja todas las fotos con el mismo aspecto: quita el fondo con un modelo de
// IA que corre en el propio navegador (@imgly/background-removal), recorta el
// margen y centra la botella en un lienzo fijo de 300×900 con fondo
// transparente.
//
// La librería (unos 40 MB con el modelo) solo se descarga la primera vez que
// se normaliza una foto; después queda en la caché del navegador.

const LIBRERIA = "https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm";
export const ANCHO = 300;
export const ALTO = 900;
const ALTO_BOTELLA = 0.92; // parte de la altura del lienzo que ocupa la botella
const BASE = 0.98; // línea en la que se apoya la botella (desde arriba)
const UMBRAL_ALFA = 24; // píxeles más transparentes que esto cuentan como fondo

// La función buscar-imagen guarda las fotos normalizadas acabadas en
// "-n.webp" o "-n.png"; así se reconocen sin otra columna.
export const estaNormalizada = (url) => /-n\.(webp|png)$/.test(url ?? "");

let libreria = null;
function cargarLibreria() {
  libreria ??= import(LIBRERIA).catch((err) => {
    libreria = null;
    throw new Error("No se pudo descargar la herramienta para quitar fondos (" + err.message + ")");
  });
  return libreria;
}

// Recuadro mínimo que contiene los píxeles no transparentes.
export function recuadro(datos, ancho, alto) {
  let x0 = ancho, y0 = alto, x1 = -1, y1 = -1;
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      if (datos[(y * ancho + x) * 4 + 3] > UMBRAL_ALFA) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// Coloca el recorte centrado en el lienzo y apoyado en la línea base.
export function encajar(r) {
  const escala = Math.min((ALTO * ALTO_BOTELLA) / r.h, (ANCHO * 0.92) / r.w);
  const w = r.w * escala;
  const h = r.h * escala;
  return { x: (ANCHO - w) / 2, y: ALTO * BASE - h, w, h };
}

function aBlob(canvas, tipo) {
  return new Promise((ok) => canvas.toBlob(ok, tipo, 0.9));
}

// Devuelve un Blob WebP (o PNG si el navegador no sabe hacer WebP) listo para subir.
// quitarFondo se puede sustituir en las pruebas.
export async function normalizar(urlFoto, { progreso, quitarFondo } = {}) {
  if (!quitarFondo) {
    const { removeBackground } = await cargarLibreria();
    quitarFondo = (src) => removeBackground(src, {
      model: "isnet_quint8",
      output: { format: "image/png" },
      progress: (clave, actual, total) => progreso?.(`Descargando la herramienta… ${Math.round((actual / total) * 100)} %`),
    });
  }
  const original = await (await fetch(urlFoto)).blob();
  const sinFondo = await quitarFondo(original);
  const bmp = await createImageBitmap(sinFondo);

  const trabajo = document.createElement("canvas");
  trabajo.width = bmp.width;
  trabajo.height = bmp.height;
  const ctx = trabajo.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  const r = recuadro(ctx.getImageData(0, 0, bmp.width, bmp.height).data, bmp.width, bmp.height);
  if (!r) throw new Error("No se ha encontrado la botella en la foto");

  const lienzo = document.createElement("canvas");
  lienzo.width = ANCHO;
  lienzo.height = ALTO;
  const destino = encajar(r);
  const lctx = lienzo.getContext("2d");
  lctx.imageSmoothingQuality = "high";
  lctx.drawImage(trabajo, r.x, r.y, r.w, r.h, destino.x, destino.y, destino.w, destino.h);

  let blob = await aBlob(lienzo, "image/webp");
  if (!blob || blob.type !== "image/webp") blob = await aBlob(lienzo, "image/png");
  return blob;
}
