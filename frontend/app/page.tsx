"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/lib/useTheme";

export default function LoginPage() {
  const router = useRouter();
  const { isDark, toggleTheme } = useTheme();
  const [matricule, setMatricule] = useState("");
  const [password,  setPassword]  = useState("");
  const [showPwd,   setShowPwd]   = useState(false);
  const [error,     setError]     = useState("");
  const [loading,   setLoading]   = useState(false);
  const [focused,   setFocused]   = useState<"mat"|"pwd"|null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("http://10.23.23.144:8000/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ username: matricule, password }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.detail || "Matricule ou mot de passe incorrect");
        setLoading(false);
        return;
      }
      const data = await res.json();
      localStorage.setItem("token", data.access_token);
      localStorage.setItem("user",  JSON.stringify(data.user));
      router.push("/dashboard");
    } catch {
      setError("Impossible de contacter le serveur");
      setLoading(false);
    }
  }

  return (
    <main style={{
      minHeight:"100vh",
      background:"var(--bg)",
      display:"flex",
      position:"relative",
      overflow:"hidden",
    }}>

      {/* ── Theme toggle ── */}
      <button onClick={toggleTheme} className="theme-toggle" style={{
        position:"fixed", top:20, right:20, zIndex:100,
      }}>
        {isDark ? "☀️" : "🌙"}
      </button>

      {/* ── LEFT PANEL — branding ── */}
      <div style={{
        flex:1, display:"flex", flexDirection:"column",
        alignItems:"center", justifyContent:"center",
        padding:"60px 40px",
        background: isDark
          ? "linear-gradient(145deg, #080c14 0%, #0d1422 50%, #0a1628 100%)"
          : "linear-gradient(145deg, #e8f0fe 0%, #dbeafe 50%, #eff6ff 100%)",
        position:"relative", overflow:"hidden",
      }}>

        {/* Background grid */}
        <div style={{
          position:"absolute", inset:0, opacity: isDark ? 0.03 : 0.06,
          backgroundImage:"linear-gradient(var(--border2) 1px, transparent 1px), linear-gradient(90deg, var(--border2) 1px, transparent 1px)",
          backgroundSize:"48px 48px",
        }}/>

        {/* Glows */}
        <div style={{
          position:"absolute", top:"20%", left:"20%",
          width:500, height:500, borderRadius:"50%",
          background:"radial-gradient(circle, rgba(37,99,235,0.15) 0%, transparent 65%)",
          pointerEvents:"none",
        }}/>
        <div style={{
          position:"absolute", bottom:"15%", right:"10%",
          width:350, height:350, borderRadius:"50%",
          background:"radial-gradient(circle, rgba(56,189,248,0.1) 0%, transparent 65%)",
          pointerEvents:"none",
        }}/>

        {/* Content */}
        <div style={{ position:"relative", zIndex:1, textAlign:"center", maxWidth:480 }} className="anim-fade-up">

          {/* Logo */}
          <div className="anim-float" style={{
            width:88, height:88, margin:"0 auto 28px",
            background:"linear-gradient(135deg,#2563eb,#38bdf8)",
            borderRadius:24, display:"flex", alignItems:"center",
            justifyContent:"center", fontSize:40,
            boxShadow:"0 16px 40px rgba(37,99,235,0.35)",
          }}>⚡</div>

          <h1 style={{
            fontFamily:"var(--font-head)", fontSize:38, fontWeight:800,
            lineHeight:1.1, marginBottom:14, color:"var(--text)",
          }}>
            Portail<br/>
            <span style={{
              background:"linear-gradient(135deg,#2563eb,#38bdf8)",
              WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent",
              backgroundClip:"text",
            }}>DTC / TQ</span>
          </h1>

          <p style={{ fontSize:15, color:"var(--muted)", lineHeight:1.7, marginBottom:40 }}>
            Plateforme de gestion interne<br/>
            <strong style={{ color:"var(--text2)" }}>Direction Technique Centre · ONEE</strong>
          </p>

          {/* Feature pills */}
          {[
            { icon:"📬", label:"Gestion du Courrier" },
            { icon:"📄", label:"Documents RH" },
            { icon:"📊", label:"Statistiques temps réel" },
          ].map((f,i) => (
            <div key={i} className={`anim-fade-up-${i+2}`} style={{
              display:"inline-flex", alignItems:"center", gap:8,
              background: isDark ? "rgba(255,255,255,0.05)" : "rgba(37,99,235,0.08)",
              border:`1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(37,99,235,0.15)"}`,
              borderRadius:99, padding:"7px 16px", margin:"4px",
              fontSize:12, fontWeight:500, color:"var(--text2)",
            }}>
              <span style={{ fontSize:14 }}>{f.icon}</span>
              {f.label}
            </div>
          ))}
        </div>

        {/* Bottom credit */}
        <div style={{
          position:"absolute", bottom:24,
          fontSize:11, color:"var(--muted)", textAlign:"center",
        }}>
          Développé par <strong style={{ color:"var(--text2)" }}>JABBARI ILYASS</strong> · 2026
        </div>
      </div>

      {/* ── RIGHT PANEL — form ── */}
      <div style={{
        width:"100%", maxWidth:480,
        display:"flex", flexDirection:"column",
        alignItems:"center", justifyContent:"center",
        padding:"40px 48px",
        background:"var(--surface)",
        borderLeft:`1px solid var(--border)`,
        position:"relative",
      }}>

        {/* Top label */}
        <div style={{
          position:"absolute", top:24, left:48,
          fontSize:12, color:"var(--muted)", fontWeight:500,
        }}>
          <span style={{ opacity:.5 }}>Portail DTC/TQ</span>
          <span style={{ margin:"0 8px", opacity:.3 }}>›</span>
          <span>Connexion</span>
        </div>

        <div style={{ width:"100%", maxWidth:360 }} className="anim-fade-up">

          {/* Header */}
          <div style={{ marginBottom:36 }}>
            <h2 style={{
              fontFamily:"var(--font-head)", fontSize:26, fontWeight:800,
              marginBottom:8, color:"var(--text)",
            }}>Bienvenue 👋</h2>
            <p style={{ color:"var(--muted)", fontSize:13.5, lineHeight:1.6 }}>
              Connectez-vous avec votre matricule<br/>et mot de passe ONEE
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin}>

            {/* Matricule */}
            <div className="anim-fade-up-1" style={{ marginBottom:18 }}>
              <label style={{
                display:"block", fontSize:11, fontWeight:700,
                textTransform:"uppercase", letterSpacing:"0.8px",
                color:"var(--muted)", marginBottom:8,
              }}>Matricule</label>
              <div style={{ position:"relative" }}>
                <span style={{
                  position:"absolute", left:14, top:"50%",
                  transform:"translateY(-50%)",
                  fontSize:15, color: focused==="mat" ? "var(--accent)" : "var(--muted)",
                  transition:"color 0.15s",
                }}>👤</span>
                <input
                  type="text"
                  value={matricule}
                  onChange={e=>setMatricule(e.target.value)}
                  placeholder="Ex: 84488R"
                  required
                  onFocus={()=>setFocused("mat")}
                  onBlur={()=>setFocused(null)}
                  style={{
                    width:"100%", background:"var(--surface2)",
                    border:`1.5px solid ${focused==="mat" ? "var(--accent)" : "var(--border2)"}`,
                    borderRadius:12, padding:"12px 14px 12px 44px",
                    color:"var(--text)", fontSize:14, outline:"none",
                    transition:"border-color 0.15s, box-shadow 0.15s",
                    boxShadow: focused==="mat" ? "0 0 0 3px rgba(37,99,235,0.12)" : "none",
                    fontFamily:"var(--font-body)",
                  }}
                />
              </div>
            </div>

            {/* Password */}
            <div className="anim-fade-up-2" style={{ marginBottom:24 }}>
              <label style={{
                display:"block", fontSize:11, fontWeight:700,
                textTransform:"uppercase", letterSpacing:"0.8px",
                color:"var(--muted)", marginBottom:8,
              }}>Mot de passe</label>
              <div style={{ position:"relative" }}>
                <span style={{
                  position:"absolute", left:14, top:"50%",
                  transform:"translateY(-50%)",
                  fontSize:15, color: focused==="pwd" ? "var(--accent)" : "var(--muted)",
                  transition:"color 0.15s",
                }}>🔒</span>
                <input
                  type={showPwd ? "text" : "password"}
                  value={password}
                  onChange={e=>setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  onFocus={()=>setFocused("pwd")}
                  onBlur={()=>setFocused(null)}
                  style={{
                    width:"100%", background:"var(--surface2)",
                    border:`1.5px solid ${focused==="pwd" ? "var(--accent)" : "var(--border2)"}`,
                    borderRadius:12, padding:"12px 44px 12px 44px",
                    color:"var(--text)", fontSize:14, outline:"none",
                    transition:"border-color 0.15s, box-shadow 0.15s",
                    boxShadow: focused==="pwd" ? "0 0 0 3px rgba(37,99,235,0.12)" : "none",
                    fontFamily:"var(--font-body)",
                  }}
                />
                {/* Show/hide toggle */}
                <button type="button" onClick={()=>setShowPwd(!showPwd)} style={{
                  position:"absolute", right:14, top:"50%",
                  transform:"translateY(-50%)",
                  background:"none", border:"none", cursor:"pointer",
                  fontSize:14, color:"var(--muted)", padding:0,
                  transition:"color 0.15s",
                }}
                onMouseEnter={e=>e.currentTarget.style.color="var(--text)"}
                onMouseLeave={e=>e.currentTarget.style.color="var(--muted)"}>
                  {showPwd ? "🙈" : "👁️"}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="anim-scale-in" style={{
                background:"var(--danger-bg)",
                border:"1px solid rgba(239,68,68,0.3)",
                borderRadius:10, padding:"10px 14px",
                fontSize:13, color:"var(--danger)",
                marginBottom:18, display:"flex", alignItems:"center", gap:8,
              }}>
                <span>❌</span> {error}
              </div>
            )}

            {/* Submit */}
            <div className="anim-fade-up-3">
              <button type="submit" disabled={loading} style={{
                width:"100%",
                background: loading
                  ? "rgba(37,99,235,0.5)"
                  : "linear-gradient(135deg,#2563eb,#1d4ed8)",
                border:"none", borderRadius:12, padding:"13px",
                color:"#fff", fontSize:14, fontWeight:700,
                cursor: loading ? "not-allowed" : "pointer",
                boxShadow: loading ? "none" : "0 4px 20px rgba(37,99,235,0.4)",
                transition:"all 0.2s", letterSpacing:"0.3px",
                fontFamily:"var(--font-body)",
                display:"flex", alignItems:"center", justifyContent:"center", gap:8,
              }}
              onMouseEnter={e=>{ if(!loading)(e.currentTarget as HTMLElement).style.transform="translateY(-1px)"; }}
              onMouseLeave={e=>{ (e.currentTarget as HTMLElement).style.transform="translateY(0)"; }}
              >
                {loading ? (
                  <>
                    <span className="anim-spin" style={{ display:"inline-block" }}>⏳</span>
                    Connexion en cours...
                  </>
                ) : (
                  <>⚡ Se connecter</>
                )}
              </button>
            </div>
          </form>

          {/* Divider */}
          <div style={{
            display:"flex", alignItems:"center", gap:12,
            margin:"24px 0", color:"var(--muted)", fontSize:12,
          }}>
            <div style={{ flex:1, height:1, background:"var(--border)" }}/>
            Réseau local ONEE
            <div style={{ flex:1, height:1, background:"var(--border)" }}/>
          </div>

          {/* Info */}
          <div style={{
            background: isDark ? "rgba(37,99,235,0.06)" : "rgba(37,99,235,0.05)",
            border:`1px solid ${isDark ? "rgba(37,99,235,0.15)" : "rgba(37,99,235,0.12)"}`,
            borderRadius:12, padding:"12px 16px",
            fontSize:12, color:"var(--muted)", lineHeight:1.7,
          }}>
            <div style={{ fontWeight:600, color:"var(--text2)", marginBottom:5 }}>
              ℹ️ Accès restreint
            </div>
            Réservé aux agents de la Division Technique Centre.<br/>
            Contactez l'administrateur en cas de problème de connexion.
          </div>

          {/* Footer */}
          <div style={{
            textAlign:"center", marginTop:32,
            fontSize:11, color:"var(--muted)",
          }}>
            © 2026 — Portail RH DTC/TQ ·{" "}
            <strong style={{ color:"var(--text2)" }}>JABBARI ILYASS</strong>
          </div>
        </div>
      </div>
    </main>
  );
}