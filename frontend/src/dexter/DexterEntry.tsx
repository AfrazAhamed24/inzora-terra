/**
 * D.E.X.T.E.R. — Entry point button
 * Rendered inside the existing INZORA TERRA Command Centre topbar
 * (Command Center route only). Premium, visually distinctive, with a
 * subtle blue-purple intelligence animation. Clicking it transitions
 * into the immersive D.E.X.T.E.R. experience.
 */

export function DexterEntry({ onLaunch }: { onLaunch: () => void }) {
  return (
    <button
      type="button"
      className="dx-entry-btn"
      onClick={onLaunch}
      title="Open D.E.X.T.E.R. — AI disaster response intelligence"
      aria-label="Open D.E.X.T.E.R. — AI disaster response intelligence"
    >
      <span className="dx-entry-orb" aria-hidden="true">
        <span className="dx-entry-orb-core" />
        <span className="dx-entry-orb-ring" />
        <span className="dx-entry-orb-ring dx-entry-orb-ring-2" />
      </span>
      <span className="dx-entry-text">
        <span className="dx-entry-name">D.E.X.T.E.R.</span>
        <span className="dx-entry-sub">AI Intelligence</span>
      </span>
    </button>
  );
}
