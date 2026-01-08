import time
from collections import defaultdict, deque
import logging

logger = logging.getLogger(__name__)

class InMemoryRateLimiter:
    def __init__(self, max_requests: int = 60, window_seconds: int = 60):
        """
        Simple in-memory rate limiter using sliding window.
        
        :param max_requests: Max requests allowed in the window.
        :param window_seconds: Time window in seconds.
        """
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        # Mapping: key -> deque of timestamps
        self.requests = defaultdict(deque)

    def is_allowed(self, key: str) -> bool:
        now = time.time()
        timestamps = self.requests[key]

        # Remove timestamps older than the window
        while timestamps and timestamps[0] < now - self.window_seconds:
            timestamps.popleft()

        # Check count
        if len(timestamps) >= self.max_requests:
            return False

        # Add current timestamp
        timestamps.append(now)
        return True

    def cleanup(self):
        """Periodically cleanup unused keys to prevent memory leak."""
        now = time.time()
        keys_to_remove = []
        for key, timestamps in self.requests.items():
            if not timestamps:
                keys_to_remove.append(key)
                continue
            # If the newest timestamp is too old, remove the key
            if timestamps[-1] < now - self.window_seconds:
                keys_to_remove.append(key)
        
        for key in keys_to_remove:
            del self.requests[key]

# Global limiter instance
# Default: 60 requests per minute per key
api_limiter = InMemoryRateLimiter(max_requests=60, window_seconds=60)
