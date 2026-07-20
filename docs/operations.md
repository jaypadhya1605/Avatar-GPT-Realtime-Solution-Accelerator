# Operations

## Health and readiness

- `/healthz` confirms that the FastAPI process is responding.
- `/readyz` confirms that required Azure configuration and the packaged grounding corpus are available. It does not open a billable Voice Live session.

```powershell
$uri = azd env get-value SERVICE_WEB_URI
Invoke-RestMethod "$uri/healthz"
Invoke-RestMethod "$uri/readyz"
```

Use `/healthz` as the App Service health-check path. Use `/readyz` after configuration changes and before a workshop.

## Workshop checklist

1. Run the full local checks and deploy only the resulting package.
2. Confirm both probes and load the app in the target browser/network.
3. Start every scenario and confirm its portrait, voice, opening state, interruption, and report.
4. Confirm the microphone permission prompt and use headphones where possible.
5. Keep one operator signed in to Azure Monitor and one rollback operator available.
6. Remind participants to use synthetic role-play only and not enter real patient data.
7. End abandoned sessions; the server releases reservations on disconnect and caps sessions at 15 minutes by default.

For Custom Photo Avatar, also run the Preview checklist in [Custom Photo Avatar](custom-photo-avatar.md). Disable Preview before the event if any one character or network path is unreliable.

## Logs and telemetry

Application Insights receives Entra-authenticated OpenTelemetry from the web app. Use it for request rate, failures, dependencies, and latency. App Service platform logs are retained for seven days by the template.

Stream App Service logs during an incident:

```powershell
$resourceGroup = azd env get-value AZURE_RESOURCE_GROUP
$webApp = azd env get-value SERVICE_WEB_NAME
az webapp log tail --resource-group $resourceGroup --name $webApp
```

The application deliberately returns generic Voice Live errors to the browser. Correlate the failure time with server exceptions without logging transcript, audio, character names, SDP, or ICE credentials.

## Session controls

The single-process limiter enforces:

- one active realtime session per visitor;
- 10 starts per visitor per 15 minutes;
- 50 starts per observed network per 15 minutes;
- a 15-minute default maximum session duration.

These are guardrails, not strong identity controls. Do not scale beyond one instance until limiter and active-session state move to a shared store. Revisit limits based on approved capacity, expected concurrency, and cost.

## Releases and rollback

Run `./scripts/preflight.ps1` before every release. `azd deploy` packages the current checkout through the `prepackage` hook and deploys it to the active environment.

Keep the previous tested commit available. To roll back application code, check out that commit in a clean worktree, rerun preflight, and run `azd deploy`. To roll back Custom Photo Avatar immediately:

```powershell
./scripts/custom-avatar/configure.ps1 -Disable
```

Infrastructure changes should be reviewed with `azd provision --preview` before `azd provision`. Do not mix unrelated infrastructure and application changes in an emergency rollback.

## Cost controls

The baseline limits Log Analytics ingestion to 1 GB per day, retains logs for 30 days, and uses one B1 App Service instance. Voice Live and avatar usage remain consumption-based. Configure Azure budgets and alerts outside this template, monitor session volume, and delete unused environments.

## Optional result storage

Persistence is disabled and no Storage account is provisioned. The bring-your-own extension is described in [Security and privacy](security-and-privacy.md). Establish ownership, retention, deletion, access review, and export procedures before enabling it.

## Cleanup

Use `azd down --purge` only after confirming the active environment and exporting data that must be retained. Separately created Foundry projects and Custom Photo Avatar assets may have a different lifecycle and must be reviewed independently.