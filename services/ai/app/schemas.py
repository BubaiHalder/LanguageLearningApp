from typing import Literal
from pydantic import BaseModel, ConfigDict, Field

Language = Literal["en", "es", "as", "bn", "brx", "doi", "gu", "hi", "kn", "ks", "kok", "mai", "ml", "mni", "mr",
                   "ne", "or", "pa", "sa", "sat", "sd", "ta", "te", "ur"]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Message(StrictModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2000)


class TutorRequest(StrictModel):
    text: str = Field(min_length=1, max_length=2000)
    nativeLanguage: Language
    targetLanguage: Language
    proficiency: Literal["A1", "A2", "B1", "B2", "C1", "C2"] = "A1"
    correctionMode: Literal["immediate", "end"] = "immediate"
    context: list[Message] = Field(default_factory=list, max_length=12)


class Correction(StrictModel):
    category: Literal["grammar", "vocabulary", "sentence"]
    original: str = Field(min_length=1, max_length=2000)
    corrected: str = Field(min_length=1, max_length=2000)
    explanation: str = Field(min_length=1, max_length=1000)


class TutorFeedback(StrictModel):
    correctedSentence: str = Field(min_length=1, max_length=2000)
    explanation: str = Field(min_length=1, max_length=1000)
    response: str = Field(min_length=1, max_length=2000)
    corrections: list[Correction] = Field(max_length=10)


class SpeechRequest(StrictModel):
    text: str = Field(min_length=1, max_length=2000)
    language: Language
    voiceId: str = Field(min_length=1, max_length=100, pattern=r"^[A-Za-z0-9_-]+$")
