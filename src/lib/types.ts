export type EstadoPostulacion = "en_espera" | "Apto" | "No Apto";
export type EstadoEmpresa = "pendiente" | "aprobado" | "bloqueado";
export type Modalidad = "Presencial" | "Remoto" | "Híbrido";

export interface Perfil {
  id: string;
  rol: "admin" | "empresa";
  nombre: string | null;
  foto_perfil: string | null;
}

export interface Empresa {
  id: number;
  user_id: string;
  nombre_comercial: string;
  ruc: string;
  sector: string;
  correo_contacto: string;
  telefono: string | null;
  direccion: string | null;
  foto_perfil: string | null;
  ficha_ruc: string | null;
  dni_frente: string | null;
  dni_reverso: string | null;
  foto_selfie: string | null;
  ruc_verificado: boolean;
  estado: EstadoEmpresa;
  postulacion_ciega: boolean;
  comunica_motivo_no_seleccion: boolean;
  creado_en: string;
}

export interface Carrera {
  id: number;
  nombre: string;
}

export interface VacantePublica {
  id: number;
  empresa_id: number;
  titulo_puesto: string;
  descripcion_puesto: string;
  requisitos_raw: string;
  modalidad: Modalidad;
  ubicacion: string | null;
  estado: "abierta" | "cerrada";
  fecha_limite: string | null;
  fecha_publicacion: string;
  vigente: boolean;
  nombre_comercial: string;
  sector: string;
  direccion: string | null;
  foto_perfil: string | null;
  carreras: Carrera[];
  carrera_ids: number[];
  sello_vigente: boolean;
}

export interface Vacante {
  id: number;
  empresa_id: number;
  titulo_puesto: string;
  descripcion_puesto: string;
  requisitos_raw: string;
  modalidad: Modalidad;
  ubicacion: string | null;
  estado: "abierta" | "cerrada";
  fecha_limite: string | null;
  fecha_publicacion: string;
  creado_en: string;
}

export interface Postulacion {
  id: number;
  vacante_id: number;
  dni: string;
  nombre_completo: string;
  correo_estudiante: string;
  celular: string | null;
  cv_path: string;
  match_porcentaje: number;
  ia_analisis_descripcion: string | null;
  ia_modelo: string | null;
  analizado_en: string | null;
  estado_postulacion: EstadoPostulacion;
  notificacion_leida: boolean;
  notificado_en: string | null;
  voz_transcripcion: string | null;
  voz_estudios: string[] | null;
  voz_experiencia: string[] | null;
  voz_habilidades: string[] | null;
  fecha_postulacion: string;
}

export interface Paquete {
  id: number;
  nombre: string;
  creditos: number;
  costo_base: number;
  margen_utilidad: number;
  activo: boolean;
  orden: number;
  precio_unitario: number;
  precio_total: number;
}

export interface Movimiento {
  id: number;
  tipo: "compra" | "reserva" | "consumo" | "reembolso" | "bonificacion";
  creditos: number;
  estado: "pendiente" | "completado" | "fallido";
  descripcion: string | null;
  creado_en: string;
}

export interface Pago {
  id: number;
  empresa_id: number;
  session_id: string;
  monto_centimos: number;
  costo_estimado_centimos: number;
  utilidad_estimada_centimos: number;
  creditos: number;
  paquete_nombre: string;
  estado: "pendiente" | "pagado" | "fallido";
  creado_en: string;
  empresas?: { nombre_comercial: string; ruc: string } | null;
}

export interface SelloPublico {
  company_id: number;
  empresa: string;
  ruc: string;
  foto_perfil: string | null;
  sello_vigente: boolean;
  criterios_cumplidos: string[];
  criterios_pendientes: string[];
  detalle: SelloDetalle;
  emitido_en: string | null;
  huella: string | null;
  huella_anterior: string | null;
  historial: { emitido_en: string; sello_otorgado: boolean; huella: string }[];
}

export interface SelloDetalle {
  vacantes_revisadas?: { id: string; titulo: string; discriminatorio: boolean; verificable: boolean; observaciones: string[]; sugerencia?: string }[];
  postulaciones_total?: number;
  postulaciones_respondidas?: number;
  tasa_respuesta?: number;
  no_aptos_total?: number;
  no_aptos_notificados?: number;
}

export interface VozDatos {
  transcripcion: string;
  estudios: string[];
  experiencia: string[];
  habilidades: string[];
}
