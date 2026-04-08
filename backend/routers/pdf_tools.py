"""
routers/pdf_tools.py
====================
Outils PDF en mémoire — zéro stockage, zéro historique.
Opérations : compression, fusion, division, suppression de pages, aperçu toutes pages.
"""

import io
import base64
from typing import List, Optional

from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse

import auth

router = APIRouter(prefix="/pdf-tools", tags=["PDF Tools"])


# =============================================================================
# HELPERS
# =============================================================================

def bytes_to_stream(data: bytes, filename: str) -> StreamingResponse:
    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

async def read_upload(file: UploadFile) -> bytes:
    return await file.read()


# =============================================================================
# ── APERÇU — TOUTES LES PAGES (thumbnails base64) ────────────────────────────
# =============================================================================

@router.post("/preview-pages")
async def preview_all_pages_thumbnails(
    file: UploadFile = File(...),
    current_user=Depends(auth.get_current_user),
):
    """
    Retourne les thumbnails base64 de TOUTES les pages du PDF.
    Utilise PyMuPDF (fitz) pour le rendu.
    Response: { pages: int, thumbnails: [{ page: int, image: "data:image/png;base64,..." }] }
    """
    data = await read_upload(file)

    try:
        import fitz  # PyMuPDF

        doc   = fitz.open(stream=data, filetype="pdf")
        total = len(doc)
        thumbs = []

        for i, page in enumerate(doc):
            # Render at 150dpi (good quality, reasonable size)
            mat = fitz.Matrix(1.5, 1.5)
            pix = page.get_pixmap(matrix=mat)
            img_bytes = pix.tobytes("png")
            b64 = base64.b64encode(img_bytes).decode()
            thumbs.append({
                "page":  i + 1,
                "image": f"data:image/png;base64,{b64}",
                "width": pix.width,
                "height":pix.height,
            })

        doc.close()
        return JSONResponse({
            "pages":      total,
            "filename":   file.filename,
            "thumbnails": thumbs,
        })

    except Exception as e:
        raise HTTPException(500, f"Erreur aperçu pages : {str(e)}")


@router.post("/preview-first")
async def preview_first_page(
    file: UploadFile = File(...),
    current_user=Depends(auth.get_current_user),
):
    """
    Retourne le thumbnail base64 de la première page seulement (rapide).
    """
    data = await read_upload(file)
    try:
        import fitz
        doc  = fitz.open(stream=data, filetype="pdf")
        page = doc[0]
        mat  = fitz.Matrix(1.5, 1.5)
        pix  = page.get_pixmap(matrix=mat)
        b64  = base64.b64encode(pix.tobytes("png")).decode()
        pages = len(doc)
        doc.close()
        return JSONResponse({
            "pages": pages,
            "image": f"data:image/png;base64,{b64}",
            "size_kb": round(len(data) / 1024, 1),
        })
    except Exception as e:
        raise HTTPException(500, f"Erreur aperçu : {str(e)}")


# =============================================================================
# ── COMPRESSION ───────────────────────────────────────────────────────────────
# =============================================================================

@router.post("/compress")
async def compress_pdf(
    file:    UploadFile = File(...),
    quality: str        = Form("medium"),
    current_user=Depends(auth.get_current_user),
):
    data = await read_upload(file)
    original_size = len(data)

    try:
        import pikepdf

        pdf = pikepdf.Pdf.open(io.BytesIO(data))

        if quality == "low":
            with pdf.open_metadata() as m:
                try: m.clear()
                except: pass

        buf = io.BytesIO()
        pdf.save(
            buf,
            compress_streams=True,
            object_stream_mode=pikepdf.ObjectStreamMode.generate,
            recompress_flate=(quality != "high"),
        )
        pdf.close()
        buf.seek(0)
        compressed     = buf.read()
        compressed_size = len(compressed)
        ratio = round((1 - compressed_size / original_size) * 100, 1) if original_size > 0 else 0

        return StreamingResponse(
            io.BytesIO(compressed),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename=compressed_{file.filename}",
                "X-Original-Size":    str(original_size),
                "X-Compressed-Size":  str(compressed_size),
                "X-Reduction":        str(ratio),
            }
        )
    except Exception as e:
        raise HTTPException(500, f"Erreur compression : {str(e)}")


# =============================================================================
# ── FUSION ────────────────────────────────────────────────────────────────────
# =============================================================================

@router.post("/merge")
async def merge_pdfs(
    files: List[UploadFile] = File(...),
    current_user=Depends(auth.get_current_user),
):
    if len(files) < 2:
        raise HTTPException(400, "Il faut au moins 2 fichiers pour fusionner")

    try:
        from pypdf import PdfWriter, PdfReader

        writer      = PdfWriter()
        total_pages = 0

        for f in files:
            data   = await f.read()
            reader = PdfReader(io.BytesIO(data))
            for page in reader.pages:
                writer.add_page(page)
                total_pages += 1

        buf = io.BytesIO()
        writer.write(buf)
        buf.seek(0)

        return StreamingResponse(
            buf,
            media_type="application/pdf",
            headers={
                "Content-Disposition": "attachment; filename=merged.pdf",
                "X-Total-Pages":       str(total_pages),
                "X-File-Count":        str(len(files)),
            }
        )
    except Exception as e:
        raise HTTPException(500, f"Erreur fusion : {str(e)}")


# =============================================================================
# ── DIVISION ──────────────────────────────────────────────────────────────────
# =============================================================================

@router.post("/split")
async def split_pdf(
    file:  UploadFile = File(...),
    mode:  str        = Form("all"),
    pages: str        = Form(""),
    start: int        = Form(1),
    end:   int        = Form(0),
    current_user=Depends(auth.get_current_user),
):
    import zipfile
    data = await read_upload(file)

    try:
        from pypdf import PdfReader, PdfWriter

        reader    = PdfReader(io.BytesIO(data))
        total     = len(reader.pages)
        base_name = file.filename.replace(".pdf", "")

        def parse_pages(spec: str, total: int) -> List[int]:
            result = set()
            for part in spec.split(","):
                part = part.strip()
                if "-" in part:
                    a, b = part.split("-", 1)
                    try:
                        for i in range(int(a)-1, min(int(b), total)):
                            result.add(i)
                    except: pass
                else:
                    try:
                        p = int(part) - 1
                        if 0 <= p < total: result.add(p)
                    except: pass
            return sorted(result)

        if mode == "pages" and pages:
            page_indices = parse_pages(pages, total)
            if not page_indices:
                raise HTTPException(400, "Aucune page valide spécifiée")

            zip_buf = io.BytesIO()
            with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
                for idx in page_indices:
                    writer = PdfWriter()
                    writer.add_page(reader.pages[idx])
                    buf = io.BytesIO()
                    writer.write(buf)
                    zf.writestr(f"{base_name}_page_{idx+1}.pdf", buf.getvalue())

            zip_buf.seek(0)
            return StreamingResponse(zip_buf, media_type="application/zip",
                headers={"Content-Disposition": f"attachment; filename={base_name}_split.zip"})

        elif mode == "range":
            s = max(0, start - 1)
            e = min(total, end if end > 0 else total)
            writer = PdfWriter()
            for i in range(s, e):
                writer.add_page(reader.pages[i])
            buf = io.BytesIO()
            writer.write(buf)
            buf.seek(0)
            return bytes_to_stream(buf.read(), f"{base_name}_p{start}-{e}.pdf")

        else:
            zip_buf = io.BytesIO()
            with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
                for i, page in enumerate(reader.pages):
                    writer = PdfWriter()
                    writer.add_page(page)
                    buf = io.BytesIO()
                    writer.write(buf)
                    zf.writestr(f"{base_name}_page_{i+1}.pdf", buf.getvalue())
            zip_buf.seek(0)
            return StreamingResponse(zip_buf, media_type="application/zip",
                headers={"Content-Disposition": f"attachment; filename={base_name}_all_pages.zip"})

    except HTTPException: raise
    except Exception as e:
        raise HTTPException(500, f"Erreur division : {str(e)}")


# =============================================================================
# ── SUPPRESSION DE PAGES ──────────────────────────────────────────────────────
# =============================================================================

@router.post("/remove-pages")
async def remove_pages(
    file:  UploadFile = File(...),
    pages: str        = Form(...),
    current_user=Depends(auth.get_current_user),
):
    data = await read_upload(file)

    try:
        from pypdf import PdfReader, PdfWriter

        reader    = PdfReader(io.BytesIO(data))
        total     = len(reader.pages)
        to_remove = set()

        for part in pages.split(","):
            part = part.strip()
            if "-" in part:
                a, b = part.split("-", 1)
                try:
                    for i in range(int(a)-1, min(int(b), total)):
                        to_remove.add(i)
                except: pass
            else:
                try:
                    p = int(part) - 1
                    if 0 <= p < total: to_remove.add(p)
                except: pass

        if not to_remove:
            raise HTTPException(400, "Aucune page valide spécifiée")
        if len(to_remove) >= total:
            raise HTTPException(400, "Impossible de supprimer toutes les pages")

        writer = PdfWriter()
        for i, page in enumerate(reader.pages):
            if i not in to_remove:
                writer.add_page(page)

        buf = io.BytesIO()
        writer.write(buf)
        buf.seek(0)
        base = file.filename.replace(".pdf", "")

        return StreamingResponse(
            buf,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename={base}_edited.pdf",
                "X-Removed-Pages":   str(len(to_remove)),
                "X-Remaining-Pages": str(total - len(to_remove)),
            }
        )
    except HTTPException: raise
    except Exception as e:
        raise HTTPException(500, f"Erreur suppression pages : {str(e)}")


# =============================================================================
# ── INFO PDF ──────────────────────────────────────────────────────────────────
# =============================================================================

@router.post("/info")
async def pdf_info(
    file: UploadFile = File(...),
    current_user=Depends(auth.get_current_user),
):
    data = await read_upload(file)
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(data))
        meta   = reader.metadata or {}
        return {
            "pages":     len(reader.pages),
            "title":     str(meta.get("/Title",   "—")),
            "author":    str(meta.get("/Author",  "—")),
            "creator":   str(meta.get("/Creator", "—")),
            "size_kb":   round(len(data) / 1024, 1),
            "size_mb":   round(len(data) / 1024 / 1024, 2),
            "encrypted": reader.is_encrypted,
        }
    except Exception as e:
        raise HTTPException(500, f"Erreur lecture : {str(e)}")