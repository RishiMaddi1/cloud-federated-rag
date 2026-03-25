import { useId, useState } from "react";

/**
 * How-to section: expanded by default; bottom control collapses like closing a dropdown.
 */
export default function HowToBlock({ title, children }) {
  const [open, setOpen] = useState(true);
  const panelId = useId();

  return (
    <section className="howto-details" id={panelId} aria-expanded={open}>
      {!open ? (
        <button
          type="button"
          className="howto-collapsed-trigger"
          onClick={() => setOpen(true)}
          aria-expanded="false"
          aria-controls={panelId}
        >
          <span className="howto-collapsed-title">{title}</span>
          <span className="howto-collapsed-chevron" aria-hidden>
            ▼
          </span>
        </button>
      ) : (
        <>
          <div className="howto-head">{title}</div>
          <div className="howto-body">{children}</div>
          <div className="howto-collapse-row">
            <button
              type="button"
              className="howto-collapse-btn"
              onClick={() => setOpen(false)}
              aria-expanded="true"
              aria-controls={panelId}
            >
              <span className="howto-collapse-label">Minimize</span>
              <span className="howto-collapse-icon" aria-hidden>
                ▲
              </span>
            </button>
          </div>
        </>
      )}
    </section>
  );
}
