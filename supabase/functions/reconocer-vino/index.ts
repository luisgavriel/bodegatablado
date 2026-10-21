// Reconoce un vino a partir de una foto de su etiqueta con Claude (visión).
//
// POST { imagen, tipo, dueno } → { vino: { nombre, bodega, ..., cata }, aviso }
//   imagen: la foto en base64 (la app la reduce antes a unos 1200 px)
//   tipo:   image/jpeg, image/png o image/webp
//   dueno:  id del dueño de la bodega en la que se va a añadir el vino
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
const MAX_BASE64 = 7 * 1024 * 1024; // unos 5 MB de imagen
const TIPOS_IMAGEN = ["image/jpeg", "image/png", "image/webp"] as const;

function respuesta(cuerpo: unknown, status = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

const texto = (descripcion: string) => ({ type: "string", description: descripcion });
const ESQUEMA = {
  type: "object",
  properties: {
    es_vino: { type: "boolean", description: "true si la foto muestra la etiqueta o la botella de un vino" },
    nombre: texto("Nombre del vino tal como aparece en la etiqueta, sin la bodega si se puede separar"),
    bodega: texto("Bodega o productor"),
    tipo: { type: "string", enum: ["tinto", "blanco", "rosado", "espumoso", "otro"] },
    anada: texto("Año de la cosecha con 4 cifras, o cadena vacía si no se ve o no tiene añada"),
    denominacion: texto("Denominación de origen o región, p. ej. «Rioja DOCa» o «Champagne AOC»"),
    pais: texto("País en español"),
    uvas: texto("Variedades separadas por comas; vacío si no las sabes con razonable seguridad"),
    estado: {
      type: "string",
      enum: ["urg", "ya", "punto", "guardar", ""],
      description: "Cuándo beberlo hoy: urg (está pasándose), ya, punto (en su mejor momento), guardar, o vacío si no se sabe",
    },
    ventana: texto("Ventana de consumo breve, p. ej. «2026–2032» o «hasta 2028»; vacío si no se sabe"),
    cata: texto("Nota de cata orientativa de 1 o 2 frases sobre el estilo habitual de este vino; vacío si no lo conoces"),
    aviso: texto("Qué no se lee bien o qué conviene revisar, en una frase; vacío si todo está claro"),
  },
  required: ["es_vino", "nombre", "bodega", "tipo", "anada", "denominacion", "pais", "uvas", "estado", "ventana", "cata", "aviso"],
  additionalProperties: false,
};

const SISTEMA = `Eres un sumiller que ayuda a catalogar una bodega personal en España.
Te llega la foto de la etiqueta (o de la botella) de un vino. Devuelve sus datos en español.
Lo que se lee en la etiqueta es lo importante: cópialo con fidelidad. Para lo que no se lee
(uvas, país, tipo) puedes usar lo que sepas de ese vino si estás razonablemente seguro;
si no, déjalo vacío. No inventes la añada: si no se ve, vacía.
La cata, la ventana y el estado son sugerencias orientativas: dalas solo si conoces el vino
o su estilo, teniendo en cuenta la añada y que hoy es ${new Date().getFullYear()}.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    if (!Deno.env.get("ANTHROPIC_API_KEY")) {
      return respuesta({ error: "Falta el secreto ANTHROPIC_API_KEY en Supabase" }, 500);
    }
    const { imagen, tipo, dueno } = await req.json();
    if (typeof imagen !== "string" || !imagen || imagen.length > MAX_BASE64) {
      return respuesta({ error: "Falta la foto o es demasiado grande" }, 400);
    }
    if (!TIPOS_IMAGEN.includes(tipo)) return respuesta({ error: "La foto tiene que ser JPEG, PNG o WebP" }, 400);

    // Solo quien puede editar la bodega usa la función (cada foto cuesta dinero).
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const usuario = createClient(SUPABASE_URL, CLAVE_PUBLICA, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: sesion, error: errSesion } = await usuario.auth.getUser(token);
    if (errSesion || !sesion.user) return respuesta({ error: "Tienes que iniciar sesión" }, 401);
    const bodega = typeof dueno === "string" && dueno ? dueno : sesion.user.id;
    const { data: editar, error: errEditar } = await usuario.rpc("puede_editar", { dueno: bodega });
    const permitido = errEditar ? bodega === sesion.user.id : editar === true;
    if (!permitido) return respuesta({ error: "No tienes permiso para añadir vinos en esta bodega" }, 403);

    const claude = new Anthropic(); // lee ANTHROPIC_API_KEY
    const mensaje = await claude.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 8000,
      // Si Opus rechaza la petición, la API la repite con el modelo que recomienda.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SISTEMA,
      output_config: { format: { type: "json_schema", schema: ESQUEMA } },
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: tipo, data: imagen } },
          { type: "text", text: "¿Qué vino es? Rellena sus datos." },
        ],
      }],
    });

    if (mensaje.stop_reason === "refusal") return respuesta({ error: "Claude no ha podido analizar esta foto" }, 422);
    if (mensaje.stop_reason === "max_tokens") return respuesta({ error: "La respuesta de Claude se cortó; prueba otra vez" }, 502);
    const bloque = mensaje.content.find((b) => b.type === "text");
    if (!bloque || bloque.type !== "text") return respuesta({ error: "Claude no ha devuelto datos" }, 502);
    const datos = JSON.parse(bloque.text);
    if (!datos.es_vino) return respuesta({ error: "No parece la etiqueta de un vino. Prueba con otra foto." }, 422);

    const anada = parseInt(datos.anada, 10);
    const { es_vino: _, aviso, ...vino } = datos;
    return respuesta({ vino: { ...vino, anada: anada >= 1800 && anada <= 2100 ? anada : null }, aviso });
  } catch (e) {
    console.error(e);
    if (e instanceof Anthropic.AuthenticationError) return respuesta({ error: "La clave ANTHROPIC_API_KEY no es válida" }, 500);
    if (e instanceof Anthropic.RateLimitError) return respuesta({ error: "Claude está saturado; prueba en un minuto" }, 429);
    if (e instanceof Anthropic.APIError) return respuesta({ error: `Claude respondió ${e.status}: ${e.message}` }, 502);
    return respuesta({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
