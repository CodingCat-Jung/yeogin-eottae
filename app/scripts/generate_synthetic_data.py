import google.generativeai as genai
import json
import os
import random
import time
from dotenv import load_dotenv
from typing import Union, Dict, Any
import traceback

# --- 시스템 경로 추가 ---
import sys
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, project_root)
# --- 경로 추가 끝 ---

from app.db.session import SessionLocal
from app.models.survey import Survey
from app.models.recommendation import Recommendation

# --- 설정 부분 ---
load_dotenv(dotenv_path=os.path.join(project_root, '.env'))
API_KEY = os.getenv("GOOGLE_API_KEY")
DATABASE_URL = os.getenv("SQLALCHEMY_DATABASE_URL")

if not API_KEY or not DATABASE_URL:
    raise ValueError(".env 파일에 GOOGLE_API_KEY와 SQLALCHEMY_DATABASE_URL을 모두 설정해야 합니다.")

genai.configure(api_key=API_KEY)


# --- [최종 수정] 새로운 UI와 데이터 구조에 맞춘 데이터 풀 ---
COMPANIONS = ["혼자", "친구", "연인", "가족"]
STYLES = ["감성 여행", "액티비티 여행", "먹방 여행", "문화 체험"]
CLIMATES = ["warm", "fresh", "snowy"] # 따뜻한, 상쾌한, 눈 내리는
DENSITIES = ["leisurely", "moderate", "active"] # 느긋하게, 적당히, 활동적으로
DRIVINGS = ["public", "rental"] # 대중교통, 자가용
CONTINENTS = ["asia", "europe", "america", "africa", "oceania", "anywhere"]
# --- 데이터 풀 끝 ---


# --- [최종 수정] 새로운 데이터 구조에 맞춘 프롬프트 ---
PROMPT_TEMPLATE = """
당신은 최고의 여행 전문가 AI이자, 실제 서비스에서 사용할 AI 학습용 JSON 데이터를 생성하는 전문가입니다.
아래의 구체적인 <사용자 설문 조건>에 맞춰, 사용자가 100% 만족할만한 완벽한 여행 추천 결과를 JSON 형식으로 생성해야 합니다.
**매우 중요: 이전에 생성했을 법한 추천과는 다른, 새롭고 창의적인 도시와 일정을 추천해주세요. 데이터셋의 다양성을 확보하는 것이 핵심 목표입니다.**
'reason' 필드에는 <사용자 설문 조건>과 연결하여 왜 이 도시를 추천하는지 구체적으로 작성해야 합니다.

<사용자 설문 조건>
{survey_condition}

결과는 반드시 아래의 JSON 구조에 맞춰 **1개 또는 2개의 추천 도시**와 상세 일정을 담은 **JSON 배열**로만 생성해주세요.
다른 설명이나 markdown 표기 없이, 오직 유효한 JSON 배열만 출력해야 합니다.

[
  {{
    "city": "추천 도시 1",
    "country": "추천 국가 1",
    "reason": "이유",
    "schedule": {{
      "day_1": [
        {{ "time": "14:00-15:00", "activity": "활동 내용 (교통수단)" }}
      ]
    }}
  }},
  {{
    "city": "추천 도시 2",
    "country": "추천 국가 2",
    "reason": "이유",
    "schedule": {{
      "day_1": [
        {{ "time": "15:00-16:00", "activity": "활동 내용 (교통수단)" }}
      ]
    }}
  }}
]
"""

def generate_synthetic_data() -> Union[Dict[str, Any], None]:
    """무작위 설문 조건을 생성하고, Gemini API를 호출하여 1개의 합성 데이터를 생성합니다."""
    response = None
    try:
        # --- [최종 수정] 새로운 데이터 구조에 맞춰 설문 조건 생성 ---
        nights = random.randint(2, 9)
        days = nights + 1
        
        survey_preferences = {
            "style": random.sample(STYLES, k=random.randint(1, 2)),
            "budget": f"{random.choice([100, 200, 300, 500, 700]) * 10000}KRW",
            "climate": random.choice(CLIMATES),
            "density": random.choice(DENSITIES),
            "driving": random.choice(DRIVINGS),
            "duration": f"{nights}night {days}days",
            "companion": random.choice(COMPANIONS),
            "continent": random.choice(CONTINENTS),
            "depart_window": None, # 현재 UI에 없으므로 null로 고정
            "return_window": None  # 현재 UI에 없으므로 null로 고정
        }
        
        condition_str = json.dumps(survey_preferences, indent=2, ensure_ascii=False)

        print("--- 생성된 설문 조건 ---")
        print(condition_str)
        print("------------------------")

        model = genai.GenerativeModel('models/gemini-1.5-pro-latest')
        prompt = PROMPT_TEMPLATE.format(survey_condition=condition_str)
        
        generation_config = genai.types.GenerationConfig(
            response_mime_type="application/json"
        )
        response = model.generate_content(prompt, generation_config=generation_config)
        
        recommendation_data = json.loads(response.text)

        return {
            "survey": survey_preferences,
            "recommendation": recommendation_data
        }

    except Exception as e:
        print(f"\n데이터 생성 중 심각한 오류 발생: {type(e).__name__} - {e}")
        if response and hasattr(response, 'text'):
            print("--- AI 원본 응답 (오류 발생) ---")
            print(repr(response.text))
            print("---------------------------------")
        else:
            print("--- AI로부터 응답을 받지 못했습니다. ---")
        print("\n--- 상세 오류 위치 (Traceback) ---")
        traceback.print_exc()
        print("---------------------------------")
        return None

def save_to_db(data: Dict[str, Any]):
    """생성된 데이터를 DB에 저장합니다."""
    db = SessionLocal()
    try:
        new_survey = Survey(
            nickname="synthetic_user",
            preferences=data['survey']
        )
        db.add(new_survey)
        db.commit()
        db.refresh(new_survey)

        new_recommendation = Recommendation(
            survey_id=new_survey.id,
            result=data['recommendation'],
            rating=5
        )
        db.add(new_recommendation)
        db.commit()
        db.refresh(new_recommendation)
        
        print(f"성공적으로 저장되었습니다. (Survey ID: {new_survey.id}, Reco ID: {new_recommendation.id})")

    except Exception as e:
        print(f"DB 저장 중 오류 발생: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    NUM_TO_GENERATE = 5
    
    print("합성 데이터 생성을 시작합니다...")
    
    for i in range(NUM_TO_GENERATE):
        print(f"\n({i+1}/{NUM_TO_GENERATE}) 데이터 생성 중...")
        generated_data = generate_synthetic_data()
        
        if generated_data:
            print("데이터베이스에 저장 중...")
            save_to_db(generated_data)
        else:
            print("저장에 실패했습니다.")
        
        # API의 분당 요청 제한(RPM)을 초과하지 않도록 1.5초 대기
        time.sleep(1.5)

    print(f"\n총 {NUM_TO_GENERATE}개의 데이터 생성 시도가 완료되었습니다.")

