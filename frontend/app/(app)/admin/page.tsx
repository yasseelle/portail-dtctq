"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from "recharts";

const API = "http://10.23.23.144:8000";
const SUPER_ADMIN = "84488R";

const TYPE_COLORS: Record<string, string> = {
  PE: "#10b981", SORTIE: "#2563eb", REPRISE: "#8b5cf6",
  MALADIE: "#f59e0b", FIN_MANQUANT: "#ef4444", RC: "#38bdf8",
};
const PIE_COLORS = ["#10b981","#2563eb","#8b5cf6","#f59e0b","#ef4444","#38bdf8"];

type Tab = "overview" | "agents" | "history";

export default function AdminPage() {
  const router = useRouter();
  const [user,    setUser]    = useState<any>(null);
  const [token,   setToken]   = useState("");
  const [tab,     setTab]     = useState<Tab>("overview");
  const [stats,   setStats]   = useState<any>(null);
  const [agents,  setAgents]  = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [histTotal, setHistTotal] = useState(0);
  const [histPage,  setHistPage]  = useState(1);
  const [loading, setLoading] = useState(false);

  // ── Add agent form ──
  const [showAdd,     setShowAdd]     = useState(false);
  const [addNom,      setAddNom]      = useState("");
  const [addMat,      setAddMat]      = useState("");
  const [addUnite,    setAddUnite]    = useState("");
  const [addDest,     setAddDest]     = useState("");
  const [addRole,     setAddRole]     = useState("agent");
  const [addLoading,  setAddLoading]  = useState(false);
  const [addMsg,      setAddMsg]      = useState("");

  // ── Reset pwd ──
  const [resetAgent,  setResetAgent]  = useState<any>(null);
  const [resetPwd,    setResetPwd]    = useState("");
  const [resetMsg,    setResetMsg]    = useState("");

  // ── Delete confirm ──
  const [deleteAgent, setDeleteAgent] = useState<any>(null);
  const [deleteMsg,   setDeleteMsg]   = useState("");

  // ── Filters ──
  const [filterType,  setFilterType]  = useState("");
  const [filterAgent, setFilterAgent] = useState("");
  const [agentSearch, setAgentSearch] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem("user");
    const tok    = localStorage.getItem("token");
    if (!stored || !tok) { router.push("/"); return; }
    const u = JSON.parse(stored);
    if (u.role !== "admin") { router.push("/dashboard"); return; }
    setUser(u); setToken(tok);
  }, [router]);

  const fetchStats = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API}/admin/stats`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setStats(await res.json());
    } catch { /* silent */ }
  }, [token]);

  const fetchAgents = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/admin/agents`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setAgents(await res.json());
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [token]);

  const fetchHistory = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(histPage), limit: "30",
        ...(filterType  ? { type_doc: filterType  } : {}),
        ...(filterAgent ? { user_id:  filterAgent  } : {}),
      });
      const res = await fetch(`${API}/admin/history?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { const d = await res.json(); setHistory(d.items); setHistTotal(d.total); }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [token, histPage, filterType, filterAgent]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { if (tab === "agents")  fetchAgents();  }, [tab, fetchAgents]);
  useEffect(() => { if (tab === "history") fetchHistory(); }, [tab, fetchHistory, histPage, filterType, filterAgent]);

  const isSuperAdmin = user?.matricule === SUPER_ADMIN;

  // ── Add agent ──
  async function handleAdd(e: React.FormEvent) {
    e.preventDefault(); setAddLoading(true); setAddMsg("");
    try {
      const res = await fetch(`${API}/admin/agents/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ nom_prenom: addNom, matricule: addMat, unite: addUnite,
          destinataire: addDest, role: addRole }),
      });
      const d = await res.json();
      if (res.ok) {
        setAddMsg(d.message); setAddNom(""); setAddMat(""); setAddUnite(""); setAddDest("");
        setAddRole("agent"); setShowAdd(false); fetchAgents(); fetchStats();
      } else { setAddMsg(`❌ ${d.detail}`); }
    } catch { setAddMsg("❌ Erreur serveur"); }
    finally { setAddLoading(false); }
  }

  // ── Reset password ──
  async function handleReset() {
    if (!resetAgent || !resetPwd) return;
    try {
      const res = await fetch(`${API}/admin/agents/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ user_id: resetAgent.id, new_password: resetPwd }),
      });
      const d = await res.json();
      setResetMsg(res.ok ? d.message : `❌ ${d.detail}`);
      if (res.ok) { setTimeout(() => { setResetAgent(null); setResetPwd(""); setResetMsg(""); }, 2000); }
    } catch { setResetMsg("❌ Erreur serveur"); }
  }

  // ── Delete ──
  async function handleDelete() {
    if (!deleteAgent) return;
    try {
      const res = await fetch(`${API}/admin/agents/${deleteAgent.id}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json();
      setDeleteMsg(res.ok ? d.message : `❌ ${d.detail}`);
      if (res.ok) { setTimeout(() => { setDeleteAgent(null); setDeleteMsg(""); fetchAgents(); fetchStats(); }, 1500); }
    } catch { setDeleteMsg("❌ Erreur serveur"); }
  }

  // ── Change role ──
  async function handleRoleChange(agent: any, newRole: string) {
    try {
      const res = await fetch(`${API}/admin/agents/change-role`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ user_id: agent.id, new_role: newRole }),
      });
      const d = await res.json();
      if (res.ok) fetchAgents();
      else alert(d.detail);
    } catch { /* silent */ }
  }

  const filteredAgents = agents.filter(a =>
    !agentSearch ||
    a.nom_prenom.toLowerCase().includes(agentSearch.toLowerCase()) ||
    a.matricule.includes(agentSearch)
  );

  if (!user) return null;

  return (
    <div style={{ minHeight:"100vh", background:"var(--bg)", padding:28 }}>

      {/* Header */}
      <div style={{ marginBottom:24 }}>
        <button onClick={() => router.push("/dashboard")}
          style={{ background:"none",border:"none",color:"var(--muted)",cursor:"pointer",fontSize:13,marginBottom:10 }}>
          ← Retour au dashboard
        </button>
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between" }}>
          <div>
            <h1 style={{ fontFamily:"var(--font-head)",fontSize:26,fontWeight:800 }}>👑 Panel Admin</h1>
            <p style={{ color:"var(--muted)",fontSize:13,marginTop:5 }}>
              Gestion des agents · Historique · Statistiques
              {isSuperAdmin && <span style={{ marginLeft:8,color:"#f59e0b",fontWeight:700 }}>⚡ Super Admin</span>}
            </p>
          </div>
          <button onClick={() => setShowAdd(true)} style={{
            background:"linear-gradient(135deg,#2563eb,#1d4ed8)",border:"none",
            borderRadius:10,padding:"10px 18px",color:"#fff",
            fontSize:13,fontWeight:700,cursor:"pointer",
          }}>
            ➕ Ajouter un agent
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:"flex",gap:8,marginBottom:24 }}>
        {([
          { key:"overview", icon:"📊", label:"Vue d'ensemble" },
          { key:"agents",   icon:"👥", label:`Agents (${stats?.total_agents||0})` },
          { key:"history",  icon:"📋", label:`Historique (${stats?.total_docs||0})` },
        ] as {key:Tab,icon:string,label:string}[]).map(t=>(
          <button key={t.key} onClick={()=>setTab(t.key)} style={{
            padding:"9px 18px",borderRadius:10,border:"1px solid",
            borderColor:tab===t.key?"#2563eb":"var(--border)",
            background:tab===t.key?"rgba(37,99,235,0.12)":"var(--surface)",
            color:tab===t.key?"#60a5fa":"var(--muted)",
            fontSize:13,fontWeight:600,cursor:"pointer",
            display:"flex",alignItems:"center",gap:7,
          }}>{t.icon} {t.label}</button>
        ))}
      </div>

      {/* ════ TAB: OVERVIEW ════ */}
      {tab === "overview" && stats && (
        <div>
          {/* KPIs */}
          <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:24 }}>
            {[
              { icon:"👥", val:stats.total_agents,  lbl:"Total agents",        color:"#2563eb" },
              { icon:"👑", val:stats.total_admins,  lbl:"Admins",              color:"#f59e0b" },
              { icon:"📄", val:stats.total_docs,    lbl:"Documents générés",   color:"#10b981" },
              { icon:"📅", val:stats.docs_ce_mois,  lbl:"Documents ce mois",   color:"#8b5cf6" },
            ].map((k,i)=>(
              <div key={i} style={{
                background:"var(--surface)",border:"1px solid var(--border)",
                borderTop:`2px solid ${k.color}`,borderRadius:16,padding:20,
              }}>
                <div style={{fontSize:20,marginBottom:10}}>{k.icon}</div>
                <div style={{fontSize:32,fontWeight:900,color:k.color}}>{k.val}</div>
                <div style={{fontSize:11,color:"var(--muted)",marginTop:5}}>{k.lbl}</div>
              </div>
            ))}
          </div>

          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:20 }}>

            {/* Bar chart — activity */}
            <div style={cardStyle}>
              <div style={titleStyle}>📈 Activité 30 derniers jours</div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={stats.daily_activity}>
                  <XAxis dataKey="day" tick={{fill:"#5a6a82",fontSize:9}} axisLine={false} tickLine={false}
                    tickFormatter={d=>d.slice(8)}/>
                  <YAxis tick={{fill:"#5a6a82",fontSize:9}} axisLine={false} tickLine={false}/>
                  <Tooltip contentStyle={{background:"#0d1420",border:"1px solid rgba(255,255,255,0.06)",borderRadius:8,fontSize:11}}
                    cursor={{fill:"rgba(255,255,255,0.03)"}}/>
                  <Bar dataKey="count" fill="#2563eb" radius={[4,4,0,0]} name="Documents"/>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Pie — par type */}
            <div style={cardStyle}>
              <div style={titleStyle}>📋 Documents par type</div>
              {stats.by_type.length > 0 ? (
                <>
                  <div style={{ display:"flex",justifyContent:"center" }}>
                    <PieChart width={180} height={150}>
                      <Pie data={stats.by_type.map((t:any)=>({name:t.type,value:t.count}))}
                        cx={90} cy={70} innerRadius={40} outerRadius={65}
                        dataKey="value" paddingAngle={3}>
                        {stats.by_type.map((_:any,i:number)=>(
                          <Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]}/>
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{background:"#0d1420",border:"1px solid rgba(255,255,255,0.06)",borderRadius:8,fontSize:11}}/>
                    </PieChart>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:6}}>
                    {stats.by_type.map((t:any,i:number)=>(
                      <div key={i} style={{display:"flex",alignItems:"center",gap:8,fontSize:12}}>
                        <div style={{width:10,height:10,borderRadius:3,
                          background:TYPE_COLORS[t.type]||PIE_COLORS[i%PIE_COLORS.length],flexShrink:0}}/>
                        <span style={{flex:1}}>{t.type}</span>
                        <span style={{fontWeight:700,color:"var(--muted)"}}>{t.count}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{color:"var(--muted)",textAlign:"center",padding:"40px 0",fontSize:13}}>
                  Aucun document RH généré
                </div>
              )}
            </div>

            {/* Top agents */}
            <div style={{...cardStyle, gridColumn:"1 / -1"}}>
              <div style={titleStyle}>🏆 Agents les plus actifs</div>
              {stats.top_agents.length > 0 ? (
                <table style={{width:"100%",borderCollapse:"collapse"}}>
                  <thead>
                    <tr style={{background:"var(--surface2)"}}>
                      {["Rang","Agent","Matricule","Unité","Documents","Rôle"].map(h=>(
                        <th key={h} style={{padding:"8px 12px",textAlign:"left",fontSize:10,
                          fontWeight:700,textTransform:"uppercase",letterSpacing:".6px",
                          color:"var(--muted)",borderBottom:"1px solid var(--border)"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stats.top_agents.map((a:any,i:number)=>(
                      <tr key={a.id} style={{borderBottom:"1px solid rgba(255,255,255,0.03)"}}>
                        <td style={tdStyle}>
                          <span style={{
                            fontWeight:900,fontSize:16,
                            color:i===0?"#f59e0b":i===1?"#94a3b8":i===2?"#b45309":"var(--muted)",
                          }}>{i===0?"🥇":i===1?"🥈":i===2?"🥉":`#${i+1}`}</span>
                        </td>
                        <td style={tdStyle}><strong>{a.nom_prenom}</strong></td>
                        <td style={{...tdStyle,fontSize:11,color:"var(--muted)"}}>{a.matricule}</td>
                        <td style={{...tdStyle,fontSize:11}}>{a.unite}</td>
                        <td style={tdStyle}>
                          <span style={{
                            background:"rgba(16,185,129,0.12)",color:"#34d399",
                            fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:20,
                          }}>{a.count} docs</span>
                        </td>
                        <td style={tdStyle}>
                          <span style={{
                            background:a.role==="admin"?"rgba(245,158,11,0.12)":"rgba(37,99,235,0.12)",
                            color:a.role==="admin"?"#fbbf24":"#60a5fa",
                            fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:20,
                          }}>{a.role==="admin"?"👑 Admin":"👤 Agent"}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{color:"var(--muted)",textAlign:"center",padding:"30px 0",fontSize:13}}>
                  Aucune activité enregistrée
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ════ TAB: AGENTS ════ */}
      {tab === "agents" && (
        <div>
          {/* Search */}
          <div style={{
            background:"var(--surface)",border:"1px solid var(--border)",
            borderRadius:14,padding:12,marginBottom:16,
            display:"flex",gap:10,alignItems:"center",
          }}>
            <div style={{position:"relative",flex:1}}>
              <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:"var(--muted)"}}>🔍</span>
              <input value={agentSearch} onChange={e=>setAgentSearch(e.target.value)}
                placeholder="Rechercher par nom ou matricule..."
                style={{width:"100%",background:"var(--surface2)",border:"1px solid var(--border)",
                  borderRadius:10,padding:"9px 12px 9px 36px",color:"var(--text)",fontSize:13,outline:"none"}}/>
            </div>
            <span style={{fontSize:12,color:"var(--muted)",whiteSpace:"nowrap"}}>
              {filteredAgents.length} agent(s)
            </span>
          </div>

          {/* Agents table */}
          <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden"}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead>
                <tr style={{background:"var(--surface2)"}}>
                  {["Agent","Matricule","Unité","Rôle","Documents","Dernière activité","Actions"].map(h=>(
                    <th key={h} style={{padding:"9px 12px",textAlign:"left",fontSize:10,fontWeight:700,
                      textTransform:"uppercase",letterSpacing:".6px",color:"var(--muted)",
                      borderBottom:"1px solid var(--border)"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredAgents.map(a=>(
                  <tr key={a.id} style={{borderBottom:"1px solid rgba(255,255,255,0.03)",
                    background:a.is_super_admin?"rgba(245,158,11,0.04)":"transparent"}}>
                    <td style={tdStyle}>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <div style={{
                          width:32,height:32,borderRadius:"50%",flexShrink:0,
                          background:a.role==="admin"?"linear-gradient(135deg,#7c3aed,#2563eb)":"linear-gradient(135deg,#0d9488,#10b981)",
                          display:"flex",alignItems:"center",justifyContent:"center",
                          fontSize:11,fontWeight:700,color:"#fff",
                        }}>
                          {a.nom_prenom.split(" ").map((n:string)=>n[0]).join("").slice(0,2)}
                        </div>
                        <div>
                          <div style={{fontSize:13,fontWeight:600}}>
                            {a.nom_prenom}
                            {a.is_super_admin && <span style={{marginLeft:6,fontSize:10,color:"#f59e0b"}}>⚡ Super Admin</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{...tdStyle,fontSize:11,color:"var(--muted)"}}>{a.matricule}</td>
                    <td style={{...tdStyle,fontSize:11}}>{a.unite}</td>
                    <td style={tdStyle}>
                      {a.is_super_admin ? (
                        <span style={{background:"rgba(245,158,11,0.15)",color:"#f59e0b",
                          fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:20}}>⚡ Super Admin</span>
                      ) : (
                        <select value={a.role}
                          onChange={e=>handleRoleChange(a,e.target.value)}
                          disabled={!isSuperAdmin && a.role==="admin"}
                          style={{background:"var(--surface2)",border:"1px solid var(--border)",
                            borderRadius:8,padding:"4px 8px",fontSize:11,fontWeight:700,
                            color:a.role==="admin"?"#fbbf24":"#60a5fa",cursor:"pointer",outline:"none"}}>
                          <option value="agent">👤 Agent</option>
                          <option value="admin">👑 Admin</option>
                        </select>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <span style={{background:"rgba(16,185,129,0.1)",color:"#34d399",
                        fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:20}}>
                        {a.doc_count}
                      </span>
                    </td>
                    <td style={{...tdStyle,fontSize:11,color:"var(--muted)"}}>{a.last_activity}</td>
                    <td style={tdStyle}>
                      <div style={{display:"flex",gap:6}}>
                        {/* Reset password */}
                        {!a.is_super_admin && (
                          <button onClick={()=>setResetAgent(a)} style={{
                            background:"rgba(37,99,235,0.1)",border:"1px solid rgba(37,99,235,0.3)",
                            borderRadius:7,padding:"5px 10px",color:"#60a5fa",
                            fontSize:11,fontWeight:600,cursor:"pointer",
                          }}>🔑 Reset</button>
                        )}
                        {/* Delete */}
                        {!a.is_super_admin && a.id !== parseInt(user.id) && (
                          <button onClick={()=>setDeleteAgent(a)} style={{
                            background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.25)",
                            borderRadius:7,padding:"5px 10px",color:"#f87171",
                            fontSize:11,fontWeight:600,cursor:"pointer",
                          }}>🗑️</button>
                        )}
                        {a.is_super_admin && (
                          <span style={{fontSize:11,color:"var(--muted)",fontStyle:"italic"}}>protégé</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ════ TAB: HISTORY ════ */}
      {tab === "history" && (
        <div>
          {/* Filters */}
          <div style={{
            background:"var(--surface)",border:"1px solid var(--border)",
            borderRadius:14,padding:12,marginBottom:16,
            display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",
          }}>
            <select value={filterType} onChange={e=>{setFilterType(e.target.value);setHistPage(1);}} style={selStyle}>
              <option value="">Tous les types</option>
              {["PE","SORTIE","REPRISE","MALADIE","FIN_MANQUANT","RC"].map(t=>(
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <select value={filterAgent} onChange={e=>{setFilterAgent(e.target.value);setHistPage(1);}} style={selStyle}>
              <option value="">Tous les agents</option>
              {agents.map(a=><option key={a.id} value={a.id}>{a.nom_prenom}</option>)}
            </select>
            <span style={{fontSize:12,color:"var(--muted)",marginLeft:"auto"}}>{histTotal} document(s)</span>
          </div>

          {/* History table */}
          <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden"}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead>
                <tr style={{background:"var(--surface2)"}}>
                  {["#","Type","Agent","Matricule","Unité","Date","Actions"].map(h=>(
                    <th key={h} style={{padding:"9px 12px",textAlign:"left",fontSize:10,fontWeight:700,
                      textTransform:"uppercase",letterSpacing:".6px",color:"var(--muted)",
                      borderBottom:"1px solid var(--border)"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} style={{textAlign:"center",padding:40,color:"var(--muted)",fontSize:13}}>
                    ⏳ Chargement...
                  </td></tr>
                ) : history.map((r,i)=>(
                  <tr key={r.id} style={{borderBottom:"1px solid rgba(255,255,255,0.03)"}}>
                    <td style={{...tdStyle,color:"var(--muted)",fontSize:11}}>{(histPage-1)*30+i+1}</td>
                    <td style={tdStyle}>
                      <span style={{
                        background:`${TYPE_COLORS[r.type_doc]||"#6b7280"}18`,
                        color:TYPE_COLORS[r.type_doc]||"#94a3b8",
                        fontSize:11,fontWeight:700,padding:"3px 9px",borderRadius:20,
                      }}>{r.type_doc}</span>
                    </td>
                    <td style={tdStyle}><strong>{r.agent}</strong></td>
                    <td style={{...tdStyle,fontSize:11,color:"var(--muted)"}}>{r.matricule}</td>
                    <td style={{...tdStyle,fontSize:11}}>{r.unite}</td>
                    <td style={{...tdStyle,fontSize:11,color:"var(--muted)",whiteSpace:"nowrap"}}>{r.created_at}</td>
                    <td style={tdStyle}>
                      <button onClick={async()=>{
                        const ep = r.type_doc.toLowerCase().replace("_","-");
                        const res = await fetch(`${API}/hr/${ep}/regenerate/${r.id}`,{
                          method:"POST",headers:{Authorization:`Bearer ${token}`}
                        });
                        if(res.ok){
                          const blob=await res.blob();
                          const url=URL.createObjectURL(blob);
                          const a=document.createElement("a");
                          a.href=url;a.download=`${r.type_doc}_${r.agent}_${r.id}.pdf`;a.click();
                          URL.revokeObjectURL(url);
                        }
                      }} style={{
                        background:"rgba(37,99,235,0.08)",border:"1px solid rgba(37,99,235,0.25)",
                        borderRadius:7,padding:"5px 10px",color:"#60a5fa",
                        fontSize:11,fontWeight:600,cursor:"pointer",
                      }}>🔄 Régénérer</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Pagination */}
            {Math.ceil(histTotal/30) > 1 && (
              <div style={{display:"flex",justifyContent:"center",gap:6,padding:12,borderTop:"1px solid var(--border)"}}>
                {Array.from({length:Math.min(Math.ceil(histTotal/30),8)},(_,i)=>i+1).map(p=>(
                  <button key={p} onClick={()=>setHistPage(p)} style={{
                    width:30,height:30,borderRadius:7,border:"1px solid",
                    borderColor:p===histPage?"#2563eb":"var(--border)",
                    background:p===histPage?"#2563eb":"var(--surface2)",
                    color:p===histPage?"#fff":"var(--text)",
                    fontSize:12,fontWeight:600,cursor:"pointer",
                  }}>{p}</button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════ MODAL: Add Agent ════ */}
      {showAdd && (
        <Modal title="➕ Ajouter un agent" onClose={()=>setShowAdd(false)}>
          <form onSubmit={handleAdd}>
            {[
              {label:"Nom & Prénom", val:addNom, set:setAddNom, ph:"Ex: BENALI YOUSSEF"},
              {label:"Matricule",    val:addMat, set:setAddMat, ph:"Ex: 85123"},
              {label:"Unité",        val:addUnite,set:setAddUnite,ph:"Ex: DTC/TQ/SR"},
              {label:"Destinataire", val:addDest, set:setAddDest, ph:"Ex: M. KAJAD MAHMOUD"},
            ].map(f=>(
              <div key={f.label} style={{marginBottom:14}}>
                <label style={lblStyle}>{f.label}</label>
                <input value={f.val} onChange={e=>f.set(e.target.value)} placeholder={f.ph}
                  required style={inpStyle}/>
              </div>
            ))}
            {isSuperAdmin && (
              <div style={{marginBottom:14}}>
                <label style={lblStyle}>Rôle</label>
                <select value={addRole} onChange={e=>setAddRole(e.target.value)} style={inpStyle}>
                  <option value="agent">👤 Agent</option>
                  <option value="admin">👑 Admin</option>
                </select>
              </div>
            )}
            <div style={{fontSize:11,color:"var(--muted)",marginBottom:16}}>
              💡 Le mot de passe par défaut sera le matricule de l'agent.
            </div>
            {addMsg && <div style={{...msgStyle, color:addMsg.startsWith("✅")?"#34d399":"#f87171",
              background:addMsg.startsWith("✅")?"rgba(16,185,129,0.1)":"rgba(239,68,68,0.1)",
              border:`1px solid ${addMsg.startsWith("✅")?"rgba(16,185,129,0.3)":"rgba(239,68,68,0.3)"}`
            }}>{addMsg}</div>}
            <button type="submit" disabled={addLoading} style={btnPrimaryStyle}>
              {addLoading ? "⏳ Création..." : "✅ Créer l'agent"}
            </button>
          </form>
        </Modal>
      )}

      {/* ════ MODAL: Reset Password ════ */}
      {resetAgent && (
        <Modal title={`🔑 Réinitialiser — ${resetAgent.nom_prenom}`} onClose={()=>{setResetAgent(null);setResetPwd("");setResetMsg("");}}>
          <div style={{fontSize:12,color:"var(--muted)",marginBottom:16}}>
            Matricule : <strong style={{color:"var(--text)"}}>{resetAgent.matricule}</strong>
          </div>
          <div style={{marginBottom:16}}>
            <label style={lblStyle}>Nouveau mot de passe</label>
            <input type="password" value={resetPwd} onChange={e=>setResetPwd(e.target.value)}
              placeholder="Min. 4 caractères" style={inpStyle}/>
            <div style={{fontSize:11,color:"var(--muted)",marginTop:6}}>
              💡 Conseil : utiliser le matricule comme mot de passe temporaire ({resetAgent.matricule})
            </div>
          </div>
          {resetMsg && <div style={{...msgStyle,color:resetMsg.startsWith("✅")?"#34d399":"#f87171",
            background:resetMsg.startsWith("✅")?"rgba(16,185,129,0.1)":"rgba(239,68,68,0.1)",
            border:`1px solid ${resetMsg.startsWith("✅")?"rgba(16,185,129,0.3)":"rgba(239,68,68,0.3)"}`
          }}>{resetMsg}</div>}
          <button onClick={handleReset} style={btnPrimaryStyle}>🔑 Réinitialiser</button>
        </Modal>
      )}

      {/* ════ MODAL: Delete Confirm ════ */}
      {deleteAgent && (
        <Modal title="🗑️ Confirmer la suppression" onClose={()=>{setDeleteAgent(null);setDeleteMsg("");}}>
          <div style={{fontSize:13,marginBottom:20,lineHeight:1.6}}>
            Êtes-vous sûr de vouloir supprimer <strong>{deleteAgent.nom_prenom}</strong> ({deleteAgent.matricule}) ?<br/>
            <span style={{color:"#f87171",fontSize:12}}>⚠️ Tous ses documents RH seront aussi supprimés.</span>
          </div>
          {deleteMsg && <div style={{...msgStyle,color:deleteMsg.startsWith("✅")?"#34d399":"#f87171",
            background:deleteMsg.startsWith("✅")?"rgba(16,185,129,0.1)":"rgba(239,68,68,0.1)",
            border:`1px solid ${deleteMsg.startsWith("✅")?"rgba(16,185,129,0.3)":"rgba(239,68,68,0.3)"}`
          }}>{deleteMsg}</div>}
          <div style={{display:"flex",gap:10}}>
            <button onClick={()=>{setDeleteAgent(null);setDeleteMsg("");}} style={{
              flex:1,background:"var(--surface2)",border:"1px solid var(--border)",
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

// ── Modal component ────────────────────────────────────────────────────────────
function Modal({ title, children, onClose }: any) {
  return (
    <div style={{
      position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",
      display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,
      backdropFilter:"blur(4px)",
    }}>
      <div style={{
        background:"var(--surface)",border:"1px solid var(--border)",
        borderRadius:16,padding:28,width:"100%",maxWidth:460,
        boxShadow:"0 24px 60px rgba(0,0,0,0.6)",
        animation:"fadeUp .25s ease both",
      }}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
          <div style={{fontFamily:"var(--font-head)",fontSize:16,fontWeight:700}}>{title}</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"var(--muted)",
            cursor:"pointer",fontSize:20,lineHeight:1}}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Shared styles ──────────────────────────────────────────────────────────────
const cardStyle: React.CSSProperties = {
  background:"var(--surface)",border:"1px solid var(--border)",borderRadius:16,padding:20,
};
const titleStyle: React.CSSProperties = {
  fontFamily:"var(--font-head)",fontSize:14,fontWeight:700,marginBottom:16,
};
const tdStyle: React.CSSProperties = { padding:"11px 12px",fontSize:13,verticalAlign:"middle" };
const selStyle: React.CSSProperties = {
  background:"var(--surface2)",border:"1px solid var(--border)",borderRadius:10,
  padding:"8px 12px",color:"var(--text)",fontSize:12,outline:"none",cursor:"pointer",
};
const lblStyle: React.CSSProperties = {
  display:"block",fontSize:11,fontWeight:700,textTransform:"uppercase",
  letterSpacing:".7px",color:"var(--muted)",marginBottom:7,
};
const inpStyle: React.CSSProperties = {
  width:"100%",background:"var(--surface2)",border:"1px solid var(--border)",
  borderRadius:10,padding:"10px 14px",color:"var(--text)",fontSize:13,outline:"none",
};
const btnPrimaryStyle: React.CSSProperties = {
  width:"100%",background:"linear-gradient(135deg,#2563eb,#1d4ed8)",border:"none",
  borderRadius:10,padding:13,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",
  boxShadow:"0 4px 16px rgba(37,99,235,0.35)",marginTop:8,
};
const msgStyle: React.CSSProperties = {
  borderRadius:10,padding:"10px 14px",fontSize:13,marginBottom:14,
};
