"""
LegacyRO 运行目录准备工具。

外部 PBS rostering 优化器运行时需要在工作目录内提供:
  - tzdata/ 时区目录 + Database_connection.txt(来自 engine-server/<airline>/)
  - 4 个偏好 CSV(来自 live-server algorithm-export tgz)

tzdata/ 与 Database_connection.txt 不归档:move_to_complete 前由
cleanup_aux_files() 删除;偏好 CSV 保留随目录进 complete/。
"""
import io
import logging
import os
import shutil
import tarfile
from typing import List

logger = logging.getLogger(__name__)

AUX_DIR_NAME = "tzdata"
AUX_FILE_NAME = "Database_connection.txt"


def copy_aux_files(src_dir: str, working_dir: str) -> None:
    """把 <src_dir>/tzdata/ 和 <src_dir>/Database_connection.txt 复制到工作目录。

    Raises:
        FileNotFoundError: 源目录/文件缺失
    """
    src_tzdata = os.path.join(src_dir, AUX_DIR_NAME)
    src_dbconn = os.path.join(src_dir, AUX_FILE_NAME)
    if not os.path.isdir(src_tzdata):
        raise FileNotFoundError(f"aux dir missing: {src_tzdata}")
    if not os.path.isfile(src_dbconn):
        raise FileNotFoundError(f"aux file missing: {src_dbconn}")
    shutil.copytree(src_tzdata, os.path.join(working_dir, AUX_DIR_NAME), dirs_exist_ok=True)
    shutil.copy2(src_dbconn, os.path.join(working_dir, AUX_FILE_NAME))


def extract_preference_package(tgz_bytes: bytes, working_dir: str) -> List[str]:
    """把偏好包 tgz 的常规文件平铺解压到工作目录根,返回解出的文件名列表。

    成员路径含绝对路径或 `..` 时拒绝(防目录穿越);按 basename 落盘。

    Raises:
        ValueError: 包格式非法或含不安全路径
    """
    try:
        tar = tarfile.open(fileobj=io.BytesIO(tgz_bytes), mode="r:gz")
    except tarfile.TarError as e:
        raise ValueError(f"invalid preference package: {e}") from e

    extracted: List[str] = []
    with tar:
        for member in tar.getmembers():
            if member.name.startswith("/") or ".." in member.name.split("/"):
                raise ValueError(f"unsafe path in preference package: {member.name}")
            if not member.isfile():
                continue
            filename = os.path.basename(member.name)
            src = tar.extractfile(member)
            if src is None:
                continue
            with open(os.path.join(working_dir, filename), "wb") as out:
                shutil.copyfileobj(src, out)
            extracted.append(filename)
    return extracted


def cleanup_aux_files(working_dir: str) -> None:
    """归档前删除工作目录下的 tzdata/ 与 Database_connection.txt;失败仅记 warning。"""
    try:
        tz_dir = os.path.join(working_dir, AUX_DIR_NAME)
        if os.path.isdir(tz_dir):
            shutil.rmtree(tz_dir)
        dbconn = os.path.join(working_dir, AUX_FILE_NAME)
        if os.path.isfile(dbconn):
            os.remove(dbconn)
    except OSError as e:
        logger.warning("cleanup aux files failed (non-fatal): %s", e)
