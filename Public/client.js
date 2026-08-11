let ws, roomCode="", myId="", isHost=false, started=false, lastMe=null;
const $=id=>document.getElementById(id);
function connect(){ws=new WebSocket(location.origin.replace(/^http/,"ws"));ws.onmessage=e=>handle(JSON.parse(e.data));ws.onclose=()=>msg("انقطع الاتصال بالسيرفر.");}
function send(o){if(ws?.readyState===1)ws.send(JSON.stringify(o))}
function msg(x){$("msg").textContent=x}
function createRoom(){const n=$("name").value.trim();if(!n)return msg("اكتب اسمك أولاً.");connect();ws.onopen=()=>send({type:"create",name:n})}
function joinRoom(){const n=$("name").value.trim(),c=$("roomInput").value.trim();if(!n||!c)return msg("اكتب الاسم ورمز الغرفة.");connect();ws.onopen=()=>send({type:"join",name:n,roomCode:c})}
function handle(m){
 if(m.type==="error"){alert(m.msg);return}
 if(m.type==="joined"){roomCode=m.roomCode;myId=m.playerId;isHost=m.host;$("home").classList.add("hidden");$("lobby").classList.remove("hidden");$("roomCode").textContent=roomCode}
 if(m.type==="state"){renderState(m.publicState,m.me)}
 if(m.type==="started"){started=true;$("lobby").classList.add("hidden");$("game").classList.remove("hidden")}
}
const countries=[["العراق","🇮🇶"],["روسيا","🇷🇺"],["أمريكا","🇺🇸"],["بريطانيا","🇬🇧"],["فرنسا","🇫🇷"],["ألمانيا","🇩🇪"],["اليابان","🇯🇵"],["الصين","🇨🇳"],["تركيا","🇹🇷"],["مصر","🇪🇬"],["إسبانيا","🇪🇸"],["إيطاليا","🇮🇹"],["كندا","🇨🇦"],["البرازيل","🇧🇷"],["الهند","🇮🇳"],["أستراليا","🇦🇺"]];
function renderState(s,me){
 lastMe=me;$("round").textContent=s.round||1;$("gameCode").textContent=s.roomCode;
 $("players").innerHTML=s.players.map(p=>`<div class="player"><span>${escape(p.name)}</span><span>${p.country||"❓"} ${p.ready?"✅":""}</span></div>`).join("");
 $("gamePlayers").innerHTML=$("players").innerHTML;
 if(!s.started){
   $("startBtn").classList.toggle("hidden",!isHost);
   $("countryBox").innerHTML=`<h3>اختر دولتك سرًا 🕵️</h3><div class="country-grid">${countries.map(c=>`<button onclick="choose('${c[0]}')">${c[1]} ${c[0]}</button>`).join("")}</div>`;
 } else {
   $("myCountry").textContent=`${me.countryEmoji||""} ${me.country||"؟"}`;
   $("stats").innerHTML=[["💰 المال",me.money],["🪖 الجيش",me.military],["🏭 الاقتصاد",me.economy],["🛢️ الموارد",me.resources],["❤️ الاستقرار",me.stability]].map(x=>`<div class="stat">${x[0]}<br><b>${x[1]}</b></div>`).join("");
 }
}
function choose(c){send({type:"choose_country",country:c})}
function startGame(){send({type:"start"})}
function action(a){send({type:"action",action:a});$("turnMsg").textContent="تم إرسال قرارك للجولة. انتظر بقية اللاعبين…"}
function escape(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}