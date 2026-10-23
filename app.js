import { crearStore, vinosIniciales } from "./store.js";
import { normalizar, estaNormalizada } from "./normalizar.js";
import { estadoSegunVentana, leerVentana } from "./ventana.js";

const TIPOS = [
  ["tinto", "Tintos"], ["blanco", "Blancos"], ["espumoso", "Espumosos"],
  ["rosado", "Rosados"], ["otro", "Otros"],
];
const ESTADOS = { urg: "Urgente", ya: "Beber ya", punto: "En su punto", guardar: "Guardar" };
const URGENCIA = { urg: 0, ya: 1, punto: 2, guardar: 3 };
// Órdenes de cada pestaña; el primero es el de por defecto.
const ORDENES = {
  bodega: [["tipo", "Por tipo"], ["urgencia", "Por urgencia"], ["anada", "Por añada"], ["nombre", "Por nombre"], ["puntuacion", "Por puntuación"]],
  probados: [["fecha", "Más recientes"], ["mi_nota", "Por tu nota"], ["tipo", "Por tipo"], ["precio", "Por precio"], ["nombre", "Por nombre"], ["puntuacion", "Por puntuación"]],
};

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

let store;
let vinos = [];
let filtro = "todo";
let busqueda = "";
// Pestaña a la vista: la bodega o los vinos probados fuera (en un
// restaurante…). Los dos van en la misma tabla, separados por la columna
// lista. Se recuerda en este navegador.
let pestana = (() => {
  try { return localStorage.getItem("bodega-pestana") === "probados" ? "probados" : "bodega"; } catch { return "bodega"; }
})();
const ordenDe = { bodega: "tipo", probados: "fecha" };
let orden = ordenDe[pestana];
const listaDe = (v) => v.lista ?? "bodega";
const esProbado = (v) => listaDe(v) === "probados";
const enPestana = (v) => listaDe(v) === pestana;
let editando = null;
let estadoPrevio = "";
// Foto hecha al añadir un vino probado; se guarda como su foto al crearlo.
let fotoNueva = null;
let fichaId = null;
const buscandoNotas = new Set();
// Lista o galería. Se recuerda en este navegador; sin preferencia, galería
// en pantallas anchas y lista en el móvil.
let vista = (() => {
  try { const v = localStorage.getItem("bodega-vista"); if (v === "lista" || v === "galeria") return v; } catch {}
  return window.matchMedia("(min-width: 900px)").matches ? "galeria" : "lista";
})();
// Resumen plegado o abierto en el móvil. Se recuerda en este navegador;
// sin preferencia, empieza plegado.
let resumenAbierto = (() => {
  try { return localStorage.getItem("bodega-resumen") === "abierto"; } catch { return false; }
})();
let acceso = { rol: "dueno" };
const soloVer = () => acceso.rol === "lector";

// fijo = true deja el mensaje en pantalla hasta el siguiente toast.
function toast(msg, fijo = false) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  if (!fijo) toast.timer = setTimeout(() => (t.hidden = true), 4000);
}

function fallo(e) {
  console.error(e);
  toast("No se pudo guardar: " + (e.message || e));
}

// ---- Render ----
function pasaFiltro(v, f = filtro) {
  if (f === "favoritos") return Number(v.mi_nota) >= 8;
  if (f === "agotados") return v.botellas === 0;
  if (f === "ya") return v.estado === "ya" || v.estado === "urg";
  if (f === "guardar") return v.estado === "guardar";
  if (f !== "todo") return v.tipo === f;
  return true;
}

function elegirFiltro(f) {
  filtro = f;
  const nav = $("#filtros");
  for (const c of nav.querySelectorAll(".chip")) {
    const activo = c.dataset.filter === f;
    c.setAttribute("aria-pressed", String(activo));
    // En el móvil los filtros se deslizan: deja el elegido a la vista.
    if (activo && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = c.offsetLeft - nav.offsetLeft - 8;
  }
  render();
}

function pasaBusqueda(v) {
  if (!busqueda) return true;
  const texto = [v.nombre, v.bodega, v.denominacion, v.pais, v.uvas, v.anada, v.notas, v.lugar]
    .join(" ").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  return busqueda.split(/\s+/).every((p) => texto.includes(p));
}

// Clave para ordenar por puntuación: primero los vinos con nota de guías
// (de mayor a menor), luego los que solo tienen Vivino y al final los que
// no tienen ninguna.
function clavePuntuacion(v) {
  const { guias, vivino } = leerPuntuacion(v.puntuacion);
  if (guias.length) return [0, -guias[0].valor];
  if (vivino) return [1, -vivino.nota];
  return [2, 0];
}

function comparar(a, b) {
  if (orden === "puntuacion") {
    const [ga, na] = clavePuntuacion(a), [gb, nb] = clavePuntuacion(b);
    return ga - gb || na - nb || a.nombre.localeCompare(b.nombre);
  }
  if (orden === "urgencia") return (URGENCIA[a.estado] ?? 9) - (URGENCIA[b.estado] ?? 9) || a.nombre.localeCompare(b.nombre);
  if (orden === "anada") return (a.anada ?? 9999) - (b.anada ?? 9999) || a.nombre.localeCompare(b.nombre);
  if (orden === "nombre") return a.nombre.localeCompare(b.nombre);
  if (orden === "fecha") return String(b.fecha_probado ?? "").localeCompare(String(a.fecha_probado ?? ""))
    || String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
  if (orden === "mi_nota") return (b.mi_nota ?? -1) - (a.mi_nota ?? -1) || a.nombre.localeCompare(b.nombre);
  if (orden === "precio") return (a.precio ?? 1e9) - (b.precio ?? 1e9) || a.nombre.localeCompare(b.nombre);
  return 0;
}

// Botella dibujada con el color del tipo y las iniciales del vino. Se usa
// mientras el vino no tenga foto.
function botella(v) {
  const iniciales = v.nombre.replace(/[«»"'.]/g, "").split(/\s+/)
    .filter((p) => /^[\p{Lu}\d]/u.test(p)).slice(0, 2).map((p) => p[0]).join("") || v.nombre[0];
  return `<svg class="botella ${esc(v.tipo)}" viewBox="0 0 40 110" aria-hidden="true">
    <path class="vidrio" d="M16 2h8v26c0 6 10 10 10 22v54a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4V50c0-12 10-16 10-22z"/>
    <rect class="capsula" x="15" y="2" width="10" height="16" rx="1.5"/>
    <rect class="etiqueta" x="9" y="60" width="22" height="28" rx="2"/>
    <text x="20" y="78" text-anchor="middle">${esc(iniciales.toUpperCase())}</text>
  </svg>`;
}

// La puntuación es texto libre («Peñín 92 · Vivino 3,9/5»). Se separa en
// notas de guías sobre 100, la nota de Vivino sobre 5 y el resto del texto.
// «Sin puntuación…» se descarta.
function leerPuntuacion(texto) {
  const res = { guias: [], vivino: null, otros: [] };
  for (const trozo of String(texto ?? "").split(/\s+·\s+/)) {
    const t = trozo.trim();
    if (!t || /^(aún )?sin puntuación/i.test(t)) continue;
    const viv = t.match(/^Vivino\s+(\d)[,.](\d)\s*\/\s*5/i);
    if (viv && !res.vivino) {
      res.vivino = { texto: t, nota: Number(`${viv[1]}.${viv[2]}`), cifra: `${viv[1]},${viv[2]}` };
      continue;
    }
    const critico = t.match(/^([\p{Lu}][\p{L}.' ]{1,24}?)\s+(\d{2,3}(?:[–-]\d{2,3})?\+?(?=\/100|\s|$)|\d{1,2}(?:[,.]\d)?\/20)(?:\/100)?(\s.*)?$/u);
    if (critico && !/\d/.test(critico[1])) {
      // Para ordenar, «89–91» cuenta como 91, «91+» como 91 y las notas
      // sobre 20 (Decanter) se pasan a 100 multiplicando por 5.
      const sobre20 = critico[2].endsWith("/20");
      const valor = sobre20 ? Number(critico[2].replace(",", ".").slice(0, -3)) * 5
        : Math.max(...critico[2].match(/\d+/g).map(Number));
      res.guias.push({ texto: t, guia: critico[1], nota: critico[2], valor });
      continue;
    }
    res.otros.push(t);
  }
  res.guias.sort((a, b) => b.valor - a.valor);
  return res;
}

const estrellas = (nota) => { const n = Math.round(nota); return "★".repeat(n) + "☆".repeat(5 - n); };

function puntuacionHtml(texto) {
  const { guias, vivino, otros } = leerPuntuacion(texto);
  return [
    ...guias.map((g) => `<span class="sello" title="${esc(g.texto)}"><b>${esc(g.nota)}</b><span>${esc(g.guia)}</span></span>`),
    vivino ? `<span class="vivino" title="${esc(vivino.texto)}"><span class="st" aria-hidden="true">${estrellas(vivino.nota)}</span><b>${vivino.cifra}</b> Vivino</span>` : "",
    ...otros.map((t) => `<span class="score">${esc(t)}</span>`),
  ].join("");
}

// La mejor nota del vino (la de la guía más alta o, si no hay, la de
// Vivino). Solo se ve en la lista compacta del móvil.
function mejorNotaHtml(texto) {
  const { guias, vivino } = leerPuntuacion(texto);
  const [g] = guias;
  if (g) return `<span class="sello mejor" title="${esc(guias.map((x) => x.texto).join(" · "))}"><b>${esc(g.nota)}</b><span>${esc(g.guia)}</span></span>`;
  if (vivino) return `<span class="sello mejor" title="${esc(vivino.texto)}"><b>${vivino.cifra}</b><span>Vivino</span></span>`;
  return "";
}

// «DOCa Rioja (Haro)» → «Rioja», para la lista compacta.
const denominacionCorta = (d) => String(d ?? "").replace(/\s*\(.*?\)\s*/g, " ")
  .replace(/^(DOCa|DOQ|DOCG|DOC|DOP|DO|AOC|AOP|IGP|VT|VdT|Vino de la Tierra( de)?)\s+/i, "").trim();

// Números a la española: 8,5 · 24 €. Con precio_url el precio lo ha buscado
// la app y es aproximado.
const cifra = (n) => Number(n).toLocaleString("es-ES", { maximumFractionDigits: 1 });
const precioTexto = (v) => (v.precio == null ? ""
  : `${v.precio_url ? "≈ " : ""}${Number(v.precio).toLocaleString("es-ES", { maximumFractionDigits: 2 })} €`);
const fechaTexto = (f) => (f ? new Date(`${f}T12:00`).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }) : "");
// Fecha de hoy en formato AAAA-MM-DD (hora local), para el campo de fecha.
const hoyIso = () => new Date().toLocaleDateString("sv-SE");

// Tu nota de un vino probado: la cifra dentro de un anillo que se llena
// según la nota sobre 10.
function miNotaHtml(n) {
  if (n == null) return `<span class="mi-nota vacia" aria-label="Sin tu nota"><b>—</b></span>`;
  return `<span class="mi-nota" style="--p:${Number(n) * 10}%" aria-label="Tu nota: ${cifra(n)} de 10"><b>${cifra(n)}</b></span>`;
}

// Marcador de la galería: dos casillas fijas, la mejor nota de las guías
// (con «+N» si hay más; todas están en la ficha) y la de Vivino, con un
// guion si falta. Así todas las tarjetas miden igual.
function marcadorHtml(texto) {
  const { guias, vivino } = leerPuntuacion(texto);
  const [mejor, ...resto] = guias;
  const casilla = (titulo, val, sub, vacia, title = "") =>
    `<div class="casilla${vacia ? " vacia" : ""}"${title ? ` title="${esc(title)}"` : ""}><span class="lbl">${titulo}</span><span class="val">${val}</span><span class="sub">${sub}</span></div>`;
  return `<div class="marcador">
    ${mejor
      ? casilla("Guías", `${esc(mejor.nota)}${resto.length ? `<small>+${resto.length}</small>` : ""}`,
        esc(mejor.guia), false, guias.map((g) => g.texto).join(" · "))
      : casilla("Guías", "—", "Sin nota", true)}
    ${vivino
      ? casilla("Vivino", vivino.cifra, `<span class="st" aria-hidden="true">${estrellas(vivino.nota)}</span>`, false, vivino.texto)
      : casilla("Vivino", "—", "Sin nota", true)}
  </div>`;
}

// Línea de tiempo de la ventana de consumo: de la añada (o el inicio de la
// ventana) al final de la ventana, con el tramo bueno y la marca de hoy.
function lineaHtml(v) {
  const w = leerVentana(v.ventana);
  if (!w) return "";
  const ahora = new Date();
  const ano = ahora.getFullYear();
  const hoy = ano + (ahora - new Date(ano, 0, 1)) / (365.25 * 864e5);
  const fin = w.hasta ?? Math.max(w.desde + 8, ano + 3);
  const inicio = Math.min(v.anada ?? w.desde ?? ano, w.desde ?? Infinity, ano, fin);
  const total = Math.max(fin + 1, hoy) - inicio;
  const pos = (x) => `${(((x - inicio) / total) * 100).toFixed(1)}%`;
  const desde = w.desde ?? inicio;
  // Años bajo la barra: el inicio, el comienzo de la ventana si cae en medio y el final.
  const ejes = [[inicio, inicio, "ini"]];
  if (w.desde > inicio && w.desde < fin) ejes.push([w.desde, w.desde, ""]);
  if (fin > inicio) ejes.push([fin, fin + 1, "fin"]);
  return `<div class="linea ${esc(v.estado ?? "")}" aria-hidden="true">
    <div class="barra">
      <span class="tramo${w.hasta == null ? " abierto" : ""}" style="left:${pos(desde)};width:calc(${pos(fin + 1)} - ${pos(desde)})"></span>
      <span class="hoy" style="left:${pos(hoy)}" title="Hoy"></span>
    </div>
    <div class="ejes">${ejes.map(([a, x, clase]) => `<span class="${clase}" style="left:${pos(x)}">${a}</span>`).join("")}</div>
  </div>`;
}

function filaVino(v) {
  if (esProbado(v)) return filaProbado(v);
  const meta = [v.bodega, v.denominacion, v.pais].filter(Boolean).join(" · ");
  const metaCorta = [v.bodega, denominacionCorta(v.denominacion)].filter(Boolean).join(" · ");
  // En la lista compacta del móvil solo se ve el estado, sin la ventana.
  const ventana = v.estado ? `${ESTADOS[v.estado]}${v.ventana ? `<span class="w-vent"> · ${esc(v.ventana)}</span>` : ""}` : esc(v.ventana ?? "");
  const puntos = puntuacionHtml(v.puntuacion) + mejorNotaHtml(v.puntuacion);
  return `
    <li class="wine${v.botellas === 0 ? " agotado" : ""}" data-id="${v.id}">
      <div class="foto ${esc(v.tipo)}" data-ficha>${imagen(v)}<span class="qty" aria-hidden="true">×${v.botellas}</span></div>
      <div class="main" data-ficha>
        <p class="name">${esc(v.nombre)}<span class="anada">${v.anada ?? "s/a"}</span></p>
        ${meta ? `<p class="meta larga">${esc(meta)}</p>` : ""}
        ${metaCorta ? `<p class="meta corta">${esc(metaCorta)}</p>` : ""}
        ${v.uvas ? `<p class="meta uvas">${esc(v.uvas)}</p>` : ""}
        ${ventana || puntos ? `<p class="eval">
          ${ventana ? `<span class="win ${esc(v.estado ?? "")}">${ventana}</span>` : ""}
          ${puntos}
        </p>` : ""}
        ${v.botellas > 0 ? lineaHtml(v) : ""}
      </div>
      ${marcadorHtml(v.puntuacion)}
      <div class="stock-col"><div class="stock">
        <button class="step" type="button" data-delta="-1" aria-label="Quitar una botella" ${v.botellas === 0 ? "disabled" : ""}>−</button>
        <span class="n" aria-label="${v.botellas} ${v.botellas === 1 ? "botella" : "botellas"}">${v.botellas}</span>
        <button class="step" type="button" data-delta="1" aria-label="Añadir una botella">+</button>
      </div></div>
    </li>`;
}

// Fila (o tarjeta) de un vino probado: dónde y cuándo, el precio y tu nota
// en lugar de la ventana y las botellas.
function filaProbado(v) {
  const meta = [v.bodega, v.denominacion, v.pais].filter(Boolean).join(" · ");
  const metaCorta = [v.bodega, denominacionCorta(v.denominacion)].filter(Boolean).join(" · ");
  const donde = [v.lugar, fechaTexto(v.fecha_probado)].filter(Boolean).join(" · ");
  const precio = precioTexto(v);
  const puntos = puntuacionHtml(v.puntuacion) + mejorNotaHtml(v.puntuacion);
  const casilla = (titulo, val, sub, vacia) =>
    `<div class="casilla${vacia ? " vacia" : ""}"><span class="lbl">${titulo}</span><span class="val">${val}</span><span class="sub">${sub}</span></div>`;
  return `
    <li class="wine probado" data-id="${v.id}">
      <div class="foto ${esc(v.tipo)}" data-ficha>${imagen(v)}</div>
      <div class="main" data-ficha>
        <p class="name">${esc(v.nombre)}<span class="anada">${v.anada ?? "s/a"}</span></p>
        ${meta ? `<p class="meta larga">${esc(meta)}</p>` : ""}
        ${metaCorta ? `<p class="meta corta">${esc(metaCorta)}</p>` : ""}
        ${v.uvas ? `<p class="meta uvas">${esc(v.uvas)}</p>` : ""}
        ${donde ? `<p class="meta donde"><svg aria-hidden="true"><use href="#i-copa"/></svg><span>${esc(donde)}</span></p>` : ""}
        ${precio || puntos ? `<p class="eval">
          ${precio ? `<span class="precio" title="${v.precio_url ? "Precio aproximado de la botella en tiendas" : "Precio de la botella"}">${precio}</span>` : ""}
          ${puntos}
        </p>` : ""}
      </div>
      <div class="marcador">
        ${v.mi_nota != null ? casilla("Tu nota", cifra(v.mi_nota), "de 10", false) : casilla("Tu nota", "—", "Sin nota", true)}
        ${precio ? casilla("Precio", esc(precio.replace("≈ ", "")), v.precio_url ? "aprox. en tiendas" : "la botella", false)
          : casilla("Precio", "—", "Sin precio", true)}
      </div>
      <div class="nota-col" data-ficha>${miNotaHtml(v.mi_nota)}</div>
    </li>`;
}

// Ficha del vino: panel que sube desde abajo en el móvil y entra por la
// derecha en el ordenador.
function pintarFicha() {
  const v = vinos.find((x) => x.id === fichaId);
  if (!v) { if ($("#ficha").open) $("#ficha").close(); return; }
  const meta = [v.bodega, v.denominacion, v.pais].filter(Boolean).join(" · ");
  const ventana = v.estado ? `${ESTADOS[v.estado]}${v.ventana ? " · " + v.ventana : ""}` : v.ventana;
  const puntos = puntuacionHtml(v.puntuacion);
  if (esProbado(v)) return pintarFichaProbado(v, meta, puntos);
  $("#ficha").innerHTML = `
    <div class="ficha-cuerpo">
      <span class="asa" aria-hidden="true"></span>
      <button class="btn ghost icono cerrar" type="button" data-cerrar aria-label="Cerrar"><svg aria-hidden="true"><use href="#i-cerrar"/></svg></button>
      <div class="foto ficha-foto ${esc(v.tipo)}">${imagen(v)}</div>
      <div class="ficha-texto">
        <h2 class="ficha-nombre">${esc(v.nombre)}<span class="anada">${v.anada ?? "s/a"}</span></h2>
        ${meta ? `<p class="meta">${esc(meta)}</p>` : ""}
        ${v.uvas ? `<p class="meta uvas">${esc(v.uvas)}</p>` : ""}
        ${ventana || puntos ? `<p class="eval">${ventana ? `<span class="win ${esc(v.estado ?? "")}">${esc(ventana)}</span>` : ""}${puntos}</p>` : ""}
        ${lineaHtml(v)}
        ${notasHtml(v)}
        ${v.cata ? `<div class="ficha-bloque"><h3>Nota de cata</h3><p class="cata">${esc(v.cata)}</p></div>` : ""}
        ${v.notas ? `<div class="ficha-bloque"><h3>Notas</h3><p>${esc(v.notas)}</p></div>` : ""}
      </div>
      <div class="ficha-acciones">
        <div class="stock">
          <button class="step" type="button" data-delta="-1" aria-label="Quitar una botella" ${v.botellas === 0 ? "disabled" : ""}>−</button>
          <span class="n" aria-label="${v.botellas} ${v.botellas === 1 ? "botella" : "botellas"}">${v.botellas}</span>
          <button class="step" type="button" data-delta="1" aria-label="Añadir una botella">+</button>
        </div>
        <span class="sp"></span>
        <button class="btn ghost editar" type="button" data-editar><svg aria-hidden="true"><use href="#i-editar"/></svg>Editar</button>
        <button class="btn primary abrir" type="button" data-abrir ${v.botellas === 0 ? "disabled" : ""}><svg aria-hidden="true"><use href="#i-copa"/></svg>Abrir una</button>
      </div>
    </div>`;
}

function pintarFichaProbado(v, meta, puntos) {
  const precio = precioTexto(v);
  const fecha = fechaTexto(v.fecha_probado);
  $("#ficha").innerHTML = `
    <div class="ficha-cuerpo">
      <span class="asa" aria-hidden="true"></span>
      <button class="btn ghost icono cerrar" type="button" data-cerrar aria-label="Cerrar"><svg aria-hidden="true"><use href="#i-cerrar"/></svg></button>
      <div class="foto ficha-foto ${esc(v.tipo)}">${imagen(v)}</div>
      <div class="ficha-texto">
        <h2 class="ficha-nombre">${esc(v.nombre)}<span class="anada">${v.anada ?? "s/a"}</span></h2>
        ${meta ? `<p class="meta">${esc(meta)}</p>` : ""}
        ${v.uvas ? `<p class="meta uvas">${esc(v.uvas)}</p>` : ""}
        ${puntos ? `<p class="eval">${puntos}</p>` : ""}
        <div class="ficha-probado">
          ${miNotaHtml(v.mi_nota)}
          <div>
            <p class="donde">${v.lugar ? esc(v.lugar) : "Sin lugar"}</p>
            ${fecha ? `<p class="meta">${esc(fecha)}</p>` : ""}
            ${precio ? `<p class="meta">${esc(precio)} la botella${v.precio_url && /^https?:\/\//.test(v.precio_url)
              ? ` · <a href="${esc(v.precio_url)}" target="_blank" rel="noopener">ver tienda</a>` : ""}</p>` : ""}
          </div>
        </div>
        ${notasHtml(v)}
        ${v.cata ? `<div class="ficha-bloque"><h3>Nota de cata</h3><p class="cata">${esc(v.cata)}</p></div>` : ""}
        ${v.notas ? `<div class="ficha-bloque"><h3>Notas</h3><p>${esc(v.notas)}</p></div>` : ""}
      </div>
      <div class="ficha-acciones">
        <button class="btn ghost editar" type="button" data-editar><svg aria-hidden="true"><use href="#i-editar"/></svg>Editar</button>
        <span class="sp"></span>
        <button class="btn primary pasar" type="button" data-pasar><svg aria-hidden="true"><use href="#i-bodega"/></svg>Añadir a la bodega</button>
      </div>
    </div>`;
}

// Fuentes de las puntuaciones (enlaces) y botón para volver a buscarlas.
function notasHtml(v) {
  const fuentes = Array.isArray(v.puntuacion_fuentes) ? v.puntuacion_fuentes.filter((f) => /^https?:\/\//.test(f.url)) : [];
  const puede = store.puntuaciones && !soloVer();
  if (!fuentes.length && !puede) return "";
  const buscando = buscandoNotas.has(v.id);
  return `<div class="ficha-bloque notas-fuentes"><h3>Puntuaciones</h3>
    ${fuentes.length ? `<p class="meta">${fuentes.map((f) =>
      `<a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.fuente)} ${esc(f.nota)}</a>`).join(" · ")}</p>` : ""}
    ${puede ? `<button class="btn ghost" type="button" data-puntuaciones ${buscando ? "disabled" : ""}>${
      buscando ? "Buscando en la web…" : esProbado(v) ? "Buscar puntuaciones y precio en la web" : "Buscar puntuaciones en la web"}</button>` : ""}
  </div>`;
}

// Busca las notas de guías y Vivino de un vino (tarda entre 30 s y 2 min).
async function buscarPuntuaciones(id) {
  if (buscandoNotas.has(id)) return;
  buscandoNotas.add(id);
  if (fichaId === id) pintarFicha();
  try {
    const { vino, encontradas, precio } = await store.puntuaciones.buscar(id);
    vinos = vinos.map((x) => (x.id === vino.id ? vino : x));
    toast((encontradas ? `${vino.nombre}: ${encontradas} ${encontradas === 1 ? "puntuación" : "puntuaciones"} encontradas`
      : `${vino.nombre}: no hay puntuaciones publicadas de esta añada`) + (precio ? ` · botella ≈ ${precio} €` : ""));
  } catch (err) {
    toast("No se pudieron buscar las puntuaciones: " + (err.message || err));
  } finally {
    buscandoNotas.delete(id);
    render();
  }
}

function abrirFicha(v) {
  fichaId = v.id;
  pintarFicha();
  const d = $("#ficha");
  if (!d.open) d.showModal();
  d.querySelector(".ficha-cuerpo").scrollTop = 0;
  // El foco va al panel y no al botón de cerrar, para que no salga resaltado.
  d.focus();
}

function render() {
  const probados = pestana === "probados";
  const actuales = vinos.filter(enPestana);
  const enStock = actuales.filter((v) => v.botellas > 0);
  // En la bodega se cuentan botellas; en los probados, vinos.
  const botellas = (lista) => (probados ? lista.length : lista.reduce((s, v) => s + v.botellas, 0));
  const porTipo = TIPOS.map(([t, nombre]) => [t, nombre, botellas(actuales.filter((v) => v.tipo === t))]).filter(([, , n]) => n);
  const pronto = probados ? 0 : enStock.filter((v) => v.estado === "ya" || v.estado === "urg").length;
  const total = botellas(actuales);
  const notas = actuales.filter((v) => v.mi_nota != null).map((v) => Number(v.mi_nota));
  const media = notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : null;
  const resumenBotellas = probados
    ? `${total === 1 ? "vino probado" : "vinos probados"}${media != null ? ` · nota media ${cifra(Math.round(media * 10) / 10)}` : ""}`
    : `${total === 1 ? "botella" : "botellas"} · ${enStock.length} ${enStock.length === 1 ? "vino" : "vinos"}`;
  // En el resumen plegado del móvil hay menos sitio.
  const resumenCorto = probados ? `${total === 1 ? "probado" : "probados"}${media != null ? ` · media ${cifra(Math.round(media * 10) / 10)}` : ""}` : resumenBotellas;
  for (const b of document.querySelectorAll("#pestanas [data-pestana]")) {
    b.querySelector(".num").textContent = vinos.filter((v) => listaDe(v) === b.dataset.pestana).length || "";
  }
  $("#resumen").classList.toggle("abierto", resumenAbierto);
  $("#resumen").innerHTML = actuales.length ? `
    <button type="button" class="plegar" aria-expanded="${resumenAbierto}" aria-label="${resumenAbierto ? "Plegar" : "Desplegar"} el resumen">
      <span class="total">${total}<small>${resumenCorto}</small></span>
      <span class="mini" aria-hidden="true">${porTipo.map(([t, , n]) => `<span><span class="dot ${t}"></span>${n}</span>`).join("")}</span>
      <svg class="flecha" aria-hidden="true"><use href="#i-flecha"/></svg>
    </button>
    <p class="total">${total}<small>${resumenBotellas}</small></p>
    ${total ? `<div class="compo" role="img" aria-label="${porTipo.map(([t, nombre, n]) => `${n} ${n === 1 ? t : nombre.toLowerCase()}`).join(", ")}">
      ${porTipo.map(([t, nombre, n]) => `<span class="${t}${filtro === t ? " activo" : ""}" style="flex:${n}" data-tipo="${t}" title="Ver ${nombre.toLowerCase()}"></span>`).join("")}</div>` : ""}
    <ul class="tally${porTipo.some(([t]) => t === filtro) ? " filtrado" : ""}">${porTipo.map(([t, nombre, n]) =>
      `<li><button type="button" class="${t}" data-tipo="${t}" aria-pressed="${filtro === t}" aria-label="Ver ${nombre.toLowerCase()}"><b>${n}</b><span><span class="dot ${t}"></span>${n === 1 ? t : nombre.toLowerCase()}</span></button></li>`).join("")}</ul>
    ${pronto ? `<button class="alerta" type="button" id="btn-pronto">
      <svg aria-hidden="true"><use href="#i-reloj"/></svg>
      <span class="largo">${pronto === 1 ? "1 vino conviene beberlo" : `${pronto} vinos conviene beberlos`} antes de que acabe ${new Date().getFullYear() + 1}</span>
      <span class="corto">${pronto} para beber pronto</span>
      <span class="ir">Ver</span></button>` : ""}` : "";

  for (const c of document.querySelectorAll("#filtros .chip")) {
    c.querySelector(".num").textContent = actuales.filter((v) => pasaFiltro(v, c.dataset.filter)).length || "";
  }

  $("#vacio").hidden = probados || actuales.length > 0;
  $("#vacio-probados").hidden = !probados || actuales.length > 0;
  $(".controles").hidden = probados && !actuales.length;

  const visibles = actuales.filter((v) => pasaFiltro(v) && pasaBusqueda(v));
  if (!probados && filtro !== "agotados" && !busqueda) {
    // Por defecto los agotados van al final de cada grupo.
    visibles.sort((a, b) => (a.botellas === 0) - (b.botellas === 0));
  }

  let html;
  if (orden === "tipo") {
    html = TIPOS.map(([t, nombre]) => {
      const grupo = visibles.filter((v) => v.tipo === t);
      if (!grupo.length) return "";
      const n = botellas(grupo);
      return `<section class="grupo ${t}"><h2>${nombre} <span class="count">${n} ${probados ? (n === 1 ? "vino" : "vinos") : "botellas"}</span></h2>
        <ol class="ledger">${grupo.map(filaVino).join("")}</ol></section>`;
    }).join("");
  } else {
    const ordenados = [...visibles].sort(comparar);
    html = ordenados.length ? `<section class="grupo"><ol class="ledger">${ordenados.map(filaVino).join("")}</ol></section>` : "";
  }
  $("#lista").innerHTML = html || (actuales.length ? sinResultadosHtml() : "");
  $("#lista").classList.toggle("galeria", vista === "galeria");
  for (const b of document.querySelectorAll(".vista")) b.setAttribute("aria-pressed", String(b.dataset.vista === vista));
  if ($("#ficha").open) pintarFicha();
}

// Aviso cuando ningún vino pasa el filtro y la búsqueda, con lo que se
// buscó y un botón para volver a toda la bodega.
const SIN_FILTRO = {
  tinto: "Ningún tinto", blanco: "Ningún blanco", espumoso: "Ningún espumoso", rosado: "Ningún rosado",
  ya: "Ningún vino para beber ya", guardar: "Ningún vino para guardar", agotados: "Ningún vino agotado",
  favoritos: "Ningún vino con un 8 o más",
};
function sinResultadosHtml() {
  const texto = $("#buscar").value.trim();
  const base = SIN_FILTRO[filtro] ?? "Ningún vino";
  const titulo = texto ? `${base} con «${esc(texto)}»` : base;
  const consejo = texto && filtro !== "todo" ? `Prueba con otra palabra o busca en ${pestana === "probados" ? "todos los probados" : "toda la bodega"}.`
    : texto ? "Prueba con otra palabra: el nombre, la bodega, la uva o el país." : "Elige otro filtro para ver el resto.";
  return `<div class="sin-resultados">
    <span class="ico" aria-hidden="true"><svg><use href="#i-buscar"/></svg></span>
    <h3>${titulo}</h3>
    <p>${consejo}</p>
    <button class="btn primary" type="button" data-quitar-filtros>Quitar filtros</button>
  </div>`;
}

function quitarFiltros() {
  $("#buscar").value = "";
  busqueda = "";
  elegirFiltro("todo");
}

// ---- Fotos ----
function imagen(v) {
  if (!v.imagen_url) return botella(v);
  const clase = estaNormalizada(v.imagen_url) ? "norm" : "orig";
  return `<img class="${clase}" src="${esc(v.imagen_url)}" alt="" loading="lazy">`;
}

function pintarFotoActual(v) {
  $("#foto-actual").className = `foto-grande ${v.tipo}`;
  $("#foto-actual").innerHTML = imagen(v);
}

// Quita el fondo y centra la botella en el lienzo común. Devuelve null si ha
// ido bien o el mensaje de error; si falla, el vino conserva la foto original.
async function igualarFoto(v, progreso) {
  try {
    const blob = await normalizar(v.imagen_url, { progreso });
    ponerFoto(v.id, await store.fotos.subir(v.id, blob));
    render();
    return null;
  } catch (err) {
    console.warn("No se pudo igualar", v.nombre, err);
    return err.message || String(err);
  }
}

async function igualarTodas() {
  const pendientes = vinos.filter((v) => v.imagen_url && !estaNormalizada(v.imagen_url));
  if (!pendientes.length) return toast("Todas las fotos están igualadas");
  const fallos = [];
  for (const [i, v] of pendientes.entries()) {
    const paso = `Igualando fotos… ${i + 1} de ${pendientes.length}`;
    toast(paso, true);
    const error = await igualarFoto(v, (msg) => toast(`${paso} · ${msg}`, true));
    if (error) fallos.push(`${v.nombre}: ${error}`);
    if (fallos.length === 3 && i === 2) {
      toast("No se pudieron igualar las fotos");
      return avisar("No se pudieron igualar las fotos. Error: " + error);
    }
  }
  toast(`${pendientes.length - fallos.length} fotos igualadas` + (fallos.length ? `, ${fallos.length} con error` : ""));
  if (fallos.length) avisar(`Sin igualar (${fallos.length}): ` + fallos.join(" · "));
}

function ponerFoto(id, imagen_url) {
  const v = vinos.find((x) => x.id === id);
  if (v) v.imagen_url = imagen_url;
  return v;
}

function botonesFoto(v) {
  const igualada = estaNormalizada(v?.imagen_url);
  $("#btn-quitar-fondo").hidden = !v?.imagen_url || igualada;
  $("#btn-volver-original").hidden = !igualada;
}

// Quita el fondo de la foto del vino abierto y enseña el resultado antes de guardarlo.
async function quitarFondo() {
  const vino = editando;
  const estado = $("#fotos-estado");
  estado.textContent = "Quitando el fondo… (la primera vez tarda en descargar la herramienta)";
  try {
    const blob = await normalizar(vino.imagen_url, { progreso: (msg) => (estado.textContent = msg) });
    const vista = URL.createObjectURL(blob);
    $("#foto-actual").innerHTML = `<img class="norm" src="${vista}" alt="">`;
    estado.textContent = "¿Te gusta así?";
    $("#candidatas").innerHTML = `<div class="decidir">
      <button class="btn primary" type="button" data-si>Guardar así</button>
      <button class="btn ghost" type="button" data-no>Dejar la original</button></div>`;
    $("#candidatas").onclick = async (e) => {
      if (e.target.closest("[data-no]")) {
        $("#candidatas").innerHTML = "";
        pintarFotoActual(vino);
        estado.textContent = "";
        return;
      }
      if (!e.target.closest("[data-si]")) return;
      estado.textContent = "Guardando…";
      try {
        pintarFotoActual(ponerFoto(vino.id, await store.fotos.subir(vino.id, blob)));
        $("#candidatas").innerHTML = "";
        botonesFoto(vinos.find((x) => x.id === vino.id));
        render();
        estado.textContent = "Guardada. La original se conserva por si quieres volver a ella.";
      } catch (err) { estado.textContent = "No se pudo guardar: " + err.message; }
    };
  } catch (err) {
    pintarFotoActual(vino);
    estado.textContent = "No se pudo quitar el fondo: " + err.message;
  }
}

async function volverOriginal() {
  const vino = editando;
  const estado = $("#fotos-estado");
  estado.textContent = "Recuperando la original…";
  try {
    pintarFotoActual(ponerFoto(vino.id, await store.fotos.original(vino.id)));
    botonesFoto(vinos.find((x) => x.id === vino.id));
    render();
    estado.textContent = "Has vuelto a la foto original.";
  } catch (err) { estado.textContent = err.message; }
}

// Deshace todas las fotos igualadas. Las igualadas antes de que se guardara la
// original (primera versión) ya no la tienen: para esas se busca una foto nueva.
async function recuperarOriginales() {
  const pendientes = vinos.filter((v) => estaNormalizada(v.imagen_url));
  if (!pendientes.length) return toast("No hay fotos igualadas");
  const fallos = [];
  for (const [i, v] of pendientes.entries()) {
    toast(`Recuperando fotos… ${i + 1} de ${pendientes.length}`, true);
    try {
      ponerFoto(v.id, await store.fotos.original(v.id));
    } catch {
      try { ponerFoto(v.id, await store.fotos.auto(v.id)); } catch (err) { fallos.push(`${v.nombre}: ${err.message}`); }
    }
    render();
  }
  toast(`${pendientes.length - fallos.length} fotos recuperadas`);
  if (fallos.length) avisar(`Sin recuperar (${fallos.length}): ` + fallos.join(" · "));
}

async function buscarFotos() {
  const vino = editando;
  const estado = $("#fotos-estado");
  estado.textContent = "Buscando…";
  $("#candidatas").innerHTML = "";
  try {
    const candidatas = await store.fotos.buscar(vino.id);
    estado.textContent = candidatas.length ? "Elige una:" : "No he encontrado fotos.";
    $("#candidatas").innerHTML = candidatas.map((c, i) =>
      `<button class="candidata" type="button" data-i="${i}" title="${esc(c.titulo)}">
        <img src="${esc(c.miniatura)}" alt="${esc(c.titulo)}" loading="lazy" referrerpolicy="no-referrer">
      </button>`).join("");
    $("#candidatas").onclick = async (e) => {
      const b = e.target.closest(".candidata");
      if (!b) return;
      const c = candidatas[Number(b.dataset.i)];
      estado.textContent = "Guardando…";
      try {
        // Si la original no se deja descargar, guardamos la miniatura.
        const url = await store.fotos.guardar(vino.id, c.url).catch(() => store.fotos.guardar(vino.id, c.miniatura));
        pintarFotoActual(ponerFoto(vino.id, url));
        $("#candidatas").innerHTML = "";
        render();
        botonesFoto(vinos.find((x) => x.id === vino.id));
        estado.textContent = "Foto guardada.";
      } catch (err) { estado.textContent = "No se pudo guardar: " + err.message; }
    };
  } catch (err) {
    estado.textContent = "No se pudo buscar: " + err.message;
  }
}

// Devuelve null si ha guardado la foto, o el mensaje de error.
async function fotoAutomatica(id) {
  try {
    ponerFoto(id, await store.fotos.auto(id));
    render();
    return null;
  } catch (err) {
    console.warn("Sin foto para", id, err);
    return err.message || String(err);
  }
}

// Foto de un vino nuevo: la busca en la web y le quita el fondo, igual que
// en la bodega. Si no encuentra ninguna y hay una foto propia (la hecha al
// añadir un probado), usa esa. Devuelve null si ha ido bien o el error.
async function fotoYFondo(id, fotoPropia = null) {
  let error = await fotoAutomatica(id);
  if (error && fotoPropia) {
    try {
      ponerFoto(id, await store.fotos.propia(id, fotoPropia));
      error = null;
    } catch (err) { return err.message || String(err); }
  }
  if (error) return error;
  const v = vinos.find((x) => x.id === id);
  if (v?.imagen_url && !estaNormalizada(v.imagen_url)) {
    const sinFondo = await igualarFoto(v);
    if (sinFondo) console.warn("Foto guardada con fondo:", v.nombre, sinFondo);
  }
  return null;
}

// Vinos sin foto (p. ej. los que añade Claude desde el chat): al abrir la
// app se les busca foto y se les quita el fondo, de uno en uno y sin
// estorbar. Los que no tienen foto en la web no se vuelven a buscar en este
// navegador; «Buscar las fotos que faltan» los sigue intentando.
const CLAVE_SIN_FOTO = "bodega-sin-foto";
function sinFotoConocidos() {
  try { return new Set(JSON.parse(localStorage.getItem(CLAVE_SIN_FOTO)) ?? []); } catch { return new Set(); }
}
async function completarFotos() {
  if (!store.fotos || soloVer()) return;
  const conocidos = sinFotoConocidos();
  const pendientes = vinos.filter((v) => !v.imagen_url && !conocidos.has(v.id));
  if (!pendientes.length) return;
  let hechas = 0;
  for (const [i, v] of pendientes.entries()) {
    toast(`Buscando fotos de los vinos nuevos… ${i + 1} de ${pendientes.length}`, true);
    const error = await fotoYFondo(v.id);
    if (error) conocidos.add(v.id);
    else hechas++;
    // Si las tres primeras fallan, el problema es de configuración: parar.
    if (!hechas && i === 2) break;
  }
  try { localStorage.setItem(CLAVE_SIN_FOTO, JSON.stringify([...conocidos])); } catch {}
  toast(hechas ? `${hechas} ${hechas === 1 ? "foto nueva" : "fotos nuevas"}, sin fondo` : "No se encontraron fotos para los vinos nuevos");
}

function avisar(msg) {
  const aviso = $("#aviso-demo");
  aviso.textContent = msg;
  aviso.hidden = false;
}

async function fotosQueFaltan() {
  const pendientes = vinos.filter((v) => !v.imagen_url);
  if (!pendientes.length) return toast("Todos los vinos tienen foto");
  let hechas = 0;
  const fallos = [];
  for (const [i, v] of pendientes.entries()) {
    const paso = `Buscando fotos… ${i + 1} de ${pendientes.length} · ${hechas} guardadas`;
    toast(paso, true);
    const error = await fotoYFondo(v.id);
    if (error) fallos.push(`${v.nombre}: ${error}`);
    else hechas++;
    // Si las tres primeras fallan, el problema es de configuración: parar y enseñarlo.
    if (!hechas && fallos.length === 3) {
      toast("No se pudo buscar fotos");
      return avisar("No se pudo buscar fotos. Error: " + error);
    }
  }
  toast(`${hechas} fotos nuevas` + (fallos.length ? `, ${fallos.length} sin encontrar` : ""));
  if (fallos.length) avisar(`Sin foto (${fallos.length}): ` + fallos.join(" · "));
}

// ---- Edición ----
// Nombres de los campos del formulario (los botones de tipo y de cuándo
// beber son grupos de radios con un solo nombre).
const nombresCampos = (f) => [...new Set([...f.elements].map((el) => el.name).filter(Boolean))];

// Cuando un campo es un grupo de botones, el resaltado va en el grupo.
const cajaCampo = (el) => el.closest("[data-campo]") ?? el;

// Texto breve de cada sección del formulario, para verlo con ella plegada.
// Cada sección dice en data-resumen qué campos resume.
function resumirSecciones() {
  const f = $("#form-vino");
  const texto = (n) => {
    const val = f.elements[n].value.trim();
    if (n === "estado") return ESTADOS[val];
    if (n === "mi_nota") return notaVacia() ? "" : `${cifra(val)}/10`;
    if (n === "precio") return val && `${cifra(val)} €`;
    return val;
  };
  for (const d of f.querySelectorAll("details[data-resumen]")) {
    d.querySelector(".resumen-sec").textContent = d.dataset.resumen.split(" ").map(texto).filter(Boolean).join(" · ");
  }
}

// Deslizador de tu nota (0–10, de medio en medio). Hasta que se toca, el
// vino queda «sin nota».
const notaVacia = () => $("#f-nota").hasAttribute("data-vacia");
function ponerNota(n) {
  const r = $("#f-nota");
  r.toggleAttribute("data-vacia", n == null || n === "");
  if (n != null && n !== "") r.value = n;
  pintarNota();
}
function pintarNota() {
  const r = $("#f-nota");
  const vacia = notaVacia();
  $("#nota-valor").textContent = vacia ? "Sin nota" : cifra(r.value);
  $("#btn-quitar-nota").hidden = vacia || r.disabled;
  r.closest(".campo-nota").classList.toggle("vacia", vacia);
  r.style.setProperty("--p", `${Number(r.value) * 10}%`);
}

function abrirDialogo(vino) {
  editando = vino;
  const lista = vino ? listaDe(vino) : pestana;
  const f = $("#form-vino");
  f.reset();
  $("#dlg-titulo").textContent = vino ? "Editar vino" : lista === "probados" ? "Nuevo vino probado" : "Nuevo vino";
  $("#btn-borrar").hidden = !vino;
  if (vino) for (const n of nombresCampos(f)) f.elements[n].value = vino[n] ?? "";
  else f.elements.fecha_probado.value = hoyIso();
  fotoNueva = null;
  $("#etiqueta-vista").hidden = true;
  estadoPrevio = f.elements.estado.value;
  for (const d of f.querySelectorAll("details[data-plegable]")) d.open = false;
  resumirSecciones();
  $("#fotos-bloque").hidden = !vino || !store.fotos || soloVer();
  $("#etiqueta-bloque").hidden = !!vino || !store.etiqueta || soloVer();
  $("#etiqueta-estado").textContent = "";
  for (const el of f.querySelectorAll(".sugerido")) el.classList.remove("sugerido");
  // Los campos de la otra lista (botellas y cuándo beber, o nota, lugar y
  // precio) se desactivan para que no se guarden.
  for (const el of f.elements) {
    if (!el.name) continue;
    const solo = el.closest("[data-solo]")?.dataset.solo;
    el.disabled = soloVer() || (solo != null && solo !== lista);
  }
  ponerNota(vino?.mi_nota);
  $("#btn-guardar").hidden = soloVer();
  if (soloVer()) $("#btn-borrar").hidden = true;
  $("#candidatas").innerHTML = "";
  $("#fotos-estado").textContent = "";
  if (vino) pintarFotoActual(vino);
  botonesFoto(vino);
  $("#dlg").showModal();
}

// Reduce la foto (lado mayor 1200 px, JPEG) para que suba rápido y cueste menos.
async function reducirFoto(file) {
  let bmp;
  try { bmp = await createImageBitmap(file); } catch {
    throw new Error("Este navegador no puede abrir esa foto. Prueba con una en JPEG.");
  }
  const escala = Math.min(1, 1200 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * escala);
  c.height = Math.round(bmp.height * escala);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.85));
}

async function leerEtiqueta(file) {
  const estado = $("#etiqueta-estado");
  const boton = $("#btn-etiqueta");
  boton.disabled = true;
  estado.textContent = "Claude está leyendo la etiqueta… (unos segundos)";
  try {
    const foto = await reducirFoto(file);
    // En los probados se guarda la foto hecha por si no se encuentra otra en la web.
    if (pestana === "probados") {
      fotoNueva = foto;
      const vista = $("#etiqueta-vista");
      URL.revokeObjectURL(vista.src);
      vista.src = URL.createObjectURL(foto);
      vista.hidden = false;
    }
    const { vino, aviso } = await store.etiqueta.leer(foto);
    const f = $("#form-vino");
    for (const [k, valor] of Object.entries(vino)) {
      const el = f.elements[k];
      if (!el || valor === null || valor === "") continue;
      el.value = valor;
      const caja = cajaCampo(el instanceof RadioNodeList ? el[0] : el);
      caja.classList.add("sugerido");
      // Abre las secciones con datos nuevos para que se puedan revisar.
      const seccion = caja.closest("details");
      if (seccion) seccion.open = true;
    }
    estadoPrevio = f.elements.estado.value;
    resumirSecciones();
    estado.textContent = (pestana === "probados"
      ? "Revisa los datos, pon tu nota y dónde lo has probado. Al guardar, la app busca sus puntuaciones y el precio en la web."
      : "Revisa los datos antes de guardar. La cata, la ventana y cuándo beber son sugerencias de Claude. Al guardar, la app busca sus puntuaciones en la web.")
      + (aviso ? " Ojo: " + aviso : "");
  } catch (err) {
    estado.textContent = "No se pudo leer: " + (err.message || err);
  } finally {
    boton.disabled = false;
  }
}

function leerFormulario() {
  const datos = Object.fromEntries(new FormData($("#form-vino")));
  for (const k in datos) datos[k] = datos[k].trim() || null;
  // Sin ningún botón de cuándo beber marcado, el estado queda vacío.
  datos.estado ??= null;
  datos.anada = datos.anada ? parseInt(datos.anada, 10) : null;
  datos.botellas = Math.max(0, parseInt(datos.botellas ?? "0", 10) || 0);
  // Los campos de los probados solo llegan si están activos.
  if ("mi_nota" in datos) datos.mi_nota = notaVacia() ? null : Number(datos.mi_nota);
  if ("precio" in datos) datos.precio = datos.precio == null ? null : Number(datos.precio);
  return datos;
}

async function guardar(e) {
  e.preventDefault();
  const datos = leerFormulario();
  // Un precio cambiado a mano deja de ser el aproximado que buscó la app.
  if (editando && "precio" in datos && datos.precio !== (editando.precio == null ? null : Number(editando.precio))) datos.precio_url = null;
  try {
    if (editando) {
      const v = await store.actualizar(editando.id, datos);
      vinos = vinos.map((x) => (x.id === v.id ? v : x));
    } else {
      // La lista solo se manda en los probados: en la bodega vale la de por defecto.
      if (pestana === "probados") datos.lista = "probados";
      else datos.estado = estadoSegunVentana(datos.ventana) ?? datos.estado;
      const nuevo = await store.crear(datos);
      vinos.push(nuevo);
      // Se busca la foto en la web y se le quita el fondo; la que hayas hecho
      // tú solo se usa si no se encuentra ninguna.
      if (store.fotos) fotoYFondo(nuevo.id, fotoNueva).then((e) => e && toast("Sin foto: " + e));
      if (store.puntuaciones) buscarPuntuaciones(nuevo.id);
    }
    $("#dlg").close();
    render();
    toast(editando ? "Guardado" : pestana === "probados" ? "Vino probado añadido" : "Vino añadido");
  } catch (err) { fallo(err); }
}

async function borrar() {
  const pregunta = esProbado(editando ?? {}) ? `¿Borrar «${editando?.nombre}» de tus vinos probados?`
    : `¿Borrar «${editando?.nombre}»? Si solo te lo has bebido, mejor deja las botellas a 0.`;
  if (!editando || !confirm(pregunta)) return;
  try {
    await store.borrar(editando.id);
    vinos = vinos.filter((v) => v.id !== editando.id);
    $("#dlg").close();
    render();
    toast("Vino borrado");
  } catch (err) { fallo(err); }
}

async function cambiarBotellas(id, delta) {
  if (soloVer()) return false;
  const v = vinos.find((x) => x.id === id);
  const nuevo = Math.max(0, v.botellas + delta);
  if (nuevo === v.botellas) return false;
  const antes = v.botellas;
  v.botellas = nuevo;
  render();
  for (const n of document.querySelectorAll(`.wine[data-id="${CSS.escape(String(id))}"] .n, #ficha[open] .n`)) n.classList.add("cambio");
  try {
    await store.actualizar(id, { botellas: nuevo });
    return true;
  } catch (err) {
    v.botellas = antes;
    render();
    fallo(err);
    return false;
  }
}

// Copia un vino probado a la bodega con una botella y abre el formulario
// para ajustar botellas y ventana. El probado se queda como estaba. La foto
// se copia aparte para que cada vino tenga la suya.
async function anadirABodega(v) {
  const campos = ["nombre", "bodega", "denominacion", "pais", "tipo", "uvas", "anada", "puntuacion", "cata", "notas"];
  const datos = Object.fromEntries(campos.map((k) => [k, v[k] ?? null]));
  try {
    const nuevo = await store.crear({ ...datos, botellas: 1 });
    vinos.push(nuevo);
    if (store.fotos && v.imagen_url) {
      store.fotos.guardar(nuevo.id, v.imagen_url).then((url) => { ponerFoto(nuevo.id, url); render(); }).catch(() => {});
    }
    $("#ficha").close();
    cambiarPestana("bodega");
    toast(`«${v.nombre}» está en tu bodega con 1 botella`);
    abrirDialogo(nuevo);
  } catch (err) { fallo(err); }
}

// Sube una foto hecha por ti al vino que se está editando.
async function subirFoto(file) {
  const vino = editando;
  const estado = $("#fotos-estado");
  estado.textContent = "Subiendo tu foto…";
  try {
    pintarFotoActual(ponerFoto(vino.id, await store.fotos.propia(vino.id, await reducirFoto(file))));
    botonesFoto(vinos.find((x) => x.id === vino.id));
    render();
    estado.textContent = "Foto guardada.";
  } catch (err) { estado.textContent = "No se pudo subir: " + (err.message || err); }
}

// ---- Pestañas ----
function pintarPestana() {
  const probados = pestana === "probados";
  document.body.dataset.lista = pestana;
  for (const b of document.querySelectorAll("#pestanas [data-pestana]")) b.setAttribute("aria-selected", String(b.dataset.pestana === pestana));
  $("#orden").innerHTML = ORDENES[pestana].map(([v, t]) => `<option value="${v}"${v === orden ? " selected" : ""}>${t}</option>`).join("");
  const anadir = probados ? "Añadir vino probado" : "Añadir vino";
  $("#btn-nuevo").setAttribute("aria-label", anadir);
  $("#btn-nuevo .txt").textContent = probados ? "Añadir probado" : "Añadir vino";
  $("#btn-fab").setAttribute("aria-label", anadir);
  $("#buscar").placeholder = probados ? "Buscar por vino, bodega, uva, sitio…" : "Buscar por vino, bodega, uva, país…";
}

function cambiarPestana(p) {
  if (p === pestana) return;
  ordenDe[pestana] = orden;
  pestana = p;
  orden = ordenDe[p];
  try { localStorage.setItem("bodega-pestana", p); } catch {}
  $("#buscar").value = "";
  busqueda = "";
  pintarPestana();
  elegirFiltro("todo");
  window.scrollTo({ top: 0 });
}

// ---- Copias ----
function exportar() {
  const datos = vinos.map(({ id, user_id, created_at, updated_at, ...v }) => v);
  const blob = new Blob([JSON.stringify(datos, null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `bodega-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function importar(file) {
  try {
    const datos = JSON.parse(await file.text());
    if (!Array.isArray(datos)) throw new Error("el archivo no es una lista de vinos");
    if (!confirm(`¿Añadir ${datos.length} vinos a tu bodega?`)) return;
    vinos.push(...(await store.crearVarios(datos)));
    render();
    toast(`${datos.length} vinos importados`);
  } catch (err) { fallo(err); }
}

async function cargarIniciales() {
  try {
    vinos.push(...(await store.crearVarios(await vinosIniciales())));
    render();
    toast("Tus 37 vinos están cargados");
  } catch (err) { fallo(err); }
}

// ---- Compartir ----
async function pintarMiembros() {
  const estado = $("#compartir-estado");
  try {
    const miembros = await store.miembros.listar();
    $("#lista-miembros").innerHTML = miembros.map((m) => `
      <li data-email="${esc(m.email)}">
        <span class="email">${esc(m.email)}</span>
        <select aria-label="Permiso de ${esc(m.email)}">
          <option value="lector"${m.rol === "lector" ? " selected" : ""}>Solo ver</option>
          <option value="editor"${m.rol === "editor" ? " selected" : ""}>Puede editar</option>
        </select>
        <button class="btn danger" type="button" data-quitar>Quitar</button>
      </li>`).join("");
    estado.textContent = miembros.length ? "" : "Todavía no has compartido tu bodega con nadie.";
  } catch (err) {
    estado.textContent = "No se pudo leer la lista: " + err.message +
      (/miembros/.test(err.message) ? ". Falta pegar compartir.sql en Supabase." : "");
  }
}

function enlazarCompartir() {
  $("#btn-compartir").addEventListener("click", () => {
    $("#dlg-compartir").showModal();
    pintarMiembros();
  });
  $("#btn-cerrar-compartir").addEventListener("click", () => $("#dlg-compartir").close());
  $("#form-miembro").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#miembro-email").value.trim().toLowerCase();
    try {
      await store.miembros.guardar(email, $("#miembro-rol").value);
      $("#miembro-email").value = "";
      await pintarMiembros();
      $("#compartir-estado").textContent = `Listo. Dile a ${email} que entre en esta web con ese correo.`;
    } catch (err) { $("#compartir-estado").textContent = "No se pudo añadir: " + err.message; }
  });
  $("#lista-miembros").addEventListener("change", async (e) => {
    const li = e.target.closest("li");
    try {
      await store.miembros.guardar(li.dataset.email, e.target.value);
      $("#compartir-estado").textContent = "Permiso cambiado.";
    } catch (err) { $("#compartir-estado").textContent = "No se pudo cambiar: " + err.message; }
  });
  $("#lista-miembros").addEventListener("click", async (e) => {
    if (!e.target.closest("[data-quitar]")) return;
    const email = e.target.closest("li").dataset.email;
    try {
      await store.miembros.quitar(email);
      await pintarMiembros();
      $("#compartir-estado").textContent = `${email} ya no tiene acceso.`;
    } catch (err) { $("#compartir-estado").textContent = "No se pudo quitar: " + err.message; }
  });
}

// ---- Sesión ----
async function mostrar(usuario) {
  const dentro = !!usuario;
  $("#login").hidden = dentro;
  $("#app").hidden = !dentro;
  $("#btn-nuevo").hidden = !dentro;
  $("#pestanas").hidden = !dentro;
  $("#btn-fab").hidden = !dentro;
  $("#btn-menu").hidden = !dentro;
  $("#btn-salir").hidden = store.modo === "local";
  if (!dentro) return;
  try {
    acceso = await store.acceso(usuario);
  } catch (err) {
    console.error(err);
  }
  const ajena = acceso.rol !== "dueno";
  document.body.classList.toggle("solo-ver", soloVer());
  $("#info-acceso").hidden = !ajena;
  $("#info-acceso").textContent = ajena
    ? `Bodega de ${acceso.dueno_email ?? "otra persona"} · ${soloVer() ? "solo puedes verla" : "puedes editarla"}`
    : "";
  $("#btn-compartir").hidden = !store.miembros || ajena;
  $("#btn-fotos-todas").hidden = !store.fotos || soloVer();
  $("#btn-igualar").hidden = !store.fotos || soloVer();
  $("#btn-recuperar").hidden = !store.fotos || soloVer();
  $("#btn-subir-foto").hidden = !store.fotos?.propia;
  $("#btn-importar").hidden = soloVer();
  $("#btn-cargar-iniciales").hidden = ajena;
  // Cada sección del menú ⋯ se oculta si no le queda ninguna opción.
  for (const sec of document.querySelectorAll(".menu-sec")) sec.hidden = ![...sec.querySelectorAll("button")].some((b) => !b.hidden);
  try {
    vinos = await store.listar();
  } catch (err) {
    console.error(err);
    const aviso = $("#aviso-demo");
    aviso.textContent = "No se pudieron leer tus vinos: " + (err.message || err) + ". Recarga la página.";
    aviso.hidden = false;
    $("#app").hidden = true;
    return;
  }
  render();
  completarFotos();
}

function enlazar() {
  pintarPestana();
  $("#pestanas").addEventListener("click", (e) => {
    const b = e.target.closest("[data-pestana]");
    if (b) cambiarPestana(b.dataset.pestana);
  });
  $("#filtros").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (chip) elegirFiltro(chip.dataset.filter);
  });
  // El aviso y cada tipo del resumen (casilla o tramo de la barra) llevan
  // a la lista filtrada. Volver a tocar el tipo elegido quita el filtro.
  $("#resumen").addEventListener("click", (e) => {
    if (e.target.closest(".plegar")) {
      resumenAbierto = !resumenAbierto;
      try { localStorage.setItem("bodega-resumen", resumenAbierto ? "abierto" : "plegado"); } catch {}
      return render();
    }
    const tipo = e.target.closest("[data-tipo]")?.dataset.tipo;
    if (tipo) elegirFiltro(filtro === tipo ? "todo" : tipo);
    else if (e.target.closest("#btn-pronto")) elegirFiltro("ya");
    else return;
    if (filtro !== "todo") $(".controles").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  // La barra de búsqueda se marca al quedarse pegada arriba para darle fondo.
  const controles = $(".controles");
  const marcarPegada = () => controles.classList.toggle("pegada", controles.getBoundingClientRect().top <= parseFloat(getComputedStyle(controles).top) + 1 && window.scrollY > 0);
  window.addEventListener("scroll", marcarPegada, { passive: true });
  // «/» lleva al buscador, como en muchas webs.
  document.addEventListener("keydown", (e) => {
    if (e.key !== "/" || e.metaKey || e.ctrlKey || /input|textarea|select/i.test(document.activeElement?.tagName) || document.querySelector("dialog[open]")) return;
    e.preventDefault();
    $("#buscar").focus();
  });
  $("#buscar").addEventListener("input", (e) => {
    busqueda = e.target.value.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").trim();
    render();
  });
  $("#orden").addEventListener("change", (e) => { orden = e.target.value; render(); });

  $("#lista").addEventListener("click", (e) => {
    if (e.target.closest("[data-quitar-filtros]")) return quitarFiltros();
    const fila = e.target.closest(".wine");
    if (!fila) return;
    const paso = e.target.closest(".step");
    if (paso) return cambiarBotellas(fila.dataset.id, Number(paso.dataset.delta));
    if (e.target.closest("[data-ficha]")) abrirFicha(vinos.find((v) => v.id === fila.dataset.id));
  });

  $(".vistas").addEventListener("click", (e) => {
    const b = e.target.closest(".vista");
    if (!b || b.dataset.vista === vista) return;
    vista = b.dataset.vista;
    try { localStorage.setItem("bodega-vista", vista); } catch {}
    if (document.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) document.startViewTransition(render);
    else render();
  });

  const ficha = $("#ficha");
  ficha.addEventListener("click", async (e) => {
    // Un toque fuera del panel (en el fondo oscuro) lo cierra.
    if (e.target === ficha) return ficha.close();
    const v = vinos.find((x) => x.id === fichaId);
    if (!v) return;
    if (e.target.closest("[data-cerrar]")) return ficha.close();
    const paso = e.target.closest(".step");
    if (paso) return cambiarBotellas(v.id, Number(paso.dataset.delta));
    if (e.target.closest("[data-abrir]")) {
      if (!(await cambiarBotellas(v.id, -1))) return;
      return toast(v.botellas ? `Salud. ${v.botellas === 1 ? "Queda 1 botella" : `Quedan ${v.botellas} botellas`}` : "Salud. Era la última botella");
    }
    if (e.target.closest("[data-editar]")) { ficha.close(); abrirDialogo(v); }
    if (e.target.closest("[data-puntuaciones]")) buscarPuntuaciones(v.id);
    if (e.target.closest("[data-pasar]")) anadirABodega(v);
  });
  ficha.addEventListener("close", () => { fichaId = null; });
  // En el móvil, arrastrar el panel hacia abajo lo cierra.
  let arrastre = null;
  ficha.addEventListener("touchstart", (e) => {
    const cuerpo = ficha.querySelector(".ficha-cuerpo");
    if (!matchMedia("(max-width: 699px)").matches || cuerpo.scrollTop > 0 || e.target.closest("button")) return;
    arrastre = { y: e.touches[0].clientY, dy: 0 };
  }, { passive: true });
  ficha.addEventListener("touchmove", (e) => {
    if (!arrastre) return;
    arrastre.dy = Math.max(0, e.touches[0].clientY - arrastre.y);
    ficha.style.transform = `translateY(${arrastre.dy}px)`;
  }, { passive: true });
  ficha.addEventListener("touchend", () => {
    if (!arrastre) return;
    const cerrar = arrastre.dy > 110;
    arrastre = null;
    ficha.style.transform = "";
    if (cerrar) ficha.close();
  });

  $("#btn-nuevo").addEventListener("click", () => abrirDialogo(null));
  $("#btn-fab").addEventListener("click", () => abrirDialogo(null));
  $("#btn-primer-probado").addEventListener("click", () => abrirDialogo(null));
  $("#form-vino").addEventListener("submit", guardar);
  $("#btn-cancelar").addEventListener("click", () => $("#dlg").close());
  $("#btn-borrar").addEventListener("click", borrar);
  $("#btn-cargar-iniciales").addEventListener("click", cargarIniciales);

  const menu = $("#menu");
  $("#btn-menu").addEventListener("click", (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    $("#btn-menu").setAttribute("aria-expanded", String(!menu.hidden));
  });
  document.addEventListener("click", () => { menu.hidden = true; });
  $("#btn-exportar").addEventListener("click", exportar);
  $("#btn-fotos-todas").addEventListener("click", fotosQueFaltan);
  $("#btn-igualar").addEventListener("click", igualarTodas);
  $("#btn-recuperar").addEventListener("click", recuperarOriginales);
  $("#btn-quitar-fondo").addEventListener("click", quitarFondo);
  $("#btn-volver-original").addEventListener("click", volverOriginal);
  $("#btn-buscar-fotos").addEventListener("click", buscarFotos);
  $("#btn-subir-foto").addEventListener("click", () => $("#file-foto").click());
  $("#file-foto").addEventListener("change", (e) => {
    if (e.target.files[0]) subirFoto(e.target.files[0]);
    e.target.value = "";
  });
  // Tocar el deslizador (aunque sea en el valor que ya marca) pone la nota.
  $("#f-nota").addEventListener("pointerdown", () => { $("#f-nota").removeAttribute("data-vacia"); pintarNota(); resumirSecciones(); });
  $("#btn-quitar-nota").addEventListener("click", () => { ponerNota(null); resumirSecciones(); });
  $("#btn-etiqueta").addEventListener("click", () => $("#file-etiqueta").click());
  $("#file-etiqueta").addEventListener("change", (e) => {
    if (e.target.files[0]) leerEtiqueta(e.target.files[0]);
    e.target.value = "";
  });
  $("#form-vino").addEventListener("input", (e) => {
    cajaCampo(e.target).classList.remove("sugerido");
    if (e.target.name === "mi_nota") { e.target.removeAttribute("data-vacia"); pintarNota(); }
    // Cuándo beber se ajusta solo a las fechas de la ventana.
    if (e.target.name === "ventana") {
      const estado = estadoSegunVentana(e.target.value);
      if (estado) estadoPrevio = e.target.form.elements.estado.value = estado;
    }
    resumirSecciones();
  });
  $("#form-vino").addEventListener("click", (e) => {
    // Contador de botellas.
    const paso = e.target.closest("[data-paso]");
    if (paso) {
      const el = e.target.form?.elements.botellas ?? $("#f-botellas");
      el.value = Math.max(0, (parseInt(el.value, 10) || 0) + Number(paso.dataset.paso));
      return;
    }
    // Volver a tocar el estado marcado lo desmarca (queda «sin indicar»).
    const radio = e.target.closest('input[name="estado"]');
    if (!radio) return;
    if (radio.value === estadoPrevio) radio.checked = false;
    estadoPrevio = radio.form.elements.estado.value;
    resumirSecciones();
  });
  $("#btn-importar").addEventListener("click", () => $("#file-importar").click());
  $("#file-importar").addEventListener("change", (e) => {
    if (e.target.files[0]) importar(e.target.files[0]);
    e.target.value = "";
  });
  $("#btn-salir").addEventListener("click", () => store.salir());
  enlazarCompartir();

  $("#form-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const estado = $("#login-estado");
    estado.textContent = "Enviando…";
    try {
      await store.entrar($("#login-email").value.trim());
      estado.textContent = "Listo. Abre el enlace que te ha llegado al correo desde este mismo dispositivo.";
    } catch (err) {
      estado.textContent = "No se pudo enviar: " + (err.message || err);
    }
  });
}

// Cuando se publica una versión nueva, el service worker nuevo toma el control
// y la página se recarga una vez para usarla, sin tener que forzar la recarga.
function registrarServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const habiaVersion = !!navigator.serviceWorker.controller;
  let recargada = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!habiaVersion || recargada) return;
    recargada = true;
    location.reload();
  });
  navigator.serviceWorker.register("sw.js", { updateViaCache: "none" })
    .then((reg) => reg.update())
    .catch(() => {});
}

async function iniciar() {
  enlazar();
  try {
    store = await crearStore();
  } catch (err) {
    console.error(err);
    const aviso = $("#aviso-demo");
    aviso.textContent = "No se pudo conectar con la base de datos: " + (err.message || err) + ". Recarga la página.";
    aviso.hidden = false;
    return;
  }
  $("#aviso-demo").hidden = store.modo !== "local";
  store.onAuth((u) => mostrar(u));
  await mostrar(await store.usuario());
  registrarServiceWorker();
}

iniciar();
