"""Fetch pinned, text-only snapshots for the canonical remote sources."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import tempfile
import urllib.request
import zipfile
from pathlib import Path, PurePosixPath


REMOTE_SOURCE_EXTENSIONS = {
    "ostep-zh-local-complete": {".pdf"},
    "learningos-os-lectures-source": {".md", ".markdown", ".html", ".htm"},
    "rcore-tutorial-guide-web": {".md", ".markdown", ".html", ".htm", ".rst"},
    "csapp-gitbook-zh": {".md", ".markdown", ".html", ".htm"},
}


def fetch_file_collection(source_id: str, record: dict[str, object], snapshot_root: Path) -> dict[str, object]:
    target = (snapshot_root / source_id).resolve()
    if target.parent != snapshot_root.resolve():
        raise ValueError(f"unsafe snapshot target: {target}")
    template = str(record.get("urlTemplate") or "")
    files = [str(value) for value in record.get("downloadFiles", [])]
    if "{file}" not in template or not files:
        raise ValueError(f"{source_id} requires urlTemplate and downloadFiles")
    if target.exists():
        shutil.rmtree(target)
    target.mkdir(parents=True)
    downloaded: list[dict[str, object]] = []
    for filename in files:
        relative = PurePosixPath(filename)
        if relative.is_absolute() or ".." in relative.parts or relative.suffix.lower() not in REMOTE_SOURCE_EXTENSIONS[source_id]:
            raise ValueError(f"unsafe collection file: {filename}")
        url = template.replace("{file}", relative.as_posix())
        destination = target.joinpath(*relative.parts)
        request = urllib.request.Request(url, headers={"User-Agent": "os-lab-knowledge-builder/1"})
        with urllib.request.urlopen(request, timeout=180) as response, destination.open("wb") as output:
            shutil.copyfileobj(response, output)
        raw = destination.read_bytes()
        downloaded.append({"path": relative.as_posix(), "url": url, "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()})
    metadata = {"schemaVersion": 1, "sourceId": source_id, "files": downloaded}
    (target / "snapshot.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"sourceId": source_id, "files": len(downloaded), "path": target.as_posix()}


def fetch_source(source_id: str, config: dict[str, object], snapshot_root: Path) -> dict[str, object]:
    target = (snapshot_root / source_id).resolve()
    root = snapshot_root.resolve()
    if target.parent != root:
        raise ValueError(f"unsafe snapshot target: {target}")
    commit = str(config["commit"])
    url = f"https://codeload.github.com/{config['repo']}/zip/{commit}"
    request = urllib.request.Request(url, headers={"User-Agent": "os-lab-knowledge-builder/1"})
    with tempfile.NamedTemporaryFile(prefix=f"{source_id}-", suffix=".zip", delete=False) as temporary:
        archive_path = Path(temporary.name)
        with urllib.request.urlopen(request, timeout=180) as response:
            shutil.copyfileobj(response, temporary)
    try:
        if target.exists():
            shutil.rmtree(target)
        target.mkdir(parents=True)
        files: list[str] = []
        extensions = set(config["extensions"])
        with zipfile.ZipFile(archive_path) as archive:
            for member in archive.infolist():
                relative_parts = PurePosixPath(member.filename).parts[1:]
                if member.is_dir() or not relative_parts:
                    continue
                relative = PurePosixPath(*relative_parts)
                if relative.suffix.lower() not in extensions or ".." in relative.parts:
                    continue
                destination = target.joinpath(*relative.parts)
                destination.parent.mkdir(parents=True, exist_ok=True)
                with archive.open(member) as source, destination.open("wb") as output:
                    shutil.copyfileobj(source, output)
                files.append(relative.as_posix())
        metadata = {
            "schemaVersion": 1,
            "sourceId": source_id,
            "repository": f"https://github.com/{config['repo']}",
            "commit": commit,
            "archiveUrl": url,
            "files": sorted(files),
        }
        (target / "snapshot.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return {"sourceId": source_id, "commit": commit, "files": len(files), "path": target.as_posix()}
    finally:
        archive_path.unlink(missing_ok=True)


def main() -> int:
    script = Path(__file__).resolve()
    workspace = script.parents[3]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace-root", type=Path, default=workspace)
    parser.add_argument("--source", action="append", choices=sorted(REMOTE_SOURCE_EXTENSIONS))
    args = parser.parse_args()
    root = args.workspace_root / "os-lab" / "learning" / "knowledge" / "build" / "snapshots"
    inventory_path = args.workspace_root / "os-lab" / "learning" / "knowledge" / "sources.json"
    inventory = json.loads(inventory_path.read_text(encoding="utf-8"))
    records = {item["id"]: item for item in inventory.get("sources", [])}
    selected = args.source or list(REMOTE_SOURCE_EXTENSIONS)
    configurations = {}
    for source_id in selected:
        record = records[source_id]
        if record.get("downloadFiles"):
            configurations[source_id] = {"fileCollection": True, "record": record}
            continue
        repository = str(record.get("snapshotRepository") or record.get("url") or "")
        prefix = "https://github.com/"
        if not repository.startswith(prefix) or not record.get("pinnedCommit"):
            raise ValueError(f"{source_id} requires snapshotRepository and pinnedCommit in sources.json")
        configurations[source_id] = {
            "repo": repository[len(prefix):].rstrip("/"),
            "commit": record["pinnedCommit"],
            "extensions": REMOTE_SOURCE_EXTENSIONS[source_id],
        }
    results = [
        fetch_file_collection(source_id, configurations[source_id]["record"], root)
        if configurations[source_id].get("fileCollection")
        else fetch_source(source_id, configurations[source_id], root)
        for source_id in selected
    ]
    print(json.dumps({"ok": True, "sources": results}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
