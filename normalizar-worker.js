// Worker que quita el fondo de una foto y la encuadra en el lienzo común.
// Va aparte para que el modelo de IA no congele la página.
import { encuadrar } from "./normalizar.js";

const LIBRERIA = "https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm";

let libreria = null;
function cargarLibreria() {
  libreria ??= import(LIBRERIA).catch((err) => {
    libreria = null;
    throw new Error("No se pudo descargar la herramienta para quitar fondos (" + err.message + ")");
  });
  return libreria;
}

self.onmessage = async ({ data: { id, url } }) => {
  const progreso = (texto) => self.postMessage({ id, progreso: texto });
  try {
    progreso("Preparando la herramienta…");
    const { removeBackground } = await cargarLibreria();
    const original = await (await fetch(url)).blob();
    // La descarga avisa por partes; se muestra el total acumulado.
    const partes = new Map();
    const sinFondo = await removeBackground(original, {
      model: "isnet_fp16", // el pequeño (quint8) deja demasiados restos
      device: "cpu",
      output: { format: "image/png" },
      progress: (clave, actual, total) => {
        partes.set(clave, [actual, total]);
        let a = 0, t = 0;
        for (const [x, y] of partes.values()) { a += x; t += y; }
        progreso(a >= t ? "Quitando el fondo…" : `Descargando la herramienta… ${Math.round((a / t) * 100)} %`);
      },
    });
    progreso("Encuadrando…");
    self.postMessage({ id, blob: await encuadrar(sinFondo) });
  } catch (err) {
    self.postMessage({ id, error: err.message || String(err) });
  }
};
