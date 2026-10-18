import {$,api,clock,percent,roundPercent,connectLive} from './shared.js';
let current=null,offset=0,fetching=false;
const audienceURL = new URL('./index.html',window.location.href).href;
$('screenUrl').textContent=audienceURL;
function timer(){if(!current){$('screenCountdown').textContent='--:--';return;}
  const remaining=(current.endsAt || 0)-Date.now()+offset;
  $('screenCountdown').textContent=current.phase==='open'?clock(remaining):'';
  if(current.phase==='open'&&remaining<=0){current.phase='closed';render();void refresh();}
}
function render(){if(!current)return;
  $('screenRound').textContent=current.title;
  $('screenWaiting').hidden=false;$('screenResult').hidden=true;
  if(current.phase==='ready'){$('screenTitle').textContent='투표 준비 중';$('screenHint').textContent='학우 여러분, QR 코드를 미리 스캔해주세요!';$('qrImage').hidden=false;$('screenUrl').hidden=false;}
  else if(current.phase==='open'){$('screenTitle').textContent='지금 투표해주세요!';$('screenHint').textContent='더 마음에 드는 참가자를 선택해주세요.';$('qrImage').hidden=false;$('screenUrl').hidden=false;}
  else if(current.phase==='closed'){$('screenTitle').textContent='최종 결과 집계 중';$('screenHint').textContent='투표가 마감되었습니다. 잠시 후 공개됩니다.';$('qrImage').hidden=true;$('screenUrl').hidden=true;}
  else if(current.phase==='revealed'){
    $('screenWaiting').hidden=true;$('screenResult').hidden=false;
    $('screenTitle').textContent='최종 투표 결과';
    const a=current.results?.A||0,b=current.results?.B||0,total=a+b;
    $('sA').textContent=current.a;$('sB').textContent=current.b;
    $('sAPct').textContent=roundPercent(a,total);$('sBPct').textContent=roundPercent(b,total);
    $('sABar').style.width=`${percent(a,total)}%`;$('sBBar').style.width=`${percent(b,total)}%`;
    $('sAVotes').textContent=`${a.toLocaleString()}표`;$('sBVotes').textContent=`${b.toLocaleString()}표`;
    $('sWinner').textContent=total===0?'유효 투표 없음':a===b?'무승부!':`🏆 ${a>b?current.a:current.b} 승리!`;
    $('sTotal').textContent=`총 ${total.toLocaleString()}표`;
  }
  timer();
}
function applyState(state){offset=Date.now()-state.serverTime;current=state.round;if(current)render();$('screenNetwork').textContent='';}
async function refresh(){if(fetching)return;fetching=true;
  try{applyState(await api('/api/state'));}
  catch(e){$('screenNetwork').textContent=`연결 확인 필요: ${e.message}`;}
  finally{fetching=false;}
}
const isLiveConnected=connectLive(applyState,()=>void refresh());
setInterval(()=>{if(!isLiveConnected())void refresh();},15000);
setInterval(timer,250);void refresh();
