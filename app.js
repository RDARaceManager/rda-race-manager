const D=window.RDA_DATA||{};
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)], arr=k=>Array.isArray(D[k])?D[k]:[];
const months=['GENNAIO','FEBBRAIO','MARZO','APRILE','MAGGIO','GIUGNO','LUGLIO','AGOSTO','SETTEMBRE','OTTOBRE','NOVEMBRE','DICEMBRE'];
const shortMonths=['GEN','FEB','MAR','APR','MAG','GIU','LUG','AGO','SET','OTT','NOV','DIC'];

function emptyState(t){return `<div class="empty-state"><strong>${t}</strong><span>I dati compariranno dopo la pubblicazione dal Race Manager.</span></div>`}
function rankClass(p){return p===1?'p1':p===2?'p2':p===3?'p3':''}
function statusHtml(s){return `<span class="status">${s||'—'}</span>`}
function table(rows,cols,empty='Nessun dato ufficiale pubblicato'){
  if(!rows.length)return emptyState(empty);
  return `<table class="rtable"><thead><tr>${cols.map(c=>`<th class="${c.cls||''}">${c.label}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${cols.map(c=>`<td class="${c.cls||''}">${c.render?c.render(r):(r[c.key]??'—')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

let calendarCursor=null,selectedRace=null;
function parseISO(s){const [y,m,d]=(s||'').split('-').map(Number);return {y,m,d}}
function latestRace(){const a=arr('completedRaces');return a.length?a[a.length-1]:null}

function renderCalendar(){
  const races=arr('completedRaces'),future=arr('futureRaces');
  if(!calendarCursor){const lr=latestRace(),nr=future[0],now=new Date();calendarCursor=nr?{y:nr.year,m:nr.month}:lr?{y:lr.year,m:lr.month}:{y:now.getFullYear(),m:now.getMonth()+1}}
  $('#monthTitle').textContent=`${months[calendarCursor.m-1]} ${calendarCursor.y}`;$('#calendarYearPill').textContent=calendarCursor.y;
  const first=new Date(Date.UTC(calendarCursor.y,calendarCursor.m-1,1)),days=new Date(Date.UTC(calendarCursor.y,calendarCursor.m,0)).getUTCDate(),prevDays=new Date(Date.UTC(calendarCursor.y,calendarCursor.m-1,0)).getUTCDate(),start=(first.getUTCDay()+6)%7;let html='';
  for(let i=0;i<42;i++){let y=calendarCursor.y,m=calendarCursor.m,d,out=false;if(i<start){d=prevDays-start+i+1;out=true;m--;if(m===0){m=12;y--}}else if(i>=start+days){d=i-start-days+1;out=true;m++;if(m===13){m=1;y++}}else d=i-start+1;const rr=races.find(r=>r.year===y&&r.month===m&&r.day===d),fr=future.find(r=>r.year===y&&r.month===m&&r.day===d),ev=rr||fr;html+=`<button type="button" class="day-cell ${out?'out':''} ${rr?'has-race':''} ${fr&&!rr?'has-future':''}" ${ev?`data-event="${ev.eventId}" data-kind="${rr?'done':'future'}"`:''}>${d}</button>`}
  $('#monthGrid').innerHTML=html;$$('#monthGrid [data-event]').forEach(b=>b.addEventListener('click',()=>b.dataset.kind==='future'?selectFutureRace(Number(b.dataset.event)):selectRace(Number(b.dataset.event))));
}

function selectRace(id,rerender=true){
  const races=arr('completedRaces'), r=races.find(x=>x.eventId===id);
  if(!r)return;
  selectedRace=r;
  $('#raceDetail').innerHTML=`<div class="detail-top">
    <div class="detail-date"><strong>${String(r.day).padStart(2,'0')}</strong><span>${shortMonths[r.month-1]}</span><span>${r.year}</span></div>
    <div class="detail-meta"><div class="eyebrow">${r.master?`RDA MASTER ${r.master}`:'RDA'}</div><h3>${r.title}</h3><p>${r.round?`Round ${r.round}`:'Gara ufficiale'} • ${r.championship}</p><p>🏁 ${r.track}</p></div>
  </div><div class="track-visual"><div class="track-speed"><span></span><span></span><span></span></div><div class="track-name"><small>CIRCUITO</small><strong>${r.track}</strong></div></div>`;
  $$('.race-row').forEach(x=>x.classList.toggle('selected',Number(x.dataset.event)===id));
  if(rerender) renderCalendar();
}

function selectFutureRace(id){const r=arr('futureRaces').find(x=>x.eventId===id);if(!r)return;const reg=r.regulation?`<a class="regulation-btn" href="${r.regulation.file}" target="_blank" rel="noopener">📖 ${r.regulation.label||'REGOLAMENTO UFFICIALE'}</a>`:'';$('#raceDetail').innerHTML=`<div class="future-badge">● PROSSIMA GARA</div><div class="detail-top"><div class="detail-date future-date"><strong>${String(r.day).padStart(2,'0')}</strong><span>${shortMonths[r.month-1]}</span><span>${r.year}</span></div><div class="detail-meta"><div class="eyebrow">${r.master?`RDA MASTER ${r.master}`:'RDA'}</div><h3>${r.title}</h3><p>${r.gara?`Gara ${r.gara}`:'Prossimo appuntamento'} • ${r.championship}</p><p>🏁 ${r.track}</p>${reg}</div></div><div class="track-visual future-track"><div class="track-speed"><span></span><span></span><span></span></div><div class="track-name"><small>CIRCUITO</small><strong>${r.track}</strong></div></div>`}

function renderCompleted(){
  const races=[...arr('completedRaces')].sort((a,b)=>b.isoDate.localeCompare(a.isoDate));
  $('#completedList').innerHTML=races.length?races.map(r=>`<div class="race-row" data-event="${r.eventId}">
    <div class="rdate">${String(r.day).padStart(2,'0')} ${shortMonths[r.month-1]} ${r.year}</div>
    <div><strong>${r.title}</strong><br><small>${r.master?`RDA MASTER ${r.master}`:r.championship}</small></div>
    <div class="round-col">${r.round?`Round ${r.round}`:'Gara'}</div>
    <div class="track-col">⌁ &nbsp; ${r.track}</div><span class="official">UFFICIALE</span></div>`).join(''):emptyState('Nessuna gara disputata pubblicata');
  $$('.race-row').forEach(x=>x.addEventListener('click',()=>openRaceResult(Number(x.dataset.event))));
}

function renderFlyers(){
  const flyers=arr('flyers'), box=$('#flyerGallery');
  box.innerHTML=flyers.length?flyers.map(f=>`<button type="button" class="flyer-card" data-flyer="${f.id}"><img src="${f.image}" alt="Volantino ${f.label}"><strong>${f.label}</strong><small>Volantino ufficiale RDA</small></button>`).join(''):emptyState('Nessun volantino pubblicato');
  $$('.flyer-card').forEach(b=>b.addEventListener('click',()=>{const f=flyers.find(x=>x.id===b.dataset.flyer);if(!f)return;$('#flyerViewerTitle').textContent=f.label;$('#flyerViewerImage').src=f.image;$('#flyerViewer').hidden=false;$('#flyerViewer').scrollIntoView({behavior:'smooth',block:'start'})}));
}


let selectedChampionshipId=null;

function publicChampionships(){return arr('championships')}

function selectedPublicChampionship(){
  const all=publicChampionships();
  if(!all.length)return null;
  if(selectedChampionshipId===null){
    const wanted=Number(D.currentChampionshipId||0);
    selectedChampionshipId=(all.find(c=>Number(c.id)===wanted)||all[0]).id;
  }
  return all.find(c=>Number(c.id)===Number(selectedChampionshipId))||all[0];
}

function selectChampionship(id){
  selectedChampionshipId=Number(id);
  renderChampionships();
}

function renderChampionships(){
  const all=publicChampionships(), selector=$('#championshipSelector');
  if(!selector)return;
  if(!all.length){
    selector.innerHTML=emptyState('Nessun campionato con Round ufficiali pubblicati');
    $('#championshipTable').innerHTML=emptyState('Nessuna classifica generale disponibile');
    $('#selectedChampName').textContent='—'; $('#selectedChampMaster').textContent='—';
    $('#officialRoundCount').textContent='0'; $('#officialRoundCountMirror').textContent='0';
    $('#selectedChampStatus').textContent='—'; $('#officialRoundProgress').style.width='0%';
    return;
  }
  const c=selectedPublicChampionship();
  selector.innerHTML=all.map(x=>`<button type="button" class="champ-choice ${Number(x.id)===Number(c.id)?'active':''}" data-champ="${x.id}">
    <strong>${x.name}</strong><small>${x.master?`RDA MASTER ${x.master}`:'RDA'} · ${x.officialRounds} Round</small>
  </button>`).join('');
  $$('#championshipSelector [data-champ]').forEach(b=>b.addEventListener('click',()=>selectChampionship(b.dataset.champ)));

  $('#selectedChampName').textContent=c.name;
  $('#selectedChampMaster').textContent=c.master?`MASTER ${c.master}`:'—';
  $('#officialRoundCount').textContent=c.officialRounds||0;
  $('#officialRoundCountMirror').textContent=c.officialRounds||0;
  $('#selectedChampStatus').textContent=c.closed?'CONCLUSO':'IN CORSO';
  const rb=$('#championshipRegulation'); rb.innerHTML=c.regulation?`<a class="regulation-btn" href="${c.regulation.file}" target="_blank" rel="noopener">📖 ${c.regulation.label||'REGOLAMENTO UFFICIALE'}</a>`:'';
  $('#officialRoundProgress').style.width=`${Math.min(100,(c.officialRounds||0)*16.67)}%`;
  $('#championshipTable').innerHTML=table(c.standings||[],[
    {label:'#',render:r=>`<span class="pos ${rankClass(r.pos)}">${r.pos}</span>`},
    {label:'Pilota',key:'name'},
    {label:'Gare',key:'races',cls:'hide-mobile'},
    {label:'Vittorie',key:'wins',cls:'hide-mobile'},
    {label:'Punti',render:r=>`<strong>${r.pts}</strong>`}
  ],'Nessun pilota classificato');
}


function renderSelectedRace(index=0){const a=arr('raceArchive'),r=a[index];if(!r)return;$('#resultChamp').textContent=r.championship||'—';$('#resultRace').textContent=r.gara?`Gara ${r.gara}`:'—';$('#resultDate').textContent=r.date||'—';$('#resultTrack').textContent=r.track||'Circuito non indicato';$('#resultMaster').textContent=r.master?`RDA MASTER ${r.master}`:'—';const cols=[{label:'#',render:x=>`<span class="pos ${rankClass(x.pos)}">${x.pos}</span>`},{label:'Pilota',key:'name'},{label:'Auto',key:'car',cls:'hide-mobile'},{label:'Sessione',key:'session'},{label:'Tempo',key:'time'},{label:'Stato',render:x=>statusHtml(x.status)}];$('#resultsTable').innerHTML=table(r.results||[],cols,'Nessun risultato per questa gara');$('#podium').innerHTML=(r.results||[]).slice(0,3).map((x,i)=>`<div class="pod-card ${['first','second','third'][i]}"><div class="pod-rank">P${x.pos}</div><div class="pod-name">${x.name}</div><div class="pod-time">${x.time}</div></div>`).join('')}
function setupRaceArchive(){const a=arr('raceArchive'),s=$('#raceResultSelect');if(!s)return;s.innerHTML=a.length?a.map((r,i)=>`<option value="${i}">${r.date} • ${r.championship} • Gara ${r.gara} • ${r.track}</option>`).join(''):'<option>Nessuna gara ufficiale</option>';s.onchange=()=>renderSelectedRace(Number(s.value));if(a.length)renderSelectedRace(0)}
function openRaceResult(eventId){go('results');const a=arr('raceArchive'),i=a.findIndex(r=>Number(r.eventId)===Number(eventId)),s=$('#raceResultSelect');if(s&&i>=0){s.value=String(i);renderSelectedRace(i)}}

let selectedRacePodiumChamp=null,selectedFinalPodiumChamp=null;
function podiumStageRDA(rows,championship=false){if(!rows||!rows.length)return emptyState(championship?'Podio finale non disponibile':'Nessun podio gara ufficiale');const order=[rows[1],rows[0],rows[2]].filter(Boolean);return order.map(r=>{const cls=r.pos==1?'winner':r.pos==2?'runner':'third',medal=r.pos==1?'🥇':r.pos==2?'🥈':'🥉',detail=championship?`${r.pts} pt • ${r.wins||0} vittorie`:`${r.car||'—'} • ${r.time||'—'}`;return `<div class="stage-driver ${cls}"><div class="laurel">${medal}<span>${r.pos}</span></div><div class="stage-step"><b>${r.name}</b><small>${detail}</small></div></div>`}).join('')}
function renderPodiumsByChampionship(){
 const races=arr('podiumsByChampionship'),rs=$('#racePodiumSelector');
 if(rs){if(races.length){if(selectedRacePodiumChamp===null||!races.some(x=>Number(x.championshipId)===Number(selectedRacePodiumChamp)))selectedRacePodiumChamp=Number(races[0].championshipId);rs.innerHTML=races.map(x=>`<button class="champ-choice ${Number(x.championshipId)===Number(selectedRacePodiumChamp)?'active':''}" data-rp="${x.championshipId}"><strong>${x.championship}</strong><small>${x.master?`RDA MASTER ${x.master}`:'RDA'} • ultima gara</small></button>`).join('');$$('#racePodiumSelector [data-rp]').forEach(b=>b.onclick=()=>{selectedRacePodiumChamp=Number(b.dataset.rp);renderPodiumsByChampionship()});const x=races.find(v=>Number(v.championshipId)===Number(selectedRacePodiumChamp));$('#racePodiumArena').style.display='block';$('#podiumDayTitle').textContent=x.title||x.championship;$('#podiumDayMeta').textContent=[x.gara?`Gara ${x.gara}`:'Gara',x.date,x.track].filter(Boolean).join(' • ');$('#podiumDayFull').innerHTML=podiumStageRDA(x.rows,false)}else{rs.innerHTML=emptyState('Nessuna gara ufficiale pubblicata');$('#racePodiumArena').style.display='none'}}
 const finals=arr('finalPodiumsByChampionship'),fs=$('#finalPodiumSelector');
 if(fs){if(finals.length){if(selectedFinalPodiumChamp===null||!finals.some(x=>Number(x.championshipId)===Number(selectedFinalPodiumChamp)))selectedFinalPodiumChamp=Number(finals[0].championshipId);fs.innerHTML=finals.map(x=>`<button class="champ-choice ${Number(x.championshipId)===Number(selectedFinalPodiumChamp)?'active':''}" data-fp="${x.championshipId}"><strong>${x.championship}</strong><small>${x.master?`RDA MASTER ${x.master}`:'RDA'} • FINALE UFFICIALE</small></button>`).join('');$$('#finalPodiumSelector [data-fp]').forEach(b=>b.onclick=()=>{selectedFinalPodiumChamp=Number(b.dataset.fp);renderPodiumsByChampionship()});const x=finals.find(v=>Number(v.championshipId)===Number(selectedFinalPodiumChamp));$('#finalPodiumArena').style.display='block';$('#podiumChampTitle').textContent=x.championship;$('#podiumChampMeta').textContent=`${x.master?`MASTER ${x.master} • `:''}FINALE UFFICIALE`;$('#podiumChampFull').innerHTML=podiumStageRDA(x.rows,true)}else{fs.innerHTML=emptyState('Nessun campionato ancora concluso');$('#finalPodiumArena').style.display='none'}}
}
function render(){
  const day=arr('dayResults'), champ=arr('championship'), elo=arr('elo'), drivers=arr('drivers'), teams=arr('teams'), cons=arr('constructors');
  const meta=D.meta||{}, pday=arr('podiumDay'), pchamp=arr('podiumChampionship'), pm=D.podiumMeta||{};
  const resultCols=[{label:'#',render:r=>`<span class="pos ${rankClass(r.pos)}">${r.pos}</span>`},{label:'Pilota',key:'name'},{label:'Auto',key:'car',cls:'hide-mobile'},{label:'Sessione',key:'session'},{label:'Tempo',key:'time'},{label:'Stato',render:r=>statusHtml(r.status)}];
  $('#homeResults').innerHTML=table(day.slice(0,5),resultCols,'Nessuna classifica pubblicata');
  $('#resultsTable').innerHTML=table(day,resultCols,'Nessun risultato ufficiale pubblicato');
  $('#podium').innerHTML=day.slice(0,3).map((r,i)=>`<div class="pod-card ${['first','second','third'][i]}"><div class="pod-rank">P${r.pos}</div><div class="pod-name">${r.name}</div><div class="pod-time">${r.time}</div></div>`).join('');
  $('#eloTable').innerHTML=table(elo,[{label:'#',render:r=>`<span class="pos ${rankClass(r.pos)}">${r.pos}</span>`},{label:'Pilota',key:'name'},{label:'Ranking',key:'elo'},{label:'Δ',key:'delta'}]);
  $('#teamTable').innerHTML=table(teams,[{label:'#',key:'pos'},{label:'Team',key:'name'},{label:'Punti',key:'pts'}]);
  $('#constructorTable').innerHTML=table(cons,[{label:'#',key:'pos'},{label:'Costruttore',key:'name'},{label:'Punti',key:'pts'}]);
  $('#publishedDriverCount').textContent=meta.publishedDrivers||0; $('#homeOfficialRounds').textContent=meta.officialRounds||0;
  $('#officialRoundProgress').style.width=`${Math.min(100,(meta.officialRounds||0)*16.67)}%`;
  $('#resultsStatus').textContent=meta.hasOfficialResults?'UFFICIALE':'IN ATTESA';

  if(champ[0]){$('#leaderChampName').textContent=champ[0].name;$('#leaderChampSub').textContent=`${champ[0].pts} punti`}
  if(elo[0]){$('#leaderEloName').textContent=elo[0].name;$('#leaderEloSub').textContent=`Ranking ${elo[0].elo}`;$('#eloHeroRank').textContent='#1';$('#eloHeroName').textContent=elo[0].name;$('#eloHeroText').textContent=`Ranking RDA ${elo[0].elo}`}

  const lr=latestRace();
  if(lr){$('#homeRaceTitle').textContent=lr.title;$('#homeRaceDate').textContent=lr.date;$('#homeRaceDay').textContent=String(lr.day).padStart(2,'0');$('#homeRaceMonth').textContent=shortMonths[lr.month-1];$('#homeRaceYear').textContent=lr.year;$('#homeRaceMaster').textContent=lr.master?`RDA MASTER ${lr.master}`:'RDA';$('#homeRaceChamp').textContent=lr.championship;$('#homeRaceTrack').textContent=lr.track}

  renderPodiumsByChampionship();

  function renderDrivers(q=''){const f=drivers.filter(d=>d.name.toLowerCase().includes(q.toLowerCase()));$('#driverCards').innerHTML=f.length?f.map(d=>`<article class="driver-card"><h3>${d.name}</h3><div class="mini"><span>Gare <b>${d.races}</b></span><span>Vittorie <b>${d.wins}</b></span><span>Podi <b>${d.podiums}</b></span><span>Ranking <b>${d.elo}</b></span></div></article>`).join(''):emptyState('Nessun pilota trovato')}
  renderDrivers();$('#driverSearch').addEventListener('input',e=>renderDrivers(e.target.value));

  renderCompleted();
  renderChampionships();renderCalendar();renderFlyers();setupRaceArchive();
}

function go(view){$$('.view').forEach(v=>v.classList.toggle('active',v.dataset.view===view));$$('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.viewTarget===view));window.scrollTo({top:0,behavior:'smooth'})}
$$('.nav-btn').forEach(b=>b.addEventListener('click',()=>go(b.dataset.viewTarget)));$$('[data-go]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.go)));
$('#prevMonth').addEventListener('click',()=>{calendarCursor.m--;if(calendarCursor.m<1){calendarCursor.m=12;calendarCursor.y--}selectedRace=null;renderCalendar()});
$('#nextMonth').addEventListener('click',()=>{calendarCursor.m++;if(calendarCursor.m>12){calendarCursor.m=1;calendarCursor.y++}selectedRace=null;renderCalendar()});
$('#flyerClose').addEventListener('click',()=>{$('#flyerViewer').hidden=true});
render();
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
