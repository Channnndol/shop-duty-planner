export const names = ['전병민','최동식','오주영','안기석','김동현','엄정태','정민우','변진석','이호동'];
export const initialRoster = () => names.map((name,i)=>({id:`member-${i+1}`,name}));
export const pad = n => String(n).padStart(2,'0');
export const monthKey = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}`;
export const shiftMonth = (key,n) => {const [y,m]=key.split('-').map(Number);return monthKey(new Date(y,m-1+n,1));};
export const daysInMonth = key => {const [y,m]=key.split('-').map(Number);return new Date(y,m,0).getDate();};
export const weekday = date => new Date(date+'T12:00:00').getDay();
export function holidayName(date,month,holidays) {
  if (Object.hasOwn(month.holidays,date)) return month.holidays[date];
  return (holidays[date.slice(0,4)]?.[date] || []).join(' · ');
}
export function available(month,id,date) {return !month.leave.some(l=>l.id===id && l.from<=date && l.to>=date);}
export function generate(key,month,holidays) {
  const ids=month.roster.map(p=>p.id), fixedIds=new Set(Object.values(month.fixed));
  const pool=ids.filter(id=>!month.excludeFixed || !fixedIds.has(id));
  let cursor=pool.indexOf(month.start); if(cursor<0) cursor=0;
  const days=[];
  for(let d=1;d<=daysInMonth(key);d++) {
    const date=`${key}-${pad(d)}`,wd=weekday(date),holiday=holidayName(date,month,holidays);
    const row={date,day:d,weekday:wd,holiday,id:null,kind:'off',note:month.notes[date]||'',warning:''};
    if(wd>0 && wd<6 && !holiday) {
      row.kind='rotation';
      const fixed=month.fixed[wd];
      if(fixed && ids.includes(fixed) && available(month,fixed,date)) {row.id=fixed;row.kind='fixed';}
      else {
        if(fixed) row.warning='고정 담당자 연차로 순환 배정';
        for(let j=0;j<pool.length;j++) {
          const at=(cursor+j)%pool.length,id=pool[at];
          if(available(month,id,date)) {row.id=id;cursor=(at+1)%pool.length;break;}
        }
        if(!row.id) row.warning='배정 가능한 담당자가 없습니다';
      }
      if(Object.hasOwn(month.overrides,date)) {
        row.id=ids.includes(month.overrides[date])?month.overrides[date]:null;
        row.kind='manual';
        row.warning=row.id&&!available(month,row.id,date)?'연차와 배정이 겹칩니다':(!row.id?'담당자를 지정해 주세요':'');
      }
    }
    days.push(row);
  }
  return {days,next:pool[cursor]||null,nextOrder:pool.slice(cursor).concat(pool.slice(0,cursor)),pool};
}
export function newMonth(key,state,holidays) {
  const prev=state.months[shiftMonth(key,-1)], roster=structuredClone(state.roster),ids=roster.map(p=>p.id);
  const prior=prev?generate(shiftMonth(key,-1),prev,holidays):null;
  const fixed=prev?Object.fromEntries(Object.entries(prev.fixed).filter(([,id])=>ids.includes(id))):{};
  return {roster,fixed,excludeFixed:prev?.excludeFixed??true,start:prior?.nextOrder.find(id=>ids.includes(id))||ids[0]||'',leave:[],holidays:{},overrides:{},notes:{},startMode:prev?'carry':'first'};
}
export function ensureMonth(key,state,holidays) {
  if(state.months[key]) return;
  const previous=Object.keys(state.months).filter(k=>k<key).sort().at(-1);
  if(previous) {
    let k=shiftMonth(previous,1),count=0;
    while(k<=key && count++<120) {if(!state.months[k])state.months[k]=newMonth(k,state,holidays);k=shiftMonth(k,1);}
  }
  if(!state.months[key])state.months[key]=newMonth(key,state,holidays);
}
export function validateState(s) {
  const date=/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/,mk=/^\d{4}-(0[1-9]|1[0-2])$/;
  const roster=r=>Array.isArray(r)&&r.length>0&&r.length<=50&&new Set(r.map(p=>p.id)).size===r.length&&r.every(p=>p&&typeof p.id==='string'&&/^[\w-]{1,80}$/.test(p.id)&&typeof p.name==='string'&&p.name.trim().length>0&&p.name.length<=30);
  const record=o=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).every(k=>!['__proto__','constructor','prototype'].includes(k));
  if(!s||s.version!==1||!roster(s.roster)||!record(s.months)||!mk.test(s.current)||Object.keys(s.months).length>240)return false;
  return Object.entries(s.months).every(([key,m])=>mk.test(key)&&m&&roster(m.roster)&&typeof m.start==='string'&&typeof m.excludeFixed==='boolean'&&['carry','first','manual'].includes(m.startMode)&&record(m.fixed)&&Object.entries(m.fixed).every(([d,id])=>/^[1-5]$/.test(d)&&m.roster.some(p=>p.id===id))&&Array.isArray(m.leave)&&m.leave.length<=1000&&m.leave.every(l=>l&&m.roster.some(p=>p.id===l.id)&&date.test(l.from)&&date.test(l.to)&&l.from<=l.to)&&['holidays','overrides','notes'].every(f=>record(m[f])&&Object.entries(m[f]).every(([d,v])=>date.test(d)&&d.startsWith(key+'-')&&(f==='overrides'?(v===null||m.roster.some(p=>p.id===v)):(typeof v==='string'&&v.length<=300)))));
}
