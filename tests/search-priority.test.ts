import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pdfContent} from '../src/lib/checklists/sources';
import {searchPagePriority} from '../src/lib/discovery/search-jobs';
function readablePdf(){
 const text='BT /F1 12 Tf 30 100 Td (Grant applications open. Deadline December 1.) Tj ET';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${text.length} >>\nstream\n${text}\nendstream`];
 let pdf='%PDF-1.4\n';const offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
 const start=Buffer.byteLength(pdf);pdf+=`xref\n0 6\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
 return Buffer.from(pdf);
}
test('readable PDF accepts Node Buffer and typed bytes without detaching caller data',async()=>{
 const bytes=readablePdf(),copy=Buffer.from(bytes);
 assert.match(await pdfContent(bytes),/Grant applications open/);
 assert.deepEqual(bytes,copy);
 assert.match(await pdfContent(new Uint8Array(copy)),/Deadline December 1/);
});
test('relevant program guidelines rank above unrelated directories and announcements',()=>{
 assert.ok(searchPagePriority('https://example.org/music-grant/application.pdf',['music'])>searchPagePriority('https://example.org/news/music-grant-winners',['music']));
 assert.ok(searchPagePriority('https://example.org/music-grants',['music'])>searchPagePriority('https://example.org/funding', ['music']));
});
