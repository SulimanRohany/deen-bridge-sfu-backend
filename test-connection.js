// Quick diagnostic script to test SFU backend connectivity
const WebSocket = require('ws');

// Test token (replace with your actual token)
const TEST_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoiYWNjZXNzIiwiZXhwIjoxNzU5Njc0NDUyLCJpYXQiOjE3NTk2NzQxNTIsImp0aSI6ImExZDg4NDJiMGIwZjQ3ZDRiNmQ3Yjk3MTcwNmI2ZjM2IiwidXNlcl9pZCI6IjMiLCJ1c2VyIjp7ImlkIjozLCJlbWFpbCI6InN0dWRlbnQxQGdtYWlsLmNvbSIsImZ1bGxfbmFtZSI6InN0dWRlbnQxIiwicm9sZSI6InN0dWRlbnQiLCJpc19hY3RpdmUiOnRydWUsImNyZWF0ZWRfYXQiOiIyMDI1LTA5LTIzVDAzOjA4OjM3LjY4Mjg0MFoiLCJwcm9maWxlIjp7ImlkIjoyLCJwcm9maWxlX2ltYWdlIjpudWxsLCJhZGRyZXNzIjoiIiwiZ2VuZGVyIjoiIiwicGhvbmVfbnVtYmVyIjpudWxsLCJkYXRlX29mX2JpcnRoIjpudWxsLCJwcmVmZXJyZWRfdGltZXpvbmUiOiJVVEMiLCJwcmVmZXJyZWRfbGFuZ3VhZ2UiOiJlbiIsImNyZWF0ZWRfYXQiOiIyMDI1LTA5LTIzVDAzOjA4OjM3LjY4Njg0OVoiLCJ1cGRhdGVkX2F0IjoiMjAyNS0wOS0yM1QwMzoxMDozMS4xODY0MThaIiwiaXNfcGFpZCI6dHJ1ZSwiaXNfbWlub3IiOmZhbHNlLCJ1c2VyIjozfX19.UBTm2BhQPkEnyHDblJnDy9eNt-1WKimeZvhZieK_x1w';

// Test 1: HTTP Health Check
fetch('http://127.0.0.1:3001/health')
  .then(response => {
    return response.json();
  })
  .then(data => {
  })
  .catch(error => {
  });

// Test 2: WebSocket Connection
setTimeout(() => {
  const wsUrl = `ws://127.0.0.1:3001/ws?token=${TEST_TOKEN}`;
  
  const ws = new WebSocket(wsUrl);
  
  ws.on('open', () => {
    // Send ping
    ws.send(JSON.stringify({ type: 'ping' }));
  });
  
  ws.on('message', (data) => {
    const message = JSON.parse(data.toString());
    if (message.type === 'connected') {
    }
  });
  
  ws.on('error', (error) => {
  });
  
  ws.on('close', (code, reason) => {
    if (code === 1008) {
    }
  });
  
  // Auto close after 3 seconds
  setTimeout(() => {
    if (ws.readyState === 1) {
      ws.close();
      process.exit(0);
    } else {
      process.exit(1);
    }
  }, 3000);
}, 1000);
