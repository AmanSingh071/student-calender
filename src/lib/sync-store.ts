import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

export type SyncEvent={sourceKey:string;summary:string;description?:string;start:string;end:string;eventId?:string};
export type SyncProfile={id:string;token:string;selected:string[];sections:Record<string,string>;events:SyncEvent[];enabled:boolean;updatedAt:string;lastSyncAt?:string;lastError?:string;sourceHash?:string};

function supabase(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw new Error("Supabase server environment variables are missing");
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
function key(){
 const raw=process.env.TOKEN_ENCRYPTION_KEY;
 if(!raw)throw new Error("TOKEN_ENCRYPTION_KEY is missing");
 const k=Buffer.from(raw,"base64");
 if(k.length!==32)throw new Error("TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
 return k;
}
export function encrypt(value:string){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv("aes-256-gcm",key(),iv),body=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]),tag=cipher.getAuthTag();return Buffer.concat([iv,tag,body]).toString("base64url")}
export function decrypt(value:string){const raw=Buffer.from(value,"base64url"),iv=raw.subarray(0,12),tag=raw.subarray(12,28),body=raw.subarray(28),decipher=crypto.createDecipheriv("aes-256-gcm",key(),iv);decipher.setAuthTag(tag);return Buffer.concat([decipher.update(body),decipher.final()]).toString("utf8")}
function fromRow(row:any):SyncProfile{return {id:row.id,token:row.token,selected:row.selected||[],sections:row.sections||{},events:row.events||[],enabled:row.enabled,updatedAt:row.updated_at,lastSyncAt:row.last_sync_at||undefined,lastError:row.last_error||undefined,sourceHash:row.source_hash||undefined}}
export async function saveProfile(profile:SyncProfile){
 const {error}=await supabase().from("calendar_sync_profiles").upsert({id:profile.id,token:profile.token,selected:profile.selected,sections:profile.sections,events:profile.events,enabled:profile.enabled,updated_at:profile.updatedAt,last_sync_at:profile.lastSyncAt||null,last_error:profile.lastError||null,source_hash:profile.sourceHash||null});
 if(error)throw new Error(error.message);
}
export async function getProfile(id:string){const {data,error}=await supabase().from("calendar_sync_profiles").select("*").eq("id",id).maybeSingle();if(error)throw new Error(error.message);return data?fromRow(data):null}
export async function listProfileIds(){const {data,error}=await supabase().from("calendar_sync_profiles").select("id").eq("enabled",true);if(error)throw new Error(error.message);return (data||[]).map(x=>x.id)}
