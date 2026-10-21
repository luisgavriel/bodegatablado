# Bodega Tablado

App web instalable (PWA) para llevar el inventario de la bodega desde el móvil y el ordenador.
Sin build ni dependencias: HTML, CSS y JavaScript que se sirven tal cual (por ejemplo, con GitHub Pages).

## Qué hace

- Lista los vinos agrupados por tipo, con bodega, añada, uvas, puntuación y cuándo beberlos.
- Botones − y + para sumar o restar botellas; los vinos con 0 botellas pasan a "Agotados".
- Añadir, editar y borrar vinos; buscar; filtrar; ordenar por tipo, urgencia, añada o nombre.
- Exportar e importar una copia en JSON.
- Se instala en la pantalla de inicio y abre sin conexión (los cambios necesitan conexión).

## Archivos

| Archivo | Para qué |
| --- | --- |
| `index.html`, `styles.css`, `app.js` | La app |
| `store.js` | Guarda los datos en Supabase o, si no está configurado, en el navegador (modo demo) |
| `config.js` | URL y clave pública de Supabase |
| `vinos-iniciales.json` | Los 37 vinos del artefacto original, para la primera carga |
| `supabase/schema.sql` | Tabla `vinos` con seguridad por usuario (RLS) |
| `sw.js`, `manifest.webmanifest`, `icon*` | Lo que la convierte en app instalable |

## Puesta en marcha

1. **Supabase**: crea un proyecto en supabase.com. En *SQL Editor* pega `supabase/schema.sql` y pulsa *Run*.
2. En *Project Settings → API* copia la *Project URL* y la clave *anon public* en `config.js`.
3. En *Authentication → URL Configuration* pon como *Site URL* la dirección de GitHub Pages
   (por ejemplo `https://usuario.github.io/bodega/`).
4. **GitHub Pages**: en el repositorio, *Settings → Pages*, origen *Deploy from a branch*, rama `main`, carpeta `/ (root)`.
5. Abre la app, entra con tu correo y pulsa *Cargar mis 37 vinos del artefacto*.
   Después ajusta el número de botellas de cada uno (todos empiezan en 1).

## Fotos automáticas

La función `supabase/functions/buscar-imagen` busca fotos de cada vino con
[Brave Image Search](https://brave.com/search/api/) (5 $ de crédito gratis al mes, unas 1.000 búsquedas)
y guarda la elegida en la carpeta pública `fotos` de Supabase Storage.

1. Crea una clave en https://api-dashboard.search.brave.com (plan *Search*, gratis con verificación por tarjeta).
2. En Supabase, *SQL Editor*: pega `supabase/fotos.sql` y pulsa *Run*.
3. *Edge Functions → Deploy a new function → Via Editor*: nombre `buscar-imagen`, pega `index.ts` y despliega.
4. *Edge Functions → Secrets*: añade `BRAVE_API_KEY` con tu clave.

En la app: al añadir un vino se busca su foto sola; en la ficha de cada vino, *Buscar otra foto*;
y en el menú ⋯, *Buscar las fotos que faltan*. Sin foto se muestra una botella dibujada.

## Probar en local

```sh
python3 -m http.server 8000
```

y abre http://localhost:8000. Sin `config.js` rellenado funciona en modo demo.
