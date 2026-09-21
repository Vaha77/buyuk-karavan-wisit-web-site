import "dotenv/config";
import fs from "node:fs/promises";
import pg from "pg";
const statePath=new URL("../.tmp-cbu-product.json",import.meta.url);
const client=new pg.Client({connectionString:process.env.DATABASE_URL});
await client.connect();
try{
  if(process.argv[2]==="restore"){
    const state=JSON.parse(await fs.readFile(statePath,"utf8"));
    await client.query('UPDATE "Product" SET "priceUsd"=$1 WHERE "id"=$2',[state.priceUsd,state.id]);
    await fs.rm(statePath,{force:true});
    console.log("Runtime test Product restored");
  }else{
    const result=await client.query('SELECT "id","slug","priceUsd"::text AS "priceUsd" FROM "Product" WHERE "isVisible"=true ORDER BY "createdAt" LIMIT 1');
    if(!result.rows[0])throw new Error("No visible Product available for runtime test");
    await fs.writeFile(statePath,JSON.stringify(result.rows[0]),"utf8");
    await client.query('UPDATE "Product" SET "priceUsd"=1250 WHERE "id"=$1',[result.rows[0].id]);
    console.log(JSON.stringify({slug:result.rows[0].slug}));
  }
}finally{await client.end();}
