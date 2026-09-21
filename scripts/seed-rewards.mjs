import "dotenv/config";
import pg from "pg";
import { randomUUID } from "node:crypto";
const client=new pg.Client({connectionString:process.env.DATABASE_URL});await client.connect();
const rewards=[["freon-120","1 dona Freon",120,10],["compressor-410","3G kompressor",410,20],["umra-800","1 kishilik Umra sayohati bileti",800,30]];
try{for(const [seedKey,name,requiredMarja,order] of rewards)await client.query('INSERT INTO "Reward" ("id","name","requiredMarja","isActive","order","seedKey","createdAt","updatedAt") VALUES ($1,$2,$3,true,$4,$5,NOW(),NOW()) ON CONFLICT ("seedKey") DO NOTHING',[randomUUID(),name,requiredMarja,order,seedKey]);console.log("BKLead reward catalog initialized safely.");}finally{await client.end();}
