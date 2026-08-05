"""Build deterministic, chapter-aware chunks from normalized Documents."""

from __future__ import annotations

import argparse
import fnmatch
import hashlib
import json
import re
from pathlib import Path
from typing import Any, Iterable


SCHEMA_VERSION = 1
CONTENT_CLASSES = {"student-safe", "guided-hint", "teacher-only", "system-metadata"}
RISK_TERMS = re.compile(r"(参考答案|完整实现|可直接提交|answer|solution|patch|teacher.?acceptance|验收资料)", re.I)
LAB_RE = re.compile(r"(?:^|[/\\])lab([1-8])(?:[/\\]|[-_.]|$)", re.I)


def _path_key(value: str) -> str:
    normalized = str(value).replace("\\", "/")
    marker = normalized.lower().find("os-lab/")
    return normalized[marker:] if marker >= 0 else normalized


def _load_policy(policy: dict[str, Any] | None, source_id: str, source_path: str) -> tuple[str, bool, str]:
    binding = next((item for item in (policy or {}).get("sourceBindings", []) if item.get("sourceId") == source_id), {})
    content_class = binding.get("defaultClass", "student-safe")
    path_key = _path_key(source_path)
    for override in binding.get("pathOverrides", []):
        pattern = str(override.get("pattern", "")).replace("\\", "/")
        if pattern and (fnmatch.fnmatch(path_key.lower(), pattern.lower()) or fnmatch.fnmatch(path_key.lower(), f"*/{pattern.lower()}")):
            content_class = override.get("contentClass", content_class)
            break

    blocked = False
    for pattern in (policy or {}).get("hardDenyPaths", []):
        pattern = str(pattern).replace("\\", "/")
        if fnmatch.fnmatch(path_key.lower(), pattern.lower()) or fnmatch.fnmatch(path_key.lower(), f"*/{pattern.lower()}"):
            blocked = True
            break
    if content_class not in CONTENT_CLASSES:
        content_class = "student-safe"
    indexable = not blocked and content_class != "system-metadata"
    return content_class, indexable, "blocked" if blocked else ""


def _scope(source_id: str, source_path: str) -> list[str]:
    match = LAB_RE.search(_path_key(source_path))
    if match:
        return [f"lab{match.group(1)}"]
    if source_id.startswith("platform-lab"):
        return ["platform"]
    return ["global"]


def _concept_ids(blocks: Iterable[dict[str, Any]]) -> list[str]:
    found: list[str] = []
    for item in blocks:
        text = str(item.get("text", ""))
        for match in re.finditer(r"(?:^|\n)\s*(?:id|conceptId|concept_id)\s*:\s*['\"]?([A-Za-z0-9_.:-]+)", text, re.I):
            value = match.group(1)
            if value not in found:
                found.append(value)
    return found


def _render_block(item: dict[str, Any]) -> str:
    text = str(item.get("text", "")).strip()
    block_type = item.get("type")
    if block_type == "code":
        language = str(item.get("language") or "").strip()
        return f"```{language}\n{text}\n```" if language else f"```\n{text}\n```"
    if block_type == "list":
        return "\n".join(f"- {line.strip()}" for line in text.splitlines() if line.strip())
    if block_type == "quote":
        return "\n".join(f"> {line.strip()}" for line in text.splitlines() if line.strip())
    return text


def _split_long_text(text: str, max_chars: int) -> list[str]:
    if len(text) <= max_chars:
        return [text]
    pieces = [part.strip() for part in re.split(r"(?<=[。！？.!?；;])\s+|\n+", text) if part.strip()]
    if not pieces:
        pieces = [text]
    result: list[str] = []
    current = ""
    for piece in pieces:
        if len(piece) > max_chars:
            if current:
                result.append(current)
                current = ""
            for start in range(0, len(piece), max_chars):
                result.append(piece[start : start + max_chars])
            continue
        candidate = f"{current} {piece}".strip() if current else piece
        if current and len(candidate) > max_chars:
            result.append(current)
            current = piece
        else:
            current = candidate
    if current:
        result.append(current)
    return result


def _chunk_type(blocks: list[dict[str, Any]]) -> str:
    kinds = {str(item.get("type")) for item in blocks}
    if kinds == {"code"}:
        return "code"
    if kinds == {"structured"}:
        return "structured"
    return "text" if kinds <= {"paragraph", "list", "quote", "table"} else "mixed"


def _risk(blocks: list[dict[str, Any]], content_class: str, blocked_reason: str) -> str:
    if blocked_reason:
        return "blocked"
    text = "\n".join(str(item.get("text", "")) for item in blocks)
    if RISK_TERMS.search(text):
        return "high"
    if content_class in {"guided-hint", "teacher-only"} or any(item.get("type") == "code" for item in blocks):
        return "medium"
    return "low"


def _locator(item: dict[str, Any]) -> dict[str, Any]:
    value = item.get("locator")
    return dict(value) if isinstance(value, dict) else {}


def _make_chunk(document: dict[str, Any], blocks: list[dict[str, Any]], text: str, ordinal: int, policy: dict[str, Any] | None, *, split_from_long: bool = False) -> dict[str, Any]:
    source_path = str(document.get("metadata", {}).get("sourcePath") or "")
    content_class, indexable, blocked_reason = _load_policy(policy, str(document["sourceId"]), source_path)
    section_path = list(blocks[0].get("sectionPath") or [])
    block_ordinals = [int(item["ordinal"]) for item in blocks]
    digest = hashlib.sha256(f"{document['documentId']}:{ordinal}:{text}".encode("utf-8")).hexdigest()[:16]
    char_count = len(text)
    return {
        "id": f"{document['documentId']}:chunk-{ordinal:06d}-{digest}",
        "ordinal": ordinal,
        "documentId": document["documentId"],
        "sourceId": document["sourceId"],
        "chunkType": _chunk_type(blocks),
        "text": text,
        "sectionPath": section_path,
        "blockOrdinals": block_ordinals,
        "locatorStart": _locator(blocks[0]),
        "locatorEnd": _locator(blocks[-1]),
        "contentClass": content_class,
        "labScope": _scope(str(document["sourceId"]), source_path),
        "conceptIds": _concept_ids(blocks),
        "answerRisk": _risk(blocks, content_class, blocked_reason),
        "indexable": indexable,
        "metadata": {
            "charCount": char_count,
            "tokenEstimate": max(1, (char_count + 3) // 4),
            "blockTypes": sorted({str(item.get("type")) for item in blocks}),
            "sourcePath": source_path,
            "splitFromLongBlock": split_from_long,
        },
    }


def validate_chunk_set(chunk_set: dict[str, Any]) -> None:
    if chunk_set.get("schemaVersion") != SCHEMA_VERSION:
        raise ValueError("invalid chunk schema version")
    chunks = chunk_set.get("chunks")
    if not isinstance(chunks, list):
        raise ValueError("chunks must be an array")
    for ordinal, item in enumerate(chunks):
        if item.get("ordinal") != ordinal:
            raise ValueError("chunk ordinals must be contiguous")
        if not item.get("text", "").strip():
            raise ValueError(f"empty chunk: {item.get('id')}")
        if item.get("contentClass") not in CONTENT_CLASSES:
            raise ValueError(f"invalid content class: {item.get('contentClass')}")
        if item.get("answerRisk") not in {"low", "medium", "high", "blocked"}:
            raise ValueError(f"invalid answer risk: {item.get('answerRisk')}")
        if not item.get("blockOrdinals"):
            raise ValueError("chunk must retain source block ordinals")


def chunk_document(document: dict[str, Any], *, policy: dict[str, Any] | None = None, target_chars: int = 1000, max_chars: int = 1400) -> dict[str, Any]:
    if max_chars < target_chars or target_chars < 1:
        raise ValueError("max_chars must be >= target_chars >= 1")
    blocks = [item for item in document.get("blocks", []) if item.get("type") != "heading" and str(item.get("text", "")).strip()]
    chunks: list[dict[str, Any]] = []
    current: list[dict[str, Any]] = []
    current_section: tuple[str, ...] | None = None
    current_length = 0
    ordinal = 0

    def flush(items: list[dict[str, Any]]) -> None:
        nonlocal ordinal
        if not items:
            return
        rendered = [_render_block(item) for item in items]
        text = "\n\n".join(rendered).strip()
        chunks.append(_make_chunk(document, items, text, ordinal, policy))
        ordinal += 1

    for item in blocks:
        section = tuple(item.get("sectionPath") or [])
        rendered = _render_block(item)
        if current and section != current_section:
            flush(current)
            current = []
            current_length = 0
        current_section = section
        if len(rendered) > max_chars:
            if current:
                flush(current)
                current = []
                current_length = 0
            if item.get("type") == "code":
                language = str(item.get("language") or "").strip()
                payload_limit = max(1, max_chars - len(language) - 8)
                payloads = _split_long_text(str(item.get("text", "")).strip(), payload_limit)
                pieces = [f"```{language}\n{piece}\n```" if language else f"```\n{piece}\n```" for piece in payloads]
            else:
                pieces = _split_long_text(rendered, max_chars)
            for piece in pieces:
                chunks.append(_make_chunk(document, [item], piece, ordinal, policy, split_from_long=True))
                ordinal += 1
            continue
        candidate_length = current_length + (2 if current else 0) + len(rendered)
        if current and candidate_length > max_chars:
            flush(current)
            current = []
            current_length = 0
        current.append(item)
        current_length += (2 if len(current) > 1 else 0) + len(rendered)
        if current_length >= target_chars:
            flush(current)
            current = []
            current_length = 0
    flush(current)

    source_id = str(document["sourceId"])
    document_id = str(document["documentId"])
    result = {
        "schemaVersion": SCHEMA_VERSION,
        "chunkSetId": f"{document_id}:section-aware-v1",
        "documentId": document_id,
        "sourceId": source_id,
        "chunking": {
            "algorithm": "section-aware-v1",
            "targetChars": target_chars,
            "maxChars": max_chars,
            "overlapChars": 0,
            "chunkCount": len(chunks),
        },
        "chunks": chunks,
    }
    validate_chunk_set(result)
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", help="normalized Document JSON")
    parser.add_argument("--policy", help="access-policy.json")
    parser.add_argument("--target-chars", type=int, default=1000)
    parser.add_argument("--max-chars", type=int, default=1400)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    document = json.loads(Path(args.input).read_text(encoding="utf-8"))
    policy = json.loads(Path(args.policy).read_text(encoding="utf-8")) if args.policy else None
    chunk_set = chunk_document(document, policy=policy, target_chars=args.target_chars, max_chars=args.max_chars)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(chunk_set, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"ok": True, "documentId": document["documentId"], "chunks": len(chunk_set["chunks"]), "output": output.as_posix()}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
