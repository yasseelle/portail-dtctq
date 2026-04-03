"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

// ── Types ─────────────────────────────────────────────────────────────────────
type User = { id: number; nom_prenom: string; matricule: string; unite: string; role: string; };
type HistoryItem = { id: number; type_doc: string; created_at: string; agent: string; matricule: string; metadata: Record<string, string>; };

// ── Time options ──────────────────────────────────────────────────────────────
const TIME_OPTIONS = Array.from({ length: 49 }, (_, i) => {
  const total = 8 * 60 + i * 15;
  return `${Math.floor(total/60).toString().padStart(2,"0")}:${(total%60).toString().padStart(2,"0")}`;
});

function today() { return new Date().toISOString().split("T")[0]; }

// ── Doc type config ───────────────────────────────────────────────────────────
const DOC_TYPES: Record<string, { label: string; icon: string; color: string }> = {
  PE:           { label: "Permission Exceptionnelle", icon: "🟢", color: "#10b981" },
  SORTIE:       { label: "Autorisation de Sortie",    icon: "🚪", color: "#2563eb" },
  REPRISE:      { label: "Reprise de Service",         icon: "🔁", color: "#8b5cf6" },
  MALADIE:      { label: "Maladie",                   icon: "🏥", color: "#f59e0b" },
  FIN_MANQUANT: { label: "Fin Manquant",              icon: "⚠️", color: "#ef4444" },
  RC:           { label: "Repos Compensateur",        icon: "⏱️", color: "#38bdf8" },
};

const PE_TYPES: Record<string, string> = {
  Heures:  "Heures",
  Demi1:   "1ère demi-journée (8h00–12h15)",
  Demi2:   "2ème demi-journée (12h00–16h30)",
  "1Jour": "1 jour complet",
  "2Jours":"2 jours",
};

// =============================================================================
// MAIN PAGE
// =============================================================================
export default function HRPage() {
  const router  = useRouter();
  const [user, setUser]     = useState<User | null>(null);
  const [token, setToken]   = useState("");
  const [active, setActive] = useState("PE");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [regenId, setRegenId] = useState<number | null>(null);
  const [success, setSuccess] = useState("");
  const [error, setError]     = useState("");

  // ── PE state ──
  const [peType,    setPeType]    = useState("Heures");
  const [peDate1,   setPeDate1]   = useState(today());
  const [peDate2,   setPeDate2]   = useState(today());
  const [peDeb,     setPeDeb]     = useState("10:00");
  const [peFin,     setPeFin]     = useState("12:00");

  // ── Sortie state ──
  const [sortieJour,   setSortieJour]   = useState(today());
  const [sortieH1,     setSortieH1]     = useState("08:00");
  const [sortieH2,     setSortieH2]     = useState("17:00");
  const [sortieMotif,  setSortieMotif]  = useState("");

  // ── Reprise state ──
  const [repriseDate,   setRepriseDate]   = useState(today());
  const [repriseMedcin, setRepriseMedcin] = useState("");

  // ── Maladie state ──
  const [maladieDate,   setMaladieDate]   = useState(today());
  const [maladieReprise,setMaladieReprise]= useState(today());
  const [maladieService,setMaladieService]= useState("");
  const [maladieMedcin, setMaladieMedcin] = useState("");

  // ── Fin Manquant state ──
  const [finDate,  setFinDate]  = useState(today());
  const [finHeure, setFinHeure] = useState("08:00");

  // ── RC state ──
  const [rcService, setRcService] = useState("");
  const [rcJours,   setRcJours]   = useState("1");
  const [rcDepart,  setRcDepart]  = useState(today());
  const [rcFin,     setRcFin]     = useState(today());

  useEffect(() => {
    const stored = localStorage.getItem("user");
    const tok    = localStorage.getItem("token");
    if (!stored || !tok) { router.push("/"); return; }
    const u = JSON.parse(stored);
    setUser(u);
    setToken(tok);
    setMaladieService(u.unite || "");
    setRcService(u.unite || "");
    fetchHistory(tok);
  }, [router]);

  async function fetchHistory(tok: string) {
    try {
      const res = await fetch("http://localhost:8000/hr/history", {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (res.ok) setHistory(await res.json());
    } catch { /* silent */ }
  }

  async function handleGenerate(endpoint: string, body: object, prefix: string) {
    setError(""); setSuccess(""); setLoading(true);
    try {
      const res = await fetch(`http://localhost:8000/hr/${endpoint}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const d = await res.json(); setError(d.detail || "Erreur"); setLoading(false); return; }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url; a.download = `${prefix}_${Date.now()}.pdf`; a.click();
      URL.revokeObjectURL(url);
      setSuccess(`✅ ${prefix} générée et téléchargée ! Enregistrée dans l'historique.`);
      fetchHistory(token);
    } catch { setError("Impossible de contacter le serveur"); }
    finally { setLoading(false); }
  }

  async function handleRegenerate(item: HistoryItem) {
    const ep = item.type_doc.toLowerCase().replace("_", "-");
    setRegenId(item.id); setError(""); setSuccess("");
    try {
      const res = await fetch(`http://localhost:8000/hr/${ep}/regenerate/${item.id}`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { const d = await res.json(); setError(d.detail || "Erreur régénération"); return; }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url; a.download = `${item.type_doc}_REGEN_${Date.now()}.pdf`; a.click();
      URL.revokeObjectURL(url);
      setSuccess("✅ Document régénéré et téléchargé !");
    } catch { setError("Impossible de contacter le serveur"); }
    finally { setRegenId(null); }
  }

  if (!user) return null;

  // ── Filtered history ──
  const filteredHistory = active === "ALL"
    ? history
    : history.filter(h => h.type_doc === active);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", padding: 28 }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <button onClick={() => router.push("/dashboard")}
          style={{ background:"none",border:"none",color:"var(--muted)",cursor:"pointer",fontSize:13,marginBottom:10 }}>
          ← Retour au dashboard
        </button>
        <h1 style={{ fontFamily:"var(--font-head)",fontSize:26,fontWeight:800 }}>🗂️ Applications RH</h1>
        <p style={{ color:"var(--muted)",fontSize:13,marginTop:5 }}>
          Génération de documents · PDF téléchargé instantanément · aucun fichier stocké
        </p>
      </div>

      {/* Tab bar */}
      <div style={{ display:"flex",gap:8,marginBottom:24,flexWrap:"wrap" }}>
        {Object.entries(DOC_TYPES).map(([key,cfg]) => (
          <button key={key} onClick={() => { setActive(key); setError(""); setSuccess(""); }}
            style={{
              padding:"9px 16px", borderRadius:10, border:"1px solid",
              borderColor: active===key ? cfg.color : "var(--border)",
              background:  active===key ? `${cfg.color}18` : "var(--surface)",
              color:       active===key ? cfg.color : "var(--muted)",
              fontSize:13, fontWeight:600, cursor:"pointer", transition:"all .2s",
              display:"flex",alignItems:"center",gap:7,
            }}>
            {cfg.icon} {cfg.label}
          </button>
        ))}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:24, maxWidth:1100 }}>

        {/* ── LEFT: Form ── */}
        <div style={cardStyle}>
          <div style={titleStyle}>
            {DOC_TYPES[active]?.icon} {DOC_TYPES[active]?.label}
          </div>

          {/* Agent info */}
          <div style={infoBoxStyle}>
            <div style={{ display:"flex",justifyContent:"space-between",fontSize:13 }}>
              <span style={{ color:"var(--muted)" }}>Agent</span><strong>{user.nom_prenom}</strong>
            </div>
            <div style={{ display:"flex",justifyContent:"space-between",fontSize:13,marginTop:6 }}>
              <span style={{ color:"var(--muted)" }}>Matricule</span><strong>{user.matricule}</strong>
            </div>
            <div style={{ display:"flex",justifyContent:"space-between",fontSize:13,marginTop:6 }}>
              <span style={{ color:"var(--muted)" }}>Unité</span><strong>{user.unite}</strong>
            </div>
          </div>

          {/* ── PE Form ── */}
          {active === "PE" && (
            <>
              <div style={{ marginBottom:20 }}>
                <label style={labelStyle}>Type de permission</label>
                <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
                  {Object.entries(PE_TYPES).map(([val,label]) => (
                    <div key={val} onClick={() => setPeType(val)} style={radioStyle(peType===val)}>
                      <div style={radioDotStyle(peType===val)}>
                        {peType===val && <div style={{ width:6,height:6,background:"#fff",borderRadius:"50%" }}/>}
                      </div>
                      {label}
                    </div>
                  ))}
                </div>
              </div>
              {peType !== "2Jours" ? (
                <div style={{ marginBottom:16 }}>
                  <label style={labelStyle}>Date</label>
                  <input type="date" value={peDate1} onChange={e=>setPeDate1(e.target.value)} style={inputStyle}/>
                </div>
              ) : (
                <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16 }}>
                  <div><label style={labelStyle}>Jour 1</label>
                    <input type="date" value={peDate1} onChange={e=>setPeDate1(e.target.value)} style={inputStyle}/></div>
                  <div><label style={labelStyle}>Jour 2</label>
                    <input type="date" value={peDate2} onChange={e=>setPeDate2(e.target.value)} style={inputStyle}/></div>
                </div>
              )}
              {peType === "Heures" && (
                <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16 }}>
                  <div><label style={labelStyle}>Heure début</label>
                    <select value={peDeb} onChange={e=>setPeDeb(e.target.value)} style={inputStyle}>
                      {TIME_OPTIONS.map(t=><option key={t}>{t}</option>)}</select></div>
                  <div><label style={labelStyle}>Heure fin</label>
                    <select value={peFin} onChange={e=>setPeFin(e.target.value)} style={inputStyle}>
                      {TIME_OPTIONS.filter(t=>t>peDeb).map(t=><option key={t}>{t}</option>)}</select></div>
                </div>
              )}
              {msgBlock(error, success)}
              <button disabled={loading} style={btnStyle} onClick={() => handleGenerate("pe", {
                type_perm:peType,date1:peDate1,date2:peType==="2Jours"?peDate2:null,
                heure_debut:peType==="Heures"?peDeb:null,heure_fin:peType==="Heures"?peFin:null
              }, "PE")}>
                {loading ? "⏳ Génération..." : "⚡ Générer & Télécharger PDF"}
              </button>
            </>
          )}

          {/* ── SORTIE Form ── */}
          {active === "SORTIE" && (
            <>
              <div style={{ marginBottom:16 }}>
                <label style={labelStyle}>Date de sortie</label>
                <input type="date" value={sortieJour} onChange={e=>setSortieJour(e.target.value)} style={inputStyle}/>
              </div>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16 }}>
                <div><label style={labelStyle}>De</label>
                  <select value={sortieH1} onChange={e=>setSortieH1(e.target.value)} style={inputStyle}>
                    {TIME_OPTIONS.map(t=><option key={t}>{t}</option>)}</select></div>
                <div><label style={labelStyle}>À</label>
                  <select value={sortieH2} onChange={e=>setSortieH2(e.target.value)} style={inputStyle}>
                    {TIME_OPTIONS.filter(t=>t>sortieH1).map(t=><option key={t}>{t}</option>)}</select></div>
              </div>
              <div style={{ marginBottom:20 }}>
                <label style={labelStyle}>Motif</label>
                <textarea value={sortieMotif} onChange={e=>setSortieMotif(e.target.value)}
                  placeholder="Ex: Dépôt dossier, déplacement, mission..."
                  style={{ ...inputStyle,height:80,resize:"none" }}/>
              </div>
              {msgBlock(error, success)}
              <button disabled={loading} style={btnStyle} onClick={() =>
                handleGenerate("sortie",{jour:sortieJour,heure1:sortieH1,heure2:sortieH2,motif:sortieMotif},"SORTIE")}>
                {loading ? "⏳ Génération..." : "⚡ Générer & Télécharger PDF"}
              </button>
            </>
          )}

          {/* ── REPRISE Form ── */}
          {active === "REPRISE" && (
            <>
              <div style={{ marginBottom:16 }}>
                <label style={labelStyle}>Date de reprise</label>
                <input type="date" value={repriseDate} onChange={e=>setRepriseDate(e.target.value)} style={inputStyle}/>
              </div>
              <div style={{ marginBottom:20 }}>
                <label style={labelStyle}>Nom et adresse du médecin traitant</label>
                <input type="text" value={repriseMedcin} onChange={e=>setRepriseMedcin(e.target.value)}
                  placeholder="Dr. ..." style={inputStyle}/>
              </div>
              {msgBlock(error, success)}
              <button disabled={loading} style={btnStyle} onClick={() =>
                handleGenerate("reprise",{date_reprise:repriseDate,adress_medcin:repriseMedcin},"REPRISE")}>
                {loading ? "⏳ Génération..." : "⚡ Générer & Télécharger PDF"}
              </button>
            </>
          )}

          {/* ── MALADIE Form ── */}
          {active === "MALADIE" && (
            <>
              <div style={{ marginBottom:16 }}>
                <label style={labelStyle}>Service</label>
                <input type="text" value={maladieService} onChange={e=>setMaladieService(e.target.value)} style={inputStyle}/>
              </div>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16 }}>
                <div><label style={labelStyle}>Date de cessation</label>
                  <input type="date" value={maladieDate} onChange={e=>setMaladieDate(e.target.value)} style={inputStyle}/></div>
                <div><label style={labelStyle}>Date de reprise</label>
                  <input type="date" value={maladieReprise} onChange={e=>setMaladieReprise(e.target.value)} style={inputStyle}/></div>
              </div>
              <div style={{ marginBottom:20 }}>
                <label style={labelStyle}>Nom et adresse du médecin traitant</label>
                <input type="text" value={maladieMedcin} onChange={e=>setMaladieMedcin(e.target.value)}
                  placeholder="Dr. ..." style={inputStyle}/>
              </div>
              {msgBlock(error, success)}
              <button disabled={loading} style={btnStyle} onClick={() =>
                handleGenerate("maladie",{date_maladie:maladieDate,date_reprise:maladieReprise,
                  service:maladieService,adress_medcin:maladieMedcin},"MALADIE")}>
                {loading ? "⏳ Génération..." : "⚡ Générer & Télécharger PDF"}
              </button>
            </>
          )}

          {/* ── FIN MANQUANT Form ── */}
          {active === "FIN_MANQUANT" && (
            <>
              <div style={{ marginBottom:16 }}>
                <label style={labelStyle}>Date du mouvement manquant</label>
                <input type="date" value={finDate} onChange={e=>setFinDate(e.target.value)} style={inputStyle}/>
              </div>
              <div style={{ marginBottom:20 }}>
                <label style={labelStyle}>Heure du mouvement manquant</label>
                <select value={finHeure} onChange={e=>setFinHeure(e.target.value)} style={inputStyle}>
                  {TIME_OPTIONS.map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              {msgBlock(error, success)}
              <button disabled={loading} style={btnStyle} onClick={() =>
                handleGenerate("fin-manquant",{date_manquant:finDate,heure_manquant:finHeure},"FIN_MANQUANT")}>
                {loading ? "⏳ Génération..." : "⚡ Générer & Télécharger PDF"}
              </button>
            </>
          )}

          {/* ── RC Form ── */}
          {active === "RC" && (
            <>
              <div style={{ marginBottom:16 }}>
                <label style={labelStyle}>Service</label>
                <input type="text" value={rcService} onChange={e=>setRcService(e.target.value)} style={inputStyle}/>
              </div>
              <div style={{ marginBottom:16 }}>
                <label style={labelStyle}>Nombre de jours</label>
                <input type="number" min="1" max="30" value={rcJours}
                  onChange={e=>setRcJours(e.target.value)} style={inputStyle}/>
              </div>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:20 }}>
                <div><label style={labelStyle}>Date départ</label>
                  <input type="date" value={rcDepart} onChange={e=>setRcDepart(e.target.value)} style={inputStyle}/></div>
                <div><label style={labelStyle}>Date fin</label>
                  <input type="date" value={rcFin} onChange={e=>setRcFin(e.target.value)} style={inputStyle}/></div>
              </div>
              {msgBlock(error, success)}
              <button disabled={loading} style={btnStyle} onClick={() =>
                handleGenerate("rc",{service:rcService,nomber_jours:rcJours,date_depart:rcDepart,date_fin:rcFin},"RC")}>
                {loading ? "⏳ Génération..." : "⚡ Générer & Télécharger PDF"}
              </button>
            </>
          )}
        </div>

        {/* ── RIGHT: History ── */}
        <div style={cardStyle}>
          <div style={{ ...titleStyle, marginBottom:16 }}>
            🕐 Historique — {DOC_TYPES[active]?.label}
            <span style={{ fontSize:11,color:"var(--muted)",fontWeight:400 }}>
              {filteredHistory.length} document(s)
            </span>
          </div>

          {filteredHistory.length === 0 ? (
            <div style={{ color:"var(--muted)",fontSize:13,textAlign:"center",padding:"40px 0" }}>
              Aucun document généré pour l'instant
            </div>
          ) : (
            <div style={{ display:"flex",flexDirection:"column",gap:8,maxHeight:600,overflowY:"auto" }}>
              {filteredHistory.map(item => {
                const cfg = DOC_TYPES[item.type_doc] || { icon:"📄", color:"#6b7280" };
                return (
                  <div key={item.id} style={{
                    background:"var(--surface2)",border:"1px solid var(--border)",
                    borderRadius:10,padding:"12px 14px",
                    display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,
                    borderLeft:`3px solid ${cfg.color}`,
                  }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13,fontWeight:600 }}>
                        {cfg.icon} {DOC_TYPES[item.type_doc]?.label || item.type_doc}
                      </div>
                      <div style={{ fontSize:11,color:"var(--muted)",marginTop:3 }}>
                        🕐 {item.created_at}
                        {item.metadata?.date1 && ` · ${item.metadata.date1}`}
                        {item.metadata?.jour && ` · ${item.metadata.jour}`}
                        {item.metadata?.date_maladie && ` · ${item.metadata.date_maladie}`}
                        {item.metadata?.date_manquant && ` · ${item.metadata.date_manquant}`}
                        {item.metadata?.date_depart && ` · ${item.metadata.date_depart}`}
                      </div>
                      {user.role === "admin" && (
                        <div style={{ fontSize:11,color:"#60a5fa",marginTop:2 }}>
                          👤 {item.agent} ({item.matricule})
                        </div>
                      )}
                    </div>
                    <button onClick={() => handleRegenerate(item)} disabled={regenId===item.id}
                      style={{
                        background:"rgba(37,99,235,0.1)",border:"1px solid rgba(37,99,235,0.3)",
                        borderRadius:8,padding:"6px 12px",color:"#60a5fa",
                        fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap",
                      }}>
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

// ── Shared helpers ────────────────────────────────────────────────────────────
function msgBlock(error: string, success: string) {
  if (error)   return <div style={errorStyle}>❌ {error}</div>;
  if (success) return <div style={successStyle}>{success}</div>;
  return null;
}

function radioStyle(selected: boolean): React.CSSProperties {
  return {
    display:"flex",alignItems:"center",gap:10,
    padding:"10px 14px",
    background: selected ? "rgba(37,99,235,0.1)" : "var(--surface2)",
    border:`1px solid ${selected ? "#2563eb" : "var(--border)"}`,
    borderRadius:10,cursor:"pointer",fontSize:13,
    color: selected ? "var(--accent2)" : "var(--text)",
    transition:"all .2s",
  };
}

function radioDotStyle(selected: boolean): React.CSSProperties {
  return {
    width:16,height:16,borderRadius:"50%",
    border:`2px solid ${selected ? "#2563eb" : "var(--muted)"}`,
    background: selected ? "#2563eb" : "transparent",
    display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all .2s",
  };
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const cardStyle: React.CSSProperties = {
  background:"var(--surface)",border:"1px solid var(--border)",borderRadius:16,padding:24,
};
const titleStyle: React.CSSProperties = {
  fontFamily:"var(--font-head)",fontSize:15,fontWeight:700,marginBottom:20,
  display:"flex",alignItems:"center",gap:8,justifyContent:"space-between",
};
const infoBoxStyle: React.CSSProperties = {
  background:"var(--surface2)",border:"1px solid var(--border)",
  borderRadius:10,padding:"12px 16px",marginBottom:20,
};
const labelStyle: React.CSSProperties = {
  display:"block",fontSize:11,fontWeight:700,textTransform:"uppercase",
  letterSpacing:"0.8px",color:"var(--muted)",marginBottom:8,
};
const inputStyle: React.CSSProperties = {
  width:"100%",background:"var(--surface2)",border:"1px solid var(--border)",
  borderRadius:10,padding:"10px 14px",color:"var(--text)",fontSize:13,outline:"none",
};
const btnStyle: React.CSSProperties = {
  width:"100%",background:"linear-gradient(135deg,#2563eb,#1d4ed8)",border:"none",
  borderRadius:10,padding:13,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",
  boxShadow:"0 4px 16px rgba(37,99,235,0.35)",marginTop:8,
};
const errorStyle: React.CSSProperties = {
  background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.3)",
  borderRadius:10,padding:"10px 14px",fontSize:13,color:"#f87171",marginBottom:16,
};
const successStyle: React.CSSProperties = {
  background:"rgba(16,185,129,0.1)",border:"1px solid rgba(16,185,129,0.3)",
  borderRadius:10,padding:"10px 14px",fontSize:13,color:"#34d399",marginBottom:16,
};