const D = window.RDA_DATA;
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

function rowTable(rows, cols){
  return `<table class="rtable"><thead><tr>${cols.map(c=>`<th class="${c.cls||''}">${c.label}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${cols.map(c=>`<td class="${c.cls||''}">${c.render?c.render(r):r[c.key]}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
function rankClass(p){return p===1?'p1':p===2?'p2':p===3?'p3':''}
function statusHtml(s){return `<span class="status ${s.toLowerCase()==='finito'?'ok':s.toLowerCase()}">${s}</span>`}

function render(){
  const resultCols=[{label:'#',render:r=>`<span class="pos ${rankClass(r.pos)}">${r.pos}</span>`},{label:'Pilota',key:'name'},{label:'Auto',key:'car',cls:'hide-mobile'},{label:'Sessione',key:'session'},{label:'Tempo',key:'time'},{label:'Stato',render:r=>statusHtml(r.status)}];
  $('#homeResults').innerHTML=rowTable(D.dayResults.slice(0,5),resultCols);
  $('#resultsTable').innerHTML=rowTable(D.dayResults,resultCols);
  $('#podium').innerHTML=D.dayResults.slice(0,3).map((r,i)=>`<div class="pod-card ${['first','second','third'][i]}"><div class="pod-rank">P${r.pos}</div><div class="pod-name">${r.name}</div><div class="pod-time">${r.time}</div></div>`).join('');
  $('#calendarList').innerHTML=D.calendar.map(c=>`<article class="calendar-item panel"><div class="cal-date"><strong>${c.date.replace(' SET','')}</strong><small>SET 2026</small></div><div><div class="eyebrow">${c.series}</div><h3>${c.title}</h3><p>Sessioni: 15:00 • 18:00 • 21:00 • 23:00</p></div></article>`).join('');
  $('#championshipTable').innerHTML=rowTable(D.championship,[{label:'#',render:r=>`<span class="pos ${rankClass(r.pos)}">${r.pos}</span>`},{label:'Pilota',key:'name'},{label:'Punti',render:r=>`<strong>${r.pts}</strong>`}]);
  $('#eloTable').innerHTML=rowTable(D.elo,[{label:'#',render:r=>`<span class="pos ${rankClass(r.pos)}">${r.pos}</span>`},{label:'Pilota',key:'name'},{label:'ELO',render:r=>`<strong>${r.elo}</strong>`},{label:'Δ',render:r=>`<span style="color:${r.delta.startsWith('+')?'var(--green)':'var(--red)'}">${r.delta}</span>`}]);
  renderDrivers(D.drivers);
  $('#teamTable').innerHTML=rowTable(D.teams,[{label:'#',key:'pos'},{label:'Team',key:'name'},{label:'Punti',key:'pts'}]);
  $('#constructorTable').innerHTML=rowTable(D.constructors,[{label:'#',key:'pos'},{label:'Costruttore',key:'name'},{label:'Punti',key:'pts'}]);
}
function renderDrivers(list){$('#driverCards').innerHTML=list.map(d=>`<article class="driver-card panel"><div class="avatar">${d.name.slice(0,2).toUpperCase()}</div><h3>${d.name}</h3><p>ELO ${d.elo}</p><div class="driver-stats"><div><strong>${d.races}</strong><span>Gare</span></div><div><strong>${d.wins}</strong><span>Vittorie</span></div><div><strong>${d.podiums}</strong><span>Podi</span></div></div></article>`).join('')}
function go(view){$$('.view').forEach(v=>v.classList.toggle('active',v.dataset.view===view));$$('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.viewTarget===view));window.scrollTo({top:0,behavior:'smooth'});location.hash=view==='home'?'':view}
$$('.nav-btn').forEach(b=>b.addEventListener('click',()=>go(b.dataset.viewTarget)));$$('[data-go]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.go)));
$('#driverSearch').addEventListener('input',e=>{const q=e.target.value.toLowerCase().trim();renderDrivers(D.drivers.filter(d=>d.name.toLowerCase().includes(q)))});
let deferredPrompt;window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;$('#installBtn').hidden=false});$('#installBtn').addEventListener('click',async()=>{if(!deferredPrompt)return;deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;$('#installBtn').hidden=true});
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
render();
const start=location.hash.replace('#','');if(start&&$(`[data-view="${start}"]`))go(start);
