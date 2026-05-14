"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import ProjetAITab from "./ProjetAITab";

const API         = "http://10.23.23.144:8000";
const SUPER_ADMIN = "84488R";

const STATUT_CFG: Record<string,{label:string;color:string;bg:string;icon:string;grad:string}> = {
  en_cours:{label:"En cours", color:"#3b82f6",bg:"rgba(59,130,246,0.1)", icon:"▶",grad:"#2563eb,#3b82f6"},
  suspendu:{label:"Suspendu", color:"#f59e0b",bg:"rgba(245,158,11,0.1)", icon:"⏸",grad:"#d97706,#f59e0b"},
  termine: {label:"Terminé",  color:"#10b981",bg:"rgba(16,185,129,0.1)",icon:"✓", grad:"#059669,#10b981"},
  annule:  {label:"Annulé",   color:"#ef4444",bg:"rgba(239,68,68,0.1)", icon:"✕", grad:"#dc2626,#ef4444"},
};
const TYPE_CFG: Record<string,{label:string;icon:string;color:string}> = {
  ligne_electrique:{label:"Ligne Électrique",icon:"⚡",color:"#f59e0b"},
  poste:           {label:"Poste",           icon:"🏭",color:"#8b5cf6"},
  maintenance:     {label:"Maintenance",     icon:"🔧",color:"#10b981"},
  administratif:   {label:"Administratif",   icon:"📋",color:"#6b7280"},
  marche:          {label:"Marché",          icon:"📑",color:"#2563eb"},
  autre:           {label:"Autre",           icon:"📁",color:"#6b7280"},
};
const DOC_CFG: Record<string,{label:string;icon:string;color:string}> = {
  courrier:       {label:"Courrier",  icon:"📬",color:"#3b82f6"},
  devis:          {label:"Devis",     icon:"💰",color:"#10b981"},
  bordereau:      {label:"Bordereau",icon:"📋",color:"#f59e0b"},
  courrier_depart:{label:"C. Départ", icon:"📤",color:"#8b5cf6"},
  autre:          {label:"Document",  icon:"📄",color:"#6b7280"},
};
const ETAPE_COLORS: Record<string,string> = {
  demande_initiale:"#6b7280",reunion:"#8b5cf6",etude_technique:"#3b82f6",
  carnet_piquetage:"#f59e0b",approvisionnement:"#f97316",bon_execution:"#10b981",
  travaux_en_cours:"#ef4444",devis_realisation:"#06b6d4",bon_livraison:"#84cc16",
  reception_travaux:"#10b981",cloture:"#22c55e",renouvellement:"#a78bfa",autre:"#6b7280",
};

export default function ProjetsPage() {
  const router = useRouter();
  const [user,setUser]=useState<any>(null);
  const [token,setToken]=useState("");
  const [mainTab,setMainTab]=useState<"projets"|"ia">("projets");
  const [projets,setProjets]=useState<any[]>([]);
  const [stats,setStats]=useState<any>(null);
  const [loading,setLoading]=useState(true);
  const [search,setSearch]=useState("");
  const [filterStatut,setFilterStatut]=useState("");
  const [filterType,setFilterType]=useState("");
  const [selected,setSelected]=useState<any>(null);
  const [detailTab,setDetailTab]=useState<"timeline"|"docs"|"ia"|"notes">("timeline");
  const [aiAnalysis,setAiAnalysis]=useState<any>(null);
  const [aiLoading,setAiLoading]=useState(false);
  // Doc browser
  const [dbTable,setDbTable]=useState("courrier");
  const [dbItems,setDbItems]=useState<any[]>([]);
  const [dbSearch,setDbSearch]=useState("");
  const [dbLoading,setDbLoading]=useState(false);
  const [linkingId,setLinkingId]=useState<number|null>(null);
  // Forms
  const [showAdd,setShowAdd]=useState(false);
  const [showScan,setShowScan]=useState(false);
  const [scanResult,setScanResult]=useState<any>(null);
  const [scanning,setScanning]=useState(false);
  const [noteText,setNoteText]=useState("");
  const [noteLoading,setNoteLoading]=useState(false);
  const [fNom,setFNom]=useState("");
  const [fType,setFType]=useState("ligne_electrique");
  const [fDesc,setFDesc]=useState("");
  const [fLoc,setFLoc]=useState("");
  const [fPrio,setFPrio]=useState("normale");
  const [fDebut,setFDebut]=useState("");
  const [fFin,setFFin]=useState("");
  const [fMsg,setFMsg]=useState("");
  const [fLoading,setFLoading]=useState(false);
  const [opMsg,setOpMsg]=useState<{text:string;ok:boolean}|null>(null);

  useEffect(()=>{
    const s=localStorage.getItem("user"),t=localStorage.getItem("token");
    if(!s||!t){router.push("/");return;}
    setUser(JSON.parse(s));setToken(t);
  },[router]);

  const fetchData=useCallback(async()=>{
    if(!token)return;setLoading(true);
    try{
      const p=new URLSearchParams({page:"1",limit:"100",
        ...(search?{search}:{}),
        ...(filterStatut?{statut:filterStatut}:{}),
        ...(filterType?{type_projet:filterType}:{})});
      const[pr,sr]=await Promise.all([
        fetch(`${API}/projets/?${p}`,{headers:{Authorization:`Bearer ${token}`}}),
        fetch(`${API}/projets/stats`,{headers:{Authorization:`Bearer ${token}`}}),
      ]);
      if(pr.ok){const d=await pr.json();setProjets(d.items);}
      if(sr.ok)setStats(await sr.json());
    }catch{}finally{setLoading(false);}
  },[token,search,filterStatut,filterType]);

  useEffect(()=>{fetchData();},[fetchData]);

  async function refreshSelected(id:number){
    try{const r=await fetch(`${API}/projets/${id}`,{headers:{Authorization:`Bearer ${token}`}});
    if(r.ok){const d=await r.json();setSelected(d);}}catch{}
  }

  // Doc browser fetch
  const fetchDb=useCallback(async()=>{
    if(!token)return;setDbLoading(true);
    try{
      const ep:Record<string,string>={
        courrier:"/courrier/arrivee",bordereau:"/courrier/bordereau",
        courrier_depart:"/courrier/depart",devis:"/devis/",
      };
      const p=new URLSearchParams({page:"1",limit:"25",...(dbSearch?{search:dbSearch}:{})});
      const r=await fetch(`${API}${ep[dbTable]||"/courrier/arrivee"}?${p}`,{headers:{Authorization:`Bearer ${token}`}});
      if(r.ok){const d=await r.json();setDbItems(d.items||[]);}
    }catch{}finally{setDbLoading(false);}
  },[token,dbTable,dbSearch]);

  useEffect(()=>{if(detailTab==="docs")fetchDb();},[detailTab,dbTable,dbSearch,fetchDb]);

  async function handleLinkDoc(doc:any){
    if(!selected||linkingId)return;
    setLinkingId(doc.id);
    try{
      const titleMap:Record<string,string>={
        courrier:doc.objet||doc.expediteur||"",
        bordereau:doc.objet||doc.reference||"",
        courrier_depart:doc.objet||doc.reference||"",
        devis:doc.objet||doc.reference||"",
      };
      const refMap:Record<string,string>={
        courrier:doc.expediteur||"",bordereau:doc.reference||"",
        courrier_depart:doc.reference||"",devis:doc.reference||"",
      };
      const dateMap:Record<string,string>={
        courrier:doc.date_courrier||"",bordereau:doc.created_at||"",
        courrier_depart:doc.date_depart||"",devis:doc.date_devis||"",
      };
      const r=await fetch(`${API}/projets/${selected.id}/lier-document-auto`,{
        method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},
        body:JSON.stringify({doc_type:dbTable,doc_id:doc.id,
          doc_ref:refMap[dbTable]||"",doc_titre:titleMap[dbTable]||"",doc_date:dateMap[dbTable]||""}),
      });
      const d=await r.json();
      setOpMsg({text:r.ok?`✅ Lié — ${d.etape_label||""}`:(`❌ ${d.detail}`),ok:r.ok});
      if(r.ok){refreshSelected(selected.id);fetchData();}
    }catch{setOpMsg({text:"Erreur",ok:false});}
    finally{setLinkingId(null);}
  }

  async function handleAiAnalysis(){
    if(!selected)return;setAiLoading(true);setAiAnalysis(null);
    try{const r=await fetch(`${API}/projets/${selected.id}/analyse-ia`,{headers:{Authorization:`Bearer ${token}`}});
    if(r.ok)setAiAnalysis(await r.json());}catch{}finally{setAiLoading(false);}
  }

  async function handleCreate(e:React.FormEvent){
    e.preventDefault();setFLoading(true);setFMsg("");
    try{
      const r=await fetch(`${API}/projets/`,{method:"POST",
        headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},
        body:JSON.stringify({nom:fNom,type_projet:fType,description:fDesc,
          localisation:fLoc,priorite:fPrio,date_debut:fDebut,date_fin_prev:fFin})});
      const d=await r.json();
      if(r.ok){setFMsg(d.message);setTimeout(()=>{setShowAdd(false);fetchData();},1200);}
      else setFMsg(`❌ ${d.detail}`);
    }catch{setFMsg("❌ Erreur");}finally{setFLoading(false);}
  }

  async function handleDeleteDoc(docId:number){
    if(!confirm("Supprimer ce lien ?"))return;
    await fetch(`${API}/projets/${selected.id}/documents/${docId}`,
      {method:"DELETE",headers:{Authorization:`Bearer ${token}`}});
    refreshSelected(selected.id);fetchData();
  }

  async function handleAddNote(e:React.FormEvent){
    e.preventDefault();if(!noteText.trim())return;setNoteLoading(true);
    try{await fetch(`${API}/projets/${selected.id}/notes`,{method:"POST",
      headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},
      body:JSON.stringify({contenu:noteText})});
    setNoteText("");refreshSelected(selected.id);}catch{}finally{setNoteLoading(false);}
  }

  async function handleScan(){
    setScanning(true);setScanResult(null);
    try{const r=await fetch(`${API}/projets/scan-and-link`,
      {method:"POST",headers:{Authorization:`Bearer ${token}`}});
    if(r.ok){setScanResult(await r.json());fetchData();}}catch{}finally{setScanning(false);}
  }

  async function handleDeleteProjet(id:number){
    if(!confirm("Supprimer ce projet ?"))return;
    await fetch(`${API}/projets/${id}`,{method:"DELETE",headers:{Authorization:`Bearer ${token}`}});
    setSelected(null);fetchData();
  }

  async function handleStatut(id:number,statut:string){
    await fetch(`${API}/projets/${id}`,{method:"PUT",
      headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},
      body:JSON.stringify({statut})});
    refreshSelected(id);fetchData();
  }

  async function handleBuildTimeline(id:number){
    setOpMsg(null);
    try{const r=await fetch(`${API}/projets-ai/projets/${id}/construire-timeline`,
      {method:"POST",headers:{Authorization:`Bearer ${token}`}});
    const d=await r.json();setOpMsg({text:d.message||d.detail,ok:r.ok});
    if(r.ok)refreshSelected(id);}catch{setOpMsg({text:"Erreur",ok:false});}
  }

  if(!user)return null;
  const isAdmin=user.role==="admin";
  const isSuperAdmin=user.matricule===SUPER_ADMIN;

  return(
    <div style={{minHeight:"100vh",background:"var(--bg)"}}>

      {/* TOP BAR */}
      <div style={{padding:"18px 28px 0",background:"var(--surface)",
        borderBottom:"1px solid var(--border)",position:"sticky",top:0,zIndex:40}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
          <div>
            <h1 style={{fontFamily:"var(--font-head)",fontSize:22,fontWeight:800,marginBottom:2}}>
              🏗️ Suivi des Projets
            </h1>
            <p style={{color:"var(--muted)",fontSize:12}}>
              {stats?`${stats.total} projets · `:""}Timeline · Documents · Analyse IA
            </p>
          </div>
          {isAdmin&&mainTab==="projets"&&(
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setShowScan(true)} style={BGH}>🔄 Scan IA</button>
              <button onClick={()=>{setFMsg("");setShowAdd(true);}} style={BPR}>➕ Nouveau projet</button>
            </div>
          )}
        </div>
        {isAdmin&&(
          <div style={{display:"flex",gap:0}}>
            {[{key:"projets",label:"🏗️ Projets",color:"#3b82f6"},
              {key:"ia",label:"🤖 Analyse IA",color:"#8b5cf6",badge:isSuperAdmin?"SUPER ADMIN":undefined}
            ].map(t=>(
              <button key={t.key} onClick={()=>{setMainTab(t.key as any);if(t.key==="projets")setSelected(null);}}
                style={{padding:"10px 20px",fontSize:13,fontWeight:600,cursor:"pointer",
                  background:"none",border:"none",fontFamily:"var(--font-body)",transition:"all .15s",
                  borderBottom:`2px solid ${mainTab===t.key?t.color:"transparent"}`,
                  color:mainTab===t.key?t.color:"var(--muted)",marginBottom:"-1px",
                  display:"flex",alignItems:"center",gap:6}}>
                {t.label}
                {t.badge&&<span style={{background:`${t.color}22`,color:t.color,
                  fontSize:9,fontWeight:700,padding:"1px 6px",borderRadius:99}}>{t.badge}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* OP MSG */}
      {opMsg&&(
        <div style={{margin:"10px 28px 0",padding:"9px 14px",borderRadius:9,fontSize:13,
          background:opMsg.ok?"var(--green-bg)":"rgba(239,68,68,0.1)",
          border:`1px solid ${opMsg.ok?"rgba(16,185,129,0.3)":"rgba(239,68,68,0.3)"}`,
          color:opMsg.ok?"var(--green)":"var(--danger)",
          display:"flex",justifyContent:"space-between"}}>
          {opMsg.text}
          <button onClick={()=>setOpMsg(null)} style={{background:"none",border:"none",cursor:"pointer",color:"inherit"}}>✕</button>
        </div>
      )}

      {/* IA TAB */}
      {mainTab==="ia"&&isAdmin&&(
        <div style={{padding:"20px 28px"}}>
          <ProjetAITab token={token} userMatricule={user.matricule}
            onProjectCreated={()=>{fetchData();setMainTab("projets");}}/>
        </div>
      )}

      {/* PROJETS TAB */}
      {mainTab==="projets"&&(
        <div style={{padding:"16px 28px"}}>

          {/* STATS */}
          {stats&&(
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10,marginBottom:16}}>
              <div onClick={()=>setFilterStatut("")} style={{...SC,"--c":"#3b82f6",
                borderTop:"2px solid #3b82f6",boxShadow:!filterStatut?"0 0 0 3px rgba(59,130,246,0.15)":"none"} as any}>
                <div style={{fontSize:13}}>🏗️</div>
                <div style={{fontSize:22,fontWeight:800,color:"#3b82f6",fontFamily:"var(--font-head)"}}>{stats.total}</div>
                <div style={{fontSize:10,color:"var(--muted)"}}>Total</div>
              </div>
              {stats.by_statut.map((s:any)=>(
                <div key={s.statut} onClick={()=>setFilterStatut(filterStatut===s.statut?"":s.statut)}
                  style={{...SC,borderTop:`2px solid ${s.color}`,
                    boxShadow:filterStatut===s.statut?`0 0 0 3px ${s.color}20`:"none",
                    border:`1px solid ${filterStatut===s.statut?s.color+"44":"var(--border)"}`} as any}>
                  <div style={{fontSize:13}}>{STATUT_CFG[s.statut]?.icon||"●"}</div>
                  <div style={{fontSize:22,fontWeight:800,color:s.color,fontFamily:"var(--font-head)"}}>{s.count}</div>
                  <div style={{fontSize:10,color:"var(--muted)"}}>{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* SEARCH */}
          <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
            <div style={{position:"relative",flex:1,minWidth:180}}>
              <span style={{position:"absolute",left:11,top:"50%",transform:"translateY(-50%)",
                color:"var(--muted)",fontSize:13}}>🔍</span>
              <input value={search} onChange={e=>setSearch(e.target.value)}
                placeholder="Rechercher projet, marché, localisation..."
                style={{width:"100%",background:"var(--surface)",border:"1px solid var(--border2)",
                  borderRadius:9,padding:"8px 12px 8px 34px",color:"var(--text)",fontSize:13,
                  outline:"none",fontFamily:"var(--font-body)"}}/>
            </div>
            <select value={filterType} onChange={e=>setFilterType(e.target.value)} style={SEL}>
              <option value="">Tous les types</option>
              {Object.entries(TYPE_CFG).map(([k,v])=><option key={k} value={k}>{v.icon} {v.label}</option>)}
            </select>
            {(filterStatut||filterType||search)&&(
              <button onClick={()=>{setFilterStatut("");setFilterType("");setSearch("");}} style={BGH}>
                ✕ Reset
              </button>
            )}
          </div>

          {/* GRID */}
          <div style={{display:"grid",gridTemplateColumns:selected?"minmax(0,1fr) 430px":"1fr",
            gap:16,alignItems:"start"}}>

            {/* PROJET LIST */}
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {loading?(
                Array.from({length:5}).map((_,i)=>(
                  <div key={i} style={{background:"var(--surface)",borderRadius:14,padding:18,
                    border:"1px solid var(--border)"}}>
                    <div className="skeleton" style={{height:15,width:"55%",marginBottom:10,borderRadius:6}}/>
                    <div className="skeleton" style={{height:11,width:"35%",borderRadius:6}}/>
                  </div>
                ))
              ):projets.length===0?(
                <div style={{textAlign:"center",padding:"60px 0",color:"var(--muted)"}}>
                  <div style={{fontSize:40,marginBottom:12,opacity:.15}}>🏗️</div>
                  <div style={{fontSize:14,fontWeight:600,marginBottom:10}}>Aucun projet</div>
                  {isAdmin&&<button onClick={()=>setMainTab("ia")} style={{
                    background:"rgba(139,92,246,0.1)",border:"1px solid rgba(139,92,246,0.25)",
                    borderRadius:9,padding:"8px 18px",color:"#a78bfa",fontSize:13,
                    fontWeight:600,cursor:"pointer"}}>🤖 Lancer l'analyse IA</button>}
                </div>
              ):projets.map(p=>{
                const st=STATUT_CFG[p.statut]||STATUT_CFG.en_cours;
                const ty=TYPE_CFG[p.type_projet]||TYPE_CFG.autre;
                const isSel=selected?.id===p.id;
                // Extract marche from description or nom
                const marcheMatch=(p.description||p.nom||"").match(/(TC\d{4,6}\s*P?\d?|SR\d{4,6}\s*P?\d?)/i);
                return(
                  <div key={p.id} onClick={()=>{setSelected(p);setDetailTab("timeline");setAiAnalysis(null);}}
                    style={{background:"var(--surface)",
                      border:`1px solid ${isSel?st.color+"55":"var(--border)"}`,
                      borderLeft:`4px solid ${st.color}`,borderRadius:14,
                      padding:"14px 18px",cursor:"pointer",transition:"all .18s",
                      boxShadow:isSel?`0 0 0 3px ${st.color}15,var(--shadow-md)`:"none"}}
                    onMouseEnter={e=>{if(!isSel)(e.currentTarget as HTMLElement).style.transform="translateX(2px)";}}
                    onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.transform="translateX(0)";}}>

                    <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:10}}>
                      <div style={{flex:1,minWidth:0}}>
                        {marcheMatch&&(
                          <span style={{display:"inline-block",marginBottom:5,background:"rgba(59,130,246,0.12)",
                            color:"#60a5fa",fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:99,
                            border:"1px solid rgba(59,130,246,0.2)"}}>
                            🏷️ {marcheMatch[0].replace(/\s+/,"")}
                          </span>
                        )}
                        <div style={{fontFamily:"var(--font-head)",fontSize:14,fontWeight:700,
                          lineHeight:1.35,marginBottom:5,color:"var(--text)"}}>
                          {p.nom}
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                          {p.localisation&&(
                            <span style={{fontSize:11,color:"var(--muted)"}}>📍 {p.localisation}</span>
                          )}
                          <span style={{fontSize:10,color:ty.color,background:`${ty.color}12`,
                            padding:"1px 7px",borderRadius:99,fontWeight:600}}>
                            {ty.icon} {ty.label}
                          </span>
                        </div>
                      </div>
                      <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:5,flexShrink:0}}>
                        <span style={{background:st.bg,color:st.color,border:`1px solid ${st.color}33`,
                          padding:"3px 10px",borderRadius:99,fontSize:11,fontWeight:700}}>
                          {st.icon} {st.label}
                        </span>
                        <span style={{fontSize:10,color:"var(--muted)"}}>
                          📄 {p.nb_documents||0} doc{(p.nb_documents||0)!==1?"s":""}
                        </span>
                      </div>
                    </div>

                    {/* Progress + étapes pills */}
                    <div style={{marginTop:11}}>
                      <div style={{display:"flex",justifyContent:"space-between",
                        fontSize:10,color:"var(--muted)",marginBottom:4}}>
                        <span style={{display:"flex",gap:5}}>
                          {p.documents?.slice(0,3).map((d:any,i:number)=>{
                            const dc=DOC_CFG[d.doc_type]||DOC_CFG.autre;
                            return(
                              <span key={i} style={{background:`${dc.color}15`,color:dc.color,
                                padding:"1px 6px",borderRadius:99,fontSize:9,fontWeight:600}}>
                                {dc.icon} {d.etape_label?.split(" ").slice(1,3).join(" ")||"—"}
                              </span>
                            );
                          })}
                          {(p.documents?.length||0)>3&&(
                            <span style={{fontSize:9,color:"var(--muted)"}}>+{p.documents.length-3}</span>
                          )}
                        </span>
                        <span style={{fontWeight:700,color:st.color}}>{p.progression}%</span>
                      </div>
                      <div style={{height:4,background:"var(--surface2)",borderRadius:99,overflow:"hidden"}}>
                        <div style={{height:"100%",borderRadius:99,
                          background:`linear-gradient(90deg,${st.grad})`,
                          width:`${p.progression}%`,transition:"width 1s cubic-bezier(.4,0,.2,1)"}}/>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* DETAIL PANEL */}
            {selected&&(
              <div style={{background:"var(--surface)",border:"1px solid var(--border)",
                borderRadius:16,overflow:"hidden",position:"sticky",top:128,
                maxHeight:"calc(100vh - 148px)",display:"flex",flexDirection:"column",
                boxShadow:"var(--shadow-lg)"}}>

                {/* Header */}
                <div style={{background:`linear-gradient(135deg,${STATUT_CFG[selected.statut]?.color}15,transparent)`,
                  borderBottom:"1px solid var(--border)",padding:"14px 16px",flexShrink:0}}>
                  <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:8}}>
                    <div style={{flex:1,minWidth:0,paddingRight:8}}>
                      <div style={{fontFamily:"var(--font-head)",fontSize:14,fontWeight:800,
                        lineHeight:1.3,marginBottom:4}}>{selected.nom}</div>
                      <div style={{fontSize:11,color:"var(--muted)",display:"flex",gap:8,flexWrap:"wrap"}}>
                        {selected.localisation&&<span>📍 {selected.localisation}</span>}
                        <span>{(TYPE_CFG[selected.type_projet]||TYPE_CFG.autre).icon} {selected.type_label}</span>
                      </div>
                    </div>
                    <button onClick={()=>{setSelected(null);setAiAnalysis(null);}}
                      style={{background:"none",border:"none",color:"var(--muted)",cursor:"pointer",fontSize:18}}>✕</button>
                  </div>
                  {isAdmin&&(
                    <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:10}}>
                      {Object.entries(STATUT_CFG).map(([k,v])=>(
                        <button key={k} onClick={()=>handleStatut(selected.id,k)} style={{
                          padding:"3px 9px",fontSize:10,fontWeight:700,cursor:"pointer",borderRadius:99,
                          border:`1px solid ${selected.statut===k?v.color+"55":"var(--border2)"}`,
                          background:selected.statut===k?`${v.color}22`:"var(--surface2)",
                          color:selected.statut===k?v.color:"var(--muted)"}}>
                          {v.icon} {v.label}
                        </button>
                      ))}
                    </div>
                  )}
                  <div style={{fontSize:11,marginBottom:4,display:"flex",
                    justifyContent:"space-between",color:"var(--muted)"}}>
                    <span>Avancement</span>
                    <span style={{fontWeight:800,color:STATUT_CFG[selected.statut]?.color}}>
                      {selected.progression}%
                    </span>
                  </div>
                  <div style={{height:6,background:"var(--surface2)",borderRadius:99,overflow:"hidden"}}>
                    <div style={{height:"100%",borderRadius:99,
                      background:`linear-gradient(90deg,${STATUT_CFG[selected.statut]?.grad||"#3b82f6,#60a5fa"})`,
                      width:`${selected.progression}%`,transition:"width 1s ease"}}/>
                  </div>
                </div>

                {/* Detail tabs */}
                <div style={{display:"flex",borderBottom:"1px solid var(--border)",flexShrink:0}}>
                  {[
                    {key:"timeline",label:"📅 Timeline",cnt:selected.documents?.length||0},
                    {key:"docs",    label:"📎 Lier docs"},
                    {key:"ia",      label:"🤖 IA"},
                    {key:"notes",   label:"📝 Notes",cnt:selected.notes?.length||0},
                  ].map(t=>(
                    <button key={t.key} onClick={()=>setDetailTab(t.key as any)}
                      style={{flex:1,padding:"9px 4px",fontSize:11,fontWeight:600,
                        background:"none",border:"none",cursor:"pointer",fontFamily:"var(--font-body)",
                        borderBottom:`2px solid ${detailTab===t.key?"#3b82f6":"transparent"}`,
                        color:detailTab===t.key?"#60a5fa":"var(--muted)",transition:"all .12s"}}>
                      {t.label}
                      {(t.cnt||0)>0&&(
                        <span style={{marginLeft:4,background:"rgba(59,130,246,0.18)",color:"#60a5fa",
                          fontSize:9,padding:"0 5px",borderRadius:99}}>{t.cnt}</span>
                      )}
                    </button>
                  ))}
                </div>

                {/* Detail content */}
                <div style={{overflowY:"auto",flex:1}}>

                  {/* TIMELINE */}
                  {detailTab==="timeline"&&(
                    <div style={{padding:"14px 16px"}}>
                      <div style={{display:"flex",justifyContent:"space-between",
                        alignItems:"center",marginBottom:12}}>
                        <span style={{fontSize:12,color:"var(--muted)"}}>
                          {selected.documents?.length||0} étape(s)
                        </span>
                        {isAdmin&&(
                          <button onClick={()=>handleBuildTimeline(selected.id)} style={{
                            background:"rgba(139,92,246,0.1)",border:"1px solid rgba(139,92,246,0.2)",
                            borderRadius:7,padding:"4px 10px",fontSize:10,color:"#a78bfa",cursor:"pointer"}}>
                            🤖 Reconstruire
                          </button>
                        )}
                      </div>
                      {(!selected.documents||selected.documents.length===0)?(
                        <div style={{textAlign:"center",padding:"28px 0",color:"var(--muted)"}}>
                          <div style={{fontSize:28,opacity:.15,marginBottom:8}}>📅</div>
                          <div style={{fontSize:12,marginBottom:10}}>Aucun document lié</div>
                          <button onClick={()=>setDetailTab("docs")} style={{
                            background:"rgba(59,130,246,0.1)",border:"1px solid rgba(59,130,246,0.2)",
                            borderRadius:7,padding:"5px 12px",fontSize:11,color:"#60a5fa",cursor:"pointer"}}>
                            📎 Lier des documents
                          </button>
                        </div>
                      ):(
                        <div style={{position:"relative"}}>
                          <div style={{position:"absolute",left:14,top:16,bottom:16,width:2,
                            background:"var(--border2)",borderRadius:99}}/>
                          {selected.documents.map((doc:any)=>{
                            const dc=DOC_CFG[doc.doc_type]||DOC_CFG.autre;
                            const ec=ETAPE_COLORS[doc.etape]||"#6b7280";
                            return(
                              <div key={doc.id} style={{display:"flex",gap:10,marginBottom:12,position:"relative"}}>
                                <div style={{width:30,height:30,borderRadius:"50%",flexShrink:0,
                                  background:`${dc.color}18`,border:`2px solid ${dc.color}44`,
                                  display:"flex",alignItems:"center",justifyContent:"center",
                                  fontSize:13,zIndex:1}}>{dc.icon}</div>
                                <div style={{flex:1,background:"var(--surface2)",borderRadius:10,
                                  border:`1px solid var(--border)`,borderLeft:`3px solid ${ec}`,
                                  padding:"8px 10px"}}>
                                  <div style={{display:"flex",justifyContent:"space-between",
                                    alignItems:"flex-start",marginBottom:3}}>
                                    <span style={{fontSize:11,fontWeight:700,color:ec}}>{doc.etape_label}</span>
                                    <div style={{display:"flex",gap:4,alignItems:"center",flexShrink:0,marginLeft:6}}>
                                      {doc.added_by_ai&&(
                                        <span style={{fontSize:8,background:"rgba(139,92,246,0.12)",
                                          color:"#a78bfa",border:"1px solid rgba(139,92,246,0.2)",
                                          borderRadius:99,padding:"1px 5px"}}>🤖 IA</span>
                                      )}
                                      {doc.doc_date&&<span style={{fontSize:9,color:"var(--muted)"}}>{doc.doc_date}</span>}
                                      {isAdmin&&(
                                        <button onClick={()=>handleDeleteDoc(doc.id)}
                                          style={{background:"none",border:"none",color:"var(--muted)",
                                            cursor:"pointer",fontSize:10,padding:0}}
                                          onMouseEnter={e=>e.currentTarget.style.color="#f87171"}
                                          onMouseLeave={e=>e.currentTarget.style.color="var(--muted)"}>🗑</button>
                                      )}
                                    </div>
                                  </div>
                                  {doc.doc_ref&&<div style={{fontSize:10,color:"var(--muted)",marginBottom:2}}>
                                    Réf: {doc.doc_ref}</div>}
                                  {doc.doc_titre&&<div style={{fontSize:11,color:"var(--text2)",lineHeight:1.4}}>
                                    {doc.doc_titre.length>75?doc.doc_titre.slice(0,75)+"…":doc.doc_titre}</div>}
                                  {doc.notes&&<div style={{fontSize:10,color:"var(--muted)",marginTop:4,
                                    fontStyle:"italic",borderTop:"1px solid var(--border)",paddingTop:3}}>
                                    {doc.notes.slice(0,60)}{doc.notes.length>60?"…":""}</div>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {isAdmin&&(
                        <div style={{marginTop:8,paddingTop:10,borderTop:"1px solid var(--border)"}}>
                          <button onClick={()=>handleDeleteProjet(selected.id)} style={{
                            width:"100%",background:"rgba(239,68,68,0.06)",
                            border:"1px solid rgba(239,68,68,0.18)",borderRadius:9,
                            padding:"8px",color:"#f87171",fontSize:11,cursor:"pointer"}}>
                            🗑️ Supprimer ce projet
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* LIER DOCS */}
                  {detailTab==="docs"&&(
                    <div style={{padding:"14px 16px"}}>
                      <div style={{display:"flex",gap:4,marginBottom:10,flexWrap:"wrap"}}>
                        {Object.entries(DOC_CFG).filter(([k])=>k!=="autre").map(([k,v])=>(
                          <button key={k} onClick={()=>{setDbTable(k);setDbSearch("");}}
                            style={{padding:"5px 11px",fontSize:11,fontWeight:600,cursor:"pointer",
                              borderRadius:99,transition:"all .12s",
                              border:`1px solid ${dbTable===k?v.color+"55":"var(--border2)"}`,
                              background:dbTable===k?`${v.color}15`:"var(--surface2)",
                              color:dbTable===k?v.color:"var(--muted)"}}>
                            {v.icon} {v.label}
                          </button>
                        ))}
                      </div>
                      <div style={{position:"relative",marginBottom:10}}>
                        <span style={{position:"absolute",left:10,top:"50%",
                          transform:"translateY(-50%)",color:"var(--muted)",fontSize:12}}>🔍</span>
                        <input value={dbSearch} onChange={e=>setDbSearch(e.target.value)}
                          placeholder="Rechercher..." style={{width:"100%",background:"var(--surface2)",
                            border:"1px solid var(--border2)",borderRadius:8,
                            padding:"7px 10px 7px 30px",color:"var(--text)",fontSize:12,
                            outline:"none",fontFamily:"var(--font-body)"}}/>
                      </div>
                      <div style={{display:"flex",flexDirection:"column",gap:5,
                        maxHeight:360,overflowY:"auto"}}>
                        {dbLoading?(
                          Array.from({length:4}).map((_,i)=>(
                            <div key={i} className="skeleton" style={{height:50,borderRadius:8}}/>
                          ))
                        ):dbItems.length===0?(
                          <div style={{textAlign:"center",padding:"20px 0",
                            color:"var(--muted)",fontSize:12}}>Aucun résultat</div>
                        ):dbItems.map((doc:any)=>{
                          const dc=DOC_CFG[dbTable]||DOC_CFG.autre;
                          const alreadyLinked=selected.documents?.some(
                            (d:any)=>d.doc_type===dbTable&&d.doc_id===doc.id);
                          const title=doc.objet||doc.expediteur||doc.reference||"—";
                          const ref=doc.reference||doc.expediteur||"";
                          const date=doc.date_courrier||doc.date_depart||doc.date_devis||doc.created_at||"";
                          return(
                            <div key={doc.id} style={{background:"var(--surface2)",
                              border:`1px solid ${alreadyLinked?"var(--green)33":"var(--border)"}`,
                              borderRadius:9,padding:"8px 10px",
                              display:"flex",alignItems:"center",gap:8,
                              opacity:alreadyLinked?.65:1}}>
                              <span style={{fontSize:14,flexShrink:0}}>{dc.icon}</span>
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{fontSize:11,fontWeight:600,overflow:"hidden",
                                  textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                                  {title.length>55?title.slice(0,55)+"…":title}
                                </div>
                                <div style={{fontSize:10,color:"var(--muted)",marginTop:1}}>
                                  {ref&&<span style={{marginRight:6}}>{ref.slice(0,22)}</span>}
                                  {date&&<span>{date}</span>}
                                </div>
                              </div>
                              {alreadyLinked?(
                                <span style={{fontSize:10,color:"var(--green)",fontWeight:700,flexShrink:0}}>✓ Lié</span>
                              ):(
                                <button onClick={()=>handleLinkDoc(doc)}
                                  disabled={linkingId===doc.id}
                                  style={{background:`${dc.color}15`,border:`1px solid ${dc.color}33`,
                                    borderRadius:7,padding:"4px 10px",color:dc.color,
                                    fontSize:10,fontWeight:700,cursor:"pointer",flexShrink:0,
                                    opacity:linkingId===doc.id?.5:1}}>
                                  {linkingId===doc.id?"⏳":"＋ Lier"}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* IA */}
                  {detailTab==="ia"&&(
                    <div style={{padding:"14px 16px"}}>
                      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
                        <button onClick={handleAiAnalysis} disabled={aiLoading} style={{
                          background:"linear-gradient(135deg,#8b5cf6,#6d28d9)",border:"none",
                          borderRadius:8,padding:"7px 16px",color:"#fff",
                          fontSize:12,fontWeight:700,cursor:"pointer",
                          opacity:aiLoading?.6:1}}>
                          {aiLoading?"⏳ Analyse...":"🔍 Analyser avec IA"}
                        </button>
                      </div>
                      {aiAnalysis?(
                        <div style={{display:"flex",flexDirection:"column",gap:10}}>
                          {[
                            {key:"analyse",label:"📊 État actuel",color:"#a78bfa"},
                            {key:"prochaine_etape",label:"➡️ Prochaine étape",color:"#10b981"},
                            {key:"blocages",label:"⚠️ Blocages",color:"#f59e0b"},
                            {key:"recommendation",label:"💡 Recommandation",color:"#60a5fa"},
                          ].filter(f=>(aiAnalysis as any)[f.key]).map(f=>(
                            <div key={f.key} style={{background:`${f.color}08`,
                              border:`1px solid ${f.color}22`,borderRadius:10,padding:"10px 12px"}}>
                              <div style={{fontSize:11,fontWeight:700,color:f.color,marginBottom:5}}>{f.label}</div>
                              <div style={{fontSize:12,color:"var(--text2)",lineHeight:1.6}}>
                                {(aiAnalysis as any)[f.key]}
                              </div>
                            </div>
                          ))}
                        </div>
                      ):(
                        <div style={{textAlign:"center",padding:"30px 0",color:"var(--muted)",fontSize:12}}>
                          <div style={{fontSize:28,opacity:.15,marginBottom:8}}>🤖</div>
                          Cliquez "Analyser avec IA" pour obtenir<br/>une analyse de l'état d'avancement
                        </div>
                      )}
                    </div>
                  )}

                  {/* NOTES */}
                  {detailTab==="notes"&&(
                    <div style={{padding:"14px 16px"}}>
                      <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:10}}>
                        {(!selected.notes||selected.notes.length===0)&&(
                          <div style={{textAlign:"center",padding:"16px 0",
                            color:"var(--muted)",fontSize:12,opacity:.6}}>Aucune note</div>
                        )}
                        {selected.notes?.map((n:any)=>(
                          <div key={n.id} style={{background:"var(--surface2)",
                            border:"1px solid var(--border)",borderRadius:9,
                            padding:"9px 12px",fontSize:12,lineHeight:1.5}}>
                            <div style={{color:"var(--text2)"}}>{n.contenu}</div>
                            <div style={{fontSize:10,color:"var(--muted)",marginTop:4}}>{n.created_at}</div>
                          </div>
                        ))}
                      </div>
                      <form onSubmit={handleAddNote} style={{display:"flex",gap:8}}>
                        <input value={noteText} onChange={e=>setNoteText(e.target.value)}
                          placeholder="Ajouter une note..." style={{flex:1,background:"var(--surface2)",
                            border:"1px solid var(--border2)",borderRadius:8,
                            padding:"8px 11px",color:"var(--text)",fontSize:12,
                            outline:"none",fontFamily:"var(--font-body)"}}/>
                        <button type="submit" disabled={noteLoading||!noteText.trim()}
                          style={{background:"rgba(59,130,246,0.15)",border:"1px solid rgba(59,130,246,0.3)",
                            borderRadius:8,padding:"8px 12px",color:"#60a5fa",fontSize:12,cursor:"pointer"}}>
                          💾
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL ADD */}
      {showAdd&&(
        <OV onClose={()=>setShowAdd(false)}>
          <div style={MB}>
            <MHD title="➕ Nouveau projet" onClose={()=>setShowAdd(false)}/>
            <form onSubmit={handleCreate}>
              <FGP label="Nom du projet">
                <input value={fNom} onChange={e=>setFNom(e.target.value)} required style={INP}
                  placeholder="Ex: Refonte lignes 60kV N°136"/>
              </FGP>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <FGP label="Type">
                  <select value={fType} onChange={e=>setFType(e.target.value)} style={INP}>
                    {Object.entries(TYPE_CFG).map(([k,v])=><option key={k} value={k}>{v.icon} {v.label}</option>)}
                  </select>
                </FGP>
                <FGP label="Priorité">
                  <select value={fPrio} onChange={e=>setFPrio(e.target.value)} style={INP}>
                    <option value="haute">🔴 Haute</option>
                    <option value="normale">🔵 Normale</option>
                    <option value="basse">⚫ Basse</option>
                  </select>
                </FGP>
              </div>
              <FGP label="Localisation">
                <input value={fLoc} onChange={e=>setFLoc(e.target.value)} style={INP}
                  placeholder="Ex: Casablanca - Settat"/>
              </FGP>
              <FGP label="Description">
                <textarea value={fDesc} onChange={e=>setFDesc(e.target.value)} rows={2}
                  style={{...INP,resize:"none"}} placeholder="Description..."/>
              </FGP>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <FGP label="Date début">
                  <input type="date" value={fDebut} onChange={e=>setFDebut(e.target.value)} style={INP}/>
                </FGP>
                <FGP label="Date fin">
                  <input type="date" value={fFin} onChange={e=>setFFin(e.target.value)} style={INP}/>
                </FGP>
              </div>
              {fMsg&&<MSGD msg={fMsg}/>}
              <button type="submit" disabled={fLoading} style={SBT}>
                {fLoading?"⏳ Création...":"✅ Créer le projet"}
              </button>
            </form>
          </div>
        </OV>
      )}

      {/* MODAL SCAN */}
      {showScan&&(
        <OV onClose={()=>setShowScan(false)}>
          <div style={{...MB,maxWidth:380}}>
            <MHD title="🤖 Scan IA auto" onClose={()=>setShowScan(false)}/>
            <p style={{fontSize:13,color:"var(--text2)",lineHeight:1.7,marginBottom:16}}>
              Claude analyse tous les documents récents et les relie automatiquement aux projets existants.
            </p>
            {scanResult?(
              <div style={{background:"var(--green-bg)",border:"1px solid rgba(16,185,129,0.25)",
                borderRadius:10,padding:"12px 14px",fontSize:13,color:"var(--green)"}}>
                ✅ {scanResult.linked} lien(s) créé(s) · {scanResult.skipped} ignoré(s)
              </div>
            ):(
              <button onClick={handleScan} disabled={scanning} style={SBT}>
                {scanning?"⏳ Scan en cours...":"🤖 Lancer le scan"}
              </button>
            )}
          </div>
        </OV>
      )}

      <style>{`@keyframes scaleIn{from{opacity:0;transform:scale(0.96)}to{opacity:1;transform:scale(1)}}`}</style>
    </div>
  );
}

// Sub-components
function OV({children,onClose}:{children:React.ReactNode;onClose:()=>void}){
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",
      display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,backdropFilter:"blur(5px)"}}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      {children}
    </div>
  );
}
function MHD({title,onClose}:{title:string;onClose:()=>void}){
  return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
      <div style={{fontFamily:"var(--font-head)",fontSize:15,fontWeight:700}}>{title}</div>
      <button onClick={onClose} style={{background:"none",border:"none",color:"var(--muted)",cursor:"pointer",fontSize:20}}>✕</button>
    </div>
  );
}
function FGP({label,children}:{label:string;children:React.ReactNode}){
  return(
    <div style={{marginBottom:14}}>
      <label style={{display:"block",fontSize:11,fontWeight:700,textTransform:"uppercase",
        letterSpacing:".7px",color:"var(--muted)",marginBottom:7}}>{label}</label>
      {children}
    </div>
  );
}
function MSGD({msg}:{msg:string}){
  const ok=msg.startsWith("✅");
  return(
    <div style={{padding:"9px 12px",borderRadius:9,fontSize:12,marginBottom:12,
      background:ok?"var(--green-bg)":"rgba(239,68,68,0.1)",
      color:ok?"var(--green)":"var(--danger)",
      border:`1px solid ${ok?"rgba(16,185,129,0.25)":"rgba(239,68,68,0.25)"}`}}>{msg}</div>
  );
}

const BGH:React.CSSProperties={background:"var(--surface2)",border:"1px solid var(--border2)",
  borderRadius:9,padding:"8px 14px",color:"var(--text2)",fontSize:12,fontWeight:600,
  cursor:"pointer",fontFamily:"var(--font-body)"};
const BPR:React.CSSProperties={background:"linear-gradient(135deg,#2563eb,#1d4ed8)",border:"none",
  borderRadius:9,padding:"8px 16px",color:"#fff",fontSize:12,fontWeight:700,
  cursor:"pointer",boxShadow:"0 4px 12px rgba(37,99,235,0.3)",fontFamily:"var(--font-body)"};
const SEL:React.CSSProperties={background:"var(--surface)",border:"1px solid var(--border2)",
  borderRadius:9,padding:"8px 12px",color:"var(--text)",fontSize:12,outline:"none",
  cursor:"pointer",fontFamily:"var(--font-body)"};
const SC:React.CSSProperties={background:"var(--surface)",border:"1px solid var(--border)",
  borderRadius:12,padding:"12px 14px",cursor:"pointer",transition:"all .15s"};
const INP:React.CSSProperties={width:"100%",background:"var(--surface2)",border:"1px solid var(--border2)",
  borderRadius:9,padding:"9px 12px",color:"var(--text)",fontSize:13,outline:"none",fontFamily:"var(--font-body)"};
const MB:React.CSSProperties={background:"var(--surface)",border:"1px solid var(--border2)",
  borderRadius:16,padding:28,width:"100%",maxWidth:500,boxShadow:"0 24px 60px rgba(0,0,0,0.5)",
  animation:"scaleIn .22s cubic-bezier(0.16,1,0.3,1) both"};
const SBT:React.CSSProperties={width:"100%",background:"linear-gradient(135deg,#2563eb,#1d4ed8)",
  border:"none",borderRadius:11,padding:13,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",
  boxShadow:"0 4px 14px rgba(37,99,235,0.3)",fontFamily:"var(--font-body)",marginTop:4};