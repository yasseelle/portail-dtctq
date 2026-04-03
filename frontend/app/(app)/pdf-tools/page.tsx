"use client";

import React, { useState, useRef, useCallback } from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

const API = "http://10.23.23.144:8000";

// ── Tool config ───────────────────────────────────────────────────────────────
const TOOLS = [
  { key:"compress",     icon:"🗜️", label:"Compresser",        desc:"Réduire la taille du PDF",        color:"#2563eb" },
  { key:"merge",        icon:"🔗", label:"Fusionner",          desc:"Combiner plusieurs PDFs en un",   color:"#10b981" },
  { key:"split",        icon:"✂️", label:"Diviser",            desc:"Extraire des pages spécifiques",  color:"#8b5cf6" },
  { key:"remove-pages", icon:"🗑️", label:"Supprimer pages",   desc:"Retirer des pages d'un PDF",      color:"#ef4444" },
];

type Tool = "compress" | "merge" | "split" | "remove-pages" | null;

interface PdfFile {
  file:    File;
  name:    string;
  sizeKb:  number;
  pages:   number;
  thumb:   string | null;
  loading: boolean;
}

// =============================================================================
export default function PdfToolsPage() {
  const router  = useRouter();
  const [user,   setUser]   = useState<any>(null);
  const [token,  setToken]  = useState("");
  const [tool,   setTool]   = useState<Tool>(null);
  const [files,  setFiles]  = useState<PdfFile[]>([]);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<{ url: string; name: string; stats?: string } | null>(null);
  const [error,  setError]  = useState("");

  // Tool-specific options
  const [compQuality,  setCompQuality]  = useState("medium");
  const [splitMode,    setSplitMode]    = useState("all");
  const [splitPages,   setSplitPages]   = useState("");
  const [splitStart,   setSplitStart]   = useState(1);
  const [splitEnd,     setSplitEnd]     = useState(0);
  const [removePages,  setRemovePages]  = useState("");

  const dropRef   = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem("user");
    const tok    = localStorage.getItem("token");
    if (!stored || !tok) { router.push("/"); return; }
    setUser(JSON.parse(stored)); setToken(tok);
  }, [router]);

  // ── Select tool → reset ──
  function selectTool(t: Tool) {
    setTool(t); setFiles([]); setResult(null); setError("");
  }

  // ── Load preview for a file ──
  async function loadPreview(pdfFile: PdfFile, index: number, tok: string) {
    try {
      const fd = new FormData();
      fd.append("file", pdfFile.file);
      const res = await fetch(`${API}/pdf-tools/preview`, {
        method:"POST", headers:{ Authorization:`Bearer ${tok}` }, body: fd,
      });
      if (res.ok) {
        const d = await res.json();
        setFiles(prev => prev.map((f,i) => i === index
          ? { ...f, pages:d.pages||f.pages, thumb:d.image||null, loading:false }
          : f
        ));
      } else {
        setFiles(prev => prev.map((f,i) => i===index ? {...f, loading:false} : f));
      }
    } catch {
      setFiles(prev => prev.map((f,i) => i===index ? {...f, loading:false} : f));
    }
  }

  // ── Add files ──
  function addFiles(newFiles: FileList | File[]) {
    const arr = Array.from(newFiles).filter(f => f.type === "application/pdf");
    if (!arr.length) { setError("Seulement les fichiers PDF sont acceptés"); return; }

    // For merge: multiple OK; for others: only 1
    const max = tool === "merge" ? 20 : 1;
    const toAdd = arr.slice(0, max - files.length);

    const pdfFiles: PdfFile[] = toAdd.map(f => ({
      file:f, name:f.name, sizeKb:Math.round(f.size/1024),
      pages:0, thumb:null, loading:true,
    }));

    setFiles(prev => {
      const updated = tool === "merge" ? [...prev, ...pdfFiles] : pdfFiles;
      // Load previews
      pdfFiles.forEach((pf, i) => {
        loadPreview(pf, (tool === "merge" ? prev.length : 0) + i, token);
      });
      return updated;
    });
    setResult(null); setError("");
  }

  // ── Drag & drop ──
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    addFiles(e.dataTransfer.files);
  }

  function onDragOver(e: React.DragEvent) { e.preventDefault(); }

  // ── Remove file ──
  function removeFile(i: number) {
    setFiles(prev => prev.filter((_,idx) => idx !== i));
    setResult(null);
  }

  // ── Reorder (merge) ──
  function moveUp(i: number) {
    if (i === 0) return;
    setFiles(prev => { const a=[...prev]; [a[i-1],a[i]]=[a[i],a[i-1]]; return a; });
  }
  function moveDown(i: number) {
    setFiles(prev => { if(i>=prev.length-1)return prev; const a=[...prev]; [a[i],a[i+1]]=[a[i+1],a[i]]; return a; });
  }

  // ── Process ────────────────────────────────────────────────────────────────
  async function handleProcess() {
    if (!files.length) { setError("Ajoutez au moins un fichier PDF"); return; }
    setProcessing(true); setResult(null); setError("");

    try {
      const fd = new FormData();
      let endpoint = "";
      let outName  = "resultat.pdf";
      let outType  = "application/pdf";

      switch (tool) {
        case "compress":
          fd.append("file", files[0].file);
          fd.append("quality", compQuality);
          endpoint = "compress";
          outName  = `compressé_${files[0].name}`;
          break;

        case "merge":
          files.forEach(f => fd.append("files", f.file));
          endpoint = "merge";
          outName  = "fusionné.pdf";
          break;

        case "split":
          fd.append("file", files[0].file);
          fd.append("mode", splitMode);
          fd.append("pages", splitPages);
          fd.append("start", String(splitStart));
          fd.append("end",   String(splitEnd));
          endpoint = "split";
          outName  = `divisé_${files[0].name.replace(".pdf","")}`;
          outType  = splitMode === "range" ? "application/pdf" : "application/zip";
          if (splitMode !== "range") outName += ".zip";
          break;

        case "remove-pages":
          fd.append("file",  files[0].file);
          fd.append("pages", removePages);
          endpoint = "remove-pages";
          outName  = `édité_${files[0].name}`;
          break;
      }

      const res = await fetch(`${API}/pdf-tools/${endpoint}`, {
        method:"POST", headers:{ Authorization:`Bearer ${token}` }, body: fd,
      });

      if (!res.ok) {
        const d = await res.json().catch(()=>({detail:"Erreur inconnue"}));
        setError(d.detail || "Erreur serveur"); return;
      }

      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);

      // Extract stats from headers
      let stats = "";
      if (tool === "compress") {
        const orig = res.headers.get("X-Original-Size");
        const comp = res.headers.get("X-Compressed-Size");
        const red  = res.headers.get("X-Reduction");
        if (orig && comp && red) {
          const o = Math.round(Number(orig)/1024);
          const c = Math.round(Number(comp)/1024);
          stats = `${o} KB → ${c} KB · Réduction de ${red}%`;
        }
      } else if (tool === "merge") {
        const p = res.headers.get("X-Total-Pages");
        const n = res.headers.get("X-File-Count");
        if (p && n) stats = `${n} fichiers fusionnés · ${p} pages au total`;
      } else if (tool === "remove-pages") {
        const rem = res.headers.get("X-Removed-Pages");
        const kp  = res.headers.get("X-Remaining-Pages");
        if (rem && kp) stats = `${rem} page(s) supprimée(s) · ${kp} page(s) restante(s)`;
      }

      setResult({ url, name:outName, stats });

    } catch (e: any) {
      setError(e.message || "Erreur lors du traitement");
    } finally {
      setProcessing(false);
    }
  }

  // ── Download result ──
  function downloadResult() {
    if (!result) return;
    const a = document.createElement("a");
    a.href = result.url; a.download = result.name; a.click();
  }

  if (!user) return null;

  const activeTool = TOOLS.find(t => t.key === tool);

  return (
    <div style={{ minHeight:"100vh", background:"var(--bg)", padding:"24px 28px" }}>

      {/* ── Header ── */}
      <div style={{ marginBottom:24 }}>
        <h1 style={{ fontFamily:"var(--font-head)", fontSize:24, fontWeight:800, marginBottom:5 }}>
          📄 Outils PDF
        </h1>
        <p style={{ color:"var(--muted)", fontSize:13 }}>
          Compression · Fusion · Division · Suppression de pages · Zéro stockage
        </p>
      </div>

      {/* ── Tool selector ── */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:28 }}>
        {TOOLS.map(t => (
          <button key={t.key} onClick={() => selectTool(t.key as Tool)} style={{
            background: tool===t.key ? `${t.color}15` : "var(--surface)",
            border:`1.5px solid ${tool===t.key ? t.color+"66" : "var(--border2)"}`,
            borderRadius:14, padding:"18px 14px", cursor:"pointer",
            display:"flex", flexDirection:"column", alignItems:"center", gap:10,
            transition:"all 0.2s", fontFamily:"var(--font-body)",
            boxShadow: tool===t.key ? `0 0 0 3px ${t.color}18` : "none",
          }}
          onMouseEnter={e=>{
            if(tool!==t.key){
              (e.currentTarget as HTMLElement).style.background=`${t.color}08`;
              (e.currentTarget as HTMLElement).style.borderColor=`${t.color}44`;
              (e.currentTarget as HTMLElement).style.transform="translateY(-2px)";
            }
          }}
          onMouseLeave={e=>{
            if(tool!==t.key){
              (e.currentTarget as HTMLElement).style.background="var(--surface)";
              (e.currentTarget as HTMLElement).style.borderColor="var(--border2)";
              (e.currentTarget as HTMLElement).style.transform="translateY(0)";
            }
          }}>
            <div style={{
              width:52, height:52, borderRadius:14, flexShrink:0,
              background:`${t.color}18`, border:`1px solid ${t.color}33`,
              display:"flex", alignItems:"center", justifyContent:"center", fontSize:24,
            }}>{t.icon}</div>
            <div>
              <div style={{ fontSize:14, fontWeight:700, color: tool===t.key ? t.color : "var(--text)", fontFamily:"var(--font-head)" }}>
                {t.label}
              </div>
              <div style={{ fontSize:11, color:"var(--muted)", marginTop:3 }}>{t.desc}</div>
            </div>
          </button>
        ))}
      </div>

      {/* ── Workspace ── */}
      {tool && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 340px", gap:20, alignItems:"start" }}>

          {/* ── LEFT: Drop zone + files ── */}
          <div>
            {/* Drop zone */}
            <div
              ref={dropRef}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onClick={() => inputRef.current?.click()}
              style={{
                border:`2px dashed ${activeTool!.color}55`,
                borderRadius:14, padding:"32px 20px",
                textAlign:"center", cursor:"pointer",
                background:`${activeTool!.color}06`,
                transition:"all 0.2s", marginBottom:16,
              }}
              onMouseEnter={e=>{ (e.currentTarget as HTMLElement).style.background=`${activeTool!.color}10`; (e.currentTarget as HTMLElement).style.borderColor=`${activeTool!.color}88`; }}
              onMouseLeave={e=>{ (e.currentTarget as HTMLElement).style.background=`${activeTool!.color}06`; (e.currentTarget as HTMLElement).style.borderColor=`${activeTool!.color}55`; }}
            >
              <div style={{ fontSize:36, marginBottom:10 }}>📁</div>
              <div style={{ fontSize:14, fontWeight:600, color:"var(--text)", marginBottom:5 }}>
                Glissez vos PDFs ici ou cliquez pour sélectionner
              </div>
              <div style={{ fontSize:12, color:"var(--muted)" }}>
                {tool === "merge" ? "Plusieurs fichiers acceptés · ordre glisser-déposer" : "Un seul fichier PDF"}
              </div>
              <input
                ref={inputRef} type="file" accept=".pdf"
                multiple={tool === "merge"}
                style={{ display:"none" }}
                onChange={e => { if(e.target.files) addFiles(e.target.files); e.target.value=""; }}
              />
            </div>

            {/* Files list */}
            {files.length > 0 && (
              <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:16 }}>
                {files.map((f, i) => (
                  <div key={i} style={{
                    background:"var(--surface)", border:"1px solid var(--border)",
                    borderRadius:12, padding:"12px 14px",
                    display:"flex", alignItems:"center", gap:12,
                  }}>
                    {/* Thumbnail */}
                    <div style={{
                      width:52, height:68, flexShrink:0,
                      background:"var(--surface2)", border:"1px solid var(--border2)",
                      borderRadius:6, overflow:"hidden",
                      display:"flex", alignItems:"center", justifyContent:"center",
                    }}>
                      {f.loading ? (
                        <div className="skeleton" style={{ width:"100%", height:"100%" }}/>
                      ) : f.thumb ? (
                        <img src={f.thumb} alt="preview" style={{ width:"100%", height:"100%", objectFit:"cover" }}/>
                      ) : (
                        <span style={{ fontSize:22, opacity:.4 }}>📄</span>
                      )}
                    </div>

                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                        {f.name}
                      </div>
                      <div style={{ fontSize:11, color:"var(--muted)", marginTop:3 }}>
                        {f.sizeKb} KB
                        {f.pages > 0 && ` · ${f.pages} page${f.pages>1?"s":""}`}
                      </div>
                    </div>

                    {/* Merge reorder buttons */}
                    {tool === "merge" && (
                      <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                        <button onClick={()=>moveUp(i)} disabled={i===0} style={{
                          background:"var(--surface2)", border:"1px solid var(--border2)",
                          borderRadius:5, width:22, height:22, cursor:"pointer",
                          fontSize:10, color:"var(--muted)", display:"flex",
                          alignItems:"center", justifyContent:"center",
                          opacity: i===0 ? .3 : 1,
                        }}>▲</button>
                        <button onClick={()=>moveDown(i)} disabled={i===files.length-1} style={{
                          background:"var(--surface2)", border:"1px solid var(--border2)",
                          borderRadius:5, width:22, height:22, cursor:"pointer",
                          fontSize:10, color:"var(--muted)", display:"flex",
                          alignItems:"center", justifyContent:"center",
                          opacity: i===files.length-1 ? .3 : 1,
                        }}>▼</button>
                      </div>
                    )}

                    <button onClick={()=>removeFile(i)} style={{
                      background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.2)",
                      borderRadius:8, width:30, height:30, cursor:"pointer",
                      display:"flex", alignItems:"center", justifyContent:"center", fontSize:13,
                      color:"#f87171", transition:"all .15s",
                    }}>✕</button>
                  </div>
                ))}
              </div>
            )}

            {/* Error */}
            {error && (
              <div style={{
                background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.25)",
                borderRadius:10, padding:"10px 14px", fontSize:13, color:"var(--danger)",
                marginBottom:14, display:"flex", alignItems:"center", gap:8,
              }}>❌ {error}</div>
            )}

            {/* Process button */}
            {files.length > 0 && (
              <button onClick={handleProcess} disabled={processing} style={{
                width:"100%",
                background: processing ? "rgba(37,99,235,0.4)" : `linear-gradient(135deg,${activeTool!.color},${activeTool!.color}cc)`,
                border:"none", borderRadius:12, padding:"14px",
                color:"#fff", fontSize:15, fontWeight:700, cursor: processing ? "not-allowed" : "pointer",
                boxShadow: processing ? "none" : `0 4px 18px ${activeTool!.color}44`,
                transition:"all .2s", fontFamily:"var(--font-body)",
                display:"flex", alignItems:"center", justifyContent:"center", gap:9,
              }}
              onMouseEnter={e=>{ if(!processing)(e.currentTarget as HTMLElement).style.transform="translateY(-1px)"; }}
              onMouseLeave={e=>{ (e.currentTarget as HTMLElement).style.transform="translateY(0)"; }}>
                {processing ? (
                  <><span className="anim-spin" style={{ display:"inline-block" }}>⏳</span> Traitement en cours...</>
                ) : (
                  <>{activeTool!.icon} {activeTool!.label}</>
                )}
              </button>
            )}
          </div>

          {/* ── RIGHT: Options + Result ── */}
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>

            {/* Options card */}
            <div style={{
              background:"var(--surface)", border:"1px solid var(--border)",
              borderRadius:14, padding:18,
              borderTop:`2px solid ${activeTool!.color}`,
            }}>
              <div style={{ fontFamily:"var(--font-head)", fontSize:13, fontWeight:700, marginBottom:16 }}>
                {activeTool!.icon} Options — {activeTool!.label}
              </div>

              {/* COMPRESS options */}
              {tool === "compress" && (
                <div>
                  <label style={lblSt}>Niveau de compression</label>
                  {[
                    { val:"low",    label:"Maximum",    desc:"Taille minimale, qualité réduite" },
                    { val:"medium", label:"Équilibré",  desc:"Bon compromis taille/qualité"    },
                    { val:"high",   label:"Léger",      desc:"Qualité préservée, gain modéré"  },
                  ].map(opt=>(
                    <div key={opt.val} onClick={()=>setCompQuality(opt.val)} style={{
                      display:"flex", alignItems:"center", gap:10, padding:"10px 12px",
                      borderRadius:9, cursor:"pointer", marginBottom:7,
                      background: compQuality===opt.val ? `${activeTool!.color}12` : "var(--surface2)",
                      border:`1px solid ${compQuality===opt.val ? activeTool!.color+"55" : "var(--border2)"}`,
                      transition:"all .15s",
                    }}>
                      <div style={{
                        width:16, height:16, borderRadius:"50%", flexShrink:0,
                        border:`2px solid ${compQuality===opt.val ? activeTool!.color : "var(--muted)"}`,
                        background: compQuality===opt.val ? activeTool!.color : "transparent",
                        display:"flex", alignItems:"center", justifyContent:"center",
                      }}>
                        {compQuality===opt.val && <div style={{ width:6, height:6, borderRadius:"50%", background:"#fff" }}/>}
                      </div>
                      <div>
                        <div style={{ fontSize:12, fontWeight:600, color:"var(--text)" }}>{opt.label}</div>
                        <div style={{ fontSize:10, color:"var(--muted)" }}>{opt.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* MERGE options */}
              {tool === "merge" && (
                <div style={{ color:"var(--muted)", fontSize:12, lineHeight:1.7 }}>
                  <div style={{ marginBottom:8 }}>📋 Ajoutez les PDFs dans l'ordre souhaité.</div>
                  <div>Utilisez les boutons ▲▼ pour réorganiser l'ordre de fusion.</div>
                  <div style={{ marginTop:12, fontSize:11, color:"var(--muted2)" }}>
                    Maximum 20 fichiers · le fichier résultant sera téléchargé automatiquement.
                  </div>
                </div>
              )}

              {/* SPLIT options */}
              {tool === "split" && (
                <div>
                  <label style={lblSt}>Mode de division</label>
                  {[
                    { val:"all",   label:"Chaque page",  desc:"1 fichier par page → ZIP" },
                    { val:"pages", label:"Pages précises",desc:"Ex: 1,3,5-7 → ZIP"       },
                    { val:"range", label:"Plage de pages",desc:"De page X à page Y"       },
                  ].map(opt=>(
                    <div key={opt.val} onClick={()=>setSplitMode(opt.val)} style={{
                      display:"flex", alignItems:"center", gap:10, padding:"9px 12px",
                      borderRadius:9, cursor:"pointer", marginBottom:7,
                      background: splitMode===opt.val ? `${activeTool!.color}12` : "var(--surface2)",
                      border:`1px solid ${splitMode===opt.val ? activeTool!.color+"55" : "var(--border2)"}`,
                    }}>
                      <div style={{
                        width:14, height:14, borderRadius:"50%", flexShrink:0,
                        border:`2px solid ${splitMode===opt.val ? activeTool!.color : "var(--muted)"}`,
                        background: splitMode===opt.val ? activeTool!.color : "transparent",
                      }}/>
                      <div>
                        <div style={{ fontSize:12, fontWeight:600 }}>{opt.label}</div>
                        <div style={{ fontSize:10, color:"var(--muted)" }}>{opt.desc}</div>
                      </div>
                    </div>
                  ))}

                  {splitMode === "pages" && (
                    <div style={{ marginTop:10 }}>
                      <label style={lblSt}>Numéros de pages</label>
                      <input value={splitPages} onChange={e=>setSplitPages(e.target.value)}
                        placeholder="Ex: 1,3,5-7" style={inpSt}/>
                      <div style={{ fontSize:10, color:"var(--muted)", marginTop:5 }}>
                        Séparez par des virgules. Utilisez - pour une plage (ex: 5-8)
                      </div>
                    </div>
                  )}

                  {splitMode === "range" && (
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginTop:10 }}>
                      <div>
                        <label style={lblSt}>Page début</label>
                        <input type="number" min={1} value={splitStart}
                          onChange={e=>setSplitStart(Number(e.target.value))} style={inpSt}/>
                      </div>
                      <div>
                        <label style={lblSt}>Page fin (0 = fin)</label>
                        <input type="number" min={0} value={splitEnd}
                          onChange={e=>setSplitEnd(Number(e.target.value))} style={inpSt}/>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* REMOVE PAGES options */}
              {tool === "remove-pages" && (
                <div>
                  <label style={lblSt}>Pages à supprimer</label>
                  <input value={removePages} onChange={e=>setRemovePages(e.target.value)}
                    placeholder="Ex: 2,4,6-8" style={inpSt}/>
                  <div style={{ fontSize:10, color:"var(--muted)", marginTop:6, lineHeight:1.6 }}>
                    Exemples :<br/>
                    • <strong>2</strong> → supprime la page 2<br/>
                    • <strong>1,3,5</strong> → supprime les pages 1, 3 et 5<br/>
                    • <strong>6-10</strong> → supprime les pages 6 à 10
                  </div>
                </div>
              )}
            </div>

            {/* Result card */}
            {result && (
              <div style={{
                background:"var(--surface)", border:"1px solid rgba(16,185,129,0.4)",
                borderRadius:14, padding:18,
                boxShadow:"0 0 0 3px rgba(16,185,129,0.08)",
                animation:"fadeUp .35s cubic-bezier(0.16,1,0.3,1) both",
              }}>
                <div style={{ fontFamily:"var(--font-head)", fontSize:13, fontWeight:700, marginBottom:12, color:"var(--green)" }}>
                  ✅ Traitement terminé !
                </div>
                {result.stats && (
                  <div style={{
                    background:"var(--green-bg)", border:"1px solid rgba(16,185,129,0.2)",
                    borderRadius:8, padding:"8px 12px", fontSize:12, color:"var(--green)", marginBottom:14,
                  }}>{result.stats}</div>
                )}
                <button onClick={downloadResult} style={{
                  width:"100%", background:"linear-gradient(135deg,#10b981,#059669)",
                  border:"none", borderRadius:10, padding:"12px",
                  color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer",
                  boxShadow:"0 4px 14px rgba(16,185,129,0.3)", fontFamily:"var(--font-body)",
                  display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                }}>
                  ⬇️ Télécharger {result.name}
                </button>
                <button onClick={()=>{ setResult(null); setFiles([]); }} style={{
                  width:"100%", background:"none", border:"1px solid var(--border2)",
                  borderRadius:10, padding:"9px", color:"var(--muted)",
                  fontSize:12, cursor:"pointer", marginTop:8, fontFamily:"var(--font-body)",
                }}>
                  🔄 Nouveau traitement
                </button>
              </div>
            )}

            {/* Info card */}
            <div style={{
              background:"var(--surface2)", border:"1px solid var(--border)",
              borderRadius:12, padding:14,
            }}>
              <div style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:".7px", color:"var(--muted)", marginBottom:8 }}>
                ℹ️ À savoir
              </div>
              <div style={{ fontSize:11, color:"var(--muted)", lineHeight:1.7 }}>
                • Aucun fichier n'est stocké sur le serveur<br/>
                • Traitement 100% en mémoire<br/>
                • Aucun historique conservé<br/>
                • Fichiers supprimés après téléchargement
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {!tool && (
        <div style={{ textAlign:"center", padding:"60px 20px", color:"var(--muted)" }}>
          <div style={{ fontSize:48, marginBottom:14, opacity:.2 }}>📄</div>
          <div style={{ fontSize:15, fontWeight:600, color:"var(--text2)", marginBottom:8 }}>
            Sélectionnez un outil ci-dessus
          </div>
          <div style={{ fontSize:13 }}>Compression · Fusion · Division · Suppression de pages</div>
        </div>
      )}
    </div>
  );
}

const lblSt: React.CSSProperties = {
  display:"block", fontSize:11, fontWeight:700,
  textTransform:"uppercase", letterSpacing:".7px",
  color:"var(--muted)", marginBottom:8,
};
const inpSt: React.CSSProperties = {
  width:"100%", background:"var(--surface2)", border:"1px solid var(--border2)",
  borderRadius:9, padding:"9px 12px", color:"var(--text)", fontSize:13,
  outline:"none", fontFamily:"var(--font-body)",
};
 