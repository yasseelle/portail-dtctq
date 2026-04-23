"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

const API = "http://10.23.23.144:8000";

const STATUT_CONFIG: Record<string,{label:string;color:string;bg:string;icon:string}> = {
  en_cours: {label:"En cours",  color:"#2563eb", bg:"rgba(37,99,235,0.1)",  icon:"🔵"},
  suspendu: {label:"Suspendu",  color:"#f59e0b", bg:"rgba(245,158,11,0.1)", icon:"🟡"},
  termine:  {label:"Terminé",   color:"#10b981", bg:"rgba(16,185,129,0.1)", icon:"🟢"},
  annule:   {label:"Annulé",    color:"#ef4444", bg:"rgba(239,68,68,0.1)",  icon:"🔴"},
};

const PRIORITE_CONFIG: Record<string,{label:string;color:string}> = {
  haute:   {label:"Haute",   color:"#ef4444"},
  normale: {label:"Normale", color:"#2563eb"},
  basse:   {label:"Basse",   color:"#6b7280"},
};

const DOC_TYPE_CONFIG: Record<string,{label:string;icon:string;color:string}> = {
  courrier:  {label:"Courrier",  icon:"📬", color:"#2563eb"},
  devis:     {label:"Devis",     icon:"💰", color:"#10b981"},
  bordereau: {label:"Bordereau", icon:"📤", color:"#f59e0b"},
  autre:     {label:"Document",  icon:"📄", color:"#6b7280"},
};

// =============================================================================
export default function ProjetsPage() {
  const router = useRouter();
  const [user,    setUser]    = useState<any>(null);
  const [token,   setToken]   = useState("");
  const [projets, setProjets] = useState<any[]>([]);
  const [stats,   setStats]   = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState("");
  const [filterStatut, setFilterStatut] = useState("");

  // Selected project for detail view
  const [selected,   setSelected]   = useState<any>(null);
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [aiLoading,  setAiLoading]  = useState(false);

  // Modals
  const [showAdd,     setShowAdd]     = useState(false);
  const [showAddDoc,  setShowAddDoc]  = useState(false);
  const [showScan,    setShowScan]    = useState(false);
  const [scanResult,  setScanResult]  = useState<any>(null);
  const [scanning,    setScanning]    = useState(false);

  // Note input
  const [noteText,    setNoteText]    = useState("");
  const [noteLoading, setNoteLoading] = useState(false);

  // Form state
  const [fNom,     setFNom]     = useState("");
  const [fType,    setFType]    = useState("ligne_electrique");
  const [fDesc,    setFDesc]    = useState("");
  const [fLoc,     setFLoc]     = useState("");
  const [fPrio,    setFPrio]    = useState("normale");
  const [fDebut,   setFDebut]   = useState("");
  const [fFin,     setFFin]     = useState("");
  const [fMsg,     setFMsg]     = useState("");
  const [fLoading, setFLoading] = useState(false);

  // Add doc form
  const [dType,  setDType]  = useState("courrier");
  const [dRef,   setDRef]   = useState("");
  const [dTitre, setDTitre] = useState("");
  const [dDate,  setDDate]  = useState("");
  const [dNotes, setDNotes] = useState("");
  const [dMsg,   setDMsg]   = useState("");

  useEffect(() => {
    const stored = localStorage.getItem("user");
    const tok    = localStorage.getItem("token");
    if (!stored || !tok) { router.push("/"); return; }
    setUser(JSON.parse(stored)); setToken(tok);
  }, [router]);

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page:"1", limit:"50",
        ...(search?{search}:{}), ...(filterStatut?{statut:filterStatut}:{}) });
      const [pr, sr] = await Promise.all([
        fetch(`${API}/projets/?${params}`, {headers:{Authorization:`Bearer ${token}`}}),
        fetch(`${API}/projets/stats`,       {headers:{Authorization:`Bearer ${token}`}}),
      ]);
      if (pr.ok) { const d=await pr.json(); setProjets(d.items); }
      if (sr.ok) setStats(await sr.json());
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [token, search, filterStatut]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Refresh selected project
  async function refreshSelected(id: number) {
    try {
      const res = await fetch(`${API}/projets/${id}`, {headers:{Authorization:`Bearer ${token}`}});
      if (res.ok) { const d=await res.json(); setSelected(d); }
    } catch { /* silent */ }
  }

  async function handleAiAnalysis(projet: any) {
    setAiLoading(true); setAiAnalysis(null);
    try {
      const res = await fetch(`${API}/projets/${projet.id}/analyse-ia`, {headers:{Authorization:`Bearer ${token}`}});
      if (res.ok) setAiAnalysis(await res.json());
      else setAiAnalysis({analyse:"Analyse non disponible (clé API non configurée)", prochaine_etape:"", blocages:""});
    } catch { setAiAnalysis({analyse:"Erreur lors de l'analyse", prochaine_etape:"", blocages:""}); }
    finally { setAiLoading(false); }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault(); setFLoading(true); setFMsg("");
    try {
      const res = await fetch(`${API}/projets/`, {
        method:"POST", headers:{"Content-Type":"application/json", Authorization:`Bearer ${token}`},
        body: JSON.stringify({nom:fNom, type_projet:fType, description:fDesc,
          localisation:fLoc, priorite:fPrio, date_debut:fDebut, date_fin_prev:fFin}),
      });
      const d = await res.json();
      if (res.ok) { setFMsg(d.message); setTimeout(()=>{ setShowAdd(false); fetchData(); },1200); }
      else setFMsg(`❌ ${d.detail}`);
    } catch { setFMsg("❌ Erreur serveur"); }
    finally { setFLoading(false); }
  }

  async function handleAddDoc(e: React.FormEvent) {
    e.preventDefault(); setFLoading(true); setDMsg("");
    try {
      const res = await fetch(`${API}/projets/${selected.id}/lier-document-auto`, {
        method:"POST", headers:{"Content-Type":"application/json", Authorization:`Bearer ${token}`},
        body: JSON.stringify({doc_type:dType, doc_ref:dRef, doc_titre:dTitre, doc_date:dDate, notes:dNotes}),
      });
      const d = await res.json();
      if (res.ok) {
        setDMsg(`${d.message} — Étape détectée : ${d.etape_label}`);
        setTimeout(()=>{ setShowAddDoc(false); refreshSelected(selected.id); fetchData(); },1500);
      } else setDMsg(`❌ ${d.detail}`);
    } catch { setDMsg("❌ Erreur serveur"); }
    finally { setFLoading(false); }
  }

  async function handleDeleteDoc(docId: number) {
    if (!confirm("Supprimer ce lien ?")) return;
    try {
      await fetch(`${API}/projets/${selected.id}/documents/${docId}`,
        {method:"DELETE", headers:{Authorization:`Bearer ${token}`}});
      refreshSelected(selected.id); fetchData();
    } catch { /* silent */ }
  }

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault(); if(!noteText.trim()) return;
    setNoteLoading(true);
    try {
      await fetch(`${API}/projets/${selected.id}/notes`, {
        method:"POST", headers:{"Content-Type":"application/json", Authorization:`Bearer ${token}`},
        body: JSON.stringify({contenu:noteText}),
      });
      setNoteText(""); refreshSelected(selected.id);
    } catch { /* silent */ }
    finally { setNoteLoading(false); }
  }

  async function handleScan() {
    setScanning(true); setScanResult(null);
    try {
      const res = await fetch(`${API}/projets/scan-and-link`,
        {method:"POST", headers:{Authorization:`Bearer ${token}`}});
      if (res.ok) { setScanResult(await res.json()); fetchData(); }
    } catch { /* silent */ }
    finally { setScanning(false); }
  }

  async function handleDeleteProjet(id: number) {
    if (!confirm("Supprimer ce projet et tous ses liens ?")) return;
    await fetch(`${API}/projets/${id}`, {method:"DELETE", headers:{Authorization:`Bearer ${token}`}});
    setSelected(null); fetchData();
  }

  async function handleUpdateStatut(id: number, statut: string) {
    await fetch(`${API}/projets/${id}`, {
      method:"PUT", headers:{"Content-Type":"application/json", Authorization:`Bearer ${token}`},
      body: JSON.stringify({statut}),
    });
    refreshSelected(id); fetchData();
  }

  if (!user) return null;
  const isAdmin = user.role === "admin";

  return (
    <div style={{ minHeight:"100vh", background:"var(--bg)", padding:"24px 28px" }}>

      {/* Header */}
      <div style={{ marginBottom:20 }}>
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
          <div>
            <h1 style={{ fontFamily:"var(--font-head)", fontSize:24, fontWeight:800, marginBottom:5 }}>
              🏗️ Suivi des Projets
            </h1>
            <p style={{ color:"var(--muted)", fontSize:13 }}>
              Suivi intelligent de A à Z · Timeline automatique · Analyse IA
            </p>
          </div>
          {isAdmin && (
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={()=>setShowScan(true)} style={{
                background:"var(--surface2)", border:"1px solid var(--border2)",
                borderRadius:9, padding:"8px 14px", color:"var(--text2)",
                fontSize:12, fontWeight:600, cursor:"pointer",
              }}>🤖 Scan IA auto</button>
              <button onClick={()=>{ setFMsg(""); setShowAdd(true); }} style={{
                background:"linear-gradient(135deg,#2563eb,#1d4ed8)", border:"none",
                borderRadius:9, padding:"8px 16px", color:"#fff",
                fontSize:12, fontWeight:700, cursor:"pointer",
                boxShadow:"0 4px 14px rgba(37,99,235,0.3)",
              }}>➕ Nouveau projet</button>
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:10, marginBottom:20 }}>
          {[
            {icon:"🏗️", val:stats.total,      lbl:"Total projets",    color:"#2563eb"},
            ...stats.by_statut.map((s:any)=>({
              icon:STATUT_CONFIG[s.statut]?.icon||"📋",
              val:s.count, lbl:s.label, color:s.color
            }))
          ].slice(0,5).map((s,i)=>(
            <div key={i} style={{
              background:"var(--surface)", border:"1px solid var(--border)",
              borderTop:`2px solid ${s.color}`, borderRadius:12, padding:"12px 14px",
              cursor:"pointer", transition:"transform .15s",
            }}
            onClick={()=>setFilterStatut(i>0 ? stats.by_statut[i-1]?.statut : "")}
            onMouseEnter={e=>(e.currentTarget as HTMLElement).style.transform="translateY(-2px)"}
            onMouseLeave={e=>(e.currentTarget as HTMLElement).style.transform="translateY(0)"}>
              <div style={{ fontSize:16, marginBottom:6 }}>{s.icon}</div>
              <div style={{ fontSize:24, fontWeight:800, color:s.color, fontFamily:"var(--font-head)" }}>{s.val}</div>
              <div style={{ fontSize:10, color:"var(--muted)", marginTop:4 }}>{s.lbl}</div>
            </div>
          ))}
        </div>
      )}

      {/* Search + filter */}
      <div style={{ display:"flex", gap:10, marginBottom:16, alignItems:"center" }}>
        <div style={{ position:"relative", flex:1 }}>
          <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:"var(--muted)" }}>🔍</span>
          <input value={search} onChange={e=>{setSearch(e.target.value);}}
            placeholder="Rechercher un projet..."
            style={{ width:"100%", background:"var(--surface)", border:"1px solid var(--border2)",
              borderRadius:9, padding:"9px 14px 9px 36px", color:"var(--text)", fontSize:13, outline:"none",
              fontFamily:"var(--font-body)" }}/>
        </div>
        <select value={filterStatut} onChange={e=>setFilterStatut(e.target.value)} style={{
          background:"var(--surface)", border:"1px solid var(--border2)", borderRadius:9,
          padding:"9px 12px", color:"var(--text)", fontSize:12, outline:"none", cursor:"pointer",
        }}>
          <option value="">Tous les statuts</option>
          {Object.entries(STATUT_CONFIG).map(([k,v])=><option key={k} value={k}>{v.icon} {v.label}</option>)}
        </select>
        {filterStatut && (
          <button onClick={()=>setFilterStatut("")} style={{
            background:"none", border:"1px solid var(--border2)", borderRadius:9,
            padding:"9px 12px", color:"var(--muted)", fontSize:12, cursor:"pointer",
          }}>✕ Réinitialiser</button>
        )}
      </div>

      {/* Main layout */}
      <div style={{ display:"grid", gridTemplateColumns:selected?"1fr 1fr":"1fr", gap:18 }}>

        {/* ── Liste projets ── */}
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {loading ? (
            Array.from({length:4}).map((_,i)=>(
              <div key={i} style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:14, padding:20 }}>
                <div className="skeleton" style={{ height:18, width:"60%", marginBottom:10, borderRadius:6 }}/>
                <div className="skeleton" style={{ height:13, width:"40%", borderRadius:6 }}/>
              </div>
            ))
          ) : projets.length === 0 ? (
            <div style={{ textAlign:"center", padding:"60px 20px", color:"var(--muted)" }}>
              <div style={{ fontSize:48, marginBottom:14, opacity:.15 }}>🏗️</div>
              <div style={{ fontSize:15, fontWeight:600, marginBottom:8 }}>Aucun projet</div>
              {isAdmin && <div style={{ fontSize:13 }}>Cliquez "Nouveau projet" pour commencer</div>}
            </div>
          ) : projets.map(p=>{
            const st = STATUT_CONFIG[p.statut] || STATUT_CONFIG.en_cours;
            const pr = PRIORITE_CONFIG[p.priorite] || PRIORITE_CONFIG.normale;
            const isSelected = selected?.id === p.id;
            return (
              <div key={p.id}
                onClick={()=>{ setSelected(p); setAiAnalysis(null); }}
                style={{
                  background:"var(--surface)",
                  border:`1px solid ${isSelected ? "#2563eb55" : "var(--border)"}`,
                  borderLeft:`4px solid ${st.color}`,
                  borderRadius:14, padding:"16px 18px", cursor:"pointer",
                  transition:"all 0.2s",
                  boxShadow: isSelected ? "0 0 0 3px rgba(37,99,235,0.12)" : "none",
                }}
                onMouseEnter={e=>{ if(!isSelected)(e.currentTarget as HTMLElement).style.borderColor=`${st.color}44`; }}
                onMouseLeave={e=>{ if(!isSelected)(e.currentTarget as HTMLElement).style.borderColor="var(--border)"; }}>

                {/* Top row */}
                <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:10 }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontFamily:"var(--font-head)", fontSize:15, fontWeight:700, marginBottom:4 }}>
                      {p.nom}
                    </div>
                    {p.localisation && (
                      <div style={{ fontSize:11, color:"var(--muted)" }}>📍 {p.localisation}</div>
                    )}
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:5, flexShrink:0, marginLeft:10 }}>
                    <span style={{
                      background:st.bg, color:st.color, border:`1px solid ${st.color}33`,
                      padding:"3px 9px", borderRadius:99, fontSize:11, fontWeight:600,
                    }}>{st.icon} {st.label}</span>
                    <span style={{ fontSize:10, fontWeight:600, color:pr.color }}>
                      ● {pr.label}
                    </span>
                  </div>
                </div>

                {/* Progress bar */}
                <div style={{ marginBottom:10 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:"var(--muted)", marginBottom:4 }}>
                    <span>Avancement</span>
                    <span style={{ fontWeight:700, color:st.color }}>{p.progression}%</span>
                  </div>
                  <div style={{ height:5, background:"var(--surface2)", borderRadius:99, overflow:"hidden" }}>
                    <div style={{
                      height:"100%", borderRadius:99, background:`linear-gradient(90deg,${st.color},${st.color}99)`,
                      width:`${p.progression}%`, transition:"width 0.8s cubic-bezier(.4,0,.2,1)",
                    }}/>
                  </div>
                </div>

                {/* Bottom row */}
                <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                  <span style={{ fontSize:10, color:"var(--muted)" }}>{p.type_label}</span>
                  <span style={{ opacity:.3 }}>·</span>
                  <span style={{ fontSize:10, color:"var(--muted)" }}>📄 {p.nb_documents} document(s)</span>
                  {p.date_debut && <>
                    <span style={{ opacity:.3 }}>·</span>
                    <span style={{ fontSize:10, color:"var(--muted)" }}>📅 {p.date_debut}</span>
                  </>}
                  {/* Last step badge */}
                  {p.documents.length > 0 && (
                    <span style={{
                      marginLeft:"auto",
                      background:"var(--surface2)", color:"var(--muted)",
                      padding:"2px 8px", borderRadius:99, fontSize:10,
                    }}>
                      Dernière: {p.documents[p.documents.length-1]?.etape_label?.split(" ").slice(1).join(" ")}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Détail projet ── */}
        {selected && (
          <div style={{
            background:"var(--surface)", border:"1px solid var(--border)",
            borderRadius:16, overflow:"hidden",
            position:"sticky", top:76, maxHeight:"calc(100vh - 100px)",
            display:"flex", flexDirection:"column",
          }}>
            {/* Detail header */}
            <div style={{
              padding:"16px 20px", borderBottom:"1px solid var(--border)",
              background:`${STATUT_CONFIG[selected.statut]?.color}08`,
              flexShrink:0,
            }}>
              <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
                <div>
                  <div style={{ fontFamily:"var(--font-head)", fontSize:16, fontWeight:800, marginBottom:4 }}>
                    {selected.nom}
                  </div>
                  <div style={{ fontSize:11, color:"var(--muted)" }}>
                    {selected.type_label} {selected.localisation && `· 📍 ${selected.localisation}`}
                  </div>
                </div>
                <button onClick={()=>{ setSelected(null); setAiAnalysis(null); }} style={{
                  background:"none", border:"none", color:"var(--muted)", cursor:"pointer", fontSize:18,
                }}>✕</button>
              </div>

              {/* Statut buttons */}
              {isAdmin && (
                <div style={{ display:"flex", gap:5, marginTop:10 }}>
                  {Object.entries(STATUT_CONFIG).map(([k,v])=>(
                    <button key={k} onClick={()=>handleUpdateStatut(selected.id, k)} style={{
                      background: selected.statut===k ? `${v.color}22` : "var(--surface2)",
                      border:`1px solid ${selected.statut===k ? v.color+"55" : "var(--border2)"}`,
                      borderRadius:7, padding:"3px 9px", fontSize:10, fontWeight:600,
                      color: selected.statut===k ? v.color : "var(--muted)", cursor:"pointer",
                    }}>{v.icon} {v.label}</button>
                  ))}
                </div>
              )}
            </div>

            {/* Scrollable content */}
            <div style={{ overflowY:"auto", flex:1, padding:"16px 20px" }}>

              {/* Progress */}
              <div style={{ marginBottom:20 }}>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:6 }}>
                  <span style={{ fontWeight:600 }}>Avancement global</span>
                  <span style={{ fontWeight:800, color:STATUT_CONFIG[selected.statut]?.color }}>{selected.progression}%</span>
                </div>
                <div style={{ height:8, background:"var(--surface2)", borderRadius:99, overflow:"hidden" }}>
                  <div style={{
                    height:"100%", borderRadius:99,
                    background:`linear-gradient(90deg,${STATUT_CONFIG[selected.statut]?.color},${STATUT_CONFIG[selected.statut]?.color}88)`,
                    width:`${selected.progression}%`, transition:"width 1s ease",
                  }}/>
                </div>
              </div>

              {/* ── TIMELINE ── */}
              <div style={{ marginBottom:20 }}>
                <div style={{
                  display:"flex", alignItems:"center", justifyContent:"space-between",
                  fontFamily:"var(--font-head)", fontSize:13, fontWeight:700, marginBottom:12,
                }}>
                  📅 Timeline
                  {isAdmin && (
                    <button onClick={()=>{ setDType("courrier"); setDRef(""); setDTitre(""); setDDate(""); setDNotes(""); setDMsg(""); setShowAddDoc(true); }} style={{
                      background:"rgba(37,99,235,0.1)", border:"1px solid rgba(37,99,235,0.25)",
                      borderRadius:7, padding:"4px 10px", fontSize:11, color:"#60a5fa", cursor:"pointer",
                    }}>➕ Lier un doc</button>
                  )}
                </div>

                {selected.documents.length === 0 ? (
                  <div style={{ textAlign:"center", padding:"24px 0", color:"var(--muted)", fontSize:12 }}>
                    <div style={{ fontSize:28, marginBottom:8, opacity:.2 }}>📄</div>
                    Aucun document lié
                  </div>
                ) : (
                  <div style={{ position:"relative" }}>
                    {/* Ligne verticale */}
                    <div style={{
                      position:"absolute", left:15, top:8, bottom:8,
                      width:2, background:"var(--border2)", borderRadius:99,
                    }}/>
                    {selected.documents.map((doc:any, i:number)=>{
                      const dt = DOC_TYPE_CONFIG[doc.doc_type] || DOC_TYPE_CONFIG.autre;
                      return (
                        <div key={doc.id} style={{
                          display:"flex", gap:12, marginBottom:14, position:"relative",
                        }}>
                          {/* Point sur la timeline */}
                          <div style={{
                            width:32, height:32, borderRadius:"50%", flexShrink:0,
                            background:`${dt.color}18`, border:`2px solid ${dt.color}55`,
                            display:"flex", alignItems:"center", justifyContent:"center",
                            fontSize:14, zIndex:1,
                          }}>{dt.icon}</div>

                          <div style={{
                            flex:1, background:"var(--surface2)", border:"1px solid var(--border)",
                            borderRadius:10, padding:"10px 12px",
                          }}>
                            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:4 }}>
                              <span style={{ fontSize:11, fontWeight:700, color:dt.color }}>
                                {doc.etape_label}
                              </span>
                              <div style={{ display:"flex", gap:5, alignItems:"center" }}>
                                {doc.added_by_ai && (
                                  <span style={{ fontSize:9, background:"rgba(139,92,246,0.1)",
                                    color:"#a78bfa", border:"1px solid rgba(139,92,246,0.2)",
                                    borderRadius:99, padding:"1px 6px" }}>🤖 IA</span>
                                )}
                                <span style={{ fontSize:10, color:"var(--muted)" }}>{doc.doc_date}</span>
                                {isAdmin && (
                                  <button onClick={()=>handleDeleteDoc(doc.id)} style={{
                                    background:"none", border:"none", color:"var(--muted)",
                                    cursor:"pointer", fontSize:11, padding:0,
                                    transition:"color .15s",
                                  }}
                                  onMouseEnter={e=>e.currentTarget.style.color="var(--danger)"}
                                  onMouseLeave={e=>e.currentTarget.style.color="var(--muted)"}>🗑️</button>
                                )}
                              </div>
                            </div>
                            {doc.doc_ref && (
                              <div style={{ fontSize:11, color:"var(--muted)", marginBottom:2 }}>
                                Réf: {doc.doc_ref}
                              </div>
                            )}
                            {doc.doc_titre && (
                              <div style={{ fontSize:12, color:"var(--text2)", lineHeight:1.4 }}>
                                {doc.doc_titre}
                              </div>
                            )}
                            {doc.notes && (
                              <div style={{ fontSize:11, color:"var(--muted)", marginTop:4,
                                fontStyle:"italic", borderTop:"1px solid var(--border)", paddingTop:4 }}>
                                {doc.notes}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ── ANALYSE IA ── */}
              <div style={{ marginBottom:20 }}>
                <div style={{
                  fontFamily:"var(--font-head)", fontSize:13, fontWeight:700, marginBottom:10,
                  display:"flex", alignItems:"center", justifyContent:"space-between",
                }}>
                  🤖 Analyse IA
                  <button onClick={()=>handleAiAnalysis(selected)} disabled={aiLoading} style={{
                    background:"linear-gradient(135deg,#8b5cf6,#6d28d9)", border:"none",
                    borderRadius:8, padding:"5px 12px", color:"#fff",
                    fontSize:11, fontWeight:600, cursor:"pointer",
                  }}>
                    {aiLoading ? "⏳ Analyse..." : "🔍 Analyser"}
                  </button>
                </div>

                {aiAnalysis ? (
                  <div style={{
                    background:"rgba(139,92,246,0.06)", border:"1px solid rgba(139,92,246,0.2)",
                    borderRadius:12, padding:14, fontSize:12, lineHeight:1.7,
                  }}>
                    <div style={{ marginBottom:10, color:"var(--text2)" }}>
                      <strong style={{ color:"#a78bfa" }}>📊 État :</strong><br/>
                      {aiAnalysis.analyse}
                    </div>
                    {aiAnalysis.prochaine_etape && (
                      <div style={{ marginBottom:10 }}>
                        <strong style={{ color:"#10b981" }}>➡️ Prochaine étape :</strong><br/>
                        <span style={{ color:"var(--text2)" }}>{aiAnalysis.prochaine_etape}</span>
                      </div>
                    )}
                    {aiAnalysis.blocages && (
                      <div style={{ marginBottom:10 }}>
                        <strong style={{ color:"#f59e0b" }}>⚠️ Blocages :</strong><br/>
                        <span style={{ color:"var(--text2)" }}>{aiAnalysis.blocages}</span>
                      </div>
                    )}
                    {aiAnalysis.recommendation && (
                      <div>
                        <strong style={{ color:"#60a5fa" }}>💡 Recommandation :</strong><br/>
                        <span style={{ color:"var(--text2)" }}>{aiAnalysis.recommendation}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{
                    background:"var(--surface2)", border:"1px solid var(--border)",
                    borderRadius:10, padding:"14px", fontSize:12, color:"var(--muted)",
                    textAlign:"center", lineHeight:1.6,
                  }}>
                    Cliquez "Analyser" pour obtenir une analyse IA<br/>
                    de l'état d'avancement de ce projet
                  </div>
                )}
              </div>

              {/* ── NOTES ── */}
              <div style={{ marginBottom:12 }}>
                <div style={{ fontFamily:"var(--font-head)", fontSize:13, fontWeight:700, marginBottom:10 }}>
                  📝 Notes
                </div>
                {selected.notes.map((n:any)=>(
                  <div key={n.id} style={{
                    background:"var(--surface2)", border:"1px solid var(--border)",
                    borderRadius:9, padding:"9px 12px", marginBottom:8,
                    fontSize:12, color:"var(--text2)", lineHeight:1.5,
                  }}>
                    <div>{n.contenu}</div>
                    <div style={{ fontSize:10, color:"var(--muted)", marginTop:4 }}>{n.created_at}</div>
                  </div>
                ))}
                <form onSubmit={handleAddNote} style={{ display:"flex", gap:8, marginTop:8 }}>
                  <input value={noteText} onChange={e=>setNoteText(e.target.value)}
                    placeholder="Ajouter une note..." style={{
                      flex:1, background:"var(--surface2)", border:"1px solid var(--border2)",
                      borderRadius:9, padding:"8px 12px", color:"var(--text)", fontSize:12, outline:"none",
                    }}/>
                  <button type="submit" disabled={noteLoading||!noteText.trim()} style={{
                    background:"var(--surface2)", border:"1px solid var(--border2)",
                    borderRadius:9, padding:"8px 12px", color:"var(--text2)",
                    fontSize:12, cursor:"pointer",
                  }}>💾</button>
                </form>
              </div>

              {/* Admin actions */}
              {isAdmin && (
                <div style={{ paddingTop:12, borderTop:"1px solid var(--border)", display:"flex", gap:8 }}>
                  <button onClick={()=>handleDeleteProjet(selected.id)} style={{
                    flex:1, background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.2)",
                    borderRadius:9, padding:9, color:"#f87171", fontSize:12, cursor:"pointer",
                  }}>🗑️ Supprimer le projet</button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── MODAL: Nouveau projet ── */}
      {showAdd && (
        <Modal title="➕ Nouveau projet" onClose={()=>setShowAdd(false)}>
          <form onSubmit={handleCreate}>
            <FG label="Nom du projet">
              <input value={fNom} onChange={e=>setFNom(e.target.value)} required style={inpSt}
                placeholder="Ex: Ligne 60kV Rabat-Casablanca"/>
            </FG>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <FG label="Type de projet">
                <select value={fType} onChange={e=>setFType(e.target.value)} style={inpSt}>
                  <option value="ligne_electrique">⚡ Ligne Électrique</option>
                  <option value="poste">🏭 Poste Électrique</option>
                  <option value="maintenance">🔧 Maintenance</option>
                  <option value="administratif">📋 Administratif</option>
                  <option value="autre">📁 Autre</option>
                </select>
              </FG>
              <FG label="Priorité">
                <select value={fPrio} onChange={e=>setFPrio(e.target.value)} style={inpSt}>
                  <option value="haute">🔴 Haute</option>
                  <option value="normale">🔵 Normale</option>
                  <option value="basse">⚫ Basse</option>
                </select>
              </FG>
            </div>
            <FG label="Localisation">
              <input value={fLoc} onChange={e=>setFLoc(e.target.value)} style={inpSt}
                placeholder="Ex: Rabat - Casablanca"/>
            </FG>
            <FG label="Description">
              <textarea value={fDesc} onChange={e=>setFDesc(e.target.value)} rows={2}
                style={{...inpSt,resize:"none"}} placeholder="Description du projet..."/>
            </FG>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <FG label="Date début"><input type="date" value={fDebut} onChange={e=>setFDebut(e.target.value)} style={inpSt}/></FG>
              <FG label="Date fin prévue"><input type="date" value={fFin} onChange={e=>setFFin(e.target.value)} style={inpSt}/></FG>
            </div>
            {fMsg && <MsgDiv msg={fMsg}/>}
            <button type="submit" disabled={fLoading} style={submitBtn}>
              {fLoading?"⏳ Création...":"✅ Créer le projet"}
            </button>
          </form>
        </Modal>
      )}

      {/* ── MODAL: Lier document ── */}
      {showAddDoc && selected && (
        <Modal title={`📎 Lier un document — ${selected.nom}`} onClose={()=>setShowAddDoc(false)}>
          <form onSubmit={handleAddDoc}>
            <div style={{ background:"rgba(139,92,246,0.08)", border:"1px solid rgba(139,92,246,0.2)",
              borderRadius:9, padding:"9px 12px", fontSize:11, color:"#a78bfa", marginBottom:14 }}>
              🤖 L'étape sera détectée automatiquement par Claude AI
            </div>
            <FG label="Type de document">
              <select value={dType} onChange={e=>setDType(e.target.value)} style={inpSt}>
                <option value="courrier">📬 Courrier</option>
                <option value="devis">💰 Devis</option>
                <option value="bordereau">📤 Bordereau</option>
                <option value="autre">📄 Autre</option>
              </select>
            </FG>
            <FG label="Référence">
              <input value={dRef} onChange={e=>setDRef(e.target.value)} style={inpSt}
                placeholder="Ex: 3/DI/CTR/DTC/TQ/SE/666/2024"/>
            </FG>
            <FG label="Titre / Objet">
              <input value={dTitre} onChange={e=>setDTitre(e.target.value)} required style={inpSt}
                placeholder="Ex: Déviation ligne 60kV — carnet de piquetage"/>
            </FG>
            <FG label="Date du document">
              <input value={dDate} onChange={e=>setDDate(e.target.value)} style={inpSt} placeholder="JJ/MM/AAAA"/>
            </FG>
            <FG label="Notes (optionnel)">
              <textarea value={dNotes} onChange={e=>setDNotes(e.target.value)} rows={2}
                style={{...inpSt,resize:"none"}} placeholder="Informations supplémentaires..."/>
            </FG>
            {dMsg && <MsgDiv msg={dMsg}/>}
            <button type="submit" disabled={fLoading} style={submitBtn}>
              {fLoading?"⏳ Liaison...":"🔗 Lier le document"}
            </button>
          </form>
        </Modal>
      )}

      {/* ── MODAL: Scan IA ── */}
      {showScan && (
        <Modal title="🤖 Scan IA automatique" onClose={()=>setShowScan(false)}>
          <div style={{ fontSize:13, color:"var(--text2)", lineHeight:1.7, marginBottom:20 }}>
            Claude va analyser tous les documents récents (courriers, devis, bordereaux)
            et tenter de les relier automatiquement aux projets existants.
          </div>
          {scanResult ? (
            <div style={{ background:"var(--green-bg)", border:"1px solid rgba(16,185,129,0.25)",
              borderRadius:10, padding:"12px 14px", fontSize:13, color:"var(--green)", marginBottom:16 }}>
              ✅ Scan terminé — {scanResult.linked} lien(s) créé(s), {scanResult.skipped} ignoré(s)
            </div>
          ) : (
            <button onClick={handleScan} disabled={scanning} style={submitBtn}>
              {scanning?"⏳ Scan en cours...":"🤖 Lancer le scan IA"}
            </button>
          )}
        </Modal>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function Modal({title,children,onClose}:any){
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",
      display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,backdropFilter:"blur(6px)"}}>
      <div style={{background:"var(--surface)",border:"1px solid var(--border2)",
        borderRadius:16,padding:28,width:"100%",maxWidth:500,
        boxShadow:"var(--shadow-lg)",animation:"scaleIn .25s cubic-bezier(0.16,1,0.3,1) both"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
          <div style={{fontFamily:"var(--font-head)",fontSize:16,fontWeight:700}}>{title}</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"var(--muted)",cursor:"pointer",fontSize:20}}>✕</button>
        </div>
        {children}
      </div>
      <style>{`@keyframes scaleIn{from{opacity:0;transform:scale(0.95)}to{opacity:1;transform:scale(1)}}`}</style>
    </div>
  );
}
function FG({label,children}:any){
  return(
    <div style={{marginBottom:14}}>
      <label style={{display:"block",fontSize:11,fontWeight:700,textTransform:"uppercase",
        letterSpacing:".7px",color:"var(--muted)",marginBottom:7}}>{label}</label>
      {children}
    </div>
  );
}
function MsgDiv({msg}:{msg:string}){
  const ok=msg.startsWith("✅");
  return(
    <div style={{padding:"9px 14px",borderRadius:9,fontSize:12,marginBottom:14,
      background:ok?"var(--green-bg)":"rgba(239,68,68,0.1)",
      color:ok?"var(--green)":"var(--danger)",
      border:`1px solid ${ok?"rgba(16,185,129,0.25)":"rgba(239,68,68,0.25)"}`}}>{msg}</div>
  );
}
const inpSt:React.CSSProperties={width:"100%",background:"var(--surface2)",border:"1px solid var(--border2)",
  borderRadius:9,padding:"10px 14px",color:"var(--text)",fontSize:13,outline:"none",fontFamily:"var(--font-body)"};
const submitBtn:React.CSSProperties={width:"100%",background:"linear-gradient(135deg,#2563eb,#1d4ed8)",
  border:"none",borderRadius:11,padding:13,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",
  boxShadow:"0 4px 16px rgba(37,99,235,0.35)",fontFamily:"var(--font-body)",marginTop:4};
