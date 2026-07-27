'use client'
import React, { useRef, useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { computeReadinessScore } from '@/lib/calmer/readiness'
import Link from 'next/link'

// ── Types ──────────────────────────────────────────────────────────────────────
type WeaponType = 'bat'|'gun'|'shotgun'|'grenade'|'molotov'|'chainsaw'
type RoomTheme  = 'classroom'|'office'|'livingroom'|'kitchen'
type Phase      = 'start'|'playing'|'allClear'|'over'
type FaceExpr   = 'normal'|'scared'|'hurt'|'dead'

interface Particle {
  x:number;y:number;vx:number;vy:number;r:number;color:string
  life:number;maxLife:number
  type:'spark'|'blood'|'smoke'|'fire'|'debris'|'glass'|'gore'
  spin?:number
}
interface Shard {
  x:number;y:number;vx:number;vy:number;angle:number;spin:number
  pts:[number,number][];color:string;life:number;maxLife:number;bounced:boolean
}
interface FirePool { x:number;y:number;r:number;life:number;maxLife:number }
interface Obj3D {
  id:number;label:string
  type:'monitor'|'desk'|'chair'|'blackboard'|'printer'|'bookshelf'|'clock'
       |'files'|'lamp'|'window'|'tv'|'sofa'|'fridge'|'cabinet'|'plant'|'table'
  x:number;y:number;w:number;h:number;depth:number
  health:number;maxHealth:number;broken:boolean;crackLevel:number
  shakeX:number;shakeY:number;shakeTimer:number
  color:string;top:string;side:string;points:number;layer:number
}
interface RagdollPart { name:string;ox:number;oy:number;vx:number;vy:number }
interface RagdollBone {
  x:number;y:number;vx:number;vy:number
  health:number;maxHealth:number
  reactionTimer:number;bleedTimer:number;face:FaceExpr
  parts:RagdollPart[];onGround:boolean;groundTime:number
  exploding:boolean;explodeTimer:number;dead:boolean;rebornTimer:number
  skinColor:string;shirtColor:string;pantsColor:string
}

// ── Constants ─────────────────────────────────────────────────────────────────
const W=960,H=560,FLOOR_Y=H-80,CEIL_Y=52
const VX=W/2,VY=CEIL_Y-30

// ── Structured-venting parameters (JITAI decision rule) ─────────────────────
// The venting phase is symbolic + TIME-LIMITED: after MAX_VENT_SECONDS the app
// steers to reflection regardless of state (the enforced fast handoff). The
// early handoff is the *decision point*; CALM_THRESHOLD is the tunable
// *decision-rule* parameter (calm-enough = a *state of receptivity*).
// [Nahum-Shani et al. 2018 (JITAI); Kjærvik & Bushman 2024]
const MAX_VENT_SECONDS = 120        // hard cap on the venting phase
const CALM_THRESHOLD = 0.66         // readiness at which reflection is offered
const TIMER_HANDOFF_SECONDS = 60    // control arm: offer at a fixed time instead

// ── Safe helpers ───────────────────────────────────────────────────────────────
const safeR = (r:number)=>Math.max(0.01,r)
function safeGrad(ctx:CanvasRenderingContext2D,x:number,y:number,r0:number,r1:number){
  return ctx.createRadialGradient(x,y,safeR(r0),x,y,safeR(r1))
}
function px3(x:number,y:number,z:number):[number,number]{
  const s=1+z*0.0022
  return [VX+(x-VX)/s, VY+(y-VY)/s]
}
function lighten(hex:string,a:number):string{
  const n=parseInt(hex.replace('#',''),16)
  const r=Math.min(255,(n>>16)+a),g=Math.min(255,((n>>8)&0xff)+a),b=Math.min(255,(n&0xff)+a)
  return `rgb(${r},${g},${b})`
}
function darken(hex:string,a:number):string{return lighten(hex,-a)}
function drawBox(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,d:number,
  face:string,top:string,side:string,alpha=1){
  if(w<=0||h<=0)return
  ctx.globalAlpha=alpha
  ctx.fillStyle=face;ctx.fillRect(x,y,w,h)
  const[tlx,tly]=px3(x,y,d),[trx,tr_y]=px3(x+w,y,d)
  ctx.fillStyle=top
  ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+w,y);ctx.lineTo(trx,tr_y);ctx.lineTo(tlx,tly);ctx.closePath();ctx.fill()
  const[brx,bry]=px3(x+w,y+h,d)
  ctx.fillStyle=side
  ctx.beginPath();ctx.moveTo(x+w,y);ctx.lineTo(x+w,y+h);ctx.lineTo(brx,bry);ctx.lineTo(trx,tr_y);ctx.closePath();ctx.fill()
  ctx.strokeStyle='rgba(0,0,0,0.2)';ctx.lineWidth=1;ctx.strokeRect(x,y,w,h)
  ctx.globalAlpha=1
}

// ── Room themes ────────────────────────────────────────────────────────────────
interface Theme {
  wallTop:string;wallBot:string;floorTop:string;floorBot:string
  ceilColor:string;baseColor:string;label:string;emoji:string
}
const THEMES:Record<RoomTheme,Theme>={
  classroom:{wallTop:'#c8b89a',wallBot:'#b8a880',floorTop:'#8a6830',floorBot:'#5c4420',ceilColor:'#d4ccc0',baseColor:'#7a5c30',label:'Classroom',emoji:'🏫'},
  office:   {wallTop:'#b8c4cc',wallBot:'#a8b4bc',floorTop:'#5a5a6a',floorBot:'#3a3a4a',ceilColor:'#d0d8e0',baseColor:'#444455',label:'Office',   emoji:'🏢'},
  livingroom:{wallTop:'#d4b896',wallBot:'#c4a880',floorTop:'#8b6343',floorBot:'#5a3d28',ceilColor:'#e0d4c4',baseColor:'#6a4830',label:'Living Room',emoji:'🛋️'},
  kitchen:  {wallTop:'#e8e0d0',wallBot:'#d8d0c0',floorTop:'#c8c0b0',floorBot:'#a0988a',ceilColor:'#f0ece4',baseColor:'#888070',label:'Kitchen',  emoji:'🍳'},
}

// ── Room object factories ──────────────────────────────────────────────────────
function mkObj(id:number,label:string,type:Obj3D['type'],x:number,y:number,w:number,h:number,
  d:number,hp:number,color:string,pts:number,layer:number):Obj3D{
  return{id,label,type,x,y,w,h,depth:d,health:hp,maxHealth:hp,broken:false,crackLevel:0,
    shakeX:0,shakeY:0,shakeTimer:0,color,top:lighten(color,40),side:darken(color,30),points:pts,layer}
}
const ROOM_OBJS:Record<RoomTheme,()=>Obj3D[]>={
  classroom:()=>[
    mkObj(1,'Blackboard','blackboard',155,52,410,215,20,5,'#2d6a4f',60,0),
    mkObj(2,'Bookshelf','bookshelf', 18,88, 95,252,22,4,'#7B3F00',40,0),
    mkObj(3,'Window',   'window',   640,52,200,215,14,2,'#a8d8ea',35,0),
    mkObj(4,'Clock',    'clock',    590,68, 65, 65, 8,1,'#e8dcc8',20,0),
    mkObj(5,'Desk',     'desk',     48,330,230, 80,20,5,'#c8944a',50,1),
    mkObj(6,'Monitor',  'monitor',  84,248,120, 82,15,2,'#111827',70,1),
    mkObj(7,'Printer',  'printer', 635,340,118, 82,17,3,'#cbd5e1',40,1),
    mkObj(8,'Chair',    'chair',   375,345, 78, 95,15,3,'#1a1a2a',30,1),
    mkObj(9,'Desk 2',   'desk',    455,340,160, 72,17,4,'#c8944a',40,1),
    mkObj(10,'Lamp',    'lamp',    755,195, 32,185,11,1,'#d4af37',25,1),
    mkObj(11,'Files',   'files',   262,388, 65, 46, 7,1,'#f0e8d0',10,2),
    mkObj(12,'Files 2', 'files',   492,390, 60, 42, 7,1,'#ffd6a5',10,2),
  ],
  office:()=>[
    mkObj(1,'Monitor',  'monitor',  80,240,130, 90,16,2,'#0f172a',70,1),
    mkObj(2,'Desk',     'desk',     48,328,240, 82,22,5,'#475569',55,1),
    mkObj(3,'Cabinet',  'cabinet', 640,110,120,260,24,4,'#334155',50,0),
    mkObj(4,'Window',   'window',  155, 55,380,218,14,2,'#bae6fd',35,0),
    mkObj(5,'Chair',    'chair',   395,342, 80, 98,15,3,'#0f172a',30,1),
    mkObj(6,'Printer',  'printer', 638,342,115, 82,17,3,'#94a3b8',40,1),
    mkObj(7,'Files',    'files',   262,386, 65, 46, 7,1,'#f1f5f9',10,2),
    mkObj(8,'Plant',    'plant',   760,300, 55,165,12,2,'#166534',20,1),
    mkObj(9,'Clock',    'clock',   615, 62, 65, 65, 8,1,'#e2e8f0',20,0),
    mkObj(10,'Desk 2',  'desk',    458,340,160, 72,17,4,'#475569',40,1),
    mkObj(11,'Files 2', 'files',   492,390, 60, 42, 7,1,'#cbd5e1',10,2),
    mkObj(12,'Lamp',    'lamp',    768,192, 32,178,11,1,'#94a3b8',25,1),
  ],
  livingroom:()=>[
    mkObj(1,'TV',       'tv',      185, 80,340,215,18,3,'#0f0f0f',65,0),
    mkObj(2,'Sofa',     'sofa',    340,330,290, 90,26,5,'#8B4513',60,1),
    mkObj(3,'Cabinet',  'cabinet',  20,110,110,250,22,4,'#5C3317',45,0),
    mkObj(4,'Plant',    'plant',   735,305, 60,165,12,2,'#15803d',20,1),
    mkObj(5,'Lamp',     'lamp',    760,195, 34,182,11,1,'#d97706',25,1),
    mkObj(6,'Table',    'table',   440,375,140, 60,16,3,'#92400e',35,1),
    mkObj(7,'Clock',    'clock',   605, 68, 65, 65, 8,1,'#f5f0e8',20,0),
    mkObj(8,'Window',   'window',  620, 55,210,220,14,2,'#bae6fd',30,0),
    mkObj(9,'Files',    'files',   192,388, 65, 46, 7,1,'#fde68a',10,2),
    mkObj(10,'Chair',   'chair',    55,342, 80, 98,15,3,'#7c2d12',30,1),
    mkObj(11,'Files 2', 'files',   492,390, 60, 42, 7,1,'#fde68a',10,2),
    mkObj(12,'Desk',    'desk',     48,330,200, 82,20,5,'#92400e',40,1),
  ],
  kitchen:()=>[
    mkObj(1,'Fridge',   'fridge',  640, 85,110,330,22,4,'#e2e8f0',60,0),
    mkObj(2,'Cabinet',  'cabinet',  20, 88,120,200,22,4,'#d4b896',50,0),
    mkObj(3,'Cabinet 2','cabinet', 155, 88,290,130,18,3,'#d4b896',45,0),
    mkObj(4,'Table',    'table',   240,330,260, 75,22,5,'#c8944a',50,1),
    mkObj(5,'Chair',    'chair',   290,368, 78, 90,15,3,'#7c4a1e',25,1),
    mkObj(6,'Chair 2',  'chair',   438,368, 78, 90,15,3,'#7c4a1e',25,1),
    mkObj(7,'Files',    'files',   262,386, 65, 46, 7,1,'#fef3c7',10,2),
    mkObj(8,'Clock',    'clock',   590, 68, 65, 65, 8,1,'#fef9f0',20,0),
    mkObj(9,'Window',   'window',  460, 55,170,218,14,2,'#bae6fd',30,0),
    mkObj(10,'Lamp',    'lamp',    760,195, 32,178,11,1,'#fbbf24',25,1),
    mkObj(11,'Files 2', 'files',   492,390, 60, 42, 7,1,'#fef3c7',10,2),
    mkObj(12,'Plant',   'plant',   762,308, 52,160,12,2,'#15803d',18,1),
  ],
}

// ── Ragdoll factory ────────────────────────────────────────────────────────────
function mkRagdoll():RagdollBone{
  const skins=['#f4c28a','#e8a070','#c87840','#8d5524','#f0d0a0']
  const shirts=['#3a86ff','#e63946','#2a9d8f','#e9c46a','#8338ec','#ff6b6b']
  const pants=['#1d3557','#2d3748','#1a1a2e','#374151','#4a1942']
  return{
    x:810,y:FLOOR_Y-118,vx:0,vy:0,
    health:100,maxHealth:100,
    reactionTimer:0,bleedTimer:0,face:'normal',
    onGround:false,groundTime:0,
    exploding:false,explodeTimer:0,dead:false,rebornTimer:0,
    skinColor:skins[Math.floor(Math.random()*skins.length)],
    shirtColor:shirts[Math.floor(Math.random()*shirts.length)],
    pantsColor:pants[Math.floor(Math.random()*pants.length)],
    parts:[
      {name:'head',  ox:0,  oy:-88,vx:0,vy:0},
      {name:'neck',  ox:0,  oy:-68,vx:0,vy:0},
      {name:'chest', ox:0,  oy:-44,vx:0,vy:0},
      {name:'belly', ox:0,  oy:-18,vx:0,vy:0},
      {name:'hips',  ox:0,  oy:4,  vx:0,vy:0},
      {name:'lsho',  ox:-30,oy:-54,vx:0,vy:0},
      {name:'rsho',  ox:30, oy:-54,vx:0,vy:0},
      {name:'lelbow',ox:-34,oy:-28,vx:0,vy:0},
      {name:'relbow',ox:34, oy:-28,vx:0,vy:0},
      {name:'lhand', ox:-36,oy:-4, vx:0,vy:0},
      {name:'rhand', ox:36, oy:-4, vx:0,vy:0},
      {name:'lknee', ox:-16,oy:30, vx:0,vy:0},
      {name:'rknee', ox:16, oy:30, vx:0,vy:0},
      {name:'lfeet', ox:-16,oy:62, vx:0,vy:0},
      {name:'rfeet', ox:16, oy:62, vx:0,vy:0},
    ]
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
export function AngerReleaseGame(){
  const canvasRef=useRef<HTMLCanvasElement>(null)
  const[phase,setPhase]=useState<Phase>('start')
  // NOTE: there is deliberately NO score here. Rewarding volume of destruction
  // would reinforce the arousal-increasing behaviour that the anger literature
  // says does not reduce anger [Kjærvik & Bushman 2024; Bushman 2002]. Feedback
  // is keyed to the readiness score and the handoff instead.
  const[weapon,setWeapon]=useState<WeaponType>('bat')
  const[ammo,setAmmo]=useState({gun:30,shotgun:12,grenade:6,molotov:4,chainsaw:100})
  const[buddyHp,setBuddyHp]=useState(100)
  const[timeLeft,setTimeLeft]=useState(120)
  // live readiness (Novelty #1) — recomputed on every telemetry flush
  const[readiness,setReadiness]=useState(0.5)
  // reactive copy of sessionIdRef for the handoff <Link> (refs aren't safe to
  // read during render); set once the unified session is created
  const[handoffSessionId,setHandoffSessionId]=useState<string|null>(null)
  // score-driven handoff prompt (shown once calm-enough / control time reached)
  const[showHandoff,setShowHandoff]=useState(false)
  const[theme,setTheme]=useState<RoomTheme>('classroom')
  const[showThemePicker,setShowThemePicker]=useState(false)
  const[buddyName,setBuddyName]=useState('BUDDY')
  const[editingName,setEditingName]=useState(false)
  const[nameInput,setNameInput]=useState('BUDDY')
  const buddyNameRef=useRef('BUDDY')

  const phaseRef   =useRef<Phase>('start')
  const weaponRef  =useRef<WeaponType>('bat')
  const ammoRef    =useRef({gun:30,shotgun:12,grenade:6,molotov:4,chainsaw:100})
  const themeRef   =useRef<RoomTheme>('classroom')
  const mousePos   =useRef({x:-500,y:-500})
  const mouseDown  =useRef(false)
  const lastSaw    =useRef(0)

  const objsRef    =useRef<Obj3D[]>([])
  const ragRef     =useRef<RagdollBone>(mkRagdoll())
  const parts      =useRef<Particle[]>([])
  const shards     =useRef<Shard[]>([])
  const fires      =useRef<FirePool[]>([])
  const shakeRef   =useRef(0)
  const animRef    =useRef<number>(0)

  // ── CALMER unified-schema telemetry (Novelty #1 data path) ──────────────────
  // One `session` row per game; venting actions batched into venting_interaction;
  // a rolling intensity history drives the readiness-score trend, written to
  // emotional_state on every flush. Same session_id is carried into Module 2
  // (the chat) so the readiness score FUSES venting + text (+ biometrics).
  const sessionIdRef   =useRef<string|null>(null)
  const gameStartTimeRef=useRef<number>(0)
  const pendingInteractionsRef=useRef<{input_type:'tap'|'drag';intensity_score:number;target_label:string}[]>([])
  const intensityHistoryRef=useRef<number[]>([])
  const flushTimerRef  =useRef<ReturnType<typeof setInterval>|null>(null)
  // MRT hook: which decision rule offers the handoff this session — 'readiness'
  // (score crosses CALM_THRESHOLD) vs 'timer' (fixed-time control). Randomised
  // per session + logged, so the transition rule can be evaluated. [Klasnja 2015]
  const handoffConditionRef=useRef<'readiness'|'timer'>('readiness')

  useEffect(()=>{weaponRef.current=weapon},[weapon])
  useEffect(()=>{ammoRef.current=ammo},[ammo])
  useEffect(()=>{themeRef.current=theme},[theme])

  // ── Emitters ───────────────────────────────────────────────────────────────
  const emit=useCallback((x:number,y:number,type:Particle['type'],count:number,
    colors:string[],speed:number,size:number,life:number)=>{
    for(let i=0;i<count;i++){
      const a=Math.random()*Math.PI*2,s=speed*(0.3+Math.random()*0.9)
      parts.current.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-(type==='fire'?3:0),
        r:Math.max(0.5,size*(0.5+Math.random()*0.8)),
        color:colors[Math.floor(Math.random()*colors.length)],
        life:life*(0.6+Math.random()*0.8),maxLife:life,type,spin:(Math.random()-0.5)*0.3})
    }
  },[])

  const emitShard=useCallback((x:number,y:number,color:string,count:number)=>{
    for(let i=0;i<count;i++){
      const a=Math.random()*Math.PI*2,s=4+Math.random()*10
      const pts:[number,number][]=[]
      const n=3+Math.floor(Math.random()*3)
      for(let j=0;j<n;j++){const ra=(Math.PI*2/n)*j+Math.random()*0.5,rd=5+Math.random()*14;pts.push([Math.cos(ra)*rd,Math.sin(ra)*rd])}
      shards.current.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-5,angle:Math.random()*Math.PI*2,
        spin:(Math.random()-0.5)*0.28,pts,color,life:80+Math.random()*70,maxLife:150,bounced:false})
    }
  },[])

  // ── Ragdoll explode & reborn ────────────────────────────────────────────────
  const explodeRagdoll=useCallback(()=>{
    const rd=ragRef.current
    rd.exploding=true;rd.explodeTimer=60;rd.dead=true
    // Massive gore burst
    emit(rd.x,rd.y-40,'gore',60,['#cc0000','#880000','#ff0000','#400000','#ff4444'],18,10,90)
    emit(rd.x,rd.y-40,'fire',40,['#ff4400','#ff8800','#ffcc00'],14,8,55)
    emit(rd.x,rd.y-40,'spark',50,['#ffcc00','#fff','#ff9900'],16,5,40)
    emit(rd.x,rd.y-40,'smoke',30,['#333','#555','#222'],6,18,100)
    emitShard(rd.x,rd.y-40,'#cc0000',20)
    emitShard(rd.x,rd.y-40,'#888',14)
    // Throw limb parts everywhere
    rd.parts.forEach(p=>{
      p.vx=(Math.random()-0.5)*30
      p.vy=-(8+Math.random()*20)
    })
    fires.current.push({x:rd.x,y:FLOOR_Y,r:55,life:160,maxLife:160})
    shakeRef.current=25
    // Schedule reborn
    rd.rebornTimer=180
  },[emit,emitShard])

  // ── Hit logic ──────────────────────────────────────────────────────────────
  const applyHit=useCallback((cx:number,cy:number,radius:number,damage:number,w:WeaponType)=>{
    if(phaseRef.current!=='playing')return
    let hitAny=false

    const rd=ragRef.current
    if(!rd.dead){
      const dx=rd.x-cx,dy=(rd.y-40)-cy
      if(Math.sqrt(dx*dx+dy*dy)<radius+55){
        rd.health=Math.max(0,rd.health-damage*10)
        rd.vx+=(rd.x>cx?1:-1)*damage*5;rd.vy-=damage*5
        rd.reactionTimer=50;rd.bleedTimer=60
        rd.face=damage>=3?'dead':damage>=2?'hurt':'scared'
        rd.parts.forEach(p=>{p.vx+=(Math.random()-0.5)*damage*9;p.vy-=Math.random()*damage*6})
        emit(rd.x,rd.y-50,'blood',15+damage*5,['#cc0000','#990000','#ff0000','#800000'],8,6,65)
        emit(rd.x,rd.y-50,'spark',6,['#ffcc00','#ff9900'],5,3,20)
        setBuddyHp(rd.health)
        if(rd.health<=0 && !rd.exploding)explodeRagdoll()
        hitAny=true
      }
    }

    objsRef.current.forEach(obj=>{
      if(obj.broken)return
      if(cx>obj.x-radius&&cx<obj.x+obj.w+radius&&cy>obj.y-radius&&cy<obj.y+obj.h+radius){
        obj.health-=damage;obj.crackLevel=Math.floor((1-obj.health/obj.maxHealth)*4)
        obj.shakeX=9;obj.shakeY=5;obj.shakeTimer=14
        shakeRef.current=Math.max(shakeRef.current,damage*4)
        if(obj.type==='monitor'||obj.type==='tv'){
          emit(obj.x+obj.w/2,obj.y+obj.h/2,'glass',22,['#a8d8ea','#e0f7ff','#fff','#b0e0ff'],9,4,55)
          emitShard(obj.x+obj.w/2,obj.y+obj.h/2,'#a8d8ea',10)
        } else if(obj.type==='window'){
          emit(obj.x+obj.w/2,obj.y+obj.h/2,'glass',28,['#c5e8f7','#e8f7ff','#fff'],11,5,60)
          emitShard(obj.x+obj.w/2,obj.y+obj.h/2,'#d0eeff',14)
        } else {
          emit(obj.x+obj.w/2,obj.y+obj.h/2,'debris',14+damage*2,[obj.color,obj.top,'#ccc','#333'],7,5,55)
        }
        if(obj.health<=0){
          obj.broken=true
          emit(obj.x+obj.w/2,obj.y+obj.h/2,'debris',35+damage*5,[obj.color,obj.side,obj.top,'#fff','#333'],10,7,75)
          emitShard(obj.x+obj.w/2,obj.y+obj.h/2,obj.color,16)
          emit(obj.x+obj.w/2,obj.y+obj.h/2,'spark',24,['#ffcc00','#ff6600','#fff'],9,4,38)
          if(w==='molotov')fires.current.push({x:obj.x+obj.w/2,y:FLOOR_Y,r:50+Math.random()*25,life:230,maxLife:230})
          if(objsRef.current.filter(o=>!o.broken).length===0)setPhase('allClear')
        }
        hitAny=true
      }
    })
    if(hitAny)shakeRef.current=Math.max(shakeRef.current,damage*3)
  },[emit,emitShard,explodeRagdoll])

  // ── Input ──────────────────────────────────────────────────────────────────
  const getXY=useCallback((e:React.MouseEvent<HTMLCanvasElement>):[number,number]=>{
    const cv=canvasRef.current!,rect=cv.getBoundingClientRect()
    return[(e.clientX-rect.left)*(W/rect.width),(e.clientY-rect.top)*(H/rect.height)]
  },[])

  // Log one venting action into the rolling intensity history + pending batch.
  // intensity ≈ damage*10 (grenade is the most cathartic, so it scores highest);
  // this history feeds the readiness-score venting trend (Novelty #1).
  const logInteraction=useCallback((intensity:number,label:string,inputType:'tap'|'drag'='tap')=>{
    intensityHistoryRef.current.push(intensity)
    if(intensityHistoryRef.current.length>40)intensityHistoryRef.current.shift()
    pendingInteractionsRef.current.push({input_type:inputType,intensity_score:intensity,target_label:label})
  },[])

  const fireWeapon=useCallback((cx:number,cy:number)=>{
    if(phaseRef.current!=='playing')return
    const w=weaponRef.current,a=ammoRef.current
    if(w==='bat'){
      applyHit(cx,cy,52,1,w)
      logInteraction(10,'bat')
      emit(cx,cy,'spark',12,['#ffcc44','#ff9900','#fff'],7,4,25)
    } else if(w==='gun'){
      if(a.gun<=0)return;setAmmo(p=>({...p,gun:p.gun-1}))
      applyHit(cx,cy,22,2,w)
      logInteraction(20,'gun')
      emit(cx,cy,'spark',18,['#ffee44','#ff6600','#fff'],11,3,22)
    } else if(w==='shotgun'){
      if(a.shotgun<=0)return;setAmmo(p=>({...p,shotgun:p.shotgun-1}))
      for(let i=0;i<7;i++)applyHit(cx+(Math.random()-0.5)*70,cy+(Math.random()-0.5)*35,32,1.5,w)
      logInteraction(15,'shotgun')
      emit(cx,cy,'spark',35,['#ffee44','#ff6600','#fff','#ff4400'],13,4,32)
      shakeRef.current=Math.max(shakeRef.current,14)
    } else if(w==='grenade'){
      if(a.grenade<=0)return;setAmmo(p=>({...p,grenade:p.grenade-1}))
      applyHit(cx,cy,140,6,w)
      logInteraction(60,'grenade')
      for(let i=0;i<56;i++){const ang=(Math.PI*2*i)/56;parts.current.push({x:cx,y:cy,vx:Math.cos(ang)*18,vy:Math.sin(ang)*18,r:9,color:i%3===0?'#ff6600':i%3===1?'#ffcc00':'#fff',life:20,maxLife:20,type:'fire'})}
      emit(cx,cy,'fire',45,['#ff4400','#ff8800','#ffcc00','#fff'],14,12,55)
      emit(cx,cy,'smoke',30,['#555','#777','#999','#333'],5,16,95)
      emit(cx,cy,'debris',40,['#888','#555','#333','#ccc'],12,8,70)
      fires.current.push({x:cx,y:cy,r:80,life:210,maxLife:210})
      shakeRef.current=24
    } else if(w==='molotov'){
      if(a.molotov<=0)return;setAmmo(p=>({...p,molotov:p.molotov-1}))
      applyHit(cx,cy,85,3,w)
      logInteraction(30,'molotov')
      fires.current.push({x:cx,y:FLOOR_Y,r:65,life:290,maxLife:290})
      emit(cx,cy,'fire',32,['#ff4400','#ff8800','#ffcc00'],11,9,65)
    }
  },[applyHit,emit,logInteraction])

  const handleMouseDown=useCallback((e:React.MouseEvent<HTMLCanvasElement>)=>{
    mouseDown.current=true;const[cx,cy]=getXY(e);fireWeapon(cx,cy)
  },[getXY,fireWeapon])
  const handleMouseUp=useCallback(()=>{mouseDown.current=false},[])
  const handleMouseMove=useCallback((e:React.MouseEvent<HTMLCanvasElement>)=>{
    const[cx,cy]=getXY(e);mousePos.current={x:cx,y:cy}
    if(mouseDown.current&&weaponRef.current==='chainsaw'){
      const now=Date.now()
      if(now-lastSaw.current>75){
        lastSaw.current=now
        if(ammoRef.current.chainsaw>0){
          setAmmo(p=>({...p,chainsaw:p.chainsaw-1}))
          applyHit(cx,cy,38,1,'chainsaw')
          logInteraction(10,'chainsaw','drag')
          emit(cx,cy,'blood',9,['#cc0000','#990000','#ff2200'],7,4,32)
          emit(cx,cy,'spark',5,['#ff9900','#ffcc00'],5,3,16)
        }
      }
    }
  },[getXY,applyHit,emit,logInteraction])

  // ── Draw room object ────────────────────────────────────────────────────────
  const drawObj=useCallback((ctx:CanvasRenderingContext2D,obj:Obj3D,ts:number)=>{
    if(obj.broken)return
    let sx=0,sy=0
    if(obj.shakeTimer>0){sx=Math.sin(ts*0.5)*obj.shakeX*(obj.shakeTimer/14);sy=Math.cos(ts*0.6)*obj.shakeY*(obj.shakeTimer/14);obj.shakeTimer--}
    ctx.save();ctx.translate(sx,sy)

    switch(obj.type){
      case 'blackboard':{
        drawBox(ctx,obj.x-10,obj.y-10,obj.w+20,obj.h+20,obj.depth+5,'#5C3317',lighten('#5C3317',20),darken('#5C3317',20))
        drawBox(ctx,obj.x,obj.y,obj.w,obj.h,obj.depth,obj.color,obj.top,obj.side)
        ctx.globalAlpha=0.65;ctx.fillStyle='#fff';ctx.font='bold 15px "Courier New",monospace'
        ctx.fillText('Ch.7 Due MONDAY — No Excuses',obj.x+16,obj.y+44)
        ctx.font='12px "Courier New",monospace';ctx.globalAlpha=0.48
        ctx.fillText('E=mc²   pH=-log[H⁺]   ΔG=ΔH-TΔS',obj.x+16,obj.y+72)
        ctx.fillText('EXAM TOMORROW — 80% of grade',obj.x+16,obj.y+100)
        ctx.fillText('Detention for incomplete work.',obj.x+16,obj.y+128)
        ctx.globalAlpha=1
        if(obj.crackLevel>0){ctx.strokeStyle='rgba(255,255,255,0.55)';ctx.lineWidth=1.5
          for(let i=0;i<obj.crackLevel;i++){ctx.beginPath();ctx.moveTo(obj.x+44+i*88,obj.y+18);ctx.lineTo(obj.x+28+i*88,obj.y+62);ctx.lineTo(obj.x+56+i*88,obj.y+108);ctx.lineTo(obj.x+40+i*88,obj.y+145);ctx.stroke()}}
        break}
      case 'bookshelf':{
        drawBox(ctx,obj.x,obj.y,obj.w,obj.h,obj.depth,obj.color,obj.top,obj.side)
        const bc=['#e63946','#f4a261','#2a9d8f','#457b9d','#e9c46a','#6a4c93','#ff6b6b','#4ecdc4']
        for(let row=0;row<3;row++)for(let col=0;col<3;col++){
          const c=bc[(row*3+col)%bc.length]
          drawBox(ctx,obj.x+6+col*25,obj.y+20+row*70,20,58,7,c,lighten(c,22),darken(c,22))
        }
        ctx.strokeStyle='rgba(0,0,0,0.2)';ctx.lineWidth=2
        ;[obj.y+15,obj.y+88,obj.y+160].forEach(sy2=>{ctx.beginPath();ctx.moveTo(obj.x,sy2);ctx.lineTo(obj.x+obj.w,sy2);ctx.stroke()})
        break}
      case 'window':{
        const sky=ctx.createLinearGradient(obj.x,obj.y,obj.x,obj.y+obj.h*.7)
        sky.addColorStop(0,'#87ceeb');sky.addColorStop(1,'#b0e0ff')
        ctx.fillStyle=sky;ctx.fillRect(obj.x+6,obj.y+6,obj.w-12,obj.h-12)
        ctx.strokeStyle='#b0cfe0';ctx.lineWidth=6;ctx.strokeRect(obj.x+6,obj.y+6,obj.w-12,obj.h-12)
        ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(obj.x+obj.w/2+6,obj.y+6);ctx.lineTo(obj.x+obj.w/2+6,obj.y+obj.h-6);ctx.stroke()
        ctx.beginPath();ctx.moveTo(obj.x+6,obj.y+obj.h/2);ctx.lineTo(obj.x+obj.w-6,obj.y+obj.h/2);ctx.stroke()
        ctx.fillStyle='rgba(255,255,255,0.12)';ctx.beginPath();ctx.ellipse(obj.x+obj.w/2-22,obj.y+32,20,9,0.35,0,Math.PI*2);ctx.fill()
        if(obj.crackLevel>0){ctx.strokeStyle='rgba(160,210,255,0.85)';ctx.lineWidth=1.4
          for(let i=0;i<obj.crackLevel*3;i++){ctx.beginPath();const bx=obj.x+30+i*28,by=obj.y+28+(i%2)*55;ctx.moveTo(bx,by);ctx.lineTo(bx+(Math.random()-.5)*55,by+(Math.random()-.5)*55);ctx.stroke()}}
        break}
      case 'clock':{
        drawBox(ctx,obj.x,obj.y,obj.w,obj.h,obj.depth,obj.color,obj.top,obj.side)
        ctx.fillStyle=obj.color;ctx.beginPath();ctx.arc(obj.x+obj.w/2,obj.y+obj.h/2,obj.w/2-3,0,Math.PI*2);ctx.fill()
        ctx.strokeStyle=darken(obj.color,40);ctx.lineWidth=3;ctx.stroke()
        const sec=ts/1000;ctx.strokeStyle='#222';ctx.lineWidth=2.5;ctx.lineCap='round'
        ctx.beginPath();ctx.moveTo(obj.x+obj.w/2,obj.y+obj.h/2);ctx.lineTo(obj.x+obj.w/2+Math.cos(sec)*20,obj.y+obj.h/2+Math.sin(sec)*20);ctx.stroke()
        ctx.lineWidth=3.5;ctx.beginPath();ctx.moveTo(obj.x+obj.w/2,obj.y+obj.h/2);ctx.lineTo(obj.x+obj.w/2+Math.cos(sec/60)*14,obj.y+obj.h/2+Math.sin(sec/60)*14);ctx.stroke()
        break}
      case 'desk':case 'table':{
        drawBox(ctx,obj.x,obj.y,obj.w,16,obj.depth,obj.color,obj.top,obj.side)
        const lc=darken(obj.color,15)
        drawBox(ctx,obj.x+8,obj.y+16,14,obj.h-16,8,lc,lighten(lc,15),darken(lc,20))
        drawBox(ctx,obj.x+obj.w-22,obj.y+16,14,obj.h-16,8,lc,lighten(lc,15),darken(lc,20))
        if(obj.crackLevel>0){ctx.strokeStyle='rgba(0,0,0,0.4)';ctx.lineWidth=1
          for(let i=0;i<obj.crackLevel;i++){ctx.beginPath();ctx.moveTo(obj.x+38+i*52,obj.y);ctx.lineTo(obj.x+28+i*52,obj.y+16);ctx.stroke()}}
        break}
      case 'monitor':case 'tv':{
        if(obj.type==='monitor'){drawBox(ctx,obj.x+obj.w/2-7,obj.y+obj.h-2,14,9,4,'#444','#666','#222');drawBox(ctx,obj.x+obj.w/2-22,obj.y+obj.h+7,44,8,4,'#444','#666','#222')}
        drawBox(ctx,obj.x,obj.y,obj.w,obj.h-(obj.type==='monitor'?7:0),obj.depth,'#111827',lighten('#111827',18),darken('#111827',12))
        const sg=ctx.createLinearGradient(obj.x+6,obj.y+6,obj.x+obj.w-6,obj.y+obj.h-14)
        sg.addColorStop(0,'#0a1628');sg.addColorStop(1,'#0f2744');ctx.fillStyle=sg
        ctx.fillRect(obj.x+6,obj.y+6,obj.w-12,obj.h-22+(obj.type==='tv'?10:0))
        if(obj.type==='monitor'){
          ctx.fillStyle='#00ff41';ctx.font='8px monospace';ctx.fillText('> ACCESS DENIED',obj.x+10,obj.y+23)
          ctx.fillStyle='#ff4444';ctx.fillText('> ERROR 403',obj.x+10,obj.y+36)
          ctx.fillStyle='#00ff41';ctx.fillText('> C:\\GRADES\\F_student.txt',obj.x+10,obj.y+49)
        } else {
          ctx.fillStyle='#fff';ctx.font='bold 12px sans-serif';ctx.textAlign='center'
          ctx.fillText('BORING TV SHOW',obj.x+obj.w/2,obj.y+obj.h/2-8)
          ctx.font='10px sans-serif';ctx.fillStyle='#aaa';ctx.fillText('Channel 99 — Test Pattern',obj.x+obj.w/2,obj.y+obj.h/2+10)
          ctx.textAlign='left'
        }
        ctx.fillStyle='rgba(255,255,255,0.06)';ctx.fillRect(obj.x+6,obj.y+6,obj.w-12,12)
        ctx.fillStyle='#00ff88';ctx.beginPath();ctx.arc(obj.x+obj.w-10,obj.y+obj.h-13,4,0,Math.PI*2);ctx.fill()
        if(obj.crackLevel>0){ctx.strokeStyle='rgba(100,200,255,0.75)';ctx.lineWidth=1
          for(let i=0;i<obj.crackLevel*3;i++){ctx.beginPath();const cpx=obj.x+6+Math.random()*(obj.w-12),cpy=obj.y+6+Math.random()*(obj.h-22);ctx.moveTo(cpx,cpy);ctx.lineTo(cpx+(Math.random()-.5)*32,cpy+(Math.random()-.5)*32);ctx.stroke()}}
        break}
      case 'printer':{
        drawBox(ctx,obj.x,obj.y,obj.w,obj.h,obj.depth,obj.color,obj.top,obj.side)
        ctx.fillStyle='#b0b8c0';ctx.fillRect(obj.x+10,obj.y+15,obj.w-20,10)
        ctx.fillStyle='#999';ctx.fillRect(obj.x+18,obj.y+32,obj.w-36,4)
        ctx.fillStyle='#fff';ctx.fillRect(obj.x+24,obj.y+48,obj.w-48,6)
        ctx.fillStyle=obj.health>1?'#00ff88':'#ff3322';ctx.beginPath();ctx.arc(obj.x+obj.w-16,obj.y+13,5,0,Math.PI*2);ctx.fill()
        break}
      case 'chair':{
        drawBox(ctx,obj.x+12,obj.y,52,50,obj.depth,'#2a2a3a',lighten('#2a2a3a',22),darken('#2a2a3a',16))
        drawBox(ctx,obj.x+4,obj.y+44,obj.w-8,18,obj.depth,'#222',lighten('#222',22),darken('#222',16))
        ;[[8,62],[obj.w-17,62]].forEach(([lx,_])=>drawBox(ctx,obj.x+lx,obj.y+62,8,obj.h-62,5,'#555',lighten('#555',12),darken('#555',12)))
        break}
      case 'lamp':{
        drawBox(ctx,obj.x+12,obj.y+42,6,obj.h-62,4,'#b8860b',lighten('#b8860b',16),darken('#b8860b',22))
        drawBox(ctx,obj.x,obj.y+obj.h-20,obj.w,16,8,'#9a7400',lighten('#9a7400',16),darken('#9a7400',22))
        ctx.fillStyle='#f5e070';ctx.beginPath();ctx.moveTo(obj.x,obj.y+42);ctx.lineTo(obj.x+obj.w,obj.y+42);ctx.lineTo(obj.x+obj.w-8,obj.y);ctx.lineTo(obj.x+8,obj.y);ctx.closePath();ctx.fill()
        const lg=safeGrad(ctx,obj.x+obj.w/2,obj.y+42,0,65)
        lg.addColorStop(0,'rgba(255,240,150,0.45)');lg.addColorStop(1,'rgba(255,240,150,0)')
        ctx.fillStyle=lg;ctx.fillRect(obj.x-48,obj.y,obj.w+96,110)
        break}
      case 'sofa':{
        drawBox(ctx,obj.x,obj.y+30,obj.w,obj.h-30,obj.depth,obj.color,obj.top,obj.side)
        drawBox(ctx,obj.x,obj.y,30,obj.h,obj.depth,darken(obj.color,10),obj.top,darken(obj.color,30))
        drawBox(ctx,obj.x+obj.w-30,obj.y,30,obj.h,obj.depth,darken(obj.color,10),obj.top,darken(obj.color,30))
        drawBox(ctx,obj.x+30,obj.y,obj.w-60,30,obj.depth,darken(obj.color,5),obj.top,obj.side)
        ctx.fillStyle='rgba(255,255,255,0.08)';ctx.fillRect(obj.x+30,obj.y+32,obj.w-60,10)
        break}
      case 'cabinet':{
        drawBox(ctx,obj.x,obj.y,obj.w,obj.h,obj.depth,obj.color,obj.top,obj.side)
        ctx.strokeStyle=darken(obj.color,20);ctx.lineWidth=1.5
        for(let i=0;i<3;i++){ctx.strokeRect(obj.x+6,obj.y+8+i*(obj.h/3),obj.w-12,obj.h/3-4)}
        ctx.fillStyle=darken(obj.color,30)
        for(let i=0;i<3;i++){ctx.beginPath();ctx.arc(obj.x+obj.w/2,obj.y+obj.h/6+i*(obj.h/3),4,0,Math.PI*2);ctx.fill()}
        break}
      case 'fridge':{
        drawBox(ctx,obj.x,obj.y,obj.w,obj.h,obj.depth,'#e8ecf0',lighten('#e8ecf0',12),darken('#e8ecf0',20))
        ctx.strokeStyle='#ccc';ctx.lineWidth=2;ctx.strokeRect(obj.x+4,obj.y+4,obj.w-8,obj.h*0.38-4)
        ctx.strokeRect(obj.x+4,obj.y+obj.h*0.38+2,obj.w-8,obj.h*0.62-8)
        ctx.fillStyle='#999';ctx.fillRect(obj.x+obj.w-12,obj.y+obj.h*0.18-4,5,22)
        ctx.fillRect(obj.x+obj.w-12,obj.y+obj.h*0.6,5,22)
        ctx.fillStyle='#ff4444';ctx.beginPath();ctx.arc(obj.x+10,obj.y+10,4,0,Math.PI*2);ctx.fill()
        break}
      case 'plant':{
        drawBox(ctx,obj.x+obj.w/2-10,obj.y+obj.h-28,20,28,6,'#8B4513',lighten('#8B4513',16),darken('#8B4513',16))
        ctx.fillStyle=obj.color
        for(let i=0;i<8;i++){const a=(Math.PI*2/8)*i,px2=obj.x+obj.w/2+Math.cos(a)*18,py2=obj.y+obj.h-40+Math.sin(a)*15;ctx.beginPath();ctx.ellipse(px2,py2,10,18,a,0,Math.PI*2);ctx.fill()}
        ctx.fillStyle=lighten(obj.color,20);ctx.beginPath();ctx.ellipse(obj.x+obj.w/2,obj.y+obj.h-60,10,22,0,0,Math.PI*2);ctx.fill()
        break}
      case 'files':{
        const fcs=['#fff','#ffd6a5','#caffbf','#a0c4ff','#ffc6ff','#fdffb6']
        for(let i=4;i>=0;i--){ctx.fillStyle=fcs[i%fcs.length];ctx.strokeStyle='#bbb';ctx.lineWidth=0.5;ctx.fillRect(obj.x+i*2,obj.y+i*2,obj.w,obj.h);ctx.strokeRect(obj.x+i*2,obj.y+i*2,obj.w,obj.h)}
        ctx.fillStyle='#888';ctx.font='7px sans-serif';ctx.fillText('URGENT',obj.x+8,obj.y+14);ctx.fillText('REPORT Q4',obj.x+8,obj.y+26)
        break}
    }

    ctx.restore()
    if(!obj.broken&&obj.health<obj.maxHealth){
      const bw=obj.w*0.72,bh=5,bx=obj.x+obj.w*0.14,by=obj.y-12
      ctx.fillStyle='rgba(0,0,0,0.55)';ctx.fillRect(bx,by,bw,bh)
      ctx.fillStyle=`hsl(${(obj.health/obj.maxHealth)*115},90%,50%)`;ctx.fillRect(bx,by,bw*(obj.health/obj.maxHealth),bh)
      ctx.strokeStyle='rgba(255,255,255,0.25)';ctx.lineWidth=0.5;ctx.strokeRect(bx,by,bw,bh)
    }
  },[])

  // ── Draw ragdoll ────────────────────────────────────────────────────────────
  const drawRagdoll=useCallback((ctx:CanvasRenderingContext2D,rd:RagdollBone,ts:number)=>{
    // Reborn animation: fading in + rising
    if(rd.rebornTimer>0){
      rd.rebornTimer--
      if(rd.rebornTimer===120){
        // Respawn
        const fresh=mkRagdoll()
        rd.x=810;rd.y=FLOOR_Y-118
        rd.vx=0;rd.vy=0
        rd.health=100;rd.maxHealth=100
        rd.reactionTimer=0;rd.bleedTimer=0;rd.face='normal'
        rd.onGround=false;rd.groundTime=0
        rd.exploding=false;rd.explodeTimer=0;rd.dead=false
        rd.skinColor=fresh.skinColor;rd.shirtColor=fresh.shirtColor;rd.pantsColor=fresh.pantsColor
        rd.parts.forEach((p,i)=>{p.ox=fresh.parts[i].ox;p.oy=fresh.parts[i].oy;p.vx=0;p.vy=0})
        setBuddyHp(100)
        // Dramatic spawn flash
        emit(rd.x,rd.y-40,'spark',40,['#fff','#ffcc00','#ff9900'],14,5,45)
        emit(rd.x,rd.y-40,'fire',20,['#ff4400','#ff8800'],10,8,40)
        shakeRef.current=10
      }
      if(rd.rebornTimer>120){
        // Floating particles around spawn point during countdown
        if(Math.random()<0.3)emit(810,FLOOR_Y-80,'spark',3,['#fff','#adf','#88f'],6,4,30)
      }
      if(rd.dead)return
    }

    if(rd.exploding&&rd.explodeTimer>0){
      rd.explodeTimer--
      // Flying disconnected limbs
      rd.parts.forEach(p=>{
        p.vx*=0.92;p.vy*=0.92;p.vy+=0.5
        const px2=rd.x+p.ox+p.vx*3,py2=rd.y+p.oy+p.vy*3
        ctx.fillStyle=rd.skinColor;ctx.beginPath();ctx.arc(px2,py2,7,0,Math.PI*2);ctx.fill()
        ctx.strokeStyle='rgba(180,0,0,0.6)';ctx.lineWidth=1;ctx.stroke()
      })
      return
    }

    const wobble=rd.reactionTimer>0?Math.sin(ts*0.4)*6:0

    // Shadow
    ctx.fillStyle='rgba(0,0,0,0.22)';ctx.beginPath();ctx.ellipse(rd.x,FLOOR_Y-2,34+rd.groundTime*0.25,7,0,0,Math.PI*2);ctx.fill()

    // Blood pool
    if(rd.health<55&&rd.onGround){
      const br=Math.min(45,(55-rd.health)*0.9)
      const bg=safeGrad(ctx,rd.x+10,FLOOR_Y-2,0,safeR(br))
      bg.addColorStop(0,'rgba(140,0,0,0.72)');bg.addColorStop(1,'rgba(100,0,0,0)')
      ctx.fillStyle=bg;ctx.beginPath();ctx.ellipse(rd.x+10,FLOOR_Y-2,safeR(br),safeR(br*0.3),0,0,Math.PI*2);ctx.fill()
    }

    const pp=(name:string)=>{
      const p=rd.parts.find(q=>q.name===name)!
      return{x:rd.x+p.ox+p.vx*2.2+wobble,y:rd.y+p.oy+Math.abs(p.vy)*0.35}
    }
    const head=pp('head'),neck=pp('neck'),chest=pp('chest'),hips=pp('hips')
    const lsho=pp('lsho'),rsho=pp('rsho'),lelbow=pp('lelbow'),relbow=pp('relbow')
    const lhand=pp('lhand'),rhand=pp('rhand')
    const lknee=pp('lknee'),rknee=pp('rknee'),lf=pp('lfeet'),rf=pp('rfeet')

    const limb=(ax:number,ay:number,bx:number,by:number,col:string,lw:number)=>{
      ctx.strokeStyle=col;ctx.lineWidth=lw;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(bx,by);ctx.stroke()
    }

    // Back limbs
    limb(hips.x,hips.y,lknee.x,lknee.y,darken(rd.pantsColor,20),17)
    limb(lknee.x,lknee.y,lf.x,lf.y,darken(rd.pantsColor,20),14)
    limb(chest.x,chest.y,lelbow.x,lelbow.y,darken(rd.shirtColor,10),13)
    limb(lelbow.x,lelbow.y,lhand.x,lhand.y,darken(rd.skinColor,10),11)

    // Torso with depth shading
    ctx.lineWidth=24;ctx.strokeStyle=rd.shirtColor;ctx.lineCap='round'
    ctx.beginPath();ctx.moveTo(neck.x,neck.y);ctx.lineTo(hips.x,hips.y);ctx.stroke()
    ctx.lineWidth=12;ctx.strokeStyle='rgba(255,255,255,0.1)'
    ctx.beginPath();ctx.moveTo(neck.x-3,neck.y+3);ctx.lineTo(hips.x-3,hips.y+3);ctx.stroke()

    // Front limbs
    limb(hips.x,hips.y,rknee.x,rknee.y,rd.pantsColor,17)
    limb(rknee.x,rknee.y,rf.x,rf.y,rd.pantsColor,14)
    limb(chest.x,chest.y,relbow.x,relbow.y,rd.shirtColor,13)
    limb(relbow.x,relbow.y,rhand.x,rhand.y,rd.skinColor,11)

    // Shoes
    ;[[lf,lknee],[rf,rknee]].forEach(([f,k])=>{
      ctx.strokeStyle='#1a1a1a';ctx.lineWidth=11;ctx.lineCap='round'
      ctx.beginPath();ctx.moveTo(f.x,f.y);ctx.lineTo(f.x+(f.x-k.x)*0.25,f.y+5);ctx.stroke()
    })

    // Head with 3D shading
    ctx.fillStyle=rd.skinColor;ctx.beginPath();ctx.arc(head.x,head.y,24,0,Math.PI*2);ctx.fill()
    const hg=safeGrad(ctx,head.x-7,head.y-9,1,safeR(24))
    hg.addColorStop(0,'rgba(255,255,255,0.22)');hg.addColorStop(1,'rgba(0,0,0,0.18)')
    ctx.fillStyle=hg;ctx.beginPath();ctx.arc(head.x,head.y,24,0,Math.PI*2);ctx.fill()
    ctx.strokeStyle=darken(rd.skinColor,25);ctx.lineWidth=1.5;ctx.stroke()

    // Hair
    ctx.fillStyle='#2a1a00'
    ctx.beginPath();ctx.ellipse(head.x,head.y-18,22,12,0,Math.PI,0);ctx.fill()
    ctx.beginPath();ctx.arc(head.x-19,head.y-8,10,Math.PI*.25,Math.PI*1.25);ctx.fill()
    ctx.beginPath();ctx.arc(head.x+19,head.y-8,10,0,Math.PI*.75);ctx.fill()

    // Blood on face
    if(rd.health<60){ctx.fillStyle='rgba(180,0,0,0.72)';ctx.beginPath();ctx.ellipse(head.x+6,head.y-2,4,9,0.28,0,Math.PI*2);ctx.fill()}

    const el={x:head.x-9,y:head.y-4},er={x:head.x+9,y:head.y-4}
    if(rd.face==='dead'){
      ctx.strokeStyle='#222';ctx.lineWidth=2
      ;[el,er].forEach(e=>{ctx.beginPath();ctx.moveTo(e.x-6,e.y-6);ctx.lineTo(e.x+6,e.y+6);ctx.stroke();ctx.beginPath();ctx.moveTo(e.x+6,e.y-6);ctx.lineTo(e.x-6,e.y+6);ctx.stroke()})
    } else if(rd.face==='hurt'){
      ctx.fillStyle='#fff';[el,er].forEach(e=>{ctx.beginPath();ctx.arc(e.x,e.y,7.5,0,Math.PI*2);ctx.fill()})
      ctx.fillStyle='#222';[el,er].forEach(e=>{ctx.beginPath();ctx.arc(e.x+1,e.y+1,3.5,0,Math.PI*2);ctx.fill()})
    } else if(rd.face==='scared'){
      ctx.fillStyle='#fff';[el,er].forEach(e=>{ctx.beginPath();ctx.arc(e.x,e.y,6.5,0,Math.PI*2);ctx.fill()})
      ctx.fillStyle='#222';[el,er].forEach(e=>{ctx.beginPath();ctx.arc(e.x,e.y,3,0,Math.PI*2);ctx.fill()})
    } else {
      ctx.fillStyle='#2a1a00';[el,er].forEach(e=>{ctx.beginPath();ctx.arc(e.x,e.y,5,0,Math.PI*2);ctx.fill()})
      ctx.fillStyle='#fff';[el,er].forEach(e=>{ctx.beginPath();ctx.arc(e.x-1.5,e.y-1.5,2,0,Math.PI*2);ctx.fill()})
    }

    ctx.strokeStyle='#2a1a00';ctx.lineWidth=2;ctx.beginPath()
    if(rd.face==='dead'||rd.health<25)ctx.arc(head.x,head.y+10,6,Math.PI,0)
    else if(rd.face==='hurt')ctx.arc(head.x,head.y+10,7,0,Math.PI)
    else if(rd.face==='scared')ctx.arc(head.x,head.y+8,5,0,Math.PI)
    else{ctx.moveTo(head.x-7,head.y+10);ctx.lineTo(head.x+7,head.y+10)}
    ctx.stroke()

    // HP bar
    ctx.fillStyle='rgba(0,0,0,0.62)';ctx.fillRect(rd.x-34,rd.y-138,68,9)
    const hpW=68*Math.max(0,rd.health/100)
    ctx.fillStyle=rd.health>60?'#00e676':rd.health>30?'#ffab00':'#ff1744'
    ctx.fillRect(rd.x-34,rd.y-138,hpW,9)
    ctx.strokeStyle='rgba(255,255,255,0.35)';ctx.lineWidth=1;ctx.strokeRect(rd.x-34,rd.y-138,68,9)
    // Buddy name label — pill with dark bg for visibility
    const name=buddyNameRef.current||'BUDDY'
    ctx.font='bold 11px sans-serif';ctx.textAlign='center'
    const tw=ctx.measureText(name).width
    const px2=rd.x,py2=rd.y-153
    ctx.fillStyle='rgba(0,0,0,0.72)';ctx.beginPath();ctx.roundRect(px2-tw/2-7,py2-12,tw+14,16,5);ctx.fill()
    ctx.fillStyle='#ffffff';ctx.fillText(name,px2,py2);ctx.textAlign='left'
  },[emit])

  // ── Weapon cursor ──────────────────────────────────────────────────────────
  const drawCursor=useCallback((ctx:CanvasRenderingContext2D,mx:number,my:number,w:WeaponType)=>{
    ctx.save();ctx.translate(mx,my)
    ctx.strokeStyle='rgba(255,55,55,0.85)';ctx.lineWidth=1.5
    const cr=20
    ;[[-cr,-4],[-6,-4]].forEach(([x,_])=>{ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+cr-Math.abs(x)-2,0);ctx.stroke()})
    ctx.beginPath();ctx.moveTo(-cr,0);ctx.lineTo(-6,0);ctx.stroke()
    ctx.beginPath();ctx.moveTo(6,0);ctx.lineTo(cr,0);ctx.stroke()
    ctx.beginPath();ctx.moveTo(0,-cr);ctx.lineTo(0,-6);ctx.stroke()
    ctx.beginPath();ctx.moveTo(0,6);ctx.lineTo(0,cr);ctx.stroke()
    ctx.beginPath();ctx.arc(0,0,5,0,Math.PI*2);ctx.stroke()
    switch(w){
      case 'bat':ctx.rotate(-0.65);ctx.fillStyle='#c4a35a';ctx.fillRect(-5,-38,10,46);ctx.fillStyle='#8B6914';ctx.fillRect(-7,-44,14,12);break
      case 'gun':{
        // Pistol: compact body, short barrel, trigger guard
        ctx.fillStyle='#1a1a1a'
        ctx.fillRect(-14,-8,28,14) // main body
        ctx.fillRect(-14,-18,12,12) // grip (angled upward)
        ctx.fillRect(14,-5,12,8)   // short barrel
        ctx.fillStyle='#333'
        ctx.fillRect(-8,6,6,10)    // trigger guard bottom
        ctx.fillStyle='#ffcc00'
        ctx.fillRect(14,3,5,3)     // muzzle flash hint
        break
      }
      case 'shotgun':{
        // Shotgun: long double barrel, wide wooden stock
        ctx.fillStyle='#4a3000'
        ctx.fillRect(-34,-10,28,20) // thick wooden stock
        ctx.fillRect(-10,-6,18,12)  // receiver block
        ctx.fillStyle='#888'
        ctx.fillRect(8,-5,36,5)     // top barrel
        ctx.fillRect(8,1,36,5)      // bottom barrel (double barrel)
        ctx.fillStyle='#666'
        ctx.fillRect(38,-6,6,12)    // muzzle end
        ctx.fillStyle='#5a3800'
        ctx.fillRect(-34,-3,12,6)   // stock detail
        break
      }
      case 'grenade':ctx.fillStyle='#4a7c59';ctx.beginPath();ctx.arc(0,0,14,0,Math.PI*2);ctx.fill();ctx.fillStyle='#333';ctx.fillRect(-2,-21,4,12);ctx.strokeStyle='#ffcc00';ctx.lineWidth=1.5;ctx.beginPath();for(let i=0;i<4;i++){const a=(Math.PI/2)*i;ctx.moveTo(0,0);ctx.lineTo(Math.cos(a)*14,Math.sin(a)*14)}ctx.stroke();break
      case 'molotov':ctx.fillStyle='rgba(190,80,0,0.85)';ctx.beginPath();ctx.arc(0,6,13,0,Math.PI*2);ctx.fill();ctx.fillStyle='rgba(70,35,0,0.9)';ctx.fillRect(-4,-20,8,28);ctx.fillStyle='#ff4400';ctx.beginPath();ctx.arc(0,-20,6,0,Math.PI*2);ctx.fill();ctx.fillStyle='#ffcc00';ctx.beginPath();ctx.arc(0,-20,3,0,Math.PI*2);ctx.fill();break
      case 'chainsaw':ctx.fillStyle='#444';ctx.fillRect(-32,-8,44,16);ctx.fillStyle='#222';ctx.fillRect(12,-5,20,10);ctx.strokeStyle='#f90';ctx.lineWidth=2;ctx.beginPath();for(let i=0;i<5;i++){ctx.moveTo(12+i*4,-8);ctx.lineTo(14+i*4,-13);ctx.moveTo(12+i*4,8);ctx.lineTo(14+i*4,13)}ctx.stroke();break
    }
    ctx.restore()
  },[])

  // ── Game loop ──────────────────────────────────────────────────────────────
  useEffect(()=>{
    if(phaseRef.current==='start')return
    const canvas=canvasRef.current;if(!canvas)return
    const ctx=canvas.getContext('2d')!
    let last=0

    const loop=(ts:number)=>{
      const dt=Math.min((ts-last)/16.67,2.5);last=ts
      ctx.clearRect(0,0,W,H)

      // Screen shake
      let ox=0,oy=0
      if(shakeRef.current>0){ox=(Math.random()-.5)*shakeRef.current;oy=(Math.random()-.5)*shakeRef.current*0.6;shakeRef.current=Math.max(0,shakeRef.current-1.1)}
      ctx.save();ctx.translate(ox,oy)

      const t=THEMES[themeRef.current]

      // ── Ceiling ────────────────────────────────────────────────────────────
      const cg=ctx.createLinearGradient(0,0,0,CEIL_Y)
      cg.addColorStop(0,t.ceilColor);cg.addColorStop(1,darken(t.ceilColor,10))
      ctx.fillStyle=cg;ctx.fillRect(0,0,W,CEIL_Y)
      // Ceiling light strip
      ctx.fillStyle='rgba(255,255,230,0.95)';ctx.fillRect(W/2-90,0,180,14)
      const glow=safeGrad(ctx,W/2,0,8,safeR(320))
      glow.addColorStop(0,'rgba(255,255,210,0.22)');glow.addColorStop(1,'rgba(255,255,210,0)')
      ctx.fillStyle=glow;ctx.fillRect(0,0,W,FLOOR_Y)

      // ── Wall ──────────────────────────────────────────────────────────────
      const wg=ctx.createLinearGradient(0,CEIL_Y,0,FLOOR_Y)
      wg.addColorStop(0,t.wallTop);wg.addColorStop(0.55,darken(t.wallTop,5));wg.addColorStop(1,t.wallBot)
      ctx.fillStyle=wg;ctx.fillRect(0,CEIL_Y,W,FLOOR_Y-CEIL_Y)
      // Perspective grid lines
      ctx.strokeStyle='rgba(0,0,0,0.055)';ctx.lineWidth=1
      for(let col=0;col<=18;col++){
        const wx=col*(W/18)
        const[bx,by]=px3(wx,FLOOR_Y,28)
        ctx.beginPath();ctx.moveTo(wx,CEIL_Y);ctx.lineTo(bx,by);ctx.stroke()
      }
      for(let row=0;row<=10;row++){
        const wy=CEIL_Y+row*((FLOOR_Y-CEIL_Y)/10)
        ctx.beginPath();ctx.moveTo(0,wy);ctx.lineTo(W,wy);ctx.stroke()
      }
      // Baseboard
      const bb=ctx.createLinearGradient(0,FLOOR_Y-12,0,FLOOR_Y)
      bb.addColorStop(0,t.baseColor);bb.addColorStop(1,darken(t.baseColor,20))
      ctx.fillStyle=bb;ctx.fillRect(0,FLOOR_Y-11,W,11)

      // ── Floor ─────────────────────────────────────────────────────────────
      const fg=ctx.createLinearGradient(0,FLOOR_Y,0,H)
      fg.addColorStop(0,t.floorTop);fg.addColorStop(1,t.floorBot)
      ctx.fillStyle=fg;ctx.fillRect(0,FLOOR_Y,W,H-FLOOR_Y)
      ctx.strokeStyle='rgba(0,0,0,0.16)';ctx.lineWidth=2
      for(let fx=0;fx<W;fx+=75){const[px2,py2]=px3(fx,H,35);ctx.beginPath();ctx.moveTo(px2,py2);ctx.lineTo(fx,FLOOR_Y);ctx.stroke()}
      ctx.strokeStyle='rgba(0,0,0,0.08)';ctx.lineWidth=1
      for(let fr=0;fr<5;fr++){const fy=FLOOR_Y+fr*(H-FLOOR_Y)/5;ctx.beginPath();ctx.moveTo(0,fy);ctx.lineTo(W,fy);ctx.stroke()}
      // Floor ambient reflection
      const refl=ctx.createLinearGradient(0,FLOOR_Y,0,FLOOR_Y+50)
      refl.addColorStop(0,'rgba(255,255,255,0.07)');refl.addColorStop(1,'rgba(255,255,255,0)')
      ctx.fillStyle=refl;ctx.fillRect(0,FLOOR_Y,W,50)

      // ── Objects layer 0 ────────────────────────────────────────────────────
      objsRef.current.filter(o=>o.layer===0).forEach(o=>drawObj(ctx,o,ts))
      objsRef.current.filter(o=>o.layer===1).forEach(o=>drawObj(ctx,o,ts))

      // ── Fire pools ─────────────────────────────────────────────────────────
      fires.current=fires.current.filter(f=>{
        f.life-=dt
        const pct=Math.max(0,f.life/f.maxLife)
        for(let i=0;i<3;i++){
          const a=-Math.PI/2+(Math.random()-.5)*1.3
          parts.current.push({x:f.x+(Math.random()-.5)*f.r*0.75,y:f.y-Math.random()*12,
            vx:Math.cos(a)*2.2,vy:Math.sin(a)*3.5-2,r:7+Math.random()*8,
            color:Math.random()>.5?'#ff4400':'#ff8c00',life:28+Math.random()*20,maxLife:48,type:'fire'})
        }
        const fgrad=safeGrad(ctx,f.x,f.y,0,safeR(f.r*pct))
        fgrad.addColorStop(0,`rgba(255,110,0,${0.55*pct})`);fgrad.addColorStop(1,'rgba(255,50,0,0)')
        ctx.fillStyle=fgrad;ctx.beginPath();ctx.ellipse(f.x,f.y,safeR(f.r*pct),safeR(f.r*pct*0.22),0,0,Math.PI*2);ctx.fill()
        return f.life>0
      })

      // ── Shards ─────────────────────────────────────────────────────────────
      shards.current=shards.current.filter(s=>{
        s.x+=s.vx*dt;s.y+=s.vy*dt;s.vy+=0.52*dt;s.vx*=0.98
        if(!s.bounced&&s.y>FLOOR_Y){s.y=FLOOR_Y;s.vy*=-0.28;s.vx*=0.62;s.spin*=0.45;s.bounced=true}
        s.angle+=s.spin*dt;s.life-=dt
        const a=Math.max(0,s.life/s.maxLife)
        ctx.save();ctx.translate(s.x,s.y);ctx.rotate(s.angle);ctx.globalAlpha=a*0.88
        ctx.fillStyle=s.color;ctx.strokeStyle='rgba(255,255,255,0.45)';ctx.lineWidth=0.5
        ctx.beginPath();ctx.moveTo(s.pts[0][0],s.pts[0][1]);s.pts.forEach(([px2,py2])=>ctx.lineTo(px2,py2));ctx.closePath();ctx.fill();ctx.stroke()
        ctx.restore();ctx.globalAlpha=1
        return s.life>0
      })

      // Front layer objects
      objsRef.current.filter(o=>o.layer===2).forEach(o=>drawObj(ctx,o,ts))

      // ── Ragdoll physics ────────────────────────────────────────────────────
      const rd=ragRef.current
      if(!rd.dead||rd.explodeTimer>0){
        rd.vy+=0.62*dt;rd.x+=rd.vx*dt;rd.y+=rd.vy*dt;rd.vx*=0.87;rd.vy*=0.91
        if(rd.y>FLOOR_Y-10){rd.y=FLOOR_Y-10;rd.vy*=-0.14;rd.onGround=true;rd.groundTime+=dt}else{rd.onGround=false;rd.groundTime=0}
        if(rd.x<65)rd.x=65;if(rd.x>W-65)rd.x=W-65
        if(rd.reactionTimer>0)rd.reactionTimer-=dt;else if(rd.face!=='normal'&&rd.face!=='dead')rd.face='normal'
        rd.parts.forEach(p=>{p.vx*=0.78;p.vy*=0.78})
        if(rd.bleedTimer>0){
          rd.bleedTimer-=dt
          if(Math.random()<0.35)parts.current.push({x:rd.x+(Math.random()-.5)*22,y:rd.y-42-Math.random()*32,vx:(Math.random()-.5)*2.2,vy:2.2+Math.random()*3.5,r:Math.max(0.5,3+Math.random()*3),color:'#aa0000',life:28,maxLife:28,type:'blood'})
        }
      }
      drawRagdoll(ctx,rd,ts)

      // ── Particles ──────────────────────────────────────────────────────────
      parts.current=parts.current.filter(p=>{
        p.x+=p.vx*dt;p.y+=p.vy*dt
        if(p.type==='fire'||p.type==='smoke')p.vy-=0.08*dt;else p.vy+=0.28*dt
        p.vx*=0.96;p.life-=dt
        const a=Math.max(0,p.life/p.maxLife);if(a<=0)return false
        if(p.type==='smoke'){
          const sr=Math.max(0.1,p.r*(2.2-a))
          ctx.globalAlpha=a*0.38;ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,sr,0,Math.PI*2);ctx.fill()
        } else if(p.type==='blood'||p.type==='gore'){
          if(p.y>FLOOR_Y-2){p.y=FLOOR_Y-2;p.vy*=-0.08;p.vx*=0.45}
          ctx.globalAlpha=Math.min(0.92,a*1.6);ctx.fillStyle=p.color
          const sr=Math.max(0.1,p.r);ctx.beginPath();ctx.arc(p.x,p.y,sr,0,Math.PI*2);ctx.fill()
        } else if(p.type==='fire'){
          const fR=safeR(p.r*(1+a*0.6))
          const fg2=safeGrad(ctx,p.x,p.y,0,fR)
          fg2.addColorStop(0,'rgba(255,255,200,0.95)');fg2.addColorStop(0.4,p.color);fg2.addColorStop(1,'rgba(255,50,0,0)')
          ctx.globalAlpha=a*0.82;ctx.fillStyle=fg2;ctx.beginPath();ctx.arc(p.x,p.y,fR,0,Math.PI*2);ctx.fill()
        } else if(p.type==='debris'){
          if(p.y>FLOOR_Y){p.y=FLOOR_Y;p.vy*=-0.18;p.vx*=0.6}
          ctx.save();ctx.translate(p.x,p.y);if(p.spin)ctx.rotate(p.spin*p.life*0.08);ctx.globalAlpha=a;ctx.fillStyle=p.color;ctx.fillRect(-p.r,-p.r*.5,p.r*2,p.r);ctx.restore()
        } else if(p.type==='glass'){
          ctx.globalAlpha=a*0.72;ctx.fillStyle=p.color
          const sr=Math.max(0.1,p.r*a);ctx.beginPath();ctx.arc(p.x,p.y,sr,0,Math.PI*2);ctx.fill()
        } else {
          const sr=Math.max(0.1,p.r*a);ctx.globalAlpha=a;ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,sr,0,Math.PI*2);ctx.fill()
        }
        ctx.globalAlpha=1
        return p.life>0
      })

      drawCursor(ctx,mousePos.current.x,mousePos.current.y,weaponRef.current)
      ctx.restore()
      animRef.current=requestAnimationFrame(loop)
    }
    animRef.current=requestAnimationFrame(loop)
    return()=>{if(animRef.current)cancelAnimationFrame(animRef.current)}
  },[phase,drawObj,drawRagdoll,drawCursor])

  // ── CALMER telemetry helpers ────────────────────────────────────────────────
  const createGameSession=useCallback(async():Promise<string|null>=>{
    const supabase=createClient()
    const{data:{user}}=await supabase.auth.getUser()
    if(!user)return null
    const{data,error}=await supabase.from('session').insert({user_id:user.id,status:'active',mrt_condition:handoffConditionRef.current}).select('id').single()
    if(error){console.error('[game] failed to create unified session:',error.message);return null}
    return data.id as string
  },[])

  const flushVentingInteractions=useCallback(async()=>{
    if(!sessionIdRef.current)return
    const batch=pendingInteractionsRef.current
    pendingInteractionsRef.current=[]

    const supabase=createClient()
    const sid=sessionIdRef.current

    if(batch.length>0){
      const rows=batch.map(b=>({session_id:sid,input_type:b.input_type,intensity_score:b.intensity_score,target_label:b.target_label}))
      const{error}=await supabase.from('venting_interaction').insert(rows)
      if(error)console.error('[game] failed to save venting_interaction:',error.message)
    }else{
      // IDLE TICK. Going quiet IS a decline in venting intensity, and it is the
      // *largest* decline available. Before this, an empty batch returned early,
      // so the trend froze the moment the user stopped — meaning the readiness
      // arm could never fire for the user who calmed down most completely, and
      // the trajectory plateaued exactly where it should climb fastest.
      // Push a zero sample so quiet time moves the trend instead of pausing it.
      intensityHistoryRef.current.push(0)
      if(intensityHistoryRef.current.length>40)intensityHistoryRef.current.shift()
    }

    // Recompute readiness from the rolling intensity trend after each flush.
    // Venting-only for now; it fuses with biometric/text automatically once
    // those modules write emotional_state against the same session_id.
    const{readinessScore,stressLevel,signalsUsed}=computeReadinessScore({
      // Pass the WHOLE history, not a slice — trendSignal measures decline from
      // the session peak and does its own windowing. Slicing here hid the peak
      // and made a settled user look "flat" again.
      ventingIntensities:intensityHistoryRef.current,
      sessionDurationSeconds:(Date.now()-gameStartTimeRef.current)/1000,
    })
    setReadiness(readinessScore)
    // score-driven decision point: offer reflection once calm-enough
    if(handoffConditionRef.current==='readiness'&&readinessScore>=CALM_THRESHOLD)setShowHandoff(true)
    const{error:stateError}=await supabase.from('emotional_state').insert({
      session_id:sid,
      readiness_score:readinessScore,
      stress_level:stressLevel,
      signals_used:signalsUsed,
      source:'interaction',
    })
    if(stateError)console.error('[game] failed to update emotional_state:',stateError.message)
  },[])

  // ── Game control ────────────────────────────────────────────────────────────
  const startGame=useCallback(async(th:RoomTheme=theme)=>{
    setTimeLeft(MAX_VENT_SECONDS)
    setAmmo({gun:30,shotgun:12,grenade:6,molotov:4,chainsaw:100})
    ammoRef.current={gun:30,shotgun:12,grenade:6,molotov:4,chainsaw:100}
    setBuddyHp(100)
    setTheme(th);themeRef.current=th
    objsRef.current=ROOM_OBJS[th]()
    ragRef.current=mkRagdoll()
    parts.current=[];shards.current=[];fires.current=[]
    shakeRef.current=0
    setWeapon('bat');weaponRef.current='bat'
    setShowThemePicker(false)

    // reset telemetry, then start the session + flush loop
    sessionIdRef.current=null
    gameStartTimeRef.current=Date.now()
    pendingInteractionsRef.current=[]
    intensityHistoryRef.current=[]
    setReadiness(0.5)
    setHandoffSessionId(null)
    setShowHandoff(false)
    // randomise the handoff decision rule for this session (MRT hook)
    handoffConditionRef.current = Math.random() < 0.5 ? 'readiness' : 'timer'

    setPhase('playing');phaseRef.current='playing'

    // create the session after play starts so no network wait blocks the UI —
    // early actions are captured in pendingInteractionsRef and flush once the id lands
    sessionIdRef.current=await createGameSession()
    setHandoffSessionId(sessionIdRef.current)
    if(flushTimerRef.current)clearInterval(flushTimerRef.current)
    flushTimerRef.current=setInterval(flushVentingInteractions,3000)
  },[theme,createGameSession,flushVentingInteractions])

  const resetRoom=useCallback(()=>{
    objsRef.current=ROOM_OBJS[themeRef.current]()
    ragRef.current=mkRagdoll()
    parts.current=[];shards.current=[];fires.current=[]
    setBuddyHp(100)
    setAmmo({gun:30,shotgun:12,grenade:6,molotov:4,chainsaw:100})
    ammoRef.current={gun:30,shotgun:12,grenade:6,molotov:4,chainsaw:100}
    setPhase('playing');phaseRef.current='playing'
  },[])

  // NB: the legacy game_sessions write was removed — the game now persists to
  // the unified schema (session / venting_interaction / emotional_state) via
  // the telemetry helpers above. Dashboard/analytics reconciliation is P6.
  useEffect(()=>{
    if(phase!=='playing')return
    const t=setInterval(()=>setTimeLeft(prev=>{
      if(prev<=1){setPhase('over');phaseRef.current='over';return 0}
      return prev-1
    }),1000)
    return()=>clearInterval(t)
  },[phase])

  // Control arm: offer the handoff at a fixed elapsed time (the readiness arm
  // offers it when the score crosses CALM_THRESHOLD, in flushVentingInteractions).
  useEffect(()=>{
    if(phase!=='playing')return
    if(handoffConditionRef.current==='timer'&&(MAX_VENT_SECONDS-timeLeft)>=TIMER_HANDOFF_SECONDS)setShowHandoff(true)
  },[phase,timeLeft])

  // Final telemetry flush when the session ends (timer out or "End Session").
  // NB: we intentionally do NOT close the unified `session` here — it stays
  // 'active' so Module 2 (chat) can keep writing to the SAME session, making
  // one session span venting AND reflection (the cross-module fusion claim).
  useEffect(()=>{
    if(phase!=='over')return
    if(flushTimerRef.current){clearInterval(flushTimerRef.current);flushTimerRef.current=null}
    flushVentingInteractions()
  },[phase,flushVentingInteractions])

  useEffect(()=>()=>{if(flushTimerRef.current)clearInterval(flushTimerRef.current)},[])

  // ── Weapon config ───────────────────────────────────────────────────────────
  const wCfg:{[k in WeaponType]:{emoji:string,label:string,color:string,count:number|string}}={
    bat:     {emoji:'🪓',label:'Bat',    color:'#f4a261',count:'∞'},
    gun:     {emoji:'🔫',label:'Pistol', color:'#e63946',count:ammo.gun},
    shotgun: {emoji:'💥',label:'Shotgun',color:'#9b2226',count:ammo.shotgun},
    grenade: {emoji:'💣',label:'Grenade',color:'#ff6b00',count:ammo.grenade},
    molotov: {emoji:'🔥',label:'Molotov',color:'#dc2f02',count:ammo.molotov},
    chainsaw:{emoji:'⚙️',label:'Saw',   color:'#555',   count:ammo.chainsaw},
  }

  return(
    <div className="space-y-3" style={{fontFamily:"'Segoe UI',system-ui,sans-serif"}}>

      {/* Stats */}
      {/* No score / destruction-volume counters here — see the note at the top
          of this component. Feedback is readiness-keyed (the Calm Meter). */}
      <div className="grid grid-cols-3 gap-2">
        {([
          {label:'Time',     value:`${timeLeft}s`, color:'#60a5fa'},
          {label:'Buddy HP', value:`${buddyHp}%`,  color:buddyHp>60?'#4ade80':buddyHp>30?'#fb923c':'#f87171'},
          {label:'Room',     value:THEMES[theme].emoji+' '+THEMES[theme].label,color:'#c084fc'},
        ] as {label:string,value:string|number,color:string}[]).map(s=>(
          <div key={s.label} className="rounded-lg border border-white/10 bg-black/40 p-2 text-center backdrop-blur-sm">
            <p className="text-sm font-bold truncate" style={{color:s.color}}>{s.value}</p>
            <p className="text-[10px] text-white/45 uppercase tracking-wide">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Weapon + room bar */}
      {phase==='playing'&&(
        <div className="flex gap-1.5 justify-between items-center">
          <div className="flex gap-1.5 flex-wrap">
            {(Object.entries(wCfg) as [WeaponType,typeof wCfg['bat']][]).map(([key,cfg])=>{
              const empty=key!=='bat'&&(ammo as any)[key]<=0
              return(
                <button key={key} onClick={()=>setWeapon(key)} disabled={empty}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-bold text-xs transition-all border ${weapon===key?'border-white/80 scale-105 shadow-lg text-white':'border-white/12 text-white/45 hover:border-white/35 hover:text-white/75'} ${empty?'opacity-25 cursor-not-allowed':''}`}
                  style={{background:weapon===key?cfg.color+'e0':'rgba(0,0,0,0.48)'}}>
                  <span className="text-sm">{cfg.emoji}</span>
                  <span>{cfg.label}</span>
                  <span className="ml-0.5 opacity-60 text-[10px]">{cfg.count}</span>
                </button>
              )
            })}
          </div>
          <div className="flex gap-2 items-center">
            {editingName?(
              <div className="flex items-center gap-1">
                <input
                  autoFocus
                  value={nameInput}
                  onChange={e=>setNameInput(e.target.value.slice(0,16))}
                  onKeyDown={e=>{
                    if(e.key==='Enter'){const n=nameInput.trim()||'BUDDY';setBuddyName(n);buddyNameRef.current=n;setEditingName(false)}
                    if(e.key==='Escape')setEditingName(false)
                  }}
                  className="w-28 px-2 py-1 rounded-lg border border-white/40 bg-black/60 text-white text-xs font-bold outline-none focus:border-white/70"
                  placeholder="Buddy name..."
                />
                <button onClick={()=>{const n=nameInput.trim()||'BUDDY';setBuddyName(n);buddyNameRef.current=n;setEditingName(false)}}
                  className="px-2 py-1 rounded-lg bg-white/20 text-white text-xs font-bold hover:bg-white/30 transition-all">✓</button>
              </div>
            ):(
              <button onClick={()=>{setNameInput(buddyName);setEditingName(true)}}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/20 bg-black/40 text-white/60 hover:text-white hover:border-white/40 text-xs font-semibold transition-all">
                ✏️ <span className="max-w-[80px] truncate">{buddyName}</span>
              </button>
            )}
            <button onClick={()=>setShowThemePicker(p=>!p)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/20 bg-black/40 text-white/60 hover:text-white hover:border-white/40 text-xs font-semibold transition-all">
              🏠 Change Room
            </button>
          </div>
        </div>
      )}

      {/* Calm Meter + score-driven handoff (Novelty #1, user-facing) */}
      {phase==='playing'&&(
        <div className="rounded-xl border border-white/12 bg-black/40 p-3 backdrop-blur-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-white/55">Calm Meter</span>
            <span className="text-xs font-bold" style={{color:`hsl(${Math.round(readiness*120)},80%,60%)`}}>{Math.round(readiness*100)}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full transition-all duration-700 ease-out"
              style={{width:`${Math.round(readiness*100)}%`,backgroundColor:`hsl(${Math.round(readiness*120)},80%,55%)`}}/>
          </div>
          {showHandoff&&(
            <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2">
              <span className="text-xs text-emerald-200">You seem to be finding some calm — ready to reflect on it?</span>
              <Link href={handoffSessionId?`/chat?session=${handoffSessionId}`:'/chat'}>
                <span className="whitespace-nowrap rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-black hover:bg-emerald-400 transition-all">Talk it through 🕊️</span>
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Theme picker dropdown */}
      {showThemePicker&&(
        <div className="flex gap-2 justify-center flex-wrap p-3 rounded-xl border border-white/15 bg-black/50">
          {(Object.entries(THEMES) as [RoomTheme,Theme][]).map(([key,t])=>(
            <button key={key} onClick={()=>{setTheme(key);themeRef.current=key;objsRef.current=ROOM_OBJS[key]();parts.current=[];shards.current=[];fires.current=[];setShowThemePicker(false)}}
              className={`flex flex-col items-center gap-0.5 px-4 py-2.5 rounded-lg border text-sm font-bold transition-all ${theme===key?'border-white text-white bg-white/15':'border-white/15 text-white/55 hover:border-white/35 hover:bg-white/8'}`}>
              <span className="text-2xl">{t.emoji}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Canvas */}
      <div className="relative overflow-hidden rounded-xl border border-white/10 shadow-2xl">
        <canvas ref={canvasRef} width={W} height={H}
          onMouseDown={handleMouseDown} onMouseUp={handleMouseUp}
          onMouseMove={handleMouseMove} onMouseLeave={handleMouseUp}
          className="w-full block"
          style={{aspectRatio:`${W}/${H}`,cursor:'none',background:'#1a1408'}}
        />

        {/* START screen */}
        {phase==='start'&&(
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/88 backdrop-blur-md">
            <div className="text-6xl mb-3">💢</div>
            <h2 className="mb-1 text-4xl font-black text-white tracking-tight">RAGE ROOM</h2>
            <p className="mb-5 text-white/55 text-center max-w-md text-sm">Smash everything. Beat the buddy to a pulp. Blow it all up.<br/>Let. It. Out.</p>
            <p className="mb-4 text-white/40 text-xs font-semibold uppercase tracking-widest">Choose Your Room</p>
            <div className="mb-6 grid grid-cols-4 gap-3">
              {(Object.entries(THEMES) as [RoomTheme,Theme][]).map(([key,t])=>(
                <button key={key} onClick={()=>startGame(key)}
                  className="flex flex-col items-center gap-2 bg-white/8 hover:bg-white/16 border border-white/15 hover:border-white/40 rounded-xl p-4 transition-all group">
                  <span className="text-4xl">{t.emoji}</span>
                  <span className="text-sm font-bold text-white/80 group-hover:text-white">{t.label}</span>
                </button>
              ))}
            </div>
            <p className="text-white/30 text-xs">6 weapons · ragdoll buddy · explodes & respawns · unlimited resets</p>
          </div>
        )}

        {/* ALL CLEAR */}
        {phase==='allClear'&&(
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/82 backdrop-blur-md">
            <div className="text-6xl mb-3">🔥</div>
            <h2 className="text-4xl font-black text-orange-400 mb-2">DESTROYED!</h2>
            <p className="text-white/60 mb-7 text-center text-sm">Every last thing is wrecked. More?</p>
            <div className="flex gap-3 mb-4">
              <Button onClick={resetRoom} className="bg-red-600 hover:bg-red-700 text-white font-black px-8 text-base">🔄 Reset Room</Button>
              <button onClick={()=>setShowThemePicker(p=>!p)} className="px-5 py-2 rounded-lg border border-white/30 text-white/70 hover:text-white text-sm font-semibold transition-all">🏠 New Room</button>
            </div>
            {showThemePicker&&(
              <div className="flex gap-2 mt-2">
                {(Object.entries(THEMES) as [RoomTheme,Theme][]).map(([key,t])=>(
                  <button key={key} onClick={()=>{setTheme(key);themeRef.current=key;resetRoom();setShowThemePicker(false)}}
                    className="flex flex-col items-center gap-1 px-3 py-2 rounded-lg border border-white/20 bg-white/10 hover:bg-white/20 text-sm font-bold text-white/75 transition-all">
                    <span className="text-xl">{t.emoji}</span><span>{t.label}</span>
                  </button>
                ))}
              </div>
            )}
            <button onClick={()=>{setPhase('over');phaseRef.current='over'}} className="mt-4 text-white/35 text-xs hover:text-white/60 transition-all">End Session →</button>
          </div>
        )}

        {/* GAME OVER */}
        {phase==='over'&&(
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/88 backdrop-blur-md">
            <div className="text-5xl mb-3">🧹</div>
            <h2 className="text-3xl font-black text-white mb-1">SESSION DONE</h2>
            <p className="text-white/45 mb-7 text-sm">Feel that weight lift?</p>
            {/* Closing feedback is about the regulation outcome and the
                handoff — NOT about how much was destroyed. */}
            <div className="grid grid-cols-2 gap-10 mb-8 text-center">
              <div>
                <p className="text-5xl font-black" style={{color:`hsl(${Math.round(readiness*120)},80%,60%)`}}>{Math.round(readiness*100)}%</p>
                <p className="text-xs text-white/45 mt-1">CALM REACHED</p>
              </div>
              <div>
                <p className="text-5xl font-black text-sky-400">{MAX_VENT_SECONDS-timeLeft}s</p>
                <p className="text-xs text-white/45 mt-1">TIME SPENT</p>
              </div>
            </div>
            {/* Transition system (Novelty #1), user-facing half: the message is
                keyed to the final readiness score rather than static copy, and
                Find Peace carries the SAME session_id into chat so readiness
                keeps fusing across the vent→reflect handoff. */}
            <p className="max-w-sm text-center text-sm text-white/55 mb-5">
              {readiness>=0.66
                ?"You're reading calmer than when you started — a good moment to talk it through."
                :readiness>=0.33
                ?'Still processing some of it — the AI therapist can help you unpack what came up.'
                :"That was a lot to let out. No rush — the AI therapist is there when you're ready."}
            </p>
            <div className="flex gap-3">
              <Button onClick={()=>startGame(theme)} className="bg-red-600 hover:bg-red-700 text-white font-bold">Again 💢</Button>
              <Link href={handoffSessionId?`/chat?session=${handoffSessionId}`:'/chat'}>
                <Button className={`bg-blue-700 hover:bg-blue-800 text-white font-bold${readiness>=0.66?' animate-pulse':''}`}>Find Peace 🕊️</Button>
              </Link>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-white/8 bg-black/30 px-4 py-2">
        <p className="text-xs text-white/38"><span className="text-white/55 font-semibold">Tip:</span> Grenade &amp; Molotov for mass destruction. Hold mouse for Chainsaw. Buddy explodes at 0 HP and respawns. After venting, talk to the AI therapist.</p>
      </div>
    </div>
  )
}
