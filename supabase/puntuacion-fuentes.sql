-- Fuentes de las puntuaciones: una lista de {fuente, nota, url} por vino.
-- La rellena la función buscar-puntuaciones y la ficha del vino la enseña
-- como enlaces. Se puede aplicar más de una vez sin problema.
alter table public.vinos add column if not exists puntuacion_fuentes jsonb;
