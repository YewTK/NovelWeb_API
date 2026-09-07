-- NovelFlow — Supabase schema
-- รันไฟล์นี้ใน Supabase Dashboard → SQL Editor → New query → Run
--
-- ก่อนใช้งาน เปิด Anonymous sign-ins ที่ Authentication → Sign In / Providers
-- (ผู้ใช้จะได้ใช้งานทันทีโดยไม่ต้องสมัคร แล้วค่อยผูกอีเมลทีหลังได้)

create extension if not exists "pgcrypto";

/* --------------------------------- series -------------------------------- */

create table if not exists public.series (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  glossary    jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists series_user_idx on public.series (user_id, created_at desc);

/* -------------------------------- chapters ------------------------------- */

create table if not exists public.chapters (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  series_id        uuid references public.series (id) on delete set null,
  title            text not null default '',
  translated_title text not null default '',
  source_url       text,
  site_name        text,
  next_url         text,
  prev_url         text,
  paragraphs       jsonb not null default '[]'::jsonb,
  glossary         jsonb not null default '[]'::jsonb,
  status           text not null default 'draft',
  progress         real not null default 0,
  model            text not null default '',
  target_language  text not null default 'th',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists chapters_user_idx on public.chapters (user_id, updated_at desc);
create index if not exists chapters_series_idx on public.chapters (series_id);
create index if not exists chapters_source_idx on public.chapters (user_id, source_url);

/* ---------------------------- row level security -------------------------- */

alter table public.series   enable row level security;
alter table public.chapters enable row level security;

drop policy if exists "series owner access" on public.series;
create policy "series owner access" on public.series
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "chapters owner access" on public.chapters;
create policy "chapters owner access" on public.chapters
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

/* ------------------------------ updated_at -------------------------------- */

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists series_touch on public.series;
create trigger series_touch before update on public.series
  for each row execute function public.touch_updated_at();

drop trigger if exists chapters_touch on public.chapters;
create trigger chapters_touch before update on public.chapters
  for each row execute function public.touch_updated_at();
