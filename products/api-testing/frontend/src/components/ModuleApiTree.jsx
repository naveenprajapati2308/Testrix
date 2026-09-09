import { useEffect, useState } from 'react';
import { ChevronRight, ChevronDown, Folder } from 'lucide-react';
import { Loader } from '../../../../../shared/ui/Loader.jsx';

/**
 * Groups a flat list of Base/Regular APIs by their module (nested, since
 * modules can have sub-modules) into a collapsible tree — used by both the
 * Base APIs and Regular APIs sidebar so a large API list stays navigable
 * instead of one long flat scroll. Modules start collapsed; the module
 * containing the currently selected API auto-expands (and its ancestors,
 * for nested modules) so selection stays visible.
 */
export default function ModuleApiTree({ modules, apis, selectedId, onSelect, renderItem, emptyMessage, loading }) {
  const [expanded, setExpanded] = useState(() => new Set());

  const moduleById = new Map();
  const childModules = new Map(); // parentKey ('root' for top-level) -> [module]
  const indexModules = (nodes, parentKey = 'root') => {
    if (!childModules.has(parentKey)) childModules.set(parentKey, []);
    for (const n of nodes) {
      moduleById.set(n.id, n);
      childModules.get(parentKey).push(n);
      indexModules(n.children ?? [], n.id);
    }
  };
  indexModules(modules);

  const apisByModule = new Map(); // moduleId ('none' for unassigned) -> [api]
  for (const a of apis) {
    const key = a.moduleId ?? 'none';
    if (!apisByModule.has(key)) apisByModule.set(key, []);
    apisByModule.get(key).push(a);
  }

  useEffect(() => {
    if (selectedId == null) return;
    const api = apis.find((a) => a.id === selectedId);
    if (!api?.moduleId) return;
    const toExpand = [];
    let cur = moduleById.get(api.moduleId);
    while (cur) {
      toExpand.push(cur.id);
      cur = cur.parentModuleId ? moduleById.get(cur.parentModuleId) : null;
    }
    if (toExpand.length === 0) return;
    setExpanded((prev) => {
      if (toExpand.every((id) => prev.has(id))) return prev;
      return new Set([...prev, ...toExpand]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const toggle = (id) => setExpanded((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const countInSubtree = (moduleId) => {
    let count = (apisByModule.get(moduleId) ?? []).length;
    for (const child of childModules.get(moduleId) ?? []) count += countInSubtree(child.id);
    return count;
  };

  const ApiRow = ({ api, depth }) => (
    <button onClick={() => onSelect(api)}
      style={{ paddingLeft: 20 + depth * 14 }}
      className={`w-full text-left pr-3 py-2 text-xs border-b border-[var(--border-soft)] hover:bg-[var(--bg-hover)] ${selectedId === api.id ? 'bg-[var(--accent-bg-soft)] text-[var(--accent-text)]' : 'text-[var(--text-secondary)]'}`}>
      {renderItem(api)}
    </button>
  );

  const ModuleRow = ({ node, depth }) => {
    const isExpanded = expanded.has(node.id);
    const total = countInSubtree(node.id);
    return (
      <>
        <button onClick={() => toggle(node.id)}
          style={{ paddingLeft: 8 + depth * 14 }}
          className="w-full flex items-center gap-1.5 py-1.5 pr-2 text-xs border-b border-[var(--border-soft)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]">
          {isExpanded ? <ChevronDown size={12} className="shrink-0" /> : <ChevronRight size={12} className="shrink-0" />}
          <Folder size={12} className="text-[var(--warning-text)] shrink-0" />
          <span className="truncate font-medium text-[var(--text-primary)]">{node.name}</span>
          <span className="ml-auto text-[10px] text-[var(--text-muted)]">{total}</span>
        </button>
        {isExpanded && (
          <>
            {(childModules.get(node.id) ?? []).map((k) => <ModuleRow key={k.id} node={k} depth={depth + 1} />)}
            {(apisByModule.get(node.id) ?? []).map((a) => <ApiRow key={a.id} api={a} depth={depth} />)}
          </>
        )}
      </>
    );
  };

  const rootModules = childModules.get('root') ?? [];
  const unassigned = apisByModule.get('none') ?? [];

  if (loading) {
    return <div className="p-4 flex justify-center"><Loader size={22} /></div>;
  }

  if (rootModules.length === 0 && unassigned.length === 0) {
    return <div className="p-3 text-xs text-[var(--text-muted)]">{emptyMessage}</div>;
  }

  return (
    <>
      {rootModules.map((m) => <ModuleRow key={m.id} node={m} depth={0} />)}
      {unassigned.length > 0 && (
        <>
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-[var(--text-muted)] border-b border-[var(--border-soft)] bg-[var(--bg-surface-2)]">
            No module
          </div>
          {unassigned.map((a) => <ApiRow key={a.id} api={a} depth={0} />)}
        </>
      )}
    </>
  );
}
