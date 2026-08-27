#!/bin/bash
#
# connector-server 测试脚本
# 用于验证 API Key + HMAC 签名认证
#

set -e

# 配置
API_KEY="f8-test-api-key"
API_SECRET="f8-test-secret-2026"
BASE_URL="https://crew-f8-usva-tst.roiscloud.com/fpqe/connector"
# BASE_URL="http://localhost:3004/api"  # 本地测试

# 生成 HMAC 签名
generate_signature() {
    local api_key=$1
    local timestamp=$2
    local body=$3
    local secret=$4

    # SHA256(body) + HMAC-SHA256
    body_hash=$(echo -n "$body" | sha256sum | cut -d' ' -f1)
    payload="${api_key}.${timestamp}.${body_hash}"
    signature=$(echo -n "$payload" | openssl dgst -sha256 -hmac "$secret" | cut -d' ' -f2)

    echo "$signature"
}

# 测试健康检查（无需认证）
test_health() {
    echo "=== 测试健康检查 ==="
    curl -s "${BASE_URL}/health" | jq .
}

# 测试航班推送
test_flight_push() {
    echo "=== 测试航班推送 ==="

    timestamp=$(date +%s)
    body='{"data":{"flightNo":"CA1234","depDate":"2026-05-01","depAirport":"PEK","arrAirport":"SHA"}}'
    signature=$(generate_signature "$API_KEY" "$timestamp" "$body" "$API_SECRET")

    echo "Timestamp: $timestamp"
    echo "Signature: $signature"

    curl -s -X POST "${BASE_URL}/inbound/flight/f8-flight-test" \
        -H "Content-Type: application/json" \
        -H "X-Api-Key: $API_KEY" \
        -H "X-Timestamp: $timestamp" \
        -H "X-Signature: $signature" \
        -d "$body" | jq .
}

# 测试机组推送
test_crew_push() {
    echo "=== 测试机组推送 ==="

    timestamp=$(date +%s)
    body='{"data":{"crewCode":"CREW001","crewName":"测试机组","rank":"CA","base":"PEK"}}'
    signature=$(generate_signature "$API_KEY" "$timestamp" "$body" "$API_SECRET")

    echo "Timestamp: $timestamp"
    echo "Signature: $signature"

    curl -s -X POST "${BASE_URL}/inbound/crew/f8-crew-test" \
        -H "Content-Type: application/json" \
        -H "X-Api-Key: $API_KEY" \
        -H "X-Timestamp: $timestamp" \
        -H "X-Signature: $signature" \
        -d "$body" | jq .
}

# 测试排班查询
test_roster_query() {
    echo "=== 测试排班查询 ==="

    timestamp=$(date +%s)
    body=""
    signature=$(generate_signature "$API_KEY" "$timestamp" "$body" "$API_SECRET")

    echo "Timestamp: $timestamp"
    echo "Signature: $signature"

    curl -s -X GET "${BASE_URL}/outbound/roster/f8-roster-query-test?from=2026-05-01&to=2026-05-02" \
        -H "X-Api-Key: $API_KEY" \
        -H "X-Timestamp: $timestamp" \
        -H "X-Signature: $signature" | jq .
}

# 测试无效签名（应该返回 401）
test_invalid_signature() {
    echo "=== 测试无效签名（应返回 401） ==="

    timestamp=$(date +%s)

    curl -s -X POST "${BASE_URL}/inbound/flight/f8-flight-test" \
        -H "Content-Type: application/json" \
        -H "X-Api-Key: $API_KEY" \
        -H "X-Timestamp: $timestamp" \
        -H "X-Signature: invalid_signature_12345" \
        -d '{"data":{"flightNo":"CA1234"}}' | jq .
}

# 主测试流程
echo ""
echo "Connector Server 测试"
echo "====================="
echo ""

test_health
echo ""

test_flight_push
echo ""

test_crew_push
echo ""

test_roster_query
echo ""

test_invalid_signature
echo ""

echo "测试完成!"