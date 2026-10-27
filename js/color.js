// Picks readable text for a kit colour.

export function inkFor(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.32 ? '#141414' : '#ffffff';
}

export function kitVars(node, team) {
  node.style.setProperty('--kit', team.color);
  node.style.setProperty('--kit-ink', inkFor(team.color));
}
