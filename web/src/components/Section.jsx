import clsx from "clsx";

export default function Section({ id, kicker, title, children, className }) {
  return (
    <section id={id} className={clsx("site-section", className)}>
      <div className="section-header">
        {kicker ? <p className="section-kicker">{kicker}</p> : null}
        <h2 className="section-title">{title}</h2>
      </div>
      <div className="section-body">{children}</div>
    </section>
  );
}
