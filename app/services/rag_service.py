import google.generativeai as genai
import chromadb
import os
import json
from dotenv import load_dotenv

# --- RAG 로직에 필요한 설정 ---
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
load_dotenv(dotenv_path=os.path.join(project_root, '.env'))
API_KEY = os.getenv("GOOGLE_API_KEY")

# API 키가 로드되었는지 확인
if not API_KEY:
    raise ValueError("RAG Service: .env 파일에서 GOOGLE_API_KEY를 찾을 수 없습니다.")
genai.configure(api_key=API_KEY)
# --- 설정 끝 ---


def get_rag_recommendation(survey_preferences: dict) -> list:
    """
    사용자 설문조사를 기반으로 RAG를 사용하여 여행 추천을 생성합니다.
    """
    
    # 1. 벡터 데이터베이스에 연결
    print("[RAG] 벡터 DB에 연결하여 유사한 사례 검색 중...")
    client = chromadb.PersistentClient(path=os.path.join(project_root, "chroma_db"))
    collection = client.get_collection(name="recommendations")

    # 2. 새로운 사용자 설문을 임베딩하여 검색 쿼리로 사용
    query_text = f"사용자 설문: {json.dumps(survey_preferences, ensure_ascii=False)}"
    
    query_embedding = genai.embed_content(
        model="models/text-embedding-004",
        content=query_text,
        task_type="RETRIEVAL_QUERY"
    )['embedding']

    # 3. 벡터 DB에서 유사한 '성공 사례' 검색
    retrieved_results = collection.query(
        query_embeddings=[query_embedding],
        n_results=3, # 상위 3개의 유사한 사례를 가져옵니다.
        where={"rating": {"$gte": 4}} # 평점이 4점 이상인 데이터만 필터링
    )

    # 4. 검색된 사례를 AI에게 제공할 '참고 자료(Context)'로 가공
    context = (
        "당신은 최고의 여행 전문가 AI입니다.\n"
        "아래의 <참고 자료>는 현재 사용자와 비슷한 요청에 대해 과거에 매우 좋은 평가를 받았던 추천 사례들입니다.\n"
        "이 사례들을 참고하여 <새로운 사용자 요청>에 대한 최고의 여행 계획을 JSON 형식으로 추천해주세요.\n\n"
    )
              
    context += "<참고 자료>\n"
    # retrieved_results['documents']는 리스트의 리스트 형태이므로 [0]으로 접근합니다.
    if retrieved_results and retrieved_results['documents'] and retrieved_results['documents'][0]:
        for i, doc in enumerate(retrieved_results['documents'][0]):
            context += f"--- 참고 사례 {i+1} ---\n{doc}\n\n"
    else:
        context += "참고할만한 과거 사례가 없습니다.\n\n"

    # 5. 최종 프롬프트 생성
    final_prompt = f"""
    {context}
    ---
    <새로운 사용자 요청>
    {query_text}

    ---
    이제 위의 모든 정보를 종합하여, 새로운 사용자를 위한 추천 결과를 JSON 배열 형식으로만 생성해주세요.
    """

    print("[RAG] AI에게 최종 프롬프트를 전달하여 추천 생성 중...")
    
    # 6. 최종 프롬프트를 Gemini 모델에 보내서 결과 받기
    model = genai.GenerativeModel('models/gemini-1.5-pro-latest')
    generation_config = genai.types.GenerationConfig(
        response_mime_type="application/json"
    )
    response = model.generate_content(final_prompt, generation_config=generation_config)
    
    # 7. 최종 결과 반환
    recommendation = json.loads(response.text)
    
    return recommendation
