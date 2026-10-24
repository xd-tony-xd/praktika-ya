-- =====================================================================
--  PRÁCTIKA YA · Row Level Security + Storage + Realtime
-- =====================================================================

alter table public.perfiles             enable row level security;
alter table public.empresas             enable row level security;
alter table public.carreras             enable row level security;
alter table public.vacantes             enable row level security;
alter table public.vacante_carreras     enable row level security;
alter table public.postulaciones        enable row level security;
alter table public.configuracion        enable row level security;
alter table public.creditos_empresa     enable row level security;
alter table public.paquetes_creditos    enable row level security;
alter table public.movimientos_creditos enable row level security;
alter table public.pagos_stripe         enable row level security;
alter table public.sellos               enable row level security;
alter table public.uso_publico          enable row level security;

-- PERFILES ------------------------------------------------------------
create policy perfiles_select on public.perfiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy perfiles_update_admin on public.perfiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- EMPRESAS ------------------------------------------------------------
-- (el alta se hace desde la Edge Function registrar-empresa con service_role)
create policy empresas_select on public.empresas for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy empresas_update on public.empresas for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- CARRERAS ------------------------------------------------------------
create policy carreras_select on public.carreras for select to anon, authenticated using (true);
create policy carreras_admin_insert on public.carreras for insert to authenticated with check (public.is_admin());
create policy carreras_admin_update on public.carreras for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy carreras_admin_delete on public.carreras for delete to authenticated using (public.is_admin());

-- VACANTES ------------------------------------------------------------
-- El público lee la vista vacantes_publicas; aquí solo dueños y admin.
create policy vacantes_select on public.vacantes for select to authenticated
  using (empresa_id = public.mi_empresa_id() or public.is_admin());
create policy vacantes_insert on public.vacantes for insert to authenticated
  with check (empresa_id = public.mi_empresa_id());
create policy vacantes_update on public.vacantes for update to authenticated
  using (empresa_id = public.mi_empresa_id() or public.is_admin())
  with check (empresa_id = public.mi_empresa_id() or public.is_admin());
create policy vacantes_delete on public.vacantes for delete to authenticated
  using (empresa_id = public.mi_empresa_id() or public.is_admin());

create policy vc_select on public.vacante_carreras for select to anon, authenticated using (true);
create policy vc_insert on public.vacante_carreras for insert to authenticated
  with check (exists (select 1 from public.vacantes v where v.id = vacante_id and v.empresa_id = public.mi_empresa_id()));
create policy vc_delete on public.vacante_carreras for delete to authenticated
  using (exists (select 1 from public.vacantes v where v.id = vacante_id and (v.empresa_id = public.mi_empresa_id() or public.is_admin())));

-- POSTULACIONES -------------------------------------------------------
-- El alta la hace la Edge Function "postular" (service_role).
create policy postulaciones_select on public.postulaciones for select to authenticated
  using (public.is_admin() or exists (
    select 1 from public.vacantes v where v.id = vacante_id and v.empresa_id = public.mi_empresa_id()));
create policy postulaciones_update on public.postulaciones for update to authenticated
  using (exists (select 1 from public.vacantes v where v.id = vacante_id and v.empresa_id = public.mi_empresa_id()))
  with check (exists (select 1 from public.vacantes v where v.id = vacante_id and v.empresa_id = public.mi_empresa_id()));

-- CONFIGURACIÓN -------------------------------------------------------
create policy config_select on public.configuracion for select to anon, authenticated using (true);
create policy config_admin_insert on public.configuracion for insert to authenticated with check (public.is_admin());
create policy config_admin_update on public.configuracion for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy config_admin_delete on public.configuracion for delete to authenticated using (public.is_admin());

-- CRÉDITOS / PAGOS (solo lectura para clientes; escritura vía RPC service_role)
create policy creditos_select on public.creditos_empresa for select to authenticated
  using (empresa_id = public.mi_empresa_id() or public.is_admin());
create policy movimientos_select on public.movimientos_creditos for select to authenticated
  using (empresa_id = public.mi_empresa_id() or public.is_admin());
create policy pagos_select on public.pagos_stripe for select to authenticated
  using (empresa_id = public.mi_empresa_id() or public.is_admin());

create policy paquetes_select on public.paquetes_creditos for select to authenticated
  using (activo or public.is_admin());
create policy paquetes_admin_insert on public.paquetes_creditos for insert to authenticated with check (public.is_admin());
create policy paquetes_admin_update on public.paquetes_creditos for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy paquetes_admin_delete on public.paquetes_creditos for delete to authenticated using (public.is_admin());

-- SELLOS (lectura propia/admin; el público usa consultar_sello) --------
create policy sellos_select on public.sellos for select to authenticated
  using (empresa_id = public.mi_empresa_id() or public.is_admin());

-- uso_publico: sin políticas => solo service_role.

-- Privilegios explícitos (por si el proyecto no trae los defaults de Supabase)
grant usage on schema public to anon, authenticated, service_role;
grant select on public.carreras, public.configuracion, public.vacante_carreras to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

-- =====================================================================
--  STORAGE
--   cvs        (privado)  -> {vacante_id}/{uuid}.pdf
--   documentos (privado)  -> {user_id}/ficha_ruc.pdf, dni_frente.*, ...
--   publico    (público)  -> {user_id}/logo_*.png, branding/*
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('cvs',        'cvs',        false, 5242880,  array['application/pdf']),
  ('documentos', 'documentos', false, 8388608,  array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']),
  ('publico',    'publico',    true,  3145728,  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- CVs: la empresa dueña de la vacante y el admin pueden leer
create policy cvs_leer on storage.objects for select to authenticated
  using (bucket_id = 'cvs' and (
    public.is_admin() or exists (
      select 1 from public.vacantes v
       where v.id::text = (storage.foldername(name))[1]
         and v.empresa_id = public.mi_empresa_id())));

-- Documentos de verificación: dueño y admin
create policy documentos_leer on storage.objects for select to authenticated
  using (bucket_id = 'documentos' and (
    public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text));

-- Público: cualquiera lee; cada usuario escribe en su carpeta; admin en branding/
create policy publico_leer on storage.objects for select to anon, authenticated
  using (bucket_id = 'publico');
create policy publico_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'publico' and (
    (storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
create policy publico_actualizar on storage.objects for update to authenticated
  using (bucket_id = 'publico' and (
    (storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
create policy publico_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'publico' and (
    (storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- =====================================================================
--  REALTIME: notificaciones de nuevas postulaciones en el panel
-- =====================================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.postulaciones;
    exception when duplicate_object then null;
    end;
  end if;
end $$;
