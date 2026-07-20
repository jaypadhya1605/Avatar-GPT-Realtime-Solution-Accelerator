from app.evaluator import evaluate
from app.models import EvaluationRequest


def test_empathy_and_understanding_check_score_high() -> None:
    result = evaluate(
        EvaluationRequest(
            scenarioId="SCN-001",
            learnerTurns=[
                "Maria, I hear that you're scared about what comes next and worried you may suffer.",
                "It makes sense that this uncertainty feels frightening.",
                "Are you most worried about pain, being alone, or something else?",
                "Please stop me if anything is unclear. What would you like me to go over again?",
            ],
            avatarTurns=["What happens next, and am I going to suffer?"],
            interruptedCount=1,
        )
    )
    assert result.overallScore is not None
    assert result.overallScore >= 9
    assert result.confidence == "high"
    assert result.grounding.datasetId == "avatar-gpt-realtime-synthetic-v1"
    assert len(result.grounding.sources) == 3
    assert all(
        source.id.startswith("REF-SCN001-") for source in result.grounding.sources
    )
    metrics = {metric.id: metric for metric in result.coachingMetrics}
    assert metrics["tone-compassion"].score10 == 10
    assert metrics["clarity"].score10 == 10
    assert metrics["shared-decision-making"].value == "Met"
    assert metrics["question-responsiveness"].value == "1 of 1 addressed"
    assert metrics["medical-jargon"].value == "0 unexplained instances"
    assert len(result.strengths) == 2
    assert len(result.coaching) == 2
    assert len(result.rewriteExamples) >= 1


def test_unexplained_jargon_reduces_clarity() -> None:
    result = evaluate(
        EvaluationRequest(
            scenarioId="SCN-003",
            learnerTurns=[
                "Your prognosis depends on whether the disease is metastatic and on the clinical pathway.",
                "We will discuss it later.",
            ],
        )
    )
    clarity = next(
        category for category in result.categories if category.id == "clarity"
    )
    assert clarity.score == 0
    assert "clinical pathway" in clarity.evidence
    assert result.grounding.sources[0].id == "REF-SCN003-002"
    metrics = {metric.id: metric for metric in result.coachingMetrics}
    assert metrics["clarity"].score10 == 0
    assert metrics["medical-jargon"].score10 == 0


def test_avatar_question_evidence_does_not_change_canonical_score() -> None:
    request = EvaluationRequest(
        scenarioId="SCN-002",
        learnerTurns=[
            "I hear how frustrated you feel while your family disagrees.",
            "I can see why it matters to know that we are listening to your parent.",
            "We can decide together after we review your parent's wishes.",
            "Did I understand what matters most, and which part should we discuss first?",
        ],
    )
    without_question = evaluate(request)
    with_question = evaluate(
        request.model_copy(
            update={
                "avatarTurns": [
                    "Is anyone listening to what my parent wanted?",
                    "Can my family be part of the decision?",
                ]
            }
        )
    )

    assert with_question.overallScore == without_question.overallScore
    assert [item.score for item in with_question.categories] == [
        item.score for item in without_question.categories
    ]
    question_metric = next(
        metric
        for metric in with_question.coachingMetrics
        if metric.id == "question-responsiveness"
    )
    assert question_metric.value == "2 of 2 addressed"


def test_successful_avatar_interruptions_do_not_lower_tone_label() -> None:
    request = EvaluationRequest(
        scenarioId="SCN-001",
        learnerTurns=[
            "I hear that you are scared, and it makes sense to want a direct answer.",
            "We can take this together and decide which concern to discuss first.",
            "What matters most to you, and did I understand your question?",
        ],
    )
    baseline_tone = next(
        metric
        for metric in evaluate(request).coachingMetrics
        if metric.id == "tone-compassion"
    )
    interrupted_tone = next(
        metric
        for metric in evaluate(
            request.model_copy(update={"interruptedCount": 3})
        ).coachingMetrics
        if metric.id == "tone-compassion"
    )

    assert interrupted_tone.value == baseline_tone.value
    assert interrupted_tone.score10 == baseline_tone.score10
    assert "learner interruptions: 3" in interrupted_tone.evidence


def test_too_few_turns_withholds_precise_score() -> None:
    result = evaluate(
        EvaluationRequest(scenarioId="SCN-002", learnerTurns=["I hear you."])
    )
    assert result.overallScore is None
    assert result.confidence == "low"
    assert result.limitations
