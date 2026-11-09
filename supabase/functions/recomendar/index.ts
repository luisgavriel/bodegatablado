// «¿Qué abro hoy?»: Claude propone tres vinos de la bodega para una comida
// o una ocasión, dando prioridad a los que conviene beber pronto.
//
// POST { pregunta, dueno } → { comentario, recomendaciones: [{ vino_id, motivo, servicio }] }
//   pregunta: qué se va a comer o qué apetece (texto libre; puede ir vacío)
//   dueno:    id del dueño de la bodega que se está viendo
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

const ESQUEMA = {
  type: "object",
  properties: {
    comentario: { type: "string", description: "Una o dos frases que resumen la propuesta; vacío si no hace falta" },
    recomendaciones: {
      type: "array",
      description: "Hasta tres vinos de la lista, el mejor primero",
      items: {
        type: "object",
        properties: {
          vino_id: { type: "string", description: "El id del vino, copiado de la lista" },
          motivo: { type: "string", description: "Por qué este vino para esta ocasión, en una o dos frases" },
          servicio: { type: "string", description: "Temperatura y si conviene abrirlo antes o decantarlo, en una frase corta" },
        },
        required: ["vino_id", "motivo", "servicio"],
        additionalProperties: false,
      },
    },
  },
  required: ["comentario", "recomendaciones"],
  additionalProperties: false,
};

const SISTEMA = `Eres el sumiller de una bodega personal en España. Te llega la lista de vinos que hay en la
bodega (solo los que tienen botellas) y lo que su dueño va a comer o le apetece. Propón hasta tres vinos
DE ESA LISTA, el mejor primero, en español y con trato cercano.

Criterios, por este orden:
1. Que vaya bien con la comida o la ocasión.
2. A igualdad, da prioridad a los que conviene beber pronto: estado "urg" (su ventana ya pasó) o "ya"
   (termina este año o el siguiente). No propongas un vino en estado "guardar" salvo que lo pidan.
3. Variedad entre las tres propuestas (no tres vinos casi iguales) y no repetir lo abierto hace poco.
Si queda una sola botella de un vino especial, dilo en el motivo. No inventes vinos ni datos: usa solo
lo que hay en la lista y lo que sepas del estilo. Hoy es ${new Date().toISOString().slice(0, 10)}.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    if (!Deno.env.get("ANTHROPIC_API_KEY")) {
      return respuesta({ error: "Falta el secreto ANTHROPIC_API_KEY en Supabase" }, 500);
    }
    const { pregunta, dueno } = await req.json();
    const texto = String(pregunta ?? "").trim().slice(0, 600);

    // Cliente con la sesión del usuario: las políticas RLS deciden qué vinos ve.
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const usuario = createClient(SUPABASE_URL, CLAVE_PUBLICA, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: sesion, error: errSesion } = await usuario.auth.getUser(token);
    if (errSesion || !sesion.user) return respuesta({ error: "Tienes que iniciar sesión" }, 401);
    const bodega = typeof dueno === "string" && dueno ? dueno : sesion.user.id;

    const { data: filas, error } = await usuario.from("vinos").select("*").eq("user_id", bodega).gt("botellas", 0);
    if (error) throw error;
    const vinos = (filas ?? []).filter((v) => (v.lista ?? "bodega") === "bodega");
    if (!vinos.length) return respuesta({ error: "No hay botellas en la bodega" }, 422);
    // Lo abierto hace poco, si existe el diario (supabase/consumos.sql).
    const { data: abiertas } = await usuario.from("consumos").select("nombre, anada, fecha, nota")
      .eq("user_id", bodega).order("fecha", { ascending: false }).limit(12);

    const lista = vinos.map((v) => ({
      id: v.id, nombre: v.nombre, bodega: v.bodega, anada: v.anada, tipo: v.tipo, denominacion: v.denominacion,
      pais: v.pais, uvas: v.uvas, estado: v.estado, ventana: v.ventana, botellas: v.botellas,
      puntuacion: v.puntuacion, cata: v.cata ? String(v.cata).slice(0, 240) : null, notas: v.notas ? String(v.notas).slice(0, 160) : null,
    }));

    const claude = new Anthropic({ timeout: 60_000, maxRetries: 1 }); // lee ANTHROPIC_API_KEY
    const mensaje = await claude.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      // Si Opus rechaza la petición, la API la repite con el modelo que recomienda.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SISTEMA,
      output_config: { format: { type: "json_schema", schema: ESQUEMA } },
      messages: [{
        role: "user",
        content: `Vinos en la bodega:\n${JSON.stringify(lista)}\n\nAbiertos hace poco:\n${JSON.stringify(abiertas ?? [])}\n\n`
          + `Qué voy a comer o qué me apetece: ${texto || "(no lo digo: propón lo que más convenga abrir ahora)"}`,
      }],
    });

    if (mensaje.stop_reason === "refusal") return respuesta({ error: "Claude no ha podido proponer nada" }, 422);
    if (mensaje.stop_reason === "max_tokens") return respuesta({ error: "La respuesta de Claude se cortó; prueba otra vez" }, 502);
    const bloque = mensaje.content.find((b) => b.type === "text");
    if (!bloque || bloque.type !== "text") return respuesta({ error: "Claude no ha devuelto datos" }, 502);
    const datos = JSON.parse(bloque.text);
    // Solo vinos que existen en la bodega, sin repetir.
    const ids = new Set(vinos.map((v) => v.id));
    const vistos = new Set<string>();
    const recomendaciones = (datos.recomendaciones ?? []).filter((r: { vino_id: string }) =>
      ids.has(r.vino_id) && !vistos.has(r.vino_id) && vistos.add(r.vino_id)).slice(0, 3);
    return respuesta({ comentario: String(datos.comentario ?? ""), recomendaciones });
  } catch (e) {
    console.error(e);
    if (e instanceof Anthropic.AuthenticationError) return respuesta({ error: "La clave ANTHROPIC_API_KEY no es válida" }, 500);
    if (e instanceof Anthropic.RateLimitError) return respuesta({ error: "Claude está saturado; prueba en un minuto" }, 429);
    if (e instanceof Anthropic.APIError) return respuesta({ error: `Claude respondió ${e.status}: ${e.message}` }, 502);
    return respuesta({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
