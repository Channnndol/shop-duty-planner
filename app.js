import {initialRoster,monthKey,shiftMonth,daysInMonth,pad,weekday,holidayName,available,generate,ensureMonth,validateState,swapAssignments,visibleSwap} from './engine.js?v=2';
const $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const STORAGE='shop-duty-planner-v1', week=['일','월','화','수','목','금','토'];
const palette=[['#edf3e8','#63815a'],['#eef1e9','#758457'],['#f8f0e4','#a88a50'],['#eef1f8','#7384a8'],['#f4edf5','#9a77a1'],['#eaf3ee','#5c9078'],['#f9eeea','#ad8170'],['#edf2f3','#688c97'],['#f5f1e5','#9a8e5b']];
let holidays={},state,history=[],activeTab='rules',toastTimer,storageOk=true;
let swapMode=false,swapSource=null,dragState=null,suppressClickUntil=0;
const cur=()=>state.months[state.current],result=()=>generate(state.current,cur(),holidays),person=id=>cur().roster.find(p=>p.id===id),color=id=>palette[Math.max(0,cur().roster.findIndex(p=>p.id===id))%palette.length];
const title=key=>`${Number(key.slice(0,4))}년 ${Number(key.slice(5))}월`;
const nameOf=id=>person(id)?.name||'미배정';
const opts=(selected,empty='')=>(empty?`<option value="">${esc(empty)}</option>`:'')+cur().roster.map(p=>`<option value="${esc(p.id)}" ${selected===p.id?'selected':''}>${esc(p.name)}</option>`).join('');
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),4000);}
function persist(){try{localStorage.setItem(STORAGE,JSON.stringify(state));storageOk=true;}catch{storageOk=false;}$('#saveState').textContent=storageOk?'이 기기에 자동 저장':'저장 실패 · 백업해 주세요';}
function change(fn,message){history.push(JSON.stringify(state));if(history.length>30)history.shift();fn();persist();render();if(message)toast(message);}
function modal(label,body){$('#modalTitle').textContent=label;$('#modalBody').innerHTML=body;$('#modal').showModal();}
function close(){ $('#modal').close(); }
function formError(message){let el=$('#formError');if(!el){el=document.createElement('p');el.id='formError';el.className='error';$('#modalBody').append(el);}el.textContent=message;}
function navigate(key){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(key))return;if(!holidays[key.slice(0,4)]){toast('해당 연도의 공휴일 자료가 없습니다. 현재 지원 연도 내에서 선택해 주세요.');$('#monthInput').value=state.current;return;}ensureMonth(key,state,holidays);state.current=key;persist();render();}
function render(){
 cancelDrag();swapMode=false;swapSource=null;
 const m=cur(),r=result(),key=state.current,working=r.days.filter(d=>d.kind!=='off'),assigned=working.filter(d=>d.id),fixed=assigned.filter(d=>d.kind==='fixed'),modified=working.filter(d=>d.kind==='manual'),issues=working.filter(d=>d.warning),prev=state.months[shiftMonth(key,-1)];
 $('#monthTitle').textContent=`${key.slice(0,4)}. ${key.slice(5)}`;$('#monthInput').value=key;$('#calendarTitle').textContent=`${title(key)} 업무 달력`;$('#monthSummary').textContent=`근무일 ${working.length}일 · 고정 ${fixed.length}일 · 직접 수정 ${modified.length}일`;
 $('#undoBtn').disabled=!history.length;
 $('#orderList').innerHTML=m.roster.map((p,i)=>`${i?'<span class="arrow" aria-hidden="true">›</span>':''}<div class="person-chip ${p.id===m.start?'next':''} ${!r.pool.includes(p.id)?'excluded':''}"><span class="number">${pad(i+1)}</span>${esc(p.name)}${!r.pool.includes(p.id)?'<span title="일반 순환 제외">°</span>':''}</div>`).join('');
 $('#startInfo').textContent=`순환 시작 ${nameOf(r.pool.includes(m.start)?m.start:r.pool[0])} → 다음 달 ${r.next?nameOf(r.next):'순환 담당자 없음'}`;
 $('#startSelect').innerHTML=r.pool.length?r.pool.map(id=>`<option value="${esc(id)}" ${id===(r.pool.includes(m.start)?m.start:r.pool[0])?'selected':''}>${esc(nameOf(id))}</option>`).join(''):'<option value="">순환 담당자 없음</option>';
 $('#startSelect').disabled=!r.pool.length;
 const priorNext=prev?generate(shiftMonth(key,-1),prev,holidays).nextOrder.find(id=>r.pool.includes(id)):null;
 $('#carryNote').textContent=prev?(m.startMode==='carry'?(priorNext&&priorNext!==m.start?'지난달 변경사항이 있어요. 아래 버튼으로 순번을 갱신하세요.':'지난달 마지막 순환 다음 순번을 이어받았어요.'):'시작 담당자를 직접 지정한 달입니다.'):'이전 달 기록이 없어 첫 번째 순번으로 시작합니다.';
 $('#carryBtn').disabled=!prev;$('#excludeFixed').checked=m.excludeFixed;
 $('#fixedFields').innerHTML=[1,2,3,4,5].map(d=>`<div class="fixed-row"><label for="fixed${d}">${week[d]}</label><select id="fixed${d}" data-fixed="${d}" aria-label="${week[d]}요일 고정 담당자">${opts(m.fixed[d],'순환 배정')}</select></div>`).join('');
 $('#fixedFields').querySelectorAll('select').forEach(el=>el.onchange=()=>change(()=>{if(el.value)m.fixed[el.dataset.fixed]=el.value;else delete m.fixed[el.dataset.fixed];normalizeStart();},'고정 배정 규칙을 적용했어요.'));
 const first=weekday(key+'-01'),today=new Date(),todayKey=monthKey(today)+'-'+pad(today.getDate());
 let html=week.map(w=>`<div class="weekday">${w}</div>`).join('')+'<div class="day blank" aria-hidden="true"></div>'.repeat(first);
 html+=r.days.map(d=>{const [bg,fg]=color(d.id),swap=visibleSwap(m,d),detail=swap?`${Number(swap.otherDate.slice(8))}일과 최근 교환: ${swap.fromName} ↔ ${swap.toName}`:'';return `<button class="day ${d.kind==='off'?'off':''} ${d.weekday===0?'sun':''} ${d.weekday===6?'sat':''} ${d.holiday?'holiday':''} ${d.date===todayKey?'today':''} ${swap?'swapped':''}" data-date="${d.date}" data-assigned="${Boolean(d.id)}" aria-label="${esc(d.date+' '+week[d.weekday]+'요일 '+(d.holiday||'')+' '+(d.id?nameOf(d.id):d.kind==='off'?'휴무':'미배정')+(d.note?' '+d.note:'')+(detail?' · '+detail:''))}" ${d.date===todayKey?'aria-current="date"':''}><span class="date-num">${d.day}</span>${d.warning?'<span class="conflict-mark" title="'+esc(d.warning)+'">!</span>':''}${d.holiday?`<span class="holiday-label">${esc(d.holiday)}</span>`:''}${d.id?`<span class="assignment ${d.kind}" data-swap-handle="${d.date}" title="담당자를 다른 날짜로 끌어 맞교환" style="--person-bg:${bg};--person-fg:${fg}"><i class="person-dot"></i><span>${esc(nameOf(d.id))}</span>${d.kind!=='rotation'?`<span class="mini-kind">${swap?'교환':d.kind==='fixed'?'고정':'수정'}</span>`:''}</span>`:d.kind!=='off'?'<span class="unassigned">미배정</span>':''}${swap?`<span class="swap-badge" title="${esc(detail)}"><span>↔ ${Number(swap.otherDate.slice(8))}일과 교환</span><span>${esc(swap.fromName)} ↔ ${esc(swap.toName)}</span></span>`:''}${d.note?`<span class="cell-note">${esc(d.note)}</span>`:''}</button>`;}).join('');
 html+='<div class="day blank" aria-hidden="true"></div>'.repeat((7-(first+r.days.length)%7)%7);$('#calendar').innerHTML=html;
 $('#calendar').querySelectorAll('[data-date]').forEach(el=>el.onclick=()=>{if(performance.now()<suppressClickUntil)return;if(swapMode)selectSwapDate(el.dataset.date);else editDay(el.dataset.date);});
 $('#calendar').querySelectorAll('[data-swap-handle]').forEach(el=>{el.onpointerdown=startDrag;el.ondragstart=e=>e.preventDefault();});updateSwapMode();
 $('#issueCount').textContent=issues.length?`확인 필요 ${issues.length}일`:'';$('#totalDays').textContent=`${assigned.length}일 배정`;
 const counts=m.roster.map(p=>({...p,n:assigned.filter(d=>d.id===p.id).length})),max=Math.max(1,...counts.map(p=>p.n));
 $('#distribution').innerHTML=counts.map(p=>`<div class="distribution-row"><span>${esc(p.name)}</span><div class="bar-track"><div class="bar-fill" style="width:${p.n/max*100}%;background:${color(p.id)[1]}66"></div></div><strong>${p.n}일</strong></div>`).join('');
 $('#leaveBadge').textContent=m.leave.length?`(${m.leave.length})`:'';
 $('#leaveList').innerHTML=m.leave.length?m.leave.map((l,i)=>`<div class="list-entry"><div>${esc(nameOf(l.id))}<small>${l.from.slice(5).replace('-','/')} – ${l.to.slice(5).replace('-','/')}</small></div><button class="remove-btn" data-remove-leave="${i}" aria-label="${esc(nameOf(l.id))} 연차 삭제">×</button></div>`).join(''):'<div class="empty-state">등록된 연차가 없어요.<br>쉬는 날은 순번에서 자동으로 건너뜁니다.</div>';
 $('#leaveList').querySelectorAll('[data-remove-leave]').forEach(el=>el.onclick=()=>change(()=>m.leave.splice(Number(el.dataset.removeLeave),1),'연차를 삭제했어요.'));
 const hdays=r.days.filter(d=>d.holiday||Object.hasOwn(m.holidays,d.date));
 $('#holidayStatus').textContent=`대한민국 공휴일 적용 · 이번 달 ${r.days.filter(d=>d.holiday).length}일`;
 $('#holidayList').innerHTML=hdays.length?hdays.map(d=>`<div class="list-entry"><div>${esc(d.holiday||'근무일로 변경')}<small>${d.date.slice(5).replace('-','/')} (${week[d.weekday]})${Object.hasOwn(m.holidays,d.date)?' · 직접 설정':''}</small></div><button class="text-btn" data-edit-holiday="${d.date}">편집</button></div>`).join(''):'<div class="empty-state">이번 달 공휴일이 없습니다.</div>';
 $('#holidayList').querySelectorAll('[data-edit-holiday]').forEach(el=>el.onclick=()=>editHoliday(el.dataset.editHoliday));
}
function updateSwapMode(){
 $('#swapModeBtn').setAttribute('aria-pressed',String(swapMode));$('#swapModeBtn').textContent=swapMode?'교환 취소':'⇄ 일정 맞교환';
 $('#calendar').classList.toggle('swap-mode',swapMode);$('#swapInstructions').hidden=!swapMode;
 $('#swapInstructions').textContent=swapSource?`${Number(swapSource.slice(8))}일 ${nameOf(result().days.find(d=>d.date===swapSource)?.id)} 선택 · 맞바꿀 날짜를 선택하세요. (Esc로 취소)`:'맞교환할 두 날짜를 차례로 선택하세요. (Esc로 취소)';
 $('#calendar').querySelectorAll('[data-date]').forEach(el=>{el.classList.toggle('swap-selected',el.dataset.date===swapSource);if(swapMode)el.setAttribute('aria-pressed',String(el.dataset.date===swapSource));else el.removeAttribute('aria-pressed');});
}
function selectSwapDate(date){
 if(!result().days.find(d=>d.date===date)?.id)return toast('담당자가 배정된 날짜를 선택해 주세요.');
 if(date===swapSource){swapSource=null;updateSwapMode();return;}
 if(!swapSource){swapSource=date;updateSwapMode();return;}
 performSwap(swapSource,date);
}
function performSwap(from,to){
 const next=structuredClone(cur()),outcome=swapAssignments(state.current,next,holidays,from,to);
 if(!outcome.ok){toast(outcome.error);return;}
 change(()=>{state.months[state.current]=next;},`${outcome.fromDay}일 ${outcome.fromName} ↔ ${outcome.toDay}일 ${outcome.toName} 교환 완료`);
 $(`[data-date="${to}"]`)?.focus({preventScroll:true});
}
function cancelDrag(){
 if(!dragState)return;
 const drag=dragState;dragState=null;cancelAnimationFrame(drag.frame);drag.ghost?.remove();
 if(drag.active)suppressClickUntil=performance.now()+450;
 if(drag.handle.hasPointerCapture(drag.pointerId))drag.handle.releasePointerCapture(drag.pointerId);
 document.body.classList.remove('is-swapping');
 $('#calendar').querySelectorAll('.drag-source,.drop-target,.drop-invalid').forEach(el=>el.classList.remove('drag-source','drop-target','drop-invalid'));
}
function locateDrop(){
 const drag=dragState;if(!drag?.active)return;
 const target=document.elementFromPoint(drag.x,drag.y)?.closest('#calendar [data-date]');
 drag.target=target?.dataset.date||null;
 $('#calendar').querySelectorAll('.drop-target,.drop-invalid').forEach(el=>el.classList.remove('drop-target','drop-invalid'));
 if(target&&drag.target!==drag.from)target.classList.add(target.dataset.assigned==='true'?'drop-target':'drop-invalid');
 drag.ghost.style.left=Math.min(window.innerWidth-180,Math.max(8,drag.x+12))+'px';drag.ghost.style.top=Math.max(8,drag.y-46)+'px';
}
function dragScroll(){
 const drag=dragState;if(!drag?.active)return;
 const margin=65,delta=drag.y<margin?-9:drag.y>innerHeight-margin?9:0;
 if(delta){window.scrollBy(0,delta);locateDrop();}
 drag.frame=requestAnimationFrame(dragScroll);
}
function startDrag(e){
 if(e.button!==0||!e.isPrimary||swapMode)return;
 cancelDrag();const handle=e.currentTarget;
 dragState={handle,pointerId:e.pointerId,from:handle.dataset.swapHandle,startX:e.clientX,startY:e.clientY,x:e.clientX,y:e.clientY,active:false,target:null,frame:0};
 handle.setPointerCapture(e.pointerId);
}
function moveDrag(e){
 const drag=dragState;if(!drag||drag.pointerId!==e.pointerId)return;
 drag.x=e.clientX;drag.y=e.clientY;
 if(!drag.active&&Math.hypot(drag.x-drag.startX,drag.y-drag.startY)<8)return;
 e.preventDefault();
 if(!drag.active){drag.active=true;drag.handle.closest('.day').classList.add('drag-source');document.body.classList.add('is-swapping');drag.ghost=document.createElement('div');drag.ghost.className='swap-ghost';drag.ghost.textContent=`⇄ ${Number(drag.from.slice(8))}일 ${nameOf(result().days.find(d=>d.date===drag.from).id)}`;document.body.append(drag.ghost);drag.frame=requestAnimationFrame(dragScroll);}
 locateDrop();
}
function endDrag(e){
 const drag=dragState;if(!drag||drag.pointerId!==e.pointerId)return;
 if(drag.active){drag.x=e.clientX;drag.y=e.clientY;locateDrop();e.preventDefault();}
 const {from,target,active}=drag;cancelDrag();
 if(active&&target&&from!==target)performSwap(from,target);
}
function normalizeStart(){const r=result();if(!r.pool.includes(cur().start))cur().start=r.pool[0]||'';}
function editDay(date){
 const d=result().days.find(d=>d.date===date),m=cur(),off=d.kind==='off';
 modal(`${Number(date.slice(5,7))}월 ${d.day}일 ${week[d.weekday]}요일`, `<p class="modal-intro">${off?esc(d.holiday||'주말')+' · 담당자를 배정하지 않는 날입니다.':'이 날짜만 수정합니다. 다른 날짜와 다음 달 순환 순번은 유지됩니다.'}</p>${d.warning?`<p class="warning-box">${esc(d.warning)}</p>`:''}<form id="dayForm">${!off?`<div class="form-row"><label class="field-label" for="dayPerson">담당자</label><select id="dayPerson"><option value="">미배정</option>${m.roster.map(p=>`<option value="${esc(p.id)}" ${p.id===d.id?'selected':''} ${!available(m,p.id,date)?'disabled':''}>${esc(p.name)}${!available(m,p.id,date)?' (연차)':''}</option>`).join('')}</select></div>`:''}<div class="form-row"><label class="field-label" for="dayNote">메모 <span class="optional">달력·복사본에 표시</span></label><textarea id="dayNote" maxlength="100" rows="3" placeholder="인수인계나 변경 사유를 남겨 주세요">${esc(d.note)}</textarea></div><div class="modal-actions">${Object.hasOwn(m.overrides,date)?'<button type="button" class="text-btn" id="resetDay">자동 배정으로 복원</button>':''}<span class="spacer"></span><button type="button" class="btn" id="cancelDay">취소</button><button class="btn primary" type="submit">저장</button></div></form>`);
 $('#cancelDay').onclick=close;if($('#resetDay'))$('#resetDay').onclick=()=>{change(()=>{delete m.overrides[date];if(m.swaps)delete m.swaps[date];},'자동 배정으로 복원했어요.');close();};
 $('#dayForm').onsubmit=e=>{e.preventDefault();const id=$('#dayPerson')?.value||null,note=$('#dayNote').value.trim();if(id&&!available(m,id,date))return formError('연차가 등록된 담당자는 배정할 수 없습니다.');change(()=>{if(!off){m.overrides[date]=id;if(id!==d.id&&m.swaps)delete m.swaps[date];}if(note)m.notes[date]=note;else delete m.notes[date];},'날짜별 변경사항을 저장했어요.');close();};
}
function editLeave(){
 const key=state.current;
 modal('연차 · 배정 제외 등록',`<p class="modal-intro">해당 기간에는 순환 배정에서 제외됩니다. 고정 담당자의 연차는 다른 순환 담당자가 대신합니다.</p><form id="leaveForm"><div class="form-row"><label class="field-label" for="leavePerson">담당자</label><select id="leavePerson">${opts('')}</select></div><div class="form-grid"><div><label class="field-label" for="leaveFrom">시작일</label><input type="date" id="leaveFrom" value="${key}-01" min="${key}-01" max="${key}-${daysInMonth(key)}" required></div><div><label class="field-label" for="leaveTo">종료일</label><input type="date" id="leaveTo" value="${key}-01" min="${key}-01" max="${key}-${daysInMonth(key)}" required></div></div><p class="hint">이번 달에 적용됩니다. 다음 달까지 이어지는 연차는 다음 달에도 등록해 주세요.</p><div class="modal-actions"><button class="btn primary" type="submit">연차 등록</button></div></form>`);
 $('#leaveFrom').onchange=()=>{if($('#leaveTo').value<$('#leaveFrom').value)$('#leaveTo').value=$('#leaveFrom').value;};
 $('#leaveForm').onsubmit=e=>{e.preventDefault();const id=$('#leavePerson').value,from=$('#leaveFrom').value,to=$('#leaveTo').value;if(from>to)return formError('종료일은 시작일 이후여야 합니다.');change(()=>cur().leave.push({id,from,to}),'연차를 반영했어요. 수동 배정과 겹치면 달력에 표시됩니다.');close();};
}
function editHoliday(date=''){
 const m=cur(),key=state.current,existing=date?holidayName(date,m,holidays):'';
 modal(date?'휴일 설정 변경':'별도 휴무 추가',`<p class="modal-intro">임시공휴일이나 회사 휴무일을 추가하세요. 공휴일을 근무일로 바꿀 수도 있습니다. 주말은 항상 제외됩니다.</p><form id="holidayForm"><div class="form-row"><label class="field-label" for="holidayDate">날짜</label><input id="holidayDate" type="date" value="${date||key+'-01'}" min="${key}-01" max="${key}-${daysInMonth(key)}" required ${date?'readonly':''}></div><div class="form-row"><label class="field-label" for="holidayName">휴무 이름</label><input id="holidayName" value="${esc(existing)}" maxlength="40" placeholder="예: 창립기념일" required></div><label class="check-row"><input type="checkbox" id="workdayCheck" ${date&&!existing?'checked':''}>이 날짜를 근무일로 지정</label><div class="modal-actions">${date&&Object.hasOwn(m.holidays,date)?'<button type="button" class="text-btn" id="restoreHoliday">기본 공휴일로 복원</button>':''}<span class="spacer"></span><button class="btn primary" type="submit">적용</button></div></form>`);
 const toggle=()=>{$('#holidayName').disabled=$('#workdayCheck').checked;$('#holidayName').required=!$('#workdayCheck').checked;};toggle();$('#workdayCheck').onchange=toggle;
 if($('#restoreHoliday'))$('#restoreHoliday').onclick=()=>{change(()=>delete m.holidays[date],'기본 공휴일 설정으로 복원했어요.');close();};
 $('#holidayForm').onsubmit=e=>{e.preventDefault();const dt=$('#holidayDate').value,name=$('#workdayCheck').checked?'':$('#holidayName').value.trim();if(!$('#workdayCheck').checked&&!name)return formError('휴무 이름을 입력해 주세요.');change(()=>m.holidays[dt]=name,'휴일 설정을 적용했어요.');close();};
}
function editTeam(){
 let draft=structuredClone(cur().roster);
 modal('담당자와 순번 편집',`<p class="modal-intro">위에서 아래 순서대로 순환합니다. 변경은 <strong>이번 달과 앞으로 새로 만드는 달</strong>에 적용되며, 이미 작성한 다른 달은 유지됩니다.</p><div id="teamRows"></div><button class="text-btn" id="addPerson">+ 담당자 추가</button><p class="hint">동명이인은 팀·직책을 덧붙여 구분해 주세요. 최대 50명까지 등록할 수 있어요.</p><div class="modal-actions"><button class="btn" id="cancelTeam">취소</button><button class="btn primary" id="saveTeam">순번 저장</button></div>`);
 const draw=()=>{ $('#teamRows').innerHTML=draft.map((p,i)=>`<div class="team-row"><span>${pad(i+1)}</span><input data-name="${i}" value="${esc(p.name)}" aria-label="${i+1}번째 담당자 이름" maxlength="30"><button data-up="${i}" aria-label="${esc(p.name)} 위로" ${i===0?'disabled':''}>↑</button><button data-down="${i}" aria-label="${esc(p.name)} 아래로" ${i===draft.length-1?'disabled':''}>↓</button><button data-delete="${i}" aria-label="${esc(p.name)} 삭제" ${draft.length===1?'disabled':''}>×</button></div>`).join('');$('#teamRows').querySelectorAll('input').forEach(el=>el.oninput=()=>draft[Number(el.dataset.name)].name=el.value);$('#teamRows').querySelectorAll('[data-up],[data-down],[data-delete]').forEach(el=>el.onclick=()=>{if(el.dataset.delete!==undefined)draft.splice(Number(el.dataset.delete),1);else {const i=Number(el.dataset.up??el.dataset.down),j=i+(el.dataset.up!==undefined?-1:1);[draft[i],draft[j]]=[draft[j],draft[i]];}draw();});};draw();
 $('#addPerson').onclick=()=>{if(draft.length>=50)return toast('담당자는 최대 50명까지 등록할 수 있어요.');draft.push({id:crypto.randomUUID(),name:''});draw();$('#teamRows').lastElementChild.querySelector('input').focus();};$('#cancelTeam').onclick=close;
 $('#saveTeam').onclick=()=>{draft.forEach(p=>p.name=p.name.trim());if(draft.some(p=>!p.name))return formError('담당자 이름을 모두 입력해 주세요.');if(new Set(draft.map(p=>p.name)).size!==draft.length)return formError('같은 이름은 구분할 수 있도록 다르게 입력해 주세요.');change(()=>{const m=cur(),ids=new Set(draft.map(p=>p.id));m.roster=structuredClone(draft);state.roster=structuredClone(draft);m.fixed=Object.fromEntries(Object.entries(m.fixed).filter(([,id])=>ids.has(id)));m.leave=m.leave.filter(l=>ids.has(l.id));for(const [d,id]of Object.entries(m.overrides))if(id&&!ids.has(id)){m.overrides[d]=null;if(m.swaps)delete m.swaps[d];}normalizeStart();},'담당자와 순번을 저장했어요. 삭제된 담당자의 수동 배정은 미배정으로 표시됩니다.');close();};
}
function shareData(){
 const m=cur(),r=result(),key=state.current,order=m.roster.map(p=>p.name).join(' → '),fixed=Object.entries(m.fixed).map(([d,id])=>`${week[d]}: ${nameOf(id)}`).join(', '),intro=`${title(key)} SHOP장 업무 스케줄\nshop장 업무 담당자 순번\n${order}\n순환 시작: ${nameOf(r.pool.includes(m.start)?m.start:r.pool[0])}${fixed?'\n고정 배정: '+fixed:''}${m.excludeFixed&&fixed?' (일반 순환 제외)':''}`;
 const text=intro+'\n\n'+r.days.map(d=>`${d.day}일 (${week[d.weekday]}) ${d.holiday|| (d.kind==='off'?'휴무':nameOf(d.id))}${d.kind==='fixed'?' [고정]':d.kind==='manual'&&!visibleSwap(m,d)?' [수정]':''}${d.note?' · '+d.note:''}${d.warning?' · 확인: '+d.warning:''}`).join('\n');
 const start=weekday(key+'-01'),cells=Array(start).fill(null).concat(r.days);while(cells.length%7)cells.push(null);
 let table='<table style="border-collapse:collapse;table-layout:fixed;width:100%;font-family:Arial,sans-serif"><thead><tr>'+week.map((w,i)=>`<th style="border:1px solid #dce3dc;padding:10px;background:${i===0||i===6?'#fff2f3;color:#e21c2a':'#f3f6ef'}">${w}</th>`).join('')+'</tr></thead><tbody>';
 for(let i=0;i<cells.length;i+=7)table+='<tr>'+cells.slice(i,i+7).map(d=>`<td style="border:1px solid #dce3dc;padding:10px;vertical-align:top;width:14.28%;height:72px;${d?.kind==='off'?'background:#fff2f3;color:#e21c2a;':''}">${d?`<strong>${d.day}</strong><br>${esc(d.holiday|| (d.kind==='off'?'':nameOf(d.id)))}${d.kind==='fixed'?' (고정)':d.kind==='manual'&&!visibleSwap(m,d)?' (수정)':''}${d.note?'<br><small>'+esc(d.note)+'</small>':''}${d.warning?'<br><small>'+esc(d.warning)+'</small>':''}`:''}</td>`).join('')+'</tr>';
 table+='</tbody></table>';
 return {text,html:`<div><h2>${title(key)} SHOP장 업무 스케줄</h2><p><strong>shop장 업무 담당자 순번</strong><br>${esc(order)}</p><p>순환 시작: ${esc(nameOf(r.pool.includes(m.start)?m.start:r.pool[0]))}${fixed?'<br>고정 배정: '+esc(fixed)+(m.excludeFixed?' (일반 순환 제외)':''):''}</p>${table}</div>`};
}
function preparePrint(){
 let sheet=$('#printSheet');
 if(!sheet){sheet=document.createElement('section');sheet.id='printSheet';document.body.append(sheet);}
 sheet.innerHTML=shareData().html;
 sheet.classList.add('print-measure');
 try{
  const page=sheet.firstElementChild,table=sheet.querySelector('table');
  // Fit unusually long rosters and notes without cutting off their content.
  for(let step=20;step>=10;step--){
   sheet.style.setProperty('--print-scale',String(step/20));
   if(page.scrollHeight<=page.clientHeight+1&&table.getBoundingClientRect().bottom<=page.getBoundingClientRect().bottom+1)break;
  }
 }finally{sheet.classList.remove('print-measure');}
}
function printSchedule(){preparePrint();window.print();}
async function copyTable(){
 const {text,html}=shareData();
 try {if(navigator.clipboard?.write&&typeof ClipboardItem!=='undefined'){await navigator.clipboard.write([new ClipboardItem({'text/html':new Blob([html],{type:'text/html'}),'text/plain':new Blob([text],{type:'text/plain'})})]);toast('순번과 달력을 복사했어요. 메일·문서에 붙여넣으세요.');return;}}catch{}
 try{await navigator.clipboard.writeText(text);toast('텍스트로 복사했어요. 표 형식이 필요하면 이미지 저장을 이용하세요.');}catch{modal('복사할 내용',`<p class="modal-intro">이 브라우저에서 자동 복사를 지원하지 않습니다. 아래 내용을 선택해 복사하거나 이미지로 저장하세요.</p><textarea id="copyFallback" rows="12" readonly>${esc(text)}</textarea><div class="modal-actions"><button class="btn primary" id="selectCopy">전체 선택</button></div>`);$('#selectCopy').onclick=()=>{$('#copyFallback').focus();$('#copyFallback').select();};}
}
function download(blob,filename){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
async function calendarImage(){
 await document.fonts.ready;
 const m=cur(),r=result(),key=state.current,W=1400,p=55,cw=(W-p*2)/7,first=weekday(key+'-01'),rows=Math.ceil((first+r.days.length)/7),ch=172,orderLines=Math.ceil(m.roster.length/9),top=185+orderLines*44,H=top+47+rows*ch+60;
 const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,W,H);ctx.fillStyle='#216956';ctx.font='600 17px "Noto Sans KR",sans-serif';ctx.fillText('SHOP SCHEDULE',p,52);ctx.fillStyle='#203d35';ctx.font='700 34px "Noto Sans KR",sans-serif';ctx.fillText(`${title(key)} SHOP장 업무 스케줄`,p,104);ctx.font='600 20px "Noto Sans KR",sans-serif';ctx.fillText('shop장 업무 담당자 순번',p,151);
 const wrap=(text,x,y,width,font,maxLines=2)=>{ctx.font=font;let line='',lineNo=0;for(const char of text){if(ctx.measureText(line+char).width>width&&line){ctx.fillText(line,x,y+lineNo*23);lineNo++;line='';if(lineNo>=maxLines)return;}line+=char;}if(line&&lineNo<maxLines)ctx.fillText(line,x,y+lineNo*23);};
 m.roster.forEach((member,i)=>{ctx.fillStyle='#54755d';ctx.font='400 18px "Noto Sans KR",sans-serif';const cell=(W-p*2)/9;wrap(`${i+1}. ${member.name}`,p+(i%9)*cell,187+Math.floor(i/9)*44,cell-12,'400 18px "Noto Sans KR",sans-serif',1);});
 ctx.fillStyle='#819384';ctx.font='400 15px "Noto Sans KR",sans-serif';const fixed=Object.entries(m.fixed).map(([d,id])=>`${week[d]} ${nameOf(id)}`).join(' / ');wrap(`순환 시작: ${nameOf(r.pool.includes(m.start)?m.start:r.pool[0])}${fixed?'   ·   고정: '+fixed+(m.excludeFixed?' (순환 제외)':''):''}`,p,top-15,W-p*2,'400 15px "Noto Sans KR",sans-serif',1);
 for(let c=0;c<7;c++){ctx.fillStyle=c===0||c===6?'#fff2f3':'#f3f6ef';ctx.fillRect(p+c*cw,top,cw,42);ctx.fillStyle=c===0||c===6?'#e21c2a':'#6b806f';ctx.font='500 17px "Noto Sans KR",sans-serif';ctx.fillText(week[c],p+c*cw+cw/2-8,top+28);}
 r.days.forEach(d=>{const at=first+d.day-1,x=p+(at%7)*cw,y=top+42+Math.floor(at/7)*ch;ctx.fillStyle=d.kind==='off'?'#fff2f3':'#fff';ctx.fillRect(x,y,cw,ch);ctx.fillStyle=d.holiday||d.weekday===0||d.weekday===6?'#e21c2a':'#405747';ctx.font='500 19px "Noto Sans KR",sans-serif';ctx.fillText(String(d.day),x+14,y+30);if(d.holiday){ctx.fillStyle='#e21c2a';wrap(d.holiday,x+14,y+63,cw-27,'400 16px "Noto Sans KR",sans-serif',2);}else if(d.kind!=='off'){const [bg,fg]=color(d.id);ctx.fillStyle=bg;ctx.fillRect(x+10,y+45,cw-20,42);ctx.fillStyle=fg;wrap(nameOf(d.id),x+20,y+73,cw-38,'500 21px "Noto Sans KR",sans-serif',1);ctx.fillStyle='#8e9c90';ctx.font='400 12px "Noto Sans KR",sans-serif';ctx.fillText(d.kind==='fixed'?'고정':d.kind==='manual'&&!visibleSwap(m,d)?'직접 수정':visibleSwap(m,d)?'':'순환',x+14,y+106);}if(d.note){ctx.fillStyle='#7b8f80';wrap(d.note,x+14,y+129,cw-28,'400 13px "Noto Sans KR",sans-serif',2);}if(d.warning){ctx.fillStyle='#b77747';ctx.font='500 12px "Noto Sans KR",sans-serif';ctx.fillText('! 확인 필요',x+cw-86,y+29);}});
 ctx.strokeStyle='#dfe7dd';ctx.lineWidth=1;for(let c=0;c<=7;c++){ctx.beginPath();ctx.moveTo(p+c*cw,top);ctx.lineTo(p+c*cw,top+42+rows*ch);ctx.stroke();}for(let row=0;row<=rows;row++){ctx.beginPath();ctx.moveTo(p,top+42+row*ch);ctx.lineTo(W-p,top+42+row*ch);ctx.stroke();}ctx.fillStyle='#91a08f';ctx.font='400 13px "Noto Sans KR",sans-serif';ctx.fillText('SHOP SCHEDULE · 주말과 공휴일 제외',p,H-25);return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('이미지 생성 실패')),'image/png'));
}
function showHelp(){modal('처음부터, 차근차근',`<ol class="help-list"><li><strong>담당자 순번</strong><br>순번 편집에서 입·퇴사 인원을 반영하고 화살표로 순서를 바꿉니다.</li><li><strong>고정 요일과 연차</strong><br>요일별 고정 담당자를 지정하고 일반 순환 제외 여부를 선택하세요. 연차 기간은 자동 배정에서 건너뜁니다.</li><li><strong>날짜별 조정</strong><br>날짜를 눌러 담당자·메모를 바꾸세요. 직접 수정은 기본 순환 순번을 소비하지 않으며, 다른 날과 다음 달 순번을 바꾸지 않습니다. 연차와 겹치는 수동 배정은 !로 표시합니다.</li><li><strong>일정 맞교환</strong><br>담당자 이름을 다른 날짜로 끌어 놓으면 두 사람의 일정이 교환됩니다. 모바일·키보드에서는 ‘일정 맞교환’을 누르고 두 날짜를 차례로 선택하세요. 최근 교환 날짜와 두 사람 이름은 화면에만 표시되고, 표 복사·이미지·인쇄에는 교환 내역이 포함되지 않습니다. 메모는 원래 날짜에 남습니다. 실행 취소로 교환을 되돌릴 수 있습니다.</li><li><strong>다음 달 이어가기</strong><br>다음 달을 처음 열 때 이전 달의 순환 다음 순번을 이어받습니다. 중간 달을 건너뛰면 그 달들도 같은 규칙으로 생성합니다. 고정 규칙은 이어받고 연차·휴무·직접 수정은 월별로 등록합니다. 이전 달을 나중에 바꾼 경우 ‘지난달 순번 다시 이어받기’를 누르세요.</li><li><strong>복사와 공유</strong><br>표 복사는 순번+달력을 HTML과 텍스트로 복사합니다. 붙여넣는 앱에 따라 텍스트만 표시될 수 있어요. 이미지 저장·공유로 달력 모양을 유지할 수 있습니다.</li><li><strong>저장과 백업</strong><br>자료는 이 브라우저에 저장됩니다. 기기 간 자동 동기화는 제공하지 않습니다. 백업 파일에 담당자·월별 설정이 함께 저장됩니다. 공휴일 자료 지원: ${Math.min(...Object.keys(holidays).map(Number))}–${Math.max(...Object.keys(holidays).map(Number))}년.</li></ol><div class="modal-actions"><button class="btn primary" id="helpClose">시작하기</button></div>`);$('#helpClose').onclick=close;}
function bind(){
 $('#swapModeBtn').onclick=()=>{cancelDrag();swapMode=!swapMode;swapSource=null;updateSwapMode();};
 document.addEventListener('pointermove',moveDrag,{passive:false});document.addEventListener('pointerup',endDrag);document.addEventListener('pointercancel',cancelDrag);document.addEventListener('lostpointercapture',e=>{if(dragState?.pointerId===e.pointerId)cancelDrag();});window.addEventListener('blur',cancelDrag);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){cancelDrag();swapMode=false;swapSource=null;updateSwapMode();}});
 $('#closeModal').onclick=close;$('#modal').addEventListener('click',e=>{if(e.target===$('#modal')){const r=$('#modal').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();}});
 $('#prevBtn').onclick=()=>navigate(shiftMonth(state.current,-1));$('#nextBtn').onclick=()=>navigate(shiftMonth(state.current,1));$('#monthInput').onchange=e=>navigate(e.target.value);$('#todayBtn').onclick=()=>navigate(monthKey(new Date()));
 $('#undoBtn').onclick=()=>{if(!history.length)return;state=JSON.parse(history.pop());persist();render();toast('마지막 변경을 취소했어요.');};$('#teamBtn').onclick=editTeam;
 $('#startSelect').onchange=e=>change(()=>{cur().start=e.target.value;cur().startMode='manual';},'순환 시작 담당자를 변경했어요.');
 $('#carryBtn').onclick=()=>{const prev=state.months[shiftMonth(state.current,-1)],pool=result().pool;if(!prev)return;const id=generate(shiftMonth(state.current,-1),prev,holidays).nextOrder.find(id=>pool.includes(id));change(()=>{cur().start=id||pool[0]||'';cur().startMode='carry';},'지난달 순환 다음 순번을 적용했어요.');};
 $('#excludeFixed').onchange=e=>change(()=>{cur().excludeFixed=e.target.checked;normalizeStart();},'순환 참여 설정을 변경했어요.');
 $('#generateBtn').onclick=()=>{const n=Object.keys(cur().overrides).length;modal('이번 달 다시 배정',`<p class="modal-intro">현재 담당자 순번, 고정 요일, 연차와 휴일 설정으로 배정합니다. 설정 변경은 평소에도 달력에 즉시 반영됩니다.</p><label class="check-row"><input type="checkbox" id="keepOverrides" checked>직접 수정한 날짜 ${n}건 유지</label><p class="hint">체크를 해제하면 직접 지정한 담당자도 자동 배정으로 돌아갑니다. 날짜별 메모는 유지됩니다.</p><div class="modal-actions"><button class="btn" id="cancelGenerate">취소</button><button class="btn primary" id="confirmGenerate">다시 배정</button></div>`);$('#cancelGenerate').onclick=close;$('#confirmGenerate').onclick=()=>{const keep=$('#keepOverrides').checked;change(()=>{if(!keep){cur().overrides={};cur().swaps={};}normalizeStart();},keep?'현재 규칙으로 배정하고 직접 수정한 날짜를 유지했어요.':'직접 수정한 날짜까지 자동으로 다시 배정했어요.');close();};};
 for(const tab of ['rules','leave'])$('#'+tab+'Tab').onclick=()=>{activeTab=tab;for(const t of ['rules','leave']){$('#'+t+'Tab').setAttribute('aria-selected',String(t===tab));$('#'+t+'Panel').hidden=t!==tab;}};
 $('#addLeaveBtn').onclick=editLeave;$('#addHolidayBtn').onclick=()=>editHoliday();$('#copyBtn').onclick=copyTable;
 $('#imageBtn').onclick=async()=>{try{download(await calendarImage(),`SHOP장_스케줄_${state.current}.png`);toast('순번과 달력을 이미지로 저장했어요.');}catch{toast('이미지를 만들지 못했어요. 표 복사 또는 인쇄를 이용해 주세요.');}};
 $('#shareBtn').onclick=async()=>{const button=$('#shareBtn');button.disabled=true;try{const file=new File([await calendarImage()],`SHOP장_스케줄_${state.current}.png`,{type:'image/png'});if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:`${title(state.current)} SHOP장 업무 스케줄`});}else{download(file,file.name);toast('공유할 이미지를 저장했어요. 메신저에 파일을 첨부해 주세요.');}}catch(e){if(e.name!=='AbortError')toast('공유창을 열지 못했어요. 이미지 저장 또는 표 복사를 이용해 주세요.');}finally{button.disabled=false;}};
 $('#backupBtn').onclick=()=>{download(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),`SHOP스케줄_백업_${monthKey(new Date())}.json`);toast('전체 월별 자료를 백업했어요.');};
 $('#importBtn').onclick=()=>$('#importFile').click();$('#importFile').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;if(file.size>5_000_000)return toast('백업 파일이 너무 큽니다.');try{const incoming=JSON.parse(await file.text());if(!validateState(incoming)||!holidays[incoming.current.slice(0,4)])throw new Error();modal('백업 불러오기',`<p class="modal-intro">담당자 ${incoming.roster.length}명 · ${Object.keys(incoming.months).length}개월 자료입니다. 이 브라우저의 전체 자료를 백업 내용으로 교체합니다.</p><p class="warning-box">현재 자료가 필요하면 먼저 백업 저장을 해 주세요. 불러오기 직후에는 실행 취소로 되돌릴 수 있습니다.</p><div class="modal-actions"><button class="btn" id="cancelImport">취소</button><button class="btn primary" id="confirmImport">자료 교체</button></div>`);$('#cancelImport').onclick=close;$('#confirmImport').onclick=()=>{change(()=>{state=incoming;ensureMonth(state.current,state,holidays);},'백업 자료를 불러왔어요.');close();};}catch{toast('유효한 SHOP 스케줄 백업 파일이 아닙니다.');}};
 $('#helpBtn').onclick=showHelp;$('#printBtn').onclick=printSchedule;$('#printScheduleBtn').onclick=printSchedule;
 window.addEventListener('beforeprint',preparePrint);
 window.addEventListener('storage',e=>{if(e.key===STORAGE)toast('다른 탭에서 자료가 변경됐어요. 새로고침하여 최신 자료를 확인하세요.');});
}
async function init(){
 try {const response=await fetch('./holidays.json');if(!response.ok)throw new Error();holidays=await response.json();if(!holidays[2026])throw new Error();}catch{$('main').innerHTML='<section class="card" style="padding:30px"><h1>공휴일 자료를 불러오지 못했어요.</h1><p>연결 상태를 확인한 뒤 새로고침해 주세요. 정확한 배정을 위해 자료를 불러온 후 시작합니다.</p></section>';return;}
 let recovery=false;try{const saved=localStorage.getItem(STORAGE);if(saved){const parsed=JSON.parse(saved);if(validateState(parsed))state=parsed;else recovery=true;}}catch{recovery=true;}
 if(!state)state={version:1,roster:initialRoster(),current:monthKey(new Date()),months:{}};
 if(!holidays[state.current.slice(0,4)])state.current=Object.keys(holidays).sort().at(-1)+'-12';
 ensureMonth(state.current,state,holidays);$('#monthInput').min=Object.keys(holidays).sort()[0]+'-01';$('#monthInput').max=Object.keys(holidays).sort().at(-1)+'-12';bind();render();if(recovery){toast('저장된 자료를 읽지 못했어요. 원본을 보존하고 기본 화면을 열었습니다.');}else persist();
}
init();
