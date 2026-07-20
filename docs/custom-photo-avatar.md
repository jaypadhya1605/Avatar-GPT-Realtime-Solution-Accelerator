# Custom Photo Avatar

> [!CAUTION]
> Custom Photo Avatar is a **Limited Access Preview**. It is disabled by default, is not required for the accelerator, and is subject to Microsoft eligibility, approved-use, consent, disclosure, regional availability, and responsible AI requirements. Preview behavior and availability can change without the guarantees of a GA service.

The supported default experience uses GA Voice Live neural audio and viseme events to animate the three packaged synthetic portraits locally. Complete and validate that path before enabling this Preview.

## What this integration uses

- Avatar type: `photo-avatar`
- Base model: `vasa-1`
- Character: one tenant-owned custom character name per scenario
- Customized flag: `true`
- Output: receive-only WebRTC, H.264, 512 x 512
- Signaling: bounded SDP and short-lived ICE configuration relayed by FastAPI
- Authentication: App Service managed identity; no browser credential or signed URL

The Voice Live model itself remains `gpt-realtime-1.5`. Neither the Voice Live model nor the completed photo avatar requires a deployment or capacity reservation.

## 1. Request Limited Access

Read the [Limited Access terms](https://learn.microsoft.com/azure/ai-services/speech-service/text-to-speech/limited-access) and submit the [Speech Limited Access intake form](https://aka.ms/customneural). Access is restricted by eligibility and approved use case. Do not proceed until the intended subscription and resource are enabled.

The production experience must disclose that the avatar is synthetic and provide a feedback/reporting channel. Do not use an avatar outside the use case Microsoft approved.

## 2. Confirm region support

The Foundry account used by this accelerator and the project used to create the avatar must support both Voice Live and Custom Photo Avatar creation. `eastus2`, the template default, supports both at publication time. Verify the current [Voice Live and avatar region tables](https://learn.microsoft.com/azure/ai-services/speech-service/regions) before creating resources.

## 3. Create a Foundry project

The minimal Bicep baseline creates a Foundry `AIServices` account but deliberately does not create a project. In the [Microsoft Foundry portal](https://ai.azure.com/), create or select a project associated with that account. Keep the **New Foundry** experience enabled.

The project is needed for the creation workflow only. It does not change this application's runtime endpoint or add a model deployment.

## 4. Prepare each image

For a public accelerator, prefer an AI-generated fictional character created inside the Foundry workflow. Create a visibly distinct character for each scenario and keep generation prompts free of customer, patient, or employee information.

Microsoft's current image guidance is:

- frame the character from the shoulders up;
- use a realistic human or virtual-human face, not exaggerated cartoon proportions;
- show the full head facing forward;
- keep the face visible without shadows or occlusion;
- avoid elaborate accessories and jewelry.

For a real person's photo, obtain explicit permission and record the same person reading Microsoft's predefined consent statement. Microsoft validates the statement and compares the face in the video with the submitted photo. Use the current statement linked from the [official creation guide](https://learn.microsoft.com/azure/ai-services/speech-service/text-to-speech-avatar/custom-photo-avatar-create); do not improvise it.

Never commit source photos, consent recordings, portal exports, character names, or service URLs to this repository. The checked-in PNG portraits are synthetic UI assets, not Custom Photo Avatar source or consent artifacts.

## 5. Create three characters

Repeat this process once for each scenario:

1. In Foundry, select **Build**.
2. Select **Fine-tune** and then **AI Services**.
3. Select **Fine-tune**.
4. Choose **Azure Speech - Text to Speech Avatar**.
5. Choose **Photo avatar** as the type.
6. Enter a unique character name and an optional description, then select **Next**.
7. Select **Create with AI** for a fictional character, or **Existing data** to upload an approved image.
8. For a real-person image, upload the required consent video from that same person.
9. Review the details and acknowledgment, then select **Submit**.
10. Wait for the fine-tuning job to show **Succeeded**, open it, and inspect the preview.

Although the portal places this workflow under **Fine-tune**, a Custom Photo Avatar is created from one image. This is not Custom Video Avatar training and does not use training footage.

Record the three resulting character names in an approved private operator location. The names are runtime configuration, not repository defaults.

## 6. Test in Foundry

From each completed avatar, select **Try Voice Live**, or open the **Azure-Speech-Voice-Live** model playground from **Discover** > **Models**. Confirm identity, framing, speech synchronization, and suitability before attaching the character to this application.

## 7. Enable the application

Use the deployed application's active `azd` environment. The helper writes directly to App Service settings, suppresses the returned settings document, restarts the app, and does not write character names to repository or `azd` environment files.

```powershell
./scripts/custom-avatar/configure.ps1 `
  -Scenario001Character "<scenario-001-character>" `
  -Scenario002Character "<scenario-002-character>" `
  -Scenario003Character "<scenario-003-character>"
```

For a non-default environment, add `-Environment <azd-environment-name>`. Use `-WhatIf` to preview the target operation without changing Azure.

Wait for the restart, then verify:

```powershell
$uri = azd env get-value SERVICE_WEB_URI
Invoke-RestMethod "$uri/readyz"
```

`/readyz` returns `503` while Preview is enabled but any one of the three character settings is empty.

## 8. Validate every scenario

Open each scenario in a fresh session and confirm:

- the patient identity matches the selected card;
- the face is not reused across scenarios;
- audio and video remain synchronized;
- interruption stops current playback and allows the learner to speak;
- video does not cover controls or transcript content at desktop or mobile widths;
- a failed Preview connection produces a bounded error and does not expose SDP, ICE credentials, an endpoint, or Azure service details.

Test in a browser with H.264 WebRTC support and on the actual enterprise network. TURN, firewall, and media policies can differ from ordinary HTTPS access.

## Disable and roll back

Restore the GA local-portrait path and clear all three character settings:

```powershell
./scripts/custom-avatar/configure.ps1 -Disable
```

This is the preferred operational rollback. It does not delete the Custom Photo Avatar assets in Foundry. Manage deletion separately after confirming legal and retention requirements.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Creation controls are unavailable | Limited Access approval, selected tenant/subscription, project-to-account association, and supported region |
| Fine-tuning job fails | Image composition, real-person consent statement, face match, and portal job details |
| `/readyz` returns `503` | All three character names are present and the enable flag is valid |
| Voice works but video does not | H.264 support, WebRTC/UDP/TURN policy, browser console, and App Service logs |
| Wrong character appears | Scenario-to-character mapping in App Service settings; disable immediately if identity is uncertain |

Use the [official Custom Photo Avatar creation guide](https://learn.microsoft.com/azure/ai-services/speech-service/text-to-speech-avatar/custom-photo-avatar-create) and [Voice Live avatar configuration](https://learn.microsoft.com/azure/ai-services/speech-service/voice-live-how-to#azure-text-to-speech-avatar) as the source of truth when Preview behavior changes.