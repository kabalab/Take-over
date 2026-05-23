export function bindInput(canvas, renderer, handler) {
  function onPointer(e) {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX ?? e.touches?.[0]?.clientX;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY;
    if (clientX == null || clientY == null) return;
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const hit = renderer.hitTest(x, y);
    if (hit) handler(hit);
  }

  canvas.addEventListener('pointerdown', onPointer);
  canvas.style.touchAction = 'none';
}
