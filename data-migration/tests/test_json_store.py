import json
from pathlib import Path
import pytest
from storage.json_store import JsonBatch


def test_crew_batch_saves_full_json(tmp_path, monkeypatch):
    monkeypatch.setattr("storage.json_store.STORAGE_BASE", tmp_path)
    batch = JsonBatch("crew")
    batch.save({"data": [1, 2, 3]})
    files = list(tmp_path.rglob("full.json"))
    assert len(files) == 1
    content = json.loads(files[0].read_text())
    assert content == {"data": [1, 2, 3]}


def test_ranged_batch_saves_with_date_filename(tmp_path, monkeypatch):
    monkeypatch.setattr("storage.json_store.STORAGE_BASE", tmp_path)
    batch = JsonBatch("pairing")
    batch.save([{"id": 1}], start_dt="2026-03-01", end_dt="2026-03-10")
    files = list(tmp_path.rglob("2026-03-01_2026-03-10.json"))
    assert len(files) == 1


def test_two_saves_create_separate_files(tmp_path, monkeypatch):
    monkeypatch.setattr("storage.json_store.STORAGE_BASE", tmp_path)
    batch = JsonBatch("pairing")
    batch.save([{"id": 1}], start_dt="2026-03-01", end_dt="2026-03-10")
    batch.save([{"id": 2}], start_dt="2026-03-11", end_dt="2026-03-20")
    files = list(tmp_path.rglob("*.json"))
    assert len(files) == 2
    # Both in same batch directory
    assert len({f.parent for f in files}) == 1


def test_two_batches_create_separate_dirs(tmp_path, monkeypatch):
    monkeypatch.setattr("storage.json_store.STORAGE_BASE", tmp_path)
    b1 = JsonBatch("flight")
    b1.save([], start_dt="2026-03-01", end_dt="2026-03-10")
    b2 = JsonBatch("flight")
    b2.save([], start_dt="2026-03-01", end_dt="2026-03-10")
    dirs = {f.parent for f in tmp_path.rglob("*.json")}
    assert len(dirs) == 2