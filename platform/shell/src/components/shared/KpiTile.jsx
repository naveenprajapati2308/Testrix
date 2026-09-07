// Compact KPI tile (icon + big value + label) — shared by the dashboard overview
// and the AI Assistant's analytics cards so both render the same stat visual.
export function KpiTile({ icon: Icon, tone, value, label }) {
  return (
    <div className="kpi-tile">
      <div className={`kpi-icon kpi-icon-${tone}`}><Icon size={18} /></div>
      <div className="kpi-tile-info">
        <div className="kpi-value">{value}</div>
        <div className="kpi-label">{label}</div>
      </div>
    </div>
  );
}
