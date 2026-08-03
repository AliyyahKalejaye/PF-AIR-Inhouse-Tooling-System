"""Seeds a small, realistic set of demo data through the live REST API —
not a direct DB write — so it works identically against localhost, a
docker-compose stack, or the real Render deployment, and never needs a
database connection string. Written for Phase 10 (QA & launch): gives the
Inventory dashboard, BOM checker, and Projects tool real content to look
at instead of an empty state, and doubles as a smoke test that signup,
component creation, and project creation all actually work end to end
against a live deploy.

Idempotent-ish: safe to re-run. A duplicate signup logs in instead of
failing, and a duplicate SKU is skipped rather than erroring the whole run.

Usage:
    uv run python scripts/seed_demo_data.py --api-base https://proforce-tooling-api.onrender.com
    uv run python scripts/seed_demo_data.py --api-base http://localhost:8000

Also writes bom_test.csv next to this script — a ready-made file for the
"real BOM test run" QA step (POST it to /api/v1/bom/check), with a mix of
names that should match seeded components and one that intentionally
won't, so the checker's available/low_stock/missing paths all get
exercised in one upload.
"""

import argparse
import csv
import sys
from pathlib import Path

import httpx

DEMO_USER = {
    "name": "QA Demo",
    "email": "qa-demo@proforcedefence.com",
    "staff_id": "PF-QA-001",
    "password": "correct-horse-battery-staple",
}

# (sku, name, type, category slug, brand, description, quantity, low_stock_threshold)
# SKU is what actually makes this script idempotent — create_component
# 409s on a duplicate SKU (see app/api/routes/components.py), which is
# the signal seed_components() below uses to skip re-creating something
# that's already there rather than piling up duplicates on every re-run.
# Quantities are deliberately spread across available / low-stock /
# out-of-stock so the Inventory dashboard's stat tiles and the BOM
# checker's three status buckets all have real examples to show.
COMPONENTS = [
    ("DEMO-CFP-1045", "Carbon Fiber Propeller 10x4.5", "Propeller", "aerospace-uav", "APC",
     "10-inch carbon fiber propeller pair, CW/CCW.", 40, 10),
    ("DEMO-MTR-2212", "Brushless Motor 2212 920KV", "Motor", "aerospace-uav", "EMAX",
     "920KV brushless outrunner for small multirotor frames.", 18, 5),
    ("DEMO-FC-PX6C", "Flight Controller - Pixhawk 6C", "Flight Controller", "aerospace-uav",
     "Holybro", "Pixhawk 6C flight controller, PX4/ArduPilot compatible.", 6, 5),
    ("DEMO-ESC-30A", "ESC 30A BLHeli_S", "ESC", "electronics", "Hobbywing",
     "30A BLHeli_S electronic speed controller.", 22, 8),
    ("DEMO-STM32F407", "STM32F407 Dev Board", "Dev Board", "electronics", "STMicroelectronics",
     "STM32F407VGT6 discovery-style development board.", 9, 5),
    ("DEMO-GPS-M8N", "GPS Module M8N", "GPS", "electronics", "u-blox",
     "u-blox M8N GPS module with compass.", 0, 5),
    ("DEMO-SCR-M3X10", "M3x10 Socket Head Cap Screw", "Fastener", "fasteners", "McMaster-Carr",
     "M3x10mm socket head cap screw, stainless steel, pack of 100.", 340, 50),
    ("DEMO-NUT-M3", "Nylon Lock Nut M3", "Fastener", "fasteners", "McMaster-Carr",
     "M3 nylon-insert lock nut, pack of 100.", 12, 50),
    ("DEMO-STANDOFF-20", "Aluminum Standoff 20mm", "Standoff", "mechanical", "Generic",
     "20mm M3 aluminum standoff, pack of 10.", 27, 10),
    ("DEMO-FRAME-ARM", "3D Printed Frame Arm", "Structural", "mechanical", "In-house",
     "PETG-printed quadcopter frame arm, in-house design.", 4, 4),
    ("DEMO-LIPO-4S5200", "LiPo Battery 4S 5200mAh", "Battery", "power-battery", "Tattu",
     "4S 14.8V 5200mAh LiPo, 45C discharge.", 11, 6),
    ("DEMO-CHG-BAL", "Battery Charger Balance", "Charger", "power-battery", "iSDT",
     "Balance charger/discharger for 1-6S LiPo packs.", 3, 3),
    ("DEMO-BUCK-5V", "DC-DC Buck Converter 5V", "Power", "power-battery", "Pololu",
     "5V 3A synchronous buck converter module.", 0, 5),
    ("DEMO-IMU-9250", "IMU MPU-9250", "Sensor", "sensors", "InvenSense",
     "9-axis IMU: accelerometer, gyroscope, magnetometer.", 14, 6),
    ("DEMO-BARO-280", "Barometric Pressure Sensor BMP280", "Sensor", "sensors", "Bosch",
     "Digital barometric pressure sensor, I2C/SPI.", 20, 6),
    ("DEMO-LIDAR-TFL", "LiDAR Rangefinder TF-Luna", "Sensor", "sensors", "Benewake",
     "Single-point LiDAR rangefinder, up to 8m range.", 2, 4),
]

# (title, problem_statement, abstract, status, mil: [(component_name, qty)], code_repo_url)
PROJECTS = [
    (
        "VTOL Survey Drone — Airframe Iteration 3",
        "Fixed-wing survey drones can't hover for close inspection passes; "
        "current airframe also has marginal endurance for the required 45-minute mission.",
        "Hybrid VTOL airframe combining a fixed-wing cruise mode with quad-rotor "
        "vertical takeoff/landing, targeting 45+ minute endurance at 5kg MTOW.",
        "active",
        [("Brushless Motor 2212 920KV", 4), ("Flight Controller - Pixhawk 6C", 1),
         ("LiPo Battery 4S 5200mAh", 2)],
        "https://github.com/octocat/Hello-World",
    ),
    (
        "Ground Station Telemetry Radio Upgrade",
        "Existing 433MHz telemetry link drops out beyond 2km line-of-sight.",
        "Evaluate and integrate a higher-power telemetry radio with improved "
        "range and encrypted link.",
        "done",
        [("GPS Module M8N", 1)],
        None,
    ),
    (
        "Sensor Payload Bay — Modular Mount",
        "Payload swaps between missions currently require full disassembly of the airframe.",
        None,
        "paused",
        [("IMU MPU-9250", 1), ("Barometric Pressure Sensor BMP280", 1),
         ("LiDAR Rangefinder TF-Luna", 1)],
        None,
    ),
]

BOM_TEST_ROWS = [
    ("Carbon Fiber Propeller 10x4.5", 8),   # available
    ("Brushless Motor 2212 920KV", 4),      # available
    ("GPS Module M8N", 2),                  # out of stock -> missing
    ("Battery Charger Balance", 5),         # low stock (qty 3 < requested 5)
    ("Titanium Frame Mount Assembly", 1),   # not seeded at all -> missing, no fuzzy match
]


def get_or_create_token(client: httpx.Client) -> str:
    signup = client.post("/api/v1/auth/signup", json=DEMO_USER)
    if signup.status_code not in (201, 409):
        signup.raise_for_status()

    login = client.post(
        "/api/v1/auth/login",
        data={"username": DEMO_USER["email"], "password": DEMO_USER["password"]},
    )
    login.raise_for_status()
    return login.json()["access_token"]


def seed_components(client: httpx.Client, headers: dict, category_by_slug: dict) -> dict:
    name_to_id = {}
    for sku, name, type_, cat_slug, brand, description, qty, threshold in COMPONENTS:
        payload = {
            "sku": sku,
            "name": name,
            "type": type_,
            "brand": brand,
            "description": description,
            "quantity": qty,
            "low_stock_threshold": threshold,
            "category_id": category_by_slug.get(cat_slug),
        }
        res = client.post("/api/v1/components", json=payload, headers=headers)
        if res.status_code == 201:
            name_to_id[name] = res.json()["id"]
            print(f"  created component: {name}")
        elif res.status_code == 409:
            # Duplicate SKU — already seeded on a prior run. Search by the
            # SKU (not the free-text name, which could partial-match more
            # than one row) to find its id instead of failing the run.
            existing = client.get(
                "/api/v1/components", params={"q": sku, "limit": 1}, headers=headers
            ).json()
            items = existing.get("items", [])
            if items:
                name_to_id[name] = items[0]["id"]
            print(f"  already exists, skipped: {name}")
        else:
            print(f"  FAILED ({res.status_code}) creating {name}: {res.text}", file=sys.stderr)
    return name_to_id


def seed_projects(client: httpx.Client, headers: dict, component_ids: dict) -> None:
    # Projects have no unique key to 409 on the way SKU does for
    # components, so dedup here explicitly against the existing list by
    # title — otherwise a second run of this script would pile up
    # duplicate "VTOL Survey Drone..." projects forever.
    existing_titles = {
        p["title"] for p in client.get("/api/v1/projects", headers=headers).json()
    }

    for title, problem, abstract, status, mil_items, code_url in PROJECTS:
        if title in existing_titles:
            print(f"  already exists, skipped: {title}")
            continue

        payload = {
            "title": title,
            "problem_statement": problem,
            "abstract": abstract,
            "status": status,
        }
        res = client.post("/api/v1/projects", json=payload, headers=headers)
        if res.status_code != 201:
            print(
                f"  FAILED ({res.status_code}) creating project {title}: {res.text}",
                file=sys.stderr,
            )
            continue
        project = res.json()
        print(f"  created project: {title}")

        for component_name, qty in mil_items:
            component_id = component_ids.get(component_name)
            if not component_id:
                continue
            mil_res = client.post(
                f"/api/v1/projects/{project['id']}/mil-items",
                json={"component_id": component_id, "quantity_required": qty},
                headers=headers,
            )
            if mil_res.status_code not in (201, 409):
                print(
                    f"    FAILED adding MIL item {component_name}: {mil_res.text}",
                    file=sys.stderr,
                )

        if code_url:
            link_res = client.post(
                f"/api/v1/projects/{project['id']}/media/link",
                json={"media_type": "code", "file_url": code_url, "filename": "Repo"},
                headers=headers,
            )
            if link_res.status_code != 201:
                print(f"    FAILED linking code repo: {link_res.text}", file=sys.stderr)


def write_bom_test_csv() -> Path:
    out_path = Path(__file__).parent / "bom_test.csv"
    with out_path.open("w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["Part Name", "Qty"])
        writer.writerows(BOM_TEST_ROWS)
    return out_path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--api-base",
        default="http://localhost:8000",
        help="Base URL of the running backend (no trailing slash, no /api/v1 suffix).",
    )
    args = parser.parse_args()

    with httpx.Client(base_url=args.api_base, timeout=30.0) as client:
        print(f"Seeding against {args.api_base} ...")

        print("Signing up / logging in demo QA user...")
        token = get_or_create_token(client)
        headers = {"Authorization": f"Bearer {token}"}
        print(f"  logged in as {DEMO_USER['email']}")

        print("Fetching categories...")
        categories = client.get("/api/v1/categories").json()
        category_by_slug = {c["slug"]: c["id"] for c in categories}
        if not category_by_slug:
            print(
                "  WARNING: no categories found — did the seed-categories migration run? "
                "Components will be created uncategorized.",
                file=sys.stderr,
            )

        print("Seeding components...")
        component_ids = seed_components(client, headers, category_by_slug)

        print("Seeding projects...")
        seed_projects(client, headers, component_ids)

    csv_path = write_bom_test_csv()
    print(f"\nWrote a ready-to-upload BOM test file: {csv_path}")
    print(
        f"\nDone. Log in as {DEMO_USER['email']} / {DEMO_USER['password']} "
        "to see the seeded data."
    )


if __name__ == "__main__":
    main()
