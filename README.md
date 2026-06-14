# DEPCOM Infantil — Dashboard MCE

Dashboard de coordinación de asignaciones para el departamento infantil de **Misión Cristiana Elim**. PWA (Progressive Web App) en Vanilla JS con sincronización en tiempo real vía Supabase.

---

## ¿Qué hace?

Centraliza la planificación de cada servicio: quién hace qué, cuándo y dónde. El coordinador crea eventos y actividades, asigna tareas a voluntarios, y cada persona puede ver sus responsabilidades desde su celular sin instalar nada.

---

## Funcionalidades principales

| Módulo | Descripción |
|---|---|
| **Actividades** | Tarjetas de actividades por evento con tareas, responsables, co-líderes, apoyos, horarios y entregables |
| **Vista Gantt** | Línea de tiempo visual de todas las actividades del evento activo |
| **Por Persona** | Resumen de carga de trabajo por voluntario con barras proporcionales |
| **RSVP anticipado** | Confirmación de asistencia antes del evento (Asistiré / No podré) |
| **Asistencia** | Registro de asistencia el día del evento + auto-marcado de ausentes |
| **Directorio** | Perfil completo de cada voluntario: cargo, distrito, horarios, habilidades, foto, historial de cambios |
| **Habilidades** | Valoración visual (0–10) de habilidades por persona con barras de color |
| **KPIs personales** | Gráfica de evolución de cumplimiento por persona a lo largo del tiempo |
| **Equipos** | Grupos de trabajo con líderes y miembros |
| **Evaluaciones** | Seguimiento de metas y desempeño por coordinador |
| **Equipos en vivo** | Panel de estado en tiempo real durante el servicio |
| **Notificaciones** | Push notifications + badge de nuevas asignaciones |
| **Anuncios globales** | El admin publica un banner visible para todos al abrir la app |
| **Recordatorios** | Alertas programadas para el equipo |
| **Respaldos** | Backup automático en la nube + exportación/importación JSON |

---

## Arquitectura

```
index.html          ← UI completa + estilos inline
sw.js               ← Service Worker (cache + offline)
manifest.json       ← PWA manifest
js/
  config.js         ← Credenciales Supabase
  state.js          ← Variables globales compartidas
  utils.js          ← Helpers: avatares, workload, display names
  auth.js           ← Login, sesiones, niveles de acceso
  ui.js             ← Navegación entre pestañas
  events.js         ← Gestión de eventos y pestaña de selección
  activities.js     ← CRUD de actividades y tareas
  render.js         ← Renderizado de tarjetas y vista Gantt
  people.js         ← Directorio de voluntarios y habilidades
  views.js          ← Por Persona, Equipos, KPIs, exportación CSV
  evals.js          ← Evaluaciones de desempeño
  attendance.js     ← Registro de asistencia
  notifications.js  ← Badge y panel de notificaciones
  reminders.js      ← Recordatorios programados
  settings.js       ← Configuración visual y anuncios globales
  storage.js        ← LocalStorage + datos de ejemplo
  cloud.js          ← Supabase REST + respaldos en nube
  pwa.js            ← Init, realtime sync, push notifications
  push.js           ← Web Push (VAPID)
  audit.js          ← Log de accesos
```

---

## Niveles de acceso

| Nivel | Nombre | Acceso |
|---|---|---|
| 0 | Invitado | Solo actividades del día actual |
| 1 | Estándar | Sus tareas asignadas, RSVP, asistencia propia |
| 2 | Director / Enlace | Todo excepto gestión de usuarios y personas |
| 3 | Admin Maestro | Acceso total |

---

## Stack técnico

- **Frontend**: Vanilla JS, CSS custom (sin frameworks)
- **Backend / BD**: [Supabase](https://supabase.com) — tabla `dashboard_state` (JSON único) + tabla `dashboard_backups`
- **Tiempo real**: Supabase Realtime WebSocket
- **Push notifications**: Web Push API + VAPID (servidor en Supabase Edge Functions)
- **Offline**: Service Worker con cache-first para assets, network-first para datos
- **Deploy**: GitHub Pages (o cualquier hosting estático)

---

## Configuración inicial

### 1. Supabase

Crea un proyecto en Supabase y ejecuta en el SQL Editor:

```sql
-- Tabla principal de estado
create table dashboard_state (
  id text primary key,
  data jsonb,
  updated_at timestamptz default now()
);

-- Tabla de respaldos
create table dashboard_backups (
  id text primary key,
  label text,
  data jsonb,
  created_at timestamptz default now()
);

-- Fila inicial
insert into dashboard_state (id, data) values ('current', '{"initialized": false}');

-- RLS: acceso público (la app maneja auth propia)
alter table dashboard_state enable row level security;
alter table dashboard_backups enable row level security;
create policy "public_all" on dashboard_state for all using (true) with check (true);
create policy "public_all" on dashboard_backups for all using (true) with check (true);
```

### 2. Configurar credenciales

Edita `js/config.js`:

```js
const SUPABASE_URL = 'https://TU_PROYECTO.supabase.co';
const SUPABASE_KEY = 'tu_anon_key_publica';
```

### 3. PINs maestros

En `js/pwa.js`, al inicio del archivo está el objeto `_MP` con los PINs de Admin y Director. Cámbialos antes de publicar.

### 4. Push Notifications (opcional)

Genera un par de claves VAPID con `push/vapid-generator.html`. La clave privada debe guardarse **únicamente** en los secretos de Supabase Edge Functions. La clave pública va en `js/push.js`.

---

## Despliegue en GitHub Pages

1. Sube todos los archivos al repositorio
2. En **Settings → Pages**, selecciona la rama `main` y carpeta raíz `/`
3. La app quedará disponible en `https://tu-usuario.github.io/tu-repo/`

> El Service Worker requiere HTTPS — GitHub Pages lo provee automáticamente.

---

## Cache busting

Cada vez que se modifica un archivo JS, se incrementa su versión en el tag `<script>` de `index.html` (ej. `js/render.js?v=29`) **y** se incrementa la constante `CACHE` en `sw.js` (ej. `depcom-mce-v48`). Esto fuerza a todos los dispositivos a descargar la versión nueva.

---

## Seguridad

- La clave privada VAPID **nunca** debe estar en el repositorio
- Los PINs se almacenan hasheados (SHA-256) en memoria y localStorage
- El `anon key` de Supabase es de solo acceso a datos públicos; el control real lo hacen los niveles de acceso de la app
- Recomendado: agregar RLS más restrictivo en Supabase para producción

---

## Ministerio

**DEPCOM Infantil — Misión Cristiana Elim**  
Departamento de Comunicaciones e Infantil
