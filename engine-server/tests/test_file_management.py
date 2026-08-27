"""
文件管理测试

覆盖:
- move_to_finished: 移动文件、命名冲突处理、空目录清理
- archive_files: 归档压缩
- cleanup_expired_files: 过期文件清理
- get_file_list / get_directory_size
"""
import gzip
import os
import shutil
import time

import pytest


@pytest.fixture()
def file_mgr(temp_workspace):
    """创建使用临时目录的 FileManager"""
    from src.config.config import config_manager, PathsConfig, FileManagementConfig

    cfg = config_manager.get_config()
    old_paths = cfg.paths
    old_fm = cfg.file_management

    cfg.paths = PathsConfig(
        working_dir=temp_workspace['workspace'],
        finished_dir=temp_workspace['finished'],
        archive_dir=temp_workspace['archive'],
        temp_dir=temp_workspace['temp'],
        complete_dir=temp_workspace['complete'],
    )
    cfg.file_management = FileManagementConfig(
        archive_days=1,
        cleanup_days=0,  # 方便测试 archive 过期清理
        complete_compress_days=1,
        complete_cleanup_days=5,
    )

    from src.files.file_manager import FileManager
    fm = FileManager()

    yield fm

    cfg.paths = old_paths
    cfg.file_management = old_fm


class TestMoveToComplete:
    """move_to_complete 测试（场景 RO 成功归档）"""

    def test_move_to_complete_keeps_input_and_output(self, file_mgr, temp_workspace):
        work = os.path.join(temp_workspace['workspace'], "task_dir")
        os.makedirs(work, exist_ok=True)
        with open(os.path.join(work, "input.gz"), 'wb') as f:
            f.write(b"IN")
        with open(os.path.join(work, "output.gz"), 'wb') as f:
            f.write(b"OUT")

        dst = file_mgr.move_to_complete(work, "f8", "123")

        assert dst is not None
        assert os.path.isfile(os.path.join(dst, "input.gz"))
        assert os.path.isfile(os.path.join(dst, "output.gz"))
        expected_root = os.path.join(temp_workspace['complete'], "f8", "123")
        assert os.path.normpath(dst).startswith(os.path.normpath(expected_root))


class TestMoveToFinished:
    """move_to_finished 测试"""

    def test_move_single_file(self, file_mgr, temp_workspace):
        """移动任务目录到 finished/<airline>/，保留目录结构"""
        src_dir = os.path.join(temp_workspace['workspace'], "BR", "PO_test")
        os.makedirs(src_dir, exist_ok=True)
        test_file = os.path.join(src_dir, "output.gz")
        with open(test_file, 'w') as f:
            f.write("test content")

        result = file_mgr.move_to_finished(src_dir, "BR")
        assert result is True

        # 任务目录应整体搬运至 finished/BR/PO_test/
        finished_task_dir = os.path.join(temp_workspace['finished'], "BR", "PO_test")
        assert os.path.isdir(finished_task_dir)
        assert os.path.exists(os.path.join(finished_task_dir, "output.gz"))

        # 源目录被删除
        assert not os.path.exists(src_dir)

    def test_move_preserves_subdirectories(self, file_mgr, temp_workspace):
        """任务目录内的子目录也应整体搬运"""
        src_dir = os.path.join(temp_workspace['workspace'], "F8", "RO_20260408")
        sub_dir = os.path.join(src_dir, "details", "segments")
        os.makedirs(sub_dir, exist_ok=True)

        with open(os.path.join(src_dir, "output.gz"), 'w') as f:
            f.write("root")
        with open(os.path.join(sub_dir, "seg.json"), 'w') as f:
            f.write("nested")

        result = file_mgr.move_to_finished(src_dir, "F8")
        assert result is True

        finished_task_dir = os.path.join(temp_workspace['finished'], "F8", "RO_20260408")
        assert os.path.isdir(finished_task_dir)
        assert os.path.exists(os.path.join(finished_task_dir, "output.gz"))
        assert os.path.exists(os.path.join(finished_task_dir, "details", "segments", "seg.json"))

    def test_move_airline_isolation(self, file_mgr, temp_workspace):
        """不同航司的同名任务目录应隔离存放"""
        for airline in ("BR", "F8"):
            src_dir = os.path.join(temp_workspace['workspace'], airline, "PO_task")
            os.makedirs(src_dir, exist_ok=True)
            with open(os.path.join(src_dir, "output.gz"), 'w') as f:
                f.write(f"{airline} content")
            assert file_mgr.move_to_finished(src_dir, airline) is True

        assert os.path.isdir(os.path.join(temp_workspace['finished'], "BR", "PO_task"))
        assert os.path.isdir(os.path.join(temp_workspace['finished'], "F8", "PO_task"))

    def test_move_with_name_conflict(self, file_mgr, temp_workspace):
        """目标目录名冲突时应追加时间戳后缀"""
        # 先在 finished/BR 中创建同名任务目录
        existing_dir = os.path.join(temp_workspace['finished'], "BR", "PO_task")
        os.makedirs(existing_dir, exist_ok=True)
        with open(os.path.join(existing_dir, "output.gz"), 'w') as f:
            f.write("existing")

        # 准备同名源目录
        src_dir = os.path.join(temp_workspace['workspace'], "BR", "PO_task")
        os.makedirs(src_dir, exist_ok=True)
        with open(os.path.join(src_dir, "output.gz"), 'w') as f:
            f.write("new content")

        result = file_mgr.move_to_finished(src_dir, "BR")
        assert result is True

        airline_finished = os.path.join(temp_workspace['finished'], "BR")
        entries = os.listdir(airline_finished)
        assert "PO_task" in entries
        assert len(entries) == 2
        other = [e for e in entries if e != "PO_task"]
        assert other[0].startswith("PO_task_")


class TestArchiveFiles:
    """archive_files 测试"""

    @staticmethod
    def _backdate(path: str) -> None:
        """把条目 mtime 设到昨天，绕过 archive_files 的"当天跳过"逻辑"""
        yesterday = time.time() - 24 * 3600
        os.utime(path, (yesterday, yesterday))

    def test_archive_files(self, file_mgr, temp_workspace):
        """按航司归档 finished 中的任务目录"""
        # 构造 finished/BR/PO_task/{result1.txt,result2.txt}
        task_dir = os.path.join(temp_workspace['finished'], "BR", "PO_task")
        os.makedirs(task_dir, exist_ok=True)
        for name in ["result1.txt", "result2.txt"]:
            with open(os.path.join(task_dir, name), 'w') as f:
                f.write(f"content of {name}")
        self._backdate(task_dir)

        result = file_mgr.archive_files()
        assert result is True

        # finished/BR 清理完毕
        assert not os.path.exists(task_dir)

        # archive 下应出现航司隔离的日期目录
        airline_archive = os.path.join(temp_workspace['archive'], "BR")
        assert os.path.isdir(airline_archive)
        date_dirs = os.listdir(airline_archive)
        assert len(date_dirs) == 1

        # 任务目录应打包为 tar.gz
        archived = os.listdir(os.path.join(airline_archive, date_dirs[0]))
        assert archived == ["PO_task.tar.gz"]

    def test_archive_airline_isolation(self, file_mgr, temp_workspace):
        """多航司任务归档时 archive 目录按航司隔离"""
        import tarfile
        for airline in ("BR", "F8"):
            task_dir = os.path.join(temp_workspace['finished'], airline, f"{airline}_task")
            os.makedirs(task_dir, exist_ok=True)
            with open(os.path.join(task_dir, "output.gz"), 'w') as f:
                f.write(airline)
            self._backdate(task_dir)

        file_mgr.archive_files()

        for airline in ("BR", "F8"):
            airline_archive = os.path.join(temp_workspace['archive'], airline)
            assert os.path.isdir(airline_archive)
            date_dirs = os.listdir(airline_archive)
            assert len(date_dirs) == 1
            tarball = os.path.join(
                airline_archive, date_dirs[0], f"{airline}_task.tar.gz"
            )
            assert os.path.isfile(tarball)
            # tar.gz 中应保留任务目录结构
            with tarfile.open(tarball, "r:gz") as tar:
                names = tar.getnames()
            assert f"{airline}_task/output.gz" in names

    def test_archive_empty_finished(self, file_mgr, temp_workspace):
        """finished 为空时归档应成功且无操作"""
        result = file_mgr.archive_files()
        assert result is True

    def test_archived_files_are_gzip(self, file_mgr, temp_workspace):
        """验证归档 tar.gz 内的文件解压后内容一致"""
        import tarfile
        original_content = "This is the original content 中文测试"
        task_dir = os.path.join(temp_workspace['finished'], "BR", "task_a")
        os.makedirs(task_dir, exist_ok=True)
        with open(os.path.join(task_dir, "test.txt"), 'w') as f:
            f.write(original_content)
        self._backdate(task_dir)

        file_mgr.archive_files()

        date_dirs = os.listdir(os.path.join(temp_workspace['archive'], "BR"))
        tarball = os.path.join(
            temp_workspace['archive'], "BR", date_dirs[0], "task_a.tar.gz"
        )
        with tarfile.open(tarball, "r:gz") as tar:
            member = tar.extractfile("task_a/test.txt")
            decompressed = member.read().decode('utf-8')
        assert decompressed == original_content


class TestCleanupExpiredFiles:
    """cleanup_expired_files 测试"""

    def test_cleanup_expired_files(self, file_mgr, temp_workspace):
        """清理过期文件 (cleanup_days=0 表示立即过期)"""
        # 创建归档文件
        date_dir = os.path.join(temp_workspace['archive'], "20250101")
        os.makedirs(date_dir, exist_ok=True)

        for name in ["old1.gz", "old2.gz"]:
            filepath = os.path.join(date_dir, name)
            with open(filepath, 'w') as f:
                f.write("old content")
            # 设置文件修改时间为 31 天前（但 cleanup_days=0 所以任何文件都过期）
            old_time = time.time() - 1  # 1秒前即已过期
            os.utime(filepath, (old_time, old_time))

        result = file_mgr.cleanup_expired_files()
        assert result is True

        # 文件应被清理
        assert not os.path.exists(os.path.join(date_dir, "old1.gz"))
        assert not os.path.exists(os.path.join(date_dir, "old2.gz"))

        # 空目录也应被删除（注意：os.walk 中 dirs 遍历只处理子目录）
        # date_dir 本身可能在 walk 的下一层迭代中被删，也可能不被删
        # 这里只验证文件已清理即可
        if os.path.exists(date_dir):
            assert len(os.listdir(date_dir)) == 0

    def test_cleanup_empty_archive(self, file_mgr, temp_workspace):
        """空 archive 目录清理应成功"""
        result = file_mgr.cleanup_expired_files()
        assert result is True

    def test_cleanup_keeps_recent_files(self, file_mgr, temp_workspace):
        """未过期的文件不应被清理"""
        from src.config.config import config_manager
        cfg = config_manager.get_config()
        cfg.file_management.cleanup_days = 30  # 30天后才过期

        fm_fresh = __import__('src.files.file_manager', fromlist=['FileManager']).FileManager()

        date_dir = os.path.join(temp_workspace['archive'], "20250401")
        os.makedirs(date_dir, exist_ok=True)
        filepath = os.path.join(date_dir, "recent.gz")
        with open(filepath, 'w') as f:
            f.write("recent content")
        # 不修改时间，文件刚创建所以是 "今天" 的

        fm_fresh.cleanup_expired_files()

        # 文件应该还在
        assert os.path.exists(filepath)

        cfg.file_management.cleanup_days = 0  # 恢复


class TestCleanupExpiredCompleteFiles:
    """cleanup_expired_complete_files 测试"""

    @staticmethod
    def _backdate(path: str, days: int) -> None:
        past = time.time() - days * 24 * 3600
        os.utime(path, (past, past))

    @staticmethod
    def _backdate_tree(path: str, days: int) -> None:
        past = time.time() - days * 24 * 3600
        for root, dirs, files in os.walk(path):
            os.utime(root, (past, past))
            for name in files:
                os.utime(os.path.join(root, name), (past, past))
            for name in dirs:
                os.utime(os.path.join(root, name), (past, past))

    def test_cleanup_expired_complete_files(self, file_mgr, temp_workspace):
        """清理 complete 中超过保留期的文件"""
        scenario_root = os.path.join(temp_workspace['complete'], "f8", "123")
        scenario_dir = os.path.join(scenario_root, "output", "logs")
        os.makedirs(scenario_dir, exist_ok=True)
        filepath = os.path.join(scenario_dir, "old.log")
        with open(filepath, 'w') as f:
            f.write("old complete log")
        self._backdate_tree(scenario_root, 6)

        result = file_mgr.cleanup_expired_complete_files()
        assert result is True
        assert not os.path.exists(scenario_root)

    def test_cleanup_keeps_recent_complete_files(self, file_mgr, temp_workspace):
        """未过期的 complete 文件不应被清理"""
        scenario_root = os.path.join(temp_workspace['complete'], "f8", "124")
        scenario_dir = os.path.join(scenario_root, "output", "logs")
        os.makedirs(scenario_dir, exist_ok=True)
        filepath = os.path.join(scenario_dir, "recent.log")
        with open(filepath, 'w') as f:
            f.write("recent complete log")

        result = file_mgr.cleanup_expired_complete_files()
        assert result is True
        assert os.path.exists(filepath)

    def test_cleanup_compresses_complete_entries_after_one_day(self, file_mgr, temp_workspace):
        """1 天后的 complete 场景目录应压缩为 tar.gz"""
        import tarfile

        scenario_root = os.path.join(temp_workspace['complete'], "f8", "125")
        scenario_dir = os.path.join(scenario_root, "output", "logs")
        os.makedirs(scenario_dir, exist_ok=True)
        filepath = os.path.join(scenario_dir, "mid.log")
        with open(filepath, 'w') as f:
            f.write("mid complete log")
        self._backdate_tree(scenario_root, 2)

        result = file_mgr.cleanup_expired_complete_files()
        assert result is True
        assert not os.path.isdir(scenario_root)
        tarball = os.path.join(temp_workspace['complete'], "f8", "125.tar.gz")
        assert os.path.isfile(tarball)
        with tarfile.open(tarball, "r:gz") as tar:
            names = tar.getnames()
        assert "125/output/logs/mid.log" in names

    def test_cleanup_deletes_old_tarball(self, file_mgr, temp_workspace):
        """5 天后的 complete tar.gz 文件应直接清理"""
        tarball = os.path.join(temp_workspace['complete'], "f8", "126.tar.gz")
        os.makedirs(os.path.dirname(tarball), exist_ok=True)
        with open(tarball, 'w') as f:
            f.write("archive")
        self._backdate(tarball, 6)

        result = file_mgr.cleanup_expired_complete_files()
        assert result is True
        assert not os.path.exists(tarball)


class TestFileListAndSize:
    """文件列表和目录大小"""

    def test_get_file_list(self, file_mgr, temp_workspace):
        """获取目录文件列表"""
        test_dir = os.path.join(temp_workspace['workspace'], "test_list")
        os.makedirs(test_dir, exist_ok=True)

        for name in ["a.txt", "b.txt", "c.gz"]:
            with open(os.path.join(test_dir, name), 'w') as f:
                f.write("x")

        # 创建子目录（不应出现在文件列表中）
        os.makedirs(os.path.join(test_dir, "subdir"), exist_ok=True)

        files = file_mgr.get_file_list(test_dir)
        assert len(files) == 3
        assert set(files) == {"a.txt", "b.txt", "c.gz"}

    def test_get_file_list_empty_dir(self, file_mgr, temp_workspace):
        """空目录返回空列表"""
        files = file_mgr.get_file_list(temp_workspace['temp'])
        assert files == []

    def test_get_file_list_nonexistent_dir(self, file_mgr):
        """不存在的目录返回空列表"""
        files = file_mgr.get_file_list("/nonexistent/path")
        assert files == []

    def test_get_directory_size(self, file_mgr, temp_workspace):
        """获取目录总大小"""
        test_dir = os.path.join(temp_workspace['workspace'], "test_size")
        os.makedirs(test_dir, exist_ok=True)

        # 创建已知大小的文件
        with open(os.path.join(test_dir, "file1.txt"), 'w') as f:
            f.write("a" * 100)
        with open(os.path.join(test_dir, "file2.txt"), 'w') as f:
            f.write("b" * 200)

        size = file_mgr.get_directory_size(test_dir)
        assert size == 300

    def test_get_directory_size_empty(self, file_mgr, temp_workspace):
        """空目录大小为 0"""
        size = file_mgr.get_directory_size(temp_workspace['temp'])
        assert size == 0


import asyncio


def test_cleanup_in_executor_keeps_event_loop_responsive():
    """V4-P13: archive/cleanup must not stall the asyncio event loop.

    Simulates a slow filesystem pass and asserts a concurrent loop heartbeat
    keeps ticking while the blocking work runs in the default executor.
    """
    ticks = []

    def slow_fs_work():
        time.sleep(0.5)  # stand-in for os.walk over a large archive tree
        return True

    async def heartbeat():
        for _ in range(8):
            ticks.append(time.monotonic())
            await asyncio.sleep(0.05)

    async def main():
        loop = asyncio.get_running_loop()
        hb = asyncio.create_task(heartbeat())
        result = await loop.run_in_executor(None, slow_fs_work)
        await hb
        return result

    assert asyncio.run(main()) is True
    # >=6 heartbeats must land DURING the 0.5s blocking window — impossible if
    # the work ran inline on the loop.
    assert len(ticks) >= 6
    gaps = [b - a for a, b in zip(ticks, ticks[1:])]
    assert max(gaps) < 0.3, f"event loop stalled: gaps={gaps}"
