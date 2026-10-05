import {test} from "node:test";
import assert from "node:assert/strict";
import {publicAddress,safeUrl,htmlContent,pdfContent,retrieve,collectSources,type ReaderDependencies} from "../src/lib/checklists/sources";
import {Response} from "undici";
import {validateDraft,generationConfigured,generateDraft,supportsDate} from "../src/lib/checklists/generate";
test("source reader blocks private, local, mapped, metadata and credential URLs",()=>{
 for(const ip of ["127.0.0.1","10.0.0.1","172.16.0.1","192.168.1.1","169.254.169.254","0.0.0.0","::1","fc00::1","fe80::1","::ffff:127.0.0.1","100.64.0.1"])assert.equal(publicAddress(ip),false,ip);
 assert.equal(publicAddress("8.8.8.8"),true);
 for(const url of ["http://example.org","https://localhost/","https://host.internal/","https://127.0.0.1/","https://[::1]/","https://user:pass@example.org/","https://example.org:444/"])assert.throws(()=>safeUrl(url));
 assert.equal(safeUrl("https://www.nyfa.org/awards/").protocol,"https:");
});
test("HTML extraction ignores executable content and finds requirement links",()=>{
 const r=htmlContent('<html><body><nav>Ignore navigation</nav><main><h1>Application requirements</h1><p>Prepare a project statement and itemized budget.</p><a href="/guidelines.pdf">Read guidelines</a><script>steal()</script><form>Password</form></main></body></html>',"https://funder.example/apply");
 assert.ok(r.text.includes("itemized budget"));assert.ok(!r.text.includes("steal"));assert.ok(!r.text.includes("Password"));assert.deepEqual(r.links,["https://funder.example/guidelines.pdf"]);
});
test("AI drafts require source support and never activate unsupported dates",()=>{
 const sources=[{url:"https://funder.example/apply",text:"Applicants must submit a project statement and an itemized budget."}];
 const task={title:"Prepare statement",notes:"",due_date:"2026-11-01",source_url:sources[0].url,source_excerpt:"Applicants must submit a project statement",date_excerpt:"",uncertainty:""};
 assert.equal(validateDraft({tasks:[task],warnings:[]},sources).tasks[0].due_date,null);
 assert.throws(()=>validateDraft({tasks:[{...task,source_url:"https://evil.example"}],warnings:[]},sources));
 assert.throws(()=>validateDraft({tasks:[{...task,source_excerpt:"Pay an invented fee immediately"}],warnings:[]},sources));
 assert.throws(()=>validateDraft({tasks:[],warnings:[]},sources));
});
test("missing configuration fails without calling AI",async()=>{if(!generationConfigured())await assert.rejects(()=>generateDraft([]),/not configured/);});
test("dates must match the published date, not just any source excerpt",()=>{assert.equal(supportsDate("2026-11-17","November 17, 2026 at 5 PM"),true);assert.equal(supportsDate("2027-11-17","November 17, 2026 at 5 PM"),false);assert.equal(supportsDate("2026-11-17","Apply next month"),false);});
const resolved=(async()=>[{address:"8.8.8.8",family:4}]) as ReaderDependencies["resolve"];
test("retrieval rejects unsafe redirects, private DNS, unsupported and login-only pages",async()=>{
 const mock=(request:()=>Response)=>({resolve:resolved,request:(async()=>request()) as ReaderDependencies["request"]});
 await assert.rejects(()=>retrieve("https://funder.example/apply","https://funder.example",0,mock(()=>new Response(null,{status:302,headers:{location:"https://127.0.0.1/"}}))),/public/);
 await assert.rejects(()=>retrieve("https://funder.example/apply","https://funder.example",0,mock(()=>new Response(null,{status:302,headers:{location:"https://other.example/"}}))),/outside/);
 await assert.rejects(()=>retrieve("https://funder.example/apply","https://funder.example",0,mock(()=>new Response(null,{status:302,headers:{location:"/again"}}))),/outside/);
 await assert.rejects(()=>retrieve("https://funder.example/apply","https://funder.example",0,{resolve:(async()=>[{address:"10.0.0.1",family:4}]) as ReaderDependencies["resolve"],request:(async()=>{throw new Error("Must not request private destination");}) as ReaderDependencies["request"]}),/public addresses/);
 await assert.rejects(()=>retrieve("https://funder.example/apply","https://funder.example",0,mock(()=>new Response("binary",{headers:{"content-type":"image/png"}}))),/Unsupported/);
 await assert.rejects(()=>retrieve("https://funder.example/apply","https://funder.example",0,mock(()=>new Response("Login required",{status:403}))),/could not be read/);
 await assert.rejects(()=>retrieve("https://funder.example/apply","https://funder.example",0,mock(()=>new Response("<body>Login</body>",{headers:{"content-type":"text/html"}}))),/too little/);
});
test("source traversal stops at five official pages and flags partial failures",async()=>{
 let requests=0;const content='<main>'+('Prepare a project statement. '.repeat(10))+Array.from({length:8},(_,i)=>`<a href="/requirements-${i}">Guidelines</a>`).join('')+'</main>';
 const deps={resolve:resolved,request:(async(url:unknown)=>{requests++;return String(url).includes('requirements-0')?new Response('Blocked',{status:403}):new Response(content,{headers:{'content-type':'text/html'}});}) as ReaderDependencies['request']};
 const r=await collectSources('https://funder.example/apply',deps);assert.equal(requests,5);assert.equal(r.sources.length,4);assert.equal(r.warnings.length,1);
});
test("text PDFs can be read",async()=>{
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
 const stream='BT /F1 12 Tf 50 700 Td (Submit a project statement and itemized budget.) Tj ET';objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
 let pdf='%PDF-1.4\n';const offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}const start=Buffer.byteLength(pdf);pdf+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
 assert.ok((await pdfContent(new Uint8Array(Buffer.from(pdf)))).includes('project statement'));
});
