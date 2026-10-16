const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../extension/offscreen.js'), 'utf8');
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(setImmediate); };

function fixture(deferred = false) {
  const states = [], generated = [];
  const pending = [];
  let listener, audio;
  class Audio {
    constructor() { audio = this; this.paused = true; this.duration = 1; this.currentTime = 0; this.plays = 0; }
    set src(value) { this.url = value; this.currentTime = 0; this.ended = false; }
    get src() { return this.url; }
    play() { this.paused = false; this.plays++; return Promise.resolve(); }
    pause() { this.paused = true; }
    load() { queueMicrotask(() => this.onloadedmetadata?.()); }
    end() { this.ended = true; this.paused = true; this.onended?.(); }
  }
  vm.runInNewContext(source, {
    Audio, AbortController, AbortSignal, setTimeout, setInterval: () => 1, clearInterval() {},
    chrome: { runtime: { sendMessage: async msg => { if (msg.type === 'state') states.push(msg.state); }, onMessage: { addListener: f => { listener = f; } } } },
    fetch: async (_url, opts) => {
      const { text } = JSON.parse(opts.body);
      generated.push(text);
      if (deferred) await new Promise(resolve => pending.push(resolve));
      return { ok: true, json: async () => ({ id: encodeURIComponent(text), duration: 1000, words: [{ text, start: 0 }] }) };
    },
  });
  const send = (type, extra = {}) => listener({ target: 'offscreen', type, ...extra }, {}, () => {});
  const start = (extra = {}) => send('play', { text: '一つ。二つ。三つ。', settings: { server: 'http://test', split: true, repeat: 1, gap: 0, ...extra } });
  return { audio, states, generated, pending, send, start, status: () => states.at(-1) };
}

test('late synthesis from a sentence left during loading cannot restart the old audio', async () => {
  const p = fixture(true);
  try {
    p.start(); await flush();
    assert.equal(p.status().state, 'loading');
    p.send('next'); await flush();
    assert.equal(p.status().index, 1);
    p.pending[1](); await flush();
    assert.equal(p.status().state, 'playing');
    p.pending[0](); await flush();
    assert.equal(p.audio.plays, 1);
    assert.equal(p.status().index, 1);
    assert.match(p.audio.src, new RegExp(encodeURIComponent('二つ。')));
  } finally { p.send('stop'); }
});

test('sentence navigation changes clips, handles bounds and can restart after completion', async () => {
  const p = fixture();
  try {
    p.start(); await flush();
    assert.equal(p.status().index, 0);
    p.send('previous'); await flush();
    assert.equal(p.audio.plays, 1);
    p.send('next'); await flush();
    assert.equal(p.status().index, 1);
    assert.match(p.audio.src, new RegExp(encodeURIComponent('二つ。')));
    p.send('previous'); await flush();
    assert.equal(p.status().index, 0);
    p.audio.end(); await flush();
    assert.equal(p.status().index, 1);
    p.audio.end(); await flush();
    p.audio.end(); await flush();
    assert.equal(p.status().state, 'idle');
    assert.equal(p.status().index, 2);
    p.send('next'); await flush();
    assert.equal(p.status().state, 'idle');
    p.send('previous'); await flush();
    assert.equal(p.status().index, 1);
  } finally { p.send('stop'); }
});

test('repeat count and current-sentence loop change during playback and switching still works', async () => {
  const p = fixture();
  try {
    p.start({ repeat: 2 }); await flush();
    p.audio.end(); await flush();
    assert.equal(p.status().repeat, 2);
    assert.equal(p.status().index, 0);
    p.send('practice', { repeat: 1, loop: true });
    p.audio.end(); await flush();
    assert.equal(p.status().index, 0);
    assert.equal(p.status().loop, true);
    p.send('next'); await flush();
    assert.equal(p.status().index, 1);
    p.audio.end(); await flush();
    assert.equal(p.status().index, 1);
    p.send('practice', { repeat: 1, loop: false });
    p.audio.end(); await flush();
    assert.equal(p.status().index, 2);
    p.send('stop'); await flush();
    const plays = p.audio.plays;
    p.audio.end(); await flush();
    assert.equal(p.audio.plays, plays);
    assert.equal(p.status().state, 'idle');
  } finally { p.send('stop'); }
});

test('switching while paused stays paused and resume starts the requested sentence', async () => {
  const p = fixture();
  try {
    p.start(); await flush();
    p.send('pause');
    p.send('next'); await flush();
    assert.equal(p.status().state, 'paused');
    assert.equal(p.status().index, 1);
    assert.equal(p.audio.paused, true);
    const plays = p.audio.plays;
    p.send('resume');
    await new Promise(r => setTimeout(r, 120)); await flush();
    assert.equal(p.audio.plays, plays + 1);
    assert.match(p.audio.src, new RegExp(encodeURIComponent('二つ。')));
  } finally { p.send('stop'); }
});

test('switching during the speaking gap cancels the old sentence sequence', async () => {
  const p = fixture();
  try {
    p.start({ gap: .1 }); await flush();
    p.audio.end(); await flush();
    assert.equal(p.status().state, 'waiting');
    p.send('next'); await flush();
    assert.equal(p.status().state, 'playing');
    assert.equal(p.status().index, 1);
    await new Promise(r => setTimeout(r, 120)); await flush();
    assert.equal(p.status().index, 1);
  } finally { p.send('stop'); }
});
