const state = document.getElementById('state');
const transcript = document.getElementById('transcript');
const answer = document.getElementById('answer');

document.getElementById('start').addEventListener('click', async () => {
  try {
    const result = await window.parashakthi.start();
    state.textContent = result.configured ? 'capturing' : 'adapter not configured';
  } catch (e) {
    state.textContent = e.message;
  }
});

document.getElementById('stop').addEventListener('click', async () => {
  await window.parashakthi.stop();
  state.textContent = 'stopped';
});

window.parashakthi.onAudioStatus((s) => {
  state.textContent = s.state || 'audio';
});
window.parashakthi.onTranscript(({ text }) => {
  transcript.classList.remove('muted');
  transcript.textContent += `${transcript.textContent.trim() ? '\n' : ''}${text}`;
  transcript.scrollTop = transcript.scrollHeight;
  answer.textContent = '';
  answer.classList.remove('muted');
});
window.parashakthi.onAnswerToken((token) => {
  answer.classList.remove('muted');
  answer.textContent += token;
  answer.scrollTop = answer.scrollHeight;
});
window.parashakthi.onAnswerComplete(() => {
  state.textContent = 'ready';
});
window.parashakthi.onError(({ message }) => {
  state.textContent = message;
});
