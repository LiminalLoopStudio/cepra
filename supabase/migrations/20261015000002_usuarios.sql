-- =============================================================================
-- CEPRA — Migración 2: usuarios y roles
--
-- Supabase guarda el login (correo + contraseña) en auth.users.
-- Aquí creamos el PERFIL de cada usuario: nombre, rol y si está activo.
-- El perfil se crea solo cuando el administrador da de alta a alguien.
-- =============================================================================

create type public.rol_usuario as enum ('administrador', 'almacenista', 'lider', 'staff');

create table public.usuarios (
  id          uuid primary key references auth.users (id) on delete cascade,
  nombre      text not null check (length(trim(nombre)) > 0),
  rol         public.rol_usuario not null default 'staff',
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.usuarios is
  'Perfil de cada usuario de CEPRA (1 a 1 con auth.users).';

create trigger usuarios_updated_at
  before update on public.usuarios
  for each row execute function public.tg_updated_at();

-- -----------------------------------------------------------------------------
-- Alta automática del perfil
-- Al crear un usuario en Authentication se crea su fila en usuarios.
--   nombre: user_metadata.nombre (si no viene, la parte del correo antes de @)
--   rol:    app_metadata.rol (solo el servidor/administrador puede fijarlo;
--           el usuario no puede cambiárselo). Si no viene, queda como staff.
-- -----------------------------------------------------------------------------
create function public.tg_nuevo_usuario_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.usuarios (id, nombre, rol)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'nombre'), ''), split_part(new.email, '@', 1)),
    coalesce((new.raw_app_meta_data ->> 'rol')::public.rol_usuario, 'staff')
  );
  return new;
end;
$$;

create trigger auth_usuario_creado
  after insert on auth.users
  for each row execute function public.tg_nuevo_usuario_auth();

-- Por si ya existía algún usuario en Authentication antes de esta migración.
insert into public.usuarios (id, nombre, rol)
select
  u.id,
  coalesce(nullif(trim(u.raw_user_meta_data ->> 'nombre'), ''), split_part(u.email, '@', 1)),
  coalesce((u.raw_app_meta_data ->> 'rol')::public.rol_usuario, 'staff')
from auth.users u
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Funciones de rol (las usan las reglas de seguridad de todas las tablas)
-- SECURITY DEFINER para poder leer usuarios sin depender de su propia RLS.
-- -----------------------------------------------------------------------------
create function public.rol_actual()
returns public.rol_usuario
language sql
stable
security definer
set search_path = ''
as $$
  select u.rol from public.usuarios u
   where u.id = (select auth.uid()) and u.activo;
$$;

create function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.rol_actual() = 'administrador', false);
$$;

revoke execute on function public.rol_actual() from public, anon;
revoke execute on function public.es_admin() from public, anon;
revoke execute on function public.tg_nuevo_usuario_auth() from public, anon, authenticated;
grant execute on function public.rol_actual() to authenticated;
grant execute on function public.es_admin() to authenticated;

-- -----------------------------------------------------------------------------
-- Seguridad de usuarios
-- Todos los usuarios con sesión pueden ver nombres y roles (para saber
-- "quién tiene qué"). Nadie los modifica desde la app por ahora: altas y
-- cambios de rol los hace el administrador desde el servidor.
-- -----------------------------------------------------------------------------
alter table public.usuarios enable row level security;

grant select on public.usuarios to authenticated;

create policy "usuarios: lectura para usuarios con sesión"
  on public.usuarios
  for select
  to authenticated
  using (true);

-- -----------------------------------------------------------------------------
-- Catálogo: ahora que existen los roles, el administrador puede escribir.
-- -----------------------------------------------------------------------------
grant insert, update on public.catalogo_articulos to authenticated;

create policy "catalogo: alta por administrador"
  on public.catalogo_articulos
  for insert
  to authenticated
  with check ((select public.es_admin()));

create policy "catalogo: edición por administrador"
  on public.catalogo_articulos
  for update
  to authenticated
  using ((select public.es_admin()))
  with check ((select public.es_admin()));
