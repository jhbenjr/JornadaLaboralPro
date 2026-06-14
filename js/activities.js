/* ══════════════════════════ MODALS: TASKS & SCHEDULING ══════════════════════════ */
function buildSchOpts(){
  const el=document.getElementById('sch-opts');
  if(!el) return;
  el.innerHTML = SERVICE_HOURS.map(h => {
    const sel = modalSchedules.includes(h);
    const isExtemp = h === 'Extemporáneo';
    const timeInp = (isExtemp && sel)
      ? `<input class="extemp-time-inp" type="time" value="${modalExtempTime}"
           onclick="event.stopPropagation()"
           oninput="event.stopPropagation();setExtempTime(this.value)"
           placeholder="HH:MM" />`
      : '';
    return `<div class="sch-opt${sel?' sel':''}" onclick="toggleSch('${h}')">
      <span>${h}</span>${timeInp}
    </div>`;
  }).join('');
}

window.setExtempTime = function(val){
  modalExtempTime = val;
  // también actualizar el label del slot en el builder
  renderTasksBuilder();
};

function toggleSch(h){
  if(modalSchedules.includes(h)){
    const tasksInSlot = modalTaskBlocks.filter(b=>b.horario===h);
    if(tasksInSlot.length){
      customConfirm(`¿Quitar el horario "${h}"? Se eliminarán sus ${tasksInSlot.length} tarea(s).`, ()=>{
        modalSchedules = modalSchedules.filter(x=>x!==h);
        modalTaskBlocks = modalTaskBlocks.filter(b=>b.horario!==h);
        if(h==='Extemporáneo') modalExtempTime='';
        buildSchOpts(); renderTasksBuilder();
      });
    } else {
      modalSchedules = modalSchedules.filter(x=>x!==h);
      if(h==='Extemporáneo') modalExtempTime='';
      buildSchOpts(); renderTasksBuilder();
    }
  } else {
    modalSchedules.push(h);
    buildSchOpts(); renderTasksBuilder();
  }
}

function scheduleLabel(h){
  if(h==='Extemporáneo' && modalExtempTime){
    const [hh,mm]=modalExtempTime.split(':').map(Number);
    const ampm=hh>=12?'PM':'AM';
    const hd=((hh%12)||12);
    return `Extemporáneo (${hd}:${String(mm).padStart(2,'0')} ${ampm})`;
  }
  return h;
}

function suggestScheduleFromTaskTime(val){
  if(!val) return;
  const [hh,mm]=val.split(':').map(Number);
  const mins=hh*60+mm;
  const ranges=[
    {h:'7:00 AM',t:420},{h:'8:45 AM',t:525},{h:'10:30 AM',t:630},
    {h:'2:00 PM',t:840},{h:'3:45 PM',t:945},{h:'5:30 PM',t:1050}
  ];
  let best=ranges[0].h;
  for(let i=ranges.length-1;i>=0;i--){if(mins>=ranges[i].t){best=ranges[i].h;break;}}
  if(!modalSchedules.includes(best)){ modalSchedules.push(best); buildSchOpts(); renderTasksBuilder(); }
}

function addTaskBlock(data=null){
  // La tarea se agrega SOLO al horario indicado (individual por servicio)
  const targetSchedules = [data?.horario || (modalSchedules[0] || '')];

  targetSchedules.forEach(sched => {
    const tid = 't' + (++taskIdCounter);
    modalTaskBlocks.push({
      id: tid,
      horario: sched,
      name: data?.name || '',
      lugar: data?.lugar || '',
      inicio: data?.inicio || '',
      fin: data?.fin || '',
      tarea: data?.tarea || '',
      habilidad: data?.habilidad || '',
      indicaciones: data?.indicaciones || '',
      detalles: data?.detalles || '',
      responsable: '',
      coliders: [],
      done: data?.done || false,
      assignedPeople: [],
      externals: (data?.externals || []).map(e => ({ name:e.name, origin:e.origin })),
      products: [],
      links: []
    });
  });
  renderTasksBuilder();
}

function removeTaskBlock(tid){
  requestPin(3, () => {
    customConfirm('¿Eliminar esta tarea y todos sus entregables?', () => {
      modalTaskBlocks=modalTaskBlocks.filter(b=>b.id!==tid);
      renderTasksBuilder();
    });
  });
}

function addTaskLink(tid) {
    const inp = document.getElementById('link-inp-' + tid);
    let url = inp.value.trim();
    if(!url) return;
    if(!/^https?:\/\//i.test(url)) url = 'https://' + url;
    const b = modalTaskBlocks.find(x => x.id === tid);
    if(b) {
        b.links = b.links || [];
        b.links.push(url);
        inp.value = '';
        renderTasksBuilder();
    }
}
function removeTaskLink(tid, index) {
    const b = modalTaskBlocks.find(x => x.id === tid);
    if(b && b.links) {
        b.links.splice(index, 1);
        renderTasksBuilder();
    }
}

window.handleSelectChange = function(tid, field, selectEl) {
    const val = selectEl.value;
    const inputId = field === 'tarea' ? 'inp-tar-'+tid : 'inp-hab-'+tid;
    const inputEl = document.getElementById(inputId);
    if(val === 'Otro') {
        inputEl.style.display = 'block';
        updateTaskField(tid, field, inputEl.value); 
        inputEl.focus();
    } else {
        inputEl.style.display = 'none';
        updateTaskField(tid, field, val);
    }
    if(field === 'habilidad' && val !== 'Otro') {
        renderTasksBuilder();
    }
};

function renderTasksBuilder(){
  const el=document.getElementById('tasks-builder');
  if(!el) return;
  if(!modalSchedules.length){
    el.innerHTML='<div class="sch-prompt">⬆️ Selecciona al menos un horario de servicio arriba para comenzar a agregar tareas.</div>';
    return;
  }
  // Tareas sin horario asignado (e.g. cargadas desde plantilla)
  const orphans = modalTaskBlocks.filter(b => !b.horario || !modalSchedules.includes(b.horario));
  const orphanHTML = orphans.length ? `
    <div class="sch-slot-section" style="border-color:var(--amber);">
      <div class="sch-slot-hdr" style="background:rgba(255,198,0,.08);border-color:rgba(255,198,0,.3);">
        <span class="sch-slot-lbl" style="color:var(--amber);">⚠️ Sin horario asignado (${orphans.length})</span>
        <span style="font-size:.6rem;color:var(--muted);">Asigna un horario a cada tarea abajo</span>
      </div>
      <div class="sch-slot-body">
        ${orphans.map((b,idx)=>{
          const opts = modalSchedules.map(s=>`<option value="${esc(s)}">${esc(scheduleLabel(s))}</option>`).join('');
          return buildTaskBlockHTML(b,idx+1) + `<div style="padding:0 4px 10px;">
            <label style="font-size:.62rem;color:var(--amber);">📌 Asignar a horario:</label>
            <select style="margin-top:3px;" onchange="updateTaskField('${b.id}','horario',this.value);renderTasksBuilder()">
              <option value="">-- Seleccionar --</option>${opts}
            </select></div>`;
        }).join('')}
      </div>
    </div>` : '';

  // Ordenar los horarios por su hora (extemporáneo según su hora elegida)
  const _slotMin = (s) => {
    if(s === 'Extemporáneo') {
      if(!modalExtempTime) return 99990;
      const [hh,mm] = modalExtempTime.split(':').map(Number);
      return (hh||0)*60 + (mm||0);
    }
    const m = s.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if(!m) return 99991;
    let hh=parseInt(m[1],10); const mm=parseInt(m[2],10);
    if(/pm/i.test(m[3])&&hh<12) hh+=12;
    if(/am/i.test(m[3])&&hh===12) hh=0;
    return hh*60+mm;
  };
  const sortedSchedules = modalSchedules.slice().sort((a,b)=>_slotMin(a)-_slotMin(b));

  el.innerHTML = orphanHTML + sortedSchedules.map(sched => {
    const tasks = modalTaskBlocks.filter(b => b.horario === sched);
    const lbl = scheduleLabel(sched);
    const tasksHTML = tasks.map((b,idx) => buildTaskBlockHTML(b, idx+1)).join('');
    const hEsc = sched.replace(/'/g,"\\'");
    return `<div class="sch-slot-section">
      <div class="sch-slot-hdr">
        <span class="sch-slot-lbl">🕐 ${esc(lbl)}</span>
        <div style="display:flex;gap:6px;align-items:center;">
          <button class="btn-add-task" style="padding:5px 10px;font-size:.65rem;background:var(--s2);color:var(--accent);border:1px solid rgba(124,92,255,.35);" onclick="openTaskTemplatePicker('${hEsc}')" title="Insertar una tarea desde plantilla">
            📋 Desde plantilla
          </button>
          <button class="btn-add-task" style="padding:5px 10px;font-size:.65rem;" onclick="addTaskBlock({horario:'${hEsc}'})">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Agregar Tarea
          </button>
        </div>
      </div>
      <div class="sch-slot-body">
        ${tasksHTML || '<div class="sch-slot-empty">Sin tareas aún. Haz clic en "Agregar Tarea".</div>'}
      </div>
    </div>`;
  }).join('');
}

const _EXT_ORIGIN_LBL = { 'Externo':'🌐 Externo', 'CCRTV':'📡 CCRTV', 'Juventud Elim':'🔥 Juventud Elim' };
function buildTaskBlockHTML(b,num){
  const assignedHTML=b.assignedPeople.map(n=>{ const pO=people.find(x=>x.name===n); const av=personAv(n); const ini2=pO?.photo?'':ini(_dn(n)); return `<span class="atag"><span class="av-mini" style="${av.style}">${ini2}</span>${esc(_dn(n))}<button class="atag-rm" onclick="removeAssignedFromTask('${b.id}','${n.replace(/'/g,"\\'")}')">✕</button></span>`; }).join('')||'<span class="tag-empty">Sin apoyos asignados</span>';

  const externalsHTML=(b.externals||[]).map((ex,xi)=>
    `<span class="atag" style="border-color:rgba(236,103,66,.45);background:rgba(236,103,66,.08);color:var(--white);">
      <span style="font-size:.52rem;font-weight:800;color:#ec6742;">${_EXT_ORIGIN_LBL[ex.origin]||'🌐 Externo'}</span> ${esc(ex.name)}
      <button class="atag-rm" onclick="removeExternalFromTask('${b.id}',${xi})">✕</button>
    </span>`).join('');

  const prodsHTML=b.products.map((pr,pi)=>buildProdBlockHTML(b.id,pi,pr)).join('');
  const isOtroTarea = b.tarea && !KNOWN_TASKS.includes(b.tarea);
  const selTarea = KNOWN_TASKS.includes(b.tarea) ? b.tarea : (b.tarea ? 'Otro' : '');
  const isOtroHab = b.habilidad && !KNOWN_SKILLS.includes(b.habilidad);
  const selHab = KNOWN_SKILLS.includes(b.habilidad) ? b.habilidad : (b.habilidad ? 'Otro' : '');

  // ─── RECOMENDACIONES Y APOYO DISPONIBLE ───
  let recsHTML = "";
  let availHTML = "";

  let potential = people.filter(p => !p.archived && !b.assignedPeople.includes(p.name) && p.name !== b.responsable && !(b.coliders||[]).includes(p.name));

  let recommended = [];
  let available = [];

  potential.forEach(p => {
      let taskSched = b.horario || (modalSchedules[0]||'');
      let isAvailableInSchedule = !taskSched || (p.schedules && p.schedules.includes(taskSched));
      let pSkill = b.habilidad ? p.skills.find(s => s.name === b.habilidad) : null;
      let rating = pSkill ? pSkill.rating : 0;

      let isRecommended = b.habilidad && rating >= 7;

      if (isRecommended) {
          recommended.push({ person: p, rating: rating, isAvailable: isAvailableInSchedule });
      } else if (isAvailableInSchedule) {
          available.push({ person: p, rating: rating });
      }
  });

  if(recommended.length > 0) {
      recommended.sort((a,b) => {
          if (a.isAvailable && !b.isAvailable) return -1;
          if (!a.isAvailable && b.isAvailable) return 1;
          return b.rating - a.rating;
      });
      recsHTML += `<div class="rec-title">✨ Apoyo Recomendado (Nivel ≥ 7)</div>
        <div class="rec-list">
          ${recommended.slice(0,5).map(r => { const _av=personAv(r.person.name); return `<span class="rec-chip" onclick="addAssignedToTaskDirect('${b.id}','${r.person.name.replace(/'/g,"\\'")}')"><span class="av-mini" style="${_av.style}; width:14px;height:14px;font-size:.45rem;">${_av.content||ini(_dn(r.person.name))}</span> ${esc(_dn(r.person.name))} <span class="r-star">★${r.rating}</span>${!r.isAvailable?' <span style="font-size:0.5rem;color:var(--red)">(Otro horario)</span>':''}</span>`; }).join('')}
        </div>`;
  }

  if(available.length > 0) {
      availHTML += `<div class="rec-title" style="color:var(--cyan); margin-top:8px;">🟢 Apoyo Disponible en este horario</div>
        <div class="rec-list">
          ${available.map(r => { const _av=personAv(r.person.name); return `<span class="rec-chip" onclick="addAssignedToTaskDirect('${b.id}','${r.person.name.replace(/'/g,"\\'")}')"><span class="av-mini" style="${_av.style}; width:14px;height:14px;font-size:.45rem;">${_av.content||ini(_dn(r.person.name))}</span> ${esc(_dn(r.person.name))} <span class="r-star" style="color:var(--muted);">★${r.rating}</span></span>`; }).join('')}
        </div>`;
  }

  let fullRecsHTML = "";
  if (recsHTML || availHTML) {
      fullRecsHTML = `<div class="rec-wrap">${recsHTML}${availHTML}</div>`;
  }
  // ─────────────────────────────────────────

  const allLeaders = [b.responsable, ...(b.coliders||[])].filter(Boolean);
  const respOpts = getPeopleOptions(b.responsable, [...(b.coliders||[]), ...(b.assignedPeople||[])]);
  const asigOpts = getPeopleOptions('', [...allLeaders, ...(b.assignedPeople||[])]);

  const habSelectOpts = KNOWN_SKILLS.map(sk => `<option value="${sk}" ${selHab===sk?'selected':''}>${sk}</option>`).join('');

  const linksHTML = (b.links||[]).map((lnk, i) => `
      <span class="atag" style="background:rgba(32,172,244,.1); color:var(--cyan); border-color:var(--cyan);">🔗 ${esc(lnk).substring(0,25)}...
        <button class="atag-rm" style="background:transparent; color:var(--cyan);" onclick="removeTaskLink('${b.id}', ${i})">✕</button>
      </span>
  `).join('') || '<span class="tag-empty">Sin enlaces adjuntos</span>';


  return `<div class="task-block" id="tb-${b.id}">
    <div class="task-block-hdr">
      <span class="task-block-num">Tarea ${num}</span>
      <div style="display:flex;gap:6px;align-items:center;">
        <button class="btn-rm-task" style="background:rgba(124,92,255,.12);color:var(--accent);border-color:rgba(124,92,255,.35);" onclick="saveTaskAsTemplate('${b.id}')" title="Guardar esta tarea como plantilla">💾 Plantilla</button>
        <button class="btn-rm-task" onclick="removeTaskBlock('${b.id}')">✕ Eliminar Tarea</button>
      </div>
    </div>
    <div class="task-block-body">
      <div class="task-block-grid">
        <div class="tbg full"><label>Nombre de la tarea *</label>
          <input data-field="name" type="text" value="${esc(b.name)}" placeholder="Ej. Transmisión en vivo" oninput="updateTaskField('${b.id}','name',this.value)"/></div>

        <div class="tbg"><label>⚙️ Tipo de tarea *</label>
          <select data-field="tarea" onchange="handleSelectChange('${b.id}', 'tarea', this)">
            <option value="">-- Seleccionar --</option>
            <optgroup label="Preparación y Logística">
              <option value="Diseño" ${selTarea==='Diseño'?'selected':''}>Diseño</option>
              <option value="Redacción" ${selTarea==='Redacción'?'selected':''}>Redacción</option>
              <option value="Impresión de materiales" ${selTarea==='Impresión de materiales'?'selected':''}>Impresión de materiales</option>
              <option value="Coordinación de servidores y colaboradores a cargo" ${selTarea==='Coordinación de servidores y colaboradores a cargo'?'selected':''}>Coordinación de servidores</option>
              <option value="Mantenimiento de equipos" ${selTarea==='Mantenimiento de equipos'?'selected':''}>Mantenimiento de equipos</option>
              <option value="Control de sonido" ${selTarea==='Control de sonido'?'selected':''}>Control de sonido</option>
              <option value="Control de luces" ${selTarea==='Control de luces'?'selected':''}>Control de luces</option>
              <option value="Preparación y montaje de escenario" ${selTarea==='Preparación y montaje de escenario'?'selected':''}>Preparación y montaje de escenario</option>
              <option value="Ambientación y decoración" ${selTarea==='Ambientación y decoración'?'selected':''}>Ambientación y decoración</option>
              <option value="Coordinación de voluntarios" ${selTarea==='Coordinación de voluntarios'?'selected':''}>Coordinación de voluntarios</option>
            </optgroup>
            <optgroup label="Cobertura del Evento">
              <option value="Captura de fotografías" ${selTarea==='Captura de fotografías'?'selected':''}>Captura de fotografías</option>
              <option value="Grabación de video" ${selTarea==='Grabación de video'?'selected':''}>Grabación de video</option>
              <option value="Tomas aéreas" ${selTarea==='Tomas aéreas'?'selected':''}>Tomas aéreas</option>
              <option value="Transmisión en vivo" ${selTarea==='Transmisión en vivo'?'selected':''}>Transmisión en vivo</option>
              <option value="Operación de cámara en vivo" ${selTarea==='Operación de cámara en vivo'?'selected':''}>Operación de cámara en vivo</option>
              <option value="Operación de teleprompter" ${selTarea==='Operación de teleprompter'?'selected':''}>Operación de teleprompter</option>
            </optgroup>
            <optgroup label="Atención y Recepción">
              <option value="Recorridos a visitantes" ${selTarea==='Recorridos a visitantes'?'selected':''}>Recorridos a visitantes</option>
              <option value="Guía de visitantes" ${selTarea==='Guía de visitantes'?'selected':''}>Guía de visitantes</option>
              <option value="Recepción y bienvenida" ${selTarea==='Recepción y bienvenida'?'selected':''}>Recepción y bienvenida</option>
            </optgroup>
            <optgroup label="Postproducción y Digital">
              <option value="Edición de fotos" ${selTarea==='Edición de fotos'?'selected':''}>Edición de fotos</option>
              <option value="Edición de vídeos" ${selTarea==='Edición de vídeos'?'selected':''}>Edición de vídeos</option>
              <option value="Gestión de redes sociales" ${selTarea==='Gestión de redes sociales'?'selected':''}>Gestión de redes sociales</option>
              <option value="Programación de publicaciones" ${selTarea==='Programación de publicaciones'?'selected':''}>Programación de publicaciones</option>
              <option value="Monitoreo de comentarios y comunidad" ${selTarea==='Monitoreo de comentarios y comunidad'?'selected':''}>Monitoreo de comentarios</option>
              <option value="Actualización de sitio web" ${selTarea==='Actualización de sitio web'?'selected':''}>Actualización de sitio web</option>
              <option value="Creación de contenido escrito" ${selTarea==='Creación de contenido escrito'?'selected':''}>Creación de contenido escrito</option>
              <option value="Revisión y aprobación de contenido" ${selTarea==='Revisión y aprobación de contenido'?'selected':''}>Revisión y aprobación de contenido</option>
            </optgroup>
            <optgroup label="Capacitación y Desarrollo">
              <option value="Dirigir capacitación" ${selTarea==='Dirigir capacitación'?'selected':''}>Dirigir capacitación</option>
              <option value="Recibir capacitación" ${selTarea==='Recibir capacitación'?'selected':''}>Recibir capacitación</option>
              <option value="Evaluación de equipo" ${selTarea==='Evaluación de equipo'?'selected':''}>Evaluación de equipo</option>
            </optgroup>
            <option value="Otro" ${selTarea==='Otro'?'selected':''}>✏️ Personalizado (escribir)</option>
          </select>
          <input type="text" id="inp-tar-${b.id}" value="${isOtroTarea ? esc(b.tarea) : ''}" style="display:${selTarea==='Otro'?'block':'none'}; margin-top:4px;" placeholder="Escribe el tipo de tarea..." oninput="updateTaskField('${b.id}','tarea',this.value)"/>
        </div>

        <div class="tbg"><label>🎯 Habilidad requerida *</label>
          <select data-field="habilidad" onchange="handleSelectChange('${b.id}', 'habilidad', this)">
            <option value="">-- Seleccionar --</option>
            ${habSelectOpts}
            <option value="Otro" ${selHab==='Otro'?'selected':''}>Otro (Especificar)</option>
          </select>
          <input type="text" id="inp-hab-${b.id}" value="${isOtroHab ? esc(b.habilidad) : ''}" style="display:${selHab==='Otro'?'block':'none'}; margin-top:4px;" placeholder="Especifique habilidad..." oninput="updateTaskField('${b.id}','habilidad',this.value)"/>
        </div>

        <div class="tbg"><label>▶️ Hora inicio *</label>
          <input data-field="inicio" type="time" value="${b.inicio}" oninput="updateTaskField('${b.id}','inicio',this.value);suggestScheduleFromTaskTime(this.value)"/></div>
        <div class="tbg"><label>⏹ Hora fin *</label>
          <input data-field="fin" type="time" value="${b.fin}" oninput="updateTaskField('${b.id}','fin',this.value)"/></div>

        <div class="tbg full"><label>👑 Líder de tarea * <span style="font-weight:400;color:var(--muted);font-size:.6rem;">(máx. 3 líderes)</span></label>
          <div style="display:flex;flex-direction:column;gap:5px;">
            <select data-field="responsable" onchange="handleTaskResp('${b.id}', this, '${esc(b.responsable||'')}')">
               ${respOpts}
            </select>
            ${(b.coliders||[]).map((cl,ci)=>`
            <div style="display:flex;gap:4px;align-items:center;">
              <select style="flex:1;" onchange="handleTaskColider('${b.id}',${ci},this,'${esc(cl||'')}')">
                ${getPeopleOptions(cl,[b.responsable,...(b.coliders||[]).filter((_,xi)=>xi!==ci),...(b.assignedPeople||[])])}
              </select>
              <button class="atag-rm" style="width:26px;height:26px;flex-shrink:0;" onclick="removeColider('${b.id}',${ci})">✕</button>
            </div>`).join('')}
            ${(b.coliders||[]).length < 2 && b.responsable ? `<button class="btn-ap" style="width:fit-content;font-size:.65rem;" onclick="addColider('${b.id}')">+ Agregar co-líder</button>` : ''}
          </div>
        </div>

        <div class="tbg"><label>📍 Lugar *</label>
          <input data-field="lugar" type="text" value="${esc(b.lugar)}" placeholder="Ej. Auditorio, Exteriores" oninput="updateTaskField('${b.id}','lugar',this.value)"/></div>
        
        <div class="tbg full"><label>⚠️ Indicaciones</label>
          <textarea placeholder="Instrucciones especiales…" oninput="updateTaskField('${b.id}','indicaciones',this.value)">${esc(b.indicaciones)}</textarea></div>
        <div class="tbg full"><label>📝 Detalles</label>
          <textarea placeholder="Notas adicionales…" oninput="updateTaskField('${b.id}','detalles',this.value)">${esc(b.detalles)}</textarea></div>

        <!-- Enlaces / Docs -->
        <div class="tbg full" style="margin-top:5px;">
          <label>📎 Enlaces / Documentos (Drive, Canva, Docs)</label>
          <div class="assign-wrap">
            <div class="assign-row">
              <input type="url" id="link-inp-${b.id}" placeholder="Pegar URL aquí (https://...)" />
              <button class="btn-ap" onclick="addTaskLink('${b.id}')">+ Añadir Link</button>
            </div>
            <div class="tag-list" id="ll-${b.id}">${linksHTML}</div>
          </div>
        </div>

        <!-- Asignados -->
        <div class="tbg full" style="margin-top:5px;">
          <label>👥 Asignados (Apoyo) *</label>
          <div class="assign-wrap">
            <div class="assign-row">
              <select id="ai-${b.id}">
                 ${asigOpts}
              </select>
              <button class="btn-ap" onclick="addAssignedToTask('${b.id}')">+ Agregar Apoyo</button>
            </div>
            <div class="tag-list" id="al-${b.id}">${assignedHTML}</div>
            ${fullRecsHTML}
            <div style="margin-top:9px;padding-top:8px;border-top:1px dashed var(--border);">
              <label style="font-size:.62rem;color:#ec6742;font-weight:700;">🌐 Apoyo externo (no pertenece al talento)</label>
              <div class="assign-row" style="margin-top:4px;">
                <input type="text" id="ext-name-${b.id}" placeholder="Nombre del apoyo externo" style="flex:1;" />
                <select id="ext-origin-${b.id}" style="flex-shrink:0;">
                  <option value="Externo">🌐 Externo</option>
                  <option value="CCRTV">📡 CCRTV</option>
                  <option value="Juventud Elim">🔥 Juventud Elim</option>
                </select>
                <button class="btn-ap" onclick="addExternalToTask('${b.id}')">+ Externo</button>
              </div>
              <div class="tag-list" id="extl-${b.id}" style="margin-top:5px;">${externalsHTML}</div>
            </div>
          </div>
        </div>
      </div>
      <!-- PRODUCTOS -->
      <div class="prods-builder" id="pb-${b.id}">
        <div style="font-size:.63rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--a2);margin-bottom:4px;">📦 Productos a publicar / Entregables</div>
        ${prodsHTML}
        <button class="btn-add-prod" onclick="addProductToTask('${b.id}')">+ Agregar Producto o Entregable</button>
      </div>
    </div>
  </div>`;
}

const PUB_TASK_TYPES = new Set(['Gestión de redes sociales','Programación de publicaciones','Publicación en redes sociales','Monitoreo de comentarios y comunidad']);
function hasPublicationTask() {
  return modalTaskBlocks.some(b => PUB_TASK_TYPES.has(b.tarea) || (b.name||'').toLowerCase().includes('publicac'));
}

function buildProdBlockHTML(tid,pi,pr){
  const socsHTML=SOCIAL_NETS.map(s=>`<span class="soc-chip soc-active clickable ${s.cls.split(' ')[0]}${pr.socials&&pr.socials.includes(s.key)?' soc-uploaded':''}" onclick="toggleProdSoc('${tid}',${pi},'${s.key}')">${s.label}</span>`).join('');
  const typeOpts=PRODUCT_TYPES.map(t=>`<option value="${t}"${pr.type===t?' selected':''}>${t}</option>`).join('');
  const hasPub = hasPublicationTask();
  // All task leaders and assignees available as publication owner candidates
  const allPeople = [...new Set(modalTaskBlocks.flatMap(b=>[b.responsable,...(b.coliders||[]),...(b.assignedPeople||[])]).filter(Boolean))];
  const pubOwnerOpts = `<option value="">-- Sin asignar --</option>` + allPeople.map(n=>`<option value="${n}"${pr.encargadoPublicacion===n?' selected':''}>${esc(_dn(n))}</option>`).join('');
  return `<div class="prod-block" id="prod-${tid}-${pi}">
    <div class="prod-block-hdr">
      <span class="prod-block-lbl">Producto ${pi+1}</span>
      <button class="btn-rm-prod" onclick="removeProduct('${tid}',${pi})">✕</button>
    </div>
    <div class="prod-block-grid">
      <div class="pbg"><label>Nombre del producto</label><input type="text" value="${esc(pr.name||'')}" placeholder="Ej. Video resumen servicio" oninput="updateProd('${tid}',${pi},'name',this.value)"/></div>
      <div class="pbg"><label>Tipo</label><select onchange="updateProd('${tid}',${pi},'type',this.value)">${typeOpts}</select></div>
      <div class="pbg full"><label>📱 Redes donde publicar (Tócalas para activarlas)</label><div class="soc-picker">${socsHTML}</div></div>
      ${hasPub ? `<div class="pbg full"><label>📢 Encargado de publicación <span style="font-size:.58rem;color:var(--muted);font-weight:400;">(requiere tarea de publicación)</span></label><select onchange="updateProd('${tid}',${pi},'encargadoPublicacion',this.value)">${pubOwnerOpts}</select></div>` : ''}
      <div class="pbg full"><label>Notas del producto</label><input type="text" value="${esc(pr.notes||'')}" placeholder="Ej. Editar a 60 seg, subtítulos…" oninput="updateProd('${tid}',${pi},'notes',this.value)"/></div>
    </div>
  </div>`;
}

function updateTaskField(tid,field,val){ const b=modalTaskBlocks.find(x=>x.id===tid); if(b)b[field]=val; }
function addAssignedToTaskDirect(tid, name) {
    const b=modalTaskBlocks.find(x=>x.id===tid);
    if(b && !b.assignedPeople.includes(name) && b.responsable !== name && !(b.coliders||[]).includes(name)) {
        _checkFull(name, () => {
            b.assignedPeople.push(name);
            renderTasksBuilder();
        }, null, b.horario, { inicio: b.inicio, fin: b.fin });
    }
}
function addAssignedToTask(tid){ 
    const inp=document.getElementById('ai-'+tid); 
    const val=inp.value.trim(); 
    if(!val)return; 
    addAssignedToTaskDirect(tid, val); 
    inp.value = ''; // reset field after assign
}
function removeAssignedFromTask(tid,name){ const b=modalTaskBlocks.find(x=>x.id===tid); if(b)b.assignedPeople=b.assignedPeople.filter(n=>n!==name); renderTasksBuilder(); }
window.addExternalToTask = function(tid){
    const nameInp = document.getElementById('ext-name-'+tid);
    const origInp = document.getElementById('ext-origin-'+tid);
    const name = (nameInp?.value||'').trim();
    const origin = origInp?.value || 'Externo';
    if(!name){ showToast('⚠️ Escribe el nombre del apoyo externo'); return; }
    const b=modalTaskBlocks.find(x=>x.id===tid); if(!b) return;
    if(!b.externals) b.externals = [];
    if(b.externals.some(e => e.name.toLowerCase() === name.toLowerCase())){ showToast('Ya agregaste a esa persona externa'); return; }
    b.externals.push({ name, origin });
    renderTasksBuilder();
};
window.removeExternalFromTask = function(tid, idx){
    const b=modalTaskBlocks.find(x=>x.id===tid); if(!b||!b.externals) return;
    b.externals.splice(idx,1);
    renderTasksBuilder();
};
function addProductToTask(tid){ const b=modalTaskBlocks.find(x=>x.id===tid); if(!b)return; b.products.push({name:'',type:'Video',socials:[],publishedSocials:[],notes:'',uploaded:false}); renderTasksBuilder(); }
function removeProduct(tid,pi){ 
  requestPin(3, () => {
    const b=modalTaskBlocks.find(x=>x.id===tid); 
    if(!b)return; 
    b.products.splice(pi,1); 
    renderTasksBuilder(); 
  });
}
function updateProd(tid,pi,field,val){ const b=modalTaskBlocks.find(x=>x.id===tid); if(b&&b.products[pi])b.products[pi][field]=val; }
function toggleProdSoc(tid,pi,key){ const b=modalTaskBlocks.find(x=>x.id===tid); if(!b||!b.products[pi])return; const s=b.products[pi].socials; if(s.includes(key)){ b.products[pi].socials=s.filter(k=>k!==key); } else{ b.products[pi].socials.push(key); } renderTasksBuilder(); }

/* ══════════════════════════ MODAL OPEN / CLOSE & DUPLICATE (ACTIVIDADES) ══════════════════════════ */
function openModal(id=null){
  if(authLevel < 2) return;

  editingId=id;
  document.getElementById('modal-ttl').textContent=id?'Editar Actividad':'Nueva Actividad';
  taskIdCounter=0;

  // Poblar sugerencias de nombre de actividad
  const dl = document.getElementById('activity-suggestions');
  if(dl) dl.innerHTML = KNOWN_ACTIVITIES.map(a => `<option value="${a}">`).join('');

  // Poblar departamentos
  const depSel = document.getElementById('f-department');
  if(depSel) depSel.innerHTML = `<option value="">— Sin departamento —</option>` + DEPARTMENTS.map(d => `<option value="${esc(d)}">${esc(d)}</option>`).join('');

  // Poblar Dropdown de Eventos
  const evSel = document.getElementById('f-evento');
  const sortedEvents = events.slice().sort((a,b)=>new Date(b.date)-new Date(a.date));
  evSel.innerHTML = sortedEvents.map(e => `<option value="${e.id}">${formatDateStr(e.date)} - ${esc(e.name)}</option>`).join('');

  if(id){
    const a=activities.find(x=>x.id===id);
    document.getElementById('edit-id').value=id;
    evSel.value = a.eventId || '';
    document.getElementById('f-activity').value=a.activity||'';
    document.getElementById('f-prioridad').value=a.prioridad||'Normal';
    document.getElementById('f-color').value=a.color||'morado';
    { const ds=document.getElementById('f-department'); if(ds) ds.value=a.department||''; }
    oldActResp = a.responsable || '';
    document.getElementById('f-responsable').innerHTML=getPeopleOptions(a.responsable);
    document.getElementById('f-notas').value=a.notas||'';
    
    // Cargar horarios — soporta tanto array como string legacy
    const rawHorarios = a.horarios && a.horarios.length ? a.horarios : (a.horario ? [a.horario] : []);
    modalSchedules = [...rawHorarios];
    modalExtempTime = a.extempTime || '';

    modalTaskBlocks=(a.tasks||[]).map(t=>({
      ...t,
      id:'t'+(++taskIdCounter),
      // Asignar horario al bloque: usar el guardado o el primero de la actividad
      horario: t.horario || rawHorarios[0] || '',
      coliders:[...(t.coliders||[])],
      assignedPeople:[...(t.assignedPeople||[])],
      externals:(t.externals||[]).map(e=>({name:e.name,origin:e.origin})),
      links:[...(t.links||[])],
      products:(t.products||[]).map(pr=>({
          ...pr,
          socials:[...(pr.socials||[])],
          publishedSocials:[...(pr.publishedSocials||[])]
      })),
    }));
  } else {
    ['edit-id','f-activity','f-notas'].forEach(i=>document.getElementById(i).value='');
    if(sortedEvents.length > 0) evSel.value = activeEventId || sortedEvents[0].id;
    document.getElementById('f-prioridad').value='Normal';
    document.getElementById('f-color').value='morado';
    oldActResp = '';
    document.getElementById('f-responsable').innerHTML=getPeopleOptions('');
    modalSchedules=[];
    modalExtempTime='';
    modalTaskBlocks=[];
  }
  buildSchOpts();
  renderTasksBuilder();
  document.getElementById('modal').classList.add('open');
  document.getElementById('f-activity').focus();
}

window.duplicateActivity = function(id) {
    if(authLevel < 2) return;
    const a = activities.find(x => x.id === id);
    if (!a) return;

    editingId = null; 
    document.getElementById('modal-ttl').textContent = 'Duplicar Actividad (Nuevas Tareas)';
    taskIdCounter = 0;

    const evSel = document.getElementById('f-evento');
    const sortedEvents = events.slice().sort((ev_a,ev_b)=>new Date(ev_b.date)-new Date(ev_a.date));
    evSel.innerHTML = sortedEvents.map(e => `<option value="${e.id}">${formatDateStr(e.date)} - ${esc(e.name)}</option>`).join('');
    evSel.value = a.eventId || activeEventId;

    document.getElementById('edit-id').value = '';
    document.getElementById('f-activity').value = a.activity || '';
    document.getElementById('f-prioridad').value = a.prioridad || 'Normal';
    document.getElementById('f-color').value = a.color || 'morado';
    { const ds=document.getElementById('f-department'); if(ds){ ds.innerHTML=`<option value="">— Sin departamento —</option>`+DEPARTMENTS.map(d=>`<option value="${esc(d)}">${esc(d)}</option>`).join(''); ds.value=a.department||''; } }
    oldActResp = a.responsable || '';
    document.getElementById('f-responsable').innerHTML = getPeopleOptions(a.responsable);
    document.getElementById('f-notas').value = a.notas || '';

    // Clear schedule and tasks for the duplicate
    modalSchedules = [];
    modalExtempTime = '';
    modalTaskBlocks = [];
    
    buildSchOpts();
    renderTasksBuilder();
    document.getElementById('modal').classList.add('open');
    showToast('ℹ️ Tareas y horario limpiados para el nuevo registro');
    document.getElementById('f-activity').focus();
};

function closeModalBtn(){
  customConfirm('¿Seguro que deseas salir? Los cambios no guardados se perderán.', () => {
      document.getElementById('modal').classList.remove('open');
      editingId=null;
  });
}
document.addEventListener('keydown',e=>{
    if(e.key==='Escape' && document.getElementById('modal').classList.contains('open')){
        closeModalBtn();
    }
});

/* ══════════════════════════ SAVE WITH STRICT VALIDATION ══════════════════════════ */
function saveActivity(){
  if(authLevel < 2) return;
  const eventId=document.getElementById('f-evento').value;
  const activity=document.getElementById('f-activity').value.trim();
  const responsable=document.getElementById('f-responsable').value.trim();

  const ev = events.find(e => e.id === eventId);

  const RED_STYLE = 'var(--red)';
  const RED_SHADOW = '0 0 0 2px rgba(251,99,126,.3)';
  function _hlEl(el){
    if(!el) return;
    el.style.borderColor=RED_STYLE;
    el.style.boxShadow=RED_SHADOW;
    el.style.outline='2px solid var(--red)';
    // También marcar el contenedor .tbg padre para mayor visibilidad
    const tbg = el.closest?.('.tbg');
    if(tbg){ tbg.style.outline='2px solid var(--red)'; tbg.style.borderRadius='6px'; setTimeout(()=>{ tbg.style.outline=''; },4000); }
    setTimeout(()=>{ el.style.borderColor=''; el.style.boxShadow=''; el.style.outline=''; },4000);
  }

  let errors = [];
  let firstErrEl = null;

  function _markAct(id, msg){ errors.push(msg); const el=document.getElementById(id); _hlEl(el); if(!firstErrEl) firstErrEl=el; }
  function _markTask(taskEl, field, msg){ errors.push(msg); const inp=taskEl?.querySelector(`[data-field="${field}"]`); _hlEl(inp); if(!firstErrEl) firstErrEl = inp || taskEl; }

  if(!eventId) _markAct('f-evento', '⚠️ Debes seleccionar un Evento / Bloque');
  if(!activity) _markAct('f-activity', '⚠️ El nombre de la actividad es obligatorio');
  if(!responsable) _markAct('f-responsable', '⚠️ El responsable general de la actividad es obligatorio');
  if(!modalSchedules.length){ errors.push('⚠️ Debes seleccionar al menos un horario de servicio'); const schEl=document.getElementById('sch-opts'); if(!firstErrEl) firstErrEl=schEl; }

  for(let i=0; i<modalTaskBlocks.length; i++){
    const b = modalTaskBlocks[i];
    const el = document.getElementById('tb-'+b.id);
    if(!b.name.trim())       _markTask(el, 'name',        `⚠️ Tarea ${i+1}: ingresa un nombre`);
    if(!b.tarea.trim())      _markTask(el, 'tarea',       `⚠️ Tarea ${i+1}: selecciona el tipo`);
    if(!b.habilidad.trim())  _markTask(el, 'habilidad',   `⚠️ Tarea ${i+1}: selecciona la habilidad`);
    if(!b.lugar.trim())      _markTask(el, 'lugar',       `⚠️ Tarea ${i+1}: indica el lugar`);
    if(!b.inicio)            _markTask(el, 'inicio',      `⚠️ Tarea ${i+1}: ingresa la hora de inicio`);
    if(!b.fin)               _markTask(el, 'fin',         `⚠️ Tarea ${i+1}: ingresa la hora fin`);
    if(!b.responsable)       _markTask(el, 'responsable', `⚠️ Tarea ${i+1}: asigna un líder responsable`);
  }

  if(errors.length){
    showToast(errors[0]);
    firstErrEl?.scrollIntoView({behavior:'smooth', block:'center'});
    return;
  }

  const tasks=modalTaskBlocks.map(b=>({
    id:b.id,
    name:b.name,
    lugar:b.lugar,
    tarea:b.tarea,
    habilidad:b.habilidad,
    inicio:b.inicio,
    fin:b.fin,
    indicaciones:b.indicaciones,
    detalles:b.detalles,
    horario:b.horario||modalSchedules[0]||'',
    responsable:b.responsable,
    coliders:[...(b.coliders||[])],
    done:b.done||false,
    assignedPeople:[...b.assignedPeople],
    externals:(b.externals||[]).map(e=>({name:e.name,origin:e.origin})),
    links:[...(b.links||[])],
    products:b.products.map(pr=>({
        ...pr,
        socials:[...(pr.socials||[])],
        publishedSocials:[...(pr.publishedSocials||[])],
        uploaded: pr.uploaded||false
    })),
  }));

  const _prevAct = editingId ? activities.find(x=>x.id===editingId) : null;
  const _prevHistory = _prevAct?._actHistory || [];
  // Detectar QUÉ cambió respecto a la versión anterior
  let _changes = [];
  if(_prevAct) {
    if(_prevAct.activity !== activity) _changes.push('nombre');
    if((_prevAct.tasks||[]).length !== tasks.length) _changes.push(`tareas (${(_prevAct.tasks||[]).length}→${tasks.length})`);
    if(_prevAct.responsable !== responsable) _changes.push('responsable');
    if(_prevAct.prioridad !== document.getElementById('f-prioridad').value) _changes.push('prioridad');
    const _prevDone = (_prevAct.tasks||[]).filter(t=>t.done).length;
    const _newDone  = tasks.filter(t=>t.done).length;
    if(_prevDone !== _newDone) _changes.push(`avance (${_prevDone}→${_newDone} hechas)`);
  }
  const _histEntry = {
    ts: Date.now(), by: currentUser?.name || '?',
    action: editingId ? 'edit' : 'create',
    info: editingId ? (_changes.length ? _changes.join(', ') : 'sin cambios mayores') : `${tasks.length} tarea(s)`
  };

  const obj={
    id:editingId||Date.now().toString(36)+Math.random().toString(36).slice(2,5),
    eventId: eventId,
    activity,
    fecha: ev ? ev.date : todayStr,
    horario:modalSchedules[0]||'',
    horarios:[...modalSchedules],
    extempTime: modalExtempTime||'',
    prioridad:document.getElementById('f-prioridad').value,
    color:document.getElementById('f-color').value,
    department:(document.getElementById('f-department')?.value)||'',
    responsable:responsable,
    notas:document.getElementById('f-notas').value.trim(),
    tasks,
    _actHistory: [..._prevHistory, _histEntry].slice(-50),
    _savedAt: Date.now()
  };

  // Asignados ANTES del guardado (para detectar asignaciones nuevas)
  const _oldAssignees = new Set();
  if(editingId){
    const old = activities.find(x => x.id === editingId);
    if(old) (old.tasks||[]).forEach(t =>
      [t.responsable, ...(t.coliders||[]), ...(t.assignedPeople||[])].filter(Boolean).forEach(n => _oldAssignees.add(n)));
  }

  if(editingId){
    const idx=activities.findIndex(x=>x.id===editingId);
    if(idx>-1)activities[idx]=obj;
    showToast('✏️ Actividad actualizada');
  } else {
    activities.push(obj);
    showToast('✅ Actividad agregada');
    activeEventId = eventId;
  }
  document.getElementById('modal').classList.remove('open');
  editingId=null;
  afterChange();

  // Push a quienes recibieron una asignación NUEVA en esta actividad
  const _newAssignees = new Set();
  tasks.forEach(t => [t.responsable, ...(t.coliders||[]), ...(t.assignedPeople||[])].filter(Boolean).forEach(n => _newAssignees.add(n)));
  const _myName = currentUser?.linkedPerson || currentUser?.name;
  const _added = [..._newAssignees].filter(n => !_oldAssignees.has(n) && n !== _myName);
  if(_added.length && typeof _sendPushToRecipients === 'function'){
    _sendPushToRecipients(_added, '📋 Nueva asignación — DEPCOM MCE', `Tienes una nueva tarea en "${activity}"`);
  }
}

/* ══════════════════════════ TASK CANCELLED ══════════════════════════ */
window.toggleTaskCancelled = function(actId, taskId) {
  if(authLevel < 2) return;
  const a = activities.find(x => x.id === actId);
  if(!a) return;
  const t = a.tasks.find(x => x.id === taskId);
  if(!t) return;
  if(t.cancelled) {
    t.cancelled = false;
    a._savedAt = Date.now();
    afterChange();
    if(document.getElementById('activity-detail-modal')?.classList.contains('open')) openActivityModal(actId, null);
    showToast('↩ Tarea reactivada');
  } else {
    customConfirm('¿Marcar esta tarea como cancelada? No aparecerá como pendiente ni como completada.', () => {
      t.cancelled = true;
      t.done = false;
      a._savedAt = Date.now();
      afterChange();
      if(document.getElementById('activity-detail-modal')?.classList.contains('open')) openActivityModal(actId, null);
      showToast('🚫 Tarea cancelada');
    });
  }
};

/* ══════════════════════════ TASK DONE WIZARD ══════════════════════════ */
function toggleTaskDone(actId,taskId){
  if(authLevel < 2) return;
  const a=activities.find(x=>x.id===actId);
  if(!a)return;
  const t=a.tasks.find(x=>x.id===taskId);
  if(!t)return;

  function _applyDone(newDone) {
    t.done = newDone;
    a._savedAt = Date.now(); // forzar versión más reciente en el merge realtime
    if(!t.history) t.history = [];
    t.history.push({
      action: newDone ? 'completada' : 'reabierta',
      by: currentUser?.name || 'Admin',
      at: Date.now()
    });
    afterChange();
    // Refrescar modal si está abierto (actualiza el checkbox visualmente)
    const modal = document.getElementById('activity-detail-modal');
    if(modal?.classList.contains('open')) openActivityModal(actId, null);
    // Animación visual
    const el = document.getElementById(`ti-${actId}-${taskId}`);
    if(el && newDone) {
      el.classList.remove('task-done-anim');
      void el.offsetWidth;
      el.classList.add('task-done-anim');
      setTimeout(() => el.classList.remove('task-done-anim'), 600);
    }
    // Notificar a admins y coordinador de la actividad al completar
    if(newDone) _notifyTaskDone(a, t);
  }

  if(!t.done) {
    const pendingProds = (t.products||[]).map((p,i)=>({p,i})).filter(x=>!x.p.uploaded);
    if(pendingProds.length > 0) {
      customConfirm('⚠️ Para completar la tarea, debes confirmar primero la publicación de sus entregables pendientes.\n\n¿Deseas revisarlos ahora?', () => {
        showProdConfirmModal(actId, taskId, pendingProds[0].i);
      });
    } else {
      _applyDone(true);
    }
  } else {
    _applyDone(false);
  }
}

function _notifyTaskDone(a, t) {
  if(!('Notification' in window) || Notification.permission !== 'granted') return;
  const whoCompleted = currentUser?.name || 'Alguien';
  const title = `✅ Tarea completada — ${esc(a.activity)}`;
  const body  = `"${t.name}" marcada como completada por ${whoCompleted}`;
  // Notificar solo si quien completó NO es el coordinador (para no notificarse a sí mismo)
  const targets = [...new Set([a.responsable, t.responsable].filter(Boolean))];
  const myName  = currentUser?.linkedPerson || currentUser?.name;
  if(targets.some(n => n !== myName)) {
    _showNotif(title, body);
  }
}

/* ══════════════════════════ RSVP ANTICIPADO ══════════════════════════ */

window.setRSVP = function(actId, taskId, personName, status) {
  const a = activities.find(x => x.id === actId);
  if(!a) return;
  const t = (a.tasks||[]).find(x => x.id === taskId);
  if(!t) return;
  if(!t.rsvp) t.rsvp = {};
  t.rsvp[personName] = { status, at: Date.now() };
  a._savedAt = Date.now();
  afterChange();
  renderCards();
  const sumModal = document.getElementById('resumen-modal');
  if(sumModal?.classList.contains('open')) showMySummary();
};

/* ══════════════════════════ PRODUCT CONFIRMATION LOGIC ══════════════════════════ */
let pendingProd = null;

function showProdConfirmModal(actId, taskId, pi) {
  pendingProd = { actId, taskId, pi };
  const a = activities.find(x => x.id === actId);
  const t = a.tasks.find(x => x.id === taskId);
  const pr = t.products[pi];
  
  const txtEl = document.getElementById('prod-confirm-text');
  const socsEl = document.getElementById('prod-confirm-socs');
  
  if(pr.socials && pr.socials.length > 0) {
    txtEl.innerHTML = `Para el entregable <b>"${pr.name || 'Sin nombre'}"</b>, selecciona las redes en donde ya publicaste:`;
    socsEl.innerHTML = pr.socials.map(k => {
      const s = SOCIAL_NETS.find(x => x.key === k);
      return s ? `<span class="soc-chip soc-active modal-soc-chip clickable ${s.cls.split(' ')[0]}" onclick="this.classList.toggle('selected')" data-key="${k}">${s.label}</span>` : '';
    }).join('');
  } else {
    txtEl.innerHTML = `¿Confirmas que el entregable <b>"${pr.name || 'Sin nombre'}"</b> está listo y/o publicado?`;
    socsEl.innerHTML = "";
  }
  
  document.getElementById('prod-confirm-overlay').classList.add('open');
}

function closeProdConfirm() {
  document.getElementById('prod-confirm-overlay').classList.remove('open');
  pendingProd = null;
}

function submitProdConfirm() {
  if(authLevel < 2) return;
  if(!pendingProd) return;
  const { actId, taskId, pi } = pendingProd;
  const a = activities.find(x => x.id === actId);
  const t = a.tasks.find(x => x.id === taskId);
  const pr = t.products[pi];
  
  const socsEl = document.getElementById('prod-confirm-socs');
  let selectedSocs = [];
  
  if (pr.socials && pr.socials.length > 0) {
      selectedSocs = Array.from(socsEl.querySelectorAll('.modal-soc-chip.selected')).map(el => el.getAttribute('data-key'));
      if (selectedSocs.length < pr.socials.length) {
          showToast("⚠️ Debes seleccionar TODAS las redes especificadas. Si no publicarás en alguna, edita la tarea y elimínala.");
          return; 
      }
  }
  
  pr.publishedSocials = selectedSocs;
  pr.uploaded = true;
  a._savedAt = Date.now();

  closeProdConfirm();
  afterChange();
  // Refrescar modal de actividad abierto para reflejar el check marcado
  if(document.getElementById('activity-detail-modal')?.classList.contains('open')) openActivityModal(actId, null);

  const pendingProds = t.products.map((p, i) => ({p, i})).filter(x => !x.p.uploaded);

  if (pendingProds.length > 0) {
      setTimeout(() => {
          showProdConfirmModal(actId, taskId, pendingProds[0].i);
      }, 300);
  } else if (!t.done) {
      setTimeout(() => {
          customConfirm(`✅ Todos los entregables de "${t.name}" están listos.\n\n¿Deseas marcar la TAREA COMPLETA como terminada?`, () => {
              t.done = true;
              a._savedAt = Date.now();
              afterChange();
              if(document.getElementById('activity-detail-modal')?.classList.contains('open')) openActivityModal(actId, null);
          });
      }, 400);
  }
}

function toggleProductUploaded(actId,taskId,pi){
  if(authLevel < 2) return;
  const a=activities.find(x=>x.id===actId);
  if(!a)return;

  const t=a.tasks.find(x=>x.id===taskId);
  if(!t||!t.products[pi])return;
  
  if(!t.products[pi].uploaded) {
      showProdConfirmModal(actId, taskId, pi);
  } else {
      t.products[pi].uploaded = false;
      t.products[pi].publishedSocials = [];
      a._savedAt = Date.now();
      afterChange();
      // Refrescar modal de actividad abierto para reflejar el check quitado
      if(document.getElementById('activity-detail-modal')?.classList.contains('open')) openActivityModal(actId, null);
  }
}
