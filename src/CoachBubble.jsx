import { useEffect, useState } from 'react';
import CoachPanel from './CoachPanel.jsx';
import { isOnboarded } from './onboarding.js';

export default function CoachBubble({ calcSnapshot, calcRefs, hidden = false }) {
  const [open, setOpen] = useState(false);
  const [verdict, setVerdict] = useState(null);
  const [pulse, setPulse] = useState(() => !isOnboarded());

  useEffect(() => {
    if (open) setPulse(false);
  }, [open]);

  return (
    <>
      <button
        hidden={hidden || open}
        onClick={() => setOpen(true)}
        aria-label="Ask the AI sales coach a question about this deal"
        style={{
          // Sits above the Calculate button rather than on top of it, and
          // carries a word so it isn't a mystery emoji.
          position: 'fixed',
          right: 12,
          bottom: `calc(92px + env(safe-area-inset-bottom, 0px))`,
          minHeight: 56,
          padding: '10px 16px',
          borderRadius: 28,
          background: '#E23744',
          color: 'white',
          border: '2px solid rgba(255,255,255,0.35)',
          boxShadow: '0 8px 20px rgba(226,55,68,0.45)',
          cursor: 'pointer',
          fontSize: 22,
          fontFamily: '"Sora", -apple-system, sans-serif',
          zIndex: 9000,
          display: hidden || open ? 'none' : 'flex',
          alignItems: 'center',
          gap: 8,
          animation: pulse ? 'coach-pulse 1.6s ease-out infinite' : 'none',
        }}
      >
        <span aria-hidden>💬</span>
        <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: 0.2 }}>Ask Coach</span>
        {verdict?.text && !open && (
          <span
            style={{
              position: 'absolute',
              right: '100%',
              marginRight: 8,
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
