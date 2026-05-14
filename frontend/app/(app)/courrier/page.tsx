"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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

const PIE_COLORS = ["#2563eb","#10b981","#f59e0b","#8b5cf6","#ef4444","#38bdf8","#f97316","#84cc16"];
const API = "http://10.23.23.144:8000";
const BATCH = 100; // items per fetch batch

// ── Date helpers ──────────────────────────────────────────────────────────────
function parseDate(s: string): number {
  if (!s || s === "—") return 0;
  const p = s.split("/");
  if (p.length === 3) return parseInt(`${p[2]}${p[1].padStart(2,"0")}${p[0].padStart(2,"0")}`);
  return 0;
}

function getYear(item: any): string {
  const d = item.date_courrier || item.date_depart || item.created_at || "";
  const p = (d || "").split("/");
  if (p.length === 3 && p[2]?.length === 4) return p[2];
  return "—";
}

function getDateStr(item: any): string {
  return item.date_courrier || item.date_depart || item.created_at || "—";
}

// =============================================================================
export default function CourrierPage() {
  const router = useRouter();
  const { isDark } = useTheme();
  const [user,    setUser]    = useState<any>(null);
  const [token,   setToken]   = useState("");
  const [tab,     setTab]     = useState<Tab>("arrivee");
  const [allItems, setAllItems] = useState<any[]>([]);
  const [stats,   setStats]   = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search,  setSearch]  = useState("");
  const [mois,    setMois]    = useState("");
  const [totalCount, setTotalCount] = useState(0);
  const [fetched,    setFetched]    = useState(0);

  // Sort
  const [sortCol, setSortCol] = useState<"date"|"expediteur"|"objet">("date");
  const [sortDir, setSortDir] = useState<"asc"|"desc">("desc");

  // Preview
  const [previewUrl,     setPreviewUrl]     = useState<string|null>(null);
  const [previewName,    setPreviewName]    = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);

  // Sync
  const [syncing,    setSyncing]    = useState(false);
  const [syncResult, setSyncResult] = useState("");
  const syncRef    = useRef<any>(null);
  const bottomRef  = useRef<HTMLDivElement>(null);
  const searchTimer= useRef<any>(null);

  // Collapsed years
  const [collapsedYears, setCollapsedYears] = useState<Set<string>>(new Set());

  useEffect(() => {
    const stored = localStorage.getItem("user");
    const tok    = localStorage.getItem("token");
    if (!stored || !tok) { router.push("/"); return; }
    setUser(JSON.parse(stored)); setToken(tok);
  }, [router]);

  // ── Fetch ALL items (batched) ──────────────────────────────────────────────
  const fetchAll = useCallback(async (tok: string, currentTab: Tab, s: string, m: string) => {
    if (!tok) return;
    setLoading(true);
    setAllItems([]);
    setFetched(0);
    try {
      // First batch + stats
      const params = new URLSearchParams({
        page:"1", limit:String(BATCH),
        ...(s ? {search:s} : {}), ...(m ? {mois:m} : {}),
        sort_by:"date", sort_dir:"desc",
      });
      const [dr, sr] = await Promise.all([
        fetch(`${API}/courrier/${currentTab}?${params}`, { headers:{ Authorization:`Bearer ${tok}` } }),
        fetch(`${API}/courrier/${currentTab}/stats`,      { headers:{ Authorization:`Bearer ${tok}` } }),
      ]);
      if (!dr.ok) return;
      const d = await dr.json();
      const total = d.total || 0;
      setTotalCount(total);
      setAllItems(d.items || []);
      setFetched(d.items?.length || 0);
      if (sr.ok) setStats(await sr.json());

      // Fetch remaining batches in background
      if (total > BATCH) {
        const remaining: any[] = [];
        const totalPages = Math.ceil(total / BATCH);
        for (let p = 2; p <= totalPages; p++) {
          const p2 = new URLSearchParams({
            page:String(p), limit:String(BATCH),
            ...(s ? {search:s} : {}), ...(m ? {mois:m} : {}),
            sort_by:"date", sort_dir:"desc",
          });
          const r2 = await fetch(`${API}/courrier/${currentTab}?${p2}`, {
            headers:{ Authorization:`Bearer ${tok}` }
          });
          if (r2.ok) {
            const d2 = await r2.json();
            remaining.push(...(d2.items || []));
            setAllItems(prev => [...prev, ...( d2.items || [])]);
            setFetched(prev => prev + (d2.items?.length || 0));
          }
        }
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!token) return;
    fetchAll(token, tab, search, mois);
  }, [token, tab]);

  // Debounced search
  useEffect(() => {
    if (!token) return;
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      fetchAll(token, tab, search, mois);
    }, 400);
    return () => clearTimeout(searchTimer.current);
  }, [search, mois]);

  // Reset on tab change
  useEffect(() => {
    setSearch(""); setMois(""); closePrev(); setAllItems([]); setStats(null);
  }, [tab]);

  // Auto-sync
  useEffect(() => {
    if (!token) return;
    syncRef.current = setInterval(() => doSync(token, true), 30000);
    return () => clearInterval(syncRef.current);
  }, [token, tab]);

  async function doSync(tok: string, silent = false) {
    if (!silent) setSyncing(true);
    try {
      const res = await fetch(`${API}/courrier/sync/${tab}`, { method:"POST", headers:{ Authorization:`Bearer ${tok}` } });
      if (res.ok) {
        const d = await res.json();
        if (!silent) { setSyncResult(`✅ ${d.created} ajoutés, ${d.updated} mis à jour`); setTimeout(()=>setSyncResult(""),5000); }
        fetchAll(tok, tab, search, mois);
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

  function toggleSort(col: "date"|"expediteur"|"objet") {
    if (sortCol === col) setSortDir(d => d==="asc"?"desc":"asc");
    else { setSortCol(col); setSortDir("desc"); }
  }

  function toggleYear(year: string) {
    setCollapsedYears(prev => {
      const n = new Set(prev);
      n.has(year) ? n.delete(year) : n.add(year);
      return n;
    });
  }

  function scrollToYear(year: string) {
    document.getElementById(`year-${year}`)?.scrollIntoView({ behavior:"smooth", block:"start" });
  }

  // ── Sort + group by year ──────────────────────────────────────────────────
  const groupedByYear = useMemo(() => {
    let sorted = [...allItems].sort((a, b) => {
      let va: any, vb: any;
      if (sortCol === "date") {
        va = parseDate(getDateStr(a));
        vb = parseDate(getDateStr(b));
      } else if (sortCol === "expediteur") {
        va = (a.expediteur || a.destinataire || "").toLowerCase();
        vb = (b.expediteur || b.destinataire || "").toLowerCase();
      } else {
        va = (a.objet || "").toLowerCase();
        vb = (b.objet || "").toLowerCase();
      }
      if (va < vb) return sortDir==="asc"?-1:1;
      if (va > vb) return sortDir==="asc"?1:-1;
      return 0;
    });

    // Group by year
    const groups: Record<string, any[]> = {};
    for (const item of sorted) {
      const y = getYear(item);
      if (!groups[y]) groups[y] = [];
      groups[y].push(item);
    }

    // Sort years descending
    return Object.entries(groups).sort((a,b) => {
      const ya = parseInt(a[0]) || 0;
      const yb = parseInt(b[0]) || 0;
      return yb - ya;
    });
  }, [allItems, sortCol, sortDir]);

  const years = groupedByYear.map(([y]) => y);

  if (!user) return null;

  const activeTab = TABS.find(t => t.key === tab)!;
  const hasPrev   = previewUrl || previewLoading;
  const topData   = tab==="arrivee"
    ? stats?.top_expediteurs?.map((e:any)=>({name:e.expediteur,value:e.count}))
    : stats?.top_destinataires?.map((e:any)=>({name:e.destinataire,value:e.count}));

  return (
    <div style={{ minHeight:"100vh", background:"var(--bg)", padding:"24px 28px" }}>

      {/* ── Header ── */}
      <div style={{ marginBottom:20 }}>
        <button onClick={()=>router.push("/dashboard")} style={{
          background:"none", border:"none", color:"var(--muted)",
          cursor:"pointer", fontSize:12, marginBottom:10,
          display:"flex", alignItems:"center", gap:6, transition:"color 0.15s",
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
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            {syncResult && (
              <div style={{ fontSize:12, color:"var(--green)", background:"var(--green-bg)",
                border:"1px solid rgba(16,185,129,0.25)", borderRadius:8, padding:"6px 12px" }}>
                {syncResult}
              </div>
            )}
            <div style={{ fontSize:11, color:"var(--muted)", display:"flex", alignItems:"center", gap:5 }}>
              <div style={{ width:6, height:6, borderRadius:"50%", background:"var(--green)" }}/>
              Auto-sync 30s
            </div>
            <button onClick={()=>doSync(token)} disabled={syncing} style={{
              background:"var(--surface2)", border:"1px solid var(--border2)",
              borderRadius:9, padding:"8px 14px", color:"var(--text2)",
              fontSize:12, fontWeight:600, cursor:"pointer",
            }}>
              {syncing?"⏳ Sync...":"🔄 Synchroniser"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display:"flex", gap:6, marginBottom:20 }}>
        {TABS.map(t=>(
          <button key={t.key} onClick={()=>setTab(t.key)} style={{
            padding:"9px 18px", borderRadius:10,
            border:`1px solid ${tab===t.key?t.color+"66":"var(--border2)"}`,
            background:tab===t.key?`${t.color}12`:"var(--surface)",
            color:tab===t.key?t.color:"var(--muted)",
            fontSize:13, fontWeight:600, cursor:"pointer",
            display:"flex", alignItems:"center", gap:7, transition:"all 0.18s",
            boxShadow:tab===t.key?`0 0 0 3px ${t.color}18`:"none",
          }}>{t.icon} {t.label}</button>
        ))}
      </div>

      {/* ── Stats ── */}
      {stats && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:20 }}>
          {[
            { icon:"📬", val:stats.total||totalCount, lbl:"Total", color:activeTab.color },
            { icon:"🏢", val:tab==="arrivee"?stats.top_expediteurs?.[0]?.expediteur||"—":stats.top_destinataires?.[0]?.destinataire||"—", lbl:"Top", color:"#10b981", isText:true },
            { icon:"📅", val:stats.monthly?.length||groupedByYear.length, lbl:"Mois actifs", color:"#f59e0b" },
            { icon:"📊", val:fetched, lbl:"Chargés", color:"#8b5cf6" },
          ].map((s,i)=>(
            <div key={i} style={{
              background:"var(--surface)", border:"1px solid var(--border)",
              borderTop:`2px solid ${s.color}`, borderRadius:12, padding:"12px 16px",
              transition:"transform .2s",
            }}
            onMouseEnter={e=>(e.currentTarget as HTMLElement).style.transform="translateY(-2px)"}
            onMouseLeave={e=>(e.currentTarget as HTMLElement).style.transform="translateY(0)"}>
              <div style={{ fontSize:16, marginBottom:6 }}>{s.icon}</div>
              <div style={{ fontSize:(s as any).isText?12:24, fontWeight:800, color:s.color,
                overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                fontFamily:"var(--font-head)" }}>{s.val}</div>
              <div style={{ fontSize:10, color:"var(--muted)", marginTop:4 }}>{s.lbl}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Main layout ── */}
      <div style={{
        display:"grid",
        gridTemplateColumns: hasPrev?"1fr 1fr":"1fr",
        gap:18, alignItems:"start",
      }}>

        {/* ════ LEFT: Search + Year tables ════ */}
        <div>

          {/* Search + filter + year jumper */}
          <div style={{
            background:"var(--surface)", border:"1px solid var(--border)",
            borderRadius:12, padding:"10px 14px", marginBottom:14,
            display:"flex", gap:10, alignItems:"center", flexWrap:"wrap",
          }}>
            <div style={{ position:"relative", flex:1, minWidth:200 }}>
              <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:"var(--muted)", fontSize:14 }}>🔍</span>
              <input value={search} onChange={e=>setSearch(e.target.value)}
                placeholder={tab==="arrivee"?"Expéditeur, objet...":"Référence, destinataire, objet..."}
                style={{ width:"100%", background:"var(--surface2)", border:"1px solid var(--border2)",
                  borderRadius:9, padding:"9px 14px 9px 38px", color:"var(--text)", fontSize:13, outline:"none",
                  fontFamily:"var(--font-body)" }}
                onFocus={e=>{ e.target.style.borderColor=activeTab.color; e.target.style.boxShadow=`0 0 0 3px ${activeTab.color}18`; }}
                onBlur={e=>{ e.target.style.borderColor="var(--border2)"; e.target.style.boxShadow="none"; }}
              />
            </div>

            {/* Year jumper pills */}
            {years.length > 1 && (
              <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                {years.map(y=>(
                  <button key={y} onClick={()=>scrollToYear(y)} style={{
                    background:`${activeTab.color}12`,
                    border:`1px solid ${activeTab.color}44`,
                    borderRadius:99, padding:"4px 12px",
                    fontSize:11, fontWeight:700, color:activeTab.color,
                    cursor:"pointer", transition:"all .15s",
                  }}
                  onMouseEnter={e=>{ (e.currentTarget as HTMLElement).style.background=`${activeTab.color}25`; }}
                  onMouseLeave={e=>{ (e.currentTarget as HTMLElement).style.background=`${activeTab.color}12`; }}>
                    {y}
                  </button>
                ))}
              </div>
            )}

            <span style={{ fontSize:11, color:"var(--muted)", whiteSpace:"nowrap",
              background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:8, padding:"5px 10px" }}>
              {loading ? "⏳ Chargement..." : `${allItems.length} / ${totalCount}`}
            </span>
          </div>

          {/* Loading bar */}
          {loading && (
            <div style={{ height:3, background:"var(--surface2)", borderRadius:99, marginBottom:14, overflow:"hidden" }}>
              <div style={{
                height:"100%", background:activeTab.color,
                borderRadius:99, width:"60%",
                animation:"loadingBar 1.5s ease-in-out infinite",
              }}/>
            </div>
          )}

          {/* ── YEAR GROUPS ── */}
          {groupedByYear.length === 0 && !loading ? (
            <div style={{ textAlign:"center", padding:"60px 20px", color:"var(--muted)" }}>
              <div style={{ fontSize:36, marginBottom:10, opacity:.2 }}>📭</div>
              <div style={{ fontSize:14 }}>Aucun résultat</div>
            </div>
          ) : groupedByYear.map(([year, rows]) => (
            <div key={year} id={`year-${year}`} style={{ marginBottom:24 }}>

              {/* Year header — sticky */}
              <div onClick={()=>toggleYear(year)} style={{
                position:"sticky", top:56, zIndex:10,
                display:"flex", alignItems:"center", justifyContent:"space-between",
                padding:"10px 16px", marginBottom:8,
                background:isDark
                  ? `linear-gradient(90deg,${activeTab.color}18,var(--surface))`
                  : `linear-gradient(90deg,${activeTab.color}10,var(--surface))`,
                border:`1px solid ${activeTab.color}33`,
                borderRadius:10, cursor:"pointer",
                backdropFilter:"blur(8px)",
                transition:"all .2s",
              }}>
                <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                  <div style={{
                    width:36, height:36, borderRadius:9,
                    background:activeTab.color,
                    display:"flex", alignItems:"center", justifyContent:"center",
                    fontSize:14, fontWeight:800, color:"#fff",
                    fontFamily:"var(--font-head)",
                  }}>
                    {year.slice(-2)}
                  </div>
                  <div>
                    <div style={{ fontFamily:"var(--font-head)", fontSize:16, fontWeight:800, color:activeTab.color }}>
                      {year}
                    </div>
                    <div style={{ fontSize:11, color:"var(--muted)" }}>
                      {rows.length} document{rows.length>1?"s":""}
                    </div>
                  </div>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  {/* Mini month breakdown */}
                  <div style={{ display:"flex", gap:4, flexWrap:"wrap", justifyContent:"flex-end" }}>
                    {Object.entries(
                      rows.reduce((acc:any, r:any) => {
                        const m = r.mois||"—"; acc[m]=(acc[m]||0)+1; return acc;
                      }, {})
                    ).slice(0,6).map(([m,c]:any)=>{
                      const mc = getMonthColor(m);
                      return (
                        <span key={m} style={{
                          background:mc.bg, color:mc.text,
                          border:`1px solid ${mc.text}33`,
                          padding:"2px 7px", borderRadius:99, fontSize:9, fontWeight:600,
                        }}>{m.slice(0,3)} {c}</span>
                      );
                    })}
                  </div>
                  <span style={{ fontSize:16, color:"var(--muted)", transition:"transform .2s",
                    transform:collapsedYears.has(year)?"rotate(-90deg)":"rotate(0deg)" }}>▾</span>
                </div>
              </div>

              {/* Table for this year */}
              {!collapsedYears.has(year) && (
                <div className="table-wrap" style={{ borderRadius:12, overflow:"hidden" }}>
                  <table>
                    <thead>
                      <tr style={{ background:isDark?"rgba(0,0,0,0.3)":"rgba(0,0,0,0.03)" }}>
                        <Th>N°</Th>
                        {tab==="arrivee" && <>
                          <ThSort label="Expéditeur" col="expediteur" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort}/>
                          <ThSort label="Date"       col="date"       sortCol={sortCol} sortDir={sortDir} onSort={toggleSort}/>
                          <ThSort label="Objet"      col="objet"      sortCol={sortCol} sortDir={sortDir} onSort={toggleSort}/>
                          <Th>Mois</Th><Th>Actions</Th>
                        </>}
                        {tab==="bordereau" && <>
                          <Th>Référence</Th>
                          <ThSort label="Destinataire" col="expediteur" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort}/>
                          <ThSort label="Objet"        col="objet"      sortCol={sortCol} sortDir={sortDir} onSort={toggleSort}/>
                          <ThSort label="Date"         col="date"       sortCol={sortCol} sortDir={sortDir} onSort={toggleSort}/>
                          <Th>Actions</Th>
                        </>}
                        {tab==="depart" && <>
                          <Th>Référence</Th>
                          <ThSort label="Destinataire" col="expediteur" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort}/>
                          <ThSort label="Objet"        col="objet"      sortCol={sortCol} sortDir={sortDir} onSort={toggleSort}/>
                          <ThSort label="Départ"       col="date"       sortCol={sortCol} sortDir={sortDir} onSort={toggleSort}/>
                          <Th>Statut</Th><Th>Actions</Th>
                        </>}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((item:any, i:number) => {
                        const mc = getMonthColor(item.mois||"");
                        const rowNum = allItems.indexOf(item) + 1;
                        return (
                          <tr key={item.id} style={{ transition:"background .1s" }}
                            onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background=isDark?"rgba(255,255,255,0.02)":"rgba(0,0,0,0.015)"}
                            onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background="transparent"}>
                            <td style={tdS}><span style={{ color:"var(--muted)", fontSize:11 }}>{rowNum}</span></td>

                            {tab==="arrivee" && <>
                              <td style={tdS}><strong style={{ fontSize:13 }}>{item.expediteur}</strong></td>
                              <td style={{ ...tdS, whiteSpace:"nowrap", fontSize:11, color:"var(--muted)" }}>{item.date_courrier||"—"}</td>
                              <td style={{ ...tdS, maxWidth:250 }}><TruncText text={item.objet} max={60}/></td>
                              <td style={tdS}><MonthBadge mois={item.mois}/></td>
                              <td style={tdS}><ActionBtns item={item} onPreview={handlePreview} onDownload={handleDownload} hasPdf={!!item.pdf_filename}/></td>
                            </>}

                            {tab==="bordereau" && <>
                              <td style={{ ...tdS, fontSize:11, color:"var(--muted)" }}><TruncText text={item.reference} max={28}/></td>
                              <td style={tdS}><strong style={{ fontSize:13 }}>{item.destinataire}</strong></td>
                              <td style={{ ...tdS, maxWidth:200 }}><TruncText text={item.objet} max={50}/></td>
                              <td style={{ ...tdS, fontSize:11, color:"var(--muted)", whiteSpace:"nowrap" }}>{item.created_at}</td>
                              <td style={tdS}><ActionBtns item={item} onPreview={handlePreview} onDownload={handleDownload} hasPdf={!!item.pdf_filename}/></td>
                            </>}

                            {tab==="depart" && <>
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
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}

          {/* Loading more indicator */}
          {loading && allItems.length > 0 && (
            <div style={{ textAlign:"center", padding:"20px 0", color:"var(--muted)", fontSize:12 }}>
              <span style={{ display:"inline-flex", alignItems:"center", gap:8 }}>
                <span style={{ animation:"spin 1s linear infinite", display:"inline-block" }}>⏳</span>
                Chargement des données... ({allItems.length}/{totalCount})
              </span>
            </div>
          )}

          <div ref={bottomRef}/>
        </div>

        {/* ════ RIGHT: Preview ════ */}
        {hasPrev ? (
          <div style={{ position:"sticky", top:76, maxHeight:"calc(100vh - 100px)" }}>
            <div style={{
              background:"var(--surface)",
              border:`1px solid ${activeTab.color}55`,
              borderRadius:14, overflow:"hidden",
              boxShadow:`0 0 0 3px ${activeTab.color}12`,
            }}>
              {/* Preview header */}
              <div style={{
                padding:"11px 14px", borderBottom:"1px solid var(--border)",
                display:"flex", alignItems:"center", justifyContent:"space-between",
                background:`linear-gradient(90deg,${activeTab.color}0f,transparent)`,
              }}>
                <div>
                  <div style={{ fontSize:12, fontWeight:700, color:activeTab.color }}>👁️ Aperçu PDF</div>
                  <div style={{ fontSize:10, color:"var(--muted)", marginTop:2 }}>{previewName}</div>
                </div>
                <button onClick={closePrev} style={{ background:"none", border:"none",
                  color:"var(--muted)", cursor:"pointer", fontSize:18 }}
                onMouseEnter={e=>e.currentTarget.style.color="var(--text)"}
                onMouseLeave={e=>e.currentTarget.style.color="var(--muted)"}>✕</button>
              </div>

              {previewLoading && !previewUrl && (
                <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:400, gap:10 }}>
                  <span style={{ fontSize:12, color:"var(--muted)" }}>⏳ Chargement...</span>
                </div>
              )}

              {previewUrl && (
                <iframe src={previewUrl} style={{
                  width:"100%", height:"calc(100vh - 200px)",
                  minHeight:500, border:"none", display:"block",
                }} title="PDF"/>
              )}
            </div>
          </div>
        ) : null}

        {/* Charts — only when no preview ── */}
        {!hasPrev && stats && (
          <div style={{ display:"flex", flexDirection:"column", gap:14, position:"sticky", top:76 }}>

            {/* PDF hint */}
            <div style={{
              background:"var(--surface)", border:"1px solid var(--border)",
              borderRadius:14, padding:"16px 14px",
            }}>
              <div style={{ fontSize:12, fontWeight:700, color:"var(--text2)", marginBottom:6 }}>👁️ Aperçu PDF</div>
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center",
                justifyContent:"center", padding:"20px 0", gap:10 }}>
                <div style={{ fontSize:32, opacity:.12 }}>📄</div>
                <div style={{ fontSize:12, color:"var(--muted)", textAlign:"center", lineHeight:1.6, maxWidth:160 }}>
                  Cliquez 👁️ sur une ligne pour afficher son PDF
                </div>
              </div>
            </div>

            {/* Top chart */}
            {topData?.length > 0 && (
              <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:14, padding:16 }}>
                <div style={{ fontFamily:"var(--font-head)", fontSize:13, fontWeight:700, marginBottom:12 }}>
                  {tab==="arrivee" ? "🏢 Top expéditeurs" : "🏢 Top destinataires"}
                </div>
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
                      <span style={{ fontWeight:700, color:"var(--muted)" }}>{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Year breakdown */}
            <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:14, padding:16 }}>
              <div style={{ fontFamily:"var(--font-head)", fontSize:13, fontWeight:700, marginBottom:12 }}>📅 Par année</div>
              {groupedByYear.map(([y,rows])=>(
                <div key={y} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:9 }}>
                  <button onClick={()=>scrollToYear(y)} style={{
                    background:`${activeTab.color}12`, border:`1px solid ${activeTab.color}33`,
                    borderRadius:7, padding:"2px 10px", fontSize:11, fontWeight:700,
                    color:activeTab.color, cursor:"pointer", flexShrink:0,
                  }}>{y}</button>
                  <div style={{ flex:1, height:5, background:"var(--surface2)", borderRadius:99, overflow:"hidden" }}>
                    <div style={{
                      height:"100%", background:activeTab.color, borderRadius:99,
                      width:`${Math.round((rows.length/allItems.length)*100)}%`,
                    }}/>
                  </div>
                  <span style={{ fontSize:11, color:"var(--muted)", flexShrink:0 }}>{rows.length}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes loadingBar {
          0%   { transform: translateX(-100%); }
          50%  { transform: translateX(0%); }
          100% { transform: translateX(100%); }
        }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function MonthBadge({ mois }: { mois: string }) {
  const c = getMonthColor(mois);
  return (
    <span style={{ background:c.bg, color:c.text, fontSize:10, fontWeight:600,
      padding:"3px 9px", borderRadius:99, whiteSpace:"nowrap", border:`1px solid ${c.text}33` }}>
      {mois}
    </span>
  );
}

function ActionBtns({ item, onPreview, onDownload, hasPdf }: any) {
  return (
    <div style={{ display:"flex", gap:5 }}>
      <button onClick={e=>{ e.stopPropagation(); if(hasPdf)onPreview(item); }}
        title={hasPdf?"Aperçu PDF":"Pas de PDF"}
        style={{
          width:30, height:30, borderRadius:8, border:"1px solid",
          borderColor:hasPdf?"rgba(37,99,235,0.35)":"var(--border)",
          background:hasPdf?"rgba(37,99,235,0.1)":"var(--surface2)",
          color:hasPdf?"#60a5fa":"var(--muted2)",
          cursor:hasPdf?"pointer":"not-allowed",
          display:"flex", alignItems:"center", justifyContent:"center", fontSize:13,
        }}>👁️</button>
      <button onClick={e=>{ e.stopPropagation(); if(hasPdf)onDownload(item); }}
        title={hasPdf?"Télécharger":"Pas de PDF"}
        style={{
          width:30, height:30, borderRadius:8, border:"1px solid",
          borderColor:hasPdf?"rgba(16,185,129,0.35)":"var(--border)",
          background:hasPdf?"rgba(16,185,129,0.1)":"var(--surface2)",
          color:hasPdf?"#34d399":"var(--muted2)",
          cursor:hasPdf?"pointer":"not-allowed",
          display:"flex", alignItems:"center", justifyContent:"center", fontSize:13,
        }}>⬇️</button>
    </div>
  );
}

function Th({ children }: any) {
  return <th style={{ padding:"9px 14px", textAlign:"left", fontSize:10, fontWeight:700,
    textTransform:"uppercase", letterSpacing:"0.7px", color:"var(--muted)",
    borderBottom:"1px solid var(--border)", whiteSpace:"nowrap" }}>{children}</th>;
}

function ThSort({ label, col, sortCol, sortDir, onSort }: {
  label:string; col:string; sortCol:string; sortDir:"asc"|"desc"; onSort:(c:any)=>void;
}) {
  const active = sortCol === col;
  return (
    <th onClick={()=>onSort(col)} style={{
      padding:"9px 14px", textAlign:"left", fontSize:10, fontWeight:700,
      textTransform:"uppercase", letterSpacing:"0.7px",
      color:active?"var(--accent)":"var(--muted)",
      borderBottom:"1px solid var(--border)", whiteSpace:"nowrap",
      cursor:"pointer", userSelect:"none", transition:"color 0.15s",
    }}>
      <span style={{ display:"flex", alignItems:"center", gap:4 }}>
        {label}
        <span style={{ fontSize:9, opacity:active?1:0.4 }}>
          {active?(sortDir==="asc"?"▲":"▼"):"⇅"}
        </span>
      </span>
    </th>
  );
}

function TruncText({ text, max }: { text:string; max:number }) {
  const s = text||"";
  return <span title={s} style={{ fontSize:12, color:"var(--text2)" }}>{s.length>max?s.slice(0,max)+"…":s}</span>;
}

const tdS: React.CSSProperties = { padding:"10px 14px", verticalAlign:"middle" };