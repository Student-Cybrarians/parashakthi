const test = require('node:test');
const assert = require('node:assert/strict');
const QuestionService = require('../src/services/question.service');
const ContextService = require('../src/services/context.service');

test('detects common interviewer questions', () => {
  const q = new QuestionService();
  assert.equal(q.isQuestion('How would you design a scalable URL shortener?'), true);
  assert.equal(q.isQuestion('Explain the difference between a process and a thread'), true);
  assert.equal(q.isQuestion('Thanks, that makes sense'), false);
});

test('keeps rolling conversation context and screen freshness', () => {
  const c = new ContextService({ maxTurns: 2, maxScreenAgeMs: 1000 });
  c.addTranscript('What is dependency injection?');
  c.addAssistant('It is a design technique for supplying dependencies externally.');
  c.addTranscript('Can you give an example?');
  assert.equal(c.turns.length, 2);
  c.setScreenImage('abc123');
  assert.equal(c.getScreenImage(), 'abc123');
  assert.match(c.getPrompt(), /CONVERSATION/);
});
