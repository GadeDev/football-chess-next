// プロトタイプHTMLのメインスクリプトをDOMスタブ付きvmコンテキストで実行するテスト用ヘルパー。
// CLAUDE.md「ロジック検証：DOMをスタブ化して eval し、対象関数を実行時テスト」の標準手法を
// 再利用可能なモジュールにしたもの。run(code) は同一コンテキストで追加コードを評価するため、
// スクリプト内のトップレベル let/const（pieces / oppCommands / ball など）にも触れられる。
import { readFileSync } from "node:fs";
import vm from "node:vm";

function makeEl(id, clicks) {
  const listeners = {};
  return {
    id,
    style: new Proxy({}, { get: () => "", set: () => true }),
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    children: [], childNodes: [], value: "", textContent: "", innerHTML: "", disabled: false, offsetWidth: 100,
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    removeEventListener() {},
    appendChild(c) { return c; }, prepend() {}, append() {}, removeChild() {}, remove() {},
    querySelector: () => null, querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    setAttribute() {}, getAttribute: () => null, removeAttribute() {}, focus() {},
    click() { if (clicks) clicks.push(id); (listeners.click || []).forEach((fn) => fn({ target: this })); },
    closest: () => null, insertBefore(c) { return c; }, contains: () => false, scrollTop: 0, scrollHeight: 0,
    __listeners: listeners,
  };
}

export function loadPrototype() {
  const html = readFileSync(new URL("../../football-chess-prototype.html", import.meta.url), "utf8");
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const main = scripts[scripts.length - 1];

  const clicks = [];
  const elements = new Map();
  const getEl = (id) => {
    if (!elements.has(id)) elements.set(id, makeEl(id, clicks));
    return elements.get(id);
  };
  const storage = new Map();
  const localStorageStub = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  };
  const context = {
    console: { log() {}, warn() {}, error() {} },
    document: {
      getElementById: (id) => getEl(id),
      createElement: (tag) => makeEl(`<${tag}>`, clicks),
      createTextNode: (t) => ({ t }),
      querySelector: () => null, querySelectorAll: () => [],
      addEventListener() {}, removeEventListener() {},
      body: makeEl("body", clicks), documentElement: makeEl("html", clicks), head: makeEl("head", clicks),
      hidden: false, visibilityState: "visible",
    },
    location: {
      origin: "https://mini.footballchess.io", pathname: "/", search: "", hash: "",
      hostname: "mini.footballchess.io", href: "https://mini.footballchess.io/",
    },
    history: { replaceState() {}, pushState() {} },
    navigator: { language: "ja", languages: ["ja"], clipboard: { writeText: async () => {} }, vibrate() {} },
    localStorage: localStorageStub, sessionStorage: localStorageStub,
    fetch: async () => ({ ok: true, json: async () => ({ ok: false }), text: async () => "" }),
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    URL, URLSearchParams,
    WebSocket: class { close() {} send() {} },
    Audio: class { play() { return Promise.resolve(); } },
    AudioContext: class {
      createOscillator() { return { connect() {}, start() {}, stop() {}, frequency: { value: 0 } }; }
      createGain() { return { connect() {}, gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} } }; }
      get destination() { return {}; }
      get currentTime() { return 0; }
      resume() { return Promise.resolve(); }
    },
    atob: (s) => Buffer.from(s, "base64").toString("binary"),
    btoa: (s) => Buffer.from(s, "binary").toString("base64"),
    crypto: { randomUUID: () => "00000000-0000-4000-8000-000000000000", getRandomValues: (a) => a },
    performance: { now: () => 0 },
    Image: class {}, alert() {},
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    getComputedStyle: () => new Proxy({}, { get: () => "" }),
  };
  context.window = context;
  context.globalThis = context;
  context.self = context;
  vm.createContext(context);
  vm.runInContext(main, context, { filename: "prototype-main.js" });

  return {
    context,
    clicks,
    getEl,
    /* 同一コンテキストで追加コードを評価（トップレベルlet/constにも触れられる） */
    run: (code) => vm.runInContext(code, context, { filename: "test-snippet.js" }),
    /* Math.randomを線形合同法で差し替え、テストを決定論にする */
    seedRandom: (seed = 42) => {
      vm.runInContext(
        `(()=>{ let s=${seed >>> 0}; Math.random=()=>{ s=(s*1664525+1013904223)>>>0; return s/4294967296; }; })()`,
        context,
      );
    },
  };
}
