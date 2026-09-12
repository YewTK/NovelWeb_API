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

-- เพิ่มภายหลัง: คีย์จัดกลุ่มตอนของนิยายเรื่องเดียวกัน (รันซ้ำได้)
alter table public.series add column if not exists key text not null default '';

create index if not exists series_user_idx on public.series (user_id, created_at desc);
create unique index if not exists series_user_key_idx on public.series (user_id, key) where key <> '';

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


/* ========================================================================== */
/*  ระบบล็อกอินด้วย username / password                                        */
/* ========================================================================== */
--
-- แอปแมป username -> อีเมลสังเคราะห์ "<username>@novelflow.app" แล้วใช้
-- Supabase Auth จัดการแฮชรหัสผ่าน/เซสชัน/JWT ให้ ผู้ใช้ไม่เคยเห็นอีเมลนี้
-- และไม่มีการส่งเมลจริงไปที่โดเมนนี้
--
-- ** ต้องตั้งค่า 2 อย่างนี้ใน Supabase Dashboard ก่อน ไม่งั้นล็อกอินไม่ได้ **
--
--   Authentication -> Sign In / Providers -> Email
--     1) Confirm email           = ปิด   (สำคัญที่สุด — ถ้าเปิดไว้จะเข้าระบบไม่ได้
--                                        เพราะอีเมลสังเคราะห์รับเมลยืนยันไม่ได้)
--     2) Allow new users to sign up = เปิด (ไว้สมัครบัญชีแรก แล้วจะปิดทีหลังก็ได้)
--
--   ปิด Anonymous sign-ins ได้แล้ว — แอปไม่ใช้อีกต่อไป
--
-- RLS ของตารางด้านบนไม่ต้องแก้อะไร: policy ใช้ auth.uid() = user_id อยู่แล้ว
-- ข้อมูลของแต่ละบัญชีจึงแยกจากกันโดยอัตโนมัติ


/* ---- ย้ายข้อมูลเดิมบนคลาวด์เข้าบัญชี admin (รันหลังสมัคร admin แล้ว) ------- */
--
-- ใช้เมื่อเคยมีข้อมูลที่สร้างไว้ตอนยังใช้ anonymous sign-in
-- (ข้อมูลที่อยู่ในเครื่อง/เบราว์เซอร์ แอปจะย้ายเข้าบัญชี admin ให้เองอัตโนมัติ
--  ครั้งแรกที่ล็อกอินเป็น admin — บล็อกนี้จัดการเฉพาะแถวที่อยู่บนคลาวด์แล้ว)

do $$
declare
  admin_id uuid;
begin
  select id into admin_id
  from auth.users
  where email = 'admin@novelflow.app';

  if admin_id is null then
    raise notice 'ยังไม่มีบัญชี admin — สมัครในแอปก่อนแล้วค่อยรันใหม่';
    return;
  end if;

  update public.series   set user_id = admin_id where user_id <> admin_id;
  update public.chapters set user_id = admin_id where user_id <> admin_id;

  raise notice 'ย้ายข้อมูลทั้งหมดเข้าบัญชี admin เรียบร้อย';
end $$;
