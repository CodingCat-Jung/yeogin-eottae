import google.generativeai as genai
import json
import os
from dotenv import load_dotenv

# --- [수정] 시스템 경로 추가 ---
# 이 스크립트가 'app' 모듈을 찾을 수 있도록 프로젝트 루트 경로를 올바르게 설정합니다.
import sys
# 스크립트 위치가 app/scripts/ 이므로, 두 단계 위로 올라가야 프로젝트 루트(Server)가 됩니다.
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, project_root)
# --- 경로 추가 끝 ---

# --- [수정] 데이터베이스 세션 import ---
# 데이터베이스 세션을 중앙 관리 파일에서 가져옵니다.
from app.db.session import SessionLocal
from app.models.survey import Survey
from app.models.recommendation import Recommendation

# --- 설정 부분 ---
load_dotenv(dotenv_path=os.path.join(project_root, '.env')) # .env 파일 경로를 명시
API_KEY = os.getenv("GOOGLE_API_KEY")
# [수정] .env 파일의 변수 이름과 일치시킵니다.
DATABASE_URL = os.getenv("SQLALCHEMY_DATABASE_URL") 

if not API_KEY or not DATABASE_URL:
    raise ValueError(".env 파일에 GOOGLE_API_KEY와 DATABASE_URL을 모두 설정해야 합니다.")

genai.configure(api_key=API_KEY)


# --- 프롬프트 정의 (기존과 동일) ---
PROMPT_TEMPLATE = """
당신은 지금부터 Travia 서비스를 위한 고품질의 학습 데이터를 생성하는 AI입니다.
가상의 사용자 여행 설문과 그에 대한 완-벽한 여행 추천 결과를 JSON 형식으로 생성해야 합니다.
모든 결과는 사용자가 100% 만족하여 별점 5점을 줄만한 내용이어야 합니다.

아래의 설문 항목을 무작위로 조합하여 가상의 사용자 설문을 만드세요:
- Travelmate: 혼자, 친구, 연인, 가족
- What to experience: 감성적인, 액티비티, 맛집, 문화 체험, 휴양, 쇼핑
- Trip duration: 2박 3일부터 9박 10일까지 다양하게 설정
- Transportation: 대중교통, 자동차 렌트
- Budget: "100만원 이하"부터 "500만원 이상"까지 다양하게 설정
- Preffered temporature: 따뜻한, 신선한, 눈 오는 추운 날씨
- Preffered Continent: 아시아, 유럽, 북미, 남미, 아프리카, 오세아니아, 어디든지
- Activity density per day: 여유롭게, 적당히, 활발하고 바쁘게

위 설문을 바탕으로, 아래 JSON 구조에 맞춰 1개의 추천 도시와 상세 일정을 생성해주세요.
'reason' 필드에는 왜 이 도시를 추천하는지 설문 내용과 연결하여 구체적으로 작성해야 합니다.

[
  {
    "city": "추천 도시",
    "country": "추천 국가",
    "reason": "이유",
    "schedule": {
      "day_1": [
        { "time": "10:00-12:00", "activity": "활동 내용" }
      ],
      "day_2": [
        { "time": "09:00-11:00", "activity": "활동 내용" }
      ]
    }
  }
]

이제, 위 조건에 맞춰 가상의 설문과 완벽한 추천 결과 1개를 생성해주세요.
결과는 반드시 JSON 배열 형식으로만 출력해야 합니다. 다른 설명은 절대 추가하지 마세요.
"""

def generate_synthetic_data():
    """Gemini API를 호출하여 1개의 합성 데이터를 생성합니다."""
    try:
        model = genai.GenerativeModel('gemini-1.5-flash')
        response = model.generate_content(PROMPT_TEMPLATE)
        json_text = response.text.strip().replace("```json", "").replace("```", "")
        data = json.loads(json_text)
        return data
    except Exception as e:
        print(f"데이터 생성 중 오류 발생: {e}")
        return None

def save_to_db(data: list):
    """생성된 데이터를 데이터베이스에 저장합니다."""
    db = SessionLocal()
    try:
        # 1. 가상의 Survey 데이터 생성
        # [수정] username -> nickname 으로 변경
        dummy_survey = Survey(
            nickname="synthetic_user",
            preferences={"info": "This is a synthetic survey from script"}
        )
        db.add(dummy_survey)
        db.commit()
        db.refresh(dummy_survey)

        # 2. 생성된 Survey의 ID를 사용하여 Recommendation 데이터 생성
        new_recommendation = Recommendation(
            survey_id=dummy_survey.id,
            result=data,
            rating=5
        )
        db.add(new_recommendation)
        db.commit()
        db.refresh(new_recommendation)
        
        return True
    except Exception as e:
        print(f"DB 저장 중 오류 발생: {e}")
        db.rollback()
        return False
    finally:
        db.close()

if __name__ == "__main__":
    print("합성 데이터 생성을 시작합니다...")
    
    NUM_TO_GENERATE = 5
    success_count = 0
    
    for i in range(NUM_TO_GENERATE):
        print(f"({i + 1}/{NUM_TO_GENERATE}) 데이터 생성 중...")
        generated_data = generate_synthetic_data()
        
        if generated_data:
            print("데이터베이스에 저장 중...")
            if save_to_db(generated_data):
                success_count += 1
                print("성공적으로 저장되었습니다.")
            else:
                print("저장에 실패했습니다.")
    
    print(f"\n총 {success_count}개의 데이터 생성이 완료 및 DB에 저장되었습니다.")

