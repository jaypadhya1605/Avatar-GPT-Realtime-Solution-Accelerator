# Synthetic voice samples

Twelve reference clips, four per persona, rendered by `gpt-realtime` through Azure AI
Voice Live. All audio is machine generated: no recorded human voice, no voice cloning,
no PHI, no PII.

These files are **reference material, not runtime assets**. The application synthesizes
speech live during a session and never plays these clips. They exist so you can hear how
each persona sounds before deploying anything, and so a voice change can be reviewed by
ear rather than by reading a diff.

> [!NOTE]
> These clips use the same voices and the same `vocalProfile` direction the application
> uses at runtime, so they are representative rather than illustrative. Delivery still
> varies between runs — see [`../README.md`](../README.md).

| Format | Value |
| --- | --- |
| Container | WAV, PCM signed 16-bit little-endian |
| Sample rate | 24 000 Hz |
| Channels | Mono |

That format is deliberate — it matches the PCM16 stream Voice Live returns at runtime,
so a clip and a live turn are directly comparable.

## Persona 1 — `echo` (`SCN-001`)

Advanced illness. Exhausted, sad, and frightened of pain. The set moves from raw fear to
a calmer register once that fear is acknowledged.

| Clip | Moment | Length |
| --- | --- | --- |
| `persona-1-01-opening-fear.wav` | Opening — exhausted and afraid | 11.1s |
| `persona-1-02-night-fear-escalating.wav` | Fear escalating — the three a.m. worry | 19.7s |
| `persona-1-03-jargon-confusion.wav` | Fragmented — unfamiliar words land as abandonment | 12.5s |
| `persona-1-04-settling-after-empathy.wav` | Settling — fear named, tension easing | 29.4s |

## Persona 3 — `shimmer` (`SCN-002`)

Receiving end-of-life care. Withdrawn, discouraged, and worn down. Composed rather than
distressed — she already understands the vocabulary and wants honesty, not reassurance.

| Clip | Moment | Length |
| --- | --- | --- |
| `persona-3-01-opening-withdrawn.wav` | Opening — worn down, asking for honesty | 13.8s |
| `persona-3-02-medical-student-awareness.wav` | Composed — she already knows the terms | 17.8s |
| `persona-3-03-hope-and-reality.wav` | Hope and reality held together | 28.4s |
| `persona-3-04-silence-honored.wav` | Opening up — silence was the right answer | 17.3s |

## Persona 4 — `ballad` (`SCN-003`)

Treatment is no longer working. Defensive and angry on the surface, frightened
underneath. The set exists to demonstrate anger draining into fear and then relief.

| Clip | Moment | Length |
| --- | --- | --- |
| `persona-4-01-defensive-opening.wav` | Opening — clipped and on guard | 13.8s |
| `persona-4-02-jargon-anger.wav` | Anger at the jargon | 17.3s |
| `persona-4-03-anger-cracking-into-fear.wav` | Anger cracking — the fear underneath | 23.4s |
| `persona-4-04-plain-language-lands.wav` | Plain language lands — guard drops | 20.4s |

## What to listen for

Within a persona, delivery speed tracks the written emotional direction even though no
rate parameter is set:

- Persona 4 opens at about 3.35 words/second while angry and slows to about 2.65 by the
  final clip as the anger drains — roughly 20 percent slower, same voice.
- Persona 1 runs about 2.43 words/second when most frightened and hesitant, then speeds
  to about 3.28 when anxious and rushing through confusion.

Do not read across personas. Aggregate rates sit in a narrow band (2.9–3.1 words/second)
because the scripts differ in length and structure. The meaningful signal is the swing
**within** a persona, driven purely by the prose direction given for each take.

## Manifest

[`manifest.json`](manifest.json) records each clip's scenario, persona, paired portrait,
voice, model, duration, scripted text, rendered transcript, and the emotional direction
used to produce it. The `scriptedText` and `renderedTranscript` fields let you confirm
the model spoke the line verbatim rather than improvising.

## Regenerating

Open one Voice Live session per line, set `turn_detection` to `None`, and instruct the
model to speak the text verbatim exactly once with no stage directions. Batching lines
into a single session causes the model to blend or re-perform them, and leaving voice
activity detection on lets an empty input buffer trigger an unwanted extra turn.
