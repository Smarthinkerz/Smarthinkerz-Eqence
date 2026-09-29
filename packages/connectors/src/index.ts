import type { Connector, Source } from './types';

export * from './types';

const registry = new Map<Source, Connector>();

export function registerConnector(connector: Connector) {
  registry.set(connector.source, connector);
}

export function getConnector(source: Source): Connector {
  const c = registry.get(source);
  if (!c) throw new Error(`no connector registered for source "${source}"`);
  return c;
}

export function listConnectors(): Connector[] {
  return [...registry.values()];
}
