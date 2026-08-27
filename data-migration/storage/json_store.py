import json
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

STORAGE_BASE = Path(__file__).parent.parent / 'storage' / 'raw'


class JsonBatch:
    """One instance per sync job. All API responses for that job share one batch dir."""

    def __init__(self, entity: str) -> None:
        now = datetime.now(timezone.utc)
        date_dir = now.strftime('%Y-%m-%d')
        batch_ts = now.strftime('%Y%m%d_%H%M%S')
        self._batch_dir = STORAGE_BASE / date_dir / f'{entity}_{batch_ts}_{int(time.time_ns() % 1000):03d}'
        self._batch_dir.mkdir(parents=True, exist_ok=True)

    def save(self, data: Any, start_dt: str | None = None, end_dt: str | None = None) -> Path:
        if start_dt and end_dt:
            filename = f'{start_dt}_{end_dt}.json'
        else:
            filename = 'full.json'
        file_path = self._batch_dir / filename
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2, default=str)
        return file_path

    @property
    def batch_dir(self) -> Path:
        return self._batch_dir
