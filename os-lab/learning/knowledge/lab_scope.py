"""Deterministic Lab-scope suggestions for shared teaching references."""

from __future__ import annotations

import fnmatch
import json
import re
from collections import defaultdict
from pathlib import Path
from typing import Any


RULES = json.loads((Path(__file__).with_name("lab-scope-rules.json")).read_text(encoding="utf-8"))
LAB_RE = re.compile(r"(?:^|[/\\])lab([1-8])(?:[/\\]|[-_.]|$)", re.I)


def _path_key(value: str) -> str:
    normalized = str(value or "").replace("\\", "/")
    return normalized.lower()


def _hits(terms: list[str], value: str) -> list[str]:
    lowered = str(value or "").lower()
    return [term for term in terms if str(term).lower() in lowered]


def infer_lab_scopes(source_id: str, source_path: str, section_path: list[str], text: str) -> tuple[list[str], list[dict[str, Any]]]:
    """Return global plus high-confidence derived Lab bindings.

    Explicit Lab paths remain authoritative. Public references keep ``global``
    and receive additional Lab bindings only when a source chapter rule or
    repeated section/text terminology supports the suggestion.
    """
    path = _path_key(source_path)
    explicit = LAB_RE.search(path)
    if explicit:
        lab_id = f"lab{explicit.group(1)}"
        return [lab_id], [{"labId": lab_id, "confidence": 1.0, "reason": f"由来源路径明确归属 {lab_id}"}]

    section = " > ".join(section_path or [])
    title_context = f"{section}\n{source_path}"
    body = str(text or "")
    scores: dict[str, float] = defaultdict(float)
    evidence: dict[str, list[str]] = defaultdict(list)
    confidence: dict[str, float] = {}

    for rule in RULES.get("sourceRules", []):
        if str(rule.get("sourceId")) != source_id:
            continue
        if not fnmatch.fnmatch(path, str(rule.get("pattern", "")).lower()):
            continue
        for lab_id in rule.get("labs", []):
            scores[lab_id] += 8.0
            evidence[lab_id].append(str(rule.get("reason") or "来源章节规则"))
            confidence[lab_id] = max(confidence.get(lab_id, 0.0), float(rule.get("confidence", 0.75)))

    for lab_id, rule in RULES.get("labs", {}).items():
        terms = [str(term) for term in rule.get("terms", [])]
        section_hits = _hits(terms, section)
        path_hits = _hits(terms, title_context)
        body_hits = _hits(terms, body)
        if section_hits:
            scores[lab_id] += min(9.0, len(section_hits) * 3.0)
            evidence[lab_id].append(f"章节命中：{'、'.join(section_hits[:4])}")
        if path_hits and not section_hits:
            scores[lab_id] += min(4.0, len(path_hits) * 2.0)
            evidence[lab_id].append(f"来源路径命中：{'、'.join(path_hits[:4])}")
        if body_hits:
            scores[lab_id] += min(6.0, len(body_hits) * 1.0)
            evidence[lab_id].append(f"正文命中：{'、'.join(body_hits[:5])}")

    ranked = sorted(scores.items(), key=lambda item: (-item[1], item[0]))
    selected: list[str] = []
    if ranked:
        top_score = ranked[0][1]
        selected = [lab_id for lab_id, score in ranked if score >= 3.0 and score >= top_score * 0.6][:3]

    bindings: list[dict[str, Any]] = []
    for lab_id in selected:
        score = scores[lab_id]
        bindings.append({
            "labId": lab_id,
            "confidence": round(min(0.95, max(confidence.get(lab_id, 0.0), 0.5 + score * 0.04)), 2),
            "reason": "；".join(dict.fromkeys(evidence[lab_id]))[:240],
        })
    return ["global", *selected], bindings
