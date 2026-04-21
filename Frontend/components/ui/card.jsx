export function Card({ title, subtitle, children, className = "" }) {
  return (
    <section className={`panel ${className}`}>
      {title ? <h3 className="text-lg font-semibold text-cyan-100">{title}</h3> : null}
      {subtitle ? <p className="mt-1 text-sm text-slate-400">{subtitle}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}
