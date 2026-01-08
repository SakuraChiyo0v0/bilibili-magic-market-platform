import uuid
from datetime import datetime
from typing import Dict, Optional

class ScraperState:
    _should_stop = False
    _is_running = False

    @classmethod
    def set_stop(cls, value: bool):
        cls._should_stop = value

    @classmethod
    def should_stop(cls) -> bool:
        return cls._should_stop

    @classmethod
    def set_running(cls, value: bool):
        cls._is_running = value

    @classmethod
    def is_running(cls) -> bool:
        return cls._is_running

class TaskManager:
    _tasks: Dict[str, dict] = {}

    @classmethod
    def add_task(cls, task_type: str, description: str) -> str:
        task_id = str(uuid.uuid4())
        cls._tasks[task_id] = {
            "id": task_id,
            "type": task_type,
            "description": description,
            "status": "running", # running, completed, failed
            "progress": 0,
            "total": 0,
            "start_time": datetime.now(),
            "end_time": None,
            "message": ""
        }
        return task_id

    @classmethod
    def update_task(cls, task_id: str, status: str = None, progress: int = None, total: int = None, message: str = None):
        if task_id in cls._tasks:
            if status: cls._tasks[task_id]["status"] = status
            if progress is not None: cls._tasks[task_id]["progress"] = progress
            if total is not None: cls._tasks[task_id]["total"] = total
            if message: cls._tasks[task_id]["message"] = message

            if status in ["completed", "failed"]:
                cls._tasks[task_id]["end_time"] = datetime.now()

    @classmethod
    def get_active_tasks(cls):
        # Return tasks that are running or completed within last 10 seconds (for UI feedback)
        now = datetime.now()
        active = []
        to_remove = []

        for tid, task in cls._tasks.items():
            if task["status"] == "running":
                active.append(task)
            elif task["end_time"] and (now - task["end_time"]).total_seconds() < 10:
                active.append(task)
            elif task["end_time"] and (now - task["end_time"]).total_seconds() > 60:
                # Cleanup old tasks
                to_remove.append(tid)

        for tid in to_remove:
            del cls._tasks[tid]

        return active
