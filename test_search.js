const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:3000');

ws.on('open', () => {
    console.log('✅ Connected to Brain');
    // Simulate user typing "ma" (looking for "main_process")
    ws.send(JSON.stringify({ type: 'SEARCH', query: 'delete' }));
});

ws.on('message', (data) => {
    const response = JSON.parse(data);
    console.log('📩 Received Answer:', response);
    ws.close();
});