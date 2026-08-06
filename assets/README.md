# Synthetic persona assets

Every patient in this accelerator is fabricated. Each one is a **matched pair**: a
synthetic portrait and a synthetic voice, bound to the same scenario so the face a
learner sees and the voice they hear belong to the same character.

Nothing here depicts, records, or imitates a real person.

| Scenario | Persona | Portrait | Voice | Character |
| --- | --- | --- | --- | --- |
| `SCN-001` | Persona 1 | [`synthetic-patient-01.png`](../frontend/src/assets/personas/synthetic-patient-01.png) | [`echo`](synthetic-voices/persona-1-echo) | Advanced illness; exhausted, frightened of pain |
| `SCN-002` | Persona 3 | [`synthetic-patient-02.png`](../frontend/src/assets/personas/synthetic-patient-02.png) | [`shimmer`](synthetic-voices/persona-3-shimmer) | End-of-life care; withdrawn, emotionally spent |
| `SCN-003` | Persona 4 | [`synthetic-patient-03.png`](../frontend/src/assets/personas/synthetic-patient-03.png) | [`ballad`](synthetic-voices/persona-4-ballad) | Treatment stopped working; frightened, lost in jargon |

The voice column is what the application uses at runtime, and the linked clips are that
exact configuration rendered offline.

## The two families

### Portraits — `frontend/src/assets/personas/`

Three 1024×1024 PNGs generated with Azure OpenAI image generation. Each carries an
embedded **C2PA content credential** recording `trainedAlgorithmicMedia` as its digital
source type, so any viewer can verify the image was model-generated rather than
photographed. A [`manifest.json`](../frontend/src/assets/personas/manifest.json) pins
each file's dimensions and SHA-256, and `scripts/validate_assets.py` fails the build if
a file drifts from its manifest entry, an extra PNG appears, or the policy block stops
asserting synthetic-only content.

They live under `frontend/` because the build imports them directly. Moving them would
break both the Vite bundle and the asset validator, so this folder links to them rather
than keeping a second copy that could silently drift.

### Voices — [`synthetic-voices/`](synthetic-voices)

Twelve reference clips, four per persona, rendered by `gpt-realtime` through Azure AI
Voice Live using the same voices and the same direction the application uses at runtime.
They are **not** played during a session — the application generates speech live. They
exist so you can hear a persona before deploying anything, and so a voice change can be
reviewed by ear instead of by reading a config diff.

See [`synthetic-voices/README.md`](synthetic-voices/README.md) for the full listing and
the emotional arc each set covers.

## How a pair reaches a learner

The pairing is server-side. The browser picks a scenario ID and nothing else — it never
sees or chooses a voice, prompt, or character.

1. `VOICE_PROFILES` in `backend/app/voice_live.py` maps the scenario to its voice.
2. `build_session_config()` opens the Voice Live session with that voice.
3. `build_prompt()` in `backend/app/realtime.py` emits the scenario's `vocalProfile` as a
   `Vocal identity:` block.
4. `frontend/src/Avatar.tsx` animates the matching portrait from the viseme stream.

The `vocalProfile` is deliberately excluded from `PUBLIC_SCENARIO_FIELDS`, so the persona's
direction never reaches the browser. Because the mapping lives in one dictionary, swapping
a persona's voice is a one-line change that the tests then hold in place.

## Steering a `gpt-realtime` voice

The `gpt-realtime` voices expose exactly one setting: a name. There is no `rate`, `pitch`,
`volume`, or named style, and SSML prosody markup is not accepted. Every expressive choice
is therefore prose, written per scenario in `scenarios.py`:

```python
"vocalProfile": {
    "personality": "Serious and frightened, embarrassed at not understanding, ...",
    "tone": "Guarded and careful, with vulnerability close to the surface.",
    "length": "Short, cautious turns that lengthen only once plain language lands.",
    "pacing": "Halting when confused, steadier once an explanation is clear.",
    "speakingSpeed": "Slower and more careful when lost, easing as understanding returns.",
}
```

That is the entire configuration. In the reference clips it produces a delivery range of
roughly 2.4–3.4 words per second, with the same voice slowing as anger drains or speeding
up in anxious confusion. No rate parameter is set anywhere.

The practical gain is that affect can move **within** a conversation as the learner does
better or worse, which a fixed `rate` cannot do. The cost is that this is **expressive
control, not a calibrated dial** — delivery varies between runs.

### If you need deterministic playback

For byte-identical audio — a scored calibration item, for instance — use a pre-rendered
clip, or switch to an Azure Neural voice, which exposes explicit parameters. In
`backend/app/voice_live.py`, import `AzureStandardVoice` instead of `OpenAIVoice`, point
`VOICE_PROFILES` at names such as `en-US-GuyNeural`, and pass `style`, `pitch`, `rate`, and
`volume`. Those settings apply uniformly for the whole session, so the voice will no longer
respond to the emotional arc.

## Adding or replacing a persona

1. Generate a shoulders-up synthetic portrait and confirm it depicts no real person.
2. Add the PNG to `frontend/src/assets/personas/` and update its `manifest.json` entry
   with the real byte count, dimensions, and SHA-256.
3. Add the scenario and its `vocalProfile` to `backend/app/scenarios.py`, and its voice to
   `VOICE_PROFILES` in `backend/app/voice_live.py`.
4. Map the portrait in `frontend/src/Avatar.tsx` and calibrate its mouth geometry.
5. Run `./scripts/test.ps1` and `./scripts/privacy-scan.ps1`.

Optionally render new reference clips into `synthetic-voices/` and update its manifest.

> [!IMPORTANT]
> A real person's likeness or recorded voice must not enter this accelerator. Azure's
> custom photo avatar and custom neural voice are Limited Access features requiring
> eligibility approval, written permission from the person, and a consent recording.
> Consent media must never be committed. See
> [Custom Photo Avatar](../docs/custom-photo-avatar.md).
