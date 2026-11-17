# Load test

Locust test + test-data tooling for the Auto Scaling / Monitoring class. Test data is isolated by prefix, so it can be removed cleanly:

- Cognito users: `loadtest01@torch.dev` … (group `user`)
- Schedule rows and pins: room code `LOADTEST-Rnn`

## Steps

```powershell
# 0. Tools (once)
pip install locust ; locust --version

# 1. Create 8 users + 400 schedule rows (stack outputs are read automatically)
$env:LOADTEST_PASSWORD = "<choose a password that meets the pool policy>"
node loadtest/manage.mjs setup --users 8

# 2. Point Locust at the API
$env:API_BASE = "<ApiUrl stack output>"        # e.g. https://xxxx.execute-api.us-east-1.amazonaws.com/Prod
$env:USER_POOL_CLIENT_ID = "<UserPoolClientId stack output>"
locust -f loadtest/locustfile.py --host $env:API_BASE          # web UI at http://localhost:8089

# Headless example
locust -f loadtest/locustfile.py --host $env:API_BASE --headless -u 50 -r 5 -t 3m --csv loadtest/out/run1

# 3. Afterwards: remove everything the test created
node loadtest/manage.mjs cleanup
node loadtest/manage.mjs status      # should show 0 / 0 / 0
```

Find the stack outputs with `aws cloudformation describe-stacks --stack-name torch-v2 --query "Stacks[0].Outputs"`.

## Traffic mix (80% read / 20% write)

| Weight | Kind | Request |
|---|---|---|
| 4 | list | `GET /api/locations` |
| 2 | detail | `GET /api/schedules?room_code=LOADTEST-Rnn` |
| 2 | detail | `GET /api/route?from=&to=` (rooms on floor 2) |
| 2 | write | `POST /api/pins` (JWT, test rooms only) |

## Things that change the results

- `get-locations` / `get-schedules` cache in Lambda memory. Set `$env:FRESH = "1"` to add `?fresh=1` and force DynamoDB reads; compare a run with and without.
- Cold starts show as latency spikes while users ramp up. Use a slow spawn rate (`-r`) first, then a fast one.
- Watch in CloudWatch: Lambda `ConcurrentExecutions`, `Throttles`, `Duration`; API Gateway `5XXError`, `Latency`; DynamoDB `ThrottledRequests`.
- Cognito logs in once per simulated user (`on_start`), not per request.

## Tests

`node --test loadtest/lib.test.mjs` checks the helpers that guard deletion (only `LOADTEST-` rows and `loadtestNN@torch.dev` users can be deleted).
