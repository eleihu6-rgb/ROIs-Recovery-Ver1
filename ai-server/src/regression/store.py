import json
from pathlib import Path
from typing import Any

from src.regression.flakiness import instability, should_release

RECENT_WINDOW = 20
MAX_VERSIONS = 50
MAX_ROUNDS_PER_VERSION = 50


def _now() -> str:
    # Caller may pass timestamps; default empty to keep store pure/testable.
    return ''


class RegressionStore:
    def __init__(self, path: str | Path):
        self.path = Path(path)
        self._data = self._load()

    def _load(self) -> dict[str, Any]:
        data: dict[str, Any] = {'next_id': 1001, 'tests': []}
        if self.path.exists():
            try:
                data = json.loads(self.path.read_text())
            except (json.JSONDecodeError, OSError):
                pass
        for t in data.get('tests', []):
            t.setdefault('recent_results', [])
            t.setdefault('quarantined', False)
            t.setdefault('instability', 0.0)
            t.setdefault('created_by', 'AI')  # baseline creator for pre-actor-tracking tests
            t.setdefault('story', '')
            t.setdefault('conditions', [])
            t.setdefault('entity_intents', [])
            self._normalize_versions(t)
        return data

    def _version_snapshot(self, t: dict[str, Any], *, version: int, trigger: str,
                          code: str = '', timestamp: str | None = None,
                          modified_by: str = '', applied_by: str = '') -> dict[str, Any]:
        return {
            'version': version,
            'timestamp': _now() if timestamp is None else timestamp,
            'trigger': trigger,
            'modified_by': modified_by,
            'applied_by': applied_by,
            'title': t.get('title', ''),
            'category': t.get('category', ''),
            'priority': t.get('priority', ''),
            'description': t.get('description', ''),
            'spec_file': t.get('spec_file', ''),
            'test_name': t.get('test_name', ''),
            'code': code,
            'rounds': [],
        }

    def _normalize_versions(self, t: dict[str, Any]) -> None:
        raw_versions = t.get('versions') or []
        normalized: list[dict[str, Any]] = []
        legacy_rounds: list[dict[str, Any]] = []
        for raw in raw_versions:
            if 'rounds' in raw or raw.get('trigger') != 'run':
                version = {
                    'version': int(raw.get('version') or len(normalized) + 1),
                    'timestamp': raw.get('timestamp', ''),
                    'trigger': raw.get('trigger', 'created'),
                    'modified_by': raw.get('modified_by', ''),
                    'applied_by': raw.get('applied_by', ''),
                    'title': raw.get('title', t.get('title', '')),
                    'category': raw.get('category', t.get('category', '')),
                    'priority': raw.get('priority', t.get('priority', '')),
                    'description': raw.get('description', t.get('description', '')),
                    'spec_file': raw.get('spec_file', t.get('spec_file', '')),
                    'test_name': raw.get('test_name', t.get('test_name', '')),
                    'code': raw.get('code', ''),
                    'rounds': raw.get('rounds', [])[-MAX_ROUNDS_PER_VERSION:],
                }
                normalized.append(version)
            else:
                legacy_rounds.append({
                    'round': 0,
                    'run_id': raw.get('run_id', ''),
                    'status': raw.get('status', ''),
                    'run_at': raw.get('run_at', ''),
                    'duration_ms': raw.get('duration_ms', 0),
                    'log': raw.get('log', ''),
                    'has_trace': raw.get('has_trace', False),
                    'details': raw.get('details', {'summary': raw.get('log', ''), 'steps': [], 'artifacts': []}),
                })

        if not normalized:
            normalized = [self._version_snapshot(t, version=1, trigger='created',
                                                 modified_by=t.get('created_by', 'AI'))]

        if legacy_rounds:
            target = normalized[-1]
            start = len(target.get('rounds', [])) + 1
            for offset, round_entry in enumerate(legacy_rounds):
                round_entry['round'] = start + offset
                target.setdefault('rounds', []).append(round_entry)
            target['rounds'] = target['rounds'][-MAX_ROUNDS_PER_VERSION:]

        for idx, version in enumerate(normalized, start=1):
            version['version'] = idx
            version.setdefault('rounds', [])

        t['versions'] = normalized[-MAX_VERSIONS:]
        t['active_version'] = int(t.get('active_version') or t['versions'][-1]['version'])
        if not any(v['version'] == t['active_version'] for v in t['versions']):
            t['active_version'] = t['versions'][-1]['version']

    def _save(self) -> None:
        self.path.write_text(json.dumps(self._data, indent=2))

    def list_tests(self) -> list[dict[str, Any]]:
        return self._data['tests']

    def get_test(self, test_id: int) -> dict[str, Any] | None:
        return next((t for t in self._data['tests'] if t['id'] == test_id), None)

    def update_conditions(self, test_id: int, conditions: list[str]) -> dict[str, Any] | None:
        t = self.get_test(test_id)
        if t is None:
            return None
        t['conditions'] = conditions
        t['updated_at'] = _now()
        self._save()
        return t

    def update_story(self, test_id: int, story: str) -> dict[str, Any] | None:
        t = self.get_test(test_id)
        if t is None:
            return None
        t['story'] = story
        t['updated_at'] = _now()
        self._save()
        return t

    def create_test(self, *, title: str, category: str, priority: str, description: str,
                    source: str = 'User', created_by: str = 'AI') -> dict[str, Any]:
        test_id = self._data['next_id']
        self._data['next_id'] += 1
        test = {
            'id': test_id, 'title': title, 'spec_file': 'manual', 'test_name': '',
            'category': category, 'source': source, 'priority': priority, 'description': description,
            'created_by': created_by,
            'created_at': _now(), 'updated_at': _now(),
            'last_status': None, 'last_run_at': None, 'last_duration_ms': None, 'last_log': None,
            'run_count': 0, 'pass_count': 0, 'fail_count': 0,
            'total_duration_ms': 0, 'flakiness_score': 0.0,
            'recent_results': [], 'quarantined': False, 'instability': 0.0,
            'story': '',
            'conditions': [],
            'entity_intents': [],
            'active_version': 1,
            'versions': [],
        }
        test['versions'].append(self._version_snapshot(test, version=1, trigger='created',
                                                       modified_by=created_by))
        self._data['tests'].append(test)
        self._save()
        return test

    def update_test(self, test_id: int, **fields: Any) -> dict[str, Any] | None:
        t = self.get_test(test_id)
        if t is None:
            return None
        # kwargs with value None are treated as "no change"; pass explicit False to clear quarantined.
        version_fields = {'title', 'category', 'priority', 'description', 'spec_file', 'test_name'}
        changed_version_field = False
        for k in ('title', 'category', 'priority', 'description', 'spec_file', 'test_name', 'quarantined'):
            if k in fields and fields[k] is not None:
                if k in version_fields and t.get(k) != fields[k]:
                    changed_version_field = True
                t[k] = fields[k]
        t['updated_at'] = _now()
        if changed_version_field:
            self.create_version(test_id, trigger=fields.get('trigger', 'edit'),
                                code=fields.get('code', ''),
                                modified_by=fields.get('modified_by', ''),
                                applied_by=fields.get('applied_by', ''),
                                persist=False)
        self._save()
        return t

    def update_entity_intents(self, test_id: int, intents: list[dict]) -> dict[str, Any] | None:
        t = self.get_test(test_id)
        if t is None:
            return None
        t['entity_intents'] = intents
        t['updated_at'] = _now()
        self._save()
        return t

    def delete_test(self, test_id: int) -> bool:
        before = len(self._data['tests'])
        self._data['tests'] = [t for t in self._data['tests'] if t['id'] != test_id]
        changed = len(self._data['tests']) != before
        if changed:
            self._save()
        return changed

    def create_version(self, test_id: int, *, trigger: str, code: str = '',
                       modified_by: str = '', applied_by: str = '',
                       persist: bool = True) -> dict[str, Any] | None:
        t = self.get_test(test_id)
        if t is None:
            return None
        self._normalize_versions(t)
        version_num = t['versions'][-1]['version'] + 1 if t['versions'] else 1
        version = self._version_snapshot(t, version=version_num, trigger=trigger, code=code,
                                         modified_by=modified_by, applied_by=applied_by)
        t['versions'].append(version)
        t['versions'] = t['versions'][-MAX_VERSIONS:]
        t['active_version'] = t['versions'][-1]['version']
        if persist:
            self._save()
        return version

    def append_version(self, test_id: int, *, trigger: str, code: str = '', status: str = '',
                       log: str = '', duration_ms: int = 0, run_at: str = '',
                       tester: str = '', modified_by: str = '', applied_by: str = '',
                       persist: bool = True) -> None:
        if trigger == 'run':
            self.record_round(test_id, status=status, duration_ms=duration_ms, log=log,
                              run_at=run_at, tester=tester, persist=persist)
            return
        self.create_version(test_id, trigger=trigger, code=code,
                            modified_by=modified_by, applied_by=applied_by, persist=persist)

    def _active_version(self, t: dict[str, Any], version: int | None = None) -> dict[str, Any]:
        self._normalize_versions(t)
        selected = version or t.get('active_version') or t['versions'][-1]['version']
        found = next((v for v in t['versions'] if v['version'] == selected), None)
        return found or t['versions'][-1]

    def record_round(self, test_id: int, *, status: str, duration_ms: int, log: str,
                     run_at: str = '', run_id: str = '', details: dict[str, Any] | None = None,
                     has_trace: bool = False, tester: str = '', version: int | None = None,
                     persist: bool = True) -> dict[str, Any] | None:
        t = self.get_test(test_id)
        if t is None:
            return None
        target = self._active_version(t, version)
        rounds = target.setdefault('rounds', [])
        round_entry = {
            'round': (rounds[-1]['round'] + 1) if rounds else 1,
            'run_id': run_id,
            'status': status,
            'run_at': run_at,
            'duration_ms': duration_ms,
            'log': log,
            'has_trace': has_trace,
            'tester': tester,
            'details': details or {'summary': log, 'steps': [], 'artifacts': []},
        }
        rounds.append(round_entry)
        target['rounds'] = rounds[-MAX_ROUNDS_PER_VERSION:]
        if persist:
            self._save()
        return round_entry

    def delete_snapshot(self, run_id: str, filename: str) -> bool:
        """Mark a snapshot artifact deleted across all tests/versions/rounds with matching run_id."""
        changed = False
        for t in self._data['tests']:
            for v in t.get('versions', []):
                for r in v.get('rounds', []):
                    if r.get('run_id') != run_id:
                        continue
                    for art in (r.get('details') or {}).get('artifacts', []):
                        if art.get('filename') == filename and not art.get('deleted'):
                            art['deleted'] = True
                            changed = True
        if changed:
            self._save()
        return changed

    def record_run(self, test_id: int, *, status: str, duration_ms: int, log: str,
                   run_at: str = '', run_id: str = '',
                   details: dict[str, Any] | None = None,
                   has_trace: bool = False, tester: str = '',
                   version: int | None = None) -> None:
        t = self.get_test(test_id)
        if t is None:
            return
        t['run_count'] += 1
        if status == 'pass':
            t['pass_count'] += 1
        else:
            t['fail_count'] += 1
        t['total_duration_ms'] += duration_ms
        t['last_status'] = status
        t['last_run_at'] = run_at
        t['last_duration_ms'] = duration_ms
        t['last_log'] = log
        if status == 'flaky':
            # passed on retry — counts as a pass in totals, recorded as 'flaky' in the window
            t['fail_count'] -= 1
            t['pass_count'] += 1
        t['recent_results'] = (t['recent_results'] + [status])[-RECENT_WINDOW:]
        t['instability'] = instability(t['recent_results'])
        if should_release(t['recent_results'], quarantined=t['quarantined']):
            t['quarantined'] = False
        t['flakiness_score'] = round(t['fail_count'] / t['run_count'], 3) if t['run_count'] else 0.0
        self.record_round(test_id, status=status, duration_ms=duration_ms, log=log,
                          run_at=run_at, run_id=run_id, details=details,
                          has_trace=has_trace, tester=tester, version=version, persist=False)
        self._save()
