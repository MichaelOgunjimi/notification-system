"""Run a bounded local load test through event ingestion and delivery."""

import argparse
import asyncio
import math
import os
import time
import uuid
from dataclasses import dataclass

import httpx
from sqlalchemy import func, select
from sqlmodel import col

from app.core.database import async_session
from app.model_registry import Event, EventStatus

_TERMINAL_STATUSES = {
    EventStatus.COMPLETED,
    EventStatus.PARTIALLY_FAILED,
    EventStatus.FAILED,
    EventStatus.CANCELLED,
}


@dataclass(slots=True)
class RequestResult:
    """Capture one batch request's key, status, latency, and accepted event count."""

    api_key_index: int
    status_code: int
    duration_seconds: float
    accepted_events: int
    error: str | None = None


async def submit_batch(
    client: httpx.AsyncClient,
    run_id: str,
    request_index: int,
    batch_size: int,
    api_key: str,
    api_key_index: int,
) -> RequestResult:
    """Submit one batch and return its measured result."""
    body = {
        "events": [
            {
                "event_type": f"load.test.{run_id}",
                "recipients": [
                    {
                        "user_id": f"load-{request_index}-{event_index}",
                        "channels": ["email"],
                        "email": "load-test@beaco.local",
                    }
                ],
                "priority": "medium",
                "payload": {
                    "run_id": run_id,
                    "request": request_index,
                    "event": event_index,
                },
            }
            for event_index in range(batch_size)
        ]
    }
    started = time.perf_counter()
    try:
        response = await client.post(
            "/api/v1/events/batch",
            json=body,
            headers={"X-API-Key": api_key},
        )
        duration = time.perf_counter() - started
        if response.is_success:
            return RequestResult(
                api_key_index=api_key_index,
                status_code=response.status_code,
                duration_seconds=duration,
                accepted_events=len(response.json()),
            )
        return RequestResult(
            api_key_index=api_key_index,
            status_code=response.status_code,
            duration_seconds=duration,
            accepted_events=0,
            error=response.text[:300],
        )
    except (httpx.HTTPError, ValueError, TypeError) as exc:
        return RequestResult(
            api_key_index=api_key_index,
            status_code=0,
            duration_seconds=time.perf_counter() - started,
            accepted_events=0,
            error=str(exc),
        )


async def event_status_counts(event_type: str) -> dict[EventStatus, int]:
    """Count load-test events by current pipeline status."""
    async with async_session() as db:
        result = await db.execute(
            select(col(Event.status), func.count())
            .where(col(Event.event_type) == event_type)
            .group_by(col(Event.status))
        )
        return {status: count for status, count in result.all()}


async def wait_for_delivery(
    event_type: str, event_count: int, timeout_seconds: float
) -> tuple[dict[EventStatus, int], float]:
    """Wait until every accepted event reaches a terminal delivery status."""
    started = time.perf_counter()
    while True:
        counts = await event_status_counts(event_type)
        terminal_count = sum(
            count for status, count in counts.items() if status in _TERMINAL_STATUSES
        )
        if terminal_count == event_count:
            return counts, time.perf_counter() - started
        if time.perf_counter() - started >= timeout_seconds:
            return counts, time.perf_counter() - started
        await asyncio.sleep(0.25)


def percentile(values: list[float], fraction: float) -> float:
    """Return a nearest-rank percentile for a non-empty sample."""
    ordered = sorted(values)
    return ordered[max(0, math.ceil(len(ordered) * fraction) - 1)]


async def submit_requests(
    client: httpx.AsyncClient,
    *,
    run_id: str,
    requests: int,
    concurrency: int,
    batch_size: int,
    api_keys: list[str],
    interval_seconds: float,
    progress_interval: float,
) -> list[RequestResult]:
    """Submit a bounded, optionally paced workload across API keys."""
    queue: asyncio.Queue[int] = asyncio.Queue(maxsize=concurrency * 2)
    results: list[RequestResult] = []
    completed = 0
    started = time.perf_counter()

    async def worker() -> None:
        nonlocal completed
        while True:
            request_index = await queue.get()
            api_key_index = request_index % len(api_keys)
            try:
                results.append(
                    await submit_batch(
                        client,
                        run_id,
                        request_index,
                        batch_size,
                        api_keys[api_key_index],
                        api_key_index,
                    )
                )
                completed += 1
            finally:
                queue.task_done()

    async def report_progress() -> None:
        while completed < requests:
            await asyncio.sleep(progress_interval)
            elapsed = time.perf_counter() - started
            print(
                f"Progress: {completed}/{requests} requests ({completed / elapsed:.1f} req/s)",
                flush=True,
            )

    workers = [asyncio.create_task(worker()) for _ in range(concurrency)]
    reporter = asyncio.create_task(report_progress()) if progress_interval > 0 else None
    next_request_at = asyncio.get_running_loop().time()
    for request_index in range(requests):
        if interval_seconds > 0:
            await asyncio.sleep(max(0, next_request_at - asyncio.get_running_loop().time()))
        await queue.put(request_index)
        if interval_seconds > 0:
            next_request_at = max(
                next_request_at + interval_seconds,
                asyncio.get_running_loop().time(),
            )
    await queue.join()
    for task in workers:
        task.cancel()
    await asyncio.gather(*workers, return_exceptions=True)
    if reporter is not None:
        reporter.cancel()
        await asyncio.gather(reporter, return_exceptions=True)
    return results


async def run(args: argparse.Namespace) -> int:
    """Execute ingestion load, await delivery, print metrics, and return an exit code."""
    limits = httpx.Limits(
        max_connections=args.concurrency,
        max_keepalive_connections=args.concurrency,
    )
    async with httpx.AsyncClient(
        base_url=args.api.rstrip("/"),
        timeout=args.request_timeout,
        limits=limits,
    ) as client:
        run_id = uuid.uuid4().hex[:12]
        interval_seconds = 1 / args.rps if args.rps is not None else args.sleep
        target = (
            f"{args.rps:g} req/s"
            if args.rps is not None
            else f"{args.sleep:g}s between requests"
            if args.sleep > 0
            else "unthrottled"
        )
        print(
            f"Starting {args.requests} requests × {args.batch_size} events, "
            f"concurrency {args.concurrency}, {len(args.api_keys)} API key(s), "
            f"target {target}",
            flush=True,
        )
        started = time.perf_counter()
        results = await submit_requests(
            client,
            run_id=run_id,
            requests=args.requests,
            concurrency=args.concurrency,
            batch_size=args.batch_size,
            api_keys=args.api_keys,
            interval_seconds=interval_seconds,
            progress_interval=args.progress_interval,
        )
        ingestion_seconds = time.perf_counter() - started

    successful = [result for result in results if result.status_code == 202]
    accepted_events = sum(result.accepted_events for result in successful)
    latencies = [result.duration_seconds for result in results]
    status_codes: dict[int, int] = {}
    for result in results:
        status_codes[result.status_code] = status_codes.get(result.status_code, 0) + 1

    print(f"Requests: {args.requests} ({status_codes})")
    if len(args.api_keys) > 1:
        for api_key_index in range(len(args.api_keys)):
            key_statuses: dict[int, int] = {}
            for result in results:
                if result.api_key_index == api_key_index:
                    key_statuses[result.status_code] = key_statuses.get(result.status_code, 0) + 1
            print(f"API key {api_key_index + 1}: {key_statuses}")
    print(f"Events accepted: {accepted_events}/{args.requests * args.batch_size}")
    print(
        "Ingestion: "
        f"{args.requests / ingestion_seconds:.1f} req/s, "
        f"{accepted_events / ingestion_seconds:.1f} events/s"
    )
    print(
        "Latency: "
        f"p50={percentile(latencies, 0.50) * 1000:.0f}ms "
        f"p95={percentile(latencies, 0.95) * 1000:.0f}ms "
        f"max={max(latencies) * 1000:.0f}ms"
    )

    if len(successful) != args.requests:
        print(f"Rate limited: {status_codes.get(429, 0)} request(s)")
        error_samples: dict[int, str] = {}
        for result in results:
            if result.error:
                error_samples.setdefault(result.status_code, result.error)
        for status_code, error in error_samples.items():
            print(f"Error sample ({status_code}): {error}")
        return 1

    counts, delivery_seconds = await wait_for_delivery(
        f"load.test.{run_id}", accepted_events, args.delivery_timeout
    )
    rendered_counts = {str(status): count for status, count in counts.items()}
    print(f"Delivery: {rendered_counts} in {delivery_seconds:.2f}s")
    return 0 if counts == {EventStatus.COMPLETED: accepted_events} else 1


def main() -> None:
    """Parse CLI options and run the local load test."""
    parser = argparse.ArgumentParser(
        description=(
            "Load test event ingestion and the full email-delivery pipeline. "
            "Each request uses the batch endpoint, so total events equal "
            "requests multiplied by batch size."
        ),
        epilog=(
            "Example:\n"
            "  API_KEY=nk_... make load-test "
            'ARGS="--requests 10000 --rps 100 --concurrency 100"\n'
            "  API_KEYS=nk_...,nk_... make load-test "
            'ARGS="--requests 100000 --rps 500 --concurrency 250"\n\n'
            "API keys need the events:write scope. --rps is the total rate split "
            "round-robin across all keys. Batch size changes event volume without "
            "using extra request quota."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--api", default="http://localhost:8000")
    parser.add_argument(
        "--api-key",
        action="append",
        dest="api_keys",
        help="Project API key; repeat for multiple keys (prefer the environment variable)",
    )
    parser.add_argument("--requests", type=int, default=3000)
    parser.add_argument("--concurrency", type=int, default=50)
    parser.add_argument("--batch-size", type=int, default=1)
    pacing = parser.add_mutually_exclusive_group()
    pacing.add_argument(
        "--rps",
        type=float,
        help="Total request starts per second across all API keys",
    )
    pacing.add_argument(
        "--sleep",
        type=float,
        default=0,
        help="Seconds to sleep between request starts; default is unthrottled",
    )
    parser.add_argument("--request-timeout", type=float, default=30)
    parser.add_argument("--delivery-timeout", type=float, default=60)
    parser.add_argument(
        "--progress-interval",
        type=float,
        default=5,
        help="Seconds between progress updates; use 0 to disable",
    )
    args = parser.parse_args()
    environment_keys = (
        os.getenv("BEACO_LOAD_TEST_API_KEYS") or os.getenv("BEACO_LOAD_TEST_API_KEY", "") or ""
    )
    args.api_keys = args.api_keys or environment_keys.split(",")
    args.api_keys = [key.strip() for key in args.api_keys if key.strip()]
    if not args.api_keys:
        parser.error("provide --api-key or set BEACO_LOAD_TEST_API_KEYS/BEACO_LOAD_TEST_API_KEY")
    if min(args.requests, args.concurrency, args.batch_size) < 1:
        parser.error("requests, concurrency, and batch-size must be positive")
    if args.rps is not None and args.rps <= 0:
        parser.error("rps must be positive")
    if min(args.sleep, args.progress_interval) < 0:
        parser.error("sleep and progress-interval cannot be negative")
    raise SystemExit(asyncio.run(run(args)))


if __name__ == "__main__":
    main()
