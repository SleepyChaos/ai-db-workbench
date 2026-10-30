#!/usr/bin/env python3
"""Download public database fixtures into local ignored storage.

This script deliberately downloads source data; it does not synthesize or mutate rows.
"""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
LOCAL = ROOT / "local"

SOURCES = {
    "mysql": {
        "url": "https://github.com/datacharmer/test_db/archive/refs/heads/master.tar.gz",
        "filename": "employees.tar.gz",
    },
    "mongodb": {
        "url": "https://atlas-education.s3.amazonaws.com/sampledata.archive",
        "filename": "sampledata.archive",
    },
    "redis": {
        "url": "https://raw.githubusercontent.com/redis-developer/redis-datasets/master/core/hashes/worldcities.csv",
        "filename": "worldcities.csv",
    },
    "cassandra": {
        "url": "https://data.gharchive.org/2015-01-01-15.json.gz",
        "filename": "github-events-2015-01-01-15.json.gz",
    },
    "neo4j": {
        "url": "https://raw.githubusercontent.com/neo4j-graph-examples/stackoverflow/main/data/stackoverflow-43.dump",
        "filename": "stackoverflow-43.dump",
    },
    "influxdb": {
        "url": "https://github.com/influxdata/influxdb2-sample-data/archive/refs/heads/master.tar.gz",
        "filename": "influxdb2-sample-data.tar.gz",
    },
    "elasticsearch": {
        "url": "https://data.cityofnewyork.us/resource/h9gi-nx95.csv?$limit=20000",
        "filename": "nyc_collision_data.csv",
    },
    "clickhouse": {
        "url": "https://d37ci6vzurychx.cloudfront.net/trip-data/yellow_tripdata_2024-01.parquet",
        "filename": "yellow_tripdata_2024-01.parquet",
    },
    "milvus": {
        "url": "ftp://ftp.irisa.fr/local/texmex/corpus/siftsmall.tar.gz",
        "filename": "siftsmall.tar.gz",
    },
}


def download(url: str, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    partial = target.with_suffix(target.suffix + ".partial")
    partial.unlink(missing_ok=True)
    subprocess.run(
        ["curl", "--fail", "--location", "--retry", "4", "--retry-all-errors", "--connect-timeout", "20", "--max-time", "1800", "--user-agent", "ai-db-workbench-fixtures/1.0", "--output", str(partial), url],
        check=True,
    )
    partial.replace(target)


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def fetch(name: str) -> None:
    if name not in SOURCES:
        raise SystemExit(f"unknown database: {name}; choose one of {', '.join(SOURCES)}")
    spec = SOURCES[name]
    target = LOCAL / name / spec["filename"]
    manifest_path = target.parent / "manifest.json"
    if target.exists() and target.stat().st_size > 0 and manifest_path.exists():
        print(f"exists: {target} ({target.stat().st_size} bytes)")
    else:
        print(f"download: {spec['url']}")
        download(spec["url"], target)
    checksum = digest(target)
    manifest = {"database": name, "url": spec["url"], "file": str(target.relative_to(ROOT)), "bytes": target.stat().st_size, "sha256": checksum}
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2))


def main() -> None:
    names = sys.argv[1:] or ["all"]
    if names in (["-h"], ["--help"]):
        print("usage: python3 fixtures/fetch.py [all|mysql|mongodb|redis|cassandra|neo4j|influxdb|elasticsearch|clickhouse|milvus ...]")
        return
    if names == ["all"]:
        names = list(SOURCES)
    for name in names:
        fetch(name)


if __name__ == "__main__":
    main()
