import hashlib
import json
from datetime import UTC, datetime
from uuid import uuid4

from azure.identity.aio import DefaultAzureCredential
from azure.storage.blob.aio import BlobServiceClient

from .visitors import VisitorIdentity
from .models import SanitizedResultRequest, SanitizedResultResponse
from .settings import Settings


async def save_sanitized_result(
    request: SanitizedResultRequest,
    visitor: VisitorIdentity,
    settings: Settings,
) -> SanitizedResultResponse:
    if not settings.persist_results or not settings.azure_storage_account_url:
        return SanitizedResultResponse(saved=False)

    result_id = str(uuid4())
    pseudonym = hashlib.sha256(
        f"{visitor.namespace}:{visitor.subject}".encode()
    ).hexdigest()[:24]
    payload = request.model_dump()
    payload.update(
        {
            "resultId": result_id,
            "pseudonymousUser": pseudonym,
            "savedAt": datetime.now(UTC).isoformat(),
        }
    )
    credential = DefaultAzureCredential(
        exclude_interactive_browser_credential=True,
        exclude_shared_token_cache_credential=True,
    )
    try:
        async with BlobServiceClient(
            settings.azure_storage_account_url, credential=credential
        ) as service:
            blob = service.get_blob_client(
                container=settings.azure_result_container,
                blob=f"{datetime.now(UTC):%Y/%m/%d}/{result_id}.json",
            )
            await blob.upload_blob(
                json.dumps(payload, separators=(",", ":")),
                overwrite=False,
                content_type="application/json",
            )
    finally:
        await credential.close()
    return SanitizedResultResponse(saved=True, resultId=result_id)
