from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from threading import RLock
from typing import Any, Callable, Hashable


_MISS = object()


@dataclass
class CacheEntry:
    value: Any
    expires_at: datetime


class TTLCache:
    def __init__(self) -> None:
        self._items: dict[tuple[Hashable, ...], CacheEntry] = {}
        self._lock = RLock()

    def get(self, key: tuple[Hashable, ...]) -> Any:
        now = datetime.now(timezone.utc)
        with self._lock:
            entry = self._items.get(key)
            if entry is None:
                return _MISS
            if entry.expires_at <= now:
                self._items.pop(key, None)
                return _MISS
            return entry.value

    def set(self, key: tuple[Hashable, ...], value: Any, ttl_seconds: int) -> Any:
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)
        with self._lock:
            self._items[key] = CacheEntry(value=value, expires_at=expires_at)
        return value

    def get_or_set(
        self,
        key: tuple[Hashable, ...],
        ttl_seconds: int,
        loader: Callable[[], Any],
    ) -> Any:
        cached = self.get(key)
        if cached is not _MISS:
            return cached

        value = loader()
        return self.set(key, value, ttl_seconds)

    def delete(self, key: tuple[Hashable, ...]) -> None:
        with self._lock:
            self._items.pop(key, None)

    def clear(self) -> None:
        with self._lock:
            self._items.clear()

    def prune(self) -> None:
        now = datetime.now(timezone.utc)
        with self._lock:
            expired = [key for key, entry in self._items.items() if entry.expires_at <= now]
            for key in expired:
                self._items.pop(key, None)
