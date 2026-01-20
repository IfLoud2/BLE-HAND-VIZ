const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });
console.log('Mock Server on 8080');
wss.on('connection', ws => {
    setInterval(() => {
        ws.send(JSON.stringify({ r: 0, p: 0, y: 0 }));
    }, 50);
});
