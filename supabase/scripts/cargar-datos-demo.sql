-- =============================================================================
-- CEPRA — Datos de demostración (se corre UNA vez, a mano)
--
-- NO es una migración: `db push` no la corre.
-- Se pega completa en Supabase → SQL Editor → Run.
--
-- ANTES:
--   1) Corre limpiar-datos-de-prueba.sql (este script se niega a correr si ya
--      hay equipos o eventos, para no mezclar datos).
--   2) Cambia la contraseña y el PIN de las cuentas demo (abajo, en "AJUSTA").
--
-- CREA (todo con fechas repartidas de oct-2025 a hoy):
--   * 20 usuarios demo @cepra.test: 1 admin, 3 almacén, 6 líderes, 10 staff,
--     con contraseña y PIN ya puestos (no piden cambiarla al entrar).
--   * 20 propietarios, 20 categorías, 20 clasificaciones de cuentas.
--   * 50 tipos de artículo (23 por pieza, 27 por cantidad) y ~100 piezas
--     etiquetadas y validadas; existencias por cantidad con ajustes.
--   * 20 eventos (17 cerrados, 1 activo, 2 planeados) con zonas y staff.
--   * ~45 préstamos firmados con PIN y sus devoluciones (con faltantes,
--     accesorios que llegaron después, piezas con falla y una en reparación).
--     El evento activo queda con equipo prestado.
--   * 25 cuentas de plataformas y 25 compras.
--   * Todo el historial (movimientos) se genera con las mismas funciones
--     que usa la app.
--
-- NO CREA archivos de compras (comprobantes/facturas): necesitan un archivo
-- real en Storage. Sube 2 o 3 a mano desde la app si quieres mostrarlo.
--
-- PARA ENTREGAR LIMPIO: corre limpiar-datos-de-prueba.sql otra vez. Borra
-- todo esto, incluidos los usuarios @cepra.test.
--
-- Todo ocurre en una sola transacción: si algo falla, no se guarda nada.
-- =============================================================================

begin;

-- Helper temporal: "actuar como" un usuario (para que auth.uid(), los roles
-- y los autores queden como si lo hubiera hecho esa persona en la app).
create function pg_temp.como(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true),
         set_config('request.jwt.claims',
                    case when p_uid is null then '' else
                    json_build_object('sub', p_uid, 'role', 'authenticated')::text end, true);
$$;

do $seed$
declare
  -- ===========================  AJUSTA  ======================================
  c_pass constant text := 'CAMBIA-ESTA-CONTRASENA';  -- mínimo 8 caracteres
  c_pin  constant text := '2580';                    -- 4 a 6 números
  -- ===========================================================================

  v_id      uuid;
  v_admin   uuid;
  a_alm     uuid[] := '{}';
  a_lid     uuid[] := '{}';
  a_staff   uuid[] := '{}';
  r         record;
  r2        record;
  v_res     jsonb;
  v_ev      uuid;
  v_evs     uuid[];
  v_idx     integer;
  v_n       integer;
  v_k       integer;
  v_cerrado boolean;
  v_rec     uuid;
  v_receps  uuid[];
  v_piezas  jsonb;
  v_cants   jsonb;
  v_items   jsonb;
  v_tarde   jsonb;
  v_falla   boolean;
  v_tardes  uuid[] := '{}';
  v_folio   bigint;
  v_zonas   text[] := array['Consolas', 'PC Gaming', 'Realidad virtual', 'Escenario / torneo', 'Registro'];
  v_plat    uuid;
  v_cuenta  uuid;
begin
  -- ---------------------------------------------------------------- Revisiones
  if c_pass = 'CAMBIA-ESTA-CONTRASENA' or length(c_pass) < 8 then
    raise exception 'Primero cambia c_pass (contraseña de las cuentas demo, mínimo 8 caracteres) al inicio del script';
  end if;
  if c_pin !~ '^[0-9]{4,6}$' then
    raise exception 'c_pin debe tener de 4 a 6 números';
  end if;
  if exists (select 1 from auth.users where email like '%@cepra.test') then
    raise exception 'Ya hay usuarios @cepra.test. Corre primero limpiar-datos-de-prueba.sql';
  end if;
  if exists (select 1 from public.equipos) or exists (select 1 from public.eventos)
     or exists (select 1 from public.catalogo_articulos) then
    raise exception 'Ya hay equipos, eventos o catálogo. Corre primero limpiar-datos-de-prueba.sql';
  end if;

  perform setseed(0.2026);

  -- ------------------------------------------------------------- 1) Usuarios
  for r in
    select * from (values
      (1,  'Administrador Demo',   'admin.demo',        'administrador'),
      (2,  'Laura Méndez',         'laura.mendez',      'almacenista'),
      (3,  'Diego Ramírez',        'diego.ramirez',     'almacenista'),
      (4,  'Paola Cruz',           'paola.cruz',        'almacenista'),
      (5,  'Andrés Salinas',       'andres.salinas',    'lider'),
      (6,  'Fernanda Ortiz',       'fernanda.ortiz',    'lider'),
      (7,  'Ricardo Vega',         'ricardo.vega',      'lider'),
      (8,  'Mariana Torres',       'mariana.torres',    'lider'),
      (9,  'Jorge Castillo',       'jorge.castillo',    'lider'),
      (10, 'Valeria Núñez',        'valeria.nunez',     'lider'),
      (11, 'Emiliano Rojas',       'emiliano.rojas',    'staff'),
      (12, 'Camila Herrera',       'camila.herrera',    'staff'),
      (13, 'Santiago Flores',      'santiago.flores',   'staff'),
      (14, 'Daniela Aguilar',      'daniela.aguilar',   'staff'),
      (15, 'Mateo Jiménez',        'mateo.jimenez',     'staff'),
      (16, 'Regina Morales',       'regina.morales',    'staff'),
      (17, 'Sebastián Luna',       'sebastian.luna',    'staff'),
      (18, 'Ximena Delgado',       'ximena.delgado',    'staff'),
      (19, 'Leonardo Navarro',     'leonardo.navarro',  'staff'),
      (20, 'Renata Guzmán',        'renata.guzman',     'staff')
    ) as u(n, nombre, usuario, rol) order by n
  loop
    v_id := gen_random_uuid();
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change)
    values (
      v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      r.usuario || '@cepra.test', extensions.crypt(c_pass, extensions.gen_salt('bf')), now(),
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'rol', r.rol),
      jsonb_build_object('nombre', r.nombre), now(), now(), '', '', '', '');
    insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_id::text, v_id,
            jsonb_build_object('sub', v_id::text, 'email', r.usuario || '@cepra.test', 'email_verified', true),
            'email', now(), now(), now());

    update public.usuarios set debe_cambiar_contrasena = false where id = v_id;
    update public.usuario_firma
       set pin_hash = extensions.crypt(c_pin, extensions.gen_salt('bf', 8)), pin_actualizado_at = now()
     where usuario_id = v_id;

    case r.rol
      when 'administrador' then v_admin := v_id;
      when 'almacenista'   then a_alm   := a_alm || v_id;
      when 'lider'         then a_lid   := a_lid || v_id;
      else                      a_staff := a_staff || v_id;
    end case;
  end loop;

  -- --------------------------------------------------------- 2) Propietarios
  insert into public.propietarios (nombre, tipo, contacto)
  values ('Gaming Partners', 'propio', null)
  on conflict (nombre) do nothing;

  insert into public.propietarios (nombre, tipo, contacto) values
    ('Nébula Gaming',          'patrocinador', 'Karla Pineda · 55 1234 0001'),
    ('Pixel Rush MX',          'patrocinador', 'Óscar Lara · 55 1234 0002'),
    ('Volt Energy Drink',      'patrocinador', 'mercadotecnia@volt.demo'),
    ('Zenit Periféricos',      'patrocinador', 'Luis Paredes · 55 1234 0004'),
    ('Aurora Telecom',         'patrocinador', 'patrocinios@aurora.demo'),
    ('Kraken Sillas Gamer',    'patrocinador', 'Ana Ruiz · 81 2233 0006'),
    ('Orbital Pantallas',      'patrocinador', 'ventas@orbital.demo'),
    ('Fénix Snacks',           'patrocinador', 'Brenda Solís · 33 4455 0008'),
    ('Tlaloc Bebidas',         'patrocinador', 'eventos@tlaloc.demo'),
    ('Cometa Streaming',       'patrocinador', 'Iván Peña · 55 1234 0010'),
    ('Rentas Audiovisuales MX','prestamista',  'Roberto Gil · 55 9876 0011'),
    ('ProSonido Eventos',      'prestamista',  'bodega@prosonido.demo'),
    ('VR Experiences',         'prestamista',  'Daniel Mora · 55 9876 0013'),
    ('Club Esports Anáhuac',   'prestamista',  'Coordinación de deportes'),
    ('Liga Gamer Norte',       'prestamista',  'Hugo Treviño · 81 9876 0015'),
    ('Arcade Retro CDMX',      'prestamista',  'Sofía Ibarra · 55 9876 0016'),
    ('Tech Rent Bajío',        'prestamista',  'renta@techbajio.demo'),
    ('Escenarios Pro',         'prestamista',  'Martín Cano · 55 9876 0018'),
    ('Comunidad Smash MX',     'prestamista',  'Pablo Ríos · 55 9876 0019');

  -- ----------------------------------------------------------- 3) Categorías
  insert into public.categorias (nombre, prefijo) values
    ('Realidad virtual', 'RV'),
    ('Audio',            'AU'),
    ('Streaming',        'ST'),
    ('Red',              'RD'),
    ('Tablet',           'TB'),
    ('Mobiliario',       'MB'),
    ('Iluminación',      'IL'),
    ('Señalización',     'SE'),
    ('Herramienta',      'HR')
  on conflict (nombre) do nothing;

  -- ------------------------------------------- 4) Clasificaciones de cuentas
  insert into public.plataformas (nombre, orden) values
    ('Battle.net', 110), ('EA App', 120), ('Ubisoft Connect', 130), ('GOG', 140),
    ('Roblox', 150), ('Minecraft', 160), ('Discord', 170), ('Twitch', 180),
    ('YouTube', 190), ('Supercell', 200), ('Garena', 210)
  on conflict (nombre) do nothing;

  -- --------------------------------------------------------------- 5) Catálogo
  perform pg_temp.como(v_admin);
  -- El código (CN01, PT01…) lo pone la base según la categoría.
  for r in
    select v.*, c.id as cat_id from (values
      -- orden, categoría, nombre, por pieza, control, cables, mínimo, puertos
      (1,  'Consola',          'PlayStation 5',                 true,  true,  true,  0,  '{HDMI,USB-C,Ethernet}'),
      (2,  'Consola',          'PlayStation 5 Pro',             true,  true,  true,  0,  '{HDMI,USB-C,Ethernet}'),
      (3,  'Consola',          'Xbox Series X',                 true,  true,  true,  0,  '{HDMI,USB,Ethernet}'),
      (4,  'Consola',          'Xbox Series S',                 true,  true,  true,  0,  '{HDMI,USB,Ethernet}'),
      (5,  'Consola',          'Nintendo Switch 2',             true,  true,  true,  0,  '{USB-C,HDMI (dock)}'),
      (6,  'Consola',          'Nintendo Switch OLED',          true,  true,  true,  0,  '{USB-C,HDMI (dock)}'),
      (7,  'Pantalla',         'Pantalla 55" 4K',               true,  false, true,  0,  '{HDMI x3,USB}'),
      (8,  'Pantalla',         'Pantalla 43" Full HD',          true,  false, true,  0,  '{HDMI x2,USB}'),
      (9,  'Pantalla',         'Monitor gamer 27" 165 Hz',      true,  false, true,  0,  '{HDMI,DisplayPort}'),
      (10, 'Pantalla',         'Monitor 24" 144 Hz',            true,  false, true,  0,  '{HDMI,DisplayPort}'),
      (11, 'PC',               'PC gamer RTX 4070',             true,  false, true,  0,  '{HDMI,DisplayPort,USB,Ethernet}'),
      (12, 'PC',               'PC gamer RTX 4060',             true,  false, true,  0,  '{HDMI,DisplayPort,USB,Ethernet}'),
      (13, 'Laptop',           'Laptop gamer 15"',              true,  false, true,  0,  '{HDMI,USB-C,USB}'),
      (14, 'Laptop',           'Laptop de registro',            true,  false, true,  0,  '{USB-C,USB}'),
      (15, 'Realidad virtual', 'Meta Quest 3',                  true,  true,  true,  0,  '{USB-C}'),
      (16, 'Realidad virtual', 'Meta Quest 3S',                 true,  true,  true,  0,  '{USB-C}'),
      (17, 'Audio',            'Bocina activa 15"',             true,  false, true,  0,  '{XLR,Plug 1/4}'),
      (18, 'Audio',            'Mezcladora 8 canales',          true,  false, true,  0,  '{XLR,USB}'),
      (19, 'Streaming',        'Capturadora 4K',                true,  false, true,  0,  '{HDMI in,HDMI out,USB-C}'),
      (20, 'Streaming',        'Cámara para streaming',         true,  false, true,  0,  '{USB-C}'),
      (21, 'Red',              'Router WiFi 6',                 true,  false, true,  0,  '{Ethernet x4,WAN}'),
      (22, 'Red',              'Switch 24 puertos',             true,  false, true,  0,  '{Ethernet x24}'),
      (23, 'Tablet',           'Tablet de registro',            true,  false, true,  0,  '{USB-C}'),
      (24, 'Control',          'Control DualSense extra',       false, false, false, 8,  '{}'),
      (25, 'Control',          'Control Xbox extra',            false, false, false, 6,  '{}'),
      (26, 'Control',          'Joy-Con (par)',                 false, false, false, 4,  '{}'),
      (27, 'Control',          'Control Pro Switch',            false, false, false, 4,  '{}'),
      (28, 'Periférico',       'Teclado mecánico',              false, false, false, 6,  '{}'),
      (29, 'Periférico',       'Mouse gamer',                   false, false, false, 6,  '{}'),
      (30, 'Periférico',       'Diadema gamer',                 false, false, false, 8,  '{}'),
      (31, 'Periférico',       'Mousepad XL',                   false, false, false, 4,  '{}'),
      (32, 'Cable',            'Cable HDMI 2.1 de 2 m',         false, false, false, 10, '{}'),
      (33, 'Cable',            'Cable HDMI de 5 m',             false, false, false, 6,  '{}'),
      (34, 'Cable',            'Cable USB-C de 2 m',            false, false, false, 10, '{}'),
      (35, 'Cable',            'Cable de red Cat 6 de 3 m',     false, false, false, 10, '{}'),
      (36, 'Adaptador',        'Adaptador USB-C a HDMI',        false, false, false, 3,  '{}'),
      (37, 'Adaptador',        'Adaptador DisplayPort a HDMI',  false, false, false, 3,  '{}'),
      (38, 'Extensión',        'Extensión uso rudo 5 m',        false, false, false, 8,  '{}'),
      (39, 'Extensión',        'Multicontacto 6 tomas',         false, false, false, 8,  '{}'),
      (40, 'Corriente',        'Regulador 1000 VA',             false, false, false, 4,  '{}'),
      (41, 'Corriente',        'No-break 1500 VA',              false, false, false, 2,  '{}'),
      (42, 'Consumible',       'Cinta gaffer (rollo)',          false, false, false, 6,  '{}'),
      (43, 'Consumible',       'Cinchos (bolsa de 100)',        false, false, false, 5,  '{}'),
      (44, 'Consumible',       'Toallitas limpiadoras',         false, false, false, 10, '{}'),
      (45, 'Consumible',       'Pilas AA (paquete de 4)',       false, false, false, 10, '{}'),
      (46, 'Mobiliario',       'Silla gamer',                   false, false, false, 4,  '{}'),
      (47, 'Mobiliario',       'Mesa plegable 1.8 m',           false, false, false, 4,  '{}'),
      (48, 'Iluminación',      'Tira LED RGB 5 m',              false, false, false, 4,  '{}'),
      (49, 'Señalización',     'Banner roll-up',                false, false, false, 2,  '{}'),
      (50, 'Herramienta',      'Kit de herramientas',           false, false, false, 1,  '{}')
    ) as v(n, cat, nombre, serial, ctrl, cbl, minimo, puertos)
    join public.categorias c on c.nombre = v.cat
    order by v.n
  loop
    insert into public.catalogo_articulos
      (nombre, categoria, categoria_id, serializado, lleva_control, lleva_cables, stock_minimo, puertos_default)
    values (r.nombre, r.cat, r.cat_id, r.serial, r.ctrl, r.cbl, r.minimo, r.puertos::text[]);
  end loop;

  -- ---------------------------------------------------------------- 6) Piezas
  perform pg_temp.como(a_alm[1]);  -- el alta queda a nombre de almacén
  for r in
    select v.*, a.id as art_id, a.puertos_default from (values
      ('PlayStation 5',             8, 'Sony',      'CFI-2015'),
      ('PlayStation 5 Pro',         3, 'Sony',      'CFI-7015'),
      ('Xbox Series X',             6, 'Microsoft', '1882'),
      ('Xbox Series S',             4, 'Microsoft', '1883'),
      ('Nintendo Switch 2',         6, 'Nintendo',  'BEE-001'),
      ('Nintendo Switch OLED',      4, 'Nintendo',  'HEG-001'),
      ('Pantalla 55" 4K',           8, 'Samsung',   'UN55DU7000'),
      ('Pantalla 43" Full HD',      6, 'LG',        '43LR6500'),
      ('Monitor gamer 27" 165 Hz',  6, 'ASUS',      'VG27AQ'),
      ('Monitor 24" 144 Hz',        4, 'AOC',       '24G2'),
      ('PC gamer RTX 4070',         6, 'Ensamble GP','R7-4070'),
      ('PC gamer RTX 4060',         4, 'Ensamble GP','R5-4060'),
      ('Laptop gamer 15"',          3, 'Lenovo',    'Legion 5'),
      ('Laptop de registro',        3, 'HP',        '240 G9'),
      ('Meta Quest 3',              4, 'Meta',      '512 GB'),
      ('Meta Quest 3S',             4, 'Meta',      '128 GB'),
      ('Bocina activa 15"',         4, 'JBL',       'EON715'),
      ('Mezcladora 8 canales',      2, 'Yamaha',    'MG10XU'),
      ('Capturadora 4K',            3, 'Elgato',    '4K X'),
      ('Cámara para streaming',     2, 'Logitech',  'C922'),
      ('Router WiFi 6',             3, 'TP-Link',   'AX3000'),
      ('Switch 24 puertos',         2, 'TP-Link',   'TL-SG1024'),
      ('Tablet de registro',        5, 'Samsung',   'Galaxy Tab A9+')
    ) as v(nombre, cuantas, marca, modelo)
    join public.catalogo_articulos a on a.nombre = v.nombre
  loop
    for v_k in 1 .. r.cuantas loop
      insert into public.equipos
        (articulo_id, marca, modelo, serie, puertos, estado_fisico, propiedad, propietario_id, fecha_devolucion, notas)
      values (
        r.art_id, r.marca, r.modelo,
        upper(substr(md5(r.nombre || v_k), 1, 4) || '-' || substr(md5(v_k || r.nombre), 1, 8)),
        r.puertos_default,
        case when v_k = 1 then 'nuevo'::public.estado_fisico
             when v_k % 5 = 0 then 'regular' else 'bueno' end,
        case when r.nombre in ('Meta Quest 3S') then 'prestamo'::public.tipo_propiedad
             when r.nombre = 'Bocina activa 15"' and v_k > 2 then 'prestamo'
             when r.nombre in ('PlayStation 5', 'Monitor gamer 27" 165 Hz') and v_k > r.cuantas - 2 then 'patrocinado'
             else 'propio' end,
        case when r.nombre = 'Meta Quest 3S' then (select id from public.propietarios where nombre = 'VR Experiences')
             when r.nombre = 'Bocina activa 15"' and v_k > 2 then (select id from public.propietarios where nombre = 'ProSonido Eventos')
             when r.nombre = 'PlayStation 5' and v_k > r.cuantas - 2 then (select id from public.propietarios where nombre = 'Nébula Gaming')
             when r.nombre = 'Monitor gamer 27" 165 Hz' and v_k > r.cuantas - 2 then (select id from public.propietarios where nombre = 'Zenit Periféricos')
        end,
        case when r.nombre = 'Meta Quest 3S' then date '2026-12-15'
             when r.nombre = 'Bocina activa 15"' and v_k > 2 then date '2026-11-30' end,
        case when v_k % 5 = 0 then 'Rayones leves en la carcasa' end
      );
    end loop;
  end loop;

  -- ---------------------------------------------- 7) Validación (almacén)
  -- Se dejan 4 piezas sin validar para mostrar esa pantalla.
  perform pg_temp.como(a_alm[1]);
  for r in
    select e.etiqueta, e.etiqueta_caja, row_number() over (order by e.etiqueta) as n
      from public.equipos e
     where e.etiqueta not in (
       select etiqueta from public.equipos e2
        join public.catalogo_articulos a on a.id = e2.articulo_id
       where a.nombre in ('Tablet de registro', 'Capturadora 4K')
       order by e2.etiqueta desc limit 4)
  loop
    v_res := public.validar_etiquetas(r.etiqueta, r.etiqueta_caja);
    if v_res ->> 'nivel' <> 'ok' then
      raise exception 'Validación falló: %', v_res ->> 'mensaje';
    end if;
  end loop;

  -- ------------------------------------------- 8) Existencias (admin)
  perform pg_temp.como(v_admin);
  for r in
    select a.id, a.nombre, a.stock_minimo from public.catalogo_articulos a where not a.serializado order by a.codigo_tipo
  loop
    perform public.ajustar_stock(r.id,
      case r.nombre
        when 'Pilas AA (paquete de 4)' then 14
        when 'Cinta gaffer (rollo)'    then 10
        when 'Kit de herramientas'     then 3
        when 'Banner roll-up'          then 6
        when 'No-break 1500 VA'        then 4
        else r.stock_minimo * 3 + (random() * 10)::int
      end,
      'compra', 'Inventario inicial');
  end loop;
  -- Algunos ajustes posteriores para que se vea historial.
  perform public.ajustar_stock((select id from public.catalogo_articulos where nombre = 'Cinta gaffer (rollo)'), -6, 'baja', 'Consumida en montaje');
  perform public.ajustar_stock((select id from public.catalogo_articulos where nombre = 'Pilas AA (paquete de 4)'), -8, 'baja', 'Consumidas en eventos');
  perform public.ajustar_stock((select id from public.catalogo_articulos where nombre = 'Cable HDMI 2.1 de 2 m'), -2, 'perdida', 'No regresaron de Gamergy');
  perform public.ajustar_stock((select id from public.catalogo_articulos where nombre = 'Diadema gamer'), 6, 'prestamo_recibido', 'Préstamo de Zenit Periféricos');
  perform public.ajustar_stock((select id from public.catalogo_articulos where nombre = 'Silla gamer'), 4, 'compra', 'Compra para torneos');

  -- --------------------------------------------- 9) Eventos, zonas y staff
  insert into public.eventos (nombre, lugar, fecha_inicio, fecha_fin, estado, notas) values
    ('GamingFest Liverpool Santa Fe 2025',      'Liverpool Santa Fe, CDMX',            '2025-11-14', '2025-11-16', 'planeado', null),
    ('GamingFest Liverpool Perisur 2025',       'Liverpool Perisur, CDMX',             '2025-12-12', '2025-12-14', 'planeado', null),
    ('Torneo Navideño GP',                      'Oficinas Gaming Partners',            '2025-12-20', '2025-12-20', 'planeado', 'Evento interno para clientes'),
    ('GamingFest Liverpool Monterrey',          'Liverpool Galerías Monterrey, NL',    '2026-01-23', '2026-01-25', 'planeado', 'Envío de equipo por paquetería'),
    ('Gamergy México invierno',                 'Expo Santa Fe, CDMX',                 '2026-02-20', '2026-02-22', 'planeado', null),
    ('GamingFest Liverpool Guadalajara',        'Liverpool Andares, Zapopan',          '2026-03-13', '2026-03-15', 'planeado', null),
    ('Copa Universitaria GP',                   'Ciudad Universitaria, CDMX',          '2026-03-27', '2026-03-28', 'planeado', null),
    ('GamingFest Liverpool Puebla',             'Liverpool Angelópolis, Puebla',       '2026-04-17', '2026-04-19', 'planeado', null),
    ('Torneo Día del Niño',                     'Liverpool Insurgentes, CDMX',         '2026-04-30', '2026-04-30', 'planeado', null),
    ('GamingFest Liverpool Querétaro',          'Liverpool Antea, Querétaro',          '2026-05-22', '2026-05-24', 'planeado', null),
    ('Gamergy México verano',                   'Expo Santa Fe, CDMX',                 '2026-06-19', '2026-06-21', 'planeado', null),
    ('Torneo de verano GP',                     'Oficinas Gaming Partners',            '2026-07-10', '2026-07-12', 'planeado', null),
    ('GamingFest Liverpool Mérida',             'Liverpool Mérida, Yucatán',           '2026-07-24', '2026-07-26', 'planeado', 'Envío de equipo por paquetería'),
    ('GamingFest Liverpool León',               'Liverpool Plaza Mayor, León',         '2026-08-14', '2026-08-16', 'planeado', null),
    ('Gaming Day regreso a clases',             'Liverpool Coyoacán, CDMX',            '2026-08-28', '2026-08-29', 'planeado', null),
    ('GamingFest Liverpool Toluca',             'Liverpool Galerías Metepec, Edomex',  '2026-09-18', '2026-09-20', 'planeado', null),
    ('Gamergy México otoño',                    'Expo Santa Fe, CDMX',                 '2026-10-02', '2026-10-04', 'planeado', null),
    ('GamingFest Liverpool Perisur 2026',       'Liverpool Perisur, CDMX',             '2026-10-20', '2026-10-26', 'planeado', 'Evento en curso'),
    ('Gamergy México invierno 2026',            'Expo Santa Fe, CDMX',                 '2026-11-20', '2026-11-22', 'planeado', 'Confirmar zonas con el cliente'),
    ('GamingFest Liverpool Santa Fe 2026',      'Liverpool Santa Fe, CDMX',            '2026-12-04', '2026-12-06', 'planeado', null);

  select array_agg(id order by fecha_inicio) into v_evs from public.eventos;

  for v_idx in 1 .. array_length(v_evs, 1) loop
    v_n := 3 + (v_idx % 2);  -- 3 o 4 zonas
    for v_k in 1 .. v_n loop
      insert into public.zonas (evento_id, nombre, lider_id)
      values (v_evs[v_idx], v_zonas[v_k], a_lid[1 + ((v_idx + v_k) % array_length(a_lid, 1))])
      returning id into v_id;
      -- 2 de staff por zona, sin repetir persona en el mismo evento.
      insert into public.zona_staff (zona_id, usuario_id, evento_id)
      values (v_id, a_staff[1 + ((v_idx * 3 + v_k * 2) % 10)], v_evs[v_idx]),
             (v_id, a_staff[1 + ((v_idx * 3 + v_k * 2 + 1) % 10)], v_evs[v_idx]);
    end loop;
  end loop;

  -- ----------------------------------------- 10) Préstamos y devoluciones
  for v_idx in 1 .. 18 loop
    v_ev := v_evs[v_idx];
    v_cerrado := v_idx < 18;
    update public.eventos set estado = 'activo' where id = v_ev;

    perform pg_temp.como(a_alm[1 + (v_idx % 3)]);

    -- Quién recibe: líderes y staff de las zonas del evento.
    select array_agg(u order by random()) into v_receps from (
      select lider_id as u from public.zonas where evento_id = v_ev
      union
      select usuario_id from public.zona_staff where evento_id = v_ev) x;

    for v_k in 1 .. case when v_cerrado then 2 + (v_idx % 2) else 6 end loop
      v_rec := v_receps[v_k];

      select coalesce(jsonb_agg(
               case when random() < 0.12 and e.etiqueta_control is not null
                    then jsonb_build_object('etiqueta', e.etiqueta, 'control', false)
                    else jsonb_build_object('etiqueta', e.etiqueta) end), '[]')
        into v_piezas
        from (select etiqueta, etiqueta_control from public.equipos
               where estado_operativo = 'disponible'
               order by random() limit 2 + (random() * 3)::int) e;

      select coalesce(jsonb_agg(jsonb_build_object('articulo_id', s.articulo_id, 'cantidad', 2 + (random() * 2)::int)), '[]')
        into v_cants
        from (select s.articulo_id from public.stock_cantidad s
               where s.total - s.reservado - public.stock_prestado(s.articulo_id) >= 6
               order by random() limit 1 + (random() * 2)::int) s;

      v_res := public.registrar_entrega(v_rec, c_pin, v_piezas, v_cants,
                 case when v_k = 1 then 'Montaje del primer día' end);
      if not (v_res ->> 'ok')::boolean then
        raise exception 'Entrega falló en %: %', v_idx, v_res ->> 'mensaje';
      end if;
    end loop;

    if v_cerrado then
      perform pg_temp.como(a_alm[1 + ((v_idx + 1) % 3)]);
      for r in select id, folio from public.prestamos where evento_id = v_ev order by folio loop
        v_falla := v_idx in (15, 16, 17) and r.folio % 2 = 0;
        v_tarde := '[]';
        select jsonb_agg(
                 case when i.equipo_id is not null then
                   jsonb_build_object(
                     'item_id', i.id,
                     'control', not (i.con_control and random() < 0.15),
                     'cables',  not (i.con_cables and random() < 0.08),
                     'falla',   v_falla and i.id = (select min(i2.id::text)::uuid from public.prestamo_items i2
                                                   where i2.prestamo_id = r.id and i2.equipo_id is not null))
                 else
                   jsonb_build_object('item_id', i.id,
                     'cantidad', case when random() < 0.1 then i.cantidad - 1 else i.cantidad end)
                 end)
          into v_items
          from public.prestamo_items i where i.prestamo_id = r.id;

        v_res := public.registrar_devolucion(v_items,
                   case when v_falla then 'Una pieza llegó con falla' else 'Cierre de evento' end || ' · folio ' || r.folio);
        if not (v_res ->> 'ok')::boolean then
          raise exception 'Devolución falló en folio %: %', r.folio, v_res ->> 'mensaje';
        end if;

        -- La mitad de los accesorios faltantes llegan días después.
        for r2 in
          select i.id from public.prestamo_items i
           where i.prestamo_id = r.id and i.equipo_id is not null
             and ((i.con_control and i.control_devuelto_at is null) or (i.con_cables and i.cables_devuelto_at is null))
             and r.folio % 2 = 1
        loop
          perform public.registrar_devolucion(
            jsonb_build_array(jsonb_build_object('item_id', r2.id, 'control', true, 'cables', true)),
            'Accesorio que faltaba · folio ' || r.folio);
          v_tardes := v_tardes || r2.id;
        end loop;
      end loop;
      update public.eventos set estado = 'cerrado' where id = v_ev;
    else
      -- Evento activo: se regresa un préstamo completo y lo demás sigue afuera.
      perform pg_temp.como(a_alm[1]);
      select id, folio into r from public.prestamos where evento_id = v_ev order by folio limit 1;
      select jsonb_agg(case when i.equipo_id is not null
                            then jsonb_build_object('item_id', i.id, 'control', true, 'cables', true)
                            else jsonb_build_object('item_id', i.id, 'cantidad', i.cantidad) end)
        into v_items from public.prestamo_items i where i.prestamo_id = r.id;
      perform public.registrar_devolucion(v_items, 'Cambio de equipo · folio ' || r.folio);
    end if;
  end loop;

  -- Una de las piezas con falla se manda a reparación.
  perform pg_temp.como(v_admin);
  select id, articulo_id into r from public.equipos where estado_operativo = 'con_falla' order by etiqueta limit 1;
  if found then
    update public.equipos set estado_operativo = 'en_reparacion', estado_fisico = 'en_reparacion' where id = r.id;
    insert into public.movimientos (tipo, equipo_id, articulo_id, cantidad, nota)
    values ('reparacion', r.id, r.articulo_id, 1, 'Enviado a servicio técnico');
  end if;

  -- -------------------------------------------------------- 11) Cuentas
  perform pg_temp.como(a_lid[1]);
  for r in
    select * from (values
      (1,  'Steam',       'steam01.gp@demo.test',      'GP_Steam01',     'PC gamer RTX 4070', 'Cuenta principal para torneos de PC'),
      (2,  'Steam',       'steam02.gp@demo.test',      'GP_Steam02',     'PC gamer RTX 4070', null),
      (3,  'Steam',       'steam03.gp@demo.test',      'GP_Steam03',     'PC gamer RTX 4060', null),
      (4,  'Epic Games',  'epic01.gp@demo.test',       'GPEpic01',       'PC gamer RTX 4070', 'Fortnite, torneos'),
      (5,  'Epic Games',  'epic02.gp@demo.test',       'GPEpic02',       'PlayStation 5',     null),
      (6,  'PlayStation', 'psn01.gp@demo.test',        'GP_PSN_01',      'PlayStation 5',     'Tiene PS Plus Premium'),
      (7,  'PlayStation', 'psn02.gp@demo.test',        'GP_PSN_02',      'PlayStation 5',     null),
      (8,  'PlayStation', 'psn03.gp@demo.test',        'GP_PSN_03',      'PlayStation 5 Pro', null),
      (9,  'Nintendo',    'nintendo01.gp@demo.test',   'GPNintendo1',    'Nintendo Switch 2', 'Switch Online + Paquete de expansión'),
      (10, 'Nintendo',    'nintendo02.gp@demo.test',   'GPNintendo2',    'Nintendo Switch OLED', null),
      (11, 'Oculus VR',   'meta01.gp@demo.test',       'GP.VR.01',       'Meta Quest 3',      null),
      (12, 'Oculus VR',   'meta02.gp@demo.test',       'GP.VR.02',       'Meta Quest 3',      null),
      (13, 'Xbox',        'xbox01.gp@demo.test',       'GP Xbox 01',     'Xbox Series X',     'Game Pass Ultimate'),
      (14, 'Xbox',        'xbox02.gp@demo.test',       'GP Xbox 02',     'Xbox Series X',     null),
      (15, 'Xbox',        'xbox03.gp@demo.test',       'GP Xbox 03',     'Xbox Series S',     null),
      (16, 'Riot',        'riot01.gp@demo.test',       'GP Riot#MX1',    'PC gamer RTX 4060', 'Valorant y LoL'),
      (17, 'Riot',        'riot02.gp@demo.test',       'GP Riot#MX2',    null,                null),
      (18, 'Móvil',       'movil01.gp@demo.test',      'GPMobile01',     'Tablet de registro', 'Free Fire y CoD Mobile'),
      (19, 'Móvil',       'movil02.gp@demo.test',      'GPMobile02',     null,                null),
      (20, 'Battle.net',  'bnet01.gp@demo.test',       'GPBnet#1234',    'PC gamer RTX 4070', null),
      (21, 'EA App',      'ea01.gp@demo.test',         'GP_EA_01',       'PlayStation 5',     'EA FC'),
      (22, 'Minecraft',   'mc01.gp@demo.test',         'GPCraft01',      'PC gamer RTX 4060', null),
      (23, 'Roblox',      'roblox01.gp@demo.test',     'GP_Roblox01',    'Laptop gamer 15"',  null),
      (24, 'Discord',     'discord.gp@demo.test',      'gamingpartners', null,                'Servidor de comunidad'),
      (25, 'Twitch',      'twitch.gp@demo.test',       'gamingpartnersmx', null,              'Transmisiones de torneos')
    ) as c(n, plat, correo, usuario, tipo_equipo, notas) order by n
  loop
    select id into v_plat from public.plataformas where nombre = r.plat;
    insert into public.cuentas (plataforma_id, correo, usuario, equipo_id, notas)
    values (v_plat, r.correo, r.usuario,
            (select e.id from public.equipos e join public.catalogo_articulos a on a.id = e.articulo_id
              where a.nombre = r.tipo_equipo order by e.etiqueta offset (r.n % 3) limit 1),
            r.notas);
  end loop;

  -- -------------------------------------------------------- 12) Compras
  perform pg_temp.como(a_lid[2]);
  for r in
    select * from (values
      (1,  '2025-11-03', 'Xbox Game Pass Ultimate 3 meses',      'Suscripción',       'Microsoft Store',   'xbox01.gp@demo.test',     5,  749.00,  'MXN', '2026-02-03', 'facturada'),
      (2,  '2025-11-03', 'Xbox Game Pass Ultimate 3 meses',      'Suscripción',       'Microsoft Store',   'xbox02.gp@demo.test',     5,  749.00,  'MXN', '2026-02-03', 'facturada'),
      (3,  '2025-11-05', 'PlayStation Plus Premium 12 meses',    'Suscripción',       'PlayStation Store', 'psn01.gp@demo.test',      1,  2649.00, 'MXN', '2026-11-05', 'facturada'),
      (4,  '2025-11-06', 'Nintendo Switch Online + Expansión 12 meses', 'Suscripción','Nintendo eShop',    'nintendo01.gp@demo.test', 1,  749.00,  'MXN', '2026-11-06', 'no_facturable'),
      (5,  '2025-11-10', 'EA SPORTS FC 26 (digital)',            'Juego / contenido', 'PlayStation Store', 'ea01.gp@demo.test',       1,  1399.00, 'MXN', null,         'facturada'),
      (6,  '2025-12-01', 'Riot Points para premios',             'Juego / contenido', 'Riot Games',        'riot01.gp@demo.test',     2,  1500.00, 'MXN', null,         'facturada'),
      (7,  '2025-12-08', 'Diademas gamer (6 piezas)',            'Hardware',          'Amazon',            null,                      2,  5394.00, 'MXN', null,         'facturada'),
      (8,  '2026-01-15', 'Envío de equipo a Monterrey',          'Servicio',          'Paquetería',        null,                      4,  3850.00, 'MXN', null,         'facturada'),
      (9,  '2026-02-03', 'Xbox Game Pass Ultimate 3 meses',      'Suscripción',       'Microsoft Store',   'xbox01.gp@demo.test',     5,  749.00,  'MXN', '2026-05-03', 'facturada'),
      (10, '2026-02-10', 'Mario Kart World (digital)',           'Juego / contenido', 'Nintendo eShop',    'nintendo01.gp@demo.test', 5,  1599.00, 'MXN', null,         'no_facturable'),
      (11, '2026-02-12', 'Renta de pantallas LED escenario',     'Servicio',          'Rentas Audiovisuales MX', null,                5,  18500.00,'MXN', null,         'facturada'),
      (12, '2026-03-02', 'Meta Quest+ 12 meses',                 'Suscripción',       'Meta Store',        'meta01.gp@demo.test',     6,  1199.00, 'MXN', '2027-03-02', 'solicitada'),
      (13, '2026-03-20', 'Cables HDMI 2.1 (10 piezas)',          'Hardware',          'Mercado Libre',     null,                      7,  2490.00, 'MXN', null,         'facturada'),
      (14, '2026-04-10', 'Steam Wallet para torneo',             'Juego / contenido', 'Steam',             'steam01.gp@demo.test',    8,  50.00,   'USD', null,         'no_facturable'),
      (15, '2026-05-03', 'Xbox Game Pass Ultimate 3 meses',      'Suscripción',       'Microsoft Store',   'xbox01.gp@demo.test',     10, 749.00,  'MXN', '2026-08-03', 'facturada'),
      (16, '2026-05-15', 'Sillas gamer (4 piezas)',              'Hardware',          'Amazon',            null,                      10, 15960.00,'MXN', null,         'facturada'),
      (17, '2026-06-01', 'Valorant Points para premios',         'Juego / contenido', 'Riot Games',        'riot02.gp@demo.test',     11, 2000.00, 'MXN', null,         'solicitada'),
      (18, '2026-06-25', 'Internet dedicado para evento',        'Servicio',          'Aurora Telecom',    null,                      11, 7200.00, 'MXN', null,         'facturada'),
      (19, '2026-07-20', 'Envío de equipo a Mérida',             'Servicio',          'Paquetería',        null,                      13, 5420.00, 'MXN', null,         'facturada'),
      (20, '2026-08-03', 'Xbox Game Pass Ultimate 3 meses',      'Suscripción',       'Microsoft Store',   'xbox01.gp@demo.test',     14, 749.00,  'MXN', '2026-11-03', 'solicitada'),
      (21, '2026-08-20', 'Pase de batalla Fortnite (5 cuentas)', 'Juego / contenido', 'Epic Games Store',  'epic01.gp@demo.test',     15, 1250.00, 'MXN', null,         'no_facturable'),
      (22, '2026-09-10', 'Capturadora 4K',                       'Hardware',          'Amazon',            null,                      16, 4299.00, 'MXN', null,         'pendiente'),
      (23, '2026-09-28', 'Battle.net Balance para torneo',       'Juego / contenido', 'Battle.net',        'bnet01.gp@demo.test',     17, 800.00,  'MXN', null,         'pendiente'),
      (24, '2026-10-15', 'PlayStation Plus Extra 3 meses',       'Suscripción',       'PlayStation Store', 'psn02.gp@demo.test',      18, 659.00,  'MXN', '2027-01-15', 'pendiente'),
      (25, '2026-10-18', 'Tiras LED RGB (8 piezas)',             'Hardware',          'Mercado Libre',     null,                      18, 1912.00, 'MXN', null,         'pendiente')
    ) as c(n, fecha, concepto, categoria, proveedor, correo, ev, monto, moneda, vigencia, factura) order by n
  loop
    insert into public.compras (fecha, concepto, categoria, proveedor, cuenta_id, evento_id, monto, moneda,
                                metodo_pago, tarjeta_ultimos4, folio_pedido, vigencia_hasta, estado_factura,
                                folio_factura, notas, activo)
    values (r.fecha::date, r.concepto, r.categoria, r.proveedor,
            (select id from public.cuentas where correo = r.correo),
            v_evs[r.ev], r.monto, r.moneda,
            case when r.n % 4 = 0 then 'PayPal' when r.n % 7 = 0 then 'Transferencia' else 'Tarjeta empresa' end,
            case when r.n % 4 = 0 or r.n % 7 = 0 then null when r.n % 2 = 0 then '4821' else '7390' end,
            upper(substr(md5('pedido' || r.n), 1, 12)),
            r.vigencia::date, r.factura::public.estado_factura,
            case when r.factura = 'facturada' then upper(
              substr(md5('cfdi' || r.n), 1, 8) || '-' || substr(md5('cfdi' || r.n), 9, 4) || '-' ||
              substr(md5('cfdi' || r.n), 13, 4) || '-' || substr(md5('cfdi' || r.n), 17, 4) || '-' ||
              substr(md5('cfdi' || r.n), 21, 12)) end,
            case when r.n = 14 then 'Tipo de cambio aprox. 18.20' end,
            true);
  end loop;

  -- Una compra anulada (solo el admin puede).
  perform pg_temp.como(v_admin);
  insert into public.compras (fecha, concepto, categoria, proveedor, monto, metodo_pago, estado_factura, notas)
  values ('2026-09-12', 'Monitor 27" (cancelado)', 'Hardware', 'Mercado Libre', 5899.00, 'Tarjeta empresa',
          'no_facturable', 'Pedido cancelado por el proveedor');
  update public.compras set activo = false where concepto = 'Monitor 27" (cancelado)';

  -- ------------------------------------------- 13) Fechas realistas
  -- Todo lo anterior quedó con la hora de hoy. Se reparte en el tiempo.
  -- La bitácora no deja editar: se apaga su candado solo en esta transacción.
  execute 'alter table public.movimientos disable trigger movimientos_sin_update';
  execute 'alter table public.equipos disable trigger equipos_bitacora';

  -- Usuarios y catálogo: mediados de octubre 2025.
  update auth.users set created_at = timestamptz '2025-10-15 10:00-06', updated_at = timestamptz '2025-10-15 10:00-06'
   where email like '%@cepra.test';
  update public.usuarios set created_at = timestamptz '2025-10-15 10:00-06' where id in
    (select id from auth.users where email like '%@cepra.test');
  update public.catalogo_articulos set created_at = timestamptz '2025-10-16 11:00-06';
  update public.propietarios set created_at = timestamptz '2025-10-16 10:00-06' where nombre <> 'Gaming Partners';

  -- Altas y validaciones: semana del 20 de octubre 2025.
  with x as (select id, timestamptz '2025-10-20 10:00-06' + (row_number() over (order by etiqueta)) * interval '25 minutes' as t
               from public.equipos)
  update public.equipos e set created_at = x.t,
         etiquetas_validadas_at = case when e.etiquetas_validadas_at is not null then x.t + interval '2 days' end
    from x where x.id = e.id;
  update public.movimientos m set created_at = e.created_at
    from public.equipos e where m.equipo_id = e.id and m.tipo = 'alta';
  update public.movimientos m set created_at = e.etiquetas_validadas_at
    from public.equipos e where m.equipo_id = e.id and m.tipo = 'validacion';

  -- Existencias: inventario inicial y ajustes posteriores.
  update public.movimientos set created_at = timestamptz '2025-10-24 12:00-06' + id * interval '1 minute'
   where tipo = 'ajuste_stock' and nota = 'Inventario inicial';
  update public.movimientos set created_at = timestamptz '2026-09-21 13:00-06' + id * interval '1 minute'
   where tipo = 'ajuste_stock' and nota <> 'Inventario inicial';

  -- Eventos y zonas: se crean 3 semanas antes.
  update public.eventos set created_at = fecha_inicio - interval '21 days';
  update public.zonas z set created_at = e.fecha_inicio - interval '14 days' from public.eventos e where e.id = z.evento_id;
  update public.zona_staff s set created_at = e.fecha_inicio - interval '10 days' from public.eventos e where e.id = s.evento_id;

  -- Entregas: primer día del evento desde las 9:00; devoluciones al cierre.
  create temp table pg_temp.fechas_prestamo on commit drop as
    select p.id, p.folio,
           (e.fecha_inicio + time '09:00') at time zone 'America/Mexico_City'
             + (row_number() over (partition by p.evento_id order by p.folio)) * interval '20 minutes' as t,
           case when e.estado = 'activo'
                then (e.fecha_inicio + time '13:00') at time zone 'America/Mexico_City'
                else (e.fecha_fin + time '20:00') at time zone 'America/Mexico_City' end
             + (row_number() over (partition by p.evento_id order by p.folio)) * interval '10 minutes' as t_dev
      from public.prestamos p join public.eventos e on e.id = p.evento_id;

  update public.prestamos p set created_at = f.t from pg_temp.fechas_prestamo f where f.id = p.id;

  update public.movimientos m set created_at = f.t
    from pg_temp.fechas_prestamo f
   where m.tipo = 'entrega' and (m.datos ->> 'folio')::bigint = f.folio;

  update public.movimientos m set created_at = f.t_dev
    from pg_temp.fechas_prestamo f
   where m.tipo = 'devolucion' and m.nota ~ ('· folio ' || f.folio || '$')
     and m.nota not like 'Accesorio que faltaba%';
  update public.movimientos m set created_at = f.t_dev + interval '3 days'
    from pg_temp.fechas_prestamo f
   where m.tipo = 'devolucion' and m.nota = 'Accesorio que faltaba · folio ' || f.folio;

  update public.prestamo_items i set
         devuelto_at = case when i.devuelto_at is not null then f.t_dev end,
         control_devuelto_at = case when i.control_devuelto_at is not null then
                                 f.t_dev + case when i.id = any (v_tardes) then interval '3 days' else interval '0' end end,
         cables_devuelto_at = case when i.cables_devuelto_at is not null then
                                 f.t_dev + case when i.id = any (v_tardes) then interval '3 days' else interval '0' end end
    from pg_temp.fechas_prestamo f
   where f.id = i.prestamo_id;

  -- Reparación y edición de la pieza enviada a servicio.
  update public.movimientos set created_at = timestamptz '2026-10-07 11:30-06'
   where tipo in ('reparacion', 'edicion');

  -- Cuentas y compras.
  update public.cuentas set created_at = timestamptz '2025-10-28 10:00-06' + (random() * 30) * interval '1 day',
                            updated_at = timestamptz '2025-10-28 10:00-06' + (random() * 30) * interval '1 day';
  update public.compras set created_at = fecha + time '10:30', updated_at = fecha + time '10:30';

  execute 'alter table public.movimientos enable trigger movimientos_sin_update';
  execute 'alter table public.equipos enable trigger equipos_bitacora';

  perform pg_temp.como(null);
end
$seed$;

commit;

-- -----------------------------------------------------------------------------
-- Resumen de lo que quedó cargado.
-- -----------------------------------------------------------------------------
select 'usuarios demo'      as tabla, count(*) from auth.users where email like '%@cepra.test'
union all select 'propietarios',       count(*) from public.propietarios
union all select 'categorias',         count(*) from public.categorias
union all select 'plataformas',        count(*) from public.plataformas
union all select 'catalogo_articulos', count(*) from public.catalogo_articulos
union all select 'equipos',            count(*) from public.equipos
union all select 'stock_cantidad',     count(*) from public.stock_cantidad
union all select 'eventos',            count(*) from public.eventos
union all select 'zonas',              count(*) from public.zonas
union all select 'zona_staff',         count(*) from public.zona_staff
union all select 'prestamos',          count(*) from public.prestamos
union all select 'prestamo_items',     count(*) from public.prestamo_items
union all select 'cuentas',            count(*) from public.cuentas
union all select 'compras',            count(*) from public.compras
union all select 'movimientos',        count(*) from public.movimientos;
