# app/db/base.py
from app.db.base_class import Base

# ⛔️ 클래스 이름을 직접 import하지 말고,
# ✅ 모듈 자체를 import해서 부작용으로 등록시키자.
import app.models.user            # noqa: F401
import app.models.survey          # noqa: F401
import app.models.recommendation  # noqa: F401

# 디버그 로그
print("[DB] base.py imported; registered tables:", list(Base.metadata.tables.keys()))
