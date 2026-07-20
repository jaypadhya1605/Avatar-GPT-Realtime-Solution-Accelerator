import re
from statistics import mean

from .models import (
    CategoryScore,
    EvaluationRequest,
    EvaluationResponse,
    CoachingMetric,
)
from .rag import retrieve_learner_grounding
from .scenarios import SCENARIOS


JARGON_TERMS = (
    "prognosis",
    "morbidity",
    "palliative",
    "intubation",
    "differential",
    "metastatic",
    "comorbidity",
    "clinical pathway",
)

EMOTION_TERMS = (
    "afraid",
    "anxious",
    "confused",
    "embarrassed",
    "fear",
    "frightening",
    "frustrated",
    "overwhelmed",
    "scared",
    "worried",
)

VALIDATION_PHRASES = (
    "it makes sense",
    "that makes sense",
    "understand why",
    "i can see why",
    "i hear how",
    "i'm sorry",
    "i am sorry",
)

DISMISSIVE_PHRASES = (
    "calm down",
    "already explained",
    "nothing to worry about",
    "you need to",
    "just relax",
)

UNDERSTANDING_CHECKS = (
    "did i understand",
    "does that make sense",
    "tell me in your own words",
    "what still feels",
    "what would you like",
    "stop me if",
    "which part",
)

SHARED_DECISION_PHRASES = (
    "what matters",
    "what would you like",
    "what is important",
    "your goals",
    "your wishes",
    "your choice",
    "decide together",
    "which option",
    "which part",
)

EMPATHY_LANGUAGE_PHRASES = tuple(
    dict.fromkeys(
        (*VALIDATION_PHRASES, "i hear", "i can see", "with you", "take our time")
    )
)

QUESTION_STOP_WORDS = {
    "about",
    "after",
    "again",
    "could",
    "does",
    "have",
    "here",
    "know",
    "like",
    "really",
    "should",
    "that",
    "their",
    "there",
    "they",
    "this",
    "what",
    "when",
    "where",
    "which",
    "with",
    "would",
    "your",
}


def _first_evidence(turns: list[str], terms: tuple[str, ...]) -> str:
    for turn in turns:
        lowered = turn.lower()
        if any(term in lowered for term in terms):
            return turn[:220]
    return "No direct evidence found in finalized learner turns."


def _sentences(turns: list[str]) -> list[str]:
    return [
        sentence.strip()
        for turn in turns
        for sentence in re.split(r"[.!?]+", turn)
        if sentence.strip()
    ]


def _unexplained_jargon(turns: list[str]) -> list[str]:
    flagged: list[str] = []
    explanation_markers = (
        "what i mean",
        "in plain language",
        "in other words",
        "means that",
    )
    for turn in turns:
        lowered = turn.lower()
        for term in JARGON_TERMS:
            if term in lowered and not any(
                marker in lowered for marker in explanation_markers
            ):
                flagged.append(term)
    return sorted(set(flagged))


def _score10(points: int, maximum: int) -> int:
    return round((points / maximum) * 10) if maximum else 0


def _count_empathy_language(turns: list[str]) -> int:
    return sum(
        lowered.count(phrase)
        for turn in turns
        for lowered in (turn.lower(),)
        for phrase in EMPATHY_LANGUAGE_PHRASES
    )


def _question_sentences(turns: list[str]) -> list[str]:
    return [
        sentence.strip()
        for turn in turns
        for sentence in re.findall(r"[^?]+\?", turn)
        if sentence.strip()
    ]


def _question_keywords(question: str) -> set[str]:
    return {
        token
        for token in re.findall(r"[a-z']+", question.lower())
        if len(token) > 3 and token not in QUESTION_STOP_WORDS
    }


def _coaching_metrics(
    *,
    turns: list[str],
    avatar_turns: list[str],
    concerns: tuple[str, ...],
    recognition_score: int,
    validation_score: int,
    clarity_score: int,
    dismissive: bool,
    checked: bool,
    jargon: list[str],
    interrupted_count: int,
) -> list[CoachingMetric]:
    lowered = " ".join(turns).lower()
    tone_conversation_score = 2 if checked else 1 if turns else 0
    tone_score = _score10(
        recognition_score + validation_score + tone_conversation_score, 6
    )
    tone_label = (
        "Dismissive or rushed"
        if dismissive
        else "Compassionate and calm"
        if tone_score >= 9
        else "Supportive"
        if tone_score >= 6
        else "Neutral or task-focused"
    )

    empathy_count = _count_empathy_language(turns)
    empathy_score = _score10(recognition_score + validation_score, 4)

    shared_decision_signal = any(
        phrase in lowered for phrase in SHARED_DECISION_PHRASES
    )
    shared_decision_status = (
        "Not met"
        if dismissive
        else "Met"
        if shared_decision_signal and checked
        else "Partially met"
        if shared_decision_signal or checked
        else "Not met"
    )

    questions = _question_sentences(avatar_turns)
    learner_tokens = set(re.findall(r"[a-z']+", lowered))
    addressed_questions = sum(
        1 for question in questions if _question_keywords(question) & learner_tokens
    )
    if questions:
        question_score = round((addressed_questions / len(questions)) * 10)
        question_value = f"{addressed_questions} of {len(questions)} addressed"
        question_evidence = questions[0][:220]
    else:
        question_score = None
        question_value = "No played question evidence"
        question_evidence = _first_evidence(turns, concerns)

    return [
        CoachingMetric(
            id="tone-compassion",
            label="Tone and compassion",
            value=tone_label,
            score10=tone_score,
            evidence=(
                f"Language and interaction indicators; learner interruptions: {interrupted_count}. "
                "Vocal mood is not inferred."
            ),
        ),
        CoachingMetric(
            id="clarity",
            label="Clarity",
            value=(
                "Clear and concise"
                if clarity_score == 2
                else "Some complexity"
                if clarity_score == 1
                else "Needs plain-language repair"
            ),
            score10=clarity_score * 5,
            evidence=(
                f"Unexplained jargon: {', '.join(jargon)}."
                if jargon
                else "No listed unexplained jargon was detected."
            ),
        ),
        CoachingMetric(
            id="empathy-language",
            label="Empathetic language",
            value=f"{empathy_count} explicit signal{'s' if empathy_count != 1 else ''}",
            score10=empathy_score,
            evidence=_first_evidence(turns, EMPATHY_LANGUAGE_PHRASES),
        ),
        CoachingMetric(
            id="shared-decision-making",
            label="Shared decision-making",
            value=shared_decision_status,
            score10=None,
            evidence=(
                _first_evidence(turns, SHARED_DECISION_PHRASES)
                if shared_decision_signal
                else "No explicit invitation to share goals, preferences, or choices was found."
            ),
        ),
        CoachingMetric(
            id="question-responsiveness",
            label="Patient questions addressed",
            value=question_value,
            score10=question_score,
            evidence=question_evidence,
        ),
        CoachingMetric(
            id="medical-jargon",
            label="Medical jargon",
            value=f"{len(jargon)} unexplained instance{'s' if len(jargon) != 1 else ''}",
            score10=max(0, 10 - (len(jargon) * 5)),
            evidence=(
                ", ".join(jargon)
                if jargon
                else "No listed unexplained clinical terms were detected."
            ),
        ),
    ]


def evaluate(request: EvaluationRequest) -> EvaluationResponse:
    turns = [turn.strip()[:1000] for turn in request.learnerTurns if turn.strip()]
    avatar_turns = [turn.strip()[:1000] for turn in request.avatarTurns if turn.strip()]
    lowered = " ".join(turns).lower()
    scenario = SCENARIOS[request.scenarioId]
    grounding = retrieve_learner_grounding(request.scenarioId, scenario, turns)

    dismissive = any(phrase in lowered for phrase in DISMISSIVE_PHRASES)
    reflected_emotion = any(term in lowered for term in EMOTION_TERMS)
    generic_acknowledgment = any(
        phrase in lowered for phrase in ("this is hard", "that's hard", "that is hard")
    )
    recognition_score = (
        0
        if dismissive
        else 2
        if reflected_emotion
        else 1
        if generic_acknowledgment
        else 0
    )

    validated = any(phrase in lowered for phrase in VALIDATION_PHRASES)
    supportive = any(
        term in lowered for term in ("i hear", "with you", "take our time", "help")
    )
    validation_score = 0 if dismissive else 2 if validated else 1 if supportive else 0

    jargon = _unexplained_jargon(turns)
    sentence_lengths = [len(sentence.split()) for sentence in _sentences(turns)]
    average_words = mean(sentence_lengths) if sentence_lengths else 0
    clarity_score = (
        0
        if len(jargon) >= 2 or average_words > 30
        else 1
        if jargon or average_words > 22
        else 2
    )

    concerns = tuple(scenario["concerns"])
    addressed = any(concern in lowered for concern in concerns)
    checked = any(phrase in lowered for phrase in UNDERSTANDING_CHECKS)
    responsiveness_score = 2 if addressed and checked else 1 if addressed else 0

    conversation_score = (
        0 if request.interruptedCount > 1 else 2 if checked else 1 if turns else 0
    )

    categories = [
        CategoryScore(
            id="emotional-recognition",
            label="Emotional recognition",
            score=recognition_score,
            evidence=_first_evidence(turns, EMOTION_TERMS),
        ),
        CategoryScore(
            id="validation-empathy",
            label="Validation and empathy",
            score=validation_score,
            evidence=_first_evidence(turns, VALIDATION_PHRASES),
        ),
        CategoryScore(
            id="clarity",
            label="Clarity and plain language",
            score=clarity_score,
            evidence=(
                f"Unexplained jargon: {', '.join(jargon)}."
                if jargon
                else f"No listed jargon detected; average sentence length {average_words:.1f} words."
            ),
        ),
        CategoryScore(
            id="responsiveness",
            label="Responsiveness",
            score=responsiveness_score,
            evidence=_first_evidence(turns, concerns),
        ),
        CategoryScore(
            id="conversation-quality",
            label="Conversation quality",
            score=conversation_score,
            evidence=(
                f"Understanding check: {'yes' if checked else 'no'}; learner interruptions: {request.interruptedCount}."
            ),
        ),
    ]

    final_turn_count = len(turns)
    if (
        final_turn_count >= 4
        and request.transcriptionFailures == 0
        and request.estimatedAvatarSegments == 0
    ):
        confidence = "high"
    elif final_turn_count >= 2 and request.transcriptionFailures <= 1:
        confidence = "medium"
    else:
        confidence = "low"

    limitations: list[str] = []
    if final_turn_count < 2:
        limitations.append(
            "Fewer than two finalized learner turns; a precise overall score is withheld."
        )
    if request.transcriptionFailures:
        limitations.append("One or more learner turns could not be transcribed.")
    if request.estimatedAvatarSegments:
        limitations.append(
            "Estimated or interrupted avatar playback was excluded from precise evidence."
        )

    overall = (
        sum(category.score for category in categories)
        if final_turn_count >= 2
        else None
    )
    strengths = [category.label for category in categories if category.score == 2][:2]
    coaching = [
        {
            "emotional-recognition": "Name the specific emotion or concern you heard before explaining next steps.",
            "validation-empathy": "Explain why the person's reaction makes sense instead of offering reassurance alone.",
            "clarity": "Replace medical terminology with one short plain-language sentence.",
            "responsiveness": "Answer the active concern directly, then check what remains unclear.",
            "conversation-quality": "Leave space for the response and add one explicit understanding check.",
        }[category.id]
        for category in categories
        if category.score < 2
    ][:2]
    stretch_coaching = (
        "After answering the active concern, invite the patient to name what still feels most important.",
        "Reflect the emotion in one short sentence, then pause before adding more information.",
    )
    for item in stretch_coaching:
        if len(coaching) >= 2:
            break
        if item not in coaching:
            coaching.append(item)

    rewrites = []
    if recognition_score < 2 or validation_score < 2:
        rewrites.append(
            "I hear that this feels frightening, and it makes sense to want a clearer answer."
        )
    if clarity_score < 2:
        rewrites.append(
            "Let me say that in plain language and pause so you can tell me what is still unclear."
        )
    if not rewrites:
        rewrites.append(
            "It sounds like the uncertainty is the hardest part right now. What would help you feel more prepared for the next step?"
        )

    diagnostics = [
        f"Reflective listening: {'present' if reflected_emotion else 'not yet observed'}",
        f"Emotional validation: {'present' if validated else 'not yet observed'}",
        f"Unexplained jargon: {len(jargon)}",
        f"Understanding check: {'present' if checked else 'not yet observed'}",
        f"Learner interruptions: {request.interruptedCount}",
    ]

    return EvaluationResponse(
        overallScore=overall,
        confidence=confidence,
        categories=categories,
        diagnostics=diagnostics,
        strengths=strengths,
        coaching=coaching,
        rewriteExamples=rewrites,
        limitations=limitations,
        coachingMetrics=_coaching_metrics(
            turns=turns,
            avatar_turns=avatar_turns,
            concerns=concerns,
            recognition_score=recognition_score,
            validation_score=validation_score,
            clarity_score=clarity_score,
            dismissive=dismissive,
            checked=checked,
            jargon=jargon,
            interrupted_count=request.interruptedCount,
        ),
        grounding=grounding.public_summary("learner-turns"),
    )
