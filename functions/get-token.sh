#!/bin/bash
set -e

# Load environment variables
source .env

echo "🔑 Attempting to get new iFood access token..."
echo "Using Client ID: ${IFOOD_CLIENT_ID:0:10}..."

# Debug what we're sending
echo "Sending grant_type=client_credentials"
echo "Sending client_id=${IFOOD_CLIENT_ID}"
echo "Sending client_secret=${IFOOD_CLIENT_SECRET:0:10}..."

# Try the official authentication endpoint
response=$(curl -s -w "\n%{http_code}" \
  -X POST 'https://merchant-api.ifood.com.br/authentication/v1.0/oauth/token' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d "grant_type=client_credentials&client_id=${IFOOD_CLIENT_ID}&client_secret=${IFOOD_CLIENT_SECRET}" \
  -v)

# Extract HTTP code and body
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | head -n -1)

echo "Response code: $http_code"
echo "Response body: $body"

if [ "$http_code" = "200" ]; then
    # Parse access token from JSON response
    access_token=$(echo "$body" | grep -o '"access_token":"[^"]*' | grep -o '[^"]*$')
    echo ""
    echo "✅ SUCCESS! New token obtained:"
    echo "IFOOD_ACCESS_TOKEN=$access_token"
    echo ""
    echo "📝 Update your .env file with the new token"
else
    echo "❌ Failed to get token. HTTP $http_code"
    echo "Response: $body"
fi