import type { Cell } from "@gridz/core";

export interface WidgetProps {
  cell: Cell;
}

const asString = (v: unknown): string => (typeof v === "string" ? v : JSON.stringify(v));

export function TextWidget({ cell }: WidgetProps): JSX.Element {
  return <p className="gridz-text" data-testid="widget-text">{asString(cell.value)}</p>;
}

export function UrlWidget({ cell }: WidgetProps): JSX.Element {
  const href = asString(cell.value);
  return (
    <a className="gridz-link" data-testid="widget-url" href={href} rel="noreferrer noopener" target="_blank">
      {href.replace(/^https?:\/\//, "")}
    </a>
  );
}

export function SocialLinkWidget({ cell }: WidgetProps): JSX.Element {
  const service = cell.key.includes(".") ? cell.key.split(".").reverse().join(" ") : cell.key;
  return (
    <div className="gridz-social" data-testid="widget-social">
      <span className="gridz-social__service">{service}</span>
      <span className="gridz-social__handle">{asString(cell.value)}</span>
    </div>
  );
}

export function StatsWidget({ cell }: WidgetProps): JSX.Element {
  const entries =
    Array.isArray(cell.value)
      ? (cell.value as { label: string; value: unknown }[])
      : Object.entries((cell.value ?? {}) as Record<string, unknown>).map(([label, value]) => ({ label, value }));
  return (
    <dl className="gridz-stats" data-testid="widget-stats">
      {entries.map((e, i) => (
        <div key={i} className="gridz-stats__item">
          <dt>{e.label}</dt>
          <dd>{asString(e.value)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function PollWidget({ cell }: WidgetProps): JSX.Element {
  const v = (cell.value ?? {}) as { q?: string; options?: string[] };
  return (
    <div className="gridz-poll" data-testid="widget-poll">
      <p className="gridz-poll__q">{v.q ?? ""}</p>
      <ul>{(v.options ?? []).map((o, i) => <li key={i}>{o}</li>)}</ul>
    </div>
  );
}

export function ClockWidget({ cell }: WidgetProps): JSX.Element {
  const tz = asString(cell.value);
  return <div className="gridz-clock" data-testid="widget-clock" data-tz={tz}>{tz}</div>;
}

export function GenericWidget({ cell }: WidgetProps): JSX.Element {
  return (
    <pre className="gridz-generic" data-testid="widget-generic">
      {typeof cell.value === "string" ? cell.value : JSON.stringify(cell.value, null, 2)}
    </pre>
  );
}

type WidgetComponent = (props: WidgetProps) => JSX.Element;

const BY_WIDGET: Record<string, WidgetComponent> = {
  "gridz.text": TextWidget,
  "gridz.social_link": SocialLinkWidget,
  "gridz.stats": StatsWidget,
  "gridz.poll": PollWidget,
  "gridz.clock": ClockWidget,
};

/** Resolve the renderer for a cell: explicit widget_type, then key heuristics, else Generic. */
export function resolveWidget(cell: Cell): WidgetComponent {
  if (cell.widget_type && BY_WIDGET[cell.widget_type]) return BY_WIDGET[cell.widget_type]!;
  if (cell.key === "url") return UrlWidget;
  if (cell.key === "description" || cell.key === "alias" || cell.key === "agent-context") return TextWidget;
  if (cell.key.includes(".") && !cell.key.startsWith("gridz.")) return SocialLinkWidget;
  if (cell.key === "gridz.poll") return PollWidget;
  return GenericWidget;
}
