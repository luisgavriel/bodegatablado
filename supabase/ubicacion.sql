-- Dónde está guardada cada botella (botellero, fila, caja…). Pega este
-- archivo en Supabase → SQL Editor → Run. Se puede aplicar más de una vez.
alter table public.vinos add column if not exists ubicacion text;
