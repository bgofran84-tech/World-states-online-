import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import crypto from "crypto";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const PORT = process.env.PORT || 10000;

app.use(express.static("public"));
app.get("/health", (_, res) => res.json({ ok: true }));

const rooms = new Map();
const MAX_PLAYERS = 10;
const COUNTRIES = [
  ["العراق","🇮🇶"],["روسيا","🇷🇺"],["أمريكا","🇺🇸"],["بريطانيا","🇬🇧"],
  ["فرنسا","🇫🇷"],["ألمانيا","🇩🇪"],["اليابان","🇯🇵"],["الصين","🇨🇳"],
  ["تركيا","🇹🇷"],["مصر","🇪🇬"],["إسبانيا","🇪🇸"],["إيطاليا","🇮🇹"],
  ["كندا","🇨🇦"],["البرازيل","🇧🇷"],["الهند","🇮🇳"],["أستراليا","🇦🇺"]
];

function code() {
  let c;
  do c = "WORLD-" + crypto.randomBytes(3).toString("hex").toUpperCase();
  while (rooms.has(c));
  return c;
}
function id() { return crypto.randomUUID(); }

function publicState(room) {
  return {
    roomCode: room.code,
    hostId: room.hostId,
    started: room.started,
    round: room.round,
    phase: room.phase,
    maxRounds: 10,
    players: [...room.players.values()].map(p => ({
      id:p.id, name:p.name, country: p.country ? "🔒" : null,
      ready:p.ready, alive:true
    }))
  };
}
function send(ws, type, data={}) {
  if (ws.readyState === 1) ws.send(JSON.stringify({type, ...data}));
}
function broadcast(room, type, data={}) {
  for (const p of room.players.values()) send(p.ws, type, data);
}
function privateState(room, p) {
  return {
    money:p.money, military:p.military, economy:p.economy,
    resources:p.resources, stability:p.stability,
    country:p.country ? p.country[0] : null,
    countryEmoji:p.country ? p.country[1] : null
  };
}
function broadcastState(room) {
  for (const p of room.players.values()) {
    send(p.ws, "state", { publicState: publicState(room), me: privateState(room,p) });
  }
}

function newPlayer(ws, name) {
  return { id:id(), ws, name:name.slice(0,24), country:null, ready:false,
    money:10, military:10, economy:10, resources:5, stability:10 };
}

function startGame(room) {
  if (room.players.size < 2) return {ok:false,msg:"تحتاج لاعبين على الأقل."};
  const selected = [...room.players.values()].filter(p => p.country);
  if (selected.length !== room.players.size) return {ok:false,msg:"كل لاعب لازم يختار دولة أولاً."};
  const countries = selected.map(p => p.country[0]);
  if (new Set(countries).size !== countries.length) return {ok:false,msg:"كل دولة يمكن اختيارها مرة واحدة."};
  room.started = true; room.round = 1; room.phase = "decision";
  return {ok:true};
}

wss.on("connection", ws => {
  ws.on("message", raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }

    if (m.type === "create") {
      const room = { code:code(), hostId:null, players:new Map(), started:false, round:0, phase:"lobby" };
      const p = newPlayer(ws, m.name || "لاعب");
      room.hostId=p.id; room.players.set(p.id,p); rooms.set(room.code,room);
      ws.playerId=p.id; ws.roomCode=room.code;
      send(ws,"joined",{roomCode:room.code,playerId:p.id,host:true});
      broadcastState(room);
      return;
    }

    if (m.type === "join") {
      const room=rooms.get(String(m.roomCode||"").toUpperCase());
      if (!room) return send(ws,"error",{msg:"الغرفة غير موجودة."});
      if (room.started) return send(ws,"error",{msg:"اللعبة بدأت بالفعل."});
      if (room.players.size>=MAX_PLAYERS) return send(ws,"error",{msg:"الغرفة ممتلئة."});
      const p=newPlayer(ws,m.name||"لاعب");
      room.players.set(p.id,p); ws.playerId=p.id; ws.roomCode=room.code;
      send(ws,"joined",{roomCode:room.code,playerId:p.id,host:false});
      broadcastState(room);
      return;
    }

    const room=rooms.get(ws.roomCode);
    const p=room?.players.get(ws.playerId);
    if (!room || !p) return;

    if (m.type === "choose_country") {
      if (room.started) return send(ws,"error",{msg:"لا يمكن تغيير الدولة بعد بدء اللعبة."});
      const found=COUNTRIES.find(c=>c[0]===m.country);
      if (!found) return send(ws,"error",{msg:"الدولة غير متاحة."});
      if ([...room.players.values()].some(x=>x.id!==p.id && x.country?.[0]===found[0]))
        return send(ws,"error",{msg:"هذه الدولة اختارها لاعب آخر."});
      p.country=found; broadcastState(room);
    }

    if (m.type === "start") {
      if (p.id!==room.hostId) return send(ws,"error",{msg:"فقط صاحب الغرفة يستطيع البدء."});
      const r=startGame(room);
      if (!r.ok) return send(ws,"error",{msg:r.msg});
      broadcast(room,"started",{});
      broadcastState(room);
    }

    if (m.type === "action") {
      if (!room.started || room.phase!=="decision") return send(ws,"error",{msg:"الوقت الحالي لا يسمح بقرار."});
      const action=m.action;
      if (action==="economy" && p.money>=3) { p.money-=3; p.economy+=2; }
      else if (action==="military" && p.money>=3) { p.money-=3; p.military+=2; }
      else if (action==="resources" && p.money>=1) { p.money-=1; p.resources+=3; }
      else if (action==="stability" && p.money>=2) { p.money-=2; p.stability=Math.min(10,p.stability+1); }
      else return send(ws,"error",{msg:"لا تملك ما يكفي من المال أو القرار غير صحيح."});
      p.ready=true;
      if ([...room.players.values()].every(x=>x.ready)) nextRound(room);
      else broadcastState(room);
    }
  });

  ws.on("close",()=>{
    const room=rooms.get(ws.roomCode);
    if (!room) return;
    room.players.delete(ws.playerId);
    if (room.hostId===ws.playerId) room.hostId=room.players.keys().next().value || null;
    if (room.players.size===0) rooms.delete(room.code);
    else broadcastState(room);
  });
});

function nextRound(room) {
  for (const p of room.players.values()) {
    p.money += Math.floor(p.economy/2);
    p.ready=false;
  }
  room.round++;
  if (room.round>room.maxRounds) { room.phase="finished"; broadcast(room,"finished",{}); }
  else room.phase="decision";
  broadcastState(room);
}

server.listen(PORT,()=>console.log(`Server running on ${PORT}`));