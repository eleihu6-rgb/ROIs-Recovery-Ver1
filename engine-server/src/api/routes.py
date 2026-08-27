import logging
import os
import glob
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse
from src.tasks.task_manager import task_manager
from src.optimizers.optimizer_manager import optimizer_manager
from src.config.config import config_manager
from src.files.file_manager import file_manager
from src.api.auth import verify_token, AuthContext
from src.api.models import (
    OptimizeStartRequest, TaskStartResponse, TaskStopResponse,
    TaskStatusResponse, TaskProgressResponse, SystemInfoResponse,
    OptimizersResponse, TaskListResponse
)
from src.version import get_version, GIT_COMMIT_ID, BUILD_TIMESTAMP, COMMIT_AUTHOR
from src.exceptions import (
    OptimizerNotFoundError, OptimizerExecutionError,
    TaskNotFoundError, TaskLimitError, TaskStateError,
    InputFetchError, OutputSubmitError,
)

logger = logging.getLogger(__name__)

router = APIRouter()


def _find_complete_file(airline: str, scenario_id: str, filename: str, version: Optional[str] = None) -> Optional[str]:
    """Locate filename inside the complete archive tree."""
    complete_base = config_manager.get_config().paths.complete_dir
    base = os.path.join(complete_base, airline, scenario_id)
    if version:
        candidates = sorted(
            glob.glob(os.path.join(base, version, '*')),
            key=lambda p: os.path.getmtime(p) if os.path.isdir(p) else 0,
            reverse=True,
        )
    else:
        # Exact match first, then any timestamp-suffixed variant sorted newest first
        candidates = sorted(
            glob.glob(f"{base}") + glob.glob(f"{base}_*"),
            key=lambda p: os.path.getmtime(p) if os.path.isdir(p) else 0,
            reverse=True,
        )
    for d in candidates:
        path = os.path.join(d, filename)
        if os.path.exists(path):
            return path
    return None

ALLOWED_VERSION_FILES = {
    'input.gz',
    'output.gz',
    'algorithm_args.txt',
    'algorithm_meta.json',
    'FLOOR_RESCUE_RULES.json',
    'ruleset_parameters.json',
    'ro_input.txt',
    'result.json',
}

# 优化任务管理接口

@router.post("/optimize/start", response_model=TaskStartResponse)
async def start_optimization(request: OptimizeStartRequest, auth: AuthContext = Depends(verify_token)):
    """启动优化任务"""
    airline = auth.airline

    # 验证优化器类型
    valid_types = ["PO", "RO", "TO", "Rule", "LegacyRO"]
    if request.type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Unsupported optimizer type: {request.type}, supported: {valid_types}")

    # Rule类型必须有category参数
    if request.type == "Rule" and "category" not in request.parameters:
        raise HTTPException(status_code=400, detail="Rule type requires a 'category' parameter in parameters")

    # PO/RO/TO类型必须有scenarioId
    if request.type in ["PO", "RO", "TO"] and "scenarioId" not in request.parameters:
        raise HTTPException(status_code=400, detail=f"{request.type} type requires a 'scenarioId' parameter in parameters")
    # LegacyRO: scenarioId用于目录命名，可不传（默认用javaScenarioId=114）

    # 确定 Live Server token:
    # - JWT 模式: 自动使用 Header 中的 JWT 传递给 Live Server
    # - API Key 模式: 使用 body 中的 token 字段
    live_server_token = request.token
    if auth.auth_method == "jwt" and auth.jwt_token:
        live_server_token = auth.jwt_token

    # 确定用户名: JWT 优先，否则用 body 中的 user 字段
    user = auth.user or request.user

    # 确定 Live Server 回调地址：航司配置 live-server.url 优先于请求体 url。
    # 请求体 url 取自浏览器 Host 头，在多机/反向代理环境下 engine-server 不一定
    # 能据此解析回 Live Server，故配置地址为准。
    configured_url = config_manager.get_live_server_url(airline)
    effective_url = configured_url or request.url
    if configured_url:
        logger.info("使用配置的 Live Server 地址: %s（忽略请求体 url=%s）", configured_url, request.url)

    logger.info("收到启动任务请求: airline=%s, type=%s, user=%s, auth=%s, live_server_url=%s",
                airline, request.type, user, auth.auth_method, effective_url)

    try:
        task_id = task_manager.create_task(airline, request.type, request.parameters, effective_url, live_server_token, user)
        task_manager.start_task(task_id)
    except OptimizerNotFoundError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except TaskLimitError as e:
        raise HTTPException(status_code=429, detail=str(e))
    except (TaskStateError, TaskNotFoundError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except InputFetchError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except OptimizerExecutionError as e:
        raise HTTPException(status_code=500, detail=str(e))

    return TaskStartResponse(task_id=task_id, status="started")

@router.post("/optimize/stop/{task_id}", response_model=TaskStopResponse)
async def stop_optimization(task_id: str, auth: AuthContext = Depends(verify_token)):
    """停止优化任务"""
    success = task_manager.stop_task(task_id)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to stop task: task does not exist or is not running")

    return TaskStopResponse(task_id=task_id, status="stopped")

@router.get("/optimize/status/{task_id}", response_model=TaskStatusResponse)
async def get_optimization_status(task_id: str, auth: AuthContext = Depends(verify_token)):
    """查询优化任务状态"""
    task = task_manager.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    return TaskStatusResponse(
        task_id=task_id,
        status=task.get_status(),
        airline=task.airline,
        optimizer_type=task.optimizer_type,
        error_message=task.error_message
    )

@router.get("/optimize/result/{task_id}")
async def get_optimization_result(
    task_id: str,
    scenario_id: Optional[str] = Query(default=None),
    version: Optional[str] = Query(default=None),
    auth: AuthContext = Depends(verify_token),
):
    """返回任务的 output.gz 字节（approach B：Live Server 按需拉取场景优化结果）。
    当 task_manager 重启后内存清空时，可通过 ?scenario_id= 从 complete/ 目录直接查找文件。
    """
    task = task_manager.get_task(task_id)
    output_path = task.output_file_path if task else None
    if not output_path or not os.path.exists(output_path):
        if scenario_id:
            output_path = _find_complete_file(auth.airline, scenario_id, "output.gz", version)
    if not output_path or not os.path.exists(output_path):
        raise HTTPException(status_code=404, detail="Result file does not exist or has been cleaned up")
    return FileResponse(output_path, media_type="application/gzip", filename="ro_output.gz")

@router.get("/optimize/input/{task_id}")
async def get_optimization_input(
    task_id: str,
    scenario_id: Optional[str] = Query(default=None),
    version: Optional[str] = Query(default=None),
    auth: AuthContext = Depends(verify_token),
):
    """返回任务的 input.gz 字节（供 live-server 读取场景静态快照，leadinLive=0 路径）。
    当 task_manager 重启后内存清空时，可通过 ?scenario_id= 从 complete/ 目录直接查找文件。
    """
    task = task_manager.get_task(task_id)
    input_path = task.input_file_path if task else None
    if not input_path or not os.path.exists(input_path):
        if scenario_id:
            input_path = _find_complete_file(auth.airline, scenario_id, "input.gz", version)
    if not input_path or not os.path.exists(input_path):
        raise HTTPException(status_code=404, detail="Input file does not exist or has been cleaned up")
    return FileResponse(input_path, media_type="application/gzip", filename="ro_input.gz")

@router.delete("/optimize/scenario/{scenario_id}/versions")
async def delete_scenario_versions(
    scenario_id: str,
    auth: AuthContext = Depends(verify_token),
):
    deleted = file_manager.delete_complete_version(auth.airline, scenario_id)
    if not deleted:
        raise HTTPException(status_code=500, detail="Failed to delete scenario versions")
    return {"deleted": True}

@router.delete("/optimize/scenario/{scenario_id}/versions/{version}")
async def delete_scenario_version(
    scenario_id: str,
    version: str,
    auth: AuthContext = Depends(verify_token),
):
    deleted = file_manager.delete_complete_version(auth.airline, scenario_id, version)
    if not deleted:
        raise HTTPException(status_code=500, detail="Failed to delete scenario version")
    return {"deleted": True}

@router.get("/optimize/scenario/{scenario_id}/versions/{version}/files/{filename}")
async def get_scenario_version_file(
    scenario_id: str,
    version: str,
    filename: str,
    auth: AuthContext = Depends(verify_token),
):
    if filename not in ALLOWED_VERSION_FILES:
        raise HTTPException(status_code=400, detail="Unsupported version file")
    path = _find_complete_file(auth.airline, scenario_id, filename, version)
    if not path or not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Version file does not exist")
    media_type = "application/gzip" if filename.endswith(".gz") else "text/plain; charset=utf-8"
    if filename.endswith(".json"):
        media_type = "application/json"
    return FileResponse(path, media_type=media_type, filename=filename)

@router.put("/optimize/result/{task_id}/output")
async def write_optimization_output(
    task_id: str,
    request: Request,
    auth: AuthContext = Depends(verify_token),
):
    """覆盖写入任务的 output.gz（用于 live-server 保存场景微调结果）。
    调用方必须持有 Redis 编辑锁（由 live-server 保证，engine-server 不重复校验）。
    """
    import os

    task = task_manager.get_task(task_id)
    if not task or not task.output_file_path:
        raise HTTPException(status_code=404, detail="Task not found or has no output file path")

    data = await request.body()
    if not data:
        raise HTTPException(status_code=400, detail="Request body is empty")

    try:
        with open(task.output_file_path, 'wb') as f:
            f.write(data)
        logger.info("[Task %s] output.gz 已更新，大小: %d bytes", task_id, len(data))
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"Failed to write file: {e}")

    return {"status": "updated", "task_id": task_id, "bytes": len(data)}

@router.get("/optimize/progress/{task_id}", response_model=TaskProgressResponse)
async def get_optimization_progress(task_id: str, auth: AuthContext = Depends(verify_token)):
    """查询优化任务进度"""
    task = task_manager.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    return TaskProgressResponse(
        task_id=task_id,
        progress=task.get_progress(),
        status=task.get_status(),
        airline=task.airline,
        progress_detail=task.get_progress_detail(),
        progress_age_sec=task.get_progress_age_sec(),
    )

# 系统管理接口

@router.get("/system/info", response_model=SystemInfoResponse)
async def get_system_info(auth: AuthContext = Depends(verify_token)):
    """获取系统信息"""
    return SystemInfoResponse(
        service="ROIS Optimizer Server",
        version=get_version(),
        git_commit_id=GIT_COMMIT_ID,
        commit_author=COMMIT_AUTHOR,
        build_timestamp=BUILD_TIMESTAMP,
        status="running"
    )

@router.get("/optimizers", response_model=OptimizersResponse)
async def get_optimizers(auth: AuthContext = Depends(verify_token)):
    """获取优化器列表"""
    optimizers = optimizer_manager.get_all_optimizers(auth.airline)
    return OptimizersResponse(optimizers=optimizers)

@router.get("/tasks/running", response_model=TaskListResponse)
async def get_running_tasks(auth: AuthContext = Depends(verify_token)):
    """获取运行中任务"""
    running_tasks = task_manager.get_running_tasks(auth.airline)
    return TaskListResponse(tasks=running_tasks)

@router.get("/tasks/all", response_model=TaskListResponse)
async def get_all_tasks(auth: AuthContext = Depends(verify_token)):
    """获取所有任务"""
    all_tasks = task_manager.get_all_tasks(auth.airline)
    return TaskListResponse(tasks=all_tasks)
