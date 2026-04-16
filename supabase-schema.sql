create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  email text not null unique,
  area text,
  created_at timestamptz not null default now()
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  date_label text not null,
  date_visible boolean not null default true,
  starts_at timestamptz not null,
  home_team text not null,
  away_team text not null
);

create table if not exists public.results (
  match_id uuid primary key references public.matches(id) on delete cascade,
  outcome text not null check (outcome in ('home', 'draw', 'away')),
  home_score integer,
  away_score integer,
  updated_at timestamptz not null default now()
);

create table if not exists public.predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  outcome text not null check (outcome in ('home', 'draw', 'away')),
  home_score integer,
  away_score integer,
  updated_at timestamptz not null default now(),
  unique (user_id, match_id)
);

-- Primera version sin login real: permitir lectura y escritura con la publishable key.
-- Para una version final con autenticacion, reemplazar estas politicas por reglas por usuario/admin.
alter table public.users enable row level security;
alter table public.matches enable row level security;
alter table public.results enable row level security;
alter table public.predictions enable row level security;

drop policy if exists "public users read" on public.users;
drop policy if exists "public users write" on public.users;
drop policy if exists "public matches read" on public.matches;
drop policy if exists "public matches write" on public.matches;
drop policy if exists "public results read" on public.results;
drop policy if exists "public results write" on public.results;
drop policy if exists "public predictions read" on public.predictions;
drop policy if exists "public predictions write" on public.predictions;

create policy "public users read" on public.users for select using (true);
create policy "public users write" on public.users for all using (true) with check (true);

create policy "public matches read" on public.matches for select using (true);
create policy "public matches write" on public.matches for all using (true) with check (true);

create policy "public results read" on public.results for select using (true);
create policy "public results write" on public.results for all using (true) with check (true);

create policy "public predictions read" on public.predictions for select using (true);
create policy "public predictions write" on public.predictions for all using (true) with check (true);
