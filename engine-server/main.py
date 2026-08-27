import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prometheus_client import make_asgi_app, Counter, Histogram
from src.utils.logger import setup_logging
from src.api.routes import router as api_router
from src.tasks.task_manager import task_manager
from src.files.file_manager import file_manager
import uvicorn

# 初始化日志系统（必须在其他模块导入之前）
setup_logging(log_dir="./logs", log_level="INFO")
logger = logging.getLogger(__name__)

# Prometheus metrics
optimization_jobs_total = Counter(
    'rois_engine_server_optimization_jobs_total',
    'Total optimization jobs started',
    ['optimizer_type', 'status'],
)
optimization_job_duration_seconds = Histogram(
    'rois_engine_server_optimization_job_duration_seconds',
    'Duration of optimization jobs in seconds',
    ['optimizer_type'],
    buckets=[10, 30, 60, 120, 300, 600, 1800],
)

# 后台定时任务引用
_cleanup_task = None


async def _periodic_cleanup():
    """后台定时清理任务"""
    while True:
        try:
            await asyncio.sleep(300)  # 每5分钟执行一次
            
            # 清理已完成的内存中任务
            task_manager.cleanup_tasks()
            
            # 文件归档和 complete 压缩/过期清理 — V4-P13: os.walk/tar/gzip 为阻塞 IO，
            # 放入默认线程池执行器，避免卡住事件循环；FileManager._lock
            # 已保证同一时间只有一个清理在跑。
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(None, file_manager.archive_files)
            await loop.run_in_executor(None, file_manager.cleanup_expired_files)
            await loop.run_in_executor(None, file_manager.cleanup_expired_complete_files)
            
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error("定时清理任务异常: %s", e, exc_info=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """服务生命周期管理"""
    global _cleanup_task
    
    logger.info("=== 优化引擎调度工具启动 ===")
    
    # 启动后台定时清理任务
    _cleanup_task = asyncio.create_task(_periodic_cleanup())
    logger.info("后台定时清理任务已启动")
    
    yield
    
    # 关闭：停止所有运行中任务
    logger.info("服务正在关闭，停止所有运行中任务...")
    task_manager.stop_all_tasks()
    
    # 取消定时清理任务
    if _cleanup_task:
        _cleanup_task.cancel()
        try:
            await _cleanup_task
        except asyncio.CancelledError:
            pass
    
    logger.info("=== 优化引擎调度工具已关闭 ===")


# CORS 与 API 文档开关 — 从配置文件读取。生产 config.yaml 必须限制 origins、关闭文档端点
# （避免未鉴权 Swagger/ReDoc/OpenAPI 泄露接口结构；合法浏览器调用全部同源经 nginx 反代）。
from src.config.config import config_manager
_server_cfg = config_manager.get_config().server

app = FastAPI(
    title="优化引擎调度工具",
    description="统一管理和调度各种优化器的服务",
    version="1.0.0",
    docs_url=_server_cfg.docs_url,
    redoc_url=_server_cfg.redoc_url,
    openapi_url=_server_cfg.openapi_url,
    lifespan=lifespan
)

# Mount Prometheus metrics endpoint
metrics_app = make_asgi_app()
app.mount("/metrics", metrics_app)

# CORS配置 - 从配置文件读取，生产环境应在config.yaml中限制origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=_server_cfg.cors.allow_origins,
    allow_credentials=False,  # 与 allow_origins=["*"] 配合时必须为False
    allow_methods=_server_cfg.cors.allow_methods,
    allow_headers=_server_cfg.cors.allow_headers,
)

# 请求限流 - 按 airline 维度限流
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

_rate_limit_config = config_manager.get_config().auth.rate_limit

def _get_airline_key(request: Request) -> str:
    """从请求中提取 airline 作为限流 key"""
    return request.headers.get("X-Airline", "unknown")

if _rate_limit_config.enabled:
    limiter = Limiter(key_func=_get_airline_key, default_limits=[_rate_limit_config.rate])
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    logger.info("请求限流已启用: %s per airline", _rate_limit_config.rate)


# 全局异常处理器
from src.exceptions import OptimizerServerError

@app.exception_handler(OptimizerServerError)
async def optimizer_server_error_handler(request: Request, exc: OptimizerServerError):
    """处理业务异常"""
    logger.warning("业务异常: %s, path=%s", exc, request.url.path)
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError):
    """处理值错误（如航司不存在、优化器类型不支持等）"""
    logger.warning("请求参数错误: %s, path=%s", exc, request.url.path)
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """全局异常处理器，防止内部错误泄露"""
    logger.error("未处理异常: %s, path=%s", exc, request.url.path, exc_info=True)
    return JSONResponse(status_code=500, content={"detail": "服务器内部错误"})


# 请求日志中间件
@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    """记录每个请求的基本信息"""
    logger.info("请求: %s %s, airline=%s", 
               request.method, request.url.path, 
               request.headers.get("X-Airline", "-"))
    response = await call_next(request)
    logger.info("响应: %s %s -> %d", request.method, request.url.path, response.status_code)
    return response


# 注册API路由
app.include_router(api_router, prefix="/api")


@app.get("/")
async def root():
    return {"message": "优化引擎调度工具服务运行中"}


@app.get("/health")
async def health_check():
    """健康检查 - 检查核心依赖状态"""
    from src.tasks.redis_manager import redis_manager
    
    health = {
        "status": "healthy",
        "redis": "connected" if redis_manager.is_connected() else "disconnected" if redis_manager.redis_config.enabled else "disabled"
    }
    return health


if __name__ == "__main__":
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        reload=False
    )
