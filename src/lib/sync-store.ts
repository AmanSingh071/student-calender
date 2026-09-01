import { kv } from "@vercel/kv";
import crypto from "crypto";

export type SyncEvent={
  sourceKey:string;
  summary:string;
  description?:string;
  start:string;
  end:string;
  eventId?:string;
};

export type SyncProfile={
  id:string;
  token:string;
  selected:string[];
  sections:Record<string,string>;
  events:SyncEvent[];
  enabled:boolean;
  updatedAt:string;
  lastSyncAt?:string;
  lastError?:string;
};

function key(){
  const raw=process.env.TOKEN_ENCRYPTION_KEY;
  if(!raw) throw new Error("TOKEN_ENCRYPTION_KEY is missing");
  const k=Buffer.from(raw,"base64");
  if(k.length!==32) throw new Error("TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  return k;
}
export function encrypt(value:string){
  const iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv("aes-256-gcm",key(),iv);
  const body=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);
  const tag=cipher.getAuthTag();
  return Buffer.concat([iv,tag,body]).toString("base64url");
}
export function decrypt(value:string){
  const raw=Buffer.from(value,"base64url");
  const iv=raw.subarray(0,12),tag=raw.subarray(12,28),body=raw.subarray(28);
  const decipher=crypto.createDecipheriv("aes-256-gcm",key(),iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body),decipher.final()]).toString("utf8");
}
export async function saveProfile(profile:SyncProfile){
  await kv.set(`sync:user:${profile.id}`,profile);
  await kv.sadd("sync:users",profile.id);
}
export async function getProfile(id:string){
  return await kv.get<SyncProfile>(`sync:user:${id}`);
}
export async function listProfileIds(){
  return await kv.smembers<string[]>("sync:users") || [];
}
