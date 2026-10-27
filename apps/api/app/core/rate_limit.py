import time
from collections import OrderedDict

from redis.asyncio import Redis


class RateLimiter:
    """Fixed windows, shared atomically by Redis in deployed environments.

    The bounded in-process fallback is only for local development/tests. Calls
    are made on the event loop, without awaits in the local mutation path.
    """

    SCRIPT = """
    local count = redis.call('INCR', KEYS[1])
    if count == 1 then redis.call('EXPIRE', KEYS[1], 61) end
    return count
    """

    def __init__(self, redis_url: str | None):
        self.redis = Redis.from_url(redis_url, socket_connect_timeout=2, socket_timeout=2) if redis_url else None
        self.windows = OrderedDict()

    async def allow(self, identity: str, limit: int, bucket: str = "all") -> bool:
        window = int(time.time()) // 60
        key = f"api:rate:{bucket}:{identity}:{window}"
        if self.redis:
            count = await self.redis.eval(self.SCRIPT, 1, key)
        else:
            count = self.windows.get(key, 0) + 1
            self.windows[key] = count
            self.windows.move_to_end(key)
            while len(self.windows) > 10000:
                self.windows.popitem(last=False)
        return count <= limit

    async def close(self):
        if self.redis:
            await self.redis.aclose()
