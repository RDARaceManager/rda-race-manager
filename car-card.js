(() => {
  'use strict';
  const shell = document.getElementById('rdaPrivateShell');
  if (!shell) return;
  const cars = new Map((window.RDA_DATA?.cars || []).map(car => [String(car.carId), car]));
  const dialog = document.createElement('dialog');
  dialog.className = 'rda-car-card';
  dialog.setAttribute('aria-labelledby', 'rdaCarCardTitle');
  shell.append(dialog);
  const node = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = String(text);
    return el;
  };
  const fields = [['pp','PP'],['max_power','Potenza massima'],['displacement','Cilindrata'],['weight','Peso'],['drivetrain','Trazione'],['max_torque','Coppia massima'],['aspiration','Aspirazione'],['length','Lunghezza'],['width','Larghezza'],['height','Altezza']];
  let opener = null;
  function open(carId) {
    if (shell.hidden || shell.inert || shell.getAttribute('aria-hidden') === 'true') return false;
    const car = cars.get(String(carId));
    if (!car) return false;
    opener = document.activeElement;
    dialog.replaceChildren();
    const header = node('header','rda-car-card-header');
    const heading = node('div');
    heading.append(node('small','rda-car-card-eyebrow','SCHEDA AUTO RDA'));
    const title = node('h2','',car.model); title.id = 'rdaCarCardTitle';
    heading.append(title,node('p','',car.brand || car.gt7?.brand || 'Marca non disponibile'));
    const close = node('button','rda-car-card-close','×'); close.type='button'; close.autofocus=true;
    close.setAttribute('aria-label','Chiudi la scheda auto'); close.onclick=()=>dialog.close();
    header.append(heading,close);
    const body = node('div','rda-car-card-body');
    const visual = node('div','rda-car-card-visual');
    const fallback = () => visual.replaceChildren(node('span','','Foto non disponibile'));
    const image = typeof car.car_image === 'string' && car.car_image === `car_images/car_${car.carId}.webp` ? car.car_image : '';
    if (image) {
      const img=node('img'); img.src=image; img.alt=car.model;
      img.addEventListener('error',fallback,{once:true}); visual.append(img);
    } else fallback();
    body.append(visual);
    const specs = car.gt7 || {};
    body.append(node('p','rda-car-card-category',specs.category || car.category || 'Categoria non disponibile'));
    if (specs.id == null || specs.id === '') body.append(node('p','rda-car-card-unmatched','Auto non associata al catalogo GT7.'));
    else {
      const dl=node('dl','rda-car-card-specs');
      for (const [key,label] of fields) {
        const field=node('div'); const value=specs[key];
        field.append(node('dt','',label),node('dd','',value == null || value === '' ? 'Non disponibile' : value)); dl.append(field);
      }
      body.append(dl,node('p','rda-car-card-note','Specifiche GT7 di catalogo · unità originali'));
    }
    dialog.append(header,body);
    if (!dialog.open) dialog.showModal();
    body.scrollTop=0;
    return true;
  }
  dialog.addEventListener('click',event=> {
    if(event.target!==dialog)return;
    const r=dialog.getBoundingClientRect();
    if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();
  });
  dialog.addEventListener('close',()=>{if(opener?.isConnected&&!shell.hidden&&!shell.inert)opener.focus();});
  shell.addEventListener('click',event=>{
    const button=event.target.closest('[data-rda-car-id]');
    if(button&&shell.contains(button))open(button.dataset.rdaCarId);
  });
  new MutationObserver(()=>{if((shell.hidden||shell.inert||shell.getAttribute('aria-hidden')==='true')&&dialog.open)dialog.close();}).observe(shell,{attributes:true,attributeFilter:['hidden','inert','aria-hidden']});
  window.RDA_CAR_CARD=Object.freeze({open});
})();
