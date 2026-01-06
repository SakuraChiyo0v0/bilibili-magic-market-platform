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
