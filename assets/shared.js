export const $ = id => document.getElementById(id);
export const API_ROOT = (window.MASK_VOTE_API || '').replace(/\/$/,'');
export function configured(){return /^https:\/\/[a-z0-9.-]+$/i.test(API_ROOT) && !API_ROOT.includes('PASTE_');}
export async function api(path, { method='GET', data, token }={}) {
  if (!configured()) throw new Error('config.js에 Cloudflare Workers 주소를 먼저 입력해주세요.');
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),11000);
  try {
    const response=await fetch(`${API_ROOT}${path}`,{
      method, signal:controller.signal, cache:'no-store',
      headers:{...(data?{'Content-Type':'application/json'}:{}),...(token?{'Authorization':`Bearer ${token}`}:{})},
      ...(data?{body:JSON.stringify(data)}:{})
    });
    let parsed;
    try {parsed=await response.json();} catch {throw new Error(`서버 응답 오류 (${response.status})`);}
    if(!response.ok) throw new Error(parsed.error || `요청 실패 (${response.status})`);
    return parsed;
  } catch(err) {
    if(err.name==='AbortError') throw new Error('서버 응답이 늦습니다. 잠시 뒤 다시 확인해주세요.');
    throw err;
  } finally {clearTimeout(timeout);}
}
export function clock(ms){const secs=Math.max(0,Math.ceil(ms/1000));return `${String(Math.floor(secs/60)).padStart(2,'0')}:${String(secs%60).padStart(2,'0')}`;}
export function percent(v,total){return total>0 ? (v/total*100) : 0;}
export function roundPercent(v,total){return `${percent(v,total).toFixed(1)}%`;}


/**
 * Receive immediately pushed event changes. If disconnected, reconnect automatically.
 * This never sends an audience vote over WebSocket; POST /api/vote remains authoritative.
 */
export function connectLive(onState, onReconnect = () => {}, onConnection = () => {}) {
  if (!configured()) return () => false;
  let socket = null, isStopped = false, attempts = 0, retryTimer = null;
  function open() {
    if (isStopped || (socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN))) return;
    const endpoint = `${API_ROOT.replace(/^http/i, 'ws')}/api/live`;
    socket = new WebSocket(endpoint);
    socket.onopen = () => {
      attempts = 0;
      onConnection(true);
      // Recover changes made between the initial GET and the socket handshake.
      onReconnect();
    };
    socket.onmessage = event => {
      try {
        const data = JSON.parse(event.data);
        if (data?.type === 'state' && data.state?.serverTime) onState(data.state);
      } catch (e) { console.warn('Invalid state update', e); }
    };
    socket.onclose = () => {
      onConnection(false);
      if (isStopped) return;
      const delay = Math.min(15000, 1000 * 2 ** Math.min(attempts++, 4)) + Math.floor(Math.random()*800);
      retryTimer = setTimeout(open, delay);
    };
    socket.onerror = () => { socket?.close(); };
  }
  open();
  window.addEventListener('online', () => { if (!isStopped && socket?.readyState !== WebSocket.OPEN) { clearTimeout(retryTimer); open(); } });
  return () => socket?.readyState === WebSocket.OPEN;
}
