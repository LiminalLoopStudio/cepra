-- =============================================================================
-- CEPRA — Carga para PRUEBAS COMPLETAS (se corre UNA vez, a mano)
--
-- Se pega completo en Supabase → SQL Editor → Run. NO es una migración.
--
-- BORRA TODO lo operativo y los usuarios de prueba (@cepra.test).
-- Los usuarios que agregaste tú se conservan tal cual; además:
--   * tu cuenta queda como Administrador y
--   * Javier queda como Stage Manager.
--
-- CARGA (sin eventos, zonas, secciones ni documentos maestros):
--   * 114 usuarios de prueba @cepra.test: 2 almacenistas, 1 Project Manager,
--     1 Coordinación, 10 líderes y 100 staff (con contraseña y PIN puestos).
--   * 20 categorías, 60 tipos de artículo con consumo eléctrico,
--     ~260 piezas etiquetadas (casi todas validadas) y existencias por cantidad.
--   * 50 cuentas por cada una de las 9 plataformas (450), varias ligadas a
--     consolas, PCs, visores y tablets.
--
-- Para dejar la base limpia después: limpiar-datos-de-prueba.sql (borra los
-- usuarios @cepra.test y conserva los demás).
--
-- Todo ocurre en una sola transacción: si algo falla, no se guarda nada.
-- =============================================================================

begin;

create function pg_temp.como(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true),
         set_config('request.jwt.claims',
                    case when p_uid is null then '' else
                    json_build_object('sub', p_uid, 'role', 'authenticated')::text end, true);
$$;

do $carga$
declare
  -- ===========================  AJUSTA  ======================================
  c_admin_email  constant text := 'CORREO-ADMIN';          -- tu cuenta (se queda como Administrador)
  c_javier_email constant text := 'CORREO-JAVIER';         -- se queda como Stage Manager
  c_pass         constant text := 'CAMBIA-ESTA-CONTRASENA'; -- de los usuarios de prueba (mín. 8)
  c_pin          constant text := '2580';                   -- PIN de firma de los usuarios de prueba
  -- ===========================================================================
  v_admin   uuid;
  v_javier  uuid;
  v_id      uuid;
  a_alm     uuid[] := '{}';
  r         record;
  v_res     jsonb;
  v_n       integer;
  v_k       integer;
  v_nombres text[] := array['Alejandro','Valeria','Diego','Camila','Santiago','Ximena','Mateo','Regina','Leonardo','Renata',
                            'Emiliano','Sofía','Sebastián','Daniela','Iker','Fernanda','Andrés','Mariana','Gael','Paola'];
  v_apellidos text[] := array['Hernández','García','Martínez','López','González','Pérez','Rodríguez','Sánchez','Ramírez','Cruz',
                              'Flores','Gómez','Morales','Vázquez','Reyes','Jiménez','Torres','Díaz','Ruiz','Mendoza'];
begin
  -- -------------------------------------------------------------- Revisiones
  if c_pass = 'CAMBIA-ESTA-CONTRASENA' or length(c_pass) < 8 then
    raise exception 'Primero cambia c_pass (mínimo 8 caracteres)';
  end if;
  select id into v_admin from auth.users where lower(email) = lower(trim(c_admin_email));
  if v_admin is null then
    raise exception 'No existe un usuario con el correo de administrador "%"', c_admin_email;
  end if;
  select id into v_javier from auth.users where lower(email) = lower(trim(c_javier_email));
  if v_javier is null then
    raise exception 'No existe un usuario con el correo de Javier "%"', c_javier_email;
  end if;
  if v_admin = v_javier then
    raise exception 'El correo de administrador y el de Javier son el mismo';
  end if;

  -- ------------------------------------------------------- 1) Borrar todo
  execute 'alter table public.movimientos disable trigger movimientos_sin_update';
  execute 'alter table public.movimientos disable trigger movimientos_sin_truncate';
  truncate table
    public.maestro_items, public.maestro,
    public.solicitud_reservas, public.solicitud_items, public.solicitudes,
    public.movimientos, public.prestamo_items, public.prestamos,
    public.compra_archivos, public.compras, public.cuentas,
    public.equipos, public.stock_cantidad, public.catalogo_articulos,
    public.zona_staff, public.secciones, public.zonas, public.eventos
  restart identity;
  execute 'alter table public.movimientos enable trigger movimientos_sin_update';
  execute 'alter table public.movimientos enable trigger movimientos_sin_truncate';

  delete from public.propietarios where nombre <> 'Gaming Partners';
  insert into public.propietarios (nombre, tipo) values ('Gaming Partners', 'propio') on conflict (nombre) do nothing;
  delete from public.categorias
   where nombre not in ('Consola', 'Pantalla', 'PC', 'Laptop', 'Control', 'Periférico',
                        'Cable', 'Adaptador', 'Extensión', 'Corriente', 'Consumible');
  insert into public.categorias (nombre, prefijo) values
    ('Consola','CN'),('Pantalla','PT'),('PC','PC'),('Laptop','LP'),('Control','CT'),('Periférico','PF'),
    ('Cable','CB'),('Adaptador','AD'),('Extensión','EX'),('Corriente','CR'),('Consumible','CS')
  on conflict do nothing;
  update public.categorias set siguiente_numero = 1, activo = true;
  delete from public.plataformas
   where nombre not in ('Steam', 'Epic Games', 'PlayStation', 'Nintendo', 'Oculus VR', 'Xbox', 'Riot', 'Móvil', 'Otros');
  insert into public.plataformas (nombre, orden) values
    ('Steam',10),('Epic Games',20),('PlayStation',30),('Nintendo',40),('Oculus VR',50),('Xbox',60),('Riot',70),('Móvil',80),('Otros',999)
  on conflict do nothing;
  update public.plataformas set activo = true;

  -- Solo se borran los usuarios de prueba; los que agregaste tú se quedan.
  delete from auth.users where lower(email) like '%@cepra.test' and id not in (v_admin, v_javier);

  -- Roles de los dos que se quedan.
  update public.usuarios set rol = 'administrador', activo = true where id = v_admin;
  update public.usuarios set rol = 'stage_manager', activo = true where id = v_javier;
  update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}') || '{"rol":"administrador"}' where id = v_admin;
  update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}') || '{"rol":"stage_manager"}' where id = v_javier;

  -- ------------------------------------------------------ 2) Usuarios
  -- 2 almacenistas, 1 PM, 1 coordinación, 10 líderes, 100 staff.
  for r in
    with roles as (
      select n, case when n <= 2 then 'almacenista'
                     when n = 3 then 'project_manager'
                     when n = 4 then 'coordinacion'
                     when n <= 14 then 'lider'
                     else 'staff' end as rol
        from generate_series(1, 114) n)
    select n, rol,
           v_nombres[1 + (n - 1) % 20] || ' ' || v_apellidos[1 + ((n - 1) / 20 + (n - 1)) % 20] as nombre,
           case rol when 'almacenista' then 'almacen' when 'project_manager' then 'pm'
                    when 'coordinacion' then 'coordinacion' when 'lider' then 'lider' else 'staff' end
             || lpad(case when rol = 'lider' then n - 4 when rol = 'staff' then n - 14 when rol = 'almacenista' then n else 1 end::text, 3, '0') as usuario
      from roles order by n
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
    if r.rol = 'almacenista' then a_alm := a_alm || v_id; end if;
  end loop;

  -- ------------------------------------------------------ 3) Propietarios
  insert into public.propietarios (nombre, tipo, contacto) values
    ('Nébula Gaming', 'patrocinador', 'patrocinios@nebula.demo'),
    ('Zenit Periféricos', 'patrocinador', 'ventas@zenit.demo'),
    ('Orbital Pantallas', 'patrocinador', 'ventas@orbital.demo'),
    ('VR Experiences', 'prestamista', 'renta@vrexp.demo'),
    ('ProSonido Eventos', 'prestamista', 'bodega@prosonido.demo');

  -- ------------------------------------------------------ 4) Categorías
  insert into public.categorias (nombre, prefijo) values
    ('Realidad virtual','RV'),('Audio','AU'),('Streaming','ST'),('Red','RD'),('Tablet','TB'),
    ('Mobiliario','MB'),('Iluminación','IL'),('Señalización','SE'),('Herramienta','HR')
  on conflict (nombre) do nothing;

  -- ------------------------------------------------------ 5) Catálogo
  perform pg_temp.como(v_admin);
  for r in
    select v.*, c.id as cat_id from (values
      -- orden, categoría, nombre, por pieza, control, cables, mínimo, watts, puertos
      (1,'Consola','PlayStation 5',true,true,true,0,200,'{HDMI,USB-C,Ethernet}'),
      (2,'Consola','PlayStation 5 Pro',true,true,true,0,230,'{HDMI,USB-C,Ethernet}'),
      (3,'Consola','PlayStation 5 Digital',true,true,true,0,200,'{HDMI,USB-C,Ethernet}'),
      (4,'Consola','Xbox Series X',true,true,true,0,200,'{HDMI,USB,Ethernet}'),
      (5,'Consola','Xbox Series S',true,true,true,0,90,'{HDMI,USB,Ethernet}'),
      (6,'Consola','Nintendo Switch 2',true,true,true,0,40,'{USB-C,HDMI (dock)}'),
      (7,'Consola','Nintendo Switch OLED',true,true,true,0,18,'{USB-C,HDMI (dock)}'),
      (8,'Consola','Steam Deck OLED',true,false,true,0,45,'{USB-C}'),
      (9,'Pantalla','Pantalla 65" 4K',true,false,true,0,180,'{HDMI x4,USB}'),
      (10,'Pantalla','Pantalla 55" 4K',true,false,true,0,130,'{HDMI x3,USB}'),
      (11,'Pantalla','Pantalla 43" Full HD',true,false,true,0,70,'{HDMI x2,USB}'),
      (12,'Pantalla','Pantalla 32" HD',true,false,true,0,45,'{HDMI x2}'),
      (13,'Pantalla','Monitor gamer 27" 165 Hz',true,false,true,0,45,'{HDMI,DisplayPort}'),
      (14,'Pantalla','Monitor 24" 144 Hz',true,false,true,0,30,'{HDMI,DisplayPort}'),
      (15,'PC','PC gamer RTX 4080',true,false,true,0,650,'{HDMI,DisplayPort,USB,Ethernet}'),
      (16,'PC','PC gamer RTX 4070',true,false,true,0,550,'{HDMI,DisplayPort,USB,Ethernet}'),
      (17,'PC','PC gamer RTX 4060',true,false,true,0,400,'{HDMI,DisplayPort,USB,Ethernet}'),
      (18,'Laptop','Laptop gamer 15"',true,false,true,0,230,'{HDMI,USB-C,USB}'),
      (19,'Laptop','Laptop de registro',true,false,true,0,45,'{USB-C,USB}'),
      (20,'Realidad virtual','Meta Quest 3',true,true,true,0,20,'{USB-C}'),
      (21,'Realidad virtual','Meta Quest 3S',true,true,true,0,20,'{USB-C}'),
      (22,'Realidad virtual','PlayStation VR2',true,true,true,0,10,'{USB-C}'),
      (23,'Audio','Bocina activa 15"',true,false,true,0,650,'{XLR,Plug 1/4}'),
      (24,'Audio','Mezcladora 8 canales',true,false,true,0,25,'{XLR,USB}'),
      (25,'Audio','Micrófono inalámbrico',true,false,false,0,5,'{}'),
      (26,'Streaming','Capturadora 4K',true,false,true,0,5,'{HDMI in,HDMI out,USB-C}'),
      (27,'Streaming','Cámara para streaming',true,false,true,0,3,'{USB-C}'),
      (28,'Red','Router WiFi 6',true,false,true,0,15,'{Ethernet x4,WAN}'),
      (29,'Red','Switch 24 puertos',true,false,true,0,20,'{Ethernet x24}'),
      (30,'Tablet','Tablet de registro',true,false,true,0,10,'{USB-C}'),
      (31,'Control','Control DualSense',false,false,false,10,0,'{}'),
      (32,'Control','Control DualSense Edge',false,false,false,4,0,'{}'),
      (33,'Control','Control Xbox',false,false,false,10,0,'{}'),
      (34,'Control','Control Xbox Elite',false,false,false,4,0,'{}'),
      (35,'Control','Joy-Con 2 (par)',false,false,false,6,0,'{}'),
      (36,'Control','Control Pro Switch',false,false,false,6,0,'{}'),
      (37,'Control','Arcade stick',false,false,false,2,0,'{}'),
      (38,'Periférico','Teclado mecánico',false,false,false,8,0,'{}'),
      (39,'Periférico','Mouse gamer',false,false,false,8,0,'{}'),
      (40,'Periférico','Diadema gamer',false,false,false,10,0,'{}'),
      (41,'Periférico','Mousepad XL',false,false,false,6,0,'{}'),
      (42,'Cable','Cable HDMI 2.1 de 2 m',false,false,false,15,0,'{}'),
      (43,'Cable','Cable HDMI de 5 m',false,false,false,8,0,'{}'),
      (44,'Cable','Cable HDMI de 10 m',false,false,false,4,0,'{}'),
      (45,'Cable','Cable USB-C de 2 m',false,false,false,15,0,'{}'),
      (46,'Cable','Cable de red Cat 6 de 3 m',false,false,false,15,0,'{}'),
      (47,'Cable','Cable de red Cat 6 de 15 m',false,false,false,6,0,'{}'),
      (48,'Cable','Cable de corriente C13',false,false,false,15,0,'{}'),
      (49,'Adaptador','Adaptador USB-C a HDMI',false,false,false,5,0,'{}'),
      (50,'Adaptador','Adaptador DisplayPort a HDMI',false,false,false,5,0,'{}'),
      (51,'Extensión','Extensión uso rudo 5 m',false,false,false,10,0,'{}'),
      (52,'Extensión','Multicontacto 6 tomas',false,false,false,10,0,'{}'),
      (53,'Corriente','Regulador 1000 VA',false,false,false,5,10,'{}'),
      (54,'Corriente','No-break 1500 VA',false,false,false,3,25,'{}'),
      (55,'Consumible','Cinta gaffer (rollo)',false,false,false,8,0,'{}'),
      (56,'Consumible','Cinchos (bolsa de 100)',false,false,false,6,0,'{}'),
      (57,'Consumible','Pilas AA (paquete de 4)',false,false,false,12,0,'{}'),
      (58,'Mobiliario','Silla gamer',false,false,false,6,0,'{}'),
      (59,'Iluminación','Tira LED RGB 5 m',false,false,false,6,24,'{}'),
      (60,'Señalización','Banner roll-up',false,false,false,2,0,'{}')
    ) as v(n, cat, nombre, serial, ctrl, cbl, minimo, w, puertos)
    join public.categorias c on c.nombre = v.cat
    order by v.n
  loop
    insert into public.catalogo_articulos
      (nombre, categoria, categoria_id, serializado, lleva_control, lleva_cables, stock_minimo, consumo_w, puertos_default)
    values (r.nombre, r.cat, r.cat_id, r.serial, r.ctrl, r.cbl, r.minimo, nullif(r.w, 0), r.puertos::text[]);
  end loop;
  select count(*) into v_n from public.catalogo_articulos;
  if v_n <> 60 then
    raise exception 'Se esperaban 60 tipos y se crearon %: revisa que el script se copió con acentos (Encoding UTF8)', v_n;
  end if;

  -- ------------------------------------------------------ 6) Piezas (261)
  for r in
    select v.*, a.id as art_id, a.puertos_default from (values
      ('PlayStation 5',             18, 'Sony',        'CFI-2015'),
      ('PlayStation 5 Pro',          6, 'Sony',        'CFI-7020'),
      ('PlayStation 5 Digital',      8, 'Sony',        'CFI-2015B'),
      ('Xbox Series X',             14, 'Microsoft',   '1882'),
      ('Xbox Series S',              8, 'Microsoft',   '1883'),
      ('Nintendo Switch 2',         12, 'Nintendo',    'BEE-001'),
      ('Nintendo Switch OLED',       8, 'Nintendo',    'HEG-001'),
      ('Steam Deck OLED',            4, 'Valve',       '1 TB'),
      ('Pantalla 65" 4K',           10, 'Samsung',     'QN65Q60D'),
      ('Pantalla 55" 4K',           14, 'Samsung',     'UN55DU7000'),
      ('Pantalla 43" Full HD',      10, 'LG',          '43LR6500'),
      ('Pantalla 32" HD',            6, 'TCL',         '32S5400'),
      ('Monitor gamer 27" 165 Hz',  16, 'ASUS',        'VG27AQ'),
      ('Monitor 24" 144 Hz',        14, 'AOC',         '24G2'),
      ('PC gamer RTX 4080',          6, 'Ensamble GP', 'R9-4080'),
      ('PC gamer RTX 4070',         12, 'Ensamble GP', 'R7-4070'),
      ('PC gamer RTX 4060',         12, 'Ensamble GP', 'R5-4060'),
      ('Laptop gamer 15"',           6, 'Lenovo',      'Legion 5'),
      ('Laptop de registro',         6, 'HP',          '240 G9'),
      ('Meta Quest 3',              10, 'Meta',        '512 GB'),
      ('Meta Quest 3S',              8, 'Meta',        '128 GB'),
      ('PlayStation VR2',            4, 'Sony',        'CFI-ZVR1'),
      ('Bocina activa 15"',          8, 'JBL',         'EON715'),
      ('Mezcladora 8 canales',       3, 'Yamaha',      'MG10XU'),
      ('Micrófono inalámbrico',      8, 'Shure',       'BLX24/SM58'),
      ('Capturadora 4K',             6, 'Elgato',      '4K X'),
      ('Cámara para streaming',      4, 'Logitech',    'C922'),
      ('Router WiFi 6',              5, 'TP-Link',     'AX3000'),
      ('Switch 24 puertos',          3, 'TP-Link',     'TL-SG1024'),
      ('Tablet de registro',        12, 'Samsung',     'Galaxy Tab A9+')
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
        case when v_k <= 2 then 'nuevo'::public.estado_fisico
             when v_k % 7 = 0 then 'regular' else 'bueno' end,
        case when r.nombre = 'Meta Quest 3S' then 'prestamo'::public.tipo_propiedad
             when r.nombre = 'Bocina activa 15"' and v_k > 4 then 'prestamo'
             when r.nombre = 'PlayStation 5' and v_k > r.cuantas - 3 then 'patrocinado'
             when r.nombre = 'Monitor gamer 27" 165 Hz' and v_k > r.cuantas - 4 then 'patrocinado'
             when r.nombre = 'Pantalla 55" 4K' and v_k > r.cuantas - 4 then 'patrocinado'
             else 'propio' end,
        case when r.nombre = 'Meta Quest 3S' then (select id from public.propietarios where nombre = 'VR Experiences')
             when r.nombre = 'Bocina activa 15"' and v_k > 4 then (select id from public.propietarios where nombre = 'ProSonido Eventos')
             when r.nombre = 'PlayStation 5' and v_k > r.cuantas - 3 then (select id from public.propietarios where nombre = 'Nébula Gaming')
             when r.nombre = 'Monitor gamer 27" 165 Hz' and v_k > r.cuantas - 4 then (select id from public.propietarios where nombre = 'Zenit Periféricos')
             when r.nombre = 'Pantalla 55" 4K' and v_k > r.cuantas - 4 then (select id from public.propietarios where nombre = 'Orbital Pantallas')
        end,
        case when r.nombre = 'Meta Quest 3S' then date '2026-12-15'
             when r.nombre = 'Bocina activa 15"' and v_k > 4 then date '2026-11-30' end,
        case when v_k % 7 = 0 then 'Rayones leves en la carcasa' end
      );
    end loop;
  end loop;
  select count(*) into v_n from public.equipos;
  if v_n < 200 then
    raise exception 'Se esperaban al menos 200 piezas y hay %', v_n;
  end if;

  -- ---------------------------------------------- 7) Validación (almacén)
  -- Se dejan 6 piezas sin validar (3 tablets y 3 capturadoras).
  perform pg_temp.como(a_alm[1]);
  for r in
    select e.etiqueta, e.etiqueta_caja
      from public.equipos e
     where e.id not in (
       (select e2.id from public.equipos e2 join public.catalogo_articulos a on a.id = e2.articulo_id
         where a.nombre = 'Tablet de registro' order by e2.etiqueta desc limit 3)
       union all
       (select e2.id from public.equipos e2 join public.catalogo_articulos a on a.id = e2.articulo_id
         where a.nombre = 'Capturadora 4K' order by e2.etiqueta desc limit 3))
     order by e.etiqueta
  loop
    v_res := public.validar_etiquetas(r.etiqueta, r.etiqueta_caja);
    if v_res ->> 'nivel' <> 'ok' then
      raise exception 'Validación falló en %: %', r.etiqueta, v_res ->> 'mensaje';
    end if;
  end loop;

  -- ------------------------------------------- 8) Existencias (admin)
  perform pg_temp.como(v_admin);
  for r in
    select a.id, a.nombre, a.stock_minimo, row_number() over (order by a.nombre) as n
      from public.catalogo_articulos a where not a.serializado
  loop
    perform public.ajustar_stock(r.id,
      case r.nombre
        when 'Arcade stick'       then 1   -- debajo del mínimo, para ver la alerta
        when 'Cable HDMI de 10 m' then 3   -- debajo del mínimo
        else r.stock_minimo * 4 + (r.n % 7)::int
      end,
      'compra', 'Inventario inicial');
  end loop;

  -- ---------------------------------------- 9) Cuentas (50 por plataforma)
  for r in
    select p.id as plat_id, p.nombre as plat, k,
           case p.nombre when 'Epic Games' then 'epic' when 'PlayStation' then 'psn' when 'Oculus VR' then 'meta'
                         when 'Móvil' then 'movil' else lower(p.nombre) end as slug,
           case p.nombre
             when 'Steam'       then array['PC gamer RTX 4080','PC gamer RTX 4070','PC gamer RTX 4060','Laptop gamer 15"','Steam Deck OLED']
             when 'Epic Games'  then array['PC gamer RTX 4080','PC gamer RTX 4070','PC gamer RTX 4060','Laptop gamer 15"']
             when 'Riot'        then array['PC gamer RTX 4080','PC gamer RTX 4070','PC gamer RTX 4060','Laptop gamer 15"']
             when 'PlayStation' then array['PlayStation 5','PlayStation 5 Pro','PlayStation 5 Digital']
             when 'Xbox'        then array['Xbox Series X','Xbox Series S']
             when 'Nintendo'    then array['Nintendo Switch 2','Nintendo Switch OLED']
             when 'Oculus VR'   then array['Meta Quest 3','Meta Quest 3S']
             when 'Móvil'       then array['Tablet de registro']
           end as tipos
      from public.plataformas p
      cross join generate_series(1, 50) k
     order by p.orden, k
  loop
    insert into public.cuentas (plataforma_id, correo, usuario, equipo_id, notas)
    values (
      r.plat_id,
      r.slug || lpad(r.k::text, 2, '0') || '.gp@pruebas.test',
      'GP_' || replace(initcap(r.slug), ' ', '') || '_' || lpad(r.k::text, 2, '0'),
      -- 4 de cada 5 quedan ligadas a una pieza; la quinta queda libre.
      case when r.tipos is not null and r.k % 5 <> 0 then
        (select e.id from public.equipos e join public.catalogo_articulos a on a.id = e.articulo_id
          where a.nombre = any (r.tipos)
          order by e.etiqueta
          offset ((r.k - 1) % (select count(*) from public.equipos e3 join public.catalogo_articulos a3 on a3.id = e3.articulo_id
                                  where a3.nombre = any (r.tipos)))
          limit 1)
      end,
      case when r.k % 10 = 1 then 'Cuenta principal para torneos'
           when r.k % 10 = 6 then 'Suscripción activa' end);
  end loop;
  select count(*) into v_n from public.cuentas;
  if v_n < 450 then
    raise exception 'Se esperaban 450 cuentas y hay %', v_n;
  end if;

  perform pg_temp.como(null);
end $carga$;

commit;

-- Resumen de lo cargado
select 'Usuarios' as que, count(*)::text as cuantos from public.usuarios
union all select 'Usuarios por rol: ' || string_agg(rol || ' ' || n, ', ' order by rol), '' from (select rol::text, count(*) n from public.usuarios group by rol) x
union all select 'Tipos de artículo', count(*)::text from public.catalogo_articulos
union all select 'Piezas etiquetadas', count(*)::text from public.equipos
union all select 'Piezas sin validar', count(*)::text from public.equipos where estado_operativo = 'por_validar'
union all select 'Unidades por cantidad', coalesce(sum(total), 0)::text from public.stock_cantidad
union all select 'Cuentas', count(*)::text from public.cuentas
union all select 'Eventos / zonas', (select count(*) from public.eventos) || ' / ' || (select count(*) from public.zonas);
