"""Deterministic quality gates for normalized teaching knowledge.

Rules remove parser/configuration residue before chunking and preserve an
auditable reason count.  They intentionally prefer high precision over corpus
size: rejected source files remain available in the source snapshot.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
from collections import Counter
from copy import deepcopy
from typing import Any

import yaml


CORE_TERMS = re.compile(
    r"(操作系统|内核|进程|线程|调度|中断|异常|系统调用|地址空间|虚拟内存|页表|TLB|内存|文件系统|"
    r"文件|磁盘|设备|同步|互斥|信号量|条件变量|死锁|并发|IPC|管道|信号|上下文|特权级|"
    r"RISC-V|寄存器|指令|缓存|CPU|trap|syscall|scheduler|process|thread|memory|page|filesystem|"
    r"interrupt|exception|semaphore|mutex|deadlock|context|register|instruction|cache)", re.I,
)
NOISE_SECTION_RE = re.compile(
    r"(在线信息|课程参考|参考资料|参考文献|扩展阅读|练习题|家庭作业|常见问题|鸣谢|致谢|版权|"
    r"related resources|references|bibliography|grading|build\s*&?\s*run|source code|API docs|"
    r"release notes|table of contents|acknowledg|homework|exercise|drawing)", re.I,
)
TEMPLATE_RE = re.compile(
    r"(versionNonce|strokeSharpness|PUPPETEER_TIMEOUT|compressed-json|excalidraw|"
    r"^\s*%%\s*$|^\s*\.\.\s+toctree::|^\s*\.\.\s+(?:image|figure)::)", re.I | re.M,
)
MOJIBAKE_RE = re.compile(r"(?:锛|銆|鈥|鈫|绔|妫|鐭|瀹|璇|鎿|�)")
CODE_SIGNAL_RE = re.compile(r"(?:#include|\b(?:int|void|char|struct|enum|fn|let|pub|impl|return|if|while|for)\b|[{};]|::|->)")
LECTURE_ADMIN_SECTION_RE = re.compile(r"(?:^|\s>\s)(?:问题|预备知识|作业与实验|基础实验|课程设计|课程安排)(?:\s>|$)")
SHORT_ASSERTION_RE = re.compile(
    r"(是|指|称为|定义|通过|用于|负责|决定|必须|需要|依赖|保证|提供|支持|保存|恢复|切换|映射|分配|调度|保护|"
    r"实现|建立|维护|包含|组成|允许|导致|因此|由于|从而|使得|加入|提高|=| means? | is | are | provides? | requires? | maps? )",
    re.I,
)
PDF_CODE_LINE_RE = re.compile(r"^\s*\d+\s+(?:#|//|/\*|[A-Za-z_].*[;{}()%]|[{}])")
OSTEP_CORRUPTION_RE = re.compile(r"(?:我我|我同|我能|我谁|谁我|谁是|谁的|谁谁|我我我|实实上|尽尽|我同样)")
RISC_V_ENCODING_TOKEN_RE = re.compile(
    r"(?:\b(?:imm|uimm|offset)\[[^\]]+\]|\brs[123][’']?\b|\brd[’']?\b|\brm\b|\b[01]{5,}\b)", re.I,
)
RISC_V_NUMERIC_SECTION_RE = re.compile(r"^\s*\d+(?:\s+\d+){2,}\s*$")
RISC_V_ENCODING_SECTION_RE = re.compile(
    r"^\s*(?:[01]{2,}|(?:imm|uimm|offset)\[[^\]]+\]|rs[123][’']?|rd[’']?)(?:\s+|$)", re.I,
)
RISC_V_FIGURE_LIST_RE = re.compile(r"(?:图\s*\d+(?:\.\d+)?[^。；]{0,60}){3,}", re.I)
RISC_V_FIGURE_ONLY_RE = re.compile(r"^\s*图\s*\d+(?:\.\d+)?[：:]?.{0,100}$", re.I)
RISC_V_MATH_SECTION_RE = re.compile(r"^\s*\d+(?:\.\d+)+\s+.*[\U0001D400-\U0001D7FF]")
RISC_V_FLATTENED_POWER_RE = re.compile(
    r"(?:\b210\s+个\s+4\s*MiB|\b29\s*(?:个|倍|层|，|树)|\b22[56]\s*(?:GiB|倍))", re.I,
)
RISC_V_REGISTER_TABLE_RE = re.compile(r"\bf\d+\s*/\s*f(?:t|s|a)\d+\b", re.I)
RISC_V_ASSEMBLY_RE = re.compile(
    r"\b(?:add|addi|sub|slt|slti|xor|and|or|beq|bne|blt|bge|jal|jalr|lw|ld|sw|sd)\s+[a-z][a-z0-9]*\d", re.I,
)
TOC_DOTS_RE = re.compile(r"\.{5,}\s*\d+(?:\s|$)")
RISC_V_CONTENT_START_PAGE = 15


def _collapse_doubled_text(value: str) -> str:
    compact = value.replace(" ", "")
    pairs = sum(1 for index in range(0, len(compact) - 1, 2) if compact[index] == compact[index + 1])
    if len(compact) >= 8 and pairs >= max(3, len(compact) // 5):
        value = re.sub(r"([\u3400-\u9fffA-Za-z0-9：:])\1", r"\1", value)
    return value


def clean_text(value: str, *, code: bool = False) -> str:
    text = html.unescape(str(value or ""))
    text = re.sub(r"<!--[\s\S]*?-->", "", text)
    text = re.sub(r"\{%[\s\S]*?%\}", "", text)
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"`([^`<]+)\s*<https?://[^>]+>`_", r"\1", text)
    text = re.sub(r"https?://\S+", "", text)
    text = re.sub(r":\w+:`([^`]+)`", r"\1", text)
    text = re.sub(r"\(cid:\d+\)", "", text, flags=re.I)
    text = _collapse_doubled_text(text)
    if code:
        lines = [line.rstrip() for line in text.replace("\r", "").splitlines()]
        while lines and not lines[0].strip():
            lines.pop(0)
        while lines and not lines[-1].strip():
            lines.pop()
        return "\n".join(lines)
    return re.sub(r"\s+", " ", text).strip(" \t\n-|·")


def _riscv_encoding_noise(text: str, section: str) -> bool:
    if (
        RISC_V_NUMERIC_SECTION_RE.fullmatch(section.strip())
        or RISC_V_ENCODING_SECTION_RE.match(section)
        or RISC_V_MATH_SECTION_RE.match(section)
    ):
        return True
    tokens = RISC_V_ENCODING_TOKEN_RE.findall(text)
    opcodes = re.findall(r"\b[01]{5,}\b", text)
    if len(tokens) >= 5 and opcodes:
        return True
    if len(tokens) >= 12:
        return True
    if len(RISC_V_REGISTER_TABLE_RE.findall(text)) >= 5 or len(RISC_V_ASSEMBLY_RE.findall(text)) >= 3:
        return True
    if RISC_V_FLATTENED_POWER_RE.search(text):
        return True
    return bool(
        (len(text) < 240 and RISC_V_FIGURE_LIST_RE.search(text))
        or (len(text) < 120 and RISC_V_FIGURE_ONLY_RE.fullmatch(text))
    )


def _reason_for_block(block: dict[str, Any], source_id: str) -> str:
    text = str(block.get("text", "")).strip()
    if not text:
        return "empty-after-cleaning"
    if source_id == "riscv-reader-zh-local":
        page = (block.get("locator") or {}).get("page")
        if isinstance(page, (int, float)) and page < RISC_V_CONTENT_START_PAGE:
            return "front-matter"
    section = " > ".join(block.get("sectionPath") or [])
    if NOISE_SECTION_RE.search(section):
        return "non-core-section"
    if source_id == "learningos-os-lectures-source" and LECTURE_ADMIN_SECTION_RE.search(section):
        return "course-administration-or-prompt"
    if TEMPLATE_RE.search(text):
        return "template-or-diagram-source"
    if TOC_DOTS_RE.search(text):
        return "table-of-contents"
    if MOJIBAKE_RE.search(text) and source_id not in {"platform-lab-manuals", "platform-lab-packages"}:
        return "encoding-noise"
    compact = re.sub(r"\s+", "", text)
    if re.fullmatch(r"[\d\W_]+", compact):
        return "numeric-or-symbol-only"
    alnum = sum(character.isalnum() for character in compact)
    if compact and alnum / len(compact) < 0.35:
        return "low-semantic-character-ratio"
    if block.get("type") == "code":
        if source_id not in {"platform-lab-manuals", "platform-lab-packages"} and (len(text) > 700 or not CODE_SIGNAL_RE.search(text)):
            return "external-code-only"
        return ""
    if source_id in {"ostep-zh-local-complete", "riscv-reader-zh-local"} and PDF_CODE_LINE_RE.search(text):
        return "misaligned-pdf-code"
    if source_id == "ostep-zh-local-complete" and OSTEP_CORRUPTION_RE.search(text):
        return "encoding-noise"
    if source_id == "riscv-reader-zh-local" and _riscv_encoding_noise(text, section):
        return "instruction-encoding-table"
    if len(text) < 80 and re.match(r"^(?:\d{1,3}\s+)?(?:第\s*\d+\s*章|chapter\s+\d+)\b", text, re.I):
        return "heading-only"
    minimum = 24 if source_id.startswith("platform-") else 45
    if len(text) < minimum and not CORE_TERMS.search(text):
        return "low-signal-short-block"
    return ""


def _core_value(concept: dict[str, Any], key: str) -> Any:
    layers = concept.get("layers") if isinstance(concept.get("layers"), dict) else {}
    return concept.get(key) if concept.get(key) not in (None, "", []) else layers.get(key)


def project_platform_concepts(document: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    concepts: list[dict[str, Any]] = []
    for block in document.get("blocks", []):
        try:
            value = yaml.safe_load(block.get("text", ""))
        except yaml.YAMLError:
            continue
        if not isinstance(value, dict):
            continue
        if isinstance(value.get("concepts"), list):
            concepts.extend(item for item in value["concepts"] if isinstance(item, dict))
        elif value.get("id") and value.get("title"):
            concepts.append(value)

    blocks: list[dict[str, Any]] = []
    for concept in concepts:
        title = clean_text(str(concept.get("title") or ""))
        concept_id = str(concept.get("id") or "")
        parts = [title]
        labels = [
            ("核心原理", _core_value(concept, "summary") or _core_value(concept, "course_concept")),
            ("体系结构机制", _core_value(concept, "arch_mechanism")),
            ("必须成立的条件", _core_value(concept, "invariants")),
            ("可迁移知识", _core_value(concept, "transfer")),
        ]
        for label, raw in labels:
            if isinstance(raw, list):
                rendered = "；".join(clean_text(str(item)) for item in raw if clean_text(str(item)))
            else:
                rendered = clean_text(str(raw or ""))
            if rendered:
                parts.append(f"{label}：{rendered}")
        if not title or len("\n\n".join(parts)) < 35:
            continue
        locator = {"path": document.get("metadata", {}).get("sourcePath", ""), "conceptId": concept_id}
        section = [title]
        blocks.append({
            "id": f"block-{len(blocks):06d}", "ordinal": len(blocks), "type": "paragraph",
            "text": "\n\n".join(parts), "language": "mixed", "level": None,
            "sectionPath": section, "locator": locator,
        })
    result = deepcopy(document)
    result["blocks"] = blocks
    result["metadata"] = {**result.get("metadata", {}), "projection": "platform-concept-core-v1", "blockCount": len(blocks)}
    return result, {"inputBlocks": len(document.get("blocks", [])), "keptBlocks": len(blocks), "droppedBlocks": 0, "reasons": {}, "projectedConcepts": len(blocks)}


def filter_document(document: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    source_id = str(document.get("sourceId", ""))
    source_path = str(document.get("metadata", {}).get("sourcePath", "")).replace("\\", "/")
    if source_id == "platform-lab-packages" and "/concepts/" in source_path:
        return project_platform_concepts(document)

    result = deepcopy(document)
    kept: list[dict[str, Any]] = []
    reasons: Counter[str] = Counter()
    for original in document.get("blocks", []):
        item = deepcopy(original)
        item["text"] = clean_text(item.get("text", ""), code=item.get("type") == "code")
        cleaned_sections = [clean_text(part) for part in item.get("sectionPath", [])]
        item["sectionPath"] = [part for part in cleaned_sections if part and not TOC_DOTS_RE.search(part)]
        if source_id in {"ostep-zh-local-complete", "riscv-reader-zh-local"}:
            item["sectionPath"] = [
                re.sub(r"\s+\d{1,3}$", "", re.sub(r"^\d{1,3}\s+(?=(?:第\s*\d+\s*章|\d+\.))", "", part)).strip()
                for part in item["sectionPath"]
            ]
        reason = _reason_for_block(item, source_id)
        if reason:
            reasons[reason] += 1
            continue
        if source_id in {"ostep-zh-local-complete", "riscv-reader-zh-local"}:
            item["text"] = re.sub(r"^\d{1,3}\s+(?=[\u3400-\u9fff])", "", item["text"])
        locator = dict(item.get("locator") or {})
        locator.setdefault("sourceBlockOrdinal", original.get("ordinal"))
        item.update({"id": f"block-{len(kept):06d}", "ordinal": len(kept), "locator": locator})
        kept.append(item)
    result["blocks"] = kept
    result["metadata"] = {
        **result.get("metadata", {}),
        "qualityFilter": "knowledge-quality-v1",
        "blockCount": len(kept),
        "filteredBlockCount": sum(reasons.values()),
        "filterReasons": dict(sorted(reasons.items())),
    }
    return result, {
        "inputBlocks": len(document.get("blocks", [])), "keptBlocks": len(kept),
        "droppedBlocks": sum(reasons.values()), "reasons": dict(sorted(reasons.items())),
    }


def filter_chunk_set(chunk_set: dict[str, Any], source_id: str, seen_hashes: set[str] | None = None) -> tuple[dict[str, Any], dict[str, Any]]:
    kept: list[dict[str, Any]] = []
    reasons: Counter[str] = Counter()
    seen = seen_hashes if seen_hashes is not None else set()
    strict = source_id not in {"platform-lab-manuals", "platform-lab-packages"}
    for original in chunk_set.get("chunks", []):
        item = deepcopy(original)
        text = str(item.get("text", "")).strip()
        normalized = re.sub(r"\s+", " ", text).strip().lower()
        digest = hashlib.sha256(normalized.encode("utf-8")).hexdigest()
        reason = ""
        if digest in seen:
            reason = "duplicate-chunk"
        elif TEMPLATE_RE.search(text):
            reason = "template-or-diagram-source"
        elif source_id == "riscv-reader-zh-local" and _riscv_encoding_noise(text, " > ".join(item.get("sectionPath") or [])):
            reason = "instruction-encoding-table"
        elif strict and item.get("answerRisk") in {"high", "blocked"}:
            reason = "answer-risk"
        elif strict and len(text) < 100 and (not CORE_TERMS.search(text) or not SHORT_ASSERTION_RE.search(text)):
            reason = "low-signal-short-chunk"
        elif strict and item.get("chunkType") == "code" and len(text) > 500:
            reason = "external-code-only"
        if reason:
            reasons[reason] += 1
            continue
        seen.add(digest)
        item["ordinal"] = len(kept)
        item["id"] = f"{item['documentId']}:chunk-{len(kept):06d}-{hashlib.sha256(text.encode('utf-8')).hexdigest()[:16]}"
        kept.append(item)
    result = deepcopy(chunk_set)
    result["chunks"] = kept
    result["chunking"] = {**result.get("chunking", {}), "qualityFilter": "knowledge-quality-v1", "chunkCount": len(kept)}
    return result, {
        "inputChunks": len(chunk_set.get("chunks", [])), "keptChunks": len(kept),
        "droppedChunks": sum(reasons.values()), "reasons": dict(sorted(reasons.items())),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Apply deterministic knowledge quality gates to a normalized document or chunk set.")
    parser.add_argument("input", type=str)
    parser.add_argument("--kind", choices=["document", "chunks"], required=True)
    parser.add_argument("--source-id", default="")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    from pathlib import Path

    input_path = Path(args.input)
    value = json.loads(input_path.read_text(encoding="utf-8"))
    if args.kind == "document":
        filtered, report = filter_document(value)
    else:
        source_id = args.source_id or str(value.get("sourceId") or "")
        filtered, report = filter_chunk_set(value, source_id)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(filtered, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"ok": True, "kind": args.kind, "report": report, "output": output.as_posix()}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
