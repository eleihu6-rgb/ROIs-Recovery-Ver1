import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
import time
from src.exceptions import OptimizerNotFoundError, TaskLimitError
from src.tasks.task_manager import Task, task_manager, TaskStatus


class TestTaskManager:
    """任务调度模块测试"""

    def test_create_task(self):
        """测试创建任务"""
        task_id = task_manager.create_task("F8", "PO", {"scenarioId": "123"})
        assert task_id is not None
        assert isinstance(task_id, str)

    def test_create_task_with_url_and_token(self):
        """测试创建带URL和Token的任务"""
        task_id = task_manager.create_task(
            "F8", "PO", {"scenarioId": "456"},
            url="http://localhost", token="test_token", user="test_user"
        )
        assert task_id is not None
        task = task_manager.get_task(task_id)
        assert task is not None
        assert task.url == "http://localhost"
        assert task.token == "test_token"
        assert task.user == "test_user"

    def test_create_task_invalid_optimizer(self):
        """测试创建不存在的优化器类型任务"""
        with pytest.raises(OptimizerNotFoundError):
            task_manager.create_task("F8", "INVALID")

    def test_create_task_invalid_airline(self):
        """测试创建不存在航司的任务"""
        with pytest.raises(OptimizerNotFoundError):
            task_manager.create_task("INVALID", "PO")

    def test_get_task(self):
        """测试获取任务"""
        task_id = task_manager.create_task("F8", "RO", {"scenarioId": "789"})
        assert task_id is not None
        task = task_manager.get_task(task_id)
        assert task is not None
        assert task.task_id == task_id
        assert task.airline == "F8"
        assert task.optimizer_type == "RO"

    def test_get_task_not_found(self):
        """测试获取不存在的任务"""
        task = task_manager.get_task("non_existent_task_id")
        assert task is None

    def test_task_initial_status(self):
        """测试任务初始状态"""
        task_id = task_manager.create_task("F8", "TO", {"scenarioId": "101"})
        assert task_id is not None
        task = task_manager.get_task(task_id)
        assert task is not None
        assert task.get_status() == "pending"
        assert task.get_progress() == 0

    def test_get_all_tasks(self):
        """测试获取所有任务"""
        all_tasks = task_manager.get_all_tasks("F8")
        assert isinstance(all_tasks, list)

    def test_get_running_tasks(self):
        """测试获取运行中任务"""
        running_tasks = task_manager.get_running_tasks("F8")
        assert isinstance(running_tasks, list)

    def test_optimizer_specific_concurrency_limit(self, test_task_manager):
        """同一优化器类型可配置更低并发上限"""
        test_task_manager.optimizer_max_concurrent = {"LegacyRO": 1}
        running_task = Task("running-legacy-ro", "F8", "LegacyRO")
        running_task.status = TaskStatus.RUNNING
        test_task_manager.tasks[running_task.task_id] = running_task

        with pytest.raises(TaskLimitError, match="optimizer LegacyRO: 1"):
            test_task_manager.create_task("F8", "LegacyRO", {"scenarioId": "693"})

        task_id = test_task_manager.create_task("F8", "PO", {"scenarioId": "694"})
        assert task_id is not None

    def test_optimizer_specific_concurrency_limit_counts_pending_tasks(self, test_task_manager, monkeypatch):
        """已创建但尚未切到RUNNING的任务也应占用优化器并发名额"""
        test_task_manager.optimizer_max_concurrent = {"LegacyRO": 1}
        pending_task = Task("pending-legacy-ro", "F8", "LegacyRO")
        pending_task.status = TaskStatus.PENDING
        test_task_manager.tasks[pending_task.task_id] = pending_task

        with pytest.raises(TaskLimitError, match="optimizer LegacyRO: 1"):
            test_task_manager.create_task("F8", "LegacyRO", {"scenarioId": "693"})

        # start_task must not reject the task against its own pending slot.
        monkeypatch.setattr(pending_task, "start", lambda: True)
        assert test_task_manager.start_task(pending_task.task_id) is True

    def test_create_rule_task(self):
        """测试创建Rule类型任务"""
        task_id = task_manager.create_task("F8", "Rule", {
            "category": "change_flight",
            "scenarioId": "0",
            "fltId": "1,2,3",
            "division": "C"
        })
        assert task_id is not None
        task = task_manager.get_task(task_id)
        assert task is not None
        assert task.optimizer_type == "Rule"

    def test_cleanup_tasks(self):
        """测试清理任务"""
        # cleanup_tasks应该不会出错
        task_manager.cleanup_tasks()
