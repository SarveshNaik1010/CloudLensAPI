create extension if not exists "pgcrypto";

create table if not exists public.users (
  user_id uuid primary key default gen_random_uuid(),
  email varchar not null unique,
  password_hash text not null,
  user_name varchar not null,
  avatar_url text,
  currency char(3) not null default 'USD',
  timezone varchar not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.cloud_connections (
  connection_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(user_id),
  provider varchar not null check (provider in ('AWS', 'AZURE', 'GCP')),
  provider_account_id varchar not null,
  connection_name varchar not null,
  credentials jsonb not null,
  status varchar not null default 'ACTIVE' check (status in ('ACTIVE', 'DISABLED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists cloud_connections_active_user_idx on public.cloud_connections(user_id, provider, status) where deleted_at is null;

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists users_updated_at on public.users;
create trigger users_updated_at before update on public.users for each row execute function public.set_updated_at();
drop trigger if exists cloud_connections_updated_at on public.cloud_connections;
create trigger cloud_connections_updated_at before update on public.cloud_connections for each row execute function public.set_updated_at();
