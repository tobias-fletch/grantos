import pg from 'pg';import dotenv from 'dotenv';
dotenv.config({path:'.env.local',quiet:true});dotenv.config({quiet:true});
const from=new pg.Client({connectionString:process.env.CATALOG_SOURCE_DATABASE_URL});const to=new pg.Client({connectionString:process.env.CATALOG_TARGET_DATABASE_URL});
// Explicit public-data allowlist: no users, saves, applications, notes, tokens,
// editorial actors, research records or secrets cross into the beta database.
const tables={funders:['id','name','website_url','description'],opportunities:[],opportunity_categories:['opportunity_id','category'],opportunity_applicant_types:['opportunity_id','applicant_type'],opportunity_geographies:[],crawl_sources:[],opportunity_source_urls:['url','opportunity_id']};
async function main(){if(!process.env.CATALOG_SOURCE_DATABASE_URL||!process.env.CATALOG_TARGET_DATABASE_URL||!process.argv.includes('--confirm-empty'))throw Error('Explicit source/target and confirmation required');await from.connect();await to.connect();try{
 if((await to.query('SELECT 1 FROM users LIMIT 1')).rowCount)throw Error('Target has accounts');
 if((await to.query('SELECT 1 FROM applications LIMIT 1')).rowCount)throw Error('Target has private data');
 await to.query('BEGIN');await to.query('SET CONSTRAINTS ALL DEFERRED');
 // Initial migrations seed public catalog rows. This operation only permits a
 // new target with no users, and replaces those public seed tables transactionally.
 await to.query('DELETE FROM opportunity_source_urls');await to.query('DELETE FROM opportunities');await to.query('DELETE FROM funders');await to.query('DELETE FROM crawl_sources');
 for(const table of Object.keys(tables)){
 const rows=(await from.query(`SELECT * FROM ${table}`)).rows;
 const cols=(await to.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position",[table])).rows.map(r=>r.column_name);
 for(const original of rows){const row={...original};if(table==='opportunities'){row.merged_into=null;row.publication_provenance={method:'catalog-transfer',source_url:row.source_url};}if(table==='crawl_sources')row.created_by=null;
 const fields=cols.filter(c=>c in row);await to.query(`INSERT INTO ${table}(${fields.map(c=>'"'+c+'"').join(',')}) VALUES(${fields.map((_,i)=>'$'+(i+1)).join(',')})`,fields.map(c=>row[c]&&typeof row[c]==='object'&&!Array.isArray(row[c])&&!(row[c] instanceof Date)?JSON.stringify(row[c]):row[c]));
 }
 }
 // Restore public merge links after all catalog IDs exist.
 for(const r of (await from.query('SELECT id,merged_into FROM opportunities WHERE merged_into IS NOT NULL')).rows)await to.query('UPDATE opportunities SET merged_into=$2 WHERE id=$1',[r.id,r.merged_into]);
 await to.query('COMMIT');console.log('Public catalog and registered sources transferred; private records excluded.');
 }catch{await to.query('ROLLBACK');throw Error('Transfer failed');}finally{await from.end();await to.end();}}
main().catch(()=>{console.error('Catalog transfer failed; target changes rolled back. Check empty-target requirement and schema compatibility.');process.exitCode=1;});
