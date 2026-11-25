/* Optional Mobile notifications. A failure here never blocks login or the news. */
(()=>{
 'use strict';let generation=0,ctx=null,box=null;
 const deviceKey='rda-mobile-push-device-v1';
 function clear(){generation++;ctx=null;if(box)box.remove();box=null;}
 function bytes(s){return Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));}
 async function mount(value){
  clear();const ticket=generation;ctx=value;
  try{
   const {F,db,user}=value;
   const snap=await F.getDocFromServer(F.doc(db,'rda_mobile_push_config','current'));
   if(ticket!==generation||!snap.exists())return;
   const cfg=snap.data();
   if(!cfg.enabled||!['test','all'].includes(cfg.mode)||(cfg.mode==='test'&&cfg.testUid!==user.uid))return;
   const host=document.getElementById('rdaAuthSessionExit')?.parentElement;if(!host)return;
   box=document.createElement('div');box.id='rdaPushControls';box.style.cssText='padding:10px 12px;color:#d5e9ff;font:14px system-ui;background:#101f36;border:1px solid #266a84;border-radius:10px;margin:8px;';
   const label=document.createElement('span'),button=document.createElement('button'),off=document.createElement('button'),manage=document.createElement('button');
   let sequence=0,registered=false;
   function deadline(promise,step,ms=12000){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(step+' non risponde. Premi Riprova registrazione.')),ms);Promise.resolve(promise).then(v=>{clearTimeout(timer);resolve(v);},e=>{clearTimeout(timer);reject(e);});});}
   label.textContent=cfg.mode==='test'?'Notifiche RDA · prova personale. ':'Avvisi sui nuovi risultati e sul giornale. ';
   button.textContent=window.Notification?.permission==='granted'?'Completa registrazione':'Attiva notifiche';off.textContent='Disattiva';off.hidden=true;manage.textContent='Gestisci';manage.hidden=true;
   for(const b of [button,off,manage])b.style.cssText='padding:8px 12px;margin:4px;border-radius:7px;border:1px solid #25bde1;background:#112d48;color:white;';
   box.append(label,button,off,manage);host.insertAdjacentElement('afterend',box);
   if(!isSecureContext||!('serviceWorker'in navigator)||!('PushManager'in window)||!('Notification'in window)){
    label.textContent='Notifiche non supportate qui. Su iPhone apri RDA Mobile dalla Home (iOS 16.4 o successivo).';button.hidden=true;return;
   }
   const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
   if(ios&&!navigator.standalone&&!matchMedia('(display-mode: standalone)').matches){label.textContent='Per attivare le notifiche, apri RDA Mobile dalla sua icona nella Home.';button.hidden=true;return;}
   let id=localStorage.getItem(deviceKey);
   if(!/^[a-f0-9]{32}$/.test(id||'')){id=Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');localStorage.setItem(deviceKey,id);}
   const ref=F.doc(db,'rda_mobile_push_users',user.uid,'devices',id);
   const valid=()=>ticket===generation&&ctx?.user?.uid===user.uid;
   async function ready(){
    const reg=await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('Aggiornamento app non ancora pronto: chiudi e riapri RDA Mobile.')),15000))]);
    // Never subscribe against an old worker that cannot yet display a push.
    reg.update().catch(()=>{});
    for(let attempt=0;attempt<40;attempt++){
     reg.waiting?.postMessage({type:'rda-push-activate'});
     const supported=await new Promise(resolve=>{
      const channel=new MessageChannel();let done=false;
      const finish=value=>{if(done)return;done=true;channel.port1.close();resolve(value);};
      channel.port1.onmessage=e=>finish(e.data?.version===1);
      if(reg.active)reg.active.postMessage({type:'rda-push-version'},[channel.port2]);else finish(false);
      setTimeout(()=>finish(false),400);
     });
     if(supported)return reg;
     await new Promise(resolve=>setTimeout(resolve,100));
    }
    throw Error('Aggiornamento app non ancora pronto: chiudi e riapri RDA Mobile.');
   }
   async function save(sub){
    if(!valid())throw Error('Accedi nuovamente.');
    const v=sub.toJSON();
    await deadline(F.setDoc(ref,{uid:user.uid,deviceId:id,endpoint:v.endpoint,p256dh:v.keys.p256dh,auth:v.keys.auth,keyId:cfg.keyId,enabled:true,platform:ios?'ios':/Android/.test(navigator.userAgent)?'android':'desktop',updatedAt:F.serverTimestamp()}),'Salvataggio del telefono');
    const saved=await deadline(F.getDocFromServer(ref),'Conferma registrazione');
    if(!saved.exists()||saved.data().endpoint!==v.endpoint||saved.data().keyId!==cfg.keyId)throw Error('Registrazione non confermata. Premi Riprova registrazione.');
   }
   function active(){registered=true;label.textContent='Notifiche attive su questo dispositivo. ';button.textContent='Aggiorna registrazione';button.hidden=true;off.hidden=true;manage.hidden=false;}
   manage.onclick=()=>{button.hidden=!button.hidden;off.hidden=button.hidden;};
   button.onclick=async()=>{
    if(!valid())return;const operation=++sequence;button.disabled=true;label.textContent='Attivazione in corso…';
    try{
     // Permission must be requested directly from the tap, before network awaits.
     const permission=Notification.permission==='granted'?'granted':await Notification.requestPermission();
     if(permission!=='granted')throw Error('Notifiche non consentite. Puoi abilitarle nelle impostazioni del dispositivo.');
     label.textContent='Consenso ricevuto. Collegamento al servizio notifiche…';
     const reg=await deadline(ready(),'Aggiornamento RDA Mobile',18000);let sub=await deadline(reg.pushManager.getSubscription(),'Verifica del telefono');
     if(!sub)sub=await deadline(reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes(cfg.publicKey)}),'Servizio notifiche del telefono');
     if(!valid()||operation!==sequence)return;
     label.textContent='Salvataggio della registrazione…';await save(sub);if(valid()&&operation===sequence)active();
    }catch(e){if(valid()&&operation===sequence){label.textContent=e.code==='permission-denied'?'Consenso ricevuto, ma il salvataggio è stato rifiutato. Codice: permission-denied.':e.message||'Registrazione non completata. Riprova.';button.hidden=false;button.textContent='Riprova registrazione';}}finally{if(valid()&&operation===sequence)button.disabled=false;}
   };
   off.onclick=async()=>{
    off.disabled=true;
    try{const reg=await deadline(ready(),'Aggiornamento RDA Mobile',18000);const sub=await deadline(reg.pushManager.getSubscription(),'Verifica del telefono');if(sub)await deadline(sub.unsubscribe(),'Disattivazione del telefono');await deadline(F.deleteDoc(ref),'Salvataggio disattivazione');if(valid()){registered=false;label.textContent='Notifiche disattivate. ';off.hidden=true;manage.hidden=true;button.hidden=false;button.textContent='Completa registrazione';}}
    catch{if(valid())label.textContent='Disattivazione non confermata: riprova oppure disabilita le notifiche nelle impostazioni del telefono.';}finally{off.disabled=false;}
   };
   if(Notification.permission==='granted'){
    const operation=++sequence;label.textContent='Consenso già presente. Verifica della registrazione…';
    try{const reg=await deadline(ready(),'Aggiornamento RDA Mobile',18000);const sub=await deadline(reg.pushManager.getSubscription(),'Verifica del telefono');
     if(sub&&valid()&&operation===sequence){await save(sub);if(valid()&&operation===sequence)active();}
     else if(valid()&&operation===sequence)label.textContent='Consenso già presente. Premi Completa registrazione.';
    }catch(e){if(valid()&&operation===sequence){label.textContent=e.code==='permission-denied'?'Il salvataggio è stato rifiutato. Codice: permission-denied.':e.message||'Registrazione da completare.';button.hidden=false;button.disabled=false;button.textContent='Riprova registrazione';}}
   }
  }catch{/* Optional feature: keep the existing app operational. */}
 }
 window.RDAMobilePush={mount,clear};
})();
