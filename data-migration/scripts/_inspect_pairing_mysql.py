"""One-off: print SHOW CREATE TABLE for legacy pairing tables (run from data-migration/)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pymysql
from pymysql.cursors import DictCursor

from config import settings

TABLES = [
    "pairing",
    "pairing_composition",
    "pairing_duty",
    "pairing_duty_node",
    "pairing_duty_segment",
]


def main() -> None:
    conn = pymysql.connect(
        host=settings.mysql_host,
        port=settings.mysql_port,
        user=settings.mysql_user,
        password=settings.mysql_password,
        database=settings.mysql_database,
        charset="utf8mb4",
        cursorclass=DictCursor,
    )
    try:
        with conn.cursor() as cur:
            cur.execute("SHOW TABLES LIKE 'pairing%%'")
            found = [next(iter(r.values())) for r in cur.fetchall()]
            print("Tables matching pairing%:", found)
            for t in TABLES:
                if t not in found:
                    print(f"\n--- {t} NOT IN DATABASE ---")
                    continue
                cur.execute("SHOW CREATE TABLE `%s`" % t.replace("`", ""))
                row = cur.fetchone()
                ddl_key = "Create Table" if "Create Table" in row else list(row.keys())[-1]
                print(f"\n========== {t} ==========")
                print(row[ddl_key])
    finally:
        conn.close()


if __name__ == "__main__":
    main()
