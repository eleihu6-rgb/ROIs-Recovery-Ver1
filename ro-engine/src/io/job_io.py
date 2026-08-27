import csv
import gzip
import io
from typing import BinaryIO


def read_input_gz(source: BinaryIO) -> dict[str, list[dict]]:
    """Read a gzip file containing ## SECTION_NAME blocks of CSV."""
    with gzip.GzipFile(fileobj=source, mode="rb") as gz:
        text = gz.read().decode("utf-8")

    sections: dict[str, list[dict]] = {}
    current_section: str | None = None
    current_lines: list[str] = []

    def _flush() -> None:
        if current_section is not None:
            reader = csv.DictReader(current_lines)
            sections[current_section] = list(reader)

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if line.startswith("## "):
            _flush()
            current_section = line[3:].strip()
            current_lines = []
        elif not line or line.startswith("#"):
            continue
        else:
            current_lines.append(raw_line)

    _flush()
    return sections


def write_output_gz(dest: BinaryIO, sections: dict[str, list[dict]]) -> None:
    """Write result sections into gzip using ## SECTION_NAME CSV format."""
    buf = io.StringIO()
    for section_name, rows in sections.items():
        buf.write(f"## {section_name}\n")
        if rows:
            writer = csv.DictWriter(buf, fieldnames=list(rows[0].keys()), lineterminator="\n")
            writer.writeheader()
            writer.writerows(rows)
        buf.write("\n")

    with gzip.GzipFile(fileobj=dest, mode="wb") as gz:
        gz.write(buf.getvalue().encode("utf-8"))
