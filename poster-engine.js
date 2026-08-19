/* Shared poster data + offline canvas export engine. No external dependencies. */
(function(){
const configs={
realestate:{
 label:"عقارات",
 templates:[
  {name:"كلاسيكي",title:"شقة واسعة للإيجار"},
  {name:"فاخر",title:"عقار مميز للبيع"},
  {name:"سريع",title:"عرض عقاري مميز"}
 ],
 fields:[
  ["title","عنوان الإعلان","شقة واسعة للإيجار"],["location","الموقع","الرفاع الشرقي – خلف مستشفى الريان"],
  ["type","نوع العقار","شقة"],["rooms","الغرف","2 غرفة نوم"],["baths","الحمامات","2 حمام"],["amenities","المميزات","صالة واسعة • مطبخ • موقف سيارة"],["price","السعر","200 د.ب شهريًا"],["extra","تفاصيل إضافية","غير شامل الكهرباء والماء"]
 ]},
contracting:{
 label:"مقاولات",
 templates:[{name:"شركة",title:"مقاولات وتشطيبات باحتراف"},{name:"مشروع",title:"نبني لك من الفكرة إلى التسليم"}],
 fields:[
  ["title","عنوان الإعلان","مقاولات وتشطيبات باحتراف"],["location","منطقة الخدمة","جميع مناطق البحرين"],["service","الخدمة","بناء • ترميم • تشطيبات"],["work","الأعمال","دهانات • جبس • أرضيات • كهرباء"],["quality","الميزة","عمالة محترفة • جودة عالية • التزام بالمواعيد"],["price","السعر","أسعار تنافسية"],["extra","تفاصيل إضافية","معاينة وتقديم عرض سعر"]
 ]},
transactions:{
 label:"تخليص معاملات",
 templates:[{name:"خدمات",title:"ننجز معاملاتك بسهولة"},{name:"عرض",title:"خدمات تخليص معاملات سريعة"}],
 fields:[
  ["title","عنوان الإعلان","ننجز معاملاتك بسهولة"],["location","نطاق الخدمة","البحرين"],["service","الخدمات","تخليص معاملات • تجديد • إصدار"],["audience","لمن؟","أفراد • شركات • مؤسسات"],["speed","السرعة","إنجاز سريع ومتابعة مستمرة"],["price","السعر","أسعار تنافسية"],["extra","تفاصيل إضافية","للاستفسار والتواصل عبر واتساب"]
 ]}
};

/* field-level icon (used for the field label itself) */
const ICONS={type:"🏢",rooms:"🛏️",baths:"🛁",amenities:"✨",extra:"📌",service:"🛠️",work:"🧱",quality:"⭐",audience:"👥",speed:"⚡"};
const EN_CATEGORY_LABELS={realestate:"Real Estate",contracting:"Contracting",transactions:"Documentation Services"};
const EN_FIELD_LABELS={type:"Property Type",rooms:"Rooms",baths:"Bathrooms",amenities:"Amenities",extra:"Additional Details",service:"Service",work:"Scope of Work",quality:"Highlight",audience:"For",speed:"Turnaround",location:"Location",title:"Title",price:"Price"};

/* keyword-level icons: when a field's value is a multi-item list ("صالة • مطبخ • موقف سيارة"),
   each item gets matched to its own icon, e.g. "غرفة" -> 🛏️, "مطبخ" -> 🍳 */
const KEYWORD_ICONS=[
 [/غرف/,"🛏️"],[/مطبخ/,"🍳"],[/حمام/,"🛁"],[/صالة|صالون|جلوس/,"🛋️"],
 [/موقف|جراج|كراج|باركن/,"🚗"],[/حديقة|حوش|فناء/,"🌳"],[/مسبح|سباحة/,"🏊"],
 [/تكييف|مكيف/,"❄️"],[/أمن|حراسة|كاميرات/,"🛡️"],[/مصعد/,"🛗"],
 [/واي فاي|وايفاي|انترنت|إنترنت/,"📶"],[/مفروش/,"🛋️"],[/إطلالة|اطلالة|بحر|بحرية/,"🌊"],
 [/دهان/,"🎨"],[/جبس/,"🏗️"],[/أرضيات|ارضيات|بلاط|رخام|سيراميك/,"◼️"],
 [/كهرباء/,"💡"],[/تشطيب/,"🧱"],[/تسليم|جاهز/,"⏱️"],[/ضمان/,"🛡️"],
 [/سرعة|سريع/,"⚡"],[/جودة/,"⭐"],[/سعر|تنافسي/,"💰"],[/معاملة|معاملات/,"📄"],
 [/شركة|شركات/,"🏢"],[/فرد|أفراد/,"👤"]
];
function iconFor(text){
 for(const [re,ic] of KEYWORD_ICONS) if(re.test(text)) return ic;
 return "✔️";
}
function splitItems(text){
 return String(text).split(/[•\-–,،]/).map(s=>s.trim()).filter(Boolean);
}

const THEMES=[
 {id:"navygold",name:"كحلي وذهبي",c:["#0d2c52","#d6a52d"]},
 {id:"blackgold",name:"أسود وذهبي",c:["#141414","#d6a52d"]},
 {id:"blackgrey",name:"أسود ورمادي",c:["#1c1c1c","#a7b1bb"]},
 {id:"maroongold",name:"عنابي وذهبي",c:["#4a0f1c","#d6a52d"]},
 {id:"greengold",name:"أخضر غامق وذهبي",c:["#0c3a26","#d6a52d"]},
 {id:"beigebrown",name:"بيج وبني",c:["#f1e6d6","#8a5a34"]},
 {id:"whitegold",name:"أبيض وذهبي",c:["#ffffff","#bb8f2c"]},
 {id:"lightbluenavy",name:"أزرق فاتح وكحلي",c:["#eaf3fb","#0a2c50"]},
 {id:"gradient",name:"تدرجات متداخلة",c:["#3a0d5c","#d6a52d"]},
 {id:"sunsetvibrant",name:"غروب مبهج",c:["#ff7a30","#7a1fa2"]},
 {id:"royalpurple",name:"بنفسجي ملكي",c:["#2a0845","#d6a52d"]},
 {id:"rubyblack",name:"ياقوتي وأسود",c:["#3d0000","#d6a52d"]},
 {id:"tealgold",name:"أخضر مائي وذهبي",c:["#0a5c52","#d6a52d"]}
];

/* geometric layout shapes for the image/body split */
const SHAPES=[
 {id:"straight",name:"مستقيم كلاسيكي"},
 {id:"diagonal",name:"قطع مائل عصري"},
 {id:"wave",name:"موجة انسيابية"},
 {id:"frame",name:"إطار مؤطر فاخر"}
];
/* returns an array of [x,y] fraction points (0..1) describing the image-area clip polygon for a shape,
   or null for shapes handled without a clip path (e.g. "frame"). Shared by DOM (clip-path) and canvas (ctx path). */
function shapeClipPoints(shape){
 if(shape==="diagonal") return [[0,0],[1,0],[1,0.78],[0,0.94]];
 if(shape==="wave"){
  const pts=[[0,0],[1,0]];
  const baseY=0.85, amp=0.055, steps=10;
  for(let i=steps;i>=0;i--){
   const x=i/steps;
   const y=baseY+amp*Math.sin(x*Math.PI*1.6+0.4);
   pts.push([x,y]);
  }
  return pts;
 }
 return null; // straight / frame
}

const THEME_COLORS={
 navygold:{bg:"#0d2c52",bgGrad:null,blend:"#0d2c52",title:"#ffffff",sub:"#c8d6e8",accent:"#d6a52d",accentText:"#09284d",detailBg:"rgba(255,255,255,0.13)",detailText:"#ffffff",footerBg:"#08213e",footerText:"#ffffff",priceBg:"#d6a52d",priceText:"#09284d",line2:"rgba(255,255,255,0.22)"},
 blackgold:{bg:"#141414",bgGrad:null,blend:"#141414",title:"#ffffff",sub:"#cfcfcf",accent:"#d6a52d",accentText:"#141414",detailBg:"rgba(255,255,255,0.12)",detailText:"#ffffff",footerBg:"#000000",footerText:"#ffffff",priceBg:"#d6a52d",priceText:"#141414",line2:"rgba(255,255,255,0.2)"},
 blackgrey:{bg:"#1c1c1c",bgGrad:null,blend:"#1c1c1c",title:"#ffffff",sub:"#b7bcc2",accent:"#a7b1bb",accentText:"#141414",detailBg:"rgba(255,255,255,0.1)",detailText:"#ffffff",footerBg:"#000000",footerText:"#ffffff",priceBg:"#a7b1bb",priceText:"#141414",line2:"rgba(255,255,255,0.18)"},
 maroongold:{bg:"#4a0f1c",bgGrad:null,blend:"#4a0f1c",title:"#ffffff",sub:"#e8c9cf",accent:"#d6a52d",accentText:"#4a0f1c",detailBg:"rgba(255,255,255,0.14)",detailText:"#ffffff",footerBg:"#38070f",footerText:"#ffffff",priceBg:"#d6a52d",priceText:"#4a0f1c",line2:"rgba(255,255,255,0.22)"},
 greengold:{bg:"#0c3a26",bgGrad:null,blend:"#0c3a26",title:"#ffffff",sub:"#c9e3d5",accent:"#d6a52d",accentText:"#0c3a26",detailBg:"rgba(255,255,255,0.14)",detailText:"#ffffff",footerBg:"#082a1b",footerText:"#ffffff",priceBg:"#d6a52d",priceText:"#0c3a26",line2:"rgba(255,255,255,0.22)"},
 beigebrown:{bg:"#f1e6d6",bgGrad:null,blend:"#f1e6d6",title:"#4a2f1c",sub:"#7a5a3d",accent:"#8a5a34",accentText:"#ffffff",detailBg:"rgba(255,255,255,0.7)",detailText:"#4a2f1c",footerBg:"#5c3a20",footerText:"#ffffff",priceBg:"#8a5a34",priceText:"#ffffff",line2:"rgba(0,0,0,0.12)"},
 whitegold:{bg:"#ffffff",bgGrad:null,blend:"#ffffff",title:"#1c1c1c",sub:"#6b6b6b",accent:"#bb8f2c",accentText:"#ffffff",detailBg:"#f7f1e4",detailText:"#3a3a3a",footerBg:"#1c1c1c",footerText:"#ffffff",priceBg:"#bb8f2c",priceText:"#ffffff",line2:"rgba(0,0,0,0.1)"},
 lightbluenavy:{bg:"#eaf3fb",bgGrad:null,blend:"#eaf3fb",title:"#0a2c50",sub:"#3f5d7d",accent:"#0a2c50",accentText:"#ffffff",detailBg:"rgba(255,255,255,0.75)",detailText:"#0a2c50",footerBg:"#0a2c50",footerText:"#ffffff",priceBg:"#0a2c50",priceText:"#ffffff",line2:"rgba(10,44,80,0.14)"},
 gradient:{bg:"#241238",bgGrad:[["#3a0d5c",0],["#0d2c52",0.55],["#7a1f3d",1]],blend:"#241238",title:"#ffffff",sub:"#eadcf2",accent:"#d6a52d",accentText:"#2a0a3d",detailBg:"rgba(255,255,255,0.16)",detailText:"#ffffff",footerBg:"rgba(0,0,0,0.4)",footerText:"#ffffff",priceBg:"#d6a52d",priceText:"#2a0a3d",line2:"rgba(255,255,255,0.25)"},
 sunsetvibrant:{bg:"#7a1fa2",bgGrad:[["#ff7a30",0],["#ff2d78",0.5],["#7a1fa2",1]],blend:"#5c1478",title:"#ffffff",sub:"#ffe8d6",accent:"#ffd166",accentText:"#7a1fa2",detailBg:"rgba(255,255,255,0.18)",detailText:"#ffffff",footerBg:"rgba(0,0,0,0.38)",footerText:"#ffffff",priceBg:"#ffd166",priceText:"#7a1fa2",line2:"rgba(255,255,255,0.28)"},
 royalpurple:{bg:"#2a0845",bgGrad:null,blend:"#2a0845",title:"#ffffff",sub:"#dcc7ef",accent:"#d6a52d",accentText:"#2a0845",detailBg:"rgba(255,255,255,0.13)",detailText:"#ffffff",footerBg:"#190330",footerText:"#ffffff",priceBg:"#d6a52d",priceText:"#2a0845",line2:"rgba(255,255,255,0.22)"},
 rubyblack:{bg:"#1c0000",bgGrad:[["#3d0000",0],["#1c0000",0.6],["#000000",1]],blend:"#1c0000",title:"#ffffff",sub:"#e8c9c9",accent:"#d6a52d",accentText:"#1c0000",detailBg:"rgba(255,255,255,0.12)",detailText:"#ffffff",footerBg:"#000000",footerText:"#ffffff",priceBg:"#d6a52d",priceText:"#1c0000",line2:"rgba(255,255,255,0.2)"},
 tealgold:{bg:"#063f3f",bgGrad:[["#0a5c52",0],["#063f3f",0.6],["#032626",1]],blend:"#063f3f",title:"#ffffff",sub:"#c9e8e3",accent:"#d6a52d",accentText:"#063f3f",detailBg:"rgba(255,255,255,0.14)",detailText:"#ffffff",footerBg:"#032626",footerText:"#ffffff",priceBg:"#d6a52d",priceText:"#063f3f",line2:"rgba(255,255,255,0.22)"}
};

const IMGLAYOUTS=[
 {id:"hero",name:"رئيسية + مصغرات",ic:"🖼️"},
 {id:"collage",name:"كولاج",ic:"🧩"},
 {id:"grid",name:"شبكة صور",ic:"▦"},
 {id:"single",name:"صورة واحدة كبيرة",ic:"🖼"}
];
const DETAILSTYLES=[
 {id:"cards",name:"بطاقات"},
 {id:"list",name:"قائمة"},
 {id:"chips",name:"شرائح"},
 {id:"table",name:"جدول"}
];

function imageLayoutRects(layout,totalCount){
 const cap = layout==="single"?1:layout==="hero"?5:layout==="collage"?5:9;
 const shown = Math.max(0,Math.min(totalCount,cap));
 const overlay = layout!=="single" && totalCount>cap;
 const remaining = totalCount-cap;
 let rects=[];
 if(shown===0) return {rects,shown,overlay:false,remaining:0};
 if(layout==="single"){
  rects=[{x:0,y:0,w:1,h:1}];
 }else if(layout==="hero"){
  if(shown===1) rects=[{x:0,y:0,w:1,h:1}];
  else{
   rects.push({x:0,y:0,w:1,h:0.76});
   const tc=shown-1,tw=1/tc;
   for(let i=0;i<tc;i++) rects.push({x:i*tw,y:0.76,w:tw,h:0.24});
  }
 }else if(layout==="collage"){
  if(shown===1) rects=[{x:0,y:0,w:1,h:1}];
  else if(shown===2) rects=[{x:0,y:0,w:0.5,h:1},{x:0.5,y:0,w:0.5,h:1}];
  else if(shown===3) rects=[{x:0,y:0,w:0.6,h:1},{x:0.6,y:0,w:0.4,h:0.5},{x:0.6,y:0.5,w:0.4,h:0.5}];
  else if(shown===4) rects=[{x:0,y:0,w:0.5,h:0.5},{x:0.5,y:0,w:0.5,h:0.5},{x:0,y:0.5,w:0.5,h:0.5},{x:0.5,y:0.5,w:0.5,h:0.5}];
  else rects=[{x:0,y:0,w:0.55,h:1},{x:0.55,y:0,w:0.225,h:0.5},{x:0.775,y:0,w:0.225,h:0.5},{x:0.55,y:0.5,w:0.225,h:0.5},{x:0.775,y:0.5,w:0.225,h:0.5}];
 }else if(layout==="grid"){
  const cols = shown<=2?shown:(shown<=4?2:3);
  const rows = Math.ceil(shown/cols);
  for(let i=0;i<shown;i++){
   const r=Math.floor(i/cols),c=i%cols;
   const rowItems = Math.min(cols,shown-r*cols);
   rects.push({x:c/rowItems,y:r/rows,w:1/rowItems,h:1/rows});
  }
 }
 return {rects,shown,overlay,remaining};
}

function fieldEntries(category, fields, lang){
 return configs[category].fields.filter(([id])=>!["title","location","price"].includes(id)).map(([id,label])=>({id,label:(lang==="en"?(EN_FIELD_LABELS[id]||label):label),value:(fields&&fields[id])||"",icon:ICONS[id]||"•"}));
}

/* ---------- offline canvas export ---------- */
function loadImg(url){return new Promise((res,rej)=>{const im=new Image();im.crossOrigin="anonymous";im.onload=()=>res(im);im.onerror=rej;im.src=url})}
function roundRectPath(ctx,x,y,w,h,r){
 ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.arcTo(x+w,y,x+w,y+r,r);ctx.lineTo(x+w,y+h-r);ctx.arcTo(x+w,y+h,x+w-r,y+h,r);ctx.lineTo(x+r,y+h);ctx.arcTo(x,y+h,x,y+h-r,r);ctx.lineTo(x,y+r);ctx.arcTo(x,y,x+r,y,r);ctx.closePath();
}
function drawCover(ctx,img,x,y,w,h){
 const ir=img.width/img.height,r=w/h;let sx,sy,sw,sh;
 if(ir>r){sh=img.height;sw=sh*r;sx=(img.width-sw)/2;sy=0}else{sw=img.width;sh=sw/r;sx=0;sy=(img.height-sh)/2}
 ctx.drawImage(img,sx,sy,sw,sh,x,y,w,h);
}
function wrapLines(ctx,text,maxWidth){
 const words=String(text).split(/\s+/).filter(Boolean);
 const lines=[];let cur="";
 for(const w of words){
  const t=cur?cur+" "+w:w;
  if(ctx.measureText(t).width>maxWidth && cur){lines.push(cur);cur=w}else cur=t;
 }
 if(cur)lines.push(cur);
 return lines.length?lines:[""];
}
function truncate(ctx,text,maxWidth){
 if(ctx.measureText(text).width<=maxWidth)return text;
 let t=text;
 while(t.length>1 && ctx.measureText(t+"…").width>maxWidth) t=t.slice(0,-1);
 return t+"…";
}

/* state = {category,theme,imgLayout,detailStyle,shape,lang,fields:{id:value},contact:{brand,phone},images:[{url}]} */
async function renderExportCanvas(state){
 const W=1080,H=1440,cv=document.createElement("canvas");cv.width=W;cv.height=H;
 const ctx=cv.getContext("2d");
 const lang=state.lang==="en"?"en":"ar";
 const RTL=lang==="ar";
 ctx.direction=RTL?"rtl":"ltr";
 const T=THEME_COLORS[state.theme]||THEME_COLORS.navygold;
 const shape=state.shape||"straight";
 const areaH=Math.round(H*0.42), footerH=140, bodyTop=areaH, bodyBottom=H-footerH;
 const padX=64;
 const images=state.images||[];
 const val=(id,fb)=> (state.fields&&state.fields[id]) || fb || "";
 const anchorX = RTL ? W-padX : padX; // "start" edge for text
 const farX = RTL ? padX : W-padX; // "end" edge
 const textAlignStart = RTL ? "right" : "left";
 const textAlignEnd = RTL ? "left" : "right";

 if(T.bgGrad){
  const g=ctx.createLinearGradient(0,0,W,H);
  T.bgGrad.forEach(([c,stop])=>g.addColorStop(stop,c));
  ctx.fillStyle=g;
 }else ctx.fillStyle=T.bg;
 ctx.fillRect(0,0,W,H);

 /* image area geometry: "frame" shape insets the image block with padding + corner accents */
 const framePad = shape==="frame" ? Math.round(W*0.045) : 0;
 const imgX0=framePad, imgY0=framePad, imgW=W-framePad*2, imgH=areaH-framePad*1.4;

 const clipPts = shapeClipPoints(shape);
 ctx.save();
 if(clipPts){
  ctx.beginPath();
  clipPts.forEach(([fx,fy],i)=>{
   const px=fx*W, py=fy*areaH;
   i===0?ctx.moveTo(px,py):ctx.lineTo(px,py);
  });
  ctx.closePath();ctx.clip();
 }
 if(images.length===0){
  const g=ctx.createLinearGradient(0,0,W,areaH);g.addColorStop(0,"#e9eef3");g.addColorStop(1,"#c8d4df");
  ctx.fillStyle=g;ctx.fillRect(imgX0,imgY0,imgW,imgH);
 }else{
  const {rects,overlay,remaining}=imageLayoutRects(state.imgLayout,images.length);
  const loaded=await Promise.all(images.slice(0,rects.length).map(im=>loadImg(im.url)));
  const gap=3;
  rects.forEach((r,i)=>{
   const rx=imgX0+r.x*imgW, ry=imgY0+r.y*imgH, rw=r.w*imgW, rh=r.h*imgH;
   const ix=rx+gap/2, iy=ry+gap/2, iw=rw-gap, ih=rh-gap;
   ctx.save();roundRectPath(ctx,ix,iy,iw,ih,shape==="frame"?10:4);ctx.clip();
   drawCover(ctx,loaded[i],ix,iy,iw,ih);
   ctx.restore();
   if(overlay && i===rects.length-1){
    ctx.fillStyle="rgba(0,0,0,0.62)";roundRectPath(ctx,ix,iy,iw,ih,4);ctx.fill();
    ctx.fillStyle="#fff";ctx.font="900 34px Arial";ctx.textAlign="center";
    ctx.fillText("+"+remaining,ix+iw/2,iy+ih/2+12);
   }
  });
 }
 ctx.restore();

 if(shape==="frame"){
  const L=34, lw=6;
  ctx.strokeStyle=T.accent;ctx.lineWidth=lw;ctx.lineCap="square";
  const corners=[[imgX0,imgY0,1,1],[imgX0+imgW,imgY0,-1,1],[imgX0,imgY0+imgH,1,-1],[imgX0+imgW,imgY0+imgH,-1,-1]];
  corners.forEach(([cx,cy,dx,dy])=>{
   ctx.beginPath();ctx.moveTo(cx+dx*L,cy);ctx.lineTo(cx,cy);ctx.lineTo(cx,cy+dy*L);ctx.stroke();
  });
 }

 if(shape!=="frame"){
  const bgGrad2=ctx.createLinearGradient(0,areaH*0.72,0,areaH);
  bgGrad2.addColorStop(0,"rgba(0,0,0,0)");
  bgGrad2.addColorStop(1,T.blend);
  ctx.fillStyle=bgGrad2;ctx.fillRect(0,areaH*0.72,W,areaH*0.28);
 }

 let y=bodyTop+56;
 const c=configs[state.category]||configs.realestate;

 ctx.font="800 24px Arial";
 const pillText=(lang==="en"?(EN_CATEGORY_LABELS[state.category]||c.label):c.label), pillPadX=22, pillH=52;
 const pillW=ctx.measureText(pillText).width+pillPadX*2;
 ctx.fillStyle=T.accent;
 const pillX = RTL ? anchorX-pillW : anchorX;
 roundRectPath(ctx,pillX,y,pillW,pillH,pillH/2);ctx.fill();
 ctx.fillStyle=T.accentText;ctx.textAlign="center";ctx.textBaseline="middle";
 ctx.fillText(pillText,pillX+pillW/2,y+pillH/2+2);
 y+=pillH+30;

 let titleSize=58;
 ctx.textBaseline="alphabetic";
 let titleLines;
 while(true){
  ctx.font="900 "+titleSize+"px Arial";
  titleLines=wrapLines(ctx,val("title",lang==="en"?"Ad Title":"إعلان"),W-padX*2);
  if(titleLines.length<=2 || titleSize<=38)break;
  titleSize-=3;
 }
 if(titleLines.length>2){
  titleLines=titleLines.slice(0,2);
  titleLines[1]=truncate(ctx,titleLines[1],W-padX*2);
 }
 ctx.fillStyle=T.title;ctx.textAlign=textAlignStart;
 const titleLH=titleSize*1.22;
 titleLines.forEach((ln,i)=>ctx.fillText(ln,anchorX,y+titleSize*0.85+i*titleLH));
 y+=titleLines.length*titleLH+18;

 ctx.fillStyle=T.accent;
 const dividerX = RTL ? anchorX-50 : anchorX;
 roundRectPath(ctx,dividerX,y,50,5,3);ctx.fill();
 y+=28;

 ctx.font="600 30px Arial";ctx.fillStyle=T.sub;ctx.textAlign=textAlignStart;
 const subText=truncate(ctx,val("location",""),W-padX*2);
 if(subText){ctx.fillText(subText,anchorX,y+24);y+=52}else y+=14;

 const priceH=118, priceGap=26, bottomPad=26;
 const detailsBottom = bodyBottom - bottomPad - priceH - priceGap;
 const availH = Math.max(60, detailsBottom - y);
 const entries=fieldEntries(state.category, state.fields, lang);

 drawDetails(ctx, entries, state.detailStyle, T, y, availH, padX, W, RTL);

 const priceY=bodyBottom-bottomPad-priceH;
 ctx.fillStyle=T.priceBg;roundRectPath(ctx,padX,priceY,W-padX*2,priceH,16);ctx.fill();
 ctx.fillStyle=T.priceText;ctx.textAlign="center";
 ctx.font="700 22px Arial";ctx.fillText(lang==="en"?"Price":"السعر",W/2,priceY+38);
 ctx.font="900 46px Arial";ctx.fillText(val("price",lang==="en"?"Contact us":"تواصل معنا"),W/2,priceY+86);

 ctx.fillStyle=T.footerBg;ctx.fillRect(0,H-footerH,W,footerH);
 ctx.fillStyle=T.footerText;
 ctx.font="800 28px Arial";ctx.textAlign=textAlignStart;
 ctx.fillText(truncate(ctx,(state.contact&&state.contact.brand)||(lang==="en"?"Business name":"اسم النشاط"),W*0.42),anchorX,H-footerH/2-6);
 ctx.font="900 46px Arial";ctx.textAlign=textAlignEnd;
 const phoneText=(state.contact&&state.contact.phone)||"00000000";
 ctx.fillText(RTL? phoneText+"  📞" : "📞  "+phoneText, farX, H-footerH/2+14);

 ctx.strokeStyle=T.accent;ctx.lineWidth=7;
 roundRectPath(ctx,4,4,W-8,H-8,18);ctx.stroke();

 return cv;
}

function drawDetails(ctx, entries, style, T, startY, availH, padX, W, RTL){
 if(!entries.length)return;
 if(RTL===undefined) RTL=true;
 const startEdge = RTL ? W-padX : padX;
 const alignStart = RTL ? "right" : "left";
 const alignEnd = RTL ? "left" : "right";
 /* expand multi-item values (containing bullet separators) into per-item icon chips for the "chips" style */
 let scale=1;
 for(let attempt=0;attempt<8;attempt++){
  const used=measureAndDraw(false);
  if(used<=availH || scale<=0.6) { measureAndDraw(true); break }
  scale-=0.08;
 }
 function measureAndDraw(commit){
  let yy=startY;
  if(style==="cards"){
   const gap=14, colW=(W-padX*2-gap)/2;
   const rowH=64*scale;
   entries.forEach((e,i)=>{
    const col=i%2, row=Math.floor(i/2);
    const bx = RTL ? (W-padX-colW-(col*(colW+gap))) : (padX+col*(colW+gap));
    const by=yy+row*(rowH+12*scale);
    if(commit){
     ctx.fillStyle=T.detailBg;roundRectPath(ctx,bx,by,colW,rowH,10);ctx.fill();
     ctx.textAlign=alignStart;ctx.fillStyle=T.detailText;
     const tx = RTL ? bx+colW-14 : bx+14;
     ctx.font=(9.5*scale*2)+"px Arial";ctx.globalAlpha=.8;
     ctx.fillText(truncate(ctx,e.icon+" "+e.label,colW-24),tx,by+24*scale);
     ctx.globalAlpha=1;
     ctx.font="800 "+(13*scale*2)+"px Arial";
     ctx.fillText(truncate(ctx,e.value,colW-24),tx,by+50*scale);
    }
   });
   const rows=Math.ceil(entries.length/2);
   return rows*(rowH+12*scale);
  }
  if(style==="list"){
   const lh=40*scale;
   entries.forEach((e,i)=>{
    const by=yy+i*lh;
    if(commit){
     ctx.font=(15*scale*2)+"px Arial";ctx.fillStyle=T.title;ctx.textAlign=alignStart;
     const line=e.icon+"  "+e.label+": "+e.value;
     ctx.fillText(truncate(ctx,line,W-padX*2),startEdge,by+16*scale);
    }
   });
   return entries.length*lh;
  }
  if(style==="chips"){
   /* explode multi-item fields into individual keyword-matched chips */
   const chipItems=[];
   entries.forEach(e=>{
    const items=splitItems(e.value);
    if(items.length>1){ items.forEach(it=>chipItems.push({icon:iconFor(it),text:it})) }
    else chipItems.push({icon:e.icon,text:e.value});
   });
   ctx.font="700 "+(13*scale*2)+"px Arial";
   const gap=10,chipH=44*scale;let cx=startEdge,cy=yy,totalH=chipH;
   const dir = RTL ? -1 : 1;
   chipItems.forEach(ci=>{
    const txt=ci.icon+" "+ci.text;
    const tw=ctx.measureText(txt).width;
    const cw=tw+30;
    const wouldExceed = RTL ? (cx-cw<padX) : (cx+cw>W-padX);
    if(wouldExceed){cx=startEdge;cy+=chipH+gap;totalH+=chipH+gap}
    const boxX = RTL ? cx-cw : cx;
    if(commit){
     ctx.fillStyle=T.detailBg;roundRectPath(ctx,boxX,cy,cw,chipH,chipH/2);ctx.fill();
     ctx.strokeStyle=T.accent;ctx.lineWidth=2;roundRectPath(ctx,boxX,cy,cw,chipH,chipH/2);ctx.stroke();
     ctx.fillStyle=T.detailText;ctx.textAlign="center";
     ctx.fillText(txt,boxX+cw/2,cy+chipH/2+8);
    }
    cx += dir*(cw+gap);
   });
   return totalH;
  }
  if(style==="table"){
   const rh=46*scale;
   entries.forEach((e,i)=>{
    const by=yy+i*rh;
    if(commit){
     ctx.strokeStyle=T.line2;ctx.lineWidth=1.5;
     ctx.beginPath();ctx.moveTo(padX,by+rh-6);ctx.lineTo(W-padX,by+rh-6);ctx.stroke();
     ctx.font=(12*scale*2)+"px Arial";ctx.fillStyle=T.sub;ctx.textAlign=alignStart;
     ctx.fillText(e.icon+" "+e.label,startEdge,by+rh/2+6);
     ctx.font="800 "+(12*scale*2)+"px Arial";ctx.fillStyle=T.title;ctx.textAlign=alignEnd;
     const valueEdge = RTL ? padX : W-padX;
     ctx.fillText(truncate(ctx,e.value,W*0.5),valueEdge,by+rh/2+6);
    }
   });
   return entries.length*rh;
  }
  return 0;
 }
}

window.PosterEngine={configs,ICONS,KEYWORD_ICONS,iconFor,splitItems,THEMES,THEME_COLORS,IMGLAYOUTS,DETAILSTYLES,SHAPES,shapeClipPoints,imageLayoutRects,fieldEntries,renderExportCanvas,EN_CATEGORY_LABELS,EN_FIELD_LABELS};
})();
