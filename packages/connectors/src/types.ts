// The one interface every platform implements (docs/merge-spec.md §4). Acceptance test
// for the abstraction: adding a platform is one file here plus one enum value in
// packages/db; nothing in the API, worker or AI layers branches on the source.

export type Source =
  | 'judgeme' | 'shopify' | 'google' | 'facebook' | 'instagram' | 'tiktok' | 'trustpilot' | 'manual';
export type ChannelType = 'review' | 'comment' | 'dm' | 'mention' | 'question';

export interface ConnectorCapabilities {
  channels: ChannelType[];
  canPublish: boolean;
  canPublishDM: boolean;
  supportsThreads: boolean;
  supportsEdit: boolean;
  rateLimit: { requests: number; windowMs: number };
}

/** What a connector sees of a stored connection. Credentials are resolved server-side
 *  from `credentialsRef`; the database never holds a raw token. */
export interface ConnectionContext {
  id: string;
  tenantId: string;
  externalAccount: string;
  cursor: Cursor | null;
  credentials: Record<string, string>;
}

export type Cursor = Record<string, unknown>;

/** A platform item normalised into the Interaction shape, before it gets tenant ids. */
export interface RawInteraction {
  externalId: string;
  channelType: ChannelType;
  threadId?: string | null;
  parentExternalId?: string | null;
  author: { externalId?: string | null; displayName?: string | null; handle?: string | null };
  subject?: string | null;
  title?: string | null;
  body: string;
  rating?: number | null;
  postedAt: Date;
  isPublic: boolean;
  permalink?: string | null;
  /** Set when the platform already shows a reply from the merchant. */
  existingReply?: { body: string; externalId?: string | null } | null;
  raw: unknown;
}

export interface IngestResult {
  interactions: RawInteraction[];
  cursor: Cursor;
  hasMore: boolean;
}

export interface PublishTarget {
  interactionExternalId: string;
  channelType: ChannelType;
}

export interface HealthStatus {
  ok: boolean;
  detail?: string;
}

export interface Connector {
  readonly source: Source;
  readonly capabilities: ConnectorCapabilities;

  /** Validates credentials the merchant supplied and returns the account they belong to. */
  connect(credentials: Record<string, string>): Promise<{ externalAccount: string; scopes: string[] }>;
  healthCheck(conn: ConnectionContext): Promise<HealthStatus>;
  ingest(conn: ConnectionContext, cursor: Cursor | null): Promise<IngestResult>;
  publish(conn: ConnectionContext, target: PublishTarget, body: string): Promise<{ externalId: string | null }>;
  /** Parses one webhook or API item. Pure: no I/O. */
  normalize(raw: unknown): RawInteraction;
}
