import { useEffect, useRef, useState } from 'react';
import { TEST_CASE_GEN_NAV } from '../../constants.js';
import { useIframeAutoHeight } from '../../lib/useIframeAutoHeight.js';
import { useIframeScrollLock } from '../../lib/useIframeScrollLock.js';
import { FullScreenLoader } from '../../../../../shared/ui/Loader.jsx';
import appLogo from '../../assets/testrix_logo.png';

const pathFor = (key) => TEST_CASE_GEN_NAV.find((item) => item.key === key)?.path ?? '/';

export function TestGenWorkspace({ activePage }) {
  const iframeRef = useRef(null);
  const height = useIframeAutoHeight(iframeRef);
  useIframeScrollLock(iframeRef);
  const [loaded, setLoaded] = useState(false);

  const [initialSrc] = useState(() => `/testgen${pathFor(activePage)}`);

  useEffect(() => {
    const win = iframeRef.current?.contentWindow;
    win?.postMessage({ type: 'testrix:navigate', path: pathFor(activePage) }, window.location.origin);
  }, [activePage]);

  return (
    <>
      {!loaded && <FullScreenLoader logoSrc={appLogo} subtitle="Loading Test Case Generation" />}
      <iframe
        ref={iframeRef}
        key="testgen-embed"
        src={initialSrc}
        title="Test Case Generation"
        onLoad={() => setLoaded(true)}
        style={{ width: '100%', height, border: 0, display: 'block' }}
      />
    </>
  );
}
