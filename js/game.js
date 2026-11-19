'use strict';
/* =====================================================================
   고양이 우편배달부 — 프로토타입
   구조 메모 (뱀서라이크 확장용):
   - STAGES   : 스테이지 데이터(길이, 속도, 장애물 가중치). 새 스테이지 = 데이터 추가.
   - OB       : 장애물/적 정의 레지스트리. enemy:true 는 요괴(적) 계열.
   - WEAPONS  : 자동 공격 무기 레지스트리 (update(lv,dt)). 무기 추가 = 항목 추가.
   - UPGRADES : 레벨업 선택지 레지스트리. 경험치 → 레벨업 → 3지선다.
   - 엔티티 배열(ents/picks/shots/parts)과 update/render 분리.
   서바이버 모드로 바꿀 때는 플레이어 이동을 2D로 바꾸고 spawner만 웨이브식으로 교체하면 된다.
   ===================================================================== */
const W=960,H=540,GROUND=440,PX=170,GRAV=2700,JUMPV=930,AIRV=800;
const TAU=Math.PI*2, OL='#2b2233';
const $=id=>document.getElementById(id);
const cv=$('cv'); let ctx=cv.getContext('2d');
const rand=(a,b)=>a+Math.random()*(b-a);
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const lerp=(a,b,t)=>a+(b-a)*t;
const hash=n=>{const s=Math.sin(n*127.1+311.7)*43758.5453;return s-Math.floor(s);};
let scale=1,dpr=1;

/* ---------------- 저장 (최고 점수) ---------------- */
function loadBest(){return Ops.save.get().best||0;}
function saveBest(v){Ops.save.set({best:v});}

/* ---------------- 사운드 ---------------- */
const SFX={ac:null,muted:!!Ops.save.get().muted,
  init(){if(!this.ac){try{this.ac=new (window.AudioContext||window.webkitAudioContext)();}catch(e){}} if(this.ac&&this.ac.state==='suspended')this.ac.resume();},
  tone(f,d,type='square',vol=.05,slide=0,delay=0){if(this.muted||!this.ac)return;const t=this.ac.currentTime+delay,o=this.ac.createOscillator(),g=this.ac.createGain();
    o.type=type;o.frequency.setValueAtTime(f,t);if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(40,f+slide),t+d);
    g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.0001,t+d);o.connect(g).connect(this.ac.destination);o.start(t);o.stop(t+d+.02);},
  jump(){this.tone(480,.12,'square',.035,320);},
  coin(){this.tone(988,.07,'triangle',.06);this.tone(1319,.1,'triangle',.05,0,.06);},
  hit(){this.tone(200,.3,'sawtooth',.07,-140);},
  eat(){for(let i=0;i<4;i++)this.tone(300+i*40,.06,'square',.04,-80,i*.09);this.tone(1046,.25,'triangle',.05,500,.4);},
  level(){[523,659,784,1046].forEach((f,i)=>this.tone(f,.14,'triangle',.06,0,i*.08));},
  shoot(){this.tone(900,.05,'triangle',.02,-400);},
  boom(){this.tone(140,.18,'square',.045,-70);},
  deliver(){[784,988,1175,1568].forEach((f,i)=>this.tone(f,.2,'triangle',.06,0,i*.12));},
};

/* ---------------- 그리기 도우미 ---------------- */
function rrect(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
function ell(x,y,rx,ry,rot=0){ctx.beginPath();ctx.ellipse(x,y,Math.max(.1,rx),Math.max(.1,ry),rot,0,TAU);}
function fs(fill,stroke,lw){if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lw||2.5;ctx.stroke();}}
function thick(pts,w,color){ctx.beginPath();ctx.moveTo(pts[0],pts[1]);for(let i=2;i<pts.length;i+=2)ctx.lineTo(pts[i],pts[i+1]);
  ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle=OL;ctx.lineWidth=w+3;ctx.stroke();ctx.strokeStyle=color;ctx.lineWidth=w;ctx.stroke();}
function txt(s,x,y,size,color,align='left',stroke=OL,font='Jua'){ctx.font=`${size}px ${font==='brush'?"'Nanum Brush Script'":"'Jua'"}, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif`;
  ctx.textAlign=align;ctx.textBaseline='middle';if(stroke){ctx.lineJoin='round';ctx.strokeStyle=stroke;ctx.lineWidth=Math.max(3,size*.18);ctx.strokeText(s,x,y);}ctx.fillStyle=color;ctx.fillText(s,x,y);}
function flame(x,y,w,h){ctx.beginPath();ctx.moveTo(x-w,y);ctx.quadraticCurveTo(x-w,y-h*.55,x,y-h);ctx.quadraticCurveTo(x+w,y-h*.55,x+w,y);ctx.quadraticCurveTo(x,y+w*.5,x-w,y);fs('#ff8a1f');
  ctx.beginPath();ctx.moveTo(x-w*.5,y);ctx.quadraticCurveTo(x-w*.5,y-h*.35,x,y-h*.62);ctx.quadraticCurveTo(x+w*.5,y-h*.35,x+w*.5,y);ctx.closePath();fs('#ffe066');}
function heart(x,y,s,fill){ctx.save();ctx.translate(x,y);ctx.scale(s,s);ctx.beginPath();ctx.moveTo(0,6);ctx.bezierCurveTo(-14,-4,-8,-14,0,-6);ctx.bezierCurveTo(8,-14,14,-4,0,6);ctx.closePath();fs(fill?'#e8453c':'rgba(255,255,255,.25)',OL,2.2/s);ctx.restore();}

/* ---------------- 고양이 ---------------- */
function drawCatHead(face,t,o={}){
  ctx.lineJoin='round';
  // 귀
  ctx.beginPath();ctx.moveTo(-16,-8);ctx.lineTo(-14,-31);ctx.lineTo(-4,-17);ctx.closePath();fs('#3a3030',OL,2.5);
  ctx.beginPath();ctx.moveTo(4,-17);ctx.lineTo(13,-31);ctx.lineTo(16,-8);ctx.closePath();fs('#fbf6ee',OL,2.5);
  ctx.beginPath();ctx.moveTo(7,-16);ctx.lineTo(12.5,-25);ctx.lineTo(13.5,-12);ctx.closePath();fs('#f4a7b5');
  // 얼굴
  ell(0,0,17,15.5);fs('#fbf6ee');
  ctx.save();ell(0,0,17,15.5);ctx.clip();ell(-12,-2,10,13);fs('#3a3030');ell(7,-13,8,5);fs('#e8924a');
  if(o.spicy){ell(0,2,17,15);fs(`rgba(235,50,35,${.32+.1*Math.sin(t*18)})`);}ctx.restore();
  ell(0,0,17,15.5);fs(null,OL,2.5);
  // 우편 모자
  if(!o.noCap){
    ctx.beginPath();ctx.moveTo(-15,-6);ctx.quadraticCurveTo(-15,-23,1,-23);ctx.quadraticCurveTo(15,-22,15,-7);ctx.closePath();fs('#2d3a6b',OL,2.5);
    ctx.fillStyle='#d8392b';ctx.fillRect(-13.5,-11,27,3.5);
    ell(17,-7,10,3.2);fs('#1f2a52',OL,2);
    rrect(-1,-20,9,6,1);fs('#f6d36b');ctx.strokeStyle='#8a6a20';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-1,-20);ctx.lineTo(3.5,-16.5);ctx.lineTo(8,-20);ctx.stroke();
  }
  // 눈
  const e1=5,e2=12,ey=1;
  ctx.strokeStyle=OL;ctx.lineWidth=2;ctx.lineCap='round';
  if(face==='hit'){ctx.beginPath();ctx.moveTo(e1-3,ey-3);ctx.lineTo(e1+1,ey);ctx.lineTo(e1-3,ey+3);ctx.moveTo(e2+3,ey-3);ctx.lineTo(e2-1,ey);ctx.lineTo(e2+3,ey+3);ctx.stroke();}
  else if(face==='happy'||face==='chomp'){ctx.beginPath();ctx.arc(e1,ey+1.5,2.8,Math.PI*1.1,Math.PI*1.9);ctx.moveTo(e2+2.4,ey+1.5);ctx.arc(e2,ey+1.5,2.4,Math.PI*1.1,Math.PI*1.9);ctx.stroke();}
  else{const bl=(Math.sin(t*1.7)>.985)?.4:1;ell(e1,ey,2.7,3.9*bl);fs(OL);ell(e2,ey,2.3,3.5*bl);fs(OL);
    if(bl>.5){ell(e1+.9,ey-1.5,1,1.1);fs('#fff');ell(e2+.8,ey-1.3,.8,.9);fs('#fff');}
    if(o.spicy){ctx.strokeStyle='#7ac7ff';ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(e1,ey+4);ctx.lineTo(e1-1,ey+8+Math.sin(t*10)*1.5);ctx.stroke();}}
  ell(2,7,3.6,2);fs('rgba(244,110,130,.6)');
  ctx.beginPath();ctx.moveTo(15,3.5);ctx.lineTo(18.5,3.5);ctx.lineTo(16.8,5.8);ctx.closePath();fs('#e87a8a');
  const open=o.mouthOpen;
  if(open){ell(14.5,9.5,3.4,open>1?4:3);fs('#8a2030',OL,1.5);}
  else{ctx.beginPath();ctx.moveTo(12,7.6);ctx.quadraticCurveTo(13.8,10.4,15.6,7.6);ctx.quadraticCurveTo(17.2,10.4,19,7.6);ctx.strokeStyle=OL;ctx.lineWidth=1.5;ctx.stroke();}
  ctx.strokeStyle='rgba(43,34,51,.55)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(18,6);ctx.lineTo(28,3.5);ctx.moveTo(18,7.5);ctx.lineTo(28,9);ctx.stroke();
  if(o.spicy){for(let i=0;i<2;i++){const sy=-6+((t*30+i*9)%14);ell(-9-i*5,sy,1.8,2.6);fs('#9ad8ff',OL,1);}}
}

function drawCat(x,y,o){
  const t=o.t||0,pose=o.pose||'run';
  ctx.save();ctx.translate(x,y);
  if(o.alpha!=null)ctx.globalAlpha=o.alpha;
  if(o.squash){ctx.scale(1+o.squash,1-o.squash);}
  const slide=pose==='slide',air=pose==='jump',stand=pose==='stand';
  const ph=t*15,s=Math.sin(ph);
  let by=-25,hx=19,hy=-42,brx=25,bry=15;
  if(pose==='run'){const b=Math.abs(Math.sin(ph))*3;by-=b;hy-=b;}
  if(slide){by=-14;brx=29;bry=11;hx=28;hy=-22;}
  if(air){hy=-44;}
  const leg=(x0,y0,ang,len,col)=>thick([x0,y0,x0+Math.sin(ang)*len,y0+Math.cos(ang)*len],6,col);
  // 꼬리
  const tw=Math.sin(t*6)*5;
  ctx.beginPath();ctx.moveTo(-22,by-2);
  if(slide)ctx.quadraticCurveTo(-44,by-4,-56,by-12+tw*.5);else ctx.bezierCurveTo(-42,by-2,-46,by-26+tw,-35,by-38+tw);
  ctx.lineCap='round';ctx.strokeStyle=OL;ctx.lineWidth=10;ctx.stroke();ctx.strokeStyle='#e8924a';ctx.lineWidth=6.5;ctx.stroke();
  // 먼 쪽 다리
  const far='#e6dccd';
  if(slide){leg(-14,by+5,-1.45,18,far);leg(16,by+5,1.4,18,far);}
  else if(air){leg(-14,by+8,-.9,14,far);leg(14,by+8,.9,14,far);}
  else if(stand){leg(-14,by+8,0,17,far);leg(14,by+8,0,17,far);}
  else{leg(-12,by+8,s*.75,16,far);leg(15,by+8,-s*.75,16,far);}
  // 편지 (가방 뒤)
  rrect(-17,by-13,12,7,1);fs('#fffaf0',OL,1.5);
  // 몸
  ell(0,by,brx,bry);fs('#fbf6ee');
  ctx.save();ell(0,by,brx,bry);ctx.clip();ell(-8,by-10,17,10);fs('#e8924a');ell(-21,by+4,8,7);fs('#3a3030');ctx.restore();
  ell(0,by,brx,bry);fs(null,OL,2.5);
  // 가까운 쪽 다리
  if(slide){leg(-20,by+5,-1.5,18,'#fbf6ee');leg(10,by+5,1.45,19,'#fbf6ee');}
  else if(air){leg(-18,by+8,-1.15,15,'#fbf6ee');leg(10,by+8,1.15,15,'#fbf6ee');}
  else if(stand){leg(-18,by+8,0,17,'#fbf6ee');leg(10,by+8,0,17,'#fbf6ee');}
  else{leg(-18,by+8,-s*.75,17,'#fbf6ee');leg(9,by+8,s*.75,17,'#fbf6ee');}
  // 가방 끈 + 가방
  ctx.strokeStyle='#6b4423';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-2,by-6);ctx.lineTo(hx-7,hy+13);ctx.stroke();
  rrect(-15,by-7,21,16,3);fs('#a8743f',OL,2.2);rrect(-15,by-7,21,7,3);fs('#8a5a2e',OL,2);ell(-4.5,by,2,2);fs('#f6d36b');
  // 머리
  const eat=o.eat;
  ctx.save();ctx.translate(hx,hy);if(o.tilt)ctx.rotate(o.tilt);
  let face='normal',mouth=0;
  if(o.hurt)face='hit';
  if(eat){face='chomp';mouth=Math.sin(eat.t*26)>0?2:0;}
  else if(o.spicy){mouth=1;}
  drawCatHead(face,t,{spicy:o.spicy&&!eat,mouthOpen:mouth});
  ctx.restore();
  // 먹는 중: 앞발로 음식 들기
  if(eat){
    const fx=hx+24,fy=hy+16,bite=clamp(eat.t/eat.dur,0,1);
    thick([10,by-2,fx-8,fy+4],6,'#fbf6ee');
    if(eat.type==='cookie'){
      // 쫀득하게 늘어나는 필링
      const st=Math.sin(eat.t*26)>0?0:6;
      ctx.strokeStyle='#86b94a';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(fx-8,fy-4);ctx.quadraticCurveTo(fx-8-st,fy-10,hx+15,hy+10);ctx.stroke();
      ctx.strokeStyle='#d9b768';ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(fx-6,fy-1);ctx.quadraticCurveTo(fx-10-st,fy-6,hx+16,hy+11);ctx.stroke();
      drawCookie(fx,fy,.62,t,bite);
    }else{
      // 후루룩 면발
      ctx.strokeStyle='#ff7a2e';ctx.lineWidth=2.2;for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(fx-4+i*3,fy-8);
        ctx.bezierCurveTo(fx-2+i*3,fy-18+Math.sin(eat.t*30+i)*3,hx+20,hy+16,hx+15,hy+10);ctx.stroke();}
      drawBuldak(fx,fy,.58,t);
    }
  }
  // 쫀득 보호막
  if(o.shield){ctx.globalAlpha=(o.alpha??1)*(.5+.2*Math.sin(t*6));ell(4,slide?-18:-30,slide?50:42,slide?28:40);fs('rgba(150,210,110,.18)','#8fd06a',3);ctx.globalAlpha=1;}
  ctx.restore();
}

/* ---------------- 음식 ---------------- */
function drawBuldak(x,y,s,t){
  ctx.save();ctx.translate(x,y);ctx.scale(s,s);
  for(let i=0;i<3;i++)flame(-12+i*12,-13,6.5,15+Math.sin(t*13+i*2.1)*4);
  // 젓가락
  thick([4,-12,26,-36],2.4,'#d79b5a');thick([9,-11,31,-32],2.4,'#d79b5a');
  // 그릇
  ctx.beginPath();ctx.moveTo(-23,-10);ctx.lineTo(23,-10);ctx.quadraticCurveTo(21,13,10,16);ctx.lineTo(-10,16);ctx.quadraticCurveTo(-21,13,-23,-10);ctx.closePath();
  const g=ctx.createLinearGradient(0,-10,0,16);g.addColorStop(0,'#ef4a32');g.addColorStop(1,'#9e1a17');fs(g);
  ctx.save();ctx.clip();ctx.fillStyle='#2b1416';ctx.fillRect(-25,1,50,6);
  ctx.fillStyle='#ffd45a';for(let i=-2;i<=2;i++){ctx.beginPath();ctx.arc(i*9,4,1.3,0,TAU);ctx.fill();}ctx.restore();
  ctx.beginPath();ctx.moveTo(-23,-10);ctx.lineTo(23,-10);ctx.quadraticCurveTo(21,13,10,16);ctx.lineTo(-10,16);ctx.quadraticCurveTo(-21,13,-23,-10);ctx.closePath();fs(null,OL,2.5);
  // 작은 불꽃 마크
  ell(0,-1,0,0);ctx.save();ctx.translate(0,12);ctx.scale(.6,.6);flame(0,-2,6,13);ctx.restore();
  // 면
  ell(0,-10,22,6);fs('#5a1414',OL,2.5);
  ell(0,-12,17,5.5);fs('#e2531f');
  ctx.strokeStyle='#ffa24a';ctx.lineWidth=1.8;
  for(let i=0;i<6;i++){ctx.beginPath();const sx=-15+i*6;ctx.moveTo(sx,-9);ctx.bezierCurveTo(sx+2,-18,sx+5,-8,sx+7,-15);ctx.stroke();}
  ctx.fillStyle='#fff3d0';for(let i=0;i<7;i++){ell(-12+i*4,-13+(i%2)*3,1.1,.7,.5);ctx.fill();}
  ctx.fillStyle='#6fbf4a';ctx.fillRect(-6,-15,3,2);ctx.fillRect(5,-12,3,2);ctx.fillRect(10,-15,2.5,2);
  ctx.restore();
}
function drawCookie(x,y,s,t,bite=0){
  ctx.save();ctx.translate(x,y);ctx.scale(s,s);
  ctx.beginPath();for(let i=0;i<=18;i++){const a=i/18*TAU,r=18+(hash(i*3.1)*2-1)*1.5;i?ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r*.92):ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r*.92);}ctx.closePath();
  const g=ctx.createRadialGradient(-6,-7,2,0,0,20);g.addColorStop(0,'#8a5434');g.addColorStop(1,'#4a2616');fs(g,OL,2.5);
  ctx.fillStyle='rgba(200,150,110,.55)';for(let i=0;i<14;i++){ell(-13+hash(i+5)*22,-12+hash(i+9)*22,1,1);ctx.fill();}
  // 단면: 피스타치오 + 카다이프
  const a0=-.75+bite*.3,a1=.75-bite*.3;
  ctx.beginPath();ctx.moveTo(3,0);ctx.arc(3,0,15.5,a0,a1);ctx.closePath();fs('#86b94a',OL,2);
  ctx.save();ctx.beginPath();ctx.moveTo(3,0);ctx.arc(3,0,15.5,a0,a1);ctx.closePath();ctx.clip();
  ctx.strokeStyle='#d9b768';ctx.lineWidth=1.1;for(let i=0;i<7;i++){ctx.beginPath();ctx.moveTo(4,-8+i*2.6);ctx.bezierCurveTo(9,-12+i*2.6,12,-5+i*2.6,19,-9+i*2.6);ctx.stroke();}
  ctx.fillStyle='#5aa03a';for(let i=0;i<5;i++){ell(8+hash(i+2)*8,-6+hash(i+7)*12,1.4,1);ctx.fill();}
  ctx.restore();
  ctx.strokeStyle='#3a1d10';ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(3,0,15.5,a0,a1);ctx.stroke();
  ell(-8,-9,4,2.2,-.5);fs('rgba(255,255,255,.25)');
  ctx.restore();
}
function drawLetter(x,y,gold,t){
  ctx.save();ctx.translate(x,y+Math.sin(t*4+x*.02)*3);ctx.rotate(Math.sin(t*3+x*.05)*.1);
  if(gold){const g=ctx.createRadialGradient(0,0,2,0,0,26);g.addColorStop(0,'rgba(255,220,110,.7)');g.addColorStop(1,'rgba(255,220,110,0)');ctx.fillStyle=g;ctx.fillRect(-26,-26,52,52);}
  rrect(-12,-8,24,16,2);fs(gold?'#f7d26a':'#fffaf0',OL,2);
  ctx.beginPath();ctx.moveTo(-12,-8);ctx.lineTo(0,1.5);ctx.lineTo(12,-8);ctx.strokeStyle=OL;ctx.lineWidth=1.6;ctx.stroke();
  ell(0,2,3.6,3.6);fs(gold?'#c8322a':'#d8392b');
  ctx.restore();
}

/* ---------------- 장애물 / 요괴 정의 ---------------- */
const OB={
  rock:{w:50,h:34,place:'ground',draw(e){
    ctx.beginPath();ctx.moveTo(e.x,e.y+e.h);ctx.quadraticCurveTo(e.x-2,e.y+6,e.x+18,e.y+2);ctx.quadraticCurveTo(e.x+36,e.y-4,e.x+48,e.y+12);ctx.quadraticCurveTo(e.x+54,e.y+e.h,e.x+50,e.y+e.h);ctx.closePath();
    fs('#8d8a96',OL,2.5);ell(e.x+20,e.y+6,12,4,-.2);fs('#7fae5c');ell(e.x+32,e.y+16,4,3);fs('rgba(255,255,255,.25)');}},
  tawara:{w:56,h:46,place:'ground',destructible:true,hp:2,name:'쌀가마니',draw(e){
    const cx=e.x+28,cy=e.y+24;ell(cx,cy,28,22);fs('#e3c98a',OL,2.5);
    ctx.strokeStyle='#b08a45';ctx.lineWidth=1.2;for(let i=-3;i<=3;i++){ctx.beginPath();ctx.moveTo(cx-26,cy+i*5);ctx.lineTo(cx+26,cy+i*5);ctx.stroke();}
    ctx.strokeStyle='#7a5a2a';ctx.lineWidth=3;for(const dx of[-14,0,14]){ctx.beginPath();ctx.ellipse(cx+dx,cy,3,21.5,0,0,TAU);ctx.stroke();}
    ell(cx,cy,28,22);fs(null,OL,2.5);}},
  crow:{w:52,h:30,place:'air',y:GROUND-82,vx:-90,destructible:true,hp:1,enemy:true,bob:true,draw(e){
    const cx=e.x+26,cy=e.y+16,f=Math.sin(e.t*16);
    ctx.beginPath();ctx.moveTo(cx+2,cy-2);ctx.quadraticCurveTo(cx+10,cy-20*f-6,cx+24,cy-22*f);ctx.quadraticCurveTo(cx+14,cy-4,cx+2,cy+2);fs('#26222e',OL,2);
    ell(cx,cy,18,9);fs('#2e2938',OL,2.5);ctx.beginPath();ctx.moveTo(cx+14,cy+2);ctx.lineTo(cx+28,cy+8);ctx.lineTo(cx+12,cy+6);fs('#26222e');
    ell(cx-16,cy-4,8,7);fs('#2e2938',OL,2.5);ctx.beginPath();ctx.moveTo(cx-22,cy-5);ctx.lineTo(cx-31,cy-2);ctx.lineTo(cx-22,cy-1);ctx.closePath();fs('#f0b43a',OL,1.5);
    ell(cx-17,cy-6,1.8,1.8);fs('#ffdf6a');
    ctx.beginPath();ctx.moveTo(cx-2,cy+2);ctx.quadraticCurveTo(cx+8,cy+18*f+8,cx+20,cy+16*f+4);ctx.quadraticCurveTo(cx+10,cy+2,cx-2,cy+4);fs('#3a3446',OL,2);}},
  chochin:{w:40,h:GROUND-40,place:'hang',name:'제등',draw(e){
    const cx=e.x+20;ctx.strokeStyle='#3a2a24';ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(cx,0);ctx.lineTo(cx,e.y+e.h-130);ctx.stroke();
    const sw=Math.sin(e.t*2.4)*2;
    for(let i=0;i<3;i++){const ly=e.y+e.h-110+i*38,lx=cx+sw*(i+1)*.5;
      ctx.fillStyle='#2b2233';ctx.fillRect(lx-9,ly-18,18,5);ctx.fillRect(lx-9,ly+13,18,5);
      ell(lx,ly,19,16);fs(i===1?'#f6efe2':'#d8392b',OL,2.5);
      ctx.strokeStyle='rgba(43,34,51,.35)';ctx.lineWidth=1;for(let k=-2;k<=2;k++){ctx.beginPath();ctx.ellipse(lx,ly+k*5,19*Math.sqrt(1-(k*5/16)**2),1.5,0,0,Math.PI);ctx.stroke();}
      txt(i===1?'祭':'',lx,ly+1,15,i===1?'#c8322a':'#fff',"center",null);}
    const g=ctx.createRadialGradient(cx,e.y+e.h-72,4,cx,e.y+e.h-72,70);g.addColorStop(0,'rgba(255,190,90,.25)');g.addColorStop(1,'rgba(255,190,90,0)');ctx.fillStyle=g;ctx.fillRect(cx-70,e.y+e.h-142,140,140);}},
  toro:{w:42,h:86,place:'ground',name:'석등',draw(e){
    const x=e.x,y=e.y,c='#a39fa8';
    rrect(x+2,y+74,38,12,2);fs(c,OL,2.5);rrect(x+13,y+44,16,32,2);fs(c,OL,2.5);rrect(x+5,y+38,32,8,2);fs(c,OL,2.5);
    rrect(x+8,y+20,26,19,2);fs(c,OL,2.5);rrect(x+14,y+24,14,11,1);fs('#ffcf6a',OL,1.5);
    ctx.beginPath();ctx.moveTo(x-4,y+21);ctx.quadraticCurveTo(x+21,y-2,x+46,y+21);ctx.closePath();fs('#8d8996',OL,2.5);
    ell(x+21,y+4,4,5);fs(c,OL,2);}},
  tanuki:{w:56,h:64,place:'ground',name:'너구리 석상',destructible:true,hp:3,draw(e){
    const cx=e.x+28,b=e.y+e.h;
    ell(cx,b-22,25,22);fs('#9a6e48',OL,2.5);ell(cx+3,b-18,17,16);fs('#e8d3b0',OL,2);
    ell(cx-2,b-48,17,14);fs('#9a6e48',OL,2.5);ell(cx-8,b-48,5,4.5);fs('#3a2a24');ell(cx+5,b-48,5,4.5);fs('#3a2a24');
    ell(cx-8,b-49,1.5,1.5);fs('#fff');ell(cx+5,b-49,1.5,1.5);fs('#fff');ell(cx-1,b-43,3,2);fs(OL);
    ctx.beginPath();ctx.ellipse(cx-2,b-58,22,6,0,0,TAU);fs('#d9b46a',OL,2.5);ell(cx-2,b-63,10,7);fs('#d9b46a',OL,2.5);
    rrect(cx+18,b-34,10,20,3);fs('#7a9a6a',OL,2);}},
  puddle:{w:118,h:12,place:'ground',name:'물웅덩이',draw(e){
    ell(e.x+59,e.y+8,59,8);fs('#6fa6c9',OL,2);ell(e.x+50,e.y+6,30,3);fs('rgba(255,255,255,.4)');
    const r=(e.t*30)%24;ctx.strokeStyle='rgba(255,255,255,.6)';ctx.lineWidth=1.5;ell(e.x+80,e.y+8,r,r*.25);ctx.stroke();}},
  daruma:{w:50,h:54,place:'ground',vx:-170,destructible:true,hp:2,name:'달마',draw(e){
    const cx=e.x+25,cy=e.y+27;ctx.save();ctx.translate(cx,cy);ctx.rotate(-e.t*7);
    ell(0,0,25,27);fs('#d8392b',OL,2.5);ell(0,-5,14,12);fs('#fbf1e0',OL,2);
    ell(-5,-6,3.6,3.6);fs('#fff',OL,1.5);ell(5,-6,3.6,3.6);fs('#fff',OL,1.5);ell(-5,-6,1.6,1.6);fs(OL);
    ctx.strokeStyle=OL;ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(-10,-12);ctx.quadraticCurveTo(-5,-16,-1,-12);ctx.moveTo(1,-12);ctx.quadraticCurveTo(5,-16,10,-12);ctx.stroke();
    ctx.strokeStyle='#f3c24a';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,8,13,.3,Math.PI-.3);ctx.stroke();
    ctx.restore();}},
  onibi:{w:34,h:34,place:'air',vx:-30,destructible:true,hp:1,enemy:true,name:'도깨비불',draw(e){
    const cx=e.x+17,cy=e.y+20;
    const g=ctx.createRadialGradient(cx,cy,2,cx,cy,34);g.addColorStop(0,'rgba(140,200,255,.55)');g.addColorStop(1,'rgba(140,200,255,0)');ctx.fillStyle=g;ctx.fillRect(cx-34,cy-34,68,68);
    const f=Math.sin(e.t*12)*3;
    ctx.beginPath();ctx.moveTo(cx-14,cy+2);ctx.quadraticCurveTo(cx-14,cy-14,cx+6+f,cy-26);ctx.quadraticCurveTo(cx+2,cy-12,cx+14,cy-6);ctx.quadraticCurveTo(cx+18,cy+14,cx,cy+14);ctx.quadraticCurveTo(cx-14,cy+14,cx-14,cy+2);
    fs('#bfe3ff','#3b5fa8',2.5);ell(cx-5,cy+2,2.4,3.4);fs('#3b5fa8');ell(cx+5,cy+2,2.4,3.4);fs('#3b5fa8');}},
};
const HINTS={crow:'까마귀! ↓ 슬라이드나 점프로 피하세요',chochin:'제등 줄은 ↓ 슬라이드로 밑을 지나가요',toro:'키 큰 석등은 높이 점프! (공중에서 한 번 더)',
  puddle:'물웅덩이는 길어요. 일찍 점프!',daruma:'굴러오는 달마! 더 빨리 다가와요',onibi:'도깨비불이 따라와요! 생선뼈 표창으로 물리칠 수 있어요',tanuki:'너구리 석상은 표창으로 부술 수도 있어요'};

/* ---------------- 스테이지 ---------------- */
const STAGES=[
  {name:'벚꽃 마을',sub:'봄 · 아침',theme:'spring',length:15000,speed:[330,400],gap:[430,720],foodEvery:2600,recipient:'찻집 할머니',
    obstacles:{rock:3,tawara:2,crow:2,chochin:1}},
  {name:'단풍 신사길',sub:'가을 · 해질녘',theme:'autumn',length:19000,speed:[390,470],gap:[390,660],foodEvery:2600,recipient:'신사의 무녀님',
    obstacles:{toro:2,tanuki:2,crow:2,puddle:2,chochin:1,onibi:1.2}},
  {name:'여름 축제의 밤',sub:'여름 · 밤',theme:'festival',length:23000,speed:[450,550],gap:[350,610],foodEvery:2400,recipient:'불꽃놀이 장인',
    obstacles:{daruma:3,chochin:2,crow:1.5,onibi:2.2,tawara:1,toro:1}},
];
const THEMES={
  spring:{sky:['#86c3e6','#cfe6ef','#fde3d4'],far:'#9fb6d2',snow:'#f7fbff',hill:'#a9cf98',road:'#d9c7a1',road2:'#c4ae86',lip:'#86b860'},
  autumn:{sky:['#3a2b5e','#c9586a','#f6a35a'],far:'#7a4d6e',snow:'#f3dfe0',hill:'#7e3a38',road:'#b7a184',road2:'#a08869',lip:'#6f7a45'},
  festival:{sky:['#0c1030','#221d4f','#4a2e60'],far:'#2a2350',snow:'#bdb6e0',hill:'#1f1a3d',road:'#3b3150',road2:'#2f2740',lip:'#4f4166'},
};

/* ---------------- 무기 / 업그레이드 (뱀서라이크 계열) ---------------- */
const WEAPONS={
  fishbone:{update(lv,dt){
    G.fbCd-=dt;if(G.fbCd>0)return;
    const tg=ents.filter(e=>e.def.destructible&&!e.dead&&e.x+e.w>P.x+10&&e.x<W-10).sort((a,b)=>a.x-b.x);
    if(!tg.length){G.fbCd=.12;return;}
    const n=1+Math.floor((lv-1)/2);
    for(let i=0;i<n;i++){const e=tg[i%tg.length];const sx=P.x+22,sy=P.y-(P.sliding?18:34);
      const ex=e.x+e.w/2,ey=e.y+e.h/2,d=Math.hypot(ex-sx,ey-sy),tt=d/780,rel=(e.def.vx||0)-G.speed;
      const ax=ex+rel*tt-sx,ay=ey-sy,m=Math.hypot(ax,ay)||1;
      shots.push({x:sx,y:sy+i*6,vx:ax/m*780,vy:ay/m*780,life:1.4,rot:0});}
    SFX.shoot();G.fbCd=1.2*Math.pow(.84,lv-1);}},
  bell:{update(lv,dt){
    const n=lv,R=62;
    for(let i=0;i<n;i++){const a=G.time*3.4+i*TAU/n,bx=P.x+4+Math.cos(a)*R,by=P.y-28+Math.sin(a)*R*.8;
      for(const e of ents){if(e.dead||!e.def.destructible||(e.bellCd||0)>0)continue;
        if(bx>e.x-9&&bx<e.x+e.w+9&&by>e.y-9&&by<e.y+e.h+9){e.bellCd=.35;damage(e,1);burst(bx,by,5,['#f6d36b','#fff'],140);}}}}},
};
const UPGRADES=[
  {id:'fishbone',name:'생선뼈 표창',max:5,desc:l=>l?'발사 간격이 짧아지고, 홀수 레벨마다 한 발 더':'가장 가까운 까마귀·요괴·장애물에 자동 발사',apply(){WPN.fishbone++;}},
  {id:'bell',name:'수호 방울',max:4,desc:l=>l?'고양이 주위를 도는 방울 +1':'고양이 주위를 도는 방울이 닿는 것을 부숴요',apply(){WPN.bell++;}},
  {id:'jump',name:'구름 발바닥',max:2,desc:()=>'공중 점프 횟수 +1',apply(){S.airJumps++;}},
  {id:'hp',name:'튼튼한 몸',max:3,desc:()=>'최대 체력 +1, 체력 모두 회복',apply(){S.maxHp++;P.hp=S.maxHp;}},
  {id:'magnet',name:'편지 자석',max:3,desc:()=>'편지를 끌어당기는 범위 +60%',apply(){S.magnet*=1.6;}},
  {id:'spicy',name:'매운맛 단련',max:3,desc:()=>'불닭 모드 지속 시간 +2초',apply(){S.buldakDur+=2;}},
  {id:'lucky',name:'마네키네코 부적',max:3,desc:()=>'점수 +25%, 간식이 더 자주 나와요',apply(){S.scoreMul+=.25;S.foodLuck*=.8;}},
];

/* ---------------- 상태 ---------------- */
const G={state:'title',stage:0,dist:0,scroll:0,speed:0,score:0,letters:0,level:1,xp:0,time:0,slow:1,shake:0,nextSpawn:0,nextFood:0,foodToggle:0,
  goal:null,seen:{},hint:null,banner:null,cutin:null,del:null,pendingLv:0,stageLetters:0,fbCd:0,overT:0,kills:0,best:loadBest()};
let ents=[],picks=[],shots=[],parts=[],amb=[];
const P={x:PX,y:GROUND,vy:0,onGround:true,jumps:1,sliding:false,slideT:0,hp:3,inv:0,shield:0,buldak:0,magnetBoost:0,eat:null,t:0,hurtT:0,squash:0};
let S,WPN,ULV;
const input={jumpHeld:false,down:false,touchSlide:false};

function resetRun(){
  S={maxHp:3,airJumps:1,magnet:70,buldakDur:5,invDur:1.3,scoreMul:1,foodLuck:1};
  WPN={fishbone:0,bell:0};ULV={};
  Object.assign(P,{hp:3,inv:0,shield:0,buldak:0,magnetBoost:0,eat:null,y:GROUND,vy:0,sliding:false,hurtT:0});
  Object.assign(G,{score:0,letters:0,level:1,xp:0,pendingLv:0,seen:{},kills:0});
}
function startStage(i){
  const st=STAGES[i];
  Object.assign(G,{stage:i,dist:0,nextSpawn:650,nextFood:st.foodEvery*.55,goal:null,del:null,stageLetters:0,slow:1,hint:null,cutin:null,
    banner:{t:0,dur:2.8,title:`제${i+1}장 · ${st.name}`,sub:`${st.recipient}께 편지를 배달하자!`}});
  ents=[];picks=[];shots=[];parts=[];
  Object.assign(P,{y:GROUND,vy:0,onGround:true,jumps:S.airJumps,sliding:false,inv:1.2,eat:null,buldak:0});
  initAmbient();
  setState('play');
}
function xpNeed(){return 8+(G.level-1)*5;}

/* ---------------- 파티클 ---------------- */
function addP(o){parts.push(Object.assign({vx:0,vy:0,g:0,life:.6,max:.6,size:4,color:'#fff',type:'dot',world:true},o));if(parts.length>600)parts.shift();}
function burst(x,y,n,colors,spd=220,type='dot'){for(let i=0;i<n;i++){const a=rand(0,TAU),s=rand(.3,1)*spd,l=rand(.35,.8);addP({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-60,g:500,life:l,max:l,size:rand(2,5),color:colors[i%colors.length],type});}}
function popText(x,y,text,color='#fff',size=20){addP({x,y,vy:-55,life:.9,max:.9,type:'text',text,color,size,world:false});}

/* ---------------- 스폰 ---------------- */
function pickWeighted(o){let s=0;for(const k in o)s+=o[k];let r=Math.random()*s;for(const k in o){r-=o[k];if(r<=0)return k;}return Object.keys(o)[0];}
function spawnObstacle(type,x){
  const d=OB[type];let y;
  if(d.place==='ground')y=GROUND-d.h;else if(d.place==='hang')y=0;else if(type==='onibi')y=rand(GROUND-170,GROUND-70);else y=d.y;
  const e={type,def:d,x,y,baseY:y,w:d.w,h:d.h,hp:d.hp||1,t:rand(0,3),dead:false,flash:0};
  ents.push(e);
  if(!G.seen[type]&&HINTS[type]){G.seen[type]=1;G.hint={text:HINTS[type],t:0,dur:3};}
  return e;
}
function addLetter(x,y){picks.push({kind:Math.random()<.07?'gold':'letter',x,y,r:13});}
function lettersFor(e){
  const cx=e.x+e.w/2,r=Math.random();
  if(e.def.place==='hang'){for(let k=-2;k<=2;k++)addLetter(cx+k*34,GROUND-16);return;}
  if(r<.65){const top=e.def.place==='air'?e.y-26:e.y-30;for(let k=-2;k<=2;k++)addLetter(cx+k*34,top-(2-Math.abs(k))*18);}
}
function spawner(){
  const st=STAGES[G.stage];
  if(!G.goal&&G.dist>=st.length){G.goal={x:W+60};}
  if(G.dist>=G.nextSpawn&&G.dist<st.length-900){
    const type=pickWeighted(st.obstacles),e=spawnObstacle(type,W+60);
    const gap=rand(st.gap[0],st.gap[1])*(G.speed/420)*(type==='puddle'?1.25:1);
    lettersFor(e);
    const midX=e.x+e.w+gap*.5;
    if(G.dist>=G.nextFood){picks.push({kind:G.foodToggle++%2===0?'buldak':'cookie',x:midX,y:GROUND-112,r:20});G.nextFood=G.dist+st.foodEvery*rand(.85,1.2)*S.foodLuck;}
    else if(Math.random()<.55){for(let k=0;k<4;k++)addLetter(e.x+e.w+gap*.28+k*32,GROUND-26);}
    G.nextSpawn=G.dist+gap+e.w;
  }
}

/* ---------------- 플레이어 ---------------- */
function doJump(){
  if(G.state!=='play')return;
  if(P.onGround){P.vy=-JUMPV;P.onGround=false;P.sliding=false;P.slideT=0;SFX.jump();burst(P.x,GROUND-2,6,['#fff','#e9dcc0'],120);}
  else if(P.jumps>0){P.jumps--;P.vy=-AIRV;SFX.jump();addP({x:P.x,y:P.y,type:'ring',life:.35,max:.35,size:8,color:'#fff'});}
}
function doSlide(){if(G.state!=='play')return;if(!P.onGround)P.vy=Math.max(P.vy,950);P.slideT=.45;}
function pbox(){return P.sliding?{x:P.x-22,y:P.y-25,w:56,h:23}:{x:P.x-17,y:P.y-50,w:41,h:46};}
function hit(a,b){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;}
function ebox(e){if(e.type==='chochin')return{x:e.x+2,y:e.y,w:36,h:e.h};return{x:e.x+5,y:e.y+5,w:e.w-10,h:e.h-8};}

function hurt(){
  if(P.shield>0){P.shield=0;P.inv=1;burst(P.x,P.y-30,16,['#8fd06a','#d9f0b0','#fff'],260);popText(P.x,P.y-80,'쫀득 보호막!','#bdf08a');SFX.boom();return;}
  P.hp--;P.inv=S.invDur;P.hurtT=.5;G.slow=.55;G.shake=10;SFX.hit();burst(P.x,P.y-30,10,['#fff','#ffd0d0'],240);
  if(P.hp<=0){G.overT=0;setState('dying');}
}
function damage(e,n,fire){
  e.hp-=n;e.flash=.12;
  if(e.hp<=0&&!e.dead){e.dead=true;const cx=e.x+e.w/2,cy=e.y+e.h/2;
    burst(cx,cy,14,fire?['#ff5a1f','#ffb21f','#ffe25a']:['#fbf5e9','#2b2233',e.type==='onibi'?'#bfe3ff':'#c8322a'],280);
    const pts=Math.round((e.def.enemy?20:15)*S.scoreMul);G.score+=pts;popText(cx,cy-20,'+'+pts,'#ffe7a0',18);gainXp(1);G.kills++;SFX.boom();
    if(Math.random()<.35)picks.push({kind:'letter',x:cx,y:Math.min(cy,GROUND-30),r:13});}
}
function eat(kind){
  P.eat={type:kind,t:0,dur:1.0};G.cutin={type:kind,t:0,dur:1.6};SFX.eat();P.inv=Math.max(P.inv,1.1);
  G.score+=Math.round(100*S.scoreMul);
  if(kind==='buldak'){P.buldak=S.buldakDur+1;}
  else{P.hp=Math.min(S.maxHp,P.hp+1);P.shield=12;P.magnetBoost=8;}
}
function gainXp(n){G.xp+=n;while(G.xp>=xpNeed()){G.xp-=xpNeed();G.level++;G.pendingLv++;}}

/* ---------------- 업데이트 ---------------- */
function update(dt){
  G.time+=dt;
  if(G.state==='levelup'||G.state==='pause'||G.state==='clear'||G.state==='over')return;
  updateAmbient(dt);
  if(G.state==='title'){G.speed=260;G.scroll+=G.speed*dt;P.t+=dt;P.y=GROUND;updateParts(dt);return;}
  if(G.state==='dying'){G.overT+=dt;G.speed=Math.max(0,G.speed-500*dt);G.scroll+=G.speed*dt;moveWorld(dt);updateParts(dt);G.shake*=.9;
    if(G.overT>1.3)showOver();return;}
  if(G.state==='deliver'){updateDeliver(dt);updateParts(dt);return;}
  // play
  const st=STAGES[G.stage],prog=clamp(G.dist/st.length,0,1);
  let spd=lerp(st.speed[0],st.speed[1],prog);if(P.buldak>0)spd*=1.25;
  G.slow=Math.min(1,G.slow+dt*.7);spd*=G.slow;G.speed=spd;
  G.dist+=spd*dt;G.scroll+=spd*dt;G.score+=spd*dt*.02*S.scoreMul;
  // 플레이어
  P.t+=dt;
  if(P.onGround)P.sliding=input.down||input.touchSlide||P.slideT>0;
  P.slideT=Math.max(0,P.slideT-dt);
  P.vy+=GRAV*dt*(P.vy<0&&!input.jumpHeld?1.7:1);P.y+=P.vy*dt;
  if(P.y>=GROUND){if(!P.onGround){P.squash=.12;burst(P.x,GROUND-2,4,['#fff'],90);}P.y=GROUND;P.vy=0;P.onGround=true;P.jumps=S.airJumps;}else P.onGround=false;
  P.squash=Math.max(0,P.squash-dt*.8);
  P.inv=Math.max(0,P.inv-dt);P.shield=Math.max(0,P.shield-dt);P.magnetBoost=Math.max(0,P.magnetBoost-dt);P.hurtT=Math.max(0,P.hurtT-dt);
  if(P.buldak>0){P.buldak-=dt;
    if(!P.eat){addP({x:P.x-24,y:P.y-30+rand(-8,8),vx:rand(-260,-160),vy:rand(-60,0),life:.4,max:.4,size:rand(6,11),color:['#ff5a1f','#ffb21f','#ffe25a'][Math.random()*3|0],type:'flame',world:false});
      if(Math.random()<.5)addP({x:P.x+(P.sliding?44:38),y:P.y-(P.sliding?16:36),vx:rand(260,380),vy:rand(-40,40),life:.3,max:.3,size:rand(5,9),color:['#ff5a1f','#ffd23f'][Math.random()*2|0],type:'flame',world:false});}}
  if(P.eat){P.eat.t+=dt;
    if(Math.random()<.4)addP({x:P.x+44,y:P.y-42,vx:rand(-30,30),vy:rand(-80,-20),g:300,life:.5,max:.5,size:rand(2,3.5),color:P.eat.type==='cookie'?'#6a3a20':'#ff7a2e',type:'dot',world:false});
    if(P.eat.t>=P.eat.dur){if(P.eat.type==='buldak'){popText(P.x+10,P.y-90,'맵다아아!!','#ff8a5a',26);G.shake=6;}else popText(P.x+10,P.y-90,'쫀득쫀득~','#bdf08a',24);P.eat=null;}}
  spawner();
  moveWorld(dt);
  // 무기
  for(const k in WPN)if(WPN[k]>0)WEAPONS[k].update(WPN[k],dt);
  // 충돌
  const pb=pbox();
  for(const e of ents){if(e.dead)continue;if(hit(pb,ebox(e))){
    if(P.buldak>0){if(!e.burnt){e.burnt=1;e.hp=0;e.dead=false;damage(e,99,true);if(!e.def.destructible){e.dead=true;}}}
    else if(P.inv<=0&&!P.eat)hurt();}}
  // 줍기
  const pcx=P.x+6,pcy=P.y-(P.sliding?14:28),mag=S.magnet*(P.magnetBoost>0?2.4:1);
  for(const p of picks){if(p.dead)continue;const dx=pcx-p.x,dy=pcy-p.y,d=Math.hypot(dx,dy);
    if(p.kind!=='buldak'&&p.kind!=='cookie'&&d<mag){p.x+=dx/d*620*dt;p.y+=dy/d*620*dt;}
    if(d<p.r+24){p.dead=true;
      if(p.kind==='letter'||p.kind==='gold'){const g=p.kind==='gold',pts=Math.round((g?50:10)*S.scoreMul);G.score+=pts;G.letters++;G.stageLetters++;gainXp(g?5:1);SFX.coin();
        popText(p.x,p.y-14,'+'+pts,g?'#ffd84a':'#fff',g?22:17);burst(p.x,p.y,5,['#fff','#f6d36b'],120);}
      else eat(p.kind);}}
  if(G.xp>=xpNeed())gainXp(0);
  if(G.pendingLv>0&&G.state==='play'){openLevelUp();}
  // 골
  if(G.goal&&G.goal.x+60-P.x<=150&&G.state==='play'){G.del={t:0,stopped:false};setState('deliver');}
  updateParts(dt);
  G.shake*=Math.pow(.02,dt);
  if(G.banner){G.banner.t+=dt;if(G.banner.t>G.banner.dur)G.banner=null;}
  if(G.hint){G.hint.t+=dt;if(G.hint.t>G.hint.dur)G.hint=null;}
  if(G.cutin){G.cutin.t+=dt;if(G.cutin.t>G.cutin.dur)G.cutin=null;}
}
function moveWorld(dt){
  const sp=G.speed;
  for(const e of ents){e.t+=dt;e.x+=((e.def.vx||0)-sp)*dt;e.flash=Math.max(0,e.flash-dt);e.bellCd=Math.max(0,(e.bellCd||0)-dt);
    if(e.def.bob)e.y=e.baseY+Math.sin(e.t*4)*6;
    if(e.type==='onibi'&&G.state==='play'){const ty=P.y-(P.sliding?30:50);e.y+=clamp(ty-e.y,-50*dt,50*dt);e.y=clamp(e.y,GROUND-200,GROUND-40);}}
  ents=ents.filter(e=>!e.dead&&e.x>-200);
  for(const p of picks){p.x-=sp*dt;}
  picks=picks.filter(p=>!p.dead&&p.x>-40);
  for(const s of shots){s.x+=s.vx*dt;s.y+=s.vy*dt;s.life-=dt;s.rot+=dt*20;
    for(const e of ents){if(e.dead||!e.def.destructible)continue;if(s.x>e.x-4&&s.x<e.x+e.w+4&&s.y>e.y-4&&s.y<e.y+e.h+4){s.life=0;damage(e,1);burst(s.x,s.y,4,['#fff','#cfe3f0'],120);break;}}}
  shots=shots.filter(s=>s.life>0&&s.x<W+40&&s.x>-40&&s.y>-40&&s.y<H);
  if(G.goal)G.goal.x-=sp*dt;
}
function updateParts(dt){
  for(const p of parts){p.life-=dt;p.vy+=p.g*dt;p.x+=p.vx*dt-(p.world?G.speed*dt:0);p.y+=p.vy*dt;if(p.type==='ring')p.size+=90*dt;}
  parts=parts.filter(p=>p.life>0);
}
function updateDeliver(dt){
  const d=G.del;d.t+=dt;
  if(!d.stopped){G.speed=Math.max(0,G.speed-900*dt);G.scroll+=G.speed*dt;moveWorld(dt);P.t+=dt*(G.speed/400);
    P.vy+=GRAV*dt;P.y=Math.min(GROUND,P.y+P.vy*dt);if(P.y>=GROUND)P.vy=0;P.sliding=false;
    if(G.speed<=0&&P.y>=GROUND){d.stopped=true;d.t=0;SFX.deliver();}}
  else{
    if(d.t>.8&&!d.sparkle){d.sparkle=1;burst(G.goal.x+60,GROUND-80,24,['#ffd84a','#fff','#f4a7b5'],300);}
    if(d.t>2.6)showClear();
  }
}

/* ---------------- 배경 ---------------- */
function tiles(factor,tileW,fn){const off=G.scroll*factor,k0=Math.floor(off/tileW)-1;for(let k=k0;k*tileW-off<W+tileW;k++)fn(k*tileW-off,k);}
function drawBG(){
  const th=STAGES[G.stage].theme,T=THEMES[th],t=G.time;
  const g=ctx.createLinearGradient(0,0,0,GROUND);g.addColorStop(0,T.sky[0]);g.addColorStop(.55,T.sky[1]);g.addColorStop(1,T.sky[2]);ctx.fillStyle=g;ctx.fillRect(0,0,W,GROUND);
  if(th==='spring'){const sg=ctx.createRadialGradient(790,110,10,790,110,120);sg.addColorStop(0,'rgba(255,250,230,.95)');sg.addColorStop(.3,'rgba(255,245,215,.5)');sg.addColorStop(1,'rgba(255,245,215,0)');ctx.fillStyle=sg;ctx.fillRect(660,0,260,240);}
  if(th==='autumn'){ell(690,250,96,96);fs('rgba(232,72,58,.92)');}
  if(th==='festival'){for(let i=0;i<70;i++){const a=.4+.6*Math.abs(Math.sin(t*1.5+i));ctx.fillStyle=`rgba(255,255,240,${a*.8})`;ctx.fillRect(hash(i)*W,hash(i+50)*250,1.6,1.6);}
    const mg=ctx.createRadialGradient(770,96,20,770,96,110);mg.addColorStop(0,'rgba(255,243,196,.35)');mg.addColorStop(1,'rgba(255,243,196,0)');ctx.fillStyle=mg;ctx.fillRect(660,0,240,220);ell(770,96,36,36);fs('#fff3c4');ell(760,88,8,6);fs('rgba(220,205,150,.5)');}
  // 구름 (일본풍 띠구름)
  if(th!=='festival')tiles(.05,520,(x,k)=>{const y=60+hash(k)*90,w=150+hash(k+3)*120;ctx.fillStyle=th==='spring'?'rgba(255,255,255,.75)':'rgba(255,196,160,.55)';
    rrect(x+hash(k+1)*200,y,w,15,7.5);ctx.fill();rrect(x+hash(k+1)*200+w*.2,y-11,w*.45,14,7);ctx.fill();rrect(x+hash(k+1)*200+w*.55,y+11,w*.35,12,6);ctx.fill();});
  // 후지산
  tiles(.02,1150,(x)=>{const cx=x+520,b=GROUND-30;ctx.beginPath();ctx.moveTo(cx-330,b);ctx.lineTo(cx-75,b-196);ctx.quadraticCurveTo(cx,b-212,cx+75,b-196);ctx.lineTo(cx+330,b);ctx.closePath();fs(T.far);
    ctx.beginPath();ctx.moveTo(cx-75,b-196);ctx.quadraticCurveTo(cx,b-212,cx+75,b-196);ctx.lineTo(cx+120,b-148);ctx.lineTo(cx+88,b-156);ctx.lineTo(cx+60,b-138);ctx.lineTo(cx+30,b-158);ctx.lineTo(cx,b-136);ctx.lineTo(cx-28,b-158);ctx.lineTo(cx-60,b-140);ctx.lineTo(cx-90,b-158);ctx.lineTo(cx-120,b-148);ctx.closePath();fs(T.snow);});
  if(th==='festival')drawFireworks();
  // 중경 언덕
  const hy=x=>GROUND-62+Math.sin((x+G.scroll*.18)*.006)*16+Math.sin((x+G.scroll*.18)*.013)*7;
  ctx.beginPath();ctx.moveTo(0,GROUND);for(let x=0;x<=W;x+=16)ctx.lineTo(x,hy(x));ctx.lineTo(W,GROUND);ctx.closePath();fs(T.hill);
  tiles(.18,210,(x,k)=>{const r=hash(k*7.7),tx=x+hash(k+2)*120,ty=hy(tx)+4;
    if(th==='spring'){if(r<.18)pagoda(tx,ty,'#9a7f90');else sakuraTree(tx,ty,.8+hash(k)*.4,k,.85);}
    else if(th==='autumn'){if(r<.22)pagoda(tx,ty,'#4a2638');else mapleTree(tx,ty,.8+hash(k)*.4,k);}
    else{roofs(x,ty,k);}});
  ctx.fillStyle=th==='festival'?'rgba(20,16,40,.25)':'rgba(255,240,230,.12)';ctx.fillRect(0,GROUND-140,W,140);
  // 근경
  if(th==='spring')tiles(.5,300,(x,k)=>{if(hash(k*3.3)<.3)sakuraTree(x+150,GROUND,1.25,k,1);else machiya(x+20,k);});
  else if(th==='autumn'){ctx.fillStyle='#5c4a4a';ctx.fillRect(0,GROUND-28,W,28);tiles(.5,48,(x,k)=>{ctx.strokeStyle='rgba(0,0,0,.25)';ctx.lineWidth=1.5;ctx.strokeRect(x,GROUND-28,48,14);ctx.strokeRect(x+24,GROUND-14,48,14);});
    tiles(.5,150,(x,k)=>{if(hash(k*5.1)<.2)mapleTree(x+70,GROUND-20,1.3,k);else torii(x+10,k);});}
  else{tiles(.5,260,(x,k)=>yatai(x+20,k));lanternString();}
  // 땅
  ctx.fillStyle=T.road;ctx.fillRect(0,GROUND,W,H-GROUND);
  ctx.strokeStyle=T.road2;ctx.lineWidth=2;
  for(let r=0;r<4;r++){const y=GROUND+16+r*26;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();const off=(G.scroll+r*31)%64;for(let x=-off;x<W;x+=64){ctx.beginPath();ctx.moveTo(x+(r%2)*32,y-26+(r?0:10));ctx.lineTo(x+(r%2)*32,y);ctx.stroke();}}
  ctx.fillStyle=T.lip;ctx.fillRect(0,GROUND-3,W,8);
  if(th==='autumn')tiles(1,90,(x,k)=>{leafShape(x+hash(k)*80,GROUND+8+hash(k+1)*80,5,['#d8452b','#e8862a','#c9302a'][k&1+(k%3===0)],hash(k)*6);});
  if(th==='festival'){const lg=ctx.createLinearGradient(0,GROUND,0,H);lg.addColorStop(0,'rgba(255,170,90,.18)');lg.addColorStop(1,'rgba(255,170,90,0)');ctx.fillStyle=lg;ctx.fillRect(0,GROUND,W,H-GROUND);}
}
function sakuraTree(x,y,s,k,a){ctx.save();ctx.globalAlpha=a;ctx.translate(x,y);ctx.scale(s,s);
  ctx.beginPath();ctx.moveTo(-5,0);ctx.quadraticCurveTo(-2,-30,-10,-58);ctx.lineTo(-2,-60);ctx.quadraticCurveTo(6,-30,6,0);ctx.closePath();fs('#6b4a4a');
  const cs=['#f7c2d2','#f3a5bf','#fbd9e3'];for(let i=0;i<9;i++){ell(-6+(hash(k+i)-.5)*70,-70+(hash(k+i+20)-.5)*36,16+hash(k+i+9)*10,13+hash(k+i+4)*6);fs(cs[i%3]);}ctx.restore();}
function mapleTree(x,y,s,k){ctx.save();ctx.translate(x,y);ctx.scale(s,s);ctx.beginPath();ctx.moveTo(-4,0);ctx.lineTo(-3,-50);ctx.lineTo(3,-50);ctx.lineTo(4,0);ctx.closePath();fs('#3d2626');
  const cs=['#d8452b','#e8862a','#b82c2c','#f0a83a'];for(let i=0;i<9;i++){ell((hash(k+i)-.5)*64,-62+(hash(k+i+20)-.5)*34,14+hash(k+i+9)*9,12+hash(k+i+4)*5);fs(cs[i%4]);}ctx.restore();}
function pagoda(x,y,c){ctx.fillStyle=c;for(let i=0;i<5;i++){const w=50-i*7,yy=y-12-i*20;ctx.beginPath();ctx.moveTo(x-w,yy);ctx.quadraticCurveTo(x,yy-10,x+w,yy);ctx.lineTo(x+w*.6,yy-6);ctx.lineTo(x-w*.6,yy-6);ctx.closePath();ctx.fill();ctx.fillRect(x-w*.45,yy,w*.9,12);}ctx.fillRect(x-1.5,y-140,3,40);}
function roofs(x,y,k){for(let i=0;i<3;i++){const rx=x+i*70+hash(k+i)*20,rw=60,rh=40+hash(k*2+i)*30,ry=y-rh;ctx.fillStyle='#181433';ctx.fillRect(rx,ry,rw,rh+10);
  ctx.beginPath();ctx.moveTo(rx-10,ry);ctx.lineTo(rx+rw/2,ry-18);ctx.lineTo(rx+rw+10,ry);ctx.closePath();ctx.fill();
  if(hash(k+i*3)>.3){ctx.fillStyle=`rgba(255,200,110,${.6+.3*Math.sin(G.time*2+k+i)})`;ctx.fillRect(rx+12,ry+12,10,8);ctx.fillRect(rx+34,ry+12,10,8);}}}
function machiya(x,k){
  const w=220+hash(k)*30,h=128+hash(k+1)*26,top=GROUND-h;
  ctx.fillStyle='#efe2cb';ctx.fillRect(x,top,w,h);
  ctx.fillStyle='#6b4430';ctx.fillRect(x,top,w,5);ctx.fillRect(x,top+h*.45,w,6);ctx.fillRect(x,top,6,h);ctx.fillRect(x+w-6,top,6,h);
  ctx.fillStyle='#7a4e33';for(let i=x+10;i<x+w-10;i+=6)ctx.fillRect(i,top+h*.5,2.5,h*.5);
  const dx=x+w*.36;ctx.fillStyle='#33241e';ctx.fillRect(dx,top+h*.5,52,h*.5);
  const nc=['#2f4a7a','#7a2f3a','#3f6a4a'][((k%3)+3)%3];ctx.fillStyle=nc;ctx.fillRect(dx-4,top+h*.5,60,30);
  ctx.fillStyle='rgba(255,255,255,.25)';ctx.fillRect(dx+16,top+h*.5+6,2,24);ctx.fillRect(dx+36,top+h*.5+6,2,24);
  ell(dx+26,top+h*.5+14,7,7);fs('#fbf5e9');
  ctx.fillStyle='#d9c6a5';ctx.fillRect(x+w*.62,top+18,56,26);ctx.strokeStyle='#6b4430';ctx.lineWidth=2;for(let i=0;i<6;i++){ctx.beginPath();ctx.moveTo(x+w*.62+i*11,top+18);ctx.lineTo(x+w*.62+i*11,top+44);ctx.stroke();}
  ctx.beginPath();ctx.moveTo(x-16,top+6);ctx.lineTo(x+w+16,top+6);ctx.lineTo(x+w-4,top-22);ctx.lineTo(x+4,top-22);ctx.closePath();fs('#4a4f5e');
  ctx.strokeStyle='rgba(255,255,255,.12)';ctx.lineWidth=1.5;for(let i=1;i<4;i++){ctx.beginPath();ctx.moveTo(x-16+i*2,top+6-i*7);ctx.lineTo(x+w+16-i*2,top+6-i*7);ctx.stroke();}
  ctx.fillStyle='#3a3e4a';ctx.fillRect(x,top-26,w,6);
  const my=top+h*.45;ctx.beginPath();ctx.moveTo(x-10,my+8);ctx.lineTo(x+w+10,my+8);ctx.lineTo(x+w,my-8);ctx.lineTo(x,my-8);ctx.closePath();fs('#4a4f5e');
}
function torii(x,k){
  const c='#d6462b',b=GROUND-20,h=176;
  ctx.fillStyle=c;ctx.fillRect(x+18,b-h,13,h);ctx.fillRect(x+112,b-h,13,h);
  ctx.fillStyle='#2a1a1a';ctx.fillRect(x+16,b-14,17,14);ctx.fillRect(x+110,b-14,17,14);
  ctx.fillStyle=c;ctx.fillRect(x+6,b-h+28,132,9);
  ctx.beginPath();ctx.moveTo(x-8,b-h);ctx.quadraticCurveTo(x+72,b-h+8,x+152,b-h);ctx.lineTo(x+150,b-h+12);ctx.quadraticCurveTo(x+72,b-h+18,x-6,b-h+12);ctx.closePath();ctx.fill();
  ctx.fillStyle='#2a1a1a';ctx.beginPath();ctx.moveTo(x-10,b-h-6);ctx.quadraticCurveTo(x+72,b-h+2,x+154,b-h-6);ctx.lineTo(x+152,b-h+1);ctx.quadraticCurveTo(x+72,b-h+8,x-8,b-h+1);ctx.closePath();ctx.fill();
  ctx.fillStyle=c;ctx.fillRect(x+66,b-h+10,10,20);
}
const YATAI=['타코야키','솜사탕','금붕어','빙수','야키소바','링고아메'];
function yatai(x,k){
  const w=200,top=GROUND-150,cols=[['#d8392b','#fbf1e0'],['#2d3a6b','#fbf1e0'],['#d8392b','#f6d36b']][((k%3)+3)%3];
  ctx.fillStyle='#4a3428';ctx.fillRect(x+6,top,8,150);ctx.fillRect(x+w-14,top,8,150);
  ctx.fillStyle='#2a2036';ctx.fillRect(x+10,top+30,w-20,90);
  ctx.fillStyle='rgba(255,190,110,.35)';ctx.fillRect(x+14,top+34,w-28,60);
  for(let i=0;i<8;i++){ctx.fillStyle=cols[i%2];ctx.fillRect(x+i*w/8,top,w/8+1,26);}
  for(let i=0;i<8;i++){ctx.beginPath();ctx.arc(x+i*w/8+w/16,top+26,w/16,0,Math.PI);ctx.fillStyle=cols[i%2];ctx.fill();}
  ctx.fillStyle='#6b4a36';ctx.fillRect(x,top+112,w,38);ctx.fillStyle='#5a3c2c';ctx.fillRect(x,top+112,w,6);
  rrect(x+w/2-50,top+54,100,30,4);fs('#fbf1e0',OL,2);txt(YATAI[((k%6)+6)%6],x+w/2,top+70,18,'#c8322a','center',null);
}
function lanternString(){
  tiles(.5,130,(x,k)=>{const y0=GROUND-196;ctx.strokeStyle='#1a1530';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,y0);ctx.quadraticCurveTo(x+65,y0+22,x+130,y0);ctx.stroke();
    for(let i=1;i<4;i++){const lx=x+i*32.5,ly=y0+Math.sin(i/4*Math.PI)*16+10;const gl=ctx.createRadialGradient(lx,ly,2,lx,ly,26);gl.addColorStop(0,'rgba(255,190,90,.5)');gl.addColorStop(1,'rgba(255,190,90,0)');ctx.fillStyle=gl;ctx.fillRect(lx-26,ly-26,52,52);
      ell(lx,ly,8,10);fs(i===2?'#fbe9c8':'#e8453c');ctx.fillStyle='#1a1530';ctx.fillRect(lx-5,ly-12,10,3);ctx.fillRect(lx-5,ly+9,10,3);}});
}
let fireworks=[];
function drawFireworks(){
  if(Math.random()<.02&&fireworks.length<4){const c=['#ff6a8a','#ffd84a','#7ad8ff','#b88aff','#8affc0'][Math.random()*5|0];const fx=rand(80,880),fy=rand(50,190),ps=[];
    for(let i=0;i<36;i++){const a=i/36*TAU;ps.push({a,s:rand(.8,1)});}fireworks.push({x:fx,y:fy,t:0,c,ps});}
  ctx.save();ctx.globalCompositeOperation='lighter';
  for(const f of fireworks){f.t+=1/60;const r=Math.min(1,f.t/.7)*70,al=1-f.t/1.6;if(al<=0)continue;ctx.fillStyle=f.c;ctx.globalAlpha=al;
    for(const p of f.ps){const px=f.x+Math.cos(p.a)*r*p.s,py=f.y+Math.sin(p.a)*r*p.s+f.t*f.t*20;ctx.beginPath();ctx.arc(px,py,2,0,TAU);ctx.fill();}}
  ctx.restore();fireworks=fireworks.filter(f=>f.t<1.6);
}
function leafShape(x,y,r,c,rot){ctx.save();ctx.translate(x,y);ctx.rotate(rot);ctx.beginPath();for(let i=0;i<10;i++){const a=i/10*TAU-Math.PI/2,rr=i%2?r*.45:r;ctx.lineTo(Math.cos(a)*rr,Math.sin(a)*rr);}ctx.closePath();ctx.fillStyle=c;ctx.fill();ctx.restore();}

/* ---------------- 분위기 파티클 ---------------- */
function initAmbient(){amb=[];for(let i=0;i<32;i++)amb.push(newAmb(true));}
function newAmb(any){const th=STAGES[G.stage].theme;return{x:any?rand(0,W):W+rand(0,80),y:any?rand(0,H):rand(-40,GROUND),vx:rand(-90,-40),vy:th==='festival'?rand(-10,10):rand(20,55),r:rand(0,TAU),vr:rand(-3,3),s:rand(3,6),c:Math.random()};}
function updateAmbient(dt){for(const a of amb){a.x+=(a.vx-G.speed*.3)*dt;a.y+=a.vy*dt+Math.sin(G.time*2+a.c*9)*.4;a.r+=a.vr*dt;if(a.x<-20||a.y>H+20)Object.assign(a,newAmb(false));}}
function drawAmbient(){const th=STAGES[G.stage].theme;
  for(const a of amb){if(th==='spring'){ctx.save();ctx.translate(a.x,a.y);ctx.rotate(a.r);ell(0,0,a.s,a.s*.6);fs(a.c<.5?'#f7b6c8':'#fde0e8');ctx.restore();}
    else if(th==='autumn'){leafShape(a.x,a.y,a.s+1,a.c<.33?'#d8452b':a.c<.66?'#e8862a':'#f0b43a',a.r);}
    else{const al=.4+.6*Math.abs(Math.sin(G.time*3+a.c*10));const g=ctx.createRadialGradient(a.x,a.y,0,a.x,a.y,8);g.addColorStop(0,`rgba(230,255,140,${al})`);g.addColorStop(1,'rgba(230,255,140,0)');ctx.fillStyle=g;ctx.fillRect(a.x-8,a.y-8,16,16);}}}

/* ---------------- 목적지 ---------------- */
function drawGoal(){
  const gx=G.goal.x,st=STAGES[G.stage];
  // 집
  const hx=gx+110,top=GROUND-150;
  ctx.fillStyle='#efe2cb';ctx.fillRect(hx,top,220,150);ctx.fillStyle='#6b4430';ctx.fillRect(hx,top,220,6);ctx.fillRect(hx,top,6,150);ctx.fillRect(hx+214,top,6,150);
  ctx.fillStyle='#33241e';ctx.fillRect(hx+80,top+60,60,90);ctx.fillStyle='#c8322a';ctx.fillRect(hx+74,top+60,72,30);ell(hx+110,top+75,8,8);fs('#fbf5e9');
  ctx.beginPath();ctx.moveTo(hx-18,top+6);ctx.lineTo(hx+238,top+6);ctx.lineTo(hx+214,top-30);ctx.lineTo(hx+6,top-30);ctx.closePath();fs('#4a4f5e',OL,2);
  rrect(hx+150,top+22,58,28,3);fs('#fbf1e0',OL,2);txt('배달처',hx+179,top+36,14,'#2b2233','center',null);
  // 우체통
  const mx=gx+60;rrect(mx-20,GROUND-96,40,96,8);fs('#d8392b',OL,3);ell(mx,GROUND-96,20,6);fs('#b82c24',OL,2.5);
  rrect(mx-13,GROUND-74,26,5,2);fs(OL);rrect(mx-10,GROUND-56,20,14,2);fs('#fbf1e0',OL,1.5);
  ctx.save();ctx.translate(mx,GROUND-49);ctx.scale(.35,.35);rrect(-12,-8,24,16,2);fs('#fffaf0',OL,4);ctx.beginPath();ctx.moveTo(-12,-8);ctx.lineTo(0,1.5);ctx.lineTo(12,-8);ctx.stroke();ctx.restore();
  // 깃발
  ctx.fillStyle='#3a2a24';ctx.fillRect(gx+16,GROUND-180,4,180);
  const wv=Math.sin(G.time*5)*4;ctx.beginPath();ctx.moveTo(gx+20,GROUND-178);ctx.quadraticCurveTo(gx+60,GROUND-172+wv,gx+96,GROUND-176);ctx.lineTo(gx+96,GROUND-146);ctx.quadraticCurveTo(gx+60,GROUND-142+wv,gx+20,GROUND-148);ctx.closePath();fs('#fbf1e0',OL,2);
  txt(st.recipient,gx+58,GROUND-162,13,'#c8322a','center',null);
}

/* ---------------- 렌더 ---------------- */
function render(){
  ctx.setTransform(scale*dpr,0,0,scale*dpr,0,0);
  ctx.save();
  if(G.shake>.3)ctx.translate(rand(-G.shake,G.shake),rand(-G.shake,G.shake));
  drawBG();
  if(G.goal)drawGoal();
  const t=G.time;
  for(const p of picks){if(p.kind==='letter'||p.kind==='gold')drawLetter(p.x,p.y,p.kind==='gold',t);
    else{const by=p.y+Math.sin(t*4)*5;const g=ctx.createRadialGradient(p.x,by,4,p.x,by,40);g.addColorStop(0,p.kind==='buldak'?'rgba(255,120,60,.6)':'rgba(170,230,120,.6)');g.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=g;ctx.fillRect(p.x-40,by-40,80,80);
      p.kind==='buldak'?drawBuldak(p.x,by,.95,t):drawCookie(p.x,by,1.05,t);}}
  for(const e of ents){ctx.save();if(e.flash>0)ctx.filter='brightness(2.2)';e.def.draw(e);ctx.restore();}
  for(const s of shots){ctx.save();ctx.translate(s.x,s.y);ctx.rotate(s.rot);ctx.strokeStyle='#eef4f8';ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(-9,0);ctx.lineTo(9,0);
    for(let i=-1;i<=1;i++){ctx.moveTo(i*4,-5);ctx.lineTo(i*4,5);}ctx.stroke();ctx.beginPath();ctx.moveTo(9,0);ctx.lineTo(14,-5);ctx.lineTo(14,5);ctx.closePath();ctx.fillStyle='#eef4f8';ctx.fill();ctx.restore();}
  if(G.state!=='title'){for(let i=0;i<WPN.bell;i++){const a=G.time*3.4+i*TAU/WPN.bell,bx=P.x+4+Math.cos(a)*62,by=P.y-28+Math.sin(a)*62*.8;
    ell(bx,by,9,9);fs('#f6d36b',OL,2);ctx.fillStyle=OL;ctx.fillRect(bx-4,by+1,8,1.6);ell(bx,by+4,1.6,1.6);fs(OL);ctx.strokeStyle='#d8392b';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(bx,by-9);ctx.lineTo(bx,by-13);ctx.stroke();}}
  drawPlayer();
  drawParts();
  drawAmbient();
  ctx.restore();
  if(P.buldak>0&&G.state==='play'){const a=.25+.1*Math.sin(t*20);const vg=ctx.createRadialGradient(W/2,H/2,H*.35,W/2,H/2,H*.85);vg.addColorStop(0,'rgba(255,60,20,0)');vg.addColorStop(1,`rgba(255,60,20,${a})`);ctx.fillStyle=vg;ctx.fillRect(0,0,W,H);
    ctx.strokeStyle='rgba(255,230,200,.35)';ctx.lineWidth=2;for(let i=0;i<8;i++){const y=hash(i+Math.floor(t*12))*H;ctx.beginPath();ctx.moveTo(W,y);ctx.lineTo(W-120-hash(i)*200,y);ctx.stroke();}}
  if(G.state!=='title')drawHUD();
  drawCutin();
  drawBanner();
  if(G.state==='deliver'&&G.del&&G.del.stopped)drawDeliverFx();
}
function drawPlayer(){
  if(G.state==='dying'){const k=Math.min(1,G.overT/1);drawCat(P.x,GROUND,{t:0,pose:'stand',hurt:true,tilt:k*-.5,alpha:1});return;}
  let pose='run';if(G.state==='title')pose='run';else if(P.sliding&&P.onGround)pose='slide';else if(!P.onGround)pose='jump';
  if(G.state==='deliver'&&G.del&&G.del.stopped)pose='stand';
  const blink=P.inv>0&&!P.eat&&P.buldak<=0&&Math.floor(G.time*14)%2===0;
  drawCat(P.x,P.y,{t:P.t,pose,alpha:blink?.35:1,eat:P.eat,spicy:P.buldak>0,hurt:P.hurtT>0,shield:P.shield>0,squash:P.squash});
}
function drawParts(){
  for(const p of parts){const a=clamp(p.life/p.max,0,1);ctx.globalAlpha=a;
    if(p.type==='text'){txt(p.text,p.x,p.y,p.size||18,p.color,'center');}
    else if(p.type==='ring'){ctx.strokeStyle=p.color;ctx.lineWidth=2.5;ell(p.x,p.y,p.size,p.size*.4);ctx.stroke();}
    else if(p.type==='flame'){ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.size*a+1,0,TAU);ctx.fill();}
    else{ctx.fillStyle=p.color;ctx.fillRect(p.x-p.size/2,p.y-p.size/2,p.size,p.size);}}
  ctx.globalAlpha=1;
}
function drawHUD(){
  for(let i=0;i<S.maxHp;i++)heart(28+i*30,28,1.25,i<P.hp);
  if(P.shield>0){const x=28+S.maxHp*30+6;ell(x,28,11,11);fs('rgba(143,208,106,.4)','#8fd06a',2.5);txt(Math.ceil(P.shield)+'',x,29,13,'#fff','center');}
  txt('Lv '+G.level,18,62,20,'#fff');
  rrect(90,55,112,13,6.5);fs('rgba(0,0,0,.35)',OL,2);const xr=clamp(G.xp/xpNeed(),0,1);if(xr>0){rrect(91.5,56.5,109*xr,10,5);fs('#7ad0ff');}
  let ix=18;for(const u of UPGRADES){const l=ULV[u.id];if(!l)continue;ctx.save();ctx.translate(ix+14,92);ell(0,0,14,14);fs('rgba(251,245,233,.9)',OL,2);ctx.scale(.42,.42);ctx.translate(-24,-24);drawUpIcon(u.id);ctx.restore();
    txt(''+l,ix+25,101,12,'#ffe7a0','center');ix+=34;}
  // 진행 바
  const st=STAGES[G.stage],pr=clamp(G.dist/st.length,0,1),bx=330,bw=300;
  txt(`${G.stage+1}장 ${st.name}`,W/2,16,15,'#fff','center');
  rrect(bx,30,bw,12,6);fs('rgba(0,0,0,.35)',OL,2);rrect(bx+1.5,31.5,(bw-3)*pr,9,4.5);fs('#f6d36b');
  ctx.save();ctx.translate(bx+bw+12,36);rrect(-9,-8,18,14,2);fs('#d8392b',OL,2);ctx.restore();
  ctx.save();ctx.translate(bx+bw*pr,34);ctx.scale(.62,.62);drawCatHead('normal',G.time,{});ctx.restore();
  // 점수
  txt(Math.floor(G.score).toLocaleString('ko-KR'),W-112,28,28,'#fff','right');
  ctx.save();ctx.translate(W-178,62);ctx.scale(.8,.8);rrect(-12,-8,24,16,2);fs('#fffaf0',OL,2.5);ctx.beginPath();ctx.moveTo(-12,-8);ctx.lineTo(0,1.5);ctx.lineTo(12,-8);ctx.stroke();ctx.restore();
  txt('× '+G.letters,W-160,63,18,'#fff','left');
  if(P.buldak>0){const w=160*clamp(P.buldak/(S.buldakDur+1),0,1);txt('불닭 모드',W/2-80,62,15,'#ffb07a','left');rrect(W/2-8,55,160,12,6);fs('rgba(0,0,0,.35)',OL,2);rrect(W/2-6.5,56.5,w-3,9,4.5);fs('#ff5a1f');}
  else if(P.magnetBoost>0){txt('편지 자석',W/2-80,62,15,'#bdf08a','left');rrect(W/2-8,55,160,12,6);fs('rgba(0,0,0,.35)',OL,2);rrect(W/2-6.5,56.5,157*P.magnetBoost/8,9,4.5);fs('#8fd06a');}
  if(G.hint){const a=Math.min(1,G.hint.t*4,(G.hint.dur-G.hint.t)*3);ctx.globalAlpha=a;ctx.font="17px 'Jua', sans-serif";const w=ctx.measureText(G.hint.text).width+36;
    rrect(W/2-w/2,112,w,34,17);fs('rgba(251,245,233,.95)',OL,2.5);txt(G.hint.text,W/2,129,17,'#2b2233','center',null);ctx.globalAlpha=1;}
}
function drawBanner(){
  if(!G.banner)return;const b=G.banner,a=Math.min(1,b.t*3,(b.dur-b.t)*2);if(a<=0)return;ctx.globalAlpha=a;
  const y=210;ctx.fillStyle='rgba(43,34,51,.6)';ctx.fillRect(0,y-52,W,104);ctx.fillStyle='#c8322a';ctx.fillRect(0,y-52,W,4);ctx.fillRect(0,y+48,W,4);
  txt(b.title,W/2,y-10,64,'#fbf5e9','center',OL,'brush');txt(b.sub,W/2,y+30,19,'#f6d36b','center',null);ctx.globalAlpha=1;
}
function drawCutin(){
  const c=G.cutin;if(!c)return;const k=c.t/c.dur,e=k<.15?k/.15:k>.85?(1-k)/.15:1;const bul=c.type==='buldak';
  ctx.save();ctx.globalAlpha=e;const sx=(1-Math.min(1,k/.15))*-200;ctx.translate(sx,0);
  const y=300;ctx.beginPath();ctx.moveTo(0,y-60);ctx.lineTo(W,y-90);ctx.lineTo(W,y+40);ctx.lineTo(0,y+70);ctx.closePath();fs(bul?'#d8261c':'#4f8a34',OL,4);
  ctx.save();ctx.clip();ctx.strokeStyle='rgba(255,255,255,.35)';ctx.lineWidth=3;for(let i=0;i<14;i++){const ly=y-90+hash(i+Math.floor(G.time*20))*170;ctx.beginPath();ctx.moveTo(W,ly);ctx.lineTo(W-200-hash(i)*500,ly);ctx.stroke();}ctx.restore();
  ctx.save();ctx.translate(220,y-4);ctx.scale(3.3,3.3);drawCatHead('chomp',G.time,{spicy:bul,mouthOpen:Math.sin(G.time*26)>0?2:0});ctx.restore();
  if(bul)drawBuldak(330,y+24,1.9,G.time);else drawCookie(330,y+24,2,G.time,.4);
  txt(bul?'불닭볶음면 후루룩!':'두쫀쿠 냠냠!',640,y-30,56,'#fff','center',OL,'brush');
  txt(bul?'불닭 모드! 무적 + 부딪히면 전부 태워요':'체력 +1 · 쫀득 보호막 · 편지 자석',640,y+16,19,bul?'#ffe0a0':'#e4ffc8','center');
  ctx.restore();
}
function drawDeliverFx(){
  const d=G.del,mx=G.goal.x+60;
  if(d.t<.8){const k=d.t/.8,sx=P.x-4,sy=P.y-44,ex=mx,ey=GROUND-74,x=lerp(sx,ex,k),y=lerp(sy,ey,k)-Math.sin(k*Math.PI)*90;drawLetter(x,y,false,0);}
  if(d.t>1){const k=Math.min(1,(d.t-1)/.25),s=lerp(2.2,1,k);ctx.save();ctx.translate(W/2,190);ctx.rotate(-.12);ctx.scale(s,s);ctx.globalAlpha=k;
    rrect(-120,-46,240,92,12);fs('rgba(251,245,233,.92)','#c8322a',6);rrect(-110,-36,220,72,8);fs(null,'#c8322a',2);txt('배달 완료',0,2,58,'#c8322a','center',null,'brush');ctx.restore();}
}

/* ---------------- 업그레이드 아이콘 ---------------- */
function drawUpIcon(id){
  ctx.save();ctx.lineJoin='round';ctx.lineCap='round';
  if(id==='fishbone'){ctx.strokeStyle=OL;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(8,24);ctx.lineTo(36,24);for(let i=0;i<4;i++){ctx.moveTo(13+i*6,16);ctx.lineTo(16+i*6,24);ctx.lineTo(13+i*6,32);}ctx.stroke();
    ctx.beginPath();ctx.moveTo(36,24);ctx.lineTo(44,16);ctx.lineTo(44,32);ctx.closePath();fs('#eef4f8',OL,2.5);ctx.beginPath();ctx.moveTo(8,24);ctx.lineTo(3,18);ctx.moveTo(8,24);ctx.lineTo(3,30);ctx.stroke();}
  else if(id==='bell'){ctx.strokeStyle='#d8392b';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(24,6);ctx.lineTo(24,12);ctx.stroke();ell(24,27,15,15);fs('#f6d36b',OL,2.5);ctx.fillStyle=OL;ctx.fillRect(14,28,20,3);ell(24,35,3,3);fs(OL);ell(19,21,3,2);fs('rgba(255,255,255,.6)');}
  else if(id==='jump'){ell(24,30,18,9);fs('#fff',OL,2.5);ell(16,25,9,8);fs('#fff');ell(30,23,10,9);fs('#fff');ell(24,22,5,4);fs('#f4a7b5',OL,2);ell(17,15,2.6,2.6);fs('#f4a7b5',OL,1.5);ell(24,12,2.6,2.6);fs('#f4a7b5',OL,1.5);ell(31,15,2.6,2.6);fs('#f4a7b5',OL,1.5);}
  else if(id==='hp'){heart(24,26,2.4,true);}
  else if(id==='magnet'){ctx.strokeStyle='#d8392b';ctx.lineWidth=7;ctx.beginPath();ctx.arc(24,24,14,Math.PI*.15,Math.PI*.85,true);ctx.stroke();ctx.fillStyle='#ccd';ctx.fillRect(33,29,8,7);ctx.fillRect(7,29,8,7);
    ctx.save();ctx.translate(24,30);ctx.scale(.55,.55);rrect(-12,-8,24,16,2);fs('#fffaf0',OL,3);ctx.restore();}
  else if(id==='spicy'){ctx.beginPath();ctx.moveTo(12,14);ctx.quadraticCurveTo(40,10,38,40);ctx.quadraticCurveTo(22,30,12,14);fs('#e8261c',OL,2.5);ctx.strokeStyle='#3f8a34';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(12,14);ctx.quadraticCurveTo(8,8,12,4);ctx.stroke();}
  else if(id==='lucky'){ctx.translate(24,28);ctx.scale(1.1,1.1);drawCatHead('happy',0,{noCap:true});ctx.setTransform(ctx.getTransform());}
  ctx.restore();
}

/* ---------------- 화면/오버레이 ---------------- */
const OVS=['ovTitle','ovLevel','ovClear','ovOver','ovPause'];
function showOv(id){for(const o of OVS)$(o).hidden=o!==id;}
function setState(s){G.state=s;
  if(s==='play'||s==='deliver'||s==='dying')showOv(null);
  $('btnPause').hidden=!(s==='play'||s==='pause');
  $('btnSlide').hidden=!(isTouch&&s==='play');
}
let curChoices=[];
function openLevelUp(){
  setState('levelup');SFX.level();
  let pool=UPGRADES.filter(u=>(ULV[u.id]||0)<u.max);
  for(let i=pool.length-1;i>0;i--){const j=Math.random()*(i+1)|0;[pool[i],pool[j]]=[pool[j],pool[i]];}
  if(!ULV.fishbone&&!ULV.bell){const f=pool.findIndex(u=>u.id==='fishbone');if(f>2){[pool[0],pool[f]]=[pool[f],pool[0]];}}
  curChoices=pool.slice(0,3);
  const box=$('upCards');box.innerHTML='';
  curChoices.forEach((u,i)=>{const l=ULV[u.id]||0;const b=document.createElement('button');b.className='up';b.type='button';b.id='up'+i;
    b.innerHTML=`<canvas width="112" height="112"></canvas><div class="nm">${u.name}</div><div class="lv">${l?`Lv ${l} → ${l+1}`:'새 능력'}</div><div class="ds">${u.desc(l)}</div><div class="kb">${i+1}번 키</div>`;
    b.onclick=()=>chooseUp(i);box.appendChild(b);
    drawOn(b.querySelector('canvas'),112/48,()=>drawUpIcon(u.id));});
  if(!curChoices.length){G.pendingLv=0;setState('play');return;}
  showOv('ovLevel');setTimeout(()=>{const f=$('up0');f&&f.focus({preventScroll:true});},50);
}
function chooseUp(i){
  if(G.state!=='levelup')return;const u=curChoices[i];if(!u)return;
  ULV[u.id]=(ULV[u.id]||0)+1;u.apply();G.pendingLv--;
  popText(P.x,P.y-90,u.name+'!','#ffe7a0',22);
  if(G.pendingLv>0)openLevelUp();else{setState('play');}
}
function showClear(){
  const st=STAGES[G.stage],hpB=P.hp*200,delB=1000*(G.stage+1),lb=G.stageLetters*5;
  G.score+=hpB+delB+lb;
  const last=G.stage===STAGES.length-1;
  $('clearTitle').textContent=last?'모든 편지 배달 완료!':'배달 완료!';
  $('clearMsg').textContent=last?'벚꽃 마을부터 축제의 밤까지, 오늘의 배달을 모두 마쳤어요.':`${st.recipient}께 편지를 무사히 전했어요.`;
  $('clearRows').innerHTML=`<span>모은 편지 ${G.stageLetters}통</span><span>+${lb.toLocaleString('ko-KR')}</span><span>남은 체력 보너스</span><span>+${hpB.toLocaleString('ko-KR')}</span><span>배달 보너스</span><span>+${delB.toLocaleString('ko-KR')}</span><span class="tot">총점</span><span class="tot">${Math.floor(G.score).toLocaleString('ko-KR')}</span>`;
  $('btnNext').textContent=last?'처음부터 다시':'다음 배달지로';
  if(last)updateBest();
  Ops.track('stage_clear',{stage:G.stage+1,score:Math.floor(G.score),level:G.level,hp:P.hp});
  setState('clear');showOv('ovClear');setTimeout(()=>$('btnNext').focus({preventScroll:true}),50);
}
function updateBest(){if(G.score>G.best){G.best=Math.floor(G.score);saveBest(G.best);}}
function showOver(){
  updateBest();const st=STAGES[G.stage];
  Ops.track('game_over',{stage:G.stage+1,score:Math.floor(G.score),level:G.level,dist:Math.floor(G.dist)});
  $('overMsg').textContent=`${st.name}에서 넘어졌어요. ${st.recipient}께서 기다리고 있어요!`;
  $('overRows').innerHTML=`<span>점수</span><span>${Math.floor(G.score).toLocaleString('ko-KR')}</span><span>모은 편지</span><span>${G.letters}통</span><span>레벨</span><span>${G.level}</span><span class="tot">최고 점수</span><span class="tot">${G.best.toLocaleString('ko-KR')}</span>`;
  setState('over');showOv('ovOver');setTimeout(()=>$('btnRetry').focus({preventScroll:true}),50);
}
function toTitle(){G.stage=0;G.state='title';initAmbient();P.eat=null;P.buldak=0;P.shield=0;ents=[];picks=[];shots=[];G.goal=null;
  $('bestTitle').textContent=G.best?`최고 점수 ${G.best.toLocaleString('ko-KR')}`:'';showOv('ovTitle');setState('title');}
function startGame(){SFX.init();resetRun();startStage(0);Ops.track('game_start');}
function pause(on){if(on&&G.state==='play'){setState('pause');$('pauseInfo').textContent=`${G.stage+1}장 ${STAGES[G.stage].name} · 점수 ${Math.floor(G.score).toLocaleString('ko-KR')}`;showOv('ovPause');}
  else if(!on&&G.state==='pause'){setState('play');showOv(null);}}

function drawOn(c,s,fn){const prev=ctx;ctx=c.getContext('2d');ctx.setTransform(s,0,0,s,0,0);ctx.clearRect(0,0,100,100);fn();ctx=prev;}

/* ---------------- 입력 ---------------- */
const isTouch=window.matchMedia('(pointer:coarse)').matches;
if(isTouch)$('keysHelp').innerHTML='화면 탭: 점프 (공중에서 한 번 더) · 왼쪽 아래 버튼 또는 아래로 쓸기: 슬라이드';
const stage=$('stage');let ptr=null;
stage.addEventListener('pointerdown',e=>{if(e.target.closest('.ov,button'))return;SFX.init();e.preventDefault();
  if(G.state==='play'){doJump();input.jumpHeld=true;ptr={id:e.pointerId,y:e.clientY,slid:false};}});
stage.addEventListener('pointermove',e=>{if(!ptr||ptr.id!==e.pointerId)return;if(!ptr.slid&&e.clientY-ptr.y>40*scale){ptr.slid=true;input.touchSlide=true;doSlide();}});
const endPtr=e=>{if(ptr&&ptr.id===e.pointerId){input.jumpHeld=false;if(ptr.slid)input.touchSlide=false;ptr=null;}};
stage.addEventListener('pointerup',endPtr);stage.addEventListener('pointercancel',endPtr);
const bs=$('btnSlide');
bs.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();SFX.init();input.touchSlide=true;bs.classList.add('on');doSlide();});
const bsUp=()=>{input.touchSlide=false;bs.classList.remove('on');};bs.addEventListener('pointerup',bsUp);bs.addEventListener('pointercancel',bsUp);bs.addEventListener('pointerleave',bsUp);
stage.addEventListener('contextmenu',e=>e.preventDefault());
window.addEventListener('keydown',e=>{
  const k=e.key;
  if([' ','ArrowUp','ArrowDown'].includes(k))e.preventDefault();
  if(G.state==='levelup'&&['1','2','3'].includes(k)){chooseUp(+k-1);return;}
  if(k==='p'||k==='P'||k==='Escape'){pause(G.state==='play');return;}
  if(G.state!=='play')return;
  if((k===' '||k==='ArrowUp'||k==='w'||k==='W'||k==='z'||k==='Z')&&!e.repeat){SFX.init();doJump();input.jumpHeld=true;}
  if(k==='ArrowDown'||k==='s'||k==='S'){if(!input.down)doSlide();input.down=true;}
});
window.addEventListener('keyup',e=>{const k=e.key;if(k===' '||k==='ArrowUp'||k==='w'||k==='W'||k==='z'||k==='Z')input.jumpHeld=false;if(k==='ArrowDown'||k==='s'||k==='S')input.down=false;});
$('btnStart').onclick=startGame;
$('btnNext').onclick=()=>{if(G.stage>=STAGES.length-1){toTitle();return;}P.hp=Math.min(S.maxHp,P.hp+1);startStage(G.stage+1);};
$('btnRetry').onclick=startGame;$('btnHome').onclick=toTitle;$('btnQuit').onclick=toTitle;
$('btnResume').onclick=()=>pause(false);$('btnPause').onclick=()=>pause(G.state==='play');
$('btnMute').onclick=()=>{SFX.muted=!SFX.muted;$('btnMute').textContent=SFX.muted?'×':'♪';Ops.save.set({muted:SFX.muted});};
$('btnMute').textContent=SFX.muted?'×':'♪';
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause(true);});

/* ---------------- 크기 / 루프 ---------------- */
function resize(){const wr=$('wrap'),ww=wr.clientWidth,wh=wr.clientHeight;scale=Math.min(ww/W,wh/H);
  stage.style.width=W*scale+'px';stage.style.height=H*scale+'px';stage.style.setProperty('--u',scale+'px');
  dpr=Math.min(window.devicePixelRatio||1,2);cv.width=Math.round(W*scale*dpr);cv.height=Math.round(H*scale*dpr);}
window.addEventListener('resize',resize);resize();
let last=performance.now();
function frame(ts){const dt=Math.min(.033,Math.max(0,(ts-last)/1000));last=ts;update(dt);render();requestAnimationFrame(frame);}
// 타이틀 아이콘
drawOn($('icoLetter'),2,()=>{drawLetter(24,22,false,0);drawLetter(30,30,true,0);});
drawOn($('icoGoal'),2,()=>{rrect(14,8,20,38,5);fs('#d8392b',OL,2.5);rrect(18,16,12,3,1);fs(OL);});
drawOn($('icoBuldak'),2,()=>drawBuldak(24,30,.85,0));
drawOn($('icoCookie'),2,()=>drawCookie(24,25,1,0,.2));
$('verLabel').textContent='v'+Ops.version;
toTitle();
requestAnimationFrame(frame);
if(Ops.debug)window.__cat={G,P,get S(){return S;},get WPN(){return WPN;},startGame,startStage,eat,openLevelUp,get ents(){return ents;}};
