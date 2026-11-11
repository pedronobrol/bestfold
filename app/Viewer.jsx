'use client';
import { useEffect, useRef } from 'react';

// Mounts the framework-free viewer (viewer/app.js) onto the static markup, once.
export default function Viewer({ markup }) {
  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current) return; // React strict mode runs effects twice in development
    mounted.current = true;
    (async () => {
      const [{ mountBetterfold }, { httpCommunity }, data] = await Promise.all([
        import('../viewer/app.js'),
        import('../viewer/community.js'),
        fetch('/data/betterfold.json').then((r) => r.json()),
      ]);
      mountBetterfold({
        data,
        community: httpCommunity(),
        createWorker: () => new Worker('/island-worker.js'), // built by scripts/build-worker.js
      });
    })();
  }, []);
  return <div dangerouslySetInnerHTML={{ __html: markup }} />;
}
