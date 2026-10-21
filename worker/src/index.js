import { DurableObject } from "cloudflare:workers";

/**
 * School MASK VOTE — Cloudflare Workers + D1
 * Public API never reveals tallies, including after the winner is announced.
 * Browser ID is NOT proof of a unique person or physical phone.
 */

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cors(origin, env) {
  const allowed = (env.ALLOWED_ORIGIN || '').trim();
  return origin && origin === allowed ? {
    'access-control-allow-origin': allowed,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'Authorization, Content-Type',
    'access-control-max-age': '600',
    vary: 'Origin'
  } : { vary: 'Origin' };
}
function json(value, status, headers) {
  return new Response(JSON.stringify(value), { status, headers: { ...JSON_HEADERS, ...headers } });
}
function fail(message, status = 400, headers = {}) { return json({ error: message }, status, headers); }
function safeInt(value) { return Number.isInteger(value) && value > 0 && value <= 1000; }
function cleanLabel(v, max=90) { return typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max ? v.trim() : null; }
async function bodyJson(request) {
  if (Number(request.headers.get('content-length')) > 4096) throw new Error('요청 데이터가 너무 큽니다.');
  const raw = await request.text();
  if (raw.length > 4096) throw new Error('요청 데이터가 너무 큽니다.');
  try { return JSON.parse(raw); } catch { throw new Error('요청 형식이 올바르지 않습니다.'); }
}
function constantTimeEqual(a,b) {
  const x = new TextEncoder().encode(String(a || ''));
  const y = new TextEncoder().encode(String(b || ''));
  let mismatch = x.length ^ y.length;
  for(let i=0;i<Math.max(x.length,y.length);i++) mismatch |= (x[i] || 0) ^ (y[i] || 0);
  return mismatch === 0;
}
function adminOkay(request, env) {
  if (!env.ADMIN_TOKEN || String(env.ADMIN_TOKEN).length < 20) return false;
  return constantTimeEqual(request.headers.get('authorization'), `Bearer ${env.ADMIN_TOKEN}`);
}
function phase(r, now) {
  if (r.status === 'open' && r.ends_at_ms <= now) return 'closed';
  return r.status;
}
async function currentRound(env) {
  return env.DB.prepare(`SELECT r.* FROM rounds r JOIN event_state s ON s.current_round_id=r.id WHERE s.id=1`).first();
}
async function getState(env) {
  const r = await currentRound(env);
  if (!r) return { serverTime: Date.now(), round: null };
  const now = Date.now();
  const current = { id:r.id, title:r.title, a:r.option_a, b:r.option_b, phase:phase(r, now), startedAt:r.started_at_ms || null, endsAt:r.ends_at_ms || null };
  // Public clients (including WebSocket subscribers) receive the outcome ONLY.
  // Vote totals and percentages are available exclusively from authenticated /api/admin/rounds.
  if (r.status === 'revealed') {
    const a = Number(r.a_votes || 0);
    const b = Number(r.b_votes || 0);
    current.outcome = a + b === 0 ? 'no_votes' : a === b ? 'tie' : 'winner';
    current.winner = current.outcome === 'winner' ? (a > b ? 'A' : 'B') : null;
  }
  return { serverTime:now, round:current };
}
async function vote(env, request) {
  const body = await bodyJson(request);
  if (!safeInt(body?.roundId) || typeof body?.voterId !== 'string' || !ID_PATTERN.test(body.voterId) || !['A','B'].includes(body.choice)) {
    return fail('투표 데이터가 올바르지 않습니다.');
  }
  // Admission and deadline checked inside this atomic INSERT, not only in JS.
  const result = await env.DB.prepare(`
    INSERT OR IGNORE INTO votes(round_id, voter_id, choice, created_at_ms)
    SELECT ?, ?, ?, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
    WHERE EXISTS (
      SELECT 1 FROM rounds r JOIN event_state e ON e.current_round_id = r.id
      WHERE e.id=1 AND r.id=? AND r.status='open'
        AND r.ends_at_ms > CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
    )
  `).bind(body.roundId, body.voterId, body.choice, body.roundId).run();
  if (result.meta?.changes === 1) return json({ ok:true, message:'투표가 정상 접수되었습니다.' }, 200);
  const existing = await env.DB.prepare('SELECT 1 AS yes FROM votes WHERE round_id=? AND voter_id=?').bind(body.roundId, body.voterId).first();
  if (existing) return fail('이미 이 라운드에 투표했습니다.', 409);
  return fail('현재 투표를 받고 있지 않습니다.', 409);
}
async function rounds(env) {
  const [rows, r] = await Promise.all([
    env.DB.prepare('SELECT id,title,option_a,option_b,status,started_at_ms,ends_at_ms,a_votes,b_votes FROM rounds ORDER BY id').all(),
    currentRound(env)
  ]);
  const current = r?.id;
  const list = rows.results || [];
  if (current) {
    const count = await env.DB.prepare(`SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN choice='A' THEN 1 ELSE 0 END) AS a,
        SUM(CASE WHEN choice='B' THEN 1 ELSE 0 END) AS b
      FROM votes WHERE round_id=?`).bind(current).first();
    return { rows:list, currentId:current, currentCount:{ A:count?.a || 0, B:count?.b || 0, total:count?.total || 0 }, serverTime:Date.now() };
  }
  return { rows:list, currentId:null, currentCount:{ A:0,B:0,total:0 }, serverTime:Date.now() };
}
async function adminAction(env, action, request) {
  const data = await bodyJson(request);
  const id = Number(data?.roundId);
  if (!safeInt(id)) return fail('유효한 라운드를 선택하세요.');
  if (action === 'save') {
    const title = cleanLabel(data.title,60), a = cleanLabel(data.a), b = cleanLabel(data.b);
    if (!title || !a || !b || a === b) return fail('라운드명과 서로 다른 참가자 이름을 입력하세요.');
    const result = await env.DB.prepare(`UPDATE rounds SET title=?,option_a=?,option_b=? WHERE id=? AND status='ready'`).bind(title,a,b,id).run();
    return result.meta?.changes ? json({ok:true},200) : fail('준비 상태의 라운드만 수정할 수 있습니다.',409);
  }
  if (action === 'start') {
    const r = await env.DB.prepare('SELECT status FROM rounds WHERE id=?').bind(id).first();
    if (!r || r.status !== 'ready') return fail('준비 상태의 라운드만 시작할 수 있습니다.',409);
    const now=Date.now();
    // Normalize expired open rounds; they cannot accept further votes anyway.
    await env.DB.prepare(`UPDATE rounds SET status='closed' WHERE status='open' AND ends_at_ms<=?`).bind(now).run();
    const open = await env.DB.prepare(`SELECT id FROM rounds WHERE status='open' LIMIT 1`).first();
    if (open) return fail('진행 중인 다른 라운드를 먼저 마감하세요.',409);
    // Use a transactional batch to publish the new round at the same time as opening.
    const results = await env.DB.batch([
      env.DB.prepare(`UPDATE rounds SET status='open', started_at_ms=?, ends_at_ms=?, a_votes=NULL,b_votes=NULL WHERE id=? AND status='ready'`).bind(now,now+60000,id),
      env.DB.prepare('UPDATE event_state SET current_round_id=? WHERE id=1').bind(id)
    ]);
    if (results[0].meta?.changes !== 1) return fail('라운드를 시작할 수 없습니다.',409);
    return json({ok:true, endsAt:now+60000},200);
  }
  const current = await currentRound(env);
  if (!current || current.id !== id) return fail('현재 화면에 표시 중인 라운드만 조작할 수 있습니다.',409);
  if (action === 'close') {
    const result=await env.DB.prepare(`UPDATE rounds SET status='closed' WHERE id=? AND status='open'`).bind(id).run();
    return result.meta?.changes ? json({ok:true},200) : fail('진행 중인 라운드가 아닙니다.',409);
  }
  if (action === 'reveal') {
    const now=Date.now();
    await env.DB.prepare(`UPDATE rounds SET status='closed' WHERE id=? AND status='open' AND ends_at_ms<=?`).bind(id,now).run();
    const r = await currentRound(env);
    if (r.status !== 'closed') return fail('투표를 먼저 마감해야 합니다.',409);
    const result=await env.DB.prepare(`SELECT
      SUM(CASE WHEN choice='A' THEN 1 ELSE 0 END) AS a,
      SUM(CASE WHEN choice='B' THEN 1 ELSE 0 END) AS b
      FROM votes WHERE round_id=?`).bind(id).first();
    const a=result?.a || 0, b=result?.b || 0;
    await env.DB.prepare(`UPDATE rounds SET status='revealed',a_votes=?,b_votes=? WHERE id=? AND status='closed'`).bind(a,b,id).run();
    return json({ok:true,results:{A:a,B:b,total:a+b}},200);
  }
  if (action === 'reset') {
    if (data.confirm !== 'RESET') return fail('초기화 확인 값이 필요합니다.');
    // Administrative rehearsal-only operation. Do not use during the show.
    await env.DB.batch([
      env.DB.prepare('DELETE FROM votes WHERE round_id=?').bind(id),
      env.DB.prepare(`UPDATE rounds SET status='ready',started_at_ms=NULL,ends_at_ms=NULL,a_votes=NULL,b_votes=NULL WHERE id=?`).bind(id),
      env.DB.prepare('UPDATE event_state SET current_round_id=? WHERE id=1').bind(id)
    ]);
    return json({ok:true},200);
  }
  return fail('알 수 없는 작업입니다.',404);
}
/**
 * A single low-traffic WebSocket room for the school event.
 * Durable Object hibernation avoids sending 1,000 repeated state requests.
 * The client cannot send votes or administrative commands over this channel.
 */
export class VoteLiveRoom extends DurableObject {
  async fetch(request) {
    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      const [client, server] = Object.values(new WebSocketPair());
      this.ctx.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }
    if (request.method === 'POST' && new URL(request.url).pathname === '/broadcast') {
      const payload = await request.text();
      if (payload.length > 4096) return new Response('too large', { status: 413 });
      for (const socket of this.ctx.getWebSockets()) {
        try { socket.send(payload); } catch (e) { console.log('Disconnected listener', String(e)); }
      }
      return new Response('ok');
    }
    return new Response('Not found', { status: 404 });
  }
  webSocketMessage(socket, message) {
    // Client messages are ignored. All authoritative changes are sent by the Worker.
  }
}

/** Broadcast only *public* state (never include raw counts or percentages). */
async function broadcastState(env) {
  const state = await getState(env);
  const res = await env.LIVE.getByName('school-show').fetch('https://internal/broadcast', {
    method: 'POST', body: JSON.stringify({ type: 'state', state })
  });
  if (!res.ok) throw new Error('Real-time broadcast failed');
}

export default {
  async fetch(request, env, ctx) {
    const origin=request.headers.get('origin');
    const corsHeaders=cors(origin,env);
    if (origin && origin !== env.ALLOWED_ORIGIN) return fail('허용되지 않은 웹사이트입니다.',403,corsHeaders);
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:corsHeaders});
    const url=new URL(request.url), path=url.pathname;
    try {
      if(path==='/api/state' && request.method==='GET') return json(await getState(env),200,corsHeaders);
      if(path==='/api/live' && request.method==='GET') {
        if(request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return fail('WebSocket connection required',426,corsHeaders);
        return env.LIVE.getByName('school-show').fetch(request);
      }
      if(path==='/api/vote' && request.method==='POST') {
        const result=await vote(env,request);
        return new Response(result.body,{status:result.status,headers:{...Object.fromEntries(result.headers),...corsHeaders}});
      }
      if(path.startsWith('/api/admin/')) {
        if(!adminOkay(request,env)) return fail('관리자 인증에 실패했습니다.',401,corsHeaders);
        if(path==='/api/admin/rounds' && request.method==='GET') return json(await rounds(env),200,corsHeaders);
        if(request.method==='POST') {
          const action=path.slice('/api/admin/'.length);
          const result=await adminAction(env,action,request);
          if(result.ok) ctx.waitUntil(broadcastState(env).catch(e=>console.error('Real-time notify error',e)));
          return new Response(result.body,{status:result.status,headers:{...Object.fromEntries(result.headers),...corsHeaders}});
        }
      }
      return fail('존재하지 않는 경로입니다.',404,corsHeaders);
    } catch(e) {
      console.error('API ERROR',e);
      if (e?.message?.startsWith('요청')) return fail(e.message,400,corsHeaders);
      return fail('서버에서 오류가 발생했습니다. 운영진에게 알려주세요.',503,corsHeaders);
    }
  }
};
