-- Questions asked per ENT user and Paris calendar day, for ASK_DAILY_LIMITS
CREATE TABLE ask_quota (
  user_id TEXT NOT NULL,
  -- YYYY-MM-DD in Europe/Paris
  day TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (user_id, day)
) STRICT, WITHOUT ROWID;
