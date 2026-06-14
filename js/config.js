/* ══════════════════════════ CONSTANTS ══════════════════════════ */
const STORAGE_KEY = 'elim_dashboard_data_v12';
const USERS_KEY   = 'elim_users_v1';          // clave separada – nunca sobreescrita por la nube
const BACKUP_TS_KEY = 'elim_last_backup_ts';
const SUPA_URL = 'https://yignxggvsrifmoiijpnb.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpZ254Z2d2c3JpZm1vaWlqcG5iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMzU0OTAsImV4cCI6MjA5NjYxMTQ5MH0.3swOuEppeGcfP25qWQS2ByUBeOlwmdrTmIoUXbXTtYM';
const SESSION_ID = Math.random().toString(36).slice(2); // identifica esta pestaña/sesión
// PINs maestros — solo se leen al inicio para generar hashes; se borran de memoria después
let _MP = { a: '5624', d: '1234' };
let _HASH_ADMIN = '', _HASH_DIR = '';
let _syncTimer      = null;
let _syncPending    = false;
let _supaClient     = null;
let _lastSavedAt       = Date.now(); // timestamp del último cambio local
let _localModifiedAt   = parseInt(localStorage.getItem('elim_data_modified_at') || '0'); // persiste entre recargas
let _applyingRemote    = false; // true mientras se aplican datos remotos — evita re-subir a la nube
let _remindersTs       = 0;    // timestamp de la última modificación LOCAL de reminders
// Editables desde Configuración general (se sincronizan). 'Extemporáneo' siempre va al final.
let SERVICE_HOURS = ['7:00 AM','8:45 AM','10:30 AM','2:00 PM','3:45 PM','5:30 PM','Extemporáneo'];

// Departamentos del ministerio infantil — editables desde Configuración general
let DEPARTMENTS = [
  'Iglesia de Bebés','Preescolares','Escolares','Club Victoriosos','Arcoíris de Amor',
  'Enseñanza','Alabanza','Comunicaciones','Comité de Protección de la Niñez y Adolescencia',
  'CPI','CEFEC','Cocina','Raíces de Fe'
];

let DISTRICT_SCHEDULES = {
  'Distrito 1': ['5:30 PM'],
  'Distrito 2': ['2:00 PM'],
  'Distrito 3': ['8:45 AM'],
  'Distrito 4': ['10:30 AM'],
  'Distrito 5': ['8:45 AM'],
  'Distrito 6': ['3:45 PM'],
  'Distrito 7': ['7:00 AM'],
  'Distrito 8': ['10:30 AM'],
};

window._highlightDistrictSchedules = function() {
  const distSel = document.getElementById('p-district');
  if(!distSel) return;
  const dist = distSel.value;
  const recommended = DISTRICT_SCHEDULES[dist] || [];
  document.querySelectorAll('#p-sch-opts .sch-opt').forEach(el => {
    const val = el.getAttribute('data-val');
    if(recommended.includes(val)) {
      el.classList.add('district-match');
    } else {
      el.classList.remove('district-match');
    }
  });
};
const SOCIAL_NETS = [
  {key:'ig',label:'📸 Instagram',cls:'soc-ig s-ig'},
  {key:'fb',label:'👤 Facebook', cls:'soc-fb s-fb'},
  {key:'yt',label:'▶️ YouTube',  cls:'soc-yt s-yt'},
  {key:'tt',label:'🎵 TikTok',   cls:'soc-tt s-tt'},
  {key:'tw',label:'🐦 Twitter',  cls:'soc-tw s-tw'},
  {key:'wa',label:'💬 WhatsApp', cls:'soc-wa s-wa'},
];
const PRODUCT_TYPES = ['Video','Foto','Reels','Story','Gráfico','Audio','Live','Otro'];
const GRAD = {
  morado: 'linear-gradient(90deg, #4a25aa, #ccd4ff)',
  verde: 'linear-gradient(90deg, #26d07c, #20acf4)',
  rosado_infantil: 'linear-gradient(90deg, #fb637e, #ffc600)',
  naranja_juv: 'linear-gradient(90deg, #ec6742, #f6c849)',
  celeste_juv: 'linear-gradient(90deg, #20acf4, #ef87c7)'
};
const KNOWN_TASKS = [
  // Preparación y Logística
  "Diseño", "Redacción", "Impresión de materiales", "Coordinación de servidores y colaboradores a cargo",
  "Mantenimiento de equipos", "Control de sonido", "Control de luces", "Preparación y montaje de escenario",
  "Ambientación y decoración", "Coordinación de voluntarios",
  // Cobertura del Evento
  "Captura de fotografías", "Grabación de video", "Tomas aéreas", "Transmisión en vivo",
  "Operación de cámara en vivo", "Operación de teleprompter",
  // Atención y Recepción
  "Recorridos a visitantes", "Guía de visitantes", "Recepción y bienvenida",
  // Postproducción y Digital
  "Edición de fotos", "Edición de vídeos", "Gestión de redes sociales",
  "Programación de publicaciones", "Monitoreo de comentarios y comunidad",
  "Actualización de sitio web", "Creación de contenido escrito",
  "Revisión y aprobación de contenido",
  // Capacitación
  "Dirigir capacitación", "Recibir capacitación", "Evaluación de equipo"
];

const KNOWN_ACTIVITIES = [
  "Cobertura de servicio dominical",
  "Cobertura fotográfica de evento",
  "Cobertura de video de evento",
  "Recorridos a visitantes",
  "Transmisión en vivo",
  "Diseño de material gráfico",
  "Publicación en redes sociales",
  "Edición de contenido",
  "Capacitación interna",
  "Reunión de equipo",
  "Mantenimiento de equipos",
  "Preparación de materiales",
  "Dirección de arte",
  "Gestión de comunidad digital",
  "Producción de podcast",
  "Cobertura de campaña especial",
  "Recepción y bienvenida a visitantes",
  "Producción de material impreso"
];

// LISTA DE HABILIDADES GRANULAR
const KNOWN_SKILLS = [
  "Liderazgo y Gestión",
  "Diseño Gráfico",
  "Redacción (Copywriting)",
  "Mantenimiento de Equipos",
  "Fotografía",
  "Grabación de Video",
  "Operación de Drones/Estabilizadores",
  "Transmisión en Vivo (Streaming)",
  "Edición de Fotos",
  "Edición de Videos",
  "Gestión de Redes Sociales",
  "Enseñanza y Capacitación",
  "Adaptabilidad Técnica"
];

const AVC=['#4a25aa','#26d07c','#fb637e','#82d8c3','#fbe695','#6366f1','#ec4899','#84cc16','#f97316','#8b5cf6'];
