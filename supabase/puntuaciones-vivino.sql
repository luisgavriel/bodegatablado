-- Notas de Vivino por añada (consultadas el 2026-10-21).
-- Pega este archivo en Supabase → SQL Editor → Run. Vale tanto si ya se ejecutó
-- puntuaciones.sql como si no: solo cambia un vino si su puntuación es la inicial
-- o la que dejó ese primer SQL, así no pisa nada que hayas editado en la app.

begin;

update public.vinos set puntuacion = 'Parker 96 · Peñín 92 · Vivino 4,1/5'
 where nombre = 'Viña Tondonia Reserva' and anada = 2001
   and puntuacion in ('Parker 96 · Peñín 92');

update public.vinos set puntuacion = 'Suckling 93 · Peñín 92 · Decanter 90 · Vivino 4,3/5'
 where nombre = 'Malleolus' and anada = 2023
   and puntuacion in ('Aún sin puntuación de la 2023 · la 2021: Peñín 93', 'Suckling 93 · Peñín 92 · Decanter 90');

update public.vinos set puntuacion = 'Peñín 91 · Vivino 4,0/5'
 where nombre = 'Luis Cañas Crianza' and anada = 2022
   and puntuacion in ('Peñín 91');

update public.vinos set puntuacion = 'Peñín 96 · Vivino 4,2/5'
 where nombre = 'Juan Gil Etiqueta Azul' and anada = 2023
   and puntuacion in ('Peñín 96');

update public.vinos set puntuacion = 'Peñín 93 · Vivino 4,0/5'
 where nombre = 'Juan Gil Etiqueta Plata' and anada = 2022
   and puntuacion in ('Peñín 93');

update public.vinos set puntuacion = 'Vivino 4,1/5'
 where nombre = 'Le Moulin des Saints' and anada = 2023
   and puntuacion in ('Sin puntuación publicada');

update public.vinos set puntuacion = 'Distintivo «prix plaisir» en la botella · Vivino 3,6/5 (media de añadas)'
 where nombre = 'Château La Botte Prestige «Cuvée Thomas»' and anada = 2014
   and puntuacion in ('Distintivo «prix plaisir» en la botella');

update public.vinos set puntuacion = 'Wine Enthusiast 92 · Vinous 89 · Decanter 16,5/20 · Hachette 2★ y Coup de Cœur · Vivino 3,8/5'
 where nombre = 'Château Paloumey' and anada = 2009
   and puntuacion in ('Hachette 2★ y Coup de Cœur · Falstaff 89–91 en barrica', 'Wine Enthusiast 92 · Vinous 89 · Decanter 16,5/20 · Hachette 2★ y Coup de Cœur');

update public.vinos set puntuacion = 'Medalla Veritas 2023 · Vivino 4,3/5'
 where nombre = 'Babylonstoren Nebukadnesar' and anada = 2021
   and puntuacion in ('Medalla Veritas 2023 en la botella');

update public.vinos set puntuacion = 'Wine Spectator 89 · Vivino 4,1/5'
 where nombre = 'Babylonstoren Babel' and anada = 2021
   and puntuacion in ('Sin puntuación publicada', 'Wine Spectator 89');

update public.vinos set puntuacion = 'Vivino 3,8/5 (media de añadas)'
 where nombre = 'Castello Rametz Cabernet' and anada = 2015
   and puntuacion in ('Sin puntuación publicada');

update public.vinos set puntuacion = 'Vivino 3,9/5'
 where nombre = 'Pacheca Superior' and anada = 2024
   and puntuacion in ('Aún sin puntuación (añada reciente)');

update public.vinos set puntuacion = 'Vinous 92 · Vivino 4,2/5'
 where nombre = 'Mauro' and anada = 2011
   and puntuacion in ('Sin puntuación localizada de la 2011', 'Vinous 92');

update public.vinos set puntuacion = 'Vivino 3,8/5'
 where nombre = 'La Châsse du Pape' and anada = 2022
   and puntuacion in ('Sin puntuación publicada');

update public.vinos set puntuacion = 'Vivino 4,1/5 (media de añadas)'
 where nombre = 'Domaine Pontifical Blanc «Le Grand Devès»' and anada = 2024
   and puntuacion in ('Sin puntuación publicada de la 2024');

update public.vinos set puntuacion = 'Vivino 3,9/5 (media de añadas)'
 where nombre = 'Cellier des Princes Blanc' and anada = 2024
   and puntuacion in ('Sin puntuación publicada');

update public.vinos set puntuacion = 'Peñín 91 · Vivino 3,9/5'
 where nombre = 'Protos Verdejo' and anada = 2023
   and puntuacion in ('Peñín 91');

update public.vinos set puntuacion = 'Falstaff 90 · Vivino 4,1/5'
 where nombre = 'Kellerei Kaltern «Stern» Sauvignon' and anada = 2019
   and puntuacion in ('Falstaff 90');

update public.vinos set puntuacion = 'Vivino 4,0/5 (sin añada)'
 where nombre = 'Faubel Blanc de Noirs' and anada = 2021
   and puntuacion in ('Sin puntuación publicada');

update public.vinos set puntuacion = 'Vivino 3,7/5'
 where nombre = 'Winter Grauburgunder' and anada = 2023
   and puntuacion in ('Sin puntuación publicada');

update public.vinos set puntuacion = 'Falstaff 91+ · Vivino 3,8/5 (media de añadas)'
 where nombre = 'Meersburger Lerchenberg Müller-Thurgau trocken' and anada = 2022
   and puntuacion in ('Sin puntuación publicada', 'Falstaff 91+');

update public.vinos set puntuacion = 'Spanish Wine Lover 93 · Decanter 90 · Vivino 3,9/5'
 where nombre = 'Gran Juvé & Camps' and anada = 2008
   and puntuacion in ('Sin puntuación localizada de la 2008 · la 2010: Peñín 94, Parker 91', 'Spanish Wine Lover 93 · Decanter 90');

update public.vinos set puntuacion = 'Falstaff 91+ (cata de 2026) · Vivino 3,9/5'
 where nombre = 'Kessler Jägergrün Riesling Brut' and anada is null
   and puntuacion in ('Falstaff 91+ (cata de 2026)');

update public.vinos set puntuacion = 'Vinous 91 · Vivino 4,0/5'
 where nombre = 'Juvé & Camps Reserva de la Familia Brut Nature' and anada = 2017
   and puntuacion in ('Vivino 3,9/5 (media) · la 2019: Peñín 92', 'Vinous 91 · Vivino 3,9/5 (media)');

update public.vinos set puntuacion = 'Vivino 3,8/5'
 where nombre = 'Segura Viudas Reserva Heredad Brut' and anada = 2010
   and puntuacion in ('Vivino 3,9/5 (media de añadas)');

update public.vinos set puntuacion = 'Vivino 3,8/5'
 where nombre = 'Segura Viudas Reserva Heredad Brut' and anada = 2008
   and puntuacion in ('Vivino 3,9/5 (media de añadas)');

update public.vinos set puntuacion = 'Falstaff 89 · Vivino 3,9/5 (media de añadas)'
 where nombre = 'Gérard Bertrand «Art de Vivre» Rosé' and anada = 2023
   and puntuacion in ('Sin puntuación publicada', 'Falstaff 89');

-- Comprueba las filas cambiadas (deberían ser 27).
select nombre, anada, puntuacion from public.vinos
 where updated_at > now() - interval '1 minute' order by nombre;

commit;
