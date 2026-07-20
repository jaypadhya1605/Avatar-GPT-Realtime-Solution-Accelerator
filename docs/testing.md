# Testing

## Automated checks

Bootstrap once from PowerShell:

```powershell
./scripts/bootstrap.ps1
```

Run the complete local gate:

```powershell
./scripts/test.ps1
./scripts/package.ps1
```

`test.ps1` runs:

- Ruff lint and format checks;
- Python compilation and Pytest;
- frontend Oxlint, Vitest, and production TypeScript/Vite build;
- portrait manifest, dimensions, hashes, and format validation;
- privacy and credential-pattern scanning;
- Bicep lint and compilation.

`package.ps1` rebuilds the frontend, copies only deployable files, creates a SHA-256 package manifest, scans the package again, and imports the packaged app in an isolated smoke process.

Run `./scripts/preflight.ps1` before deployment to combine these checks with CLI, subscription, and resource-provider validation. Preflight does not change Azure.

## Local mock

```powershell
./scripts/run-mock.ps1
```

Open `http://localhost:8000`. Mock mode validates the packaged SPA, scenarios, deterministic evaluation, responsive layout, privacy headers, and API contracts without an Azure resource or billable Voice Live session. It intentionally does not synthesize fake realtime audio.

## GA Voice Live acceptance

In a deployed environment, test Edge and Chrome on desktop plus at least one narrow mobile viewport:

1. Confirm the app loads over HTTPS and browser developer tools show no credential, endpoint, model, prompt, voice, or character values in public configuration.
2. Select each scenario and verify its distinct portrait and configured voice.
3. Grant microphone access and verify user transcript, patient transcript, PCM16 playback, and viseme-driven mouth motion.
4. Interrupt the patient mid-response and verify playback stops, the learner can speak, and the interruption is reflected in evaluation evidence.
5. Exercise easy, medium, and hard difficulty.
6. End the session and verify deterministic category scores, evidence, confidence, diagnostics, coaching, rewrites, and grounding sources.
7. Refresh and confirm no transcript or report is restored from server persistence.
8. Deny microphone permission and disconnect the network; verify bounded, recoverable errors.
9. Start a second simultaneous session in the same browser and verify the active-session guard.
10. Leave a session open through its configured maximum and verify it is closed cleanly.

Use headphones during audio acceptance. Voice Live echo cancellation assumes response audio is played promptly; delayed playback can reduce cancellation quality.

## Preview acceptance

Custom Photo Avatar has a separate acceptance gate. Follow the scenario, identity, H.264/WebRTC, interruption, responsive-layout, network-policy, and rollback checks in [Custom Photo Avatar](custom-photo-avatar.md). A GA pass does not imply a Preview pass.

## Privacy release review

Before publishing or tagging a release:

- inspect `git diff --cached` and the generated package manifest;
- confirm no `.azure` environment, `.env`, deployment output, portal export, original JPEG, consent artifact, character name, signed URL, tenant identifier, or credential is tracked;
- run `./scripts/privacy-scan.ps1` from the repository root and against `artifacts/app`;
- verify portrait provenance and SHA-256 values with `scripts/validate_assets.py`;
- inspect documentation links and commands from a clean clone;
- run the complete CI-equivalent gate on Python 3.12 and Node.js 20 or newer.

Automated scans are intentionally conservative but cannot identify every private value. Human diff review remains mandatory.