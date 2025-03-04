const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { analyzeCodeWithGemini, updateFeedback } = require('./gemini');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, '../public')));

const sessions = new Map();

function generateSessionId() {
  return Math.random().toString(36).substr(2, 9);
}

wss.on('connection', (ws) => {
  console.log('Client connected');

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      console.log('Received message from client:', data);
      let result;

      switch (data.type) {
        case 'prompt':
          console.log('Processing prompt');
          result = await analyzeCodeWithGemini(data.text, 'generate');
          ws.send(JSON.stringify({ type: 'aiCode', code: result }));
          break;

        case 'codeUpdate':
          console.log('Processing codeUpdate');
          if (data.requestComment) {
            result = await analyzeCodeWithGemini(data.code, 'autoCorrect');
            ws.send(JSON.stringify({ type: 'suggestion', code: result }));
          }
          const languageOptions = await analyzeCodeWithGemini(data.code, 'languageOptions');
          ws.send(JSON.stringify({ type: 'languageOptions', options: languageOptions }));
          break;

        case 'aiHelp':
          console.log('Processing aiHelp');
          result = await analyzeCodeWithGemini(data.code, 'fix_or_extend');
          ws.send(JSON.stringify({ type: 'aiCode', code: result }));
          break;

        case 'chatQuery':
          console.log('Processing chatQuery');
          result = await analyzeCodeWithGemini(data.query, 'chat');
          ws.send(JSON.stringify({ type: 'chatResponse', message: result }));
          break;

        case 'feedback':
          console.log('Processing feedback');
          updateFeedback(data.query, data.value);
          console.log(`Feedback received: ${data.value} for query: ${data.query}`);
          ws.send(JSON.stringify({ type: 'feedbackAck', message: 'Thanks for your feedback!' }));
          break;

        case 'snippetRequest':
          console.log('Processing snippetRequest');
          result = await analyzeCodeWithGemini('Provide a reusable code snippet', 'generate');
          ws.send(JSON.stringify({ type: 'snippet', code: result }));
          break;

        case 'changeLanguage':
          console.log('Processing changeLanguage');
          result = await analyzeCodeWithGemini(`Convert this code to ${data.language}:\n${data.code}`, 'generate');
          ws.send(JSON.stringify({ type: 'aiCode', code: result }));
          break;

        case 'timeMachine':
          console.log('Processing timeMachine');
          ws.send(JSON.stringify({ type: 'timeMachine', history: data.history }));
          break;

        case 'duetCode':
          console.log('Processing duetCode');
          result = await analyzeCodeWithGemini(`Rewrite this code in a ${data.style} style:\n${data.code}`, 'generate');
          ws.send(JSON.stringify({ type: 'duetCode', code: result, style: data.style }));
          break;

        case 'startCollab':
          console.log('Processing startCollab');
          const sessionId = generateSessionId();
          sessions.set(sessionId, { code: data.code || '// Collaborative coding started\n', clients: new Set([ws]) });
          ws.sessionId = sessionId;
          const sessionCreatedMsg = { type: 'sessionCreated', sessionId };
          ws.send(JSON.stringify(sessionCreatedMsg));
          console.log('Session created and sent:', sessionCreatedMsg);
          break;

        case 'joinCollab':
          console.log('Processing joinCollab with sessionId:', data.sessionId);
          const session = sessions.get(data.sessionId);
          if (session) {
            session.clients.add(ws);
            ws.sessionId = data.sessionId;
            const sessionJoinedMsg = { type: 'sessionJoined', sessionId: data.sessionId, code: session.code };
            ws.send(JSON.stringify(sessionJoinedMsg));
            console.log('Client joined session and sent:', sessionJoinedMsg);
          } else {
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid session ID' }));
            console.log('Join failed: Invalid session ID', data.sessionId);
          }
          break;

        case 'collabUpdate':
          console.log('Processing collabUpdate');
          const collabSession = sessions.get(data.sessionId);
          if (collabSession) {
            collabSession.code = data.code;
            collabSession.clients.forEach(client => {
              if (client !== ws) {
                const collabUpdateMsg = { type: 'collabUpdate', sessionId: data.sessionId, code: data.code, fromSelf: false };
                client.send(JSON.stringify(collabUpdateMsg));
                console.log('Broadcast collab update:', collabUpdateMsg);
              }
            });
          } else {
            console.log('Collab update failed: No session found for ID', data.sessionId);
          }
          break;

        default:
          console.log('Unknown message type:', data.type);
          ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
      }

      if (result && typeof result === 'string' && result.startsWith('// Error:')) {
        ws.send(JSON.stringify({ type: 'error', message: result }));
      }
    } catch (error) {
      console.error('WebSocket message error:', error.message);
      ws.send(JSON.stringify({ type: 'error', message: `// Server error: ${error.message}` }));
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    if (ws.sessionId) {
      const session = sessions.get(ws.sessionId);
      if (session) {
        session.clients.delete(ws);
        if (session.clients.size === 0) {
          sessions.delete(ws.sessionId);
          console.log(`Session ${ws.sessionId} closed due to no clients`);
        }
      }
    }
  });
});

server.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});