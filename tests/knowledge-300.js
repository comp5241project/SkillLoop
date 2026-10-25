const graph = window.KnowledgeNetwork;
const nodes = Array.from({ length: 300 }, (_, index) => ({ id: `concept-${index + 1}`,
  title: `Concept ${index + 1}`, x: 60 + index % 20 * 210, y: 60 + Math.floor(index / 20) * 110 }));
const edges = nodes.slice(1).map((node, index) => ({ source: nodes[index].id, target: node.id, kind: 'teacher' }));
const canvas = new graph.Canvas(document.querySelector('#canvas'), { editable: true,
  onSelect: (id) => { document.querySelector('#status').textContent = `Selected ${id}`; },
  onMove: (node) => { document.querySelector('#status').textContent = `Moved ${node.id} to ${node.x},${node.y}`; } });
canvas.set(nodes, edges);
const list = document.querySelector('#list');
function render() {
  const query = document.querySelector('#search').value.trim().toLowerCase();
  list.replaceChildren();
  for (const node of nodes) {
    if (query && !node.title.toLowerCase().includes(query)) continue;
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'kn-list-button'; button.textContent = node.title;
    button.addEventListener('click', () => canvas.focus(node.id)); list.append(button);
  }
}
document.querySelector('#search').addEventListener('input', render);
render();
canvas.focus(nodes[0].id);
