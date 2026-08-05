"""Normalize supported knowledge formats into a stable Document/Block JSON model.

This is an offline ingestion adapter. It intentionally does not authorize a
source, create chunks, or call an embedding model. Those concerns belong to
the policy gate and later indexing stages.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any, Iterable

import pdfplumber
import yaml
from bs4 import BeautifulSoup
from markdown_it import MarkdownIt
from pypdf import PdfReader


SCHEMA_VERSION = 1
SUPPORTED_FORMATS = {"markdown", "html", "json", "yaml", "text", "pdf"}
HEADING_RE = re.compile(
    r"^(?:第\s*[0-9一二三四五六七八九十百]+\s*[章节部分]|附录\s*[A-Za-z0-9一二三四五六七八九十]+|"
    r"[0-9]+(?:\.[0-9]+){0,3}\s+\S+)"
)
CHINESE_RE = re.compile(r"[\u3400-\u9fff]")


def sha256_bytes(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def normalize_whitespace(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    return text.strip()


def join_wrapped_lines(lines: Iterable[str]) -> str:
    result = ""
    for line in lines:
        value = normalize_whitespace(line)
        if not value:
            continue
        if not result:
            result = value
        elif CHINESE_RE.search(result[-1:]) and CHINESE_RE.search(value[:1]):
            result += value
        else:
            result += f" {value}"
    return normalize_whitespace(result)


def detect_language(text: str) -> str:
    letters = re.findall(r"[A-Za-z]", text)
    chinese = len(CHINESE_RE.findall(text))
    if chinese and letters:
        return "mixed"
    if chinese:
        return "zh-CN"
    if letters:
        return "en"
    return "unknown"


def source_title(input_path: Path, explicit: str | None = None) -> str:
    if explicit:
        return explicit.strip()
    return input_path.stem.replace("_", " ").replace("-", " ").strip() or input_path.name


def section_update(sections: list[str], title: str, level: int) -> list[str]:
    next_sections = sections[: max(0, level - 1)]
    next_sections.append(title)
    return next_sections


def block(
    ordinal: int,
    block_type: str,
    text: str,
    section_path: list[str],
    locator: dict[str, Any],
    *,
    language: str | None = None,
    level: int | None = None,
) -> dict[str, Any] | None:
    value = text.strip()
    if not value:
        return None
    item: dict[str, Any] = {
        "id": f"block-{ordinal:06d}",
        "ordinal": ordinal,
        "type": block_type,
        "text": value,
        "language": language,
        "level": level,
        "sectionPath": list(section_path),
        "locator": locator,
    }
    return item


def markdown_blocks(text: str, source_path: str) -> tuple[str, list[dict[str, Any]]]:
    parser = MarkdownIt("commonmark").enable("table")
    tokens = parser.parse(text)
    sections: list[str] = []
    blocks: list[dict[str, Any]] = []
    ordinal = 0
    index = 0

    while index < len(tokens):
        token = tokens[index]
        line_start = (token.map[0] + 1) if token.map else None
        line_end = token.map[1] if token.map else None
        locator = {"path": source_path}
        if line_start is not None:
            locator.update({"lineStart": line_start, "lineEnd": line_end})

        if token.type == "heading_open" and index + 1 < len(tokens):
            inline = tokens[index + 1]
            title = normalize_whitespace(inline.content)
            level = int(token.tag[1:])
            sections = section_update(sections, title, level)
            item = block(ordinal, "heading", title, sections, locator, level=level)
            if item:
                blocks.append(item)
                ordinal += 1
            index += 3
            continue

        if token.type in {"paragraph_open", "blockquote_open", "list_item_open"} and index + 1 < len(tokens):
            inline = tokens[index + 1]
            if inline.type == "inline":
                kind = {
                    "paragraph_open": "paragraph",
                    "blockquote_open": "quote",
                    "list_item_open": "list",
                }[token.type]
                item = block(ordinal, kind, inline.content, sections, locator)
                if item:
                    blocks.append(item)
                    ordinal += 1
                index += 3 if token.type != "list_item_open" else 1
                continue

        if token.type in {"fence", "code_block"}:
            item = block(
                ordinal,
                "code",
                token.content,
                sections,
                locator,
                language=token.info.strip().split()[0] if token.info.strip() else None,
            )
            if item:
                blocks.append(item)
                ordinal += 1
            index += 1
            continue

        if token.type == "table_open":
            cells: list[str] = []
            cursor = index + 1
            while cursor < len(tokens) and tokens[cursor].type != "table_close":
                if tokens[cursor].type == "inline" and tokens[cursor].content.strip():
                    cells.append(normalize_whitespace(tokens[cursor].content))
                cursor += 1
            item = block(ordinal, "table", " | ".join(cells), sections, locator)
            if item:
                blocks.append(item)
                ordinal += 1
            index = cursor + 1
            continue

        index += 1

    title = sections[0] if sections else source_title(Path(source_path))
    return title, blocks


def html_blocks(text: str, source_path: str, source_url: str | None = None) -> tuple[str, list[dict[str, Any]]]:
    soup = BeautifulSoup(text, "lxml")
    for tag in soup(["script", "style", "nav", "header", "footer", "aside", "noscript"]):
        tag.decompose()
    root = soup.find("main") or soup.find("article") or soup.body or soup
    sections: list[str] = []
    blocks: list[dict[str, Any]] = []
    ordinal = 0
    selected = {"h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "blockquote", "pre", "table"}

    for element in root.find_all(sorted(selected)):
        if element.name == "p" and element.find_parent(["li", "blockquote", "pre", "table"]):
            continue
        if element.name == "li" and element.find_parent(["li"]):
            continue
        if element.name == "table" and element.find_parent("table"):
            continue
        text_value = element.get_text("\n" if element.name == "pre" else " ", strip=True)
        if not text_value:
            continue
        locator: dict[str, Any] = {"path": source_path}
        if source_url:
            locator["url"] = source_url
        if element.get("id"):
            locator["anchor"] = str(element["id"])
        if element.name.startswith("h"):
            level = int(element.name[1:])
            sections = section_update(sections, text_value, level)
            item = block(ordinal, "heading", text_value, sections, locator, level=level)
        elif element.name == "pre":
            item = block(ordinal, "code", text_value, sections, locator)
        elif element.name == "li":
            item = block(ordinal, "list", text_value, sections, locator)
        elif element.name == "blockquote":
            item = block(ordinal, "quote", text_value, sections, locator)
        elif element.name == "table":
            item = block(ordinal, "table", text_value, sections, locator)
        else:
            item = block(ordinal, "paragraph", text_value, sections, locator)
        if item:
            blocks.append(item)
            ordinal += 1

    title = soup.title.get_text(" ", strip=True) if soup.title else (sections[0] if sections else source_title(Path(source_path)))
    return title or source_title(Path(source_path)), blocks


def structured_blocks(value: Any, source_path: str) -> tuple[str, list[dict[str, Any]]]:
    rendered = yaml.safe_dump(value, allow_unicode=True, sort_keys=False, default_flow_style=False).strip()
    title = source_title(Path(source_path))
    item = block(0, "structured", rendered, [title], {"path": source_path})
    return title, [item] if item else []


def text_blocks(text: str, source_path: str) -> tuple[str, list[dict[str, Any]]]:
    sections: list[str] = []
    blocks: list[dict[str, Any]] = []
    current: list[str] = []
    start_line = 1
    ordinal = 0

    def flush(end_line: int) -> None:
        nonlocal ordinal, current, start_line
        joined = join_wrapped_lines(current)
        item = block(ordinal, "paragraph", joined, sections, {"path": source_path, "lineStart": start_line, "lineEnd": end_line})
        if item:
            blocks.append(item)
            ordinal += 1
        current = []

    for line_number, line in enumerate(text.splitlines(), start=1):
        value = line.strip()
        if not value:
            if current:
                flush(line_number - 1)
            continue
        if HEADING_RE.match(value) and len(value) <= 120:
            if current:
                flush(line_number - 1)
            sections = section_update(sections, value, 1)
            item = block(ordinal, "heading", value, sections, {"path": source_path, "lineStart": line_number, "lineEnd": line_number}, level=1)
            if item:
                blocks.append(item)
                ordinal += 1
            continue
        if not current:
            start_line = line_number
        current.append(line)
    if current:
        flush(len(text.splitlines()))
    return source_title(Path(source_path)), blocks


def pdf_blocks(path: Path, source_path: str, max_pages: int | None = None) -> tuple[str, list[dict[str, Any]], dict[str, Any]]:
    with pdfplumber.open(str(path)) as pdf:
        total_pages = len(pdf.pages)
        pages = pdf.pages[:max_pages] if max_pages else pdf.pages
        page_texts = [(page.extract_text(x_tolerance=2, y_tolerance=3, layout=True) or "") for page in pages]
        first_last = []
        for text in page_texts:
            lines = [normalize_whitespace(line) for line in text.splitlines() if normalize_whitespace(line)]
            first_last.extend(lines[:1] + lines[-1:])
        repeated = {line for line, count in Counter(first_last).items() if count >= 3 and len(line) <= 120}

        blocks: list[dict[str, Any]] = []
        sections: list[str] = []
        ordinal = 0
        for page_index, text in enumerate(page_texts, start=1):
            current: list[str] = []
            start_line = 1

            def flush(end_line: int) -> None:
                nonlocal ordinal, current, start_line
                joined = join_wrapped_lines(current)
                item = block(ordinal, "paragraph", joined, sections, {"path": source_path, "page": page_index, "lineStart": start_line, "lineEnd": end_line})
                if item:
                    blocks.append(item)
                    ordinal += 1
                current = []

            for line_number, raw_line in enumerate(text.splitlines(), start=1):
                value = normalize_whitespace(raw_line)
                if not value or value in repeated:
                    if current:
                        flush(line_number - 1)
                    continue
                if HEADING_RE.match(value) and len(value) <= 120:
                    if current:
                        flush(line_number - 1)
                    sections = section_update(sections, value, 1)
                    item = block(ordinal, "heading", value, sections, {"path": source_path, "page": page_index, "lineStart": line_number, "lineEnd": line_number}, level=1)
                    if item:
                        blocks.append(item)
                        ordinal += 1
                    continue
                if not current:
                    start_line = line_number
                current.append(raw_line)
            if current:
                flush(len(text.splitlines()))

        chars = sum(len(value.strip()) for value in page_texts)
        metadata = {
            "pageCount": total_pages,
            "processedPages": len(pages),
            "partial": bool(max_pages and max_pages < total_pages),
            "textCharacters": chars,
            "requiresOcr": bool(pages) and chars < len(pages) * 80,
            "repeatedHeaderFooterLinesRemoved": sorted(repeated),
        }
        try:
            metadata_text = PdfReader(str(path)).metadata or {}
            if metadata_text.get("/Title"):
                metadata["pdfTitle"] = str(metadata_text["/Title"])
        except Exception as error:  # metadata is optional; extraction already succeeded
            metadata["metadataWarning"] = str(error)
        title = metadata.get("pdfTitle") or source_title(path)
        return title, blocks, metadata


def detect_format(path: Path) -> str:
    suffix = path.suffix.lower()
    return {
        ".md": "markdown",
        ".markdown": "markdown",
        ".html": "html",
        ".htm": "html",
        ".json": "json",
        ".yaml": "yaml",
        ".yml": "yaml",
        ".txt": "text",
        ".pdf": "pdf",
    }.get(suffix, "")


def normalize_file(
    input_path: str | Path,
    source_id: str,
    *,
    input_format: str | None = None,
    title: str | None = None,
    source_url: str | None = None,
    max_pages: int | None = None,
) -> dict[str, Any]:
    path = Path(input_path)
    raw = path.read_bytes()
    format_name = input_format or detect_format(path)
    if format_name not in SUPPORTED_FORMATS:
        raise ValueError(f"unsupported format for {path}: {format_name or 'unknown'}")

    pdf_metadata: dict[str, Any] = {}
    if format_name == "markdown":
        document_title, blocks = markdown_blocks(raw.decode("utf-8-sig"), path.as_posix())
    elif format_name == "html":
        document_title, blocks = html_blocks(raw.decode("utf-8-sig"), path.as_posix(), source_url)
    elif format_name == "json":
        document_title, blocks = structured_blocks(json.loads(raw.decode("utf-8-sig")), path.as_posix())
    elif format_name == "yaml":
        document_title, blocks = structured_blocks(yaml.safe_load(raw.decode("utf-8-sig")), path.as_posix())
    elif format_name == "pdf":
        document_title, blocks, pdf_metadata = pdf_blocks(path, path.as_posix(), max_pages)
    else:
        document_title, blocks = text_blocks(raw.decode("utf-8-sig"), path.as_posix())

    if title:
        document_title = title
    full_text = "\n".join(item["text"] for item in blocks)
    document_id = f"{source_id}:{sha256_bytes(raw)[:16]}"
    metadata: dict[str, Any] = {
        "sourcePath": path.as_posix(),
        "sourceUrl": source_url,
        "sourceBytes": len(raw),
        "parser": "os-lab-normalize",
        "parserVersion": "knowledge-normalize-v1",
        "blockCount": len(blocks),
        "warnings": [],
        **pdf_metadata,
    }
    if not blocks:
        metadata["warnings"].append("no-text-blocks")
    if pdf_metadata.get("requiresOcr"):
        metadata["warnings"].append("pdf-text-density-low-requires-ocr")
    if source_url:
        metadata["sourceUrl"] = source_url

    document = {
        "schemaVersion": SCHEMA_VERSION,
        "documentId": document_id,
        "sourceId": source_id,
        "title": document_title or source_title(path),
        "format": format_name,
        "language": detect_language(full_text),
        "contentHash": sha256_bytes(raw),
        "metadata": metadata,
        "blocks": blocks,
    }
    validate_document(document)
    return document


def validate_document(document: dict[str, Any]) -> None:
    if document.get("schemaVersion") != SCHEMA_VERSION:
        raise ValueError("invalid document schema version")
    if not document.get("documentId") or not document.get("sourceId"):
        raise ValueError("documentId and sourceId are required")
    if document.get("format") not in SUPPORTED_FORMATS:
        raise ValueError(f"unsupported document format: {document.get('format')}")
    if not re.fullmatch(r"[a-f0-9]{64}", str(document.get("contentHash", ""))):
        raise ValueError("contentHash must be a SHA-256 hex string")
    seen = set()
    for ordinal, item in enumerate(document.get("blocks", [])):
        if item["ordinal"] != ordinal:
            raise ValueError("block ordinals must be contiguous")
        if item["id"] in seen:
            raise ValueError(f"duplicate block id: {item['id']}")
        seen.add(item["id"])
        if item["type"] not in {"heading", "paragraph", "list", "quote", "code", "table", "structured"}:
            raise ValueError(f"invalid block type: {item['type']}")
        if not item["text"].strip():
            raise ValueError(f"empty block: {item['id']}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", help="local source file")
    parser.add_argument("--source-id", required=True)
    parser.add_argument("--format", dest="input_format", choices=sorted(SUPPORTED_FORMATS))
    parser.add_argument("--title")
    parser.add_argument("--source-url")
    parser.add_argument("--max-pages", type=int, help="PDF preview limit; marks output as partial")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    document = normalize_file(
        args.input,
        args.source_id,
        input_format=args.input_format,
        title=args.title,
        source_url=args.source_url,
        max_pages=args.max_pages,
    )
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "ok": True,
        "documentId": document["documentId"],
        "sourceId": document["sourceId"],
        "format": document["format"],
        "title": document["title"],
        "language": document["language"],
        "blocks": len(document["blocks"]),
        "warnings": document["metadata"]["warnings"],
        "output": output.as_posix(),
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"normalize failed: {error}", file=sys.stderr)
        raise SystemExit(1)

