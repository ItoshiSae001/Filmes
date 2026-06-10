create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create table if not exists public.lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('personal', 'shared')),
  invite_code text unique,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.lists enable row level security;

create table if not exists public.list_members (
  list_id uuid not null references public.lists (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (list_id, user_id)
);

alter table public.list_members enable row level security;

create table if not exists public.movies (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists (id) on delete cascade,
  title text not null,
  platform text,
  genre text,
  synopsis text,
  runtime integer,
  poster_url text,
  watched boolean not null default false,
  rating integer check (rating between 0 and 10),
  added_by uuid not null references public.profiles (id) on delete cascade,
  added_by_name text not null,
  tmdb_id integer,
  release_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.movies enable row level security;

create index if not exists idx_lists_owner_id on public.lists (owner_id);
create unique index if not exists idx_lists_owner_personal_unique on public.lists (owner_id) where kind = 'personal';
create index if not exists idx_lists_invite_code on public.lists (invite_code);
create index if not exists idx_list_members_user_id on public.list_members (user_id);
create index if not exists idx_movies_list_id on public.movies (list_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_movies_updated_at on public.movies;
create trigger set_movies_updated_at
before update on public.movies
for each row
execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1), 'Usuário')
  )
  on conflict (id) do update
    set display_name = excluded.display_name;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

drop policy if exists "profiles select own" on public.profiles;
create policy "profiles select own"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "profiles insert own" on public.profiles;
create policy "profiles insert own"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "lists select member lists" on public.lists;
drop policy if exists "lists select own member or shared" on public.lists;
create policy "lists select own member or shared"
on public.lists
for select
to authenticated
using (
  owner_id = auth.uid()
  or kind = 'shared'
  or exists (
    select 1
    from public.list_members
    where list_members.list_id = lists.id
      and list_members.user_id = auth.uid()
  )
);

drop policy if exists "lists insert own" on public.lists;
create policy "lists insert own"
on public.lists
for insert
to authenticated
with check (
  owner_id = auth.uid()
  and (
    (kind = 'personal' and invite_code is null)
    or (kind = 'shared')
  )
);

drop policy if exists "lists update owner" on public.lists;
create policy "lists update owner"
on public.lists
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "list_members select my memberships" on public.list_members;
drop policy if exists "list_members select own" on public.list_members;
create policy "list_members select own"
on public.list_members
for select
to authenticated
using (
  user_id = auth.uid()
);

drop policy if exists "list_members insert self" on public.list_members;
create policy "list_members insert self"
on public.list_members
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.lists
    where lists.id = list_id
      and (
        lists.owner_id = auth.uid()
        or lists.kind = 'shared'
      )
  )
);

drop policy if exists "list_members update own" on public.list_members;
create policy "list_members update own"
on public.list_members
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "movies select member lists" on public.movies;
create policy "movies select member lists"
on public.movies
for select
to authenticated
using (
  exists (
    select 1
    from public.list_members
    where list_members.list_id = movies.list_id
      and list_members.user_id = auth.uid()
  )
);

drop policy if exists "movies insert member lists" on public.movies;
create policy "movies insert member lists"
on public.movies
for insert
to authenticated
with check (
  added_by = auth.uid()
  and exists (
    select 1
    from public.list_members
    where list_members.list_id = movies.list_id
      and list_members.user_id = auth.uid()
  )
);

drop policy if exists "movies update member lists" on public.movies;
create policy "movies update member lists"
on public.movies
for update
to authenticated
using (
  exists (
    select 1
    from public.list_members
    where list_members.list_id = movies.list_id
      and list_members.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.list_members
    where list_members.list_id = movies.list_id
      and list_members.user_id = auth.uid()
  )
);

drop policy if exists "movies delete member lists" on public.movies;
create policy "movies delete member lists"
on public.movies
for delete
to authenticated
using (
  exists (
    select 1
    from public.list_members
    where list_members.list_id = movies.list_id
      and list_members.user_id = auth.uid()
  )
);


create or replace function public.bootstrap_user(p_display_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_list public.lists%rowtype;
begin
  if v_user_id is null then
    raise exception 'Sessão inválida.';
  end if;

  insert into public.profiles (id, display_name)
  values (
    v_user_id,
    coalesce(nullif(trim(p_display_name), ''), 'Usuário')
  )
  on conflict (id) do update
    set display_name = coalesce(nullif(trim(excluded.display_name), ''), public.profiles.display_name);

  select *
  into v_profile
  from public.profiles
  where id = v_user_id;

  select *
  into v_list
  from public.lists
  where owner_id = v_user_id
    and kind = 'personal'
  limit 1;

  if not found then
    insert into public.lists (name, kind, invite_code, owner_id)
    values ('Minha lista', 'personal', null, v_user_id)
    returning * into v_list;
  end if;

  insert into public.list_members (list_id, user_id)
  values (v_list.id, v_user_id)
  on conflict (list_id, user_id) do nothing;

  return jsonb_build_object(
    'profile', to_jsonb(v_profile),
    'personal_list', to_jsonb(v_list)
  );
end;
$$;

grant execute on function public.bootstrap_user(text) to authenticated;
