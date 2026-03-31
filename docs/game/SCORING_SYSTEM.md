# SCORING_SYSTEM.md

MAX_DISTANCE_KM = 20000
MAX_YEAR_DIFF = 200

locationAccuracy = max(0, 100 - (distance / MAX_DISTANCE_KM) * 100)
yearAccuracy = max(0, 100 - (diff / MAX_YEAR_DIFF) * 100)

comboAccuracy = (locationAccuracy + yearAccuracy) / 2

Gold = 100
Silver = 99
Bronze = 98
