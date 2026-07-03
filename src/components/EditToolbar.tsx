import { useEffect } from 'react';
import { useStore } from '../store/useStore';

export function EditToolbar() {
  const activeTool = useStore((s) => s.activeTool);
  const setTool = useStore((s) => s.setTool);
  const editing = useStore((s) => s.editing);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const exitEditMode = useStore((s) => s.exitEditMode);

  const history = editing?.history ?? [];
  const historyIndex = editing?.historyIndex ?? -1;
  const canUndo = historyIndex >= 0;
  const canRedo = historyIndex < history.length - 1;

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't capture when typing in an input.
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === 'Z' || (e.key === 'z' && e.shiftKey))
      ) {
        e.preventDefault();
        redo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        redo();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        exitEditMode();
      }

      // Tool shortcuts (no modifier)
      if (e.ctrlKey || e.metaKey) return;
      switch (e.key.toLowerCase()) {
        case 'b':
          setTool('paint');
          break;
        case 'e':
          setTool('erase');
          break;
        case 'g':
          setTool('fill');
          break;
        case 'i':
          setTool('pick');
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, exitEditMode, setTool]);

  return (
    <div className="edit-toolbar">
      <div className="edit-tools">
        <button
          className={activeTool === 'paint' ? 'active' : ''}
          onClick={() => setTool('paint')}
          title="画笔 (B)"
        >
          🖌 画笔
        </button>
        <button
          className={activeTool === 'erase' ? 'active' : ''}
          onClick={() => setTool('erase')}
          title="橡皮 (E)"
        >
          🧹 橡皮
        </button>
        <button
          className={activeTool === 'fill' ? 'active' : ''}
          onClick={() => setTool('fill')}
          title="填充 (G)"
        >
          🪣 填充
        </button>
        <button
          className={activeTool === 'pick' ? 'active' : ''}
          onClick={() => setTool('pick')}
          title="取色 (I)"
        >
          💉 取色
        </button>
        <span className="tool-sep" />
        <button disabled={!canUndo} onClick={undo} title="撤销 (Ctrl+Z)">
          ↩ 撤销
        </button>
        <button disabled={!canRedo} onClick={redo} title="重做 (Ctrl+Shift+Z)">
          ↪ 重做
        </button>
      </div>
      <div className="edit-actions">
        <button className="btn-soft" onClick={exitEditMode}>
          ✓ 完成
        </button>
      </div>
    </div>
  );
}
