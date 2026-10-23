-- Vinos probados (en un restaurante, en casa de alguien…). Van en la misma
-- tabla que la bodega, con lista = 'probados', así que comparten permisos,
-- fotos y puntuaciones. Pega este archivo en Supabase → SQL Editor → Run.
-- Se puede aplicar más de una vez sin problema.
alter table public.vinos add column if not exists lista text not null default 'bodega';
alter table public.vinos drop constraint if exists vinos_lista_check;
alter table public.vinos add constraint vinos_lista_check check (lista in ('bodega', 'probados'));

-- Dónde y cuándo lo probó, su nota (0–10, de medio en medio) y el precio
-- aproximado de la botella en tiendas, que busca la función buscar-puntuaciones.
alter table public.vinos add column if not exists lugar text;
alter table public.vinos add column if not exists fecha_probado date;
alter table public.vinos add column if not exists mi_nota numeric(3, 1);
alter table public.vinos drop constraint if exists vinos_mi_nota_check;
alter table public.vinos add constraint vinos_mi_nota_check check (mi_nota between 0 and 10);
alter table public.vinos add column if not exists precio numeric(8, 2);
alter table public.vinos drop constraint if exists vinos_precio_check;
alter table public.vinos add constraint vinos_precio_check check (precio >= 0);
alter table public.vinos add column if not exists precio_url text;

create index if not exists vinos_user_lista_idx on public.vinos (user_id, lista);
