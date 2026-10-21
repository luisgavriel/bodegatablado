import { crearStore, vinosIniciales } from "./store.js";
import { normalizar, estaNormalizada } from "./normalizar.js";
import { estadoSegunVentana, leerVentana } from "./ventana.js";

const TIPOS = [
  ["tinto", "Tintos"], ["blanco", "Blancos"], ["espumoso", "Espumosos"],
  ["rosado", "Rosados"], ["otro", "Otros"],
];
const ESTADOS = { urg: "Urgente", ya: "Beber ya", punto: "En su punto", guardar: "Guardar" };
const URGENCIA = { urg: 0, ya: 1, punto: 2, guardar: 3 };

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

let store;
let vinos = [];
let filtro = "todo";
let busqueda = "";
let orden = "tipo";
let editando = null;
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
  const texto = [v.nombre, v.bodega, v.denominacion, v.pais, v.uvas, v.anada, v.notas]
    .join(" ").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  return busqueda.split(/\s+/).every((p) => texto.includes(p));
}

function comparar(a, b) {
  if (orden === "urgencia") return (URGENCIA[a.estado] ?? 9) - (URGENCIA[b.estado] ?? 9) || a.nombre.localeCompare(b.nombre);
  if (orden === "anada") return (a.anada ?? 9999) - (b.anada ?? 9999) || a.nombre.localeCompare(b.nombre);
  if (orden === "nombre") return a.nombre.localeCompare(b.nombre);
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

// La puntuación es texto libre («Peñín 92 · Vivino 3,9/5»). Cada trozo se
// pinta según lo que sea: nota de un crítico sobre 100 como sello, Vivino
// con estrellas y el resto tal cual. «Sin puntuación…» no se muestra.
function puntuacionHtml(texto) {
  return String(texto ?? "").split(/\s+·\s+/).map((trozo) => {
    const t = trozo.trim();
    if (!t || /^(aún )?sin puntuación/i.test(t)) return "";
    const viv = t.match(/^Vivino\s+(\d)[,.](\d)\s*\/\s*5\s*(.*)$/i);
    if (viv) {
      const nota = Number(`${viv[1]}.${viv[2]}`);
      const llenas = Math.round(nota);
      return `<span class="vivino" title="${esc(t)}"><span class="st" aria-hidden="true">${"★".repeat(llenas)}${"☆".repeat(5 - llenas)}</span><b>${viv[1]},${viv[2]}</b> Vivino</span>`;
    }
    const critico = t.match(/^([\p{Lu}][\p{L}.' ]{1,24}?)\s+(\d{2,3}(?:[–-]\d{2,3})?\+?)(?:\/100)?(\s.*)?$/u);
    if (critico && !/\d/.test(critico[1])) {
      return `<span class="sello" title="${esc(t)}"><b>${esc(critico[2])}</b><span>${esc(critico[1])}</span></span>`;
    }
    return `<span class="score">${esc(t)}</span>`;
  }).join("");
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
  const meta = [v.bodega, v.denominacion, v.pais].filter(Boolean).join(" · ");
  const ventana = v.estado ? `${ESTADOS[v.estado]}${v.ventana ? " · " + v.ventana : ""}` : v.ventana;
  const puntos = puntuacionHtml(v.puntuacion);
  return `
    <li class="wine${v.botellas === 0 ? " agotado" : ""}" data-id="${v.id}">
      <div class="foto ${esc(v.tipo)}">${imagen(v)}</div>
      <div class="main" data-editar>
        <p class="name">${esc(v.nombre)}<span class="anada">${v.anada ?? "s/a"}</span></p>
        ${meta ? `<p class="meta">${esc(meta)}</p>` : ""}
        ${v.uvas ? `<p class="meta uvas">${esc(v.uvas)}</p>` : ""}
        ${ventana || puntos ? `<p class="eval">
          ${ventana ? `<span class="win ${esc(v.estado ?? "")}">${esc(ventana)}</span>` : ""}
          ${puntos}
        </p>` : ""}
        ${v.botellas > 0 ? lineaHtml(v) : ""}
      </div>
      <div class="stock-col"><div class="stock">
        <button class="step" type="button" data-delta="-1" aria-label="Quitar una botella" ${v.botellas === 0 ? "disabled" : ""}>−</button>
        <span class="n" aria-label="${v.botellas} ${v.botellas === 1 ? "botella" : "botellas"}">${v.botellas}</span>
        <button class="step" type="button" data-delta="1" aria-label="Añadir una botella">+</button>
      </div></div>
    </li>`;
}

function render() {
  const enStock = vinos.filter((v) => v.botellas > 0);
  const botellas = (lista) => lista.reduce((s, v) => s + v.botellas, 0);
  const porTipo = TIPOS.map(([t, nombre]) => [t, nombre, botellas(vinos.filter((v) => v.tipo === t))]).filter(([, , n]) => n);
  const pronto = enStock.filter((v) => v.estado === "ya" || v.estado === "urg").length;
  const total = botellas(vinos);
  $("#resumen").innerHTML = vinos.length ? `
    <p class="total">${total}<small>${total === 1 ? "botella" : "botellas"} · ${enStock.length} ${enStock.length === 1 ? "vino" : "vinos"}</small></p>
    ${total ? `<div class="compo" role="img" aria-label="${porTipo.map(([t, nombre, n]) => `${n} ${n === 1 ? t : nombre.toLowerCase()}`).join(", ")}">
      ${porTipo.map(([t, , n]) => `<span class="${t}" style="flex:${n}"></span>`).join("")}</div>` : ""}
    <ul class="tally">${porTipo.map(([t, nombre, n]) =>
      `<li><b>${n}</b><span><span class="dot ${t}"></span>${n === 1 ? t : nombre.toLowerCase()}</span></li>`).join("")}</ul>
    ${pronto ? `<button class="alerta" type="button" id="btn-pronto">
      <svg aria-hidden="true"><use href="#i-reloj"/></svg>
      <span>${pronto === 1 ? "1 vino conviene beberlo" : `${pronto} vinos conviene beberlos`} antes de que acabe ${new Date().getFullYear() + 1}</span>
      <span class="ir">Ver</span></button>` : ""}` : "";

  for (const c of document.querySelectorAll("#filtros .chip")) {
    c.querySelector(".num").textContent = vinos.filter((v) => pasaFiltro(v, c.dataset.filter)).length || "";
  }

  $("#vacio").hidden = vinos.length > 0;

  const visibles = vinos.filter((v) => pasaFiltro(v) && pasaBusqueda(v));
  if (filtro !== "agotados" && !busqueda) {
    // Por defecto los agotados van al final de cada grupo.
    visibles.sort((a, b) => (a.botellas === 0) - (b.botellas === 0));
  }

  let html;
  if (orden === "tipo") {
    html = TIPOS.map(([t, nombre]) => {
      const grupo = visibles.filter((v) => v.tipo === t);
      if (!grupo.length) return "";
      return `<section class="grupo ${t}"><h2>${nombre} <span class="count">${botellas(grupo)} botellas</span></h2>
        <ol class="ledger">${grupo.map(filaVino).join("")}</ol></section>`;
    }).join("");
  } else {
    const ordenados = [...visibles].sort(comparar);
    html = ordenados.length ? `<section class="grupo"><ol class="ledger">${ordenados.map(filaVino).join("")}</ol></section>` : "";
  }
  $("#lista").innerHTML = html || (vinos.length ? `<p class="meta">Ningún vino coincide.</p>` : "");
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
    const error = await fotoAutomatica(v.id);
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
function abrirDialogo(vino) {
  editando = vino;
  const f = $("#form-vino");
  f.reset();
  $("#dlg-titulo").textContent = vino ? "Editar vino" : "Nuevo vino";
  $("#btn-borrar").hidden = !vino;
  if (vino) for (const el of f.elements) if (el.name) el.value = vino[el.name] ?? "";
  $("#fotos-bloque").hidden = !vino || !store.fotos || soloVer();
  $("#etiqueta-bloque").hidden = !!vino || !store.etiqueta || soloVer();
  $("#etiqueta-estado").textContent = "";
  for (const el of f.querySelectorAll(".sugerido")) el.classList.remove("sugerido");
  for (const el of f.elements) if (el.name) el.disabled = soloVer();
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
    const { vino, aviso } = await store.etiqueta.leer(await reducirFoto(file));
    const f = $("#form-vino");
    for (const [k, valor] of Object.entries(vino)) {
      const el = f.elements[k];
      if (!el || valor === null || valor === "") continue;
      el.value = valor;
      el.classList.add("sugerido");
    }
    estado.textContent = "Revisa los datos antes de guardar. La cata, la ventana y cuándo beber son sugerencias de Claude."
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
  datos.anada = datos.anada ? parseInt(datos.anada, 10) : null;
  datos.botellas = Math.max(0, parseInt(datos.botellas ?? "0", 10) || 0);
  return datos;
}

async function guardar(e) {
  e.preventDefault();
  const datos = leerFormulario();
  try {
    if (editando) {
      const v = await store.actualizar(editando.id, datos);
      vinos = vinos.map((x) => (x.id === v.id ? v : x));
    } else {
      datos.estado = estadoSegunVentana(datos.ventana) ?? datos.estado;
      const nuevo = await store.crear(datos);
      vinos.push(nuevo);
      if (store.fotos) fotoAutomatica(nuevo.id).then((e) => e && toast("Sin foto: " + e));
    }
    $("#dlg").close();
    render();
    toast(editando ? "Guardado" : "Vino añadido");
  } catch (err) { fallo(err); }
}

async function borrar() {
  if (!editando || !confirm(`¿Borrar «${editando.nombre}»? Si solo te lo has bebido, mejor deja las botellas a 0.`)) return;
  try {
    await store.borrar(editando.id);
    vinos = vinos.filter((v) => v.id !== editando.id);
    $("#dlg").close();
    render();
    toast("Vino borrado");
  } catch (err) { fallo(err); }
}

async function cambiarBotellas(id, delta) {
  if (soloVer()) return;
  const v = vinos.find((x) => x.id === id);
  const nuevo = Math.max(0, v.botellas + delta);
  if (nuevo === v.botellas) return;
  const antes = v.botellas;
  v.botellas = nuevo;
  render();
  document.querySelector(`.wine[data-id="${CSS.escape(String(id))}"] .n`)?.classList.add("cambio");
  try {
    await store.actualizar(id, { botellas: nuevo });
  } catch (err) {
    v.botellas = antes;
    render();
    fallo(err);
  }
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
  $("#btn-importar").hidden = soloVer();
  $("#btn-cargar-iniciales").hidden = ajena;
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
}

function enlazar() {
  $("#filtros").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (chip) elegirFiltro(chip.dataset.filter);
  });
  $("#resumen").addEventListener("click", (e) => {
    if (!e.target.closest("#btn-pronto")) return;
    elegirFiltro("ya");
    $(".controles").scrollIntoView({ behavior: "smooth", block: "start" });
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
    const fila = e.target.closest(".wine");
    if (!fila) return;
    const paso = e.target.closest(".step");
    if (paso) return cambiarBotellas(fila.dataset.id, Number(paso.dataset.delta));
    if (e.target.closest("[data-editar]")) abrirDialogo(vinos.find((v) => v.id === fila.dataset.id));
  });

  $("#btn-nuevo").addEventListener("click", () => abrirDialogo(null));
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
  $("#btn-etiqueta").addEventListener("click", () => $("#file-etiqueta").click());
  $("#file-etiqueta").addEventListener("change", (e) => {
    if (e.target.files[0]) leerEtiqueta(e.target.files[0]);
    e.target.value = "";
  });
  $("#form-vino").addEventListener("input", (e) => {
    e.target.classList.remove("sugerido");
    // Cuándo beber se ajusta solo a las fechas de la ventana.
    if (e.target.name !== "ventana") return;
    const estado = estadoSegunVentana(e.target.value);
    if (estado) e.target.form.elements.estado.value = estado;
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
