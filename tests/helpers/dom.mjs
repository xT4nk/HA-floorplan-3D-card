// Tiny DOM for the card tests in Node (no layout, no WebGL, no dependencies).
// install() puts document, HTMLElement, customElements… on globalThis.
const VOID = new Set(['input', 'br', 'img', 'hr', 'meta', 'link', 'source']);
let uid = 0;

class ClassList {
  constructor(el) { this.el = el; }
  _get() { return (this.el.attrs.class || '').split(/\s+/).filter(Boolean); }
  _set(a) { this.el.attrs.class = a.join(' '); }
  add(...c) { const a = this._get(); for (const x of c) if (!a.includes(x)) a.push(x); this._set(a); }
  remove(...c) { this._set(this._get().filter(x => !c.includes(x))); }
  contains(c) { return this._get().includes(c); }
  toggle(c, f) { const has = this.contains(c); const on = f === undefined ? !has : !!f; on ? this.add(c) : this.remove(c); return on; }
}

export class Node_ {
  constructor() { this.childNodes = []; this.parentNode = null; this._uid = ++uid; }
  get children() { return this.childNodes.filter(n => n instanceof Element_); }
  get firstChild() { return this.childNodes[0] || null; }
  get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
  get firstElementChild() { return this.children[0] || null; }
  get lastElementChild() { const c = this.children; return c[c.length - 1] || null; }
  get nextElementSibling() { const p = this.parentNode; if (!p) return null; const c = p.children; return c[c.indexOf(this) + 1] || null; }
  get previousElementSibling() { const p = this.parentNode; if (!p) return null; const c = p.children; return c[c.indexOf(this) - 1] || null; }
  before(...ns) { for (const n of ns) this.parentNode.insertBefore(typeof n === 'string' ? new Text_(n) : n, this); }
  after(...ns) { const p = this.parentNode, nx = p.childNodes[p.childNodes.indexOf(this) + 1]; for (const n of ns) p.insertBefore(typeof n === 'string' ? new Text_(n) : n, nx); }
  appendChild(n) {
    if (n instanceof Fragment_) { for (const c of [...n.childNodes]) this.appendChild(c); return n; }
    if (n.parentNode) n.parentNode.removeChild(n);
    n.parentNode = this; this.childNodes.push(n); return n;
  }
  append(...ns) { for (const n of ns) this.appendChild(typeof n === 'string' ? new Text_(n) : n); }
  prepend(...ns) { for (const n of ns.reverse()) this.insertBefore(typeof n === 'string' ? new Text_(n) : n, this.firstChild); }
  insertBefore(n, ref) {
    if (!ref) return this.appendChild(n);
    if (n.parentNode) n.parentNode.removeChild(n);
    const i = this.childNodes.indexOf(ref); n.parentNode = this; this.childNodes.splice(i, 0, n); return n;
  }
  removeChild(n) { const i = this.childNodes.indexOf(n); if (i >= 0) this.childNodes.splice(i, 1); n.parentNode = null; return n; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  replaceWith(n) { const p = this.parentNode; if (!p) return; p.insertBefore(n, this); p.removeChild(this); }
  replaceChildren(...ns) { for (const c of [...this.childNodes]) this.removeChild(c); this.append(...ns); }
  contains(n) { for (let x = n; x; x = x.parentNode) if (x === this) return true; return false; }
  get textContent() { return this.childNodes.map(c => c.textContent).join(''); }
  set textContent(t) { for (const c of [...this.childNodes]) this.removeChild(c); if (t !== '' && t != null) this.appendChild(new Text_(String(t))); }
  get isConnected() { let x = this; while (x.parentNode) x = x.parentNode; return x === globalThis.document || (x.host && x.host.isConnected); }
  addEventListener(t, f) { (this._ls ||= {})[t] = [...(this._ls?.[t] || []), f]; }
  removeEventListener(t, f) { if (this._ls?.[t]) this._ls[t] = this._ls[t].filter(x => x !== f); }
  dispatchEvent(e) {
    e.target ||= this;
    for (let x = this; x; x = x.parentNode || (e.composed && x.host)) {
      for (const f of x._ls?.[e.type] || []) f.call(x, e);
      if (!e.bubbles) break;
    }
    globalThis.__events?.push(e); return true;
  }
  getElementById(id) { return this.querySelector('#' + id); }
  querySelectorAll(sel) {
    const parts = sel.split(',').map(s => s.trim()), out = [];
    const walk = n => { for (const c of n.children) { if (parts.some(p => c.matches(p))) out.push(c); walk(c); } };
    walk(this); return out;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}
class Text_ extends Node_ {
  constructor(t) { super(); this.data = t; }
  get textContent() { return this.data; }
  set textContent(t) { this.data = t; }
  cloneNode() { return new Text_(this.data); }
}
class Fragment_ extends Node_ {
  set innerHTML(h) { for (const c of [...this.childNodes]) this.removeChild(c); parseInto(this, h); }   // a shadow root has it
  cloneNode(deep) { const f = new Fragment_(); if (deep) for (const c of this.childNodes) f.appendChild(c.cloneNode(true)); return f; } }

export class Element_ extends Node_ {
  constructor(tag) {
    super(); this.localName = this.tagName = (tag || 'div').toLowerCase(); this.attrs = {};
    this.classList = new ClassList(this);
    const st = {}; st.setProperty = (k, v) => { st[k] = v; }; st.removeProperty = k => { delete st[k]; };
    this.style = st;
    // dataset reflects the data-* attributes, as in a browser
    const camel = k => 'data-' + k.replace(/[A-Z]/g, c => '-' + c.toLowerCase());
    this.dataset = new Proxy({}, { get: (t, k) => typeof k === 'string' ? this.attrs[camel(k)] : undefined,
      set: (t, k, v) => { this.attrs[camel(k)] = String(v); return true; } });
    this.offsetWidth = 0; this.offsetHeight = 0; this.clientWidth = 0; this.clientHeight = 0;
    this.scrollTop = 0; this.scrollHeight = 0;
  }
  get id() { return this.attrs.id || ''; } set id(v) { this.attrs.id = v; }
  get className() { return this.attrs.class || ''; } set className(v) { this.attrs.class = v; }
  get hidden() { return 'hidden' in this.attrs; } set hidden(v) { v ? this.attrs.hidden = '' : delete this.attrs.hidden; }
  get title() { return this.attrs.title || ''; } set title(v) { this.attrs.title = v; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  hasAttribute(k) { return k in this.attrs; }
  removeAttribute(k) { delete this.attrs[k]; }
  toggleAttribute(k, f) { const on = f === undefined ? !(k in this.attrs) : !!f; on ? this.attrs[k] = '' : delete this.attrs[k]; return on; }
  // selectors: compounds of tag, #id, .class, [attr], [attr=val], :not(…), joined by spaces (descendant)
  matches(sel) {
    const parts = sel.trim().split(/\s+/);
    if (!matchCompound(this, parts[parts.length - 1])) return false;
    let k = parts.length - 2;
    for (let x = this.parentNode; k >= 0 && x instanceof Element_; x = x.parentNode) if (matchCompound(x, parts[k])) k--;
    return k < 0;
  }
  closest(sel) { for (let x = this; x instanceof Element_; x = x.parentNode) if (x.matches(sel)) return x; return null; }
  set innerHTML(h) { for (const c of [...this.childNodes]) this.removeChild(c); parseInto(this, h); }
  get innerHTML() { return this.childNodes.map(c => c.outerHTML ?? c.data).join(''); }
  get outerHTML() { return `<${this.localName}${Object.entries(this.attrs).map(([k, v]) => ` ${k}="${v}"`).join('')}>${this.innerHTML}</${this.localName}>`; }
  insertAdjacentHTML(pos, h) { const t = new Element_('div'); t.innerHTML = h; for (const c of [...t.childNodes]) pos === 'afterbegin' ? this.insertBefore(c, this.firstChild) : this.appendChild(c); }
  cloneNode(deep) {
    const e = document.createElement(this.localName); e.attrs = { ...this.attrs };
    if (deep) for (const c of this.childNodes) e.appendChild(c.cloneNode(true)); return e;
  }
  getBoundingClientRect() { return { left: 0, top: 0, width: this.clientWidth, height: this.clientHeight, right: this.clientWidth, bottom: this.clientHeight }; }
  attachShadow() { const r = new Fragment_(); r.host = this; r.mode = 'open'; this.shadowRoot = r; return r; }
  focus() {} blur() {} click() { this.onclick && this.onclick({ target: this, stopPropagation() {}, preventDefault() {} }); }
  setPointerCapture() {} releasePointerCapture() {} scrollTo() {} scrollIntoView() {}
  animate() { return { finished: Promise.resolve(), cancel() {}, onfinish: null }; }
  getContext() { return new Proxy({}, { get: (t, k) => k in t ? t[k] : (() => ({ width: 10 })), set: (t, k, v) => { t[k] = v; return true; } }); }
  get value() { return this.attrs.value ?? ''; } set value(v) { this.attrs.value = v; }
  get content() { return this._content ||= new Fragment_(); }
}

function matchCompound(el, c) {
  const re = /^([a-z0-9-]*|\*)?((?:#[\w-]+|\.[\w-]+|\[[^\]]+\]|:not\([^)]*\))*)$/i;
  const m = c.match(re); if (!m) return false;
  if (m[1] && m[1] !== '*' && m[1].toLowerCase() !== el.localName) return false;
  for (const [t] of (m[2] || '').matchAll(/#[\w-]+|\.[\w-]+|\[[^\]]+\]|:not\([^)]*\)/g)) {
    if (t[0] === '#' && el.id !== t.slice(1)) return false;
    if (t[0] === '.' && !el.classList.contains(t.slice(1))) return false;
    if (t[0] === '[') {
      const [, k, v] = t.slice(1, -1).match(/^([\w-]+)(?:=["']?(.*?)["']?)?$/) || [];
      if (!k || !(k in el.attrs) || (v !== undefined && el.attrs[k] !== v)) return false;
    }
    if (t[0] === ':' && matchCompound(el, t.slice(5, -1))) return false;
  }
  return true;
}

function parseInto(parent, html) {
  const re = /<!--[\s\S]*?-->|<\/([a-z0-9-]+)\s*>|<([a-z0-9-]+)((?:\s+[^\s=>\/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)/gi;
  const stack = [parent.localName === 'template' ? parent.content : parent];
  let m;
  while ((m = re.exec(html))) {
    const top = stack[stack.length - 1];
    if (m[1]) { while (stack.length > 1 && stack.pop().localName !== m[1].toLowerCase()); }
    else if (m[2]) {
      const el = document.createElement(m[2]);
      for (const [, k, , v1, v2, v3] of (m[3] || '').matchAll(/([^\s=]+)(\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))
        el.attrs[k] = v1 ?? v2 ?? v3 ?? '';
      top.appendChild(el);
      if (!m[4] && !VOID.has(el.localName)) stack.push(el);
    } else if (m[5] && !m[0].startsWith('<!--')) {
      top.appendChild(new Text_(m[5].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"')));
    }
  }
}

export function install() {
  const reg = new Map();
  class HTMLElement_ extends Element_ { constructor() { super(reg.get(new.target) || 'x-el'); } }
  const doc = new Element_('#document');
  doc.createElement = t => { const C = [...reg].find(([, n]) => n === t?.toLowerCase())?.[0]; const e = C ? new C() : new Element_(t); if (C) e.localName = t; return e; };
  doc.createTextNode = t => new Text_(t);
  doc.createDocumentFragment = () => new Fragment_();
  doc.hidden = false; doc.visibilityState = 'visible';
  doc.body = new Element_('body'); doc.appendChild(doc.body);
  doc.head = new Element_('head');
  Object.assign(globalThis, {
    document: doc, window: globalThis, HTMLElement: HTMLElement_, Node: Node_, Element: Element_,
    customElements: {
      define(n, C) { reg.set(C, n); this._d[n] = C; (this._w[n] || []).forEach(f => f(C)); },
      get(n) { return this._d[n]; }, _d: {}, _w: {},
      whenDefined(n) { return this._d[n] ? Promise.resolve(this._d[n]) : new Promise(r => (this._w[n] ||= []).push(r)); },
    },
    ResizeObserver: class { observe() {} disconnect() {} unobserve() {} },
    IntersectionObserver: class { observe() {} disconnect() {} },
    MutationObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    Event: class { constructor(t, o = {}) { this.type = t; Object.assign(this, o); } stopPropagation() {} preventDefault() {} },
    CustomEvent: class { constructor(t, o = {}) { this.type = t; Object.assign(this, o); } stopPropagation() {} preventDefault() {} },
    localStorage: { _s: {}, getItem(k) { return this._s[k] ?? null; }, setItem(k, v) { this._s[k] = String(v); }, removeItem(k) { delete this._s[k]; } },
    sessionStorage: { _s: {}, getItem(k) { return this._s[k] ?? null; }, setItem(k, v) { this._s[k] = String(v); }, removeItem(k) { delete this._s[k]; } },
    devicePixelRatio: 1, innerWidth: 1280, innerHeight: 800,
    location: { origin: 'http://ha.test', href: 'http://ha.test/' }, history: { pushState() {}, replaceState() {} },
  });
  if (!globalThis.navigator) globalThis.navigator = { userAgent: 'node' };
  return doc;
}
