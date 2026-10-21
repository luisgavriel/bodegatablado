// Busca en la web las puntuaciones de un vino (guías y Vivino) con Claude y
// las guarda en el vino.
//
// POST { vino_id } → { vino } (la fila actualizada) y { encontradas: n }
//
// Formato de la columna puntuacion (el mismo que se carga a mano): entradas
// separadas por " · ", cada una "Fuente NN" con el nombre corto de la guía,
// y Vivino siempre al final como "Vivino 4,1/5" (con "(media de añadas)" si
// la nota no es de la añada del vino). Sin nada: "Sin puntuación publicada".
// Las URLs de cada nota van en puntuacion_fuentes (jsonb), si la columna existe.
//
// Secretos necesarios: ANTHROPIC_API_KEY. Las claves de Supabase las pone
// Supabase automáticamente.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import Anthropic from "npm:@anthropic-ai/sdk@0.137.0";

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

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respuesta(cuerpo: unknown, status = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

type Vino = {
  id: string; user_id: string; nombre: string; bodega: string | null; anada: number | null;
  denominacion: string | null; pais: string | null; tipo: string; puntuacion: string | null;
};
type Nota = { fuente: string; nota: string; anada: number | null; url: string };

const SISTEMA = `Buscas en la web las puntuaciones publicadas de un vino concreto para una bodega personal.
Usa la búsqueda y abre las páginas que haga falta. Fuentes útiles: guías y críticos (Peñín, Parker /
Wine Advocate, Suckling, Wine Spectator, Decanter, Vinous, Falstaff, Wine Enthusiast, Jancis Robinson,
Tim Atkin, Guía Proensa, Gambero Rosso, Hachette, Meininger…) y Vivino.

Reglas:
- Solo vale una nota si es de ESE vino (misma bodega y misma etiqueta, no otra gama de la bodega) y de
  ESA añada. Si no puedes confirmar la añada en la página, no la incluyas.
- Copia la nota tal como la da la fuente: "92", "91+", "89–91" (en barrica), "16,5/20", "2★".
- "fuente" es el nombre corto: Parker, Peñín, Suckling, Wine Spectator, Decanter, Vinous, Falstaff,
  Wine Enthusiast, Jancis Robinson, Tim Atkin, Hachette…
- De Vivino basta con el número de la ficha del vino (vivino.com/.../w/<id>): la nota la consulta la app.
  Si además ves la nota, da la media sobre 5 con un decimal ("4,1") y su añada (null si es la media de
  todas las añadas).
- "url" es la página donde has visto la nota.
- No inventes nada: si no encuentras notas, devuelve las listas vacías.

Termina tu respuesta SOLO con un bloque \`\`\`json con esta forma:
{"guias": [{"fuente": "Peñín", "nota": "92", "anada": 2019, "url": "https://..."}],
 "vivino_id": 1234567 o null,
 "vivino": {"nota": "4,1", "anada": 2019, "url": "https://..."} o null}`;

// Saca el último bloque JSON de la respuesta.
function leerJson(texto: string): { guias?: Nota[]; vivino_id?: unknown; vivino?: Nota | null } {
  const bloques = [...texto.matchAll(/```json\s*([\s\S]*?)```/g)];
  const crudo = bloques.length ? bloques[bloques.length - 1][1] : texto.slice(texto.indexOf("{"), texto.lastIndexOf("}") + 1);
  return JSON.parse(crudo);
}

const urlValida = (u: unknown) => typeof u === "string" && /^https?:\/\//.test(u);
const nombreFuente = (entrada: string) => entrada.replace(/\s+[\d(≈].*$/u, "").trim().toLowerCase();

// Une lo encontrado con lo que ya tenía el vino: las fuentes nuevas sustituyen
// a las mismas fuentes; se conservan las demás (p. ej. leídas en la etiqueta) y
// se quitan los «Sin puntuación…» y las estimaciones «≈ …».
type NotaVivino = { fuente: string; nota: string; sufijo: string; url: string };

// Nota de Vivino desde su API: la de la añada si tiene bastantes valoraciones;
// si no, la media del vino. Si la añada no existe, la API devuelve otra, así
// que se comprueba vintage.year.
async function notaVivino(id: number, anada: number | null): Promise<NotaVivino | null> {
  const api = `https://www.vivino.com/api/wines/${id}/reviews?per_page=1${anada ? `&year=${anada}` : ""}`;
  const res = await fetch(api, { headers: { "User-Agent": "Mozilla/5.0 (bodega-tablado)", "Accept": "application/json" } });
  if (!res.ok) return null;
  const vt = (await res.json())?.vintage;
  const url = `https://www.vivino.com/w/${id}${anada ? `?year=${anada}` : ""}`;
  const cifra = (n: number) => n.toFixed(1).replace(".", ",");
  const deAnada = vt?.statistics?.status !== "BelowThreshold" ? Number(vt?.statistics?.ratings_average) : 0;
  if (deAnada > 0 && (!anada || Number(vt?.year) === anada)) return { fuente: "Vivino", nota: cifra(deAnada), sufijo: "", url };
  const media = Number(vt?.wine?.statistics?.ratings_average);
  if (media > 0) return { fuente: "Vivino", nota: cifra(media), sufijo: anada ? " (media de añadas)" : "", url };
  return null;
}

function componer(anterior: string | null, guias: Nota[], vivino: NotaVivino | null): string {
  const nuevas = guias.map((g) => `${g.fuente} ${g.nota}`);
  const nombres = new Set(guias.map((g) => g.fuente.toLowerCase()));
  const viejas = String(anterior ?? "").split(/\s+·\s+/).map((t) => t.trim())
    .filter((t) => t && !/^(aún )?sin puntuación/i.test(t) && !t.startsWith("≈"));
  const conservadas = viejas.filter((t) => !nombres.has(nombreFuente(t)) && !/^vivino/i.test(t));
  const vivinoViejo = viejas.find((t) => /^vivino/i.test(t));
  const vivinoTexto = vivino
    ? `Vivino ${vivino.nota}/5${vivino.sufijo}`
    : vivinoViejo;
  const todas = [...nuevas, ...conservadas, ...(vivinoTexto ? [vivinoTexto] : [])];
  return todas.length ? todas.join(" · ") : "Sin puntuación publicada";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    if (!Deno.env.get("ANTHROPIC_API_KEY")) {
      return respuesta({ error: "Falta el secreto ANTHROPIC_API_KEY en Supabase" }, 500);
    }
    const { vino_id } = await req.json();

    // Cliente con la sesión del usuario: las políticas RLS deciden qué vinos ve y cambia.
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const usuario = createClient(SUPABASE_URL, CLAVE_PUBLICA, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: sesion, error: errSesion } = await usuario.auth.getUser(token);
    if (errSesion || !sesion.user) return respuesta({ error: "Tienes que iniciar sesión" }, 401);

    const { data: fila, error } = await usuario.from("vinos")
      .select("id, user_id, nombre, bodega, anada, denominacion, pais, tipo, puntuacion").eq("id", vino_id).single();
    const vino = fila as Vino | null;
    if (error || !vino) return respuesta({ error: "Vino no encontrado" }, 404);
    const { data: editar, error: errEditar } = await usuario.rpc("puede_editar", { dueno: vino.user_id });
    const permitido = errEditar ? vino.user_id === sesion.user.id : editar === true;
    if (!permitido) return respuesta({ error: "No tienes permiso para cambiar vinos en esta bodega" }, 403);

    const descripcion = [
      `Vino: ${vino.nombre}`, vino.bodega && `Bodega: ${vino.bodega}`,
      `Añada: ${vino.anada ?? "sin añada (busca la nota general del vino)"}`,
      vino.denominacion && `Denominación: ${vino.denominacion}`, vino.pais && `País: ${vino.pais}`, `Tipo: ${vino.tipo}`,
    ].filter(Boolean).join("\n");

    const claude = new Anthropic({ timeout: 140_000, maxRetries: 1 }); // lee ANTHROPIC_API_KEY
    const mensajes: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: descripcion }];
    let mensaje: Anthropic.Beta.BetaMessage | null = null;
    // Con herramientas de servidor la API puede pausar el turno; se reanuda
    // devolviendo lo que lleva, sin añadir nada.
    for (let vuelta = 0; vuelta < 3; vuelta++) {
      mensaje = await claude.beta.messages.create({
        model: "claude-opus-5-5",
        max_tokens: 16000,
        // Si Opus rechaza la petición, la API la repite con el modelo que recomienda.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: SISTEMA,
        tools: [
          { type: "web_search_20260209", name: "web_search", max_uses: 6 },
          { type: "web_fetch_20260209", name: "web_fetch", max_uses: 4 },
        ],
        messages: mensajes,
      });
      if (mensaje.stop_reason !== "pause_turn") break;
      mensajes.push({ role: "assistant", content: mensaje.content });
    }
    if (!mensaje || mensaje.stop_reason === "refusal") return respuesta({ error: "Claude no ha podido buscar este vino" }, 422);
    if (mensaje.stop_reason === "pause_turn") return respuesta({ error: "La búsqueda tardó demasiado; prueba otra vez" }, 504);

    const texto = mensaje.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
    let datos;
    try { datos = leerJson(texto); } catch { return respuesta({ error: "Claude no devolvió las notas en el formato esperado" }, 502); }

    // Se descarta lo que no sea de la añada del vino o no traiga su fuente.
    const guias = (datos.guias ?? []).filter((g) =>
      g && typeof g.fuente === "string" && g.fuente.trim() && typeof g.nota === "string" && g.nota.trim()
      && urlValida(g.url) && (vino.anada == null || g.anada === vino.anada))
      .map((g) => ({ ...g, fuente: g.fuente.trim(), nota: g.nota.trim() }));
    // Vivino: primero su API con el id que ha encontrado Claude; si falla, la
    // nota que Claude haya visto en la página.
    let vivino: NotaVivino | null = null;
    const id = Number(datos.vivino_id);
    if (Number.isInteger(id) && id > 0) vivino = await notaVivino(id, vino.anada).catch(() => null);
    const v = datos.vivino;
    if (!vivino && v && urlValida(v.url) && /^\d[,.]\d$/.test(String(v.nota ?? "").trim())
      && (v.anada == null || vino.anada == null || v.anada === vino.anada)) {
      vivino = { fuente: "Vivino", nota: String(v.nota).trim().replace(".", ","), url: v.url,
        sufijo: vino.anada && v.anada == null ? " (media de añadas)" : "" };
    }

    const puntuacion = componer(vino.puntuacion, guias, vivino);
    const fuentes = [...guias, ...(vivino ? [vivino] : [])].map(({ fuente, nota, url }) => ({ fuente, nota, url }));

    // puntuacion_fuentes solo existe si se ha aplicado supabase/puntuacion-fuentes.sql.
    let res = await usuario.from("vinos").update({ puntuacion, puntuacion_fuentes: fuentes }).eq("id", vino.id).select().single();
    if (res.error) res = await usuario.from("vinos").update({ puntuacion }).eq("id", vino.id).select().single();
    if (res.error) throw res.error;
    return respuesta({ vino: res.data, encontradas: fuentes.length });
  } catch (e) {
    console.error(e);
    if (e instanceof Anthropic.AuthenticationError) return respuesta({ error: "La clave ANTHROPIC_API_KEY no es válida" }, 500);
    if (e instanceof Anthropic.RateLimitError) return respuesta({ error: "Claude está saturado; prueba en un minuto" }, 429);
    if (e instanceof Anthropic.APIError) return respuesta({ error: `Claude respondió ${e.status}: ${e.message}` }, 502);
    return respuesta({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
