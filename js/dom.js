// Small DOM helpers shared by the screens.

export const $ = sel => document.querySelector(sel);

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function svgEl(tag, attrs = {}, parent = null) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.append(node);
  return node;
}

// A button that runs `onClick`; `primary` makes it the one Space/Enter presses.
export function button(text, onClick, className = 'btn', { primary = false } = {}) {
  const b = el('button', className, text);
  b.type = 'button';
  if (primary) b.dataset.primary = '';
  b.addEventListener('click', onClick);
  return b;
}

// A two-line button: a label and a smaller note under it.
export function tallButton(label, note, onClick, className = 'btn') {
  const b = button(null, onClick, className);
  b.append(el('span', null, label));
  if (note) b.append(el('small', null, note));
  return b;
}

// A labelled on/off switch, like the team-cards one on the setup screens.
export function toggleRow(title, note, checked, onChange, className = 'toggle toggle-card') {
  const label = el('label', className);
  const text = el('span');
  text.append(el('b', null, title), el('small', null, note));
  const box = el('input');
  box.type = 'checkbox';
  box.checked = checked;
  box.addEventListener('change', () => onChange(box.checked));
  const knob = el('i');
  knob.setAttribute('aria-hidden', 'true');
  label.append(text, box, knob);
  return label;
}
