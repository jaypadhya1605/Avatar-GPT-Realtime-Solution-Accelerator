from __future__ import annotations

import hashlib
import json
import struct
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "frontend" / "src" / "assets" / "personas"
MANIFEST_PATH = ASSET_DIR / "manifest.json"
EXPECTED_SCENARIOS = {"SCN-001", "SCN-002", "SCN-003"}
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def main() -> int:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    if manifest.get("schemaVersion") != "1.0":
        raise ValueError("Unsupported asset manifest schema.")

    policy = manifest.get("policy", {})
    required_policy = {
        "syntheticOnly": True,
        "containsCustomerData": False,
        "containsRealPeople": False,
        "approvedForPublicDistribution": True,
    }
    if policy != required_policy:
        raise ValueError(
            "Asset policy must explicitly permit only public synthetic data."
        )

    assets = manifest.get("assets")
    if not isinstance(assets, list) or len(assets) != 3:
        raise ValueError("The manifest must contain exactly three portraits.")

    declared_files: set[str] = set()
    declared_scenarios: set[str] = set()
    for asset in assets:
        file_name = asset.get("file", "")
        if Path(file_name).name != file_name or not file_name.endswith(".png"):
            raise ValueError(f"Invalid asset path: {file_name!r}")
        if file_name in declared_files:
            raise ValueError(f"Duplicate asset: {file_name}")
        declared_files.add(file_name)
        declared_scenarios.add(asset.get("scenarioId", ""))

        path = ASSET_DIR / file_name
        data = path.read_bytes()
        if data[:8] != PNG_SIGNATURE or data[12:16] != b"IHDR":
            raise ValueError(f"Not a valid PNG: {file_name}")
        width, height = struct.unpack(">II", data[16:24])
        actual = {
            "mediaType": "image/png",
            "width": width,
            "height": height,
            "bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest(),
        }
        for key, value in actual.items():
            if asset.get(key) != value:
                raise ValueError(f"Asset {file_name} has an invalid {key} value.")
        if "synthetic" not in asset.get("provenance", "").lower():
            raise ValueError(f"Asset {file_name} lacks synthetic provenance.")

    actual_files = {path.name for path in ASSET_DIR.glob("*.png")}
    if actual_files != declared_files:
        raise ValueError("PNG files and the asset manifest do not match.")
    if declared_scenarios != EXPECTED_SCENARIOS:
        raise ValueError("Each public scenario must have one declared portrait.")

    print("Synthetic asset manifest verified.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
