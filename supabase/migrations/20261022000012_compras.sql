-- =============================================================================
-- CEPRA — Migración 12: compras (suscripciones, juegos, servicios…)
--
-- Registro de lo que se compra para los eventos (Game Pass, PS Plus, juegos,
-- servicios) con todo lo necesario para facturarlo después: fecha, monto,
-- cuenta en la que se compró, evento, comprobante y factura (PDF/XML).
-- Solo líderes y administradores. Solo el administrador anula una compra.
-- Los archivos van al bucket privado "compras" de Supabase Storage.
-- =============================================================================

create type public.estado_factura as enum ('pendiente', 'solicitada', 'facturada', 'no_facturable');
create type public.tipo_archivo_compra as enum ('comprobante', 'factura_pdf', 'factura_xml', 'otro');

-- -----------------------------------------------------------------------------
-- Compras
-- -----------------------------------------------------------------------------
create table public.compras (
  id                uuid primary key default gen_random_uuid(),
  fecha             date not null default current_date,
  concepto          text not null check (length(trim(concepto)) > 0),   -- "Game Pass Ultimate 3 meses"
  categoria         text not null default 'Suscripción',                 -- Suscripción, Juego, Servicio…
  proveedor         text,                                                -- Microsoft Store, PlayStation Store…
  cuenta_id         uuid references public.cuentas (id) on delete set null,
  evento_id         uuid references public.eventos (id) on delete set null,
  monto             numeric(12, 2) not null check (monto >= 0),
  moneda            text not null default 'MXN' check (moneda ~ '^[A-Z]{3}$'),
  metodo_pago       text,                                                -- "Tarjeta empresa", "PayPal"…
  tarjeta_ultimos4  text check (tarjeta_ultimos4 ~ '^[0-9]{4}$'),        -- SOLO los últimos 4 dígitos
  folio_pedido      text,                                                -- número de orden / pedido
  vigencia_hasta    date,                                                -- para suscripciones
  estado_factura    public.estado_factura not null default 'pendiente',
  folio_factura     text,                                                -- folio o UUID del CFDI
  notas             text,
  activo            boolean not null default true,                       -- false = anulada
  creado_por        uuid references public.usuarios (id) default auth.uid(),
  actualizado_por   uuid references public.usuarios (id) default auth.uid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on column public.compras.tarjeta_ultimos4 is
  'Solo los últimos 4 dígitos de la tarjeta. Nunca el número completo.';

create index compras_fecha_idx on public.compras (fecha desc);
create index compras_evento_idx on public.compras (evento_id) where evento_id is not null;
create index compras_cuenta_idx on public.compras (cuenta_id) where cuenta_id is not null;

create trigger compras_updated_at
  before update on public.compras
  for each row execute function public.tg_updated_at();

-- Quién creó / cambió (no se puede falsear desde la app).
create function public.tg_compras_autor()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.actualizado_por := auth.uid();
  if tg_op = 'INSERT' then
    new.creado_por := auth.uid();
  else
    new.creado_por := old.creado_por;
  end if;
  return new;
end;
$$;

create trigger compras_autor
  before insert or update on public.compras
  for each row execute function public.tg_compras_autor();

-- Anular / reactivar: solo el administrador.
create function public.tg_compras_activo_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.activo is distinct from old.activo and not public.es_admin() then
    raise exception 'Solo el administrador puede anular o reactivar compras'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger compras_activo_admin
  before update on public.compras
  for each row execute function public.tg_compras_activo_admin();

-- -----------------------------------------------------------------------------
-- Archivos de cada compra (el archivo vive en Storage; aquí su registro)
-- -----------------------------------------------------------------------------
create table public.compra_archivos (
  id           uuid primary key default gen_random_uuid(),
  compra_id    uuid not null references public.compras (id) on delete cascade,
  tipo         public.tipo_archivo_compra not null default 'comprobante',
  nombre       text not null,                 -- nombre original del archivo
  ruta         text not null unique,          -- ruta dentro del bucket "compras"
  tamano       integer,
  subido_por   uuid references public.usuarios (id) default auth.uid(),
  created_at   timestamptz not null default now()
);

create index compra_archivos_compra_idx on public.compra_archivos (compra_id);

-- -----------------------------------------------------------------------------
-- Seguridad de tablas: solo líder y administrador.
-- -----------------------------------------------------------------------------
alter table public.compras enable row level security;
alter table public.compra_archivos enable row level security;

grant select on public.compras, public.compra_archivos to authenticated;
grant insert (fecha, concepto, categoria, proveedor, cuenta_id, evento_id, monto, moneda, metodo_pago,
              tarjeta_ultimos4, folio_pedido, vigencia_hasta, estado_factura, folio_factura, notas),
      update (fecha, concepto, categoria, proveedor, cuenta_id, evento_id, monto, moneda, metodo_pago,
              tarjeta_ultimos4, folio_pedido, vigencia_hasta, estado_factura, folio_factura, notas, activo)
  on public.compras to authenticated;
grant insert (compra_id, tipo, nombre, ruta, tamano), delete on public.compra_archivos to authenticated;

create policy "compras: lectura" on public.compras
  for select to authenticated using ((select public.es_lider_o_admin()));
create policy "compras: alta" on public.compras
  for insert to authenticated with check ((select public.es_lider_o_admin()));
create policy "compras: edición" on public.compras
  for update to authenticated
  using ((select public.es_lider_o_admin())) with check ((select public.es_lider_o_admin()));

create policy "compra_archivos: lectura" on public.compra_archivos
  for select to authenticated using ((select public.es_lider_o_admin()));
create policy "compra_archivos: alta" on public.compra_archivos
  for insert to authenticated with check ((select public.es_lider_o_admin()));
create policy "compra_archivos: borrado" on public.compra_archivos
  for delete to authenticated using ((select public.es_lider_o_admin()));

-- -----------------------------------------------------------------------------
-- Storage: bucket privado "compras" (máx. 10 MB por archivo; PDF, imágenes, XML)
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'compras', 'compras', false, 10485760,
  array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic',
        'application/xml', 'text/xml']
)
on conflict (id) do nothing;

create policy "compras archivos: leer" on storage.objects
  for select to authenticated
  using (bucket_id = 'compras' and (select public.es_lider_o_admin()));
create policy "compras archivos: subir" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'compras' and (select public.es_lider_o_admin()));
create policy "compras archivos: borrar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'compras' and (select public.es_lider_o_admin()));
