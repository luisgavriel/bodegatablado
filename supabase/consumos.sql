-- Diario de botellas abiertas y lista de la compra. Pega este archivo en
-- Supabase → SQL Editor → Run (después de compartir.sql y probados.sql).
-- Se puede aplicar más de una vez sin problema.

-- Una tercera lista: los vinos que quieres comprar.
alter table public.vinos drop constraint if exists vinos_lista_check;
alter table public.vinos add constraint vinos_lista_check check (lista in ('bodega', 'probados', 'comprar'));

-- Cada botella abierta: cuándo, con qué ocasión y qué te pareció. Guarda el
-- nombre y la añada para que el diario siga entero aunque se borre el vino.
create table if not exists public.consumos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  vino_id     uuid references public.vinos (id) on delete set null,
  nombre      text not null,
  anada       integer,
  tipo        text,
  fecha       date not null default current_date,
  ocasion     text,
  nota        numeric(3, 1) check (nota between 0 and 10),
  comentario  text,
  created_at  timestamptz not null default now()
);

create index if not exists consumos_user_fecha_idx on public.consumos (user_id, fecha desc);
create index if not exists consumos_vino_idx on public.consumos (vino_id);

-- Los mismos permisos que los vinos: el dueño y las personas con las que
-- comparte la bodega (los lectores solo ven).
alter table public.consumos enable row level security;

drop policy if exists "ver consumos" on public.consumos;
drop policy if exists "añadir consumos" on public.consumos;
drop policy if exists "cambiar consumos" on public.consumos;
drop policy if exists "borrar consumos" on public.consumos;

create policy "ver consumos" on public.consumos
  for select using (public.puede_ver(user_id));
create policy "añadir consumos" on public.consumos
  for insert with check (public.puede_editar(user_id));
create policy "cambiar consumos" on public.consumos
  for update using (public.puede_editar(user_id)) with check (public.puede_editar(user_id));
create policy "borrar consumos" on public.consumos
  for delete using (public.puede_editar(user_id));
