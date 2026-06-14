/* ══════════════════════════ VIEW: EVALUACIONES ══════════════════════════ */
function renderEvals() {
    if(currentTab !== 'evals') return;
    const container = document.getElementById('evals-container');

    let evalsByEvent = {};
    let totalCompleted = 0;

    // Filtrar actividades según nivel de autorización
    const myIdentity = currentUser?.linkedPerson || currentUser?.name;
    const myPersonObj = myIdentity ? people.find(p => p.name === myIdentity) : null;
    const myTeamLeader = myPersonObj ? teams.find(t => t.leaderId === myPersonObj.id) : null;
    const evalsActivitiesFilter = authLevel === 2
        ? (a => {
            if(a.responsable === myIdentity) return true;
            // También si es líder de equipo con miembros en la actividad
            if(myTeamLeader) {
                const actPeople = [...new Set([(a.responsable||''), ...(a.tasks||[]).flatMap(t => [t.responsable, ...(t.assignedPeople||[]), ...(t.coliders||[])].filter(Boolean))])];
                const teamMemberNames = (myTeamLeader.memberIds||[]).map(id => people.find(p => p.id === id)?.name).filter(Boolean);
                if(teamMemberNames.some(n => actPeople.includes(n))) return true;
            }
            return false;
          })
        : (() => true);

    events.forEach(e => {
        let evActs = activities.filter(a => a.eventId === e.id).filter(evalsActivitiesFilter);
        let completed = [];
        evActs.forEach(a => {
            if(a.tasks) {
                a.tasks.forEach(t => {
                    if(t.done) completed.push({ a, t });
                });
            }
        });
        if(completed.length > 0) {
            evalsByEvent[e.id] = { event: e, tasks: completed };
            totalCompleted += completed.length;
        }
    });
    
    const ec = document.getElementById('evals-count');
    if(ec) ec.textContent = `Total: ${totalCompleted} Tareas Completadas`;
    
    if(totalCompleted === 0) {
        container.innerHTML = `<div class="empty">
            <div class="empty-icon">⭐</div>
            <div class="empty-text">No hay tareas completadas para evaluar aún</div>
            <div class="empty-sub">Finaliza tareas en la pestaña de Actividades para poder evaluar a tu equipo</div>
        </div>`;
        return;
    }
    
    let html = '';
    const sortedEventIds = Object.keys(evalsByEvent).sort((aId, bId) => new Date(evalsByEvent[bId].event.date) - new Date(evalsByEvent[aId].event.date));
    
    sortedEventIds.forEach(eId => {
        const data = evalsByEvent[eId];
        html += `
        <div style="margin-bottom:20px;">
            <div style="font-family:'Nunito',sans-serif; font-size:.95rem; font-weight:800; color:var(--cyan); margin-bottom: 10px; border-bottom: 1px solid var(--border); padding-bottom:5px;">
                ${esc(data.event.name)} <span style="font-size:.7rem; color:var(--muted); font-weight:600;">(${formatDateStr(data.event.date)})</span>
            </div>
            <div class="cards-grid">
        `;
        
        html += data.tasks.map(item => {
            const {a, t} = item;
            const allPeopleInvolved = [t.responsable, ...(t.assignedPeople || [])].filter(Boolean);
            const uniquePeopleInvolved = [...new Set(allPeopleInvolved)];
            
            const avHTML = uniquePeopleInvolved.map(n => { const pO=people.find(x=>x.name===n); const av=personAv(n); const ini2=pO?.photo?'':ini(_dn(n)); return `<span class="av-chip"><span class="av-mini" style="${av.style}">${ini2}</span>${esc(_dn(n))}</span>`; }).join('');
            
            let isEvaluated = false;
            if(uniquePeopleInvolved.length > 0) {
                const ratedCount = uniquePeopleInvolved.filter(n => {
                    const pObj = people.find(x => x.name === n);
                    return pObj && pObj.evals && pObj.evals.some(e => e.taskId === t.id);
                }).length;
                if(ratedCount > 0) isEvaluated = true; 
            }
            
            return `
            <div class="act-card">
                <div class="card-stripe" style="background:var(--accent)"></div>
                <div class="card-hdr" style="padding-bottom:5px;">
                    <div class="card-title-wrap">
                        <div style="font-size:.65rem; color:var(--cyan); font-weight:800; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:2px;">📁 ${esc(a.activity)}</div>
                        <div class="card-activity">${esc(t.name)}</div>
                    </div>
                </div>
                <div class="task-body" style="display:block; padding-top:5px; border-top:none;">
                    <div class="task-grid">
                        <div class="tg-field full">
                            <div class="tg-lbl">👥 Equipo Involucrado (Líder y Apoyo)</div>
                            <div style="display:flex; flex-wrap:wrap; gap:3px;">${avHTML || '<span class="ai-val muted">Nadie asignado</span>'}</div>
                        </div>
                    </div>
                </div>
                <div class="card-footer" style="justify-content:flex-end;">
                    ${isEvaluated ? `<span style="color:var(--amber); font-size:.7rem; font-weight:800; margin-right:auto;">✅ EVALUADO</span>` : ''}
                    <button class="btn btn-add" style="background:var(--accent); box-shadow:0 3px 14px rgba(74,37,170,.3);" onclick="openEvalModal('${a.id}','${t.id}')">
                        ⭐ Evaluar Equipo
                    </button>
                </div>
            </div>`;
        }).join('');
        
        html += `</div></div>`;
    });
    
    container.innerHTML = html;
}

let evalActId = null;
let evalTaskId = null;

function openEvalModal(actId, taskId) {
    if(authLevel < 3) return;
    evalActId = actId;
    evalTaskId = taskId;
    const a = activities.find(x=>x.id===actId);
    const t = a.tasks.find(x=>x.id===taskId);
    
    const list = document.getElementById('eval-people-list');
    
    const allPeopleInvolved = [t.responsable, ...(t.assignedPeople || [])].filter(Boolean);
    const uniquePeopleInvolved = [...new Set(allPeopleInvolved)];
    
    if(uniquePeopleInvolved.length === 0) {
        list.innerHTML = '<p style="font-size:.8rem; color:var(--muted); text-align:center;">Nadie fue asignado a esta tarea.</p>';
    } else {
        const STAR_LABELS = ['','⚠️ Necesita mejorar','📉 Por debajo de lo esperado','👍 Cumplió parcialmente','🌟 Buen desempeño, con áreas de mejora','⭐ Excelente desempeño'];
        list.innerHTML = uniquePeopleInvolved.map((n, i) => {
            const pObj = people.find(x=>x.name === n);
            let prevRating = 0, prevJustif = '';
            if(pObj?.evals) {
                const ev = pObj.evals.find(e => e.taskId === taskId);
                if(ev) { prevRating = ev.rating; prevJustif = ev.justification || ''; }
            }
            const av = personAv(n);
            const avInitial = pObj?.photo ? '' : ini(_dn(n));
            const avStyle = `width:38px;height:38px;border-radius:50%;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;font-family:'Nunito',sans-serif;font-weight:800;font-size:.9rem;background-size:cover;${av.style}`;
            const stars = Array.from({length:5},(_,s)=>
                `<span class="${s+1<=prevRating?'on':''}" onclick="setListStar('eval-stars-${i}',${s+1})">★</span>`
            ).join('');
            const roleLabel = n === t.responsable ? '👑 Líder de tarea' : '👥 Apoyo';
            const showJustif = prevRating > 0 && prevRating < 5;
            return `
            <div class="eval-pc" id="eval-pc-${i}">
              <div class="eval-pc-hdr">
                <span style="${avStyle}">${avInitial}</span>
                <div class="eval-pc-info">
                  <div class="eval-pc-name">${esc(_dn(n))}</div>
                  <div class="eval-pc-role">${roleLabel}</div>
                </div>
                ${!pObj ? `<span style="font-size:.58rem;color:var(--red);background:rgba(251,99,126,.12);border:1px solid rgba(251,99,126,.25);padding:2px 6px;border-radius:6px;white-space:nowrap;">Sin perfil</span>` : ''}
              </div>
              ${pObj ? `
              <div class="eval-stars-row" id="eval-stars-${i}" data-name="${esc(n.replace(/'/g,"\\'"))}" data-val="${prevRating}">${stars}</div>
              <div class="eval-star-label ${prevRating>0?'has-val':''}" id="eval-label-${i}">${STAR_LABELS[prevRating]||'Toca para calificar'}</div>
              <div class="eval-justif-box ${showJustif?'show':''}" id="eval-justif-box-${i}">
                <label>¿Por qué esta calificación?</label>
                <textarea id="eval-justif-${i}" data-name="${esc(n.replace(/'/g,"\\'"))}" placeholder="Explica brevemente el motivo de la nota…">${esc(prevJustif)}</textarea>
              </div>` : `<div class="eval-no-profile">Agrega el perfil primero para poder evaluarlo.</div>`}
            </div>`;
        }).join('');
    }

    document.getElementById('eval-modal').classList.add('open');
}

const STAR_LABELS = ['','⚠️ Necesita mejorar','📉 Por debajo de lo esperado','👍 Cumplió parcialmente','🌟 Buen desempeño, con áreas de mejora','⭐ Excelente desempeño'];

function setListStar(containerId, n) {
    const cont = document.getElementById(containerId);
    if(!cont) return;
    cont.setAttribute('data-val', n);
    cont.querySelectorAll('span').forEach((sp, idx) => sp.classList.toggle('on', idx < n));
    const i = containerId.replace('eval-stars-','');
    const labelEl = document.getElementById('eval-label-' + i);
    if(labelEl) { labelEl.textContent = STAR_LABELS[n] || 'Toca para calificar'; labelEl.classList.toggle('has-val', n > 0); }
    const justBox = document.getElementById('eval-justif-box-' + i);
    if(justBox) justBox.classList.toggle('show', n > 0 && n < 5);
    if(n >= 5) { const ta = document.getElementById('eval-justif-' + i); if(ta) ta.value = ''; }
}

function saveEvaluations() {
    if(authLevel < 3) return;
    const list = document.getElementById('eval-people-list');
    const containers = list.querySelectorAll('.eval-stars-row');
    
    let savedAny = false;
    let validationFailed = false;
    containers.forEach((c, idx) => {
        if(validationFailed) return;
        let name = c.getAttribute('data-name');
        let rating = parseInt(c.getAttribute('data-val'));
        let justification = document.getElementById('eval-justif-' + idx)?.value || '';
        if(rating > 0 && rating < 5 && !justification.trim()) {
            showToast('⚠️ Escribe una justificación para calificaciones menores a 5 estrellas');
            validationFailed = true;
            return;
        }
        if(rating > 0) {
            let pIdx = people.findIndex(x=>x.name === name);
            if(pIdx > -1) {
                people[pIdx].evals = (people[pIdx].evals||[]).filter(e => e.taskId !== evalTaskId);
                people[pIdx].evals.push({ actId: evalActId, taskId: evalTaskId, rating: rating, justification: justification.trim(), date: todayStr });
                savedAny = true;
            }
        }
    });
    if(validationFailed) return;

    if(savedAny) {
        showToast('✅ Evaluaciones guardadas exitosamente');
        afterChange();
    }
    document.getElementById('eval-modal').classList.remove('open');
}
