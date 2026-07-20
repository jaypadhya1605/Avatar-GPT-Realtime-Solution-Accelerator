from __future__ import annotations

import re
from pathlib import Path
from urllib.parse import unquote


ROOT = Path(__file__).resolve().parents[1]
EXCLUDED_PARTS = {
    ".git",
    ".venv",
    "artifacts",
    "dist",
    "node_modules",
}
LINK_PATTERN = re.compile(r"!?(?:\[[^\]]*\])\(([^)]+)\)")
EXTERNAL_PREFIXES = ("http://", "https://", "mailto:")


def markdown_files() -> list[Path]:
    return sorted(
        path
        for path in ROOT.rglob("*.md")
        if not EXCLUDED_PARTS.intersection(path.relative_to(ROOT).parts)
    )


def local_target(raw_target: str) -> str | None:
    target = raw_target.strip()
    if target.startswith("<") and ">" in target:
        target = target[1 : target.index(">")]
    elif " " in target:
        target = target.split(" ", 1)[0]
    target = unquote(target).split("#", 1)[0]
    if not target or target.startswith("#") or target.startswith(EXTERNAL_PREFIXES):
        return None
    return target


def main() -> int:
    failures: list[str] = []
    checked = 0
    for markdown in markdown_files():
        content = markdown.read_text(encoding="utf-8")
        for match in LINK_PATTERN.finditer(content):
            target = local_target(match.group(1))
            if target is None:
                continue
            checked += 1
            candidate = (
                ROOT / target.lstrip("/")
                if target.startswith("/")
                else markdown.parent / target
            ).resolve()
            if ROOT not in candidate.parents and candidate != ROOT:
                failures.append(
                    f"{markdown.relative_to(ROOT)}: target leaves repository: {target}"
                )
            elif not candidate.exists():
                failures.append(
                    f"{markdown.relative_to(ROOT)}: missing local target: {target}"
                )

    if failures:
        raise SystemExit("\n".join(failures))
    print(f"Documentation links verified: {checked} local targets.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())