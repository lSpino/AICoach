// Endurance Coach — Vercel Serverless API
// Nessuna dipendenza esterna — memoria globale per i token

const CLIENT_ID     = process.env.STRAVA_CLIENT_ID;
const CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;
const BASE_URL      = process.env.BASE_URL;

// Token store in memoria globale di Node
// Persiste finché l'istanza è calda (~10 min idle su Vercel free)
const T = global.__tokens || (global.__tokens = {});

// ── helpers ───────────────────────────────────────────
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function refreshToken(userId) {
  const tok = T[userId];
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
    T[userId] = { ...tok, access_token: d.access_token, refresh_token: d.refresh_token, expires_at: d.expires_at };
    return T[userId];
  } catch(e) { return tok; }
}

function mapActivity(a) {
  return {
    stravaId: a.id,
    tipo:     a.name || a.type || 'Allenamento',
    titolo:   a.name || 'Allenamento',
    sport:    a.type,
    data:     (a.start_date_local || '').split('T')[0],
    distanza: a.distance ? (a.distance / 1000).toFixed(1) + ' km' : null,
    km:       a.distance ? parseFloat((a.distance / 1000).toFixed(1)) : null,
    durata:   a.moving_time ? Math.round(a.moving_time / 60) + ' min' : null,
    fc:       a.average_heartrate ? Math.round(a.average_heartrate) : null,
    fcMax:    a.max_heartrate ? Math.round(a.max_heartrate) : null,
    cadenza:  a.average_cadence ? Math.round(a.average_cadence) : null,
    tss:      a.moving_time ? Math.round((a.moving_time / 3600) * (a.average_heartrate || 140) / 1.5) : null,
    elevation:a.total_elevation_gain || null,
    note:     a.description || ('Da Strava · ' + (a.type || '')),
    fonte:    'strava',
    source:   'strava'
  };
}

// ── main handler ──────────────────────────────────────
module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url   = req.url || '';
  const qs    = url.includes('?') ? url.split('?')[1] : '';
  const p     = new URLSearchParams(qs);
  const uid   = p.get('userId') || 'default';

  // GET /auth/strava  →  redirect a Strava
  if (url.startsWith('/auth/strava') && !url.startsWith('/auth/strava/callback')) {
    if (!CLIENT_ID) return res.status(500).send('STRAVA_CLIENT_ID non configurato');
    const dest = 'https://www.strava.com/oauth/authorize' +
      '?client_id='     + CLIENT_ID +
      '&response_type=code' +
      '&redirect_uri='  + encodeURIComponent(BASE_URL + '/auth/strava/callback') +
      '&scope=read,activity:read_all' +
      '&state='         + uid;
    res.setHeader('Location', dest);
    return res.status(302).end();
  }

  // GET /auth/strava/callback  →  scambia code con token
  if (url.startsWith('/auth/strava/callback')) {
    const code  = p.get('code');
    const state = p.get('state') || 'default';
    if (!code) return res.status(400).send('Manca il codice OAuth');
    try {
      const r = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code, grant_type: 'authorization_code' })
      });
      const d = await r.json();
      if (d.errors) throw new Error(d.message || JSON.stringify(d.errors));
      T[state] = { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: d.expires_at, athlete: d.athlete };
      const nome = d.athlete.firstname;
      return res.status(200).send(`<!DOCTYPE html>
<html><head><title>Connesso</title></head>
<body style="font-family:system-ui;background:#050505;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:12px;margin:0">
  <div style="font-size:3rem">✓</div>
  <div style="font-size:1.1rem;font-weight:600">Ciao ${nome}, sei connesso!</div>
  <div style="font-size:.85rem;color:rgba(255,255,255,.4)">Chiudi questa finestra</div>
  <script>
    localStorage.setItem('stravaConnected','true');
    localStorage.setItem('stravaAthleteName','${nome}');
    localStorage.setItem('stravaUserId','${state}');
    if(window.opener) window.opener.postMessage({type:'strava_connected',name:'${nome}'},'*');
    setTimeout(function(){ window.close(); },2000);
  </script>
</body></html>`);
    } catch(e) {
      return res.status(500).send('Errore OAuth: ' + e.message);
    }
  }

  // GET /api/strava/status
  if (url.startsWith('/api/strava/status')) {
    const tok = T[uid];
    return res.status(200).json(tok ? { connected: true, athlete: tok.athlete } : { connected: false });
  }

  // GET /api/strava/activities
  if (url.startsWith('/api/strava/activities')) {
    const perPage = parseInt(p.get('perPage') || '60', 10);
    const tok = await refreshToken(uid);
    if (!tok) return res.status(401).json({ error: 'Non autenticato — riconnetti Strava' });
    try {
      const r = await fetch(
        'https://www.strava.com/api/v3/athlete/activities?per_page=' + perPage,
        { headers: { Authorization: 'Bearer ' + tok.access_token } }
      );
      const acts = await r.json();
      if (!Array.isArray(acts)) return res.status(500).json({ error: 'Risposta Strava non valida', detail: acts });
      return res.status(200).json({ activities: acts.map(mapActivity) });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // GET /api/strava/streams?activityId=xxx  → lap/splits data
  if (url.startsWith('/api/strava/streams')) {
    const actId = p.get('activityId');
    if (!actId) return res.status(400).json({ error: 'activityId mancante' });
    const tok = await refreshToken(uid);
    if (!tok) return res.status(401).json({ error: 'Non autenticato' });
    try {
      // Prima prova i laps (km personalizzati dall'atleta)
      const lapsR = await fetch(
        'https://www.strava.com/api/v3/activities/' + actId + '/laps',
        { headers: { Authorization: 'Bearer ' + tok.access_token } }
      );
      const laps = await lapsR.json();

      let splits = [];
      if (Array.isArray(laps) && laps.length > 0) {
        splits = laps.map(function(l) {
          const distKm = l.distance ? l.distance / 1000 : null;
          return {
            lap:      l.lap_index || 0,
            distanza: distKm ? parseFloat(distKm.toFixed(2)) : null,
            durata:   l.moving_time ? Math.round(l.moving_time) : null,
            passo:    l.moving_time && distKm && distKm > 0 ? Math.round(l.moving_time / distKm) : null,
            fc:       l.average_heartrate ? Math.round(l.average_heartrate) : null,
            fcMax:    l.max_heartrate ? Math.round(l.max_heartrate) : null,
            cadenza:  l.average_cadence ? Math.round(l.average_cadence * 2) : null,
            potenza:  l.average_watts ? Math.round(l.average_watts) : null
          };
        });
      }

      // Fallback: se c'è solo 1 lap (attività intera) o nessun passo, usa splits_metric
      const noUsefulLaps = splits.length === 0 ||
        (splits.length === 1 && !splits[0].passo) ||
        splits.every(function(s){ return !s.passo; });

      if (noUsefulLaps) {
        const actR = await fetch(
          'https://www.strava.com/api/v3/activities/' + actId,
          { headers: { Authorization: 'Bearer ' + tok.access_token } }
        );
        const act = await actR.json();
        if (act && Array.isArray(act.splits_metric) && act.splits_metric.length > 0) {
          splits = act.splits_metric.map(function(s, i) {
            const distKm = s.distance ? s.distance / 1000 : null;
            return {
              lap:      i + 1,
              distanza: distKm ? parseFloat(distKm.toFixed(2)) : null,
              durata:   s.moving_time ? Math.round(s.moving_time) : null,
              passo:    s.moving_time && distKm && distKm > 0 ? Math.round(s.moving_time / distKm) : null,
              fc:       s.average_heartrate ? Math.round(s.average_heartrate) : null,
              fcMax:    s.max_heartrate ? Math.round(s.max_heartrate) : null,
              cadenza:  s.average_cadence ? Math.round(s.average_cadence * 2) : null,
              potenza:  s.average_watts ? Math.round(s.average_watts) : null
            };
          });
        }
      }

      return res.status(200).json({ splits });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // DELETE /api/strava/disconnect
  if (url.startsWith('/api/strava/disconnect')) {
    delete T[uid];
    return res.status(200).json({ ok: true });
  }

  // POST /api/ai  →  proxy Anthropic
  if (url.startsWith('/api/ai')) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return res.status(500).json({ error: 'ANTHROPIC_API_KEY non configurata' });
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: body.model || 'claude-sonnet-4-20250514', max_tokens: 4000, system: body.system, messages: body.messages })
      });
      return res.status(200).json(await r.json());
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(404).json({ error: 'Route non trovata', url });
};
