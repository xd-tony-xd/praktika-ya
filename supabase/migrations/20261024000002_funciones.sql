-- =====================================================================
--  PRÁCTIKA YA · Funciones, triggers, vistas y RPC
-- =====================================================================

-- ---------------------------------------------------------------------
--  Helpers de identidad
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and rol = 'admin');
$$;

-- Empresa APROBADA del usuario actual (null si no existe, está pendiente o bloqueada)
create or replace function public.mi_empresa_id()
returns bigint
language sql stable security definer set search_path = public
as $$
  select id from public.empresas where user_id = auth.uid() and estado = 'aprobado' limit 1;
$$;

-- ¿Es una conexión de confianza? (service_role desde Edge Functions o SQL editor)
create or replace function public.es_conexion_confiable()
returns boolean
language sql stable
as $$
  select current_user in ('postgres', 'service_role', 'supabase_admin')
      or coalesce(auth.jwt() ->> 'role', '') = 'service_role';
$$;

-- ---------------------------------------------------------------------
--  Perfil automático al crear un usuario de auth
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.perfiles (id, rol, nombre)
  values (
    new.id,
    case when new.raw_app_meta_data ->> 'rol' = 'admin' then 'admin' else 'empresa' end,
    coalesce(new.raw_user_meta_data ->> 'nombre', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Convierte un usuario existente en administrador.
-- Uso (SQL Editor):  select public.hacer_admin('tu-correo@dominio.com');
create or replace function public.hacer_admin(p_email text)
returns text
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(p_email);
  if v_id is null then
    raise exception 'No existe un usuario con el correo %. Créalo primero en Authentication > Users.', p_email;
  end if;
  insert into public.perfiles (id, rol, nombre) values (v_id, 'admin', 'Administrador')
  on conflict (id) do update set rol = 'admin';
  return 'OK: ' || p_email || ' ahora es administrador';
end;
$$;
revoke all on function public.hacer_admin(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
--  Guardas de columnas (lo que una empresa NO puede modificar)
-- ---------------------------------------------------------------------
create or replace function public.empresas_guard()
returns trigger
language plpgsql
as $$
begin
  if public.es_conexion_confiable() or public.is_admin() then
    return new;
  end if;
  -- La empresa solo puede editar: correo_contacto, telefono, foto_perfil, sector, direccion
  -- y su política de transparencia.
  new.id               := old.id;
  new.user_id          := old.user_id;
  new.ruc              := old.ruc;
  new.nombre_comercial := old.nombre_comercial;
  new.ficha_ruc        := old.ficha_ruc;
  new.dni_frente       := old.dni_frente;
  new.dni_reverso      := old.dni_reverso;
  new.foto_selfie      := old.foto_selfie;
  new.ruc_verificado   := old.ruc_verificado;
  new.estado           := old.estado;
  new.creado_en        := old.creado_en;
  return new;
end;
$$;
create trigger empresas_guard before update on public.empresas
  for each row execute function public.empresas_guard();

create or replace function public.postulaciones_guard()
returns trigger
language plpgsql
as $$
begin
  if public.es_conexion_confiable() then
    return new;
  end if;
  -- Empresas y admin solo cambian el estado y la marca de notificación leída.
  -- El puntaje IA, el CV y los datos del postulante solo los escribe el servidor.
  new.id                      := old.id;
  new.vacante_id              := old.vacante_id;
  new.dni                     := old.dni;
  new.nombre_completo         := old.nombre_completo;
  new.correo_estudiante       := old.correo_estudiante;
  new.celular                 := old.celular;
  new.cv_path                 := old.cv_path;
  new.match_porcentaje        := old.match_porcentaje;
  new.ia_analisis_descripcion := old.ia_analisis_descripcion;
  new.ia_modelo               := old.ia_modelo;
  new.analizado_en            := old.analizado_en;
  new.notificado_en           := old.notificado_en;
  new.voz_transcripcion       := old.voz_transcripcion;
  new.voz_estudios            := old.voz_estudios;
  new.voz_experiencia         := old.voz_experiencia;
  new.voz_habilidades         := old.voz_habilidades;
  new.consentimiento_en       := old.consentimiento_en;
  new.fecha_postulacion       := old.fecha_postulacion;
  return new;
end;
$$;
create trigger postulaciones_guard before update on public.postulaciones
  for each row execute function public.postulaciones_guard();

create or replace function public.vacantes_touch()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en := now();
  if tg_op = 'UPDATE' then
    new.empresa_id := old.empresa_id;   -- una vacante no cambia de dueño
    new.creado_en  := old.creado_en;
  end if;
  return new;
end;
$$;
create trigger vacantes_touch before insert or update on public.vacantes
  for each row execute function public.vacantes_touch();

create or replace function public.touch_actualizado()
returns trigger language plpgsql as $$
begin new.actualizado_en := now(); return new; end;
$$;
create trigger paquetes_touch before update on public.paquetes_creditos
  for each row execute function public.touch_actualizado();
create trigger configuracion_touch before update on public.configuracion
  for each row execute function public.touch_actualizado();

-- Los sellos son un registro inmutable: no se editan. Solo se borran si se elimina
-- la empresa (cascada ejecutada por una conexión de confianza).
create or replace function public.sellos_inmutables()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and public.es_conexion_confiable() then
    return old;
  end if;
  raise exception 'El registro de sellos es inmutable';
end;
$$;
create trigger sellos_no_update before update or delete on public.sellos
  for each row execute function public.sellos_inmutables();

-- ---------------------------------------------------------------------
--  CRÉDITOS (solo service_role desde Edge Functions)
-- ---------------------------------------------------------------------
create or replace function public.reservar_credito(p_empresa_id bigint, p_postulacion_id bigint)
returns text
language plpgsql security definer set search_path = public
as $$
declare v_ref text;
begin
  update public.creditos_empresa
     set saldo = saldo - 1, actualizado_en = now()
   where empresa_id = p_empresa_id and saldo > 0;
  if not found then
    return null;  -- sin saldo
  end if;
  v_ref := 'ai:' || p_empresa_id || ':' || p_postulacion_id || ':' || encode(extensions.gen_random_bytes(8), 'hex');
  begin
    insert into public.movimientos_creditos (empresa_id, postulacion_id, tipo, creditos, estado, referencia, descripcion)
    values (p_empresa_id, p_postulacion_id, 'reserva', 1, 'pendiente', v_ref, 'Análisis de CV en proceso');
  exception when unique_violation then
    -- Ya hay un análisis en curso para esta postulación: se devuelve el crédito.
    update public.creditos_empresa set saldo = saldo + 1 where empresa_id = p_empresa_id;
    return 'EN_CURSO';
  end;
  return v_ref;
end;
$$;

create or replace function public.consumir_credito(p_ref text)
returns void
language sql security definer set search_path = public
as $$
  update public.movimientos_creditos
     set tipo = 'consumo', estado = 'completado', descripcion = 'Análisis de CV completado'
   where referencia = p_ref and estado = 'pendiente';
$$;

create or replace function public.reembolsar_credito(p_ref text)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_empresa bigint;
begin
  update public.movimientos_creditos
     set tipo = 'reembolso', estado = 'fallido', postulacion_id = null,
         descripcion = 'Análisis fallido: crédito devuelto'
   where referencia = p_ref and estado = 'pendiente'
  returning empresa_id into v_empresa;
  if v_empresa is not null then
    update public.creditos_empresa set saldo = saldo + 1, actualizado_en = now() where empresa_id = v_empresa;
  end if;
end;
$$;

create or replace function public.bonificar_creditos(p_empresa_id bigint, p_creditos integer, p_ref text, p_desc text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_creditos is null or p_creditos <= 0 then return; end if;
  insert into public.movimientos_creditos (empresa_id, tipo, creditos, estado, referencia, descripcion)
  values (p_empresa_id, 'bonificacion', p_creditos, 'completado', p_ref, p_desc);
  insert into public.creditos_empresa (empresa_id, saldo) values (p_empresa_id, p_creditos)
  on conflict (empresa_id) do update set saldo = creditos_empresa.saldo + excluded.saldo, actualizado_en = now();
exception when unique_violation then
  null; -- bonificación ya otorgada con esa referencia
end;
$$;

-- Marca un pago como pagado y acredita los créditos (idempotente).
create or replace function public.completar_pago(
  p_session_id text, p_empresa_id bigint, p_monto integer, p_moneda text, p_payment_intent text
)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_pago public.pagos_stripe;
begin
  select * into v_pago from public.pagos_stripe where session_id = p_session_id for update;
  if not found then return false; end if;
  if v_pago.estado = 'pagado' then return true; end if;
  if v_pago.empresa_id <> p_empresa_id
     or v_pago.monto_centimos <> p_monto
     or upper(v_pago.moneda) <> upper(coalesce(p_moneda, '')) then
    return false;
  end if;
  update public.pagos_stripe
     set estado = 'pagado', payment_intent_id = p_payment_intent, pagado_en = now()
   where id = v_pago.id;
  insert into public.creditos_empresa (empresa_id, saldo) values (v_pago.empresa_id, v_pago.creditos)
  on conflict (empresa_id) do update set saldo = creditos_empresa.saldo + excluded.saldo, actualizado_en = now();
  insert into public.movimientos_creditos (empresa_id, tipo, creditos, estado, referencia, descripcion)
  values (v_pago.empresa_id, 'compra', v_pago.creditos, 'completado', 'stripe:' || p_session_id,
          'Paquete ' || v_pago.paquete_nombre || ' comprado con Stripe')
  on conflict (referencia) do nothing;
  return true;
end;
$$;

revoke all on function public.reservar_credito(bigint, bigint) from public, anon, authenticated;
revoke all on function public.consumir_credito(text) from public, anon, authenticated;
revoke all on function public.reembolsar_credito(text) from public, anon, authenticated;
revoke all on function public.bonificar_creditos(bigint, integer, text, text) from public, anon, authenticated;
revoke all on function public.completar_pago(text, bigint, integer, text, text) from public, anon, authenticated;
grant execute on function public.reservar_credito(bigint, bigint) to service_role;
grant execute on function public.consumir_credito(text) to service_role;
grant execute on function public.reembolsar_credito(text) to service_role;
grant execute on function public.bonificar_creditos(bigint, integer, text, text) to service_role;
grant execute on function public.completar_pago(text, bigint, integer, text, text) to service_role;

-- ---------------------------------------------------------------------
--  SELLO: estado vigente (otorgado en los últimos 90 días)
-- ---------------------------------------------------------------------
create or replace function public.sello_vigente(p_empresa_id bigint)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((
    select s.sello_otorgado and s.emitido_en > now() - interval '90 days'
      from public.sellos s
     where s.empresa_id = p_empresa_id
     order by s.emitido_en desc, s.id desc
     limit 1
  ), false);
$$;

-- Consulta pública del sello de una empresa (equivale a GET /sello/{company_id})
create or replace function public.consultar_sello(p_empresa_id bigint)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select case when e.id is null then null else jsonb_build_object(
    'company_id',           e.id,
    'empresa',              e.nombre_comercial,
    'ruc',                  e.ruc,
    'foto_perfil',          e.foto_perfil,
    'sello_vigente',        public.sello_vigente(e.id),
    'criterios_cumplidos',  coalesce(to_jsonb(s.criterios_cumplidos), '[]'::jsonb),
    'criterios_pendientes', coalesce(to_jsonb(s.criterios_pendientes), '[]'::jsonb),
    'detalle',              coalesce(s.detalle, '{}'::jsonb),
    'emitido_en',           s.emitido_en,
    'huella',               s.huella,
    'huella_anterior',      s.huella_anterior,
    'historial', coalesce((
        select jsonb_agg(jsonb_build_object('emitido_en', h.emitido_en, 'sello_otorgado', h.sello_otorgado, 'huella', h.huella) order by h.emitido_en desc)
          from (select * from public.sellos where empresa_id = e.id order by emitido_en desc limit 10) h
    ), '[]'::jsonb)
  ) end
  from public.empresas e
  left join lateral (
    select * from public.sellos where empresa_id = e.id order by emitido_en desc, id desc limit 1
  ) s on true
  where e.id = p_empresa_id and e.estado = 'aprobado';
$$;
grant execute on function public.consultar_sello(bigint) to anon, authenticated;

-- ---------------------------------------------------------------------
--  Consulta pública del resultado de una postulación (por DNI)
-- ---------------------------------------------------------------------
create or replace function public.consultar_resultado(p_dni text, p_vacante_id bigint)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'nombre',   p.nombre_completo,
    'match',    p.match_porcentaje,
    'estado',   p.estado_postulacion,
    'analisis', p.ia_analisis_descripcion
  )
  from public.postulaciones p
  where p.dni = p_dni and p.vacante_id = p_vacante_id
  order by p.fecha_postulacion desc
  limit 1;
$$;
grant execute on function public.consultar_resultado(text, bigint) to anon, authenticated;

-- ---------------------------------------------------------------------
--  VISTA PÚBLICA DE VACANTES (solo empresas aprobadas, sin datos sensibles)
-- ---------------------------------------------------------------------
create or replace view public.vacantes_publicas
with (security_barrier = true)
as
select
  v.id,
  v.empresa_id,
  v.titulo_puesto,
  v.descripcion_puesto,
  v.requisitos_raw,
  v.modalidad,
  v.ubicacion,
  v.estado,
  v.fecha_limite,
  v.fecha_publicacion,
  (v.estado = 'abierta' and (v.fecha_limite is null or v.fecha_limite >= current_date)) as vigente,
  e.nombre_comercial,
  e.sector,
  e.direccion,
  e.foto_perfil,
  coalesce((
    select jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.nombre) order by c.nombre)
      from public.vacante_carreras vc join public.carreras c on c.id = vc.carrera_id
     where vc.vacante_id = v.id
  ), '[]'::jsonb) as carreras,
  coalesce((select array_agg(vc.carrera_id) from public.vacante_carreras vc where vc.vacante_id = v.id), '{}'::bigint[]) as carrera_ids,
  public.sello_vigente(e.id) as sello_vigente
from public.vacantes v
join public.empresas e on e.id = v.empresa_id
where e.estado = 'aprobado';

grant select on public.vacantes_publicas to anon, authenticated;

-- ---------------------------------------------------------------------
--  Estadísticas para paneles
-- ---------------------------------------------------------------------
create or replace function public.estadisticas_panel()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare v_emp bigint;
begin
  if public.is_admin() then
    return jsonb_build_object(
      'total_empresas',        (select count(*) from public.empresas),
      'empresas_pendientes',   (select count(*) from public.empresas where estado = 'pendiente'),
      'vacantes_activas',      (select count(*) from public.vacantes where estado = 'abierta' and (fecha_limite is null or fecha_limite >= current_date)),
      'total_vacantes',        (select count(*) from public.vacantes),
      'total_postulaciones',   (select count(*) from public.postulaciones),
      'analizadas',            (select count(*) from public.postulaciones where estado_postulacion <> 'en_espera'),
      'ingresos_centimos',     (select coalesce(sum(monto_centimos), 0) from public.pagos_stripe where estado = 'pagado')
    );
  end if;
  v_emp := public.mi_empresa_id();
  if v_emp is null then return '{}'::jsonb; end if;
  return jsonb_build_object(
    'total_vacantes',      (select count(*) from public.vacantes where empresa_id = v_emp),
    'vacantes_activas',    (select count(*) from public.vacantes where empresa_id = v_emp and estado = 'abierta' and (fecha_limite is null or fecha_limite >= current_date)),
    'total_postulaciones', (select count(*) from public.postulaciones p join public.vacantes v on v.id = p.vacante_id where v.empresa_id = v_emp),
    'pendientes',          (select count(*) from public.postulaciones p join public.vacantes v on v.id = p.vacante_id where v.empresa_id = v_emp and p.estado_postulacion = 'en_espera'),
    'aptos',               (select count(*) from public.postulaciones p join public.vacantes v on v.id = p.vacante_id where v.empresa_id = v_emp and p.estado_postulacion = 'Apto'),
    'saldo',               (select coalesce(saldo, 0) from public.creditos_empresa where empresa_id = v_emp),
    'sello_vigente',       public.sello_vigente(v_emp)
  );
end;
$$;
grant execute on function public.estadisticas_panel() to authenticated;

-- Conteo de vacantes por carrera (reporte admin)
create or replace function public.reporte_carreras()
returns table (id bigint, nombre text, total_vacantes bigint)
language sql stable security definer set search_path = public
as $$
  select c.id, c.nombre, count(vc.vacante_id)
    from public.carreras c left join public.vacante_carreras vc on vc.carrera_id = c.id
   group by c.id, c.nombre
   order by c.nombre;
$$;
grant execute on function public.reporte_carreras() to anon, authenticated;
