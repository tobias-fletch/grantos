import pg from 'pg';import dotenv from 'dotenv';dotenv.config({path:'.env.release',quiet:true});
async function main(){
 const db=new pg.Client({connectionString:process.env.MIGRATION_DATABASE_URL});if(!process.env.MIGRATION_DATABASE_URL)throw Error('Migration connection required');
 const app=process.env.APP_DB_USER,backup=process.env.BACKUP_DB_USER,appPassword=process.env.APP_DB_PASSWORD,backupPassword=process.env.BACKUP_DB_PASSWORD;
 if(!/^grantos_app_[a-z0-9_]+$/.test(app??'')||!/^grantos_backup_[a-z0-9_]+$/.test(backup??'')||appPassword?.length<32||backupPassword?.length<32||!appPassword||!backupPassword)throw Error('Dedicated credentials required');
 await db.connect();try{await db.query('BEGIN');
 for(const [user,password] of [[app,appPassword],[backup,backupPassword]]){
  if((await db.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[user])).rowCount)throw Error('Role exists; rotate separately');
  await db.query('CREATE ROLE '+pg.escapeIdentifier(user)+' LOGIN PASSWORD '+pg.escapeLiteral(password));
  await db.query('GRANT USAGE ON SCHEMA public TO '+pg.escapeIdentifier(user));
 }
 await db.query('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO '+pg.escapeIdentifier(app));
 await db.query('GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO '+pg.escapeIdentifier(app));
 await db.query('GRANT SELECT ON ALL TABLES IN SCHEMA public TO '+pg.escapeIdentifier(backup));
 await db.query('GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO '+pg.escapeIdentifier(backup));
 await db.query('COMMIT');console.log('Separate app and read-only backup logins created. Reapply table grants after future migrations.');
 }catch{await db.query('ROLLBACK');throw Error('Setup failed');}finally{await db.end();}
}
main().catch(()=>{console.error('Release role setup failed. No credentials logged.');process.exitCode=1;});
