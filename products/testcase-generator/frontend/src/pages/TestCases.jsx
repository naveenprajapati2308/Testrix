import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, themeQuartz } from 'ag-grid-community';
import {
  Save, Plus, Trash2, Check, X, Download, Upload, WrapText, Undo2, Redo2, AlertTriangle,
} from 'lucide-react';
import { api, downloadFile } from '../api/client.js';
import { useDirtyGuard } from '../lib/useDirtyGuard.js';
import ImportDialog from '../components/ImportDialog.jsx';
import { reportDirtyToParent, onParentSaveRequest } from '../../../../../shared/ui/iframe-dirty-state.js';

ModuleRegistry.registerModules([AllCommunityModule]);

const TEST_TYPES = [
  'FUNCTIONAL', 'NEGATIVE', 'BOUNDARY', 'VALIDATION', 'BUSINESS_RULE', 'WORKFLOW',
  'INTEGRATION', 'SECURITY', 'NOTIFICATION', 'ERROR_HANDLING', 'USABILITY', 'COMPATIBILITY',
];
const PRIORITIES = ['', 'HIGH', 'MEDIUM', 'LOW'];
const REVIEW_STATUSES = ['AI_GENERATED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'];
const STEP_SEPARATOR = ' => ';

const linesToText = (values) => (values || []).join('\n');
const textToLines = (text) => (text || '').split('\n').map((s) => s.trim()).filter(Boolean);
const stepsToText = (steps) =>
  (steps || []).map((s) => `${s.action}${STEP_SEPARATOR}${s.expectedResult || ''}`).join('\n');
const textToSteps = (text) =>
  textToLines(text).map((line, index) => {
    const at = line.indexOf(STEP_SEPARATOR);
    return {
      stepNumber: index + 1,
      action: at < 0 ? line : line.slice(0, at).trim(),
      expectedResult: at < 0 ? '' : line.slice(at + STEP_SEPARATOR.length).trim(),
    };
  });

export default function TestCases() {
  const [searchParams] = useSearchParams();
  // The shell's route carries no query string, so a document opened from the Documents page
  // arrives via sessionStorage instead.
  const [documentId, setDocumentId] = useState(() => {
    const fromQuery = searchParams.get('documentId');
    if (fromQuery) return fromQuery;
    try {
      return sessionStorage.getItem('testgen:documentId') || '';
    } catch {
      return '';
    }
  });

  const gridRef = useRef(null);
  const [documents, setDocuments] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [saving, setSaving] = useState(false);
  const [wrapText, setWrapText] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [selectedCount, setSelectedCount] = useState(0);

  const [dirtyRows, setDirtyRows] = useState(() => new Set());
  const dirtyCells = useRef(new Set());
  const isDirty = dirtyRows.size > 0;
  const { projectChanged } = useDirtyGuard(isDirty);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = documentId ? `?documentId=${documentId}` : '';
      setRows(await api.get(`/test-cases${query}`));
      setDirtyRows(new Set());
      dirtyCells.current = new Set();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api.get('/documents').then(setDocuments).catch(() => setDocuments([]));
  }, []);

  const selectDocument = (value) => {
    setDocumentId(value);
    try {
      if (value) sessionStorage.setItem('testgen:documentId', value);
      else sessionStorage.removeItem('testgen:documentId');
    } catch {
      // Storage unavailable — the filter still applies for this view.
    }
  };

  const flash = (message) => {
    setNotice(message);
    setTimeout(() => setNotice(null), 2500);
  };

  const markDirty = (id, field) => {
    dirtyCells.current.add(`${id}:${field}`);
    setDirtyRows((prev) => new Set(prev).add(id));
  };

  const columnDefs = useMemo(() => {
    const text = { cellEditor: 'agLargeTextCellEditor', cellEditorPopup: true,
      cellEditorParams: { maxLength: 20000, rows: 10, cols: 60 } };

    return [
      {
        headerName: '', field: 'rowDrag', width: 42, rowDrag: true, editable: false,
        sortable: false, filter: false, resizable: false, pinned: 'left',
        headerCheckboxSelection: false, valueGetter: () => '',
      },
      { field: 'testCaseCode', headerName: 'Code', width: 130, editable: false, pinned: 'left',
        checkboxSelection: true, headerCheckboxSelection: true },
      // Plain inline editor, not the popup one used for the long fields: a title is a single
      // line, and Enter should commit it rather than insert a newline.
      { field: 'title', headerName: 'Title', minWidth: 260, flex: 2, cellEditor: 'agTextCellEditor' },
      { field: 'testType', headerName: 'Type', width: 150,
        cellEditor: 'agSelectCellEditor', cellEditorParams: { values: TEST_TYPES } },
      { field: 'priority', headerName: 'Priority', width: 110,
        cellEditor: 'agSelectCellEditor', cellEditorParams: { values: PRIORITIES },
        valueSetter: (params) => {
          params.data.priority = params.newValue || null;
          return true;
        } },
      { field: 'reviewStatus', headerName: 'Review', width: 145,
        cellEditor: 'agSelectCellEditor', cellEditorParams: { values: REVIEW_STATUSES } },
      { field: 'description', headerName: 'Description', minWidth: 240, flex: 2, ...text },
      {
        colId: 'preconditions', headerName: 'Preconditions', minWidth: 200, flex: 1, ...text,
        valueGetter: (p) => linesToText(p.data.preconditions),
        valueSetter: (p) => { p.data.preconditions = textToLines(p.newValue); return true; },
      },
      {
        colId: 'testData', headerName: 'Test Data', minWidth: 180, flex: 1, ...text,
        valueGetter: (p) => linesToText(p.data.testData),
        valueSetter: (p) => { p.data.testData = textToLines(p.newValue); return true; },
      },
      {
        colId: 'steps', headerName: 'Steps', minWidth: 280, flex: 2, ...text,
        valueGetter: (p) => stepsToText(p.data.steps),
        valueSetter: (p) => { p.data.steps = textToSteps(p.newValue); return true; },
        headerTooltip: 'One step per line, written as: action => expected result',
      },
      { field: 'expectedResult', headerName: 'Expected Result', minWidth: 220, flex: 1, ...text },
      { field: 'sourceSection', headerName: 'Source Section', minWidth: 160, editable: false },
    ];
  }, []);

  const defaultColDef = useMemo(() => ({
    editable: true,
    sortable: true,
    filter: true,
    resizable: true,
    wrapText,
    autoHeight: wrapText,
    tooltipValueGetter: (p) => p.value,
    cellClassRules: {
      'tc-cell-dirty': (p) => dirtyCells.current.has(`${p.data?.id}:${p.colDef.field || p.colDef.colId}`),
    },
  }), [wrapText]);

  const onCellValueChanged = (event) => {
    markDirty(event.data.id, event.colDef.field || event.colDef.colId);
    event.api.refreshCells({ rowNodes: [event.node], force: true });
  };

  /** Returns whether the save succeeded — the shell waits on this before switching workspace. */
  const save = async () => {
    if (!isDirty) return true;
    setSaving(true);
    setError(null);
    try {
      const changed = rows.filter((row) => dirtyRows.has(row.id));
      const saved = await api.put('/test-cases/bulk', changed);
      const byId = new Map(saved.map((row) => [row.id, row]));
      setRows((prev) => prev.map((row) => byId.get(row.id) || row));
      setDirtyRows(new Set());
      dirtyCells.current = new Set();
      gridRef.current?.api.refreshCells({ force: true });
      flash(`Saved ${saved.length} test case${saved.length === 1 ? '' : 's'}`);
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    setDirtyRows(new Set());
    dirtyCells.current = new Set();
  };

  // The shell's workspace switcher has to know about these edits before it swaps the session,
  // and needs a way to flush them on the user's behalf.
  useEffect(() => {
    reportDirtyToParent(isDirty);
  }, [isDirty]);

  // Held in a ref so the listener is registered once but always runs the current save closure.
  const saveRef = useRef(save);
  saveRef.current = save;
  const discardRef = useRef(discard);
  discardRef.current = discard;

  useEffect(() => {
    const off = onParentSaveRequest(() => saveRef.current(), () => discardRef.current());
    return () => {
      off();
      reportDirtyToParent(false);
    };
  }, []);

  /** Inserts directly below the focused row so "add one here" lands where the user is looking. */
  const insertRow = async () => {
    const selected = gridRef.current?.api.getSelectedRows() || [];
    const after = selected.length === 1 ? selected[0] : rows[rows.length - 1];
    try {
      const created = await api.post(
        `/test-cases${after ? `?insertAfterId=${after.id}` : ''}`,
        {
          srsDocumentId: documentId ? Number(documentId) : after?.srsDocumentId ?? null,
          title: 'New test case',
          testType: 'FUNCTIONAL',
          preconditions: [],
          testData: [],
          steps: [],
        },
      );
      await load();
      flash(`Added ${created.testCaseCode}`);
    } catch (e) {
      setError(e.message);
    }
  };

  const deleteSelected = async () => {
    const selected = gridRef.current?.api.getSelectedRows() || [];
    if (selected.length === 0) return;
    if (!window.confirm(`Delete ${selected.length} test case${selected.length === 1 ? '' : 's'}?`)) return;
    try {
      await Promise.all(selected.map((row) => api.delete(`/test-cases/${row.id}`)));
      await load();
      flash(`Deleted ${selected.length}`);
    } catch (e) {
      setError(e.message);
    }
  };

  const setStatus = async (reviewStatus) => {
    const selected = gridRef.current?.api.getSelectedRows() || [];
    if (selected.length === 0) return;
    try {
      await api.put('/test-cases/review-status', { ids: selected.map((r) => r.id), reviewStatus });
      await load();
      flash(`${selected.length} marked ${reviewStatus.toLowerCase()}`);
    } catch (e) {
      setError(e.message);
    }
  };

  /** The visual order after a drag is the grid's, not the state array's — read it back from the
   *  grid and let the server assign the positions. */
  const onRowDragEnd = async () => {
    const orderedIds = [];
    gridRef.current?.api.forEachNodeAfterFilterAndSort((node) => orderedIds.push(node.data.id));
    try {
      await api.put('/test-cases/reorder', { orderedIds });
      flash('Order saved');
    } catch (e) {
      setError(e.message);
      await load();
    }
  };

  const exportAs = (format) => {
    const query = documentId ? `&documentId=${documentId}` : '';
    if (format === 'json') {
      const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'test-cases.json';
      link.click();
      URL.revokeObjectURL(url);
      return;
    }
    downloadFile(`/test-cases/export?format=${format}${query}`, `test-cases.${format}`)
      .catch((e) => setError(e.message));
  };

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Test Cases</h1>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <select
              value={documentId}
              onChange={(e) => selectDocument(e.target.value)}
              className="bg-[var(--bg-surface-2)] border border-[var(--border)] rounded-[var(--radius-sm)] px-2.5 py-1.5 text-sm text-[var(--text-primary)]"
            >
              <option value="">All documents</option>
              {documents.map((doc) => (
                <option key={doc.id} value={doc.id}>{doc.fileName}</option>
              ))}
            </select>
            <span className="text-sm text-[var(--text-muted)]">
              {rows.length} test case{rows.length === 1 ? '' : 's'}
              {isDirty && (
                <span className="ml-2 text-[var(--warning-text)] font-semibold">
                  • {dirtyRows.size} unsaved
                </span>
              )}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <ToolbarButton onClick={() => gridRef.current?.api.undoCellEditing()} icon={Undo2} label="Undo" />
          <ToolbarButton onClick={() => gridRef.current?.api.redoCellEditing()} icon={Redo2} label="Redo" />
          <ToolbarButton onClick={() => setWrapText((w) => !w)} icon={WrapText}
            label={wrapText ? 'Single line' : 'Wrap text'} active={wrapText} />
          <ToolbarButton onClick={insertRow} icon={Plus} label="Insert row" />
          <ToolbarButton onClick={deleteSelected} icon={Trash2} label="Delete" danger
            disabled={selectedCount === 0} />
          <ToolbarButton onClick={() => setStatus('APPROVED')} icon={Check} label="Approve"
            disabled={selectedCount === 0} />
          <ToolbarButton onClick={() => setStatus('REJECTED')} icon={X} label="Reject"
            disabled={selectedCount === 0} />
          <ToolbarButton onClick={() => setImportOpen(true)} icon={Upload} label="Import" />

          <div className="flex items-center rounded-[var(--radius-sm)] border border-[var(--border)] overflow-hidden">
            <span className="px-2 text-[var(--text-muted)]"><Download size={14} /></span>
            {['xlsx', 'csv', 'json'].map((format) => (
              <button
                key={format}
                onClick={() => exportAs(format)}
                className="px-2.5 py-2 text-xs font-semibold uppercase text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] border-l border-[var(--border)]"
              >
                {format}
              </button>
            ))}
          </div>

          <button
            onClick={save}
            disabled={!isDirty || saving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-[var(--radius-sm)] bg-[var(--accent)] text-white text-sm font-semibold hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={15} />
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </header>

      {projectChanged && (
        <Banner tone="danger">
          The workspace changed while you had unsaved edits. Those edits belong to the previous
          workspace — reload before continuing so nothing is written to the wrong project.
        </Banner>
      )}
      {error && <Banner tone="danger">{error}</Banner>}
      {notice && <Banner tone="success">{notice}</Banner>}

      <div
        className="ag-theme-testrix rounded-[var(--radius-lg)] border border-[var(--border)] overflow-hidden"
        style={{ height: 'calc(100vh - 230px)', minHeight: 420 }}
      >
        <AgGridReact
          ref={gridRef}
          theme={themeQuartz}
          rowData={rows}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          getRowId={(params) => String(params.data.id)}
          rowSelection="multiple"
          suppressRowClickSelection
          rowDragManaged
          animateRows
          undoRedoCellEditing
          undoRedoCellEditingLimit={50}
          stopEditingWhenCellsLoseFocus
          enableCellTextSelection
          tooltipShowDelay={400}
          loading={loading}
          onCellValueChanged={onCellValueChanged}
          onRowDragEnd={onRowDragEnd}
          onSelectionChanged={(e) => setSelectedCount(e.api.getSelectedRows().length)}
          overlayNoRowsTemplate="No test cases yet — generate them from a document first."
        />
      </div>

      {importOpen && (
        <ImportDialog
          documentId={documentId}
          onClose={() => setImportOpen(false)}
          onApplied={async () => { setImportOpen(false); await load(); flash('Import applied'); }}
        />
      )}
    </div>
  );
}

function ToolbarButton({ onClick, icon: Icon, label, disabled, danger, active }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={`inline-flex items-center gap-1.5 px-2.5 py-2 rounded-[var(--radius-sm)] border text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed ${
        active
          ? 'border-[var(--accent-border-soft)] bg-[var(--accent-bg-soft)] text-[var(--accent-text)]'
          : 'border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
      } ${danger ? 'hover:text-[var(--danger-text)]' : ''}`}
    >
      <Icon size={14} />
      <span className="hidden lg:inline">{label}</span>
    </button>
  );
}

function Banner({ tone, children }) {
  const danger = tone === 'danger';
  return (
    <div
      className="flex items-start gap-2 rounded-[var(--radius-sm)] border px-3 py-2 text-sm"
      style={{
        background: `var(${danger ? '--danger-bg-soft' : '--success-bg-soft'})`,
        color: `var(${danger ? '--danger-text' : '--success-text'})`,
        borderColor: `var(${danger ? '--danger-border-soft' : '--success-border-soft'})`,
      }}
    >
      {danger && <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
      <span>{children}</span>
    </div>
  );
}
