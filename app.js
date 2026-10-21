import { crearStore, vinosIniciales } from "./store.js";

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
function pasaFiltro(v) {
  if (filtro === "agotados") return v.botellas === 0;
  if (filtro === "ya") return v.estado === "ya" || v.estado === "urg";
  if (filtro === "guardar") return v.estado === "guardar";
  if (filtro !== "todo") return v.tipo === filtro;
  return true;
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

function filaVino(v) {
  const meta = [v.bodega, v.denominacion, v.pais].filter(Boolean).join(" · ");
  const ventana = v.estado ? `${ESTADOS[v.estado]}${v.ventana ? " · " + v.ventana : ""}` : v.ventana;
  return `
    <li class="wine${v.botellas === 0 ? " agotado" : ""}" data-id="${v.id}">
      <div class="foto">${v.imagen_url
        ? `<img src="${esc(v.imagen_url)}" alt="" loading="lazy">`
        : botella(v)}</div>
      <div class="main" data-editar>
        <p class="name">${esc(v.nombre)}<span class="anada">${v.anada ?? "s/a"}</span></p>
        ${meta ? `<p class="meta">${esc(meta)}</p>` : ""}
        ${v.uvas ? `<p class="meta">${esc(v.uvas)}</p>` : ""}
        ${ventana || v.puntuacion ? `<p class="eval">
          ${v.puntuacion ? `<span class="score">${esc(v.puntuacion)}</span>` : ""}
          ${ventana ? `<span class="win ${esc(v.estado ?? "")}">${esc(ventana)}</span>` : ""}
        </p>` : ""}
      </div>
      <div class="stock-col"><div class="stock">
        <button class="step" type="button" data-delta="-1" aria-label="Quitar una botella" ${v.botellas === 0 ? "disabled" : ""}>−</button>
        <span class="n" aria-label="${v.botellas} botellas">${v.botellas}</span>
        <button class="step" type="button" data-delta="1" aria-label="Añadir una botella">+</button>
      </div>
      <span class="stock-lbl">${v.botellas === 1 ? "botella" : "botellas"}</span></div>
    </li>`;
}

function render() {
  const enStock = vinos.filter((v) => v.botellas > 0);
  const botellas = (lista) => lista.reduce((s, v) => s + v.botellas, 0);
  $("#tally").innerHTML =
    `<li><span><b>${botellas(vinos)}</b> botellas · <b>${enStock.length}</b> vinos</span></li>` +
    TIPOS.map(([t, nombre]) => {
      const n = botellas(vinos.filter((v) => v.tipo === t));
      const etiqueta = n === 1 ? t : nombre.toLowerCase();
      return n ? `<li><span class="dot ${t}"></span><span><b>${n}</b> ${etiqueta}</span></li>` : "";
    }).join("");

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
      return `<section class="grupo"><h2>${nombre} <span class="count">${botellas(grupo)} botellas</span></h2>
        <ol class="ledger">${grupo.map(filaVino).join("")}</ol></section>`;
    }).join("");
  } else {
    const ordenados = [...visibles].sort(comparar);
    html = ordenados.length ? `<section class="grupo"><ol class="ledger">${ordenados.map(filaVino).join("")}</ol></section>` : "";
  }
  $("#lista").innerHTML = html || (vinos.length ? `<p class="meta">Ningún vino coincide.</p>` : "");
}

// ---- Fotos ----
function pintarFotoActual(v) {
  $("#foto-actual").innerHTML = v.imagen_url ? `<img src="${esc(v.imagen_url)}" alt="">` : botella(v);
}

function ponerFoto(id, imagen_url) {
  const v = vinos.find((x) => x.id === id);
  if (v) v.imagen_url = imagen_url;
  return v;
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
        estado.textContent = "Foto guardada.";
        render();
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
    toast(`Buscando fotos… ${i + 1} de ${pendientes.length} · ${hechas} guardadas`, true);
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
  $("#fotos-bloque").hidden = !vino || !store.fotos;
  $("#candidatas").innerHTML = "";
  $("#fotos-estado").textContent = "";
  if (vino) pintarFotoActual(vino);
  $("#dlg").showModal();
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
  const v = vinos.find((x) => x.id === id);
  const nuevo = Math.max(0, v.botellas + delta);
  if (nuevo === v.botellas) return;
  const antes = v.botellas;
  v.botellas = nuevo;
  render();
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

// ---- Sesión ----
async function mostrar(usuario) {
  const dentro = !!usuario;
  $("#login").hidden = dentro;
  $("#app").hidden = !dentro;
  $("#btn-nuevo").hidden = !dentro;
  $("#btn-menu").hidden = !dentro;
  $("#btn-salir").hidden = store.modo === "local";
  $("#btn-fotos-todas").hidden = !store.fotos;
  if (!dentro) return;
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
    if (!chip) return;
    filtro = chip.dataset.filter;
    for (const c of document.querySelectorAll(".chip")) c.setAttribute("aria-pressed", String(c === chip));
    render();
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
  $("#btn-buscar-fotos").addEventListener("click", buscarFotos);
  $("#btn-importar").addEventListener("click", () => $("#file-importar").click());
  $("#file-importar").addEventListener("change", (e) => {
    if (e.target.files[0]) importar(e.target.files[0]);
    e.target.value = "";
  });
  $("#btn-salir").addEventListener("click", () => store.salir());

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
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
}

iniciar();
