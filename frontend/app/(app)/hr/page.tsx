"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/lib/useTheme";

type User = { id:number; nom_prenom:string; matricule:string; unite:string; role:string; };
type HistoryItem = { id:number; type_doc:string; created_at:string; agent:string; matricule:string; metadata:Record<string,string>; };

const TIME_OPTIONS = Array.from({ length:49 }, (_,i) => {
  const t = 8*60 + i*15;
  return `${Math.floor(t/60).toString().padStart(2,"0")}:${(t%60).toString().padStart(2,"0")}`;
});

function today() { return new Date().toISOString().split("T")[0]; }

const DOC_TYPES: Record<string,{ label:string; icon:string; color:string }> = {
  PE:           { label:"Permission Exceptionnelle", icon:"🟢", color:"#10b981" },
  SORTIE:       { label:"Autorisation de Sortie",    icon:"🚪", color:"#2563eb" },
  REPRISE:      { label:"Reprise de Service",        icon:"🔁", color:"#8b5cf6" },
  MALADIE:      { label:"Maladie",                   icon:"🏥", color:"#f59e0b" },
  FIN_MANQUANT: { label:"Fin Manquant",              icon:"⚠️", color:"#ef4444" },
  RC:           { label:"Repos Compensateur",        icon:"⏱️", color:"#38bdf8" },
};

const PE_TYPES: Record<string,string> = {
  Heures:  "Heures",
  Demi1:   "1ère demi-journée (8h00–12h15)",
  Demi2:   "2ème demi-journée (12h00–16h30)",
  "1Jour": "1 jour complet",
  "2Jours":"2 jours",
};

const API = "http://10.23.23.144:8000";

// =============================================================================
export default function HRPage() {
  const router = useRouter();
  const { isDark } = useTheme();
  const [user,    setUser]    = useState<User|null>(null);
  const [token,   setToken]   = useState("");
  const [active,  setActive]  = useState("PE");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [regenId, setRegenId] = useState<number|null>(null);
  const [success, setSuccess] = useState("");
  const [error,   setError]   = useState("");

  // ── Date de création — MANUEL pour tous les formulaires ──
  const [dateCreation, setDateCreation] = useState(today());

  // ── PE ──
  const [peType,  setPeType]  = useState("Heures");
  const [peDate1, setPeDate1] = useState(today());
  const [peDate2, setPeDate2] = useState(today());
  const [peDeb,   setPeDeb]   = useState("10:00");
  const [peFin,   setPeFin]   = useState("12:00");

  // ── Sortie ──
  const [sortieJour,  setSortieJour]  = useState(today());
  const [sortieH1,    setSortieH1]    = useState("08:00");
  const [sortieH2,    setSortieH2]    = useState("17:00");
  const [sortieMotif, setSortieMotif] = useState("");

  // ── Reprise ──
  const [repriseDate,   setRepriseDate]   = useState(today());
  const [repriseMedcin, setRepriseMedcin] = useState("");

  // ── Maladie ──
  const [maladieDate,    setMaladieDate]    = useState(today());
  const [maladieReprise, setMaladieReprise] = useState(today());
  const [maladieService, setMaladieService] = useState("");
  const [maladieMedcin,  setMaladieMedcin]  = useState("");

  // ── Fin Manquant ──
  const [finDate,  setFinDate]  = useState(today());
  const [finHeure, setFinHeure] = useState("08:00");

  // ── RC ──
  const [rcService, setRcService] = useState("");
  const [rcJours,   setRcJours]   = useState("1");
  const [rcDepart,  setRcDepart]  = useState(today());
  const [rcFin,     setRcFin]     = useState(today());

  useEffect(() => {
    const stored = localStorage.getItem("user");
    const tok    = localStorage.getItem("token");
    if (!stored || !tok) { router.push("/"); return; }
    const u = JSON.parse(stored);
    setUser(u); setToken(tok);
    setMaladieService(u.unite||"");
    setRcService(u.unite||"");
    fetchHistory(tok);
  }, [router]);

  // Reset date de création when switching tabs
  useEffect(() => {
    setDateCreation(today());
    setError(""); setSuccess("");
  }, [active]);

  async function fetchHistory(tok: string) {
    try {
      const res = await fetch(`${API}/hr/history`, { headers:{ Authorization:`Bearer ${tok}` } });
      if (res.ok) setHistory(await res.json());
    } catch { /* silent */ }
  }

  async function handleGenerate(endpoint: string, body: object, prefix: string) {
    setError(""); setSuccess(""); setLoading(true);
    try {
      // Inject date_creation into every document
      const payload = { ...body, date_creation: dateCreation };
      const res = await fetch(`${API}/hr/${endpoint}/generate`, {
        method:"POST",
        headers:{ "Content-Type":"application/json", Authorization:`Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const d=await res.json(); setError(d.detail||"Erreur"); setLoading(false); return; }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href=url; a.download=`${prefix}_${Date.now()}.pdf`; a.click();
      URL.revokeObjectURL(url);
      setSuccess(`✅ ${prefix} générée et téléchargée !`);
      fetchHistory(token);
    } catch { setError("Impossible de contacter le serveur"); }
    finally { setLoading(false); }
  }

  async function handleRegenerate(item: HistoryItem) {
    const ep = item.type_doc.toLowerCase().replace("_","-");
    setRegenId(item.id); setError(""); setSuccess("");
    try {
      const res = await fetch(`${API}/hr/${ep}/regenerate/${item.id}`, {
        method:"POST", headers:{ Authorization:`Bearer ${token}` },
      });
      if (!res.ok) { const d=await res.json(); setError(d.detail||"Erreur"); return; }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href=url; a.download=`${item.type_doc}_REGEN_${Date.now()}.pdf`; a.click();
      URL.revokeObjectURL(url);
      setSuccess("✅ Document régénéré !");
    } catch { setError("Impossible de contacter le serveur"); }
    finally { setRegenId(null); }
  }

  if (!user) return null;

  const filteredHistory = history.filter(h => h.type_doc === active);
  const activeConfig    = DOC_TYPES[active];

  return (
    <div style={{ minHeight:"100vh", background:"var(--bg)", padding:"24px 28px" }}>

      {/* ── Header ── */}
      <div style={{ marginBottom:24 }}>
        <button onClick={()=>router.push("/dashboard")} style={{
          background:"none", border:"none", color:"var(--muted)",
          cursor:"pointer", fontSize:12, marginBottom:12,
          display:"flex", alignItems:"center", gap:6,
          transition:"color 0.15s", fontFamily:"var(--font-body)",
        }}
        onMouseEnter={e=>e.currentTarget.style.color="var(--text)"}
        onMouseLeave={e=>e.currentTarget.style.color="var(--muted)"}>
          ← Retour au dashboard
        </button>
        <h1 style={{ fontFamily:"var(--font-head)", fontSize:24, fontWeight:800, marginBottom:5 }}>
          🗂️ Applications RH
        </h1>
        <p style={{ color:"var(--muted)", fontSize:13 }}>
          Génération de documents · PDF téléchargé instantanément · aucun fichier stocké
        </p>
      </div>

      {/* ── Tab bar ── */}
      <div style={{ display:"flex", gap:6, marginBottom:24, flexWrap:"wrap" }}>
        {Object.entries(DOC_TYPES).map(([key,cfg])=>(
          <button key={key} onClick={()=>{ setActive(key); }}
            style={{
              padding:"9px 16px", borderRadius:10,
              border:`1px solid ${active===key ? cfg.color+"66" : "var(--border2)"}`,
              background: active===key ? `${cfg.color}12` : "var(--surface)",
              color: active===key ? cfg.color : "var(--muted)",
              fontSize:13, fontWeight:600, cursor:"pointer",
              display:"flex", alignItems:"center", gap:7,
              transition:"all 0.18s", fontFamily:"var(--font-body)",
              boxShadow: active===key ? `0 0 0 3px ${cfg.color}18` : "none",
            }}>
            {cfg.icon} {cfg.label}
          </button>
        ))}
      </div>

      {/* ── Main grid ── */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, maxWidth:1100 }}>

        {/* ════ LEFT: Form ════ */}
        <div style={{
          background:"var(--surface)", border:"1px solid var(--border)",
          borderRadius:16, padding:24,
          borderTop:`2px solid ${activeConfig.color}`,
        }}>
          {/* Form title */}
          <div style={{
            display:"flex", alignItems:"center", gap:10, marginBottom:20,
            fontFamily:"var(--font-head)", fontSize:15, fontWeight:700,
          }}>
            <div style={{
              width:36, height:36, borderRadius:10, flexShrink:0,
              background:`${activeConfig.color}18`, border:`1px solid ${activeConfig.color}33`,
              display:"flex", alignItems:"center", justifyContent:"center", fontSize:18,
            }}>{activeConfig.icon}</div>
            {activeConfig.label}
          </div>

          {/* Agent info box */}
          <div style={{
            background:"var(--surface2)", border:"1px solid var(--border)",
            borderRadius:10, padding:"12px 16px", marginBottom:20,
          }}>
            <div style={{ fontSize:11, fontWeight:700, textTransform:"uppercase",
              letterSpacing:"0.7px", color:"var(--muted)", marginBottom:10 }}>
              Informations agent
            </div>
            {[
              { label:"Nom & Prénom", value:user.nom_prenom },
              { label:"Matricule",    value:user.matricule },
              { label:"Unité",        value:user.unite },
            ].map((row,i)=>(
              <div key={i} style={{
                display:"flex", justifyContent:"space-between", alignItems:"center",
                padding:"6px 0",
                borderBottom: i<2 ? "1px solid var(--border)" : "none",
                fontSize:12,
              }}>
                <span style={{ color:"var(--muted)" }}>{row.label}</span>
                <strong style={{ color:"var(--text)" }}>{row.value}</strong>
              </div>
            ))}
          </div>

          {/* ══ DATE DE CRÉATION — champ manuel sur TOUS les formulaires ══ */}
          <div style={{
            background:`${activeConfig.color}08`,
            border:`1px solid ${activeConfig.color}33`,
            borderRadius:12, padding:"14px 16px", marginBottom:22,
          }}>
            <div style={{ fontSize:11, fontWeight:700, textTransform:"uppercase",
              letterSpacing:"0.7px", color:activeConfig.color, marginBottom:10,
              display:"flex", alignItems:"center", gap:6,
            }}>
              📅 Date de création du document
            </div>
            <input
              type="date"
              value={dateCreation}
              onChange={e=>setDateCreation(e.target.value)}
              style={{
                width:"100%", background:"var(--surface)",
                border:`1.5px solid ${activeConfig.color}55`,
                borderRadius:9, padding:"10px 14px",
                color:"var(--text)", fontSize:14, fontWeight:600,
                outline:"none", cursor:"pointer",
                fontFamily:"var(--font-body)",
                transition:"border-color 0.15s, box-shadow 0.15s",
              }}
              onFocus={e=>{ e.target.style.borderColor=activeConfig.color; e.target.style.boxShadow=`0 0 0 3px ${activeConfig.color}18`; }}
              onBlur={e=>{ e.target.style.borderColor=`${activeConfig.color}55`; e.target.style.boxShadow="none"; }}
            />
            <div style={{ fontSize:10, color:"var(--muted)", marginTop:6 }}>
              Cette date apparaîtra dans le document PDF généré
            </div>
          </div>

          {/* ════ PE Form ════ */}
          {active==="PE" && (
            <>
              <FieldGroup label="Type de permission">
                <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
                  {Object.entries(PE_TYPES).map(([val,label])=>(
                    <div key={val} onClick={()=>setPeType(val)}
                      style={{
                        display:"flex", alignItems:"center", gap:10,
                        padding:"10px 14px", borderRadius:10, cursor:"pointer",
                        background: peType===val ? "rgba(16,185,129,0.1)" : "var(--surface2)",
                        border:`1px solid ${peType===val ? "#10b981" : "var(--border2)"}`,
                        color: peType===val ? "#10b981" : "var(--text2)",
                        fontSize:13, transition:"all 0.15s",
                        boxShadow: peType===val ? "0 0 0 3px rgba(16,185,129,0.12)" : "none",
                      }}>
                      <div style={{
                        width:16, height:16, borderRadius:"50%", flexShrink:0,
                        border:`2px solid ${peType===val ? "#10b981" : "var(--muted)"}`,
                        background: peType===val ? "#10b981" : "transparent",
                        display:"flex", alignItems:"center", justifyContent:"center",
                        transition:"all 0.15s",
                      }}>
                        {peType===val && <div style={{ width:6,height:6,background:"#fff",borderRadius:"50%" }}/>}
                      </div>
                      {label}
                    </div>
                  ))}
                </div>
              </FieldGroup>

              <div style={{ marginBottom:16 }}>
                {peType !== "2Jours" ? (
                  <FieldGroup label="Date">
                    <DateInput value={peDate1} onChange={setPeDate1} color={activeConfig.color}/>
                  </FieldGroup>
                ) : (
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                    <FieldGroup label="Jour 1">
                      <DateInput value={peDate1} onChange={setPeDate1} color={activeConfig.color}/>
                    </FieldGroup>
                    <FieldGroup label="Jour 2">
                      <DateInput value={peDate2} onChange={setPeDate2} color={activeConfig.color}/>
                    </FieldGroup>
                  </div>
                )}
              </div>

              {peType==="Heures" && (
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}>
                  <FieldGroup label="Heure début">
                    <StyledSelect value={peDeb} onChange={setPeDeb}>
                      {TIME_OPTIONS.map(t=><option key={t}>{t}</option>)}
                    </StyledSelect>
                  </FieldGroup>
                  <FieldGroup label="Heure fin">
                    <StyledSelect value={peFin} onChange={setPeFin}>
                      {TIME_OPTIONS.filter(t=>t>peDeb).map(t=><option key={t}>{t}</option>)}
                    </StyledSelect>
                  </FieldGroup>
                </div>
              )}

              <MsgBlock error={error} success={success}/>
              <GenerateBtn loading={loading} onClick={()=>handleGenerate("pe",{
                type_perm:peType,date1:peDate1,
                date2:peType==="2Jours"?peDate2:null,
                heure_debut:peType==="Heures"?peDeb:null,
                heure_fin:peType==="Heures"?peFin:null,
              },"PE")}/>
            </>
          )}

          {/* ════ SORTIE Form ════ */}
          {active==="SORTIE" && (
            <>
              <FieldGroup label="Date de sortie">
                <DateInput value={sortieJour} onChange={setSortieJour} color={activeConfig.color}/>
              </FieldGroup>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}>
                <FieldGroup label="De">
                  <StyledSelect value={sortieH1} onChange={setSortieH1}>
                    {TIME_OPTIONS.map(t=><option key={t}>{t}</option>)}
                  </StyledSelect>
                </FieldGroup>
                <FieldGroup label="À">
                  <StyledSelect value={sortieH2} onChange={setSortieH2}>
                    {TIME_OPTIONS.filter(t=>t>sortieH1).map(t=><option key={t}>{t}</option>)}
                  </StyledSelect>
                </FieldGroup>
              </div>
              <FieldGroup label="Motif">
                <textarea value={sortieMotif} onChange={e=>setSortieMotif(e.target.value)}
                  placeholder="Ex: Dépôt dossier, déplacement, mission..."
                  style={{ ...inputSt, height:80, resize:"none" }}/>
              </FieldGroup>
              <MsgBlock error={error} success={success}/>
              <GenerateBtn loading={loading} onClick={()=>handleGenerate("sortie",{
                jour:sortieJour,heure1:sortieH1,heure2:sortieH2,motif:sortieMotif,
              },"SORTIE")}/>
            </>
          )}

          {/* ════ REPRISE Form ════ */}
          {active==="REPRISE" && (
            <>
              <FieldGroup label="Date de reprise">
                <DateInput value={repriseDate} onChange={setRepriseDate} color={activeConfig.color}/>
              </FieldGroup>
              <FieldGroup label="Nom et adresse du médecin traitant">
                <input type="text" value={repriseMedcin} onChange={e=>setRepriseMedcin(e.target.value)}
                  placeholder="Dr. ..." style={inputSt}/>
              </FieldGroup>
              <MsgBlock error={error} success={success}/>
              <GenerateBtn loading={loading} onClick={()=>handleGenerate("reprise",{
                date_reprise:repriseDate,adress_medcin:repriseMedcin,
              },"REPRISE")}/>
            </>
          )}

          {/* ════ MALADIE Form ════ */}
          {active==="MALADIE" && (
            <>
              <FieldGroup label="Service">
                <input type="text" value={maladieService} onChange={e=>setMaladieService(e.target.value)} style={inputSt}/>
              </FieldGroup>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}>
                <FieldGroup label="Date de cessation">
                  <DateInput value={maladieDate} onChange={setMaladieDate} color={activeConfig.color}/>
                </FieldGroup>
                <FieldGroup label="Date de reprise">
                  <DateInput value={maladieReprise} onChange={setMaladieReprise} color={activeConfig.color}/>
                </FieldGroup>
              </div>
              <FieldGroup label="Nom et adresse du médecin traitant">
                <input type="text" value={maladieMedcin} onChange={e=>setMaladieMedcin(e.target.value)}
                  placeholder="Dr. ..." style={inputSt}/>
              </FieldGroup>
              <MsgBlock error={error} success={success}/>
              <GenerateBtn loading={loading} onClick={()=>handleGenerate("maladie",{
                date_maladie:maladieDate,date_reprise:maladieReprise,
                service:maladieService,adress_medcin:maladieMedcin,
              },"MALADIE")}/>
            </>
          )}

          {/* ════ FIN MANQUANT Form ════ */}
          {active==="FIN_MANQUANT" && (
            <>
              <FieldGroup label="Date du mouvement manquant">
                <DateInput value={finDate} onChange={setFinDate} color={activeConfig.color}/>
              </FieldGroup>
              <FieldGroup label="Heure du mouvement manquant">
                <StyledSelect value={finHeure} onChange={setFinHeure}>
                  {TIME_OPTIONS.map(t=><option key={t}>{t}</option>)}
                </StyledSelect>
              </FieldGroup>
              <MsgBlock error={error} success={success}/>
              <GenerateBtn loading={loading} onClick={()=>handleGenerate("fin-manquant",{
                date_manquant:finDate,heure_manquant:finHeure,
              },"FIN_MANQUANT")}/>
            </>
          )}

          {/* ════ RC Form ════ */}
          {active==="RC" && (
            <>
              <FieldGroup label="Service">
                <input type="text" value={rcService} onChange={e=>setRcService(e.target.value)} style={inputSt}/>
              </FieldGroup>
              <FieldGroup label="Nombre de jours">
                <input type="number" min="1" max="30" value={rcJours}
                  onChange={e=>setRcJours(e.target.value)} style={inputSt}/>
              </FieldGroup>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}>
                <FieldGroup label="Date départ">
                  <DateInput value={rcDepart} onChange={setRcDepart} color={activeConfig.color}/>
                </FieldGroup>
                <FieldGroup label="Date fin">
                  <DateInput value={rcFin} onChange={setRcFin} color={activeConfig.color}/>
                </FieldGroup>
              </div>
              <MsgBlock error={error} success={success}/>
              <GenerateBtn loading={loading} onClick={()=>handleGenerate("rc",{
                service:rcService,nomber_jours:rcJours,date_depart:rcDepart,date_fin:rcFin,
              },"RC")}/>
            </>
          )}
        </div>

        {/* ════ RIGHT: History ════ */}
        <div style={{
          background:"var(--surface)", border:"1px solid var(--border)",
          borderRadius:16, padding:24,
        }}>
          <div style={{
            display:"flex", alignItems:"center", justifyContent:"space-between",
            marginBottom:18, fontFamily:"var(--font-head)", fontSize:15, fontWeight:700,
          }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              🕐 Historique
              <span style={{ fontSize:12, color:"var(--muted)", fontWeight:400 }}>
                — {activeConfig.label}
              </span>
            </div>
            <span style={{
              background:"var(--surface2)", border:"1px solid var(--border2)",
              borderRadius:99, padding:"3px 10px", fontSize:11, color:"var(--muted)",
            }}>
              {filteredHistory.length} doc(s)
            </span>
          </div>

          {filteredHistory.length === 0 ? (
            <div style={{
              display:"flex", flexDirection:"column", alignItems:"center",
              justifyContent:"center", height:200, gap:10,
            }}>
              <div style={{ fontSize:36, opacity:.15 }}>📋</div>
              <div style={{ color:"var(--muted)", fontSize:13, textAlign:"center" }}>
                Aucun document généré pour ce type
              </div>
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:8, maxHeight:560, overflowY:"auto" }}>
              {filteredHistory.map(item=>{
                const cfg = DOC_TYPES[item.type_doc] || { icon:"📄", color:"#6b7280", label:item.type_doc };
                return (
                  <div key={item.id} style={{
                    background:"var(--surface2)", border:"1px solid var(--border)",
                    borderLeft:`3px solid ${cfg.color}`,
                    borderRadius:10, padding:"12px 14px",
                    display:"flex", alignItems:"center", justifyContent:"space-between", gap:12,
                    transition:"border-color 0.15s",
                  }}
                  onMouseEnter={e=>(e.currentTarget as HTMLElement).style.borderColor=`${cfg.color}66`}
                  onMouseLeave={e=>(e.currentTarget as HTMLElement).style.borderColor="var(--border)"}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:600, marginBottom:4 }}>
                        {cfg.icon} {DOC_TYPES[item.type_doc]?.label || item.type_doc}
                      </div>
                      <div style={{ fontSize:11, color:"var(--muted)", lineHeight:1.5 }}>
                        🕐 {item.created_at}
                        {item.metadata?.date1         && ` · ${item.metadata.date1}`}
                        {item.metadata?.jour           && ` · ${item.metadata.jour}`}
                        {item.metadata?.date_maladie   && ` · ${item.metadata.date_maladie}`}
                        {item.metadata?.date_manquant  && ` · ${item.metadata.date_manquant}`}
                        {item.metadata?.date_depart    && ` · ${item.metadata.date_depart}`}
                        {item.metadata?.date_creation  && (
                          <span style={{ color:cfg.color }}> · créé le {item.metadata.date_creation}</span>
                        )}
                      </div>
                      {user.role==="admin" && (
                        <div style={{ fontSize:11, color:"var(--accent2)", marginTop:3 }}>
                          👤 {item.agent} ({item.matricule})
                        </div>
                      )}
                    </div>
                    <button onClick={()=>handleRegenerate(item)} disabled={regenId===item.id}
                      style={{
                        background:"rgba(37,99,235,0.1)", border:"1px solid rgba(37,99,235,0.3)",
                        borderRadius:8, padding:"6px 12px", color:"#60a5fa",
                        fontSize:12, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap",
                        transition:"all 0.15s", fontFamily:"var(--font-body)",
                        flexShrink:0,
                      }}
                      onMouseEnter={e=>{ (e.currentTarget as HTMLElement).style.background="rgba(37,99,235,0.2)"; }}
                      onMouseLeave={e=>{ (e.currentTarget as HTMLElement).style.background="rgba(37,99,235,0.1)"; }}>
                      {regenId===item.id ? "⏳" : "🔄 Régénérer"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// ── Sub-components ────────────────────────────────────────────────────────────
// =============================================================================

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom:16 }}>
      <label style={{
        display:"block", fontSize:11, fontWeight:700,
        textTransform:"uppercase", letterSpacing:"0.8px",
        color:"var(--muted)", marginBottom:8,
      }}>{label}</label>
      {children}
    </div>
  );
}

function DateInput({ value, onChange, color="#2563eb" }: { value:string; onChange:(v:string)=>void; color?:string }) {
  return (
    <input type="date" value={value} onChange={e=>onChange(e.target.value)}
      style={{
        width:"100%", background:"var(--surface2)",
        border:"1px solid var(--border2)",
        borderRadius:9, padding:"10px 14px",
        color:"var(--text)", fontSize:13, outline:"none",
        cursor:"pointer", fontFamily:"var(--font-body)",
        transition:"border-color 0.15s, box-shadow 0.15s",
      }}
      onFocus={e=>{ e.target.style.borderColor=color; e.target.style.boxShadow=`0 0 0 3px ${color}18`; }}
      onBlur={e=>{ e.target.style.borderColor="var(--border2)"; e.target.style.boxShadow="none"; }}
    />
  );
}

function StyledSelect({ value, onChange, children }: { value:string; onChange:(v:string)=>void; children:React.ReactNode }) {
  return (
    <select value={value} onChange={e=>onChange(e.target.value)} style={inputSt}>
      {children}
    </select>
  );
}

function MsgBlock({ error, success }: { error:string; success:string }) {
  if (error)   return (
    <div style={{ background:"var(--danger-bg)", border:"1px solid rgba(239,68,68,0.3)",
      borderRadius:10, padding:"10px 14px", fontSize:13, color:"var(--danger)",
      marginBottom:16, display:"flex", alignItems:"center", gap:8 }}>
      ❌ {error}
    </div>
  );
  if (success) return (
    <div style={{ background:"var(--green-bg)", border:"1px solid rgba(16,185,129,0.3)",
      borderRadius:10, padding:"10px 14px", fontSize:13, color:"var(--green)",
      marginBottom:16, display:"flex", alignItems:"center", gap:8 }}>
      {success}
    </div>
  );
  return null;
}

function GenerateBtn({ loading, onClick }: { loading:boolean; onClick:()=>void }) {
  return (
    <button disabled={loading} onClick={onClick} style={{
      width:"100%",
      background: loading ? "rgba(37,99,235,0.5)" : "linear-gradient(135deg,#2563eb,#1d4ed8)",
      border:"none", borderRadius:11, padding:"13px",
      color:"#fff", fontSize:14, fontWeight:700,
      cursor: loading ? "not-allowed" : "pointer",
      boxShadow: loading ? "none" : "0 4px 16px rgba(37,99,235,0.35)",
      transition:"all 0.2s", marginTop:8, fontFamily:"var(--font-body)",
      display:"flex", alignItems:"center", justifyContent:"center", gap:8,
    }}
    onMouseEnter={e=>{ if(!loading)(e.currentTarget as HTMLElement).style.transform="translateY(-1px)"; }}
    onMouseLeave={e=>{ (e.currentTarget as HTMLElement).style.transform="translateY(0)"; }}>
      {loading ? (
        <><span className="anim-spin" style={{ display:"inline-block" }}>⏳</span> Génération en cours...</>
      ) : (
        <>⚡ Générer & Télécharger PDF</>
      )}
    </button>
  );
}

const inputSt: React.CSSProperties = {
  width:"100%", background:"var(--surface2)", border:"1px solid var(--border2)",
  borderRadius:9, padding:"10px 14px", color:"var(--text)", fontSize:13,
  outline:"none", fontFamily:"var(--font-body)",
};