"""Build a reproducible multi-source knowledge manifest.

The existing Lab-manual builder remains the authoritative path for the eight
manuals.  This builder handles the remaining inventory entries and emits one
manifest that the SQLite store can ingest without losing source identity.
"""

from __future__ import annotations

import argparse
import fnmatch
import hashlib
import json
import re
import shutil
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

from chunk import chunk_document
from normalize import normalize_file
from quality_filter import filter_chunk_set, filter_document


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def source_title(item: dict[str, Any]) -> str:
    return str(item.get("title") or item.get("id") or "knowledge source")


def portable(path: Path, workspace: Path) -> str:
    try:
        return path.resolve().relative_to(workspace.resolve()).as_posix()
    except ValueError:
        return path.as_posix().replace("\\", "/")


def lab_from_path(path: str) -> str | None:
    match = re.search(r"(?:^|/)lab([1-8])(?:/|-|_|\.|$)", path, re.I)
    return f"lab{match.group(1)}" if match else None


def selected_paths(item: dict[str, Any], workspace: Path) -> list[Path]:
    if item.get("paths"):
        return [workspace / str(value) for value in item["paths"]]
    # Remote sources are only built from an explicit, reviewable local
    # snapshot. Never recurse from workspace root when a URL has no snapshot.
    snapshot_root = workspace / "os-lab" / "learning" / "knowledge" / "build" / "snapshots" / str(item.get("id", ""))
    if not item.get("path") and not snapshot_root.is_dir():
        return []
    root = workspace / str(item.get("path", "")) if item.get("path") else snapshot_root
    patterns = [str(value) for value in item.get("includePatterns", [])]
    excludes = [str(value) for value in item.get("excludePatterns", [])]
    if not root.is_dir():
        return []
    result: list[Path] = []
    remote = not item.get("path") and not item.get("paths")
    remote_suffixes = {".md", ".markdown", ".html", ".htm", ".rst", ".pdf"}
    for candidate in root.rglob("*"):
        if not candidate.is_file():
            continue
        suffix = candidate.suffix.lower()
        if remote and suffix not in remote_suffixes:
            continue
        if not remote and suffix not in {".md", ".markdown", ".html", ".htm", ".json", ".yaml", ".yml", ".txt", ".pdf", ".epub", ".docx"}:
            continue
        relative = candidate.relative_to(root).as_posix()
        if patterns and not any(fnmatch.fnmatch(relative, pattern) for pattern in patterns):
            continue
        if any(fnmatch.fnmatch(relative, pattern) for pattern in excludes):
            continue
        result.append(candidate)
    return sorted(result)


def build_sources(workspace: Path, output: Path, *, target_chars: int = 1000, max_chars: int = 1400) -> dict[str, Any]:
    knowledge_root = workspace / "os-lab" / "learning" / "knowledge"
    inventory = json.loads((knowledge_root / "sources.json").read_text(encoding="utf-8"))
    policy = json.loads((knowledge_root / "access-policy.json").read_text(encoding="utf-8"))
    document_validator = Draft202012Validator(json.loads((knowledge_root / "document-schema.json").read_text(encoding="utf-8")))
    chunk_validator = Draft202012Validator(json.loads((knowledge_root / "chunk-schema.json").read_text(encoding="utf-8")))
    output = output.resolve()
    if output.exists():
        if output == workspace.resolve() or len(output.parts) < 4:
            raise ValueError(f"unsafe build output: {output}")
        shutil.rmtree(output)
    entries: list[dict[str, Any]] = []
    fingerprint: list[str] = []

    for item in inventory.get("sources", []):
        source_id = str(item.get("id"))
        if source_id == "platform-lab-manuals":
            continue
        files = selected_paths(item, workspace)
        source_output = output / source_id
        documents: list[dict[str, Any]] = []
        source_seen_chunks: set[str] = set()
        source_quality = {"inputBlocks": 0, "keptBlocks": 0, "droppedBlocks": 0, "inputChunks": 0, "keptChunks": 0, "droppedChunks": 0}
        for index, input_path in enumerate(files):
            if not input_path.is_file() or not input_path.suffix:
                continue
            try:
                document = normalize_file(
                    input_path,
                    source_id,
                    title=None,
                    source_url=item.get("url"),
                )
            except Exception as error:
                # Keep a deterministic build report instead of silently
                # dropping a malformed file; the source can be reviewed in UI.
                documents.append({"sourcePath": portable(input_path, workspace), "error": str(error)})
                continue
            source_path = portable(input_path, workspace)
            document.setdefault("metadata", {})["sourcePath"] = source_path
            for block in document.get("blocks", []):
                locator = block.get("locator")
                if isinstance(locator, dict) and "path" in locator:
                    locator["path"] = source_path
            if source_id == "platform-published-catalog":
                document["blocks"] = []
                document["metadata"]["blockCount"] = 0
                block_quality = {"inputBlocks": 1, "keptBlocks": 0, "droppedBlocks": 1, "reasons": {"system-metadata-not-rag": 1}}
            else:
                document, block_quality = filter_document(document)
            document_validator.validate(document)
            raw_chunk_set = chunk_document(document, policy=policy, target_chars=target_chars, max_chars=max_chars)
            chunk_set, chunk_quality = filter_chunk_set(raw_chunk_set, source_id, source_seen_chunks)
            chunk_validator.validate(chunk_set)
            chunk_content_hash = hashlib.sha256(
                json.dumps(chunk_set, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
            ).hexdigest()
            for key in ("inputBlocks", "keptBlocks", "droppedBlocks"):
                source_quality[key] += int(block_quality.get(key, 0))
            for key in ("inputChunks", "keptChunks", "droppedChunks"):
                source_quality[key] += int(chunk_quality.get(key, 0))
            stem = re.sub(r"[^A-Za-z0-9_.-]+", "_", input_path.stem)[:80] or f"document-{index}"
            document_file = Path("documents") / f"{index:04d}-{stem}.document.json"
            chunk_file = Path("chunks") / f"{index:04d}-{stem}.chunks.json"
            write_json(source_output / document_file, document)
            write_json(source_output / chunk_file, chunk_set)
            documents.append({
                "documentFile": document_file.as_posix(),
                "chunkFile": chunk_file.as_posix(),
                "documentId": document["documentId"],
                "contentHash": document["contentHash"],
                "chunkContentHash": chunk_content_hash,
                "sourcePath": source_path,
                "title": document["title"],
                "blockCount": len(document["blocks"]),
                "chunkCount": len(chunk_set["chunks"]),
                "quality": {"blocks": block_quality, "chunks": chunk_quality},
            })
            fingerprint.append(f"{source_id}:{document['contentHash']}:{chunk_content_hash}")
        source_status = "published" if documents and not any("error" in doc for doc in documents) else "pending-review"
        entries.append({
            "id": source_id,
            "title": source_title(item),
            "sourceType": item.get("sourceType", "local-files"),
            "authorityRank": item.get("priority", 0),
            "defaultClass": next((b.get("defaultClass") for b in policy.get("sourceBindings", []) if b.get("sourceId") == source_id), "student-safe"),
            "originalUri": item.get("url", ""),
            "status": source_status,
            "documents": documents,
            "quality": source_quality,
            "notes": item.get("notes", ""),
        })

    build_id = hashlib.sha256("\n".join(sorted(fingerprint)).encode("utf-8")).hexdigest()[:16]
    manifest = {
        "schemaVersion": 1,
        "buildId": f"knowledge-sources:{build_id}",
        "algorithm": "normalize-v1+semantic-quality-v2+section-aware-v1",
        "targetChars": target_chars,
        "maxChars": max_chars,
        "sources": entries,
    }
    write_json(output / "manifest.json", manifest)
    return manifest


def main() -> int:
    script = Path(__file__).resolve()
    workspace = script.parents[3]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace-root", type=Path, default=workspace)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--target-chars", type=int, default=1000)
    parser.add_argument("--max-chars", type=int, default=1400)
    args = parser.parse_args()
    output = args.output or args.workspace_root / "os-lab" / "learning" / "knowledge" / "build" / "knowledge-sources"
    manifest = build_sources(args.workspace_root, output, target_chars=args.target_chars, max_chars=args.max_chars)
    print(json.dumps({
        "ok": True,
        "buildId": manifest["buildId"],
        "sources": len(manifest["sources"]),
        "documents": sum(len(item["documents"]) for item in manifest["sources"]),
        "chunks": sum(doc.get("chunkCount", 0) for item in manifest["sources"] for doc in item["documents"]),
        "manifest": (output / "manifest.json").resolve().as_posix(),
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
