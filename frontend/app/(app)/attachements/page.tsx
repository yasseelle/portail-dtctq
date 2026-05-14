"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Article {
  id?:           number;
  article:       string;
  quantite:      number | null;
  unite:         string;
  prix_unitaire: number | null;
  montant_total: number | null;
}

interface Attachement {
  id:            number;
  entreprise:    string | null;
  date_document: string | null;
  marche_numero: string | null;
  marche_nom:    string | null;
  date_debut:    string | null;
  date_fin:      string | null;
  att_numero:    number | null;
  pdf_path:      string | null;
  projet_id:     number | null;
  source:        string | null;
  has_pdf:       boolean;
  articles:      Article[];
}

const API = process.env.NEXT_PUBLIC_API_URL || "http://10.23.23.144:8000";

function getToken() {
  return typeof window !== "undefined" ? localStorage.getItem("token") : "";
}

function authHeaders(extra: Record<string, string> = {}) {
  return { Authorization: `Bearer ${getToken()}`, ...extra };
}

// ── Source badge ──────────────────────────────────────────────────────────────
function SourceBadge({ source }: { source: string | null }) {
  const map: Record<string, { label: string; cls: string }> = {
    claude:           { label: "🔵 Claude",    cls: "bg-blue-100 text-blue-700"   },
    "tesseract+claude":{ label: "🟢 Hybride",   cls: "bg-green-100 text-green-700" },
    tesseract:        { label: "⚫ Tesseract",  cls: "bg-gray-100 text-gray-700"   },
    manuel:           { label: "✏️ Manuel",    cls: "bg-yellow-100 text-yellow-700"},
    error:            { label: "❌ Erreur",    cls: "bg-red-100 text-red-700"     },
  };
  const s = map[source || "manuel"] || map["manuel"];
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}

// ── Articles table ────────────────────────────────────────────────────────────
function ArticlesTable({ articles }: { articles: Article[] }) {
  if (!articles.length) return (
    <p className="text-[var(--muted)] text-sm italic py-2">Aucun article enregistré.</p>
  );
  const total = articles.reduce((s, a) => s + (a.montant_total ?? 0), 0);
  return (
    <div className="overflow-x-auto mt-2">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-[var(--surface2)] text-[var(--muted)]">
            <th className="px-3 py-2 text-left border border-[var(--border)]">Article</th>
            <th className="px-3 py-2 text-right border border-[var(--border)]">Qté</th>
            <th className="px-3 py-2 text-center border border-[var(--border)]">Unité</th>
            <th className="px-3 py-2 text-right border border-[var(--border)]">Prix Unit.</th>
            <th className="px-3 py-2 text-right border border-[var(--border)]">Montant DH</th>
          </tr>
        </thead>
        <tbody>
          {articles.map((a, i) => (
            <tr key={i} className={i % 2 === 0 ? "bg-[var(--surface)]" : "bg-[var(--surface2)]"}>
              <td className="px-3 py-1.5 border border-[var(--border)]">{a.article || "—"}</td>
              <td className="px-3 py-1.5 text-right border border-[var(--border)]">{a.quantite ?? "—"}</td>
              <td className="px-3 py-1.5 text-center border border-[var(--border)]">{a.unite || "—"}</td>
              <td className="px-3 py-1.5 text-right border border-[var(--border)]">
                {a.prix_unitaire != null ? a.prix_unitaire.toLocaleString("fr-MA") : "—"}
              </td>
              <td className="px-3 py-1.5 text-right border border-[var(--border)] font-medium">
                {a.montant_total != null ? a.montant_total.toLocaleString("fr-MA") : "—"}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-[var(--accent)] text-white font-bold">
            <td colSpan={4} className="px-3 py-2 border border-[var(--border)] text-right">Total</td>
            <td className="px-3 py-2 border border-[var(--border)] text-right">
              {total.toLocaleString("fr-MA")} DH
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
export default function AttachementsPage() {
  const [atts,        setAtts]        = useState<Attachement[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState("");
  const [expanded,    setExpanded]    = useState<number | null>(null);
  const [tab,         setTab]         = useState<"list" | "scan" | "manual">("list");

  // ── Scan state ──────────────────────────────────────────────────────────────
  const [scanFile,    setScanFile]    = useState<File | null>(null);
  const [scanning,    setScanning]    = useState(false);
  const [scanResult,  setScanResult]  = useState<any | null>(null);
  const [tmpFilename, setTmpFilename] = useState<string>("");
  const [saving,      setSaving]      = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Manual form state ────────────────────────────────────────────────────────
  const emptyForm = () => ({
    entreprise: "", date_document: "", marche_numero: "", marche_nom: "",
    date_debut: "", date_fin: "", att_numero: "", articles: [] as Article[],
  });
  const [form,        setForm]        = useState(emptyForm());

  // ── Load list ────────────────────────────────────────────────────────────────
  const loadAtts = useCallback(async () => {
    setLoading(true);
    try {
      const q   = search ? `?search=${encodeURIComponent(search)}` : "";
      const res = await fetch(`${API}/attachements${q}`, { headers: authHeaders() });
      const data = await res.json();
      setAtts(Array.isArray(data) ? data : []);
    } catch { setAtts([]); }
    finally { setLoading(false); }
  }, [search]);

  useEffect(() => { loadAtts(); }, [loadAtts]);

  // ── Scan PDF ─────────────────────────────────────────────────────────────────
  const handleScan = async () => {
    if (!scanFile) return;
    setScanning(true);
    setScanResult(null);
    const fd = new FormData();
    fd.append("file", scanFile);
    try {
      const res  = await fetch(`${API}/attachements/scan`, {
        method: "POST", headers: authHeaders(), body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Erreur scan");
      setTmpFilename(data.tmp_filename || "");
      setScanResult(data.extracted);
    } catch (e: any) {
      alert("Erreur : " + e.message);
    } finally { setScanning(false); }
  };

  // ── Confirm scan ─────────────────────────────────────────────────────────────
  const handleConfirm = async () => {
    if (!scanResult) return;
    setSaving(true);
    try {
      const body = { ...scanResult, articles: scanResult.articles || [] };
      const url  = `${API}/attachements/confirm?tmp_filename=${encodeURIComponent(tmpFilename)}`;
      const res  = await fetch(url, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Erreur");
      setScanResult(null);
      setScanFile(null);
      setTmpFilename("");
      if (fileRef.current) fileRef.current.value = "";
      await loadAtts();
      setTab("list");
      alert("✅ Attachement enregistré !");
    } catch (e: any) { alert("Erreur : " + e.message); }
    finally { setSaving(false); }
  };

  // ── Manual create ─────────────────────────────────────────────────────────────
  const handleManualCreate = async () => {
    setSaving(true);
    try {
      const body = { ...form, att_numero: form.att_numero ? Number(form.att_numero) : null };
      const res  = await fetch(`${API}/attachements`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Erreur");
      setForm(emptyForm());
      await loadAtts();
      setTab("list");
      alert("✅ Attachement créé !");
    } catch (e: any) { alert("Erreur : " + e.message); }
    finally { setSaving(false); }
  };

  // ── Delete ────────────────────────────────────────────────────────────────────
  const handleDelete = async (id: number) => {
    if (!confirm("Supprimer cet attachement ?")) return;
    await fetch(`${API}/attachements/${id}`, { method: "DELETE", headers: authHeaders() });
    await loadAtts();
  };

  // ── Add article row (manual) ─────────────────────────────────────────────────
  const addArticleRow = () => {
    setForm(f => ({
      ...f,
      articles: [...f.articles, { article: "", quantite: null, unite: "", prix_unitaire: null, montant_total: null }],
    }));
  };
  const updateArticle = (i: number, field: string, val: any) => {
    setForm(f => {
      const arts = [...f.articles];
      (arts[i] as any)[field] = val;
      if (field === "quantite" || field === "prix_unitaire") {
        const q  = field === "quantite"      ? Number(val) : (arts[i].quantite ?? 0);
        const p  = field === "prix_unitaire" ? Number(val) : (arts[i].prix_unitaire ?? 0);
        arts[i].montant_total = q * p || null;
      }
      return { ...f, articles: arts };
    });
  };

  // ── Update scan result article ────────────────────────────────────────────────
  const updateScanArticle = (i: number, field: string, val: any) => {
    setScanResult((r: any) => {
      const arts = [...(r.articles || [])];
      arts[i] = { ...arts[i], [field]: val };
      if (field === "quantite" || field === "prix_unitaire") {
        const q = field === "quantite"      ? Number(val) : (arts[i].quantite ?? 0);
        const p = field === "prix_unitaire" ? Number(val) : (arts[i].prix_unitaire ?? 0);
        arts[i].montant_total = q * p || null;
      }
      return { ...r, articles: arts };
    });
  };

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]" style={{ fontFamily: "var(--font-head)" }}>
            📎 Gestion des Attachements
          </h1>
          <p className="text-[var(--muted)] text-sm mt-1">
            Décomptes de travaux ONEE — {atts.length} attachement{atts.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setTab("scan")}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-[var(--accent)] text-white hover:opacity-90 transition"
          >
            🤖 Scanner PDF (IA)
          </button>
          <button
            onClick={() => setTab("manual")}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--border)] text-[var(--text)] hover:bg-[var(--surface2)] transition"
          >
            ✏️ Saisie manuelle
          </button>
        </div>
      </div>

      {/* ── ONGLETS ─────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 mb-5 border-b border-[var(--border)]">
        {(["list", "scan", "manual"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
              tab === t
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-transparent text-[var(--muted)] hover:text-[var(--text)]"
            }`}
          >
            {t === "list" ? "📋 Liste" : t === "scan" ? "🤖 Scanner IA" : "✏️ Manuel"}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          TAB : LIST
      ══════════════════════════════════════════════════════════════════════ */}
      {tab === "list" && (
        <>
          {/* Barre de recherche */}
          <div className="mb-4">
            <input
              type="text"
              placeholder="🔍 Rechercher par entreprise, marché, nom..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full max-w-md px-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </div>

          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-14 rounded-xl bg-[var(--surface2)] animate-pulse" />
              ))}
            </div>
          ) : atts.length === 0 ? (
            <div className="text-center py-16 text-[var(--muted)]">
              <div className="text-5xl mb-3">📎</div>
              <p className="text-lg font-medium">Aucun attachement trouvé</p>
              <p className="text-sm mt-1">Scannez un PDF ou créez manuellement</p>
            </div>
          ) : (
            <div className="space-y-2">
              {atts.map(att => (
                <div
                  key={att.id}
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden transition-shadow hover:shadow-md"
                >
                  {/* Row header */}
                  <div
                    className="flex items-center gap-4 px-4 py-3 cursor-pointer select-none"
                    onClick={() => setExpanded(expanded === att.id ? null : att.id)}
                  >
                    {/* Att N° badge */}
                    <div className="w-10 h-10 rounded-lg bg-[var(--accent)] text-white flex items-center justify-center font-bold text-sm shrink-0">
                      #{att.att_numero ?? "?"}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-[var(--text)] text-sm">
                          {att.entreprise || "Entreprise inconnue"}
                        </span>
                        {att.marche_numero && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--surface2)] text-[var(--muted)] font-mono">
                            {att.marche_numero}
                          </span>
                        )}
                        <SourceBadge source={att.source} />
                      </div>
                      <p className="text-xs text-[var(--muted)] mt-0.5 truncate">
                        {att.marche_nom || "—"} · {att.date_debut || "?"} → {att.date_fin || "?"}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="text-xs text-[var(--muted)]">Doc: {att.date_document || "—"}</p>
                      <p className="text-xs text-[var(--muted)]">{att.articles.length} article{att.articles.length !== 1 ? "s" : ""}</p>
                    </div>

                    <div className="flex items-center gap-2 ml-2">
                      {att.has_pdf && (
                        <a
                          href={`${API}/attachements/${att.id}/pdf`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="text-xs px-2 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100 transition"
                        >
                          📄 PDF
                        </a>
                      )}
                      <button
                        onClick={e => { e.stopPropagation(); handleDelete(att.id); }}
                        className="text-xs px-2 py-1 rounded bg-red-50 text-red-500 hover:bg-red-100 transition"
                      >
                        🗑️
                      </button>
                      <span className="text-[var(--muted)] text-sm">
                        {expanded === att.id ? "▲" : "▼"}
                      </span>
                    </div>
                  </div>

                  {/* Expanded articles */}
                  {expanded === att.id && (
                    <div className="px-4 pb-4 border-t border-[var(--border)] bg-[var(--surface2)]">
                      <ArticlesTable articles={att.articles} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB : SCAN IA
      ══════════════════════════════════════════════════════════════════════ */}
      {tab === "scan" && (
        <div className="max-w-3xl">
          {!scanResult ? (
            <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-6">
              <h2 className="font-semibold text-[var(--text)] mb-4">
                🤖 Extraction automatique par Claude AI
              </h2>

              {/* Drop zone */}
              <div
                className="border-2 border-dashed border-[var(--accent)] rounded-xl p-10 text-center cursor-pointer hover:bg-[var(--surface2)] transition"
                onClick={() => fileRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault();
                  const f = e.dataTransfer.files[0];
                  if (f?.type === "application/pdf") setScanFile(f);
                }}
              >
                <div className="text-4xl mb-3">📄</div>
                <p className="text-[var(--text)] font-medium">
                  {scanFile ? scanFile.name : "Glissez un PDF ici ou cliquez pour choisir"}
                </p>
                <p className="text-[var(--muted)] text-sm mt-1">PDF uniquement</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={e => setScanFile(e.target.files?.[0] || null)}
                />
              </div>

              <button
                onClick={handleScan}
                disabled={!scanFile || scanning}
                className="mt-4 w-full py-3 rounded-xl bg-[var(--accent)] text-white font-semibold text-sm hover:opacity-90 transition disabled:opacity-40"
              >
                {scanning ? "⏳ Analyse en cours..." : "🚀 Lancer l'extraction IA"}
              </button>

              {scanning && (
                <div className="mt-4 text-center text-[var(--muted)] text-sm animate-pulse">
                  Claude analyse le PDF et extrait les articles... (~10-30s)
                </div>
              )}
            </div>
          ) : (
            /* ── Résultat extraction — formulaire de review ── */
            <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-[var(--text)]">
                  ✅ Résultat extraction — Vérifiez et confirmez
                </h2>
                <SourceBadge source={scanResult.source} />
              </div>

              {/* Champs principaux */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                {[
                  ["entreprise",    "Entreprise",    "text"],
                  ["date_document", "Date document", "text"],
                  ["marche_numero", "Marché N°",     "text"],
                  ["marche_nom",    "Marché nom",    "text"],
                  ["date_debut",    "Date début",    "text"],
                  ["date_fin",      "Date fin",      "text"],
                  ["att_numero",    "Att N°",        "number"],
                ].map(([key, label, type]) => (
                  <div key={key}>
                    <label className="text-xs text-[var(--muted)] font-medium block mb-1">{label}</label>
                    <input
                      type={type}
                      value={scanResult[key] ?? ""}
                      onChange={e => setScanResult((r: any) => ({ ...r, [key]: type === "number" ? Number(e.target.value) : e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface2)] text-[var(--text)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    />
                  </div>
                ))}
              </div>

              {/* Articles */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium text-[var(--text)] text-sm">
                    Articles extraits ({scanResult.articles?.length || 0})
                  </h3>
                  <button
                    onClick={() => setScanResult((r: any) => ({
                      ...r,
                      articles: [...(r.articles || []), { article: "", quantite: null, unite: "", prix_unitaire: null, montant_total: null }],
                    }))}
                    className="text-xs px-2 py-1 rounded bg-[var(--surface2)] text-[var(--accent)] border border-[var(--border)] hover:bg-[var(--accent)] hover:text-white transition"
                  >
                    + Ajouter ligne
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[var(--muted)] text-xs">
                        <th className="text-left pb-1 pr-2">Article</th>
                        <th className="text-right pb-1 pr-2 w-20">Qté</th>
                        <th className="text-left pb-1 pr-2 w-20">Unité</th>
                        <th className="text-right pb-1 pr-2 w-28">Prix unit.</th>
                        <th className="text-right pb-1 w-28">Montant DH</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(scanResult.articles || []).map((a: Article, i: number) => (
                        <tr key={i} className="border-t border-[var(--border)]">
                          <td className="py-1 pr-2">
                            <input
                              value={a.article || ""}
                              onChange={e => updateScanArticle(i, "article", e.target.value)}
                              className="w-full px-2 py-1 rounded border border-[var(--border)] bg-[var(--surface2)] text-[var(--text)] text-xs"
                            />
                          </td>
                          <td className="py-1 pr-2">
                            <input
                              type="number"
                              value={a.quantite ?? ""}
                              onChange={e => updateScanArticle(i, "quantite", e.target.value)}
                              className="w-full px-2 py-1 rounded border border-[var(--border)] bg-[var(--surface2)] text-[var(--text)] text-xs text-right"
                            />
                          </td>
                          <td className="py-1 pr-2">
                            <input
                              value={a.unite || ""}
                              onChange={e => updateScanArticle(i, "unite", e.target.value)}
                              className="w-full px-2 py-1 rounded border border-[var(--border)] bg-[var(--surface2)] text-[var(--text)] text-xs"
                            />
                          </td>
                          <td className="py-1 pr-2">
                            <input
                              type="number"
                              value={a.prix_unitaire ?? ""}
                              onChange={e => updateScanArticle(i, "prix_unitaire", e.target.value)}
                              className="w-full px-2 py-1 rounded border border-[var(--border)] bg-[var(--surface2)] text-[var(--text)] text-xs text-right"
                            />
                          </td>
                          <td className="py-1 text-right text-[var(--muted)] text-xs">
                            {a.montant_total != null ? a.montant_total.toLocaleString("fr-MA") : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleConfirm}
                  disabled={saving}
                  className="flex-1 py-3 rounded-xl bg-[var(--accent)] text-white font-semibold text-sm hover:opacity-90 transition disabled:opacity-40"
                >
                  {saving ? "💾 Enregistrement..." : "✅ Confirmer et enregistrer"}
                </button>
                <button
                  onClick={() => { setScanResult(null); setScanFile(null); if (fileRef.current) fileRef.current.value = ""; }}
                  className="px-6 py-3 rounded-xl border border-[var(--border)] text-[var(--text)] text-sm hover:bg-[var(--surface2)] transition"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB : MANUAL
      ══════════════════════════════════════════════════════════════════════ */}
      {tab === "manual" && (
        <div className="max-w-3xl bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-6">
          <h2 className="font-semibold text-[var(--text)] mb-4">✏️ Saisie manuelle</h2>

          <div className="grid grid-cols-2 gap-3 mb-4">
            {[
              ["entreprise",    "Entreprise",    "text"],
              ["date_document", "Date document (DD/MM/YYYY)", "text"],
              ["marche_numero", "Marché N° (ex: TC97132)",   "text"],
              ["marche_nom",    "Nom du marché",             "text"],
              ["date_debut",    "Date début (DD/MM/YYYY)",   "text"],
              ["date_fin",      "Date fin (DD/MM/YYYY)",     "text"],
              ["att_numero",    "Att N°",                    "number"],
            ].map(([key, label, type]) => (
              <div key={key}>
                <label className="text-xs text-[var(--muted)] font-medium block mb-1">{label}</label>
                <input
                  type={type}
                  value={(form as any)[key]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface2)] text-[var(--text)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                />
              </div>
            ))}
          </div>

          {/* Articles */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium text-[var(--text)] text-sm">Articles</h3>
              <button
                onClick={addArticleRow}
                className="text-xs px-3 py-1 rounded-lg bg-[var(--accent)] text-white hover:opacity-90 transition"
              >
                + Ajouter article
              </button>
            </div>
            {form.articles.length === 0 ? (
              <p className="text-[var(--muted)] text-xs italic">Aucun article. Cliquez sur "+ Ajouter article".</p>
            ) : (
              <div className="space-y-2">
                {form.articles.map((a, i) => (
                  <div key={i} className="grid grid-cols-5 gap-2 items-center">
                    <input
                      placeholder="Article"
                      value={a.article || ""}
                      onChange={e => updateArticle(i, "article", e.target.value)}
                      className="col-span-2 px-2 py-1.5 rounded border border-[var(--border)] bg-[var(--surface2)] text-[var(--text)] text-xs"
                    />
                    <input
                      type="number"
                      placeholder="Qté"
                      value={a.quantite ?? ""}
                      onChange={e => updateArticle(i, "quantite", e.target.value)}
                      className="px-2 py-1.5 rounded border border-[var(--border)] bg-[var(--surface2)] text-[var(--text)] text-xs"
                    />
                    <input
                      placeholder="Unité"
                      value={a.unite || ""}
                      onChange={e => updateArticle(i, "unite", e.target.value)}
                      className="px-2 py-1.5 rounded border border-[var(--border)] bg-[var(--surface2)] text-[var(--text)] text-xs"
                    />
                    <input
                      type="number"
                      placeholder="Prix/unit."
                      value={a.prix_unitaire ?? ""}
                      onChange={e => updateArticle(i, "prix_unitaire", e.target.value)}
                      className="px-2 py-1.5 rounded border border-[var(--border)] bg-[var(--surface2)] text-[var(--text)] text-xs"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={handleManualCreate}
            disabled={saving}
            className="w-full py-3 rounded-xl bg-[var(--accent)] text-white font-semibold text-sm hover:opacity-90 transition disabled:opacity-40"
          >
            {saving ? "💾 Enregistrement..." : "✅ Créer l'attachement"}
          </button>
        </div>
      )}
    </div>
  );
}
