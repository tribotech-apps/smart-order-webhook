require('dotenv').config();

async function getNewToken() {
  const clientId = process.env.IFOOD_CLIENT_ID;
  const clientSecret = process.env.IFOOD_CLIENT_SECRET;
  
  console.log('Client ID:', clientId ? `${clientId.substring(0, 10)}...` : 'NOT SET');
  console.log('Client Secret:', clientSecret ? `${clientSecret.substring(0, 10)}...` : 'NOT SET');
  
  if (!clientId || !clientSecret) {
    console.error('IFOOD_CLIENT_ID and IFOOD_CLIENT_SECRET must be set in .env file');
    process.exit(1);
  }

  try {
    console.log('Getting new iFood access token...');
    
    const formData = `grant_type=client_credentials&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`;
    console.log('Form data (first 50 chars):', formData.substring(0, 50) + '...');
    
    const response = await fetch('https://merchant-api.ifood.com.br/authentication/v1.0/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Token request failed: ${response.status} ${response.statusText}`);
      console.error('Error details:', errorText);
      process.exit(1);
    }

    const data = await response.json();
    
    console.log('\n✅ New token generated successfully!');
    console.log('\n📋 Update your .env file with this new token:');
    console.log(`IFOOD_ACCESS_TOKEN=${data.access_token}`);
    console.log(`\n⏰ Token expires in: ${data.expires_in} seconds (${Math.round(data.expires_in / 3600)} hours)`);
    
  } catch (error) {
    console.error('Error getting new token:', error.message);
    process.exit(1);
  }
}

getNewToken();