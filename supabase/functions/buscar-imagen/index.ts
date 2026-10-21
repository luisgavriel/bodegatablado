// Busca fotos de un vino con Brave Image Search y guarda la elegida en el
// almacenamiento de Supabase.
//
// POST { accion: "buscar", vino_id }        → { candidatas: [{ url, miniatura, titulo }] }
// POST { accion: "guardar", vino_id, url }  → { imagen_url }
// POST { accion: "auto", vino_id }          → { imagen_url } (busca y guarda la primera que se pueda descargar)
//
// Secretos necesarios: BRAVE_API_KEY. Las claves de Supabase las pone
// Supabase automáticamente.
//
// Despliégala con "Verify JWT" desactivado: la propia función comprueba la
// sesión del usuario (auth.getUser) y las políticas RLS limitan qué vinos
// puede tocar. La comprobación de la plataforma solo entiende las claves
// antiguas y puede rechazar proyectos con las claves nuevas.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

// Las claves nuevas llegan como JSON con nombre; las antiguas, como texto.
function clave(nueva: string, antigua: string): string {
  try {
    const k = JSON.parse(Deno.env.get(nueva) ?? "{}").default;
    if (k) return k;
  } catch { /* sin claves nuevas */ }
  return Deno.env.get(antigua) ?? "";
}
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const CLAVE_PUBLICA = clave("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
const CLAVE_SECRETA = clave("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MAX_BYTES = 5 * 1024 * 1024;
const EXTENSIONES: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif",
};

function respuesta(cuerpo: unknown, status = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

type Vino = { id: string; user_id: string; nombre: string; bodega: string | null; anada: number | null; imagen_url: string | null };
type Candidata = { url: string; miniatura: string; titulo: string };

async function buscar(vino: Vino): Promise<Candidata[]> {
  if (!Deno.env.get("BRAVE_API_KEY")) throw new Error("Falta el secreto BRAVE_API_KEY en Supabase");
  const q = [vino.bodega, vino.nombre, vino.anada, "botella vino"].filter(Boolean).join(" ");
  const url = new URL("https://api.search.brave.com/res/v1/images/search");
  url.searchParams.set("q", q);
  url.searchParams.set("count", "12");
  url.searchParams.set("safesearch", "strict");
  const res = await fetch(url, {
    headers: { "Accept": "application/json", "X-Subscription-Token": Deno.env.get("BRAVE_API_KEY") ?? "" },
  });
  if (!res.ok) throw new Error(`Brave respondió ${res.status}: ${await res.text()}`);
  const datos = await res.json();
  return (datos.results ?? [])
    .map((r: any) => ({ url: r.properties?.url, miniatura: r.thumbnail?.src, titulo: r.title ?? "" }))
    .filter((c: Candidata) => c.url && c.miniatura);
}

async function descargar(url: string): Promise<{ bytes: Uint8Array; tipo: string }> {
  const u = new URL(url);
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("URL no válida");
  const res = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0 (bodega-tablado)" }, redirect: "follow" });
  if (!res.ok) throw new Error(`No se pudo descargar la imagen (${res.status})`);
  const tipo = (res.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!EXTENSIONES[tipo]) throw new Error(`No es una imagen (${tipo || "tipo desconocido"})`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > MAX_BYTES) throw new Error("La imagen es demasiado grande");
  return { bytes, tipo };
}

async function guardar(admin: ReturnType<typeof createClient>, vino: Vino, url: string) {
  const { bytes, tipo } = await descargar(url);
  const ruta = `${vino.user_id}/${vino.id}-${Date.now()}.${EXTENSIONES[tipo]}`;
  const subida = await admin.storage.from("fotos").upload(ruta, bytes, { contentType: tipo, upsert: true });
  if (subida.error) throw subida.error;
  const imagen_url = admin.storage.from("fotos").getPublicUrl(ruta).data.publicUrl;

  const act = await admin.from("vinos").update({ imagen_url }).eq("id", vino.id);
  if (act.error) throw act.error;

  // Borra la foto anterior si era nuestra.
  const marca = "/storage/v1/object/public/fotos/";
  if (vino.imagen_url?.includes(marca)) {
    await admin.storage.from("fotos").remove([vino.imagen_url.split(marca)[1]]);
  }
  return imagen_url;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { accion, vino_id, url } = await req.json();

    // Cliente con la sesión del usuario: las políticas RLS garantizan que
    // solo puede tocar sus propios vinos.
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const usuario = createClient(SUPABASE_URL, CLAVE_PUBLICA, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: sesion, error: errSesion } = await usuario.auth.getUser(token);
    if (errSesion || !sesion.user) return respuesta({ error: "Tienes que iniciar sesión" }, 401);

    const { data: vino, error } = await usuario.from("vinos")
      .select("id, user_id, nombre, bodega, anada, imagen_url").eq("id", vino_id).single();
    if (error || !vino) return respuesta({ error: "Vino no encontrado" }, 404);

    // Solo quien puede editar la bodega busca y cambia fotos. Si compartir.sql
    // no está aplicado, la función puede_editar no existe y vale con ser el dueño.
    const { data: editar, error: errEditar } = await usuario.rpc("puede_editar", { dueno: vino.user_id });
    const permitido = errEditar ? vino.user_id === sesion.user.id : editar === true;
    if (!permitido) return respuesta({ error: "No tienes permiso para cambiar fotos en esta bodega" }, 403);

    const admin = createClient(SUPABASE_URL, CLAVE_SECRETA);

    if (accion === "buscar") return respuesta({ candidatas: await buscar(vino) });

    if (accion === "guardar") {
      if (typeof url !== "string") return respuesta({ error: "Falta la URL" }, 400);
      return respuesta({ imagen_url: await guardar(admin, vino, url) });
    }

    if (accion === "auto") {
      const candidatas = await buscar(vino);
      let ultimoError = "Brave no devolvió ninguna foto";
      for (const c of candidatas.slice(0, 5)) {
        // Si la original no se deja descargar, la miniatura de Brave siempre sirve.
        for (const u of [c.url, c.miniatura]) {
          try {
            return respuesta({ imagen_url: await guardar(admin, vino, u) });
          } catch (e) {
            ultimoError = e instanceof Error ? e.message : String(e);
          }
        }
      }
      return respuesta({ error: `No se pudo guardar ninguna foto (${ultimoError})` }, 404);
    }

    return respuesta({ error: "Acción desconocida" }, 400);
  } catch (e) {
    return respuesta({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
