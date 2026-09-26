"""Tests for the bounded load-test request scheduler."""

import asyncio

import pytest

from scripts import load_test


@pytest.mark.asyncio
async def test_scheduler_bounds_concurrency_and_round_robins_api_keys(monkeypatch) -> None:
    active = 0
    peak_active = 0
    used_keys: list[tuple[str, int]] = []

    async def fake_submit_batch(
        _client,
        _run_id: str,
        _request_index: int,
        _batch_size: int,
        api_key: str,
        api_key_index: int,
    ) -> load_test.RequestResult:
        nonlocal active, peak_active
        active += 1
        peak_active = max(peak_active, active)
        used_keys.append((api_key, api_key_index))
        await asyncio.sleep(0.01)
        active -= 1
        return load_test.RequestResult(api_key_index, 202, 0.01, 1)

    monkeypatch.setattr(load_test, "submit_batch", fake_submit_batch)

    results = await load_test.submit_requests(
        object(),
        run_id="test",
        requests=12,
        concurrency=3,
        batch_size=1,
        api_keys=["key-a", "key-b"],
        interval_seconds=0,
        progress_interval=0,
    )

    assert len(results) == 12
    assert peak_active == 3
    assert used_keys.count(("key-a", 0)) == 6
    assert used_keys.count(("key-b", 1)) == 6
