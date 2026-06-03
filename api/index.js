const express = require('express');
const { kv } = require('@vercel/kv');
const app = express();
app.use(express.json());

app.use(function(req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const CLIENT_ID     = process.env.STRAVA_CLIENT_ID;
const CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;
const BASE_URL      = process.env.BASE_URL;

// ── KV helpers ───────────────────────────────────────
async function getToken(userId) {
  try { return await kv.get('strava:' + userId); } catch(e) { return null; }
}
async function setToken(userId, data) {
  await kv.set('strava:' + userId, data);
}
async function delToken(userId) {
  await kv.del('strava:' + userId);
}
async function getFreshToken(userId) {
  const tok = await getToken(userId);
  if (!tok) return null;
  // Refresh se scaduto
  if (Date.now() / 1000 < tok.expires_at - 60) return tok;
  const r = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: tok.refresh_token
    })
  });
  const refreshed = await r.json();
  const updated = {
    ...tok,
    access_token:  refreshed.access_token,
    refresh_token: refreshed.refresh_token,
    expires_at:    refreshed.expires_at
  };
  await setToken(userId, updated);
  return updated;
}

// ── AUTH: redirect a Strava ──────────────────────────
app.get('/auth/strava', (req, res) => {
  const userId = req.query.userId || 'default';
  res.redirect(
    'https://www.strava.com/oauth/authorize' +
    '?client_id=' + CLIENT_ID +
    '&response_type=code' +
    '&redirect_uri=' + encodeURIComponent(BASE_URL + '/auth/strava/callback') +
    '&scope=read,activity:read_all' +
    '&state=' + userId
  );
});

// ── AUTH: callback da Strava ─────────────────────────
app.get('/auth/strava/callback', async (req, res) => {
  const { code, state: userId } = req.query;
  try {
    const r = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        grant_type: 'authorization_code'
      })
    });
    const data = await r.json();
    if (data.errors) throw new Error(data.message);
    await setToken(userId, {
      access_token:  data.access_token,
      refresh_token: data.refresh_token,
      expires_at:    data.expires_at,
      athlete:       data.athlete
    });
    const nome = data.athlete.firstname;
    res.send(`<!DOCTYPE html><html><head><title>Connesso</title></head>
<body style="font-family:sans-serif;background:#050505;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;gap:12px">
  <div style="font-size:2.5rem">✓</div>
  <div style="font-size:1.1rem;font-weight:600">Ciao ${nome}, sei connesso!</div>
  <div style="font-size:.85rem;color:rgba(255,255,255,.4)">Puoi chiudere questa finestra</div>
  <script>
    localStorage.setItem('stravaConnected','true');
    localStorage.setItem('stravaAthleteName','${nome}');
    localStorage.setItem('stravaUserId','${userId}');
    if(window.opener) window.opener.postMessage({type:'strava_connected',name:'${nome}'},'*');
    setTimeout(function(){ window.close(); }, 2000);
  </script>
</body></html>`);
  } catch(e) {
    res.status(500).send('Errore OAuth: ' + e.message);
  }
});

// ── STATUS ────────────────────────────────────────────
app.get('/api/strava/status', async (req, res) => {
  const userId = req.query.userId || 'default';
  const tok = await getToken(userId);
  res.json(tok
    ? { connected: true, athlete: tok.athlete }
    : { connected: false }
  );
});

// ── ACTIVITIES ────────────────────────────────────────
app.get('/api/strava/activities', async (req, res) => {
  const userId  = req.query.userId  || 'default';
  const perPage = req.query.perPage || 30;
  const tok = await getFreshToken(userId);
  if (!tok) return res.status(401).json({ error: 'Non autenticato' });
  const r = await fetch(
    'https://www.strava.com/api/v3/athlete/activities?per_page=' + perPage,
    { headers: { Authorization: 'Bearer ' + tok.access_token } }
  );
  const acts = await r.json();
  if (!Array.isArray(acts)) return res.status(500).json({ error: 'Errore Strava', detail: acts });
  res.json({
    activities: acts.map(a => ({
      stravaId: a.id,
      titolo:   a.name,
      sport:    a.type,
      data:     a.start_date_local.split('T')[0],
      distanza: (a.distance / 1000).toFixed(1) + ' km',
      durata:   Math.round(a.moving_time / 60) + ' min',
      fc:       a.average_heartrate ? Math.round(a.average_heartrate) : null,
      tss:      Math.round((a.moving_time / 3600) * (a.average_heartrate || 140) / 1.5),
      note:     'Da Strava',
      fonte:    'strava'
    }))
  });
});

// ── DISCONNECT ────────────────────────────────────────
app.delete('/api/strava/disconnect', async (req, res) => {
  const userId = req.query.userId || 'default';
  await delToken(userId);
  res.json({ ok: true });
});

// ── AI PROXY ──────────────────────────────────────────
app.post('/api/ai', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key non configurata' });
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':    'application/json',
        'x-api-key':       apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model:      req.body.model || 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        system:     req.body.system,
        messages:   req.body.messages
      })
    });
    res.json(await r.json());
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = app;
