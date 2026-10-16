-- Historical Phase A schema and representative records, independent of migration 2.
PRAGMA foreign_keys=ON;
CREATE TABLE tutor_preferences(singleton INTEGER PRIMARY KEY CHECK(singleton=1),native TEXT NOT NULL,target TEXT NOT NULL,persona TEXT NOT NULL,correctionMode TEXT NOT NULL);
CREATE TABLE tutor_sessions(id TEXT PRIMARY KEY NOT NULL,native TEXT NOT NULL,target TEXT NOT NULL,persona TEXT NOT NULL,correctionMode TEXT NOT NULL,createdAt INTEGER NOT NULL,endedAt INTEGER);
CREATE TABLE tutor_turns(id TEXT PRIMARY KEY NOT NULL,sessionId TEXT NOT NULL REFERENCES tutor_sessions(id) ON DELETE CASCADE,input TEXT NOT NULL CHECK(length(input) BETWEEN 1 AND 2000),response TEXT NOT NULL,corrections TEXT NOT NULL,analyzed INTEGER NOT NULL CHECK(analyzed IN (0,1)),provider TEXT NOT NULL CHECK(provider='mock-v1'),createdAt INTEGER NOT NULL);
CREATE INDEX tutor_session_history ON tutor_sessions(createdAt DESC);
CREATE INDEX tutor_turn_history ON tutor_turns(sessionId,createdAt);
INSERT INTO tutor_preferences VALUES(1,'hi','en','female','end');
INSERT INTO tutor_sessions VALUES('legacy','hi','en','female','end',100,NULL);
INSERT INTO tutor_turns VALUES('legacy-turn','legacy','नमस्ते Hello','Hello learner','[{"category":"grammar","corrected":"Hello","explanation":"नमस्ते"}]',1,'mock-v1',101);
PRAGMA user_version=1;
