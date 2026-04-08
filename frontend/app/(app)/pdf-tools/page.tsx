"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

const API = "http://10.23.23.144:8000";

const TOOLS = [
  { key:"compress",     icon:"🗜️", label:"Compresser",       desc:"Réduire la taille du PDF",       color:"#2563eb" },
  { key:"merge",        icon:"🔗", label:"Fusionner",         desc:"Combiner plusieurs PDFs en un",  color:"#10b981" },
  { key:"split",        icon:"✂️", label:"Diviser",           desc:"Extraire des pages spécifiques", color:"#8b5cf6" },
  { key:"remove-pages", icon:"🗑️", label:"Supprimer pages",  desc:"Retirer des pages d'un PDF",     color:"#ef4444" },
];
type Tool = "compress" | "merge" | "split" | "remove-pages" | null;

interface PageThumb { page: number; image: string; }
interface PdfFile {
  file:    File;
  name:    string;
  sizeKb:  number;
  pages:   number;
  thumbs:  PageThumb[];   // all page thumbnails
  firstThumb: string | null;
  loadingPreview: boolean;
}

// =============================================================================
export default function PdfToolsPage() {
  const router = useRouter();
  const [user,  setUser]  = useState<any>(null);
  const [token, setToken] = useState("");
  const [tool,  setTool]  = useState<Tool>(null);
  const [files, setFiles] = useState<PdfFile[]>([]);
  const [processing,  setProcessing]  = useState(false);
  const [result,      setResult]      = useState<{url:string;name:string;stats?:string}|null>(null);
  const [error,       setError]       = useState("");

  // PDF viewer state
  const [viewerFile,  setViewerFile]  = useState<PdfFile | null>(null);
  const [viewerIdx,   setViewerIdx]   = useState(0);   // which file in merge list

  // Tool options
  const [compQuality, setCompQuality] = useState("medium");
  const [splitMode,   setSplitMode]   = useState("all");
  const [splitPages,  setSplitPages]  = useState("");
  const [splitStart,  setSplitStart]  = useState(1);
  const [splitEnd,    setSplitEnd]    = useState(0);

  // Graphical page selection for remove-pages
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem("user");
    const tok    = localStorage.getItem("token");
    if (!stored || !tok) { router.push("/"); return; }
    setUser(JSON.parse(stored)); setToken(tok);
  }, [router]);

  function selectTool(t: Tool) {
    setTool(t); setFiles([]); setResult(null); setError("");
    setSelectedPages(new Set()); setViewerFile(null);
  }

  // ── Load all thumbnails for a file ──
  async function loadAllThumbs(pdfFile: PdfFile, index: number, tok: string) {
    try {
      const fd = new FormData();
      fd.append("file", pdfFile.file);
      const res = await fetch(`${API}/pdf-tools/preview-pages`, {
        method:"POST", headers:{ Authorization:`Bearer ${tok}` }, body: fd,
      });
      if (res.ok) {
        const d = await res.json();
        const thumbs: PageThumb[] = d.thumbnails || [];
        const first = thumbs[0]?.image || null;
        setFiles(prev => prev.map((f,i) => i===index
          ? { ...f, pages:d.pages||f.pages, thumbs, firstThumb:first, loadingPreview:false }
          : f
        ));
        // If this is the active file for viewer, refresh it
        setViewerFile(prev => prev && prev.name === pdfFile.name
          ? { ...prev, pages:d.pages||prev.pages, thumbs, firstThumb:first, loadingPreview:false }
          : prev
        );
      } else {
        setFiles(prev => prev.map((f,i) => i===index ? {...f, loadingPreview:false} : f));
      }
    } catch {
      setFiles(prev => prev.map((f,i) => i===index ? {...f, loadingPreview:false} : f));
    }
  }

  // ── Add files ──
  function addFiles(newFiles: FileList | File[]) {
    const arr = Array.from(newFiles).filter(f => f.type === "application/pdf");
    if (!arr.length) { setError("Seulement les fichiers PDF sont acceptés"); return; }

    const max   = tool === "merge" ? 20 : 1;
    const toAdd = arr.slice(0, max - files.length);

    const pdfFiles: PdfFile[] = toAdd.map(f => ({
      file:f, name:f.name, sizeKb:Math.round(f.size/1024),
      pages:0, thumbs:[], firstThumb:null, loadingPreview:true,
    }));

    setFiles(prev => {
      const startIdx = tool === "merge" ? prev.length : 0;
      const updated  = tool === "merge" ? [...prev, ...pdfFiles] : pdfFiles;
      pdfFiles.forEach((pf, i) => {
        loadAllThumbs(pf, startIdx + i, token);
      });
      // Auto-open viewer for single file tools
      if (tool !== "merge") {
        setViewerFile({ ...pdfFiles[0] });
        setSelectedPages(new Set());
      }
      return updated;
    });
    setResult(null); setError("");
  }

  function onDrop(e: React.DragEvent) { e.preventDefault(); addFiles(e.dataTransfer.files); }
  function onDragOver(e: React.DragEvent) { e.preventDefault(); }

  function removeFile(i: number) {
    setFiles(prev => prev.filter((_,idx)=>idx!==i));
    setResult(null); setViewerFile(null); setSelectedPages(new Set());
  }

  function moveUp(i: number) {
    if (i===0) return;
    setFiles(prev => { const a=[...prev]; [a[i-1],a[i]]=[a[i],a[i-1]]; return a; });
  }
  function moveDown(i: number) {
    setFiles(prev => { if(i>=prev.length-1) return prev; const a=[...prev]; [a[i],a[i+1]]=[a[i+1],a[i]]; return a; });
  }

  // ── Toggle page selection (remove-pages) ──
  function togglePage(pageNum: number) {
    setSelectedPages(prev => {
      const n = new Set(prev);
      n.has(pageNum) ? n.delete(pageNum) : n.add(pageNum);
      return n;
    });
  }

  function selectAll()   { if(!viewerFile) return; setSelectedPages(new Set(Array.from({length:viewerFile.pages},(_,i)=>i+1))); }
  function deselectAll() { setSelectedPages(new Set()); }

  // ── Process ──
  async function handleProcess() {
    if (!files.length) { setError("Ajoutez au moins un fichier PDF"); return; }
    if (tool === "remove-pages" && selectedPages.size === 0) {
      setError("Sélectionnez au moins une page à supprimer"); return;
    }
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
          fd.append("file",  files[0].file);
          fd.append("mode",  splitMode);
          fd.append("pages", splitPages);
          fd.append("start", String(splitStart));
          fd.append("end",   String(splitEnd));
          endpoint = "split";
          outName  = splitMode === "range"
            ? `divisé_${files[0].name}`
            : `divisé_${files[0].name.replace(".pdf","")}.zip`;
          outType  = splitMode === "range" ? "application/pdf" : "application/zip";
          break;
        case "remove-pages":
          fd.append("file",  files[0].file);
          fd.append("pages", Array.from(selectedPages).sort((a,b)=>a-b).join(","));
          endpoint = "remove-pages";
          outName  = `édité_${files[0].name}`;
          break;
      }

      const res = await fetch(`${API}/pdf-tools/${endpoint}`, {
        method:"POST", headers:{ Authorization:`Bearer ${token}` }, body: fd,
      });

      if (!res.ok) {
        const d = await res.json().catch(()=>({detail:"Erreur inconnue"}));
        setError(d.detail||"Erreur serveur"); return;
      }

      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);

      let stats = "";
      if (tool==="compress") {
        const o = res.headers.get("X-Original-Size");
        const c = res.headers.get("X-Compressed-Size");
        const r = res.headers.get("X-Reduction");
        if (o&&c&&r) stats = `${Math.round(Number(o)/1024)} KB → ${Math.round(Number(c)/1024)} KB · Réduction ${r}%`;
      } else if (tool==="merge") {
        const p = res.headers.get("X-Total-Pages");
        const n = res.headers.get("X-File-Count");
        if (p&&n) stats = `${n} fichiers fusionnés · ${p} pages`;
      } else if (tool==="remove-pages") {
        const rem = res.headers.get("X-Removed-Pages");
        const kp  = res.headers.get("X-Remaining-Pages");
        if (rem&&kp) stats = `${rem} page(s) supprimée(s) · ${kp} page(s) restante(s)`;
      }

      setResult({ url, name:outName, stats });
    } catch (e:any) {
      setError(e.message||"Erreur lors du traitement");
    } finally { setProcessing(false); }
  }

  function downloadResult() {
    if (!result) return;
    const a = document.createElement("a");
    a.href=result.url; a.download=result.name; a.click();
  }

  if (!user) return null;

  const activeTool = TOOLS.find(t => t.key === tool);

  // ── Viewer file (keeps in sync with files[0] for single-file tools) ──
  const displayFile = viewerFile || (files[0] ? files[0] : null);

  return (
    <div style={{ minHeight:"100vh", background:"var(--bg)", padding:"24px 28px" }}>

      {/* Header */}
      <div style={{ marginBottom:24 }}>
        <h1 style={{ fontFamily:"var(--font-head)", fontSize:24, fontWeight:800, marginBottom:5 }}>
          📄 Outils PDF
        </h1>
        <p style={{ color:"var(--muted)", fontSize:13 }}>
          Compression · Fusion · Division · Suppression de pages · Zéro stockage
        </p>
      </div>

      {/* Tool selector */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:24 }}>
        {TOOLS.map(t=>(
          <button key={t.key} onClick={()=>selectTool(t.key as Tool)} style={{
            background: tool===t.key ? `${t.color}15` : "var(--surface)",
            border:`1.5px solid ${tool===t.key ? t.color+"66" : "var(--border2)"}`,
            borderRadius:14, padding:"16px 12px", cursor:"pointer",
            display:"flex", flexDirection:"column", alignItems:"center", gap:8,
            transition:"all 0.2s", fontFamily:"var(--font-body)",
            boxShadow: tool===t.key ? `0 0 0 3px ${t.color}18` : "none",
          }}
          onMouseEnter={e=>{ if(tool!==t.key){ (e.currentTarget as HTMLElement).style.transform="translateY(-2px)"; (e.currentTarget as HTMLElement).style.background=`${t.color}08`; }}}
          onMouseLeave={e=>{ if(tool!==t.key){ (e.currentTarget as HTMLElement).style.transform="translateY(0)"; (e.currentTarget as HTMLElement).style.background="var(--surface)"; }}}>
            <div style={{
              width:48, height:48, borderRadius:12,
              background:`${t.color}18`, border:`1px solid ${t.color}33`,
              display:"flex", alignItems:"center", justifyContent:"center", fontSize:22,
            }}>{t.icon}</div>
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:13, fontWeight:700, color:tool===t.key?t.color:"var(--text)", fontFamily:"var(--font-head)" }}>{t.label}</div>
              <div style={{ fontSize:10, color:"var(--muted)", marginTop:2 }}>{t.desc}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Workspace */}
      {tool && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 320px", gap:20, alignItems:"start" }}>

          {/* ════ LEFT ════ */}
          <div>

            {/* Drop zone */}
            <div onDrop={onDrop} onDragOver={onDragOver}
              onClick={()=>inputRef.current?.click()}
              style={{
                border:`2px dashed ${activeTool!.color}55`,
                borderRadius:14, padding:"24px 20px", textAlign:"center",
                cursor:"pointer", background:`${activeTool!.color}06`,
                transition:"all 0.2s", marginBottom:14,
              }}
              onMouseEnter={e=>{ (e.currentTarget as HTMLElement).style.background=`${activeTool!.color}10`; (e.currentTarget as HTMLElement).style.borderColor=`${activeTool!.color}88`; }}
              onMouseLeave={e=>{ (e.currentTarget as HTMLElement).style.background=`${activeTool!.color}06`; (e.currentTarget as HTMLElement).style.borderColor=`${activeTool!.color}55`; }}>
              <div style={{ fontSize:32, marginBottom:8 }}>📁</div>
              <div style={{ fontSize:13, fontWeight:600, color:"var(--text)", marginBottom:4 }}>
                Glissez vos PDFs ici ou cliquez
              </div>
              <div style={{ fontSize:11, color:"var(--muted)" }}>
                {tool==="merge" ? "Plusieurs fichiers · ordre personnalisable" : "Un seul fichier PDF"}
              </div>
              <input ref={inputRef} type="file" accept=".pdf" multiple={tool==="merge"}
                style={{ display:"none" }}
                onChange={e=>{ if(e.target.files) addFiles(e.target.files); e.target.value=""; }}/>
            </div>

            {/* Files list (merge) */}
            {tool === "merge" && files.length > 0 && (
              <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:14 }}>
                {files.map((f,i)=>(
                  <div key={i} style={{
                    background:"var(--surface)", border:"1px solid var(--border)",
                    borderRadius:11, padding:"10px 14px",
                    display:"flex", alignItems:"center", gap:12,
                  }}>
                    {/* First page thumb */}
                    <div style={{
                      width:40, height:52, flexShrink:0,
                      background:"var(--surface2)", border:"1px solid var(--border2)",
                      borderRadius:5, overflow:"hidden",
                      display:"flex", alignItems:"center", justifyContent:"center",
                    }}>
                      {f.loadingPreview ? (
                        <div className="skeleton" style={{ width:"100%", height:"100%" }}/>
                      ) : f.firstThumb ? (
                        <img src={f.firstThumb} style={{ width:"100%", height:"100%", objectFit:"cover" }}/>
                      ) : <span style={{ fontSize:18, opacity:.3 }}>📄</span>}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:12, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f.name}</div>
                      <div style={{ fontSize:10, color:"var(--muted)", marginTop:2 }}>{f.sizeKb} KB {f.pages>0 && `· ${f.pages} page(s)`}</div>
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                      <button onClick={()=>moveUp(i)} disabled={i===0} style={miniBtn(i===0)}>▲</button>
                      <button onClick={()=>moveDown(i)} disabled={i===files.length-1} style={miniBtn(i===files.length-1)}>▼</button>
                    </div>
                    <button onClick={()=>removeFile(i)} style={rmBtn}>✕</button>
                  </div>
                ))}
              </div>
            )}

            {/* ── PDF VIEWER — toutes les pages ── */}
            {tool !== "merge" && displayFile && (
              <div style={{
                background:"var(--surface)", border:"1px solid var(--border)",
                borderRadius:14, overflow:"hidden", marginBottom:14,
              }}>
                {/* Viewer header */}
                <div style={{
                  padding:"12px 16px", borderBottom:"1px solid var(--border)",
                  display:"flex", alignItems:"center", justifyContent:"space-between",
                  background:`${activeTool!.color}08`,
                }}>
                  <div>
                    <div style={{ fontSize:12, fontWeight:700, color:activeTool!.color }}>
                      👁️ {displayFile.name}
                    </div>
                    <div style={{ fontSize:10, color:"var(--muted)", marginTop:2 }}>
                      {displayFile.pages} page(s) · {displayFile.sizeKb} KB
                      {tool==="remove-pages" && selectedPages.size > 0 && (
                        <span style={{ marginLeft:8, color:"#ef4444", fontWeight:700 }}>
                          · {selectedPages.size} sélectionnée(s) à supprimer
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:6 }}>
                    {tool==="remove-pages" && displayFile.pages > 0 && (
                      <>
                        <button onClick={selectAll} style={{
                          background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.25)",
                          borderRadius:7, padding:"4px 10px", fontSize:11, color:"#f87171",
                          cursor:"pointer", fontWeight:600,
                        }}>Tout sélectionner</button>
                        {selectedPages.size > 0 && (
                          <button onClick={deselectAll} style={{
                            background:"var(--surface2)", border:"1px solid var(--border2)",
                            borderRadius:7, padding:"4px 10px", fontSize:11, color:"var(--muted)",
                            cursor:"pointer",
                          }}>Désélectionner</button>
                        )}
                      </>
                    )}
                    <button onClick={()=>{ setFiles([]); setViewerFile(null); setSelectedPages(new Set()); setResult(null); }}
                      style={{ background:"none", border:"none", color:"var(--muted)", cursor:"pointer", fontSize:16 }}>✕</button>
                  </div>
                </div>

                {/* Pages grid */}
                <div style={{
                  padding:16, maxHeight:500, overflowY:"auto",
                  display:"grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
                  gap:10,
                }}>
                  {displayFile.loadingPreview ? (
                    Array.from({length:6}).map((_,i)=>(
                      <div key={i} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
                        <div className="skeleton" style={{ width:90, height:120, borderRadius:6 }}/>
                        <div className="skeleton" style={{ width:40, height:12, borderRadius:4 }}/>
                      </div>
                    ))
                  ) : displayFile.thumbs.length > 0 ? (
                    displayFile.thumbs.map(thumb=>{
                      const isSelected = selectedPages.has(thumb.page);
                      const canSelect  = tool === "remove-pages";
                      return (
                        <div key={thumb.page}
                          onClick={()=>{ if(canSelect) togglePage(thumb.page); }}
                          style={{
                            display:"flex", flexDirection:"column", alignItems:"center", gap:5,
                            cursor: canSelect ? "pointer" : "default",
                            transition:"transform .15s",
                          }}
                          onMouseEnter={e=>{ if(canSelect)(e.currentTarget as HTMLElement).style.transform="scale(1.03)"; }}
                          onMouseLeave={e=>{ (e.currentTarget as HTMLElement).style.transform="scale(1)"; }}>
                          <div style={{
                            position:"relative", width:90,
                            border:`2px solid ${isSelected ? "#ef4444" : "var(--border2)"}`,
                            borderRadius:7, overflow:"hidden",
                            boxShadow: isSelected ? "0 0 0 3px rgba(239,68,68,0.2)" : "var(--shadow-sm)",
                            transition:"all .15s",
                          }}>
                            <img src={thumb.image} style={{ width:"100%", display:"block" }}/>
                            {/* Selected overlay */}
                            {isSelected && (
                              <div style={{
                                position:"absolute", inset:0,
                                background:"rgba(239,68,68,0.35)",
                                display:"flex", alignItems:"center", justifyContent:"center",
                              }}>
                                <div style={{
                                  width:28, height:28, borderRadius:"50%",
                                  background:"#ef4444", color:"#fff",
                                  display:"flex", alignItems:"center", justifyContent:"center",
                                  fontSize:16, fontWeight:800,
                                }}>✕</div>
                              </div>
                            )}
                          </div>
                          <div style={{
                            fontSize:10, fontWeight:600,
                            color: isSelected ? "#ef4444" : "var(--muted)",
                          }}>
                            Page {thumb.page}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ gridColumn:"1/-1", textAlign:"center", padding:"30px 0", color:"var(--muted)", fontSize:12 }}>
                      Aperçu indisponible
                    </div>
                  )}
                </div>

                {/* Remove pages hint */}
                {tool === "remove-pages" && displayFile.thumbs.length > 0 && (
                  <div style={{
                    padding:"10px 16px", borderTop:"1px solid var(--border)",
                    fontSize:11, color:"var(--muted)", background:"var(--surface2)",
                    display:"flex", alignItems:"center", gap:8,
                  }}>
                    <span style={{ fontSize:14 }}>💡</span>
                    Cliquez sur une page pour la sélectionner (rouge = sera supprimée)
                  </div>
                )}
              </div>
            )}

            {/* Error */}
            {error && (
              <div style={{
                background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.25)",
                borderRadius:10, padding:"10px 14px", fontSize:13, color:"var(--danger)",
                marginBottom:12, display:"flex", alignItems:"center", gap:8,
              }}>❌ {error}</div>
            )}

            {/* Process button */}
            {files.length > 0 && (
              <button onClick={handleProcess} disabled={processing} style={{
                width:"100%",
                background: processing ? "rgba(37,99,235,0.4)" : `linear-gradient(135deg,${activeTool!.color},${activeTool!.color}cc)`,
                border:"none", borderRadius:12, padding:"14px", color:"#fff",
                fontSize:15, fontWeight:700, cursor:processing?"not-allowed":"pointer",
                boxShadow: processing ? "none" : `0 4px 18px ${activeTool!.color}44`,
                transition:"all .2s", fontFamily:"var(--font-body)",
                display:"flex", alignItems:"center", justifyContent:"center", gap:9,
              }}
              onMouseEnter={e=>{ if(!processing)(e.currentTarget as HTMLElement).style.transform="translateY(-1px)"; }}
              onMouseLeave={e=>{ (e.currentTarget as HTMLElement).style.transform="translateY(0)"; }}>
                {processing
                  ? <><span className="anim-spin" style={{ display:"inline-block" }}>⏳</span> Traitement...</>
                  : <>{activeTool!.icon} {activeTool!.label}</>}
              </button>
            )}
          </div>

          {/* ════ RIGHT: Options + Result ════ */}
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>

            {/* Options */}
            <div style={{
              background:"var(--surface)", border:"1px solid var(--border)",
              borderRadius:14, padding:18, borderTop:`2px solid ${activeTool!.color}`,
            }}>
              <div style={{ fontFamily:"var(--font-head)", fontSize:13, fontWeight:700, marginBottom:16 }}>
                {activeTool!.icon} Options — {activeTool!.label}
              </div>

              {/* COMPRESS */}
              {tool==="compress" && (
                <>
                  <label style={lblSt}>Niveau de compression</label>
                  {[
                    {val:"low",    label:"Maximum",   desc:"Taille minimale"},
                    {val:"medium", label:"Équilibré", desc:"Bon compromis"},
                    {val:"high",   label:"Léger",     desc:"Qualité préservée"},
                  ].map(opt=>(
                    <div key={opt.val} onClick={()=>setCompQuality(opt.val)} style={{
                      display:"flex", alignItems:"center", gap:10,
                      padding:"9px 12px", borderRadius:9, cursor:"pointer", marginBottom:7,
                      background:compQuality===opt.val?`${activeTool!.color}12`:"var(--surface2)",
                      border:`1px solid ${compQuality===opt.val?activeTool!.color+"55":"var(--border2)"}`,
                      transition:"all .15s",
                    }}>
                      <RadioDot selected={compQuality===opt.val} color={activeTool!.color}/>
                      <div>
                        <div style={{ fontSize:12, fontWeight:600, color:"var(--text)" }}>{opt.label}</div>
                        <div style={{ fontSize:10, color:"var(--muted)" }}>{opt.desc}</div>
                      </div>
                    </div>
                  ))}
                </>
              )}

              {/* MERGE */}
              {tool==="merge" && (
                <div style={{ fontSize:12, color:"var(--muted)", lineHeight:1.7 }}>
                  📋 Ajoutez les PDFs dans l'ordre souhaité.<br/>
                  Utilisez ▲▼ pour réorganiser.<br/>
                  <span style={{ fontSize:11, color:"var(--muted2)", marginTop:6, display:"block" }}>
                    Maximum 20 fichiers.
                  </span>
                </div>
              )}

              {/* SPLIT */}
              {tool==="split" && (
                <>
                  <label style={lblSt}>Mode de division</label>
                  {[
                    {val:"all",   label:"Chaque page",   desc:"1 fichier/page → ZIP"},
                    {val:"pages", label:"Pages précises", desc:"Ex: 1,3,5-7 → ZIP"},
                    {val:"range", label:"Plage de pages", desc:"De X à Y → PDF"},
                  ].map(opt=>(
                    <div key={opt.val} onClick={()=>setSplitMode(opt.val)} style={{
                      display:"flex", alignItems:"center", gap:10,
                      padding:"9px 12px", borderRadius:9, cursor:"pointer", marginBottom:7,
                      background:splitMode===opt.val?`${activeTool!.color}12`:"var(--surface2)",
                      border:`1px solid ${splitMode===opt.val?activeTool!.color+"55":"var(--border2)"}`,
                    }}>
                      <RadioDot selected={splitMode===opt.val} color={activeTool!.color}/>
                      <div>
                        <div style={{ fontSize:12, fontWeight:600, color:"var(--text)" }}>{opt.label}</div>
                        <div style={{ fontSize:10, color:"var(--muted)" }}>{opt.desc}</div>
                      </div>
                    </div>
                  ))}
                  {splitMode==="pages" && (
                    <div style={{ marginTop:10 }}>
                      <label style={lblSt}>Pages (ex: 1,3,5-7)</label>
                      <input value={splitPages} onChange={e=>setSplitPages(e.target.value)}
                        placeholder="1,3,5-7" style={inpSt}/>
                    </div>
                  )}
                  {splitMode==="range" && (
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginTop:10 }}>
                      <div>
                        <label style={lblSt}>Début</label>
                        <input type="number" min={1} value={splitStart}
                          onChange={e=>setSplitStart(Number(e.target.value))} style={inpSt}/>
                      </div>
                      <div>
                        <label style={lblSt}>Fin (0=fin)</label>
                        <input type="number" min={0} value={splitEnd}
                          onChange={e=>setSplitEnd(Number(e.target.value))} style={inpSt}/>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* REMOVE PAGES */}
              {tool==="remove-pages" && (
                <div>
                  <div style={{
                    background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.2)",
                    borderRadius:10, padding:"12px 14px", fontSize:12, color:"#f87171",
                    lineHeight:1.6, marginBottom:12,
                  }}>
                    <div style={{ fontWeight:700, marginBottom:4 }}>Comment ça marche :</div>
                    1. Ajoutez un PDF<br/>
                    2. Cliquez sur les pages à supprimer (elles deviennent rouges)<br/>
                    3. Cliquez sur "Supprimer pages"
                  </div>
                  {selectedPages.size > 0 && (
                    <div style={{
                      background:"rgba(239,68,68,0.12)", border:"1px solid rgba(239,68,68,0.3)",
                      borderRadius:9, padding:"9px 12px", fontSize:12,
                    }}>
                      <div style={{ color:"#f87171", fontWeight:700, marginBottom:4 }}>
                        Pages sélectionnées ({selectedPages.size}) :
                      </div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                        {Array.from(selectedPages).sort((a,b)=>a-b).map(p=>(
                          <span key={p} style={{
                            background:"rgba(239,68,68,0.15)", color:"#f87171",
                            border:"1px solid rgba(239,68,68,0.3)",
                            borderRadius:99, padding:"2px 8px", fontSize:11, fontWeight:600,
                            display:"flex", alignItems:"center", gap:4, cursor:"pointer",
                          }} onClick={()=>togglePage(p)}>
                            p.{p} <span style={{ fontSize:9 }}>✕</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Result */}
            {result && (
              <div style={{
                background:"var(--surface)", border:"1px solid rgba(16,185,129,0.4)",
                borderRadius:14, padding:18,
                boxShadow:"0 0 0 3px rgba(16,185,129,0.08)",
                animation:"fadeUp .35s cubic-bezier(0.16,1,0.3,1) both",
              }}>
                <div style={{ fontFamily:"var(--font-head)", fontSize:13, fontWeight:700, marginBottom:10, color:"var(--green)" }}>
                  ✅ Traitement terminé !
                </div>
                {result.stats && (
                  <div style={{
                    background:"var(--green-bg)", border:"1px solid rgba(16,185,129,0.2)",
                    borderRadius:8, padding:"8px 12px", fontSize:12, color:"var(--green)", marginBottom:12,
                  }}>{result.stats}</div>
                )}
                <button onClick={downloadResult} style={{
                  width:"100%", background:"linear-gradient(135deg,#10b981,#059669)",
                  border:"none", borderRadius:10, padding:"11px", color:"#fff",
                  fontSize:13, fontWeight:700, cursor:"pointer",
                  boxShadow:"0 4px 14px rgba(16,185,129,0.3)", fontFamily:"var(--font-body)",
                  display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                }}>
                  ⬇️ Télécharger
                </button>
                <button onClick={()=>{ setResult(null); setFiles([]); setViewerFile(null); setSelectedPages(new Set()); }} style={{
                  width:"100%", background:"none", border:"1px solid var(--border2)",
                  borderRadius:10, padding:"8px", color:"var(--muted)",
                  fontSize:12, cursor:"pointer", marginTop:8, fontFamily:"var(--font-body)",
                }}>🔄 Nouveau traitement</button>
              </div>
            )}

            {/* Info */}
            <div style={{
              background:"var(--surface2)", border:"1px solid var(--border)",
              borderRadius:12, padding:14,
            }}>
              <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:".7px", color:"var(--muted)", marginBottom:8 }}>
                ℹ️ À savoir
              </div>
              <div style={{ fontSize:11, color:"var(--muted)", lineHeight:1.7 }}>
                • Aucun fichier stocké sur le serveur<br/>
                • Traitement 100% en mémoire<br/>
                • Aucun historique conservé
              </div>
            </div>
          </div>
        </div>
      )}

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

// ── Sub-components ─────────────────────────────────────────────────────────────
function RadioDot({ selected, color }: { selected: boolean; color: string }) {
  return (
    <div style={{
      width:15, height:15, borderRadius:"50%", flexShrink:0,
      border:`2px solid ${selected ? color : "var(--muted)"}`,
      background: selected ? color : "transparent",
      display:"flex", alignItems:"center", justifyContent:"center",
      transition:"all .15s",
    }}>
      {selected && <div style={{ width:5, height:5, borderRadius:"50%", background:"#fff" }}/>}
    </div>
  );
}

function miniBtn(disabled: boolean): React.CSSProperties {
  return {
    background:"var(--surface2)", border:"1px solid var(--border2)",
    borderRadius:5, width:22, height:22, cursor:disabled?"not-allowed":"pointer",
    fontSize:10, color:"var(--muted)",
    display:"flex", alignItems:"center", justifyContent:"center",
    opacity: disabled ? .3 : 1,
  };
}

const rmBtn: React.CSSProperties = {
  background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.2)",
  borderRadius:8, width:30, height:30, cursor:"pointer",
  display:"flex", alignItems:"center", justifyContent:"center",
  fontSize:13, color:"#f87171",
};

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