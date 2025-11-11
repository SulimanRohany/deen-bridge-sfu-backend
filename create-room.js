const WebSocket = require('ws');

// Create a WebSocket connection to the SFU backend
const ws = new WebSocket('ws://localhost:3000/ws');

ws.on('open', () => {
  console.log('Connected to SFU backend');
  
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
  
  console.log('Sending createRoom message:', message);
  ws.send(JSON.stringify(message));
});

ws.on('message', (data) => {
  const response = JSON.parse(data.toString());
  console.log('Received response:', response);
  
  if (response.type === 'createRoomResponse') {
    console.log('Room created successfully!');
    console.log('Room ID:', response.data.roomId);
    console.log('Room Name:', response.data.name);
  } else if (response.error) {
    console.error('Error:', response.error);
  }
  
  ws.close();
});

ws.on('error', (error) => {
  console.error('WebSocket error:', error);
});

ws.on('close', () => {
  console.log('Connection closed');
});

