from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class PublicConfig(StrictModel):
    mode: Literal["mock", "azure"]
    buildLabel: str
    sessionMaxMinutes: int


class EvaluationRequest(StrictModel):
    scenarioId: Literal["SCN-001", "SCN-002", "SCN-003"]
    learnerTurns: list[str] = Field(min_length=0, max_length=50)
    avatarTurns: list[str] = Field(default_factory=list, max_length=50)
    interruptedCount: int = Field(default=0, ge=0, le=50)
    transcriptionFailures: int = Field(default=0, ge=0, le=50)
    estimatedAvatarSegments: int = Field(default=0, ge=0, le=50)


class CategoryScore(StrictModel):
    id: str
    label: str
    score: int = Field(ge=0, le=2)
    evidence: str


class GroundingSource(StrictModel):
    id: str = Field(min_length=1, max_length=80)
    title: str = Field(min_length=1, max_length=160)


class GroundingSummary(StrictModel):
    mode: Literal["synthetic-local"] = "synthetic-local"
    datasetId: str = Field(min_length=1, max_length=120)
    queryBasis: Literal["scenario", "learner-turns"]
    sources: list[GroundingSource] = Field(default_factory=list, max_length=3)


class CoachingMetric(StrictModel):
    id: Literal[
        "tone-compassion",
        "clarity",
        "empathy-language",
        "shared-decision-making",
        "question-responsiveness",
        "medical-jargon",
    ]
    label: str
    value: str
    score10: int | None = Field(default=None, ge=0, le=10)
    evidence: str
    basis: Literal["transcript-and-interaction"] = "transcript-and-interaction"


class EvaluationResponse(StrictModel):
    rubricVersion: Literal["1.0"] = "1.0"
    overallScore: int | None = Field(default=None, ge=0, le=10)
    confidence: Literal["high", "medium", "low"]
    categories: list[CategoryScore]
    diagnostics: list[str]
    strengths: list[str]
    coaching: list[str]
    rewriteExamples: list[str]
    limitations: list[str]
    coachingMetrics: list[CoachingMetric]
    grounding: GroundingSummary


class SanitizedResultRequest(StrictModel):
    sessionId: str = Field(min_length=8, max_length=80)
    scenarioId: Literal["SCN-001", "SCN-002", "SCN-003"]
    scenarioVersion: Literal["1.0"] = "1.0"
    difficulty: Literal["easy", "medium", "hard"]
    startedAt: str = Field(max_length=40)
    endedAt: str = Field(max_length=40)
    aggregateLatencyMs: dict[str, float] = Field(default_factory=dict)
    rubricVersion: Literal["1.0"] = "1.0"
    categoryScores: dict[str, int]
    overallScore: int | None = Field(default=None, ge=0, le=10)
    confidence: Literal["high", "medium", "low"]
    coachingTemplateIds: list[str] = Field(default_factory=list, max_length=10)


class SanitizedResultResponse(StrictModel):
    saved: bool
    resultId: str | None = None
