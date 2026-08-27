from contextlib import contextmanager
from typing import Generator
import pymysql
from pymysql.cursors import DictCursor
from config import settings


def get_connection() -> pymysql.connections.Connection:
    return pymysql.connect(
        host=settings.mysql_host,
        port=settings.mysql_port,
        user=settings.mysql_user,
        password=settings.mysql_password,
        database=settings.mysql_database,
        cursorclass=DictCursor,
        autocommit=False,
        charset="utf8mb4",
    )


@contextmanager
def db_cursor() -> Generator:
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            yield cursor, conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def nextval(seq_name: str, cursor) -> int:
    cursor.execute(
        "UPDATE `sequence` SET current_val = current_val + 1 WHERE seq_name = %s",
        (seq_name,),
    )
    cursor.execute(
        "SELECT current_val FROM `sequence` WHERE seq_name = %s",
        (seq_name,),
    )
    return int(cursor.fetchone()["current_val"])


def batch_nextval(seq_name: str, n: int, cursor) -> list[int]:
    cursor.execute(
        "UPDATE `sequence` SET current_val = current_val + %s WHERE seq_name = %s",
        (n, seq_name),
    )
    cursor.execute(
        "SELECT current_val FROM `sequence` WHERE seq_name = %s",
        (seq_name,),
    )
    end_val: int = int(cursor.fetchone()["current_val"])
    return list(range(end_val - n + 1, end_val + 1))