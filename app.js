const D=window.RDA_DATA||{};
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)], arr=k=>Array.isArray(D[k])?D[k]:[];
const months=['GENNAIO','FEBBRAIO','MARZO','APRILE','MAGGIO','GIUGNO','LUGLIO','AGOSTO','SETTEMBRE','OTTOBRE','NOVEMBRE','DICEMBRE'];
const shortMonths=['GEN','FEB','MAR','APR','MAG','GIU','LUG','AGO','SET','OTT','NOV','DIC'];

function emptyState(t){return `<div class="empty-state"><strong>${t}</strong><span>I dati compariranno dopo la pubblicazione dal Race Manager.</span></div>`}
// Regolamento: il dialog conserva la schermata e lo scorrimento sottostanti.
function setupRegulationViewer(){
  const viewer=document.getElementById('rdaRegulationViewer');
  const content=document.getElementById('rdaRegulationPdf');
  const close=document.getElementById('rdaRegulationClose');
  const vendor=new URL('./vendor/pdfjs-5.6.205/',document.baseURI);
  let opener=null,previousOverflow='',previousScroll={left:0,top:0},session=null,pdfLibrary=null;

  function stopRendering(){
    const old=session;
    session=null;
    if(old){
      old.abort.abort();
      if(old.render)old.render.cancel();
      if(old.loading)void old.loading.destroy().catch(()=>{});
      content.replaceChildren();
      old.urls.forEach(url=>URL.revokeObjectURL(url));
    }else content.replaceChildren();
    content.scrollTop=0;
  }

  async function renderDocument(url){
    const current={abort:new AbortController(),loading:null,render:null,urls:[]};
    session=current;
    const active=()=>session===current&&viewer.open;
    const status=document.createElement('p');
    status.className='rda-pdf-status';
    status.setAttribute('role','status');
    status.textContent='Caricamento del regolamento…';
    content.append(status);
    content.dataset.state='loading';
    try{
      if(!pdfLibrary)pdfLibrary=import(new URL('pdf.min.mjs',vendor).href).catch(error=>{pdfLibrary=null;throw error;});
      const pdfjs=await pdfLibrary;
      if(!active())return;
      pdfjs.GlobalWorkerOptions.workerSrc=new URL('pdf.worker.min.mjs',vendor).href;
      // Un download completo: il Service Worker puo conservarlo anche offline.
      const response=await fetch(url,{signal:current.abort.signal});
      if(!response.ok)throw new Error('PDF non disponibile');
      const data=new Uint8Array(await response.arrayBuffer());
      if(!active())return;
      current.loading=pdfjs.getDocument({data,
        cMapUrl:new URL('cmaps/',vendor).href,cMapPacked:true,
        standardFontDataUrl:new URL('standard_fonts/',vendor).href,
        wasmUrl:new URL('wasm/',vendor).href,iccUrl:new URL('iccs/',vendor).href,
        isEvalSupported:false,stopAtErrors:true,canvasMaxAreaInBytes:8*1024*1024});
      current.loading.onPassword=()=>{
        current.problem='Questo PDF richiede una password. Pubblica una copia del regolamento senza password.';
        void current.loading.destroy().catch(()=>{});
      };
      const pdf=await current.loading.promise;
      if(!active())return;
      content.dataset.pages=String(pdf.numPages);
      let rendered=0;
      // Tutte le pagine, nell'ordine originale; nessun limite alla prima pagina.
      for(let number=1;number<=pdf.numPages;number++){
        if(!active())return;
        status.textContent=`Preparazione pagina ${number} di ${pdf.numPages}…`;
        const slot=document.createElement('div');
        slot.className='rda-pdf-page';
        slot.dataset.page=String(number);
        content.append(slot);
        let page=null,canvas=null;
        try{
          page=await pdf.getPage(number);
          if(!active())return;
          const original=page.getViewport({scale:1});
          const width=Math.max(1,slot.clientWidth);
          const viewport=page.getViewport({scale:width/original.width});
          // Un solo canvas attivo. Limite di pixel, non di pagine/contenuto.
          const density=Math.min(window.devicePixelRatio||1,2,
            Math.sqrt(2000000/(viewport.width*viewport.height)),
            4096/viewport.width,4096/viewport.height);
          canvas=document.createElement('canvas');
          canvas.width=Math.max(1,Math.floor(viewport.width*density));
          canvas.height=Math.max(1,Math.floor(viewport.height*density));
          current.render=page.render({canvasContext:canvas.getContext('2d'),viewport,
            transform:[density,0,0,density,0,0],background:'#ffffff'});
          await current.render.promise;
          current.render=null;
          if(!active())return;
          const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('Pagina non convertita')),'image/png'));
          if(!active())return;
          const image=document.createElement('img');
          const blobUrl=URL.createObjectURL(blob);
          current.urls.push(blobUrl);
          image.alt=`Regolamento Ufficiale — pagina ${number} di ${pdf.numPages}`;
          image.width=canvas.width;image.height=canvas.height;
          image.style.aspectRatio=`${original.width} / ${original.height}`;
          image.loading='lazy';image.decoding='async';image.src=blobUrl;
          slot.append(image);
          slot.dataset.rendered='true';
          rendered++;
        }catch(error){
          if(!active())return;
          slot.textContent=`Impossibile visualizzare la pagina ${number}. Chiudi e riapri il regolamento per riprovare.`;
          slot.classList.add('rda-pdf-error');
        }finally{
          current.render=null;
          if(canvas){canvas.width=0;canvas.height=0;}
          if(page)page.cleanup();
        }
        // Lascia reagire scroll, gesture e pulsante X anche su documenti lunghi.
        await new Promise(resolve=>setTimeout(resolve,0));
      }
      if(!active())return;
      status.textContent=rendered===pdf.numPages?`${rendered} pagine — documento completo`:`Visualizzate ${rendered} pagine su ${pdf.numPages}. Alcune pagine non sono state caricate.`;
      content.dataset.state=rendered===pdf.numPages?'ready':'error';
      await current.loading.destroy();
      current.loading=null;
    }catch(error){
      if(!active())return;
      status.textContent=current.problem||'Impossibile caricare il regolamento. Se sei offline, aprilo prima con una connessione disponibile, poi riprova.';
      content.dataset.state='error';
      if(current.loading){void current.loading.destroy().catch(()=>{});current.loading=null;}
    }
  }

  document.addEventListener('click',event=>{
    const link=event.target.closest('a.regulation-btn');
    if(!link||event.defaultPrevented||event.button!==0)return;
    event.preventDefault();
    if(viewer.open)return;
    opener=link;
    previousScroll={left:window.scrollX,top:window.scrollY};
    previousOverflow=document.body.style.overflow;
    const pdfUrl=new URL(link.href);
    pdfUrl.hash='';
    stopRendering();
    delete content.dataset.pages;
    viewer.showModal();
    document.body.style.overflow='hidden';
    close.focus({preventScroll:true});
    void renderDocument(pdfUrl.href);
  });
  close.addEventListener('click',()=>viewer.close());
  viewer.addEventListener('close',()=>{
    stopRendering();
    delete content.dataset.state;
    delete content.dataset.pages;
    document.body.style.overflow=previousOverflow;
    if(opener&&opener.isConnected)opener.focus({preventScroll:true});
    window.scrollTo({...previousScroll,behavior:'instant'});
    opener=null;
  });
}
setupRegulationViewer();
function rankClass(p){return p===1?'p1':p===2?'p2':p===3?'p3':''}
function statusHtml(s){return `<span class="status">${s||'—'}</span>`}
function table(rows,cols,empty='Nessun dato ufficiale pubblicato'){
  if(!rows.length)return emptyState(empty);
  return `<table class="rtable"><thead><tr>${cols.map(c=>`<th class="${c.cls||''}">${c.label}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${cols.map(c=>`<td class="${c.cls||''}">${c.render?c.render(r):(r[c.key]??'—')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

let calendarCursor=null,selectedRace=null;
function parseISO(s){const [y,m,d]=(s||'').split('-').map(Number);return {y,m,d}}
function latestRace(){const a=arr('completedRaces');return a.length?a[a.length-1]:null}

// v4.2.55 - libreria sagome circuiti RDA: usa tracks.json + alias GT7
let trackMapCatalog=[];
const trackAliases={
 'laguna seca':'weathertech raceway laguna seca','weathertech raceway laguna seca':'weathertech raceway laguna seca',
 'le mans':'24 heures du mans racing circuit','circuit de la sarthe':'24 heures du mans racing circuit',
 'nurburgring 24h':'nurburgring 24h','nürburgring 24h':'nurburgring 24h','nurburgring gp':'nurburgring gp','nürburgring gp':'nurburgring gp',
 'suzuka':'suzuka circuit','suzuka circuit':'suzuka circuit','interlagos':'autodromo de interlagos',
 'monza':'autodromo nazionale monza','brands hatch':'brands hatch grand prix circuit',
 'dragon trail giardini':'dragon trail gardens','dragon trail - giardini':'dragon trail gardens',
 'fishermans ranch reverse':'fishermans ranch','fishermans ranch':'fishermans ranch',
 'lake louise long track reverse':'lake louise long track','lake louise tri-oval':'lake louise tri oval'
};
function normTrack(v){return (v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
function mapFileForTrack(name){const n=normTrack(name), wanted=normTrack(trackAliases[n]||n);if(!wanted)return '';
 let x=trackMapCatalog.find(t=>normTrack(t.name)===wanted);
 if(!x)x=trackMapCatalog.find(t=>{const z=normTrack(t.name);return z.includes(wanted)||wanted.includes(z)});
 return x?`track_maps/${x.file}`:'';
}
function trackMapHtml(name){const f=mapFileForTrack(name);return f?`<img class="real-track-map" src="${f}" alt="Sagoma ${name}">`:''}
fetch('track_maps/tracks.json').then(r=>r.ok?r.json():[]).then(x=>{trackMapCatalog=Array.isArray(x)?x:[];renderCalendar();renderHome();renderTrackRecords();}).catch(()=>{});

function renderCalendar(){
  const races=arr('completedRaces'),future=arr('futureRaces');
  if(!calendarCursor){const lr=latestRace(),nr=future[0],now=new Date();calendarCursor=nr?{y:nr.year,m:nr.month}:lr?{y:lr.year,m:lr.month}:{y:now.getFullYear(),m:now.getMonth()+1}}
  $('#monthTitle').textContent=`${months[calendarCursor.m-1]} ${calendarCursor.y}`;$('#calendarYearPill').textContent=calendarCursor.y;
  const first=new Date(Date.UTC(calendarCursor.y,calendarCursor.m-1,1)),days=new Date(Date.UTC(calendarCursor.y,calendarCursor.m,0)).getUTCDate(),prevDays=new Date(Date.UTC(calendarCursor.y,calendarCursor.m-1,0)).getUTCDate(),start=(first.getUTCDay()+6)%7;let html='';
  for(let i=0;i<42;i++){let y=calendarCursor.y,m=calendarCursor.m,d,out=false;if(i<start){d=prevDays-start+i+1;out=true;m--;if(m===0){m=12;y--}}else if(i>=start+days){d=i-start-days+1;out=true;m++;if(m===13){m=1;y++}}else d=i-start+1;const rr=races.find(r=>r.year===y&&r.month===m&&r.day===d),dayFuture=future.filter(r=>r.year===y&&r.month===m&&r.day===d),fr=dayFuture[0],ev=rr||fr;html+=`<button type="button" class="day-cell ${out?'out':''} ${rr?'has-race':''} ${fr?'has-future':''}" ${ev?`data-event="${ev.eventId}" data-kind="${fr?'future':'done'}" data-date="${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}"`:''}>${d}</button>`}
  $('#monthGrid').innerHTML=html;$$('#monthGrid [data-event]').forEach(b=>b.addEventListener('click',()=>b.dataset.kind==='future'?selectFutureDate(b.dataset.date):selectRace(Number(b.dataset.event))));
}

function selectRace(id,rerender=true){
  const races=arr('completedRaces'), r=races.find(x=>x.eventId===id);
  if(!r)return;
  selectedRace=r;
  $('#raceDetail').innerHTML=`<div class="detail-top">
    <div class="detail-date"><strong>${String(r.day).padStart(2,'0')}</strong><span>${shortMonths[r.month-1]}</span><span>${r.year}</span></div>
    <div class="detail-meta"><div class="eyebrow">${r.master?`RDA MASTER ${r.master}`:'RDA'}</div><h3>${r.title}</h3><p>${r.round?`Round ${r.round}`:'Gara ufficiale'} • ${r.championship}</p><p>🏁 ${r.track}</p></div>
  </div><div class="track-visual">${trackMapHtml(r.track)}<div class="track-name"><small>CIRCUITO</small><strong>${r.track}</strong></div></div>`;
  $$('.race-row').forEach(x=>x.classList.toggle('selected',Number(x.dataset.event)===id));
  if(rerender) renderCalendar();
}

function futureRaceCard(r){const reg=r.regulation?`<a class="regulation-btn" href="${r.regulation.file}" target="_blank" rel="noopener">📖 ${r.regulation.label||'REGOLAMENTO UFFICIALE'}</a>`:'';return `<div class="future-race-card"><div class="detail-top"><div class="detail-date future-date"><strong>${String(r.day).padStart(2,'0')}</strong><span>${shortMonths[r.month-1]}</span><span>${r.year}</span></div><div class="detail-meta"><div class="eyebrow">${r.master?`RDA MASTER ${r.master}`:'RDA'}</div><h3>${r.title||r.championship||'Gara futura'}</h3><p>${typeof r.round==='string' && r.round.trim() && !Number.isFinite(Number(r.round))?`Round ${r.round.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}`:(r.gara?`Gara ${r.gara}`:(r.round?`Round ${r.round}`:'Prossimo appuntamento'))} • ${r.championship||'RDA'}</p><p>🏁 <strong>${r.track||'Circuito da definire'}</strong></p>${reg}</div></div><div class="track-visual future-track">${trackMapHtml(r.track)}<div class="track-name"><small>CIRCUITO</small><strong>${r.track||'Circuito da definire'}</strong></div></div></div>`}
function selectFutureDate(date){const rs=arr('futureRaces').filter(r=>`${r.year}-${String(r.month).padStart(2,'0')}-${String(r.day).padStart(2,'0')}`===date);if(!rs.length)return;$('#raceDetail').innerHTML=`<div class="future-badge">● ${rs.length>1?rs.length+' GARE FUTURE':'PROSSIMA GARA'}</div>${rs.map(futureRaceCard).join('')}`}
function selectFutureRace(id){const r=arr('futureRaces').find(x=>x.eventId===id);if(!r)return;selectFutureDate(`${r.year}-${String(r.month).padStart(2,'0')}-${String(r.day).padStart(2,'0')}`)}

let completedExpanded=false;

function renderCompleted(){
  const races=[...arr('completedRaces')].sort((a,b)=>b.isoDate.localeCompare(a.isoDate));
  const visibleRaces=completedExpanded?races:races.slice(0,5);

  const raceHtml=visibleRaces.map(r=>`<div class="race-row" data-event="${r.eventId}">
    <div class="rdate">${String(r.day).padStart(2,'0')} ${shortMonths[r.month-1]} ${r.year}</div>
    <div><strong>${r.title}</strong><br><small>${r.master?`RDA MASTER ${r.master}`:r.championship}</small></div>
    <div class="round-col">${r.round?`Round ${r.round}`:'Gara'}</div>
    <div class="track-col">⌁ &nbsp; ${r.track}</div><span class="official">UFFICIALE</span></div>`).join('');

  const toggleHtml=races.length>5
    ? `<button type="button" id="completedToggle" class="regulation-btn" style="width:100%;margin-top:10px">
        ${completedExpanded?'RIDUCI ELENCO':`MOSTRA TUTTE LE GARE (${races.length})`}
       </button>`
    : '';

  $('#completedList').innerHTML=races.length
    ? raceHtml+toggleHtml
    : emptyState('Nessuna gara disputata pubblicata');

  $$('#completedList .race-row').forEach(x=>
    x.addEventListener('click',()=>openRaceResult(Number(x.dataset.event)))
  );

  const toggle=$('#completedToggle');
  if(toggle){
    toggle.addEventListener('click',()=>{
      completedExpanded=!completedExpanded;
      renderCompleted();
    });
  }
}
function renderFlyers(){
  const flyers=arr('flyers'), box=$('#flyerGallery');
  box.innerHTML=flyers.length?flyers.map(f=>`<button type="button" class="flyer-card" data-flyer="${f.id}"><img src="${f.image}" alt="Volantino ${f.label}"><strong>${f.label}</strong><small>Volantino ufficiale RDA</small></button>`).join(''):emptyState('Nessun volantino pubblicato');
  $$('.flyer-card').forEach(b=>b.addEventListener('click',()=>{const f=flyers.find(x=>x.id===b.dataset.flyer);if(!f)return;$('#flyerViewerTitle').textContent=f.label;$('#flyerViewerImage').src=f.image;$('#flyerViewer').hidden=false;$('#flyerViewer').scrollIntoView({behavior:'smooth',block:'start'})}));
}


let selectedChampionshipId=null, expandedChampionshipId=null;

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
  const n=Number(id);
  selectedChampionshipId=n;
  expandedChampionshipId=(Number(expandedChampionshipId)===n?null:n);
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
  const racesBox=$('#championshipRaces'), racesPanel=racesBox?racesBox.closest('.champ-races-panel'):null;
  if(Number(expandedChampionshipId)===Number(c.id)){ renderChampionshipRaces(c); if(racesPanel)racesPanel.hidden=false; }
  else if(racesPanel){ racesPanel.hidden=true; }
  $('#championshipTable').innerHTML=table(c.standings||[],[
    {label:'#',render:r=>`<span class="pos ${rankClass(r.pos)}">${r.pos}</span>`},
    {label:'Pilota',key:'name'},
    {label:'Gare',key:'races',cls:'hide-mobile'},
    {label:'Vittorie',key:'wins',cls:'hide-mobile'},
    {label:'Punti',render:r=>`<strong>${r.pts}</strong>`}
  ],'Nessun pilota classificato');
}


function renderSelectedRace(index=0){const a=arr('raceArchive'),r=a[index];if(!r)return;$('#resultChamp').textContent=r.championship||'—';$('#resultRace').textContent=r.gara?`Gara ${r.gara}`:'—';$('#resultDate').textContent=r.date||'—';$('#resultTrack').textContent=r.track||'Circuito non indicato';$('#resultMaster').textContent=r.master?`RDA MASTER ${r.master}`:'—';const cols=[{label:'#',render:x=>`<span class="pos ${rankClass(x.pos)}">${x.pos}</span>`},{label:'Pilota',key:'name'},{label:'Auto',key:'car',cls:'hide-mobile'},{label:'Sessione',key:'session'},{label:'Tempo',render:r=>rdaPenaltyTime(r)},{label:'Stato',render:x=>statusHtml(x.status)}];$('#resultsTable').innerHTML=table(r.results||[],cols,'Nessun risultato per questa gara');$('#podium').innerHTML=(r.results||[]).slice(0,3).map((x,i)=>`<div class="pod-card ${['first','second','third'][i]}"><div class="pod-rank">P${x.pos}</div><div class="pod-name">${x.name}</div><div class="pod-time">${x.time}</div></div>`).join('')}
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
  const resultCols=[{label:'#',render:r=>`<span class="pos ${rankClass(r.pos)}">${r.pos}</span>`},{label:'Pilota',key:'name'},{label:'Auto',key:'car',cls:'hide-mobile'},{label:'Sessione',key:'session'},{label:'Tempo',render:r=>rdaPenaltyTime(r)},{label:'Stato',render:r=>statusHtml(r.status)}];
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

  function renderDrivers(q=''){const f=drivers.filter(d=>d.name.toLowerCase().includes(q.toLowerCase()));$('#driverCards').innerHTML=f.length?f.map((d,i)=>`<button type="button" class="driver-card driver-open" data-driver-name="${d.name.replace(/&/g,'&amp;').replace(/"/g,'&quot;')}"><h3>${d.name}</h3><div class="mini"><span>Gare <b>${d.races}</b></span><span>Vittorie <b>${d.wins}</b></span><span>Podi <b>${d.podiums}</b></span><span>Ranking <b>${d.elo}</b></span></div><small>Apri Carta Pilota RDA ›</small></button>`).join(''):emptyState('Nessun pilota trovato'); $$('.driver-open').forEach(b=>b.onclick=()=>openDriverCard(b.dataset.driverName))}
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


// ================= RDA v4.2.53 =================
function renderChampionshipRaces(c){
 const box=$('#championshipRaces');if(!box)return;const a=(D.championshipRaces||{})[String(c.id)]||[];
 box.innerHTML=a.length?a.map(r=>`<button type="button" class="champ-race-btn" data-event="${r.eventId}"><b>${r.gara?`Gara ${r.gara}`:'Gara ufficiale'}</b><span>${r.date||''} • ${r.track||'Circuito non indicato'}</span><em>Apri risultati ›</em></button>`).join(''):emptyState('Nessuna gara ufficiale pubblicata');
 $$('#championshipRaces [data-event]').forEach(b=>b.onclick=()=>openRaceResult(b.dataset.event));
}
function openDriverCard(name){const d=arr('drivers').find(x=>x.name===name);if(!d)return;const pods=d.championshipPodiums||[],titles=d.titles||[];$('#driverIdentityCard').innerHTML=`<div class="identity-top"><div><div class="eyebrow">🪪 CARTA PILOTA RDA</div><h2>${d.name}</h2><p>${d.nicknameSecondary?`Nickname secondario: <b>${d.nicknameSecondary}</b><br>`:''}${d.nicknameRacing?`Reparto Corse: <b>${d.nicknameRacing}</b>`:''}</p></div><div class="identity-rank"><small>RANKING RDA</small><b>${d.ranking??d.elo??'—'}</b></div></div><div class="identity-stats"><span>Gare ufficiali <b>${d.races||0}</b></span><span>Vittorie gara <b>${d.wins||0}</b></span><span>Podi gara <b>${d.podiums||0}</b></span><span>Campionati vinti <b>${titles.length}</b></span></div>${rdaLicenceCard(d)}<h3>🏆 Palmares campionati</h3>${pods.length?pods.map(x=>`<div class="palmares-row"><b>${x.pos==1?'🥇':x.pos==2?'🥈':'🥉'} ${x.championship}</b><span>${x.pos}° finale${x.master?` • Master ${x.master}`:''}</span></div>`).join(''):emptyState('Nessun podio finale di campionato')}`;go('drivercard')}
function renderTrackRecords(q=''){const a=arr('trackRecords').filter(x=>x.track.toLowerCase().includes(q.toLowerCase()));$('#trackRecordCards').innerHTML=a.length?a.map(x=>`<article class="record-card panel"><div class="record-map"><img src="${mapFileForTrack(x.track)}" alt="Sagoma ${x.track}" onerror="this.style.display='none';this.nextElementSibling.style.display='block'"><span style="display:none">Sagoma non disponibile</span></div><div><div class="eyebrow">RECORD RDA</div><h3>${x.track}</h3><strong class="record-time">${x.time}</strong><p>🏎️ ${x.driver}<br>${x.car}<br><small>${x.championship} • ${x.date}</small></p></div></article>`).join(''):emptyState('Nessun record circuito disponibile')}
const trs=$('#trackRecordSearch');if(trs)trs.addEventListener('input',e=>renderTrackRecords(e.target.value));
setTimeout(()=>renderTrackRecords(),0);
// Barra inferiore intelligente: soprattutto in landscape
const nav=document.querySelector('.bottom-nav'),reveal=$('#navReveal');let lastY=window.scrollY,navTimer;
function setNavHidden(v){if(!nav||!reveal)return;nav.classList.toggle('smart-hidden',v);reveal.classList.toggle('show',v)}
function landscapeAuto(){clearTimeout(navTimer);if(matchMedia('(orientation: landscape)').matches)navTimer=setTimeout(()=>setNavHidden(true),300000);else setNavHidden(false)}
if(reveal)reveal.onclick=()=>{setNavHidden(false);landscapeAuto()};
window.addEventListener('scroll',()=>{const y=window.scrollY;if(y>lastY+8&&y>80)setNavHidden(true);else if(y<lastY-8)setNavHidden(false);lastY=y},{passive:true});
window.addEventListener('orientationchange',landscapeAuto);landscapeAuto();

// Patch separata Penalità RDA rev.2: solo dati pubblici, nessuna nota interna.
function rdaEscape(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function rdaPenaltyTime(r){
  const status=String(r.status||'').trim();
  const lapped=/^\+?\s*[1-9]\d*\s*(?:gir[oi]|laps?)$/i.test(status);
  const time=rdaEscape(lapped&&(!r.time||r.time==='—')?status:(r.time||'—'));
  if(!r.rdaLabel)return time;
  const original=Number(r.rdaSeconds)>0&&r.originalTime?`<br><small>Senza RDA: ${rdaEscape(r.originalTime)}</small>`:'';
  return `<span style="white-space:normal">${time}<br><small>${rdaEscape(r.rdaLabel)}</small>${original}</span>`;
}
function rdaLicenceCard(d){
  const p=Number(d.rdaLicencePoints??10), n=Number(d.rdaPenaltyCount??0);
  const points=Number.isFinite(p)?Math.max(0,Math.min(10,Math.trunc(p))):10;
  const count=Number.isFinite(n)?Math.max(0,Math.trunc(n)):0;
  return `<h3>Patente RDA</h3><div class="identity-stats"><span>Punti Patente RDA: <b>${points} / 10</b></span><span>Penalità RDA ricevute: <b>${count}</b></span></div>`;
}

// Firebase FASE 1: cancello UI isolato; dati e funzioni RDA precedenti invariati.
(function setupRdaAccessGate(){
  'use strict';
  const el=id=>document.getElementById(id);
  const gate=el('rdaAuthGate'), shell=el('rdaPrivateShell');
  if(!gate||!shell)return;
  const requestForm=el('rdaAuthRequestForm'), loginForm=el('rdaAuthLoginForm');
  // UI locale del gate: nessuna modifica all'HTML o agli stili pubblicati.
  const pasteForm=document.createElement('form');
  pasteForm.id='rdaAuthPasteForm';pasteForm.className=loginForm.className;pasteForm.hidden=true;
  const pasteFields=document.createElement('fieldset');
  const pasteLabel=document.createElement('label');
  pasteLabel.className='rda-auth-field';pasteLabel.htmlFor='rdaAuthPastedLink';
  pasteLabel.textContent='Incolla il collegamento completo ricevuto via email';
  const pasteInput=document.createElement('input');
  pasteInput.id='rdaAuthPastedLink';pasteInput.type='text';pasteInput.autocomplete='off';
  pasteInput.spellcheck=false;pasteInput.setAttribute('autocapitalize','none');
  pasteInput.setAttribute('autocorrect','off');
  const pasteSubmit=document.createElement('button');
  pasteSubmit.type='submit';pasteSubmit.className='rda-auth-submit';pasteSubmit.textContent='COMPLETA ACCESSO';
  pasteLabel.appendChild(pasteInput);pasteFields.append(pasteLabel,pasteSubmit);
  pasteForm.appendChild(pasteFields);loginForm.insertAdjacentElement('afterend',pasteForm);
  const status=el('rdaAuthStatus'), modeButton=el('rdaAuthMode');
  const refresh=el('rdaAuthRefresh'), logout=el('rdaAuthSignOut');
  const privacyVersion='2026-09-25', temporaryKey='rda.emailLink.v1';
  const returnUrl='https://rdaracemanager.github.io/rda-race-manager/';
  const config={
    apiKey:'AIzaSyAb6OQDclhfEkbJKAUWDpT8MhwqEp9EioI',
    authDomain:'rda-race-manager-c8138.firebaseapp.com',
    projectId:'rda-race-manager-c8138',
    storageBucket:'rda-race-manager-c8138.firebasestorage.app',
    messagingSenderId:'628775504971',
    appId:'1:628775504971:web:e9e8b2a0d2c0e670c1d1ce'
  };
  let A,F,auth,db,unsubscribe,session=0,revision=0,mode='login',busy=false;
  let emailLink='',draft=null,completing=false,ready=false,sentEmail='';
  function message(text,error=false){
    status.textContent=text;status.hidden=!text;status.dataset.error=String(error);
  }
  function lock(){
    const viewer=el('rdaRegulationViewer');
    if(viewer&&viewer.open)viewer.close(); // Conserva il cleanup del viewer originale.
    shell.hidden=true;shell.inert=true;shell.setAttribute('aria-hidden','true');
    shell.style.display='none';gate.hidden=false;
  }
  function unlock(){
    gate.hidden=true;shell.hidden=false;shell.inert=false;
    shell.removeAttribute('aria-hidden');shell.style.removeProperty('display');
  }
  function stop(){session++;revision++;if(unsubscribe)unsubscribe();unsubscribe=null;}
  function controls(){
    el('rdaAuthRequestFields').disabled=!ready||busy;
    el('rdaAuthLoginFields').disabled=!ready||busy;
    pasteFields.disabled=!ready||busy;
    modeButton.disabled=!ready||busy;refresh.disabled=busy;logout.disabled=busy;
  }
  function show(next,text='',error=false){
    mode=next;lock();
    requestForm.hidden=next!=='request';loginForm.hidden=next!=='login';
    pasteForm.hidden=next!=='sent';
    if(next!=='sent')pasteInput.value='';
    el('rdaAuthPending').hidden=next!=='pending';
    el('rdaAuthIntro').hidden=next!=='request';
    modeButton.hidden=!!auth?.currentUser||!!emailLink||!['login','request','sent'].includes(next);
    modeButton.textContent=next==='sent'?'Torna all’accesso / invia un nuovo link':next==='login'?'Non hai ancora un’autorizzazione? Richiedi accesso':'Hai già un’autorizzazione RDA? Accedi';
    refresh.hidden=next!=='error'&&next!=='pending';
    logout.hidden=!auth?.currentUser;
    el('rdaAuthEmail').readOnly=!!auth?.currentUser;
    if(auth?.currentUser)el('rdaAuthEmail').value=auth.currentUser.email||'';
    el('rdaAuthLoginSubmit').textContent=emailLink?'CONFERMA EMAIL E ACCEDI':'INVIA LINK DI ACCESSO';
    message(text,error);controls();
  }
  function failure(error){
    const code=String(error?.code||error?.name||'errore');
    const detail={
      'auth/invalid-email':'Controlla l’indirizzo email.',
      'auth/expired-action-code':'Il link è scaduto: richiedi un nuovo link.',
      'auth/invalid-action-code':'Link non valido o già utilizzato. Richiedi un nuovo link.',
      'auth/too-many-requests':'Troppi tentativi. Attendi prima di riprovare.',
      'auth/quota-exceeded':'Limite di invio email raggiunto. Non richiedere altri link ora; attendi o contatta il team RDA.',
      'auth/unauthorized-domain':'Il dominio non è autorizzato in Firebase.',
      'permission-denied':'Firebase non consente questa operazione. Contatta il team RDA.'
    }[code]||'Accesso non verificato. Controlla la connessione e riprova.';
    return detail+' ('+code+')';
  }
  function removeTemporary(){try{localStorage.removeItem(temporaryKey);}catch(_){}}
  function readTemporary(){
    try{
      const value=JSON.parse(localStorage.getItem(temporaryKey)||'null');
      if(value&&typeof value.email==='string'&&Number.isFinite(value.at)&&Date.now()-value.at>=0&&Date.now()-value.at<86400000)return value;
    }catch(_){}
    removeTemporary();return null;
  }
  function sameEmail(a,b){return typeof a==='string'&&typeof b==='string'&&a.trim().toLowerCase()===b.trim().toLowerCase();}
  function validDraft(value,user){
    return value&&sameEmail(value.email,user.email)&&value.privacy_version===privacyVersion&&value.privacy_acknowledged===true&&
      typeof value.psn_id==='string'&&value.psn_id.trim().length>0&&value.psn_id.length<=100&&
      typeof value.nickname_secondary==='string'&&value.nickname_secondary.trim().length>0&&value.nickname_secondary.length<=100;
  }
  async function createRequest(user,value){
    if(!user.email||!user.emailVerified||!validDraft(value,user))throw new Error('Dati richiesta incompleti');
    const ref=F.doc(db,'access_requests',user.uid);
    // Transazione: crea solo se assente, senza aggiornare richieste preesistenti.
    await F.runTransaction(db,async tx=>{
      const existing=await tx.get(ref);
      if(auth.currentUser?.uid!==user.uid)throw new Error('Sessione cambiata');
      if(!existing.exists())tx.set(ref,{
        uid:user.uid,email:user.email,psn_id:value.psn_id.trim(),
        nickname_secondary:value.nickname_secondary.trim(),privacy_acknowledged:true,
        privacy_version:privacyVersion,created_at:F.serverTimestamp(),status:'PENDING'
      });
    });
  }
  function approved(snapshot){
    if(!snapshot.exists()||snapshot.metadata.fromCache||snapshot.metadata.hasPendingWrites)return false;
    const value=snapshot.data();
    // Documento gestito esclusivamente dal team RDA. Nessuna deduzione da nickname.
    return value.uid===auth.currentUser?.uid&&value.status==='APPROVED'&&
      Number.isSafeInteger(value.driver_id)&&value.driver_id>0;
  }
  function checkSession(user){
    stop();const current=session;
    if(!user){show('login');return;}
    show('checking','Verifica autorizzazione RDA…');
    const isCurrent=()=>current===session&&auth.currentUser?.uid===user.uid&&!completing;
    unsubscribe=F.onSnapshot(F.doc(db,'authorizations',user.uid),{includeMetadataChanges:true},async snapshot=>{
      if(!isCurrent())return;
      const ownRevision=++revision;
      if(snapshot.metadata.fromCache||snapshot.metadata.hasPendingWrites){
        show('error','È necessaria una connessione per verificare l’autorizzazione RDA.');return;
      }
      if(approved(snapshot)){draft=null;removeTemporary();unlock();return;}
      show('checking','Controllo richiesta di accesso…');
      try{
        const request=await F.getDocFromServer(F.doc(db,'access_requests',user.uid));
        if(!isCurrent()||ownRevision!==revision)return;
        if(!request.exists()){show('request');return;}
        draft=null;removeTemporary();
        if(request.data().status==='PENDING')show('pending','Richiesta in attesa di approvazione RDA.');
        else if(request.data().status==='APPROVED')show('error','Richiesta approvata, ma autorizzazione RDA mancante o non valida. Contatta il team RDA.',true);
        else show('error','Accesso non autorizzato. Contatta il team RDA.');
      }catch(error){if(isCurrent()&&ownRevision===revision)show('error',failure(error),true);}
    },error=>{if(isCurrent())show('error',failure(error),true);});
  }
  async function completeLink(email){
    completing=true;stop();show('checking','Verifica del link email…');
    const saved=readTemporary();
    try{
      const result=await A.signInWithEmailLink(auth,email,emailLink);
      draft=saved&&sameEmail(saved.email,result.user.email)?saved.draft:null;
      removeTemporary();emailLink='';
      const clean=new URL(location.href);
      ['apiKey','oobCode','mode','continueUrl','lang'].forEach(key=>clean.searchParams.delete(key));
      history.replaceState(history.state,'',clean.pathname+clean.search+clean.hash);
      completing=false;checkSession(result.user);
    }catch(error){
      completing=false;
      if(['auth/expired-action-code','auth/invalid-action-code'].includes(error.code)){emailLink='';removeTemporary();}
      show('login',failure(error),true);
    }
  }
  async function sendLink(email,value){
    if(auth.currentUser){checkSession(auth.currentUser);return;}
    await A.sendSignInLinkToEmail(auth,email,{url:returnUrl,handleCodeInApp:true});
    let stored=true;
    try{localStorage.setItem(temporaryKey,JSON.stringify({email,at:Date.now(),draft:value}));}catch(_){stored=false;}
    sentEmail=email;
    show('sent','Link di accesso inviato. Su iPhone: nell’email ricevuta copia il collegamento di accesso SENZA aprirlo in Safari. Torna qui, incollalo e completa l’accesso.'+
      (stored?'':' Mantieni aperta questa schermata: l’email è conservata solo per questa sessione.'));
    modeButton.hidden=false;modeButton.textContent='Torna all’accesso / invia un nuovo link';
  }
  pasteForm.addEventListener('submit',async event=>{
    event.preventDefault();
    if(!ready||busy||mode!=='sent'){pasteInput.value='';return;}
    let pastedUrl=pasteInput.value.trim();
    pasteInput.value='';
    if(auth.currentUser){pastedUrl='';checkSession(auth.currentUser);return;}
    if(!pastedUrl){message('Incolla il collegamento ricevuto via email.',true);return;}
    busy=true;controls();
    try{
      if(!sentEmail||!A.isSignInWithEmailLink(auth,pastedUrl)){
        message('Collegamento non valido. Copia il link completo ricevuto via email.',true);return;
      }
      completing=true;stop();show('checking','Verifica del link email…');
      const result=await A.signInWithEmailLink(auth,sentEmail,pastedUrl);
      pastedUrl='';sentEmail='';emailLink='';draft=null;removeTemporary();
      completing=false;checkSession(result.user);
    }catch(error){
      // Non mostrare/loggare l'errore originale: potrebbe contenere il link.
      const known=['auth/expired-action-code','auth/invalid-action-code','auth/invalid-email',
        'auth/too-many-requests','auth/quota-exceeded','auth/unauthorized-domain'];
      const text=known.includes(error?.code)?failure({code:error.code}):
        'Impossibile completare l’accesso. Verifica la connessione e che il link sia valido e non già utilizzato.';
      show('sent',text,true);
    }finally{
      pastedUrl='';pasteInput.value='';completing=false;busy=false;controls();
    }
  });
  requestForm.addEventListener('submit',async event=>{
    event.preventDefault();if(!ready||busy||mode!=='request'||!requestForm.reportValidity())return;
    const value={email:el('rdaAuthEmail').value.trim(),psn_id:el('rdaAuthPsn').value.trim(),
      nickname_secondary:el('rdaAuthNickname').value.trim(),privacy_acknowledged:el('rdaAuthPrivacy').checked,privacy_version:privacyVersion};
    if(!value.psn_id||!value.nickname_secondary){message('Compila PSN / ID e Nickname secondario.',true);return;}
    busy=true;controls();
    try{
      const user=auth.currentUser;
      if(user){await createRequest(user,value);draft=null;removeTemporary();checkSession(user);}
      else await sendLink(value.email,value);
    }catch(error){message(failure(error),true);}
    finally{busy=false;controls();}
  });
  loginForm.addEventListener('submit',async event=>{
    event.preventDefault();if(!ready||busy||mode!=='login'||!loginForm.reportValidity())return;
    busy=true;controls();
    try{
      const email=el('rdaAuthLoginEmail').value.trim();
      if(emailLink)await completeLink(email);else await sendLink(email,null);
    }catch(error){message(failure(error),true);}
    finally{busy=false;controls();}
  });
  modeButton.addEventListener('click',()=>{if(ready&&!busy&&!auth.currentUser)show(mode==='login'?'request':'login');});
  refresh.addEventListener('click',()=>{if(!ready)location.reload();else checkSession(auth.currentUser);});
  el('rdaAuthSessionExit').addEventListener('click',()=>logout.click());
  logout.addEventListener('click',async()=>{
    if(busy)return;
    busy=true;stop();lock();controls();draft=null;removeTemporary();
    try{await A.signOut(auth);show('login');}catch(error){show('error',failure(error),true);}
    finally{busy=false;controls();}
  });
  window.addEventListener('offline',()=>{stop();show('error','È necessaria una connessione per verificare l’accesso RDA.');});
  window.addEventListener('online',()=>{if(ready&&!emailLink&&!completing)checkSession(auth.currentUser);});
  async function start(){
    try{
      const modules=await Promise.all([
        import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js'),
        import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js')
      ]);
      A=modules[1];F=modules[2];const app=modules[0].initializeApp(config);
      auth=A.getAuth(app);db=F.getFirestore(app);
      await A.setPersistence(auth,A.browserLocalPersistence);
      emailLink=A.isSignInWithEmailLink(auth,location.href)?location.href:'';
      A.onAuthStateChanged(auth,async user=>{
        ready=true;
        if(completing)return;
        if(user){emailLink='';checkSession(user);return;}
        if(!emailLink){checkSession(null);return;}
        const saved=readTemporary();
        if(saved){
          busy=true;controls();
          try{await completeLink(saved.email);}finally{busy=false;controls();}
        }else show('login','Per completare l’accesso inserisci l’indirizzo email che ha ricevuto il link.');
      },error=>{ready=false;show('error',failure(error),true);});
    }catch(error){ready=false;show('error','Impossibile avviare l’accesso Firebase. Controlla la connessione e premi Verifica di nuovo.',true);}
  }
  show('checking','Ripristino della sessione RDA…');start();
})();
