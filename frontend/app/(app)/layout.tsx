"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useTheme } from "@/lib/useTheme";

const API = "http://10.23.23.144:8000";

const TYPE_CONFIG: Record<string, { icon: string; color: string; bg: string; border: string; label: string }> = {
  urgent: { icon:"🔴", color:"#ef4444", bg:"rgba(239,68,68,0.1)",  border:"rgba(239,68,68,0.25)",  label:"Urgent"  },
  todo:   { icon:"🟡", color:"#f59e0b", bg:"rgba(245,158,11,0.1)", border:"rgba(245,158,11,0.25)", label:"À faire" },
  info:   { icon:"🟢", color:"#10b981", bg:"rgba(16,185,129,0.1)", border:"rgba(16,185,129,0.25)", label:"Info"    },
};

const NAV_ITEMS = [
  { section:"main", label:"Dashboard",           icon:"⊞",  href:"/dashboard" },
  { section:"main", label:"Courrier Arrivée",    icon:"📬", href:"/courrier"  },
  { section:"main", label:"Bordereau d'Envoi",   icon:"📤", href:"/courrier"  },
  { section:"main", label:"Départ / Réception",  icon:"🔄", href:"/courrier"  },
  { section:"main", label:"Registre Devis", icon:"📋", href:"/devis" },
  { section:"rh",   label:"Permission (PE)",     icon:"🟢", href:"/hr"        },
  { section:"rh",   label:"Autorisation Sortie", icon:"🚪", href:"/hr"        },
  { section:"rh",   label:"Reprise de Service",  icon:"🔁", href:"/hr"        },
  { section:"rh",   label:"Maladie",             icon:"🏥", href:"/hr"        },
  { section:"rh",   label:"Fin Manquant",        icon:"⚠️", href:"/hr"        },
  { section:"rh",   label:"Repos Compensateur",  icon:"⏱️", href:"/hr"        },
  { section:"main", label:"Parc Véhicules", icon:"🚗", href:"/vehicules" },
  { section:"sys", label:"Outils PDF", icon:"📄", href:"/pdf-tools" },
  { section:"main", label:"Suivi Projets", icon:"🏗️", href:"/projets" },
  { section:"sys",  label:"Mon Profil",          icon:"👤", href:"/profile"   },
  { section:"sys",  label:"Panel Admin",         icon:"👑", href:"/admin", adminOnly:true },
];

const SECTIONS = [
  { key:"main", label:"Principal"          },
  { key:"rh",   label:"Ressources Humaines"},
  { key:"sys",  label:"Système"            },
];

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/courrier":  "Gestion du Courrier",
  "/hr":        "Ressources Humaines",
  "/profile":   "Mon Profil",
  "/admin":     "Panel Admin",
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const { isDark, toggleTheme } = useTheme();

  const [user,      setUser]      = useState<any>(null);
  const [token,     setToken]     = useState("");
  const [time,      setTime]      = useState("");
  const [collapsed, setCollapsed] = useState(false);

  // ── Notifications ──
  const [notifs,      setNotifs]      = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showPanel,   setShowPanel]   = useState(false);
  const [showCreate,  setShowCreate]  = useState(false);
  const [agents,      setAgents]      = useState<any[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);

  // Create form state
  const [cTitre,    setCTitre]    = useState("");
  const [cMessage,  setCMessage]  = useState("");
  const [cType,     setCType]     = useState("info");
  const [cCible,    setCCible]    = useState("all");
  const [selAgents, setSelAgents] = useState<number[]>([]);
  const [cLoading,  setCLoading]  = useState(false);
  const [cMsg,      setCMsg]      = useState("");

  useEffect(() => {
    const stored = localStorage.getItem("user");
    const tok    = localStorage.getItem("token");
    if (!stored || !tok) { router.push("/"); return; }
    setUser(JSON.parse(stored));
    setToken(tok);
  }, [router]);

  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit",second:"2-digit"}));
    tick(); const id = setInterval(tick, 1000); return () => clearInterval(id);
  }, []);

  async function fetchNotifs(tok: string) {
    try {
      const [nr, cr] = await Promise.all([
        fetch(`${API}/notifications/mes-notifications`, { headers:{ Authorization:`Bearer ${tok}` } }),
        fetch(`${API}/notifications/non-lues`,          { headers:{ Authorization:`Bearer ${tok}` } }),
      ]);
      if (nr.ok) setNotifs(await nr.json());
      if (cr.ok) { const d = await cr.json(); setUnreadCount(d.count); }
    } catch { /* silent */ }
  }

  async function fetchAgents(tok: string) {
    try {
      const res = await fetch(`${API}/admin/agents`, { headers:{ Authorization:`Bearer ${tok}` } });
      if (res.ok) setAgents(await res.json());
    } catch { /* silent */ }
  }

  useEffect(() => {
    if (!token) return;
    fetchNotifs(token);
    const id = setInterval(() => fetchNotifs(token), 30000);
    return () => clearInterval(id);
  }, [token]);

  // Close panel on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node))
        setShowPanel(false);
    }
    if (showPanel) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showPanel]);

  async function markRead(id: number) {
    await fetch(`${API}/notifications/${id}/lire`, { method:"POST", headers:{ Authorization:`Bearer ${token}` } });
    fetchNotifs(token);
  }

  async function markAllRead() {
    await fetch(`${API}/notifications/tout-lire`, { method:"POST", headers:{ Authorization:`Bearer ${token}` } });
    fetchNotifs(token);
  }

  async function deleteNotif(id: number) {
    await fetch(`${API}/notifications/${id}`, { method:"DELETE", headers:{ Authorization:`Bearer ${token}` } });
    setNotifs(prev => prev.filter(n => n.id !== id));
    fetchNotifs(token);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault(); setCLoading(true); setCMsg("");
    try {
      const cible = cCible === "all" ? "all" : selAgents.join(",");
      const res = await fetch(`${API}/notifications/creer`, {
        method: "POST",
        headers:{ "Content-Type":"application/json", Authorization:`Bearer ${token}` },
        body: JSON.stringify({ titre:cTitre, message:cMessage, type_notif:cType, cible }),
      });
      const d = await res.json();
      if (res.ok) {
        setCMsg(d.message);
        setCTitre(""); setCMessage(""); setCType("info"); setCCible("all"); setSelAgents([]);
        fetchNotifs(token);
        setTimeout(() => { setCMsg(""); setShowCreate(false); }, 2000);
      } else { setCMsg(`❌ ${d.detail}`); }
    } catch { setCMsg("❌ Erreur serveur"); }
    finally { setCLoading(false); }
  }

  function logout() {
    localStorage.removeItem("token"); localStorage.removeItem("user"); router.push("/");
  }

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  }

  const SIDEBAR_W = collapsed ? 60 : 220;
  const isAdmin   = user?.role === "admin";

  // Get current page title
  const pageTitle = Object.entries(PAGE_TITLES).find(([path]) => pathname.startsWith(path))?.[1] || "Portail";

  if (!user) return null;

  return (
    <div style={{ display:"flex", minHeight:"100vh", background:"var(--bg)" }}>

      {/* ════ SIDEBAR ════ */}
      <nav style={{
        width: SIDEBAR_W, minHeight:"100vh",
        background:"var(--surface)", borderRight:"1px solid var(--border)",
        display:"flex", flexDirection:"column",
        position:"fixed", top:0, left:0, bottom:0, zIndex:100,
        transition:"width 0.25s cubic-bezier(0.16,1,0.3,1)", overflow:"hidden",
      }}>

        {/* Logo */}
        <div style={{
          padding: collapsed ? "16px 0" : "16px 14px",
          borderBottom:"1px solid var(--border)", marginBottom:8,
          display:"flex", alignItems:"center",
          justifyContent: collapsed ? "center" : "space-between",
          gap:10, minHeight:64, flexShrink:0,
        }}>
          {!collapsed && (
            <div style={{
              display:"flex", alignItems:"center", gap:10, flex:1, minWidth:0,
              background:"linear-gradient(135deg,rgba(37,99,235,0.15),rgba(56,189,248,0.08))",
              border:"1px solid rgba(37,99,235,0.25)", borderRadius:10,
              padding:"8px 12px", cursor:"pointer",
            }} onClick={() => router.push("/dashboard")}>
              <div style={{
                width:28, height:28, flexShrink:0,
                background:"linear-gradient(135deg,#2563eb,#38bdf8)",
                borderRadius:7, display:"flex", alignItems:"center",
                justifyContent:"center", fontSize:14,
              }}>⚡</div>
              <div>
                <div style={{ fontFamily:"var(--font-head)", fontWeight:800, fontSize:13, lineHeight:1.2 }}>DTC / TQ</div>
                <div style={{ fontSize:9, color:"var(--muted)" }}>Portail interne</div>
              </div>
            </div>
          )}
          {collapsed && (
            <div style={{
              width:32, height:32,
              background:"linear-gradient(135deg,#2563eb,#38bdf8)",
              borderRadius:8, display:"flex", alignItems:"center",
              justifyContent:"center", fontSize:16, cursor:"pointer",
            }} onClick={() => router.push("/dashboard")}>⚡</div>
          )}
          <button onClick={() => setCollapsed(!collapsed)} style={{
            background:"none", border:"1px solid var(--border2)", borderRadius:7,
            width:26, height:26, flexShrink:0,
            display:"flex", alignItems:"center", justifyContent:"center",
            cursor:"pointer", color:"var(--muted)", fontSize:11,
            transition:"all 0.15s",
          }}>
            {collapsed ? "›" : "‹"}
          </button>
        </div>

        {/* Nav items */}
        <div style={{ flex:1, overflowY:"auto", overflowX:"hidden" }}>
          {SECTIONS.map(section => {
            const items = NAV_ITEMS.filter(n =>
              n.section === section.key &&
              (!("adminOnly" in n) || !(n as any).adminOnly || isAdmin)
            );
            if (!items.length) return null;
            return (
              <div key={section.key}>
                {!collapsed && (
                  <div style={{
                    fontSize:9, fontWeight:700, textTransform:"uppercase",
                    letterSpacing:"1.5px", color:"var(--muted)", padding:"10px 16px 4px",
                  }}>{section.label}</div>
                )}
                {collapsed && <div style={{ height:8 }}/>}
                {items.map(item => {
                  // In collapsed mode, deduplicate same-href items
                  if (collapsed && item.href === "/courrier" && item.label !== "Courrier Arrivée") return null;
                  if (collapsed && item.href === "/hr"       && item.label !== "Permission (PE)") return null;

                  const active = isActive(item.href);
                  return (
                    <button key={`${item.href}-${item.label}`}
                      onClick={() => router.push(item.href)}
                      title={collapsed ? item.label : undefined}
                      style={{
                        display:"flex", alignItems:"center",
                        gap: collapsed ? 0 : 10,
                        padding: collapsed ? "10px 0" : "9px 16px",
                        justifyContent: collapsed ? "center" : "flex-start",
                        width:"100%", textAlign:"left",
                        background: active ? "rgba(37,99,235,0.1)" : "none",
                        border:"none",
                        borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent",
                        color: active ? "var(--text)" : "var(--muted)",
                        fontSize:13, cursor:"pointer", transition:"all 0.15s",
                        fontFamily:"var(--font-body)",
                      }}
                      onMouseEnter={e => { if(!active) { (e.currentTarget as HTMLElement).style.background="var(--surface2)"; (e.currentTarget as HTMLElement).style.color="var(--text)"; }}}
                      onMouseLeave={e => { if(!active) { (e.currentTarget as HTMLElement).style.background="none"; (e.currentTarget as HTMLElement).style.color="var(--muted)"; }}}
                    >
                      <span style={{ fontSize:14, flexShrink:0 }}>{item.icon}</span>
                      {!collapsed && <span style={{ flex:1, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{item.label}</span>}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* User card */}
        <div style={{ padding: collapsed ? "12px 0" : "12px 14px", borderTop:"1px solid var(--border)", flexShrink:0 }}>
          {collapsed ? (
            <div style={{
              width:36, height:36, margin:"0 auto",
              background:"linear-gradient(135deg,#7c3aed,#2563eb)",
              borderRadius:"50%", display:"flex", alignItems:"center",
              justifyContent:"center", fontSize:12, fontWeight:700, color:"#fff", cursor:"pointer",
            }} onClick={() => router.push("/profile")} title={user.nom_prenom}>
              {user.nom_prenom?.split(" ").map((n:string)=>n[0]).slice(0,2).join("")}
            </div>
          ) : (
            <div style={{
              display:"flex", alignItems:"center", gap:9,
              padding:"9px 11px", background:"var(--surface2)", borderRadius:10,
            }}>
              <div style={{
                width:30, height:30, flexShrink:0,
                background:"linear-gradient(135deg,#7c3aed,#2563eb)",
                borderRadius:"50%", display:"flex", alignItems:"center",
                justifyContent:"center", fontSize:11, fontWeight:700, color:"#fff",
              }}>
                {user.nom_prenom?.split(" ").map((n:string)=>n[0]).slice(0,2).join("")}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:11, fontWeight:600, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                  {user.nom_prenom}
                </div>
                <div style={{ fontSize:9, color:"var(--muted)" }}>
                  {user.role==="admin" ? "👑 Admin" : "👤 Agent"} · {user.matricule}
                </div>
              </div>
              <button onClick={logout} style={{
                background:"none", border:"none", color:"var(--muted)",
                cursor:"pointer", fontSize:13, padding:4, transition:"color 0.15s",
              }}
              onMouseEnter={e => e.currentTarget.style.color="var(--danger)"}
              onMouseLeave={e => e.currentTarget.style.color="var(--muted)"}>🚪</button>
            </div>
          )}
        </div>
      </nav>

      {/* ════ MAIN ════ */}
      <div style={{
        marginLeft: SIDEBAR_W, flex:1,
        display:"flex", flexDirection:"column",
        transition:"margin-left 0.25s cubic-bezier(0.16,1,0.3,1)",
      }}>

        {/* Topbar */}
        <div className="glass" style={{
          height:56, display:"flex", alignItems:"center",
          padding:"0 24px", gap:10,
          position:"sticky", top:0, zIndex:50,
          borderBottom:"1px solid var(--border)",
        }}>
          {/* Breadcrumb */}
          <div style={{ flex:1, fontSize:12, color:"var(--muted)" }}>
            Portail DTC/TQ ›{" "}
            <span style={{ color:"var(--text)", fontWeight:500 }}>{pageTitle}</span>
          </div>

          {/* Clock */}
          <div style={{ fontSize:12, color:"var(--muted)", fontFamily:"var(--font-head)", fontWeight:600 }}>
            {time}
          </div>

          {/* Theme toggle */}
          <button onClick={toggleTheme} className="theme-toggle" title="Changer le thème">
            {isDark ? "☀️" : "🌙"}
          </button>

          {/* ── NOTIFICATION BELL ── */}
          <div style={{ position:"relative" }} ref={panelRef}>
            <button onClick={() => {
              setShowPanel(!showPanel);
              if (!showPanel && isAdmin) fetchAgents(token);
            }} style={{
              width:36, height:36,
              background:"var(--surface2)",
              border:`1px solid ${unreadCount > 0 ? "rgba(239,68,68,0.4)" : "var(--border2)"}`,
              borderRadius:9, display:"flex", alignItems:"center", justifyContent:"center",
              cursor:"pointer", fontSize:16, position:"relative",
              boxShadow: unreadCount > 0 ? "0 0 0 3px rgba(239,68,68,0.12)" : "none",
              transition:"all 0.15s",
            }}>
              🔔
              {unreadCount > 0 && (
                <div style={{
                  position:"absolute", top:-5, right:-5,
                  minWidth:18, height:18, padding:"0 4px",
                  background:"#ef4444", color:"#fff",
                  borderRadius:99, fontSize:10, fontWeight:800,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  border:"2px solid var(--bg)",
                }}>{unreadCount > 9 ? "9+" : unreadCount}</div>
              )}
            </button>

            {/* Notification panel */}
            {showPanel && (
              <div style={{
                position:"absolute", top:"calc(100% + 8px)", right:0,
                width:400, maxHeight:520,
                background:"var(--surface)", border:"1px solid var(--border2)",
                borderRadius:16, overflow:"hidden",
                boxShadow:"var(--shadow-lg)",
                animation:"scaleIn 0.2s cubic-bezier(0.16,1,0.3,1) both",
                transformOrigin:"top right", zIndex:200,
                display:"flex", flexDirection:"column",
              }}>
                {/* Header */}
                <div style={{
                  padding:"14px 16px", borderBottom:"1px solid var(--border)",
                  display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0,
                }}>
                  <div>
                    <div style={{ fontFamily:"var(--font-head)", fontSize:14, fontWeight:700 }}>🔔 Notifications</div>
                    {unreadCount > 0 && <div style={{ fontSize:11, color:"var(--muted)", marginTop:2 }}>{unreadCount} non lue(s)</div>}
                  </div>
                  <div style={{ display:"flex", gap:7 }}>
                    {unreadCount > 0 && (
                      <button onClick={markAllRead} style={{
                        background:"var(--surface2)", border:"1px solid var(--border2)",
                        borderRadius:8, padding:"5px 10px", fontSize:11, color:"var(--muted)",
                        cursor:"pointer", fontWeight:500,
                      }}>✓ Tout lire</button>
                    )}
                    {isAdmin && (
                      <button onClick={() => { setShowCreate(!showCreate); if(!showCreate) fetchAgents(token); }} style={{
                        background:"linear-gradient(135deg,#2563eb,#1d4ed8)",
                        border:"none", borderRadius:8, padding:"5px 10px",
                        fontSize:11, color:"#fff", cursor:"pointer", fontWeight:600,
                      }}>➕ Créer</button>
                    )}
                  </div>
                </div>

                {/* Create form */}
                {showCreate && isAdmin && (
                  <div style={{
                    padding:"14px 16px", borderBottom:"1px solid var(--border)",
                    background:"var(--surface2)", flexShrink:0,
                  }}>
                    <form onSubmit={handleCreate}>
                      <input value={cTitre} onChange={e=>setCTitre(e.target.value)} placeholder="Titre" required
                        style={{ width:"100%", background:"var(--surface)", border:"1px solid var(--border2)",
                          borderRadius:8, padding:"8px 12px", fontSize:12, color:"var(--text)", outline:"none",
                          fontFamily:"var(--font-body)", marginBottom:8 }}/>
                      <textarea value={cMessage} onChange={e=>setCMessage(e.target.value)} placeholder="Message..." required rows={3}
                        style={{ width:"100%", background:"var(--surface)", border:"1px solid var(--border2)",
                          borderRadius:8, padding:"8px 12px", fontSize:12, color:"var(--text)", outline:"none",
                          resize:"vertical", fontFamily:"var(--font-body)", marginBottom:8 }}/>
                      <div style={{ display:"flex", gap:8, marginBottom:8 }}>
                        <select value={cType} onChange={e=>setCType(e.target.value)} style={{
                          flex:1, background:"var(--surface)", border:"1px solid var(--border2)",
                          borderRadius:8, padding:"7px 10px", fontSize:12, color:"var(--text)",
                          outline:"none", cursor:"pointer", fontFamily:"var(--font-body)",
                        }}>
                          <option value="info">🟢 Information</option>
                          <option value="todo">🟡 Travail à faire</option>
                          <option value="urgent">🔴 Urgent</option>
                        </select>
                        <select value={cCible} onChange={e=>{setCCible(e.target.value);setSelAgents([]);}} style={{
                          flex:1, background:"var(--surface)", border:"1px solid var(--border2)",
                          borderRadius:8, padding:"7px 10px", fontSize:12, color:"var(--text)",
                          outline:"none", cursor:"pointer", fontFamily:"var(--font-body)",
                        }}>
                          <option value="all">👥 Tous</option>
                          <option value="select">👤 Spécifiques</option>
                        </select>
                      </div>
                      {cCible === "select" && (
                        <div style={{
                          maxHeight:100, overflowY:"auto",
                          background:"var(--surface)", border:"1px solid var(--border2)",
                          borderRadius:8, padding:"6px", marginBottom:8,
                        }}>
                          {agents.map(a=>(
                            <label key={a.id} style={{
                              display:"flex", alignItems:"center", gap:8, padding:"4px 8px",
                              cursor:"pointer", borderRadius:6, fontSize:12, color:"var(--text2)",
                              background: selAgents.includes(a.id) ? "rgba(37,99,235,0.1)" : "transparent",
                            }}>
                              <input type="checkbox" checked={selAgents.includes(a.id)}
                                onChange={e=>setSelAgents(prev=>e.target.checked?[...prev,a.id]:prev.filter(x=>x!==a.id))}/>
                              <span style={{ fontWeight:500 }}>{a.nom_prenom}</span>
                              <span style={{ color:"var(--muted)", fontSize:10 }}>{a.matricule}</span>
                            </label>
                          ))}
                        </div>
                      )}
                      {cMsg && (
                        <div style={{
                          padding:"7px 12px", borderRadius:8, fontSize:12, marginBottom:8,
                          background: cMsg.startsWith("✅") ? "var(--green-bg)" : "rgba(239,68,68,0.1)",
                          color: cMsg.startsWith("✅") ? "var(--green)" : "var(--danger)",
                        }}>{cMsg}</div>
                      )}
                      <button type="submit" disabled={cLoading} style={{
                        width:"100%", background:"linear-gradient(135deg,#2563eb,#1d4ed8)",
                        border:"none", borderRadius:9, padding:"9px", color:"#fff",
                        fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"var(--font-body)",
                      }}>
                        {cLoading ? "⏳ Envoi..." : "📢 Envoyer"}
                      </button>
                    </form>
                  </div>
                )}

                {/* Notifications list */}
                <div style={{ overflowY:"auto", flex:1 }}>
                  {notifs.length === 0 ? (
                    <div style={{ padding:"40px 20px", textAlign:"center", color:"var(--muted)", fontSize:13 }}>
                      <div style={{ fontSize:32, marginBottom:10, opacity:.3 }}>🔔</div>
                      Aucune notification
                    </div>
                  ) : notifs.map((n:any) => {
                    const cfg = TYPE_CONFIG[n.type_notif] || TYPE_CONFIG.info;
                    return (
                      <div key={n.id} style={{
                        padding:"12px 16px", borderBottom:"1px solid var(--border)",
                        background: n.is_read ? "transparent" : `${cfg.color}06`,
                        borderLeft: n.is_read ? "3px solid transparent" : `3px solid ${cfg.color}`,
                      }}>
                        <div style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
                          <div style={{
                            width:32, height:32, borderRadius:9, flexShrink:0,
                            background:cfg.bg, border:`1px solid ${cfg.border}`,
                            display:"flex", alignItems:"center", justifyContent:"center", fontSize:14,
                          }}>{cfg.icon}</div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3 }}>
                              <span style={{ fontSize:12, fontWeight:700, color:n.is_read?"var(--text2)":"var(--text)" }}>
                                {n.titre}
                              </span>
                              {!n.is_read && <div style={{ width:7, height:7, borderRadius:"50%", background:cfg.color }}/>}
                              <span style={{
                                marginLeft:"auto", fontSize:10, fontWeight:600,
                                padding:"2px 7px", borderRadius:99,
                                background:cfg.bg, color:cfg.color, border:`1px solid ${cfg.border}`,
                              }}>{cfg.label}</span>
                            </div>
                            <p style={{ fontSize:12, color:"var(--muted)", lineHeight:1.5, margin:0 }}>{n.message}</p>
                            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:8 }}>
                              <div style={{ fontSize:10, color:"var(--muted)" }}>{n.created_by} · {n.created_at}</div>
                              <div style={{ display:"flex", gap:6 }}>
                                {!n.is_read && (
                                  <button onClick={()=>markRead(n.id)} style={{
                                    background:"var(--surface2)", border:"1px solid var(--border2)",
                                    borderRadius:7, padding:"3px 9px", fontSize:10, color:"var(--muted)",
                                    cursor:"pointer", fontWeight:500,
                                  }}>✓ Lu</button>
                                )}
                                {n.is_read && <span style={{ fontSize:10, color:"var(--green)", fontWeight:500 }}>✅ Lu</span>}
                                {isAdmin && (
                                  <button onClick={()=>deleteNotif(n.id)} style={{
                                    background:"none", border:"none", color:"var(--muted)",
                                    cursor:"pointer", fontSize:12, transition:"color 0.15s",
                                  }}
                                  onMouseEnter={e=>e.currentTarget.style.color="var(--danger)"}
                                  onMouseLeave={e=>e.currentTarget.style.color="var(--muted)"}>🗑️</button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Footer */}
                {notifs.length > 0 && (
                  <div style={{
                    padding:"10px 16px", borderTop:"1px solid var(--border)",
                    textAlign:"center", fontSize:11, color:"var(--muted)", flexShrink:0,
                  }}>
                    {notifs.filter((n:any)=>n.is_read).length} lue(s) · {notifs.filter((n:any)=>!n.is_read).length} non lue(s)
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Avatar */}
          <div onClick={() => router.push("/profile")} style={{
            width:32, height:32,
            background:"linear-gradient(135deg,#2563eb,#38bdf8)",
            borderRadius:"50%", display:"flex", alignItems:"center",
            justifyContent:"center", fontSize:11, fontWeight:700,
            color:"#fff", cursor:"pointer", transition:"opacity 0.15s",
          }}
          onMouseEnter={e=>(e.currentTarget as HTMLElement).style.opacity="0.85"}
          onMouseLeave={e=>(e.currentTarget as HTMLElement).style.opacity="1"}>
            {user.nom_prenom?.split(" ").map((n:string)=>n[0]).slice(0,2).join("")}
          </div>
        </div>

        {/* Page content */}
        <div style={{ flex:1 }}>{children}</div>
      </div>

      <style>{`
        @keyframes scaleIn {
          from { opacity:0; transform:scale(0.95) translateY(-8px); }
          to   { opacity:1; transform:scale(1)    translateY(0); }
        }
      `}</style>
    </div>
  );
}
