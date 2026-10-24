-- =====================================================================
--  PRÁCTIKA YA · Datos iniciales
-- =====================================================================

insert into public.configuracion (clave, valor) values
  ('nombre_sitio',            'Práctika ya'),
  ('logo_sitio',              ''),
  ('footer_descripcion',      'Conectamos a estudiantes universitarios con empresas que apuestan por el talento joven.'),
  ('mision_sitio',            'Democratizar el acceso a prácticas preprofesionales con procesos de selección transparentes y apoyados por IA.'),
  ('email_contacto',          'contacto@praktikaya.pe'),
  ('telefono_contacto',       ''),
  ('facebook_url',            ''),
  ('instagram_url',           ''),
  ('linkedin_url',            ''),
  ('twitter_url',             ''),
  ('modo_mantenimiento',      'off'),
  ('mantenimiento_msg',       'Estamos realizando mejoras en la plataforma. Volvemos pronto.'),
  ('terminos_condiciones',    'Acepto el tratamiento de mis datos personales conforme a la Ley N.° 29733 para el proceso de selección y verificación de identidad.'),
  ('terminos_postulante',     'Autorizo el tratamiento de mis datos personales y el análisis automatizado de mi CV únicamente para este proceso de selección.'),
  ('dominios_correo_estudiante', '.edu.pe'),
  ('umbral_apto',             '60'),
  ('creditos_bienvenida',     '0'),
  ('ai_credit_sales_enabled', '1')
on conflict (clave) do nothing;

insert into public.paquetes_creditos (nombre, creditos, costo_base, margen_utilidad, activo, orden) values
  ('Básico',  50,  0.50, 100, true, 1),
  ('Pro',     150, 0.50,  80, true, 2),
  ('Empresa', 500, 0.50,  60, true, 3)
on conflict (nombre) do nothing;

insert into public.carreras (nombre)
select x from unnest(array[
  'Administración de Empresas', 'Arquitectura', 'Ciencias de la Comunicación', 'Contabilidad',
  'Derecho', 'Diseño Gráfico', 'Economía', 'Educación', 'Enfermería', 'Ingeniería Civil',
  'Ingeniería de Sistemas', 'Ingeniería de Software', 'Ingeniería Industrial', 'Ingeniería Mecánica',
  'Ingeniería Electrónica', 'Ingeniería Ambiental', 'Marketing', 'Negocios Internacionales',
  'Psicología', 'Medicina Humana', 'Nutrición', 'Turismo y Hotelería'
]) as x
where not exists (select 1 from public.carreras c where lower(c.nombre) = lower(x));
