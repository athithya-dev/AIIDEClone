require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.34.0/min/vs' } });
require(['vs/editor/editor.main'], function () {
  const userEditor = monaco.editor.create(document.getElementById('user-editor'), {
    value: '// Type your code here\n',
    language: 'javascript',
    theme: 'vs-dark',
  });

  const aiEditor = monaco.editor.create(document.getElementById('ai-editor'), {
    value: '// AI suggestions will appear here\n',
    language: 'javascript',
    theme: 'vs-dark',
    readOnly: true,
  });

  const ws = new WebSocket('ws://localhost:3000');
  const previewFrame = document.getElementById('preview-frame');
  const errorDisplay = document.getElementById('error-display');
  const timelineList = document.getElementById('timeline-list');
  const chatInput = document.getElementById('chat-input');
  const chatOutput = document.getElementById('chat-output');
  const snippetList = document.getElementById('snippet-list');
  const sensei = document.getElementById('sensei');
  const languageSelect = document.getElementById('language-select');
  const applyCorrectionBtn = document.getElementById('apply-correction');
  const toggleMoodBtn = document.getElementById('toggle-mood');
  const timeMachineBtn = document.getElementById('time-machine');
  const duetStyleSelect = document.getElementById('duet-style');
  const comeAndCodeBtn = document.getElementById('come-and-code');
  const collabModal = document.getElementById('collab-modal');
  const closeModal = document.getElementById('close-modal');
  const startCollabBtn = document.getElementById('start-collab');
  const joinCollabBtn = document.getElementById('join-collab');
  const sessionIdInput = document.getElementById('session-id');
  const sessionInfo = document.getElementById('session-info');
  const moodAudio = document.getElementById('mood-audio');
  let timeline = [];
  let snippets = [];
  let moodEnabled = false;
  let inCollabSession = false;
  let currentSessionId = null;

  ws.onopen = () => {
    console.log('WebSocket connected to server');
    sensei.textContent = '👩‍💻 Sensei says: Connected!';
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log('Received from server:', data);
    errorDisplay.textContent = '';

    if (data.type === 'aiCode') {
      aiEditor.setValue(data.code);
      updatePreview(data.code);
      addToTimeline('AI Generated', data.code);
    } else if (data.type === 'suggestion') {
      aiEditor.setValue(data.code);
      if (moodEnabled) updateMood(data.code);
    } else if (data.type === 'chatResponse') {
      chatOutput.innerHTML += `<p>${data.message}</p>`;
      chatOutput.scrollTop = chatOutput.scrollHeight;
    } else if (data.type === 'snippet') {
      addSnippet(data.code);
    } else if (data.type === 'feedbackAck') {
      chatOutput.innerHTML += `<p>${data.message}</p>`;
    } else if (data.type === 'languageOptions') {
      languageSelect.innerHTML = '<option value="">Change Language</option>';
      let options;
      try {
        const jsonString = data.options.replace(/```json\n|```/g, '').trim();
        options = JSON.parse(jsonString);
        options.languages.forEach(lang => {
          const option = document.createElement('option');
          option.value = lang;
          option.textContent = lang;
          languageSelect.appendChild(option);
        });
      } catch (e) {
        console.error('Failed to parse language options:', e.message, 'Raw:', data.options);
        ['C', 'C++', 'Java', 'JavaScript', 'Python', 'Ruby', 'Go', 'Rust', 'PHP', 'TypeScript'].forEach(lang => {
          const option = document.createElement('option');
          option.value = lang;
          option.textContent = lang;
          languageSelect.appendChild(option);
        });
      }
    } else if (data.type === 'timeMachine') {
      showTimeMachine(data.history);
    } else if (data.type === 'duetCode') {
      aiEditor.setValue(data.code);
      sensei.textContent = `👩‍💻 Sensei says: Duet in ${data.style} style!`;
    } else if (data.type === 'sessionCreated') {
      currentSessionId = data.sessionId;
      inCollabSession = true;
      sessionInfo.textContent = `Session ID: ${data.sessionId} (Share this!)`;
      sensei.textContent = '👩‍💻 Sensei says: Collaboration started!';
      console.log('Session ID set to:', data.sessionId);
    } else if (data.type === 'sessionJoined') {
      currentSessionId = data.sessionId;
      inCollabSession = true;
      userEditor.setValue(data.code);
      sessionInfo.textContent = `Joined session: ${data.sessionId}`;
      sensei.textContent = '👩‍💻 Sensei says: You’re in the collab!';
      collabModal.style.display = 'none'; // Close modal after joining
      console.log('Joined session with code:', data.code);
    } else if (data.type === 'collabUpdate') {
      if (data.sessionId === currentSessionId && !data.fromSelf) {
        userEditor.setValue(data.code);
        console.log('Synced code from collab:', data.code);
      }
    } else if (data.type === 'error') {
      errorDisplay.textContent = data.message;
      console.error('Server error:', data.message);
    }
  };

  ws.onerror = (error) => console.error('WebSocket error:', error);
  ws.onclose = () => console.log('WebSocket closed');

  document.getElementById('submitPrompt').addEventListener('click', () => {
    const prompt = document.getElementById('prompt').value;
    if (prompt) {
      ws.send(JSON.stringify({ type: 'prompt', text: prompt }));
    }
  });

  let timeout;
  userEditor.onDidChangeModelContent(() => {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      const code = userEditor.getValue();
      ws.send(JSON.stringify({ type: 'codeUpdate', code, requestComment: true }));
      addToTimeline('User Edit', code);
      sensei.textContent = '👩‍💻 Sensei says: Code updated!';
      if (inCollabSession) {
        ws.send(JSON.stringify({ type: 'collabUpdate', sessionId: currentSessionId, code, fromSelf: true }));
      }
    }, 500);
  });

  document.getElementById('aiHelp').addEventListener('click', () => {
    ws.send(JSON.stringify({ type: 'aiHelp', code: userEditor.getValue() }));
  });

  document.getElementById('chat-submit').addEventListener('click', () => {
    const query = chatInput.value;
    if (query) {
      ws.send(JSON.stringify({ type: 'chatQuery', query }));
      chatInput.value = '';
    }
  });

  document.getElementById('fetch-snippet').addEventListener('click', () => {
    ws.send(JSON.stringify({ type: 'snippetRequest' }));
  });

  applyCorrectionBtn.addEventListener('click', () => {
    userEditor.setValue(aiEditor.getValue());
    updatePreview(aiEditor.getValue());
    sensei.textContent = '👩‍💻 Sensei says: Correction applied!';
    if (inCollabSession) {
      ws.send(JSON.stringify({ type: 'collabUpdate', sessionId: currentSessionId, code: aiEditor.getValue(), fromSelf: true }));
    }
  });

  window.changeLanguage = () => {
    const language = languageSelect.value;
    if (language) {
      ws.send(JSON.stringify({ type: 'changeLanguage', language, code: userEditor.getValue() }));
      sensei.textContent = `👩‍💻 Sensei says: Converted to ${language}!`;
      if (inCollabSession) {
        ws.send(JSON.stringify({ type: 'collabUpdate', sessionId: currentSessionId, code: aiEditor.getValue(), fromSelf: true }));
      }
    }
  };

  toggleMoodBtn.addEventListener('click', () => {
    moodEnabled = !moodEnabled;
    toggleMoodBtn.textContent = `Mood Enhancer: ${moodEnabled ? 'On' : 'Off'}`;
    if (moodEnabled) updateMood(userEditor.getValue());
    else moodAudio.pause();
  });

  timeMachineBtn.addEventListener('click', () => {
    ws.send(JSON.stringify({ type: 'timeMachine', history: timeline }));
  });

  window.startDuet = () => {
    const style = duetStyleSelect.value;
    if (style) {
      ws.send(JSON.stringify({ type: 'duetCode', style, code: userEditor.getValue() }));
    }
  };

  comeAndCodeBtn.addEventListener('click', () => {
    collabModal.style.display = 'block';
    console.log('Come and Code button clicked');
  });

  closeModal.addEventListener('click', () => {
    collabModal.style.display = 'none';
  });

  startCollabBtn.addEventListener('click', () => {
    console.log('Start Session button clicked');
    const code = userEditor.getValue();
    ws.send(JSON.stringify({ type: 'startCollab', code }));
    console.log('Sent startCollab message with code:', code);
  });

  joinCollabBtn.addEventListener('click', () => {
    const sessionId = sessionIdInput.value.trim();
    if (sessionId) {
      console.log('Join Session button clicked with ID:', sessionId);
      ws.send(JSON.stringify({ type: 'joinCollab', sessionId }));
      console.log('Sent joinCollab message with ID:', sessionId);
    } else {
      console.log('No session ID entered');
      errorDisplay.textContent = 'Please enter a session ID!';
    }
  });

  function updatePreview(code) {
    const html = `
      <html>
      <body>
        <script>
          try {
            ${code}
          } catch (e) {
            document.body.innerHTML = 'Error: ' + e.message;
          }
        </script>
      </body>
      </html>
    `;
    previewFrame.srcdoc = html;
  }

  function addToTimeline(type, code) {
    timeline.push({ type, code, timestamp: new Date().toLocaleTimeString() });
    if (timeline.length > 10) timeline.shift();
    timelineList.innerHTML = '';
    timeline.forEach((entry, index) => {
      const li = document.createElement('li');
      li.textContent = `${entry.timestamp} - ${entry.type}`;
      li.title = entry.code.slice(0, 50) + '...';
      li.addEventListener('click', () => {
        if (entry.type.includes('User')) userEditor.setValue(entry.code);
        else aiEditor.setValue(entry.code);
      });
      timelineList.appendChild(li);
    });
  }

  function addSnippet(code) {
    snippets.push(code);
    const li = document.createElement('li');
    li.textContent = code.slice(0, 20) + '...';
    li.title = code;
    li.addEventListener('click', () => userEditor.setValue(code));
    snippetList.appendChild(li);
  }

  function updateMood(code) {
    const complexity = code.split('\n').length + code.split(';').length;
    if (complexity > 20) {
      moodAudio.src = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';
      document.body.style.background = 'linear-gradient(135deg, #ff5555, #2a2a2a)';
    } else {
      moodAudio.src = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3';
      document.body.style.background = 'linear-gradient(135deg, #1a1a1a, #2a2a2a)';
    }
    moodAudio.play();
  }

  function showTimeMachine(history) {
    let narration = 'Code Time Machine:\n';
    history.forEach((entry, index) => {
      if (index > 0) {
        narration += `${entry.timestamp}: Changed from "${history[index-1].code.slice(0, 20)}..." to "${entry.code.slice(0, 20)}..."\n`;
      }
    });
    aiEditor.setValue(narration);
    sensei.textContent = '👩‍💻 Sensei says: Travel through time!';
  }
});