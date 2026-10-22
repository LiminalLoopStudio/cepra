-- =============================================================================
-- CEPRA — Migración 8: categorías y código automático en el catálogo
--
-- Antes el administrador escribía el código del tipo (XBX, HDMI…) y la
-- categoría a mano: se colaban errores. Ahora:
--   * Las categorías son una lista fija, cada una con 2 letras (Consola = CN).
--   * El código del tipo lo genera la base: letras + consecutivo de 2 dígitos
--     dentro de la categoría → CN01, CN02, PT01…
--   * Etiqueta de cada pieza: GP-CN01-0001 (como antes, GP-<código>-NNNN).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Categorías
-- -----------------------------------------------------------------------------
create table public.categorias (
  id               uuid primary key default gen_random_uuid(),
  nombre           text not null unique check (length(trim(nombre)) > 0),
  prefijo          text not null unique check (prefijo ~ '^[A-Z]{2}$'),
  -- Siguiente consecutivo para el código del tipo (CN01…CN99).
  siguiente_numero integer not null default 1 check (siguiente_numero between 1 and 100),
  activo           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.categorias is
  'Categorías del catálogo. El prefijo (2 letras) arma el código de cada tipo: CN01, CN02…';

create trigger categorias_updated_at
  before update on public.categorias
  for each row execute function public.tg_updated_at();

insert into public.categorias (nombre, prefijo) values
  ('Consola',    'CN'),
  ('Pantalla',   'PT'),
  ('PC',         'PC'),
  ('Laptop',     'LP'),
  ('Control',    'CT'),
  ('Periférico', 'PF'),
  ('Cable',      'CB'),
  ('Adaptador',  'AD'),
  ('Extensión',  'EX'),
  ('Corriente',  'CR'),
  ('Consumible', 'CS')
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Catálogo → categoría
-- La columna de texto "categoria" se conserva (la usan varias pantallas), pero
-- ya no se escribe a mano: la llena el trigger con el nombre de la categoría.
-- -----------------------------------------------------------------------------
alter table public.catalogo_articulos
  add column categoria_id uuid references public.categorias (id);

create index catalogo_categoria_idx on public.catalogo_articulos (categoria_id);

-- Tipos que ya existían: se ligan por nombre. Conservan su código anterior.
update public.catalogo_articulos c
   set categoria_id = k.id
  from public.categorias k
 where lower(trim(c.categoria)) = lower(k.nombre);

-- -----------------------------------------------------------------------------
-- Código automático
--   Alta: toma el siguiente número de la categoría (con bloqueo de fila, así
--         dos altas al mismo tiempo nunca repiten código).
--   Edición: el código no se puede tocar. Si cambian la categoría de un tipo
--         SIN piezas ni movimientos, se le da un código nuevo de esa categoría.
-- -----------------------------------------------------------------------------
create function public.tg_catalogo_codigo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prefijo text;
  v_nombre  text;
  v_activa  boolean;
  v_numero  integer;
begin
  if tg_op = 'UPDATE' then
    new.codigo_tipo := old.codigo_tipo;  -- nunca a mano

    if new.categoria_id is not distinct from old.categoria_id then
      return new;
    end if;
    if new.categoria_id is null then
      raise exception 'Elige una categoría' using errcode = 'check_violation';
    end if;

    select nombre into v_nombre from public.categorias where id = new.categoria_id;
    if v_nombre is null then
      raise exception 'La categoría no existe' using errcode = 'foreign_key_violation';
    end if;
    new.categoria := v_nombre;

    -- Tipo de antes de esta migración (sin categoría): se liga y conserva su código.
    if old.categoria_id is null then
      return new;
    end if;

    if exists (select 1 from public.equipos e where e.articulo_id = old.id)
       or exists (select 1 from public.movimientos m where m.articulo_id = old.id) then
      raise exception 'El tipo % ya tiene piezas o movimientos: no se puede cambiar de categoría (su código está en etiquetas)', old.codigo_tipo
        using errcode = 'check_violation';
    end if;
  elsif new.categoria_id is null then
    raise exception 'Elige una categoría' using errcode = 'check_violation';
  end if;

  update public.categorias
     set siguiente_numero = siguiente_numero + 1
   where id = new.categoria_id
  returning prefijo, nombre, activo, siguiente_numero - 1
       into v_prefijo, v_nombre, v_activa, v_numero;

  if v_prefijo is null then
    raise exception 'La categoría no existe' using errcode = 'foreign_key_violation';
  end if;
  if not v_activa then
    raise exception 'La categoría % está inactiva', v_nombre using errcode = 'check_violation';
  end if;
  if v_numero > 99 then
    raise exception 'La categoría % ya tiene 99 tipos: crea otra categoría', v_nombre
      using errcode = 'check_violation';
  end if;

  new.codigo_tipo := v_prefijo || lpad(v_numero::text, 2, '0');
  new.categoria := v_nombre;
  return new;
end;
$$;

create trigger catalogo_codigo
  before insert or update on public.catalogo_articulos
  for each row execute function public.tg_catalogo_codigo();

revoke execute on function public.tg_catalogo_codigo() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Categorías: si cambian de nombre se refleja en el catálogo. Las 2 letras
-- solo se pueden cambiar mientras la categoría no tenga tipos.
-- -----------------------------------------------------------------------------
create function public.tg_categorias_cambios()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.prefijo is distinct from old.prefijo
     and exists (select 1 from public.catalogo_articulos c where c.categoria_id = old.id) then
    raise exception 'La categoría % ya tiene tipos: sus letras (%) ya no se pueden cambiar', old.nombre, old.prefijo
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger categorias_cambios
  before update on public.categorias
  for each row execute function public.tg_categorias_cambios();

create function public.tg_categorias_renombrar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.catalogo_articulos
     set categoria = new.nombre
   where categoria_id = new.id;
  return new;
end;
$$;

create trigger categorias_renombrar
  after update of nombre on public.categorias
  for each row execute function public.tg_categorias_renombrar();

revoke execute on function public.tg_categorias_cambios() from public, anon, authenticated;
revoke execute on function public.tg_categorias_renombrar() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Seguridad
-- -----------------------------------------------------------------------------
alter table public.categorias enable row level security;

grant select on public.categorias to authenticated;
grant insert (nombre, prefijo), update (nombre, prefijo, activo)
  on public.categorias to authenticated;

create policy "categorias: lectura" on public.categorias
  for select to authenticated using (true);
create policy "categorias: alta por administrador" on public.categorias
  for insert to authenticated with check ((select public.es_admin()));
create policy "categorias: edición por administrador" on public.categorias
  for update to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

-- El catálogo ya no recibe código ni categoría escritos: solo los campos editables.
revoke insert, update on public.catalogo_articulos from authenticated;
grant insert (
  nombre, categoria_id, serializado, puertos_default, stock_minimo, lleva_control, lleva_cables
) on public.catalogo_articulos to authenticated;
grant update (
  nombre, categoria_id, serializado, puertos_default, stock_minimo, lleva_control, lleva_cables, activo
) on public.catalogo_articulos to authenticated;
