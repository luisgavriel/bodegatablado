-- Compartir la bodega con otras personas. Pega este archivo en
-- Supabase → SQL Editor → Run (después de schema.sql y fotos.sql).
--
-- El dueño de la bodega da de alta correos en "miembros" con el rol
-- "editor" (puede cambiar vinos) o "lector" (solo ver). Esas personas
-- entran en la app con su correo y ven los vinos del dueño.

create table if not exists public.miembros (
  owner       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  owner_email text default lower(auth.jwt() ->> 'email'),
  email       text not null check (email = lower(email)),
  rol         text not null default 'lector' check (rol in ('editor', 'lector')),
  created_at  timestamptz not null default now(),
  primary key (owner, email)
);

alter table public.miembros enable row level security;

-- El dueño gestiona su lista; cada miembro puede ver sus propias invitaciones.
drop policy if exists "miembros del dueño" on public.miembros;
create policy "miembros del dueño" on public.miembros
  for all using (owner = auth.uid()) with check (owner = auth.uid());

drop policy if exists "mis invitaciones" on public.miembros;
create policy "mis invitaciones" on public.miembros
  for select using (email = lower(auth.jwt() ->> 'email'));

-- Permisos sobre la bodega de un dueño. "security definer" para poder leer
-- miembros desde las políticas de vinos sin depender de sus propias políticas.
create or replace function public.puede_ver(dueno uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select dueno = auth.uid() or exists (
    select 1 from miembros m
    where m.owner = dueno and m.email = lower(auth.jwt() ->> 'email')
  );
$$;

create or replace function public.puede_editar(dueno uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select dueno = auth.uid() or exists (
    select 1 from miembros m
    where m.owner = dueno and m.email = lower(auth.jwt() ->> 'email') and m.rol = 'editor'
  );
$$;

-- Sustituye la política "vinos propios" por otras que tienen en cuenta a los miembros.
drop policy if exists "vinos propios" on public.vinos;
drop policy if exists "ver vinos" on public.vinos;
drop policy if exists "añadir vinos" on public.vinos;
drop policy if exists "cambiar vinos" on public.vinos;
drop policy if exists "borrar vinos" on public.vinos;

create policy "ver vinos" on public.vinos
  for select using (public.puede_ver(user_id));
create policy "añadir vinos" on public.vinos
  for insert with check (public.puede_editar(user_id));
create policy "cambiar vinos" on public.vinos
  for update using (public.puede_editar(user_id)) with check (public.puede_editar(user_id));
create policy "borrar vinos" on public.vinos
  for delete using (public.puede_editar(user_id));
