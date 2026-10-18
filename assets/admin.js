import {$,api,clock} from './shared.js';
let token=sessionStorage.getItem('mask-stage-admin-token')||'';
let rounds=[],currentId=null,count={A:0,B:0,total:0},serverOffset=0,currentEnd=null,loginShowing=!token,busy=false;
function message(v){$('adminMessage').textContent=v;}
function loggedIn(yes){$('loginPanel').hidden=yes;$('controlPanel').hidden=!yes;}
function selected(){return rounds.find(r=>r.id===Number($('roundSelect').value));}
function fillForm(){let r=selected();if(!r)return;
  $('roundTitle').value=r.title;$('editA').value=r.option_a;$('editB').value=r.option_b;
  $('saveRound').disabled=r.status!=='ready';
}
function currentPhase(r){return r.status==='open' && r.ends_at_ms <= Date.now()-serverOffset?'closed':r.status;}
function adminTimer(){const r=rounds.find(x=>x.id===currentId);
  $('adminCountdown').textContent=r?.status==='open'?clock((r.ends_at_ms||0)-Date.now()+serverOffset):'--:--';
}
function paint(data){
  rounds=data.rows;currentId=data.currentId;count=data.currentCount;serverOffset=Date.now()-data.serverTime;
  const sel=$('roundSelect'),previous=sel.value;
  sel.textContent='';
  for(const r of rounds){let option=document.createElement('option');option.value=String(r.id);option.textContent=`${r.title} · ${r.status==='ready'?'준비':r.status==='open'?'진행':r.status==='closed'?'마감':'공개'}`;sel.append(option);}
  if(rounds.some(r=>String(r.id)===previous)) sel.value=previous;else sel.value=String(currentId || rounds[0]?.id || 1);
  if(document.activeElement!==$('roundTitle')&&document.activeElement!==$('editA')&&document.activeElement!==$('editB')) fillForm();
  let r=rounds.find(x=>x.id===currentId);
  $('activeRound').textContent=r?.title||'-';
  $('adminStatus').textContent=r?({ready:'시작 대기',open:'진행 중',closed:'마감',revealed:'결과 공개'}[currentPhase(r)]):'준비';
  $('votesTotal').textContent=Number(count.total).toLocaleString();$('adminA').textContent=Number(count.A).toLocaleString();$('adminB').textContent=Number(count.B).toLocaleString();
  adminTimer();
  $('startRound').disabled=selected()?.status!=='ready';
  $('closeRound').disabled=!(r?.status==='open' && Number(sel.value)===currentId);
  $('revealRound').disabled=!(currentPhase(r)==='closed' && Number(sel.value)===currentId);
}
async function refresh(){if(!token || busy || document.hidden)return;
  try{paint(await api('/api/admin/rounds',{token}));if(!loginShowing)message('');}
  catch(e){message(e.message);if(e.message.includes('인증')){token='';sessionStorage.removeItem('mask-stage-admin-token');loggedIn(false);}}
}
async function act(action,data){if(busy)return;busy=true;message('처리 중…');
  try{await api(`/api/admin/${action}`,{method:'POST',token,data});message('정상 처리되었습니다.');await refreshAfterAction();}
  catch(e){message(e.message);}
  finally{busy=false;}
}
async function refreshAfterAction(){const selectedId=$('roundSelect').value;const data=await api('/api/admin/rounds',{token});paint(data);$('roundSelect').value=selectedId;fillForm();}
$('login').addEventListener('click',async()=>{
  const attempt=$('adminToken').value.trim();if(!attempt)return message('관리자 비밀키를 입력해주세요.');
  try{const data=await api('/api/admin/rounds',{token:attempt});token=attempt;sessionStorage.setItem('mask-stage-admin-token',token);loggedIn(true);loginShowing=false;paint(data);message('');$('adminToken').value='';}
  catch(e){message(e.message);}
});
$('adminToken').addEventListener('keydown',e=>{if(e.key==='Enter')$('login').click()});
$('logout').addEventListener('click',()=>{sessionStorage.removeItem('mask-stage-admin-token');token='';loggedIn(false);message('로그아웃되었습니다.');});
$('roundSelect').addEventListener('change',()=>{fillForm();const r=selected(),live=rounds.find(x=>x.id===currentId);$('startRound').disabled=r?.status!=='ready';$('closeRound').disabled=!(live?.status==='open'&&r?.id===currentId);$('revealRound').disabled=!(currentPhase(live)==='closed'&&r?.id===currentId);});
$('saveRound').addEventListener('click',()=>act('save',{roundId:selected()?.id,title:$('roundTitle').value,a:$('editA').value,b:$('editB').value}));
$('startRound').addEventListener('click',()=>{
  const r=selected();if(!r)return;
  if(confirm(`${r.title}의 투표를 지금 시작할까요?\n시작하면 정확히 60초 뒤 서버에서 자동 마감됩니다.`))act('start',{roundId:r.id});
});
$('closeRound').addEventListener('click',()=>{const r=selected();if(r&&confirm('지금 투표를 즉시 마감할까요?'))act('close',{roundId:r.id});});
$('revealRound').addEventListener('click',()=>{const r=selected();if(r&&confirm('관객 전원과 대형 스크린에 최종 결과를 공개할까요?'))act('reveal',{roundId:r.id});});
$('resetRound').addEventListener('click',()=>{const r=selected();if(!r)return;
  if(confirm(`${r.title}의 모든 투표 기록을 삭제합니다.\n공연 중에는 사용하지 마세요.\n정말 초기화할까요?`))act('reset',{roundId:r.id,confirm:'RESET'});
});
function schedule(){setTimeout(async()=>{await refresh();schedule();},2000)}
loggedIn(Boolean(token));if(token)void refresh();schedule();setInterval(adminTimer,250);
