import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { Panel } from '../shared/index.jsx';
import { Loader } from '../../../../../shared/ui/Loader.jsx';


export function RoleManagement({ setNotice }) {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.adminListRoles().then(setRoles).catch((e) => setNotice(e.message)).finally(() => setLoading(false));
  }, []);

  return (
    <section className="page-grid" style={{ gridTemplateColumns: '1fr' }}>
      <Panel title="Role Management">
        <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>
          {roles.length} role{roles.length !== 1 ? 's' : ''} defined platform-wide. Every workspace's Project Admin assigns these to their own team from Team Management — roles are never created or granted from here.
        </p>
        {loading ? (
          <Loader size={28} label="Loading roles…" />
        ) : (
        <div className="role-mgmt-grid">
          {roles.map((role) => (
            <div key={role.code} className="role-mgmt-card">
              <div className="role-mgmt-card-header">
                <strong>{role.name}</strong>
                <span className="role-mgmt-count">{role.activeAssignments} active assignment{role.activeAssignments !== 1 ? 's' : ''}</span>
              </div>
              <p className="role-mgmt-empty" style={{ color: 'var(--text-secondary)' }}>{role.description || '—'}</p>
            </div>
          ))}
        </div>
        )}
      </Panel>
    </section>
  );
}
