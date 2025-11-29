const WebSocket = require('ws');

// Create a WebSocket connection to the SFU backend
const ws = new WebSocket('ws://localhost:3000/ws');

ws.on('open', () => {
  // Send createRoom message
  const message = {
    type: 'createRoom',
    data: {
      name: 'Session Room sfu-session-7',
      description: 'Auto-created room for session 7',
      maxParticipants: 100
    },
    requestId: 'create-room-' + Date.now()
  };
  
  ws.send(JSON.stringify(message));
});

ws.on('message', (data) => {
  const response = JSON.parse(data.toString());
  
  if (response.type === 'createRoomResponse') {
  } else if (response.error) {
  }
  
  ws.close();
});

ws.on('error', (error) => {
});

ws.on('close', () => {
});

