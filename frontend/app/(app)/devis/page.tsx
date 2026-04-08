"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const API          = "http://10.23.23.144:8000";
const SUPER_ADMIN  = "84488R";

const MONTHS_FR = ["","Janvier","Février","Mars","Avril","MAI","Juin","Juillet","Août",
                   "Septembre","Octobre","Novembre","Décembre"];

const MONTH_COLORS: Record<string,{bg:string;text:string}> = {
  janvier:{bg:"rgba(59,130,246,0.15)",text:"#60a5fa"},
  février:{bg:"rgba(139,92,246,0.15)",text:"#a78bfa"},
  mars:{bg:"rgba(16,185,129,0.15)",text:"#34d399"},
  avril:{bg:"rgba(245,158,11,0.15)",text:"#fbbf24"},
  mai:{bg:"rgba(236,72,153,0.15)",text:"#f472b6"},
  juin:{bg:"rgba(234,179,8,0.15)",text:"#facc15"},
  juillet:{bg:"rgba(249,115,22,0.15)",text:"#fb923c"},
  août:{bg:"rgba(239,68,68,0.15)",text:"#f87171"},
  septembre:{bg:"rgba(20,184,166,0.15)",text:"#2dd4bf"},
  octobre:{bg:"rgba(99,102,241,0.15)",text:"#818cf8"},
  novembre:{bg:"rgba(168,85,247,0.15)",text:"#c084fc"},
  décembre:{bg:"rgba(14,165,233,0.15)",text:"#38bdf8"},
};
function getMonthColor(mois:string){
  return MONTH_COLORS[(mois||"").toLowerCase().trim()]||{bg:"rgba(100,116,139,0.15)",text:"#94a3b8"};
}

const PIE_COLORS = ["#2563eb","#10b981","#f59e0b","#8b5cf6","#ef4444","#38bdf8","#f97316","#84cc16"];

// =============================================================================
export default function DevisPage() {
  const router = useRouter();
  const [user,    setUser]    = useState<any>(null);
  const [token,   setToken]   = useState("");
  const [items,   setItems]   = useState<any[]>([]);
  const [total,   setTotal]   = useState(0);
  const [pages,   setPages]   = useState(1);
  const [page,    setPage]    = useState(1);
  const [stats,   setStats]   = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [search,  setSearch]  = useState("");
  const [mois,    setMois]    = useState("");

  // PDF preview
  const [previewUrl,     setPreviewUrl]     = useState<string|null>(null);
  const [previewName,    setPreviewName]    = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);

  // Sync
  const [syncing,    setSyncing]    = useState(false);
  const [syncResult, setSyncResult] = useState("");

  // Modals (super admin only)
  const [showAdd,    setShowAdd]    = useState(false);
  const [showEdit,   setShowEdit]   = useState<any>(null);
  const [showDelete, setShowDelete] = useState<any>(null);
  const [fMsg,       setFMsg]       = useState("");
  const [fLoading,   setFLoading]   = useState(false);

  // Form fields
  const [fRef,   setFRef]   = useState("");
  const [fDest,  setFDest]  = useState("");
  const [fObjet, setFObjet] = useState("");
  const [fMont,  setFMont]  = useState("");
  const [fDate,  setFDate]  = useState("");
  const [fMois,  setFMois]  = useState("");

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
      const params = new URLSearchParams({ page:String(page), limit:"20",
        ...(search?{search}:{}), ...(mois?{mois}:{}) });
      const [dr, sr] = await Promise.all([
        fetch(`${API}/devis/?${params}`,  {headers:{Authorization:`Bearer ${token}`}}),
        fetch(`${API}/devis/stats`,        {headers:{Authorization:`Bearer ${token}`}}),
      ]);
      if (dr.ok) { const d=await dr.json(); setItems(d.items); setTotal(d.total); setPages(d.pages); }
      if (sr.ok) setStats(await sr.json());
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [token, page, search, mois]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function doSync() {
    setSyncing(true); setSyncResult("");
    try {
      const res = await fetch(`${API}/devis/sync`, {method:"POST", headers:{Authorization:`Bearer ${token}`}});
      const d = await res.json();
      if (res.ok) {
        setSyncResult(`✅ ${d.created} ajoutés, ${d.updated} mis à jour`);
        setTimeout(()=>setSyncResult(""), 5000);
        fetchData();
      } else { setSyncResult(`❌ ${d.detail}`); }
    } catch { setSyncResult("❌ Erreur serveur"); }
    finally { setSyncing(false); }
  }

  async function handlePreview(item:any) {
    if (!item.pdf_filename) { alert("Aucun PDF associé"); return; }
    setPreviewLoading(true); setPreviewName(item.pdf_filename); setPreviewUrl(null);
    try {
      const res = await fetch(`${API}/devis/pdf/${encodeURIComponent(item.pdf_filename)}`,
        {headers:{Authorization:`Bearer ${token}`}});
      if (!res.ok) { alert("PDF introuvable"); return; }
      setPreviewUrl(URL.createObjectURL(await res.blob()));
    } catch { alert("Erreur chargement PDF"); }
    finally { setPreviewLoading(false); }
  }

  async function handleDownload(item:any) {
    if (!item.pdf_filename) { alert("Aucun PDF associé"); return; }
    try {
      const res = await fetch(`${API}/devis/pdf/${encodeURIComponent(item.pdf_filename)}`,
        {headers:{Authorization:`Bearer ${token}`}});
      if (!res.ok) { alert("PDF introuvable"); return; }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a"); a.href=url; a.download=item.pdf_filename; a.click();
      URL.revokeObjectURL(url);
    } catch { alert("Erreur téléchargement"); }
  }

  function closePrev() { setPreviewUrl(null); setPreviewName(""); setPreviewLoading(false); }

  function openAdd() {
    setFRef(""); setFDest(""); setFObjet(""); setFMont(""); setFDate(""); setFMois(""); setFMsg(""); setShowAdd(true);
  }

  function openEdit(item:any) {
    setFRef(item.reference); setFDest(item.destinataire); setFObjet(item.objet);
    setFMont(item.montant_ttc); setFDate(item.date_devis); setFMois(item.mois);
    setFMsg(""); setShowEdit(item);
  }

  async function handleAdd(e:React.FormEvent) {
    e.preventDefault(); setFLoading(true); setFMsg("");
    try {
      const res = await fetch(`${API}/devis/`, {
        method:"POST", headers:{"Content-Type":"application/json", Authorization:`Bearer ${token}`},
        body: JSON.stringify({reference:fRef, destinataire:fDest, objet:fObjet, montant_ttc:fMont, date_devis:fDate, mois:fMois}),
      });
      const d = await res.json();
      if (res.ok) { setFMsg(d.message); setTimeout(()=>{ setShowAdd(false); fetchData(); },1200); }
      else { setFMsg(`❌ ${d.detail}`); }
    } catch { setFMsg("❌ Erreur serveur"); }
    finally { setFLoading(false); }
  }

  async function handleEdit(e:React.FormEvent) {
    e.preventDefault(); setFLoading(true); setFMsg("");
    try {
      const res = await fetch(`${API}/devis/${showEdit.id}`, {
        method:"PUT", headers:{"Content-Type":"application/json", Authorization:`Bearer ${token}`},
        body: JSON.stringify({reference:fRef, destinataire:fDest, objet:fObjet, montant_ttc:fMont, date_devis:fDate, mois:fMois}),
      });
      const d = await res.json();
      if (res.ok) { setFMsg(d.message); setTimeout(()=>{ setShowEdit(null); fetchData(); },1200); }
      else { setFMsg(`❌ ${d.detail}`); }
    } catch { setFMsg("❌ Erreur serveur"); }
    finally { setFLoading(false); }
  }

  async function handleDelete() {
    if (!showDelete) return;
    try {
      const res = await fetch(`${API}/devis/${showDelete.id}`,
        {method:"DELETE", headers:{Authorization:`Bearer ${token}`}});
      const d = await res.json();
      setFMsg(res.ok ? d.message : `❌ ${d.detail}`);
      if (res.ok) setTimeout(()=>{ setShowDelete(null); fetchData(); },1200);
    } catch { setFMsg("❌ Erreur"); }
  }

  if (!user) return null;

  const isSuperAdmin = user.matricule === SUPER_ADMIN;
  const hasPrev      = previewUrl || previewLoading;

  return (
    <div style={{ minHeight:"100vh", background:"var(--bg)", padding:"24px 28px" }}>

      {/* Header */}
      <div style={{ marginBottom:24 }}>
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
          <div>
            <h1 style={{ fontFamily:"var(--font-head)", fontSize:24, fontWeight:800, marginBottom:5 }}>
              📋 Registre des Devis
            </h1>
            <p style={{ color:"var(--muted)", fontSize:13 }}>
              Consultation · aperçu PDF · extraction OCR automatique
            </p>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            {syncResult && (
              <span style={{ fontSize:12, color:"var(--green)", background:"var(--green-bg)",
                border:"1px solid rgba(16,185,129,0.25)", borderRadius:8, padding:"6px 12px" }}>
                {syncResult}
              </span>
            )}
            {isSuperAdmin && <>
              <div style={{ fontSize:11, color:"var(--muted)", display:"flex", alignItems:"center", gap:5 }}>
                <div style={{ width:6, height:6, borderRadius:"50%", background:"var(--green)" }}/>
                Auto-sync 30s
              </div>
              <button onClick={doSync} disabled={syncing} style={{
                background:"var(--surface2)", border:"1px solid var(--border2)",
                borderRadius:9, padding:"8px 14px", color:"var(--text2)",
                fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"var(--font-body)",
              }}>
                {syncing ? "⏳ Sync..." : "🔄 Synchroniser Excel"}
              </button>
              <button onClick={openAdd} style={{
                background:"linear-gradient(135deg,#2563eb,#1d4ed8)", border:"none",
                borderRadius:9, padding:"8px 16px", color:"#fff",
                fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"var(--font-body)",
                boxShadow:"0 4px 14px rgba(37,99,235,0.3)",
              }}>➕ Ajouter</button>
            </>}
          </div>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:20 }}>
          {[
            {icon:"📋", val:stats.total,          lbl:"Total devis",        color:"#2563eb"},
            {icon:"💰", val:stats.total_montant||"0", lbl:"Montant total TTC (DH)", color:"#10b981", isText:true},
            {icon:"📅", val:stats.monthly?.length||0, lbl:"Mois actifs",      color:"#f59e0b"},
            {icon:"🏢", val:stats.top_dest?.[0]?.destinataire||"—", lbl:"Top destinataire", color:"#8b5cf6", isText:true},
          ].map((s,i)=>(
            <div key={i} style={{
              background:"var(--surface)", border:"1px solid var(--border)",
              borderTop:`2px solid ${s.color}`, borderRadius:12, padding:16,
              transition:"transform .2s, box-shadow .2s",
            }}
            onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.transform="translateY(-2px)";(e.currentTarget as HTMLElement).style.boxShadow="var(--shadow-md)";}}
            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.transform="translateY(0)";(e.currentTarget as HTMLElement).style.boxShadow="none";}}>
              <div style={{ fontSize:18, marginBottom:8 }}>{s.icon}</div>
              <div style={{ fontSize:(s as any).isText?13:26, fontWeight:800, color:s.color,
                lineHeight:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                fontFamily:"var(--font-head)" }}>{s.val}</div>
              <div style={{ fontSize:10, color:"var(--muted)", marginTop:5 }}>{s.lbl}</div>
            </div>
          ))}
        </div>
      )}

      {/* Main grid */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 300px", gap:18, alignItems:"start" }}>

        {/* LEFT: search + table */}
        <div>
          {/* Search bar */}
          <div style={{
            background:"var(--surface)", border:"1px solid var(--border)",
            borderRadius:12, padding:"10px 14px", marginBottom:12,
            display:"flex", gap:10, alignItems:"center",
          }}>
            <div style={{ position:"relative", flex:1 }}>
              <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:"var(--muted)", fontSize:14 }}>🔍</span>
              <input value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}
                placeholder="Référence, destinataire, objet..."
                style={{ width:"100%", background:"var(--surface2)", border:"1px solid var(--border2)",
                  borderRadius:9, padding:"9px 14px 9px 38px", color:"var(--text)", fontSize:13, outline:"none",
                  fontFamily:"var(--font-body)" }}
                onFocus={e=>{e.target.style.borderColor="#2563eb"; e.target.style.boxShadow="0 0 0 3px rgba(37,99,235,0.12)";}}
                onBlur={e=>{e.target.style.borderColor="var(--border2)"; e.target.style.boxShadow="none";}}/>
            </div>
            <select value={mois} onChange={e=>{setMois(e.target.value);setPage(1);}} style={{
              background:"var(--surface2)", border:"1px solid var(--border2)", borderRadius:9,
              padding:"9px 12px", color:"var(--text)", fontSize:12, outline:"none", cursor:"pointer",
              fontFamily:"var(--font-body)",
            }}>
              <option value="">Tous les mois</option>
              {MONTHS_FR.filter(Boolean).map(m=><option key={m}>{m}</option>)}
            </select>
            <div style={{ fontSize:11, color:"var(--muted)", whiteSpace:"nowrap",
              background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:8, padding:"5px 10px" }}>
              {loading ? "⏳" : `${total} devis`}
            </div>
          </div>

          {/* Table */}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>N°</th><th>Référence</th><th>Destinataire</th>
                  <th>Objet</th><th>Montant TTC</th><th>Mois</th><th>Date</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({length:8}).map((_,i)=>(
                    <tr key={i}>{Array.from({length:8}).map((_,j)=>(
                      <td key={j} style={{padding:"11px 14px"}}>
                        <div className="skeleton" style={{height:13,borderRadius:6,width:j===3?"90%":"65%"}}/>
                      </td>
                    ))}</tr>
                  ))
                ) : items.length === 0 ? (
                  <tr><td colSpan={8} style={{textAlign:"center",padding:48,color:"var(--muted)",fontSize:13}}>
                    <div style={{fontSize:36,marginBottom:10,opacity:.2}}>📋</div>
                    Aucun devis trouvé
                  </td></tr>
                ) : items.map((item,i)=>{
                  const mc = getMonthColor(item.mois);
                  return (
                    <tr key={item.id}>
                      <td style={tdS}><span style={{color:"var(--muted)",fontSize:11}}>{(page-1)*20+i+1}</span></td>
                      <td style={{...tdS,fontSize:11,maxWidth:160}}>
                        <span title={item.reference} style={{
                          display:"block", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                          color:"var(--accent2)", fontWeight:600,
                        }}>{item.reference||"—"}</span>
                      </td>
                      <td style={tdS}><strong style={{fontSize:12}}>{item.destinataire||"—"}</strong></td>
                      <td style={{...tdS,maxWidth:200}}>
                        <span title={item.objet} style={{
                          display:"block", overflow:"hidden", textOverflow:"ellipsis",
                          whiteSpace:"nowrap", fontSize:12, color:"var(--text2)",
                        }}>{item.objet||"—"}</span>
                      </td>
                      <td style={tdS}>
                        {item.montant_ttc ? (
                          <span style={{
                            background:"rgba(16,185,129,0.1)", color:"var(--green)",
                            border:"1px solid rgba(16,185,129,0.25)",
                            padding:"3px 9px", borderRadius:99, fontSize:11, fontWeight:700,
                            whiteSpace:"nowrap",
                          }}>{item.montant_ttc} DH</span>
                        ) : <span style={{color:"var(--muted)",fontSize:11}}>—</span>}
                      </td>
                      <td style={tdS}>
                        <span style={{
                          background:mc.bg, color:mc.text,
                          border:`1px solid ${mc.text}33`,
                          padding:"3px 9px", borderRadius:99, fontSize:10, fontWeight:600,
                        }}>{item.mois||"—"}</span>
                      </td>
                      <td style={{...tdS,fontSize:11,color:"var(--muted)",whiteSpace:"nowrap"}}>
                        {item.date_devis||"—"}
                      </td>
                      <td style={tdS}>
                        <div style={{display:"flex",gap:5}}>
                          {/* Preview */}
                          <button onClick={()=>handlePreview(item)} disabled={!item.has_pdf}
                            title={item.has_pdf?"Aperçu PDF":"Pas de PDF"}
                            style={{
                              width:28,height:28,borderRadius:7,border:"1px solid",
                              borderColor:item.has_pdf?"rgba(37,99,235,0.35)":"var(--border)",
                              background:item.has_pdf?"rgba(37,99,235,0.1)":"var(--surface2)",
                              color:item.has_pdf?"#60a5fa":"var(--muted2)",
                              cursor:item.has_pdf?"pointer":"not-allowed",
                              display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,
                            }}>👁️</button>
                          {/* Download */}
                          <button onClick={()=>handleDownload(item)} disabled={!item.has_pdf}
                            title={item.has_pdf?"Télécharger":"Pas de PDF"}
                            style={{
                              width:28,height:28,borderRadius:7,border:"1px solid",
                              borderColor:item.has_pdf?"rgba(16,185,129,0.35)":"var(--border)",
                              background:item.has_pdf?"rgba(16,185,129,0.1)":"var(--surface2)",
                              color:item.has_pdf?"#34d399":"var(--muted2)",
                              cursor:item.has_pdf?"pointer":"not-allowed",
                              display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,
                            }}>⬇️</button>
                          {/* Edit + Delete (super admin only) */}
                          {isSuperAdmin && <>
                            <button onClick={()=>openEdit(item)} style={{
                              width:28,height:28,borderRadius:7,border:"1px solid rgba(245,158,11,0.35)",
                              background:"rgba(245,158,11,0.1)",color:"#fbbf24",cursor:"pointer",
                              display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,
                            }}>✏️</button>
                            <button onClick={()=>{setShowDelete(item);setFMsg("");}} style={{
                              width:28,height:28,borderRadius:7,border:"1px solid rgba(239,68,68,0.3)",
                              background:"rgba(239,68,68,0.08)",color:"#f87171",cursor:"pointer",
                              display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,
                            }}>🗑️</button>
                          </>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {pages > 1 && (
              <div style={{display:"flex",justifyContent:"center",gap:5,padding:12,borderTop:"1px solid var(--border)"}}>
                <button className={`pag-btn ${page<=1?"disabled":""}`} disabled={page<=1} onClick={()=>setPage(p=>p-1)}>←</button>
                {Array.from({length:Math.min(pages,7)},(_,i)=>i+Math.max(1,page-3)).filter(p=>p<=pages).map(p=>(
                  <button key={p} className={`pag-btn ${p===page?"active":""}`} onClick={()=>setPage(p)}>{p}</button>
                ))}
                <button className={`pag-btn ${page>=pages?"disabled":""}`} disabled={page>=pages} onClick={()=>setPage(p=>p+1)}>→</button>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: preview + charts */}
        <div style={{display:"flex",flexDirection:"column",gap:14}}>

          {/* PDF Preview */}
          <div style={{
            background:"var(--surface)",
            border:`1px solid ${hasPrev?"rgba(37,99,235,0.4)":"var(--border)"}`,
            borderRadius:14,overflow:"hidden",
            boxShadow:hasPrev?"0 0 0 3px rgba(37,99,235,0.1)":"none",
            transition:"all .3s",
          }}>
            <div style={{
              padding:"11px 14px",borderBottom:"1px solid var(--border)",
              display:"flex",alignItems:"center",justifyContent:"space-between",
              background:hasPrev?"linear-gradient(90deg,rgba(37,99,235,0.08),transparent)":"transparent",
            }}>
              <div>
                <div style={{fontSize:12,fontWeight:700,color:hasPrev?"#60a5fa":"var(--text2)"}}>👁️ Aperçu PDF</div>
                <div style={{fontSize:10,color:"var(--muted)",marginTop:2}}>
                  {hasPrev?previewName:"Cliquez 👁️ sur une ligne"}
                </div>
              </div>
              {hasPrev && <button onClick={closePrev} style={{background:"none",border:"none",color:"var(--muted)",cursor:"pointer",fontSize:18}}>✕</button>}
            </div>
            {!hasPrev && (
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:240,gap:10}}>
                <div style={{fontSize:32,opacity:.12}}>📋</div>
                <div style={{fontSize:12,color:"var(--muted)",textAlign:"center",maxWidth:160,lineHeight:1.6}}>
                  Sélectionnez un devis et cliquez 👁️
                </div>
              </div>
            )}
            {previewLoading && !previewUrl && (
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:240,gap:10}}>
                <span style={{fontSize:12,color:"var(--muted)"}}>⏳ Chargement...</span>
              </div>
            )}
            {previewUrl && (
              <iframe src={previewUrl} style={{width:"100%",height:340,border:"none",display:"block"}} title="PDF"/>
            )}
          </div>

          {/* Top destinataires */}
          {stats?.top_dest?.length > 0 && (
            <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:14,padding:16}}>
              <div style={{fontFamily:"var(--font-head)",fontSize:13,fontWeight:700,marginBottom:12}}>🏢 Top destinataires</div>
              <div style={{display:"flex",flexDirection:"column",gap:7}}>
                {stats.top_dest.map((d:any,i:number)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:8,fontSize:11}}>
                    <div style={{width:8,height:8,borderRadius:"50%",background:PIE_COLORS[i%PIE_COLORS.length],flexShrink:0}}/>
                    <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:"var(--text2)"}}>{d.destinataire}</span>
                    <span style={{fontWeight:700,color:"var(--muted)",flexShrink:0}}>{d.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Monthly chart */}
          {stats?.monthly?.length > 0 && (
            <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:14,padding:16}}>
              <div style={{fontFamily:"var(--font-head)",fontSize:13,fontWeight:700,marginBottom:12}}>📅 Par mois</div>
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={stats.monthly}>
                  <XAxis dataKey="mois" tick={{fill:"#5a6a82",fontSize:9}} axisLine={false} tickLine={false}
                    tickFormatter={m=>m.slice(0,3)}/>
                  <YAxis tick={{fill:"#5a6a82",fontSize:9}} axisLine={false} tickLine={false}/>
                  <Tooltip contentStyle={{background:"#0d1420",border:"1px solid rgba(255,255,255,0.06)",borderRadius:8,fontSize:11}}
                    cursor={{fill:"rgba(255,255,255,0.03)"}}/>
                  <Bar dataKey="count" fill="#2563eb" radius={[4,4,0,0]} name="Devis"/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Info super admin */}
          {isSuperAdmin && (
            <div style={{
              background:"rgba(245,158,11,0.06)",border:"1px solid rgba(245,158,11,0.2)",
              borderRadius:12,padding:14,fontSize:11,color:"var(--gold)",lineHeight:1.7,
            }}>
              <div style={{fontWeight:700,marginBottom:5}}>⚡ Super Admin</div>
              Vous pouvez ajouter, modifier et supprimer des devis.<br/>
              Les autres admins ont accès en lecture seule.
            </div>
          )}
        </div>
      </div>

      {/* ════ MODAL: Add/Edit ════ */}
      {(showAdd || showEdit) && (
        <Modal title={showAdd?"➕ Ajouter un devis":`✏️ Modifier — ${showEdit?.reference}`}
          onClose={()=>{setShowAdd(false);setShowEdit(null);}}>
          <form onSubmit={showAdd?handleAdd:handleEdit}>
            <FG label="Référence N°">
              <input value={fRef} onChange={e=>setFRef(e.target.value)} required style={inpSt}
                placeholder="Ex: 3/DI/CTR/DTC/TQ/SE/666/2024"/>
            </FG>
            <FG label="Destinataire">
              <input value={fDest} onChange={e=>setFDest(e.target.value)} required style={inpSt}
                placeholder="Ex: DCM/GC"/>
            </FG>
            <FG label="Objet">
              <textarea value={fObjet} onChange={e=>setFObjet(e.target.value)} rows={3} style={{...inpSt,resize:"none"}}
                placeholder="Objet du devis..."/>
            </FG>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <FG label="Montant TTC (DH)">
                <input value={fMont} onChange={e=>setFMont(e.target.value)} style={inpSt} placeholder="Ex: 1 590 915,17"/>
              </FG>
              <FG label="Date">
                <input value={fDate} onChange={e=>setFDate(e.target.value)} style={inpSt} placeholder="JJ/MM/AAAA"/>
              </FG>
            </div>
            <FG label="Mois">
              <select value={fMois} onChange={e=>setFMois(e.target.value)} style={inpSt}>
                <option value="">— Sélectionner —</option>
                {MONTHS_FR.filter(Boolean).map(m=><option key={m}>{m}</option>)}
              </select>
            </FG>
            {fMsg && <MsgDiv msg={fMsg}/>}
            <button type="submit" disabled={fLoading} style={submitBtn}>
              {fLoading?"⏳ Enregistrement...":showAdd?"✅ Ajouter":"✅ Enregistrer"}
            </button>
          </form>
        </Modal>
      )}

      {/* ════ MODAL: Delete ════ */}
      {showDelete && (
        <Modal title="🗑️ Supprimer ce devis ?" onClose={()=>setShowDelete(null)}>
          <div style={{fontSize:13,marginBottom:20,lineHeight:1.7}}>
            <strong>{showDelete.reference}</strong> — {showDelete.destinataire}<br/>
            <span style={{color:"var(--danger)",fontSize:12}}>⚠️ Cette action est irréversible.</span>
          </div>
          {fMsg && <MsgDiv msg={fMsg}/>}
          <div style={{display:"flex",gap:10}}>
            <button onClick={()=>setShowDelete(null)} style={{
              flex:1,background:"var(--surface2)",border:"1px solid var(--border2)",
              borderRadius:10,padding:12,color:"var(--text)",fontSize:13,fontWeight:600,cursor:"pointer",
            }}>Annuler</button>
            <button onClick={handleDelete} style={{
              flex:1,background:"rgba(239,68,68,0.15)",border:"1px solid rgba(239,68,68,0.35)",
              borderRadius:10,padding:12,color:"#f87171",fontSize:13,fontWeight:600,cursor:"pointer",
            }}>🗑️ Supprimer</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function Modal({title,children,onClose}:any) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",
      display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,
      backdropFilter:"blur(6px)"}}>
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
  return (
    <div style={{marginBottom:14}}>
      <label style={{display:"block",fontSize:11,fontWeight:700,textTransform:"uppercase",
        letterSpacing:".7px",color:"var(--muted)",marginBottom:7}}>{label}</label>
      {children}
    </div>
  );
}
function MsgDiv({msg}:{msg:string}){
  const ok=msg.startsWith("✅");
  return <div style={{padding:"9px 14px",borderRadius:9,fontSize:12,marginBottom:14,
    background:ok?"var(--green-bg)":"rgba(239,68,68,0.1)",
    color:ok?"var(--green)":"var(--danger)",
    border:`1px solid ${ok?"rgba(16,185,129,0.25)":"rgba(239,68,68,0.25)"}`}}>{msg}</div>;
}
const tdS:React.CSSProperties={padding:"10px 14px",verticalAlign:"middle"};
const inpSt:React.CSSProperties={width:"100%",background:"var(--surface2)",border:"1px solid var(--border2)",
  borderRadius:9,padding:"10px 14px",color:"var(--text)",fontSize:13,outline:"none",fontFamily:"var(--font-body)"};
const submitBtn:React.CSSProperties={width:"100%",background:"linear-gradient(135deg,#2563eb,#1d4ed8)",
  border:"none",borderRadius:11,padding:13,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",
  boxShadow:"0 4px 16px rgba(37,99,235,0.35)",fontFamily:"var(--font-body)",marginTop:4};
