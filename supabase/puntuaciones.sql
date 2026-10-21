-- Puntuaciones encontradas en la web (búsqueda del 2026-10-21).
-- Pega este archivo en Supabase → SQL Editor → Run.
-- Solo cambia un vino si su puntuación sigue siendo la de los datos iniciales,
-- así no pisa nada que hayas editado tú en la app.

begin;

update public.vinos set puntuacion = 'Suckling 93 · Peñín 92 · Decanter 90'
 where nombre = 'Malleolus' and anada = 2023
   and puntuacion = 'Aún sin puntuación de la 2023 · la 2021: Peñín 93';

update public.vinos set puntuacion = 'Peñín 90 (Guía 2021) · Vivino 4,3/5'
 where nombre = 'Arzuaga Crianza' and anada = 2018
   and puntuacion = 'Vivino 4,3/5 (añada 2018)';

update public.vinos set puntuacion = 'Wine Enthusiast 92 · Vinous 89 · Decanter 16,5/20 · Hachette 2★ y Coup de Cœur'
 where nombre = 'Château Paloumey' and anada = 2009
   and puntuacion = 'Hachette 2★ y Coup de Cœur · Falstaff 89–91 en barrica';

update public.vinos set puntuacion = 'Wine Spectator 89'
 where nombre = 'Babylonstoren Babel' and anada = 2021
   and puntuacion = 'Sin puntuación publicada';

update public.vinos set puntuacion = 'Vinous 92'
 where nombre = 'Mauro' and anada = 2011
   and puntuacion = 'Sin puntuación localizada de la 2011';

update public.vinos set puntuacion = 'Falstaff 91+'
 where nombre = 'Meersburger Lerchenberg Müller-Thurgau trocken' and anada = 2022
   and puntuacion = 'Sin puntuación publicada';

update public.vinos set puntuacion = 'Spanish Wine Lover 93 · Decanter 90'
 where nombre = 'Gran Juvé & Camps' and anada = 2008
   and puntuacion = 'Sin puntuación localizada de la 2008 · la 2010: Peñín 94, Parker 91';

update public.vinos set puntuacion = 'Vinous 91 · Vivino 3,9/5 (media)'
 where nombre = 'Juvé & Camps Reserva de la Familia Brut Nature' and anada = 2017
   and puntuacion = 'Vivino 3,9/5 (media) · la 2019: Peñín 92';

update public.vinos set puntuacion = 'Falstaff 89'
 where nombre = 'Gérard Bertrand «Art de Vivre» Rosé' and anada = 2023
   and puntuacion = 'Sin puntuación publicada';

-- Comprueba cuántas filas se han actualizado (deberían ser 9).
select nombre, anada, puntuacion from public.vinos
 where updated_at > now() - interval '1 minute' order by nombre;

commit;
