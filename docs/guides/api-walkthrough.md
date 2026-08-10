# Executable API walkthrough

This Bash walkthrough exercises the complete local flow with a Cookie Jar: health, Session creation, all eight saves, completion, Free-field non-leakage, replay-safe payment, and Full access. It requires a running local application plus `curl` and `jq`.

## Free to Full flow

```bash
export APP_BASE_URL="http://localhost:3000"
export COOKIE_JAR="/tmp/health-demo-cookies.txt"

curl --fail-with-body --silent "${APP_BASE_URL}/api/health" | jq

ENTRY_RESPONSE=$(curl --fail-with-body --silent \
  -X POST "${APP_BASE_URL}/api/sessions" \
  -H "Content-Type: application/json" \
  -H "Origin: ${APP_BASE_URL}" \
  -c "${COOKIE_JAR}" -b "${COOKIE_JAR}" \
  --data '{"ageRange":"30_39"}')

ASSESSMENT_ID=$(printf '%s' "${ENTRY_RESPONSE}" | jq -r '.data.assessment.id')
VERSION=$(printf '%s' "${ENTRY_RESPONSE}" | jq -r '.data.assessment.version')

save_step() {
  local slug="$1"
  local answer="$2"
  local payload response
  payload=$(jq -cn --argjson answer "${answer}" --argjson version "${VERSION}" '$answer + {version: $version}')
  response=$(curl --fail-with-body --silent \
    -X PATCH "${APP_BASE_URL}/api/assessments/${ASSESSMENT_ID}/steps/${slug}" \
    -H "Content-Type: application/json" \
    -H "Origin: ${APP_BASE_URL}" \
    -b "${COOKIE_JAR}" --data "${payload}")
  VERSION=$(printf '%s' "${response}" | jq -r '.data.version')
}

# Replaying the first answer is intentional, so all eight endpoints are exercised.
save_step age-range '{"ageRange":"30_39"}'
save_step sex '{"sex":"FEMALE"}'
save_step goal '{"goal":"LOSE_WEIGHT"}'
save_step age '{"age":35}'
save_step height '{"heightCm":170}'
save_step current-weight '{"weightKg":80}'
save_step target-weight '{"targetWeightKg":70}'
save_step activity '{"activityLevel":"MODERATE"}'

curl --fail-with-body --silent \
  -X POST "${APP_BASE_URL}/api/assessments/${ASSESSMENT_ID}/complete" \
  -H "Content-Type: application/json" \
  -H "Origin: ${APP_BASE_URL}" \
  -b "${COOKIE_JAR}" --data "{\"version\":${VERSION}}" | jq

FREE_RESPONSE=$(curl --fail-with-body --silent \
  -b "${COOKIE_JAR}" "${APP_BASE_URL}/api/assessments/${ASSESSMENT_ID}/result")
printf '%s' "${FREE_RESPONSE}" | jq -e '
  .data.accessLevel == "FREE" and
  ([.data | has("bmrKcal"), has("tdeeKcal"), has("recommendedCaloriesKcal"), has("predictionCurve")] | any | not)'

export PAYMENT_KEY="demo_$(node -e 'console.log(crypto.randomUUID())')"
PAYMENT_FIRST=$(curl --fail-with-body --silent \
  -X POST "${APP_BASE_URL}/api/pay" \
  -H "Content-Type: application/json" \
  -H "Origin: ${APP_BASE_URL}" \
  -b "${COOKIE_JAR}" \
  --data "{\"assessmentId\":\"${ASSESSMENT_ID}\",\"idempotencyKey\":\"${PAYMENT_KEY}\"}")

printf '%s' "${PAYMENT_FIRST}" | jq -e '
  .data.paymentId and
  .data.paymentCreated == true and
  .data.subscriptionStatus == "ACTIVE" and
  .data.activatedAt'

# A retry must reuse the identical key and Assessment.
PAYMENT_REPLAY=$(curl --fail-with-body --silent \
  -X POST "${APP_BASE_URL}/api/pay" \
  -H "Content-Type: application/json" \
  -H "Origin: ${APP_BASE_URL}" \
  -b "${COOKIE_JAR}" \
  --data "{\"assessmentId\":\"${ASSESSMENT_ID}\",\"idempotencyKey\":\"${PAYMENT_KEY}\"}")

FIRST_DATA=$(printf '%s' "${PAYMENT_FIRST}" | jq -S -c '.data')
REPLAY_DATA=$(printf '%s' "${PAYMENT_REPLAY}" | jq -S -c '.data')
test "${FIRST_DATA}" = "${REPLAY_DATA}"

curl --fail-with-body --silent \
  -b "${COOKIE_JAR}" "${APP_BASE_URL}/api/assessments/${ASSESSMENT_ID}/result" \
  | jq -e '.data.accessLevel == "FULL" and .data.bmrKcal and .data.predictionCurve'
```

## Fixed paid Session exchange

Run `npm run demo:reset`, source the generated owner-only `.env.demo.generated`, and restart the application first. The review code is a private credential; never commit it, put it in a URL, or record it in shared output.

```bash
export APP_BASE_URL="http://localhost:3000"
export DEMO_REVIEW_CODE="<receive privately; never commit>"
export REVIEW_COOKIE_JAR="/tmp/health-demo-review-cookies.txt"

EXCHANGE_RESPONSE=$(curl --fail-with-body --silent \
  -X POST "${APP_BASE_URL}/api/demo/session-exchange" \
  -H "Content-Type: application/json" \
  -H "Origin: ${APP_BASE_URL}" \
  -c "${REVIEW_COOKIE_JAR}" \
  --data "{\"reviewCode\":\"${DEMO_REVIEW_CODE}\"}")

printf '%s' "${EXCHANGE_RESPONSE}" | jq -e '
  .data.accessLevel == "FULL" and
  .data.resultUrl == "/api/assessments/20000000-0000-4000-8000-000000000001/result"'

curl --fail-with-body --silent \
  -b "${REVIEW_COOKIE_JAR}" \
  "${APP_BASE_URL}/api/assessments/20000000-0000-4000-8000-000000000001/result" \
  | jq -e '
      .data.accessLevel == "FULL" and
      .data.bmrKcal and
      .data.tdeeKcal and
      .data.recommendedCaloriesKcal and
      .data.predictionCurve'
```

The response and URL never contain the Session token. A successful exchange writes it only as an HttpOnly Cookie. Five attempts per source IP per 15 minutes are coordinated through PostgreSQL.

## Payment replay guarantees

- The durable lookup key is `(sessionId, idempotencyKey)`.
- The same key and Assessment return the original Payment result.
- Reusing the key for another Assessment returns `409 IDEMPOTENCY_KEY_REUSED`.
- An advisory transaction lock and unique indexes serialize competing first payments.
- Payment creation and Subscription activation share one transaction and roll back together.
- If the Result refetch fails after payment, the client replays the original key and then refetches.
- After a browser refresh, the durable `ACTIVE` Subscription still restores Full access.

This synchronous Demo provider does not implement signed provider webhooks, reconciliation, refunds, disputes, or compensation workflows.
