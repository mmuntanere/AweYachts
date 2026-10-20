-- Brochure generator (admin/brochures)
-- Run once in the Supabase dashboard: SQL Editor > New query > paste > Run.

create table if not exists public.brochures (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.brochures enable row level security;

-- Only logged-in admins can read and write brochures; the public site never touches this table.
drop policy if exists "Admins manage brochures" on public.brochures;
create policy "Admins manage brochures"
  on public.brochures
  for all
  to authenticated
  using (true)
  with check (true);
