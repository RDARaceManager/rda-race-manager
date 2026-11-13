const D=window.RDA_DATA||{};
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)], arr=k=>Array.isArray(D[k])?D[k]:[];
const months=['GENNAIO','FEBBRAIO','MARZO','APRILE','MAGGIO','GIUGNO','LUGLIO','AGOSTO','SETTEMBRE','OTTOBRE','NOVEMBRE','DICEMBRE'];
const shortMonths=['GEN','FEB','MAR','APR','MAG','GIU','LUG','AGO','SET','OTT','NOV','DIC'];

// Scheda auto: collegamento esclusivamente tramite ID RDA esportato.
function rdaCarLink(row){
  const name=String(row.car||'—');
  const escaped=name.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const car=arr('cars').find(c=>String(c.carId)===String(row.carId));
  return car?`<button type="button" class="rda-car-link" data-rda-car-id="${Number(car.carId)}">${escaped}</button>`:escaped;
}

// Risultati portrait: auto sotto il pilota, stessi ID e stessa scheda.
function rdaResultDriver(row){
  const name=String(row.name??'—').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const car=row.car&&row.car!=='—'?`<span class="rda-result-car">${rdaCarLink(row)}</span>`:'';
  return `<span class="rda-result-driver-name">${name}</span>${car}`;
}

// Risultati portrait: tempo finale e dettagli secondari nella stessa cella.
function rdaResultTime(row){
  const escape=value=>String(value??'—').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  return `<span class="rda-result-session-wide">${escape(row.session)}</span><span class="rda-result-time-portrait"><strong>${rdaPenaltyTime(row)}</strong><small>Sessione ${escape(row.session)} <span>·</span> ${statusHtml(row.status)}</small></span>`;
}

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
fetch('track_maps/tracks.json').then(r=>r.ok?r.json():[]).then(x=>{trackMapCatalog=Array.isArray(x)?x:[];renderCalendar();renderHome();renderTrackRecords();renderRaceBestLaps();}).catch(()=>{});

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
  const viewer=$('#flyerViewer'), title=$('#flyerViewerTitle'), image=$('#flyerViewerImage');
  viewer.hidden=true;
  image.removeAttribute('src');
  box.replaceChildren();
  if(!flyers.length){
    box.innerHTML=emptyState('Nessun volantino pubblicato');
    return;
  }
  for(const flyer of flyers){
    const button=document.createElement('button');
    button.type='button';
    button.className='flyer-card';
    const thumbnail=document.createElement('img');
    thumbnail.src=flyer.image;
    thumbnail.alt='Volantino '+flyer.label;
    const label=document.createElement('strong');
    label.textContent=flyer.label;
    const caption=document.createElement('small');
    caption.textContent='Volantino ufficiale RDA';
    button.append(thumbnail,label,caption);
    button.addEventListener('click',()=>{
      title.textContent=label.textContent;
      image.src=thumbnail.src;
      image.alt=thumbnail.alt;
      viewer.hidden=false;
      viewer.scrollIntoView({behavior:'smooth',block:'start'});
    });
    box.append(button);
  }
}


let rdaChampionshipFocusDriver=null;
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
  rdaHighlightChampionshipPilot();
}


function renderRacePoints(race){
  const box=$('#rdaRacePoints');
  if(!box)return;
  const rows=race.results||[];
  box.replaceChildren();
  if(!rows.some(row=>Number.isFinite(row.points))){
    box.textContent='Punti di gara non disponibili nei dati pubblicati.';
    return;
  }
  const heading=document.createElement('h3');
  heading.className='race-points-heading';
  heading.textContent=race.gara?'Punti assegnati · Gara '+race.gara:'Punti assegnati';
  box.append(heading);
  const grid=document.createElement('table');
  const headings=grid.createTHead().insertRow();
  ['Pos.','Pilota','Punti gara'].forEach(label=>{
    const cell=document.createElement('th');cell.scope='col';cell.textContent=label;headings.append(cell);
  });
  const body=grid.createTBody();
  rows.forEach(row=>{
    const line=body.insertRow();
    if(Number(row.pos)===1)line.className='race-points-leader';
    line.insertCell().textContent=row.pos;
    line.insertCell().textContent=row.name;
    const score=document.createElement('span');
    score.className='race-points-score';
    score.textContent=Number.isFinite(row.points)?row.points+' pt':'—';
    line.insertCell().append(score);
  });
  box.append(grid);
}
function setupRaceResultModes(){
  const modes=$('#rdaRaceResultModes');
  if(!modes)return;
  const points=$('#rdaRacePoints'),results=$('#rdaRaceDayResults');
  const buttons=Array.from(modes.querySelectorAll('[data-race-mode]'));
  buttons.forEach(button=>button.addEventListener('click',()=>{
    const showPoints=button.dataset.raceMode==='points';
    points.hidden=!showPoints;
    points.style.display=showPoints?'':'none';
    results.hidden=showPoints;
    results.style.display=showPoints?'none':'';
    buttons.forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
  }));
}
setupRaceResultModes();
function renderSelectedRace(index=0){const a=arr('raceArchive'),r=a[index];if(!r)return;renderRacePoints(r);$('#resultChamp').textContent=r.championship||'—';$('#resultRace').textContent=r.gara?`Gara ${r.gara}`:'—';$('#resultDate').textContent=r.date||'—';$('#resultTrack').textContent=r.track||'Circuito non indicato';$('#resultMaster').textContent=r.master?`RDA MASTER ${r.master}`:'—';const cols=[{label:'#',render:x=>`<span class="pos ${rankClass(x.pos)}">${x.pos}</span>`},{label:'Pilota',render:r=>rdaResultDriver(r),cls:'rda-result-driver'},{label:'Auto',render:r=>rdaCarLink(r),cls:'hide-mobile'},{label:'<span class="rda-result-session-wide">Sessione</span><span class="rda-result-time-portrait">Tempo finale</span>',render:r=>rdaResultTime(r),cls:'rda-result-time-cell'},{label:'Tempo',render:r=>rdaPenaltyTime(r)},{label:'Stato',render:x=>statusHtml(x.status)}];$('#resultsTable').innerHTML=table(r.results||[],cols,'Nessun risultato per questa gara');$('#podium').innerHTML=(r.results||[]).slice(0,3).map((x,i)=>`<div class="pod-card ${['first','second','third'][i]}"><div class="pod-rank">P${x.pos}</div><div class="pod-name">${x.name}</div><div class="pod-time">${x.time}</div></div>`).join('')}
function setupRaceArchive(){const a=arr('raceArchive'),s=$('#raceResultSelect');if(!s)return;s.innerHTML=a.length?a.map((r,i)=>`<option value="${i}">${r.date} • ${r.championship} • Gara ${r.gara} • ${r.track}</option>`).join(''):'<option>Nessuna gara ufficiale</option>';s.onchange=()=>renderSelectedRace(Number(s.value));if(a.length)renderSelectedRace(0)}
function openRaceResult(eventId){go('results');const a=arr('raceArchive'),i=a.findIndex(r=>Number(r.eventId)===Number(eventId)),s=$('#raceResultSelect');if(s&&i>=0){s.value=String(i);renderSelectedRace(i)}}

let selectedRacePodiumChamp=null,selectedFinalPodiumChamp=null;
function racePodiumStageRDA(rows){const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
return `<div class="race-stage"><div class="drivers">${[rows[1],rows[0],rows[2]].filter(Boolean).map(r=>{const cls=r.pos==1?'gold':r.pos==3?'bronze':'';const image=r.pos==1&&typeof r.car_image==='string'&&/^car_images\/car_[0-9]+\.webp$/.test(r.car_image)?r.car_image:'';return `<article class="driver ${cls}"><div class="identity"><span class="place">${esc(r.pos)}° CLASSIFICATO</span><strong class="name">${esc(r.name)}</strong><span class="time">${esc(r.time||'—')}</span><span class="car">${rdaCarLink(r)}</span></div>${image?`<img class="winner-car-photo" src="${esc(image)}" alt="${esc(r.car||'Auto del vincitore')}" loading="lazy">`:''}<div class="step">${esc(r.pos)}</div></article>`}).join('')}</div></div><footer class="race-footer">RDA · RACING DRIVERS ACADEMY</footer>`}
function bindRacePodiumPhotosRDA(){document.querySelectorAll('#podiumDayFull .winner-car-photo').forEach(img=>img.addEventListener('error',()=>img.remove(),{once:true}))}
function podiumStageRDA(rows,championship=false){if(!rows||!rows.length)return emptyState(championship?'Podio finale non disponibile':'Nessun podio gara ufficiale');if(!championship)return racePodiumStageRDA(rows);const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); const winner=rows.find(r=>Number(r.pos)===1)||rows[0];return `<div class="ceremony"><canvas class="fireworks" aria-hidden="true"></canvas><button class="motion-control" type="button">Ferma i fuochi d’artificio</button><article class="winner-main"><svg class="trophy" viewBox="0 0 100 110" aria-hidden="true"><defs><linearGradient id="gold" x1="0" x2="1"><stop stop-color="#886025"/><stop offset=".45" stop-color="#ffe6a0"/><stop offset="1" stop-color="#b98a32"/></linearGradient></defs><g fill="url(#gold)"><path d="M28 9H72L67 44Q63 59 50 61Q37 59 33 44Z"/><path d="M45 60H55V86H45Z"/><path d="M33 86H67L73 99H27Z"/><rect x="22" y="99" width="56" height="7" rx="2"/></g><g fill="none" stroke="url(#gold)" stroke-width="7"><path d="M29 16H14V30Q14 48 36 48"/><path d="M71 16H86V30Q86 48 64 48"/></g><path d="M43 15H49L46 45H40Z" fill="#fff3c377"/></svg><div class="champ-title">CAMPIONE RDA</div><div class="winner-name">${esc(winner.name)}</div><div class="season-title">CLASSIFICA FINALE UFFICIALE</div><div class="score"><strong>${esc(winner.pts??0)}</strong><span>PUNTI FINALI</span></div></article><div class="honours">${rows.filter(r=>Number(r.pos)!==1).slice(0,2).map(r=>`<article class="honour ${Number(r.pos)===3?'bronze':''}"><span class="place">${esc(r.pos)}° · ${Number(r.pos)===2?'VICECAMPIONE':'TERZO POSTO'}</span><strong>${esc(r.name)}</strong><div class="points">${esc(r.pts??0)}<small>PUNTI</small></div></article>`).join('')}</div><div class="final-foot">RDA · HALL OF CHAMPIONS</div></div>`;}
function renderPodiumsByChampionship(){
 const races=arr('podiumsByChampionship'),rs=$('#racePodiumSelector');
 if(rs){if(races.length){if(selectedRacePodiumChamp===null||!races.some(x=>Number(x.championshipId)===Number(selectedRacePodiumChamp)))selectedRacePodiumChamp=Number(races[0].championshipId);rs.innerHTML=races.map(x=>`<button class="champ-choice ${Number(x.championshipId)===Number(selectedRacePodiumChamp)?'active':''}" data-rp="${x.championshipId}"><strong>${x.championship}</strong><small>${x.master?`RDA MASTER ${x.master}`:'RDA'} • ultima gara</small></button>`).join('');$$('#racePodiumSelector [data-rp]').forEach(b=>b.onclick=()=>{selectedRacePodiumChamp=Number(b.dataset.rp);renderPodiumsByChampionship()});const x=races.find(v=>Number(v.championshipId)===Number(selectedRacePodiumChamp));$('#racePodiumArena').style.display='block';$('#podiumDayTitle').textContent=x.title||x.championship;$('#podiumDayMeta').textContent=[x.gara?`Gara ${x.gara}`:'Gara',x.date,x.track].filter(Boolean).join(' • ');$('#podiumDayFull').innerHTML=podiumStageRDA(x.rows,false);bindRacePodiumPhotosRDA()}else{rs.innerHTML=emptyState('Nessuna gara ufficiale pubblicata');$('#racePodiumArena').style.display='none'}}
 const finals=arr('finalPodiumsByChampionship'),fs=$('#finalPodiumSelector');
 if(fs){if(finals.length){if(selectedFinalPodiumChamp===null||!finals.some(x=>Number(x.championshipId)===Number(selectedFinalPodiumChamp)))selectedFinalPodiumChamp=Number(finals[0].championshipId);fs.innerHTML=finals.map(x=>`<button class="champ-choice ${Number(x.championshipId)===Number(selectedFinalPodiumChamp)?'active':''}" data-fp="${x.championshipId}"><strong>${x.championship}</strong><small>${x.master?`RDA MASTER ${x.master}`:'RDA'} • FINALE UFFICIALE</small></button>`).join('');$$('#finalPodiumSelector [data-fp]').forEach(b=>b.onclick=()=>{selectedFinalPodiumChamp=Number(b.dataset.fp);renderPodiumsByChampionship()});const x=finals.find(v=>Number(v.championshipId)===Number(selectedFinalPodiumChamp));$('#finalPodiumArena').style.display='block';$('#podiumChampTitle').textContent=x.championship;$('#podiumChampMeta').textContent=`${x.master?`MASTER ${x.master} • `:''}FINALE UFFICIALE`;$('#podiumChampFull').innerHTML=podiumStageRDA(x.rows,true);startPodiumFireworksRDA()}else{fs.innerHTML=emptyState('Nessun campionato ancora concluso');$('#finalPodiumArena').style.display='none'}}
}
function render(){
 renderRdaRegulations();
 renderRdaBriefing();
 renderRdaNews();
  renderRdaHallOfFame();
  const day=arr('dayResults'), champ=arr('championship'), elo=arr('elo'), drivers=arr('drivers'), teams=arr('teams'), cons=arr('constructors');
  const meta=D.meta||{}, pday=arr('podiumDay'), pchamp=arr('podiumChampionship'), pm=D.podiumMeta||{};
  const resultCols=[{label:'#',render:r=>`<span class="pos ${rankClass(r.pos)}">${r.pos}</span>`},{label:'Pilota',render:r=>rdaResultDriver(r),cls:'rda-result-driver'},{label:'Auto',render:r=>rdaCarLink(r),cls:'hide-mobile'},{label:'<span class="rda-result-session-wide">Sessione</span><span class="rda-result-time-portrait">Tempo finale</span>',render:r=>rdaResultTime(r),cls:'rda-result-time-cell'},{label:'Tempo',render:r=>rdaPenaltyTime(r)},{label:'Stato',render:r=>statusHtml(r.status)}];
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
function openDriverCard(name){const d=arr('drivers').find(x=>x.name===name);if(!d)return;renderDriverCard(d)}
function openDriverCardById(driverId){
  if(!Number.isSafeInteger(driverId)||driverId<=0)return false;
  const matches=arr('drivers').filter(d=>d.driver_id===driverId);
  if(matches.length!==1)return false;
  renderDriverCard(matches[0]);return true;
}
// Match published standings to the canonical pilot selected by the account.
// Older exports have only canonical names: accept those only when unambiguous.
function rdaStandingForPilot(championship,driver,drivers){
  if(!driver||!Number.isSafeInteger(driver.driver_id)||driver.driver_id<=0)return null;
  const canonical=drivers.filter(d=>d.driver_id===driver.driver_id);
  if(canonical.length!==1)return null;
  const rows=Array.isArray(championship.standings)?championship.standings:[];
  const uniqueName=drivers.filter(d=>d.name===driver.name).length===1;
  const matches=rows.filter(row=>{
    const id=row.driver_id??row.driverId;
    return id!=null?Number(id)===driver.driver_id:uniqueName&&row.name===driver.name;
  });
  if(matches.length!==1)return null;
  const row=matches[0];
  if(typeof row.pts!=='number'||!Number.isFinite(row.pts)||!Number.isInteger(Number(row.pos))||Number(row.pos)<1)return null;
  return row;
}

function rdaHighlightChampionshipPilot(){
  if(!rdaChampionshipFocusDriver)return;
  const c=selectedPublicChampionship();if(!c)return;
  const row=rdaStandingForPilot(c,rdaChampionshipFocusDriver,arr('drivers'));if(!row)return;
  const index=c.standings.indexOf(row);
  const tr=document.querySelectorAll('#championshipTable tbody tr')[index];
  if(tr){tr.classList.add('rda-my-standing');tr.setAttribute('aria-label','La tua posizione in questa classifica');}
}
// Count distinct official events using the same archive as Risultati.
function rdaChampionshipParticipation(championship, driver, drivers) {
  const schedule = D.championshipRaces?.[String(championship.id)];
  if (!Array.isArray(schedule)) return null;
  const eventIds = new Set(schedule.map(race => Number(race.eventId)));
  const uniqueName = drivers.filter(entry => entry.name === driver.name).length === 1;
  const official = new Set(), entered = new Set();
  for (const race of arr('raceArchive')) {
    const id = Number(race.eventId);
    if (!Number.isSafeInteger(id) || id <= 0 || !eventIds.has(id) ||
        !Array.isArray(race.results) || !race.results.length) continue;
    official.add(id);
    const participated = race.results.some(row => {
      const pilotId = row.driver_id ?? row.driverId;
      const matches = pilotId != null ? Number(pilotId) === driver.driver_id :
        uniqueName && row.name === driver.name;
      return matches && String(row.status ?? '').trim().toUpperCase() !== 'DNS';
    });
    if (participated) entered.add(id);
  }
  return official.size ? {entered: entered.size, total: official.size} : null;
}

function rdaPilotChampionships(driver){
  const details=document.createElement('details');details.className='rda-my-championships';
  const summary=document.createElement('summary');
  const title=document.createElement('strong');title.textContent='🏁 I miei campionati';
  const hint=document.createElement('small');
  const entries=publicChampionships().map(c=>({c,row:rdaStandingForPilot(c,driver,arr('drivers'))})).filter(e=>e.row);
  const active=entries.filter(e=>!e.c.closed),closed=entries.filter(e=>e.c.closed);
  hint.textContent=active.length?active.length+' in corso · Posizione, punti e presenze':closed.length?'Campionati conclusi · Posizione, punti e presenze':'Nessuna classifica pubblicata';
  summary.append(title,hint);details.append(summary);
  const makeList=list=>{
    const container=document.createElement('div');container.className='rda-my-champs-list';
    const labels=document.createElement('div');labels.className='rda-my-champs-labels';
    for(const text of ['Campionato','Pos.','Punti','Presenze']){const s=document.createElement('span');s.textContent=text;labels.append(s);}container.append(labels);
    for(const {c,row} of list){
      const b=document.createElement('button');b.type='button';b.className='rda-my-champs-row';
      const name=document.createElement('span'),strong=document.createElement('strong'),master=document.createElement('small');
      strong.textContent=c.name;master.textContent=c.master?'RDA MASTER '+c.master:'RDA';name.append(strong,master);
      const pos=document.createElement('b');pos.textContent=row.pos+'°';
      const pts=document.createElement('b');pts.textContent=row.pts.toLocaleString('it-IT')+' ›';
      b.append(name,pos,pts);
      const participation = rdaChampionshipParticipation(c, driver, arr('drivers'));
      let presenceLabel = '';
      if (participation) {
        const {entered, total} = participation;
        const presence = document.createElement('span');
        presence.className = 'rda-my-presence';
        if (entered === total) presence.classList.add('rda-my-presence-full');
        const number = document.createElement('strong');
        number.textContent = entered + ' / ' + total;
        const caption = document.createElement('small');
        caption.textContent = 'gare corse';
        presence.append(number, caption);
        b.append(presence);
        presenceLabel = ', ' + entered + ' gare corse su ' + total;
      } else {
        const unavailable = document.createElement('span');
        unavailable.className = 'rda-my-presence';
        unavailable.textContent = '—';
        b.append(unavailable);
        presenceLabel = ', presenze non disponibili';
      }
      b.setAttribute('aria-label',c.name+': posizione '+row.pos+', '+row.pts+' punti'+presenceLabel+'. Apri classifica');
      b.onclick=()=>{
        rdaChampionshipFocusDriver=driver;selectedChampionshipId=Number(c.id);expandedChampionshipId=null;renderChampionships();go('championship');
        const marked=document.querySelector('#championshipTable .rda-my-standing');if(marked)marked.scrollIntoView({block:'center',behavior:'auto'});
      };container.append(b);
    }
    return container;
  };
  if(active.length)details.append(makeList(active));
  if(closed.length){const old=document.createElement('details'),s=document.createElement('summary');old.className='rda-my-champs-closed';s.textContent='Campionati conclusi ('+closed.length+')';old.append(s,makeList(closed));details.append(old);}
  if(!entries.length){const p=document.createElement('p');p.className='rda-my-champs-note';p.textContent='Non ci sono ancora classifiche pubblicate associate a questo pilota.';details.append(p);}
  else {const p=document.createElement('p');p.className='rda-my-champs-note';p.textContent='Dati dell’ultima pubblicazione del Manager. Tocca un campionato per aprire la classifica.';details.append(p);}
  return details;
}

function renderDriverCard(d){const pods=d.championshipPodiums||[],titles=d.titles||[];$('#driverIdentityCard').innerHTML=`<div class="identity-top"><div><div class="eyebrow">🪪 CARTA PILOTA RDA</div><h2>${d.name}</h2><p>${d.nicknameSecondary?`Nickname secondario: <b>${d.nicknameSecondary}</b><br>`:''}${d.nicknameRacing?`Reparto Corse: <b>${d.nicknameRacing}</b>`:''}</p></div><div class="identity-rank"><small>RANKING RDA</small><b>${d.ranking??d.elo??'—'}</b></div></div><div class="identity-stats"><span>Gare ufficiali <b>${d.races||0}</b></span><span>Vittorie gara <b>${d.wins||0}</b></span><span>Podi gara <b>${d.podiums||0}</b></span><span>Campionati vinti <b>${titles.length}</b></span></div>${rdaLicenceCard(d)}<h3>🏆 Palmares campionati</h3>${pods.length?pods.map(x=>`<div class="palmares-row"><b>${x.pos==1?'🥇':x.pos==2?'🥈':'🥉'} ${x.championship}</b><span>${x.pos}° finale${x.master?` • Master ${x.master}`:''}</span></div>`).join(''):emptyState('Nessun podio finale di campionato')}`;$('#driverIdentityCard .identity-top').after(rdaPilotChampionships(d));go('drivercard')}
function renderTrackRecords(q=''){if(!$('#trackRecordCards'))return;const a=arr('trackRecords').filter(x=>x.track.toLowerCase().includes(q.toLowerCase()));$('#trackRecordCards').innerHTML=a.length?a.map(x=>`<article class="record-card panel"><div class="record-map"><img src="${mapFileForTrack(x.track)}" alt="Sagoma ${x.track}" onerror="this.style.display='none';this.nextElementSibling.style.display='block'"><span style="display:none">Sagoma non disponibile</span></div><div><div class="eyebrow">RECORD RDA</div><h3>${x.track}</h3><strong class="record-time">${x.time}</strong><p>🏎️ ${x.driver}<br>${rdaCarLink(x)}<br><small>${x.championship} • ${x.date}</small></p></div></article>`).join(''):emptyState('Nessun record circuito disponibile')}
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
  const gate=el('rdaAuthGate'),shell=el('rdaPrivateShell');
  if(!gate||!shell)return;
  const requestForm=el('rdaAuthRequestForm'),loginForm=el('rdaAuthLoginForm');
  const loginFields=el('rdaAuthLoginFields'),requestFields=el('rdaAuthRequestFields');
  const status=el('rdaAuthStatus'),modeButton=el('rdaAuthMode');
  const refresh=el('rdaAuthRefresh'),logout=el('rdaAuthSignOut');
  const privacyVersion='2026-09-25';
  // Tutta la UI nuova è locale al gate; nessuna modifica a HTML/CSS.
  function input(fields,id,text,type,autocomplete){
    const label=document.createElement('label');label.className='rda-auth-field';label.htmlFor=id;label.textContent=text;
    const value=document.createElement('input');value.id=id;value.type=type;value.autocomplete=autocomplete;value.required=true;
    if(type==='email'){value.maxLength=254;value.spellcheck=false;value.setAttribute('autocapitalize','none');}
    label.appendChild(value);fields.appendChild(label);return value;
  }
  const loginEmailLabel=el('rdaAuthLoginEmail').parentElement;
  loginFields.replaceChildren(loginEmailLabel);
  const loginPassword=input(loginFields,'rdaLoginPassword','Password','password','current-password');
  const loginSubmit=document.createElement('button');loginSubmit.id='rdaAuthLoginSubmit';loginSubmit.type='submit';loginSubmit.className='rda-auth-submit';loginSubmit.textContent='ACCEDI';loginFields.appendChild(loginSubmit);
  const registerForm=document.createElement('form');registerForm.id='rdaRegisterForm';registerForm.className=loginForm.className;registerForm.hidden=true;
  const registerFields=document.createElement('fieldset');registerFields.id='rdaRegisterFields';
  const registerEmail=input(registerFields,'rdaRegisterEmail','Email','email','email');
  const registerPassword=input(registerFields,'rdaRegisterPassword','Password','password','new-password');
  const registerConfirm=input(registerFields,'rdaRegisterConfirm','Conferma password','password','new-password');
  const registerSubmit=document.createElement('button');registerSubmit.type='submit';registerSubmit.className='rda-auth-submit';registerSubmit.textContent='CREA ACCOUNT';
  registerFields.appendChild(registerSubmit);registerForm.appendChild(registerFields);loginForm.insertAdjacentElement('afterend',registerForm);
  const privacyLabel=el('rdaAuthPrivacy').parentElement;
  const privacyText=document.createElement('span');privacyText.textContent='Ho letto l’Informativa Privacy RDA e prendo atto del trattamento dei dati personali necessario alla gestione del mio account e dell’accesso a RDA Mobile.';
  privacyLabel.replaceChildren(el('rdaAuthPrivacy'),privacyText);
  el('rdaAuthEmail').readOnly=true;
  const config={
    apiKey:'AIzaSyAb6OQDclhfEkbJKAUWDpT8MhwqEp9EioI',
    authDomain:'rda-race-manager-c8138.firebaseapp.com',
    projectId:'rda-race-manager-c8138',
    storageBucket:'rda-race-manager-c8138.firebasestorage.app',
    messagingSenderId:'628775504971',
    appId:'1:628775504971:web:e9e8b2a0d2c0e670c1d1ce'
  };
  let A,F,auth,db,unsubscribe,session=0,revision=0,mode='login',busy=false,ready=false,authSubmitting=false;
  let ownCardUid=null,ownCardAttempted=false;
  function clearPasswords(){loginPassword.value='';registerPassword.value='';registerConfirm.value='';}
  function message(text,error=false){status.textContent=text;status.hidden=!text;status.dataset.error=String(error);}
  function lock(){
    const viewer=el('rdaRegulationViewer');
    if(viewer&&viewer.open)viewer.close();
    shell.hidden=true;shell.inert=true;shell.setAttribute('aria-hidden','true');shell.style.display='none';gate.hidden=false;
  }
  function unlock(){gate.hidden=true;shell.hidden=false;shell.inert=false;shell.removeAttribute('aria-hidden');shell.style.removeProperty('display');}
  function stop(){session++;revision++;if(unsubscribe)unsubscribe();unsubscribe=null;}
  function controls(){
    requestFields.disabled=!ready||busy;loginFields.disabled=!ready||busy;registerFields.disabled=!ready||busy;
    modeButton.disabled=!ready||busy;refresh.disabled=busy;logout.disabled=busy;
  }
  function show(next,text='',error=false){
    mode=next;lock();clearPasswords();
    requestForm.hidden=next!=='request';loginForm.hidden=next!=='login';registerForm.hidden=next!=='register';
    el('rdaAuthPending').hidden=next!=='pending';
    el('rdaAuthIntro').hidden=next!=='request';
    el('rdaAuthTitle').textContent=next==='request'?'RICHIESTA ACCESSO RDA':next==='register'?'CREA ACCOUNT':next==='login'?'ACCEDI':'ACCESSO RDA';
    modeButton.hidden=!!auth?.currentUser||!['login','register'].includes(next);
    modeButton.textContent=next==='register'?'ACCEDI':'CREA ACCOUNT';
    refresh.hidden=next!=='error';logout.hidden=!auth?.currentUser;
    el('rdaAuthEmail').value=auth?.currentUser?.email||'';
    message(next==='pending'?'':text,error);controls();
  }
  function failure(error){
    const messages={
      'auth/invalid-email':'Controlla l’indirizzo email.',
      'auth/invalid-credential':'Email o password non corrette.',
      'auth/user-disabled':'Account disabilitato. Contatta il team RDA.',
      'auth/email-already-in-use':'Email già utilizzata. Accedi con il tuo account.',
      'auth/weak-password':'Password non conforme ai requisiti Firebase.',
      'auth/too-many-requests':'Troppi tentativi. Attendi prima di riprovare.',
      'auth/network-request-failed':'Connessione non disponibile. Verifica la rete.',
      'auth/operation-not-allowed':'Operazione non disponibile. Contatta il team RDA.',
      'permission-denied':'Firebase non consente questa operazione. Contatta il team RDA.'
    };
    return Object.prototype.hasOwnProperty.call(messages,error?.code)?messages[error.code]:'Operazione non confermata. Contatta il team RDA.';
  }
  function validDraft(value,user){
    return value&&value.email===user.email&&value.privacy_version===privacyVersion&&value.privacy_acknowledged===true&&
      typeof value.psn_id==='string'&&value.psn_id.trim().length>0&&value.psn_id.length<=100&&
      typeof value.nickname_secondary==='string'&&value.nickname_secondary.trim().length>0&&value.nickname_secondary.length<=100;
  }
  async function createRequest(user,value){
    if(!user.email||!validDraft(value,user))throw new Error('Dati richiesta incompleti');
    const ref=F.doc(db,'access_requests',user.uid);
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
    return value.uid===auth.currentUser?.uid&&value.status==='APPROVED'&&
      (value.role==='ADMIN'||((value.role===undefined||value.role==='PILOTA')&&
      Number.isSafeInteger(value.driver_id)&&value.driver_id>0));
  }
  function checkSession(user){
    if((user?.uid||null)!==ownCardUid){ownCardUid=user?.uid||null;ownCardAttempted=false;go('home');}
    stop();const current=session;
    if(!user){show('login');return;}
    show('checking','Verifica autorizzazione RDA…');
    const isCurrent=()=>current===session&&auth.currentUser?.uid===user.uid&&!authSubmitting;
    unsubscribe=F.onSnapshot(F.doc(db,'authorizations',user.uid),{includeMetadataChanges:true},async snapshot=>{
      if(!isCurrent())return;
      const ownRevision=++revision;
      if(snapshot.metadata.fromCache||snapshot.metadata.hasPendingWrites){show('error','È necessaria una connessione per verificare l’autorizzazione RDA.');return;}
      if(approved(snapshot)){clearPasswords();requestForm.hidden=true;registerForm.hidden=true;loginForm.hidden=true;unlock();if(!ownCardAttempted){ownCardAttempted=true;if(snapshot.data().role==='ADMIN')go('home');else if(!openDriverCardById(snapshot.data().driver_id))go('home');}return;}
      if(snapshot.exists()&&snapshot.data().status==='REVOKED'){ownCardAttempted=false;show('error','Accesso non autorizzato. Contatta il team RDA.');return;}
      show('checking','Controllo richiesta di accesso…');
      try{
        const request=await F.getDocFromServer(F.doc(db,'access_requests',user.uid));
        if(!isCurrent()||ownRevision!==revision)return;
        if(!request.exists()){show('request');return;}
        if(request.data().status==='PENDING')show('pending','Richiesta in attesa di approvazione RDA.');
        else if(request.data().status==='APPROVED')show('error','Richiesta approvata, ma autorizzazione RDA mancante o non valida. Contatta il team RDA.',true);
        else show('error','Accesso non autorizzato. Contatta il team RDA.');
      }catch(error){if(isCurrent()&&ownRevision===revision)show('error',failure(error),true);}
    },error=>{if(isCurrent())show('error',failure(error),true);});
  }
  async function submitIdentity(event,creating){
    event.preventDefault();let password='';
    const form=creating?registerForm:loginForm,next=creating?'register':'login';
    let ownsBusy=false;
    try{
      if(!ready||busy||mode!==next||auth.currentUser||!form.reportValidity())return;
      if(creating&&registerPassword.value!==registerConfirm.value){message('Le password non coincidono.',true);return;}
      const email=(creating?registerEmail:el('rdaAuthLoginEmail')).value.trim();
      password=(creating?registerPassword:loginPassword).value;clearPasswords();
      busy=true;ownsBusy=true;authSubmitting=true;stop();show('checking',creating?'Creazione account…':'Accesso in corso…');
      const result=creating?await A.createUserWithEmailAndPassword(auth,email,password):await A.signInWithEmailAndPassword(auth,email,password);
      password='';authSubmitting=false;
      if(!result.user||auth.currentUser?.uid!==result.user.uid){show('error','Sessione cambiata. Verifica di nuovo.',true);return;}
      checkSession(result.user);
    }catch(error){
      password='';authSubmitting=false;
      if(auth.currentUser){checkSession(auth.currentUser);}else show(next,failure(error),true);
    }finally{password='';clearPasswords();if(ownsBusy){authSubmitting=false;busy=false;controls();}}
  }
  loginForm.addEventListener('submit',event=>submitIdentity(event,false));
  registerForm.addEventListener('submit',event=>submitIdentity(event,true));
  requestForm.addEventListener('submit',async event=>{
    event.preventDefault();if(!ready||busy||mode!=='request'||!auth.currentUser||!requestForm.reportValidity())return;
    const user=auth.currentUser,current=session;
    const value={email:user.email,psn_id:el('rdaAuthPsn').value.trim(),nickname_secondary:el('rdaAuthNickname').value.trim(),
      privacy_acknowledged:el('rdaAuthPrivacy').checked,privacy_version:privacyVersion};
    busy=true;controls();
    try{await createRequest(user,value);if(auth.currentUser?.uid===user.uid&&current===session)checkSession(user);}
    catch(error){if(auth.currentUser?.uid===user.uid&&current===session)message(failure(error),true);}
    finally{busy=false;controls();}
  });
  modeButton.addEventListener('click',()=>{if(ready&&!busy&&!auth.currentUser)show(mode==='login'?'register':'login');});
  refresh.addEventListener('click',()=>{if(busy)return;if(!ready)location.reload();else checkSession(auth.currentUser);});
  el('rdaAuthSessionExit').addEventListener('click',()=>logout.click());
  logout.addEventListener('click',async()=>{
    if(busy)return;busy=true;stop();lock();clearPasswords();controls();
    try{await A.signOut(auth);show('login');}catch(error){show('error',failure(error),true);}
    finally{busy=false;controls();}
  });
  window.addEventListener('offline',()=>{stop();show('error','È necessaria una connessione per verificare l’accesso RDA.');});
  window.addEventListener('online',()=>{if(ready&&!authSubmitting)checkSession(auth.currentUser);});
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
      A.onAuthStateChanged(auth,user=>{ready=true;if(!authSubmitting)checkSession(user);},error=>{ready=false;show('error',failure(error),true);});
    }catch(error){ready=false;show('error','Impossibile avviare l’accesso Firebase. Controlla la connessione e premi Verifica di nuovo.',true);}
  }
  show('checking','Ripristino della sessione RDA…');start();
})();

// V3: presentazione del Best Lap esportato; nessun calcolo sportivo.
function renderRaceBestLaps(){
  const host=document.getElementById('raceBestLapCards');if(!host)return;
  host.replaceChildren();
  const node=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!=null)el.textContent=String(text);return el;};
  const heading=content=>{
    content.append(node('h3','','🏁 BEST LAP GARA'),node('div','race-best-lap-day','DELLA GIORNATA'),node('small','race-best-lap-note','SOLO INFORMATIVO'));
  };
  const races=arr('raceBestLaps');
  if(!races.length){
    const card=node('article','record-card panel race-best-lap-card race-best-lap-empty');
    const content=node('div','race-best-lap-content');heading(content);
    content.append(node('p','race-best-lap-empty-message','Nessun Best Lap GARA informativo disponibile.'));
    const visual=node('div','record-map race-best-lap-visual');
    const flag=node('span','race-best-lap-flag','🏁');flag.setAttribute('aria-hidden','true');visual.append(flag);
    card.append(visual,content);host.append(card);return;
  }
  const buildCard=race=>{
    const card=node('article','record-card panel race-best-lap-card');
    const map=node('div','record-map race-best-lap-visual');const file=mapFileForTrack(race.track);
    const showFallback=host=>{
      const fallback=node('span','','Sagoma non disponibile');
      if(file){const img=node('img');img.src=file;img.alt=`Sagoma ${race.track||''}`;
        img.addEventListener('error',()=>img.replaceWith(fallback),{once:true});host.append(img);
      }else host.append(fallback);
    };
    for(const driver of race.drivers||[]){
      const visual=node('div','race-best-lap-car-visual');
      const image=typeof driver.car_image==='string'&&/^car_images\/car_[0-9]+\.webp$/.test(driver.car_image)?driver.car_image:'';
      if(image){const img=node('img','race-best-lap-car-photo');img.src=image;img.alt=`${driver.car||'Auto'} — ${driver.name||''}`;
        img.addEventListener('error',()=>{visual.replaceChildren();showFallback(visual);},{once:true});visual.append(img);
      }else showFallback(visual);
      if((race.drivers||[]).length>1)visual.append(node('small','race-best-lap-note',driver.name||''));
      map.append(visual);
    }
    if(!(race.drivers||[]).length)showFallback(map);
    const content=node('div','race-best-lap-content');heading(content);
    const time=node('div','race-best-lap-clock');time.append(node('span','race-best-lap-label','TEMPO'),node('strong','record-time race-best-lap-time',race.time||'Non disponibile'));content.append(time);
    const drivers=node('div','race-best-lap-drivers');
    if((race.drivers||[]).length>1)drivers.append(node('small','race-best-lap-note','EX AEQUO'));
    for(const driver of race.drivers||[]){
      const row=node('div');row.append(node('span','race-best-lap-label','PILOTA'),node('strong','race-best-lap-driver',driver.name||'Non disponibile'),node('span','race-best-lap-label','AUTO'),(() => {const car=arr('cars').find(c=>String(c.carId)===String(driver.carId));const el=node(car?'button':'span',car?'rda-car-link':'',driver.car||'Non disponibile');if(car){el.type='button';el.dataset.rdaCarId=String(car.carId);}return el;})());drivers.append(row);
    }
    content.append(drivers);
    const metadata=node('dl','race-best-lap-metadata');
    const round=race.gara?String(race.gara):race.round?`Round ${race.round}`:'';
    for(const [label,value] of [['CIRCUITO',race.track],['DATA',race.date],['CAMPIONATO',race.championship],['GARA',round]]){
      const field=node('div');field.append(node('dt','race-best-lap-label',label),node('dd','',value||'Non disponibile'));metadata.append(field);
    }
    content.append(metadata);card.append(map,content);return card;
  }
  // Date grouping is derived from published results: republishing never duplicates entries.
  const dayKey=value=>{
    const text=String(value||'').trim();let m;
    if((m=text.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/)))return m[1]+'-'+m[2]+'-'+m[3];
    if((m=text.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/)))return m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');
    return '';
  };
  const label=key=>key?key.slice(8,10)+'/'+key.slice(5,7)+'/'+key.slice(0,4):'Data non disponibile';
  const groups=new Map();
  for(const race of races){const key=dayKey(race.date);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(race);}
  const keys=[...groups.keys()].sort((a,b)=>b.localeCompare(a));
  const latest=keys.find(Boolean)||keys[0];
  const current=node('section','bestlap-current');
  const currentTitle=node('h3','bestlap-current-title','Ultima giornata · '+label(latest));current.append(currentTitle);
  const currentCards=node('div','race-best-lap-list');currentCards.append(...groups.get(latest).map(buildCard));current.append(currentCards);host.append(current);
  const previous=keys.filter(k=>k!==latest);
  if(!previous.length)return;
  const open=node('button','bestlap-archive-button','Gare precedenti · '+previous.length+' giornate →');open.type='button';current.append(open);
  const archive=node('section','bestlap-archive');archive.hidden=true;
  const back=node('button','bestlap-back','← Torna agli ultimi Best Lap');back.type='button';
  const archiveTitle=node('h3','','Gare precedenti');
  const selectLabel=node('label','bestlap-month-label','Mese');const select=node('select','bestlap-month');selectLabel.append(select);
  const months=[...new Set(previous.map(k=>k?k.slice(0,7):''))];
  const monthNames=['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
  for(const month of months){const option=node('option','',month?monthNames[Number(month.slice(5))-1]+' '+month.slice(0,4):'Senza data');option.value=month;select.append(option);}
  const days=node('div','bestlap-archive-days');
  const renderDays=()=>{
    days.replaceChildren();
    for(const key of previous.filter(k=>(k?k.slice(0,7):'')===select.value)){
      const entries=groups.get(key),detail=node('details','bestlap-day');const summary=node('summary');
      summary.append(node('strong','',label(key)),node('span','bestlap-day-caption',entries.length+' '+(entries.length===1?'gara':'gare')+' · '+[...new Set(entries.map(r=>r.track).filter(Boolean))].join(' · ')));
      const cards=node('div','race-best-lap-list');detail.append(summary,cards);
      detail.addEventListener('toggle',()=>{if(detail.open&&!cards.childElementCount)cards.append(...entries.map(buildCard));});days.append(detail);
    }
  };
  select.onchange=renderDays;archive.append(back,archiveTitle,selectLabel,days);host.append(archive);
  const focusTitle=title=>{title.tabIndex=-1;title.focus({preventScroll:true});title.scrollIntoView({block:'start',behavior:'auto'});};
  open.onclick=()=>{current.hidden=true;archive.hidden=false;renderDays();focusTitle(archiveTitle);};
  back.onclick=()=>{archive.hidden=true;current.hidden=false;focusTitle(currentTitle);};
}

setTimeout(()=>renderRaceBestLaps(),0);

function startPodiumFireworksRDA(){if(window.rdaFireworkStop)window.rdaFireworkStop();const c=document.querySelector('#podiumChampFull .fireworks');if(!c)return;let stopped=false,raf=0;window.rdaFireworkStop=()=>{stopped=true;cancelAnimationFrame(raf);observer.disconnect()};const ctx=c.getContext('2d'),box=c.parentElement,button=document.querySelector('.motion-control');let w,h,particles=[],running=!matchMedia('(prefers-reduced-motion: reduce)').matches,last=0,next=0;const colors=['#fff09c','#ffd000','#ff538b','#55dfff','#ba83ff','#ffffff'];function resize(){w=box.clientWidth;h=box.clientHeight;const d=Math.min(devicePixelRatio||1,2);c.width=w*d;c.height=h*d;ctx.setTransform(d,0,0,d,0,0)}const observer=new ResizeObserver(resize);observer.observe(box);function burst(){let x=w*(.12+Math.random()*.76),y=h*(.06+Math.random()*.45),color=colors[Math.floor(Math.random()*colors.length)];for(let i=0;i<80;i++){let a=Math.PI*2*i/80,v=40+Math.random()*95;particles.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,age:0,life:1.6+Math.random()*.8,color})}}function label(){button.textContent=running?'Ferma i fuochi d’artificio':'Avvia i fuochi d’artificio'}button.onclick=()=>{running=!running;particles=[];ctx.clearRect(0,0,w,h);next=0;label()};label();function frame(t){if(stopped)return;const dt=Math.min((t-last)/1000,.04);last=t;ctx.clearRect(0,0,w,h);if(running&&!document.hidden&&box.getClientRects().length>0){next-=dt;if(next<=0){burst();next=.45+Math.random()*.45}particles=particles.filter(p=>p.age<p.life);for(const p of particles){p.age+=dt;let ox=p.x,oy=p.y;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=24*dt;ctx.globalAlpha=Math.max(0,1-p.age/p.life);ctx.strokeStyle=p.color;ctx.lineWidth=2.3;ctx.shadowColor=p.color;ctx.shadowBlur=9;ctx.beginPath();ctx.moveTo(ox,oy);ctx.lineTo(p.x,p.y);ctx.stroke()}ctx.globalAlpha=1;ctx.shadowBlur=0}raf=requestAnimationFrame(frame)}raf=requestAnimationFrame(frame)}

// Albo d’oro: historical data only; never changes live standings or ranking.
// Independent historical championship archive. No live ranking calculations.
// Independent historical championship archive. No live ranking calculations.
function rdaHistoricalParticipant(row){const name=String(row.driver||'').trim();return name!==''&&!['(leer)','leer'].includes(name.toLocaleLowerCase('it-IT'));}
function rdaHistoricalYearStats(events){
 const pilots=new Set();let attendance=0,missing=0;
 for(const event of events)for(const row of event.results||[]){if(!rdaHistoricalParticipant(row))continue;pilots.add(String(row.driver).trim().toLocaleLowerCase('it-IT'));if(/^\d+$/.test(String(row.attendance??'')))attendance+=Number(row.attendance);else missing++;}
 return {pilots:pilots.size,championships:events.length,attendance,missing};
}
function renderRdaHallOfFame(){
 const list=document.getElementById('rdaHallList'),detail=document.getElementById('rdaHallDetail'),search=document.getElementById('rdaHallSearch');if(!list||!detail||!search)return;
 const events=arr('hallOfFame'),state=list._rdaHistoryState||(list._rdaHistoryState={year:null,id:null});
 const make=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=String(text);if(cls)e.className=cls;return e;};
 const button=(text,action,cls)=>{const e=make('button',text,cls);e.type='button';e.onclick=action;return e;};
 const yearOf=v=>String(v.season||'Anno non indicato');
 const hero=()=>{const box=make('header',undefined,'rda-hall-hero');box.append(make('div','RACING DRIVERS ASSOCIATION','rda-hall-kicker'));const heading=make('h2','ALBO ');heading.append(make('span','D’ORO','rda-hall-gold'));box.append(heading,make('p','CAMPIONATI RDA'),make('p','STORIA · PILOTI · CAMPIONI'));return box;};
 const head=document.querySelector('[data-view="hall-of-fame"] .section-head');if(head&&!head.dataset.rdaYearHero){head.replaceChildren(hero());head.dataset.rdaYearHero='1';}
 function draw(){
  list.replaceChildren();detail.replaceChildren();detail.hidden=true;list.hidden=false;search.hidden=false;
  const query=search.value.trim().toLocaleLowerCase('it-IT');
  const filtered=events.filter(v=>[v.championship,v.season,...(v.results||[]).map(r=>r.driver)].join(' ').toLocaleLowerCase('it-IT').includes(query));
  if(!events.length){list.append(make('p','Nessun campionato storico pubblicato.'));return;}
  if(state.id){const event=events.find(v=>v.id===state.id);if(event){show(event);return;}state.id=null;}
  if(state.year!==null){
   list.append(button('← Tutti gli anni',()=>{state.year=null;draw();},'rda-hall-back'),make('h3','Campionati '+state.year));
   const selected=filtered.filter(v=>yearOf(v)===state.year);
   if(!selected.length)list.append(make('p','Nessun campionato corrisponde alla ricerca.'));
   for(const event of selected){const card=make('article',undefined,'rda-hall-championship');card.append(make('h3',event.championship||event.title));const count=(event.results||[]).filter(rdaHistoricalParticipant).length;card.append(make('p',count+' piloti in classifica'));const winner=(event.results||[]).find(r=>Number(r.pos)===1&&rdaHistoricalParticipant(r));if(winner)card.append(make('p','🏆 '+winner.driver));card.append(button('Apri classifica finale',()=>{state.id=event.id;draw();}));list.append(card);}return;
  }
  list.append(make('h3','Scegli l’anno'),make('p','Statistiche dei campionati archiviati','rda-hall-description'));
  const years=[...new Set(filtered.map(yearOf))].sort((a,b)=>b.localeCompare(a));
  if(!years.length)list.append(make('p','Nessun campionato corrisponde alla ricerca.'));
  for(const year of years){
   // Statistics use all loaded championships in a year, even during a search.
   const stats=rdaHistoricalYearStats(events.filter(v=>yearOf(v)===year));
   const card=button('',()=>{state.year=year;draw();},'rda-hall-year');card.append(make('strong',year,'rda-hall-year-title'));
   const grid=make('div',undefined,'rda-hall-year-stats');for(const [count,label] of [[stats.pilots,'Piloti distinti'],[stats.championships,'Campionati'],[stats.attendance,'Presenze'+(stats.missing?' note':'')]]){const cell=make('span');cell.append(make('strong',count),make('small',label));grid.append(cell);}card.append(grid);if(stats.missing)card.append(make('small','Presenze mancanti per '+stats.missing+' righe: conteggio parziale.'));list.append(card);
  }
  list.append(make('p','Conteggi riferiti ai campionati caricati. Piloti distinti in base al nome riportato; righe senza nome escluse.','rda-hall-description'));
 }
 function show(event){
  detail.hidden=false;list.hidden=true;search.hidden=true;
  detail.append(button('← Campionati '+yearOf(event),()=>{state.id=null;state.year=yearOf(event);draw();},'rda-hall-back'),make('h3',event.championship||event.title),make('p','Classifica finale · '+yearOf(event)));
  const rows=Array.isArray(event.results)?event.results:[];const podium=make('div',undefined,'rda-hall-podium-v2');
  for(const pos of [2,1,3]){const row=rows.find(r=>Number(r.pos)===pos);if(row&&rdaHistoricalParticipant(row)){const card=make('div',undefined,pos===1?'rda-hall-first':'');card.append(make('span',['🥇','🥈','🥉'][pos-1]),make('strong',row.driver));if(row.points!=='')card.append(make('small',row.points+' punti'));podium.append(card);}}
  detail.append(podium,make('h3','Classifica completa'));
  const wrap=make('div',undefined,'rda-hall-table-wrap'),table=make('table',undefined,'rda-hall-table'),thead=make('thead'),header=make('tr');
  const showAverage=rows.some(row=>String(row.average_points??'').trim());const labels=['Pos.','Pilota','Punti gara','Punti totali','Presenze','Rank calcolato'];const keys=['pos','driver','race_points','points','attendance','rank'];if(showAverage){labels.splice(5,0,'Media punti');keys.splice(5,0,'average_points');}for(const label of labels){const th=make('th',label);th.scope='col';header.append(th);}thead.append(header);table.append(thead);const tbody=make('tbody');
  for(const row of rows){const tr=make('tr');for(const key of keys)tr.append(make('td',row[key]??''));tbody.append(tr);}table.append(tbody);wrap.append(table);detail.append(wrap);
  if(event.notes)detail.append(make('p',event.notes,'rda-hall-notes'));
  if(/^assets\/history\/[a-f0-9]{32}\.jpg$/.test(event.image||'')){const image=make('img',undefined,'rda-hall-photo');image.src=event.image;image.alt='Allegato storico: '+(event.championship||event.title);detail.append(image);}
 }
 search.oninput=()=>{state.id=null;draw();};draw();
}

function renderRdaNews(){
 const list=document.getElementById('rdaNewsList'),search=document.getElementById('rdaNewsSearch');if(!list||!search)return;
 const make=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=String(text);if(cls)e.className=cls;return e;};
 const draw=()=>{list.replaceChildren();const query=search.value.toLocaleLowerCase();const values=arr('rdaNews').filter(v=>[v.title,v.body,v.driver,v.championship,v.track,v.kind].join(' ').toLocaleLowerCase().includes(query));
 if(!values.length){list.append(make('p',query?'Nessun comunicato corrispondente.':'Nessun comunicato pubblicato.'));return;}
 for(const v of values){if(v.kind==='Penalità'){const penalty=buildRdaPenalty(v,make);if(/^assets\/news\/[a-f0-9]{32}\.jpg$/.test(v.image||'')){const photo=make('img');photo.src=v.image;photo.alt='Allegato al comunicato';penalty.append(photo);}list.append(penalty);continue;}const card=make('article',undefined,'panel rda-news-card');card.append(make('div',[v.kind,v.date&&String(v.date).split('-').reverse().join('/')].filter(Boolean).join(' · '),'eyebrow'));if(v.title)card.append(make('h3',v.title));
 const meta=[v.driver&&'Pilota: '+v.driver,v.championship&&'Campionato: '+v.championship,v.track&&'Circuito: '+v.track,v.race_round&&'Gara / round: '+v.race_round,v.incident_lap&&'Giro dell’episodio: '+v.incident_lap,v.penalty&&'Penalità: '+v.penalty,v.license_points&&'Punti patente tolti: '+v.license_points].filter(Boolean);
 for(const text of meta)card.append(make('p',text,'rda-news-meta'));
 if(v.body)card.append(make('p',v.body,'rda-news-body'));
 if(/^assets\/news\/[a-f0-9]{32}\.jpg$/.test(v.image||'')){const image=make('img');image.src=v.image;image.alt=v.title?'Locandina: '+v.title:'Foto / locandina del comunicato';image.loading='lazy';image.onerror=()=>image.remove();card.append(image);const zoom=make('button','Ingrandisci locandina','rda-news-image-zoom');zoom.type='button';zoom.onclick=()=>openRdaNewsImage(image,zoom,make);card.append(zoom);}
 if(v.signature_choice&&v.signature_choice!=='Nessuna'){const footer=make('div',undefined,'rda-news-signature');if(['Firma RDA','Firma e timbro RDA'].includes(v.signature_choice)){const sign=make('div',undefined,'rda-sign-piece');sign.setAttribute('role','img');sign.setAttribute('aria-label','Firma RDA');footer.append(sign);}if(['Timbro RDA','Firma e timbro RDA'].includes(v.signature_choice)){const stamp=make('div',undefined,'rda-stamp-piece');stamp.setAttribute('role','img');stamp.setAttribute('aria-label','Timbro RDA Direzione Gara');footer.append(stamp);}card.append(footer);}list.append(card);}};search.oninput=draw;draw();
}

function buildRdaPaper(v,make){
 const paper=make('div',undefined,'rda-paper');const brand=make('div',undefined,'rda-paper-brand');const logo=make('img');logo.src='assets/news-template/rda-logo-original.jpg';logo.alt='Logo originale RDA';brand.append(logo);paper.append(brand);
 if(v.title){const band=make('div',undefined,'rda-paper-title');band.append(make('h3',v.title));paper.append(band);}
 const content=make('div',undefined,'rda-paper-content');const meta=make('div',undefined,'rda-paper-meta');
 const pairs=[['Data',String(v.date||'').split('-').reverse().join('/')],['Pilota',v.driver],['Campionato',v.championship],['Circuito',v.track],['Gara / round',v.race_round],['Giro dell’episodio',v.incident_lap],['Penalità',v.penalty],['Punti patente tolti',v.license_points]];
 pairs.forEach(([label,value])=>{if(value)meta.append(make('span',label+': '+value));});if(meta.children.length)content.append(meta);
 if(v.body)content.append(make('p',v.body,'rda-paper-body'));
 const choice=v.signature_choice||'Nessuna';if(['Firma RDA','Timbro RDA','Firma e timbro RDA'].includes(choice)){
 const footer=make('footer',undefined,'rda-news-signature');const background=make('div',undefined,'rda-seal-backdrop');background.setAttribute('aria-hidden','true');background.append(make('div',undefined,'rda-seal-led'));footer.append(background,make('strong','La Direzione Gara RDA'));const marks=make('div',undefined,'rda-sign-marks');
 if(['Firma RDA','Firma e timbro RDA'].includes(choice)){const sign=make('div',undefined,'rda-sign-piece');sign.setAttribute('role','img');sign.setAttribute('aria-label','Firma RDA');marks.append(sign);}
 if(['Timbro RDA','Firma e timbro RDA'].includes(choice)){const stamp=make('div',undefined,'rda-stamp-piece');stamp.setAttribute('role','img');stamp.setAttribute('aria-label','Timbro Direzione Gara RDA');marks.append(stamp);}
 footer.append(marks);content.append(footer);}
 paper.append(content);return paper;
}
function buildRdaPenalty(v,make){
 const card=make('article',undefined,'panel rda-news-card rda-penalty-card');const paper=buildRdaPaper(v,make);card.append(paper);const button=make('button','Ingrandisci comunicato','rda-penalty-zoom');button.type='button';button.onclick=()=>{
 const overlay=make('div',undefined,'rda-penalty-overlay');overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','Comunicato RDA ingrandito');const close=make('button','Chiudi');close.type='button';const dismiss=()=>{overlay.remove();document.removeEventListener('keydown',keys);button.focus();};const keys=e=>{if(e.key==='Escape')dismiss();if(e.key==='Tab'){e.preventDefault();close.focus();}};close.onclick=dismiss;overlay.append(close,paper.cloneNode(true));document.body.append(overlay);document.addEventListener('keydown',keys);close.focus();};card.append(button);return card;
}

function openRdaNewsImage(image,trigger,make){
 const overlay=make('div',undefined,'rda-news-image-overlay');overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label',image.alt||'Locandina ingrandita');
 const close=make('button','Chiudi');close.type='button';const picture=make('img');picture.src=image.src;picture.alt=image.alt;
 const dismiss=()=>{overlay.remove();document.removeEventListener('keydown',keys);trigger.focus();};
 const keys=e=>{if(e.key==='Escape')dismiss();if(e.key==='Tab'){e.preventDefault();close.focus();}};
 close.onclick=dismiss;overlay.append(close,picture);document.body.append(overlay);document.addEventListener('keydown',keys);close.focus();
}


function renderRdaRegulations(){
 const host=document.getElementById('rdaRegulationsList');if(!host)return;
 const tabs=document.querySelectorAll('[data-reg-category]');
 const category=host.dataset.category||'Gara';
 tabs.forEach(button=>{button.setAttribute('aria-pressed',String(button.dataset.regCategory===category));button.onclick=()=>{host.dataset.category=button.dataset.regCategory;renderRdaRegulations()}});
 const rows=(Array.isArray(D.rdaRegulations)?D.rdaRegulations:[]).filter(row=>row.online&&row.category===category);
 host.replaceChildren();
 if(!rows.length){const p=document.createElement('p');p.className='panel';p.textContent='Nessun documento pubblicato in questa sezione.';host.append(p);return}
 rows.forEach(row=>{
  if(!/^regolamenti_rda\/[a-f0-9]+\.pdf$/.test(row.url||''))return;
  const card=document.createElement('article');card.className='panel rda-rule-document';
  const label=document.createElement('small');label.textContent=category==='Gara'?(row.championship||'REGOLAMENTO GARA'):'REGOLAMENTO GENERALE RDA';
  const title=document.createElement('h3');title.textContent=row.title;
  const info=document.createElement('p');info.textContent=`Versione ${row.version} · ${row.date}`;
  const link=document.createElement('a');link.href=row.url;link.target='_blank';link.rel='noopener';link.textContent='▣  Leggi PDF';link.className='rda-rule-open regulation-btn';
  card.append(label,title,info,link);host.append(card);
 });
}



function rdaBriefingSelection(rows,today){
 const valid=rows.filter(r=>/^\d{4}-\d{2}-\d{2}$/.test(r.isoDate||'')).sort((a,b)=>a.isoDate.localeCompare(b.isoDate));
 const day=valid.find(r=>r.isoDate>=today)?.isoDate;
 return {day,rows:day?valid.filter(r=>r.isoDate===day):[],isToday:day===today};
}
function renderRdaBriefing(){
 const host=document.getElementById('rdaBriefingContent'),entry=document.getElementById('rdaBriefingEntry');if(!host||!entry)return;
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const part=k=>parts.find(p=>p.type===k).value,today=`${part('year')}-${part('month')}-${part('day')}`;
 host.dataset.today=today;
 const rows=Array.isArray(D.raceBriefings)?D.raceBriefings:[];
 const automatic=rdaBriefingSelection(rows,today);
 const selected=host.dataset.selectedDate?{day:host.dataset.selectedDate,rows:rows.filter(r=>r.isoDate===host.dataset.selectedDate),isToday:host.dataset.selectedDate===today}:automatic;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const unknown='Da verificare nel regolamento',value=v=>esc(v||unknown);
 const dateLabel=selected.rows[0]?.date||selected.day||'';
 document.getElementById('rdaBriefingEntryTitle').textContent=automatic.rows.length?(automatic.isToday?'La gara di oggi':'La prossima gara'):'Briefing gara';
 document.getElementById('rdaBriefingEntryDetail').textContent=automatic.rows.length?`${automatic.rows[0]?.date||automatic.day} · ${automatic.rows.map(r=>r.championship||r.title).join(' · ')}`:'Nessuna gara futura pubblicata nel calendario.';
 document.getElementById('rdaBriefingDay').textContent=selected.rows.length?(selected.isToday?'OGGI IN PISTA':`PROSSIMO APPUNTAMENTO · ${dateLabel}`):'CALENDARIO GARE';
 const picker=document.getElementById('rdaBriefingDate');
 const days=[...new Set(rows.map(r=>r.isoDate).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d||'')&&d>=today))].sort();
 picker.innerHTML='<option value="">Oggi / prossima gara</option>'+days.map(d=>`<option value="${d}">${esc(rows.find(r=>r.isoDate===d)?.date||d)}</option>`).join('');
 picker.value=host.dataset.selectedDate||'';picker.onchange=()=>{host.dataset.selectedDate=picker.value;renderRdaBriefing()};
 if(!selected.rows.length){host.innerHTML='<div class="panel"><h3>Nessuna gara programmata</h3><p>Il briefing comparirà con la pubblicazione dei prossimi appuntamenti.</p></div>';return}
 function line(icon,label,main,detail=''){return `<div class="rda-brief-line"><span aria-hidden="true">${icon}</span><div><small>${label}</small><strong>${value(main)}</strong>${detail?`<p>${esc(detail)}</p>`:''}</div></div>`}
 host.innerHTML=selected.rows.map(r=>{
  const s=r.settings||{},source=r.source;
  const allowed=s.allowedTyres&&s.tyreType?`${s.tyreType} · ${s.allowedTyres}`:s.allowedTyres;
  const pit=Number.isInteger(s.effectivePitStops)?(s.effectivePitStops===0?'Nessuna sosta minima imposta':`Almeno ${s.effectivePitStops} ${s.effectivePitStops===1?'sosta':'soste'}`):null;
  const pitDetail=s.tyrePitStops>0?'Per utilizzare tutte le mescole obbligatorie':'';
  const carName=s.car||r.car?.model;
  const car=`<div class="rda-brief-car"><div><small>AUTO DELLA GARA</small><strong>${value(carName)}</strong></div></div>`;
  const extra=[['Gomme consentite',allowed],['Cambio tipo gomme',s.effectiveTyreChange||s.tyreChange],['Giri',s.laps],['Partenza',s.start],['BoP / divieto elaborazione',s.bop],['Danni meccanici',s.damage],['Carburante iniziale',s.initialFuel]];
  const url=source?.url||'';const safePdf=/^(?:regolamenti|regolamenti_rda)\/[a-zA-Z0-9_.-]+\.pdf$/.test(url);
  return `<article class="panel rda-brief-card"><div class="eyebrow">${esc(r.championship||r.title||'Gara RDA')}</div><h3>${esc(r.track||'Circuito da definire')}</h3><p class="rda-brief-date">${esc(r.date||r.isoDate)}</p>${car}<div class="rda-brief-list"><h4>Le cose da sapere</h4>${line('🛞','GOMME OBBLIGATORIE',s.requiredTyres,s.tyreType?`Tipo: ${s.tyreType}`:'')}${line('🔧','PIT STOP',pit,pitDetail)}${line('⛽','CARBURANTE',s.fuel?`Consumo ${s.fuel}`:null)}${line('🛞','USURA GOMME',s.wear?`Moltiplicatore ${s.wear}`:null)}</div>${s.sessions?.length?`<div class="rda-brief-times">${s.sessions.map(t=>`<span>${esc(t)}</span>`).join('')}</div>`:''}${r.directionNote?`<p class="rda-brief-source">${esc(r.directionNote)}</p>`:''}${r.issue?`<p class="rda-brief-warning">${esc(r.issue)}</p>`:''}${(s.warnings||[]).map(w=>`<p class="rda-brief-warning">⚠ ${esc(w)}</p>`).join('')}<details class="rda-brief-extra"><summary>Tutte le impostazioni</summary><dl>${extra.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${value(v)}</dd></div>`).join('')}</dl></details>${safePdf?`<a class="regulation-btn rda-brief-read" href="${esc(url)}">📖 Regolamento completo</a><p class="rda-brief-source">${esc(source.title)}${source.version?` · versione ${esc(source.version)}`:''}</p>`:''}</article>`;
 }).join('');
}
setInterval(()=>{
 const host=document.getElementById('rdaBriefingContent');if(!host)return;
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const day=['year','month','day'].map(k=>parts.find(p=>p.type===k).value).join('-');
 if(host.dataset.today!==day){delete host.dataset.selectedDate;renderRdaBriefing()}
},60000);


function setupRankingRaceModes(){
  const modes=document.querySelector('#rdaRankingModes');
  if(!modes)return;
  const [seasonButton,raceButton]=modes.querySelectorAll('button');
  const seasonPanels=[document.querySelector('#eloTable'),document.querySelector('.elo-hero')];
  const racePanel=document.querySelector('#rdaRankingRace');
  const select=document.querySelector('#rdaRankingRaceSelect');
  const box=document.querySelector('#rdaRankingPoints');
  const races=arr('raceArchive').filter(race=>(race.results||[]).some(row=>Number.isFinite(row.rankingRacePoints)));
  for(const [index,race] of races.entries()){
    select.add(new Option([race.date,race.championship,race.gara?'Gara '+race.gara:'',race.track].filter(Boolean).join(' · '),index));
  }
  select.disabled=!races.length;
  const format=new Intl.NumberFormat('it-IT',{maximumFractionDigits:2});
  function render(){
    box.replaceChildren();
    const race=races[Number(select.value)];
    if(!race){
      box.textContent='I punti Ranking per gara saranno disponibili dopo la prossima pubblicazione.';
      return;
    }
    const heading=document.createElement('h3');
    heading.className='race-points-heading';
    heading.textContent='Ranking preso in gara · Master '+race.master;
    const note=document.createElement('p');
    note.textContent='Punti della gara con il coefficiente Master. La classifica stagionale usa le medie dei campionati validi e gli eventuali bonus trimestrali.';
    const table=document.createElement('table');
    const header=table.createTHead().insertRow();
    for(const title of ['Pos.','Pilota','Punti Ranking']){
      const cell=document.createElement('th');
      cell.scope='col';
      cell.textContent=title;
      header.append(cell);
    }
    const body=table.createTBody();
    for(const result of race.results){
      const row=body.insertRow();
      if(Number(result.pos)===1)row.className='race-points-leader';
      row.insertCell().textContent=result.pos;
      row.insertCell().textContent=result.name;
      const score=document.createElement('span');
      score.className='race-points-score';
      score.textContent=Number.isFinite(result.rankingRacePoints)?format.format(result.rankingRacePoints)+' pt':'—';
      row.insertCell().append(score);
    }
    box.append(heading,note,table);
  }
  function switchMode(showRace){
    for(const panel of [...seasonPanels,racePanel]){
      const visible=panel===racePanel?showRace:!showRace;
      panel.hidden=!visible;
      panel.style.display=visible?'':'none';
    }
    raceButton.setAttribute('aria-pressed',String(showRace));
    seasonButton.setAttribute('aria-pressed',String(!showRace));
    if(showRace)render();
  }
  seasonButton.addEventListener('click',()=>switchMode(false));
  raceButton.addEventListener('click',()=>switchMode(true));
  select.addEventListener('change',render);
}
setupRankingRaceModes();
