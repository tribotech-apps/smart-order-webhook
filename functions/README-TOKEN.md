# iFood Token Issue

Your current iFood access token has expired and the authentication endpoint is returning "Invalid grant type null" errors.

## Current Status
- Client ID: `e0ff7666-128e-4af3-a41a-622cbf612fe6`
- Client Secret: `10umz2bb0q...` (configured)
- Token: **EXPIRED**

## Error Details
All attempts to get a new token using your credentials return:
```json
{"error":{"code":"BadRequest","message":"Invalid grant type null"}}
```

## Solutions

### Option 1: Contact iFood Support
Contact iFood developer support to:
1. Verify your test environment credentials are still valid
2. Request a new access token
3. Confirm the correct authentication endpoint for test environment

### Option 2: Check iFood Developer Portal
1. Login to your iFood developer account
2. Navigate to your test application
3. Generate a new access token manually
4. Update the `IFOOD_ACCESS_TOKEN` in your `.env` file

### Option 3: Verify Credentials
The error suggests the grant type is being sent as null, which could indicate:
- Credentials have been revoked
- Test environment access has expired
- Authentication endpoint has changed

## Quick Test
Once you get a new token, update `.env` and run:
```bash
npm run test:ifood
```

## Contact Information
Based on previous iFood support communications, you should contact them through your developer portal or the support channels they provided previously.