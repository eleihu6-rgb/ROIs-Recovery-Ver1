"""Parse a legacy ro_input.txt into sections for golden comparison."""
from __future__ import annotations

import re
from dataclasses import dataclass

_HEADER_RE = re.compile(r"^------([A-Za-z]+)\((\d+)\)(?:\(([^)]+)\))?:(.*)$")


@dataclass
class Section:
    name: str
    variant: str | None
    count: int
    columns: list[str]
    rows: list[list[str]]

    @property
    def key(self) -> str:
        return f"{self.name}({self.variant})" if self.variant else self.name


def parse_text(text: str) -> dict[str, Section]:
    sections: dict[str, Section] = {}
    current: Section | None = None
    for line in text.splitlines():
        m = _HEADER_RE.match(line)
        if m:
            name, count, variant, cols = m.group(1), int(m.group(2)), m.group(3), m.group(4)
            current = Section(name, variant, count, cols.split(","), [])
            sections[current.key] = current
        elif current is not None and line != "":
            current.rows.append(line.split("^"))
    return sections


def parse_file(path: str) -> dict[str, Section]:
    with open(path, "r", encoding="utf-8") as f:
        return parse_text(f.read())
