# Architecture

![Solution architecture](images/architecture/solution-architecture.svg)

The editable source is [`solution-architecture.excalidraw`](images/architecture/solution-architecture.excalidraw). Open it with the [Microsoft internal Excalidraw instance](https://aka.ms/excalidraw).

## Runtime path

1. The browser loads the React SPA from the same FastAPI origin and obtains a server-issued, HTTP-only visitor cookie.
2. The browser captures 24 kHz PCM16 microphone audio with an AudioWorklet and opens `/api/voice-live` over the same origin.
3. FastAPI validates the origin, browser cookie, scenario, difficulty, message sizes, active-session state, and rate limits.
4. FastAPI retrieves at most three records from the packaged, scenario-isolated synthetic corpus and constructs the server-owned prompt.
5. App Service uses its system-assigned managed identity to connect to the fully managed Voice Live `gpt-realtime-1.5` model. No key, browser token, model deployment, or capacity reservation is used.
6. Voice Live returns transcript, PCM16 audio, and viseme events. The browser schedules the audio and local portrait motion on one playback timeline.
7. After the session, FastAPI produces deterministic coaching from bounded transcript and interaction evidence. No LLM evaluates the learner.

## Preview path

Custom Photo Avatar is a separate **Limited Access Preview**. When explicitly enabled, the Voice Live session asks for a customized `photo-avatar` using `vasa-1` and receive-only WebRTC H.264 video at 512 x 512. The server relays bounded SDP/ICE signaling; the browser never selects the character or receives an Azure credential.

The GA-default local portrait path remains functional without Preview approval and is restored by disabling one app setting. See [Custom Photo Avatar](custom-photo-avatar.md).

## Trust boundaries

| Boundary | Controls |
| --- | --- |
| Browser to App Service | HTTPS/WSS, strict same-origin WebSocket check, HTTP-only SameSite cookie, bounded JSON and binary frames, CSP and Permissions Policy |
| App Service to Foundry | `DefaultAzureCredential`, system-assigned identity, resource-scoped `Cognitive Services User` and `Foundry User`, server-owned endpoint/model/prompt/voice/avatar configuration |
| App Service to Azure Monitor | Entra-authenticated OpenTelemetry ingestion, `Monitoring Metrics Publisher` scoped to Application Insights, local authentication disabled |
| Packaged data | Versioned synthetic JSON corpus and three hash-pinned synthetic PNG portraits; no customer or real-patient records |

## Provisioned resources

The baseline creates one resource group containing:

- one Linux Python 3.12 App Service plan and web app;
- one `AIServices` Foundry account;
- one Log Analytics workspace and workspace-based Application Insights resource;
- three deterministic, resource-scoped RBAC assignments.

It deliberately does not create a Foundry project, model deployment, Storage account, Key Vault, container registry, or private network. Optional sanitized-result persistence is a bring-your-own extension described in [Operations](operations.md).

## Scaling assumptions

The in-memory limiter permits one active session per visitor, 10 starts per visitor per 15 minutes, and 50 starts per observed network per 15 minutes. The baseline uses one App Service instance and is intended for workshops and demonstrations. Horizontal scale requires a distributed limiter and shared session coordination before it is safe.