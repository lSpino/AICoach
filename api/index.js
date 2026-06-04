// Vercel Serverless Function

const CLIENT_ID     = process.env.STRAVA_CLIENT_ID;
const CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;
const BASE_URL      = process.env.BASE_URL;

// Token store — persiste finché il server è caldo (~10 min idle)
// Per persistenza definitiva: aggiungi Vercel KV
const tokens = global._tokens || (global._tokens = {});

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function refreshIfNeeded(userId) {
  const tok = tokens[userId];
  if (!tok) return null;
  if (Date.now() / 1000 < tok.expires_at - 60) return tok;
  try {
    const r = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
        grant_type: 'refresh_token', refresh_token: tok.refresh_token
      })
    });
    const d = await r.json();
    tokens[userId] = { ...tok, access_token: d.access_token, refresh_token: d.refresh_token, expires_at: d.expires_at };
    return tokens[userId];
  } catch(e) {
    return tok; // ritorna vecchio token in caso di errore
  }
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = req.url || '';
  const qs = url.includes('?') ? url.split('?')[1] : '';
  const params = new URLSearchParams(qs);
  const userId = params.get('userId') || 'default';

  // ── GET /auth/strava ──────────────────────────────
  if (url.startsWith('/auth/strava') && !url.startsWith('/auth/strava/callback')) {
    const redirect = 'https://www.strava.com/oauth/authorize' +
      '?client_id=' + CLIENT_ID +
      '&response_type=code' +
      '&redirect_uri=' + encodeURIComponent(BASE_URL + '/auth/strava/callback') +
      '&scope=read,activity:read_all' +
      '&state=' + userId;
    res.setHeader('Location', redirect);
    return res.status(302).end();
  }

  // ── GET /auth/strava/callback ─────────────────────
  if (url.startsWith('/auth/strava/callback')) {
    const code  = params.get('code');
    const state = params.get('state') || 'default';
    try {
      const r = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
          code, grant_type: 'authorization_code'
        })
      });
      const data = await r.json();
      if (data.errors) throw new Error(data.message);
      tokens[state] = {
        access_token:  data.access_token,
        refresh_token: data.refresh_token,
        expires_at:    data.expires_at,
        athlete:       data.athlete
      };
      const nome = data.athlete.firstname;
      return res.status(200).send(`<!DOCTYPE html><html><head><title>Connesso</title></head>
<body style="font-family:sans-serif;background:#050505;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;gap:12px">
  <div style="font-size:2.5rem">✓</div>
  <div style="font-size:1.1rem;font-weight:600">Ciao ${nome}, sei connesso!</div>
  <div style="font-size:.85rem;color:rgba(255,255,255,.4)">Chiudi questa finestra</div>
  <script>
    localStorage.setItem('stravaConnected','true');
    localStorage.setItem('stravaAthleteName','${nome}');
    localStorage.setItem('stravaUserId','${state}');
    if(window.opener) window.opener.postMessage({type:'strava_connected',name:'${nome}'},'*');
    setTimeout(function(){ window.close(); }, 2000);
  </script>
</body></html>`);
    } catch(e) {
      return res.status(500).send('Errore OAuth: ' + e.message);
    }
  }

  // ── GET /api/strava/status ────────────────────────
  if (url.startsWith('/api/strava/status')) {
    const tok = tokens[userId];
    return res.status(200).json(tok
      ? { connected: true, athlete: tok.athlete }
      : { connected: false });
  }

  // ── GET /api/strava/activities ────────────────────
  if (url.startsWith('/api/strava/activities')) {
    const perPage = params.get('perPage') || 30;
    const tok = await refreshIfNeeded(userId);
    if (!tok) return res.status(401).json({ error: 'Non autenticato' });
    const r = await fetch(
      'https://www.strava.com/api/v3/athlete/activities?per_page=' + perPage,
      { headers: { Authorization: 'Bearer ' + tok.access_token } }
    );
    const acts = await r.json();
    if (!Array.isArray(acts)) return res.status(500).json({ error: 'Errore Strava', detail: acts });
    return res.status(200).json({
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
  }

  // ── DELETE /api/strava/disconnect ─────────────────
  if (url.startsWith('/api/strava/disconnect') && req.method === 'DELETE') {
    delete tokens[userId];
    return res.status(200).json({ ok: true });
  }

  // ── POST /api/ai ──────────────────────────────────
  if (url.startsWith('/api/ai') && req.method === 'POST') {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'API key non configurata' });
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type':      'application/json',
          'x-api-key':         apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model:      body.model || 'claude-sonnet-4-20250514',
          max_tokens: 4000,
          system:     body.system,
          messages:   body.messages
        })
      });
      return res.status(200).json(await r.json());
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(404).json({ error: 'Route non trovata', url });
};
