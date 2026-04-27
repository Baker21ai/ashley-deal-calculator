import { useEffect, useState } from 'react';
import CoachPanel from './CoachPanel.jsx';
import { isOnboarded } from './onboarding.js';

export default function CoachBubble({ calcSnapshot, calcRefs }) {
  const [open, setOpen] = useState(false);
  const [verdict, setVerdict] = useState(null);
  const [pulse, setPulse] = useState(() => !isOnboarded());

  useEffect(() => {
    if (open) setPulse(false);
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Open AI sales coach"
        style={{
          position: 'fixed',
          right: 16,
          bottom: `calc(16px + env(safe-area-inset-bottom, 0px))`,
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: '#E23744',
          color: 'white',
          border: 'none',
          boxShadow: '0 8px 20px rgba(226,55,68,0.45)',
          cursor: 'pointer',
          fontSize: 26,
          zIndex: 9000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: pulse ? 'coach-pulse 1.6s ease-out infinite' : 'none',
        }}
      >
        <span aria-hidden>💬</span>
        {verdict?.text && !open && (
          <span
            style={{
              position: 'absolute',
              right: 70,
              top: '50%',
              transform: 'translateY(-50%)',
              background: '#1E2230',
              color: '#F5F0EB',
              padding: '6px 10px',
              borderRadius: 10,
              fontSize: 12,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              border: '1px solid rgba(255,255,255,0.1)',
              maxWidth: 220,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {verdict.text}
          </span>
        )}
      </button>

      <style>{`
        @keyframes coach-pulse {
          0%   { box-shadow: 0 8px 20px rgba(226,55,68,0.45), 0 0 0 0 rgba(226,55,68,0.55); }
          70%  { box-shadow: 0 8px 20px rgba(226,55,68,0.45), 0 0 0 18px rgba(226,55,68,0); }
          100% { box-shadow: 0 8px 20px rgba(226,55,68,0.45), 0 0 0 0 rgba(226,55,68,0); }
        }
      `}</style>

      <CoachPanel
        open={open}
        onClose={() => setOpen(false)}
        calcSnapshot={calcSnapshot}
        calcRefs={calcRefs}
        onVerdict={setVerdict}
      />
    </>
  );
}
