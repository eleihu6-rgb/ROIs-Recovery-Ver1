/* Option C design revision: local sample search, selection and rotation preview. */
const inspection = document.querySelector('.inspection');
document.querySelector('.reviewbar a[aria-current]')?.removeAttribute('aria-current');
const revisionLink=document.createElement('a');
revisionLink.href='option-c-ver2.html';
revisionLink.textContent='Option C Ver2';
revisionLink.setAttribute('aria-current','page');
document.querySelector('.reviewbar nav').append(revisionLink);
inspection.innerHTML = '<section><div class="results-heading"><h2>Open flights <span class="tag" id="flight-count">Not searched</span></h2><button type="button" id="clear-flight" hidden>Clear selection</button></div><div id="search-summary" class="footnote" role="status">No search results.</div><div class="flight-list" id="flight-list"></div></section><section class="rotation-preview"><h2>Pairing preview</h2><div id="rotation-preview"><div class="empty-preview">' + icon('Route') + '<span>No flight selected</span></div></div></section>';
const findButton = document.createElement('button');
findButton.type = 'button';
findButton.id = 'find-flights';
findButton.innerHTML = icon('Filter') + 'Find open flights';
$('build').before(findButton);
let searchResults = null;
let selectedFlight = null;
let usedFlightIds = new Set();
let currentRotations = [];
const minutes = (a,b) => (new Date(b)-new Date(a))/60000;
const hhmm = value => Math.floor(value/60).toString().padStart(2,'0')+':'+Math.round(value%60).toString().padStart(2,'0');
const stamp = value => value.slice(8,10)+' Sep '+value.slice(11,16);
const fixtures = [];
for (const base of ['DXB','ADD']) {
  for (const fleet of ['A380','B788','B789','B737']) {
    const prefix = base === 'DXB' ? 'EK' : 'ET';
    for (const [i,station] of ['LHR','CDG','FRA'].entries()) {
      const day = 9+i*2;
      const date = '2026-09-'+String(day).padStart(2,'0');
      const nextDate = '2026-09-'+String(day+1).padStart(2,'0');
      const key = base+'-'+fleet+'-'+station;
      if(i===1){
        const airports=base==='DXB'?['DXB','MCT','DOH','MCT','DXB']:['ADD','NBO','EBB','NBO','ADD'];
        ['08:00','09:45','11:30','13:15'].forEach((time,s)=>{
          const end=['09:00','10:45','12:30','14:15'][s];
          fixtures.push({id:key+'-'+s,rotation:key,number:prefix+(301+s),base,fleet,dep:airports[s],arr:airports[s+1],start:date+'T'+time+':00Z',end:date+'T'+end+':00Z'});
        });
        continue;
      }
      fixtures.push({id:key+'-out',rotation:key,number:prefix+(201+i*2),base,fleet,dep:base,arr:station,start:date+'T08:00:00Z',end:date+'T15:20:00Z'});
      fixtures.push({id:key+'-in',rotation:key,number:prefix+(202+i*2),base,fleet,dep:station,arr:base,start:nextDate+'T11:20:00Z',end:nextDate+'T18:25:00Z'});
    }
    fixtures.push({id:base+'-'+fleet+'-unclosed',rotation:'unclosed',number:prefix+'209',base,fleet,dep:base,arr:'JFK',start:'2026-09-15T08:00:00Z',end:'2026-09-15T21:00:00Z'});
  }
}
function eligibleRotations(flights) {
  const groups = new Map();
  flights.forEach(f => { if(!groups.has(f.rotation))groups.set(f.rotation,[]);groups.get(f.rotation).push(f); });
  return [...groups.values()].filter(legs => {
    legs.sort((a,b)=>a.start.localeCompare(b.start));
    if(legs[0].dep!==values().base || legs.at(-1).arr!==values().base)return false;
    if(legs.some((f,i)=>i>0 && (legs[i-1].arr!==f.dep || minutes(legs[i-1].end,f.start)<0)))return false;
    const duties=groupDuties(legs);
    return duties.every((d,i)=>{
      const block=d.reduce((n,f)=>n+minutes(f.start,f.end),0);
      if(block>Number($('block').value) && !(d.length===1 && $('longhaul').checked))return false;
      if(i===duties.length-1)return true;
      const next=duties[i+1][0];
      const freeRest=minutes(d.at(-1).end,next.start)-Number($('debrief').value)-Number($('checkin').value);
      const dutyPeriod=minutes(d[0].start,d.at(-1).end)+Number($('checkin').value);
      return freeRest>=Math.max(Number($('rest').value),dutyPeriod);
    });
  });
}
function groupDuties(legs) {
  const duties=[];
  legs.forEach((leg,i)=>{
    if(i===0 || minutes(legs[i-1].end,leg.start)>=Number($('rest').value))duties.push([]);
    duties.at(-1).push(leg);
  });
  return duties;
}
function previewRotation(legs) {
  const duties=groupDuties(legs);
  const stages=duties.map((d,i)=>{
    const route=[d[0].dep,...d.map(f=>f.arr)].join(' → ');
    const stage='<div class="flight-stage"><small>Duty '+(i+1)+' · '+d.length+' segment'+(d.length===1?'':'s')+'</small><strong>'+route+'</strong><span>'+stamp(d[0].start)+' - '+d.at(-1).end.slice(11,16)+'</span></div>';
    if(i===duties.length-1)return stage;
    const ground=minutes(d.at(-1).end,duties[i+1][0].start);
    const freeRest=ground-Number($('debrief').value)-Number($('checkin').value);
    return stage+'<div class="layover-stage"><small>Layover · '+d.at(-1).arr+'</small><strong>'+hhmm(ground)+'</strong><span>'+hhmm(freeRest)+' rest between duties</span></div>';
  }).join('');
  const detail=duties.length===1?'<table class="reviewtable segment-detail"><thead><tr><th>Segment</th><th>Flight</th><th>Route</th><th>UTC</th><th>Turn</th></tr></thead><tbody>'+legs.map((f,i)=>'<tr><td>'+(i+1)+'</td><td>'+f.number+'</td><td>'+f.dep+' → '+f.arr+'</td><td>'+f.start.slice(11,16)+' - '+f.end.slice(11,16)+'</td><td>'+(i===legs.length-1?'At base':hhmm(minutes(f.end,legs[i+1].start)))+'</td></tr>').join('')+'</tbody></table>':'';
  return '<div class="rotation-line'+(duties.length===1?' single-duty':'')+'">'+stages+'</div>'+detail+'<div class="preview-facts"><span>'+icon('Check')+' Returns to '+legs[0].base+'</span><span>'+legs.length+' segments · '+duties.length+' '+(duties.length===1?'duty · No layover':'duties')+'</span><span>Total block '+hhmm(legs.reduce((n,f)=>n+minutes(f.start,f.end),0))+'</span></div>';
}
function renderSearch() {
  const selected = searchResults?.find(f=>f.id===selectedFlight);
  const rotation = selected ? currentRotations.find(legs=>legs.some(f=>f.id===selectedFlight)) : null;
  $('clear-flight').hidden = !selected;
  $('flight-count').textContent = searchResults===null ? 'Not searched' : String(searchResults.length);
  $('build').disabled = building || searchResults===null || (selected ? !rotation : !currentRotations.length);
  $('build').innerHTML = icon('Play') + (selected ? 'Build pairing' : 'Build all'+(searchResults===null?'':' ('+currentRotations.length+')'));
  if(searchResults===null)return;
  const uncovered=searchResults.length-currentRotations.reduce((n,r)=>n+r.length,0);
  $('search-summary').textContent = searchResults.length+' open flights · '+currentRotations.length+' valid rotations · '+uncovered+' without a valid return';
  $('flight-list').innerHTML = searchResults.length ? '<table class="reviewtable"><thead><tr><th></th><th>Flight / date</th><th>Route</th><th>Departure</th><th>Return</th></tr></thead><tbody>'+searchResults.map(f=>{
    const valid=currentRotations.some(r=>r.some(leg=>leg.id===f.id));
    return '<tr class="flight-result'+(f.id===selectedFlight?' selected':'')+'" data-flight="'+f.id+'"><td><input type="radio" name="flight-choice" aria-label="Select '+f.number+'" value="'+f.id+'" '+(f.id===selectedFlight?'checked':'')+'></td><td><strong>'+f.number+'</strong><small>'+f.start.slice(8,10)+' Sep · '+f.fleet+'</small></td><td>'+f.dep+' → '+f.arr+'</td><td>'+f.start.slice(11,16)+'</td><td><span class="'+(valid?'return-valid':'return-missing')+'">'+(valid?'Available':'No return')+'</span></td></tr>';
  }).join('')+'</tbody></table>' : '<div class="empty-preview">No open flights match this scope.</div>';
  $('rotation-preview').innerHTML = selected ? (rotation ? '<div class="preview-label">Selected flight: <strong>'+selected.number+'</strong> · One complete rotation</div>'+previewRotation(rotation) : '<div class="notice">'+selected.number+' has no valid base-return rotation within this scope and these rules. It will remain unpaired.</div>') :
    '<div class="batch-preview"><strong>All open flights in scope</strong><span>'+currentRotations.length+' rotations ready · '+uncovered+' flights will remain unpaired</span></div><div class="empty-preview">'+icon('Route')+'<span>No flight selected</span></div>';
  $('summary').textContent = selected ? (rotation?'1 pairing · '+rotation.length+' flights · '+values().ranks:'Selected flight cannot form a pairing') : currentRotations.length+' pairings · '+(searchResults.length-uncovered)+' flights · All in scope';
}
function invalidateSearch() {
  if(building)return;
  searchResults=null;selectedFlight=null;currentRotations=[];
  $('flight-list').innerHTML='';
  $('search-summary').textContent='Scope or rules changed. Find open flights to refresh results.';
  $('rotation-preview').innerHTML='<div class="empty-preview">'+icon('Route')+'<span>No flight selected</span></div>';
  renderSearch();
}
findButton.onclick = () => {
  if(building || !validate())return;
  const v=values();
  const from=new Date(v.from+'T00:00:00Z').getTime();
  const until=new Date(v.to+'T23:59:59Z').getTime();
  searchResults=fixtures.filter(f=>f.base===v.base && f.fleet===v.fleet && !usedFlightIds.has(f.id) &&
    new Date(f.start).getTime()-Number($('checkin').value)*60000>=from &&
    new Date(f.end).getTime()+Number($('debrief').value)*60000<=until);
  selectedFlight=null;
  currentRotations=eligibleRotations(searchResults);
  $('error').textContent='';
  renderSearch();
};
$('flight-list').addEventListener('click',e=>{
  if(building)return;
  const row=e.target.closest('[data-flight]');
  if(!row)return;
  selectedFlight=row.dataset.flight;
  renderSearch();
});
$('flight-list').addEventListener('change',e=>{
  if(building || e.target.name!=='flight-choice')return;
  selectedFlight=e.target.value;renderSearch();
});
$('clear-flight').onclick=()=>{selectedFlight=null;renderSearch();};
form.addEventListener('input',e=>{if(e.target.name!=='flight-choice')invalidateSearch();});
form.addEventListener('change',e=>{if(e.target.name!=='flight-choice')invalidateSearch();});
form.oninput=form.onchange=e=>{if(e.target.name==='flight-choice')renderSearch();else update();};
const originalReset=$('reset').onclick;
$('reset').onclick=()=>{originalReset();invalidateSearch();};
$('build').onclick=()=>{
  if(building || searchResults===null || !validate())return;
  const targets=selectedFlight?currentRotations.filter(r=>r.some(f=>f.id===selectedFlight)):currentRotations;
  if(!targets.length)return;
  const v=values();
  building=true;
  document.querySelectorAll('.dialog button,.dialog input,.dialog select').forEach(el=>el.disabled=true);
  let count=0;
  const commitTimer=setInterval(()=>{
    const legs=targets[count];
    legs.forEach(f=>usedFlightIds.add(f.id));
    count++;built++;
    const id='DEMO-'+String(built).padStart(3,'0');
    const item=document.createElement('div');
    item.innerHTML=sampleRow(id,v.base,v.fleet,true,v.ranks);
    const row=item.firstElementChild;
    row.querySelector('.track').innerHTML=legs.map((f,i)=>{
      const gap=i===0?0:minutes(legs[i-1].end,f.start);
      const connection=i===0?'':gap>=Number($('rest').value)?'<span class="rest">LAYOVER '+f.dep+' '+hhmm(gap)+'</span>':'<span class="turn-gap">'+hhmm(gap)+'</span>';
      return connection+'<span class="puck">'+f.dep+' - '+f.arr+'</span>';
    }).join('');
    rows.prepend(row);
    $('pairing-count').textContent=String(4+built);
    $('new-count').textContent=built+' new';
    $('summary').textContent=count+' / '+targets.length+' sample pairings built';
    if(count===targets.length){
      clearInterval(commitTimer);building=false;
      document.querySelectorAll('.dialog button,.dialog input,.dialog select').forEach(el=>el.disabled=false);
      $('pane-status').textContent=targets.length+' sample pairing'+(targets.length===1?'':'s')+' built · Latest '+id+' · Newest first';
      update();invalidateSearch();close();
    }
  },450);
};
renderSearch();
