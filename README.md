# HealthDemo

HealthDemo is an anonymous health-assessment demo. Product behavior and frozen API contracts live under `docs/prd`.

## Local API checks

Set `APP_BASE_URL` to the exact application origin. Every `POST` and `PATCH` request requires both a JSON media type and that exact Origin (scheme, host, and port):

```bash
export APP_BASE_URL="http://localhost:3000"
export COOKIE_JAR="/tmp/health-demo-cookies.txt"

curl --fail-with-body \
  -X POST "${APP_BASE_URL}/api/sessions" \
  -H "Content-Type: application/json" \
  -H "Origin: ${APP_BASE_URL}" \
  -c "${COOKIE_JAR}" \
  -b "${COOKIE_JAR}" \
  --data '{"ageRange":"30_39"}'

curl --fail-with-body \
  -b "${COOKIE_JAR}" \
  "${APP_BASE_URL}/api/session"

curl --fail-with-body \
  -X POST "${APP_BASE_URL}/api/assessments" \
  -H "Content-Type: application/json" \
  -H "Origin: ${APP_BASE_URL}" \
  -b "${COOKIE_JAR}" \
  --data '{}'
```

The read-only health check does not create a Session or write to the database:

```bash
curl --fail-with-body "${APP_BASE_URL}/api/health"
```

The full setup, assessment, payment, demo-review, retention, and delivery guide is completed by P0-12.
