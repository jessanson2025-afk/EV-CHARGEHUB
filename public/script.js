const API="/api";
let stations=[],selected=null,user=null,searchTimer=null;
const $=id=>document.getElementById(id);
const token=()=>localStorage.getItem("ev_token");
function headers(){return token()?{"Content-Type":"application/json","Authorization":"Bearer "+token()}:{"Content-Type":"application/json"}}
async function api(url,opt={}){const r=await fetch(API+url,{...opt,headers:{...headers(),...(opt.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||"Request failed");return d}
function toast(msg,error=false){const x=document.createElement("div");x.className="toast"+(error?" error":"");x.textContent=msg;$("toast").appendChild(x);setTimeout(()=>x.remove(),3000)}
function open(id){$(id).classList.add("show")}function close(id){$(id).classList.remove("show")}
document.querySelectorAll("[data-close]").forEach(x=>x.onclick=()=>close(x.dataset.close));
document.querySelectorAll(".modal").forEach(x=>x.onclick=e=>{if(e.target===x)x.classList.remove("show")});

function authUI(){
 $("loginBtn").classList.toggle("hidden",!!user);$("registerBtn").classList.toggle("hidden",!!user);$("profileBtn").classList.toggle("hidden",!user);
 if(user)$("profileBtn").textContent=user.name[0].toUpperCase();
}
async function loadUser(){
 if(!token()){authUI();return}
 try{user=await api("/auth/me");authUI();loadBookings()}catch{localStorage.removeItem("ev_token");user=null;authUI()}
}
function authTab(t){
 document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x.dataset.tab===t));
 $("loginForm").classList.toggle("hidden",t!=="login");$("registerForm").classList.toggle("hidden",t!=="register");
}
$("loginBtn").onclick=()=>{authTab("login");open("authModal")};$("registerBtn").onclick=()=>{authTab("register");open("authModal")};
document.querySelectorAll(".tab").forEach(x=>x.onclick=()=>authTab(x.dataset.tab));
$("heroBook").onclick=()=>{if(!user){open("authModal");toast("Login to make a booking.",true)}else openBooking(stations[0]?.id)};

$("loginForm").onsubmit=async e=>{
 e.preventDefault();try{const d=await api("/auth/login",{method:"POST",body:JSON.stringify({email:$("loginEmail").value,password:$("loginPassword").value})});localStorage.setItem("ev_token",d.token);user=d.user;authUI();close("authModal");toast("Welcome back, "+user.name+"!");loadBookings()}catch(x){$("loginMsg").textContent=x.message;$("loginMsg").style.color="#ff8e95"}
};
$("registerForm").onsubmit=async e=>{
 e.preventDefault();try{const d=await api("/auth/register",{method:"POST",body:JSON.stringify({name:$("regName").value,email:$("regEmail").value,phone:$("regPhone").value,password:$("regPassword").value,vehicle_model:$("regVehicle").value,vehicle_number:$("regNumber").value})});localStorage.setItem("ev_token",d.token);user=d.user;authUI();close("authModal");toast("Account created!");loadBookings()}catch(x){$("regMsg").textContent=x.message;$("regMsg").style.color="#ff8e95"}
};

$("profileBtn").onclick=async()=>{const p=await api("/auth/me");$("profileTitle").textContent=p.name;$("pName").value=p.name;$("pPhone").value=p.phone||"";$("pVehicle").value=p.vehicle_model||"";$("pNumber").value=p.vehicle_number||"";open("profileModal")};
$("profileForm").onsubmit=async e=>{e.preventDefault();try{await api("/auth/profile",{method:"PUT",body:JSON.stringify({name:$("pName").value,phone:$("pPhone").value,vehicle_model:$("pVehicle").value,vehicle_number:$("pNumber").value})});user.name=$("pName").value;authUI();close("profileModal");toast("Profile saved.")}catch(x){toast(x.message,true)}};
$("logout").onclick=()=>{localStorage.removeItem("ev_token");user=null;authUI();close("profileModal");loadBookings();toast("Logged out.")};

async function loadStations(){
 const q=$("search").value.trim().toLowerCase();
 const type=$("type").value;
 try{
   // Always retrieve the complete station list first.
   // This makes city searching independent of URL/query-string handling.
   const all=await api("/stations");
   stations=all.filter(s=>{
     const text=[
       s.name||"",
       s.location||"",
       s.address||"",
       s.charging_type||"",
       s.amenities||""
     ].join(" ").toLowerCase();

     const matchesSearch=!q || text.includes(q);
     const matchesType=!type || s.charging_type===type;
     return matchesSearch && matchesType;
   });

   renderStations();
   fillSelect();
   stats();
   suggestions(q,all);
 }catch(x){
   console.error(x);
   toast(x.message,true);
 }
}

function renderStations(){
 const grid=$("stationGrid");grid.innerHTML="";
 if(!stations.length){grid.innerHTML=`<div class="card"><h3>No charging stations found.</h3><p class="muted">Try another city such as Mangalore, Udupi, Bangalore or Mysore.</p></div>`;return}
 stations.forEach(s=>{
  const a=s.current_availability??s.availability,p=Math.min(100,Math.round(a/s.total_slots*100));
  const d=document.createElement("article");d.className="card";d.innerHTML=`
  <div class="top"><div class="icon">⚡</div><span class="status ${a?"open":"fullStatus"}">${a?"● OPEN":"● FULL"}</span></div>
  <h3>${s.name}</h3><div class="muted">📍 ${s.location}</div>
  <div class="tags"><span class="tag">${s.charging_type}</span><span class="tag">⚡ ${s.charging_speed_kw} kW</span><span class="tag">₹${s.price_per_kwh}/kWh</span></div>
  <div class="availHead"><span>Available slots</span><b>${a}/${s.total_slots}</b></div><div class="bar"><span style="width:${p}%"></span></div>
  <div class="meta"><div><small>HOURS</small><b>${s.operating_hours}</b></div><div><small>CONTACT</small><b>${s.contact}</b></div></div>
  <div class="cardActions"><button class="outline" onclick="detail(${s.id})">Details</button><button class="book" ${!a?"disabled":""} onclick="openBooking(${s.id})">${a?"⚡ Reserve":"Full"}</button></div>`;
  grid.appendChild(d)
 })
}
function stats(){$("statStations").textContent=stations.length;$("statSlots").textContent=stations.reduce((n,s)=>n+(s.current_availability??s.availability),0)}
function fillSelect(){const x=$("stationSelect");x.innerHTML='<option value="">Select station</option>';stations.forEach(s=>{if((s.current_availability??s.availability)>0){const o=document.createElement("option");o.value=s.id;o.textContent=`${s.name} — ${s.location}`;x.appendChild(o)}})}
function suggestions(q,allStations=stations){
 const box=$("suggestions");
 if(!q){box.classList.add("hidden");return}

 const seen=[];
 allStations.forEach(s=>{
   [s.location,s.name,s.address].forEach(v=>{
     if(v && !seen.some(x=>x.toLowerCase()===v.toLowerCase())) seen.push(v);
   });
 });

 const matches=seen.filter(x=>x.toLowerCase().includes(q)).slice(0,8);
 box.innerHTML=matches.map(x=>
   `<button data-value="${x.replaceAll('"',"&quot;")}">⌕ ${x}</button>`
 ).join("");

 box.classList.toggle("hidden",!matches.length);

 box.querySelectorAll("button").forEach(b=>{
   b.onclick=()=>{
     $("search").value=b.dataset.value;
     $("suggestions").classList.add("hidden");
     loadStations();
   };
 });
}

$("search").addEventListener("input",()=>{clearTimeout(searchTimer);searchTimer=setTimeout(loadStations,300)});
$("search").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();loadStations()}});
$("searchBtn").onclick=loadStations;$("type").onchange=loadStations;$("clearSearch").onclick=()=>{$("search").value="";$("suggestions").classList.add("hidden");loadStations()};

async function detail(id){
 try{const s=await api("/stations/"+id),a=s.today?.available??s.availability,p=Math.round(a/s.total_slots*100);
 $("detail").innerHTML=`<div class="eyebrow">CHARGING STATION</div><h2 class="detailTitle">${s.name}</h2><p class="muted">📍 ${s.address}</p><div class="map">⚡</div>
 <a class="secondary" target="_blank" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.address)}">🧭 Open Directions</a>
 <div class="detailGrid"><div class="detailItem"><small>TYPE</small><b>${s.charging_type}</b></div><div class="detailItem"><small>SPEED</small><b>${s.charging_speed_kw} kW</b></div><div class="detailItem"><small>AVAILABLE</small><b>${a}/${s.total_slots}</b></div><div class="detailItem"><small>PRICE</small><b>₹${s.price_per_kwh}/kWh</b></div><div class="detailItem"><small>HOURS</small><b>${s.operating_hours}</b></div><div class="detailItem"><small>AMENITIES</small><b>${s.amenities||"Standard"}</b></div></div>
 <div class="availHead"><span>Current availability</span><b>${p}%</b></div><div class="bar"><span style="width:${p}%"></span></div><button class="primary full" ${!a?"disabled":""} onclick="close('detailModal');openBooking(${s.id})">${a?"⚡ Reserve this station":"Currently full"}</button>`;
 open("detailModal")}catch(x){toast(x.message,true)}
}
function openBooking(id){
 if(!user){open("authModal");toast("Login to make a booking.",true);return}
 selected=stations.find(s=>Number(s.id)===Number(id));if(!selected)return;
 $("stationSelect").value=selected.id;$("selectedStation").innerHTML=`<b>⚡ ${selected.name}</b><br><span class="muted">${selected.location} · ${selected.charging_type} · ${selected.charging_speed_kw} kW · ₹${selected.price_per_kwh}/kWh</span>`;
 $("date").min=new Date().toISOString().slice(0,10);estimate();open("bookingModal")
}
$("stationSelect").onchange=()=>{selected=stations.find(s=>Number(s.id)===Number($("stationSelect").value));if(selected){$("selectedStation").innerHTML=`<b>⚡ ${selected.name}</b><br><span class="muted">${selected.location} · ${selected.charging_type}</span>`;estimate()}};
function estimate(){if(!selected)return;const e=Number($("energyRange").value);$("energyValue").textContent=e;$("cost").textContent="₹"+(e*selected.price_per_kwh).toFixed(0);const m=Math.round(e/selected.charging_speed_kw*60);$("chargeTime").textContent=`Estimated charging time: ${m<60?m+" minutes":(m/60).toFixed(1)+" hours"}`}
$("energyRange").oninput=estimate;
$("bookingForm").onsubmit=async e=>{e.preventDefault();try{const d=await api("/bookings",{method:"POST",body:JSON.stringify({station_id:selected.id,booking_date:$("date").value,booking_time:$("time").value,vehicle_number:$("vehicleNumber").value,vehicle_model:$("vehicleModel").value,energy_required:Number($("energyRange").value)})});close("bookingModal");toast("Booking #"+d.bookingId+" confirmed!");loadStations();loadBookings();impact()}catch(x){$("bookingMsg").textContent=x.message;$("bookingMsg").style.color="#ff8e95"}};

async function loadBookings(){
 const g=$("bookingGrid");if(!user){g.innerHTML=`<div class="card"><h3>Login to view your bookings.</h3><button class="primary" onclick="open('authModal')">Login / Create Account</button></div>`;return}
 try{const bs=await api("/bookings");g.innerHTML="";if(!bs.length){g.innerHTML=`<div class="card"><h3>No bookings yet.</h3><p class="muted">Your confirmed charging reservations will appear here.</p></div>`;return}
 bs.forEach(b=>{const d=document.createElement("article");d.className="card";d.innerHTML=`<h3>🎫 Booking #${b.id}</h3><p class="muted"><b>${b.station_name}</b><br>${b.station_location}</p><p class="muted">📅 ${b.booking_date} · 🕐 ${b.booking_time}</p><p class="muted">🚗 ${b.vehicle_number}${b.vehicle_model?" · "+b.vehicle_model:""}</p><p class="muted">⚡ ${b.energy_required} kWh · <b>₹${b.estimated_cost}</b></p><span class="bookingStatus ${b.status==="Confirmed"?"confirmed":"cancelled"}">${b.status}</span>${b.status==="Confirmed"?`<div class="bookingActions"><button onclick="updateBooking(${b.id})">✏ Update</button><button class="danger" onclick="cancelBooking(${b.id})">✕ Cancel</button></div>`:""}`;g.appendChild(d)})}catch(x){toast(x.message,true)}
}
async function updateBooking(id){const d=prompt("New date (YYYY-MM-DD)");if(!d)return;const t=prompt("New time (HH:MM)");if(!t)return;try{await api("/bookings/"+id,{method:"PUT",body:JSON.stringify({booking_date:d,booking_time:t})});toast("Booking updated.");loadBookings();loadStations()}catch(x){toast(x.message,true)}}
async function cancelBooking(id){if(!confirm("Cancel this booking?"))return;try{await api("/bookings/"+id,{method:"DELETE"});toast("Booking cancelled.");loadBookings();loadStations();impact()}catch(x){toast(x.message,true)}}
async function impact(){try{const x=await api("/statistics");$("energy").textContent=Number(x.energy).toFixed(0)+" kWh";$("co2").textContent=(Number(x.energy)*.7).toFixed(1)+" kg";$("bookCount").textContent=x.bookings}catch{}}
loadUser();loadStations();impact();
