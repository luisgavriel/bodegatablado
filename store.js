// Acceso a los datos. Con Supabase configurado, los vinos se guardan en la
// nube y se sincronizan entre dispositivos. Sin configurar, se guardan solo
// en este navegador (modo demo).
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const CAMPOS = ["nombre", "bodega", "denominacion", "pais", "tipo", "uvas", "anada",
  "botellas", "estado", "ventana", "puntuacion", "cata", "notas", "imagen_url"];

function limpiar(vino) {
  const out = {};
  for (const k of CAMPOS) if (k in vino) out[k] = vino[k] === "" ? null : vino[k];
  return out;
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

  return {
    modo: "nube",
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
      return check(await sb.from("vinos").select("*").order("created_at"));
    },
    async crear(vino) {
      return check(await sb.from("vinos").insert(limpiar(vino)).select().single());
    },
    async crearVarios(vinos) {
      return check(await sb.from("vinos").insert(vinos.map(limpiar)).select());
    },
    async actualizar(id, cambios) {
      return check(await sb.from("vinos").update(limpiar(cambios)).eq("id", id).select().single());
    },
    async borrar(id) { check(await sb.from("vinos").delete().eq("id", id)); },
    fotos: {
      async llamar(body) {
        const { data, error } = await sb.functions.invoke("buscar-imagen", { body });
        if (error) {
          let msg = error.message;
          try { msg = (await error.context.json()).error || msg; } catch { /* sin cuerpo */ }
          throw new Error(msg);
        }
        return data;
      },
      async buscar(id) { return (await this.llamar({ accion: "buscar", vino_id: id })).candidatas; },
      async guardar(id, url) { return (await this.llamar({ accion: "guardar", vino_id: id, url })).imagen_url; },
      async auto(id) { return (await this.llamar({ accion: "auto", vino_id: id })).imagen_url; },
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
