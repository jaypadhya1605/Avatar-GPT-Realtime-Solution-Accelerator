# Security policy

## Supported version

Security fixes are applied to the current `main` branch. This demonstration accelerator does not maintain long-term support branches.

## Report a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/jaypadhya1605/Avatar-GPT-Realtime-Solution-Accelerator/security/advisories/new). Do not open a public issue.

Include a concise impact statement, affected commit, synthetic reproduction steps, and a suggested mitigation when available. Never include a live credential, patient or personal data, source photo, consent artifact, tenant character name, signed URL, private endpoint, full SDP/ICE payload, or customer deployment identifier. Redact sensitive values and state what was removed.

Allow the maintainer time to reproduce and remediate the issue before public disclosure. Azure platform vulnerabilities and active service incidents should also be reported through the appropriate [Microsoft Security Response Center](https://msrc.microsoft.com/report) or [Azure Support](https://azure.microsoft.com/support/options/) channel.

## Scope reminders

The public baseline is an unauthenticated, single-instance workshop application with public network access. Those documented architecture limits are not themselves vulnerabilities. Credential exposure, cross-scenario data access, origin bypass, unsafe protocol handling, sensitive logging, dependency compromise, or an undocumented privacy failure are in scope.