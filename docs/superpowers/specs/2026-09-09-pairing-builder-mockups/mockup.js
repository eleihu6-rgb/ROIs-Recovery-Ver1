/* Design prototype only. All records and build results are local fixtures. */
const icons = window.mockIcons;
const option = document.body.dataset.option;
const names = { a: 'Compact form', b: 'Guided steps', c: 'Review workspace' };
const icon = name => icons[name] || '';
const iconButton = (name, title, id = '') => '<button type="button" class="iconbtn" title="' + title + '" aria-label="' + title + '"' + (id ? ' id="' + id + '"' : '') + '>' + icon(name) + '</button>';
const field = (label, content) => '<label class="field">' + label + content + '</label>';
const select = (id, values) => '<select id="' + id + '">' + values.map(v => '<option>' + v + '</option>').join('') + '</select>';
const number = (id, val, unit, min = 0) => '<div class="units"><input id="' + id + '" type="number" value="' + val + '" min="' + min + '" step="1" required><span>' + unit + '</span></div>';
const scope = () => '<section class="section"><h2>Flight scope</h2><div class="fields">' +
field('From date', '<input id="from" type="date" min="2026-09-01" max="2026-09-30" value="2026-09-09" required>') +
field('To date', '<input id="to" type="date" min="2026-09-01" max="2026-09-30" value="2026-09-15" required>') +
field('Pairing base', select('base', ['DXB', 'ADD'])) +
field('Fleet', select('fleet', ['A380', 'B788', 'B789', 'B737'])) +
field('Division', '<select id="division"><option>Pilot</option></select>') +
field('Flight availability', '<select id="availability"><option>Unpaired flights only</option></select>') +
'</div><p class="footnote">Dates in UTC. Entire rotation must fit inside this range.</p></section>' +
'<section class="section"><h2>Crew composition</h2><div class="composition">' +
['CA', 'FO'].map(r => '<label class="rank"><input id="' + r.toLowerCase() + '-enabled" type="checkbox" checked>' + r + '<input aria-label="' + r + ' crew count" id="' + r.toLowerCase() + '" type="number" min="1" max="20" value="2" required></label>').join('') +
'</div></section>';
const rules = () => '<section class="section"><h2>Build rules</h2><div class="rules-grid">' +
field('Minimum rest', number('rest',720,'min',720)) +
field('Multi-leg duty block', number('block',480,'min',1)) +
field('Check-in', number('checkin',120,'min',0)) +
field('Debrief', number('debrief',15,'min',0)) +
'</div><label class="toggle"><input id="longhaul" type="checkbox" checked>Allow single-leg long-haul block exemption</label>' +
'<div class="invariants">' + ['Base return','Station continuity','No overlap','Unique coverage'].map(x => '<span>' + icon('LockKeyhole') + x + '</span>').join('') +
'</div><p class="footnote">Real layovers only. Unclosable flights stay unpaired.</p></section>';
const review = () => '<section class="review-content"><h2>Build review</h2><div class="review-kv" id="review-kv"></div>' +
'<h3>Sample route</h3><div class="routepreview"><span class="station base-text">DXB</span><span class="connection">' + icon('Plane') + '</span><span class="station">LHR</span><span class="connection">' + icon('Plane') + '</span><span class="station base-text">DXB</span></div>' +
'<table class="reviewtable"><thead><tr><th>Duty</th><th>Route</th><th>Block</th><th>Next rest</th></tr></thead><tbody><tr><td>1</td><td class="outbound">DXB - LHR</td><td>07:20</td><td>18:00</td></tr><tr><td>2</td><td class="inbound">LHR - DXB</td><td>07:05</td><td>At base</td></tr></tbody></table>' +
'<div class="metrics"><span><strong>3</strong>Sample rotations</span><span><strong>6</strong>Sample flights</span><span><strong>2</strong>Unpaired</span></div>' +
'<div class="notice">2 sample flights have no return within the selected range.</div><p class="demo-caption">Illustrative route and counts. No live flight search.</p></section>';
const app = document.querySelector('#app');
app.innerHTML = '<header class="reviewbar"><strong>Pairing Builder / Design review</strong><nav aria-label="Mockup options">' +
Object.keys(names).map(k => '<a href="option-' + k + '.html"' + (option === k ? ' aria-current="page"' : '') + '>' + k.toUpperCase() + ' · ' + names[k] + '</a>').join('') +
'</nav><span class="sample">Prototype · Sample data only</span></header>' +
'<div class="shellbar"><strong>ROIS</strong><span class="active">Live Gantt</span><span>Scenarios</span><span>PBS</span></div>' +
'<div class="viewbar">' + icon('CalendarDays') + '<strong>01 Sep - 30 Sep 2026</strong><span>UTC</span><span class="tag">Pilot</span><span class="tag">Open / Partial</span></div>' +
'<main><section class="pane"><div class="panehead"><strong>Pairing</strong><span class="tag" id="pairing-count">4</span><span id="new-count"></span><div class="cluster">' +
iconButton('Route','Build round-trip pairings','open-builder') + iconButton('ShieldPlus','RES Pairing Creator') + iconButton('Filter','Filter') + iconButton('ArrowDownUp','Sort') + iconButton('Settings','Settings') +
'</div></div><div class="gridrow axis"><div class="rowlabel">Pairing / Fleet / Rank</div><div class="days">' + ['09 WED','10 THU','11 FRI','12 SAT','13 SUN','14 MON','15 TUE'].map(x => '<span>' + x + '</span>').join('') + '</div><div id="pairing-rows"></div></section><div class="statusline" id="pane-status" role="status"></div></main>' +
'<div class="overlay" id="overlay"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" data-layout="' + option + '">' +
'<header class="titlebar">' + icon('Route') + '<h1 id="dialog-title">Build Round-trip Pairings</h1>' + iconButton('X','Close dialog','close') + '</header>' +
'<div class="contextbar"><span class="tag">Live Gantt</span><span>01 - 30 Sep 2026 · UTC</span><span>Rule profile: 143</span></div>' +
(option === 'b' ? '<nav class="stepnav" aria-label="Build steps">' + ['Scope & crew','Rules','Review & build'].map((t,i) => '<button type="button" data-step="' + i + '"><span class="stepnum">' + (i+1) + '</span>' + t + '</button>').join('') + '</nav>' : '') +
'<form id="builder-form" class="body' + (option === 'c' ? ' workspace' : '') + '" novalidate>' +
(option === 'a' ? scope() + rules() : option === 'b' ? '<div class="wizardpane" data-page="0">' + scope() + '</div><div class="wizardpane" data-page="1" hidden>' + rules() + '</div><div class="wizardpane" data-page="2" hidden>' + review() + '</div>' : '<div class="settings">' + scope() + rules() + '</div><div class="inspection">' + review() + '</div>') +
'</form><div id="error" class="error" role="alert"></div><footer class="footer"><span class="summary" id="summary">DXB · A380 · CA 2 / FO 2</span>' +
'<button type="button" id="reset" title="Restore rule 143 defaults">' + icon('RotateCcw') + 'Reset</button><button type="button" id="back" hidden>' + icon('ChevronLeft') + 'Back</button>' +
'<button type="button" id="cancel">Cancel</button><button type="button" class="primary" id="next">Continue' + icon('ChevronRight') + '</button><button type="button" class="primary" id="build">' + icon('Play') + 'Build pairings</button>' +
'</footer></section></div>';
let step = 0;
let building = false;
let built = 0;
let timer;
const $ = id => document.getElementById(id);
const form = $('builder-form');
const rows = $('pairing-rows');
const sampleRow = (id, base, fleet, fresh, rank = 'CA 2 / FO 2') => '<div class="gridrow' + (fresh ? ' newrow' : '') + '" data-pairing="' + id + '"><div class="rowlabel"><div><strong>' + id + '</strong><small>' + base + ' · ' + fleet + ' · ' + rank + '</small></div>' + (fresh ? '<span class="tag green">New</span>' : '<small>Open</small>') + '</div><div class="track"><span class="puck">' + base + ' - LHR</span><span class="rest">REST</span><span class="puck">LHR - ' + base + '</span></div></div>';
rows.innerHTML = [104,103,102,101].map(n => sampleRow('SAMPLE-' + n,'DXB','A380',false)).join('');
function values() {
  return {base:$('base').value,fleet:$('fleet').value,from:$('from').value,to:$('to').value,
    ranks:['ca','fo'].filter(r => $(r+'-enabled').checked).map(r => r.toUpperCase()+' '+$(r).value).join(' / ')};
}
function update() {
  const v = values();
  $('summary').textContent = v.base+' · '+v.fleet+' · '+(v.ranks || 'Select crew ranks');
  if ($('review-kv')) {
    $('review-kv').innerHTML = '<div><small>Date range · UTC</small><strong>'+v.from+' to '+v.to+'</strong></div><div><small>Base / fleet</small><strong>'+v.base+' / '+v.fleet+'</strong></div><div><small>Crew composition</small><strong>'+v.ranks+'</strong></div><div><small>Rest / multi-leg block</small><strong>'+$('rest').value+' / '+$('block').value+' min</strong></div>';
    document.querySelectorAll('.base-text').forEach(x => x.textContent = v.base);
    document.querySelector('.outbound').textContent = v.base+' - LHR';
    document.querySelector('.inbound').textContent = 'LHR - '+v.base;
  }
  ['ca','fo'].forEach(r => $(r).disabled = !$(r+'-enabled').checked);
}
function validate() {
  let message = '';
  if (!$('from').value || !$('to').value || $('from').value < '2026-09-01' || $('to').value > '2026-09-30' || $('from').value > $('to').value) message = 'Choose a date range within the open Gantt: 01 - 30 Sep 2026.';
  else if (!values().ranks) message = 'Select at least one crew rank and its required count.';
  else if (!$('rest').validity.valid) message = 'Minimum rest must be at least 720 minutes for rule profile 143.';
  else if (!$('block').validity.valid || Number($('block').value) > 480) message = 'Multi-leg duty block must be between 1 and 480 minutes for rule profile 143.';
  else if (!form.checkValidity()) message = 'Enter valid whole numbers for crew counts, check-in and debrief.';
  $('error').textContent = message;
  return !message;
}
function showStep(n) {
  step = n;
  document.querySelectorAll('[data-page]').forEach(el => el.hidden = Number(el.dataset.page) !== n);
  document.querySelectorAll('[data-step]').forEach(el => el.setAttribute('aria-current',Number(el.dataset.step)===n ? 'step':'false'));
  $('back').hidden = option !== 'b' || n === 0;
  $('next').hidden = option !== 'b' || n === 2;
  $('build').hidden = option === 'b' && n !== 2;
}
function close() {
  if (building) return;
  $('overlay').hidden = true;
  $('open-builder').focus();
}
function open() {
  $('overlay').hidden = false;
  $('error').textContent = '';
  showStep(0);
  $('from').focus();
}
$('open-builder').onclick = open;
$('close').onclick = close;
$('cancel').onclick = close;
$('reset').onclick = () => { form.reset(); $('error').textContent = ''; update(); };
$('next').onclick = () => { if(validate()) showStep(Math.min(2,step+1)); };
$('back').onclick = () => showStep(Math.max(0,step-1));
document.querySelectorAll('[data-step]').forEach(el => el.onclick = () => { if(Number(el.dataset.step)<step || validate()) showStep(Number(el.dataset.step)); });
form.oninput = update;
form.onchange = update;
form.onsubmit = e => e.preventDefault();
$('fleet').addEventListener('change',() => { const count = $('fleet').value === 'B737' ? 1 : 2; $('ca').value=count; $('fo').value=count; update(); });
$('build').onclick = () => {
  if (building || !validate()) return;
  const v = values();
  building = true;
  $('summary').textContent = 'Building sample pairings...';
  document.querySelectorAll('.footer button').forEach(el => el.disabled = true);
  $('close').disabled = true;
  let count = 0;
  timer = setInterval(() => {
    count++; built++;
    rows.insertAdjacentHTML('afterbegin', sampleRow('DEMO-'+String(built).padStart(3,'0'),v.base,v.fleet,true,v.ranks));
    $('pairing-count').textContent = String(4+built);
    $('new-count').textContent = built+' new';
    $('summary').textContent = count+' / 3 sample pairings built';
    if(count===3){
      clearInterval(timer); building=false;
      document.querySelectorAll('.footer button').forEach(el => el.disabled=false);
      $('close').disabled=false;
      $('pane-status').textContent = '3 sample pairings built. Latest: DEMO-'+String(built).padStart(3,'0')+' · Newest first';
      update(); close();
    }
  },450);
};
document.addEventListener('keydown', e => {
  if($('overlay').hidden) return;
  if(e.key==='Escape'){e.preventDefault();close();}
  if(e.key==='Tab'){
    const list=[...document.querySelector('.dialog').querySelectorAll('button,input,select')].filter(el=>!el.disabled && el.getClientRects().length);
    const first=list[0],last=list[list.length-1];
    if(e.shiftKey && document.activeElement===first){e.preventDefault();last.focus();}
    else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first.focus();}
  }
});
const titlebar = document.querySelector('.titlebar');
let drag;
titlebar.addEventListener('pointerdown',e=>{
  if(e.target.closest('button')) return;
  const dialog=document.querySelector('.dialog');
  drag={x:e.clientX,y:e.clientY,rect:dialog.getBoundingClientRect()};
  titlebar.setPointerCapture(e.pointerId);
});
titlebar.addEventListener('pointermove',e=>{
  if(!drag)return;
  const rect=drag.rect;
  const dx=Math.max(8-rect.left,Math.min(innerWidth-rect.right-8,e.clientX-drag.x));
  const dy=Math.max(100-rect.top,Math.min(innerHeight-rect.bottom-8,e.clientY-drag.y));
  document.querySelector('.dialog').style.transform='translate('+dx+'px,'+dy+'px)';
});
titlebar.addEventListener('pointerup',()=>drag=null);
showStep(0);update();$('from').focus();

