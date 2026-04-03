"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

const API = "http://10.23.23.144:8000";

const DOC_TYPES: Record<string, { label: string; icon: string; color: string }> = {
  carte_grise:      { label:"Carte Grise",       icon:"🪪", color:"#2563eb" },
  visite_technique: { label:"Visite Technique",  icon:"🔧", color:"#8b5cf6" },
  assurance:        { label:"Assurance",          icon:"🛡️", color:"#10b981" },
  vignette:         { label:"Vignette",           icon:"📋", color:"#f59e0b" },
  autre:            { label:"Autre Document",     icon:"📄", color:"#6b7280" },
};

const VISITE_STATUS: Record<string, { label: string; color: string; bg: string; border: string; icon: string }> = {
  expired: { label:"Expirée",        color:"#ef4444", bg:"rgba(239,68,68,0.12)",  border:"rgba(239,68,68,0.3)",  icon:"🔴" },
  warning: { label:"Dans 30 jours",  color:"#f59e0b", bg:"rgba(245,158,11,0.12)", border:"rgba(245,158,11,0.3)", icon:"🟡" },
  ok:      { label:"Valide",         color:"#10b981", bg:"rgba(16,185,129,0.12)", border:"rgba(16,185,129,0.3)", icon:"🟢" },
  unknown: { label:"Non renseignée", color:"#6b7280", bg:"rgba(107,114,128,0.1)", border:"rgba(107,114,128,0.2)",icon:"⚪" },
};

// =============================================================================
export default function VehiculesPage() {
  const router = useRouter();
  const [user,     setUser]     = useState<any>(null);
  const [token,    setToken]    = useState("");
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [stats,    setStats]    = useState<any>(null);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState("");

  // Expanded row for documents
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Admin modals
  const [showAdd,    setShowAdd]    = useState(false);
  const [showEdit,   setShowEdit]   = useState<any>(null);
  const [showDelete, setShowDelete] = useState<any>(null);
  const [showUpload, setShowUpload] = useState<any>(null); // { vehicule, type_doc }

  // Form state
  const [fNum,      setFNum]      = useState("");
  const [fMat,      setFMat]      = useState("");
  const [fModel,    setFModel]    = useState("");
  const [fService,  setFService]  = useState("");
  const [fDernier,  setFDernier]  = useState("");
  const [fProchain, setFProchain] = useState("");
  const [fLoading,  setFLoading]  = useState(false);
  const [fMsg,      setFMsg]      = useState("");

  // Upload state
  const [upFile,    setUpFile]    = useState<File | null>(null);
  const [upType,    setUpType]    = useState("carte_grise");
  const [upLoading, setUpLoading] = useState(false);
  const [upMsg,     setUpMsg]     = useState("");

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
      const [vr, sr] = await Promise.all([
        fetch(`${API}/vehicules/`,      { headers:{ Authorization:`Bearer ${token}` } }),
        fetch(`${API}/vehicules/stats`, { headers:{ Authorization:`Bearer ${token}` } }),
      ]);
      if (vr.ok) setVehicles(await vr.json());
      if (sr.ok) setStats(await sr.json());
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const isAdmin = user?.role === "admin";

  const filtered = vehicles.filter(v =>
    !search ||
    v.numero_vehicule.toLowerCase().includes(search.toLowerCase()) ||
    v.matricule.toLowerCase().includes(search.toLowerCase()) ||
    v.modele.toLowerCase().includes(search.toLowerCase()) ||
    v.service.toLowerCase().includes(search.toLowerCase())
  );

  // ── CRUD handlers ──────────────────────────────────────────────────────────
  function openAdd() {
    setFNum(""); setFMat(""); setFModel(""); setFService("");
    setFDernier(""); setFProchain(""); setFMsg(""); setShowAdd(true);
  }

  function openEdit(v: any) {
    setFNum(v.numero_vehicule); setFMat(v.matricule);
    setFModel(v.modele); setFService(v.service);
    // Convert DD/MM/YYYY to YYYY-MM-DD for input[type=date]
    const toInput = (s: string) => {
      if (!s) return "";
      const parts = s.split("/");
      if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
      return s;
    };
    setFDernier(toInput(v.derniere_visite));
    setFProchain(toInput(v.prochaine_visite));
    setFMsg(""); setShowEdit(v);
  }

  function toDisplayDate(val: string) {
    if (!val) return "";
    const parts = val.split("-");
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return val;
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault(); setFLoading(true); setFMsg("");
    try {
      const res = await fetch(`${API}/vehicules/`, {
        method:"POST",
        headers:{ "Content-Type":"application/json", Authorization:`Bearer ${token}` },
        body: JSON.stringify({
          numero_vehicule: fNum, matricule: fMat, modele: fModel, service: fService,
          derniere_visite: toDisplayDate(fDernier), prochaine_visite: toDisplayDate(fProchain),
        }),
      });
      const d = await res.json();
      if (res.ok) { setFMsg(d.message); setTimeout(()=>{ setShowAdd(false); fetchData(); },1200); }
      else { setFMsg(`❌ ${d.detail}`); }
    } catch { setFMsg("❌ Erreur serveur"); }
    finally { setFLoading(false); }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault(); setFLoading(true); setFMsg("");
    try {
      const res = await fetch(`${API}/vehicules/${showEdit.id}`, {
        method:"PUT",
        headers:{ "Content-Type":"application/json", Authorization:`Bearer ${token}` },
        body: JSON.stringify({
          numero_vehicule: fNum, matricule: fMat, modele: fModel, service: fService,
          derniere_visite: toDisplayDate(fDernier), prochaine_visite: toDisplayDate(fProchain),
        }),
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
      const res = await fetch(`${API}/vehicules/${showDelete.id}`, {
        method:"DELETE", headers:{ Authorization:`Bearer ${token}` },
      });
      const d = await res.json();
      if (res.ok) { setTimeout(()=>{ setShowDelete(null); fetchData(); },1000); }
      setFMsg(res.ok ? d.message : `❌ ${d.detail}`);
    } catch { setFMsg("❌ Erreur"); }
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault(); if(!upFile) return;
    setUpLoading(true); setUpMsg("");
    try {
      const fd = new FormData();
      fd.append("type_doc", upType);
      fd.append("file", upFile);
      const res = await fetch(`${API}/vehicules/${showUpload.id}/documents`, {
        method:"POST", headers:{ Authorization:`Bearer ${token}` }, body: fd,
      });
      const d = await res.json();
      if (res.ok) {
        setUpMsg(d.message); setUpFile(null);
        setTimeout(()=>{ fetchData(); },1000);
      } else { setUpMsg(`❌ ${d.detail}`); }
    } catch { setUpMsg("❌ Erreur upload"); }
    finally { setUpLoading(false); }
  }

  async function handleDeleteDoc(vehiculeId: number, docId: number) {
    if (!confirm("Supprimer ce document ?")) return;
    try {
      const res = await fetch(`${API}/vehicules/${vehiculeId}/documents/${docId}`, {
        method:"DELETE", headers:{ Authorization:`Bearer ${token}` },
      });
      if (res.ok) fetchData();
    } catch { /* silent */ }
  }

  async function handleDownload(v: any, doc: any) {
    try {
      const res = await fetch(`${API}/vehicules/${v.id}/documents/${doc.id}/download`, {
        headers:{ Authorization:`Bearer ${token}` },
      });
      if (!res.ok) { alert("Fichier introuvable"); return; }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url; a.download = doc.nom_fichier; a.click();
      URL.revokeObjectURL(url);
    } catch { alert("Erreur téléchargement"); }
  }

  if (!user) return null;

  return (
    <div style={{ minHeight:"100vh", background:"var(--bg)", padding:"24px 28px" }}>

      {/* ── Header ── */}
      <div style={{ marginBottom:24 }}>
        <h1 style={{ fontFamily:"var(--font-head)", fontSize:24, fontWeight:800, marginBottom:5 }}>
          🚗 Parc Véhicules
        </h1>
        <p style={{ color:"var(--muted)", fontSize:13 }}>
          Gestion du parc automobile · documents · visites techniques
        </p>
      </div>

      {/* ── Stats ── */}
      {stats && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:20 }}>
          {[
            { icon:"🚗", val:stats.total,   lbl:"Total véhicules",  color:"#2563eb" },
            { icon:"🟢", val:stats.ok,      lbl:"Visites valides",  color:"#10b981" },
            { icon:"🟡", val:stats.warning, lbl:"Visites < 30 jours",color:"#f59e0b" },
            { icon:"🔴", val:stats.expired, lbl:"Visites expirées", color:"#ef4444" },
          ].map((s,i)=>(
            <div key={i} style={{
              background:"var(--surface)", border:"1px solid var(--border)",
              borderTop:`2px solid ${s.color}`, borderRadius:12, padding:16,
              transition:"transform .2s, box-shadow .2s",
            }}
            onMouseEnter={e=>{ (e.currentTarget as HTMLElement).style.transform="translateY(-2px)"; (e.currentTarget as HTMLElement).style.boxShadow="var(--shadow-md)"; }}
            onMouseLeave={e=>{ (e.currentTarget as HTMLElement).style.transform="translateY(0)"; (e.currentTarget as HTMLElement).style.boxShadow="none"; }}>
              <div style={{ fontSize:18, marginBottom:8 }}>{s.icon}</div>
              <div style={{ fontSize:28, fontWeight:800, color:s.color, fontFamily:"var(--font-head)", lineHeight:1 }}>{s.val}</div>
              <div style={{ fontSize:11, color:"var(--muted)", marginTop:5 }}>{s.lbl}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Search + Add button ── */}
      <div style={{
        background:"var(--surface)", border:"1px solid var(--border)",
        borderRadius:12, padding:"10px 14px", marginBottom:14,
        display:"flex", gap:10, alignItems:"center",
      }}>
        <div style={{ position:"relative", flex:1 }}>
          <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:"var(--muted)", fontSize:14 }}>🔍</span>
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Rechercher par N°, matricule, modèle, service..."
            style={{
              width:"100%", background:"var(--surface2)", border:"1px solid var(--border2)",
              borderRadius:9, padding:"9px 12px 9px 38px",
              color:"var(--text)", fontSize:13, outline:"none", fontFamily:"var(--font-body)",
            }}
            onFocus={e=>{ e.target.style.borderColor="#2563eb"; e.target.style.boxShadow="0 0 0 3px rgba(37,99,235,0.12)"; }}
            onBlur={e=>{ e.target.style.borderColor="var(--border2)"; e.target.style.boxShadow="none"; }}
          />
        </div>
        <span style={{ fontSize:11, color:"var(--muted)", whiteSpace:"nowrap",
          background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:8, padding:"5px 10px" }}>
          {filtered.length} véhicule(s)
        </span>
        {isAdmin && (
          <button onClick={openAdd} style={{
            background:"linear-gradient(135deg,#2563eb,#1d4ed8)", border:"none",
            borderRadius:9, padding:"9px 16px", color:"#fff",
            fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"var(--font-body)",
            display:"flex", alignItems:"center", gap:6,
            boxShadow:"0 4px 14px rgba(37,99,235,0.3)",
          }}>
            ➕ Ajouter un véhicule
          </button>
        )}
      </div>

      {/* ── Table ── */}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>N° Véhicule</th>
              <th>Matricule</th>
              <th>Modèle</th>
              <th>Service</th>
              <th>Dernière visite</th>
              <th>Prochaine visite</th>
              <th>Documents</th>
              {isAdmin && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({length:5}).map((_,i)=>(
                <tr key={i}>
                  {Array.from({length:isAdmin?8:7}).map((_,j)=>(
                    <td key={j} style={{ padding:"12px 14px" }}>
                      <div className="skeleton" style={{ height:14, borderRadius:6, width:j===6?"40%":"70%" }}/>
                    </td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr><td colSpan={isAdmin?8:7} style={{ textAlign:"center", padding:48, color:"var(--muted)", fontSize:13 }}>
                <div style={{ fontSize:36, marginBottom:10, opacity:.2 }}>🚗</div>
                Aucun véhicule enregistré
              </td></tr>
            ) : filtered.map(v => {
              const st = VISITE_STATUS[v.visite_status] || VISITE_STATUS.unknown;
              const isExpanded = expandedId === v.id;
              return (
                <React.Fragment key={v.id}>
                  <tr style={{ cursor:"pointer" }}
                    onClick={() => setExpandedId(isExpanded ? null : v.id)}>
                    <td style={{ padding:"11px 14px" }}>
                      <span style={{ fontWeight:700, fontFamily:"var(--font-head)", color:"var(--accent2)" }}>
                        {v.numero_vehicule}
                      </span>
                    </td>
                    <td style={{ padding:"11px 14px" }}>
                      <span style={{
                        background:"rgba(37,99,235,0.1)", color:"#60a5fa",
                        padding:"3px 9px", borderRadius:99, fontSize:12, fontWeight:600,
                      }}>{v.matricule}</span>
                    </td>
                    <td style={{ padding:"11px 14px", fontSize:13, fontWeight:500 }}>{v.modele}</td>
                    <td style={{ padding:"11px 14px", fontSize:12, color:"var(--muted)" }}>{v.service || "—"}</td>
                    <td style={{ padding:"11px 14px", fontSize:12, color:"var(--muted)", whiteSpace:"nowrap" }}>
                      {v.derniere_visite || "—"}
                    </td>
                    <td style={{ padding:"11px 14px", whiteSpace:"nowrap" }}>
                      <span style={{
                        background:st.bg, color:st.color,
                        border:`1px solid ${st.border}`,
                        padding:"3px 10px", borderRadius:99, fontSize:11, fontWeight:600,
                        display:"inline-flex", alignItems:"center", gap:5,
                      }}>
                        {st.icon} {v.prochaine_visite || "—"}
                      </span>
                    </td>
                    <td style={{ padding:"11px 14px" }}>
                      <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                        {v.documents.length === 0 ? (
                          <span style={{ fontSize:11, color:"var(--muted)" }}>Aucun</span>
                        ) : v.documents.map((doc:any) => {
                          const dt = DOC_TYPES[doc.type_doc] || DOC_TYPES.autre;
                          return (
                            <span key={doc.id} style={{
                              background:`${dt.color}15`, color:dt.color,
                              border:`1px solid ${dt.color}33`,
                              padding:"2px 8px", borderRadius:99, fontSize:10, fontWeight:600,
                            }}>{dt.icon} {dt.label}</span>
                          );
                        })}
                        <span style={{
                          background:"var(--surface2)", color:"var(--muted)",
                          padding:"2px 8px", borderRadius:99, fontSize:10,
                        }}>{isExpanded ? "▲" : "▼"}</span>
                      </div>
                    </td>
                    {isAdmin && (
                      <td style={{ padding:"11px 14px" }}>
                        <div style={{ display:"flex", gap:5 }} onClick={e=>e.stopPropagation()}>
                          <button onClick={()=>openEdit(v)} style={actionBtnStyle("#2563eb")}>✏️</button>
                          <button onClick={()=>{ setShowUpload(v); setUpMsg(""); setUpFile(null); }} style={actionBtnStyle("#10b981")}>📎</button>
                          <button onClick={()=>{ setShowDelete(v); setFMsg(""); }} style={actionBtnStyle("#ef4444")}>🗑️</button>
                        </div>
                      </td>
                    )}
                  </tr>

                  {/* ── Expanded documents panel ── */}
                  {isExpanded && (
                    <tr>
                      <td colSpan={isAdmin?8:7} style={{ padding:0, background:"var(--surface2)" }}>
                        <div style={{
                          padding:"16px 24px",
                          borderTop:"1px solid var(--border)",
                          borderBottom:"1px solid var(--border)",
                        }}>
                          <div style={{
                            fontFamily:"var(--font-head)", fontSize:13, fontWeight:700,
                            marginBottom:12, color:"var(--text2)",
                          }}>
                            📎 Documents — {v.modele} ({v.matricule})
                          </div>

                          {/* All doc types */}
                          <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:10 }}>
                            {Object.entries(DOC_TYPES).map(([key, dt]) => {
                              const doc = v.documents.find((d:any) => d.type_doc === key);
                              return (
                                <div key={key} style={{
                                  background:"var(--surface)", border:`1px solid ${doc ? dt.color+"44" : "var(--border)"}`,
                                  borderRadius:10, padding:"12px 14px",
                                  display:"flex", flexDirection:"column", gap:8,
                                }}>
                                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                                    <span style={{ fontSize:16 }}>{dt.icon}</span>
                                    <span style={{ fontSize:11, fontWeight:600, color:"var(--text2)" }}>{dt.label}</span>
                                  </div>
                                  {doc ? (
                                    <div>
                                      <div style={{ fontSize:10, color:"var(--muted)", marginBottom:8, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                                        {doc.nom_fichier}
                                      </div>
                                      <div style={{ fontSize:10, color:"var(--muted)", marginBottom:8 }}>
                                        Ajouté le {doc.uploaded_at}
                                      </div>
                                      <div style={{ display:"flex", gap:5 }}>
                                        <button onClick={()=>handleDownload(v, doc)} style={{
                                          flex:1, background:`${dt.color}12`, border:`1px solid ${dt.color}33`,
                                          borderRadius:7, padding:"5px 8px", color:dt.color,
                                          fontSize:11, fontWeight:600, cursor:"pointer",
                                        }}>⬇️ Télécharger</button>
                                        {isAdmin && (
                                          <button onClick={()=>handleDeleteDoc(v.id, doc.id)} style={{
                                            background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.2)",
                                            borderRadius:7, padding:"5px 8px", color:"#f87171",
                                            fontSize:11, cursor:"pointer",
                                          }}>🗑️</button>
                                        )}
                                      </div>
                                    </div>
                                  ) : (
                                    <div style={{ fontSize:11, color:"var(--muted)", fontStyle:"italic" }}>
                                      Non fourni
                                      {isAdmin && (
                                        <button onClick={()=>{ setShowUpload(v); setUpType(key); setUpMsg(""); setUpFile(null); }} style={{
                                          display:"block", marginTop:6,
                                          background:"rgba(37,99,235,0.08)", border:"1px solid rgba(37,99,235,0.2)",
                                          borderRadius:7, padding:"4px 8px", color:"#60a5fa",
                                          fontSize:10, cursor:"pointer", width:"100%",
                                        }}>➕ Ajouter</button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ════ MODAL: Add/Edit ════ */}
      {(showAdd || showEdit) && (
        <Modal title={showAdd ? "➕ Ajouter un véhicule" : `✏️ Modifier — ${showEdit?.matricule}`}
          onClose={()=>{ setShowAdd(false); setShowEdit(null); }}>
          <form onSubmit={showAdd ? handleAdd : handleEdit}>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
              <FGroup label="N° Véhicule">
                <input value={fNum} onChange={e=>setFNum(e.target.value)} required style={inpSt} placeholder="Ex: V-001"/>
              </FGroup>
              <FGroup label="Matricule">
                <input value={fMat} onChange={e=>setFMat(e.target.value)} required style={inpSt} placeholder="Ex: 12345-A-1"/>
              </FGroup>
            </div>
            <FGroup label="Modèle">
              <input value={fModel} onChange={e=>setFModel(e.target.value)} required style={inpSt} placeholder="Ex: Dacia Logan"/>
            </FGroup>
            <FGroup label="Service / Unité">
              <input value={fService} onChange={e=>setFService(e.target.value)} style={inpSt} placeholder="Ex: DTC/TQ"/>
            </FGroup>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
              <FGroup label="Dernière visite technique">
                <input type="date" value={fDernier} onChange={e=>setFDernier(e.target.value)} style={inpSt}/>
              </FGroup>
              <FGroup label="Prochaine visite technique">
                <input type="date" value={fProchain} onChange={e=>setFProchain(e.target.value)} style={inpSt}/>
              </FGroup>
            </div>
            {fMsg && <MsgDiv msg={fMsg}/>}
            <button type="submit" disabled={fLoading} style={submitBtn}>
              {fLoading ? "⏳ Enregistrement..." : showAdd ? "✅ Ajouter" : "✅ Enregistrer"}
            </button>
          </form>
        </Modal>
      )}

      {/* ════ MODAL: Upload ════ */}
      {showUpload && (
        <Modal title={`📎 Ajouter un document — ${showUpload.matricule}`} onClose={()=>setShowUpload(null)}>
          <form onSubmit={handleUpload}>
            <FGroup label="Type de document">
              <select value={upType} onChange={e=>setUpType(e.target.value)} style={inpSt}>
                {Object.entries(DOC_TYPES).map(([k,v])=>(
                  <option key={k} value={k}>{v.icon} {v.label}</option>
                ))}
              </select>
            </FGroup>
            <FGroup label="Fichier (PDF, JPG, PNG)">
              <input type="file" accept=".pdf,.jpg,.jpeg,.png"
                onChange={e=>setUpFile(e.target.files?.[0]||null)}
                style={{ ...inpSt, padding:"8px 12px" }} required/>
            </FGroup>
            {upMsg && <MsgDiv msg={upMsg}/>}
            <button type="submit" disabled={upLoading || !upFile} style={submitBtn}>
              {upLoading ? "⏳ Upload..." : "📤 Uploader le document"}
            </button>
          </form>
        </Modal>
      )}

      {/* ════ MODAL: Delete ════ */}
      {showDelete && (
        <Modal title="🗑️ Confirmer la suppression" onClose={()=>setShowDelete(null)}>
          <div style={{ fontSize:13, marginBottom:20, lineHeight:1.7 }}>
            Voulez-vous supprimer le véhicule <strong>{showDelete.matricule}</strong> — {showDelete.modele} ?
            <div style={{ color:"var(--danger)", fontSize:12, marginTop:6 }}>
              ⚠️ Tous les documents associés seront aussi supprimés.
            </div>
          </div>
          {fMsg && <MsgDiv msg={fMsg}/>}
          <div style={{ display:"flex", gap:10 }}>
            <button onClick={()=>setShowDelete(null)} style={{
              flex:1, background:"var(--surface2)", border:"1px solid var(--border2)",
              borderRadius:10, padding:12, color:"var(--text)", fontSize:13, fontWeight:600, cursor:"pointer",
            }}>Annuler</button>
            <button onClick={handleDelete} style={{
              flex:1, background:"rgba(239,68,68,0.15)", border:"1px solid rgba(239,68,68,0.35)",
              borderRadius:10, padding:12, color:"#f87171", fontSize:13, fontWeight:600, cursor:"pointer",
            }}>🗑️ Supprimer</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Modal({ title, children, onClose }: any) {
  return (
    <div style={{
      position:"fixed", inset:0, background:"rgba(0,0,0,0.65)",
      display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000,
      backdropFilter:"blur(6px)", animation:"fadeIn .2s ease both",
    }}>
      <div style={{
        background:"var(--surface)", border:"1px solid var(--border2)",
        borderRadius:16, padding:28, width:"100%", maxWidth:500,
        boxShadow:"var(--shadow-lg)",
        animation:"scaleIn .25s cubic-bezier(0.16,1,0.3,1) both",
      }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
          <div style={{ fontFamily:"var(--font-head)", fontSize:16, fontWeight:700 }}>{title}</div>
          <button onClick={onClose} style={{
            background:"none", border:"none", color:"var(--muted)",
            cursor:"pointer", fontSize:20, lineHeight:1, transition:"color .15s",
          }}
          onMouseEnter={e=>e.currentTarget.style.color="var(--text)"}
          onMouseLeave={e=>e.currentTarget.style.color="var(--muted)"}>✕</button>
        </div>
        {children}
      </div>
      <style>{`
        @keyframes scaleIn { from{opacity:0;transform:scale(0.95)} to{opacity:1;transform:scale(1)} }
        @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
      `}</style>
    </div>
  );
}

function FGroup({ label, children }: any) {
  return (
    <div style={{ marginBottom:14 }}>
      <label style={{ display:"block", fontSize:11, fontWeight:700,
        textTransform:"uppercase", letterSpacing:".7px", color:"var(--muted)", marginBottom:7 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function MsgDiv({ msg }: { msg: string }) {
  const ok = msg.startsWith("✅");
  return (
    <div style={{
      padding:"9px 14px", borderRadius:9, fontSize:12, marginBottom:14,
      background: ok ? "var(--green-bg)" : "rgba(239,68,68,0.1)",
      color:      ok ? "var(--green)"    : "var(--danger)",
      border:`1px solid ${ok ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.25)"}`,
    }}>{msg}</div>
  );
}

function actionBtnStyle(color: string): React.CSSProperties {
  return {
    width:30, height:30, borderRadius:8,
    border:`1px solid ${color}33`, background:`${color}10`,
    display:"flex", alignItems:"center", justifyContent:"center",
    cursor:"pointer", fontSize:13, transition:"all .15s",
  };
}

const inpSt: React.CSSProperties = {
  width:"100%", background:"var(--surface2)", border:"1px solid var(--border2)",
  borderRadius:9, padding:"10px 14px", color:"var(--text)", fontSize:13,
  outline:"none", fontFamily:"var(--font-body)",
};

const submitBtn: React.CSSProperties = {
  width:"100%", background:"linear-gradient(135deg,#2563eb,#1d4ed8)", border:"none",
  borderRadius:11, padding:13, color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer",
  boxShadow:"0 4px 16px rgba(37,99,235,0.35)", fontFamily:"var(--font-body)", marginTop:4,
};