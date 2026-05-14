"use client";

/**
 * ProjetAITab.tsx
 * ================
 * Onglet "🤖 Analyse IA" à intégrer dans la page /projets.
 *
 * INTÉGRATION :
 * 1. Importer ce composant dans frontend/app/(app)/projets/page.tsx
 * 2. Ajouter un onglet "IA" dans la navigation de la page
 * 3. Afficher <ProjetAITab token={token} isAdmin={isAdmin} isSuperAdmin={isSuperAdmin} onProjectCreated={fetchData} />
 *
 * Visible uniquement pour le super admin (bouton analyse) 
 * mais les suggestions peuvent être approuvées par tout admin.
 */

import React, { useState, useEffect, useCallback } from "react";

const API         = "http://10.23.23.144:8000";
const SUPER_ADMIN = "84488R";

// ── Types ─────────────────────────────────────────────────────────────────────
type DocLink = {
  table:     string;
  doc_id:    number;
  etape:     string;
  raison?:   string;
  doc_ref?:  string;
  doc_titre?:string;
  doc_date?: string;
};

type Suggestion = {
  suggestion_id:       string;
  nom:                 string;
  type_projet:         string;
  localisation:        string;
  marche_numero:       string | null;
  description:         string;
  priorite:            string;
  confiance:           number;
  est_renouvellement:  boolean;
  projet_existant_id:  number | null;
  documents:           DocLink[];
};

type AIStats = {
  total_projets:  number;
  total_liens:    number;
  liens_ia:       number;
  liens_manuels:  number;
  taux_ia:        number;
  docs_non_lies:  Record<string, number>;
  total_non_lies: number;
  api_configured: boolean;
  claude_model:   string;
};

type PathConfig = {
  txt_paths:            Record<string, string>;
  batch_size:           number;
  txt_truncate_chars:   number;
  confidence_threshold: number;
  auto_link_threshold:  number;
};

type PathTestResult = Record<string, { status: string; count: number; path?: string; exemple?: string }>;

const ETAPE_LABELS: Record<string, string> = {
  demande_initiale:  "📬 Demande initiale",
  reunion:           "🤝 Réunion",
  etude_technique:   "📐 Étude technique",
  carnet_piquetage:  "📍 Carnet de piquetage",
  approvisionnement: "📦 Approvisionnement",
  bon_execution:     "✅ Bon d'exécution",
  travaux_en_cours:  "🔨 Travaux en cours",
  devis_realisation: "💰 Devis de réalisation",
  bon_livraison:     "📤 Bon de livraison",
  reception_travaux: "🏁 Réception travaux",
  cloture:           "🎉 Clôture",
  renouvellement:    "🔄 Renouvellement",
  autre:             "📄 Document",
};

const TABLE_ICONS: Record<string, string> = {
  courrier: "📬", bordereau: "📋", courrier_depart: "📤", devis: "💰",
};

const PRIORITE_COLORS: Record<string, string> = {
  haute: "#ef4444", normale: "#2563eb", basse: "#6b7280",
};

const TYPE_LABELS: Record<string, string> = {
  ligne_electrique: "⚡ Ligne Électrique",
  poste:            "🏭 Poste",
  maintenance:      "🔧 Maintenance",
  administratif:    "📋 Administratif",
  marche:           "📑 Marché",
  autre:            "📁 Autre",
};

// =============================================================================
export default function ProjetAITab({
  token,
  userMatricule,
  onProjectCreated,
}: {
  token:            string;
  userMatricule:    string;
  onProjectCreated: () => void;
}) {
  const isSuperAdmin = userMatricule === SUPER_ADMIN;

  // ── State ──────────────────────────────────────────────────────────────────
  const [view, setView]               = useState<"stats" | "config" | "suggestions">("stats");
  const [stats, setStats]             = useState<AIStats | null>(null);
  const [config, setConfig]           = useState<PathConfig | null>(null);
  const [pathTest, setPathTest]       = useState<PathTestResult | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [lowConf, setLowConf]         = useState<Suggestion[]>([]);
  const [showLowConf, setShowLowConf] = useState(false);
  const [analyseStats, setAnalyseStats] = useState<any>(null);

  const [analysing,  setAnalysing]  = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [testing,    setTesting]    = useState(false);
  const [approving,  setApproving]  = useState<string | null>(null);
  const [msg, setMsg]               = useState<{ text: string; ok: boolean } | null>(null);

  // Edition des suggestions avant approbation
  const [editingSug,  setEditingSug]  = useState<string | null>(null);
  const [editedNames, setEditedNames] = useState<Record<string, string>>({});

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API}/projets-ai/stats`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setStats(await res.json());
    } catch { /* silent */ }
  }, [token]);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch(`${API}/projets-ai/config`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setConfig(await res.json());
    } catch { /* silent */ }
  }, [token]);

  useEffect(() => {
    fetchStats();
    if (isSuperAdmin) fetchConfig();
  }, [fetchStats, fetchConfig, isSuperAdmin]);

  // ── Actions ────────────────────────────────────────────────────────────────
  async function handleSaveConfig() {
    if (!config) return;
    setSaving(true); setMsg(null);
    try {
      const res = await fetch(`${API}/projets-ai/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(config),
      });
      const d = await res.json();
      setMsg({ text: d.message, ok: res.ok });
      if (d.warnings?.length) setMsg({ text: d.message + " ⚠️ " + d.warnings.join(" | "), ok: true });
    } catch { setMsg({ text: "Erreur serveur", ok: false }); }
    finally { setSaving(false); }
  }

  async function handleTestPaths() {
    setTesting(true); setPathTest(null);
    try {
      const res = await fetch(`${API}/projets-ai/config/test-paths`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setPathTest(await res.json());
    } catch { /* silent */ }
    finally { setTesting(false); }
  }

  async function handleAnalyse() {
    setAnalysing(true); setSuggestions([]); setLowConf([]); setMsg(null);
    try {
      const res = await fetch(`${API}/projets-ai/analyse`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json();
      if (res.ok) {
        setSuggestions(d.suggestions || []);
        setLowConf(d.suggestions_faible_confiance || []);
        setAnalyseStats(d.stats);
        setView("suggestions");
        setMsg({
          text: `✅ Analyse terminée — ${d.stats.total_docs_analysed} documents analysés, ${d.suggestions.length} projet(s) suggéré(s)`,
          ok: true,
        });
      } else {
        setMsg({ text: d.detail || "Erreur analyse", ok: false });
      }
    } catch (e: any) { setMsg({ text: e.message, ok: false }); }
    finally { setAnalysing(false); }
  }

  async function handleApprove(sug: Suggestion) {
    setApproving(sug.suggestion_id); setMsg(null);
    const finalNom = editedNames[sug.suggestion_id] || sug.nom;
    try {
      const res = await fetch(`${API}/projets-ai/suggestions/approuver`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          suggestion_id: sug.suggestion_id,
          nom:           finalNom,
          type_projet:   sug.type_projet,
          localisation:  sug.localisation,
          description:   sug.description,
          priorite:      sug.priorite,
          doc_links:     sug.documents.map(d => ({
            table:     d.table,
            doc_id:    d.doc_id,
            etape:     d.etape,
            raison:    d.raison || "",
            doc_ref:   d.doc_ref || "",
            doc_titre: d.doc_titre || "",
            doc_date:  d.doc_date || "",
          })),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuggestions(prev => prev.filter(s => s.suggestion_id !== sug.suggestion_id));
        setMsg({ text: data.message, ok: true });
        onProjectCreated();
        fetchStats();
      } else {
        setMsg({ text: data.detail || "Erreur", ok: false });
      }
    } catch { setMsg({ text: "Erreur serveur", ok: false }); }
    finally { setApproving(null); }
  }

  async function handleReject(sugId: string) {
    setSuggestions(prev => prev.filter(s => s.suggestion_id !== sugId));
    await fetch(`${API}/projets-ai/suggestions/rejeter`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ suggestion_id: sugId }),
    });
  }

  const confColor = (c: number) => c >= 85 ? "#10b981" : c >= 65 ? "#f59e0b" : "#ef4444";

  // =============================================================================
  // RENDER
  // =============================================================================
  return (
    <div style={{ padding: "0" }}>

      {/* ── Message global ── */}
      {msg && (
        <div style={{
          padding: "10px 16px", borderRadius: 10, marginBottom: 14, fontSize: 13,
          background: msg.ok ? "var(--green-bg)" : "rgba(239,68,68,0.1)",
          border: `1px solid ${msg.ok ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`,
          color: msg.ok ? "var(--green)" : "var(--danger)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          {msg.text}
          <button onClick={() => setMsg(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit" }}>✕</button>
        </div>
      )}

      {/* ── Sub-tabs ── */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
        {[
          { key: "stats",       label: "📊 État du système" },
          ...(isSuperAdmin ? [{ key: "config", label: "⚙️ Configuration chemins" }] : []),
          { key: "suggestions", label: `💡 Suggestions${suggestions.length ? ` (${suggestions.length})` : ""}` },
        ].map(t => (
          <button key={t.key} onClick={() => setView(t.key as any)} style={{
            padding: "7px 14px", borderRadius: 9, fontSize: 12, fontWeight: 600,
            cursor: "pointer", fontFamily: "var(--font-body)",
            background: view === t.key ? "rgba(139,92,246,0.12)" : "var(--surface2)",
            border: `1px solid ${view === t.key ? "#8b5cf666" : "var(--border2)"}`,
            color: view === t.key ? "#a78bfa" : "var(--muted)",
            boxShadow: view === t.key ? "0 0 0 3px rgba(139,92,246,0.08)" : "none",
            transition: "all .15s",
          }}>{t.label}</button>
        ))}

        {/* Bouton Lancer analyse — super admin only */}
        {isSuperAdmin && (
          <button onClick={handleAnalyse} disabled={analysing} style={{
            marginLeft: "auto", padding: "7px 18px",
            borderRadius: 9, fontSize: 12, fontWeight: 700,
            cursor: analysing ? "not-allowed" : "pointer",
            fontFamily: "var(--font-body)",
            background: analysing ? "rgba(139,92,246,0.3)" : "linear-gradient(135deg,#8b5cf6,#7c3aed)",
            border: "none", color: "#fff",
            boxShadow: analysing ? "none" : "0 4px 14px rgba(139,92,246,0.35)",
            display: "flex", alignItems: "center", gap: 7, transition: "all .2s",
          }}>
            {analysing
              ? <><span style={{ display: "inline-block", animation: "spin .8s linear infinite" }}>⏳</span> Analyse en cours...</>
              : "🤖 Lancer l'analyse IA"}
          </button>
        )}
      </div>

      {/* ══════════ VUE : STATS ══════════ */}
      {view === "stats" && stats && (
        <div>
          {/* KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 20 }}>
            {[
              { icon: "🏗️", val: stats.total_projets,  lbl: "Projets actifs",       c: "#2563eb" },
              { icon: "🔗", val: stats.total_liens,    lbl: "Documents liés",        c: "#10b981" },
              { icon: "🤖", val: `${stats.taux_ia}%`,  lbl: "Liens créés par IA",    c: "#8b5cf6", isText: true },
              { icon: "⚠️", val: stats.total_non_lies, lbl: "Documents non liés",    c: stats.total_non_lies > 0 ? "#f59e0b" : "#10b981" },
            ].map((s, i) => (
              <div key={i} style={{
                background: "var(--surface)", border: "1px solid var(--border)",
                borderTop: `2px solid ${s.c}`, borderRadius: 12, padding: "14px 16px",
              }}>
                <div style={{ fontSize: 18, marginBottom: 8 }}>{s.icon}</div>
                <div style={{ fontSize: (s as any).isText ? 20 : 28, fontWeight: 800, color: s.c, fontFamily: "var(--font-head)", lineHeight: 1 }}>{s.val}</div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>{s.lbl}</div>
              </div>
            ))}
          </div>

          {/* Documents non liés par table */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 18, marginBottom: 16 }}>
            <div style={{ fontFamily: "var(--font-head)", fontWeight: 700, fontSize: 13, marginBottom: 14 }}>
              📋 Documents en attente de liaison
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {Object.entries(stats.docs_non_lies).map(([table, count]) => (
                <div key={table} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 16 }}>{TABLE_ICONS[table] || "📄"}</span>
                  <span style={{ fontSize: 13, color: "var(--text2)", flex: 1, textTransform: "capitalize" }}>{table.replace("_", " ")}</span>
                  <span style={{
                    fontWeight: 700, fontSize: 13,
                    color: count > 0 ? "#f59e0b" : "#10b981",
                    background: count > 0 ? "rgba(245,158,11,0.1)" : "var(--green-bg)",
                    padding: "2px 10px", borderRadius: 99, fontSize: 12,
                  }}>{count > 0 ? `${count} non lié(s)` : "✓ Tout lié"}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Info Claude */}
          <div style={{
            background: stats.api_configured ? "rgba(139,92,246,0.06)" : "rgba(239,68,68,0.06)",
            border: `1px solid ${stats.api_configured ? "rgba(139,92,246,0.2)" : "rgba(239,68,68,0.2)"}`,
            borderRadius: 12, padding: "12px 16px", fontSize: 12,
            color: stats.api_configured ? "#a78bfa" : "#f87171",
          }}>
            {stats.api_configured
              ? `✅ Claude AI configuré — Modèle : ${stats.claude_model}`
              : "❌ Clé API Claude non configurée dans .env — L'analyse IA ne fonctionnera pas"}
          </div>
        </div>
      )}

      {/* ══════════ VUE : CONFIG ══════════ */}
      {view === "config" && isSuperAdmin && config && (
        <div>
          <div style={{
            background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)",
            borderRadius: 12, padding: "12px 16px", marginBottom: 18, fontSize: 12, color: "#fbbf24", lineHeight: 1.7,
          }}>
            <strong>📁 Configuration des chemins txt</strong><br />
            Renseignez les dossiers où sont stockés les fichiers texte générés par l'OCR.<br />
            Ex : <code>C:\courrier\texts</code> — les fichiers .txt doivent avoir le même nom que les PDFs.
          </div>

          {/* Chemins */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 20, marginBottom: 14 }}>
            <div style={{ fontFamily: "var(--font-head)", fontWeight: 700, fontSize: 13, marginBottom: 16 }}>📂 Chemins des dossiers txt</div>
            {[
              { key: "courrier",        label: "📬 Courrier Arrivée", placeholder: `C:\\courrier\\texts` },
              { key: "bordereau",       label: "📋 Bordereau d'Envoi", placeholder: `C:\\bordereau_envoi\\texts` },
              { key: "courrier_depart", label: "📤 Courrier Départ", placeholder: `C:\\courrier_depart_reception\\texts` },
              { key: "devis",           label: "💰 Devis", placeholder: `C:\\devis\\texts` },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".7px", color: "var(--muted)", marginBottom: 6 }}>
                  {f.label}
                </label>
                <input
                  value={config.txt_paths[f.key] || ""}
                  onChange={e => setConfig(prev => prev ? { ...prev, txt_paths: { ...prev.txt_paths, [f.key]: e.target.value } } : prev)}
                  placeholder={f.placeholder}
                  style={inpSt}
                />
                {pathTest && (
                  <div style={{ fontSize: 11, marginTop: 4, color: pathTest[f.key]?.status === "ok" ? "#34d399" : "#f87171" }}>
                    {pathTest[f.key]?.status === "ok"
                      ? `✅ ${pathTest[f.key].count} fichier(s) txt trouvé(s) — ex: ${pathTest[f.key].exemple || "—"}`
                      : `❌ ${pathTest[f.key]?.status || "non testé"}`}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Paramètres avancés */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 20, marginBottom: 14 }}>
            <div style={{ fontFamily: "var(--font-head)", fontWeight: 700, fontSize: 13, marginBottom: 16 }}>⚙️ Paramètres d'analyse</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
              {[
                { key: "batch_size",           label: "Taille batch", desc: "Documents par appel Claude (max 30)" },
                { key: "txt_truncate_chars",   label: "Caractères txt",  desc: "Longueur extrait envoyé à Claude" },
                { key: "confidence_threshold", label: "Seuil confiance %", desc: "Suggestions affichées au-dessus de ce seuil" },
                { key: "auto_link_threshold",  label: "Seuil auto-lien %", desc: "Auto-rattachement si confiance >= seuil" },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".7px", color: "var(--muted)", marginBottom: 6 }}>
                    {f.label}
                  </label>
                  <input
                    type="number"
                    value={(config as any)[f.key] || ""}
                    onChange={e => setConfig(prev => prev ? { ...prev, [f.key]: Number(e.target.value) } : prev)}
                    style={{ ...inpSt, width: "100%" }}
                  />
                  <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>{f.desc}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleTestPaths} disabled={testing} style={{ ...btnStyle("var(--surface2)", "var(--text2)", "var(--border2)"), flex: 1 }}>
              {testing ? "⏳ Test en cours..." : "🧪 Tester les chemins"}
            </button>
            <button onClick={handleSaveConfig} disabled={saving} style={{ ...btnStyle("linear-gradient(135deg,#8b5cf6,#7c3aed)", "#fff", "none"), flex: 1 }}>
              {saving ? "⏳ Sauvegarde..." : "💾 Sauvegarder la configuration"}
            </button>
          </div>
        </div>
      )}

      {/* ══════════ VUE : SUGGESTIONS ══════════ */}
      {view === "suggestions" && (
        <div>
          {/* Stats analyse */}
          {analyseStats && (
            <div style={{
              background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.2)",
              borderRadius: 12, padding: "12px 18px", marginBottom: 16, fontSize: 12,
              display: "flex", gap: 20, flexWrap: "wrap", color: "var(--text2)",
            }}>
              <span>📊 <strong>{analyseStats.total_docs_analysed}</strong> documents analysés</span>
              <span>💡 <strong>{analyseStats.total_suggestions}</strong> suggestions de qualité</span>
              <span>⚠️ <strong>{analyseStats.faible_confiance}</strong> faible confiance</span>
              <span>🔄 <strong>{analyseStats.batches}</strong> batch(es) Claude</span>
              <span>🎯 Seuil : <strong>{analyseStats.seuil_confiance}%</strong></span>
            </div>
          )}

          {suggestions.length === 0 && !analyseStats && (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--muted)" }}>
              <div style={{ fontSize: 48, marginBottom: 14, opacity: .15 }}>🤖</div>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, color: "var(--text2)" }}>Aucune suggestion en attente</div>
              <div style={{ fontSize: 13 }}>
                {isSuperAdmin ? "Cliquez « Lancer l'analyse IA » pour détecter les projets automatiquement." : "L'administrateur système peut lancer une analyse pour générer des suggestions."}
              </div>
            </div>
          )}

          {suggestions.length === 0 && analyseStats && (
            <div style={{ background: "var(--green-bg)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: 12, padding: "16px 18px", textAlign: "center", fontSize: 13, color: "var(--green)" }}>
              ✅ Toutes les suggestions ont été traitées !
            </div>
          )}

          {/* Cartes suggestions */}
          {suggestions.map(sug => (
            <SuggestionCard
              key={sug.suggestion_id}
              sug={sug}
              isEditing={editingSug === sug.suggestion_id}
              editedName={editedNames[sug.suggestion_id] ?? sug.nom}
              approving={approving === sug.suggestion_id}
              onStartEdit={() => setEditingSug(sug.suggestion_id)}
              onCancelEdit={() => setEditingSug(null)}
              onNameChange={name => setEditedNames(prev => ({ ...prev, [sug.suggestion_id]: name }))}
              onApprove={() => handleApprove(sug)}
              onReject={() => handleReject(sug.suggestion_id)}
              confColor={confColor}
            />
          ))}

          {/* Suggestions faible confiance */}
          {lowConf.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <button onClick={() => setShowLowConf(!showLowConf)} style={{
                background: "none", border: "1px solid var(--border2)", borderRadius: 9,
                padding: "7px 14px", fontSize: 12, color: "var(--muted)", cursor: "pointer",
                fontFamily: "var(--font-body)", marginBottom: 10,
              }}>
                {showLowConf ? "▲" : "▼"} {lowConf.length} suggestion(s) faible confiance (masquées)
              </button>
              {showLowConf && lowConf.map(sug => (
                <SuggestionCard
                  key={sug.suggestion_id}
                  sug={sug}
                  isEditing={editingSug === sug.suggestion_id}
                  editedName={editedNames[sug.suggestion_id] ?? sug.nom}
                  approving={approving === sug.suggestion_id}
                  onStartEdit={() => setEditingSug(sug.suggestion_id)}
                  onCancelEdit={() => setEditingSug(null)}
                  onNameChange={name => setEditedNames(prev => ({ ...prev, [sug.suggestion_id]: name }))}
                  onApprove={() => handleApprove(sug)}
                  onReject={() => handleReject(sug.suggestion_id)}
                  confColor={confColor}
                  dimmed
                />
              ))}
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}


// =============================================================================
// SUGGESTION CARD
// =============================================================================
function SuggestionCard({
  sug, isEditing, editedName, approving,
  onStartEdit, onCancelEdit, onNameChange,
  onApprove, onReject, confColor, dimmed = false,
}: {
  sug:          Suggestion;
  isEditing:    boolean;
  editedName:   string;
  approving:    boolean;
  onStartEdit:  () => void;
  onCancelEdit: () => void;
  onNameChange: (n: string) => void;
  onApprove:    () => void;
  onReject:     () => void;
  confColor:    (c: number) => string;
  dimmed?:      boolean;
}) {
  const cc = confColor(sug.confiance);
  const ETAPE_LABELS: Record<string, string> = {
    demande_initiale: "📬 Demande initiale", reunion: "🤝 Réunion",
    etude_technique: "📐 Étude technique", carnet_piquetage: "📍 Piquetage",
    approvisionnement: "📦 Appro.", bon_execution: "✅ Bon exec.",
    travaux_en_cours: "🔨 Travaux", devis_realisation: "💰 Devis",
    bon_livraison: "📤 Livraison", reception_travaux: "🏁 Réception",
    cloture: "🎉 Clôture", renouvellement: "🔄 Renouvellement", autre: "📄 Doc",
  };
  const TABLE_ICONS: Record<string, string> = { courrier: "📬", bordereau: "📋", courrier_depart: "📤", devis: "💰" };

  return (
    <div style={{
      background: "var(--surface)", border: `1px solid ${cc}44`,
      borderLeft: `4px solid ${cc}`, borderRadius: 14, padding: 20, marginBottom: 14,
      opacity: dimmed ? .75 : 1, transition: "opacity .2s",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {isEditing ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
              <input value={editedName} onChange={e => onNameChange(e.target.value)} autoFocus
                style={{ flex: 1, background: "var(--surface2)", border: `1.5px solid ${cc}`, borderRadius: 8, padding: "7px 12px", color: "var(--text)", fontSize: 14, fontWeight: 700, outline: "none", fontFamily: "var(--font-body)" }} />
              <button onClick={onCancelEdit} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 14 }}>✕</button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
              <div style={{ fontFamily: "var(--font-head)", fontSize: 15, fontWeight: 800, color: "var(--text)" }}>{editedName}</div>
              <button onClick={onStartEdit} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 13, opacity: .6 }}>✏️</button>
            </div>
          )}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {sug.marche_numero && (
              <span style={{ background: "rgba(37,99,235,0.12)", color: "#60a5fa", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, border: "1px solid rgba(37,99,235,0.25)" }}>
                🏷️ {sug.marche_numero}
              </span>
            )}
            {sug.est_renouvellement && (
              <span style={{ background: "rgba(245,158,11,0.1)", color: "#fbbf24", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99 }}>🔄 Renouvellement</span>
            )}
            {sug.projet_existant_id && (
              <span style={{ background: "rgba(16,185,129,0.1)", color: "#34d399", fontSize: 11, padding: "2px 8px", borderRadius: 99 }}>→ Lier au projet #{sug.projet_existant_id}</span>
            )}
            {sug.localisation && <span style={{ fontSize: 11, color: "var(--muted)" }}>📍 {sug.localisation}</span>}
            <span style={{ fontSize: 11, color: "var(--muted)" }}>{["", "⚡ Ligne", "🏭 Poste", "🔧 Maint.", "📋 Admin", "📑 Marché", "📁 Autre"][["ligne_electrique","poste","maintenance","administratif","marche","autre"].indexOf(sug.type_projet) + 1] || sug.type_projet}</span>
          </div>
          {sug.description && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6, lineHeight: 1.5 }}>{sug.description}</div>}
        </div>

        {/* Confiance */}
        <div style={{ textAlign: "center", flexShrink: 0 }}>
          <div style={{ fontSize: 24, fontWeight: 900, color: cc, fontFamily: "var(--font-head)", lineHeight: 1 }}>{sug.confiance}%</div>
          <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>confiance</div>
          <div style={{ height: 4, width: 60, background: "var(--surface2)", borderRadius: 99, marginTop: 6, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${sug.confiance}%`, background: cc, borderRadius: 99 }} />
          </div>
        </div>
      </div>

      {/* Documents */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".6px", color: "var(--muted)", marginBottom: 8 }}>
          {sug.documents.length} document(s) détecté(s)
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {sug.documents.map((doc, i) => (
            <div key={i} style={{
              background: "var(--surface2)", border: "1px solid var(--border)",
              borderRadius: 8, padding: "5px 10px", fontSize: 11,
              display: "flex", alignItems: "center", gap: 5,
            }}>
              <span>{TABLE_ICONS[doc.table] || "📄"}</span>
              <span style={{ color: "var(--text2)", fontWeight: 500 }}>{doc.table} #{doc.doc_id}</span>
              <span style={{ color: "var(--muted)" }}>→</span>
              <span style={{ color: "var(--accent2)", fontWeight: 600 }}>{ETAPE_LABELS[doc.etape] || doc.etape}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onApprove} disabled={approving} style={{
          flex: 2, background: approving ? "rgba(16,185,129,0.4)" : "linear-gradient(135deg,#10b981,#059669)",
          border: "none", borderRadius: 9, padding: "10px", color: "#fff",
          fontSize: 13, fontWeight: 700, cursor: approving ? "not-allowed" : "pointer",
          boxShadow: approving ? "none" : "0 4px 14px rgba(16,185,129,0.3)",
          fontFamily: "var(--font-body)", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        }}>
          {approving ? "⏳ Création en cours..." : "✅ Approuver — Créer ce projet"}
        </button>
        <button onClick={onReject} disabled={approving} style={{
          flex: 1, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)",
          borderRadius: 9, padding: "10px", color: "#f87171",
          fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)",
        }}>
          ❌ Rejeter
        </button>
      </div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const inpSt: React.CSSProperties = {
  width: "100%", background: "var(--surface2)", border: "1px solid var(--border2)",
  borderRadius: 9, padding: "9px 12px", color: "var(--text)", fontSize: 13,
  outline: "none", fontFamily: "var(--font-body)",
};

function btnStyle(bg: string, color: string, border: string): React.CSSProperties {
  return {
    padding: "10px 16px", borderRadius: 9, fontSize: 13, fontWeight: 600,
    cursor: "pointer", border: border === "none" ? "none" : `1px solid ${border}`,
    background: bg, color, fontFamily: "var(--font-body)", transition: "all .15s",
  };
}
