// Injected WebView automation script for ROIS-Cloud crew portals (enhance-Ver3 #9).
// Extracted from PortalCaptureScreen so the generated script can be unit-tested
// (escaping, directAuth activation, token helpers, month ranges) without mounting
// a WebView or any native module. Pure string-builder: no React/RN imports.
//
// Strategy (fastest → fallback):
//   1. directAuth() — replicate the portal's own login API directly (RSA-encrypt
//      the password with getPublicKey, POST /api/auth, loginType NORMAL). On a
//      token, setToken() fires roster fetch immediately.
//   2. tryLogin() — drive the on-page Ant Design login form as a fallback.
//   3. gotoRoster() — navigate the SPA to /page/roster so it fetches the roster
//      (incl. the detail payload with dep/arv airports) which our hook captures.
//
// Tokens are never posted in full — only their source + length — so debug events
// stay credential-safe (enhance-Ver3 #5).

/** Month offsets fetched relative to the current month: previous, current, next. */
export const ROSTER_MONTH_OFFSETS = [-1, 0, 1] as const;

/** Per-airline login knobs threaded into the injected script. */
export interface InjectedJSOptions {
  /** Value for the portal's `outCaptcha` (email-code) login field. When set, it's
   *  added to the /login body — PR's TEST tenant needs a fixed code here. Omit for
   *  TG (no captcha): the login body then stays byte-identical to the original. */
  outCaptcha?: string;
}

export function buildInjectedJS(
  crewId: string,
  crewPw: string,
  // The direct-auth path RSA-encrypts the crew password and POSTs /login (the
  // same flow the backend miner uses). It needs JSEncrypt, which the portal page
  // does NOT expose as a global — so we must load it. Gating this off (an earlier
  // hardening attempt) broke the whole roster pull: no crypto → no /login → no
  // token → no roster. So it defaults ON. Proper hardening is to BUNDLE jsencrypt
  // locally (no remote URL); until then the CDN fallback is required for login.
  allowCdnFallback: boolean = true,
  opts: InjectedJSOptions = {},
): string {
  const CREW_JSON = JSON.stringify(crewId);
  const PW_JSON = JSON.stringify(crewPw);
  const OFFSETS_JSON = JSON.stringify([...ROSTER_MONTH_OFFSETS]);
  // Only carriers whose portal requires an email-code (PR) add `outCaptcha` to the
  // login body — so TG's body is exactly `{ passwords, userCode, captcha:'',
  // uniqueCode:'' }` as before (no behavioural change / byte-identical regression).
  const OUT_CAPTCHA_FIELD =
    opts.outCaptcha != null ? `, outCaptcha: ${JSON.stringify(opts.outCaptcha)}` : '';
  const cdnFallback = allowCdnFallback
    ? `var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/jsencrypt@3.3.2/bin/jsencrypt.min.js';
    s.onload = function(){ try{ doPost(window.JSEncrypt); }catch(e){ post({ type:'authresp', body:'enc-err '+String(e) }); } };
    s.onerror = function(){ post({ type:'authresp', body:'JSEncrypt CDN blocked (CSP)' }); };
    (document.head || document.documentElement).appendChild(s);`
    : `post({ type:'directAuthUnavailable', body:'JSEncrypt unavailable; using UI login' });`;
  return `
(function(){
  if (window.__royce) return; window.__royce = { tries:0, loginTried:false, rosterNav:false, rostersFetched:false, token:null, tokenSrc:null };
  var CREW = ${CREW_JSON};
  var PW = ${PW_JSON};
  var MONTH_OFFSETS = ${OFFSETS_JSON};
  function post(o){ try{ window.ReactNativeWebView.postMessage(JSON.stringify(o)); }catch(e){} }
  // ── Token helpers (enhance-Ver3 #5) ──────────────────────────────────────────
  // A single source of truth for the auth token. We PREFER an explicit token from
  // the /api/auth response over a regex-scanned storage token. We never post the
  // full token — only its source + length — so debug logs stay credential-safe.
  function setToken(t, src){
    if(!t || window.__royce.token) return;          // first valid token wins
    window.__royce.token = t; window.__royce.tokenSrc = src;
    post({ type:'token', src:src, len:String(t).length });
    try{ fetchRosters(); }catch(e){}                 // fetch immediately (enhance-Ver3 #6)
  }
  function getToken(){ return window.__royce.token || findJwt(); }
  function cap(url, text){
    if(!text) return;
    var t = String(text).trim();
    if(t.length < 2 || t.length > 2000000) return;
    if(t[0] !== '{' && t[0] !== '[') return;
    post({ type:'capture', url:String(url||''), body:t.slice(0,1500000) });
  }
  var of = window.fetch;
  if(of){
    window.fetch = function(){
      var a = arguments; var u = (a[0] && a[0].url) || a[0];
      post({ type:'req', method:(a[1]&&a[1].method)||'GET', url:String(u||'') }); // log every request
      return of.apply(this, a).then(function(r){
        try{ r.clone().text().then(function(x){ cap(u, x); }).catch(function(){}); }catch(e){}
        return r;
      });
    };
  }
  var X = window.XMLHttpRequest;
  if(X){
    var op = X.prototype.open, sd = X.prototype.send, srh = X.prototype.setRequestHeader;
    X.prototype.open = function(m,u){ this.__u = u; this.__m = m; this.__h = {}; return op.apply(this, arguments); };
    X.prototype.setRequestHeader = function(h,v){ try{ this.__h = this.__h||{}; this.__h[h] = v; }catch(e){} return srh.apply(this, arguments); };
    X.prototype.send = function(){
      var s = this;
      post({ type:'req', method:s.__m, url:String(s.__u||'') });
      // Capture request headers of authenticated API calls to learn the JWT header.
      if(/apiPortal/.test(String(s.__u||''))){ post({ type:'reqh', url:String(s.__u||''), headers:s.__h||{} }); }
      this.addEventListener('load', function(){ try{ cap(s.__u, s.responseText); }catch(e){} });
      return sd.apply(this, arguments);
    };
  }
  function storageDump(){
    if (window.__royce.dumped) return; window.__royce.dumped = true;
    var ls = {}, ss = {};
    try{ for(var i=0;i<localStorage.length;i++){ var k=localStorage.key(i); ls[k]=String(localStorage.getItem(k)).slice(0,500); } }catch(e){}
    try{ for(var j=0;j<sessionStorage.length;j++){ var k2=sessionStorage.key(j); ss[k2]=String(sessionStorage.getItem(k2)).slice(0,500); } }catch(e){}
    post({ type:'storage', ls:ls, ss:ss, cookie:(document.cookie||'').slice(0,400) });
  }
  function setVal(el, val){
    try{
      // Canonical React controlled-input set: native setter + reset React's
      // internal value tracker so the synthetic onChange actually fires (antd
      // Form needs this to register the value, else validation blocks submit).
      var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      var prev = el.value;
      try{ el.focus(); }catch(e){}
      setter.call(el, val);
      if (el._valueTracker) { el._valueTracker.setValue(prev); }
      el.dispatchEvent(new Event('input', { bubbles:true }));
      el.dispatchEvent(new Event('change', { bubbles:true }));
      el.dispatchEvent(new Event('blur', { bubbles:true }));
    }catch(e){}
  }
  function pressEnter(el){
    ['keydown','keypress','keyup'].forEach(function(t){
      try{ el.dispatchEvent(new KeyboardEvent(t, { key:'Enter', code:'Enter', keyCode:13, which:13, bubbles:true })); }catch(e){}
    });
  }
  function tryLogin(){
    var pw = document.querySelector('#form_item_passwords') || document.querySelector('input[type=password]');
    if(!pw) return false;
    var user = document.querySelector('#form_item_userCode');
    if(!user){
      var inputs = [].slice.call(document.querySelectorAll('input'));
      for(var i=0;i<inputs.length;i++){
        var ty = (inputs[i].type||'').toLowerCase();
        if(ty!=='password' && ty!=='hidden' && ty!=='checkbox' && ty!=='radio'){ user = inputs[i]; break; }
      }
    }
    if(!user) return false;
    setVal(user, CREW);
    setVal(pw, PW);
    // The primary "Sign In" submit (not "SSO Sign In"): a submit button whose
    // text is exactly Sign In / Login.
    var btns = [].slice.call(document.querySelectorAll('button[type=submit], button, input[type=submit], .ant-btn, .login-button'));
    var btn = null;
    for(var j=0;j<btns.length;j++){
      var label = (btns[j].textContent || btns[j].value || '').trim();
      if(/^(sign\\s?in|log\\s?in|登录|登入)$/i.test(label) && !/sso/i.test(label)){ btn = btns[j]; break; }
    }
    if(!btn){
      for(var k=0;k<btns.length;k++){
        var l2 = (btns[k].textContent || btns[k].value || '');
        if(/sign\\s?in|log\\s?in|登录/i.test(l2) && !/sso/i.test(l2)){ btn = btns[k]; break; }
      }
    }
    post({ type:'login', state:'filled', btn: !!btn });
    // Submit after the values register: button click, Enter, native form submit.
    setTimeout(function(){
      var f = pw.form || (user && user.form);
      var fired = { submit:false, click:false };
      try{ if(f) f.addEventListener('submit', function(){ fired.submit = true; }, { once:true }); }catch(e){}
      try{ if(btn) btn.addEventListener('click', function(){ fired.click = true; }, { once:true }); }catch(e){}
      try{ if(f && f.requestSubmit){ f.requestSubmit(btn || undefined); } }catch(e){}
      try{ if(btn) btn.click(); }catch(e){}
      try{ pressEnter(pw); }catch(e){}
      setTimeout(function(){
        try{
          var errs = [].slice.call(document.querySelectorAll('.ant-form-item-explain-error, .ant-form-item-explain, .ant-message, [role=alert]'))
            .map(function(e){ return (e.textContent||'').trim(); }).filter(Boolean).slice(0,6);
          post({
            type:'logindiag',
            userVal: user.value, pwLen: (pw.value||'').length,
            btnFound: !!btn, btnText: btn ? (btn.textContent||'').trim() : '', btnDisabled: btn ? !!btn.disabled : null,
            hasForm: !!f, formTag: f ? f.tagName : '',
            submitFired: fired.submit, clickFired: fired.click,
            url: location.href, errors: errs
          });
        }catch(e){ post({ type:'logindiag', err:String(e) }); }
      }, 700);
    }, 500);
    return true;
  }
  function scan(){
    try{
      [window.__INITIAL_STATE__, window.__NUXT__, window.rosterData, window.crewData].forEach(function(c){
        if(c){ try{ cap('window-state', JSON.stringify(c)); }catch(e){} }
      });
    }catch(e){}
  }
  // Once logged in to a ROIS portal, auto-navigate to the roster page so the SPA
  // itself fetches the roster (authenticated with its own token) — our fetch/XHR
  // hook then captures that JSON. More reliable than crafting the API call (the
  // portal auths via a token header, not just cookies). (ROIS-specific for now.)
  function gotoRoster(){
    if (window.__royce.rosterNav) return;
    if (!/roiscloud/i.test(location.host)) return;
    if (document.querySelector('input[type=password]')) return; // still on login
    if (/\\/page\\/roster/.test(location.href)) { window.__royce.rosterNav = true; return; }
    window.__royce.rosterNav = true;
    try{
      var base = location.pathname.replace(/(\\/portal\\/).*$/, '$1');
      if (base.indexOf('/portal/') === -1) base = '/tg/portal/';
      location.href = location.origin + base + 'page/roster';
    }catch(e){}
  }
  // Find the SPA's auth JWT (stored after login) so we can call the roster API
  // ourselves with the right Authorization header.
  function findJwt(){
    var all = '';
    try{ for(var i=0;i<localStorage.length;i++){ all += localStorage.getItem(localStorage.key(i)) + '\\n'; } }catch(e){}
    try{ for(var j=0;j<sessionStorage.length;j++){ all += sessionStorage.getItem(sessionStorage.key(j)) + '\\n'; } }catch(e){}
    var m = all.match(/eyJ[\\w-]+\\.[\\w-]+\\.[\\w-]+/);
    return m ? m[0] : null;
  }
  // Pull a token out of a /login response: prefer an explicit token field, else
  // fall back to the first JWT-looking string anywhere in the body. Handles BOTH
  // ROIS response shapes with no per-airline branch:
  //   • TG: response.data IS the token — a long opaque string. Accept that first.
  //   • PR: response.data is { token, loginSuccess, failMessage, ... } — the
  //     o.token lookup below picks it up (o = data). A failed PR login has
  //     token:null → returns null → we simply retry next tick.
  function extractToken(text){
    try{
      var j = JSON.parse(text);
      var d = (j && j.data);
      if (typeof d === 'string' && d.length > 60) return d;
      var o = d || j || {};
      var t = o.token || o.accessToken || o.access_token || o.jwt || o.authToken || j.token || j.accessToken;
      if (t) return String(t);
    }catch(e){}
    var m = String(text).match(/eyJ[\\w-]+\\.[\\w-]+\\.[\\w-]+/);
    return m ? m[0] : null;
  }
  function pad2(n){ return (n<10?'0':'')+n; }
  // Pull previous + current + next month's roster by default (so past/current
  // trips aren't missed), authenticated with the SPA's JWT. (ROIS-specific.)
  function fetchRosters(){
    if (window.__royce.rostersFetched) return;
    if (!/roiscloud/i.test(location.host)) return;
    var jwt = getToken();
    if (!jwt) return; // token not ready yet — retry next tick (or after setToken)
    window.__royce.rostersFetched = true;
    var apiBase = location.origin + location.pathname.replace(/\\/portal.*$/, '/apiPortal');
    var now = new Date();
    var hdrs = { 'Authorization': 'Bearer ' + jwt, 'userId': CREW };
    MONTH_OFFSETS.forEach(function(add){
      var first = new Date(now.getFullYear(), now.getMonth() + add, 1);
      var last = new Date(now.getFullYear(), now.getMonth() + add + 1, 0);
      var start = first.getFullYear() + '-' + pad2(first.getMonth()+1) + '-01T00:00:00';
      var end = last.getFullYear() + '-' + pad2(last.getMonth()+1) + '-' + pad2(last.getDate()) + 'T23:59:59';
      var qs = '?crewId=' + encodeURIComponent(CREW) + '&startDateTime=' + start + '&endDateTime=' + end;
      // (1) Calendar — the duty list (assignment, times, briefStart). No airports.
      var calUrl = apiBase + '/api/rosterFlight/selectPortalCalendar' + qs + '&type=rp';
      fetch(calUrl, { headers: hdrs })
        .then(function(r){ return r.text(); }).then(function(t){ cap(calUrl, t); }).catch(function(){});
      // (2) Roster report — carries the REAL dep/arv airports + layover hotel per
      // flight (data.crewRosterReportInfoVoList[].crewRosterReportInfoDetatilVo[] =
      // {fltNum, dep, arv, hotelName, ...}). buildAirportIndex enriches from this,
      // so trip cards show BKK→KTM instead of the DEP/ARR placeholder (the bug).
      var repUrl = apiBase + '/api/rosterFlight/selectCrewRosterReport' + qs;
      fetch(repUrl, { headers: hdrs })
        .then(function(r){ return r.text(); }).then(function(t){ cap(repUrl, t); }).catch(function(){});
      // (3) Calendar DETAIL (all) — the richer per-day payload whose ground rows
      // (portalCalendarDetailRosterGroundInfoVoList[]) carry TRAINING/course detail
      // the plain calendar omits: courseName, courseDesc, role, location, device,
      // courseType. buildTrainingIndex enriches TRG/SIM duties from this so the
      // training card can show the course. (Verified live for crew 36826.)
      var detUrl = apiBase + '/api/rosterFlight/selectPortalCalendarDetailAll' + qs + '&type=rp';
      fetch(detUrl, { headers: hdrs })
        .then(function(r){ return r.text(); }).then(function(t){ cap(detUrl, t); }).catch(function(){});
    });
  }
  // Robust antd login: reach the Ant Design form INSTANCE via the React fiber,
  // set its fields directly (so rc-field-form's store has the values), then call
  // its own submit() — the portal then runs its real login (RSA + token storage).
  function antdSubmit(){
    if (window.__royce.antdDone) return false;
    var pwEl = document.querySelector('#form_item_passwords') || document.querySelector('input[type=password]');
    if (!pwEl) return false;
    var formEl = pwEl.form;
    var host = formEl || pwEl;
    var fkey = Object.keys(host).find(function(k){ return k.indexOf('__reactFiber') === 0 || k.indexOf('__reactInternalInstance') === 0; });
    if (!fkey){ post({ type:'antd', stage:'no-fiber' }); return false; }
    var node = host[fkey];
    var form = null, depth = 0;
    while(node && depth < 40){
      var p = node.memoizedProps;
      if (p && p.form && typeof p.form.setFieldsValue === 'function' && typeof p.form.submit === 'function'){ form = p.form; break; }
      node = node.return; depth++;
    }
    if (!form){ post({ type:'antd', stage:'no-form-instance' }); return false; }
    window.__royce.antdDone = true;
    try{
      form.setFieldsValue({ userCode: CREW, passwords: PW, userName: CREW, password: PW });
      post({ type:'antd', stage:'set-fields' });
      setTimeout(function(){ try{ form.submit(); post({ type:'antd', stage:'submitted' }); }catch(e){ post({ type:'antd', stage:'submit-err', e:String(e) }); } }, 150);
    }catch(e){ post({ type:'antd', stage:'set-err', e:String(e) }); }
    return true;
  }
  // Replicate the portal's REAL password login (reverse-engineered + verified
  // live, 2026-05-31): RSA-encrypt the password with getPublicKey (JSEncrypt) and
  // POST /login with body { user: { passwords, userCode, captcha, uniqueCode } }.
  // The response's data field is the auth JWT. (NOTE: /api/auth is the SSO token
  // exchange, NOT password login — it requires a pre-auth JWT and is the wrong
  // endpoint; /login is the ID+PW endpoint that works on the test portal.)
  function directAuth(){
    if (window.__royce.authTried) return;
    if (!/roiscloud/i.test(location.host)) return;
    // Login-page detection. TG shows the username/password form immediately (a
    // password input is in the DOM). PR's CrewSE portal instead gates the form
    // behind a "rotate to landscape" splash + an SSO / ACCOUNT-LOGIN choice, so no
    // password input exists yet — but directAuth POSTs the /login API DIRECTLY
    // (RSA password + outCaptcha) and never reads the visible form, and a UI splash
    // can't block a fetch. So also proceed on any portal login route.
    var onLoginPage = !!document.querySelector('input[type=password]')
      || /\\/portal(\\/login)?\\/?$/i.test(location.pathname);
    if (!onLoginPage) return;
    window.__royce.authTried = true;
    var apiBase = location.origin + location.pathname.replace(/\\/portal.*$/, '/apiPortal');
    function doPost(JSEncrypt){
      fetch(apiBase + '/system/getPublicKey').then(function(r){ return r.json(); }).then(function(j){
        var enc = new JSEncrypt(); enc.setPublicKey(j.data);
        var ep = enc.encrypt(PW);
        var body = { user: { passwords: ep, userCode: CREW, captcha: '', uniqueCode: ''${OUT_CAPTCHA_FIELD} } };
        return fetch(apiBase + '/login', {
          method:'POST',
          headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer null' },
          body: JSON.stringify(body)
        });
      }).then(function(r){ return r.text(); }).then(function(t){
        post({ type:'authresp', url: apiBase + '/login', body: String(t).slice(0,200) });
        // Promote the token (response.data) so roster fetch can start at once.
        var tok = extractToken(t);
        if (tok) { setToken(tok, 'directAuth'); }
      }).catch(function(e){ post({ type:'authresp', body:'ERR ' + String(e) }); });
    }
    if (window.JSEncrypt){ doPost(window.JSEncrypt); return; }
    ${cdnFallback}
  }
  function diagLogin(){
    if (window.__royce.diagged) return;
    var pw = document.querySelector('input[type=password]');
    if (!pw) return;
    window.__royce.diagged = true;
    var inputs = [].slice.call(document.querySelectorAll('input')).map(function(i){
      return { name:i.name, id:i.id, type:i.type, ph:i.placeholder, cls:(i.className||'').slice(0,40) };
    });
    var btns = [].slice.call(document.querySelectorAll('button, [type=submit], input[type=submit], .el-button, .ant-btn')).map(function(b){
      return { t:(b.textContent||b.value||'').trim().slice(0,24), type:b.type, cls:(b.className||'').slice(0,40) };
    });
    post({ type:'loginform', inputs:inputs, buttons:btns, url:location.href });
  }
  // PR's CrewSE portal (unlike TG) gates the login form behind a "rotate to
  // landscape" splash and an SSO / ACCOUNT-LOGIN choice. Auto-dismiss the splash and
  // pick ACCOUNT LOGIN (never SSO) so the username/password form appears — this
  // matters for the on-page tryLogin fallback (directAuth already bypasses the UI via
  // the /login API). Harmless no-op on TG, whose portal has neither element.
  function clickByText(re){
    var nodes = [].slice.call(document.querySelectorAll('button, a, [role=button], div, span, p'));
    for(var i=0;i<nodes.length;i++){
      var el = nodes[i];
      if(el.children.length > 3) continue;              // prefer leaf-ish clickables
      if(re.test((el.textContent||'').trim())){
        var target = el.closest('button, a, [role=button]') || el;
        try{ target.click(); }catch(e){}
        return true;
      }
    }
    return false;
  }
  function dismissInterstitials(){
    if(!/roiscloud/i.test(location.host)) return;
    if(document.querySelector('input[type=password]')) return; // form already shown
    // 1) "Please rotate your device… Tap anywhere to continue" splash.
    if(!window.__royce.splashDone && clickByText(/tap anywhere to continue|rotate your device/i)){
      window.__royce.splashDone = true; post({ type:'interstitial', step:'splash' });
    }
    // 2) SSO vs ACCOUNT choice — always ACCOUNT LOGIN, never SSO.
    if(!window.__royce.acctDone && clickByText(/^account\\s*login$/i)){
      window.__royce.acctDone = true; post({ type:'interstitial', step:'account-login' });
    }
  }
  var iv = setInterval(function(){
    window.__royce.tries++;
    if(window.__royce.tries > 40){ clearInterval(iv); return; }
    // PR only: clear the rotate splash + pick ACCOUNT LOGIN so the form appears.
    dismissInterstitials();
    // FASTEST path first: replicate the portal's own login API directly (RSA →
    // POST /api/auth with loginType NORMAL). If it returns a token, setToken()
    // fires roster fetch immediately — no UI navigation needed (enhance-Ver3 #4).
    directAuth();
    // Fallback: drive the on-page login form while it's still present, then once
    // logged in pull the roster directly + navigate so the SPA fetches it too.
    if(window.__royce.tries <= 25 && document.querySelector('input[type=password]')){
      tryLogin();
    }
    fetchRosters();   // pull prev+current+next month directly (default)
    gotoRoster();     // also navigate so the SPA loads the roster page
    scan();
    post({ type:'page', url: location.href, title: document.title });
  }, 1500);
  post({ type:'ready' });
})();
true;
`;
}
