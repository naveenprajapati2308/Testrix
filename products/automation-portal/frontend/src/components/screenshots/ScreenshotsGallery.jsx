import { useState, useEffect, useMemo } from 'react';
import { api } from '../../api.js';
import { DataTable, Modal } from '../shared/index.jsx';
import { Loader } from '../../../../../../shared/ui/Loader.jsx';
import {
  Search,
  X,
  Image as ImageIcon,
  RefreshCw,
  LayoutGrid,
  List,
  Filter,
  Calendar,
  Clock,
  Trash2,
  Camera,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Play,
  Layers,
  Download
} from 'lucide-react';
import { notify } from '../../../../../../shared/ui/NotificationProvider.jsx';
import './screenshots.css';

// Deterministic chip color per module code (matches the bright-theme mock)
const CHIP_VARIANTS = ['violet', 'blue', 'green', 'orange', 'cyan'];
function chipClass(code) {
  if (!code) return 'sg-module-chip sg-chip-gray';
  const sum = [...code].reduce((a, ch) => a + ch.charCodeAt(0), 0);
  return 'sg-module-chip sg-chip-' + CHIP_VARIANTS[sum % CHIP_VARIANTS.length];
}

function fmtTime(raw) {
  if (!raw) return '—';
  const d = new Date(raw);
  if (isNaN(d)) return '—';
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export function ScreenshotsGallery({ onSelectExecution }) {
  const [screenshots, setScreenshots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchExecutionCode, setSearchExecutionCode] = useState('');
  const [keyword, setKeyword] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [mediaTypeFilter, setMediaTypeFilter] = useState('ALL');
  const [sortOrder, setSortOrder] = useState('latest');
  const [activeImage, setActiveImage] = useState(null);
  const [activeVideo, setActiveVideo] = useState(null);
  const [viewMode, setViewMode] = useState('gallery');

  // Delete flow
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Gallery pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const fetchScreenshots = async () => {
    setLoading(true);
    try {
      const list = await api.screenshotsList();
      setScreenshots(list);
    } catch (e) {
      notify.error("Error loading screenshots: " + (e.message || 'Server error'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScreenshots();
  }, []);

  // Modules present in the loaded data drive the filter options
  const moduleOptions = useMemo(() => {
    const set = new Set(screenshots.map((s) => s.moduleCode).filter(Boolean));
    return [...set].sort();
  }, [screenshots]);

  const filteredScreenshots = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    const code = searchExecutionCode.trim().toLowerCase();
    const list = screenshots.filter(s => {
      if (mediaTypeFilter === 'IMAGE' && s.mediaType === 'VIDEO') return false;
      if (mediaTypeFilter === 'VIDEO' && s.mediaType !== 'VIDEO') return false;
      if (code && !(s.executionCode || '').toLowerCase().includes(code)) return false;
      if (moduleFilter && s.moduleCode !== moduleFilter) return false;
      if (kw) {
        const haystack = `${s.testName || ''} ${s.methodName || ''} ${s.failureReason || ''}`.toLowerCase();
        if (!haystack.includes(kw)) return false;
      }
      return true;
    });
    return [...list].sort((a, b) => {
      const ta = new Date(a.createdAt || 0).getTime();
      const tb = new Date(b.createdAt || 0).getTime();
      return sortOrder === 'latest' ? tb - ta : ta - tb;
    });
  }, [screenshots, searchExecutionCode, keyword, moduleFilter, mediaTypeFilter, sortOrder]);

  // Reset to first page whenever filters change the result set
  useEffect(() => { setPage(1); }, [searchExecutionCode, keyword, moduleFilter, mediaTypeFilter, sortOrder, pageSize]);

  const totalRecords = filteredScreenshots.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedScreenshots = filteredScreenshots.slice((safePage - 1) * pageSize, safePage * pageSize);
  const startRecord = totalRecords === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endRecord = Math.min(safePage * pageSize, totalRecords);
  const pageNumbers = useMemo(() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages = [1];
    if (safePage > 3) pages.push('…');
    for (let p = Math.max(2, safePage - 1); p <= Math.min(totalPages - 1, safePage + 1); p++) pages.push(p);
    if (safePage < totalPages - 2) pages.push('…');
    pages.push(totalPages);
    return pages;
  }, [totalPages, safePage]);

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    const idToDelete = confirmDelete.id || confirmDelete.testCaseId;
    try {
      await api.deleteScreenshot(idToDelete);
      setScreenshots((prev) => prev.filter((s) => (s.id || s.testCaseId) !== idToDelete));
      if ((activeImage?.id || activeImage?.testCaseId) === idToDelete) setActiveImage(null);
      if ((activeVideo?.id || activeVideo?.testCaseId) === idToDelete) setActiveVideo(null);
      setConfirmDelete(null);
      notify.success("Media deleted successfully.");
    } catch (e) {
      notify.error("Failed to delete media: " + (e.message || 'Server error'));
    } finally {
      setDeleting(false);
    }
  };

  const columns = useMemo(() => [
    {
      key: 'screenshotPath',
      label: 'Media',
      render: (val, shot) => shot.mediaType === 'VIDEO' ? (
        <div
          className="sg-table-video-thumb"
          onClick={() => setActiveVideo(shot)}
          title="Play video recording"
        >
          <Play size={16} fill="currentColor" />
        </div>
      ) : (
        <img
          src={`/uploads/${val}`}
          alt={shot.methodName}
          style={{ width: '60px', height: '40px', objectFit: 'cover', borderRadius: '4px', cursor: 'pointer' }}
          onClick={() => setActiveImage(shot)}
        />
      )
    },
    {
      key: 'executionCode',
      label: 'Execution',
      render: (val, shot) => (
        <button onClick={() => onSelectExecution(shot.executionId)} className="sg-code-link" style={{ fontSize: '13px' }}>
          {val}
        </button>
      )
    },
    {
      key: 'moduleCode',
      label: 'Module',
      render: (val) => <span className={chipClass(val)}>{val}</span>
    },
    {
      key: 'testName',
      label: 'Test Name'
    },
    {
      key: 'methodName',
      label: 'Method'
    },
    {
      key: 'failureReason',
      label: 'Failure Reason',
      render: (val) => (
        <div style={{ maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={val}>
          {val}
        </div>
      )
    }
  ], [onSelectExecution]);

  return (
    <section className="sg-page">

      {/* Filters */}
      <div className="sg-card">
        <h3 className="sg-card-title sg-title-violet"><Filter size={17} /> Filter Media</h3>
        <div className="sg-media-tabs">
          <button
            className={`sg-media-tab${mediaTypeFilter === 'ALL' ? ' active' : ''}`}
            onClick={() => setMediaTypeFilter('ALL')}
          >
            <Layers size={14} /> All Media ({screenshots.length})
          </button>
          <button
            className={`sg-media-tab${mediaTypeFilter === 'IMAGE' ? ' active' : ''}`}
            onClick={() => setMediaTypeFilter('IMAGE')}
          >
            <ImageIcon size={14} /> Screenshots ({screenshots.filter(s => s.mediaType !== 'VIDEO').length})
          </button>
          <button
            className={`sg-media-tab${mediaTypeFilter === 'VIDEO' ? ' active' : ''}`}
            onClick={() => setMediaTypeFilter('VIDEO')}
          >
            <Play size={14} /> Videos ({screenshots.filter(s => s.mediaType === 'VIDEO').length})
          </button>
        </div>

        <div className="sg-filter-row">
          <div className="sg-search-wrap">
            <Search size={15} />
            <input
              type="text"
              className="sg-input"
              placeholder="Search by execution code (e.g. AUTO-2026-05-21-001)"
              value={searchExecutionCode}
              onChange={(e) => setSearchExecutionCode(e.target.value)}
            />
          </div>

          <input
            type="text"
            className="sg-input sg-keyword"
            placeholder="Keyword (test, method, failure reason...)"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />

          <select
            className="sg-select sg-module"
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
          >
            <option value="">All Modules</option>
            {moduleOptions.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>

          <div className="sg-view-toggle">
            <button
              className={`sg-view-btn${viewMode === 'gallery' ? ' active' : ''}`}
              onClick={() => setViewMode('gallery')}
              title="Gallery View"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              className={`sg-view-btn${viewMode === 'table' ? ' active' : ''}`}
              onClick={() => setViewMode('table')}
              title="Table View"
            >
              <List size={16} />
            </button>
          </div>

          <button className="sg-refresh-btn" onClick={fetchScreenshots}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* Grid / Table content */}
      <div className="sg-card">
        <div className="sg-gallery-head">
          <h3 className="sg-card-title sg-title-pink" style={{ margin: 0 }}>
            <ImageIcon size={17} /> {viewMode === 'gallery' ? 'Media & Failure Gallery' : 'Media List'}
          </h3>
          {viewMode === 'gallery' && (
            <label className="sg-sort">
              Sort By:
              <select className="sg-select" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
                <option value="latest">Latest First</option>
                <option value="oldest">Oldest First</option>
              </select>
            </label>
          )}
        </div>

        {loading ? (
          <div style={{ display: 'grid', placeItems: 'center', padding: '48px 0' }}>
            <Loader size={44} label="Loading media..." />
          </div>
        ) : filteredScreenshots.length === 0 ? (
          <div className="sg-empty">
            <Camera size={44} />
            <strong>No media found</strong>
            <span>Failure screenshots and execution videos from your test runs will appear here.</span>
          </div>
        ) : viewMode === 'gallery' ? (
          <>
            <div className="sg-grid">
              {pagedScreenshots.map((shot) => {
                const itemKey = shot.id || shot.testCaseId || shot.screenshotPath;
                const isVideo = shot.mediaType === 'VIDEO';
                return (
                  <div key={itemKey} className="sg-shot-card">
                    <div className="sg-thumb">
                      {isVideo ? (
                        <div className="sg-video-thumb-card" onClick={() => setActiveVideo(shot)}>
                          <div className="sg-play-badge">
                            <Play size={22} fill="currentColor" />
                          </div>
                          <span className="sg-video-indicator">VIDEO RECORDING</span>
                        </div>
                      ) : (
                        <img
                          src={`/uploads/${shot.screenshotPath}`}
                          alt={shot.methodName}
                          onClick={() => setActiveImage(shot)}
                        />
                      )}
                      <button
                        className="sg-delete-btn"
                        title="Delete media"
                        onClick={() => setConfirmDelete(shot)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    <div className="sg-shot-body">
                      <strong className="sg-shot-title" title={shot.methodName}>{shot.methodName}</strong>
                      <div className="sg-shot-meta">
                        <span className="sg-meta-item">
                          <Calendar size={13} />
                          <button className="sg-code-link" onClick={() => onSelectExecution(shot.executionId)}>
                            {shot.executionCode}
                          </button>
                        </span>
                        <span className="sg-meta-item">
                          <Clock size={13} /> {fmtTime(shot.createdAt)}
                        </span>
                      </div>
                      <span className={chipClass(shot.moduleCode)}>{shot.moduleCode || 'All Modules'}</span>
                      {shot.failureReason && (
                        <p className="sg-fail-reason" title={shot.failureReason}>{shot.failureReason}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination footer — hidden entirely when there aren't enough records to paginate */}
            {totalRecords > 5 && (
              <div className="sg-footer">
                <span>Showing {startRecord} to {endRecord} of {totalRecords} media items</span>
                <div className="sg-pager">
                  <span>Show:</span>
                  <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                  <button className="sg-page-btn" disabled={safePage === 1} onClick={() => setPage(1)}>
                    <ChevronsLeft size={15} />
                  </button>
                  <button className="sg-page-btn" disabled={safePage === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                    <ChevronLeft size={15} />
                  </button>
                  {pageNumbers.map((p, i) => p === '…' ? (
                    <span key={`gap-${i}`} className="sg-page-gap">…</span>
                  ) : (
                    <button key={p} className={`sg-page-number${p === safePage ? ' active' : ''}`}
                      onClick={() => setPage(p)} aria-current={p === safePage ? 'page' : undefined}>
                      {p}
                    </button>
                  ))}
                  <button className="sg-page-btn" disabled={safePage === totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                    <ChevronRight size={15} />
                  </button>
                  <button className="sg-page-btn" disabled={safePage === totalPages} onClick={() => setPage(totalPages)}>
                    <ChevronsRight size={15} />
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <DataTable
            columns={columns}
            data={filteredScreenshots}
            searchPlaceholder="Filter media..."
            exportFilename="failure_media.csv"
          />
        )}
      </div>

      {/* Delete confirmation */}
      {confirmDelete && (
        <Modal title="Delete Media" onClose={() => setConfirmDelete(null)}>
          <div className="sg-confirm-body">
            <AlertTriangle size={38} />
            <p className="sg-confirm-text">
              Are you sure you want to delete this media item?<br />
              <code>{confirmDelete.methodName}</code> — {confirmDelete.executionCode}<br />
              This will permanently remove the file from disk.
            </p>
            <div className="sg-confirm-actions">
              <button className="sg-btn-cancel" onClick={() => setConfirmDelete(null)} disabled={deleting}>
                Cancel
              </button>
              <button className="sg-btn-delete" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Video Player Modal */}
      {activeVideo && (
        <Modal
          title={`Execution Video — ${activeVideo.methodName || activeVideo.executionCode}`}
          onClose={() => setActiveVideo(null)}
          width="820px"
        >
          <div className="sg-video-modal-wrap">
            <video
              src={`/uploads/${activeVideo.screenshotPath}`}
              controls
              autoPlay
              className="sg-video-player-el"
            />
            <div className="sg-video-modal-footer">
              <div>
                <strong style={{ fontSize: '14px', color: 'var(--text-primary)', display: 'block' }}>
                  {activeVideo.testName}
                </strong>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Execution: <button className="sg-code-link" onClick={() => { setActiveVideo(null); onSelectExecution(activeVideo.executionId); }}>{activeVideo.executionCode}</button>
                </span>
              </div>
              <a
                href={`/uploads/${activeVideo.screenshotPath}`}
                download
                className="sg-media-tab active"
                style={{ textDecoration: 'none' }}
              >
                <Download size={14} /> Download Video (.webm)
              </a>
            </div>
          </div>
        </Modal>
      )}

      {/* Lightbox Modal */}
      {activeImage && (
        <div className="sg-lightbox" onClick={() => setActiveImage(null)}>
          <div className="sg-lightbox-card" onClick={(e) => e.stopPropagation()}>
            <img
              src={`/uploads/${activeImage.screenshotPath}`}
              alt={activeImage.methodName}
            />
            <button className="sg-lightbox-close" onClick={() => setActiveImage(null)}>
              <X size={20} />
            </button>
            <div className="sg-lightbox-foot">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                <strong style={{ fontSize: '15px', color: 'var(--text-primary)' }}>{activeImage.methodName}</strong>
                <button
                  className="sg-code-link"
                  style={{ fontSize: '12.5px' }}
                  onClick={() => {
                    setActiveImage(null);
                    onSelectExecution(activeImage.executionId);
                  }}
                >
                  Go to Execution {activeImage.executionCode}
                </button>
              </div>
              {activeImage.failureReason && (
                <p className="sg-fail-reason">{activeImage.failureReason}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
