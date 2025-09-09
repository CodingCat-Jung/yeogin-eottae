from app.models.survey import Survey

def create_survey(db, survey):
    db_survey = Survey(
        nickname=survey.nickname,
        preferences=survey.preferences.dict()
    )
    db.add(db_survey)
    db.commit()
    db.refresh(db_survey)
    return db_survey

