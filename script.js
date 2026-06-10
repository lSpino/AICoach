(function(){
'use strict';

var $ = function(id){ return document.getElementById(id); };
function toast(m){ var t=$('toast'); t.textContent=m; t.classList.add('show'); setTimeout(function(){ t.classList.remove('show'); },2400); }
function getLogs(){ try{ return JSON.parse(localStorage.getItem('logs')||'[]'); }catch(e){ return []; } }
function getGoals(){ try{ return JSON.parse(localStorage.getItem('goals')||'[]'); }catch(e){ return []; } }
function getProfile(){ try{ return JSON.parse(localStorage.getItem('athlete')||'{}'); }catch(e){ return {}; } }
function saveLogs(l){
  l.sort(function(a,b){return new Date(b.data)-new Date(a.data);});
  localStorage.setItem('logs',JSON.stringify(l));
  dbSave({logs:l});
}
function saveGoals(g){ localStorage.setItem('goals',JSON.stringify(g)); dbSave({goals:g}); }
// ── Onboarding ────────────────────────────────────────
function checkOnboarding(){
  var aid=getAthleteId();
  if(aid) return; // già loggato
  // Crea popup se non esiste
  if(document.getElementById('strava-login-popup')) return;
  var popup=document.createElement('div');
  popup.id='strava-login-popup';
  popup.style.cssText='position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.75);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:20px';
  popup.innerHTML='<div style="background:var(--s1,#111);border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:28px 24px;max-width:340px;width:100%;text-align:center">'
    +'<div style="font-size:2rem;margin-bottom:10px">🏃</div>'
    +'<div style="font-size:1rem;font-weight:700;margin-bottom:8px">Connetti Strava per iniziare</div>'
    +'<div style="font-size:.78rem;color:rgba(255,255,255,.5);margin-bottom:24px;line-height:1.5">Per salvare i tuoi allenamenti, accedere da qualsiasi device e usare il coach AI devi prima connettere il tuo account Strava.</div>'
    +'<button onclick="connectStravaFromOnboarding()" style="width:100%;background:#FC4C02;border:none;color:#fff;font-size:.85rem;font-weight:700;padding:13px 20px;border-radius:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px">'
    +'<svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169"/></svg>'
    +'Connetti Strava</button>'
    +'<div style="font-size:.65rem;color:rgba(255,255,255,.25);margin-top:12px">Gratuito · Dati protetti</div>'
    +'</div>';
  document.body.appendChild(popup);
}

function connectStravaFromOnboarding(){
  var serverUrl=getServerUrl();
  if(!serverUrl){ alert('Server URL non configurato'); return; }
  var uid=localStorage.getItem('userId')||('user_'+Math.random().toString(36).slice(2));
  localStorage.setItem('userId',uid);
  window.open(serverUrl+'/auth/strava?userId='+uid,'_blank','width=500,height=700');
}
window.connectStravaFromOnboarding=connectStravaFromOnboarding;
window.checkOnboarding=checkOnboarding;
window.checkOnboarding=checkOnboarding;

function getServerUrl(){ var saved=localStorage.getItem('serverUrl'); return saved||'https://ai-coach-brown.vercel.app'; }
function getAthleteId(){
  // Restituisce solo ID Strava reali (numerici), non ID temporanei user_xxx
  var aid=localStorage.getItem('athleteId')||localStorage.getItem('stravaUserId')||'';
  if(aid && /^\d+$/.test(aid)) return aid;  // ID Strava è sempre numerico
  return null;
}
function getUserId(){ return getAthleteId()||'default'; }

// ── DB sync ───────────────────────────────────────────
var _dbSaveTimer=null;
function dbSave(data){
  var aid=getAthleteId(); if(!aid) return;
  var serverUrl=getServerUrl(); if(!serverUrl) return;
  clearTimeout(_dbSaveTimer);
  _dbSaveTimer=setTimeout(function(){
    fetch(serverUrl+'/api/user/save',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify(Object.assign({athleteId:aid},data))
    }).catch(function(){});
  },1500);
}

var _dbSettingsTimer=null;
function dbSaveSettings(data){
  var aid=getAthleteId();
  var serverUrl=getServerUrl();
  console.log('[dbSaveSettings] aid='+aid+' url='+serverUrl, data);
  if(!aid){ console.warn('[dbSaveSettings] no athleteId'); return; }
  if(!serverUrl){ console.warn('[dbSaveSettings] no serverUrl'); return; }
  clearTimeout(_dbSettingsTimer);
  _dbSettingsTimer=setTimeout(function(){
    fetch(serverUrl+'/api/user/settings/save',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify(Object.assign({athleteId:aid},data))
    })
    .then(function(r){return r.json();})
    .then(function(d){ console.log('[dbSaveSettings] response:',d); if(d.ok) toast('✓ Salvato nel cloud'); else toast('Errore salvataggio: '+(d.error||'?')); })
    .catch(function(e){ console.error('[dbSaveSettings] error:',e); });
  },1500);
}

function dbLoadSettings(){
  var aid=getAthleteId(); if(!aid) return;
  var serverUrl=getServerUrl(); if(!serverUrl) return;
  fetch(serverUrl+'/api/user/settings/load?athleteId='+aid)
    .then(function(r){return r.json();})
    .then(function(d){
      if(d.error) return;
      if(d.profile&&Object.keys(d.profile).length){
        localStorage.setItem('athlete',JSON.stringify(d.profile));
        loadProfile();
      }
      if(d.aiProvider){ localStorage.setItem('aiProvider',d.aiProvider); var el=$('ai-provider'); if(el) el.value=d.aiProvider; }
      if(d.aiKey){ localStorage.setItem('aiKey',d.aiKey); var el=$('apikey'); if(el) el.value=d.aiKey; }
      if(d.aiModel){ localStorage.setItem('aiModel',d.aiModel); var el=$('ai-model'); if(el) el.value=d.aiModel; }
      if(d.customPrompt){ localStorage.setItem('customPlanPrompt',d.customPrompt); var el=$('custom-plan-prompt'); if(el) el.value=d.customPrompt; }
    }).catch(function(){});
}

function dbLoad(){
  var aid=getAthleteId(); if(!aid) return;
  var serverUrl=getServerUrl(); if(!serverUrl) return;
  fetch(serverUrl+'/api/user/load?athleteId='+aid)
    .then(function(r){return r.json();})
    .then(function(d){
      if(d.error) return;
      var merged=false;
      // Merge logs: server wins per stravaId, locale vince per log manuali recenti
      if(d.logs&&d.logs.length){
        var local=getLogs();
        var serverIds=d.logs.map(function(l){return String(l.stravaId||l.id);});
        var onlyLocal=local.filter(function(l){return !serverIds.includes(String(l.stravaId||l.id));});
        var merged_logs=d.logs.concat(onlyLocal);
        merged_logs.sort(function(a,b){return new Date(b.data)-new Date(a.data);});
        localStorage.setItem('logs',JSON.stringify(merged_logs));
        merged=true;
      }
      if(d.goals&&d.goals.length){ localStorage.setItem('goals',JSON.stringify(d.goals)); merged=true; }
      if(d.plan){ localStorage.setItem('currentPlan',JSON.stringify(d.plan)); merged=true; }
      if(merged){ renderHome(); drawCharts();
setTimeout(checkOnboarding, 100);
// Carica dati dal server se utente già autenticato
if(getAthleteId()){ dbLoad(); dbLoadSettings(); } }
    }).catch(function(){});
}

var SPORTS=['Corsa','Bici / Ciclismo','Nuoto','Triathlon','Palestra / Forza','Trail Running','MTB','Sci di fondo','Altro'];
var DAYS7=['Lun','Mar','Mer','Gio','Ven','Sab','Dom'];
var disciplines=[], chatHist=[], extractedData={}, planBusy=false, coachOpen=false;

$('dateLabel').textContent=new Date().toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long',year:'numeric'});

// ── Tabs ─────────────────────────────────────
var TABS=['home','log','goals','plan','calc'];
var TAB_TITLES={home:'Dashboard',log:'Allenamenti',goals:'Obiettivi',plan:'Piano',calc:'Calcolatore'};
function showTab(id){
  TABS.forEach(function(t){ var tab=$('tab-'+t); if(tab) tab.classList.toggle('active',t===id); var nav=$('nav-'+t); if(nav) nav.classList.toggle('active',t===id); });
  var tb=$('topbar-title'); if(tb) tb.textContent=TAB_TITLES[id]||'';
  if(id==='home'){ renderHome(); drawCharts(); }
}
$('nav-home').onclick=function(){ showTab('home'); };
$('nav-log').onclick=function(){ showTab('log'); };
$('nav-goals').onclick=function(){ showTab('goals'); };
$('nav-plan').onclick=function(){ showTab('plan'); };
$('nav-calc').onclick=function(){ showTab('calc'); };
$('btn-goto-plan').onclick=function(){ showTab('plan'); };
$('btn-goto-goals').onclick=function(){ showTab('goals'); };
$('btn-goto-log').onclick=function(){ showTab('log'); };

// ── Modals ────────────────────────────────────
function openModal(id){ $(id).classList.add('open'); }
function closeModal(id){ $(id).classList.remove('open'); }
$('open-profilo').onclick=function(){ openModal('profilo-modal'); };
$('open-settings').onclick=function(){
  openModal('settings-modal');
  // Server URL
  var su=getServerUrl(); if(su&&$('server-url')) $('server-url').value=su;
  // AI settings
  var _prov=localStorage.getItem('aiProvider')||'anthropic';
  var _key=localStorage.getItem('aiKey')||'';
  var _mod=localStorage.getItem('aiModel')||'';
  if($('ai-provider')) $('ai-provider').value=_prov;
  if($('apikey')) $('apikey').value=_key;
  if($('ai-model')) $('ai-model').value=_mod;
  // Prompt
  var _sp=localStorage.getItem('customPlanPrompt');
  if($('custom-plan-prompt')) $('custom-plan-prompt').value=_sp!==null?_sp:getDefaultPrompt();
};
$('close-profilo').onclick=function(){ closeModal('profilo-modal'); };
$('btn-close-profilo').onclick=function(){ closeModal('profilo-modal'); };
$('close-settings').onclick=function(){ closeModal('settings-modal'); };
$('btn-close-settings').onclick=function(){
  // Auto-save AI settings on close
  if($('ai-provider')) localStorage.setItem('aiProvider',$('ai-provider').value);
  if($('apikey')&&$('apikey').value.trim()) localStorage.setItem('aiKey',$('apikey').value.trim());
  if($('ai-model')&&$('ai-model').value.trim()) localStorage.setItem('aiModel',$('ai-model').value.trim());
  closeModal('settings-modal');
};
if($('btn-save-prompt')) $('btn-save-prompt').onclick=function(){ var v=$('custom-plan-prompt').value.trim(); if(v) localStorage.setItem('customPlanPrompt',v); else localStorage.removeItem('customPlanPrompt'); dbSaveSettings({customPrompt:v||''}); toast('Prompt salvato'); };
if($('btn-reset-prompt')) $('btn-reset-prompt').onclick=function(){ localStorage.removeItem('customPlanPrompt'); if($('custom-plan-prompt')) $('custom-plan-prompt').value=getDefaultPrompt(); toast('Prompt ripristinato'); };
document.querySelectorAll('.modal-ov').forEach(function(m){ m.onclick=function(e){ if(e.target===m) m.classList.remove('open'); }; });

$('btn-save-server').onclick=function(){
  var url=$('server-url').value.trim().replace(/\/$/,'');
  if(url){ localStorage.setItem('serverUrl',url); toast('Server salvato'); checkStravaStatus(); }
};
if($('ai-provider')) $('ai-provider').onchange=function(){ localStorage.setItem('aiProvider',this.value); dbSaveSettings({aiProvider:this.value}); };
if($('apikey')) $('apikey').oninput=function(){ localStorage.setItem('aiKey',this.value); dbSaveSettings({aiKey:this.value}); };
if($('ai-model')) $('ai-model').oninput=function(){ localStorage.setItem('aiModel',this.value); dbSaveSettings({aiModel:this.value}); };
// Load saved values into settings
var _savedProvider=localStorage.getItem('aiProvider');
var _savedKey=localStorage.getItem('aiKey');
var _savedModel=localStorage.getItem('aiModel');
if($('ai-provider')&&_savedProvider) $('ai-provider').value=_savedProvider;
if($('apikey')&&_savedKey) $('apikey').value=_savedKey;
if($('ai-model')&&_savedModel) $('ai-model').value=_savedModel;

// ── Strava ────────────────────────────────────
function checkStravaStatus(){
  var serverUrl=getServerUrl();
  var localStatus=localStorage.getItem('stravaConnected');
  if(!serverUrl){
    // Anche senza server mostra UI corretta e wira il bottone
    if(localStatus==='true'){
      updateStravaUI(true, localStorage.getItem('stravaAthleteName')||'Strava');
    } else {
      updateStravaUI(false,'');
    }
    return;
  }
  var userId=getUserId();
  fetch(serverUrl+'/api/strava/status?athleteId='+userId)
    .then(function(r){ return r.json(); })
    .then(function(d){
      if(d.connected){
        var name=(d.athlete&&d.athlete.firstname)?d.athlete.firstname+' '+d.athlete.lastname:'Strava';
        localStorage.setItem('stravaConnected','true');
        localStorage.setItem('stravaAthleteName',name);
        updateStravaUI(true, name);
      } else {
        localStorage.setItem('stravaConnected','false');
        updateStravaUI(false,'');
      }
    }).catch(function(){ if(localStatus==='true') updateStravaUI(true, localStorage.getItem('stravaAthleteName')||'Strava'); });
}

function toggleStravaDropdown(e){
  e.stopPropagation();
  var dd=$('strava-dropdown');
  if(!dd) return;
  var open=dd.style.display==='block';
  dd.style.display=open?'none':'block';
  if(!open){ setTimeout(function(){ document.addEventListener('click',function h(){ dd.style.display='none'; document.removeEventListener('click',h); }); },10); }
}
window.toggleStravaDropdown=toggleStravaDropdown;
function updateStravaUI(connected, athleteName){
  var btnConn=$('btn-connect-strava');
  var chip=$('strava-chip-home');
  if(btnConn) btnConn.style.display=connected?'none':'flex';
  if(chip) chip.style.display=connected?'flex':'none';
  var cs=$('strava-chip-status'); if(cs&&connected) cs.textContent=athleteName||'connesso';
  var syncBtn=$('btn-sync-strava'), syncStatus=$('strava-sync-status');
  if(syncBtn) syncBtn.style.display=connected?'block':'none';
  if(syncStatus) syncStatus.textContent=connected?'Strava connesso. Clicca per sincronizzare gli ultimi allenamenti.':'Connetti Strava per importare automaticamente i tuoi allenamenti.';
}

function connectStrava(){
  var serverUrl=getServerUrl();
  if(!serverUrl){ toast('Imposta prima il Server URL nelle Impostazioni'); openModal('settings-modal'); return; }
  var url=serverUrl+'/auth/strava?userId='+getUserId();
  var popup=window.open(url,'strava-auth','width=600,height=700,left=200,top=100');
  if(!popup){ window.location.href=url; }
}
function disconnectStrava(){
  var serverUrl=getServerUrl();
  localStorage.setItem('stravaConnected','false');
  localStorage.removeItem('stravaAthleteName');
  var dd=$('strava-dropdown'); if(dd) dd.style.display='none';
  updateStravaUI(false,'');
  if(!serverUrl) return;
  fetch(serverUrl+'/api/strava/disconnect?userId='+getUserId(),{method:'DELETE'}).catch(function(){});
}
window.disconnectStrava=disconnectStrava;
window.connectStrava=connectStrava;

$('btn-sync-strava') && ($('btn-sync-strava').onclick=function(){
  var serverUrl=getServerUrl(); if(!serverUrl) return;
  var userId=getUserId();
  $('strava-sync-status').textContent='Sincronizzazione in corso...';
  fetch(serverUrl+'/api/strava/activities?athleteId='+userId+'&perPage=60')
    .then(function(r){ return r.json(); })
    .then(function(d){
      if(!d.activities) throw new Error('Nessuna attività');
      var existing=getLogs(); var existingIds=existing.map(function(l){ return l.stravaId; });
      var newActs=d.activities.filter(function(a){ return !existingIds.includes(a.stravaId); });
      newActs.forEach(function(a){
        // Preserva stravaId PRIMA di assegnare il nuovo id locale
        var sid = a.stravaId;
        a.id     = Date.now() + Math.random();
        a.stravaId = sid; // ripristina dopo sovrascrittura id
        a.tipo   = a.titolo || a.sport || 'Allenamento';
        // km già numerico dal server; distanza è stringa "12.3 km" — normalizza
        if(!a.km && a.distanza) a.km = parseFloat(a.distanza);
        a.fonte  = 'strava';
        a.source = 'strava';
        existing.unshift(a);
      });
      saveLogs(existing); renderLogs(); renderHome(); drawCharts();
      // Auto-analyze newest activity
      if(newActs.length>0){
        var newest=newActs[0];
        setTimeout(function(){
          showCoachReport(newest);
          toast('Coach sta analizzando: '+newest.tipo);
        },1500);
      }
      $('strava-sync-status').textContent='Sincronizzati '+newActs.length+' nuovi allenamenti.';
      toast('Sincronizzati '+newActs.length+' allenamenti da Strava');
    }).catch(function(e){ $('strava-sync-status').textContent='Errore sincronizzazione.'; console.error(e); });
});

// Ascolta messaggio dal popup Strava
window.addEventListener('message', function(e){
  if(e.data && e.data.type==='strava_connected'){
    localStorage.setItem('stravaConnected','true');
    if(e.data.name) localStorage.setItem('stravaAthleteName', e.data.name);
    if(e.data.athleteId||e.data.userId){
      var aid=e.data.athleteId||e.data.userId;
      localStorage.setItem('athleteId',aid);
      localStorage.setItem('stravaUserId',aid);
      localStorage.setItem('userId',aid);
    }
    if(e.data.accessToken) localStorage.setItem('stravaAccessToken',e.data.accessToken);
    toast('Strava connesso! Benvenuto '+e.data.name);
    var pp=document.getElementById('strava-login-popup'); if(pp) pp.remove();
    checkStravaStatus();
    dbLoad();
    dbLoadSettings();
    renderHome();
  }
});

// Controlla se arriviamo da redirect Strava
(function(){
  var params=new URLSearchParams(window.location.search);
  if(params.get('strava')==='connected'){
    localStorage.setItem('stravaConnected','true');
    toast('Strava connesso con successo!');
    window.history.replaceState({},'','/');
  }
  checkStravaStatus();
// Wire connect button
(function(){
  var b = document.getElementById('btn-connect-strava');
  if(b) b.onclick = connectStrava;
})();
})();

// ── Push notifications ───────────────────────
function initPush(){
  if(!('Notification' in window)||!('serviceWorker' in navigator)) return;
  if(Notification.permission==='default') if($('push-banner')) $('push-banner').style.display='flex';
  if($('btn-enable-push')) $('btn-enable-push').onclick=function(){
    Notification.requestPermission().then(function(perm){
      if(perm==='granted') subscribePush();
      $('push-banner').style.display='none';
    });
  };
  if(Notification.permission==='granted') subscribePush();
}

function subscribePush(){
  var serverUrl=getServerUrl(); if(!serverUrl) return;
  // Prendi la VAPID public key dal server
  fetch(serverUrl+'/api/push/vapid-key')
    .then(function(r){ return r.json(); })
    .then(function(d){
      return navigator.serviceWorker.ready.then(function(reg){
        return reg.pushManager.subscribe({
          userVisibleOnly:true,
          applicationServerKey:urlBase64ToUint8Array(d.publicKey)
        });
      });
    })
    .then(function(sub){
      return fetch(serverUrl+'/api/push/subscribe',{
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({userId:getUserId(), subscription:sub})
      });
    })
    .then(function(){ toast('Notifiche push abilitate'); })
    .catch(function(e){ console.error('Push subscribe error:',e); });
}

function urlBase64ToUint8Array(base64String){
  var padding='='.repeat((4-base64String.length%4)%4);
  var base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/');
  var rawData=window.atob(base64);
  var outputArray=new Uint8Array(rawData.length);
  for(var i=0;i<rawData.length;i++) outputArray[i]=rawData.charCodeAt(i);
  return outputArray;
}
initPush();

// ── AI call (via server proxy oppure diretto) ─
function callAI(messages,system,maxTok){
  maxTok=maxTok||600;
  var serverUrl=getServerUrl();
  var provider=localStorage.getItem('aiProvider')||'anthropic';
  var apiKey=localStorage.getItem('aiKey')||'';
  var model=localStorage.getItem('aiModel')||'';

  // Anthropic — usa proxy server se disponibile, altrimenti diretto
  if(provider==='anthropic'){
    if(serverUrl){
      return fetch(serverUrl+'/api/ai',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({model:model||'claude-sonnet-4-20250514',max_tokens:maxTok,system:system,messages:messages})
      })
      .then(function(r){
        if(!r.ok) throw new Error('Errore server '+r.status+'. Verifica ANTHROPIC_API_KEY nelle env Vercel.');
        return r.json();
      })
      .then(function(d){
        if(d.error) throw new Error(typeof d.error==='object'?d.error.message:d.error);
        return (d.content||[]).map(function(b){return b.text||'';}).join('')||'';
      });
    }
    if(!apiKey) return Promise.reject(new Error('Nessun server configurato e nessuna API key. Vai su Impostazioni → Server URL oppure inserisci la tua Anthropic API key.'));
    return fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01'},
      body:JSON.stringify({model:model||'claude-sonnet-4-20250514',max_tokens:maxTok,system:system,messages:messages})
    }).then(function(r){return r.json();})
      .then(function(d){if(d.error) throw new Error('Gemini: '+(d.error.message||d.error.status||JSON.stringify(d.error))); return (d.content||[]).map(function(b){return b.text||'';}).join('');});
  }

  // OpenAI
  if(provider==='openai'){
    if(!apiKey) return Promise.reject(new Error('Inserisci la OpenAI API key nelle Impostazioni'));
    return fetch('https://api.openai.com/v1/chat/completions',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+apiKey},
      body:JSON.stringify({model:model||'gpt-4o',max_tokens:maxTok,messages:[{role:'system',content:system||''}].concat(messages)})
    }).then(function(r){return r.json();})
      .then(function(d){if(d.error) throw new Error(d.error.message); return (d.choices&&d.choices[0]&&d.choices[0].message&&d.choices[0].message.content)||'';});
  }

  // Gemini
  if(provider==='gemini'){
    if(!apiKey) return Promise.reject(new Error('Inserisci la Google API key nelle Impostazioni'));
    var gm=model||'gemini-2.0-flash';
    var parts=[];
    if(system) parts.push({role:'user',parts:[{text:'SYSTEM: '+system}]},{role:'model',parts:[{text:'OK, capito.'}]});
    messages.forEach(function(m){parts.push({role:m.role==='assistant'?'model':'user',parts:[{text:m.content}]});});
    return fetch('https://generativelanguage.googleapis.com/v1beta/models/'+gm+':generateContent?key='+apiKey,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({contents:parts,generationConfig:{maxOutputTokens:maxTok}})
    }).then(function(r){return r.json();})
      .then(function(d){
        if(d.error) throw new Error('Gemini: '+(d.error.message||d.error.status||JSON.stringify(d.error)));
        try{ return d.candidates[0].content.parts[0].text||''; }catch(e){ return ''; }
      });
  }

  // Groq — gratis su console.groq.com
  if(provider==='groq'){
    if(!apiKey) return Promise.reject(new Error('Inserisci la Groq API key — gratis su console.groq.com'));
    return fetch('https://api.groq.com/openai/v1/chat/completions',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+apiKey},
      body:JSON.stringify({
        model:model||'llama-3.3-70b-versatile',
        max_tokens:maxTok,
        messages:[{role:'system',content:system||''}].concat(messages)
      })
    }).then(function(r){return r.json();})
      .then(function(d){
        if(d.error) throw new Error('Groq: '+(d.error.message||JSON.stringify(d.error)));
        return (d.choices&&d.choices[0]&&d.choices[0].message&&d.choices[0].message.content)||'';
      });
  }

  return Promise.reject(new Error('Provider non riconosciuto: '+provider));
}

// ── System prompt ─────────────────────────────
function buildSys(){
  var p=getProfile(),goals=getGoals(),logs=getLogs().slice(0,6);
  var ds=(p.disciplines&&p.disciplines.length)?p.disciplines.map(function(d){ return (d.inc===false?'[NO] ':'[SI] ')+d.sport+' '+(d.ore||'?')+'h giorni:'+((d.giorni&&d.giorni.join('/'))||'flex'); }).join(' | '):'?';
  var gs=goals.length?goals.map(function(g){ return g.prio.charAt(0)+':'+g.nome+' '+g.data+(g.target?' '+g.target:''); }).join(' | '):'Nessuno';
  var ls=logs.length?logs.map(function(l){
    var s=l.data+' '+l.tipo+(l.km?' '+l.km+'km':'')+(l.tss?' TSS'+l.tss:'')+(l.fc?' FC'+l.fc:'')+(l.note?' note:"'+l.note+'"':'');
    if(l.splits&&l.splits.length){
      function fp(sec){return sec?Math.floor(sec/60)+':'+(sec%60<10?'0':'')+sec%60:'?';}
      s+=' splits:['+l.splits.map(function(sp,i){return 'km'+(i+1)+':'+fp(sp.passo)+(sp.fc?'/'+sp.fc+'bpm':'');}).join(',')+']';
    }
    return s;
  }).join(' | '):'Nessuno';
  return 'Coach endurance AI. Italiano, tecnico, conciso, no emoji.\nAtleta: '+(p.nome||'?')+' '+(p.eta||'?')+'anni '+(p.peso||'?')+'kg '+(p.livello||'?')+'\nFisio: FCmax='+(p.fcmax||'?')+' FCSoglia='+(p.fcsoglia||'?')+' FTP='+(p.ftp||'?')+'W Ritmo='+(p.ritmo||'?')+'/km\nDiscipline: '+ds+'\nObiettivi: '+gs+'\nUltimi all.: '+ls;
}

// ── Disciplines ───────────────────────────────
function renderDiscs(){
  var el=$('disc-list');
  if(!el) return;
  if(!disciplines.length){ el.innerHTML='<p style="font-size:.73rem;color:var(--t2);margin-bottom:.4rem">Nessuna disciplina.</p>'; return; }
  var html='';
  disciplines.forEach(function(d,i){
    var inc=d.inc!==false;
    var opts=SPORTS.map(function(s){ return '<option'+(d.sport===s?' selected':'')+'>'+s+'</option>'; }).join('');
    var chks=DAYS7.map(function(day){ var on=(d.giorni||[]).indexOf(day)>=0; return '<button type="button" class="day-tog" data-i="'+i+'" data-day="'+day+'" style="padding:3px 9px;font-size:.66rem;border-radius:5px;font-family:var(--f);cursor:pointer;border:1px solid '+(on?'var(--acc-l)':'var(--line2)')+';background:'+(on?'var(--acc2)':'transparent')+';color:'+(on?'var(--acc-l)':'var(--t2)')+'">'+day+'</button>'; }).join('');
    html+='<div class="disc-card"><button class="btn-del drm" data-i="'+i+'" style="position:absolute;top:9px;right:10px">×</button>'
      +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.625rem"><div style="font-size:.65rem;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:.6px">Disciplina '+(i+1)+'</div>'
      +'<label style="display:flex;align-items:center;gap:7px;cursor:pointer;user-select:none"><span style="font-size:.65rem;color:'+(inc?'#00d68f':'rgba(255,255,255,.14)')+';font-weight:500">'+(inc?'Inclusa nel piano':'Esclusa')+'</span>'
      +'<div class="dinc-sw" data-i="'+i+'" style="width:32px;height:18px;border-radius:9px;background:'+(inc?'#00d68f':'var(--s4)')+';border:1px solid '+(inc?'#00d68f':'var(--line2)')+';position:relative;cursor:pointer;flex-shrink:0">'
      +'<div style="position:absolute;top:2px;left:'+(inc?'13':'2')+'px;width:12px;height:12px;border-radius:50%;background:#fff;transition:left .15s;box-shadow:0 1px 3px rgba(0,0,0,.3)"></div></div></label></div>'
      +'<div class="g3" style="margin-bottom:7px"><div class="field"><label>Sport</label><select class="dsp" data-i="'+i+'">'+opts+'</select></div>'
      +'<div class="field"><label>Ore/sett.</label><input type="number" class="dore" data-i="'+i+'" placeholder="6" value="'+(d.ore||'')+'"></div>'
      +'<div class="field"><label>Sessioni/sett.</label><input type="number" class="dsess" data-i="'+i+'" placeholder="3" value="'+(d.sessioni||'')+'"></div></div>'
      +'<div class="field" style="margin-bottom:7px"><label>Giorni preferiti</label><div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:4px">'+chks+'</div></div>'
      +'<div class="field"><label>Storico infortuni</label><textarea class="dinj" data-i="'+i+'" placeholder="Es. Tendinite achillea (2023, risolta)">'+(d.infortuni||'')+'</textarea></div></div>';
  });
  el.innerHTML=html;
  el.querySelectorAll('.drm').forEach(function(b){ b.onclick=function(){ disciplines.splice(+this.dataset.i,1); renderDiscs(); }; });
  el.querySelectorAll('.dinc-sw').forEach(function(sw){ sw.onclick=function(){ var i=+this.dataset.i; disciplines[i].inc=disciplines[i].inc===false; renderDiscs(); }; });
  el.querySelectorAll('.dsp').forEach(function(s){ s.onchange=function(){ disciplines[+this.dataset.i].sport=this.value; }; });
  el.querySelectorAll('.dore').forEach(function(s){ s.oninput=function(){ disciplines[+this.dataset.i].ore=this.value; }; });
  el.querySelectorAll('.dsess').forEach(function(s){ s.oninput=function(){ disciplines[+this.dataset.i].sessioni=this.value; }; });
  el.querySelectorAll('.dinj').forEach(function(s){ s.oninput=function(){ disciplines[+this.dataset.i].infortuni=this.value; }; });
  el.querySelectorAll('.day-tog').forEach(function(b){ b.onclick=function(e){ e.preventDefault(); var i=+this.dataset.i,day=this.dataset.day; if(!disciplines[i].giorni) disciplines[i].giorni=[]; var idx=disciplines[i].giorni.indexOf(day); if(idx<0) disciplines[i].giorni.push(day); else disciplines[i].giorni.splice(idx,1); renderDiscs(); }; });
}
$('btn-add-disc').onclick=function(){ disciplines.push({sport:SPORTS[0],ore:'',sessioni:'',giorni:[],infortuni:'',inc:true}); renderDiscs(); };

// ── Profile ───────────────────────────────────
var PF=['nome','eta','sesso','peso','altezza','livello','fcmax','fcsoglia','fcriposo','ftp','ritmo','vo2'];
$('btn-save-profile').onclick=function(){
  var p={}; PF.forEach(function(f){ var e=$('p-'+f); p[f]=e?e.value:''; });
  p.disciplines=disciplines.map(function(d){ return Object.assign({},d); });
  localStorage.setItem('athlete',JSON.stringify(p));
  updateSb(); toast('Profilo salvato'); closeModal('profilo-modal');
  dbSaveSettings({profile:p});
};
function loadProfile(){ var p=getProfile(); PF.forEach(function(f){ var e=$('p-'+f); if(e&&p[f]) e.value=p[f]; }); disciplines=(p.disciplines||[]).map(function(d){ return Object.assign({},d); }); renderDiscs(); updateSb(); }
function updateSb(){ var p=getProfile(); if($('sb-name')) $('sb-name').textContent=p.nome||'Profilo'; $('sb-sport').textContent=(p.disciplines&&p.disciplines.length)?p.disciplines.map(function(d){ return d.sport; }).join(' · '):(p.livello||'Configura'); }
loadProfile();

// ── AI Indicators ─────────────────────────────
function computeIndicators(){
  var logs=getLogs(),p=getProfile();
  var now=new Date(),mon=new Date(now); mon.setDate(now.getDate()-((now.getDay()+6)%7)); mon.setHours(0,0,0,0);
  var prev=new Date(mon); prev.setDate(mon.getDate()-7);
  var wl=logs.filter(function(l){ return new Date(l.data)>=mon; });
  var pw=logs.filter(function(l){ var d=new Date(l.data); return d>=prev&&d<mon; });
  var tss=wl.reduce(function(a,l){ return a+(parseInt(l.tss)||0); },0);
  var ptss=pw.reduce(function(a,l){ return a+(parseInt(l.tss)||0); },0);
  var ratio=ptss>0?tss/ptss:1;
  function setI(pre,score,color,label,text,bc){ $(pre+'-score').textContent=score+'%'; $(pre+'-score').style.color=color; $(pre+'-label').textContent=label; $(pre+'-text').textContent=text; $(pre+'-badge').textContent=label; $(pre+'-badge').className='badge '+bc; $(pre+'-bar').style.width=score+'%'; $(pre+'-bar').style.background=color; }
  var inj=Math.min(100,Math.round(ratio*35+(wl.length>5?20:0)+(tss>350?25:tss>250?12:0)));
  setI('inj',inj,inj<30?'#00d68f':inj<60?'#f59e0b':'#ff3b5c',inj<30?'Basso':inj<60?'Moderato':'Alto',inj<30?'Carico ben gestito.':inj<60?'Monitora la fatica.':'Volume elevato, riduci.',inj<30?'b-green':inj<60?'b-amber':'b-red');
  var ot=Math.min(100,Math.round((tss>400?40:tss>280?20:0)+(ratio>1.4?30:ratio>1.15?15:0)+(wl.length>6?20:0)));
  setI('ot',ot,ot<30?'#00d68f':ot<60?'#f59e0b':'#ff3b5c',ot<30?'Basso':ot<60?'Attenzione':'Elevato',ot<30?'Equilibrato.':ot<60?'Inserisci riposo.':'Scarico raccomandata.',ot<30?'b-green':ot<60?'b-amber':'b-red');
  var names=['Dom','Lun','Mar','Mer','Gio','Ven','Sab']; var usedD=wl.map(function(l){ return new Date(l.data).getDay(); });
  var discD=(p.disciplines||[]).filter(function(d){ return d.inc!==false; }).reduce(function(a,d){ return a.concat(d.giorni||[]); },[]);
  var free=discD.length?discD.filter(function(d){ return !wl.some(function(l){ return names[new Date(l.data).getDay()]===d; }); }):[1,2,3,4,5,6,0].filter(function(d){ return usedD.indexOf(d)<0; }).slice(0,2).map(function(d){ return names[d]; });
  $('days-val').textContent=free.slice(0,3).join(' · ')||'—'; $('days-text').textContent=free.length?'Giorni ottimali per le prossime sessioni.':'Tutte le sessioni pianificate coperte.';
  var old4=logs.filter(function(l){ var d=new Date(l.data),t=new Date();t.setDate(t.getDate()-28);return d>=t&&d<mon; });
  var old4tss=old4.reduce(function(a,l){ return a+(parseInt(l.tss)||0); },0);
  if(logs.length>3){ var adapt=Math.min(100,Math.round(50+(tss-old4tss/4)/2)); setI('adapt',adapt,adapt>60?'#00d68f':adapt>40?'var(--acc-l)':'#f59e0b',adapt>65?'Miglioramento rapido':adapt>50?'Adattamento positivo':adapt>35?'Stabile':'In costruzione',adapt>50?'Risponde bene.':'Mantieni la consistenza.',adapt>60?'b-green':adapt>40?'b-blue':'b-amber'); }
}

// ── Charts ────────────────────────────────────
function getWeeklyKm(){ var logs=getLogs(),now=new Date(),result=[]; for(var w=7;w>=0;w--){ var ws=new Date(now); ws.setDate(now.getDate()-((now.getDay()+6)%7)-w*7); ws.setHours(0,0,0,0); var we=new Date(ws); we.setDate(ws.getDate()+7); var wl=logs.filter(function(l){ var d=new Date(l.data); return d>=ws&&d<we; }); result.push({label:w===0?'Att.':'S-'+w,km:parseFloat(wl.reduce(function(a,l){ return a+(parseFloat(l.km)||0); },0).toFixed(1)),tss:wl.reduce(function(a,l){ return a+(parseInt(l.tss)||0); },0),isCur:w===0}); } return result; }
function getPMC(){ var data=getWeeklyKm(),ctl=38,atl=38; return data.map(function(d){ ctl+=(d.tss-ctl)/42; atl+=(d.tss-atl)/7; return {label:d.label,fit:+ctl.toFixed(1),fat:+atl.toFixed(1),form:+(ctl-atl).toFixed(1)}; }); }
function tssColor(tss){ return tss===0?'rgba(255,255,255,.14)':tss<60?'#00d68f':tss<100?'var(--acc-l)':tss<140?'#f59e0b':'#ff3b5c'; }
function drawBar(id,data){ var cv=$(id); if(!cv) return; var ctx=cv.getContext('2d'),W=cv.offsetWidth||600,H=140; cv.width=W; cv.height=H; var pl={t:24,r:16,b:28,l:42},cw=W-pl.l-pl.r,ch=H-pl.t-pl.b; var mx=Math.max.apply(null,data.map(function(d){ return d.km; }).concat([1])); var bw=Math.max(8,cw/data.length*0.5),gap=cw/data.length; ctx.clearRect(0,0,W,H); for(var i=0;i<=4;i++){ var vy=Math.round(mx*i/4),yy=pl.t+ch*(1-i/4); ctx.strokeStyle='rgba(255,255,255,0.04)'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(pl.l,yy); ctx.lineTo(W-pl.r,yy); ctx.stroke(); ctx.fillStyle='rgba(255,255,255,0.2)'; ctx.font='10px Inter,system-ui'; ctx.textAlign='right'; ctx.fillText(vy,pl.l-5,yy+4); } data.forEach(function(d,i){ var x=pl.l+i*gap+(gap-bw)/2,bh=Math.max(d.km?2:0,ch*(d.km/mx)),y=pl.t+ch-bh; var gr=ctx.createLinearGradient(0,y,0,y+bh); gr.addColorStop(0,d.isCur?'rgba(91,142,245,1)':'rgba(91,142,245,.55)'); gr.addColorStop(1,d.isCur?'rgba(91,142,245,.3)':'rgba(91,142,245,.1)'); ctx.fillStyle=gr; if(ctx.roundRect){ ctx.beginPath(); ctx.roundRect(x,y,bw,bh,4); ctx.fill(); }else{ ctx.fillRect(x,y,bw,bh); } if(d.km>0){ ctx.fillStyle=d.isCur?'rgba(255,255,255,.9)':'rgba(255,255,255,.5)'; ctx.font=(d.isCur?'600 ':'')+'10px Inter,system-ui'; ctx.textAlign='center'; ctx.fillText(d.km,x+bw/2,y-5); } ctx.fillStyle=d.isCur?'rgba(91,142,245,.9)':'rgba(255,255,255,.25)'; ctx.font=(d.isCur?'600 ':'')+'10px Inter,system-ui'; ctx.textAlign='center'; ctx.fillText(d.label,x+bw/2,H-5); }); }
function drawPMC(id,data){ var cv=$(id); if(!cv) return; var ctx=cv.getContext('2d'),W=cv.offsetWidth||600,H=160; cv.width=W; cv.height=H; var pl={t:16,r:30,b:28,l:38},cw=W-pl.l-pl.r,ch=H-pl.t-pl.b; var allV=[]; data.forEach(function(d){ allV.push(d.fit,d.fat,d.form); }); var minV=Math.floor(Math.min.apply(null,allV)-5),maxV=Math.ceil(Math.max.apply(null,allV)+5),range=maxV-minV||1; function toY(v){ return pl.t+ch*(1-(v-minV)/range); } var sx=cw/(data.length-1||1); ctx.clearRect(0,0,W,H); var zy=toY(0); if(zy>pl.t&&zy<pl.t+ch){ ctx.fillStyle='rgba(34,212,160,.03)'; ctx.fillRect(pl.l,pl.t,cw,zy-pl.t); ctx.fillStyle='rgba(240,80,96,.03)'; ctx.fillRect(pl.l,zy,cw,pl.t+ch-zy); } for(var i=0;i<=5;i++){ var vy=minV+range*i/5,yy=toY(vy); ctx.strokeStyle='rgba(255,255,255,.04)'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(pl.l,yy); ctx.lineTo(W-pl.r,yy); ctx.stroke(); ctx.fillStyle='rgba(255,255,255,.2)'; ctx.font='10px Inter,system-ui'; ctx.textAlign='right'; ctx.fillText(Math.round(vy),pl.l-4,yy+4); } if(zy>pl.t&&zy<pl.t+ch){ ctx.strokeStyle='rgba(255,255,255,.1)'; ctx.setLineDash([4,4]); ctx.beginPath(); ctx.moveTo(pl.l,zy); ctx.lineTo(W-pl.r,zy); ctx.stroke(); ctx.setLineDash([]); } ctx.beginPath(); ctx.moveTo(pl.l,toY(data[0].fit)); data.forEach(function(d,i){ ctx.lineTo(pl.l+i*sx,toY(d.fit)); }); ctx.lineTo(pl.l+(data.length-1)*sx,pl.t+ch); ctx.lineTo(pl.l,pl.t+ch); ctx.closePath(); var ag=ctx.createLinearGradient(0,pl.t,0,pl.t+ch); ag.addColorStop(0,'rgba(91,142,245,.2)'); ag.addColorStop(1,'rgba(91,142,245,0)'); ctx.fillStyle=ag; ctx.fill(); var series=[{vals:data.map(function(d){ return d.fit; }),col:'rgba(91,142,245,1)',lw:2,dash:[]},{vals:data.map(function(d){ return d.fat; }),col:'rgba(240,80,96,.9)',lw:1.5,dash:[]},{vals:data.map(function(d){ return d.form; }),col:'rgba(34,212,160,.9)',lw:1.5,dash:[5,3]}]; series.forEach(function(s){ ctx.strokeStyle=s.col; ctx.lineWidth=s.lw; ctx.lineJoin='round'; ctx.setLineDash(s.dash); ctx.beginPath(); s.vals.forEach(function(v,i){ if(i===0) ctx.moveTo(pl.l,toY(v)); else ctx.lineTo(pl.l+i*sx,toY(v)); }); ctx.stroke(); ctx.setLineDash([]); var lx=pl.l+(s.vals.length-1)*sx,ly=toY(s.vals[s.vals.length-1]); ctx.fillStyle=s.col; ctx.beginPath(); ctx.arc(lx,ly,3.5,0,Math.PI*2); ctx.fill(); ctx.fillStyle=s.col; ctx.font='600 10px Inter,system-ui'; ctx.textAlign='left'; ctx.fillText(Math.round(s.vals[s.vals.length-1]),lx+6,ly+4); }); ctx.fillStyle='rgba(255,255,255,.22)'; ctx.font='10px Inter,system-ui'; ctx.textAlign='center'; ctx.setLineDash([]); data.forEach(function(d,i){ if(i%2===0||i===data.length-1) ctx.fillText(d.label,pl.l+i*sx,H-5); }); }
function drawZones(){ var el=$('zone-bars'); if(!el) return; var logs=getLogs(),now=new Date(),mon=new Date(now); mon.setDate(now.getDate()-((now.getDay()+6)%7)); mon.setHours(0,0,0,0); var wl=logs.filter(function(l){ return new Date(l.data)>=mon; }); var zones=[{l:'Z1 — Recupero',p:18,c:'#22d4a0'},{l:'Z2 — Aerobica base',p:48,c:'#5b8ef5'},{l:'Z3 — Soglia aerobica',p:22,c:'#f0a030'},{l:'Z4 — Soglia lat.',p:8,c:'#f07040'},{l:'Z5 — Massimale',p:4,c:'#f05060'}]; el.innerHTML=zones.map(function(z){ return '<div class="zone-row"><span class="zone-lbl">'+z.l+'</span><div class="zone-bw"><div class="zone-b" style="width:'+(wl.length?z.p:0)+'%;background:'+z.c+'"></div></div><span class="zone-pct" style="color:'+z.c+'">'+(wl.length?z.p+'%':'—')+'</span></div>'; }).join(''); }
function drawPlanTss(id,days){ var cv=$(id); if(!cv) return; var ctx=cv.getContext('2d'),W=cv.offsetWidth||600,H=90; cv.width=W; cv.height=H; var pl={t:12,r:12,b:24,l:10},cw=W-pl.l-pl.r,ch=H-pl.t-pl.b; var mx=Math.max.apply(null,days.map(function(d){ return d.tss||0; }).concat([1])); var bw=cw/days.length*0.55,gap=cw/days.length; var now=new Date(),off=(now.getDay()+6)%7,mon=new Date(now); mon.setDate(now.getDate()-off); mon.setHours(0,0,0,0); ctx.clearRect(0,0,W,H); var cmap={'#00d68f':'rgba(34,212,160,.7)','var(--acc-l)':'rgba(91,142,245,.7)','#f59e0b':'rgba(240,160,48,.7)','#ff3b5c':'rgba(240,80,96,.7)','rgba(255,255,255,.14)':'rgba(60,60,60,.5)'}; days.forEach(function(d,i){ var date=new Date(mon); date.setDate(mon.getDate()+i); var isToday=date.toDateString()===now.toDateString(); var tss=d.tss||0,bh=Math.max(tss?2:0,ch*(tss/mx)),y=pl.t+ch-bh,x=pl.l+i*gap+(gap-bw)/2; var rawC=tssColor(tss); var col=isToday?'rgba(91,142,245,1)':(cmap[rawC]||'rgba(91,142,245,.5)'); var gr=ctx.createLinearGradient(0,y,0,y+bh); gr.addColorStop(0,col); gr.addColorStop(1,col.replace(/[\d.]+\)$/,'0.15)')); ctx.fillStyle=gr; if(ctx.roundRect){ ctx.beginPath(); ctx.roundRect(x,y,bw,bh,3); ctx.fill(); }else{ ctx.fillRect(x,y,bw,bh); } ctx.fillStyle=isToday?'rgba(91,142,245,.9)':'rgba(255,255,255,.22)'; ctx.font=(isToday?'600 ':'')+'10px Inter,system-ui'; ctx.textAlign='center'; ctx.fillText(DAYS7[i],x+bw/2,H-5); if(tss>0){ ctx.fillStyle='rgba(255,255,255,.6)'; ctx.font='9px Inter,system-ui'; ctx.fillText(tss,x+bw/2,y-4); } }); }
function drawCharts(){ setTimeout(function(){ var wk=getWeeklyKm(); var tot=wk.reduce(function(a,d){ return a+d.km; },0); $('vol-total').textContent=tot?'Totale 8 sett: '+tot.toFixed(0)+' km':''; drawBar('barChart',wk); drawPMC('pmcChart',getPMC()); drawZones(); },50); }

// ── Dashboard ─────────────────────────────────
function renderHome(){
  var logs=getLogs(),goals=getGoals(),now=new Date(),mon=new Date(now);
  mon.setDate(now.getDate()-((now.getDay()+6)%7)); mon.setHours(0,0,0,0);
  var wl=logs.filter(function(l){ return new Date(l.data)>=mon; });
  var totKm=wl.reduce(function(a,l){ return a+(parseFloat(l.km)||0); },0);
  var totTss=wl.reduce(function(a,l){ return a+(parseInt(l.tss)||0); },0);
  var fcV=wl.filter(function(l){ return l.fc; }).map(function(l){ return parseInt(l.fc); });
  var avgFc=fcV.length?Math.round(fcV.reduce(function(a,b){ return a+b; },0)/fcV.length):null;
  var totMin=0; wl.forEach(function(l){ if(l.durata){ var p=(l.durata||'0:0').split(':'); totMin+=parseInt(p[0]||0)*60+parseInt(p[1]||0); } });
  if($('kpi-km')) $('kpi-km').textContent=totKm?totKm.toFixed(1)+' km':'—'; if($('kpi-km-sub')) $('kpi-km-sub').textContent=wl.length+' session'+(wl.length===1?'e':'i');
  $('kpi-time').textContent=totMin?Math.floor(totMin/60)+'h '+(totMin%60)+'m':'—';
  $('kpi-tss').textContent=totTss||'—'; $('kpi-fc').textContent=avgFc||'—';
  if(wl.length>0){ var r=Math.min(10,parseFloat((Math.min(totTss,400)/400*4+Math.min(wl.length,6)/6*3+2).toFixed(1))); $('rArc').style.strokeDashoffset=144.5-(144.5*r/10); $('rNum').textContent=r.toFixed(1); $('rLabel').textContent=r>=8?'Eccellente':r>=6?'Buona settimana':r>=4?'Nella norma':'Leggera'; $('rText').textContent='TSS '+totTss+' · '+wl.length+' sessioni.'; }
  var planned=6,pct=Math.min(100,Math.round(wl.length/planned*100)); $('adh-val').textContent=pct+'%'; $('adh-sub').textContent=wl.length+'/'+planned; $('adh-bar').style.width=pct+'%';
  var saved=null; try{ saved=JSON.parse(localStorage.getItem('lastPlanDays')||'null'); }catch(e){}
  var todayHtml='<p style="font-size:.74rem;color:var(--t2)">Nessun piano. Vai su Piano e genera.</p>';
  if(saved&&Array.isArray(saved)){ var td=saved[(now.getDay()+6)%7]; if(td&&td.titolo&&td.titolo.toLowerCase().indexOf('riposo')<0){ var pills=''; var bk=Array.isArray(td.blocchi)?td.blocchi:[]; bk.forEach(function(b,bi){ pills+='<span class="wf-pill '+(b.tipo==='warmup'?'wu':b.tipo==='cooldown'?'cd':b.tipo==='rep'?'rp':'mn')+'">'+b.testo+'</span>'; if(bi<bk.length-1) pills+='<span class="wf-plus">+</span>'; }); todayHtml='<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px"><div style="flex:1;min-width:0"><div style="font-size:.59rem;color:var(--t2);text-transform:uppercase;letter-spacing:.8px;font-weight:600;margin-bottom:3px">'+(td.disciplina||'')+'</div><div style="font-size:.88rem;font-weight:600;margin-bottom:6px">'+td.titolo+'</div>'+(pills?'<div class="wf">'+pills+'</div>':'')+'</div><div style="text-align:right;flex-shrink:0"><div style="font-size:1.5rem;font-weight:300;letter-spacing:-1px;color:var(--acc-l)">'+(td.tss||0)+'</div><div style="font-size:.57rem;color:var(--t2);text-transform:uppercase;letter-spacing:.7px">TSS</div>'+(td.distanza?'<div style="font-size:.65rem;color:var(--t2);margin-top:3px">'+td.distanza+'</div>':'')+'</div></div>'; } }
  $('today-wu').innerHTML=todayHtml;
  var cm={'A — Principale':'b-blue','B — Secondario':'b-green','C — Complementare':'b-muted'};
  $('home-goals').innerHTML=goals.length?goals.map(function(g){ return '<div class="rsep"><div style="display:flex;justify-content:space-between;align-items:center"><div><div style="font-size:.77rem;font-weight:500">'+g.nome+'</div><div style="font-size:.63rem;color:var(--t2);margin-top:2px">'+g.tipo+' · '+g.data+(g.target?' · '+g.target:'')+'</div></div><span class="badge '+(cm[g.prio]||'b-muted')+'">'+g.prio.split('—')[0].trim()+'</span></div></div>'; }).join(''):'<p style="font-size:.74rem;color:var(--t2)">Nessun obiettivo.</p>';
  $('recent-log').innerHTML=logs.length?logs.slice(0,4).map(function(l){ return '<div class="rsep"><div style="display:flex;justify-content:space-between"><span style="font-size:.77rem;font-weight:500">'+l.tipo+'</span><span style="font-size:.62rem;color:var(--t2)">'+l.data+'</span></div><div class="log-stats">'+(l.km?'<div class="log-stat"><strong>'+l.km+'</strong><span>km</span></div>':l.distanza?'<div class="log-stat"><strong>'+l.distanza+'</strong><span></span></div>':'')+(l.durata?'<div class="log-stat"><strong>'+l.durata+'</strong><span>dur.</span></div>':'')+(l.tss?'<div class="log-stat"><strong>'+l.tss+'</strong><span>TSS</span></div>':'')+'</div></div>'; }).join(''):'<p style="font-size:.74rem;color:var(--t2)">Nessun allenamento.</p>';
  computeIndicators();

  // ── HOME v2 ──
  var _hr = new Date().getHours();
  if($('greetingLabel')) $('greetingLabel').textContent = _hr<12?'Buongiorno':_hr<18?'Buon pomeriggio':'Buonasera';
  // Strava chip
  var _strConn = localStorage.getItem('stravaConnected')==='true';
  var _chip = $('strava-chip-home');
  if(_chip) _chip.style.display = _strConn ? 'flex' : 'none';
  if(_strConn){ var _cs=$('strava-chip-status'); if(_cs) _cs.textContent = localStorage.getItem('stravaAthleteName')||'connesso'; }
  // Today hero from plan
  var _plan = null; try{ _plan = JSON.parse(localStorage.getItem('currentPlan')||'null'); }catch(e){}
  var _todayIdx = -1;
  if(_plan && _plan.length){ // Timezone-safe: use local date string to get day
  var _today = new Date(); var _dow = (new Date().getDay()+6)%7; // Mon=0
  _todayIdx = _dow < _plan.length ? _dow : -1; }
  var _td = (_todayIdx>=0 && _plan && _plan[_todayIdx]) ? _plan[_todayIdx] : null;
  if($('th-tss-badge')) $('th-tss-badge').textContent = _td && _td.tss>0 ? 'TSS '+_td.tss : 'Riposo';
  if($('th-title')) $('th-title').textContent = _td && _td.tss>0 ? (_td.titolo||'Allenamento') : (_plan?'Giorno di riposo':'Nessun piano attivo');
  if($('th-meta')){
    var _meta='';
    if(_td&&_td.tss>0){ if(_td.distanza) _meta+=_td.distanza; if(_td.durata) _meta+=(_meta?' · ':'')+_td.durata; if(_td.zone&&_td.zone.length) _meta+=(_meta?' · ':'')+_td.zone.join(', '); }
    else _meta = _plan ? 'Recupero — goditi il riposo' : 'Vai al piano per generare la settimana';
    if($('th-meta')) $('th-meta').textContent = _meta;
  }
  var _pills = $('th-pills');
  if(_pills){ _pills.innerHTML='';
    if(_td&&_td.blocchi&&_td.blocchi.length){
      var _tm={'warmup':'wu','main':'mn','rep':'rp','cooldown':'cd'};
      _td.blocchi.forEach(function(b,bi){
        if(bi>0){var sep=document.createElement('span');sep.className='wf-plus';sep.textContent='+';_pills.appendChild(sep);}
        var p=document.createElement('div');p.className='th-pill '+(_tm[b.tipo]||'mn');p.textContent=b.testo;_pills.appendChild(p);
      });
    }
  }
  var _btnDone=$('th-btn-done'), _btnMove=$('th-btn-move');
  if(_btnDone) _btnDone.onclick=function(){
    if(_td&&_td.tss>0){ _td.done=true; localStorage.setItem('currentPlan',JSON.stringify(_plan)); dbSave({plan:_plan}); toast('Sessione completata!'); setTimeout(function(){ showCoachReport(_td); },900); }
    else toast('Nessuna sessione oggi');
  };
  if(_btnMove) _btnMove.onclick=function(){ toast('Sessione spostata'); };
  // Carico 7gg
  var _logs=[]; try{_logs=JSON.parse(localStorage.getItem('logs')||'[]');}catch(e){}
  var _now7=Date.now()-7*86400000;
  var _tss7=_logs.filter(function(l){return new Date(l.data).getTime()>_now7;}).reduce(function(s,l){return s+(l.tss||0);},0);
  // Week activity count
  var _todayDowEarly=(new Date().getDay()+6)%7;
  var _mon2=new Date(); _mon2.setDate(_mon2.getDate()-_todayDowEarly);
  var _monStr=_mon2.toISOString().split('T')[0];
  var _weekActs=_logs.filter(function(l){return l.data>=_monStr&&l.tss>0;});
  if($('kpi-week-count')) $('kpi-week-count').textContent=_weekActs.length||'—';
  if($('kpi-week-sub')) $('kpi-week-sub').textContent=_weekActs.length===1?'allenamento':_weekActs.length>1?'allenamenti':'nessuno questa sett.';
  if($('kpi-week-bar')) $('kpi-week-bar').style.width=Math.min(_weekActs.length/7*100,100)+'%';
  if($('carico-val')) $('carico-val').textContent = _tss7||'—';
  if($('carico-bar')) $('carico-bar').style.width = Math.min(_tss7/5,100)+'%';
  if($('carico-sub')) $('carico-sub').textContent = _tss7 ? _tss7+' TSS questa settimana' : 'Nessun dato';
  // Obiettivo primario
  var _goals=[]; try{_goals=JSON.parse(localStorage.getItem('goals')||'[]');}catch(e){}
  var _pg=_goals.filter(function(g){return g.prio==='A';}).sort(function(a,b){return new Date(a.data)-new Date(b.data);})[0]||_goals[0];
  if(_pg){
    var _diff=Math.round((new Date(_pg.data)-new Date())/86400000);
    if($('goal-days-val')) $('goal-days-val').textContent=_diff>0?'-'+_diff:'+'+Math.abs(_diff);
    if($('goal-days-val')) $('goal-days-val').style.color=_diff>14?'var(--acc-ll)':_diff>0?'var(--am)':'var(--rd)';
    if($('goal-days-sub')) $('goal-days-sub').textContent=(_diff>0?'giorni a ':'')+(_pg.nome||'—');
    if($('goal-days-bar')) $('goal-days-bar').style.width=Math.max(0,Math.min(100,100-_diff/2))+'%';
  }
  // Week bar
  var _DAYS=['Lun','Mar','Mer','Gio','Ven','Sab','Dom'];
  // Timezone-safe local day: format local date and extract weekday
  var _nowLocal=new Date(); 
  var _todayDow=(function(d){ return (d.getDay()+6)%7; })(_nowLocal); // Mon=0
  var _grid=$('week-days-grid');
  if(_grid){
    _grid.innerHTML='';
    var _planRef=_plan&&_plan.length?_plan:_DAYS.map(function(){return {tss:0};});
    var _doneTss=_planRef.slice(0,_todayDow).reduce(function(s,d){return s+(d.tss||0);},0);
    var _totalTss=_planRef.reduce(function(s,d){return s+(d.tss||0);},0);
    if($('week-tss-lbl')) $('week-tss-lbl').textContent='Questa settimana · '+_doneTss+' / '+_totalTss+' TSS';
    _DAYS.forEach(function(name,di){
      var dc=document.createElement('div'); dc.className='dc';
      var dn=document.createElement('div'); dn.className='dn'; dn.textContent=name; dc.appendChild(dn);
      var dd=document.createElement('div');
      // Check real logs for this day
      var now=new Date();
      var monday=new Date(now); monday.setDate(now.getDate()-_todayDow);
      var dayDate=new Date(monday); dayDate.setDate(monday.getDate()+di);
      var dayStr=dayDate.toISOString().split('T')[0];
      var dayLogs=_logs.filter(function(l){ return l.data===dayStr&&l.tss>0; });
      var hasTrained=dayLogs.length>0;
      var dayTss=dayLogs.reduce(function(s,l){return s+(l.tss||0);},0);
      var planDay=_planRef[di]||{tss:0};
      var isRestDay=!planDay.tss||planDay.tss===0;
      if(di<_todayDow){
        if(hasTrained){ dd.className='dd done'; dd.innerHTML='<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--gn)" stroke-width="2.5" stroke-linecap="round"><path d="M5 13l4 4L19 7"/></svg>'; }
        else if(isRestDay){ dd.className='dd rest'; }
        else{ dd.className='dd future'; dd.style.opacity='.4'; }
      } else if(di===_todayDow){
        dd.className='dd today'; dd.innerHTML='<svg width="8" height="8" viewBox="0 0 24 24"><circle cx="12" cy="12" r="6" fill="var(--acc-l)"/></svg>';
      } else if(isRestDay){
        dd.className='dd rest';
      } else {
        dd.className='dd future';
      }
      dc.appendChild(dd);
      var dt=document.createElement('div'); dt.className='dtss';
      dt.textContent=dayTss>0?String(dayTss):(planDay.tss>0?String(planDay.tss):'—');
      if(di===_todayDow) dt.style.color='var(--acc-l)';
      dc.appendChild(dt);
      _grid.appendChild(dc);
    });
  }
  // Next 3 sessions
  var _ns=$('next-sessions');
  if(_ns){
    _ns.innerHTML='';
    var _upcoming=[];
    if(_plan&&_plan.length){ for(var _di=_todayDow+1;_di<_plan.length;_di++){ if(_plan[_di].tss>0) _upcoming.push({d:_di,p:_plan[_di]}); } }
    var _show=_upcoming.slice(0,3);
    while(_show.length<3) _show.push(null);
    _show.forEach(function(item){
      var nx=document.createElement('div'); nx.className='nx';
      if(item){ nx.innerHTML='<div class="nx-day">'+_DAYS[item.d]+'</div><div class="nx-title">'+(item.p.titolo||'—')+'</div><div class="nx-meta">'+(item.p.distanza||item.p.durata||'—')+'</div><div class="nx-tss">'+(item.p.tss||'—')+'</div>'; }
      else { nx.innerHTML='<div class="nx-day" style="color:var(--t3)">—</div><div class="nx-title" style="color:var(--t3)">Nessuna</div><div class="nx-meta"></div><div class="nx-tss"></div>'; nx.style.opacity='.25'; }
      _ns.appendChild(nx);
    });
  }
  // Discipline strip — from profile
  var _todayDow2=(new Date().getDay()+6)%7; var _nowW=new Date(); var _monW=new Date(_nowW); _monW.setDate(_nowW.getDate()-_todayDow2);
  var _weekStart=_monW.toISOString().split('T')[0];
  var _weekLogs=_logs.filter(function(l){return l.data>=_weekStart;});
  function _distForSport(kws){
    return _weekLogs.filter(function(l){
      var s=(l.sport||l.tipo||l.titolo||'').toLowerCase();
      return kws.some(function(k){return s.indexOf(k)>=0;});
    }).reduce(function(sum,l){return sum+(parseFloat(l.km)||0);},0);
  }
  // Build disc strip dynamically from profile
  var _profDiscs=(getProfile().disciplines||[]).filter(function(d){return d.inc!==false;});
  var _discStrip=$('disc-strip-dyn');
  if(_discStrip&&_profDiscs.length>0){
    _discStrip.innerHTML='';
    var _catMap={
      'Corsa':['run','corsa','trail','jogg'],'Bici':['ride','bici','cycl','bike'],'Nuoto':['swim','nuoto'],
      'Ciclismo':['ride','bici','cycl','bike'],'Triathlon':['tri'],'Palestra':['gym','palest','forza']
    };
    var _colMap={'Corsa':'run','Bici':'bike','Nuoto':'swim','Ciclismo':'bike','Triathlon':'acc-l','Palestra':'am'};
    _profDiscs.slice(0,3).forEach(function(d){
      var kws=_catMap[d.sport]||[d.sport.toLowerCase()];
      var km=_distForSport(kws);
      var col=_colMap[d.sport]||'acc-l';
      var div=document.createElement('div');
      div.className='disc-card-tri';
      div.style.borderTopColor='var(--'+col+')';
      div.innerHTML='<div class="disc-name">'+d.sport+'</div>'+
        '<div class="disc-val" style="color:var(--'+col+')">'+(km>0?km.toFixed(1):'—')+'</div>'+
        '<div class="disc-sub">km questa sett.</div>';
      _discStrip.appendChild(div);
    });
  } else if(_discStrip){
    // Default triathlon
    var _sk=_distForSport(['swim','nuoto']),_bk=_distForSport(['ride','bici','cycl']),_rk=_distForSport(['run','corsa','trail']);
    _discStrip.innerHTML=
      '<div class="disc-card-tri" style="border-top-color:var(--swim)"><div class="disc-name">Nuoto</div><div class="disc-val" style="color:var(--swim)">'+(_sk>0?_sk.toFixed(1):'—')+'</div><div class="disc-sub">km questa sett.</div></div>'+
      '<div class="disc-card-tri" style="border-top-color:var(--bike)"><div class="disc-name">Bici</div><div class="disc-val" style="color:var(--bike)">'+(_bk>0?_bk.toFixed(1):'—')+'</div><div class="disc-sub">km questa sett.</div></div>'+
      '<div class="disc-card-tri" style="border-top-color:var(--run)"><div class="disc-name">Corsa</div><div class="disc-val" style="color:var(--run)">'+(_rk>0?_rk.toFixed(1):'—')+'</div><div class="disc-sub">km questa sett.</div></div>';
  }

  // Coach report card
  var _lr=null; try{_lr=JSON.parse(localStorage.getItem('lastCoachReport')||'null');}catch(e){}
  var _rc=$('coach-report-card');
  if(_rc&&_lr){
    _rc.style.display='block';
    var _nb=$('cr-new-badge'); if(_nb) _nb.style.display=_lr.read?'none':'inline-block';
    var _cs2=$('cr-subtitle'); if(_cs2) _cs2.textContent=(_lr.titolo||'Allenamento')+' — '+(_lr.data||'');
    var _cb=$('cr-body'); if(_cb) _cb.textContent=_lr.analisi||'';
    var _cst=$('cr-stats');
    if(_cst&&_lr.stats) _cst.innerHTML=_lr.stats.map(function(s){return '<div class="cr-stat"><strong>'+s.val+'</strong><span>'+s.lbl+'</span></div>';}).join('');
    var _cc=$('cr-cta-btn');
    if(_cc) _cc.onclick=function(){ if(_lr){_lr.read=true;localStorage.setItem('lastCoachReport',JSON.stringify(_lr));} if(_nb) _nb.style.display='none'; openCoach(); };
  }
}
renderHome(); drawCharts();

// ── Goals ─────────────────────────────────────
$('btn-add-goal').onclick=function(){ var g={id:Date.now(),nome:$('g-nome').value.trim(),tipo:$('g-tipo').value,data:$('g-data').value,prio:$('g-prio').value,target:$('g-target').value,note:$('g-note').value}; if(!g.nome||!g.data){ toast('Inserisci nome e data'); return; } var goals=getGoals(); goals.push(g); saveGoals(goals); renderGoals(); renderHome(); ['g-nome','g-data','g-target','g-note'].forEach(function(id){ var e=$(id); if(e) e.value=''; }); toast('Obiettivo aggiunto'); };
function deleteGoal(id){ saveGoals(getGoals().filter(function(g){ return g.id!==id; })); renderGoals(); renderHome(); }
function renderGoals(){
  var goals=getGoals(); $('goalCount').textContent=goals.length+' obiettiv'+(goals.length===1?'o':'i');
  var cm={'A — Principale':'b-blue','B — Secondario':'b-green','C — Complementare':'b-muted'};
  var el=$('goalList');
  if(!goals.length){ el.innerHTML='<p style="font-size:.74rem;color:var(--t2)">Nessun obiettivo.</p>'; return; }
  var html=''; goals.forEach(function(g){ html+='<div class="goal-item"><div style="display:flex;justify-content:space-between;align-items:flex-start"><div><div style="font-size:.79rem;font-weight:600">'+g.nome+'</div><div style="font-size:.64rem;color:var(--t2);margin-top:2px">'+g.tipo+' · '+g.data+(g.target?' · '+g.target:'')+'</div>'+(g.note?'<div style="font-size:.65rem;color:var(--t2);margin-top:3px">'+g.note+'</div>':'')+'</div><div style="display:flex;align-items:center;gap:7px;flex-shrink:0;margin-left:10px"><span class="badge '+(cm[g.prio]||'b-muted')+'">'+g.prio+'</span><button class="btn-del gdel" data-gid="'+g.id+'" style="font-size:1.1rem">×</button></div></div></div>'; });
  el.innerHTML=html; el.querySelectorAll('.gdel').forEach(function(b){ b.onclick=function(){ deleteGoal(+this.dataset.gid); }; });
}
renderGoals();

// ── Plan ──────────────────────────────────────
function zoneClass(z){ if(!z) return 'z2'; var n=z.toLowerCase(); if(n.indexOf('1')>=0) return 'z1'; if(n.indexOf('2')>=0) return 'z2'; if(n.indexOf('3')>=0) return 'z3'; if(n.indexOf('4')>=0) return 'z4'; if(n.indexOf('5')>=0) return 'z5'; return 'z2'; }
function pillClass(tipo){ return {warmup:'wu',main:'mn',rep:'rp',cooldown:'cd'}[tipo]||'mn'; }
function tssHex(tss){ var m={'#00d68f':'#22d4a0','var(--acc-l)':'#5b8ef5','#f59e0b':'#f0a030','#ff3b5c':'#f05060','rgba(255,255,255,.14)':'#303040'}; return m[tssColor(tss)]||'#5b8ef5'; }

function renderPlanUI(days){
  var goals=getGoals(); var pgb=$('plan-goals-bar'),pgt=$('plan-goals-tags');
  if(goals.length&&pgb&&pgt){ pgb.style.display='block'; pgt.innerHTML=goals.map(function(g){ return '<span class="badge b-blue">'+g.nome+' · '+g.data+'</span>'; }).join(''); }
  var tot=days.reduce(function(a,d){ return a+(d.tss||0); },0); var ptot=$('plan-tss-tot'); if(ptot) ptot.textContent='TSS totale: '+tot; var ptc=$('plan-tss-card'); if(ptc) ptc.style.display='block';
  setTimeout(function(){ drawPlanTss('planTssChart',days); },50); $('plan-empty').style.display='none';
  var now=new Date();
  var maxTss=Math.max.apply(null,days.map(function(d){ return d.tss||0; }).concat([1]));
  // Group into weeks of 7
  var html='';
  for(var wi=0;wi<days.length;wi+=7){
    var week=days.slice(wi,wi+7);
    var weekTss=week.reduce(function(a,d){return a+(d.tss||0);},0);
    var wLabel='Settimana '+(wi/7+1);
    if(week[0]&&week[0].data){ var wd=new Date(week[0].data); wLabel='Sett.'+(wi/7+1)+' — '+wd.getDate()+'/'+(wd.getMonth()+1); }
    html+='<div style="margin-bottom:1.5rem"><div style="font-size:.6rem;color:var(--t2);text-transform:uppercase;letter-spacing:1px;font-weight:600;margin-bottom:.5rem;display:flex;justify-content:space-between;align-items:center"><span>'+wLabel+'</span><span style="color:var(--acc-l)">TSS '+weekTss+'</span></div>';
    week.forEach(function(d,i){
      var dateObj=d.data?new Date(d.data+'T12:00:00'):null;
      var dow=dateObj?DAYS7[(dateObj.getDay()+6)%7]:DAYS7[i%7];
      var isToday=dateObj&&dateObj.toDateString()===now.toDateString();
      var isRace=d.tipo&&d.tipo.toLowerCase()==='gara';
      var isRest=!d.tipo||d.tipo.toLowerCase().indexOf('riposo')>=0;
      var tss=d.tss||0,col=isRace?'#FC4C02':tssHex(tss),blocchi=Array.isArray(d.blocchi)?d.blocchi:[];
      var pillsHtml='';
      if(!isRest&&blocchi.length){ pillsHtml='<div class="wf">'; blocchi.forEach(function(b,bi){ pillsHtml+='<span class="wf-pill '+pillClass(b.tipo)+'">'+b.testo+'</span>'; if(bi<blocchi.length-1) pillsHtml+='<span class="wf-plus">+</span>'; }); pillsHtml+='</div>'; }
      var descHtml=(!isRest&&d.descrizione)?'<div class="wf-desc">'+d.descrizione+'</div>':'';
      var zoneTags=''; var _zones=d.zone?(Array.isArray(d.zone)?d.zone:[d.zone]):[]; _zones.forEach(function(z){ zoneTags+='<span class="pdc-tag '+zoneClass(z)+'">'+z+'</span>'; });
      var objTag=d.obiettivo?'<span class="pdc-tag obj-tag">'+d.obiettivo+'</span>':'';
      var dateLabel=dateObj?(dateObj.getDate()+'/'+(dateObj.getMonth()+1)):(wi+i+1);
      var raceTag=isRace?'<span class="pdc-tag" style="background:rgba(252,76,2,.18);color:#FC4C02;border:1px solid rgba(252,76,2,.3)">\uD83C\uDFC1 GARA</span>':'';
      html+='<div class="pdc'+(isToday?' today-card':'')+(isRest?' rest-card':'')+(isRace?' race-card':'')+'"><div class="pdc-top"><div><div class="pdc-dow">'+dow+'</div><div class="pdc-date">'+dateLabel+'</div>'+(isToday?'<div class="pdc-today-pill">oggi</div>':'')+(isRace?'<div class="pdc-today-pill" style="background:rgba(252,76,2,.18);color:#FC4C02">gara</div>':'')+'</div><div class="pdc-right">'+(isRest?'<div style="font-size:.68rem;color:var(--t3)">Riposo</div>':'<div class="pdc-tss-num" style="color:'+col+'">'+tss+'</div><div class="pdc-tss-lbl">TSS</div><div class="pdc-tss-bar"><div class="pdc-tss-fill" style="width:'+Math.round(tss/maxTss*100)+'%;background:'+col+'"></div></div>'+(d.distanza?'<div class="pdc-dist">'+d.distanza+'</div>':''))+'</div></div><div class="pdc-disc">'+(d.disciplina||'Riposo')+'</div><div class="pdc-title">'+(d.titolo||'Riposo')+'</div>'+pillsHtml+descHtml+'<div class="pdc-tags">'+raceTag+zoneTags+objTag+'</div></div>';
    });
    html+='</div>';
  }
  $('plan-days').innerHTML=html;
}

$('btn-gen-plan').onclick=generatePlan;
function generatePlan(){
  if(planBusy) return; planBusy=true;
  $('plan-banner').style.display='flex'; $('plan-days').innerHTML=''; $('plan-empty').style.display='none';
  var ptc=$('plan-tss-card'); if(ptc) ptc.style.display='none'; var pgb=$('plan-goals-bar'); if(pgb) pgb.style.display='none';
  var p=getProfile(),goals=getGoals();
  var incl=(p.disciplines||[]).filter(function(d){ return d.inc!==false; });
  var excl=(p.disciplines||[]).filter(function(d){ return d.inc===false; });
  var inclStr=incl.length?incl.map(function(d){ return d.sport+': '+(d.ore||'?')+'h/sett, giorni: '+((d.giorni&&d.giorni.join('/'))||'flex')+(d.infortuni?' (infortuni: '+d.infortuni+')':''); }).join('\n'):'Nessuna specificata';
  var exclStr=excl.length?excl.map(function(d){ return d.sport+': giorni '+(d.giorni&&d.giorni.join('/')||'vari')+' (blocca questi giorni)'; }).join('\n'):'Nessuna';
  var goalStr=goals.length?goals.map(function(g){ return '['+g.prio+'] '+g.nome+' | '+g.tipo+' | '+g.data+(g.target?' | '+g.target:''); }).join('\n'):'Nessun obiettivo — piano di mantenimento generico';
  var _cp=localStorage.getItem('customPlanPrompt'); var prompt=_cp?_cp:getDefaultPrompt();
  callAI([{role:'user',content:prompt}],buildSys(),3000)
    .then(function(reply){
      var s=reply.indexOf('['),e=reply.lastIndexOf(']');
      if(s<0||e<=s) throw new Error('No JSON array');
      var raw=reply.substring(s,e+1);
      var days; try{ days=JSON.parse(raw); }catch(err){ days=JSON.parse(raw.replace(/,(\s*[}\]])/g,'$1')); }
      if(!Array.isArray(days)) throw new Error('Not array');
      days=days.map(function(d){ if(!Array.isArray(d.blocchi)) d.blocchi=[]; if(typeof d.tss!=='number') d.tss=parseInt(d.tss)||0; return d; });
      localStorage.setItem('lastPlanDays',JSON.stringify(days));
      localStorage.setItem('lastPlanDate',new Date().toLocaleDateString('it-IT',{day:'numeric',month:'long',year:'numeric'}));
      renderPlanUI(days); renderHome();
      $('plan-gen-date').textContent='Generato il '+localStorage.getItem('lastPlanDate')+' · '+days.length+' giorni';
    })
    .catch(function(err){ var msg=err&&err.message?err.message:String(err); toast('Errore piano: '+msg.substring(0,60)); $('plan-empty').style.display='block'; console.error('PIANO ERR:',err); })
    .finally(function(){ $('plan-banner').style.display='none'; planBusy=false; });
}
(function(){ var saved=null; try{ saved=JSON.parse(localStorage.getItem('lastPlanDays')||'null'); }catch(e){} if(saved&&Array.isArray(saved)&&saved.length>=7){ try{ renderPlanUI(saved); $('plan-gen-date').textContent='Piano del '+(localStorage.getItem('lastPlanDate')||''); }catch(e){ $('plan-empty').style.display='block'; } }else{ $('plan-empty').style.display='block'; } })();

// ── Log ───────────────────────────────────────
function addLog(data){
  data.id=Date.now(); var logs=getLogs(); logs.unshift(data); saveLogs(logs);
  renderLogs(); renderHome(); drawCharts(); toast('Allenamento salvato');
  generateFeedback(data);
}
$('btn-add-log').onclick=function(){
  var e={}; ['data','tipo','km','durata','fc','tss','passo','d','power','note'].forEach(function(f){ var el=$('l-'+f); if(el) e[f]=el.value; });
  if(!e.data||!e.tipo){ toast('Inserisci data e tipo'); return; }
  ['km','durata','fc','tss','passo','d','power','note'].forEach(function(f){ var el=$('l-'+f); if(el) el.value=''; });
  addLog(e);
};
function generateFeedback(entry){
  var desc=Object.keys(entry).filter(function(k){ return entry[k]&&k!=='id'; }).map(function(k){ return k+':'+entry[k]; }).join(' ');
  callAI([{role:'user',content:'Feedback sintetico 3 frasi, italiano, no emoji:\n'+desc}],buildSys(),300)
    .then(function(reply){ if(!reply) return; var logs=getLogs(),idx=-1; logs.forEach(function(l,i){ if(l.id===entry.id) idx=i; }); if(idx>=0){ logs[idx].feedback=reply; saveLogs(logs); renderLogs(); } openCoachWithMsg(reply); })
    .catch(function(){});
}
function deleteLog(id){ saveLogs(getLogs().filter(function(l){ return l.id!==id; })); renderLogs(); renderHome(); drawCharts(); }
function renderLogs(filterArg){
  var activeFilter = filterArg || window._logFilter || 'all';
  window._logFilter = activeFilter;
  var allLogs = getLogs();
  // Sort most recent first
  allLogs.sort(function(a,b){ return new Date(b.data)-new Date(a.data); });
  // Filter
  var logs = activeFilter==='all' ? allLogs : allLogs.filter(function(l){
    var s=(l.sport||l.tipo||l.titolo||'').toLowerCase();
    if(activeFilter==='run') return /run|corsa|trail|jogg|marcia/.test(s);
    if(activeFilter==='bike') return /ride|bici|cycling|ciclismo|bike|velo/.test(s);
    if(activeFilter==='swim') return /swim|nuoto|nuo/.test(s);
    if(activeFilter==='other') return !/run|corsa|trail|jogg|ride|bici|cycling|ciclismo|bike|swim|nuoto/.test(s);
    return true;
  });

  var countEl=$('logCount');
  if(countEl) countEl.textContent=allLogs.length+' allenament'+(allLogs.length===1?'o':'i')+(activeFilter!=='all'?' · '+logs.length+' filtrati':'');
  var el=$('logList'); if(!el) return;

  // Update filter button states
  document.querySelectorAll('.lf-btn').forEach(function(b){
    b.classList.toggle('active', b.dataset.filter===activeFilter);
  });

  if(!logs.length){
    el.innerHTML='<div style="padding:32px;text-align:center;font-size:.74rem;color:var(--t2)">'+(activeFilter!=='all'?'Nessun allenamento in questa categoria.':'Nessun allenamento. Sincronizza Strava o aggiungi manualmente.')+'</div>';
    return;
  }

  var sportIcons={'run':'<svg width=\'14\' height=\'14\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'currentColor\' stroke-width=\'1.8\' stroke-linecap=\'round\'><circle cx=\'12\' cy=\'5\' r=\'2\'/><path d=\'M12 7v6l3 4M12 13l-3 4M9 9l-3 1M15 9l3 1\'/></svg>','bike':'<svg width=\'14\' height=\'14\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'currentColor\' stroke-width=\'1.8\'><circle cx=\'6\' cy=\'15\' r=\'4\'/><circle cx=\'18\' cy=\'15\' r=\'4\'/><path d=\'M6 15l3-6h6l3 6M15 9l-3-4\'/></svg>','swim':'<svg width=\'14\' height=\'14\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'currentColor\' stroke-width=\'1.8\'><path d=\'M2 12c2-2 4-2 6 0s4 2 6 0 4-2 6 0M2 17c2-2 4-2 6 0s4 2 6 0 4-2 6 0M7 7l5-4 5 4\'/></svg>','other':'<svg width=\'14\' height=\'14\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'currentColor\' stroke-width=\'1.8\'><circle cx=\'12\' cy=\'12\' r=\'9\'/><path d=\'M12 8v4l3 2\'/></svg>'};
  var sportColors={'run':'var(--run)','bike':'var(--bike)','swim':'var(--swim)','other':'var(--acc-l)'};
  var sportBg={'run':'var(--run2)','bike':'var(--bike2)','swim':'var(--swim2)','other':'var(--acc2)'};
  var sportLabels={'run':'Corsa','bike':'Bici','swim':'Nuoto','other':'Allenamento'};

  var html='';
  logs.forEach(function(l){
    var cat=(function(s){
      s=(s||'').toLowerCase();
      if(/swim|nuoto|nuo/.test(s)) return 'swim';
      if(/run|corsa|trail|jogg|marcia/.test(s)) return 'run';
      if(/ride|bici|cycling|ciclismo|bike|velo/.test(s)) return 'bike';
      return 'other';
    })(l.sport||l.tipo||l.titolo||'');

    var title = l.tipo||l.titolo||l.sport||sportLabels[cat]||'Allenamento';
    var isStrava = l.fonte==='strava'||l.source==='strava';
    var tssNum = l.tss||0;
    var tssColor = tssNum===0?'var(--t3)':tssNum<60?'var(--gn)':tssNum<100?'var(--acc-l)':tssNum<140?'var(--am)':'var(--rd)';

    html += '<div class="log-card" data-lid="'+l.id+'" onclick="openActivityModal('+JSON.stringify(l.id)+')" style="cursor:pointer">';
    html += '<button class="log-del ldel" data-lid="'+l.id+'">×</button>';
    html += '<div class="log-card-top">';
    html += '<div style="display:flex;align-items:flex-start;gap:10px">';
    html += '<div class="log-sport-icon" style="background:'+sportBg[cat]+'">'+sportIcons[cat]+'</div>';
    html += '<div class="log-card-left">';
    html += '<div class="log-card-sport">'+sportLabels[cat]+(isStrava?' · Strava':'')+'</div>';
    html += '<div class="log-card-title">'+title+'</div>';
    html += '<div class="log-card-date">'+l.data+'</div>';
    html += '</div></div>';
    if(tssNum>0) html += '<div class="log-card-tss"><div class="log-tss-num" style="color:'+tssColor+'">'+tssNum+'</div><div class="log-tss-lbl">TSS</div></div>';
    html += '</div>';
    html += '<div class="log-metrics">';
    if(l.km||l.distanza) html += '<div class="log-metric"><strong>'+(l.km?l.km+' km':l.distanza)+'</strong><span>Distanza</span></div>';
    if(l.durata) html += '<div class="log-metric"><strong>'+l.durata+'</strong><span>Durata</span></div>';
    if(l.fc) html += '<div class="log-metric"><strong>'+l.fc+' bpm</strong><span>FC media</span></div>';
    if(l.fcMax) html += '<div class="log-metric"><strong>'+l.fcMax+' bpm</strong><span>FC max</span></div>';
    if(l.passo) html += '<div class="log-metric"><strong>'+l.passo+'</strong><span>Passo</span></div>';
    if(l.power) html += '<div class="log-metric"><strong>'+l.power+'W</strong><span>Potenza</span></div>';
    if(l.elevation||l.d) html += '<div class="log-metric"><strong>'+(l.elevation||l.d)+'m</strong><span>D+</span></div>';
    html += '</div>';
    if(l.note) html += '<div class="log-card-note">'+l.note+'</div>';
    if(l.feedback) html += '<div class="log-card-fb"><div style="font-size:.55rem;color:var(--acc-l);text-transform:uppercase;letter-spacing:.7px;font-weight:600;margin-bottom:3px">Feedback coach</div>'+l.feedback+'</div>';
    html += '</div>';
  });

  el.innerHTML = html;
  el.querySelectorAll('.ldel').forEach(function(b){
    b.onclick=function(){ deleteLog(this.dataset.lid); };
  });
}
renderLogs();

// ── Activity Detail Modal ─────────────────────
var _actModalId = null;
window.openActivityModal = function(lid){
  var logs = getLogs();
  var l = logs.filter(function(x){ return String(x.id)===String(lid); })[0];
  if(!l) return;
  _actModalId = lid;
  // Fill header
  var cat=(function(s){ s=(s||'').toLowerCase(); if(/swim|nuoto/.test(s))return 'Nuoto'; if(/run|corsa|trail/.test(s))return 'Corsa'; if(/ride|bici|cycling/.test(s))return 'Ciclismo'; return l.tipo||'Allenamento'; })(l.sport||l.tipo||'');
  document.getElementById('act-modal-sport').textContent = cat + (l.fonte==='strava'?' · Strava':'');
  document.getElementById('act-modal-title').textContent = l.titolo||l.tipo||'Allenamento';
  document.getElementById('act-modal-date').textContent = l.data||'';
  // Metrics
  var m='';
  if(l.km||l.distanza) m+='<div class="log-metric"><strong>'+(l.km?l.km+' km':l.distanza)+'</strong><span>Distanza</span></div>';
  if(l.durata) m+='<div class="log-metric"><strong>'+l.durata+'</strong><span>Durata</span></div>';
  if(l.fc) m+='<div class="log-metric"><strong>'+l.fc+' bpm</strong><span>FC media</span></div>';
  if(l.fcMax) m+='<div class="log-metric"><strong>'+l.fcMax+' bpm</strong><span>FC max</span></div>';
  if(l.passo) m+='<div class="log-metric"><strong>'+l.passo+'</strong><span>Passo</span></div>';
  if(l.power) m+='<div class="log-metric"><strong>'+l.power+'W</strong><span>Potenza</span></div>';
  if(l.tss) m+='<div class="log-metric"><strong>'+l.tss+'</strong><span>TSS</span></div>';
  if(l.elevation||l.d) m+='<div class="log-metric"><strong>'+(l.elevation||l.d)+'m</strong><span>D+</span></div>';
  document.getElementById('act-modal-metrics').innerHTML = m;
  // Note
  document.getElementById('act-modal-note').value = l.note||'';
  // Splits
  var splitsDiv = document.getElementById('act-modal-splits');
  var splitsBody = document.getElementById('act-modal-splits-body');
  var splitsLoading = document.getElementById('act-modal-splits-loading');
  splitsDiv.style.display = 'none';
  splitsBody.innerHTML = '';
  splitsLoading.style.display = 'none';
  // If cached splits exist show them
  if(l.splits && l.splits.length){
    renderSplits(l.splits);
  } else if((l.fonte==='strava'||l.source==='strava') && l.stravaId){
    var serverUrl = getServerUrl();
    if(!serverUrl){
      splitsLoading.style.display='block';
      splitsLoading.textContent='Configura il Server URL nelle impostazioni per caricare gli splits.';
    } else {
      splitsLoading.style.display = 'block';
      splitsLoading.textContent = 'Caricamento splits da Strava...';
      var userId = getAthleteId() || getUserId();
      var accessToken = localStorage.getItem('stravaAccessToken') || '';
      fetch(serverUrl+'/api/strava/streams?activityId='+l.stravaId+'&athleteId='+userId+(accessToken?'&accessToken='+encodeURIComponent(accessToken):''))
        .then(function(r){ return r.json(); })
        .then(function(d){
          splitsLoading.style.display='none';
          if(d.error){
            splitsLoading.style.display='block';
            splitsLoading.textContent=d.error.indexOf('autenticat')>=0?'Sessione scaduta — riconnetti Strava.':'Errore: '+d.error;
            return;
          }
          if(d.splits && d.splits.length){
            var logs2=getLogs();
            var idx=-1; logs2.forEach(function(x,i){ if(String(x.id)===String(lid)) idx=i; });
            if(idx>=0){ logs2[idx].splits=d.splits; saveLogs(logs2); }
            renderSplits(d.splits);
          } else {
            splitsLoading.style.display='block';
            splitsLoading.textContent='Nessun split disponibile per questa attività.';
          }
        })
        .catch(function(e){ splitsLoading.style.display='block'; splitsLoading.textContent='Errore: '+e.message; });
    }
  }
  // Store for AI analysis
  _currentActivityForAI = l;
  // Reset AI panel
  var aiResult=document.getElementById('act-modal-ai-result');
  var aiBtn=document.getElementById('btn-analyze-activity');
  if(aiResult){ aiResult.style.display='none'; aiResult.innerHTML=''; }
  if(aiBtn){ aiBtn.disabled=false; aiBtn.textContent='✦ Analizza con AI'; }
  // Show modal
  document.getElementById('activity-modal').style.display='flex';
  document.getElementById('activity-modal').onclick=function(e){ if(e.target===this) closeActivityModal(); };
};

// ── Analisi AI singola attività ──────────────────────
var _currentActivityForAI = null;

function analyzeActivity(){
  var btn=document.getElementById('btn-analyze-activity');
  var result=document.getElementById('act-modal-ai-result');
  if(!_currentActivityForAI){ result.style.display='block'; result.textContent='Errore: attività non trovata.'; return; }
  var l=_currentActivityForAI;
  btn.disabled=true; btn.textContent='Analisi in corso...';
  result.style.display='block'; result.innerHTML='<span style="color:var(--t2)">Il coach sta analizzando...</span>';

  var splitsText='';
  if(l.splits&&l.splits.length){
    splitsText='\nSplits km a km: '+l.splits.map(function(s,i){
      var p=s.passo?Math.floor(s.passo/60)+':'+(s.passo%60<10?'0':'')+(s.passo%60):'—';
      return 'km'+(i+1)+' passo '+p+(s.fc?' FC'+s.fc:'')+(s.fcMax?' max'+s.fcMax:'')+(s.cadenza?' cad'+s.cadenza:'');
    }).join(', ');
  }
  var logs=getLogs().filter(function(x){return x.id!==l.id;}).slice(0,10);
  var storico=logs.map(function(x){
    return x.data+' '+(x.sport||x.tipo||'run')+' '+(x.distanza||'')+' '+(x.durata||'')+' FC'+(x.fc||'—')+' TSS'+(x.tss||0);
  }).join('\n');
  var sys='Sei un coach di endurance esperto. Rispondi sempre in italiano. Sii preciso, usa i dati numerici, non essere generico.';
  var prompt='Analizza questa attività in dettaglio:\n'+
    'Tipo: '+(l.sport||l.tipo||'corsa')+'\nData: '+(l.data||'')+'\n'+
    'Distanza: '+(l.distanza||'—')+'\nDurata: '+(l.durata||'—')+'\n'+
    'FC media: '+(l.fc||'—')+(l.fcMax?' / max '+l.fcMax:'')+' bpm\n'+
    'TSS stimato: '+(l.tss||0)+(l.elevation?' · D+'+l.elevation+'m':'')+
    (l.note&&l.note.indexOf('Da Strava')<0?'\nNote atleta: '+l.note:'')+
    splitsText+
    '\n\nStorico recente (ultime 10 sessioni):\n'+storico+
    '\n\nFornisci un\'analisi strutturata:\n'+
    '1. QUALITÀ SESSIONE: valuta intensità, distribuzione del passo, drift cardiaco dai splits\n'+
    '2. PUNTI DI FORZA: cosa ha funzionato bene\n'+
    '3. AREE DI MIGLIORAMENTO: cosa lavorare\n'+
    '4. PROSSIMA SESSIONE: consiglio specifico per il prossimo allenamento\n'+
    'Usa i numeri reali. Max 150 parole.';

  callAI([{role:'user',content:prompt}],sys,600)
    .then(function(txt){
      btn.disabled=false; btn.textContent='✦ Rianalizza';
      result.innerHTML=txt
        .replace(/\n/g,'<br>')
        .replace(/^(\d+\. [A-ZÀ-ÿ ]+:)/gm,'<strong style="color:var(--acc-l)">$1</strong>');
    })
    .catch(function(e){
      btn.disabled=false; btn.textContent='✦ Analizza con AI';
      result.textContent='Errore: '+e.message;
    });
}

function renderSplits(splits){
  var body=document.getElementById('act-modal-splits-body');
  function fmtPace(secs){
    if(!secs||secs<=0) return '—';
    var s=Math.round(secs),mm=Math.floor(s/60),ss=s%60;
    return mm+':'+(ss<10?'0':'')+ss;
  }
  function fmtDurata(secs){
    if(!secs||secs<=0) return '—';
    var s=Math.round(secs),mm=Math.floor(s/60),ss=s%60;
    return mm+"'"+(ss>0?(ss<10?'0':'')+ss+'"':'');
  }
  var paces=splits.map(function(s){return s.passo||0;}).filter(function(p){return p>0;});
  var minPace=paces.length?Math.min.apply(null,paces):0;
  var maxPace=paces.length?Math.max.apply(null,paces):1;
  var paceRange=maxPace-minPace||1;
  body.innerHTML=splits.map(function(s,i){
    var pace=s.passo||0;
    var paceColor=!pace?'var(--t3)':pace<270?'#00d68f':pace<330?'var(--acc-l)':pace<390?'#f59e0b':'#f87171';
    var fcColor=!s.fc?'var(--t3)':s.fc<140?'#00d68f':s.fc<160?'#f59e0b':'#f87171';
    var barPct=pace>0?Math.round(30+((pace-minPace)/paceRange)*70):0;
    var extra=[];
    if(s.durata) extra.push(fmtDurata(s.durata));
    if(s.cadenza) extra.push(s.cadenza+'spm');
    if(s.potenza) extra.push(s.potenza+'W');
    if(s.fcMax) extra.push('max '+s.fcMax);
    return '<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-top:1px solid var(--line)">'+
      '<div style="min-width:30px;font-size:.63rem;color:var(--t2);font-weight:600">'+(s.distanza?s.distanza+'km':'km'+(i+1))+'</div>'+
      '<div style="flex:1">'+
        '<div style="height:3px;border-radius:2px;background:var(--line);margin-bottom:5px;overflow:hidden">'+
          '<div style="height:100%;width:'+barPct+'%;background:'+paceColor+';border-radius:2px"></div>'+
        '</div>'+
        '<div style="display:flex;align-items:baseline;gap:5px">'+
          '<span style="font-size:.88rem;font-weight:700;color:'+paceColor+'">'+fmtPace(pace)+'</span>'+
          '<span style="font-size:.58rem;color:var(--t3)">/km</span>'+
          (extra.length?'<span style="font-size:.58rem;color:var(--t2);margin-left:2px">'+extra.join(' · ')+'</span>':'')+
        '</div>'+
      '</div>'+
      '<div style="min-width:40px;text-align:right">'+
        (s.fc?'<div style="font-size:.8rem;font-weight:600;color:'+fcColor+'">'+s.fc+'</div><div style="font-size:.52rem;color:var(--t3)">bpm</div>':'<div style="font-size:.72rem;color:var(--t3)">—</div>')+
      '</div>'+
    '</div>';
  }).join('');
  document.getElementById('act-modal-splits').style.display='block';
}

window.analyzeActivity = analyzeActivity;
window.saveActivityNote = function(){
  var note = document.getElementById('act-modal-note').value.trim();
  var logs = getLogs();
  var idx=-1; logs.forEach(function(x,i){ if(String(x.id)===String(_actModalId)) idx=i; });
  if(idx>=0){ logs[idx].note=note; saveLogs(logs); renderLogs(); toast('Nota salvata'); }
};

window.closeActivityModal = function(){
  document.getElementById('activity-modal').style.display='none';
};


// ── Upload ────────────────────────────────────
$('uploadZone').onclick=function(){ $('imgInput').click(); };
$('uploadZone').ondragover=function(e){ e.preventDefault(); this.classList.add('drag'); };
$('uploadZone').ondragleave=function(){ this.classList.remove('drag'); };
$('uploadZone').ondrop=function(e){ e.preventDefault(); this.classList.remove('drag'); var f=e.dataTransfer.files[0]; if(f&&f.type.startsWith('image/')) handleImg(f); };
$('imgInput').onchange=function(){ if(this.files[0]) handleImg(this.files[0]); };
function handleImg(file){ var r=new FileReader(); r.onload=function(e){ $('prevImg').src=e.target.result; $('extractPreview').style.display='block'; doExtract(e.target.result); }; r.readAsDataURL(file); }
function doExtract(dataUrl){
  $('extStatus').textContent='Analisi in corso...'; $('extTags').innerHTML=''; $('extAct').style.display='none'; $('extNoteArea').style.display='none';
  var b64=dataUrl.split(',')[1],mt=dataUrl.split(';')[0].split(':')[1];
  callAI([{role:'user',content:[{type:'image',source:{type:'base64',media_type:mt,data:b64}},{type:'text',text:'Estrai dati da questo screenshot. SOLO JSON senza markdown:\n{"data":"YYYY-MM-DD","tipo":"Corsa|Bici|Nuoto|Triathlon|Palestra|Recupero attivo","km":"","durata":"HH:MM","fc":"","tss":"","passo":"M:SS","d":"","power":""}\nVuoto se non visibile. Data default '+new Date().toISOString().split('T')[0]}]}],'',500)
    .then(function(txt){ var s=txt.indexOf('{'),e=txt.lastIndexOf('}'); extractedData=s>=0&&e>s?JSON.parse(txt.substring(s,e+1)):{}; var lbl={data:'Data',tipo:'Tipo',km:'Distanza',durata:'Durata',fc:'FC',tss:'TSS',passo:'Passo',d:'D+',power:'Potenza'},un={km:'km',fc:'bpm',d:'m',power:'W'}; $('extTags').innerHTML=Object.keys(extractedData).filter(function(k){ return extractedData[k]; }).map(function(k){ return '<span class="ext-tag"><small>'+(lbl[k]||k)+'</small>'+extractedData[k]+(un[k]?' '+un[k]:'')+'</span>'; }).join(''); $('extStatus').textContent='Dati estratti. Aggiungi note e salva.'; $('extNoteArea').style.display='block'; $('extAct').style.display='flex'; })
    .catch(function(){ $('extStatus').textContent='Errore. Usa inserimento manuale.'; });
}
$('btn-save-extract').onclick=function(){ if(!extractedData||!extractedData.tipo) return; extractedData.note=$('extNote').value.trim(); addLog(Object.assign({},extractedData)); $('extractPreview').style.display='none'; $('extNote').value=''; $('extNoteArea').style.display='none'; extractedData={}; };
$('btn-cancel-extract').onclick=function(){ $('extractPreview').style.display='none'; extractedData={}; };

// ── Coach FAB ─────────────────────────────────
$('coach-fab').onclick=toggleCoach; $('cp-close').onclick=toggleCoach;
function toggleCoach(){ coachOpen=!coachOpen; $('coach-panel').classList.toggle('open',coachOpen); if(coachOpen){ $('notif-dot').classList.remove('show'); $('cpInput').focus(); } }
function openCoachWithMsg(msg){ cpAppend('coach',msg); if(!coachOpen) $('notif-dot').classList.add('show'); else $('cp-msgs').scrollTop=$('cp-msgs').scrollHeight; }
var sugsEl=$('cp-sugs');
['Come sto questa settimana?','Rischio infortunio?','Cosa faccio domani?','Analizza ultimo allenamento'].forEach(function(s){ var b=document.createElement('button'); b.className='cp-sug'; b.textContent=s; b.onclick=function(){ $('cpInput').value=s; $('cpInput').focus(); }; sugsEl.appendChild(b); });
$('cpInput').onkeydown=function(e){ if(e.key==='Enter') cpSend(); }; $('cpSend').onclick=cpSend;
function cpSend(){ var inp=$('cpInput'),msg=inp.value.trim(); if(!msg) return; inp.value=''; cpAppend('user',msg); chatHist.push({role:'user',content:msg}); $('cpSend').disabled=true; cpTyping(); callAI(chatHist.slice(-6),buildSys(),400).then(function(r){ cpRmTyping(); chatHist.push({role:'assistant',content:r}); cpAppend('coach',r); }).catch(function(){ cpRmTyping(); cpAppend('coach','Errore di connessione.'); }).finally(function(){ $('cpSend').disabled=false; }); }
function cpAppend(role,text){ var el=$('cp-msgs'),div=document.createElement('div'); if(role==='coach'){ var ps=text.split('\n\n').filter(function(p){ return p.trim(); }).map(function(p){ return '<p>'+p.replace(/\n/g,'<br>')+'</p>'; }).join(''); div.innerHTML='<div class="cp-role">Coach</div><div class="cp-coach-b">'+ps+'</div>'; }else{ div.className='cp-user-side'; div.innerHTML='<div class="cp-role">Tu</div><div class="cp-user-b">'+text+'</div>'; } el.appendChild(div); el.scrollTop=el.scrollHeight; if(!coachOpen) $('notif-dot').classList.add('show'); }
function cpTyping(){ var el=$('cp-msgs'),d=document.createElement('div'); d.id='cpt'; d.innerHTML='<div class="cp-role">Coach</div><div class="cp-coach-b" style="color:var(--t3)">Analisi...</div>'; el.appendChild(d); el.scrollTop=el.scrollHeight; }
function cpRmTyping(){ var e=$('cpt'); if(e) e.remove(); }
// ── PMC help tooltip ─────────────────────────
(function(){
  var btn=$('pmc-help-btn'), box=$('pmc-help-box');
  if(!btn||!box) return;
  var open=false;
  btn.addEventListener('click',function(e){
    e.stopPropagation();
    open=!open;
    box.style.display=open?'block':'none';
    btn.style.background=open?'var(--acc2)':'var(--s3)';
    btn.style.borderColor=open?'var(--acc-l)':'var(--line2)';
    btn.style.color=open?'var(--acc-l)':'var(--t2)';
  });
  document.addEventListener('click',function(){ open=false; box.style.display='none'; btn.style.background='var(--s3)'; btn.style.borderColor='var(--line2)'; btn.style.color='var(--t2)'; });
})();

window.onresize=function(){ if(document.querySelector('#tab-home.active')) drawCharts(); };

// ── Mobile menu ──────────────────────────────────
(function(){
  var btn=document.getElementById('mob-menu-btn');
  var ov=document.getElementById('mob-overlay');
  var sb=document.querySelector('.sidebar');
  if(!btn||!sb) return;
  function openMenu(){ sb.classList.add('mob-open'); if(ov) ov.classList.add('show'); }
  function closeMenu(){ sb.classList.remove('mob-open'); if(ov) ov.classList.remove('show'); }
  btn.onclick=function(){ sb.classList.contains('mob-open')?closeMenu():openMenu(); };
  if(ov) ov.onclick=closeMenu;
  // Close on nav item click (always)
  sb.querySelectorAll('.sb-item').forEach(function(item){
    item.addEventListener('click',function(){ closeMenu(); });
  });
  sb.querySelectorAll('.sb-profile,.sb-settings-btn').forEach(function(item){
    item.addEventListener('click',function(){ closeMenu(); });
  });
})();


function getDefaultPrompt(){
  var p=getProfile(), goals=getGoals();
  var DN=['Lun','Mar','Mer','Gio','Ven','Sab','Dom'];
  var today=new Date();
  var discs=p.disciplines||[];
  var incl=discs.filter(function(d){return d.inc!==false;});
  var goalStr=goals.length?goals.map(function(g){return '['+g.prio+'] '+g.nome+' '+g.data;}).join(', '):'Nessuno';
  var params='ritmo soglia '+(p.ritmo||'4:30')+'/km | FTP '+(p.ftp||'220')+'W | FC soglia '+(p.fcsoglia||'170')+'bpm';
  var allDow=[];
  incl.forEach(function(d){ (d.giorni||[]).forEach(function(g){ var idx=DN.indexOf(g); if(idx>=0&&allDow.indexOf(idx)<0) allDow.push(idx); }); });
  var todayDow=(today.getDay()+6)%7, skip=0;
  for(var di=0;di<7;di++){ if(allDow.indexOf((todayDow+di)%7)>=0){ skip=di; break; } }
  var startDate=new Date(today); startDate.setDate(today.getDate()+skip);
  var pg=goals.filter(function(g){return g.prio==='A';}).sort(function(a,b){return new Date(a.data)-new Date(b.data);})[0]||goals[0];
  var totalDays=pg?Math.max(14,Math.ceil((new Date(pg.data)-startDate)/86400000)):56;
  var allDays=[];
  for(var di=0;di<totalDays;di++){
    var d2=new Date(startDate); d2.setDate(startDate.getDate()+di);
    var dow=(d2.getDay()+6)%7;
    var sports=[];
    incl.forEach(function(d){ if((d.giorni||[]).indexOf(DN[dow])>=0) sports.push(d.sport); });
    allDays.push(d2.toISOString().split('T')[0]+'|'+DN[dow]+'|'+(sports.length?sports.join('+'):'Riposo'));
  }
  var prompt='Genera piano di allenamento. Per ogni giorno ti fornisco la data e la disciplina.\n\n';
  prompt+='GIORNI (data|giorno|sport, Riposo=riposo obbligatorio):\n';
  prompt+=allDays.join('\n');
  prompt+='\n\nOBIETTIVI: '+goalStr+'\n';
  prompt+='ATLETA: '+params+'\n\n';
  prompt+='Progressione su '+(pg?Math.round(totalDays/7):8)+' settimane con tapering finale.\n\n';
  if(pg){
    prompt+='IMPORTANTE: l\'ULTIMO giorno del piano ('+pg.data+') È IL GIORNO DI GARA: '+pg.nome+'.\n';
    prompt+='Quel giorno usa: tipo="gara", titolo="GARA: '+pg.nome+'", tss appropriato per la distanza, descrizione con istruzioni pre-gara (colazione, riscaldamento, strategia di gara).\n';
    prompt+='Il giorno prima della gara deve essere riposo o scarico leggero (tss max 30).\n\n';
  }
  prompt+='Rispondi SOLO con array JSON grezzo (no markdown, no testo prima o dopo). Formato ogni giorno:\n';
  prompt+='[{"data":"YYYY-MM-DD","titolo":"str","disciplina":"Corsa","tipo":"volume","distanza":"10 km","durata":"50 min","tss":60,"zone":["Z2"],"obiettivo":"str","descrizione":"str","blocchi":[{"tipo":"warmup","testo":"2 km Z1"},{"tipo":"main","testo":"6 km Z2"},{"tipo":"cooldown","testo":"2 km Z1"}]}]\n';
  prompt+='Riposo: {"data":"YYYY-MM-DD","titolo":"Riposo","disciplina":"Riposo","tipo":"riposo","distanza":"","durata":"","tss":0,"zone":[],"obiettivo":"","descrizione":"","blocchi":[]}\n';
  prompt+='Gara: {"data":"YYYY-MM-DD","titolo":"GARA: nome","disciplina":"Corsa","tipo":"gara","distanza":"42.2 km","durata":"3:30","tss":280,"zone":["Z4","Z5"],"obiettivo":"Completare sub 3:30","descrizione":"Colazione 3h prima: riso/pasta. Riscaldamento 10 min. Parti conservativo nei primi 10 km.","blocchi":[{"tipo":"warmup","testo":"10 min riscaldamento"},{"tipo":"main","testo":"Gara completa — attacca il target"},{"tipo":"cooldown","testo":"Defaticamento + stretching"}]}';
  return prompt;
}

function showCoachReport(session){
  var data=new Date().toLocaleDateString('it-IT',{day:'numeric',month:'long'});
  var report={titolo:session.titolo||'Allenamento',data:data,read:false,analisi:'Analisi in corso...',
    stats:[{val:session.distanza||'—',lbl:'distanza'},{val:session.durata||'—',lbl:'durata'},{val:String(session.tss||0),lbl:'TSS'}]};
  localStorage.setItem('lastCoachReport',JSON.stringify(report));
  if($('notif-dot')) $('notif-dot').classList.add('show');
  renderHome();
  // Genera analisi AI
  var logs=getLogs().slice(0,14);
  var splitsText='';
  if(session.splits&&session.splits.length){
    splitsText='\nSplits km: '+session.splits.map(function(s,i){
      var p=s.passo?Math.floor(s.passo/60)+':'+(s.passo%60<10?'0':'')+(s.passo%60):'—';
      return 'km'+(i+1)+' '+p+(s.fc?' FC'+s.fc:'');
    }).join(', ');
  }
  var storico=logs.filter(function(l){return l.id!==session.id;}).slice(0,7).map(function(l){
    return l.data+' '+( l.sport||l.tipo||'run')+' '+(l.distanza||'')+' '+(l.durata||'')+' FC'+(l.fc||'—')+' TSS'+(l.tss||0);
  }).join('\n');
  var sys='Sei un coach di endurance esperto. Rispondi sempre in italiano. Sii diretto, concreto, usa dati numerici.';
  var prompt='Attività appena completata:\n'+
    'Tipo: '+(session.sport||session.tipo||'corsa')+'\n'+
    'Distanza: '+(session.distanza||'—')+'\nDurata: '+(session.durata||'—')+'\n'+
    'FC media: '+(session.fc||'—')+' bpm\nTSS: '+(session.tss||0)+
    splitsText+
    '\n\nUltime attività (storico):\n'+storico+
    '\n\nScrivi un\'analisi strutturata in 3 parti:\n'+
    '1. SINTESI: cosa è andato bene/male in questa sessione (2-3 frasi)\n'+
    '2. TREND: cosa emerge dallo storico recente (1-2 frasi)\n'+
    '3. CONSIGLIO: cosa fare nei prossimi 2-3 giorni (1-2 frasi)\n'+
    'Usa i dati numerici. Sii diretto. Max 120 parole totali.';
  callAI([{role:'user',content:prompt}],sys,500)
    .then(function(txt){
      report.analisi=txt;
      localStorage.setItem('lastCoachReport',JSON.stringify(report));
      var cb=$('cr-body'); if(cb) cb.innerHTML=txt.replace(/\n/g,'<br>').replace(/^(\d+\. [A-Z]+:)/gm,'<strong>$1</strong>');
    })
    .catch(function(e){ report.analisi='Analisi non disponibile: '+e.message; localStorage.setItem('lastCoachReport',JSON.stringify(report)); var cb=$('cr-body'); if(cb) cb.textContent=report.analisi; });
}


// ── CALCOLATORE LIVE ──────────────────────────────────
var _cDist = 21.0975;

function _fmtTime(s) {
  s = Math.round(s);
  var h = Math.floor(s/3600), m = Math.floor((s%3600)/60), ss = s%60;
  return h > 0
    ? h + ':' + (m<10?'0':'') + m + ':' + (ss<10?'0':'') + ss
    : m + ':' + (ss<10?'0':'') + ss;
}
function _fmtPace(s) {
  s = Math.round(s);
  return Math.floor(s/60) + ':' + (s%60 < 10 ? '0' : '') + s%60;
}
function _parseTime(str) {
  var raw = str.replace(/\D/g, '');
  if (!raw) return 0;
  if (raw.length <= 2) return parseInt(raw, 10) * 60;
  if (raw.length <= 4) return parseInt(raw.slice(0,2), 10)*3600 + parseInt(raw.slice(2), 10)*60;
  return parseInt(raw.slice(0,2),10)*3600 + parseInt(raw.slice(2,4),10)*60 + parseInt(raw.slice(4),10);
}
function _parsePace(str) {
  var raw = str.replace(/\D/g, '');
  if (!raw) return 0;
  if (raw.length <= 2) return parseInt(raw, 10) * 60;
  return parseInt(raw.slice(0,2), 10)*60 + parseInt(raw.slice(2), 10);
}
function _autoFmtTime(str) {
  var raw = str.replace(/\D/g, '').slice(0, 6);
  if (raw.length <= 2) return raw;
  if (raw.length <= 4) return raw.slice(0,2) + ':' + raw.slice(2);
  return raw.slice(0,2) + ':' + raw.slice(2,4) + ':' + raw.slice(4);
}
function _autoFmtPace(str) {
  var raw = str.replace(/\D/g, '').slice(0, 4);
  if (raw.length <= 2) return raw;
  return raw.slice(0,2) + ':' + raw.slice(2);
}
function _getDist() {
  if (_cDist === 'custom') {
    var v = parseFloat(($('calc-custom-km') || {}).value || '0');
    return v > 0 ? v : 0;
  }
  return _cDist;
}
function _showCalcResult(tSec, pSec) {
  var ROWS = [
    {l:'1 km', km:1}, {l:'5 km', km:5}, {l:'10 km', km:10},
    {l:'21.1 km', km:21.0975}, {l:'30 km', km:30}, {l:'42.2 km', km:42.195}
  ];
  var rb = $('calc-result'), pt = $('calc-pace-table'), body = $('calc-pt-body');
  if (rb) rb.style.display = 'block';
  if ($('calc-res-tempo')) $('calc-res-tempo').textContent = _fmtTime(tSec);
  if ($('calc-res-ritmo')) $('calc-res-ritmo').textContent = _fmtPace(pSec) + ' /km';
  if ($('calc-res-kmh')) $('calc-res-kmh').textContent = (3600/pSec).toFixed(1);
  if (pt) pt.style.display = 'block';
  if (body) {
    var active = _getDist();
    var html = '';
    ROWS.forEach(function(d) {
      var t = _fmtTime(pSec * d.km);
      var hi = Math.abs(d.km - active) < 0.1;
      html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;padding:6px 12px;font-size:.71rem;border-bottom:1px solid var(--line)' + (hi ? ';background:var(--acc3);color:var(--acc-l)' : '') + '">';
      html += '<span>' + d.l + '</span><span>' + (hi ? '<strong>' + t + '</strong>' : t) + '</span><span>' + (3600/pSec).toFixed(1) + '</span></div>';
    });
    body.innerHTML = html;
  }
}
function _calcFromTime() {
  var dist = _getDist(); if (!dist) return;
  var tEl = $('calc-time'), pEl = $('calc-pace'); if (!tEl || !pEl) return;
  var tSec = _parseTime(tEl.value); if (!tSec) return;
  var pSec = tSec / dist;
  pEl.value = _fmtPace(pSec);
  _showCalcResult(tSec, pSec);
}
function _calcFromPace() {
  var dist = _getDist(); if (!dist) return;
  var tEl = $('calc-time'), pEl = $('calc-pace'); if (!tEl || !pEl) return;
  var pSec = _parsePace(pEl.value); if (!pSec) return;
  var tSec = pSec * dist;
  tEl.value = _fmtTime(tSec);
  _showCalcResult(tSec, pSec);
}
(function() {
  var tEl = $('calc-time'), pEl = $('calc-pace');
  if (tEl) {
    tEl.addEventListener('input', function() {
      var raw = tEl.value.replace(/\D/g, '');
      tEl.value = _autoFmtTime(raw);
      _calcFromTime();
    });
    tEl.addEventListener('keydown', function(e) {
      if (e.key === 'Backspace' && tEl.value.slice(-1) === ':') {
        e.preventDefault();
        tEl.value = tEl.value.slice(0, -2);
        _calcFromTime();
      }
    });
  }
  if (pEl) {
    pEl.addEventListener('input', function() {
      var raw = pEl.value.replace(/\D/g, '');
      pEl.value = _autoFmtPace(raw);
      _calcFromPace();
    });
    pEl.addEventListener('keydown', function(e) {
      if (e.key === 'Backspace' && pEl.value.slice(-1) === ':') {
        e.preventDefault();
        pEl.value = pEl.value.slice(0, -2);
        _calcFromPace();
      }
    });
  }
  var btns = document.querySelectorAll('.calc-db');
  btns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      btns.forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      var ck = $('calc-custom-km');
      if (btn.dataset.km === 'custom') {
        _cDist = 'custom';
        if (ck) { ck.style.display = 'inline-block'; ck.focus(); }
      } else {
        _cDist = parseFloat(btn.dataset.km);
        if (ck) ck.style.display = 'none';
      }
      if (tEl && tEl.value) _calcFromTime();
      else if (pEl && pEl.value) _calcFromPace();
    });
  });
  var ck = $('calc-custom-km');
  if (ck) ck.addEventListener('input', function() {
    if (tEl && tEl.value) _calcFromTime();
    else if (pEl && pEl.value) _calcFromPace();
  });
})();


// ── TIPO SUGGEST ──────────────────────────────────────
function updateTipoSuggest(){
  var sel=$('l-tipo'); if(!sel) return;
  var val=sel.value;
  var cw=$('tipo-custom-wrap'); if(cw) cw.style.display=val==='Personalizzato'?'block':'none';
  var p=getProfile();
  var ritmo=p.ritmo||'4:30';
  var ftp=parseInt(p.ftp||'220',10);
  var rParts=ritmo.split(':');
  var rSec=parseInt(rParts[0],10)*60+parseInt(rParts[1]||'0',10);
  var rFacile=_fmtPace(rSec+60);
  var rZ2=_fmtPace(rSec+40);
  var rZ3=_fmtPace(rSec+15);
  var rZ5=_fmtPace(rSec-20);
  var suggestions={
    'Corsa facile':'Corsa rigenerante in Z1-Z2. Ritmo consigliato: '+rFacile+'-'+rZ2+' /km. Conversazione fluida per tutta la durata. Ideale per giorni di recupero o volumi bassi.',
    'Lungo':'Uscita lunga in Z2, fondamentale per la base aerobica. Ritmo: '+rZ2+'-'+rZ3+' /km. Non andare piu veloce. Obiettivo: tempo in piedi, non il ritmo.',
    'Progressivo':'Parti lento ('+rFacile+' /km) e aumenta gradualmente. Ultimi 2-3 km al ritmo soglia ('+ritmo+' /km). Ottimo per imparare a correre stanchi.',
    'Ripetute':'Intervalli ad alta intensita. Esempio: 6x1km a '+rZ5+' /km rec 2min, oppure 10x400m a ritmo gara 5km. Riscaldamento 2km + defaticamento 2km obbligatori.',
    'Tempo run':'Corsa continuata al ritmo soglia: '+ritmo+' /km. Durata: 20-40 minuti. Riscaldamento 10-15 min, defaticamento 10 min. Sessione chiave per la soglia.',
    'Fartlek':'Gioco di velocita. Alterna 1-3 min veloci ('+rZ5+' /km) a 2-4 min lenti ('+rFacile+' /km) senza struttura rigida.',
    'Collinare':'Salite 6-8%: 8x1min in Z4-Z5, rec discesa. Forza e resistenza specifica. Ritmo pianura equivalente: '+ritmo+' /km.',
    'Bici Z2':'Pedalata in Z2 al '+Math.round(ftp*0.60)+'-'+Math.round(ftp*0.75)+'W (60-75% FTP '+ftp+'W). Frequenza 85-95 rpm.',
    'Bici intervalli':'5x5min a '+Math.round(ftp*0.95)+'-'+Math.round(ftp*1.05)+'W (95-105% FTP) rec 5min. Oppure 2x20min a '+Math.round(ftp*0.85)+'W.',
    'Nuoto':'Riscaldamento 400m, 10x100m con rec 15s, defaticamento 200m. Focus su efficienza della bracciata.',
    'Palestra':'Forza funzionale. Priorita: core, glutei, caviglie. Stacchi rumeni, split squat, step-up, plank 3x45s.',
    'Recupero attivo':'Movimento leggero. Corsa a '+rFacile+' /km o piu lento. Max 45 min. Oppure bici scarica o nuoto tecnico.',
    'Personalizzato':'Inserisci la descrizione nel campo qui sopra.'
  };
  var box=$('tipo-suggest-box'),txt=$('tipo-suggest-text');
  if(!box||!txt) return;
  if(suggestions[val]){ box.style.display='block'; txt.textContent=suggestions[val]; }
  else box.style.display='none';
}
(function(){ if($('l-tipo')){ $('l-tipo').onchange=updateTipoSuggest; updateTipoSuggest(); } })();




})();