"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type User = {
  id: number;
  nom_prenom: string;
  matricule: string;
  unite: string;
  destinataire: string;
  role: string;
};

type Agent = {
  id: number;
  nom_prenom: string;
  matricule: string;
  unite: string;
  role: string;
};

const ROLE_COLORS: Record<string, string> = {
  admin: "#2563eb",
  agent: "#10b981",
};

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser]   = useState<User | null>(null);
  const [token, setToken] = useState("");

  // ── Change password state ──
  const [currentPwd,  setCurrentPwd]  = useState("");
  const [newPwd,      setNewPwd]      = useState("");
  const [confirmPwd,  setConfirmPwd]  = useState("");
  const [pwdLoading,  setPwdLoading]  = useState(false);
  const [pwdSuccess,  setPwdSuccess]  = useState("");
  const [pwdError,    setPwdError]    = useState("");

  // ── Admin state ──
  const [agents,       setAgents]       = useState<Agent[]>([]);
  const [searchAgent,  setSearchAgent]  = useState("");
  const [selectedAgent,setSelectedAgent]= useState<Agent | null>(null);
  const [newAdminPwd,  setNewAdminPwd]  = useState("");
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminSuccess, setAdminSuccess] = useState("");
  const [adminError,   setAdminError]   = useState("");

  useEffect(() => {
    const stored = localStorage.getItem("user");
    const tok    = localStorage.getItem("token");
    if (!stored || !tok) { router.push("/"); return; }
    setUser(JSON.parse(stored));
    setToken(tok);
    if (JSON.parse(stored).role === "admin") {
      fetchAgents(tok);
    }
  }, [router]);

  async function fetchAgents(tok: string) {
    try {
      const res = await fetch("http://10.23.23.144:8000/profile/admin/users", {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (res.ok) setAgents(await res.json());
    } catch { /* silent */ }
  }

  // ── Change own password ──────────────────────────────────────────────────
  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwdError(""); setPwdSuccess(""); setPwdLoading(true);

    if (newPwd !== confirmPwd) {
      setPwdError("Les nouveaux mots de passe ne correspondent pas");
      setPwdLoading(false); return;
    }
    if (newPwd.length < 6) {
      setPwdError("Minimum 6 caractères requis");
      setPwdLoading(false); return;
    }

    try {
      const res = await fetch("http://10.23.23.144:8000/profile/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          current_password: currentPwd,
          new_password:     newPwd,
          confirm_password: confirmPwd,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setPwdError(data.detail || "Erreur"); }
      else {
        setPwdSuccess("✅ Mot de passe modifié avec succès !");
        setCurrentPwd(""); setNewPwd(""); setConfirmPwd("");
      }
    } catch {
      setPwdError("Impossible de contacter le serveur");
    } finally {
      setPwdLoading(false);
    }
  }

  // ── Admin reset password ─────────────────────────────────────────────────
  async function handleAdminReset(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedAgent) return;
    setAdminError(""); setAdminSuccess(""); setAdminLoading(true);

    if (newAdminPwd.length < 4) {
      setAdminError("Minimum 4 caractères requis");
      setAdminLoading(false); return;
    }

    try {
      const res = await fetch("http://10.23.23.144:8000/profile/admin/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          user_id:      selectedAgent.id,
          new_password: newAdminPwd,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setAdminError(data.detail || "Erreur"); }
      else {
        setAdminSuccess(`✅ Mot de passe réinitialisé pour ${selectedAgent.nom_prenom}`);
        setNewAdminPwd(""); setSelectedAgent(null); setSearchAgent("");
      }
    } catch {
      setAdminError("Impossible de contacter le serveur");
    } finally {
      setAdminLoading(false);
    }
  }

  // ── Admin change role ────────────────────────────────────────────────────
  async function handleChangeRole(agent: Agent, newRole: string) {
    try {
      const res = await fetch(
        `http://10.23.23.144:8000/profile/admin/change-role?user_id=${agent.id}&new_role=${newRole}`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        setAdminSuccess(`✅ Rôle de ${agent.nom_prenom} changé en ${newRole}`);
        fetchAgents(token);
      }
    } catch { /* silent */ }
  }

  const filteredAgents = agents.filter(a =>
    a.nom_prenom.toLowerCase().includes(searchAgent.toLowerCase()) ||
    a.matricule.includes(searchAgent)
  );

  if (!user) return null;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", padding: 28 }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <button onClick={() => router.push("/dashboard")}
          style={{ background:"none",border:"none",color:"var(--muted)",
                   cursor:"pointer",fontSize:13,marginBottom:10 }}>
          ← Retour au dashboard
        </button>
        <h1 style={{ fontFamily:"var(--font-head)",fontSize:26,fontWeight:800 }}>
          👤 Mon Profil
        </h1>
        <p style={{ color:"var(--muted)",fontSize:13,marginTop:5 }}>
          Gérez vos informations et votre mot de passe
        </p>
      </div>

      <div style={{ display:"grid", gridTemplateColumns: user.role === "admin" ? "1fr 1fr" : "1fr", gap:24, maxWidth:1100 }}>

        {/* ── LEFT COLUMN ── */}
        <div style={{ display:"flex", flexDirection:"column", gap:20 }}>

          {/* Profile card */}
          <div style={cardStyle}>
            <div style={titleStyle}>🪪 Informations personnelles</div>

            <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:24 }}>
              <div style={{
                width:64, height:64,
                background:"linear-gradient(135deg,#2563eb,#38bdf8)",
                borderRadius:"50%",
                display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:24,fontWeight:800,color:"#fff",flexShrink:0,
              }}>
                {user.nom_prenom.split(" ").map(n=>n[0]).join("").slice(0,2)}
              </div>
              <div>
                <div style={{ fontSize:18,fontWeight:800 }}>{user.nom_prenom}</div>
                <div style={{ fontSize:13,color:"var(--muted)",marginTop:4 }}>
                  Matricule : <strong style={{ color:"var(--text)" }}>{user.matricule}</strong>
                </div>
                <div style={{ marginTop:6 }}>
                  <span style={{
                    background: `${ROLE_COLORS[user.role]}22`,
                    color: ROLE_COLORS[user.role],
                    fontSize:11,fontWeight:700,
                    padding:"3px 10px",borderRadius:20,
                  }}>
                    {user.role === "admin" ? "👑 Admin" : "👤 Agent"}
                  </span>
                </div>
              </div>
            </div>

            <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
              {[
                { label:"Unité",        value: user.unite },
                { label:"Destinataire", value: user.destinataire || "—" },
              ].map((row,i) => (
                <div key={i} style={{
                  display:"flex",justifyContent:"space-between",alignItems:"center",
                  padding:"10px 14px",
                  background:"var(--surface2)",
                  borderRadius:10,fontSize:13,
                }}>
                  <span style={{ color:"var(--muted)" }}>{row.label}</span>
                  <strong>{row.value}</strong>
                </div>
              ))}
            </div>
          </div>

          {/* Change password card */}
          <div style={cardStyle}>
            <div style={titleStyle}>🔐 Changer mon mot de passe</div>

            <div style={{
              background:"rgba(245,158,11,0.08)",
              border:"1px solid rgba(245,158,11,0.2)",
              borderRadius:10,padding:"10px 14px",
              fontSize:12,color:"#fbbf24",marginBottom:20,
            }}>
              ⚠️ Si c'est votre première connexion, votre mot de passe actuel = votre matricule ({user.matricule})
            </div>

            <form onSubmit={handleChangePassword}>
              <div style={{ marginBottom:14 }}>
                <label style={labelStyle}>Mot de passe actuel</label>
                <input type="password" value={currentPwd}
                  onChange={e=>setCurrentPwd(e.target.value)}
                  placeholder="••••••••" required style={inputStyle}
                  onFocus={e=>e.target.style.borderColor="#2563eb"}
                  onBlur={e=>e.target.style.borderColor="var(--border)"}
                />
              </div>
              <div style={{ marginBottom:14 }}>
                <label style={labelStyle}>Nouveau mot de passe</label>
                <input type="password" value={newPwd}
                  onChange={e=>setNewPwd(e.target.value)}
                  placeholder="Min. 6 caractères" required style={inputStyle}
                  onFocus={e=>e.target.style.borderColor="#2563eb"}
                  onBlur={e=>e.target.style.borderColor="var(--border)"}
                />
              </div>
              <div style={{ marginBottom:20 }}>
                <label style={labelStyle}>Confirmer le nouveau mot de passe</label>
                <input type="password" value={confirmPwd}
                  onChange={e=>setConfirmPwd(e.target.value)}
                  placeholder="••••••••" required style={inputStyle}
                  onFocus={e=>e.target.style.borderColor="#2563eb"}
                  onBlur={e=>e.target.style.borderColor="var(--border)"}
                />
              </div>

              {/* Password strength indicator */}
              {newPwd.length > 0 && (
                <div style={{ marginBottom:16 }}>
                  <div style={{ display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:6 }}>
                    <span style={{ color:"var(--muted)" }}>Force du mot de passe</span>
                    <span style={{ color: newPwd.length >= 10 ? "#34d399" : newPwd.length >= 6 ? "#fbbf24" : "#f87171" }}>
                      {newPwd.length >= 10 ? "Fort 💪" : newPwd.length >= 6 ? "Moyen ⚠️" : "Faible ❌"}
                    </span>
                  </div>
                  <div style={{ height:4,background:"var(--surface2)",borderRadius:99,overflow:"hidden" }}>
                    <div style={{
                      height:"100%",borderRadius:99,transition:"width .3s",
                      width: `${Math.min((newPwd.length/12)*100,100)}%`,
                      background: newPwd.length >= 10 ? "#34d399" : newPwd.length >= 6 ? "#fbbf24" : "#f87171",
                    }}/>
                  </div>
                </div>
              )}

              {pwdError   && <div style={errorStyle}>❌ {pwdError}</div>}
              {pwdSuccess  && <div style={successStyle}>{pwdSuccess}</div>}

              <button type="submit" disabled={pwdLoading} style={btnStyle}>
                {pwdLoading ? "⏳ Modification..." : "🔐 Modifier le mot de passe"}
              </button>
            </form>
          </div>
        </div>

        {/* ── RIGHT COLUMN (Admin only) ── */}
        {user.role === "admin" && (
          <div style={{ display:"flex", flexDirection:"column", gap:20 }}>

            {/* Admin reset password */}
            <div style={cardStyle}>
              <div style={titleStyle}>
                👑 Réinitialiser un mot de passe
                <span style={{ fontSize:11,color:"var(--muted)",fontWeight:400 }}>Admin seulement</span>
              </div>

              {/* Search agent */}
              <div style={{ marginBottom:16 }}>
                <label style={labelStyle}>Rechercher un agent</label>
                <input type="text" value={searchAgent}
                  onChange={e=>{ setSearchAgent(e.target.value); setSelectedAgent(null); }}
                  placeholder="Nom ou matricule..."
                  style={inputStyle}
                  onFocus={e=>e.target.style.borderColor="#2563eb"}
                  onBlur={e=>e.target.style.borderColor="var(--border)"}
                />
              </div>

              {/* Agent list */}
              {searchAgent.length > 0 && (
                <div style={{
                  background:"var(--surface2)",border:"1px solid var(--border)",
                  borderRadius:10,marginBottom:16,maxHeight:200,overflowY:"auto",
                }}>
                  {filteredAgents.length === 0 ? (
                    <div style={{ padding:"12px 16px",fontSize:13,color:"var(--muted)" }}>
                      Aucun agent trouvé
                    </div>
                  ) : filteredAgents.map(a => (
                    <div key={a.id}
                      onClick={() => { setSelectedAgent(a); setSearchAgent(a.nom_prenom); }}
                      style={{
                        padding:"10px 16px",cursor:"pointer",fontSize:13,
                        display:"flex",alignItems:"center",justifyContent:"space-between",
                        borderBottom:"1px solid var(--border)",
                        background: selectedAgent?.id===a.id ? "rgba(37,99,235,0.1)" : "transparent",
                        transition:"background .15s",
                      }}
                      onMouseEnter={e=>(e.currentTarget.style.background="rgba(255,255,255,0.04)")}
                      onMouseLeave={e=>(e.currentTarget.style.background=selectedAgent?.id===a.id?"rgba(37,99,235,0.1)":"transparent")}
                    >
                      <div>
                        <div style={{ fontWeight:600 }}>{a.nom_prenom}</div>
                        <div style={{ fontSize:11,color:"var(--muted)" }}>{a.matricule} · {a.unite}</div>
                      </div>
                      <span style={{
                        fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:20,
                        background:`${ROLE_COLORS[a.role]}22`,color:ROLE_COLORS[a.role],
                      }}>
                        {a.role}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Selected agent + new password */}
              {selectedAgent && (
                <form onSubmit={handleAdminReset}>
                  <div style={{
                    background:"rgba(37,99,235,0.08)",border:"1px solid rgba(37,99,235,0.2)",
                    borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:13,
                  }}>
                    Agent sélectionné : <strong style={{ color:"#60a5fa" }}>
                      {selectedAgent.nom_prenom}
                    </strong> ({selectedAgent.matricule})
                  </div>
                  <div style={{ marginBottom:20 }}>
                    <label style={labelStyle}>Nouveau mot de passe</label>
                    <input type="password" value={newAdminPwd}
                      onChange={e=>setNewAdminPwd(e.target.value)}
                      placeholder="Min. 4 caractères" required style={inputStyle}
                      onFocus={e=>e.target.style.borderColor="#2563eb"}
                      onBlur={e=>e.target.style.borderColor="var(--border)"}
                    />
                    <div style={{ fontSize:11,color:"var(--muted)",marginTop:6 }}>
                      💡 Conseil : utilisez le matricule comme mot de passe temporaire
                    </div>
                  </div>

                  {adminError   && <div style={errorStyle}>❌ {adminError}</div>}
                  {adminSuccess  && <div style={successStyle}>{adminSuccess}</div>}

                  <button type="submit" disabled={adminLoading} style={{
                    ...btnStyle, background:"linear-gradient(135deg,#7c3aed,#6d28d9)",
                  }}>
                    {adminLoading ? "⏳ Réinitialisation..." : "🔑 Réinitialiser le mot de passe"}
                  </button>
                </form>
              )}

              {adminSuccess && !selectedAgent && (
                <div style={successStyle}>{adminSuccess}</div>
              )}
            </div>

            {/* Agent list with roles */}
            <div style={cardStyle}>
              <div style={titleStyle}>
                👥 Gestion des agents
                <span style={{ fontSize:11,color:"var(--muted)",fontWeight:400 }}>
                  {agents.length} agents
                </span>
              </div>
              <div style={{ maxHeight:380,overflowY:"auto",display:"flex",flexDirection:"column",gap:6 }}>
                {agents.map(a => (
                  <div key={a.id} style={{
                    display:"flex",alignItems:"center",gap:10,
                    padding:"10px 12px",
                    background:"var(--surface2)",borderRadius:10,
                  }}>
                    <div style={{
                      width:34,height:34,borderRadius:"50%",flexShrink:0,
                      background: a.role==="admin"
                        ? "linear-gradient(135deg,#7c3aed,#2563eb)"
                        : "linear-gradient(135deg,#0d9488,#10b981)",
                      display:"flex",alignItems:"center",justifyContent:"center",
                      fontSize:12,fontWeight:700,color:"#fff",
                    }}>
                      {a.nom_prenom.split(" ").map(n=>n[0]).join("").slice(0,2)}
                    </div>
                    <div style={{ flex:1,minWidth:0 }}>
                      <div style={{ fontSize:12,fontWeight:600,
                                    whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>
                        {a.nom_prenom}
                      </div>
                      <div style={{ fontSize:10,color:"var(--muted)" }}>
                        {a.matricule} · {a.unite}
                      </div>
                    </div>
                    <select
                      value={a.role}
                      onChange={e => handleChangeRole(a, e.target.value)}
                      style={{
                        background:"var(--surface)",border:"1px solid var(--border)",
                        borderRadius:8,padding:"4px 8px",
                        color: ROLE_COLORS[a.role],
                        fontSize:11,fontWeight:700,cursor:"pointer",outline:"none",
                      }}
                    >
                      <option value="agent">👤 agent</option>
                      <option value="admin">👑 admin</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const cardStyle: React.CSSProperties = {
  background:"var(--surface)",border:"1px solid var(--border)",borderRadius:16,padding:24,
};
const titleStyle: React.CSSProperties = {
  fontFamily:"var(--font-head)",fontSize:15,fontWeight:700,marginBottom:20,
  display:"flex",alignItems:"center",gap:8,justifyContent:"space-between",
};
const labelStyle: React.CSSProperties = {
  display:"block",fontSize:11,fontWeight:700,textTransform:"uppercase",
  letterSpacing:"0.8px",color:"var(--muted)",marginBottom:8,
};
const inputStyle: React.CSSProperties = {
  width:"100%",background:"var(--surface2)",border:"1px solid var(--border)",
  borderRadius:10,padding:"11px 14px",color:"var(--text)",fontSize:13,
  outline:"none",transition:"border-color .2s",
};
const btnStyle: React.CSSProperties = {
  width:"100%",background:"linear-gradient(135deg,#2563eb,#1d4ed8)",
  border:"none",borderRadius:10,padding:13,color:"#fff",
  fontSize:14,fontWeight:700,cursor:"pointer",
  boxShadow:"0 4px 16px rgba(37,99,235,0.35)",
};
const errorStyle: React.CSSProperties = {
  background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.3)",
  borderRadius:10,padding:"10px 14px",fontSize:13,color:"#f87171",marginBottom:16,
};
const successStyle: React.CSSProperties = {
  background:"rgba(16,185,129,0.1)",border:"1px solid rgba(16,185,129,0.3)",
  borderRadius:10,padding:"10px 14px",fontSize:13,color:"#34d399",marginBottom:16,
};
