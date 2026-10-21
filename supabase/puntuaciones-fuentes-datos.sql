-- Rellena puntuacion_fuentes (lista de {fuente, nota, url}) con las fuentes
-- de las puntuaciones cargadas el 2026-10-21. Solo toca vinos cuya columna esté vacía.

begin;

update public.vinos set puntuacion_fuentes = '[{"fuente": "Suckling", "nota": "93", "url": "https://www.bodeboca.com/vino/malleolus-2023"}, {"fuente": "Peñín", "nota": "92", "url": "https://www.bodeboca.com/vino/malleolus-2023"}, {"fuente": "Decanter", "nota": "90", "url": "https://www.bodeboca.com/vino/malleolus-2023"}, {"fuente": "Vivino", "nota": "4,3/5", "url": "https://www.vivino.com/en/emilio-moro-malleolus/w/11604?year=2023"}]'::jsonb
 where nombre = 'Malleolus' and anada = 2023 and puntuacion_fuentes is null;

update public.vinos set puntuacion_fuentes = '[{"fuente": "Peñín", "nota": "90", "url": "https://blog.arzuaga.es/ten-arzuaga-wines-between-90-and-99-points-in-the-2021-guia-penin/?lang=en"}, {"fuente": "Vivino", "nota": "4,3/5", "url": "https://www.vivino.com/en/arzuaga-ribera-del-duero-crianza/w/7932?year=2018"}]'::jsonb
 where nombre = 'Arzuaga Crianza' and anada = 2018 and puntuacion_fuentes is null;

update public.vinos set puntuacion_fuentes = '[{"fuente": "Wine Enthusiast", "nota": "92", "url": "https://www.leaandsandeman.co.uk/wine/2009-CHATEAU-PALOUMEY-Cru-Bourgeois-Superieur-Medoc-16683-00.html"}, {"fuente": "Vinous", "nota": "89", "url": "https://www.leaandsandeman.co.uk/wine/2009-CHATEAU-PALOUMEY-Cru-Bourgeois-Superieur-Medoc-16683-00.html"}, {"fuente": "Decanter", "nota": "16,5/20", "url": "https://www.leaandsandeman.co.uk/wine/2009-CHATEAU-PALOUMEY-Cru-Bourgeois-Superieur-Medoc-16683-00.html"}, {"fuente": "Vivino", "nota": "3,8/5", "url": "https://www.vivino.com/en/chateau-paloumey-haut-medoc/w/80458?year=2009"}]'::jsonb
 where nombre = 'Château Paloumey' and anada = 2009 and puntuacion_fuentes is null;

update public.vinos set puntuacion_fuentes = '[{"fuente": "Wine Spectator", "nota": "89", "url": "https://www.winespectator.com/articles/alphabetical-guide-to-the-wines-of-south-africa-073123"}, {"fuente": "Vivino", "nota": "4,1/5", "url": "https://www.vivino.com/en/babylonstoren-babel/w/1894066?year=2021"}]'::jsonb
 where nombre = 'Babylonstoren Babel' and anada = 2021 and puntuacion_fuentes is null;

update public.vinos set puntuacion_fuentes = '[{"fuente": "Vinous", "nota": "92", "url": "https://hedonism.co.uk/products/mauro-1800cl-2011"}, {"fuente": "Vivino", "nota": "4,2/5", "url": "https://www.vivino.com/en/bodegas-mauro-mauro/w/96926?year=2011"}]'::jsonb
 where nombre = 'Mauro' and anada = 2011 and puntuacion_fuentes is null;

update public.vinos set puntuacion_fuentes = '[{"fuente": "Falstaff", "nota": "91+", "url": "https://www.falstaff.com/en/listings/mueller-thurgau-trophy-2023-wines-from-baden"}, {"fuente": "Vivino", "nota": "3,8/5 (media de añadas)", "url": "https://www.vivino.com/DE/de/staatsweingut-meersburg-baden-lerchenberg-trocken-muller-thurgau/w/2498575"}]'::jsonb
 where nombre = 'Meersburger Lerchenberg Müller-Thurgau trocken' and anada = 2022 and puntuacion_fuentes is null;

update public.vinos set puntuacion_fuentes = '[{"fuente": "Spanish Wine Lover", "nota": "93", "url": "https://spanishwinelover.com/tasting-notes/gran-juve-camps-gran-reserva-brut-2008-espumoso"}, {"fuente": "Decanter", "nota": "90", "url": "https://www.decanter.com/wine-reviews/spain/cava/juve-y-camps-gran-juve-gran-reserva-cava-2008-5515"}, {"fuente": "Vivino", "nota": "3,9/5", "url": "https://www.vivino.com/en/juve-camps-cava-gran-reserva-brut/w/1622570?year=2008"}]'::jsonb
 where nombre = 'Gran Juvé & Camps' and anada = 2008 and puntuacion_fuentes is null;

update public.vinos set puntuacion_fuentes = '[{"fuente": "Vinous", "nota": "91", "url": "https://vintus.com/wp-content/uploads/2021/04/Juve-Camps-RDF-2017-Tech.pdf"}, {"fuente": "Vivino", "nota": "4,0/5", "url": "https://www.vivino.com/en/juve-camps-cava-gran-reserva-brut-nature-reserva-de-la-familia/w/1136856?year=2017"}]'::jsonb
 where nombre = 'Juvé & Camps Reserva de la Familia Brut Nature' and anada = 2017 and puntuacion_fuentes is null;

update public.vinos set puntuacion_fuentes = '[{"fuente": "Falstaff", "nota": "89", "url": "https://www.falstaff.com/en/wines/gerard-bertrand-2023-gerard-bertrand-art-de-vivre-languedoc-rose"}, {"fuente": "Vivino", "nota": "3,9/5 (media de añadas)", "url": "https://www.vivino.com/en/gerard-bertrand-art-de-vivre-rose-languedoc/w/11436390"}]'::jsonb
 where nombre = 'Gérard Bertrand «Art de Vivre» Rosé' and anada = 2023 and puntuacion_fuentes is null;

update public.vinos set puntuacion_fuentes = '[{"fuente": "Vivino", "nota": "4,1/5", "url": "https://www.vivino.com/en/r-lopez-de-heredia-vina-tondonia-reserva/w/9119?year=2001"}]'::jsonb
 where nombre = 'Viña Tondonia Reserva' and anada = 2001 and puntuacion_fuentes is null;

update public.vinos set puntuacion_fuentes = '[{"fuente": "Vivino", "nota": "4,0/5", "url": "https://www.vivino.com/en/luis-canas-crianza/w/86878?year=2022"}]'::jsonb
 where nombre = 'Luis Cañas Crianza' and anada = 2022 and puntuacion_fuentes is null;

update public.vinos set puntuacion_fuentes = '[{"fuente": "Vivino", "nota": "4,2/5", "url": "https://www.vivino.com/en/juan-gil-jumilla-blue-label/w/1713612?year=2023"}]'::jsonb
 where nombre = 'Juan Gil Etiqueta Azul' and anada = 2023 and puntuacion_fuentes is null;

update public.vinos set puntuacion_fuentes = '[{"fuente": "Vivino", "nota": "4,0/5", "url": "https://www.vivino.com/en/juan-gil-jumilla-silver-label/w/5282020?year=2022"}]'::jsonb
 where nombre = 'Juan Gil Etiqueta Plata' and anada = 2022 and puntuacion_fuentes is null;

update public.vinos set puntuacion_fuentes = '[{"fuente": "Vivino", "nota": "4,1/5", "url": "https://www.vivino.com/en/le-moulin-des-saints-chateauneuf-du-pape-rouge-rouge/w/1166901?year=2023"}]'::jsonb
 where nombre = 'Le Moulin des Saints' and anada = 2023 and puntuacion_fuentes is null;

update public.vinos set puntuacion_fuentes = '[{"fuente": "Vivino", "nota": "3,6/5 (media de añadas)", "url": "https://www.vivino.com/US/en/chateau-la-botte-cuvee-thomas-prestige-blaye-cotes-de-bordeaux-rouge/w/1910118"}]'::jsonb
 where nombre = 'Château La Botte Prestige «Cuvée Thomas»' and anada = 2014 and puntuacion_fuentes is null;

update public.vinos set puntuacion_fuentes = '[{"fuente": "Vivino", "nota": "4,3/5", "url": "https://www.vivino.com/en/babylonstoren-nebukadnesar/w/4092735?year=2021"}]'::jsonb
 where nombre = 'Babylonstoren Nebukadnesar' and anada = 2021 and puntuacion_fuentes is null;

update public.vinos set puntuacion_fuentes = '[{"fuente": "Vivino", "nota": "3,8/5 (media de añadas)", "url": "https://www.vivino.com/en/rametz-cabernet-sauvignon-alto-adige/w/2338659"}]'::jsonb
 where nombre = 'Castello Rametz Cabernet' and anada = 2015 and puntuacion_fuentes is null;

update public.vinos set puntuacion_fuentes = '[{"fuente": "Vivino", "nota": "3,9/5", "url": "https://www.vivino.com/US/en/pacheca-douro-superior-tinto/w/2188922?year=2024"}]'::jsonb
 where nombre = 'Pacheca Superior' and anada = 2024 and puntuacion_fuentes is null;

update public.vinos set puntuacion_fuentes = '[{"fuente": "Vivino", "nota": "3,8/5", "url": "https://www.vivino.com/FR/en/la-chasse-chateauneuf-du-pape/w/2061037?year=2022"}]'::jsonb
 where nombre = 'La Châsse du Pape' and anada = 2022 and puntuacion_fuentes is null;

update public.vinos set puntuacion_fuentes = '[{"fuente": "Vivino", "nota": "4,1/5 (media de añadas)", "url": "https://www.vivino.com/en/domaine-pontifical-chateauneuf-du-pape-blanc/w/5012517"}]'::jsonb
 where nombre = 'Domaine Pontifical Blanc «Le Grand Devès»' and anada = 2024 and puntuacion_fuentes is null;

update public.vinos set puntuacion_fuentes = '[{"fuente": "Vivino", "nota": "3,9/5 (media de añadas)", "url": "https://www.vivino.com/en/cellier-des-princes-chateauneuf-du-pape-blanc/w/1167528"}]'::jsonb
 where nombre = 'Cellier des Princes Blanc' and anada = 2024 and puntuacion_fuentes is null;

update public.vinos set puntuacion_fuentes = '[{"fuente": "Vivino", "nota": "3,9/5", "url": "https://vivino.com/US/en/protos-verdejo/w/1135415?year=2023"}]'::jsonb
 where nombre = 'Protos Verdejo' and anada = 2023 and puntuacion_fuentes is null;

update public.vinos set puntuacion_fuentes = '[{"fuente": "Vivino", "nota": "4,1/5", "url": "https://www.vivino.com/en/kaltern-stern-sauvignon-alto-adige/w/5650067?year=2019"}]'::jsonb
 where nombre = 'Kellerei Kaltern «Stern» Sauvignon' and anada = 2019 and puntuacion_fuentes is null;

update public.vinos set puntuacion_fuentes = '[{"fuente": "Vivino", "nota": "4,0/5 (sin añada)", "url": "https://www.vivino.com/US/en/faubel-maikammer-heiligenberg-blanc-de-noirs/w/7991109"}]'::jsonb
 where nombre = 'Faubel Blanc de Noirs' and anada = 2021 and puntuacion_fuentes is null;

update public.vinos set puntuacion_fuentes = '[{"fuente": "Vivino", "nota": "3,7/5", "url": "https://www.vivino.com/en/weingut-winter-rheinhessen-grauburgunder/w/5683176?year=2023"}]'::jsonb
 where nombre = 'Winter Grauburgunder' and anada = 2023 and puntuacion_fuentes is null;

update public.vinos set puntuacion_fuentes = '[{"fuente": "Vivino", "nota": "3,9/5", "url": "https://www.vivino.com/US/en/fr-kessler-jagergrun-riesling-brut/w/1192688"}]'::jsonb
 where nombre = 'Kessler Jägergrün Riesling Brut' and anada is null and puntuacion_fuentes is null;

update public.vinos set puntuacion_fuentes = '[{"fuente": "Vivino", "nota": "3,8/5", "url": "https://www.vivino.com/segura-viudas-cava-reserva-heredad-brut/w/5063?year=2010"}]'::jsonb
 where nombre = 'Segura Viudas Reserva Heredad Brut' and anada = 2010 and puntuacion_fuentes is null;

update public.vinos set puntuacion_fuentes = '[{"fuente": "Vivino", "nota": "3,8/5", "url": "https://www.vivino.com/segura-viudas-cava-reserva-heredad-brut/w/5063?year=2008"}]'::jsonb
 where nombre = 'Segura Viudas Reserva Heredad Brut' and anada = 2008 and puntuacion_fuentes is null;

-- Deberían salir 28 vinos con fuentes.
select count(*) from public.vinos where puntuacion_fuentes is not null;

commit;
