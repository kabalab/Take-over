export function bindInput(canvas, renderer, handler) {
  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const hit = renderer.hitTest(x, y);
    if (hit) handler(hit);
  });
}
