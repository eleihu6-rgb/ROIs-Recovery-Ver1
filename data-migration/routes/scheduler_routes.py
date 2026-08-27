from fastapi import APIRouter

from scheduler import scheduler_manager

router = APIRouter(prefix="/scheduler", tags=["scheduler"])


@router.get("/status")
def get_scheduler_status():
    return scheduler_manager.get_status()


@router.post("/{job_name}/enable")
def enable_job(job_name: str):
    scheduler_manager.enable(job_name)
    return {"job": job_name, "enabled": True}


@router.post("/{job_name}/disable")
def disable_job(job_name: str):
    scheduler_manager.disable(job_name)
    return {"job": job_name, "enabled": False}