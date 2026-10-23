// Acceso a los datos. Con Supabase configurado, los vinos se guardan en la
// nube y se sincronizan entre dispositivos. Sin configurar, se guardan solo
// en este navegador (modo demo).
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const CAMPOS = ["nombre", "bodega", "denominacion", "pais", "tipo", "uvas", "anada",
  "botellas", "estado", "ventana", "puntuacion", "cata", "notas", "imagen_url",
  // Vinos probados (supabase/probados.sql).
  "lista", "lugar", "fecha_probado", "mi_nota", "precio", "precio_url"];

function limpiar(vino) {
  const out = {};
  for (const k of CAMPOS) if (k in vino) out[k] = vino[k] === "" ? null : vino[k];
  return out;
}

function aBase64(blob) {
  return new Promise((ok, mal) => {
    const lector = new FileReader();
    lector.onload = () => ok(String(lector.result).split(",")[1]);
    lector.onerror = () => mal(lector.error);
    lector.readAsDataURL(blob);
  });
}

export async function vinosIniciales() {
  const res = await fetch("vinos-iniciales.json");
  return res.json();
}

// ---- Supabase ----
async function crearStoreSupabase() {
  // vendor/supabase.js (supabase-js 2.117.2, versión UMD) se carga desde
  // index.html y deja el cliente en window.supabase.
  const { createClient } = window.supabase;
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const check = ({ data, error }) => { if (error) throw error; return data; };

  // De quién es la bodega que se ve y qué puede hacer este usuario:
  // "dueno" (la suya), "editor" o "lector" (la de otra persona que le ha
  // dado acceso desde Compartir).
  let acceso = null;

  async function invocar(funcion, body) {
    const { data, error } = await sb.functions.invoke(funcion, { body });
    if (error) {
      let msg = error.message;
      try { msg = (await error.context.json()).error || msg; } catch { /* sin cuerpo */ }
      throw new Error(msg);
    }
    return data;
  }

  return {
    modo: "nube",
    async acceso(usuario) {
      acceso = { dueno: usuario.id, rol: "dueno", dueno_email: usuario.email };
      const { data, error } = await sb.from("miembros")
        .select("owner, owner_email, rol").eq("email", (usuario.email ?? "").toLowerCase()).limit(1);
      // Sin la tabla miembros (compartir.sql sin aplicar) cada uno ve lo suyo.
      if (!error && data?.length) {
        acceso = { dueno: data[0].owner, rol: data[0].rol, dueno_email: data[0].owner_email };
      }
      return acceso;
    },
    miembros: {
      async listar() {
        return check(await sb.from("miembros").select("email, rol").eq("owner", acceso.dueno).order("email"));
      },
      async guardar(email, rol) {
        check(await sb.from("miembros").upsert({ email: email.trim().toLowerCase(), rol }));
      },
      async quitar(email) {
        check(await sb.from("miembros").delete().eq("owner", acceso.dueno).eq("email", email));
      },
    },
    async usuario() {
      const { data } = await sb.auth.getSession();
      return data.session?.user ?? null;
    },
    onAuth(cb) { sb.auth.onAuthStateChange((_e, s) => cb(s?.user ?? null)); },
    async entrar(email) {
      const redirect = location.origin + location.pathname;
      check(await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect } }));
    },
    async salir() { await sb.auth.signOut(); },
    async listar() {
      return check(await sb.from("vinos").select("*").eq("user_id", acceso.dueno).order("created_at"));
    },
    async crear(vino) {
      return check(await sb.from("vinos").insert({ ...limpiar(vino), user_id: acceso.dueno }).select().single());
    },
    async crearVarios(vinos) {
      return check(await sb.from("vinos").insert(vinos.map((v) => ({ ...limpiar(v), user_id: acceso.dueno }))).select());
    },
    async actualizar(id, cambios) {
      return check(await sb.from("vinos").update(limpiar(cambios)).eq("id", id).select().single());
    },
    async borrar(id) { check(await sb.from("vinos").delete().eq("id", id)); },
    fotos: {
      llamar(body) { return invocar("buscar-imagen", body); },
      async buscar(id) { return (await this.llamar({ accion: "buscar", vino_id: id })).candidatas; },
      async guardar(id, url) { return (await this.llamar({ accion: "guardar", vino_id: id, url })).imagen_url; },
      async auto(id) { return (await this.llamar({ accion: "auto", vino_id: id })).imagen_url; },
      async original(id) { return (await this.llamar({ accion: "original", vino_id: id })).imagen_url; },
      async subir(id, blob) {
        const datos = await aBase64(blob);
        return (await this.llamar({ accion: "subir", vino_id: id, datos, tipo: blob.type })).imagen_url;
      },
      // Foto hecha por Luis (la de la etiqueta o la del restaurante): sustituye a la actual.
      async propia(id, blob) {
        const datos = await aBase64(blob);
        return (await this.llamar({ accion: "propia", vino_id: id, datos, tipo: blob.type })).imagen_url;
      },
    },
    // Busca en la web las notas de guías y Vivino (y el precio de los
    // probados) y las guarda: { vino, encontradas, precio }.
    puntuaciones: {
      buscar(id) { return invocar("buscar-puntuaciones", { vino_id: id }); },
    },
    // Lee la foto de una etiqueta con Claude: { vino: {...campos}, aviso }.
    etiqueta: {
      async leer(blob) {
        return invocar("reconocer-vino", { imagen: await aBase64(blob), tipo: blob.type, dueno: acceso.dueno });
      },
    },
  };
}

// ---- Local (modo demo) ----
const CLAVE = "bodega-vinos";

function leerLocal() {
  try { return JSON.parse(localStorage.getItem(CLAVE)) ?? null; } catch { return null; }
}
function guardarLocal(vinos) {
  try { localStorage.setItem(CLAVE, JSON.stringify(vinos)); } catch { /* sin almacenamiento */ }
}

function crearStoreLocal() {
  let memoria = leerLocal();
  const todos = () => memoria ?? [];
  const persistir = (v) => { memoria = v; guardarLocal(v); };
  const nuevo = (vino) => ({ ...limpiar(vino), id: crypto.randomUUID(), created_at: new Date().toISOString() });

  return {
    modo: "local",
    fotos: null,
    miembros: null,
    etiqueta: null,
    puntuaciones: null,
    async acceso() { return { rol: "dueno" }; },
    async usuario() { return { email: null }; },
    onAuth() {},
    async entrar() {},
    async salir() {},
    async listar() {
      if (memoria === null) persistir((await vinosIniciales()).map(nuevo));
      return todos();
    },
    async crear(vino) { const v = nuevo(vino); persistir([...todos(), v]); return v; },
    async crearVarios(vinos) { const vs = vinos.map(nuevo); persistir([...todos(), ...vs]); return vs; },
    async actualizar(id, cambios) {
      let actualizado;
      persistir(todos().map((v) => (v.id === id ? (actualizado = { ...v, ...limpiar(cambios) }) : v)));
      return actualizado;
    },
    async borrar(id) { persistir(todos().filter((v) => v.id !== id)); },
  };
}

export async function crearStore() {
  if (SUPABASE_URL && SUPABASE_ANON_KEY) return crearStoreSupabase();
  return crearStoreLocal();
}
