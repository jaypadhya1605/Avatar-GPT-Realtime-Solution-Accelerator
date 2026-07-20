# Avatar GPT Realtime Solution Accelerator - Deployment Plan

> **Status:** Validated

Generated: 2026-07-20T09:51:18-04:00

**Mode:** Clean public extraction from a validated prototype
**Deployment execution:** Out of scope for this repository-creation task

---

## 1. Project Overview

**Goal:** Populate the public `jaypadhya1605/Avatar-GPT-Realtime-Solution-Accelerator` repository with a reproducible React and FastAPI synthetic-patient coaching application built around Azure Voice Live, managed identity, deterministic grounding and evaluation, and an optional Custom Photo Avatar workflow.

**Path:** Modernize an existing prototype into a new public solution accelerator. This is a selective extraction, not a copy of the prototype tree.

**Product name:** Avatar GPT Realtime Solution Accelerator

**License:** MIT, with a contributor-neutral copyright notice.

**Reference use:** Reuse public solution-accelerator conventions from `jaypadhya1605/Prior-Authorization-Multi-Agent-Solution-Accelerator` for repository organization, community health, deployment guidance, CI, and documentation depth. Do not copy its healthcare workflow, multi-agent/MCP architecture, Container Apps topology, or prose.

## 2. Requirements

| Attribute | Decision |
| --- | --- |
| Classification | Public POC/development accelerator; not a production clinical system |
| Scale | Small, single-region demonstration; document production scaling separately |
| Budget | Cost-optimized baseline with a configurable App Service SKU and explicit model/avatar usage costs |
| Data | Versioned synthetic scenarios and communication references only; no real patient data |
| Compliance | No HIPAA, medical-device, clinical-safety, or production-readiness certification claim |
| Authentication | Keyless runtime access through a system-assigned managed identity |
| Subscription | Deployer supplied through `azd env`; no subscription is selected or mutated during repository preparation |
| Location | Overrideable `eastus2` template default; current Microsoft documentation lists `gpt-realtime-1.5` Voice Live and Custom Photo Avatar creation there; deployers must still verify policy and availability |
| Runtime default | GA neural voice, PCM16 audio, and local viseme-driven portrait animation |
| Optional runtime | Custom Photo Avatar Limited Access Preview using `photo-avatar`, `vasa-1`, and WebRTC |
| Session controls | One active browser lease, bounded message sizes/rates, a 15-minute default limit, explicit teardown, and no transcript persistence by default |

## 3. Components Detected and Extraction Boundary

| Component | Type | Technology | Target path | Disposition |
| --- | --- | --- | --- | --- |
| Training UI | Frontend | React 19, TypeScript 6, Vite | `frontend/` | Retain behavior; remove customer branding and rename public contracts |
| Realtime gateway | API/WebSocket | FastAPI, Pydantic Settings | `backend/app/` | Retain same-origin protocol, admission limits, and cleanup behavior |
| Voice Live adapter | Azure integration | `azure-ai-voicelive` 1.2, `DefaultAzureCredential` | `backend/app/voice_live.py` | Retain server-owned scenario/model/voice/avatar configuration |
| Coaching evaluator | Domain service | Deterministic Python scoring | `backend/app/evaluator.py` | Rename customer-specific types and fields to generic coaching terminology |
| Synthetic grounding | Domain service/data | Deterministic scenario-filtered JSON retrieval | `backend/app/rag.py`, `data/` | Retain contract; generalize dataset and reference IDs |
| Test suites | Verification | Pytest, Vitest, Oxlint | `backend/tests/`, `frontend/src/` | Retain and update with every public rename |
| Packaging and local runners | Developer tooling | PowerShell and Python | `scripts/` | Retain useful cross-platform behavior; remove target subscription/resource defaults |

### Explicit Exclusions

- Prototype `.azure/` state, deployment plans, resource snapshots, deployment IDs, ZIP packages, generated `dist/`, caches, virtual environments, and rollback history.
- Customer meeting notes, presentations, asks, demo score scripts, private specifications, emails, tenant/subscription/resource IDs, signed URLs, and operational evidence.
- Historical or update-only Bicep amendments and all hard-coded customer resource names.
- Original `empathy-ai-persona-*.jpg` reference images and V2 portrait assets.
- Any external-image Custom Photo Avatar data or consent artifact. No consent record will be fabricated.

## 4. Recipe Selection

**Selected:** Azure Developer CLI with Bicep (`azd` + Bicep).

**Rationale:** The user asked for a simpler, replicable solution accelerator. A single `azd up` entry point, environment-scoped outputs, generic Bicep, and App Service source-package deployment provide a smaller operational surface than the reference accelerator's multi-container topology.

**Deployment packaging:** Build the React application, copy its static output into the FastAPI package, and deploy one same-origin Python 3.12 App Service artifact. No ACR, Container Apps environment, Docker Compose production topology, or separate frontend host is required.

## 5. Architecture

**Stack:** One Linux Azure App Service hosting FastAPI and the built React SPA.

### Service Mapping

| Component | Azure service | Default/configuration |
| --- | --- | --- |
| React SPA and FastAPI gateway | Linux Azure App Service | Configurable plan, default `B1`; Python 3.12; HTTPS only; HTTP/2; WebSockets; Always On; health path |
| Realtime model, neural speech, and avatar capability | Microsoft Foundry resource (`Microsoft.CognitiveServices/accounts`, kind `AIServices`) | Generic environment-derived name; account endpoint passed to the app as a non-secret setting |
| Native Voice Live model | Voice Live fully managed model | Server-owned `gpt-realtime-1.5` default; no model deployment or provisioned capacity is required for natively supported Voice Live models |
| Traces and metrics | Application Insights workspace-based resource | Sanitized operational telemetry only |
| Central logs | Log Analytics workspace | Configurable retention; no transcript, prompt, SDP/ICE/TURN, token, raw audio, or raw video bodies |
| Runtime authorization | System-assigned managed identity and resource-scoped RBAC | `Cognitive Services User` plus `Foundry User` on Foundry, and `Monitoring Metrics Publisher` on Application Insights for Entra-authenticated telemetry ingestion |

**Key Vault decision:** Omit it from the baseline because the runtime is keyless and has no user-managed secret. Adding an unused vault would increase cost and complexity. Document Key Vault for future integrations that introduce secrets.

**Storage decision:** Omit persistent application storage. Reports remain browser-visible and ephemeral by default; the synthetic corpus ships with the package.

### Runtime Data Flows

1. The browser captures microphone audio through an AudioWorklet and resamples to 24 kHz PCM16.
2. A same-origin WebSocket sends bounded audio and control messages to FastAPI. The browser cannot select an Azure endpoint, token, model, voice, prompt, or character.
3. FastAPI authenticates to Voice Live with managed identity and applies a server-owned scenario, voice, model, safety prompt, and synthetic grounding bundle.
4. In the default GA mode, FastAPI relays response PCM/transcript/viseme events. The browser plays audio and animates the scenario portrait locally.
5. In optional Preview mode, FastAPI relays bounded ICE and base64 SDP signaling while Azure streams synchronized H.264 video and paired audio directly to the browser over WebRTC.
6. Finalized learner turns feed a deterministic, non-model coaching evaluator. At most three same-scenario synthetic references are exposed by ID and title only.
7. Telemetry records allowlisted operational fields and timings, never conversation content or media payloads.

### Architecture Artifacts

- `docs/images/architecture/solution-architecture.excalidraw` as the editable source.
- `docs/images/architecture/solution-architecture.svg` as the README-renderable export.
- A concise Mermaid sequence/data-flow view in `docs/architecture.md`.
- The root README embeds the architecture SVG with descriptive alt text and a link to the detailed architecture guide.

## 6. Public Avatar Asset and Character Policy

The accelerator will include only the three visually reviewed 1024 x 1024 V3 PNG outputs generated inside Foundry's AI-generated-image Custom Photo Avatar path. They will be renamed to generic `synthetic-patient-01.png`, `synthetic-patient-02.png`, and `synthetic-patient-03.png` and recorded in an asset manifest with SHA-256, dimensions, creation method, intended scenario, visual-review criteria, and the statement that they are synthetic depictions rather than known people.

| Public asset | Reviewed source SHA-256 | Publication rule |
| --- | --- | --- |
| `synthetic-patient-01.png` | `cb4396534771fc00f418aa1b353027193febf932c3680e223361b0f1b3849455` | Include only if bytes match and metadata/privacy checks pass |
| `synthetic-patient-02.png` | `86ac542887a465dde12e647c4848f203e151b4b8d0ba761b6726fd0a8a579437` | Include only if bytes match and metadata/privacy checks pass |
| `synthetic-patient-03.png` | `d7b2db8c23426c404bea32d2f5314de099061ef23c31f8ac8653e0f123fe1fc8` | Include only if bytes match and metadata/privacy checks pass |

The tenant-specific V3 character resource names will not be published as defaults. The Preview guide will use generic, idempotent example names and explain how to create new characters, poll completion, securely retrieve each short-lived `promptImageUri` without logging its query string, visually approve the exact output, replace the matching card asset, configure the three server-owned character settings, rebuild, deploy, and verify card/live-face/voice alignment.

The guide and guarded helper will cover both supported paths accurately:

- **AI-generated-image path:** no external portrait upload; use synthetic prompt text, direct neutral framing, unobstructed mouth, non-graphic illness cues, age/diversity requirements, no named or real person, no logos/text/devices, and one distinct character per scenario.
- **External-image path:** requires the service's real data asset and consent workflow. The accelerator will not automate around consent, upload the prototype JPEGs, or represent an external image as consent-exempt.

Custom Photo Avatar remains Limited Access Preview even after account approval. The repository will not claim GA status, production readiness, independent lip-sync validation, or real-person likeness.

## 7. Provisioning Inventory and Capacity Boundary

No Azure deployment is part of this task, so no target subscription exists against which quota can be truthfully queried. The table contains no unresolved values: capacity is explicitly **not evaluated** for repository preparation and is a mandatory deployer preflight before `azd provision`.

| Resource type | Template count | Total after this task | Limit/quota for this task | Notes |
| --- | ---: | --- | --- | --- |
| `Microsoft.Resources/resourceGroups` | 1 | 0 | Not applicable | Bicep template only; no deployment |
| `Microsoft.Web/serverfarms` | 1 | 0 | Not evaluated | Deployer must verify selected Linux SKU availability in the selected region |
| `Microsoft.Web/sites` | 1 | 0 | Not evaluated | Same-origin web application |
| `Microsoft.OperationalInsights/workspaces` | 1 | 0 | Not evaluated | Workspace-based monitoring |
| `Microsoft.Insights/components` | 1 | 0 | Not evaluated | Application Insights |
| `Microsoft.CognitiveServices/accounts` | 1 | 0 | Not evaluated | Deployer must verify region and account quota |
| `Microsoft.Authorization/roleAssignments` | 3 | 0 | Not applicable | Two deterministic Foundry-resource assignments and one Application Insights telemetry assignment |

**Capacity status:** Not executed by design because the deliverable is a subscription-neutral public template and no resources will be provisioned. Native Voice Live models are fully managed and require no deployment capacity reservation. `docs/deployment.md` and the preflight script will require deployers to confirm subscription, policy, region, App Service workers, provider registration, Voice Live availability, and account quota before deployment. The default region and SKU are examples, not capacity guarantees.

## 8. Repository Layout and Files

```text
.
|-- .devcontainer/
|-- .github/
|   |-- ISSUE_TEMPLATE/
|   `-- workflows/ci.yml
|-- backend/
|   |-- app/
|   `-- tests/
|-- data/synthetic-conversation-reference.json
|-- docs/
|   |-- images/architecture/
|   |-- architecture.md
|   |-- custom-photo-avatar.md
|   |-- deployment.md
|   |-- operations.md
|   |-- security-and-privacy.md
|   `-- testing.md
|-- frontend/
|   |-- public/
|   `-- src/
|-- infra/
|   |-- main.bicep
|   |-- resources.bicep
|   `-- main.parameters.json
|-- scripts/
|   |-- custom-avatar/
|   |-- package.ps1
|   |-- run-mock.ps1
|   `-- test.ps1
|-- azure.yaml
|-- CODE_OF_CONDUCT.md
|-- CONTRIBUTING.md
|-- LICENSE
|-- README.md
|-- SECURITY.md
`-- SUPPORT.md
```

Additional public-repository conventions include `.gitignore`, `.gitattributes`, environment examples, Dependabot, bug/feature templates, a pull-request template, a Python 3.12 + Node + Azure CLI + `azd` dev container, pinned runtime dependencies, and original documentation tailored to this accelerator.

## 9. Implementation Sequence

### Phase 1: Planning

- [x] Analyze the validated prototype and public extraction boundary.
- [x] Analyze the reference accelerator's reusable conventions.
- [x] Select a cost-optimized, same-origin App Service architecture.
- [x] Resolve product name, repository layout, generic naming, runtime defaults, license, and asset policy.
- [x] Record the no-deployment capacity boundary with no placeholder values.
- [x] Obtain user approval for this finalized plan.

### Phase 2: Public Extraction

- [x] Copy only selected source, tests, synthetic corpus, and the three hash-approved generated PNGs.
- [x] Rename customer-specific UI/API/types/dataset identifiers and update tests atomically.
- [x] Preserve server-owned configuration, interruption, cleanup, privacy, readiness, and session-limit behavior.
- [x] Replace prototype infrastructure with generic environment-derived Bicep and a concise `azure.yaml`.
- [x] Add the guarded Custom Photo Avatar helper and detailed creation/provenance guide.
- [x] Create the Excalidraw source, SVG export, README architecture section, and detailed architecture document.
- [x] Add solution-accelerator documentation, community files, dev container, GitHub templates, CI, and Dependabot.

### Phase 3: Validation

- [x] Verify the three public PNG hashes, dimensions, metadata, generic filenames, and asset manifest.
- [x] Prove no original JPEG/V2 bytes or prohibited customer/deployment/private identifiers entered the target tree.
- [x] Run frontend lint, tests, and production build.
- [x] Run backend format check, lint, compile, and tests on Python 3.12.
- [x] Run package assembly and isolated-package smoke tests.
- [x] Build and lint every Bicep entry point; validate `azure.yaml` and package discovery without provisioning.
- [x] Check Markdown links, environment examples, licenses/notices, and deployment instructions from a clean clone perspective.
- [x] Run mock-mode browser acceptance at desktop and mobile sizes with no console errors, overflow, broken assets, or overlapping controls.
- [x] Update this plan to `Ready for Validation` and invoke `azure-validate`.
- [x] Complete subscription-dependent preview and policy validation without deploying or mutating Azure.

### Phase 4: Publication

- [ ] Review the complete staged diff and public credential/customer scan.
- [ ] Commit the validated accelerator to `main` with no generated deployment state.
- [ ] Push to `jaypadhya1605/Avatar-GPT-Realtime-Solution-Accelerator`.
- [ ] Set an accurate repository description and topics if GitHub CLI authentication permits.
- [ ] Verify the public GitHub tree and README links after push.

## 10. Azure Validation Checklist

- [x] All validation checks pass.
	- [x] Azure Developer CLI 1.27.1 is installed and authenticated.
	- [x] `azure.yaml` passes the official stable schema validator.
	- [x] The repository build and deployment package pass.
	- [x] No Docker or Aspire validation applies to this App Service source-package recipe.
	- [x] Required resource providers are registered.
	- [x] ARM provider preflight and policy evaluation pass with a quota-eligible App Service region.
	- [x] `azd provision --preview --no-prompt` succeeds and reports six creates with no deletes or modifications.
	- [x] The disposable local azd environment is removed after preview.

### Role Assignment Verification

- **Status:** Verified.
- **Identity:** The App Service system-assigned managed identity.
- **AI access:** `Cognitive Services User` and `Foundry User`, each scoped to the individual `AIServices` account.
- **Telemetry access:** `Monitoring Metrics Publisher`, scoped to the individual Application Insights resource.
- **Boundary:** No subscription- or resource-group-scoped runtime role, generic Owner/Contributor assignment, application secret, or browser credential is present.

## 11. Validation Proof

Validation is split between subscription-neutral repository checks and subscription-dependent Azure preview checks. No command in this proof provisioned, deployed, or modified an Azure resource.

| Check | Command/result | Status | Timestamp |
| --- | --- | --- | --- |
| Planning integrity | Final plan contains no unresolved decision or quota placeholder | Pass | 2026-07-20T09:51:18-04:00 |
| Voice Live contract research | Microsoft Learn confirms native models are fully managed; `eastus2` supports `gpt-realtime-1.5` and Custom Photo Avatar creation; API reference requires Cognitive Services User and Azure AI/Foundry User | Pass | 2026-07-20 |
| Clean bootstrap | `scripts/bootstrap.ps1 -Recreate` recreated Python 3.12 and installed locked Python/npm dependencies through a short Windows drive mapping | Pass | 2026-07-20T10:53:00-04:00 |
| Backend gate | Ruff format/lint, compileall, and 30 Pytest tests | Pass | 2026-07-20T11:06:53-04:00 |
| Frontend gate | Oxlint, 24 Vitest tests, TypeScript, and Vite production build | Pass | 2026-07-20T11:06:53-04:00 |
| Synthetic assets | Manifest policy, three PNG signatures, dimensions, byte counts, and SHA-256 values verified | Pass | 2026-07-20T11:06:53-04:00 |
| Public-content gate | 31 local Markdown targets resolve; privacy scan passed across 86 publishable text files including JavaScript, SVG, and Excalidraw; no JPEG assets found | Pass | 2026-07-20T11:19:22-04:00 |
| PowerShell and metadata | All repository PowerShell scripts parse; six YAML and four key JSON files parse | Pass | 2026-07-20 |
| Infrastructure static gate | Both Bicep entry points lint; subscription template compiles; official azd schema validation passes | Pass | 2026-07-20T11:08:17-04:00 |
| Package gate | `scripts/package.ps1` built the artifact, scanned all 19 packaged text files including compiled JavaScript and CSS, and passed isolated health/config/scenario/SPA smoke checks | Pass | 2026-07-20T11:18:00-04:00 |
| Browser acceptance | Desktop 1440 x 900 and mobile 390 x 844 selection/conversation/report flows; three distinct portraits; interruption and report verified; no overflow, failed requests, bad responses, page errors, or console errors | Pass | 2026-07-20 |
| App Service quota discrimination | Co-located East US 2 preview identified selected-subscription Linux B1 worker quota of zero; direct validation passed with the existing App Service region parameter set to East US | Pass | 2026-07-20 |
| Azure readiness | Preflight and `azd package` pass; official `azd provision --preview --no-prompt` succeeds with Foundry in East US 2 and App Service in East US, reporting six creates and no applied changes | Pass | 2026-07-20T11:16:35-04:00 |
| RBAC review | Three built-in role IDs resolve to the documented roles and target the web app system identity at individual resource scope | Pass | 2026-07-20T11:16:35-04:00 |

## 12. Safety and Change Boundary

- Do not run `azd up`, `azd provision`, `azd deploy`, ARM deployment, character creation, or any other Azure mutation.
- Do not modify either live prototype App Service or its resources.
- Do not delete or rewrite prototype files, characters, deployments, or rollback assets.
- Do not expose Azure credentials, signed query strings, tenant/subscription/resource IDs, private notes, prompts containing customer data, SDP/ICE/TURN payloads, raw media, or transcripts.
- Stop publication if any prohibited identifier, original reference image, unexplained binary, or failed release gate remains.

## 13. Approval

The user requested the public accelerator and authorized adapting the validated implementation. When asked to approve the finalized plan, the workspace returned: "The user is not available to respond and will review your work later. Work autonomously and make good decisions." This is treated as approval for local repository generation, validation, commit, and push to the named public repository. It does not authorize Azure deployment or modification of either live demo.