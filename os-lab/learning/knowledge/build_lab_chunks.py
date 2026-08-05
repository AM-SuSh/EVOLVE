"""Build inspectable Document and Chunk JSON for all selected Lab manuals."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import Counter
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

from chunk import chunk_document
from normalize import normalize_file


LAB_FILE_RE = re.compile(r"^lab([1-8])(?:[-_.].*)?\.md$", re.I)


def _write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _make_paths_portable(document: dict[str, Any], source_path: str) -> None:
    portable = source_path.replace("\\", "/")
    document.setdefault("metadata", {})["sourcePath"] = portable
    for item in document.get("blocks", []):
        locator = item.get("locator")
        if isinstance(locator, dict) and "path" in locator:
            locator["path"] = portable


def build_lab_manuals(
    workspace_root: Path,
    output_dir: Path,
    *,
    inventory_path: Path | None = None,
    policy_path: Path | None = None,
    target_chars: int = 1000,
    max_chars: int = 1400,
) -> dict[str, Any]:
    workspace_root = workspace_root.resolve()
    knowledge_root = workspace_root / "os-lab" / "learning" / "knowledge"
    inventory_path = inventory_path or knowledge_root / "sources.json"
    policy_path = policy_path or knowledge_root / "access-policy.json"
    inventory = _load_json(inventory_path)
    policy = _load_json(policy_path)
    document_validator = Draft202012Validator(_load_json(knowledge_root / "document-schema.json"))
    chunk_validator = Draft202012Validator(_load_json(knowledge_root / "chunk-schema.json"))

    source = next((item for item in inventory.get("sources", []) if item.get("id") == "platform-lab-manuals"), None)
    if not source:
        raise ValueError("sources.json does not define platform-lab-manuals")

    selected: list[tuple[int, str, Path]] = []
    for source_path in source.get("paths", []):
        path = workspace_root / source_path
        match = LAB_FILE_RE.match(path.name)
        if match:
            selected.append((int(match.group(1)), source_path, path))
    selected.sort(key=lambda item: item[0])
    if [item[0] for item in selected] != list(range(1, 9)):
        raise ValueError(f"expected exactly Lab1-Lab8 manuals, found {[item[0] for item in selected]}")

    entries: list[dict[str, Any]] = []
    build_fingerprint: list[str] = []
    for lab_number, source_path, input_path in selected:
        if not input_path.is_file():
            raise FileNotFoundError(input_path)
        lab_id = f"lab{lab_number}"
        document = normalize_file(input_path, "platform-lab-manuals")
        _make_paths_portable(document, source_path)
        document_validator.validate(document)
        chunk_set = chunk_document(document, policy=policy, target_chars=target_chars, max_chars=max_chars)
        chunk_validator.validate(chunk_set)

        document_file = Path("documents") / f"{lab_id}.document.json"
        chunk_file = Path("chunks") / f"{lab_id}.chunks.json"
        _write_json(output_dir / document_file, document)
        _write_json(output_dir / chunk_file, chunk_set)
        risks = Counter(item["answerRisk"] for item in chunk_set["chunks"])
        build_fingerprint.append(f"{lab_id}:{document['contentHash']}")
        entries.append({
            "labId": lab_id,
            "title": document["title"],
            "sourcePath": source_path.replace("\\", "/"),
            "documentFile": document_file.as_posix(),
            "chunkFile": chunk_file.as_posix(),
            "documentId": document["documentId"],
            "contentHash": document["contentHash"],
            "blockCount": len(document["blocks"]),
            "chunkCount": len(chunk_set["chunks"]),
            "totalChunkChars": sum(item["metadata"]["charCount"] for item in chunk_set["chunks"]),
            "contentClasses": sorted({item["contentClass"] for item in chunk_set["chunks"]}),
            "riskCounts": dict(sorted(risks.items())),
            "labScopes": sorted({scope for item in chunk_set["chunks"] for scope in item["labScope"]}),
        })

    build_id = hashlib.sha256("\n".join(build_fingerprint).encode("utf-8")).hexdigest()[:16]
    manifest = {
        "schemaVersion": 1,
        "buildId": f"lab-manuals:{build_id}",
        "sourceId": "platform-lab-manuals",
        "algorithm": "normalize-v1+section-aware-v1",
        "targetChars": target_chars,
        "maxChars": max_chars,
        "labCount": len(entries),
        "totalBlocks": sum(item["blockCount"] for item in entries),
        "totalChunks": sum(item["chunkCount"] for item in entries),
        "labs": entries,
    }
    _write_json(output_dir / "manifest.json", manifest)
    return manifest


def main() -> int:
    script_path = Path(__file__).resolve()
    default_workspace = script_path.parents[3]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace-root", type=Path, default=default_workspace)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--target-chars", type=int, default=1000)
    parser.add_argument("--max-chars", type=int, default=1400)
    args = parser.parse_args()
    output = args.output or args.workspace_root / "os-lab" / "learning" / "knowledge" / "build" / "lab-manuals"
    manifest = build_lab_manuals(
        args.workspace_root,
        output,
        target_chars=args.target_chars,
        max_chars=args.max_chars,
    )
    print(json.dumps({
        "ok": True,
        "buildId": manifest["buildId"],
        "labs": manifest["labCount"],
        "blocks": manifest["totalBlocks"],
        "chunks": manifest["totalChunks"],
        "manifest": (output / "manifest.json").resolve().as_posix(),
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
