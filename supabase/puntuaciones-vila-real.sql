-- Vila Real Reserva 2023 (Adega de Vila Real, Douro): sin notas de críticos
-- localizadas para esta añada; Vivino 3,8/5 con 206 valoraciones (2026-10-21).
-- Solo cambia el vino si su puntuación sigue vacía.

begin;

update public.vinos
   set puntuacion = 'Vivino 3,8/5',
       puntuacion_fuentes = coalesce(puntuacion_fuentes, '[{"fuente":"Vivino","nota":"3,8/5","url":"https://www.vivino.com/en/vila-real-reserva-tinto/w/1200520?year=2023"}]'::jsonb)
 where nombre ilike 'Vila Real Reserva%' and anada = 2023
   and coalesce(trim(puntuacion), '') = '';

-- Debería salir 1 fila.
select nombre, anada, puntuacion from public.vinos
 where nombre ilike 'Vila Real Reserva%' and anada = 2023;

commit;
