"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/lib/useTheme";
import { PieChart, Pie, Cell } from "recharts";

// ── Month colors ──────────────────────────────────────────────────────────────
const MONTH_COLORS: Record<string, { bg: string; text: string }> = {
  janvier:   { bg:"rgba(59,130,246,0.15)",  text:"#60a5fa" },
  février:   { bg:"rgba(139,92,246,0.15)",  text:"#a78bfa" },
  fevrier:   { bg:"rgba(139,92,246,0.15)",  text:"#a78bfa" },
  mars:      { bg:"rgba(16,185,129,0.15)",  text:"#34d399" },
  avril:     { bg:"rgba(245,158,11,0.15)",  text:"#fbbf24" },
  mai:       { bg:"rgba(236,72,153,0.15)",  text:"#f472b6" },
  juin:      { bg:"rgba(234,179,8,0.15)",   text:"#facc15" },
  juillet:   { bg:"rgba(249,115,22,0.15)",  text:"#fb923c" },
  août:      { bg:"rgba(239,68,68,0.15)",   text:"#f87171" },
  aout:      { bg:"rgba(239,68,68,0.15)",   text:"#f87171" },
  septembre: { bg:"rgba(20,184,166,0.15)",  text:"#2dd4bf" },
  octobre:   { bg:"rgba(99,102,241,0.15)",  text:"#818cf8" },
  novembre:  { bg:"rgba(168,85,247,0.15)",  text:"#c084fc" },
  décembre:  { bg:"rgba(14,165,233,0.15)",  text:"#38bdf8" },
  december:  { bg:"rgba(14,165,233,0.15)",  text:"#38bdf8" },
};
function getMonthColor(mois: string) {
  return MONTH_COLORS[(mois||"").toLowerCase().trim()] || { bg:"rgba(100,116,139,0.15)", text:"#94a3b8" };
}

type Tab = "arrivee" | "bordereau" | "depart";
const TABS: { key: Tab; label: string; icon: string; color: string }[] = [
  { key:"arrivee",   label:"Courrier Arrivée",      icon:"📬", color:"#2563eb" },
  { key:"bordereau", label:"Bordereau d'Envoi",     icon:"📤", color:"#f59e0b" },
  { key:"depart",    label:"Courrier Départ/Récep.", icon:"🔄", color:"#8b5cf6" },
];

const MONTHS_FR = ["","Janvier","Février","Mars","Avril","MAI","juin","juillet","Août","Septembre","OCTOBRE","Novembre","Décembre"];
const PIE_COLORS = ["#2563eb","#10b981","#f59e0b","#8b5cf6","#ef4444","#38bdf8","#f97316","#84cc16"];
const API = "http://10.23.23.144:8000";

// =============================================================================
export default function CourrierPage() {
  const router = useRouter();
  const { isDark } = useTheme();
  const [user,    setUser]    = useState<any>(null);
  const [token,   setToken]   = useState("");
  const [tab,     setTab]     = useState<Tab>("arrivee");
  const [items,   setItems]   = useState<any[]>([]);
  const [total,   setTotal]   = useState(0);
  const [pages,   setPages]   = useState(1);
  const [page,    setPage]    = useState(1);
  const [stats,   setStats]   = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [search,  setSearch]  = useState("");
  const [mois,    setMois]    = useState("");

  const [previewUrl,     setPreviewUrl]     = useState<string | null>(null);
  const [previewName,    setPreviewName]    = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);

  const [syncing,    setSyncing]    = useState(false);
  const [syncResult, setSyncResult] = useState("");
  const syncRef = useRef<any>(null);

  useEffect(() => {
    const stored = localStorage.getItem("user");
    const tok    = localStorage.getItem("token");
    if (!stored || !tok) { router.push("/"); return; }
    setUser(JSON.parse(stored)); setToken(tok);
  }, [router]);

  useEffect(() => {
    if (!token) return;
    syncRef.current = setInterval(() => doSync(token, true), 30000);
    return () => clearInterval(syncRef.current);
  }, [token, tab]);

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit:"20",
        ...(search ? { search } : {}), ...(mois ? { mois } : {}) });
      const [dr, sr] = await Promise.all([
        fetch(`${API}/courrier/${tab}?${params}`, { headers:{ Authorization:`Bearer ${token}` } }),
        fetch(`${API}/courrier/${tab}/stats`,      { headers:{ Authorization:`Bearer ${token}` } }),
      ]);
      if (dr.ok) { const d = await dr.json(); setItems(d.items); setTotal(d.total); setPages(d.pages); }
      if (sr.ok) setStats(await sr.json());
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [token, tab, page, search, mois]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { setPage(1); setSearch(""); setMois(""); closePrev(); }, [tab]);

  async function doSync(tok: string, silent = false) {
    if (!silent) setSyncing(true);
    try {
      const res = await fetch(`${API}/courrier/sync/${tab}`, { method:"POST", headers:{ Authorization:`Bearer ${tok}` } });
      if (res.ok) {
        const d = await res.json();
        if (!silent) { setSyncResult(`✅ ${d.created} ajoutés, ${d.updated} mis à jour`); setTimeout(()=>setSyncResult(""),5000); }
        fetchData();
      }
    } catch { /* silent */ }
    finally { if (!silent) setSyncing(false); }
  }

  async function handlePreview(item: any) {
    const source = tab==="arrivee"?"arrivee":tab==="bordereau"?"bordereau":"depart";
    const fn = item.pdf_filename;
    if (!fn) { alert("Aucun PDF associé"); return; }
    setPreviewLoading(true); setPreviewName(fn); setPreviewUrl(null);
    try {
      const res = await fetch(`${API}/courrier/pdf/${source}/${encodeURIComponent(fn)}`, { headers:{ Authorization:`Bearer ${token}` } });
      if (!res.ok) { alert("PDF introuvable"); return; }
      setPreviewUrl(URL.createObjectURL(await res.blob()));
    } catch { alert("Erreur chargement PDF"); }
    finally { setPreviewLoading(false); }
  }

  async function handleDownload(item: any) {
    const source = tab==="arrivee"?"arrivee":tab==="bordereau"?"bordereau":"depart";
    const fn = item.pdf_filename;
    if (!fn) { alert("Aucun PDF associé"); return; }
    try {
      const res = await fetch(`${API}/courrier/pdf/${source}/${encodeURIComponent(fn)}`, { headers:{ Authorization:`Bearer ${token}` } });
      if (!res.ok) { alert("PDF introuvable"); return; }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a"); a.href=url; a.download=fn; a.click(); URL.revokeObjectURL(url);
    } catch { alert("Erreur téléchargement"); }
  }

  function closePrev() { setPreviewUrl(null); setPreviewName(""); setPreviewLoading(false); }

  if (!user) return null;

  const activeTab = TABS.find(t => t.key === tab)!;
  const hasPrev   = previewUrl || previewLoading;

  const topData = tab==="arrivee"
    ? stats?.top_expediteurs?.map((e:any)=>({name:e.expediteur,value:e.count}))
    : stats?.top_destinataires?.map((e:any)=>({name:e.destinataire,value:e.count}));

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

        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
          <div>
            <h1 style={{ fontFamily:"var(--font-head)", fontSize:24, fontWeight:800, marginBottom:5 }}>
              📬 Gestion du Courrier
            </h1>
            <p style={{ color:"var(--muted)", fontSize:13 }}>
              Consultation · recherche · aperçu PDF · synchronisation automatique
            </p>
          </div>

          {/* Sync controls */}
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            {syncResult && (
              <div style={{
                fontSize:12, color:"var(--green)",
                background:"var(--green-bg)", border:"1px solid rgba(16,185,129,0.25)",
                borderRadius:8, padding:"6px 12px", animation:"fadeIn .3s ease",
              }}>{syncResult}</div>
            )}
            <div style={{ fontSize:11, color:"var(--muted)", display:"flex", alignItems:"center", gap:5 }}>
              <div style={{ width:6, height:6, borderRadius:"50%", background:"var(--green)" }}/>
              Auto-sync 30s
            </div>
            <button onClick={()=>doSync(token)} disabled={syncing} style={{
              background:"var(--surface2)", border:"1px solid var(--border2)",
              borderRadius:9, padding:"8px 14px", color:"var(--text2)",
              fontSize:12, fontWeight:600, cursor:"pointer", transition:"all 0.15s",
              fontFamily:"var(--font-body)",
            }}
            onMouseEnter={e=>{ (e.currentTarget as HTMLElement).style.background="var(--surface3)"; (e.currentTarget as HTMLElement).style.borderColor="var(--border3)"; }}
            onMouseLeave={e=>{ (e.currentTarget as HTMLElement).style.background="var(--surface2)"; (e.currentTarget as HTMLElement).style.borderColor="var(--border2)"; }}>
              {syncing ? "⏳ Sync..." : "🔄 Synchroniser"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display:"flex", gap:6, marginBottom:20 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={()=>setTab(t.key)} style={{
            padding:"9px 18px", borderRadius:10,
            border:`1px solid ${tab===t.key ? t.color+"66" : "var(--border2)"}`,
            background: tab===t.key ? `${t.color}12` : "var(--surface)",
            color: tab===t.key ? t.color : "var(--muted)",
            fontSize:13, fontWeight:600, cursor:"pointer",
            display:"flex", alignItems:"center", gap:7,
            transition:"all 0.18s", fontFamily:"var(--font-body)",
            boxShadow: tab===t.key ? `0 0 0 3px ${t.color}18` : "none",
          }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── Stats row ── */}
      {stats && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:20 }}>
          {tab==="arrivee" && <>
            <MiniStat icon="📬" value={stats.total}                              label="Total courriers"    color="#2563eb"/>
            <MiniStat icon="🏢" value={stats.top_expediteurs?.[0]?.expediteur||"—"} label="Top expéditeur"  color="#10b981" isText/>
            <MiniStat icon="📅" value={stats.monthly?.length||0}                 label="Mois actifs"        color="#f59e0b"/>
            <MiniStat icon="📊" value={stats.monthly?.reduce((s:number,m:any)=>s+m.count,0)||0} label="Cette année" color="#8b5cf6"/>
          </>}
          {tab==="bordereau" && <>
            <MiniStat icon="📤" value={stats.total}                                    label="Total bordereaux"   color="#f59e0b"/>
            <MiniStat icon="🏢" value={stats.top_destinataires?.[0]?.destinataire||"—"} label="Top destinataire" color="#10b981" isText/>
            <MiniStat icon="🔢" value={stats.top_destinataires?.length||0}             label="Destinataires"     color="#2563eb"/>
            <MiniStat icon="📋" value={stats.total}                                    label="Docs envoyés"      color="#8b5cf6"/>
          </>}
          {tab==="depart" && <>
            <MiniStat icon="🔄" value={stats.total}                                         label="Total départs"   color="#8b5cf6"/>
            <MiniStat icon="✅" value={stats.with_recep}                                    label="Avec réception"  color="#10b981"/>
            <MiniStat icon="⏳" value={stats.pending}                                       label="Sans réponse"    color="#f59e0b"/>
            <MiniStat icon="📊" value={stats.total?Math.round((stats.with_recep/stats.total)*100):0} label="Taux réponse %" color="#2563eb"/>
          </>}
        </div>
      )}

      {/* ── Main grid ── */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 300px", gap:18, alignItems:"start" }}>

        {/* ════ LEFT: Search + Table ════ */}
        <div>
          {/* Search bar */}
          <div style={{
            background:"var(--surface)", border:"1px solid var(--border)",
            borderRadius:12, padding:"10px 14px", marginBottom:12,
            display:"flex", gap:10, alignItems:"center",
            transition:"border-color 0.15s",
          }}>
            <div style={{ position:"relative", flex:1 }}>
              <span style={{
                position:"absolute", left:12, top:"50%", transform:"translateY(-50%)",
                color:"var(--muted)", fontSize:14,
              }}>🔍</span>
              <input value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}
                placeholder={tab==="arrivee"?"Expéditeur, objet...":"Référence, destinataire, objet..."}
                style={{
                  width:"100%", background:"var(--surface2)",
                  border:`1px solid var(--border2)`,
                  borderRadius:9, padding:"9px 14px 9px 38px",
                  color:"var(--text)", fontSize:13, outline:"none",
                  transition:"border-color 0.15s, box-shadow 0.15s",
                  fontFamily:"var(--font-body)",
                }}
                onFocus={e=>{ e.target.style.borderColor=activeTab.color; e.target.style.boxShadow=`0 0 0 3px ${activeTab.color}18`; }}
                onBlur={e=>{ e.target.style.borderColor="var(--border2)"; e.target.style.boxShadow="none"; }}
              />
            </div>
            {(tab==="arrivee"||tab==="depart") && (
              <select value={mois} onChange={e=>{setMois(e.target.value);setPage(1);}} style={{
                background:"var(--surface2)", border:"1px solid var(--border2)",
                borderRadius:9, padding:"9px 12px",
                color:"var(--text)", fontSize:12, outline:"none", cursor:"pointer",
                fontFamily:"var(--font-body)",
              }}>
                <option value="">Tous les mois</option>
                {MONTHS_FR.filter(Boolean).map(m=><option key={m}>{m}</option>)}
              </select>
            )}
            <div style={{
              fontSize:11, color:"var(--muted)", whiteSpace:"nowrap",
              background:"var(--surface2)", border:"1px solid var(--border)",
              borderRadius:8, padding:"5px 10px",
            }}>
              {loading ? "⏳" : `${total} résultat(s)`}
            </div>
          </div>

          {/* Table */}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {tab==="arrivee"   && <><Th>N°</Th><Th>Expéditeur</Th><Th>Date</Th><Th>Objet</Th><Th>Mois</Th><Th>Actions</Th></>}
                  {tab==="bordereau" && <><Th>N°</Th><Th>Référence</Th><Th>Destinataire</Th><Th>Objet</Th><Th>Date</Th><Th>Actions</Th></>}
                  {tab==="depart"    && <><Th>N°</Th><Th>Référence</Th><Th>Destinataire</Th><Th>Objet</Th><Th>Départ</Th><Th>Statut</Th><Th>Actions</Th></>}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({length:8}).map((_,i)=>(
                    <tr key={i}>
                      {Array.from({length:tab==="depart"?7:6}).map((_,j)=>(
                        <td key={j} style={{ padding:"11px 14px" }}>
                          <div className="skeleton" style={{ height:14, borderRadius:6, width:j===3?"90%":"60%" }}/>
                        </td>
                      ))}
                    </tr>
                  ))
                ) : items.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign:"center", padding:48, color:"var(--muted)", fontSize:13 }}>
                    <div style={{ fontSize:32, marginBottom:10, opacity:.2 }}>📭</div>
                    Aucun résultat
                  </td></tr>
                ) : items.map((item, i) => (
                  <tr key={item.id}>
                    {tab==="arrivee" && <>
                      <td style={tdS}><span style={{ color:"var(--muted)", fontSize:11 }}>{(page-1)*20+i+1}</span></td>
                      <td style={tdS}><strong style={{ fontSize:13 }}>{item.expediteur}</strong></td>
                      <td style={{ ...tdS, whiteSpace:"nowrap", fontSize:11, color:"var(--muted)" }}>{item.date_courrier||"—"}</td>
                      <td style={{ ...tdS, maxWidth:200 }}><TruncText text={item.objet} max={55}/></td>
                      <td style={tdS}><MonthBadge mois={item.mois}/></td>
                      <td style={tdS}><ActionBtns item={item} onPreview={handlePreview} onDownload={handleDownload} hasPdf={!!item.pdf_filename}/></td>
                    </>}
                    {tab==="bordereau" && <>
                      <td style={tdS}><span style={{ color:"var(--muted)", fontSize:11 }}>{(page-1)*20+i+1}</span></td>
                      <td style={{ ...tdS, fontSize:11, color:"var(--muted)" }}><TruncText text={item.reference} max={28}/></td>
                      <td style={tdS}><strong style={{ fontSize:13 }}>{item.destinataire}</strong></td>
                      <td style={{ ...tdS, maxWidth:200 }}><TruncText text={item.objet} max={50}/></td>
                      <td style={{ ...tdS, fontSize:11, color:"var(--muted)", whiteSpace:"nowrap" }}>{item.created_at}</td>
                      <td style={tdS}><ActionBtns item={item} onPreview={handlePreview} onDownload={handleDownload} hasPdf={!!item.pdf_filename}/></td>
                    </>}
                    {tab==="depart" && <>
                      <td style={tdS}><span style={{ color:"var(--muted)", fontSize:11 }}>{(page-1)*20+i+1}</span></td>
                      <td style={{ ...tdS, fontSize:11, color:"var(--muted)" }}><TruncText text={item.reference} max={22}/></td>
                      <td style={tdS}><strong style={{ fontSize:13 }}>{item.destinataire}</strong></td>
                      <td style={{ ...tdS, maxWidth:160 }}><TruncText text={item.objet} max={45}/></td>
                      <td style={{ ...tdS, fontSize:11, color:"var(--muted)", whiteSpace:"nowrap" }}>{item.date_depart||"—"}</td>
                      <td style={tdS}>{item.has_reception
                        ? <span className="badge badge-green">✓ Reçu</span>
                        : <span className="badge badge-gold">⏳ Attente</span>}
                      </td>
                      <td style={tdS}><ActionBtns item={item} onPreview={handlePreview} onDownload={handleDownload} hasPdf={!!item.pdf_filename}/></td>
                    </>}
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {pages > 1 && (
              <div style={{ display:"flex", justifyContent:"center", gap:5, padding:12, borderTop:"1px solid var(--border)" }}>
                <button className={`pag-btn ${page<=1?"disabled":""}`} disabled={page<=1} onClick={()=>setPage(p=>p-1)}>←</button>
                {Array.from({length:Math.min(pages,7)},(_,i)=>i+Math.max(1,page-3)).filter(p=>p<=pages).map(p=>(
                  <button key={p} className={`pag-btn ${p===page?"active":""}`} onClick={()=>setPage(p)}>{p}</button>
                ))}
                <button className={`pag-btn ${page>=pages?"disabled":""}`} disabled={page>=pages} onClick={()=>setPage(p=>p+1)}>→</button>
              </div>
            )}
          </div>
        </div>

        {/* ════ RIGHT: Preview + Charts ════ */}
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>

          {/* PDF Preview card */}
          <div style={{
            background:"var(--surface)",
            border:`1px solid ${hasPrev ? activeTab.color+"55" : "var(--border)"}`,
            borderRadius:14, overflow:"hidden",
            transition:"border-color .3s, box-shadow .3s",
            boxShadow: hasPrev ? `0 0 0 3px ${activeTab.color}12` : "none",
          }}>
            <div style={{
              display:"flex", alignItems:"center", justifyContent:"space-between",
              padding:"11px 14px", borderBottom:"1px solid var(--border)",
              background: hasPrev ? `linear-gradient(90deg,${activeTab.color}0f,transparent)` : "transparent",
            }}>
              <div>
                <div style={{ fontSize:12, fontWeight:700, color:hasPrev?activeTab.color:"var(--text2)" }}>
                  👁️ Aperçu PDF
                </div>
                <div style={{ fontSize:10, color:"var(--muted)", marginTop:2 }}>
                  {hasPrev ? previewName : "Cliquez 👁️ sur une ligne"}
                </div>
              </div>
              {hasPrev && (
                <button onClick={closePrev} style={{
                  background:"none", border:"none", color:"var(--muted)",
                  cursor:"pointer", fontSize:18, lineHeight:1, transition:"color 0.15s",
                }}
                onMouseEnter={e=>e.currentTarget.style.color="var(--text)"}
                onMouseLeave={e=>e.currentTarget.style.color="var(--muted)"}>✕</button>
              )}
            </div>

            {!hasPrev && (
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center",
                justifyContent:"center", height:260, gap:10, padding:20 }}>
                <div style={{ fontSize:36, opacity:.12 }}>📄</div>
                <div style={{ fontSize:12, color:"var(--muted)", textAlign:"center", lineHeight:1.6, maxWidth:160 }}>
                  Sélectionnez un courrier et cliquez 👁️ pour afficher son PDF
                </div>
                <div style={{ color:"var(--muted2)", fontSize:18 }}>→</div>
              </div>
            )}

            {previewLoading && !previewUrl && (
              <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:260, gap:10 }}>
                <div className="skeleton" style={{ width:40, height:40, borderRadius:"50%" }}/>
                <span style={{ fontSize:12, color:"var(--muted)" }}>Chargement PDF...</span>
              </div>
            )}

            {previewUrl && (
              <iframe src={previewUrl} style={{ width:"100%", height:340, border:"none", display:"block" }} title="PDF"/>
            )}
          </div>

          {/* Top expéditeurs / destinataires */}
          {stats && (
            <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:14, padding:16 }}>
              <div style={{ fontFamily:"var(--font-head)", fontSize:13, fontWeight:700, marginBottom:12 }}>
                {tab==="arrivee" ? "🏢 Top expéditeurs" : "🏢 Top destinataires"}
              </div>
              {topData?.length > 0 ? (
                <>
                  <div style={{ display:"flex", justifyContent:"center" }}>
                    <PieChart width={160} height={110}>
                      <Pie data={topData.slice(0,8)} cx={80} cy={55} innerRadius={30} outerRadius={50}
                        dataKey="value" paddingAngle={2}>
                        {topData.slice(0,8).map((_:any,i:number)=>(
                          <Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]}/>
                        ))}
                      </Pie>
                    </PieChart>
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:7, marginTop:6 }}>
                    {topData.slice(0,6).map((d:any,i:number)=>(
                      <div key={i} style={{ display:"flex", alignItems:"center", gap:8, fontSize:11 }}>
                        <div style={{ width:8, height:8, borderRadius:"50%", background:PIE_COLORS[i%PIE_COLORS.length], flexShrink:0 }}/>
                        <span style={{ flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", color:"var(--text2)" }}>{d.name}</span>
                        <span style={{ fontWeight:700, color:"var(--muted)", flexShrink:0 }}>{d.value}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ color:"var(--muted)", fontSize:12, textAlign:"center", padding:"20px 0" }}>Aucune donnée</div>
              )}
            </div>
          )}

          {/* Taux réponse — départ only */}
          {tab==="depart" && stats && (
            <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:14, padding:16 }}>
              <div style={{ fontFamily:"var(--font-head)", fontSize:13, fontWeight:700, marginBottom:14 }}>📊 Taux de réponse</div>
              <div style={{ textAlign:"center", marginBottom:12 }}>
                <div style={{ fontSize:34, fontWeight:800, color:"var(--green)", lineHeight:1, fontFamily:"var(--font-head)" }}>
                  {stats.total?Math.round((stats.with_recep/stats.total)*100):0}%
                </div>
                <div style={{ fontSize:11, color:"var(--muted)", marginTop:4 }}>courriers avec réception</div>
              </div>
              <div style={{ height:6, background:"var(--surface2)", borderRadius:99, overflow:"hidden" }}>
                <div style={{ height:"100%", borderRadius:99, background:"var(--green)",
                  width:`${stats.total?(stats.with_recep/stats.total)*100:0}%`,
                  transition:"width 1s cubic-bezier(.4,0,.2,1)" }}/>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"var(--muted)", marginTop:8 }}>
                <span>✅ {stats.with_recep} reçus</span>
                <span>⏳ {stats.pending} en attente</span>
              </div>
            </div>
          )}

          {/* Légende mois — arrivée only */}
          {tab==="arrivee" && (
            <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:14, padding:16 }}>
              <div style={{ fontFamily:"var(--font-head)", fontSize:13, fontWeight:700, marginBottom:12 }}>🎨 Légende des mois</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:5 }}>
                {["Janvier","Février","Mars","Avril","MAI","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"].map(m=>{
                  const c = getMonthColor(m);
                  return (
                    <div key={m} style={{ display:"flex", alignItems:"center", gap:6, fontSize:11 }}>
                      <div style={{ width:10, height:10, borderRadius:3, background:c.bg, border:`1px solid ${c.text}44`, flexShrink:0 }}/>
                      <span style={{ color:c.text, fontWeight:500 }}>{m}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function MiniStat({ icon, value, label, color, isText=false }: any) {
  return (
    <div style={{
      background:"var(--surface)", border:"1px solid var(--border)",
      borderTop:`2px solid ${color}`, borderRadius:12, padding:14,
      transition:"transform 0.2s, box-shadow 0.2s",
    }}
    onMouseEnter={e=>{ (e.currentTarget as HTMLElement).style.transform="translateY(-2px)"; (e.currentTarget as HTMLElement).style.boxShadow="var(--shadow-md)"; }}
    onMouseLeave={e=>{ (e.currentTarget as HTMLElement).style.transform="translateY(0)"; (e.currentTarget as HTMLElement).style.boxShadow="none"; }}>
      <div style={{ fontSize:16, marginBottom:8 }}>{icon}</div>
      <div style={{ fontSize:isText?12:26, fontWeight:800, color, lineHeight:1,
        overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
        fontFamily:"var(--font-head)" }}>{value}</div>
      <div style={{ fontSize:10, color:"var(--muted)", marginTop:5 }}>{label}</div>
    </div>
  );
}

function MonthBadge({ mois }: { mois: string }) {
  const c = getMonthColor(mois);
  return (
    <span style={{
      background:c.bg, color:c.text, fontSize:10, fontWeight:600,
      padding:"3px 9px", borderRadius:99, whiteSpace:"nowrap",
      border:`1px solid ${c.text}33`,
    }}>{mois}</span>
  );
}

function ActionBtns({ item, onPreview, onDownload, hasPdf }: any) {
  return (
    <div style={{ display:"flex", gap:5 }}>
      <button onClick={e=>{e.stopPropagation();if(hasPdf)onPreview(item);}}
        title={hasPdf?"Aperçu PDF":"Pas de PDF"}
        style={{
          width:30, height:30, borderRadius:8, border:"1px solid",
          borderColor:hasPdf?"rgba(37,99,235,0.35)":"var(--border)",
          background:hasPdf?"rgba(37,99,235,0.1)":"var(--surface2)",
          color:hasPdf?"#60a5fa":"var(--muted2)",
          cursor:hasPdf?"pointer":"not-allowed",
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:13, transition:"all 0.15s",
        }}
        onMouseEnter={e=>{ if(hasPdf)(e.currentTarget.style.background="rgba(37,99,235,0.2)"); }}
        onMouseLeave={e=>{ if(hasPdf)(e.currentTarget.style.background="rgba(37,99,235,0.1)"); }}>
        👁️
      </button>
      <button onClick={e=>{e.stopPropagation();if(hasPdf)onDownload(item);}}
        title={hasPdf?"Télécharger":"Pas de PDF"}
        style={{
          width:30, height:30, borderRadius:8, border:"1px solid",
          borderColor:hasPdf?"rgba(16,185,129,0.35)":"var(--border)",
          background:hasPdf?"rgba(16,185,129,0.1)":"var(--surface2)",
          color:hasPdf?"#34d399":"var(--muted2)",
          cursor:hasPdf?"pointer":"not-allowed",
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:13, transition:"all 0.15s",
        }}
        onMouseEnter={e=>{ if(hasPdf)(e.currentTarget.style.background="rgba(16,185,129,0.2)"); }}
        onMouseLeave={e=>{ if(hasPdf)(e.currentTarget.style.background="rgba(16,185,129,0.1)"); }}>
        ⬇️
      </button>
    </div>
  );
}

function Th({ children }: any) {
  return <th style={{ padding:"9px 14px", textAlign:"left", fontSize:10, fontWeight:700,
    textTransform:"uppercase", letterSpacing:"0.7px", color:"var(--muted)",
    borderBottom:"1px solid var(--border)", whiteSpace:"nowrap" }}>{children}</th>;
}

function TruncText({ text, max }: { text: string; max: number }) {
  const s = text || "";
  return <span title={s} style={{ fontSize:12, color:"var(--text2)" }}>{s.length>max?s.slice(0,max)+"…":s}</span>;
}

const tdS: React.CSSProperties = { padding:"10px 14px", verticalAlign:"middle" };