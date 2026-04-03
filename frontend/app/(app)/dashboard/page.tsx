"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/lib/useTheme";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area,
} from "recharts";

const API = "http://10.23.23.144:8000";

const MONTHS_SHORT = ["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"];
const MONTHS_MAP: Record<string,string> = {
  "Janvier":"Jan","Février":"Fév","Mars":"Mar","Avril":"Avr",
  "MAI":"Mai","Mai":"Mai","juin":"Jun","Juin":"Jun",
  "juillet":"Jul","Juillet":"Jul","Août":"Aoû",
  "Septembre":"Sep","OCTOBRE":"Oct","Octobre":"Oct",
  "Novembre":"Nov","NOVOMBR":"Nov","December":"Déc","Décembre":"Déc",
};

const TYPE_COLORS: Record<string,string> = {
  PE:"#10b981", SORTIE:"#2563eb", REPRISE:"#8b5cf6",
  MALADIE:"#f59e0b", FIN_MANQUANT:"#ef4444", RC:"#38bdf8",
};
const PIE_COLORS = ["#10b981","#2563eb","#8b5cf6","#f59e0b","#ef4444","#38bdf8","#f97316"];

const HR_APPS = [
  { icon:"🟢", label:"Permission PE",     route:"/hr", color:"#10b981" },
  { icon:"🚪", label:"Autorisation Sortie",route:"/hr", color:"#2563eb" },
  { icon:"🔁", label:"Reprise Service",   route:"/hr", color:"#8b5cf6" },
  { icon:"🏥", label:"Maladie",           route:"/hr", color:"#f59e0b" },
  { icon:"⚠️", label:"Fin Manquant",      route:"/hr", color:"#ef4444" },
  { icon:"⏱️", label:"Repos Comp. (RC)",  route:"/hr", color:"#38bdf8" },
];

const COURRIER_APPS = [
  { icon:"📬", label:"Courrier Arrivée",       desc:"Consultation + recherche", route:"/courrier", color:"#2563eb" },
  { icon:"📤", label:"Bordereau d'Envoi",      desc:"Suivi bordereaux envoyés", route:"/courrier", color:"#f59e0b" },
  { icon:"🔄", label:"Courrier Départ/Récep.", desc:"Suivi départ + réception",  route:"/courrier", color:"#8b5cf6" },
];

// ── Animated counter ──────────────────────────────────────────────────────────
function useCounter(target: number) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (typeof target !== "number" || target === 0) { setCount(0); return; }
    let val = 0;
    const step = Math.max(1, Math.ceil(target / 40));
    const id = setInterval(() => {
      val = Math.min(val + step, target);
      setCount(val);
      if (val >= target) clearInterval(id);
    }, 25);
    return () => clearInterval(id);
  }, [target]);
  return count;
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ icon, value, label, trend, color, isText=false, loading=false }: any) {
  const count = useCounter(isText || loading ? 0 : value);
  const isUp = String(trend).startsWith("↑") || String(trend).startsWith("✅");

  return (
    <div className="stat-card anim-fade-up" style={{
      borderTopColor: color, cursor:"pointer",
    }}
    onMouseEnter={e=>{ (e.currentTarget as HTMLElement).style.transform="translateY(-4px)"; (e.currentTarget as HTMLElement).style.boxShadow="var(--shadow-lg)"; }}
    onMouseLeave={e=>{ (e.currentTarget as HTMLElement).style.transform="translateY(0)"; (e.currentTarget as HTMLElement).style.boxShadow="none"; }}>

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14 }}>
        <div style={{
          width:40, height:40, borderRadius:10, flexShrink:0,
          background:`${color}18`, border:`1px solid ${color}33`,
          display:"flex", alignItems:"center", justifyContent:"center", fontSize:18,
        }}>{icon}</div>
        <div style={{
          fontSize:10, fontWeight:700, padding:"3px 8px", borderRadius:99,
          background: isUp ? "var(--green-bg)" : "var(--danger-bg)",
          color: isUp ? "var(--green)" : "var(--danger)",
        }}>{trend}</div>
      </div>

      {loading ? (
        <div className="skeleton" style={{ height:36, width:"60%", marginBottom:8, borderRadius:8 }}/>
      ) : (
        <div style={{
          fontSize: isText ? 15 : 32, fontWeight:800, color,
          lineHeight:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
          fontFamily:"var(--font-head)",
        }}>
          {isText ? value : count}
        </div>
      )}
      <div style={{ fontSize:12, color:"var(--muted)", marginTop:6 }}>{label}</div>
    </div>
  );
}

// =============================================================================
export default function DashboardPage() {
  const router = useRouter();
  const { isDark } = useTheme();
  const [user,    setUser]    = useState<any>(null);
  const [token,   setToken]   = useState("");
  const [stats,   setStats]   = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("user");
    const tok    = localStorage.getItem("token");
    if (!stored || !tok) { router.push("/"); return; }
    setUser(JSON.parse(stored));
    setToken(tok);
  }, [router]);

  const fetchStats = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API}/stats/dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setStats(await res.json());
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => {
    if (!token) return;
    const id = setInterval(fetchStats, 60000);
    return () => clearInterval(id);
  }, [token, fetchStats]);

  // Chart data
  const barData = MONTHS_SHORT.map((m, i) => {
    const monthNum = String(i + 1).padStart(2, "0");
    const courrier = stats?.monthly_courrier?.find((d: any) => (MONTHS_MAP[d.mois] || d.mois?.slice(0,3)) === m)?.count || 0;
    const docs     = stats?.monthly_docs?.find((d: any) => d.month === monthNum)?.count || 0;
    return { month: m, courrier, documents: docs };
  });

  const pieData = stats?.type_counts?.length > 0
    ? stats.type_counts.map((t: any, i: number) => ({ name:t.type, value:t.count, color:TYPE_COLORS[t.type]||PIE_COLORS[i] }))
    : [
        { name:"Courrier",   value:stats?.courrier_total||0,  color:"#2563eb" },
        { name:"RH",         value:stats?.docs_rh_total||0,   color:"#10b981" },
        { name:"Bordereau",  value:stats?.bordereau_total||0, color:"#f59e0b" },
        { name:"Départ",     value:stats?.depart_total||0,    color:"#8b5cf6" },
      ];

  const areaData = Array.from({ length:30 }, (_, i) => {
    const found = stats?.daily_activity?.find((d: any) => d.day === i+1);
    return { day:i+1, value:found?.value||0 };
  });

  const maxVal = Math.max(stats?.courrier_total||0, stats?.bordereau_total||0, stats?.depart_total||0, stats?.docs_rh_total||0, 1);

  const tooltipStyle = {
    background: isDark ? "#0d1422" : "#fff",
    border:`1px solid var(--border2)`,
    borderRadius:10, fontSize:12,
    boxShadow:"var(--shadow-md)",
    color:"var(--text)",
  };
  const tickColor = "var(--muted)";

  if (!user) return null;

  return (
    <div style={{ padding:"24px 28px", animation:"fadeUp .45s cubic-bezier(0.16,1,0.3,1) both" }}>

      {/* ── Page header ── */}
      <div style={{ marginBottom:28 }}>
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
          <div>
            <h1 style={{
              fontFamily:"var(--font-head)", fontSize:24, fontWeight:800,
              marginBottom:5, color:"var(--text)",
            }}>
              Vue d'ensemble 👋
            </h1>
            <p style={{ color:"var(--muted)", fontSize:13 }}>
              Bienvenue, <strong style={{ color:"var(--text2)" }}>{user.nom_prenom}</strong> —{" "}
              {new Date().toLocaleDateString("fr-FR",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}
            </p>
          </div>

          {/* Live indicator */}
          <div style={{
            display:"flex", alignItems:"center", gap:8,
            background:"var(--surface)", border:"1px solid var(--border)",
            borderRadius:10, padding:"8px 14px", fontSize:12,
          }}>
            <div style={{
              width:7, height:7, borderRadius:"50%", background:"var(--green)",
              boxShadow:"0 0 0 3px var(--green-bg)",
              animation:"pulse 2s ease-in-out infinite",
            }}/>
            <span style={{ color:"var(--text2)", fontWeight:500 }}>Données en temps réel</span>
            <button onClick={fetchStats} style={{
              background:"none", border:"none", color:"var(--muted)",
              cursor:"pointer", fontSize:13, padding:"0 0 0 4px",
              transition:"color 0.15s",
            }}
            onMouseEnter={e=>e.currentTarget.style.color="var(--text)"}
            onMouseLeave={e=>e.currentTarget.style.color="var(--muted)"}>
              🔄
            </button>
          </div>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:24 }}>
        <KpiCard icon="📬" value={stats?.courrier_total||0}
          label="Courriers reçus"
          trend={stats?.courrier_total > 0 ? `↑ ${stats.courrier_total} total` : "— aucun"}
          color="var(--accent)" loading={loading}/>
        <KpiCard icon="📄" value={stats?.docs_rh_total||0}
          label="Documents RH générés"
          trend={stats?.docs_rh_ce_mois > 0 ? `↑ +${stats.docs_rh_ce_mois} ce mois` : "↑ aucun ce mois"}
          color="var(--green)" loading={loading}/>
        <KpiCard icon="📤" value={stats?.bordereau_total||0}
          label="Bordereaux d'envoi"
          trend={stats?.bordereau_total > 0 ? `↑ ${stats.bordereau_total} total` : "— aucun"}
          color="var(--gold)" loading={loading}/>
        <KpiCard icon="⚠️" value={stats?.pending_pdfs||0}
          label="PDFs en attente"
          trend={stats?.pending_pdfs > 0 ? "↓ à traiter" : "✅ scan_inbox vide"}
          color={stats?.pending_pdfs > 0 ? "var(--danger)" : "var(--green)"} loading={loading}/>
      </div>

      {/* ── Quick access: HR Apps ── */}
      <div style={{
        background:"var(--surface)", border:"1px solid var(--border)",
        borderRadius:"var(--radius-lg)", padding:20, marginBottom:16,
      }}>
        <div style={{
          display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16,
        }}>
          <div style={{ fontFamily:"var(--font-head)", fontSize:14, fontWeight:700 }}>
            🗂️ Applications RH
          </div>
          <span style={{ fontSize:11, color:"var(--muted)" }}>Cliquez pour ouvrir</span>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:10 }}>
          {HR_APPS.map((app,i)=>(
            <button key={i} onClick={()=>router.push(app.route)}
              className={`anim-fade-up-${Math.min(i+1,5)}`}
              style={{
                background:`${app.color}0d`,
                border:`1px solid ${app.color}33`,
                borderRadius:12, padding:"14px 8px", cursor:"pointer",
                display:"flex", flexDirection:"column", alignItems:"center", gap:8,
                transition:"all 0.2s", fontFamily:"var(--font-body)",
              }}
              onMouseEnter={e=>{
                (e.currentTarget as HTMLElement).style.background=`${app.color}1a`;
                (e.currentTarget as HTMLElement).style.borderColor=`${app.color}66`;
                (e.currentTarget as HTMLElement).style.transform="translateY(-3px)";
                (e.currentTarget as HTMLElement).style.boxShadow=`0 8px 20px ${app.color}22`;
              }}
              onMouseLeave={e=>{
                (e.currentTarget as HTMLElement).style.background=`${app.color}0d`;
                (e.currentTarget as HTMLElement).style.borderColor=`${app.color}33`;
                (e.currentTarget as HTMLElement).style.transform="translateY(0)";
                (e.currentTarget as HTMLElement).style.boxShadow="none";
              }}
            >
              <span style={{ fontSize:22 }}>{app.icon}</span>
              <span style={{ fontSize:11, fontWeight:500, textAlign:"center", color:"var(--text2)", lineHeight:1.3 }}>
                {app.label}
              </span>
              <span style={{
                fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:99,
                background:"var(--green-bg)", color:"var(--green)",
              }}>Disponible</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Courrier Apps ── */}
      <div style={{
        background:"var(--surface)", border:"1px solid var(--border)",
        borderRadius:"var(--radius-lg)", padding:20, marginBottom:24,
      }}>
        <div style={{
          display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16,
        }}>
          <div style={{ fontFamily:"var(--font-head)", fontSize:14, fontWeight:700 }}>
            📬 Gestion du Courrier
          </div>
          <span style={{ fontSize:11, color:"var(--muted)" }}>Consultation + recherche + statistiques</span>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12 }}>
          {COURRIER_APPS.map((app,i)=>(
            <button key={i} onClick={()=>router.push(app.route)}
              style={{
                background:`${app.color}0d`, border:`1px solid ${app.color}33`,
                borderRadius:12, padding:"16px 18px", cursor:"pointer",
                display:"flex", alignItems:"center", gap:14,
                transition:"all 0.2s", textAlign:"left", fontFamily:"var(--font-body)",
              }}
              onMouseEnter={e=>{
                (e.currentTarget as HTMLElement).style.background=`${app.color}1a`;
                (e.currentTarget as HTMLElement).style.transform="translateY(-2px)";
                (e.currentTarget as HTMLElement).style.boxShadow=`0 8px 24px ${app.color}22`;
                (e.currentTarget as HTMLElement).style.borderColor=`${app.color}66`;
              }}
              onMouseLeave={e=>{
                (e.currentTarget as HTMLElement).style.background=`${app.color}0d`;
                (e.currentTarget as HTMLElement).style.transform="translateY(0)";
                (e.currentTarget as HTMLElement).style.boxShadow="none";
                (e.currentTarget as HTMLElement).style.borderColor=`${app.color}33`;
              }}
            >
              <div style={{
                width:44, height:44, borderRadius:12, flexShrink:0,
                background:`${app.color}18`, border:`1px solid ${app.color}33`,
                display:"flex", alignItems:"center", justifyContent:"center", fontSize:22,
              }}>{app.icon}</div>
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:"var(--text)", marginBottom:3 }}>{app.label}</div>
                <div style={{ fontSize:11, color:"var(--muted)" }}>{app.desc}</div>
              </div>
              <div style={{ marginLeft:"auto", color:app.color, fontSize:18, opacity:0.5 }}>→</div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Charts row ── */}
      <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:16, marginBottom:16 }}>

        {/* Bar chart */}
        <div className="chart-card">
          <div className="chart-title">
            Activité mensuelle
            <span style={{ fontSize:11, color:"var(--muted)", fontWeight:400 }}>
              {loading ? "Chargement..." : "Courriers + Documents RH · 2026"}
            </span>
          </div>
          {loading ? (
            <div className="skeleton" style={{ height:180, borderRadius:10 }}/>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={barData} barGap={4}>
                <XAxis dataKey="month" tick={{fill:tickColor,fontSize:11}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fill:tickColor,fontSize:11}} axisLine={false} tickLine={false}/>
                <Tooltip contentStyle={tooltipStyle} cursor={{fill:"rgba(128,128,128,0.05)"}}/>
                <Bar dataKey="courrier"  fill="#2563eb" radius={[4,4,0,0]} name="Courrier"/>
                <Bar dataKey="documents" fill="#10b981" radius={[4,4,0,0]} name="Documents RH"/>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Pie chart */}
        <div className="chart-card">
          <div className="chart-title">
            Répartition
            {stats?.docs_rh_total > 0 && (
              <span style={{ fontSize:11, color:"var(--muted)", fontWeight:400 }}>{stats.docs_rh_total} docs</span>
            )}
          </div>
          {loading ? (
            <div className="skeleton" style={{ height:180, borderRadius:10 }}/>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={38} outerRadius={60}
                    dataKey="value" paddingAngle={3}>
                    {pieData.map((d:any,i:number)=><Cell key={i} fill={d.color}/>)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle}/>
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
                {pieData.map((d:any,i:number)=>(
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:8, fontSize:12 }}>
                    <div style={{ width:8, height:8, borderRadius:"50%", background:d.color, flexShrink:0 }}/>
                    <span style={{ flex:1, color:"var(--text2)" }}>{d.name}</span>
                    <span style={{ fontWeight:700, color:"var(--text2)" }}>{d.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Area chart ── */}
      <div className="chart-card" style={{ marginBottom:16 }}>
        <div className="chart-title">
          Activité des 30 derniers jours
          <span style={{ fontSize:11, color:"var(--muted)", fontWeight:400 }}>
            {loading ? "Chargement..." : "Documents RH / jour"}
          </span>
        </div>
        {loading ? (
          <div className="skeleton" style={{ height:120, borderRadius:10 }}/>
        ) : (
          <ResponsiveContainer width="100%" height={120}>
            <AreaChart data={areaData}>
              <defs>
                <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#2563eb" stopOpacity={0.25}/>
                  <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="day" tick={{fill:tickColor,fontSize:10}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fill:tickColor,fontSize:10}} axisLine={false} tickLine={false}/>
              <Tooltip contentStyle={tooltipStyle} cursor={{stroke:"rgba(128,128,128,0.15)"}}/>
              <Area type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={2}
                fill="url(#areaGrad)" name="Documents RH"/>
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Bottom row ── */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>

        {/* Activité récente */}
        <div style={{
          background:"var(--surface)", border:"1px solid var(--border)",
          borderRadius:"var(--radius-lg)", padding:20,
        }}>
          <div style={{
            display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16,
            fontFamily:"var(--font-head)", fontSize:14, fontWeight:700,
          }}>
            Activité récente
            <button onClick={fetchStats} style={{
              background:"var(--surface2)", border:"1px solid var(--border2)",
              borderRadius:7, padding:"4px 10px", color:"var(--muted)",
              cursor:"pointer", fontSize:11, fontWeight:500, transition:"all 0.15s",
            }}
            onMouseEnter={e=>(e.currentTarget.style.color="var(--text)")}
            onMouseLeave={e=>(e.currentTarget.style.color="var(--muted)")}>
              🔄 Actualiser
            </button>
          </div>

          {loading ? (
            Array.from({length:5}).map((_,i)=>(
              <div key={i} style={{ display:"flex", gap:12, padding:"10px 0", borderBottom:i<4?"1px solid var(--border)":"none" }}>
                <div className="skeleton" style={{ width:8, height:8, borderRadius:"50%", marginTop:5, flexShrink:0 }}/>
                <div style={{ flex:1 }}>
                  <div className="skeleton" style={{ height:14, width:"70%", marginBottom:6, borderRadius:6 }}/>
                  <div className="skeleton" style={{ height:11, width:"40%", borderRadius:6 }}/>
                </div>
              </div>
            ))
          ) : stats?.recent_activity?.length > 0 ? (
            stats.recent_activity.slice(0,6).map((item:any,i:number)=>(
              <div key={i} style={{
                display:"flex", alignItems:"flex-start", gap:12,
                padding:"10px 0",
                borderBottom:i<Math.min(stats.recent_activity.length,6)-1?"1px solid var(--border)":"none",
              }}>
                <div style={{
                  width:8, height:8, borderRadius:"50%",
                  background:item.color, marginTop:5, flexShrink:0,
                }}/>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, color:"var(--text)" }}>
                    <strong>{item.text}</strong>
                    <span style={{ color:"var(--muted)" }}> — {item.sub}</span>
                  </div>
                  <div style={{ fontSize:11, color:"var(--muted)", marginTop:2 }}>{item.time}</div>
                </div>
              </div>
            ))
          ) : (
            <div style={{
              textAlign:"center", padding:"30px 0",
              color:"var(--muted)", fontSize:13,
            }}>
              Aucune activité récente
            </div>
          )}
        </div>

        {/* Stats + Alertes */}
        <div style={{
          background:"var(--surface)", border:"1px solid var(--border)",
          borderRadius:"var(--radius-lg)", padding:20,
        }}>
          <div style={{
            fontFamily:"var(--font-head)", fontSize:14, fontWeight:700, marginBottom:16,
          }}>
            Système
          </div>

          {/* Alertes */}
          <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:20 }}>
            {stats?.pending_pdfs > 0 ? (
              <div style={{
                display:"flex", alignItems:"center", gap:10,
                padding:"9px 12px", background:"var(--gold-bg)",
                border:"1px solid rgba(245,158,11,0.2)", borderRadius:10, fontSize:12,
              }}>
                <span>⚠️</span>
                <span style={{ color:"var(--gold)", fontWeight:500 }}>
                  {stats.pending_pdfs} PDF(s) en attente dans scan_inbox
                </span>
              </div>
            ) : (
              <div style={{
                display:"flex", alignItems:"center", gap:10,
                padding:"9px 12px", background:"var(--green-bg)",
                border:"1px solid rgba(16,185,129,0.2)", borderRadius:10, fontSize:12,
              }}>
                <span>✅</span>
                <span style={{ color:"var(--green)", fontWeight:500 }}>scan_inbox vide — aucun PDF en attente</span>
              </div>
            )}
            <div style={{
              display:"flex", alignItems:"center", gap:10,
              padding:"9px 12px", background:"var(--green-bg)",
              border:"1px solid rgba(16,185,129,0.2)", borderRadius:10, fontSize:12,
            }}>
              <span>✅</span>
              <span style={{ color:"var(--green)", fontWeight:500 }}>Aucune erreur critique détectée</span>
            </div>
            <div style={{
              display:"flex", alignItems:"center", gap:10,
              padding:"9px 12px", background:"var(--info-bg)",
              border:"1px solid rgba(56,189,248,0.2)", borderRadius:10, fontSize:12,
            }}>
              <span>ℹ️</span>
              <span style={{ color:"var(--info)", fontWeight:500 }}>
                Sync : {new Date().toLocaleDateString("fr-FR")} {new Date().toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}
              </span>
            </div>
          </div>

          {/* Stats bars */}
          <div style={{ fontWeight:600, fontSize:12, color:"var(--text2)", marginBottom:14 }}>
            Statistiques réelles
          </div>
          {[
            { label:"Courrier arrivée",   val:stats?.courrier_total||0,  color:"#2563eb" },
            { label:"Bordereaux envoyés", val:stats?.bordereau_total||0, color:"#f59e0b" },
            { label:"Courrier départ",    val:stats?.depart_total||0,    color:"#8b5cf6" },
            { label:"Documents RH",       val:stats?.docs_rh_total||0,   color:"#10b981" },
          ].map((p,i)=>{
            const pct = Math.round((p.val / maxVal) * 100);
            return (
              <div key={i} style={{ marginBottom:11 }}>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:5 }}>
                  <span style={{ color:"var(--text2)" }}>{p.label}</span>
                  <span style={{ color:p.color, fontWeight:700 }}>{p.val}</span>
                </div>
                <div style={{ height:5, background:"var(--surface2)", borderRadius:99, overflow:"hidden" }}>
                  {loading ? (
                    <div className="skeleton" style={{ height:"100%", width:"100%", borderRadius:99 }}/>
                  ) : (
                    <div style={{
                      height:"100%", width:`${pct}%`, background:p.color,
                      borderRadius:99, transition:"width 1.2s cubic-bezier(.4,0,.2,1)",
                    }}/>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Footer ── */}
      <div style={{
        textAlign:"center", marginTop:32, fontSize:11, color:"var(--muted)",
        paddingTop:18, borderTop:"1px solid var(--border)",
        display:"flex", alignItems:"center", justifyContent:"center", gap:12,
      }}>
        <span>© 2026 — Portail RH DTC/TQ</span>
        <span style={{ opacity:.3 }}>·</span>
        <span>Développé par <strong style={{ color:"var(--text2)" }}>JABBARI ILYASS</strong></span>
        {stats && <>
          <span style={{ opacity:.3 }}>·</span>
          <span style={{
            background:"var(--surface2)", border:"1px solid var(--border2)",
            borderRadius:99, padding:"2px 10px", fontSize:10,
          }}>
            {stats.courrier_total + stats.bordereau_total + stats.depart_total + stats.docs_rh_total} enregistrements
          </span>
        </>}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 0 3px var(--green-bg); }
          50%       { box-shadow: 0 0 0 6px transparent; }
        }
      `}</style>
    </div>
  );
}