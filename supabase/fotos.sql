-- Fotos de los vinos. Pega este archivo en Supabase → SQL Editor → Run
-- (después de schema.sql).
alter table public.vinos add column if not exists imagen_url text;

-- Carpeta pública para las fotos. Solo la función buscar-imagen puede
-- escribir en ella (usa la clave de servicio), así que no hace falta
-- ninguna política de escritura.
insert into storage.buckets (id, name, public)
values ('fotos', 'fotos', true)
on conflict (id) do nothing;
