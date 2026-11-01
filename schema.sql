-- ==========================================================
--  Riff Vault — run this ONCE in Supabase → SQL Editor
-- ==========================================================

-- 1) Metadata table ----------------------------------------
create table if not exists public.documents (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name          text not null,
  category      text not null default 'Other',
  tags          text[] not null default '{}',
  note          text,
  storage_path  text not null unique,
  size_bytes    bigint not null default 0,
  mime_type     text,
  created_at    timestamptz not null default now()
);

create index if not exists documents_user_created_idx on public.documents (user_id, created_at desc);

-- 2) Row Level Security: each user sees ONLY their own rows -
alter table public.documents enable row level security;

drop policy if exists "own select" on public.documents;
drop policy if exists "own insert" on public.documents;
drop policy if exists "own update" on public.documents;
drop policy if exists "own delete" on public.documents;

create policy "own select" on public.documents for select to authenticated using (auth.uid() = user_id);
create policy "own insert" on public.documents for insert to authenticated with check (auth.uid() = user_id);
create policy "own update" on public.documents for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own delete" on public.documents for delete to authenticated using (auth.uid() = user_id);

-- 3) Private storage bucket (1 GB per-file cap) ------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 1073741824)
on conflict (id) do update set public = false, file_size_limit = 1073741824;

-- 4) Storage policies: users can only touch files in their own folder  (<user_id>/...)
drop policy if exists "docs read own"   on storage.objects;
drop policy if exists "docs insert own" on storage.objects;
drop policy if exists "docs update own" on storage.objects;
drop policy if exists "docs delete own" on storage.objects;

create policy "docs read own"   on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "docs insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "docs update own" on storage.objects for update to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "docs delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
