export interface Pregunta {
  pregunta: string;
  opciones: string[];
  respuestaCorrecta: number;
}

export interface Examen {
  id: string;
  titulo: string;
  descripcion: string;
  tiempoLimite: number;
  calificacionMinima: number;
  preguntas: Pregunta[];
}

export interface Usuario {
  uid: string;
  authUid?: string;
  nombreCompleto: string;
  curp: string;
  rol: 'Admin' | 'Alumno';
  estado: 'pendiente' | 'activo' | 'bloqueado';
  examenesHabilitados?: string[];
  examenesBloqueados?: string[];
  email?: string;
}

export interface Resultado {
  id?: string;
  usuarioId: string;
  authUid?: string;
  examenId: string;
  examenTitulo: string;
  puntaje: number;
  fecha: string;
  fecha_finalizacion?: any;
  aprobado: boolean;
  respuestasUsuario: number[];
}

export interface AppConfig {
  id: string;
  logoUrl?: string;
  secondaryLogoUrl?: string;
  plantillaUrl?: string;
  firmaUrl?: string;
  nombreEvaluador?: string;
  nombrePlataforma?: string;
}
