# app/api/v1/endpoints/savebox.py
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import and_
from app.db.session import get_db
from app.api.v1.endpoints.auth import require_auth
from app.schemas.toggle import ToggleBody
from app.models.bookmark import Bookmark, ItemType as BType
from app.models.wishlist import Wishlist, ItemType as WType

router = APIRouter()

# ── 보관함(북마크)
@router.post("/bookmark")
def add_bookmark(body: ToggleBody, user=Depends(require_auth), db: Session = Depends(get_db)):
    exists = db.query(Bookmark).filter(
        and_(
            Bookmark.user_id == user["id"],
            Bookmark.item_type == BType(body.item_type),
            Bookmark.item_id == body.item_id,
        )
    ).first()
    if not exists:
        db.add(Bookmark(user_id=user["id"], item_type=BType(body.item_type), item_id=body.item_id, note=body.note))
        db.commit()
    return {"ok": True}

@router.delete("/bookmark")
def remove_bookmark(body: ToggleBody, user=Depends(require_auth), db: Session = Depends(get_db)):
    q = db.query(Bookmark).filter(
        and_(Bookmark.user_id == user["id"], Bookmark.item_type == BType(body.item_type), Bookmark.item_id == body.item_id)
    )
    q.delete(synchronize_session=False)
    db.commit()
    return {"ok": True}

@router.get("/bookmark/my")
def list_bookmark(user=Depends(require_auth), db: Session = Depends(get_db)):
    rows = db.query(Bookmark).filter(Bookmark.user_id == user["id"]).order_by(Bookmark.id.desc()).all()
    return [{"item_type": r.item_type.value, "item_id": r.item_id, "note": r.note, "created_at": r.created_at} for r in rows]

# ── 위시리스트
@router.post("/wishlist")
def add_wishlist(body: ToggleBody, user=Depends(require_auth), db: Session = Depends(get_db)):
    exists = db.query(Wishlist).filter(
        and_(
            Wishlist.user_id == user["id"],
            Wishlist.item_type == WType(body.item_type),
            Wishlist.item_id == body.item_id,
        )
    ).first()
    if not exists:
        db.add(Wishlist(user_id=user["id"], item_type=WType(body.item_type), item_id=body.item_id, note=body.note))
        db.commit()
    return {"ok": True}

@router.delete("/wishlist")
def remove_wishlist(body: ToggleBody, user=Depends(require_auth), db: Session = Depends(get_db)):
    q = db.query(Wishlist).filter(
        and_(Wishlist.user_id == user["id"], Wishlist.item_type == WType(body.item_type), Wishlist.item_id == body.item_id)
    )
    q.delete(synchronize_session=False)
    db.commit()
    return {"ok": True}

@router.get("/wishlist/my")
def list_wishlist(user=Depends(require_auth), db: Session = Depends(get_db)):
    rows = db.query(Wishlist).filter(Wishlist.user_id == user["id"]).order_by(Wishlist.id.desc()).all()
    return [{"item_type": r.item_type.value, "item_id": r.item_id, "note": r.note, "created_at": r.created_at} for r in rows]
