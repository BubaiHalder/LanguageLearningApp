-- Released schema version 2 (migration 1 + migration 2 final state), with language CHECKs and real-looking history.
PRAGMA foreign_keys=ON;
CREATE TABLE tutor_preferences (
  singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
  native TEXT NOT NULL CHECK(native IN ('en','hi','es')),
  target TEXT NOT NULL CHECK(target IN ('en','hi','es')),
  persona TEXT NOT NULL CHECK(persona IN ('female','male')),
  correctionMode TEXT NOT NULL CHECK(correctionMode IN ('immediate','end'))
);
CREATE TABLE tutor_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  native TEXT NOT NULL CHECK(native IN ('en','hi','es')),
  target TEXT NOT NULL CHECK(target IN ('en','hi','es')),
  persona TEXT NOT NULL CHECK(persona IN ('female','male')),
  correctionMode TEXT NOT NULL CHECK(correctionMode IN ('immediate','end')),
  createdAt INTEGER NOT NULL,
  endedAt INTEGER,
  mode TEXT NOT NULL DEFAULT 'mock' CHECK(mode IN ('mock','live'))
);
CREATE TABLE tutor_turns (
  id TEXT PRIMARY KEY NOT NULL,
  sessionId TEXT NOT NULL REFERENCES tutor_sessions(id) ON DELETE CASCADE,
  input TEXT NOT NULL CHECK(length(input) BETWEEN 1 AND 2000),
  response TEXT NOT NULL, corrections TEXT NOT NULL,
  analyzed INTEGER NOT NULL CHECK(analyzed IN (0,1)),
  provider TEXT NOT NULL CHECK(provider IN ('mock-v1','local-v1')),
  createdAt INTEGER NOT NULL, correctedSentence TEXT, explanation TEXT
);
CREATE INDEX tutor_session_history ON tutor_sessions(createdAt DESC);
CREATE INDEX tutor_turn_history ON tutor_turns(sessionId,createdAt);
INSERT INTO tutor_preferences VALUES(1,'hi','en','male','immediate');
INSERT INTO tutor_sessions VALUES('s-live','hi','en','male','immediate',200,NULL,'live');
INSERT INTO tutor_sessions VALUES('s-done','hi','en','female','end',150,180,'live');
INSERT INTO tutor_sessions VALUES('s-mock','en','es','female','immediate',100,NULL,'mock');
INSERT INTO tutor_turns VALUES('t1','s-live','मैं कल बाजार जाता हूँ।','What did you buy?','[{"category":"grammar","corrected":"went","explanation":"भूतकाल में went सही है।"}]',1,'local-v1',201,'Yesterday I went to the market.','भूतकाल का प्रयोग करें।');
INSERT INTO tutor_turns VALUES('t2','s-live','Hello how are you','I am fine, thank you!','[]',1,'local-v1',202,'Hello how are you','No reliable correction was found.');
INSERT INTO tutor_turns VALUES('t3','s-done','She do not like coffee','Why not?','[{"category":"grammar","corrected":"does","explanation":"She does."}]',1,'local-v1',160,'She does not like coffee.','Use does with she.');
INSERT INTO tutor_turns VALUES('t4','s-mock','Ayer yo ir al mercado.','¡Qué buena salida!','[]',0,'mock-v1',101,NULL,NULL);
PRAGMA user_version=2;
