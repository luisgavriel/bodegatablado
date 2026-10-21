-- Tabla de vinos de la bodega. Pega este archivo en Supabase → SQL Editor → Run.
create table if not exists public.vinos (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nombre        text not null,
  bodega        text,
  denominacion  text,
  pais          text,
  tipo          text not null check (tipo in ('tinto', 'blanco', 'rosado', 'espumoso', 'otro')),
  uvas          text,
  anada         integer check (anada between 1800 and 2100),
  botellas      integer not null default 1 check (botellas >= 0),
  estado        text check (estado in ('urg', 'ya', 'punto', 'guardar')),
  ventana       text,
  puntuacion    text,
  cata          text,
  notas         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists vinos_user_id_idx on public.vinos (user_id);

-- Cada usuario solo ve y modifica sus propios vinos.
alter table public.vinos enable row level security;

drop policy if exists "vinos propios" on public.vinos;
create policy "vinos propios" on public.vinos
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.vinos_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists vinos_touch on public.vinos;
create trigger vinos_touch before update on public.vinos
  for each row execute function public.vinos_touch();
