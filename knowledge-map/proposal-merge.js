(function (root) {
  function merge(existing, proposal, { concepts, relationships }) {
    const graph = existing ? structuredClone(existing) : {
      schemaVersion: '0.4', id: proposal.id, directionId: proposal.directionId,
      title: proposal.title, nodes: [], edges: [],
    };
    const conflicts = [];
    let changed = false;
    for (const node of concepts ? proposal.nodes : []) {
      if (graph.nodes.some((item) => item.id === node.id)) conflicts.push(`concept ${node.id}`);
      else { graph.nodes.push(node); changed = true; }
    }
    for (const edge of relationships ? proposal.edges : []) {
      if (graph.edges.some((item) => item.id === edge.id)) conflicts.push(`relationship ${edge.id}`);
      else if (!graph.nodes.some((item) => item.id === edge.source) ||
        !graph.nodes.some((item) => item.id === edge.target))
        conflicts.push(`relationship ${edge.id} needs both concepts`);
      else { graph.edges.push(edge); changed = true; }
    }
    return { graph, conflicts, changed };
  }
  root.SkillLoopProposalMerge = { merge };
})(typeof window === 'undefined' ? globalThis : window);
