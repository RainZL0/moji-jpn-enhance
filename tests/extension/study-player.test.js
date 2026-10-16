const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../extension/content.js'), 'utf8');
const dom = import('happy-dom');

async function fixture() {
  const { Window } = await dom;
  const window = new Window({ url: 'https://www.mojidict.com/trans' });
  const sent = [];
  let onMessage;
  window.chrome = {
    runtime: { sendMessage: msg => { sent.push(msg); return Promise.resolve(); }, onMessage: { addListener: f => { onMessage = f; } } },
    storage: { sync: { get: async () => ({ repeat: 1 }), set: () => Promise.resolve() }, onChanged: { addListener() {} } },
  };
  window.eval(source);
  await Promise.resolve();
  return { window, sent, onMessage };
}

function mount(window) {
  const page = window.document.createElement('div');
  page.className = 'moji-tts-study';
  const host = window.document.createElement('div');
  page.append(host);
  window.document.body.append(page);
  Object.assign(window.mojiTts.study, { isOpen: () => true, playerRoot: () => host, inputText: () => '窓を開ける。風が入る。' });
  window.mojiTts.relayout();
  return page;
}

test('other MOJi pages get no buttons or styles and text clicks are untouched', async () => {
  const { window, sent } = await fixture();
  try {
    assert.equal(window.document.querySelector('button, style, .st-player'), null);
    const text = window.document.createElement('p');
    text.textContent = '元のページ。';
    window.document.body.append(text);
    const press = new window.MouseEvent('mousedown', { bubbles: true, cancelable: true, altKey: true });
    assert.equal(text.dispatchEvent(press), true);
    assert.equal(press.defaultPrevented, false);
    assert.equal(sent.length, 0);
  } finally { await window.happyDOM.close(); }
});

test('study player places timeline below controls and sends sentence practice actions', async () => {
  const { window, sent, onMessage } = await fixture();
  try {
    const page = mount(window);
    const player = page.querySelector('.st-player');
    assert.equal(player.children[0].className, 'st-player-controls');
    assert.equal(player.children[1].className, 'st-player-timeline');
    assert.equal(page.querySelector('.st-player-play').textContent, 'Read all');
    page.querySelector('.st-player-play').click();
    assert.equal(sent.at(-1).text, '窓を開ける。風が入る。');
    assert.deepEqual({ ...sent.at(-1).practice }, { repeat: 1, loop: false, split: true });
    onMessage({ type: 'state', state: { state: 'playing', index: 1, total: 3 } });
    page.querySelector('[aria-label="Previous sentence"]').click();
    assert.equal(sent.at(-1).action, 'previous');
    page.querySelector('[aria-label="Next sentence"]').click();
    assert.equal(sent.at(-1).action, 'next');
    page.querySelector('.st-player-loop').click();
    assert.equal(sent.at(-1).loop, true);
    assert.equal(page.querySelector('.st-player-loop').getAttribute('aria-pressed'), 'true');
    const repeat = page.querySelector('select');
    repeat.value = '3';
    repeat.dispatchEvent(new window.Event('change'));
    assert.equal(sent.at(-1).repeat, 3);
    onMessage({ type: 'time', current: 2, duration: 8 });
    const progress = page.querySelector('input');
    assert.equal(progress.value, '250');
    progress.value = '500';
    progress.dispatchEvent(new window.Event('input'));
    progress.dispatchEvent(new window.Event('change'));
    assert.equal(sent.at(-1).seconds, 4);
    assert.equal(page.querySelector('.st-player-clock').textContent, '0:04 / 0:08');
  } finally { await window.happyDOM.close(); }
});

test('navigation boundaries, paused playback and leaving study are handled', async () => {
  const { window, sent, onMessage } = await fixture();
  try {
    const page = mount(window);
    onMessage({ type: 'state', state: { state: 'loading', index: 0, total: 2 } });
    assert.equal(page.querySelector('[aria-label="Previous sentence"]').disabled, true);
    assert.equal(page.querySelector('.st-player-progress').disabled, true);
    onMessage({ type: 'state', state: { state: 'paused', index: 1, total: 2 } });
    assert.equal(page.querySelector('[aria-label="Next sentence"]').disabled, true);
    assert.equal(page.querySelector('.st-player-play').textContent, 'Resume');
    page.querySelector('.st-player-play').click();
    assert.equal(sent.at(-1).action, 'toggle');
    onMessage({ type: 'state', state: { state: 'paused', phase: 'loading', index: 0, total: 2 } });
    onMessage({ type: 'time', current: 6, duration: 8 });
    assert.equal(page.querySelector('.st-player-progress').disabled, true);
    assert.equal(page.querySelector('.st-player-clock').textContent, '0:00 / 0:00');
    window.mojiTts.leaveStudy();
    assert.equal(sent.at(-1).action, 'stop');
    window.mojiTts.study.isOpen = () => false;
    const before = sent.length;
    window.mojiTts.read(null, '読まない。');
    assert.equal(sent.length, before);
  } finally { await window.happyDOM.close(); }
});
