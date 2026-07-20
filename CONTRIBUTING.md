# Contributing

Contributions that improve the reproducibility, safety, accessibility, testing, or synthetic training value of the accelerator are welcome.

## Before opening a change

1. Open an issue for substantial behavior or architecture changes.
2. Use only synthetic examples and assets you have the right to publish.
3. Keep the GA-default Voice Live and local-portrait path functional without Preview approval.
4. Do not add customer names, patient data, credentials, signed URLs, tenant character names, source photos, consent recordings, portal exports, `.azure` state, or deployment outputs.
5. Keep public configuration and errors free of server-owned endpoints, models, prompts, voices, characters, and identity material.

## Development

Prerequisites and bootstrap instructions are in the [README](README.md). Use Python 3.12 and Node.js 20 or newer.

```powershell
./scripts/bootstrap.ps1
./scripts/run-mock.ps1
```

Runtime dependency changes belong in `backend/requirements.in`; development-only changes belong in `backend/requirements-dev.in`. Regenerate both hash-locked files with:

```powershell
./scripts/lock.ps1
```

Commit the inputs and generated locks together. Frontend dependencies must be changed with npm so `package.json` and `package-lock.json` remain synchronized.

## Required validation

```powershell
./scripts/test.ps1
./scripts/package.ps1
```

Behavior changes need focused backend or frontend tests. User-interface changes also need desktop and narrow-mobile browser checks. Voice or Preview changes require deployed acceptance testing with synthetic dialogue and sanitized diagnostics.

## Pull requests

Keep changes focused and explain observable behavior, tradeoffs, and validation. Confirm every item in the pull request template. A passing automated scan does not replace review of the final diff and package manifest.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).