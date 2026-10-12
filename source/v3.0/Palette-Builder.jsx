// Palette Builder v3.0: the original React component, which ran only inside Claude.
// Kept for reference. The current tool is index.html (built from source/palette-builder.html).
import { useState, useRef, useEffect, useCallback } from "react";

// ─── COLOR MATH ──────────────────────────────────────────────────────────────
function hslToRgb(h,s,l){s/=100;l/=100;const k=n=>(n+h/30)%12,a=s*Math.min(l,1-l),f=n=>l-a*Math.max(-1,Math.min(k(n)-3,Math.min(9-k(n),1)));return[Math.round(f(0)*255),Math.round(f(8)*255),Math.round(f(4)*255)];}
const toHex=(r,g,b)=>'#'+[r,g,b].map(x=>x.toString(16).padStart(2,'0')).join('').toUpperCase();
const hslHex=(h,s,l)=>{const[r,g,b]=hslToRgb(h,s,l);return toHex(r,g,b);};
const hexRgb=h=>[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];

// ─── WHEEL GEOMETRY ───────────────────────────────────────────────────────────
const WS=298,CX=149,CY=149,RO=140;

const posFromHL=(h,l)=>{const r=(1-l/100)*RO,a=(h-90)*Math.PI/180;return{x:CX+r*Math.cos(a),y:CY+r*Math.sin(a)};};

const colFromXY=(x,y)=>{
  const dx=x-CX,dy=y-CY,dist=Math.min(RO,Math.max(0.01,Math.sqrt(dx*dx+dy*dy)));
  const r_n=dist/RO,h=Math.round(((Math.atan2(dy,dx)*180/Math.PI+90)%360+360)%360);
  const l=Math.round((1-r_n)*100),s=Math.round(Math.min(r_n/0.5,1)*100);
  const hex=hslHex(h,s,l);const[r,g,b]=hexRgb(hex);return{h,s,l,hex,r,g,b};
};

const mkCol=(h,l,name='')=>{
  const r_n=1-l/100,s=Math.round(Math.min(r_n/0.5,1)*100),hex=hslHex(h,s,l);
  const[r,g,b]=hexRgb(hex);return{h,s,l,hex,r,g,b,name};
};

function drawWheel(canvas){
  const ctx=canvas.getContext('2d'),id=ctx.createImageData(WS,WS);
  for(let y=0;y<WS;y++)for(let x=0;x<WS;x++){
    const idx=(y*WS+x)*4,dx=x-CX,dy=y-CY,d=Math.sqrt(dx*dx+dy*dy);
    if(d>RO){id.data[idx+3]=0;continue;}
    const r_n=d/RO,hue=((Math.atan2(dy,dx)*180/Math.PI+90)%360+360)%360;
    const[r,g,b]=hslToRgb(hue,Math.min(r_n/0.5,1)*100,(1-r_n)*100);
    id.data[idx]=r;id.data[idx+1]=g;id.data[idx+2]=b;id.data[idx+3]=255;
  }
  ctx.putImageData(id,0,0);
}

function gapPos(cols){
  if(!cols.length)return{h:0,l:50};
  const hues=[...cols.map(c=>c.h)].sort((a,b)=>a-b);
  let mg=0,gs=hues[0];
  for(let i=0;i<hues.length;i++){
    const n=hues[(i+1)%hues.length],g=i<hues.length-1?n-hues[i]:360-hues[hues.length-1]+hues[0];
    if(g>mg){mg=g;gs=hues[i];}
  }
  return{h:Math.round((gs+mg/2)%360),l:50};
}

// ─── COLOR WHEEL ─────────────────────────────────────────────────────────────
function ColorWheel({colours,onDragEnd,disabled}){
  const cvs=useRef(null),svgEl=useRef(null),didxRef=useRef(null),locRef=useRef(colours),cbRef=useRef(onDragEnd);
  const[loc,setLoc]=useState(colours);
  const[didx,setDidx]=useState(null);
  useEffect(()=>{cbRef.current=onDragEnd;},[onDragEnd]);
  useEffect(()=>{if(cvs.current)drawWheel(cvs.current);},[]);
  useEffect(()=>{if(didx===null){setLoc(colours);locRef.current=colours;}},[colours,didx]);

  const getXY=useCallback(e=>{const rect=svgEl.current?.getBoundingClientRect();if(!rect)return{x:CX,y:CY};return{x:(e.touches?.[0]?.clientX??e.clientX)-rect.left,y:(e.touches?.[0]?.clientY??e.clientY)-rect.top};},[]);
  const onMv=useCallback(e=>{
    if(didxRef.current===null)return;e.preventDefault();
    const{x,y}=getXY(e),c=colFromXY(x,y);
    setLoc(prev=>{const next=prev.map((col,i)=>i===didxRef.current?{...c,name:col.name}:col);locRef.current=next;return next;});
  },[getXY]);
  const onUp=useCallback(()=>{if(didxRef.current===null)return;const idx=didxRef.current;didxRef.current=null;setDidx(null);cbRef.current(locRef.current,idx);},[]);

  useEffect(()=>{
    window.addEventListener('mousemove',onMv);window.addEventListener('mouseup',onUp);
    window.addEventListener('touchmove',onMv,{passive:false});window.addEventListener('touchend',onUp);
    return()=>{window.removeEventListener('mousemove',onMv);window.removeEventListener('mouseup',onUp);window.removeEventListener('touchmove',onMv);window.removeEventListener('touchend',onUp);};
  },[onMv,onUp]);

  const startDrag=(e,i)=>{if(disabled)return;e.preventDefault();didxRef.current=i;setDidx(i);};
  const dp=loc;

  return(
    <div style={{position:'relative',width:WS,height:WS}}>
      <canvas ref={cvs} width={WS} height={WS} style={{position:'absolute',inset:0,borderRadius:'50%',boxShadow:'0 6px 30px rgba(0,0,0,0.12),0 2px 8px rgba(0,0,0,0.07)'}}/>
      <svg ref={svgEl} width={WS} height={WS} style={{position:'absolute',inset:0,touchAction:'none',userSelect:'none',cursor:didx!==null?'grabbing':'default'}}>
        {dp.flatMap((c,i)=>dp.slice(i+1).map((c2,j)=>{
          const p1=posFromHL(c.h,c.l),p2=posFromHL(c2.h,c2.l);
          return <line key={`ln-${i}-${j}`} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="rgba(0,0,0,0.2)" strokeWidth={1.2} strokeDasharray="3 5"/>;
        }))}
        {didx!==null&&dp[didx]&&<>
          <circle cx={CX} cy={CY} r={34} fill="rgba(255,255,255,0.93)" filter="url(#blur)"/>
          <text x={CX} y={CY+4} textAnchor="middle" fill="#1c1c2e" fontSize={9.5} fontFamily="monospace" fontWeight="700">{dp[didx].hex}</text>
          <text x={CX} y={CY+16} textAnchor="middle" fill="#777" fontSize={7.5} fontFamily="monospace">{`H${dp[didx].h}°  L${dp[didx].l}%`}</text>
        </>}
        {dp.map((c,i)=>{
          const{x,y}=posFromHL(c.h,c.l),active=didx===i,dr=i===0?14:11;
          const lum=0.299*c.r+0.587*c.g+0.114*c.b,stroke=lum>160?'rgba(0,0,0,0.3)':'rgba(255,255,255,0.8)';
          return(<g key={`dot-${i}`}>
            <circle cx={x} cy={y} r={dr+(active?8:5)} fill={c.hex} opacity={active?0.28:0.14}/>
            <circle cx={x} cy={y} r={dr+(active?2:0)} fill={c.hex} stroke={stroke} strokeWidth={i===0?2.5:1.8}
              style={{cursor:disabled?'default':'grab',filter:`drop-shadow(0 2px 6px ${c.hex}99)`}}
              onMouseDown={e=>startDrag(e,i)} onTouchStart={e=>startDrag(e,i)}/>
            {i===0&&<circle cx={x} cy={y} r={4.5} fill={lum>160?'#333':'#fff'} opacity={0.85} style={{pointerEvents:'none'}}/>}
          </g>);
        })}
      </svg>
    </div>
  );
}

// ─── SWATCH ──────────────────────────────────────────────────────────────────
function Swatch({colour,index}){
  const[cp,setCp]=useState(null);
  const copy=(v,t)=>{navigator.clipboard.writeText(v);setCp(t);setTimeout(()=>setCp(null),1400);};
  const lum=0.299*colour.r+0.587*colour.g+0.114*colour.b,tc=lum>145?'#1c1c2e':'#fff';
  return(
    <div style={{background:colour.hex,borderRadius:12,padding:'12px 11px 10px',flex:'1 1 88px',maxWidth:152,minWidth:82,display:'flex',flexDirection:'column',gap:4,boxShadow:`0 3px 14px ${colour.hex}44`,border:index===0?'2.5px solid rgba(255,255,255,0.75)':'2px solid rgba(255,255,255,0.3)',position:'relative'}}>
      {index===0&&<div style={{position:'absolute',top:6,right:8,fontSize:7.5,color:tc,opacity:0.5,fontFamily:'monospace',letterSpacing:1.5}}>BASE</div>}
      {colour.name&&<div style={{color:tc,fontSize:10,fontStyle:'italic',opacity:0.88,lineHeight:1.3,paddingRight:index===0?16:0}}>{colour.name}</div>}
      <div style={{color:tc,fontWeight:700,fontSize:12,fontFamily:'monospace'}}>{colour.hex}</div>
      <div style={{color:tc,fontSize:9.5,opacity:0.65,fontFamily:'monospace'}}>rgb({colour.r},{colour.g},{colour.b})</div>
      <div style={{display:'flex',gap:4,marginTop:2}}>
        {['hex','rgb'].map(t=>(
          <button key={t} onClick={()=>copy(t==='hex'?colour.hex:`rgb(${colour.r},${colour.g},${colour.b})`,t)}
            style={{fontSize:8,padding:'2px 5px',borderRadius:4,border:`1px solid ${tc}55`,background:`${tc}18`,color:tc,cursor:'pointer',fontFamily:'monospace',textTransform:'uppercase'}}>
            {cp===t?'✓':t}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── GATHERING PANEL ─────────────────────────────────────────────────────────
function GatheringPanel({gathered}){
  const fs=[{k:'medium',l:'Medium',e:'🖌️'},{k:'subject',l:'Subject',e:'🖼️'},{k:'mood',l:'Mood & Feeling',e:'✨'},{k:'audience',l:'Audience',e:'👁️'}];
  const done=Object.values(gathered).filter(Boolean).length;
  return(
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:22,width:'100%',maxWidth:284}}>
      <div style={{position:'relative',width:188,height:188,display:'flex',alignItems:'center',justifyContent:'center'}}>
        <div style={{position:'absolute',inset:0,borderRadius:'50%',background:`conic-gradient(from 0deg,hsl(0,65%,72%),hsl(60,65%,72%),hsl(120,65%,72%),hsl(180,65%,72%),hsl(240,65%,72%),hsl(300,65%,72%),hsl(360,65%,72%))`,opacity:0.18+done*0.1,filter:'blur(12px)',transition:'opacity 0.5s'}}/>
        <div style={{position:'relative',display:'flex',flexDirection:'column',alignItems:'center',gap:6}}>
          <div style={{fontSize:34,transition:'opacity 0.4s',opacity:0.4+done*0.12}}>🎨</div>
          <div style={{fontSize:10,letterSpacing:1.5,textTransform:'uppercase',color:'#999',textAlign:'center'}}>
            {done===0?'Describe your work':done<4?`${done} of 4 gathered`:'Ready…'}
          </div>
        </div>
      </div>
      <div style={{width:'100%',display:'flex',flexDirection:'column',gap:6}}>
        {fs.map(f=>(
          <div key={f.k} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',borderRadius:9,background:gathered[f.k]?'#ebebf3':'#f4f4f8',border:`1px solid ${gathered[f.k]?'#d0d0e4':'#e4e4ec'}`,transition:'all 0.35s'}}>
            <span style={{fontSize:14,opacity:gathered[f.k]?1:0.3,transition:'opacity 0.35s'}}>{f.e}</span>
            <span style={{fontSize:11,color:'#444',opacity:gathered[f.k]?0.85:0.3,minWidth:75,transition:'opacity 0.35s'}}>{f.l}</span>
            <span style={{marginLeft:'auto',fontSize:10,color:'#4f46e5',opacity:gathered[f.k]?1:0,fontStyle:'italic',maxWidth:110,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',transition:'opacity 0.3s'}}>{gathered[f.k]||''}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── SYSTEM PROMPT ────────────────────────────────────────────────────────────
const SYS=`You are an expert colour theorist and fine art consultant helping an artist develop their colour palette. Be warm, specific, enthusiastic — a collaborator having a real creative conversation.

COLOUR DISC MODEL:
The tool shows a full HSL disc. Every colour's position encodes two dimensions:
- h (hue, 0-359): the angle around the disc
- l (lightness, 0-100): the radial position
  * l=100 = white (centre of disc)
  * l=50  = pure saturated hue (mid-radius ring)
  * l=0   = black (outer edge)
  * l=25-45 = dark shades; l=55-75 = light tints
Saturation is auto-derived from l, so you only specify h and l.

IMPORTANT: Create value structure. Vary l values deliberately — a good palette has lights, mids, AND darks. Don't cluster all colours at l=50.

CONVERSATION:
- Ask ONE focused question at a time. Natural, enthusiastic.
- Gather: medium first → subject details → format/audience → mood/feeling
- Generate once you have medium + subject + mood
- Continue refining after

PALETTE SPEC:
- 2-6 colours as {h, l, name}
- Poetic, subject-rooted names
- Intentional value spread (mix of l values across the tint-shade range)
- Explain each colour's compositional/emotional role
- Include a harmony type label

ADJUSTMENT (message starts "ADJUSTMENT:"):
- 2-3 specific, enthusiastic sentences on the colour's new mood/impact
- How it shifts harmony or value structure
- Use phase: "commentary"

RESPOND ONLY IN JSON (no markdown):
{
  "message": "...",
  "phase": "gathering"|"palette"|"commentary",
  "colours": [{"h":210,"l":50,"name":"..."},...],
  "harmony": "descriptive type",
  "suggestions": ["..."],
  "gathered": {"medium":null,"subject":null,"mood":null,"audience":null}
}
colours only when phase=palette. gathered always present.`;

// ─── APP ─────────────────────────────────────────────────────────────────────
export default function App(){
  const[msgs,setMsgs]=useState([]);
  const[input,setInput]=useState('');
  const[loading,setLoading]=useState(false);
  const[adjLoading,setAdjLoading]=useState(false);
  const[colours,setColours]=useState([]);
  const[harmony,setHarmony]=useState('');
  const[phase,setPhase]=useState('gathering');
  const[gathered,setGathered]=useState({medium:null,subject:null,mood:null,audience:null});
  const chatRef=useRef(null),inputRef=useRef(null),histRef=useRef([]);

  useEffect(()=>{setMsgs([{role:'assistant',display:"Hello! Let's build you a beautiful colour palette. Tell me about the work you're planning — what are you creating?",suggestions:[]}]);},[]);
  useEffect(()=>{if(chatRef.current)chatRef.current.scrollTop=chatRef.current.scrollHeight;},[msgs,loading,adjLoading]);

  async function callAI(text){
    histRef.current=[...histRef.current,{role:'user',content:text}];
    const res=await fetch("https://api.anthropic.com/v1/messages",{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:1200,system:SYS,messages:histRef.current})});
    const data=await res.json();
    const raw=data.content?.find(b=>b.type==='text')?.text||'{}';
    const p=JSON.parse(raw.replace(/```json|```/g,'').trim());
    histRef.current=[...histRef.current,{role:'assistant',content:raw}];
    return p;
  }

  async function send(text){
    if(!text.trim()||loading||adjLoading)return;
    setInput('');
    setMsgs(prev=>[...prev,{role:'user',content:text}]);
    setLoading(true);
    try{
      const p=await callAI(text);
      if(p.gathered)setGathered(p.gathered);
      if(p.phase==='palette'&&p.colours?.length){setColours(p.colours.map(c=>mkCol(c.h,c.l,c.name)));setHarmony(p.harmony||'');setPhase('palette');}
      setMsgs(prev=>[...prev,{role:'assistant',display:p.message,suggestions:p.suggestions||[]}]);
    }catch(e){setMsgs(prev=>[...prev,{role:'assistant',display:'Something went wrong. Please try again.',suggestions:[]}]);}
    setLoading(false);inputRef.current?.focus();
  }

  async function addColour(){
    if(loading||adjLoading||colours.length>=8)return;
    const{h,l}=gapPos(colours);
    const nc=mkCol(h,l,'');
    const ncs=[...colours,nc];
    setColours(ncs);
    const allC=ncs.map((c,i)=>`${c.name||`C${i+1}`}: ${c.hex}`).join(', ');
    setMsgs(prev=>[...prev,{role:'action',content:`+ New colour added → ${nc.hex}`,hex:nc.hex}]);
    setAdjLoading(true);
    try{
      const p=await callAI(`I've added a new colour to the palette at ${nc.hex} (H${nc.h} L${nc.l}). Full palette: ${allC}. Please suggest what role this colour could play and guide me on where to drag it.`);
      if(p.gathered)setGathered(p.gathered);
      setMsgs(prev=>[...prev,{role:'assistant',display:p.message,suggestions:p.suggestions||[]}]);
    }catch(e){}
    setAdjLoading(false);
  }

  const handleDragEnd=useCallback(async(ncs,idx)=>{
    const old=colours[idx];
    if(!old||old.hex===ncs[idx]?.hex)return;
    setColours(ncs);
    const name=ncs[idx]?.name||`Colour ${idx+1}`;
    const allC=ncs.map((c,i)=>`${c.name||`C${i+1}`}: ${c.hex} (H${c.h} L${c.l})`).join(', ');
    setMsgs(prev=>[...prev,{role:'action',content:`↕ "${name}" → ${ncs[idx].hex}`,hex:ncs[idx].hex}]);
    setAdjLoading(true);
    try{
      const p=await callAI(`ADJUSTMENT: Moved "${name}" from ${old.hex} (H${old.h} L${old.l}) to ${ncs[idx].hex} (H${ncs[idx].h} L${ncs[idx].l}). Full palette: ${allC}`);
      if(p.gathered)setGathered(p.gathered);
      setMsgs(prev=>[...prev,{role:'assistant',display:p.message,suggestions:p.suggestions||[]}]);
    }catch(e){}
    setAdjLoading(false);
  },[colours]);

  // ── RENDER ────────────────────────────────────────────────────────────────
  return(
    <div style={{height:'100vh',background:'#f0eff6',color:'#1c1c2e',fontFamily:"'Segoe UI',system-ui,sans-serif",display:'flex',flexDirection:'column',overflow:'hidden'}}>

      {/* Header */}
      <div style={{padding:'12px 22px',display:'flex',alignItems:'center',gap:10,background:'#fff',borderBottom:'1px solid #e6e6ee',boxShadow:'0 1px 3px rgba(0,0,0,0.04)',flexShrink:0}}>
        <div style={{width:8,height:8,borderRadius:'50%',background:'conic-gradient(#ff6b6b,#ffd93d,#a855f7,#ff6b6b)'}}/>
        <span style={{fontSize:12,fontWeight:700,letterSpacing:2,textTransform:'uppercase',color:'#1c1c2e'}}>Palette Builder</span>
        {phase==='palette'&&harmony&&<><span style={{color:'#ddd',margin:'0 2px'}}>·</span><span style={{fontSize:10,letterSpacing:1,textTransform:'uppercase',color:'#bbb'}}>{harmony}</span></>}
        <div style={{marginLeft:'auto',display:'flex',gap:5,flexWrap:'wrap'}}>
          {Object.entries(gathered).filter(([,v])=>v).map(([k,v])=>(
            <div key={k} style={{fontSize:8.5,padding:'2px 8px',borderRadius:20,background:'#f0f0f8',border:'1px solid #dfdfe8',color:'#666',maxWidth:130,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
              <span style={{opacity:0.6}}>{k}: </span>{v}
            </div>
          ))}
        </div>
      </div>

      <div style={{flex:1,display:'flex',minHeight:0}}>

        {/* Chat panel */}
        <div style={{width:390,flexShrink:0,display:'flex',flexDirection:'column',background:'#fafafa',borderRight:'1px solid #e6e6ee'}}>
          <div ref={chatRef} style={{flex:1,overflowY:'auto',padding:'14px 14px 8px',display:'flex',flexDirection:'column',gap:10}}>
            {msgs.map((m,i)=>{
              if(m.role==='action')return(
                <div key={i} style={{display:'flex',justifyContent:'center'}}>
                  <div style={{display:'flex',alignItems:'center',gap:6,padding:'3px 11px',borderRadius:20,background:'#ebebf5',border:'1px solid #d8d8e6',fontSize:10.5,color:'#777'}}>
                    <div style={{width:7,height:7,borderRadius:'50%',background:m.hex}}/>{m.content}
                  </div>
                </div>
              );
              if(m.role==='user')return(
                <div key={i} style={{display:'flex',justifyContent:'flex-end'}}>
                  <div style={{maxWidth:'82%',padding:'9px 13px',borderRadius:'14px 14px 3px 14px',background:'linear-gradient(135deg,#4f46e5,#8b21d8)',color:'#fff',fontSize:13,lineHeight:1.65}}>{m.content}</div>
                </div>
              );
              return(
                <div key={i} style={{display:'flex',flexDirection:'column',gap:6,alignItems:'flex-start'}}>
                  <div style={{maxWidth:'90%',padding:'10px 13px',borderRadius:'14px 14px 14px 3px',background:'#fff',border:'1px solid #e6e6ee',fontSize:13,lineHeight:1.68,color:'#1c1c2e',boxShadow:'0 1px 3px rgba(0,0,0,0.03)'}}>{m.display}</div>
                  {m.suggestions?.length>0&&i===msgs.length-1&&!loading&&!adjLoading&&(
                    <div style={{display:'flex',flexWrap:'wrap',gap:5,paddingLeft:2}}>
                      {m.suggestions.map((s,j)=>(
                        <button key={j} onClick={()=>send(s)}
                          style={{padding:'4px 11px',borderRadius:20,background:'#fff',border:'1px solid #d8d8e6',color:'#4f46e5',fontSize:11,cursor:'pointer',fontFamily:'inherit',transition:'background .15s'}}
                          onMouseEnter={e=>e.target.style.background='#f0f0f8'}
                          onMouseLeave={e=>e.target.style.background='#fff'}>
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {(loading||adjLoading)&&(
              <div style={{display:'flex',gap:5,padding:'10px 13px',borderRadius:'14px 14px 14px 3px',background:'#fff',border:'1px solid #e6e6ee',width:'fit-content',boxShadow:'0 1px 3px rgba(0,0,0,0.03)'}}>
                {[0,1,2].map(i=><div key={i} style={{width:5,height:5,borderRadius:'50%',background:'#4f46e5',animation:`dot 1s ${i*.15}s ease-in-out infinite`}}/>)}
              </div>
            )}
          </div>
          <div style={{padding:'10px 14px',borderTop:'1px solid #e6e6ee',background:'#fff'}}>
            <div style={{display:'flex',gap:7}}>
              <textarea ref={inputRef} value={input} onChange={e=>setInput(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send(input);}}}
                placeholder="Describe, respond, or refine…"
                style={{flex:1,padding:'9px 12px',borderRadius:9,background:'#f5f5f8',border:'1px solid #e0e0ea',color:'#1c1c2e',fontSize:13,resize:'none',height:54,outline:'none',lineHeight:1.5,fontFamily:'inherit'}}/>
              <button onClick={()=>send(input)} disabled={loading||adjLoading||!input.trim()}
                style={{padding:'0 15px',borderRadius:9,border:'none',background:input.trim()?'linear-gradient(135deg,#4f46e5,#8b21d8)':'#e8e8ee',color:input.trim()?'#fff':'#bbb',cursor:input.trim()?'pointer':'not-allowed',fontSize:15,transition:'all .2s'}}>→</button>
            </div>
          </div>
        </div>

        {/* Visual panel */}
        <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'18px 24px',gap:12,overflowY:'auto'}}>
          {phase==='gathering'?(
            <GatheringPanel gathered={gathered}/>
          ):(
            <>
              <ColorWheel colours={colours} onDragEnd={handleDragEnd} disabled={loading||adjLoading}/>

              {/* Wheel legend */}
              <div style={{display:'flex',alignItems:'center',gap:14,marginTop:2}}>
                <div style={{display:'flex',alignItems:'center',gap:5,fontSize:9,color:'#aaa',letterSpacing:0.5}}>
                  <span style={{display:'inline-block',width:28,height:6,borderRadius:3,background:'linear-gradient(to right,#fff,#888,#000)'}}/>
                  <span>tints → pure → shades</span>
                </div>
                <span style={{color:'#ddd'}}>·</span>
                <span style={{fontSize:9,letterSpacing:1.5,textTransform:'uppercase',color:'#aaa'}}>{harmony||'palette'}</span>
                <span style={{color:'#ddd'}}>·</span>
                <button onClick={addColour} disabled={loading||adjLoading||colours.length>=8} title="Add colour"
                  style={{width:22,height:22,borderRadius:'50%',border:'1.5px dashed #bbb',background:'transparent',color:'#999',cursor:colours.length<8&&!loading&&!adjLoading?'pointer':'not-allowed',fontSize:14,display:'flex',alignItems:'center',justifyContent:'center',padding:0,lineHeight:1,transition:'all .15s'}}
                  onMouseEnter={e=>{if(colours.length<8){e.currentTarget.style.borderColor='#4f46e5';e.currentTarget.style.color='#4f46e5';e.currentTarget.style.background='rgba(79,70,229,0.07)';}}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor='#bbb';e.currentTarget.style.color='#999';e.currentTarget.style.background='transparent';}}>
                  +
                </button>
                {adjLoading&&<span style={{fontSize:9,color:'#4f46e5',opacity:0.7,letterSpacing:0.5}}>Analysing…</span>}
              </div>

              {/* Swatches */}
              <div style={{display:'flex',flexWrap:'wrap',gap:7,justifyContent:'center',maxWidth:570,marginTop:4}}>
                {colours.map((c,i)=><Swatch key={`${i}-${c.hex}`} colour={c} index={i}/>)}
              </div>
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes dot{0%,100%{transform:translateY(0);opacity:.4}50%{transform:translateY(-3px);opacity:1}}
        textarea:focus{border-color:#4f46e5!important;background:#fff!important}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#ccccd8;border-radius:4px}
      `}</style>
    </div>
  );
}
