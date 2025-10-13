# app/scripts/diagnose_rag.py
import os, sys, json, traceback
from dotenv import load_dotenv

import chromadb
import google.generativeai as genai

# ★ 리포지토리 루트: app/scripts 기준으로 2단계 상위
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
APP_DIR   = os.path.join(REPO_ROOT, "app")

# app 패키지 import 가능하게
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

# .env는 리포지토리 루트에 있음
load_dotenv(dotenv_path=os.path.join(REPO_ROOT, ".env"))

API_KEY = os.getenv("GOOGLE_API_KEY")
CHROMA_PATH = os.path.join(REPO_ROOT, "chroma_db")

def p(title, value=None):
    line = f"[{title}]"
    if value is not None:
        line += f" {value}"
    print(line)

def section(title):
    print("\n" + "="*80)
    print(title)
    print("="*80)

def try_run(title, fn):
    section(title)
    try:
        return fn()
    except Exception as e:
        print("❌ ERROR:", e)
        traceback.print_exc()

def main():
    # 0) ENV/경로
    section("0) ENV / PATH")
    p("REPO_ROOT", REPO_ROOT)
    p("APP_DIR", APP_DIR)
    p("CHROMA_PATH", CHROMA_PATH)
    p("GOOGLE_API_KEY set?", bool(API_KEY))

    # 1) Chroma 연결 + 컬렉션/카운트/샘플 확인
    def test_chroma():
        client = chromadb.PersistentClient(path=CHROMA_PATH)
        colls = client.list_collections()
        p("collections", [c.name for c in colls])
        coll = client.get_or_create_collection("recommendations")
        cnt = coll.count()
        p("recommendations.count()", cnt)
        if cnt > 0:
            peek = coll.peek(5)
            p("peek.ids", peek.get("ids", [])[:5])
            p("peek.docs.sample", (peek.get("documents") or [])[:2])
            p("peek.metas.sample", (peek.get("metadatas") or [])[:2])
        else:
            print("⚠️ recommendations 컬렉션이 비어있습니다. embed_database.py를 먼저 돌리세요.")

    try_run("1) Chroma 연결/내용 확인", test_chroma)

    # 2) Gemini 임베딩 API 스모크
    def test_embed_api():
        if not API_KEY:
            raise RuntimeError("GOOGLE_API_KEY not set in environment (.env)")
        genai.configure(api_key=API_KEY)
        out = genai.embed_content(
            model="models/text-embedding-004",
            content="간단한 임베딩 테스트 문장",
            task_type="RETRIEVAL_QUERY",
        )
        vec = out.get("embedding")
        p("embedding length", len(vec) if vec else None)

    try_run("2) Gemini 임베딩 API 스모크 테스트", test_embed_api)

    # 3) RAG end-to-end
    def test_end_to_end():
        from app.services.rag_service import get_rag_recommendation
        prefs = {
            "duration": "6박 7일",
            "style": ["미식", "자연"],
            "depart_window": "오전",
            "return_window": "오후",
            "density": "적당히",
            "companion": "친구",
            "driving": "대중교통",
            "budget": "200만원",
            "climate": "온화",
            "continent": "아시아",
        }
        result = get_rag_recommendation(prefs)
        p("result.keys", list(result.keys()))
        rec = result.get("recommendation")
        p("recommendation.type", type(rec).__name__)
        if isinstance(rec, list):
            p("recommendation.len", len(rec))
            if rec:
                first = rec[0] if isinstance(rec[0], dict) else {}
                p("rec[0].keys", list(first.keys()))
                p("rec[0].city", first.get("city"))
                p("rec[0].reason", (first.get("reason") or "")[:120] + "...")
                sch = first.get("schedule") or []
                p("rec[0].schedule.len", len(sch))
                if sch:
                    p("rec[0].schedule[0]", sch[0])

    try_run("3) RAG end-to-end (rag_service.get_rag_recommendation)", test_end_to_end)

if __name__ == "__main__":
    main()
