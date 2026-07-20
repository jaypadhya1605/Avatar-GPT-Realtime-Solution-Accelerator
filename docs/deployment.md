# Deployment

The baseline deploys with Azure Developer CLI (`azd`) and Bicep. It uses GA Voice Live capabilities by default; Custom Photo Avatar remains disabled.

> [!IMPORTANT]
> Running `azd up` creates billable Azure resources. Review the Bicep files and your organization's policies before provisioning.

## Prerequisites

- An Azure subscription where you can create a resource group and the resources in [`infra/resources.bicep`](../infra/resources.bicep).
- Permission to create role assignments. `Owner` is sufficient; `Contributor` plus `Role Based Access Control Administrator` or `User Access Administrator` is also sufficient when scoped appropriately.
- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli), [Azure Developer CLI](https://learn.microsoft.com/azure/developer/azure-developer-cli/install-azd), PowerShell 7, Git, Python 3.12, and Node.js 20 or newer.
- A region that supports `gpt-realtime-1.5`. The default, `eastus2`, also supports Custom Photo Avatar creation at publication time. Recheck the [current Speech regions table](https://learn.microsoft.com/azure/ai-services/speech-service/regions?tabs=voice-live) before choosing another region.
- Linux B1 App Service worker quota in the selected App Service region. The App Service and Foundry regions may differ when quota or policy requires it; choose nearby regions to limit realtime latency.

The template does not require an Azure OpenAI deployment, model capacity reservation, Storage account, Key Vault, or application secret.

## Sign in

```powershell
az login
az account set --subscription "<subscription-id>"
azd auth login
```

Confirm that both tools target the intended tenant and subscription before continuing.

## Prepare the checkout

```powershell
git clone https://github.com/jaypadhya1605/Avatar-GPT-Realtime-Solution-Accelerator.git
Set-Location Avatar-GPT-Realtime-Solution-Accelerator
./scripts/bootstrap.ps1
./scripts/preflight.ps1
```

`preflight.ps1` runs the test, package, privacy, and Bicep checks, verifies both CLIs, and confirms that required resource providers are registered. It does not change Azure.

On Windows, use a short checkout path. Some Python wheels still fail under deeply nested paths even when Windows long-path support is enabled.

## Provision and deploy

Create an isolated `azd` environment and deploy:

```powershell
azd env new dev
azd env set AZURE_LOCATION eastus2
azd env set AZURE_APP_SERVICE_LOCATION eastus2
azd provision --preview
azd up
```

`AZURE_LOCATION` controls the Foundry account and monitoring region. `AZURE_APP_SERVICE_LOCATION` controls only the App Service plan and web app. If preview reports `InternalSubscriptionIsOverQuotaForSku`, request Linux B1 worker quota or select another approved App Service region; do not change the Foundry region unless Voice Live is supported there.

`azd up` performs these operations:

1. Packages the tested backend, frontend, synthetic corpus, and locked runtime dependencies into `artifacts/app`.
2. Creates a resource group, Linux App Service, Foundry `AIServices` account, Log Analytics workspace, and Application Insights resource.
3. Assigns `Cognitive Services User`, `Foundry User`, and `Monitoring Metrics Publisher` to the App Service managed identity at resource scope.
4. Deploys the package to App Service.

No credential is written to the browser or repository. The deployment creates one App Service instance and public service endpoints; review [Security and privacy](security-and-privacy.md) before broader use.

## Verify

```powershell
$uri = azd env get-value SERVICE_WEB_URI
Invoke-RestMethod "$uri/healthz"
Invoke-RestMethod "$uri/readyz"
Start-Process $uri
```

Both probes should return `status: ok` or `status: ready`. App Service may need several minutes after its first package deployment. In the application, verify all three scenarios, microphone permission, two-way audio, barge-in, transcript capture, and report generation.

## Later updates

Use `azd deploy` for application-only changes. Use `azd provision` after Bicep changes, followed by `azd deploy` if the package also changed. Run `./scripts/preflight.ps1` first in both cases.

## Optional Preview

The baseline shows each synthetic patient with a distinct local portrait animated from GA viseme events. Custom Photo Avatar is a separate **Limited Access Preview** and requires three tenant-owned character names. Follow [Custom Photo Avatar](custom-photo-avatar.md) only after the GA deployment is healthy.

## Cleanup

Export any intentionally persisted results first, then delete the isolated environment:

```powershell
azd down --purge
```

Review the confirmation carefully. The command deletes the resource group and its contents. It does not delete separately created Custom Photo Avatar assets or a separately created Foundry project; remove those through their owning resource after checking retention requirements.