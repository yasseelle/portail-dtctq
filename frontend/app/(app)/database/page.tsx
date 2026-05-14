"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";

const API = "http://10.23.23.144:8000";
const SUPER_ADMIN = "84488R";

// ── Types ─────────────────────────────────────────────────────────────────────
type TableMeta = {
  key: string;
  label: string;
  display_cols: string[];
  editable_cols: string[];
  has_dup_detection: boolean;
};

type RowData = Record<string, string> & { _id: number };

type DupGroup = {
  key_value: string;
  count: number;
  ids: number[];
  rows: RowData[];
};

const TABLE_ICONS: Record<string, string> = {
  users: "👤",
  courrier: "📬",
  bordereau: "📋",
  courrier_depart: "📤",
  devis: "💰",
  vehicules: "🚗",
  notifications: "🔔",
  projets: "🏗️",
};

const TABLE_COLORS: Record<string, string> = {
  users: "#2563eb",
  courrier: "#10b981",
  bordereau: "#f59e0b",
  courrier_depart: "#8b5cf6",
  devis: "#0ea5e9",
  vehicules: "#ef4444",
  notifications: "#f97316",
  projets: "#14b8a6",
};

// =============================================================================
export default function DatabaseManagerPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState("");
  const [tables, setTables] = useState<TableMeta[]>([]);
  const [activeTable, setActiveTable] = useState<string>("users");
  const [rows, setRows] = useState<RowData[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [displayCols, setDisplayCols] = useState<string[]>([]);
  const [editableCols, setEditableCols] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState("id");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Duplicates
  const [dups, setDups] = useState<DupGroup[]>([]);
  const [dupKey, setDupKey] = useState("");
  const [showDups, setShowDups] = useState(false);
  const [showDedupConfirm, setShowDedupConfirm] = useState(false);
  const [dedupResult,      setDedupResult]      = useState<any>(null);
  const [deduping,         setDeduping]         = useState(false);

  // Stats
  const [tableStats, setTableStats] = useState<any>(null);

  // Modals
  const [editRow, setEditRow] = useState<RowData | null>(null);
  const [editData, setEditData] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [opMsg, setOpMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Auth ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const stored = localStorage.getItem("user");
    const tok = localStorage.getItem("token");
    if (!stored || !tok) { router.push("/"); return; }
    const u = JSON.parse(stored);
    if (u.matricule !== SUPER_ADMIN) { router.push("/dashboard"); return; }
    setUser(u); setToken(tok);
  }, [router]);

  // ── Fetch tables list ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    fetch(`${API}/db-manager/tables`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { setTables(Array.isArray(data) ? data : []); })
      .catch(() => {});
  }, [token]);

  // ── Fetch rows ──────────────────────────────────────────────────────────────
  const fetchRows = useCallback(async () => {
    if (!token || !activeTable) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page), limit: "50",
        sort_col: sortCol, sort_dir: sortDir,
        ...(search ? { search } : {}),
      });
      const res = await fetch(`${API}/db-manager/${activeTable}/rows?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const d = await res.json();
        setRows(d.items);
        setTotal(d.total);
        setPages(d.pages);
        setDisplayCols(d.display_cols);
        setEditableCols(d.editable_cols);
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [token, activeTable, page, sortCol, sortDir, search]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  // ── Fetch stats ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token || !activeTable) return;
    fetch(`${API}/db-manager/${activeTable}/stats`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(setTableStats).catch(() => {});
  }, [token, activeTable]);

  // ── Fetch duplicates ─────────────────────────────────────────────────────────
  async function fetchDups() {
    setDeduping(true);
    try {
      const res = await fetch(`${API}/db-manager/${activeTable}/duplicates`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const d = await res.json();
        setDups(d.duplicates || []);
        setDupKey(d.dup_key || "");
        if ((d.duplicates || []).length > 0) {
          // Doublons trouvés → confirmation auto-déduplication
          setShowDedupConfirm(true);
        } else {
          setOpMsg({ text: "✅ Aucun doublon détecté — la table est propre.", ok: true });
        }
      }
    } catch { /* silent */ }
    finally { setDeduping(false); }
  }

  async function handleAutoDeduplicate() {
    setDeduping(true); setShowDedupConfirm(false); setOpMsg(null);
    try {
      const res = await fetch(`${API}/db-manager/${activeTable}/auto-deduplicate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json();
      setDedupResult(d);
      setOpMsg({ text: d.message, ok: res.ok });
      if (res.ok) { setDups([]); setShowDups(false); fetchRows(); }
    } catch { setOpMsg({ text: "Erreur serveur", ok: false }); }
    finally { setDeduping(false); }
  }

  // ── Switch table ────────────────────────────────────────────────────────────
  function switchTable(t: string) {
    setActiveTable(t);
    setPage(1);
    setSearch("");
    setSelected(new Set());
    setSortCol("id");
    setSortDir("desc");
    setShowDups(false);
    setDups([]);
    setOpMsg(null);
  }

  // ── Sort ─────────────────────────────────────────────────────────────────────
  function toggleSort(col: string) {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
    setPage(1);
  }

  // ── Selection ────────────────────────────────────────────────────────────────
  function toggleRow(id: number) {
    setSelected(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function toggleAll() {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map(r => r._id)));
  }

  function selectDupIds(ids: number[]) {
    setSelected(new Set(ids));
    setShowDups(false);
  }

  // ── Delete single ────────────────────────────────────────────────────────────
  async function confirmDeleteSingle() {
    if (deleteTarget === null) return;
    try {
      const res = await fetch(`${API}/db-manager/${activeTable}/${deleteTarget}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json();
      setOpMsg({ text: d.message || d.detail, ok: res.ok });
      if (res.ok) { setDeleteTarget(null); fetchRows(); }
    } catch { setOpMsg({ text: "Erreur serveur", ok: false }); }
  }

  // ── Bulk delete ──────────────────────────────────────────────────────────────
  async function confirmBulkDelete() {
    try {
      const res = await fetch(`${API}/db-manager/${activeTable}/bulk-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ids: [...selected] }),
      });
      const d = await res.json();
      setOpMsg({ text: d.message || d.detail, ok: res.ok });
      if (res.ok) { setSelected(new Set()); setShowBulkConfirm(false); fetchRows(); }
    } catch { setOpMsg({ text: "Erreur serveur", ok: false }); }
  }

  // ── Edit ─────────────────────────────────────────────────────────────────────
  function openEdit(row: RowData) {
    setEditRow(row);
    const initial: Record<string, string> = {};
    editableCols.forEach(c => { initial[c] = row[c] || ""; });
    setEditData(initial);
  }

  async function saveEdit() {
    if (!editRow) return;
    try {
      const res = await fetch(`${API}/db-manager/${activeTable}/${editRow._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ data: editData }),
      });
      const d = await res.json();
      setOpMsg({ text: d.message || d.detail, ok: res.ok });
      if (res.ok) { setEditRow(null); fetchRows(); }
    } catch { setOpMsg({ text: "Erreur serveur", ok: false }); }
  }

  // ── Export CSV ───────────────────────────────────────────────────────────────
  function exportCSV() {
    const params = search ? `?search=${encodeURIComponent(search)}` : "";
    window.open(`${API}/db-manager/${activeTable}/export-csv${params}`, "_blank");
  }

  // ── Sélectionner toutes les lignes sans PDF (toutes les pages) ───────────────
  async function selectNoPdf() {
    try {
      // Charge toutes les lignes sans PDF en une fois via l'endpoint dédié
      const res = await fetch(
        `${API}/db-manager/${activeTable}/no-pdf-ids`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        const ids: number[] = data.ids || [];
        if (ids.length === 0) {
          setOpMsg({ text: "✅ Tous les enregistrements ont un PDF associé.", ok: true });
        } else {
          setSelected(new Set(ids));
          setOpMsg({ text: `☑️ ${ids.length} enregistrement(s) sans PDF sélectionné(s) — cliquez "Supprimer la sélection" pour les supprimer.`, ok: true });
        }
      } else {
        // Fallback : sélectionne sur les lignes déjà chargées en mémoire
        const noPdfIds = rows
          .filter(r => !r["pdf_path"] || r["pdf_path"] === "" || r["pdf_path"] === "—")
          .map(r => r._id);
        if (noPdfIds.length === 0) {
          setOpMsg({ text: "✅ Aucune ligne sans PDF sur cette page.", ok: true });
        } else {
          setSelected(new Set(noPdfIds));
          setOpMsg({ text: `☑️ ${noPdfIds.length} ligne(s) sans PDF sélectionnée(s) sur cette page (${total} total — naviguez pour sélectionner les autres pages).`, ok: true });
        }
      }
    } catch {
      // Fallback silencieux sur les données en mémoire
      const noPdfIds = rows
        .filter(r => !r["pdf_path"] || r["pdf_path"] === "" || r["pdf_path"] === "—")
        .map(r => r._id);
      setSelected(new Set(noPdfIds));
    }
  }

  const color = TABLE_COLORS[activeTable] || "#2563eb";
  const tableMeta = Array.isArray(tables) ? tables.find(t => t.key === activeTable) : undefined;

  if (!user) return null;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", padding: "24px 28px" }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 24 }}>
        <button onClick={() => router.push("/dashboard")} style={{
          background: "none", border: "none", color: "var(--muted)",
          cursor: "pointer", fontSize: 12, marginBottom: 12,
          display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--font-body)",
        }}>
          ← Retour au dashboard
        </button>

        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 5 }}>
              <h1 style={{ fontFamily: "var(--font-head)", fontSize: 24, fontWeight: 800 }}>
                🗄️ Database Manager
              </h1>
              <span style={{
                background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.3)",
                color: "#60a5fa", fontSize: 11, fontWeight: 700, padding: "3px 10px",
                borderRadius: 99, letterSpacing: ".5px",
              }}>SUPER ADMIN</span>
            </div>
            <p style={{ color: "var(--muted)", fontSize: 13 }}>
              Lecture · Modification · Suppression · Détection de doublons · Export CSV
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={exportCSV} style={{
              background: "var(--surface2)", border: "1px solid var(--border2)",
              borderRadius: 9, padding: "8px 14px", color: "var(--text2)",
              fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)",
            }}>⬇️ Export CSV</button>
            {tableMeta?.has_dup_detection && (
              <button onClick={fetchDups} disabled={deduping} style={{
                background: deduping ? "rgba(245,158,11,0.05)" : "rgba(245,158,11,0.1)",
                border: "1px solid rgba(245,158,11,0.3)",
                borderRadius: 9, padding: "8px 14px", color: "#fbbf24",
                fontSize: 12, fontWeight: 600, cursor: deduping ? "not-allowed" : "pointer",
                fontFamily: "var(--font-body)", display: "flex", alignItems: "center", gap: 6,
              }}>
                {deduping
                  ? <><span style={{ display: "inline-block", animation: "spin .8s linear infinite" }}>⏳</span> Analyse...</>
                  : "🔍 Détecter & Supprimer doublons"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Op message ── */}
      {opMsg && (
        <div style={{
          padding: "10px 16px", borderRadius: 10, marginBottom: 16, fontSize: 13,
          background: opMsg.ok ? "var(--green-bg)" : "rgba(239,68,68,0.1)",
          border: `1px solid ${opMsg.ok ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`,
          color: opMsg.ok ? "var(--green)" : "var(--danger)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          {opMsg.text}
          <button onClick={() => setOpMsg(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontSize: 16 }}>✕</button>
        </div>
      )}

      {/* ── Stats row ── */}
      {tableStats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 20 }}>
          {[
            { icon: "📊", val: tableStats.total, lbl: "Total lignes", c: color },
            ...(tableStats.duplicate_groups !== undefined ? [{ icon: "⚠️", val: tableStats.duplicate_groups, lbl: "Groupes doublons", c: tableStats.duplicate_groups > 0 ? "#ef4444" : "#10b981" }] : []),
            ...(tableStats.admins !== undefined ? [{ icon: "👑", val: tableStats.admins, lbl: "Admins", c: "#f59e0b" }] : []),
            ...(tableStats.agents !== undefined ? [{ icon: "👤", val: tableStats.agents, lbl: "Agents", c: "#10b981" }] : []),
            { icon: "☑️", val: selected.size, lbl: "Sélectionnés", c: selected.size > 0 ? "#ef4444" : "var(--muted)" },
          ].map((s, i) => (
            <div key={i} style={{
              background: "var(--surface)", border: "1px solid var(--border)",
              borderTop: `2px solid ${s.c}`, borderRadius: 12, padding: "12px 14px",
            }}>
              <div style={{ fontSize: 16, marginBottom: 6 }}>{s.icon}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.c, fontFamily: "var(--font-head)", lineHeight: 1 }}>{s.val}</div>
              <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>{s.lbl}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Main layout ── */}
      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 16 }}>

        {/* ── Sidebar: table list ── */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 8, height: "fit-content" }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".8px", color: "var(--muted)", padding: "6px 10px 8px" }}>Tables DB</div>
          {tables.map(t => {
            const isActive = activeTable === t.key;
            const tc = TABLE_COLORS[t.key] || "#6b7280";
            return (
              <button key={t.key} onClick={() => switchTable(t.key)} style={{
                width: "100%", textAlign: "left", background: isActive ? `${tc}12` : "none",
                border: "none", borderLeft: `2px solid ${isActive ? tc : "transparent"}`,
                borderRadius: "0 7px 7px 0", padding: "9px 12px",
                cursor: "pointer", fontFamily: "var(--font-body)",
                color: isActive ? tc : "var(--muted)", fontSize: 13,
                fontWeight: isActive ? 600 : 400, transition: "all .15s",
                display: "flex", alignItems: "center", gap: 7,
              }}
              onMouseEnter={e => { if (!isActive) { (e.currentTarget as HTMLElement).style.background = "var(--surface2)"; (e.currentTarget as HTMLElement).style.color = "var(--text)"; } }}
              onMouseLeave={e => { if (!isActive) { (e.currentTarget as HTMLElement).style.background = "none"; (e.currentTarget as HTMLElement).style.color = "var(--muted)"; } }}>
                <span style={{ fontSize: 14 }}>{TABLE_ICONS[t.key] || "📁"}</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* ── Right: table content ── */}
        <div>

          {/* Dup warning panel */}
          {showDups && dups.length > 0 && (
            <div style={{
              background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.25)",
              borderRadius: 12, padding: 16, marginBottom: 14,
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ fontFamily: "var(--font-head)", fontWeight: 700, fontSize: 13, color: "#fbbf24" }}>
                  ⚠️ {dups.length} groupe(s) de doublons détectés sur le champ « {dupKey} »
                </div>
                <button onClick={() => setShowDups(false)} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 16 }}>✕</button>
              </div>
              {dups.map((g, i) => (
                <div key={i} style={{
                  background: "var(--surface)", border: "1px solid var(--border)",
                  borderRadius: 9, padding: "10px 12px", marginBottom: 8,
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 3 }}>
                      {g.key_value || "—"}
                      <span style={{ marginLeft: 8, background: "rgba(239,68,68,0.1)", color: "#f87171", fontSize: 10, padding: "1px 7px", borderRadius: 99 }}>{g.count}× doublon</span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>IDs : {g.ids.join(", ")}</div>
                  </div>
                  <button onClick={() => selectDupIds(g.ids)} style={{
                    background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)",
                    borderRadius: 7, padding: "4px 10px", color: "#f87171",
                    fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
                  }}>Sélectionner</button>
                </div>
              ))}
            </div>
          )}

          {showDups && dups.length === 0 && (
            <div style={{ background: "var(--green-bg)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: "var(--green)" }}>
              ✅ Aucun doublon détecté dans cette table.
            </div>
          )}

          {/* Bulk action bar */}
          {selected.size > 0 && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "9px 14px", background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.25)", borderRadius: 10, marginBottom: 10,
            }}>
              <span style={{ fontSize: 13, color: "#f87171", flex: 1, fontWeight: 500 }}>
                {selected.size} ligne(s) sélectionnée(s)
              </span>
              <button onClick={() => setShowBulkConfirm(true)} style={{
                background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.35)",
                borderRadius: 8, padding: "5px 12px", color: "#f87171",
                fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}>🗑️ Supprimer la sélection</button>
              <button onClick={() => setSelected(new Set())} style={{
                background: "var(--surface2)", border: "1px solid var(--border2)",
                borderRadius: 8, padding: "5px 10px", color: "var(--muted)",
                fontSize: 12, cursor: "pointer",
              }}>Désélectionner</button>
            </div>
          )}

          {/* Shortcut: select no-pdf rows — only for tables that have pdf_path */}
          {["courrier", "bordereau", "courrier_depart", "devis"].includes(activeTable) && selected.size === 0 && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "8px 12px", background: "rgba(245,158,11,0.06)",
              border: "1px solid rgba(245,158,11,0.2)", borderRadius: 10, marginBottom: 10,
            }}>
              <span style={{ fontSize: 12, color: "#fbbf24", flex: 1 }}>
                📎 Certains enregistrements n'ont pas de PDF associé
              </span>
              <button onClick={selectNoPdf} style={{
                background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.3)",
                borderRadius: 8, padding: "5px 12px", color: "#fbbf24",
                fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
              }}>☑️ Sélectionner les lignes sans PDF</button>
            </div>
          )}

          {/* Search toolbar */}
          <div style={{
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: 11, padding: "9px 12px", marginBottom: 12,
            display: "flex", gap: 10, alignItems: "center",
          }}>
            <div style={{ position: "relative", flex: 1 }}>
              <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", fontSize: 13 }}>🔍</span>
              <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder={`Rechercher dans ${activeTable}...`}
                style={{
                  width: "100%", background: "var(--surface2)", border: "1px solid var(--border2)",
                  borderRadius: 8, padding: "7px 12px 7px 34px", color: "var(--text)",
                  fontSize: 13, outline: "none", fontFamily: "var(--font-body)",
                }}
                onFocus={e => { e.target.style.borderColor = color; }}
                onBlur={e => { e.target.style.borderColor = "var(--border2)"; }} />
            </div>
            <span style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>
              {loading ? "⏳" : `${total} lignes`}
            </span>
          </div>

          {/* Table */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                <thead>
                  <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
                    <th style={thSt}>
                      <input type="checkbox"
                        checked={rows.length > 0 && selected.size === rows.length}
                        onChange={toggleAll}
                        style={{ cursor: "pointer", accentColor: color }} />
                    </th>
                    {displayCols.map(col => (
                      <th key={col} onClick={() => toggleSort(col)} style={{ ...thSt, cursor: "pointer", userSelect: "none", color: sortCol === col ? color : "var(--muted)" }}>
                        {col.replace(/_/g, " ")}
                        {sortCol === col && <span style={{ marginLeft: 4, fontSize: 9, opacity: .7 }}>{sortDir === "asc" ? "▲" : "▼"}</span>}
                      </th>
                    ))}
                    <th style={thSt}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                        {Array.from({ length: displayCols.length + 2 }).map((_, j) => (
                          <td key={j} style={{ padding: "10px 12px" }}>
                            <div className="skeleton" style={{ height: 12, borderRadius: 4, width: j === 0 ? "16px" : "80%" }} />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={displayCols.length + 2} style={{ padding: "40px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
                        <div style={{ fontSize: 32, marginBottom: 8, opacity: .15 }}>🗄️</div>
                        Aucun enregistrement
                      </td>
                    </tr>
                  ) : rows.map(row => {
                    const isSuper = activeTable === "users" && row["matricule"] === SUPER_ADMIN;
                    const isSel = selected.has(row._id);
                    return (
                      <tr key={row._id} style={{
                        borderBottom: "1px solid var(--border)",
                        background: isSel ? `${color}10` : "transparent",
                        transition: "background .1s",
                      }}
                      onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = "var(--surface2)"; }}
                      onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                        <td style={{ padding: "8px 12px" }}>
                          <input type="checkbox" checked={isSel} disabled={isSuper}
                            onChange={() => !isSuper && toggleRow(row._id)}
                            style={{ cursor: isSuper ? "not-allowed" : "pointer", accentColor: color, opacity: isSuper ? .3 : 1 }} />
                        </td>
                        {displayCols.map(col => {
                          let val = row[col] || "—";
                          let extra: React.CSSProperties = {};
                          if (col === "role") {
                            if (row["matricule"] === SUPER_ADMIN) return (
                              <td key={col} style={tdSt}><span style={{ background: "rgba(37,99,235,0.15)", color: "#60a5fa", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99 }}>⚡ super admin</span></td>
                            );
                            return (
                              <td key={col} style={tdSt}>
                                <span style={{
                                  background: val === "admin" ? "rgba(245,158,11,0.1)" : "rgba(16,185,129,0.1)",
                                  color: val === "admin" ? "#fbbf24" : "#34d399",
                                  fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
                                }}>{val === "admin" ? "👑 admin" : "👤 agent"}</span>
                              </td>
                            );
                          }
                          if (col === "statut") extra = { color: val === "termine" ? "#34d399" : val === "en_cours" ? "#60a5fa" : "var(--muted)" };
                          if (col === "actif") extra = { color: val === "oui" ? "#34d399" : "#f87171" };
                          return (
                            <td key={col} style={{ ...tdSt, ...extra }}>
                              <span title={val} style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>
                                {val}
                              </span>
                            </td>
                          );
                        })}
                        <td style={{ padding: "6px 12px" }}>
                          {isSuper ? (
                            <span style={{ fontSize: 10, color: "var(--muted)", fontStyle: "italic" }}>protégé</span>
                          ) : (
                            <div style={{ display: "flex", gap: 5 }}>
                              <button onClick={() => openEdit(row)} style={btnSmall("#2563eb", "#60a5fa")}>✏️ Modifier</button>
                              <button onClick={() => setDeleteTarget(row._id)} style={btnSmall("#ef4444", "#f87171")}>🗑️</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pages > 1 && (
              <div style={{ display: "flex", justifyContent: "center", gap: 5, padding: 12, borderTop: "1px solid var(--border)" }}>
                <button className="pag-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>←</button>
                {Array.from({ length: Math.min(pages, 7) }, (_, i) => i + Math.max(1, page - 3))
                  .filter(p => p <= pages)
                  .map(p => (
                    <button key={p} className={`pag-btn ${p === page ? "active" : ""}`} onClick={() => setPage(p)}>{p}</button>
                  ))}
                <button className="pag-btn" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>→</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ════ MODAL: Confirmation Auto-Déduplication ════ */}
      {showDedupConfirm && dups.length > 0 && (
        <Overlay onClose={() => setShowDedupConfirm(false)}>
          <div style={{ ...modalSt, maxWidth: 520, borderTop: "2px solid #f59e0b" }}>
            <ModalHeader
              title="🔍 Doublons détectés — Déduplication automatique"
              onClose={() => setShowDedupConfirm(false)}
            />

            {/* Résumé */}
            <div style={{
              background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)",
              borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 13,
            }}>
              <div style={{ fontWeight: 700, color: "#fbbf24", marginBottom: 8 }}>
                ⚠️ {dups.length} groupe(s) de doublons trouvé(s) sur le champ « {dupKey} »
              </div>
              <div style={{ fontSize: 12, color: "var(--text2)", lineHeight: 1.7 }}>
                Stratégie : <strong>conserver le plus ancien</strong> (ID le plus bas) et supprimer les copies.<br/>
                Les doublons ne reviendront pas — la sync Excel vérifie l'existence avant d'insérer.
              </div>
            </div>

            {/* Détail des groupes */}
            <div style={{ maxHeight: 240, overflowY: "auto", marginBottom: 16, display: "flex", flexDirection: "column", gap: 6 }}>
              {dups.map((g, i) => (
                <div key={i} style={{
                  background: "var(--surface2)", border: "1px solid var(--border)",
                  borderRadius: 9, padding: "9px 12px", fontSize: 12,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: 600, color: "var(--text)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {g.key_value || "—"}
                    </span>
                    <span style={{ marginLeft: 8, flexShrink: 0 }}>
                      <span style={{ background: "var(--green-bg)", color: "var(--green)", fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 99, marginRight: 4 }}>
                        ✓ garder #{(g as any).id_a_garder}
                      </span>
                      <span style={{ background: "rgba(239,68,68,0.1)", color: "#f87171", fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 99 }}>
                        🗑️ supprimer {(g as any).ids_a_supprimer?.length} copie(s)
                      </span>
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowDedupConfirm(false)} style={btnCancelSt}>
                Annuler
              </button>
              <button onClick={handleAutoDeduplicate} disabled={deduping} style={{
                flex: 2, background: "linear-gradient(135deg,#f59e0b,#d97706)",
                border: "none", borderRadius: 9, padding: "11px", color: "#fff",
                fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-body)",
              }}>
                {deduping ? "⏳ Déduplication en cours..." : `✅ Supprimer automatiquement les ${dups.reduce((s,g)=>(s + ((g as any).ids_a_supprimer?.length||0)), 0)} doublon(s)`}
              </button>
            </div>
          </div>
        </Overlay>
      )}

      {/* ════ MODAL: Edit ════ */}
      {editRow && (
        <Overlay onClose={() => setEditRow(null)}>
          <div style={modalSt}>
            <ModalHeader title={`✏️ Modifier — ${activeTable} #${editRow._id}`} onClose={() => setEditRow(null)} />
            <div style={{ maxHeight: "55vh", overflowY: "auto", paddingRight: 4 }}>
              {editableCols.map(col => (
                <div key={col} style={{ marginBottom: 14 }}>
                  <label style={lblSt}>{col.replace(/_/g, " ")}</label>
                  <input value={editData[col] || ""} onChange={e => setEditData(prev => ({ ...prev, [col]: e.target.value }))}
                    style={inpSt} />
                </div>
              ))}
            </div>
            <div style={mfSt}>
              <button onClick={() => setEditRow(null)} style={btnCancelSt}>Annuler</button>
              <button onClick={saveEdit} style={btnSaveSt(color)}>✅ Enregistrer</button>
            </div>
          </div>
        </Overlay>
      )}

      {/* ════ MODAL: Delete single ════ */}
      {deleteTarget !== null && (
        <Overlay onClose={() => setDeleteTarget(null)}>
          <div style={{ ...modalSt, maxWidth: 400, borderTop: "2px solid #ef4444" }}>
            <ModalHeader title="🗑️ Confirmer la suppression" onClose={() => setDeleteTarget(null)} />
            <p style={{ fontSize: 13, color: "var(--text2)", marginBottom: 16, lineHeight: 1.6 }}>
              Supprimer l'enregistrement <strong style={{ color: "var(--text)" }}>#{deleteTarget}</strong> de la table <strong style={{ color: "var(--text)" }}>{activeTable}</strong> ?
              <br /><span style={{ color: "var(--danger)", fontSize: 12 }}>⚠️ Cette action est irréversible.</span>
            </p>
            <div style={mfSt}>
              <button onClick={() => setDeleteTarget(null)} style={btnCancelSt}>Annuler</button>
              <button onClick={confirmDeleteSingle} style={{ ...btnSaveSt("#ef4444"), background: "rgba(239,68,68,0.15)", color: "#f87171", border: "1px solid rgba(239,68,68,0.35)" }}>
                Supprimer définitivement
              </button>
            </div>
          </div>
        </Overlay>
      )}

      {/* ════ MODAL: Bulk delete ════ */}
      {showBulkConfirm && (
        <Overlay onClose={() => setShowBulkConfirm(false)}>
          <div style={{ ...modalSt, maxWidth: 420, borderTop: "2px solid #ef4444" }}>
            <ModalHeader title={`🗑️ Supprimer ${selected.size} enregistrement(s) ?`} onClose={() => setShowBulkConfirm(false)} />
            <div style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 9, padding: "10px 12px", marginBottom: 14, fontSize: 12, color: "#f87171" }}>
              IDs concernés : {[...selected].join(", ")}
            </div>
            <p style={{ fontSize: 13, color: "var(--danger)", marginBottom: 16 }}>⚠️ Cette action est irréversible.</p>
            <div style={mfSt}>
              <button onClick={() => setShowBulkConfirm(false)} style={btnCancelSt}>Annuler</button>
              <button onClick={confirmBulkDelete} style={{ ...btnSaveSt("#ef4444"), background: "rgba(239,68,68,0.15)", color: "#f87171", border: "1px solid rgba(239,68,68,0.35)" }}>
                Confirmer la suppression
              </button>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(4px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      {children}
    </div>
  );
}

function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
      <div style={{ fontFamily: "var(--font-head)", fontSize: 15, fontWeight: 700 }}>{title}</div>
      <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 20 }}>✕</button>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const thSt: React.CSSProperties = {
  padding: "9px 12px", textAlign: "left", fontSize: 10, fontWeight: 700,
  textTransform: "uppercase", letterSpacing: ".6px",
  whiteSpace: "nowrap", transition: "color .15s",
};
const tdSt: React.CSSProperties = { padding: "8px 12px", verticalAlign: "middle" };

function btnSmall(borderC: string, textC: string): React.CSSProperties {
  return {
    padding: "4px 9px", fontSize: 11, cursor: "pointer",
    border: `1px solid ${borderC}33`, borderRadius: 6, background: `${borderC}10`,
    color: textC, fontFamily: "var(--font-body)", transition: "all .1s",
    whiteSpace: "nowrap",
  };
}

const modalSt: React.CSSProperties = {
  background: "var(--surface)", border: "1px solid var(--border2)",
  borderRadius: 16, padding: 28, width: "100%", maxWidth: 520,
  boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
};
const lblSt: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase",
  letterSpacing: ".7px", color: "var(--muted)", marginBottom: 6,
};
const inpSt: React.CSSProperties = {
  width: "100%", background: "var(--surface2)", border: "1px solid var(--border2)",
  borderRadius: 9, padding: "9px 12px", color: "var(--text)", fontSize: 13,
  outline: "none", fontFamily: "var(--font-body)",
};
const mfSt: React.CSSProperties = {
  display: "flex", justifyContent: "flex-end", gap: 10,
  marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border)",
};
const btnCancelSt: React.CSSProperties = {
  background: "var(--surface2)", border: "1px solid var(--border2)",
  borderRadius: 9, padding: "9px 16px", color: "var(--text)",
  fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)",
};
function btnSaveSt(c: string): React.CSSProperties {
  return {
    background: `linear-gradient(135deg,${c},${c}cc)`, border: "none",
    borderRadius: 9, padding: "9px 18px", color: "#fff",
    fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-body)",
  };
}

// Inject keyframes globally (spin for loading indicators)
if (typeof document !== "undefined") {
  const styleId = "db-manager-keyframes";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
    document.head.appendChild(style);
  }
}