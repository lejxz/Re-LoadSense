import argparse
import csv
import json
import random
import sys
import time
import urllib.request
from datetime import datetime, UTC
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.app.core.config import config_value
from backend.app.core.occupancy import DEFAULT_CAPACITY, get_occupancy_tier


def simulated_tracks(frames: int, line_y: int) -> list[dict]:
    rows = []
    occupancy = 0
    previous_y = line_y + 30
    for frame in range(frames):
        movement = random.choice([-18, -10, -6, 8, 14])
        current_y = previous_y + movement
        centroid_x = random.randint(90, 550)
        direction = ""
        if previous_y > line_y >= current_y:
            occupancy += 1
            direction = "boarding"
        elif previous_y < line_y <= current_y:
            occupancy = max(0, occupancy - 1)
            direction = "alighting"
        occupancy = min(DEFAULT_CAPACITY + int(config_value("occupancy", "overload_demo_buffer", default=4)), occupancy)
        rows.append(
            {
                "timestamp": datetime.now(UTC).isoformat(),
                "frame": frame,
                "person_id": 1,
                "line_y": line_y,
                "centroid_x": centroid_x,
                "centroid_y": current_y,
                "zone": density_zone(centroid_x),
                "direction": direction,
                "running_count": occupancy,
                "tier": get_occupancy_tier(occupancy, DEFAULT_CAPACITY),
            }
        )
        previous_y = current_y
        if current_y < line_y - 80 or current_y > line_y + 80:
            previous_y = line_y + random.choice([-40, 40])
    return rows


def density_zone(centroid_x: int) -> str:
    if centroid_x < 240:
        return "front_entrance"
    if centroid_x < 400:
        return "mid_cabin"
    return "rear_cabin"


def write_rows(rows: list[dict], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=["timestamp", "frame", "person_id", "line_y", "centroid_x", "centroid_y", "zone", "direction", "running_count", "tier"],
        )
        writer.writeheader()
        writer.writerows(rows)


def capture_tracks(args) -> list[dict]:
    if args.source == "sim":
        return simulated_tracks(args.frames, args.line_y)
    try:
        import cv2
    except Exception:
        print("opencv is not available; falling back to simulated edge tracks", file=sys.stderr)
        return simulated_tracks(args.frames, args.line_y)

    source = args.camera_index if args.source == "webcam" else args.video
    if args.source == "video" and not source:
        raise SystemExit("--video is required when --source video")
    capture = cv2.VideoCapture(source)
    if not capture.isOpened():
        raise SystemExit(f"could not open {args.source} source: {source}")

    rows: list[dict] = []
    occupancy = args.start_occupancy
    previous_y = args.line_y + 30
    frame_index = 0
    started = time.time()
    while frame_index < args.frames:
        if args.duration_seconds and time.time() - started >= args.duration_seconds:
            break
        ok, frame = capture.read()
        if not ok:
            break
        height, width = frame.shape[:2]
        line_y = min(max(args.line_y, 0), max(0, height - 1))
        gray_mean = int(frame.mean())
        movement = ((gray_mean % 17) - 8) or random.choice([-9, 9])
        current_y = previous_y + movement
        centroid_x = int((frame_index * 37 + gray_mean) % max(width, 1))
        direction = ""
        if previous_y > line_y >= current_y:
            occupancy += 1
            direction = "boarding"
        elif previous_y < line_y <= current_y:
            occupancy = max(0, occupancy - 1)
            direction = "alighting"
        occupancy = min(DEFAULT_CAPACITY + int(config_value("occupancy", "overload_demo_buffer", default=4)), occupancy)
        rows.append(make_row(frame_index, line_y, centroid_x, current_y, direction, occupancy))
        previous_y = current_y
        if current_y < line_y - 90 or current_y > line_y + 90:
            previous_y = line_y + random.choice([-45, 45])
        frame_index += 1
    capture.release()
    return rows


def make_row(frame: int, line_y: int, centroid_x: int, centroid_y: int, direction: str, occupancy: int) -> dict:
    return {
        "timestamp": datetime.now(UTC).isoformat(),
        "frame": frame,
        "person_id": 1,
        "line_y": line_y,
        "centroid_x": centroid_x,
        "centroid_y": centroid_y,
        "zone": density_zone(centroid_x),
        "direction": direction,
        "running_count": occupancy,
        "tier": get_occupancy_tier(occupancy, DEFAULT_CAPACITY),
    }


def post_telemetry(rows: list[dict], args) -> int:
    sent = 0
    for row in rows:
        if args.http_crossings_only and not row["direction"]:
            continue
        payload = {
            "vehicle_id": args.vehicle_id,
            "route": args.route,
            "latitude": args.latitude,
            "longitude": args.longitude,
            "occupancy": row["running_count"],
            "timestamp": row["timestamp"],
            "signal_quality": "edge_counter",
        }
        data = json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(args.url, data=data, headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(request, timeout=5) as response:
                if 200 <= response.status < 300:
                    sent += 1
        except Exception as exc:
            print(f"http export failed on frame {row['frame']}: {exc}", file=sys.stderr)
    return sent


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Software-only bidirectional line-crossing passenger counter demo"
    )
    parser.add_argument("--source", choices=["sim", "webcam", "video"], default="sim", help="Input source for the edge counter")
    parser.add_argument("--camera-index", type=int, default=0, help="Webcam index for --source webcam")
    parser.add_argument("--video", default="", help="Video file path for --source video")
    parser.add_argument("--frames", type=int, default=int(config_value("edge_counter", "frames", default=240)))
    parser.add_argument("--duration-seconds", type=float, default=0.0, help="Optional runtime cap for webcam/video mode")
    parser.add_argument("--line-y", type=int, default=int(config_value("edge_counter", "line_y", default=240)))
    parser.add_argument("--output", default=config_value("data", "edge_counter_output", default=str(Path("data") / "edge_line_crossing_counts.csv")))
    parser.add_argument("--export", choices=["csv", "http", "both"], default="csv")
    parser.add_argument("--url", default="http://127.0.0.1:8000/api/telemetry")
    parser.add_argument("--vehicle-id", default="EDGE-001")
    parser.add_argument("--route", default=config_value("project", "default_route", default="04L"))
    parser.add_argument("--latitude", type=float, default=14.5992)
    parser.add_argument("--longitude", type=float, default=120.9840)
    parser.add_argument("--start-occupancy", type=int, default=0)
    parser.add_argument("--http-crossings-only", action="store_true", help="Only POST frames that contain a crossing event")
    args = parser.parse_args()

    rows = capture_tracks(args)
    if not rows:
        raise SystemExit("no frames processed")
    if args.export in {"csv", "both"}:
        write_rows(rows, Path(args.output))
    posted = post_telemetry(rows, args) if args.export in {"http", "both"} else 0
    changes = [row for row in rows if row["direction"]]
    if args.export in {"csv", "both"}:
        print(f"wrote {len(rows)} frame rows to {args.output}")
    if args.export in {"http", "both"}:
        print(f"posted {posted} telemetry samples to {args.url}")
    print(f"detected crossings: {len(changes)}")
    print(f"final occupancy: {rows[-1]['running_count']} ({rows[-1]['tier']})")


if __name__ == "__main__":
    main()
