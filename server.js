const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || "change-this-secret-in-production";

app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(express.static(path.join(__dirname,"public"), {
  etag: false,
  maxAge: 0,
  setHeaders: (res) => res.setHeader("Cache-Control", "no-store")
}));

const dbDir=path.join(__dirname,"database");
if(!fs.existsSync(dbDir)) fs.mkdirSync(dbDir,{recursive:true});
const db=new sqlite3.Database(path.join(dbDir,"evcharge.db"));

function query(sql,p=[]){return new Promise((res,rej)=>db.all(sql,p,(e,r)=>e?rej(e):res(r)))}
function get(sql,p=[]){return new Promise((res,rej)=>db.get(sql,p,(e,r)=>e?rej(e):res(r)))}
function run(sql,p=[]){return new Promise((res,rej)=>db.run(sql,p,function(e){e?rej(e):res({id:this.lastID,changes:this.changes})}))}

db.serialize(()=>{
  db.run("PRAGMA foreign_keys=ON");
  db.run(`CREATE TABLE IF NOT EXISTS users(
    id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,
    phone TEXT,password_hash TEXT NOT NULL,role TEXT DEFAULT 'user',
    vehicle_model TEXT,vehicle_number TEXT,created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS stations(
    id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,location TEXT NOT NULL,
    address TEXT NOT NULL,charging_type TEXT NOT NULL,charging_speed_kw REAL DEFAULT 7.4,
    availability INTEGER DEFAULT 0,total_slots INTEGER NOT NULL,operating_hours TEXT,
    contact TEXT,price_per_kwh REAL NOT NULL,amenities TEXT DEFAULT '',
    latitude REAL,longitude REAL,created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS bookings(
    id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,station_id INTEGER NOT NULL,
    booking_date TEXT NOT NULL,booking_time TEXT NOT NULL,vehicle_number TEXT NOT NULL,
    vehicle_model TEXT,energy_required REAL DEFAULT 20,estimated_cost REAL DEFAULT 0,
    status TEXT DEFAULT 'Confirmed',created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),FOREIGN KEY(station_id) REFERENCES stations(id)
  )`);

  db.get("SELECT COUNT(*) count FROM users",(e,r)=>{
    if(e)return console.error(e);
    if(r.count===0){
      const hash=bcrypt.hashSync("Admin@123",10);
      db.run("INSERT INTO users(name,email,phone,password_hash,role) VALUES(?,?,?,?,?)",
        ["EV ChargeHub Admin","admin@evchargehub.com","9999999999",hash,"admin"]);
      console.log("Admin: admin@evchargehub.com / Admin@123");
    }
  });

  db.get("SELECT COUNT(*) count FROM stations",(e,r)=>{
    if(e)return console.error(e);
    if(r.count===0){
      const stmt=db.prepare(`INSERT INTO stations
      (name,location,address,charging_type,charging_speed_kw,availability,total_slots,operating_hours,contact,price_per_kwh,amenities,latitude,longitude)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      [
        ["GreenCharge Central","Mangalore","MG Road, Mangalore","DC Fast Charging",50,3,5,"24 Hours","9876543210",18,"Parking, Wi-Fi, Restroom, Cafe",12.8698,74.8430],
        ["VoltPoint Mall","Mangalore","City Centre Mall, Mangalore","AC Charging",7.4,4,6,"8:00 AM - 10:00 PM","9876501234",12,"Parking, Shopping, Food Court",12.8753,74.8421],
        ["EV Power Hub","Udupi","NH 66, Udupi","DC Fast Charging",60,1,4,"24 Hours","9988776655",20,"Parking, Restroom, Food",13.3409,74.7421],
        ["ChargeGo Station","Bangalore","Electronic City, Bangalore","AC Charging",11,6,8,"6:00 AM - 11:00 PM","9123456789",10,"Parking, Wi-Fi, Cafe",12.8456,77.6603],
        ["EcoVolt Arena","Mysore","Hebbal Industrial Area, Mysore","DC Fast Charging",80,4,6,"24 Hours","9012345678",16,"Parking, Restroom, Restaurant",12.3547,76.6661],
        ["GreenWay Express","Bangalore","Outer Ring Road, Bangalore","DC Fast Charging",120,2,4,"24 Hours","9345678901",22,"Parking, Wi-Fi, Restroom",13.0123,77.6412]
      ].forEach(x=>stmt.run(x));
      stmt.finalize(()=>console.log("Sample stations ready."));
    }
  });
});

function auth(req,res,next){
  const h=req.headers.authorization||"";
  const t=h.startsWith("Bearer ")?h.slice(7):null;
  if(!t)return res.status(401).json({error:"Login required."});
  try{req.user=jwt.verify(t,JWT_SECRET);next()}catch{res.status(401).json({error:"Session expired. Please login again."})}
}
function admin(req,res,next){if(req.user.role!=="admin")return res.status(403).json({error:"Admin access required."});next()}

async function slotInfo(stationId,date,time,ignoreId=null){
  const s=await get("SELECT total_slots FROM stations WHERE id=?",[stationId]);
  if(!s)return null;
  let sql="SELECT COUNT(*) count FROM bookings WHERE station_id=? AND booking_date=? AND booking_time=? AND status='Confirmed'";
  const p=[stationId,date,time];
  if(ignoreId){sql+=" AND id!=?";p.push(ignoreId)}
  const b=await get(sql,p);
  return {total:s.total_slots,booked:b.count,available:Math.max(0,s.total_slots-b.count)};
}

async function stationResults(search,type){
  let sql="SELECT * FROM stations WHERE 1=1";
  const p=[];
  const q=(search||"").trim().toLowerCase();
  if(q){
    sql+=` AND (
      LOWER(name) LIKE ? OR LOWER(location) LIKE ? OR LOWER(address) LIKE ?
      OR LOWER(charging_type) LIKE ? OR LOWER(amenities) LIKE ?
    )`;
    const k=`%${q}%`;p.push(k,k,k,k,k);
  }
  if(type){sql+=" AND charging_type=?";p.push(type)}
  sql+=" ORDER BY name COLLATE NOCASE ASC";
  const rows=await query(sql,p);
  for(const s of rows){
    const today=new Date().toISOString().slice(0,10);
    const info=await slotInfo(s.id,today,"00:00");
    s.current_availability=info?info.available:s.availability;
  }
  return rows;
}

/* Auth */
app.post("/api/auth/register",async(req,res)=>{
  try{
    const {name,email,phone,password,vehicle_model,vehicle_number}=req.body;
    if(!name||!email||!password)return res.status(400).json({error:"Name, email and password are required."});
    if(password.length<6)return res.status(400).json({error:"Password must be at least 6 characters."});
    const e=await get("SELECT id FROM users WHERE email=?",[email.trim().toLowerCase()]);
    if(e)return res.status(409).json({error:"Email already registered."});
    const hash=await bcrypt.hash(password,10);
    const r=await run("INSERT INTO users(name,email,phone,password_hash,vehicle_model,vehicle_number) VALUES(?,?,?,?,?,?)",
      [name.trim(),email.trim().toLowerCase(),phone||"",hash,vehicle_model||"",vehicle_number||""]);
    const u={id:r.id,name:name.trim(),email:email.trim().toLowerCase(),role:"user"};
    const token=jwt.sign(u,JWT_SECRET,{expiresIn:"7d"});
    res.status(201).json({token,user:u});
  }catch(e){res.status(500).json({error:e.message})}
});

app.post("/api/auth/login",async(req,res)=>{
  try{
    const u=await get("SELECT * FROM users WHERE email=?",[(req.body.email||"").trim().toLowerCase()]);
    if(!u||!(await bcrypt.compare(req.body.password||"",u.password_hash)))
      return res.status(401).json({error:"Incorrect email or password."});
    const safe={id:u.id,name:u.name,email:u.email,role:u.role};
    res.json({token:jwt.sign(safe,JWT_SECRET,{expiresIn:"7d"}),user:safe});
  }catch(e){res.status(500).json({error:e.message})}
});
app.get("/api/auth/me",auth,async(req,res)=>{
  const u=await get("SELECT id,name,email,phone,role,vehicle_model,vehicle_number,created_at FROM users WHERE id=?",[req.user.id]);
  if(!u)return res.status(404).json({error:"User not found."});res.json(u);
});
app.put("/api/auth/profile",auth,async(req,res)=>{
  await run("UPDATE users SET name=?,phone=?,vehicle_model=?,vehicle_number=? WHERE id=?",
    [req.body.name,req.body.phone||"",req.body.vehicle_model||"",req.body.vehicle_number||"",req.user.id]);
  res.json({message:"Profile updated."});
});

/* Search diagnostic: confirms the API is returning station data. */
app.get("/api/search-test", async (req,res)=>{
  try{
    const rows=await query("SELECT id,name,location,address FROM stations ORDER BY id");
    res.json({count:rows.length,stations:rows});
  }catch(e){res.status(500).json({error:e.message})}
});

/* Stations - SEARCH WORKS BY CITY, NAME, ADDRESS, TYPE, AMENITIES */
app.get("/api/stations",async(req,res)=>{
  try{res.json(await stationResults(req.query.search||"",req.query.type||""))}
  catch(e){console.error(e);res.status(500).json({error:"Could not load stations."})}
});
app.get("/api/stations/:id",async(req,res)=>{
  try{
    const s=await get("SELECT * FROM stations WHERE id=?",[req.params.id]);
    if(!s)return res.status(404).json({error:"Station not found."});
    s.today=await slotInfo(s.id,new Date().toISOString().slice(0,10),"00:00");
    res.json(s);
  }catch(e){res.status(500).json({error:e.message})}
});

/* Bookings */
app.post("/api/bookings",auth,async(req,res)=>{
  try{
    const {station_id,booking_date,booking_time,vehicle_number,vehicle_model,energy_required}=req.body;
    if(!station_id||!booking_date||!booking_time||!vehicle_number)
      return res.status(400).json({error:"Station, date, time and vehicle number are required."});
    const chosen=new Date(`${booking_date}T00:00:00`);
    const today=new Date();today.setHours(0,0,0,0);
    if(Number.isNaN(chosen.getTime())||chosen<today)return res.status(400).json({error:"Choose a valid future date."});
    const s=await get("SELECT * FROM stations WHERE id=?",[station_id]);
    if(!s)return res.status(404).json({error:"Station not found."});
    const energy=Number(energy_required)||20;
    if(energy<1||energy>200)return res.status(400).json({error:"Energy must be between 1 and 200 kWh."});
    const a=await slotInfo(station_id,booking_date,booking_time);
    if(!a||a.available<=0)return res.status(409).json({error:"That time slot is fully booked."});
    const dup=await get("SELECT id FROM bookings WHERE user_id=? AND station_id=? AND booking_date=? AND booking_time=? AND status='Confirmed'",
      [req.user.id,station_id,booking_date,booking_time]);
    if(dup)return res.status(409).json({error:"You already booked this station at that time."});
    const cost=energy*s.price_per_kwh;
    const r=await run(`INSERT INTO bookings(user_id,station_id,booking_date,booking_time,vehicle_number,vehicle_model,energy_required,estimated_cost)
      VALUES(?,?,?,?,?,?,?,?)`,[req.user.id,station_id,booking_date,booking_time,vehicle_number,vehicle_model||"",energy,cost]);
    res.status(201).json({message:"Booking confirmed.",bookingId:r.id,estimatedCost:cost});
  }catch(e){res.status(500).json({error:e.message})}
});
app.get("/api/bookings",auth,async(req,res)=>{
  try{res.json(await query(`SELECT b.*,s.name station_name,s.location station_location,s.address,s.charging_type,s.charging_speed_kw,s.price_per_kwh
    FROM bookings b JOIN stations s ON b.station_id=s.id WHERE b.user_id=? ORDER BY b.booking_date DESC,b.booking_time DESC,b.id DESC`,[req.user.id]))}
  catch(e){res.status(500).json({error:e.message})}
});
app.put("/api/bookings/:id",auth,async(req,res)=>{
  try{
    const b=await get("SELECT * FROM bookings WHERE id=? AND user_id=?",[req.params.id,req.user.id]);
    if(!b)return res.status(404).json({error:"Booking not found."});
    if(b.status!=="Confirmed")return res.status(400).json({error:"Only confirmed bookings can be updated."});
    const a=await slotInfo(b.station_id,req.body.booking_date,req.body.booking_time,b.id);
    if(!a||a.available<=0)return res.status(409).json({error:"That new slot is unavailable."});
    await run("UPDATE bookings SET booking_date=?,booking_time=? WHERE id=?",[req.body.booking_date,req.body.booking_time,b.id]);
    res.json({message:"Booking updated."});
  }catch(e){res.status(500).json({error:e.message})}
});
app.delete("/api/bookings/:id",auth,async(req,res)=>{
  try{
    const b=await get("SELECT * FROM bookings WHERE id=? AND user_id=?",[req.params.id,req.user.id]);
    if(!b)return res.status(404).json({error:"Booking not found."});
    await run("UPDATE bookings SET status='Cancelled' WHERE id=?",[b.id]);res.json({message:"Booking cancelled."});
  }catch(e){res.status(500).json({error:e.message})}
});

/* Statistics */
app.get("/api/statistics",async(req,res)=>{
  try{
    const s=await get("SELECT COUNT(*) stations,COALESCE(SUM(total_slots),0) slots FROM stations");
    const b=await get("SELECT COUNT(*) bookings,COALESCE(SUM(energy_required),0) energy FROM bookings WHERE status='Confirmed'");
    res.json({stations:s.stations,totalSlots:s.slots,bookings:b.bookings,energy:b.energy});
  }catch(e){res.status(500).json({error:e.message})}
});

/* Admin */
app.get("/api/admin/dashboard",auth,admin,async(req,res)=>{
  try{
    const u=await get("SELECT COUNT(*) count FROM users WHERE role='user'");
    const s=await get("SELECT COUNT(*) count FROM stations");
    const b=await get("SELECT COUNT(*) count FROM bookings");
    const r=await get("SELECT COALESCE(SUM(estimated_cost),0) total FROM bookings WHERE status='Confirmed'");
    res.json({users:u.count,stations:s.count,bookings:b.count,revenue:r.total});
  }catch(e){res.status(500).json({error:e.message})}
});
app.get("/api/admin/users",auth,admin,async(req,res)=>{
  try{res.json(await query("SELECT id,name,email,phone,role,vehicle_model,vehicle_number,created_at FROM users ORDER BY created_at DESC"))}
  catch(e){res.status(500).json({error:e.message})}
});
app.get("/api/admin/bookings",auth,admin,async(req,res)=>{
  try{res.json(await query(`SELECT b.*,u.name user_name,u.email user_email,s.name station_name
    FROM bookings b JOIN users u ON b.user_id=u.id JOIN stations s ON b.station_id=s.id ORDER BY b.created_at DESC`))}
  catch(e){res.status(500).json({error:e.message})}
});
app.post("/api/admin/stations",auth,admin,async(req,res)=>{
  try{
    const s=req.body;
    if(!s.name||!s.location||!s.address||!s.total_slots||!s.price_per_kwh)
      return res.status(400).json({error:"Fill all required station fields."});
    const r=await run(`INSERT INTO stations(name,location,address,charging_type,charging_speed_kw,availability,total_slots,operating_hours,contact,price_per_kwh,amenities)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      [s.name,s.location,s.address,s.charging_type,s.charging_speed_kw||7.4,s.availability||0,s.total_slots,s.operating_hours||"24 Hours",s.contact||"",s.price_per_kwh,s.amenities||""]);
    res.status(201).json({id:r.id,message:"Station added."});
  }catch(e){res.status(500).json({error:e.message})}
});

app.get("/admin",(req,res)=>res.sendFile(path.join(__dirname,"public","admin.html")));
app.get("/",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.use((req,res)=>res.status(404).json({error:"Route not found."}));

app.listen(PORT, () => {
    console.log(`EV ChargeHub running at http://localhost:${PORT}`);
});