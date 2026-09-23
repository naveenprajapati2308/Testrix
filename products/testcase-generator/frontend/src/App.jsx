import { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Documents from './pages/Documents.jsx';

// The grid is by far the heaviest dependency here, and only this route needs it.
const TestCases = lazy(() => import('./pages/TestCases.jsx'));

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Documents />} />
        <Route
          path="/test-cases"
          element={
            <Suspense fallback={<p className="text-sm text-[var(--text-muted)]">Loading editor…</p>}>
              <TestCases />
            </Suspense>
          }
        />
      </Route>
    </Routes>
  );
}
