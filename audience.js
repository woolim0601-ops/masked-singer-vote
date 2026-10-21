import {$,api,clock,connectLive} from './shared.js';
let current=null, selected=null, timerOffset=0, locked=false, isFetching=false;
const VOTER_STORAGE_KEY='mask-stage-browser-id-v1';
function browserId(){
  let id=localStorage.getItem(VOTER_STORAGE_KEY);
  if(!id){id=crypto.randomUUID();localStorage.setItem(VOTER_STORAGE_KEY,id);}
  return id;
}
function votedKey(r){return `mask-stage-voted-round-${r.id}-${r.startedAt || 0}`;}
function setMessage(icon,title,body){$('messageIcon').textContent=icon;$('messageTitle').textContent=title;$('messageBody').textContent=body;}
function setBadge(text){$('phaseBadge').textContent=text;}
function updateTimer(){
  if(!current){$('timer').textContent='--:--';$('timerFill').style.width='0%';return;}
  const remaining = current.endsAt ? current.endsAt - Date.now() + timerOffset : 0;
  $('timer').textContent=(current.phase==='open' || current.phase==='closed')?clock(remaining):'--:--';
  $('timerFill').style.width=`${Math.max(0,Math.min(100,remaining/60000*100))}%`;
  if(current.phase==='open' && remaining<=0){
    current.phase='closed';render();
    // Request authoritative state after locally reaching 00:00.
    void refresh();
  }
}
function select(choice){if(!current || current.phase!=='open' || locked || localStorage.getItem(votedKey(current)))return;
  selected=choice;
  $('chooseA').classList.toggle('selected',choice==='A');
  $('chooseB').classList.toggle('selected',choice==='B');
  $('submitVote').disabled=false;
}
function render(){
  if(!current)return;
  const r=current;
  const newRound=String(r.id)!==String($('roundName').dataset.roundid);
  if(newRound){selected=null;locked=false;$('chooseA').classList.remove('selected');$('chooseB').classList.remove('selected');$('submitVote').textContent='투표 확정하기 →';}
  $('roundName').dataset.roundid=r.id;$('roundName').textContent=r.title;
  $('nameA').textContent=r.a;$('nameB').textContent=r.b;
  $('votePanel').hidden=true;$('messagePanel').hidden=true;$('resultPanel').hidden=true;
  const already=Boolean(localStorage.getItem(votedKey(r)));
  if(r.phase==='ready'){
    $('messagePanel').hidden=false;setMessage('🎭','곧 투표가 시작됩니다','공연을 즐겨주세요! 운영자가 투표를 시작하면 자동으로 안내됩니다.');setBadge('시작 대기');
  }else if(r.phase==='open'){
    if(already){
      $('messagePanel').hidden=false;setMessage('✅','투표가 접수되었습니다','참여해 주셔서 감사합니다. 다음 안내를 기다려주세요.');
    }else{
      $('votePanel').hidden=false;$('submitVote').disabled=selected===null || locked;$('chooseA').disabled=false;$('chooseB').disabled=false;
    }
    setBadge('투표 진행 중');
  }else if(r.phase==='closed'){
    $('messagePanel').hidden=false;setMessage('🔒','투표가 마감되었습니다','참여해 주셔서 감사합니다. 다음 안내를 기다려주세요.');setBadge('투표 마감');
  }else if(r.phase==='revealed'){
  $('resultPanel').hidden=false;
  setBadge('투표 종료');
  $('winner').textContent='';
  $('winner').hidden=true;
}
  }
  $('phaseHint').textContent=r.phase==='open'?'투표 종료까지 남은 시간':r.phase==='closed'?'투표가 마감되었습니다':r.phase==='revealed'?'투표가 종료되었습니다':'투표 시작을 기다리는 중';
  updateTimer();
}
function applyState(state) {
  timerOffset=Date.now()-state.serverTime;
  current=state.round;
  if(current) {render();$('serviceMessage').textContent='';}
  else $('serviceMessage').textContent='아직 등록된 라운드가 없습니다.';
}
async function refresh(){
  if(isFetching || document.hidden)return;
  isFetching=true;
  try { applyState(await api('/api/state')); }
  catch(e){$('serviceMessage').textContent=`연결 상태를 확인해 주세요: ${e.message}`;}
  finally {isFetching=false;}
}
async function submit(){
  if(!current || current.phase!=='open' || !selected || locked)return;
  const rId=current.id, startId=current.startedAt, choice=selected;
  locked=true;$('submitVote').disabled=true;$('submitVote').textContent='투표 접수 확인 중…';
  try{
    await api('/api/vote',{method:'POST',data:{roundId:rId,voterId:browserId(),choice}});
    localStorage.setItem(votedKey({id:rId,startedAt:startId}),choice);
    if(current?.id===rId)render();
  } catch(err){
    if(err.message.includes('이미 이 라운드')){
      localStorage.setItem(votedKey({id:rId,startedAt:startId}),'submitted');$('serviceMessage').textContent='이미 투표한 브라우저입니다.';
    }else $('serviceMessage').textContent=err.message;
    if(current?.id===rId){locked=false;render();}
  }
}
// WebSocket receives event changes immediately. HTTP polling is a fallback only.
const isLiveConnected=connectLive(applyState,()=>void refresh());
setInterval(()=>{if(!isLiveConnected()) void refresh();},15000);
$('chooseA').addEventListener('click',()=>select('A'));
$('chooseB').addEventListener('click',()=>select('B'));
$('submitVote').addEventListener('click',submit);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
setInterval(updateTimer,250);
try{browserId();}catch(e){$('serviceMessage').textContent='이 브라우저에서는 저장 기능을 사용할 수 없습니다. 일반 모드에서 접속해주세요.';}
void refresh();
