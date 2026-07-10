import redis from "../storage/redis";



const STREAM_PREFIX = "pending_events";
const DEFAULT_CONSUMER_GROUP = "retry-workers";
const DEFAULT_MAXLEN = 10_000;


function streamKey(tenantId: string): string {
  return `${STREAM_PREFIX}:${tenantId}`;
}



export interface PendingEventFields {
  event_id: string;
  fingerprint_id: string;
  handler: string;
  error_type: string;
  error_message: string;
  occurred_at: string;
}



export interface PendingEntry {
  
  id: string;
  fields: PendingEventFields;
}




export async function addPendingEvent(
  tenantId: string,
  fields: PendingEventFields,
): Promise<string> {
  const id = await redis.xadd(
    streamKey(tenantId),
    "MAXLEN",
    "~",
    String(DEFAULT_MAXLEN),
    "*", 
    "event_id", fields.event_id,
    "fingerprint_id", fields.fingerprint_id,
    "handler", fields.handler,
    "error_type", fields.error_type,
    "error_message", fields.error_message,
    "occurred_at", fields.occurred_at,
  );
  
  
  return id!;
}




export async function ensureConsumerGroup(
  tenantId: string,
  group: string = DEFAULT_CONSUMER_GROUP,
): Promise<void> {
  try {
    await redis.xgroup("CREATE", streamKey(tenantId), group, "0", "MKSTREAM");
  } catch (err: any) {
    
    if (!String(err?.message).includes("BUSYGROUP")) throw err;
  }
}




export async function readPendingEvents(
  tenantId: string,
  group: string = DEFAULT_CONSUMER_GROUP,
  consumer: string = "worker-1",
  count: number = 50,
  blockMs: number = 0,
): Promise<PendingEntry[]> {
  await ensureConsumerGroup(tenantId, group);

  const args: (string | number)[] = [
    "GROUP", group, consumer,
    "COUNT", count,
  ];
  if (blockMs > 0) {
    args.push("BLOCK", blockMs);
  }
  args.push("STREAMS", streamKey(tenantId), ">");

  const result = await (redis as any).xreadgroup(...args);
  return parseXreadResult(result);
}


export async function listPendingEvents(
  tenantId: string,
  start: string = "-",
  end: string = "+",
  count: number = 100,
): Promise<PendingEntry[]> {
  const raw: any = await redis.xrange(
    streamKey(tenantId),
    start,
    end,
    "COUNT",
    count,
  );
  return parseXrangeResult(raw);
}




export async function ackPendingEvents(
  tenantId: string,
  ids: string[],
  group: string = DEFAULT_CONSUMER_GROUP,
): Promise<number> {
  if (ids.length === 0) return 0;
  return redis.xack(streamKey(tenantId), group, ...ids);
}



export interface PendingStats {
  
  pending_count: number;
  
  oldest_id: string | null;
  
  newest_id: string | null;
  
  stream_length: number;
}


export async function getPendingStats(
  tenantId: string,
  group: string = DEFAULT_CONSUMER_GROUP,
): Promise<PendingStats> {
  await ensureConsumerGroup(tenantId, group);

  const key = streamKey(tenantId);

  
  const raw: any = await redis.xpending(key, group);
  const streamLen = await redis.xlen(key);

  const pendingCount = typeof raw?.[0] === "number" ? raw[0] : 0;
  const oldestId = raw?.[1] ?? null;
  const newestId = raw?.[2] ?? null;

  return {
    pending_count: pendingCount,
    oldest_id: oldestId,
    newest_id: newestId,
    stream_length: streamLen,
  };
}




export async function reclaimPendingEvents(
  tenantId: string,
  minIdleTimeMs: number,
  group: string = DEFAULT_CONSUMER_GROUP,
  consumer: string = "reclaimer",
  count: number = 100,
): Promise<void> {
  await ensureConsumerGroup(tenantId, group);

  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  let cursor = "0-0";
  while (true) {
    const raw: any = await redis.xautoclaim(
      streamKey(tenantId),
      group,
      consumer,
      minIdleTimeMs,
      cursor,
      "COUNT",
      count
    );
    
    cursor = raw[0];
    const entries = raw[1];
    
    
    
    if (entries && entries.length > 0) {
      for (const [id, fields] of entries) {
        const parsedFields = fieldsArrayToObject(fields);
        
        await addPendingEvent(tenantId, parsedFields);
      }
      
      const ids = entries.map((e: any) => e[0]);
      await ackPendingEvents(tenantId, ids, group);
    }
    
    if (cursor === "0-0" || (entries && entries.length === 0)) {
      break;
    }
  }
}



function fieldsArrayToObject(arr: string[]): PendingEventFields {
  const obj: Record<string, string> = {};
  for (let i = 0; i < arr.length; i += 2) {
    obj[arr[i]] = arr[i + 1];
  }
  return obj as unknown as PendingEventFields;
}

function parseXrangeResult(raw: any): PendingEntry[] {
  if (!raw || !Array.isArray(raw)) return [];
  return raw.map(([id, fields]: [string, string[]]) => ({
    id,
    fields: fieldsArrayToObject(fields),
  }));
}

function parseXreadResult(raw: any): PendingEntry[] {
  if (!raw || !Array.isArray(raw)) return [];
  
  const entries: PendingEntry[] = [];
  for (const [, streamEntries] of raw) {
    for (const [id, fields] of streamEntries) {
      entries.push({ id, fields: fieldsArrayToObject(fields) });
    }
  }
  return entries;
}
