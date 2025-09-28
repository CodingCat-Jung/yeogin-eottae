# import google.generativeai as genai
# import chromadb
# import os
# import pandas as pd
# from sqlalchemy import create_engine, text
# from dotenv import load_dotenv
# import json

# # --- 시스템 경로 및 설정 로드 ---
# import sys
# project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
# sys.path.insert(0, project_root)

# # .env 파일에서 MySQL 접속 정보 직접 조합
# load_dotenv(dotenv_path=os.path.join(project_root, '.env'))
# API_KEY = os.getenv("GOOGLE_API_KEY")
# DB_USER = os.getenv("DB_USER")
# DB_PASSWORD = os.getenv("DB_PASSWORD")
# DB_HOST = os.getenv("DB_HOST")
# DB_PORT = os.getenv("DB_PORT")
# DB_NAME = os.getenv("DB_NAME")

# if not all([API_KEY, DB_USER, DB_PASSWORD, DB_HOST, DB_PORT, DB_NAME]):
#     raise ValueError(".env 파일에 DB 접속 정보와 API 키를 모두 설정해야 합니다.")

# # MySQL 연결 URL 생성
# MYSQL_DATABASE_URL = f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}?charset=utf8mb4"

# genai.configure(api_key=API_KEY)


# def embed_data_from_mysql():
#     print("MySQL 데이터베이스에 연결 중...")
#     engine = create_engine(MYSQL_DATABASE_URL)
    
#     query = """
#     SELECT 
#         r.id as recommendation_id, 
#         s.preferences, 
#         r.result,
#         r.rating
#     FROM recommendation r
#     JOIN surveys s ON r.survey_id = s.id
#     WHERE r.rating IS NOT NULL AND r.vector_id IS NULL;
#     """ # [수정] 아직 임베딩되지 않은 데이터만 가져옵니다.
    
#     df = pd.read_sql(query, engine)
#     print(f"총 {len(df)}개의 새로운 추천 데이터를 불러왔습니다.")

#     if df.empty:
#         print("임베딩할 새로운 데이터가 없습니다. 스크립트를 종료합니다.")
#         return

#     client = chromadb.PersistentClient(path=os.path.join(project_root, "chroma_db"))
#     collection = client.get_or_create_collection(
#         name="recommendations",
#         metadata={"hnsw:space": "cosine"}
#     )

#     documents_to_embed, metadatas, ids = [], [], []

#     print("데이터를 임베딩 문서로 변환 중...")
#     for index, row in df.iterrows():
#         preferences_raw = row['preferences']
#         result_raw = row['result']

#         preferences = json.loads(preferences_raw) if isinstance(preferences_raw, str) else preferences_raw
#         result_list = json.loads(result_raw) if isinstance(result_raw, str) else result_raw
        
#         reason = result_list[0]['reason'] if result_list and len(result_list) > 0 else ""
        
#         pref_text = json.dumps(preferences, ensure_ascii=False)
#         document = f"사용자 설문: {pref_text}\n추천 이유: {reason}"
#         documents_to_embed.append(document)

#         metadatas.append({
#             "rating": int(row['rating']),
#             "preferences": json.dumps(preferences)
#         })

#         ids.append(str(row['recommendation_id']))

#     print(f"{len(documents_to_embed)}개의 문서를 임베딩하여 ChromaDB에 저장합니다...")
    
#     result = genai.embed_content(
#         model="models/text-embedding-004",
#         content=documents_to_embed,
#         task_type="RETRIEVAL_DOCUMENT"
#     )
    
#     collection.upsert(
#         ids=ids,
#         embeddings=result['embedding'],
#         metadatas=metadatas,
#         documents=documents_to_embed
#     )

#     print(f"성공적으로 ChromaDB에 데이터를 저장했습니다.")
    
#     # ▼▼▼ [핵심 추가] MySQL에 vector_id를 업데이트합니다. ▼▼▼
#     print("MySQL의 recommendation 테이블에 vector_id를 업데이트합니다...")
#     with engine.connect() as connection:
#         for rec_id in ids:
#             # SQL Injection을 방지하기 위해 prepared statement를 사용합니다.
#             stmt = text("UPDATE recommendation SET vector_id = :vec_id WHERE id = :rec_id")
#             connection.execute(stmt, {"vec_id": rec_id, "rec_id": int(rec_id)})
#         connection.commit() # 모든 변경사항을 한번에 커밋
    
#     print("모든 작업이 성공적으로 완료되었습니다!")


# if __name__ == "__main__":
#     embed_data_from_mysql()

import os, sys, json, logging
import pandas as pd
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

import chromadb
import google.generativeai as genai
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

# ── 로거 설정 ─────────────────────────────────────────────
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

# ── 경로 및 환경변수 로드 ─────────────────────────────────
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, project_root)
load_dotenv(dotenv_path=os.path.join(project_root, '.env'))

API_KEY = os.getenv("GOOGLE_API_KEY")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT")
DB_NAME = os.getenv("DB_NAME")

if not all([API_KEY, DB_USER, DB_PASSWORD, DB_HOST, DB_PORT, DB_NAME]):
    raise ValueError(".env에 GOOGLE_API_KEY, DB_USER, DB_PASSWORD, DB_HOST, DB_PORT, DB_NAME가 필요합니다.")

MYSQL_DATABASE_URL = f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}?charset=utf8mb4"
genai.configure(api_key=API_KEY)

MODEL_EMBED = "models/text-embedding-004"
BATCH_SIZE   = 16
PERSIST_DIR  = os.path.join(project_root, "chroma_db")

# ── 429/5xx 재시도용 ─────────────────────────────────────
class TransientGenAIError(Exception): pass

@retry(
    reraise=True,
    stop=stop_after_attempt(6),
    wait=wait_exponential(multiplier=1, min=2, max=20),
    retry=retry_if_exception_type(TransientGenAIError),
)

def embed_batch(texts: list[str]) -> list[list[float]]:
    """
    google-generativeai 0.8.x에서 배치 임베딩: embed_content() 사용
    반환: [[float...], ...] 길이=len(texts)
    """
    try:
        resp = genai.embed_content(
            model=MODEL_EMBED,
            content=texts,   # 리스트 그대로 전달 가능
            task_type="RETRIEVAL_DOCUMENT",
        )
        return resp["embedding"]  # [[float...], ...] 형태
    except Exception as e:
        msg = str(e)
        if "429" in msg or "quota" in msg.lower() or "rate" in msg.lower():
            raise TransientGenAIError(msg)
        raise


# ── 메인 로직 ────────────────────────────────────────────
def embed_data_from_mysql():
    logger.info("ENV loaded. DB=%s HOST=%s PORT=%s", DB_NAME, DB_HOST, DB_PORT)
    engine = create_engine(MYSQL_DATABASE_URL)

    # 🔹 기존 벡터도 다 지우고 다시 생성
    query = """
    SELECT 
        r.id AS recommendation_id,
        s.preferences,
        r.result,
        r.rating
    FROM recommendation r
    JOIN surveys s ON r.survey_id = s.id
    WHERE r.rating IS NOT NULL;
    """
    df = pd.read_sql(query, engine)
    logger.info("새 임베딩 대상: %d건", len(df))

    if df.empty:
        logger.warning("임베딩할 데이터가 없습니다. 스크립트를 종료합니다.")
        return

    # Chroma 초기화 (폴더 지우고 새로 만들기)
    if os.path.exists(PERSIST_DIR):
        logger.info("기존 ChromaDB 폴더(%s) 삭제 후 재생성", PERSIST_DIR)
        import shutil
        shutil.rmtree(PERSIST_DIR)
    os.makedirs(PERSIST_DIR, exist_ok=True)

    client = chromadb.PersistentClient(path=PERSIST_DIR)
    collection = client.get_or_create_collection(name="recommendations", metadata={"hnsw:space": "cosine"})

    documents, metadatas, ids = [], [], []
    logger.info("문서 변환 중...")
    for _, row in df.iterrows():
        preferences_raw = row["preferences"]
        result_raw      = row["result"]

        preferences = json.loads(preferences_raw) if isinstance(preferences_raw, str) else preferences_raw
        result_list = json.loads(result_raw) if isinstance(result_raw, str) else result_raw
        reason = (result_list[0].get("reason") if result_list and len(result_list) > 0 else "") or ""

        doc = f"사용자 설문: {json.dumps(preferences, ensure_ascii=False)}\n추천 이유: {reason}"
        documents.append(doc)
        metadatas.append({"rating": int(row["rating"]), "preferences": json.dumps(preferences, ensure_ascii=False)})
        ids.append(str(int(row["recommendation_id"])))

    # 🔹 배치 임베딩 실행
    embeddings: list[list[float]] = []
    total = len(documents)
    logger.info("임베딩 시작 (batch=%d, total=%d)...", BATCH_SIZE, total)
    for i in range(0, total, BATCH_SIZE):
        chunk = documents[i:i+BATCH_SIZE]
        emb   = embed_batch(chunk)
        embeddings.extend(emb)
        logger.info("  → %d/%d", min(i+BATCH_SIZE, total), total)

    assert len(embeddings) == len(ids) == len(metadatas) == len(documents)

    logger.info("Chroma upsert...")
    collection.upsert(ids=ids, embeddings=embeddings, metadatas=metadatas, documents=documents)

    logger.info("MySQL recommendation.vector_id 필드 초기화 후 다시 업데이트")
    with engine.begin() as conn:
        conn.execute(text("UPDATE recommendation SET vector_id = NULL"))  # 초기화
        for rec_id in ids:
            conn.execute(
                text("UPDATE recommendation SET vector_id = :vec_id WHERE id = :rec_id"),
                {"vec_id": rec_id, "rec_id": int(rec_id)},
            )

    logger.info("✅ 모든 작업 완료!")

# ── 실행 ────────────────────────────────────────────────
if __name__ == "__main__":
    embed_data_from_mysql()
