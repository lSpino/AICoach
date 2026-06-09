const CLIENT_ID     = process.env.STRAVA_CLIENT_ID;
const CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;
const BASE_URL      = process.env.BASE_URL;

// ── Neon DB ───────────────────────────────────────────
const { Pool } = require('@neondatabase/serverless');
let _pool = null;
function getPool() {
  if (!_pool) _pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return _pool;
}

async function dbInit() {
  const db = getPool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      athlete_id    TEXT PRIMARY KEY,
      access_token  TEXT,
      refresh_token TEXT,
      expires_at    BIGINT,
      athlete_json  JSONB,
      settings      JSONB DEFAULT '{}',
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS user_data (
      athlete_id  TEXT PRIMARY KEY REFERENCES users(athlete_id) ON DELETE CASCADE,
      logs        JSONB DEFAULT '[]',
      goals       JSONB DEFAULT '[]',
      plan        JSONB,
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS user_settings (
      athlete_id     TEXT PRIMARY KEY REFERENCES users(athlete_id) ON DELETE CASCADE,
      profile        JSONB DEFAULT '{}',
      ai_provider    TEXT,
      ai_key         TEXT,
      ai_model       TEXT,
      custom_prompt  TEXT,
      updated_at     TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

// ── In-memory token cache (cold start fallback) ───────
const T = global.__tokens || (global.__tokens = {});

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function getToken(athleteId) {
  if (T[athleteId]) return T[athleteId];
  try {
    const db = getPool();
    const r = await db.query('SELECT access_token,refresh_token,expires_at FROM users WHERE athlete_id=$1', [athleteId]);
    if (r.rows.length) { T[athleteId] = r.rows[0]; return r.rows[0]; }
  } catch(e) {}
  return null;
}

async function saveToken(athleteId, tok, athleteJson) {
  T[athleteId] = tok;
  try {
    const db = getPool();
    await db.query(`
      INSERT INTO users (athlete_id,access_token,refresh_token,expires_at,athlete_json,updated_at)
      VALUES ($1,$2,$3,$4,$5,NOW())
      ON CONFLICT (athlete_id) DO UPDATE SET
        access_token=$2, refresh_token=$3, expires_at=$4,
        athlete_json=COALESCE($5, users.athlete_json), updated_at=NOW()
    `, [athleteId, tok.access_token, tok.refresh_token, tok.expires_at, athleteJson ? JSON.stringify(athleteJson) : null]);
    await db.query(`INSERT INTO user_data (athlete_id) VALUES ($1) ON CONFLICT DO NOTHING`, [athleteId]);
  } catch(e) { console.error('saveToken error:', e.message); }
}

async function refreshIfNeeded(athleteId) {
  const tok = await getToken(athleteId);
  if (!tok) return null;
  if (Date.now() / 1000 < tok.expires_at - 60) return tok;
  try {
    const r = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'refresh_token', refresh_token: tok.refresh_token })
    });
    const d = await r.json();
    const newTok = { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: d.expires_at };
    await saveToken(athleteId, newTok, null);
    return newTok;
  } catch(e) { return tok; }
}

function mapActivity(a) {
  return {
    stravaId: a.id, tipo: a.name||a.type||'Allenamento', titolo: a.name||'Allenamento',
    sport: a.type, data: (a.start_date_local||'').split('T')[0],
    distanza: a.distance ? (a.distance/1000).toFixed(1)+' km' : null,
    km: a.distance ? parseFloat((a.distance/1000).toFixed(1)) : null,
    durata: a.moving_time ? Math.round(a.moving_time/60)+' min' : null,
    fc: a.average_heartrate ? Math.round(a.average_heartrate) : null,
    fcMax: a.max_heartrate ? Math.round(a.max_heartrate) : null,
    cadenza: a.average_cadence ? Math.round(a.average_cadence) : null,
    tss: a.moving_time ? Math.round((a.moving_time/3600)*(a.average_heartrate||140)/1.5) : null,
    elevation: a.total_elevation_gain||null,
    note: a.description||('Da Strava · '+(a.type||'')),
    fonte: 'strava', source: 'strava'
  };
}

// ── Main handler ──────────────────────────────────────
module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const rawUrl = req.url || '';
  const qs = rawUrl.includes('?') ? rawUrl.split('?')[1] : '';
  const p = new URLSearchParams(qs);
  const pathParam = p.get('path') || '';
  let url;
  if (pathParam) {
    const prefix = rawUrl.startsWith('/auth/') ? '/auth/' : '/api/';
    url = prefix + pathParam.replace(/^\/(api|auth)\//, '').replace(/^\//, '');
  } else {
    url = rawUrl.split('?')[0];
  }
  // athleteId è l'identificatore primario; fallback a userId per retrocompatibilità
  const athleteId = p.get('athleteId') || p.get('userId') || 'default';

  try { await dbInit(); } catch(e) { console.error('dbInit error:', e.message); }

  // ── /auth/strava ──────────────────────────────────
  if (url.startsWith('/auth/strava') && !url.startsWith('/auth/strava/callback')) {
    if (!CLIENT_ID) return res.status(500).send('STRAVA_CLIENT_ID non configurato');
    const dest = 'https://www.strava.com/oauth/authorize?client_id='+CLIENT_ID+
      '&response_type=code&redirect_uri='+encodeURIComponent(BASE_URL+'/auth/strava/callback')+
      '&scope=read,activity:read_all&state=login';
    res.setHeader('Location', dest);
    return res.status(302).end();
  }

  // ── /auth/strava/callback ─────────────────────────
  if (url.startsWith('/auth/strava/callback')) {
    const code = p.get('code');
    if (!code) return res.status(400).send('Manca il codice OAuth');
    try {
      const r = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code, grant_type: 'authorization_code' })
      });
      const d = await r.json();
      if (d.errors) throw new Error(d.message || JSON.stringify(d.errors));
      const athlete = d.athlete;
      const aid = String(athlete.id);
      const tok = { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: d.expires_at };
      await saveToken(aid, tok, athlete);
      const nome = athlete.firstname;
      return res.status(200).send(`<!DOCTYPE html><html><head><title>Connesso</title></head>
<body style="font-family:system-ui;background:#050505;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:12px;margin:0">
  <div style="font-size:3rem">✓</div>
  <div style="font-size:1.1rem;font-weight:600">Ciao ${nome}, sei connesso!</div>
  <div style="font-size:.85rem;color:rgba(255,255,255,.4)">Chiudi questa finestra</div>
  <script>
    var aid='${aid}';
    localStorage.setItem('stravaConnected','true');
    localStorage.setItem('stravaAthleteName','${nome}');
    localStorage.setItem('athleteId', aid);
    localStorage.setItem('userId', aid);
    localStorage.setItem('stravaUserId', aid);
    localStorage.setItem('stravaAccessToken','${d.access_token}');
    if(window.opener) window.opener.postMessage({type:'strava_connected',name:'${nome}',athleteId:aid,accessToken:'${d.access_token}'},'*');
    setTimeout(function(){ window.close(); },2000);
  </script>
</body></html>`);
    } catch(e) { return res.status(500).send('Errore OAuth: '+e.message); }
  }

  // ── /api/strava/status ────────────────────────────
  if (url.startsWith('/api/strava/status')) {
    const tok = await getToken(athleteId);
    if (!tok) return res.status(200).json({ connected: false });
    try {
      const db = getPool();
      const r = await db.query('SELECT athlete_json FROM users WHERE athlete_id=$1', [athleteId]);
      const athlete = r.rows.length ? r.rows[0].athlete_json : null;
      return res.status(200).json({ connected: true, athlete });
    } catch(e) { return res.status(200).json({ connected: !!tok }); }
  }

  // ── /api/strava/activities ────────────────────────
  if (url.startsWith('/api/strava/activities')) {
    const perPage = parseInt(p.get('perPage')||'60', 10);
    const tok = await refreshIfNeeded(athleteId);
    if (!tok) return res.status(401).json({ error: 'Non autenticato — riconnetti Strava' });
    try {
      const r = await fetch('https://www.strava.com/api/v3/athlete/activities?per_page='+perPage, { headers: { Authorization: 'Bearer '+tok.access_token } });
      const acts = await r.json();
      if (!Array.isArray(acts)) return res.status(500).json({ error: 'Risposta Strava non valida', detail: acts });
      return res.status(200).json({ activities: acts.map(mapActivity) });
    } catch(e) { return res.status(500).json({ error: e.message }); }
  }

  // ── /api/strava/streams ───────────────────────────
  if (url.startsWith('/api/strava/streams')) {
    const actId = p.get('activityId');
    if (!actId) return res.status(400).json({ error: 'activityId mancante' });
    let tok = await refreshIfNeeded(athleteId);
    if (!tok && p.get('accessToken')) tok = { access_token: p.get('accessToken') };
    if (!tok) return res.status(401).json({ error: 'Non autenticato — riconnetti Strava' });
    try {
      const lapsR = await fetch('https://www.strava.com/api/v3/activities/'+actId+'/laps', { headers: { Authorization: 'Bearer '+tok.access_token } });
      const laps = await lapsR.json();
      let splits = [];
      if (Array.isArray(laps) && laps.length > 0) {
        splits = laps.map(function(l) {
          const distKm = l.distance ? l.distance/1000 : null;
          return { lap: l.lap_index||0, distanza: distKm?parseFloat(distKm.toFixed(2)):null,
            durata: l.moving_time?Math.round(l.moving_time):null,
            passo: l.moving_time&&distKm&&distKm>0?Math.round(l.moving_time/distKm):null,
            fc: l.average_heartrate?Math.round(l.average_heartrate):null,
            fcMax: l.max_heartrate?Math.round(l.max_heartrate):null,
            cadenza: l.average_cadence?Math.round(l.average_cadence*2):null,
            potenza: l.average_watts?Math.round(l.average_watts):null };
        });
      }
      const noUsefulLaps = splits.length===0||(splits.length===1&&!splits[0].passo)||splits.every(function(s){return !s.passo;});
      if (noUsefulLaps) {
        const actR = await fetch('https://www.strava.com/api/v3/activities/'+actId, { headers: { Authorization: 'Bearer '+tok.access_token } });
        const act = await actR.json();
        if (act && Array.isArray(act.splits_metric) && act.splits_metric.length > 0) {
          splits = act.splits_metric.map(function(s,i) {
            const distKm = s.distance?s.distance/1000:null;
            return { lap: i+1, distanza: distKm?parseFloat(distKm.toFixed(2)):null,
              durata: s.moving_time?Math.round(s.moving_time):null,
              passo: s.moving_time&&distKm&&distKm>0?Math.round(s.moving_time/distKm):null,
              fc: s.average_heartrate?Math.round(s.average_heartrate):null,
              fcMax: s.max_heartrate?Math.round(s.max_heartrate):null,
              cadenza: s.average_cadence?Math.round(s.average_cadence*2):null,
              potenza: s.average_watts?Math.round(s.average_watts):null };
          });
        }
      }
      return res.status(200).json({ splits });
    } catch(e) { return res.status(500).json({ error: e.message }); }
  }

  // ── /api/strava/disconnect ────────────────────────
  if (url.startsWith('/api/strava/disconnect')) {
    delete T[athleteId];
    return res.status(200).json({ ok: true });
  }

  // ── /api/user/save — salva logs/goals/plan sul DB ─
  if (url.startsWith('/api/user/save') && req.method === 'POST') {
    try {
      const body = typeof req.body==='string'?JSON.parse(req.body):(req.body||{});
      const aid = body.athleteId || athleteId;
      if (!aid || aid==='default') return res.status(400).json({ error: 'athleteId mancante' });
      const db = getPool();
      await db.query(`
        INSERT INTO user_data (athlete_id, logs, goals, plan, updated_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (athlete_id) DO UPDATE SET
          logs=COALESCE($2, user_data.logs),
          goals=COALESCE($3, user_data.goals),
          plan=COALESCE($4, user_data.plan),
          updated_at=NOW()
      `, [aid,
        body.logs ? JSON.stringify(body.logs) : null,
        body.goals ? JSON.stringify(body.goals) : null,
        body.plan !== undefined ? JSON.stringify(body.plan) : null
      ]);
      return res.status(200).json({ ok: true });
    } catch(e) { return res.status(500).json({ error: e.message }); }
  }

  // ── /api/user/load — carica dati utente dal DB ────
  if (url.startsWith('/api/user/load')) {
    try {
      const aid = athleteId;
      if (!aid || aid==='default') return res.status(400).json({ error: 'athleteId mancante' });
      const db = getPool();
      const r = await db.query('SELECT logs,goals,plan FROM user_data WHERE athlete_id=$1', [aid]);
      if (!r.rows.length) return res.status(200).json({ logs:[], goals:[], plan:null });
      return res.status(200).json({ logs: r.rows[0].logs||[], goals: r.rows[0].goals||[], plan: r.rows[0].plan||null });
    } catch(e) { return res.status(500).json({ error: e.message }); }
  }

  // ── /api/ai ───────────────────────────────────────
  if (url.startsWith('/api/ai')) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return res.status(500).json({ error: 'ANTHROPIC_API_KEY non configurata' });
    try {
      const body = typeof req.body==='string'?JSON.parse(req.body):(req.body||{});
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: body.model||'claude-sonnet-4-20250514', max_tokens: 4000, system: body.system, messages: body.messages })
      });
      return res.status(200).json(await r.json());
    } catch(e) { return res.status(500).json({ error: e.message }); }
  }

  return res.status(404).json({ error: 'Route non trovata', url });
};
