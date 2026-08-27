"""The generic full-page live viewer, served as a single self-contained HTML page
(no build step, no gantt dependency). It reads the stream id from its own path and
the token from the query string, opens the stream WebSocket, and paints JPEG frames
onto a full-window canvas. Reusable by any producer/consumer."""

VIEWER_HTML = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Playwright Live</title>
<style>
  :root { color-scheme: dark; }
  html, body { margin: 0; height: 100%; background: #0b0b0c; color: #e8e8ea;
    font: 13px/1.4 ui-sans-serif, system-ui, -apple-system, sans-serif; }
  #bar { display: flex; align-items: center; gap: 12px; height: 36px; padding: 0 12px;
    background: #16161a; border-bottom: 1px solid #26262c; }
  #bar .dot { width: 8px; height: 8px; border-radius: 50%; background: #6b7280; }
  #bar.live .dot { background: #16a34a; }
  #bar.ended .dot { background: #b45309; }
  #bar.down .dot { background: #dc2626; }
  #bar b { font-weight: 600; }
  #bar .sp { flex: 1; }
  #bar .muted { color: #9ca3af; }
  #wrap { position: absolute; top: 36px; left: 0; right: 0; bottom: 0;
    display: flex; align-items: center; justify-content: center; }
  canvas { max-width: 100%; max-height: 100%; }
  #hint { position: absolute; color: #9ca3af; }
</style>
</head>
<body>
  <div id="bar">
    <span class="dot"></span>
    <span data-testid="live-kind" class="muted"></span>
    <b data-testid="live-title"></b>
    <span data-testid="live-page" class="muted"></span>
    <span class="sp"></span>
    <span data-testid="live-frames" class="muted">frames: 0</span>
    <span data-testid="live-viewers" class="muted"></span>
    <span data-testid="live-status">connecting…</span>
  </div>
  <div id="wrap">
    <span id="hint">waiting for first frame…</span>
    <canvas id="cv" width="1280" height="720"></canvas>
  </div>
<script>
(function () {
  // Derive the stream WS from our own path so it works behind any proxy prefix
  // (local /ai/live/.../watch and tunnelled /altair/ai/live/.../watch alike):
  // <prefix>/streams/{id}/watch -> <prefix>/streams/{id}/stream
  var token = new URLSearchParams(location.search).get('token') || '';
  var wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  var streamPath = location.pathname.replace(/\\/watch\\/?$/, '/stream');
  var base = wsProto + '//' + location.host + streamPath + '?token=' + encodeURIComponent(token);

  var bar = document.getElementById('bar');
  var hint = document.getElementById('hint');
  var cv = document.getElementById('cv');
  var ctx = cv.getContext('2d');
  var elStatus = document.querySelector('[data-testid=live-status]');
  var elKind = document.querySelector('[data-testid=live-kind]');
  var elTitle = document.querySelector('[data-testid=live-title]');
  var elPage = document.querySelector('[data-testid=live-page]');
  var elFrames = document.querySelector('[data-testid=live-frames]');
  var elViewers = document.querySelector('[data-testid=live-viewers]');

  window.__liveFrames = 0;
  var ended = false;
  var backoff = 500;

  function setBar(cls, status) { bar.className = cls; elStatus.textContent = status; }

  function draw(b64) {
    var img = new Image();
    img.onload = function () {
      if (cv.width !== img.naturalWidth || cv.height !== img.naturalHeight) {
        cv.width = img.naturalWidth; cv.height = img.naturalHeight;
      }
      ctx.drawImage(img, 0, 0);
      hint.style.display = 'none';
      window.__liveFrames += 1;
      elFrames.textContent = 'frames: ' + window.__liveFrames;
    };
    img.src = 'data:image/jpeg;base64,' + b64;
  }

  function onMessage(raw) {
    var m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (m.type === 'meta') {
      if (m.kind) elKind.textContent = m.kind;
      if (m.title) elTitle.textContent = m.title;
      if (typeof m.viewerCount === 'number') elViewers.textContent = m.viewerCount + ' watching';
      if (m.currentPage) elPage.textContent = '· ' + m.currentPage;
      if (m.status === 'ended') { ended = true; setBar('ended', 'stream ended'); }
      else setBar('live', 'live');
    } else if (m.type === 'page') {
      elPage.textContent = '· ' + (m.title || m.url || '');
    } else if (m.type === 'frame') {
      if (!ended) setBar('live', 'live');
      draw(m.data);
    } else if (m.type === 'end') {
      ended = true; setBar('ended', 'stream ended');
    }
  }

  function connect() {
    var ws = new WebSocket(base);
    ws.onopen = function () { backoff = 500; };
    ws.onmessage = function (ev) { onMessage(ev.data); };
    ws.onclose = function () {
      if (ended) return;
      setBar('down', 'disconnected, retrying…');
      setTimeout(connect, backoff);
      backoff = Math.min(backoff * 2, 5000);
    };
    ws.onerror = function () { try { ws.close(); } catch (e) {} };
  }
  connect();
})();
</script>
</body>
</html>
"""
