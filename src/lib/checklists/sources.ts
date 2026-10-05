import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";
import { Agent, fetch } from "undici";
import { load } from "cheerio";
export type Source = {url:string;text:string};
export function publicAddress(address:string) {
 try {let ip=ipaddr.parse(address);if(ip.kind()==="ipv6" && (ip as ipaddr.IPv6).isIPv4MappedAddress())ip=(ip as ipaddr.IPv6).toIPv4Address();return ip.range()==="unicast";}catch{return false;}
}
export function safeUrl(value:string) {
 const u=new URL(value);if(u.protocol!=="https:" || u.username || u.password || (u.port && u.port!=="443"))throw new Error("Only public HTTPS sources are supported.");
 const host=u.hostname.replace(/^\[|\]$/g,"");if(host==="localhost" || host.endsWith(".local") || host.endsWith(".internal") || (isIP(host) && !publicAddress(host)))throw new Error("This source address is not public.");return u;
}
export function htmlContent(html:string,url:string) {
 const $=load(html);$("script,style,nav,footer,header,noscript,form,iframe").remove();
 const links=$("a[href]").toArray().map(el=>({href:$(el).attr("href")!,label:$(el).text()})).filter(l=>/apply|application|guideline|requirement|eligib|instruction|checklist|\.pdf/i.test(l.label+" "+l.href)).map(l=>{try{return new URL(l.href,url).href.split("#")[0];}catch{return "";}}).filter(Boolean);
 const text=($("main").length?$("main").text():$("body").text()).replace(/\s+/g," ").trim();
 return {text,links};
}
export async function pdfContent(bytes:Uint8Array) {
 const {getDocument}=await import("pdfjs-dist/legacy/build/pdf.mjs");
 const doc=await getDocument({data:bytes,isEvalSupported:false,useSystemFonts:true}).promise;
 try{const texts:string[]=[];for(let n=1;n<=Math.min(doc.numPages,25);n++){const page=await doc.getPage(n);const content=await page.getTextContent();texts.push(content.items.map(i=>"str" in i?i.str:"").join(" "));}return texts.join(" ").replace(/\s+/g," ").trim();}finally{await doc.destroy();}
}
export type ReaderDependencies={resolve:(hostname:string,options:{all:true})=>Promise<{address:string;family:number}[]>;request:typeof fetch};
export async function retrieve(value:string,origin:string,redirects=0,deps:ReaderDependencies={resolve:lookup,request:fetch}):Promise<{source:Source;links:string[]}> {
 const url=safeUrl(value);if(url.origin!==origin || redirects>3)throw new Error("The source redirects outside its official site.");
 const addresses=await deps.resolve(url.hostname.replace(/^\[|\]$/g,""),{all:true});if(!addresses.length || addresses.some(a=>!publicAddress(a.address)))throw new Error("This source does not resolve to public addresses.");
 const selected=addresses[0];
 const agent=new Agent({connect:{lookup:(_hostname,options,callback)=>{if((options as {all?:boolean}).all) callback(null,[selected] as never);else callback(null,selected.address,selected.family);}}});
 try {
 const res=await deps.request(url,{dispatcher:agent,redirect:"manual",signal:AbortSignal.timeout(12000),headers:{"user-agent":"GrantOS-Checklist/1.0 (+public grant requirements)",accept:"text/html,application/pdf,text/plain"}});
 if([301,302,303,307,308].includes(res.status)){const location=res.headers.get("location");await res.body?.cancel();if(!location)throw new Error("Invalid source redirect.");return retrieve(new URL(location,url).href,origin,redirects+1,deps);}
 if(!res.ok){await res.body?.cancel();throw new Error("The official page could not be read. It may require login or block automated access.");}
 const type=res.headers.get("content-type")?.split(";")[0] ?? "";
 if(!["text/html","application/pdf","text/plain"].includes(type)){await res.body?.cancel();throw new Error("Unsupported source format; readable HTML or PDF is required.");}
 const reader=res.body!.getReader();const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>4_000_000)throw new Error("The source exceeds the supported size.");chunks.push(r.value);}}finally{await reader.cancel();}
 const bytes=Buffer.concat(chunks);const parsed=type==="application/pdf"?{text:await pdfContent(new Uint8Array(bytes)),links:[]}:type==="text/html"?htmlContent(bytes.toString("utf8"),url.href):{text:bytes.toString("utf8").replace(/\s+/g," ").trim(),links:[]};
 if(parsed.text.length<100)throw new Error("The source has too little readable text; it may need login, JavaScript, or be a scanned PDF.");
 return {source:{url:url.href,text:parsed.text.slice(0,24000)},links:parsed.links};
 }finally{await agent.close();}
}
export async function collectSources(start:string,deps?:ReaderDependencies) {
 const official=safeUrl(start);const queue=[official.href];const visited=new Set<string>();const sources:Source[]=[];const warnings:string[]=[];
 while(queue.length && visited.size<5){const url=queue.shift()!;if(visited.has(url))continue;visited.add(url);
 try{const result=await retrieve(url,official.origin,0,deps);sources.push(result.source);for(const link of result.links){try{const u=safeUrl(link);if(u.origin===official.origin && !visited.has(u.href) && !queue.includes(u.href))queue.push(u.href);}catch{}}}
 catch(e){warnings.push(`${url}: ${e instanceof Error?e.message:"Source unavailable."}`);}}
 if(!sources.length)throw new Error("No readable official requirements were found. You can still create a manual checklist.");return {sources,warnings};
}
