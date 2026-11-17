"""Locust load test for Perimeter (API Gateway + Lambda + DynamoDB).

Run (web UI):   locust -f loadtest/locustfile.py
Headless:       locust -f loadtest/locustfile.py --headless -u 50 -r 5 -t 3m --csv loadtest/out/run1

Env vars (no secrets in git):
  API_BASE            e.g. https://xxxx.execute-api.us-east-1.amazonaws.com/Prod   (or pass --host)
  USER_POOL_CLIENT_ID stack output UserPoolClientId
  AWS_REGION          default us-east-1
  LOADTEST_PASSWORD   password used by `node loadtest/manage.mjs setup`
  LOADTEST_USERS      number of test users (default 8)
  FRESH               set to 1 to add ?fresh=1 (bypasses Lambda in-memory cache -> hits DynamoDB)

Traffic mix (weights 4:2:2:2): 80% reads, 20% writes.
  list   GET  /api/locations
  detail GET  /api/schedules?room_code=LOADTEST-Rnn   and   GET /api/route?from=&to=
  write  POST /api/pins  (idempotent put, test rooms only -> removed by `manage.mjs cleanup`)
"""
import itertools
import json
import os
import random

import requests
from locust import HttpUser, between, task

REGION = os.environ.get("AWS_REGION", "us-east-1")
CLIENT_ID = os.environ.get("USER_POOL_CLIENT_ID", "")
PASSWORD = os.environ.get("LOADTEST_PASSWORD", "")
N_USERS = int(os.environ.get("LOADTEST_USERS", "8"))
FRESH = "&fresh=1" if os.environ.get("FRESH") == "1" else ""
FRESH_Q = "?fresh=1" if os.environ.get("FRESH") == "1" else ""

DAYS = ["MON", "TUE", "WED", "THU", "FRI"]
TIMES = ["09:00", "10:30", "13:00", "14:30"]

_email_counter = itertools.count(1)


def cognito_login(email):
    """One login per simulated user (not per request) to avoid Cognito rate limits."""
    r = requests.post(
        f"https://cognito-idp.{REGION}.amazonaws.com/",
        headers={
            "Content-Type": "application/x-amz-json-1.1",
            "X-Amz-Target": "AWSCognitoIdentityProviderService.InitiateAuth",
        },
        data=json.dumps({
            "AuthFlow": "USER_PASSWORD_AUTH",
            "ClientId": CLIENT_ID,
            "AuthParameters": {"USERNAME": email, "PASSWORD": PASSWORD},
        }),
        timeout=15,
    )
    r.raise_for_status()
    return r.json()["AuthenticationResult"]["IdToken"]


class PerimeterUser(HttpUser):
    wait_time = between(0.5, 2)

    def on_start(self):
        if not CLIENT_ID or not PASSWORD:
            raise SystemExit("Set USER_POOL_CLIENT_ID and LOADTEST_PASSWORD")
        n = (next(_email_counter) - 1) % N_USERS + 1
        self.email = f"loadtest{n:02d}@torch.dev"
        self.token = cognito_login(self.email)
        # Floor-2 room ids for route requests (same floor => always reachable).
        with self.client.get(f"/api/locations{FRESH_Q}", name="GET /api/locations (setup)", catch_response=True) as r:
            records = r.json().get("records", []) if r.ok else []
        self.rooms = [x["location_id"] for x in records if x.get("location_kind") == "room" and x.get("floor") == 2]

    @task(4)
    def list_locations(self):
        self.client.get(f"/api/locations{FRESH_Q}", name="GET /api/locations")

    @task(2)
    def schedule_detail(self):
        room = f"LOADTEST-R{random.randint(1, 20):02d}"
        self.client.get(f"/api/schedules?room_code={room}{FRESH}", name="GET /api/schedules?room_code")

    @task(2)
    def route(self):
        if len(self.rooms) < 2:
            return
        a, b = random.sample(self.rooms, 2)
        self.client.get(f"/api/route?from={a}&to={b}", name="GET /api/route")

    @task(2)
    def pin_schedule(self):
        room = f"LOADTEST-R{random.randint(1, 20):02d}"
        day, start = random.choice(DAYS), random.choice(TIMES)
        # schedule_slot format matches seed rows; code mirrors manage.mjs buildScheduleRows
        r = int(room[-2:])
        code = f"LT{r}{day[0]}{start[:2]}"
        self.client.post(
            "/api/pins",
            headers={"Authorization": self.token},
            json={
                "room_code": room,
                "schedule_slot": f"{day}#{start}#{code}",
                "event_code": code,
                "event_name": f"Load test {code}",
                "day_of_week": day,
                "start_time": start,
                "end_time": "00:00",
            },
            name="POST /api/pins",
        )
