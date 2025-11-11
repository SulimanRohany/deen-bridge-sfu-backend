// Quick diagnostic script to test SFU backend connectivity
const WebSocket = require('ws');

// Test token (replace with your actual token)
const TEST_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoiYWNjZXNzIiwiZXhwIjoxNzU5Njc0NDUyLCJpYXQiOjE3NTk2NzQxNTIsImp0aSI6ImExZDg4NDJiMGIwZjQ3ZDRiNmQ3Yjk3MTcwNmI2ZjM2IiwidXNlcl9pZCI6IjMiLCJ1c2VyIjp7ImlkIjozLCJlbWFpbCI6InN0dWRlbnQxQGdtYWlsLmNvbSIsImZ1bGxfbmFtZSI6InN0dWRlbnQxIiwicm9sZSI6InN0dWRlbnQiLCJpc19hY3RpdmUiOnRydWUsImNyZWF0ZWRfYXQiOiIyMDI1LTA5LTIzVDAzOjA4OjM3LjY4Mjg0MFoiLCJwcm9maWxlIjp7ImlkIjoyLCJwcm9maWxlX2ltYWdlIjpudWxsLCJhZGRyZXNzIjoiIiwiZ2VuZGVyIjoiIiwicGhvbmVfbnVtYmVyIjpudWxsLCJkYXRlX29mX2JpcnRoIjpudWxsLCJwcmVmZXJyZWRfdGltZXpvbmUiOiJVVEMiLCJwcmVmZXJyZWRfbGFuZ3VhZ2UiOiJlbiIsImNyZWF0ZWRfYXQiOiIyMDI1LTA5LTIzVDAzOjA4OjM3LjY4Njg0OVoiLCJ1cGRhdGVkX2F0IjoiMjAyNS0wOS0yM1QwMzoxMDozMS4xODY0MThaIiwiaXNfcGFpZCI6dHJ1ZSwiaXNfbWlub3IiOmZhbHNlLCJ1c2VyIjozfX19.UBTm2BhQPkEnyHDblJnDy9eNt-1WKimeZvhZieK_x1w';

console.log('🔍 Testing SFU Backend Connection...\n');

// Test 1: HTTP Health Check
console.log('Test 1: HTTP Health Check');
fetch('http://127.0.0.1:3001/health')
  .then(response => {
    console.log(`✅ HTTP server is accessible on port 3001`);
    return response.json();
  })
  .then(data => {
    console.log('Health check response:', JSON.stringify(data, null, 2));
  })
  .catch(error => {
    console.log(`❌ HTTP server not accessible: ${error.message}`);
    console.log('   → Make sure SFU backend is running: npm run dev');
  });

// Test 2: WebSocket Connection
setTimeout(() => {
  console.log('\nTest 2: WebSocket Connection');
  const wsUrl = `ws://127.0.0.1:3001/ws?token=${TEST_TOKEN}`;
  
  console.log(`Connecting to: ${wsUrl.substring(0, 50)}...`);
  
  const ws = new WebSocket(wsUrl);
  
  ws.on('open', () => {
    console.log('✅ WebSocket connection successful!');
    console.log(`   ReadyState: ${ws.readyState} (1 = OPEN)`);
    
    // Send ping
    ws.send(JSON.stringify({ type: 'ping' }));
  });
  
  ws.on('message', (data) => {
    const message = JSON.parse(data.toString());
    console.log('📨 Received message:', message.type);
    if (message.type === 'connected') {
      console.log('✅ Authenticated successfully!');
      console.log('   User:', message.data.user);
    }
  });
  
  ws.on('error', (error) => {
    console.log(`❌ WebSocket error: ${error.message}`);
  });
  
  ws.on('close', (code, reason) => {
    console.log(`🔌 WebSocket closed`);
    console.log(`   Code: ${code}`);
    console.log(`   Reason: ${reason || 'No reason provided'}`);
    
    if (code === 1008) {
      console.log('\n❌ Authentication failed!');
      console.log('   Possible causes:');
      console.log('   1. JWT secret mismatch');
      console.log('   2. Token expired');
      console.log('   3. Invalid token format');
    }
  });
  
  // Auto close after 3 seconds
  setTimeout(() => {
    if (ws.readyState === 1) {
      console.log('\n✅ Connection test passed!');
      ws.close();
      process.exit(0);
    } else {
      console.log('\n❌ Connection test failed!');
      process.exit(1);
    }
  }, 3000);
}, 1000);
