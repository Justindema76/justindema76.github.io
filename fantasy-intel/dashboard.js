(() => {
  'use strict';

  const SB='https://bbodmhffnqebhfksjier.supabase.co';
  const KEY='sb_publishable_L048cgw2gZwCeWmSWpUclA_cuKCSyQn';
  const H={apikey:KEY,Authorization:`Bearer ${KEY}`};
  const LEAGUE='497223';
  const LEAGUE_KEY='battle-of-the-kings-2026';
  const ACTIONS=new Set(['START','SIT','ADD','DROP','UPGRADE','DOWNGRADE','AVOID','HANDCUFF','STACK','DEFENSE','KICKER']);
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=v=>String(v||'').toLowerCase().normalize('NFKD').replace(/[’']/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\b(jr|sr|ii|iii|iv)\b/g,' ').replace(/\s+/g,' ').trim();
  const state={teamKey:'',teams:[],rosters:[],matchups:[],planner:[],intel:[],view:'team',filter:'all',teamQuery:'',leagueQuery:'',week:1};

  async function api(path){
    const r=await fetch(`${SB}/rest/v1/${path}`,{headers:H,cache:'no-store'});
    if(!r.ok)throw new Error(await r.text()||String(r.status));
    return r.json();
  }

  function resolveTeam(){
    const q=new URLSearchParams(location.search).get('team');
    if(q){state.teamKey=String(q);localStorage.setItem(`fantasyIntelTeam:${LEAGUE}`,state.teamKey)}
    else state.teamKey=localStorage.getItem(`fantasyIntelTeam:${LEAGUE}`)||'';
  }
  const myTeam=()=>state.teams.find(t=>String(t.yahoo_team_key||'')===state.teamKey)||null;
  const isMine=t=>String(t?.yahoo_team_key||'')===state.teamKey;
  const rosterFor=t=>state.rosters.filter(r=>r.league_team_id===t?.id);
  const slotWeight=s=>({QB:1,RB:2,WR:3,TE:4,'W/R/T':5,'W/R':5,K:6,DEF:7,BN:8,IR:9,'IR+':9,NA:10}[String(s||'').toUpperCase()]||20);

  function setSync(mode,label,time){
    $('syncDot').className=mode==='live'?'live':mode==='error'?'error':'';
    $('syncLabel').textContent=label;
    $('syncTime').textContent=time?`Updated ${new Date(time).toLocaleString()}`:'';
  }
  function showNotice(msg){$('dashboardNotice').hidden=!msg;$('dashboardNotice').textContent=msg||''}

  function createTeamPicker(){
    let select=document.getElementById('teamSelect');
    if(!select){
      select=document.createElement('select');select.id='teamSelect';select.title='Choose your Yahoo team';
      Object.assign(select.style,{background:'var(--panel)',color:'var(--text)',border:'1px solid var(--line)',borderRadius:'10px',padding:'10px 12px',fontWeight:'800'});
      document.querySelector('.header-actions').prepend(select);
      select.addEventListener('change',()=>{const u=new URL(location.href);u.searchParams.set('team',select.value);location.href=u.toString()});
    }
    select.innerHTML='<option value="">CHOOSE TEAM</option>'+state.teams.map(t=>`<option value="${esc(t.yahoo_team_key)}" ${String(t.yahoo_team_key)===state.teamKey?'selected':''}>${esc(t.team_name)}</option>`).join('');
  }

  function intelFor(row){
    const nk=norm(row.player_key||row.yahoo_player_name);
    const nn=norm(row.yahoo_player_name);
    return state.intel.filter(i=>norm(i.player_key||i.player_name)===nk||norm(i.player_name)===nn).sort((a,b)=>new Date(b.updated_at||b.last_checked_at||0)-new Date(a.updated_at||a.last_checked_at||0));
  }
  function plannerFor(row){
    const nk=norm(row.player_key||row.yahoo_player_name);
    return state.planner.find(p=>norm(p.player_key||p.player_name)===nk)||null;
  }
  function tagsFor(row){
    const p=plannerFor(row),items=intelFor(row),tags=[];
    if(items[0]?.action)tags.push(String(items[0].action).toUpperCase());
    for(const t of p?.tags||[])tags.push(String(t).toUpperCase());
    for(const i of items)for(const t of i.tags||[])tags.push(String(t).toUpperCase());
    return [...new Set(tags)];
  }
  const isInjury=row=>intelFor(row).some(i=>i.injury_related)||tagsFor(row).includes('INJURY');
  const needsAction=row=>tagsFor(row).some(t=>ACTIONS.has(t));
  const isMonitor=row=>tagsFor(row).includes('MONITOR');

  async function load(){
    resolveTeam();setSync('loading','LOADING');showNotice('');
    try{
      const [teams,rosters,matchups,planner,intel]=await Promise.all([
        api(`fantasy_league_teams?select=*&league_key=eq.${LEAGUE_KEY}&active=eq.true&order=yahoo_team_key.asc`),
        api('fantasy_league_rosters?select=*&active=eq.true&order=roster_slot.asc,yahoo_player_name.asc'),
        api(`fantasy_league_matchups?select=*&league_key=eq.${LEAGUE_KEY}&order=week.asc,matchup_key.asc`),
        api('planner_player_tags?select=player_key,player_name,tags,reason,last_confirmed_date,updated_at'),
        api('intel_items?select=player_key,player_name,action,priority,what_changed,recommendation,next_trigger,source_note,injury_related,tags,last_checked_at,last_confirmed_date,updated_at&resolved_at=is.null&order=updated_at.desc')
      ]);
      state.teams=teams||[];
      const ids=new Set(state.teams.map(t=>t.id));
      state.rosters=(rosters||[]).filter(r=>ids.has(r.league_team_id));
      state.matchups=matchups||[];state.planner=planner||[];state.intel=intel||[];
      createTeamPicker();renderAll();
      const t=myTeam();
      $('teamTitle').textContent=t?.team_name||'Choose Your Team';
      $('identityLabel').textContent=t?`${t.team_name} · Yahoo Team ${t.yahoo_team_key}`:'Select your Yahoo team above';
      if(!t)showNotice('Choose your Yahoo team from the selector. The link will remember it on this browser.');
      const last=[...state.teams.map(x=>x.last_synced_at),...state.rosters.map(x=>x.last_synced_at),...state.intel.map(x=>x.updated_at||x.last_checked_at)].filter(Boolean).sort().at(-1);
      setSync('live','LIVE DATA',last);
    }catch(e){console.error(e);setSync('error','ERROR');showNotice(`DATA ERROR: ${e.message}`)}
  }

  function renderAll(){renderSummary();renderMyTeam();renderWeekPicker();renderMatchups();renderLeague()}
  function renderSummary(){
    const rows=myTeam()?rosterFor(myTeam()):[];
    $('myRosterCount').textContent=rows.length;
    $('myIntelCount').textContent=rows.reduce((n,r)=>n+intelFor(r).length,0);
    $('myActionCount').textContent=rows.filter(needsAction).length;
    $('myInjuryCount').textContent=rows.filter(isInjury).length;
    $('teamCount').textContent=state.teams.length;$('rosterCount').textContent=state.rosters.length;$('matchedCount').textContent=state.rosters.filter(r=>r.player_key).length;$('unmatchedCount').textContent=state.rosters.filter(r=>!r.player_key).length;
  }
  function tagClass(t){return String(t||'').toLowerCase().replace(/[^a-z0-9]+/g,'-')}
  function linkify(v){return esc(v||'').replace(/(https?:\/\/[^\s&<]+)/g,'<a href="$1" target="_blank" rel="noopener">$1</a>')}
  function intelItem(i){
    const stamp=i.last_checked_at||i.updated_at||i.last_confirmed_date;
    return `<div class="intel-item"><div class="intel-item-top"><b>${esc(i.action||'MONITOR')}</b><span>${esc(i.priority||'')}</span></div>${i.what_changed?`<p class="what-changed">${esc(i.what_changed)}</p>`:''}${i.recommendation?`<p class="what-to-do"><b>WHAT TO DO:</b> ${esc(i.recommendation)}</p>`:''}${i.next_trigger?`<p class="what-changed"><b>NEXT TRIGGER:</b> ${esc(i.next_trigger)}</p>`:''}${i.source_note?`<div class="intel-source"><b>SOURCE:</b> ${linkify(i.source_note)}</div>`:''}${stamp?`<small class="checked">Checked ${esc(new Date(stamp).toLocaleString())}</small>`:''}</div>`;
  }
  function rowMatchesTeamFilter(r){
    if(state.filter==='action'&&!needsAction(r))return false;if(state.filter==='injury'&&!isInjury(r))return false;if(state.filter==='monitor'&&!isMonitor(r))return false;
    if(!state.teamQuery)return true;
    return [r.yahoo_player_name,r.nfl_team,r.position,r.roster_slot,...tagsFor(r),...intelFor(r).flatMap(i=>[i.what_changed,i.recommendation])].join(' ').toLowerCase().includes(state.teamQuery);
  }
  function playerCard(r){
    const items=intelFor(r),tags=tagsFor(r).slice(0,6),p=plannerFor(r);
    return `<article class="intel-card ${isInjury(r)?'injury-card':''} ${needsAction(r)?'action-card':''}"><header class="intel-card-head"><div class="position-box">${esc(r.position||'—')}</div><div class="player-title"><h3>${esc(r.yahoo_player_name)}</h3><p>${esc(r.position||'—')} · ${esc(r.nfl_team||'FA')}</p></div><span class="slot-badge">${esc(r.roster_slot||'ROSTER')}</span></header>${tags.length?`<div class="tag-strip">${tags.map(t=>`<span class="tag ${tagClass(t)}">${esc(t)}</span>`).join('')}</div>`:''}${items.length?`<div class="intel-body">${items.map(intelItem).join('')}</div>`:`<div class="no-intel">${esc(p?.reason||'No material Intel change is currently logged for this player.')}</div>`}</article>`;
  }
  function renderMyTeam(){
    const t=myTeam();if(!t){$('teamMeta').textContent='Choose your team first.';$('myTeamIntel').innerHTML='<div class="empty-state">Choose your team above.</div>';return}
    const all=[...rosterFor(t)].sort((a,b)=>slotWeight(a.roster_slot)-slotWeight(b.roster_slot)||String(a.yahoo_player_name).localeCompare(String(b.yahoo_player_name)));
    const rows=all.filter(rowMatchesTeamFilter);$('teamMeta').textContent=`${all.length} roster players · ${all.reduce((n,r)=>n+intelFor(r).length,0)} current Intel items`;$('myTeamIntel').innerHTML=rows.map(playerCard).join('')||'<div class="empty-state">No players match this filter.</div>';
  }

  function renderWeekPicker(){const b=[`<button data-week="all" class="${state.week==='all'?'active':''}">ALL WEEKS</button>`];for(let w=1;w<=18;w++)b.push(`<button data-week="${w}" class="${state.week===w?'active':''}">W${w}</button>`);$('weekPicker').innerHTML=b.join('');$('weekPicker').querySelectorAll('button').forEach(x=>x.onclick=()=>{state.week=x.dataset.week==='all'?'all':Number(x.dataset.week);renderWeekPicker();renderMatchups()})}
  function score(p,proj){if(p!==null&&p!==undefined&&Number(p)!==0)return Number(p).toFixed(2);if(proj!==null&&proj!==undefined)return `Proj ${Number(proj).toFixed(2)}`;return ''}
  function matchupCard(m){const a=String(m.team_a_yahoo_key)===state.teamKey,b=String(m.team_b_yahoo_key)===state.teamKey;return `<article class="matchup-card ${a||b?'mine':''}"><div class="matchup-team ${a?'you':''}"><span>${esc(m.team_a_name)}${a?' · YOU':''}</span><span>${esc(score(m.team_a_points,m.team_a_projected))}</span></div><div class="vs">VS</div><div class="matchup-team ${b?'you':''}"><span>${esc(m.team_b_name)}${b?' · YOU':''}</span><span>${esc(score(m.team_b_points,m.team_b_projected))}</span></div>${m.status?`<div class="matchup-meta">${esc(m.status)}</div>`:''}</article>`}
  function renderMatchups(){
    const mine=state.matchups.filter(m=>String(m.team_a_yahoo_key)===state.teamKey||String(m.team_b_yahoo_key)===state.teamKey);const ms=state.week==='all'?mine:mine.filter(m=>Number(m.week)===Number(state.week));$('mySchedule').innerHTML=ms.length?ms.map(m=>`<article class="my-matchup-card"><h3>Week ${m.week}</h3>${matchupCard(m)}</article>`).join(''):'<div class="empty-schedule">No matchup saved for your team in this view yet.</div>';
    if(!state.matchups.length){$('matchups').innerHTML='<div class="empty-schedule">No weekly matchup schedule is saved yet.</div>';return}const weeks=state.week==='all'?[...new Set(state.matchups.map(m=>Number(m.week)))].sort((a,b)=>a-b):[state.week];$('matchups').innerHTML=weeks.map(w=>{const rows=state.matchups.filter(m=>Number(m.week)===Number(w));return `<section class="week-block"><h3>Week ${w} · ${rows.length} matchups</h3><div class="matchup-grid">${rows.map(matchupCard).join('')}</div></section>`}).join('')
  }

  function leaguePlayer(r){const i=intelFor(r)[0],a=i?.action||'';return `<div class="player-row"><span class="slot">${esc(r.roster_slot||'—')}</span><div><div class="player-name">${esc(r.yahoo_player_name)}</div><div class="player-meta">${esc(r.position||'—')} · ${esc(r.nfl_team||'—')}</div></div><div>${a?`<span class="mini-tag ${tagClass(a)}">${esc(a)}</span>`:''}${!r.player_key?'<span class="unmatched"> UNMATCHED</span>':''}</div></div>`}
  function renderLeague(){const ordered=[...state.teams].sort((a,b)=>(Number(isMine(b))-Number(isMine(a)))||Number(a.yahoo_team_key)-Number(b.yahoo_team_key));const cards=[];for(const t of ordered){const all=[...rosterFor(t)].sort((a,b)=>slotWeight(a.roster_slot)-slotWeight(b.roster_slot)||String(a.yahoo_player_name).localeCompare(String(b.yahoo_player_name)));const rows=state.leagueQuery?all.filter(r=>[t.team_name,r.yahoo_player_name,r.nfl_team,r.position].join(' ').toLowerCase().includes(state.leagueQuery)):all;if(state.leagueQuery&&!rows.length&&!t.team_name.toLowerCase().includes(state.leagueQuery))continue;cards.push(`<section class="team-card ${isMine(t)?'my-team':''}"><header class="team-head"><div class="team-title"><h3>${esc(t.team_name)}${isMine(t)?' · YOUR TEAM':''}</h3><p>Yahoo Team ${esc(t.yahoo_team_key)}</p></div><b>${all.length}</b></header><div class="roster">${(rows.length?rows:all).map(leaguePlayer).join('')}</div></section>`)}$('teams').innerHTML=cards.join('')||'<div class="empty-state">No league results.</div>'}

  function setView(v){state.view=v;document.querySelectorAll('.view').forEach(x=>x.classList.toggle('active',x.id===`${v}View`));document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view===v));localStorage.setItem('fantasyIntelView',v);window.scrollTo({top:0,behavior:'smooth'})}
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
  $('intelFilters').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{state.filter=b.dataset.filter;$('intelFilters').querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));renderMyTeam()}));
  $('teamSearch').addEventListener('input',e=>{state.teamQuery=e.target.value.trim().toLowerCase();renderMyTeam()});$('leagueSearch').addEventListener('input',e=>{state.leagueQuery=e.target.value.trim().toLowerCase();renderLeague()});$('refreshButton').addEventListener('click',load);$('openYahooButton').addEventListener('click',()=>window.open(state.teamKey?`https://football.fantasysports.yahoo.com/f1/${LEAGUE}/${state.teamKey}`:`https://football.fantasysports.yahoo.com/f1/${LEAGUE}`,'_blank'));
  $('themeButton').addEventListener('click',()=>{document.documentElement.classList.toggle('light');$('themeButton').textContent=document.documentElement.classList.contains('light')?'🌙':'☀️';localStorage.setItem('fantasyLeagueTheme',document.documentElement.classList.contains('light')?'light':'dark')});if(localStorage.getItem('fantasyLeagueTheme')==='light'){document.documentElement.classList.add('light');$('themeButton').textContent='🌙'}const saved=localStorage.getItem('fantasyIntelView');setView(['team','matchups','league'].includes(saved)?saved:'team');load();setInterval(()=>{if(!document.hidden)load()},60000);
})();
