// This program is injected into the private reducer Container. It deliberately
// uses only Node built-ins plus GNU sort from the pinned Debian Node image.
// Inputs and outputs cross the Container boundary only through the scoped R2
// outbound handler in legal-custom-current-build-worker.ts.
export const CUSTOM_CURRENT_REDUCER_PROGRAM = String.raw`
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const FIELD_NAMES=["title","hierarchy","article","text"];
const FIELD_WEIGHTS={title:2,hierarchy:1.5,article:1.5,text:1};
const SHA=/^[a-f0-9]{64}$/;
const NIBBLE=/^[a-f0-9]$/;
const ARTIFACT_HOST=process.env.JURO_ARTIFACT_HOST||"http://artifacts.r2";

function fail(code){ process.stderr.write(code+"\n"); process.exit(64); }
function base64url(value){ return Buffer.from(value,"utf8").toString("base64url"); }
function shaFile(file){
  return new Promise((resolve,reject)=>{
    const hash=crypto.createHash("sha256");
    const stream=fs.createReadStream(file);
    stream.on("data",chunk=>hash.update(chunk));
    stream.on("error",reject);
    stream.on("end",()=>resolve(hash.digest("hex")));
  });
}
function shaBytes(bytes){ return crypto.createHash("sha256").update(bytes).digest("hex"); }
async function getJson(reference){
  if(!reference || !SHA.test(reference.sha256) || typeof reference.key!=="string") fail("REDUCER_REFERENCE_INVALID");
  const response=await fetch(ARTIFACT_HOST+"/object/"+base64url(reference.key),{
    headers:{"x-expected-sha256":reference.sha256}
  });
  if(!response.ok) fail("REDUCER_INPUT_FETCH_FAILED_"+response.status);
  const bytes=Buffer.from(await response.arrayBuffer());
  if(shaBytes(bytes)!==reference.sha256) fail("REDUCER_INPUT_HASH_MISMATCH");
  try { return JSON.parse(bytes.toString("utf8")); } catch { fail("REDUCER_INPUT_JSON_INVALID"); }
}
async function* getPages(references){
  for(let offset=0;offset<references.length;offset+=6){
    const pages=await Promise.all(references.slice(offset,offset+6).map(getJson));
    for(const page of pages) yield page;
  }
}
async function putFile(file,key,sha256){
  if(!SHA.test(sha256)) fail("REDUCER_OUTPUT_HASH_INVALID");
  const sizeBytes=fs.statSync(file).size;
  const response=await fetch(ARTIFACT_HOST+"/output/"+base64url(key),{
    method:"PUT", body:fs.createReadStream(file), duplex:"half",
    headers:{"content-type":"application/json","content-length":String(sizeBytes),"x-content-sha256":sha256}
  });
  if(!response.ok) fail("REDUCER_OUTPUT_PUT_FAILED_"+response.status);
  const result=await response.json();
  if(result.key!==key || result.sha256!==sha256 || result.sizeBytes!==sizeBytes) fail("REDUCER_OUTPUT_READBACK_MISMATCH");
  return {key,sizeBytes,sha256};
}
function outputKey(input,kind,identity,sha256){
  return input.outputPrefix+"/"+kind+"/"+identity+"-"+sha256+".json";
}
function writeJsonFile(file,value){ fs.writeFileSync(file,JSON.stringify(value)+"\n",{flag:"wx"}); }
function validatePlan(plan,input){
  if(!plan || plan.schemaVersion!==1 || plan.releaseId!==input.releaseId || !Array.isArray(plan.inputs)) {
    fail("REDUCER_PLAN_INVALID");
  }
}
async function reduceDocuments(input,directory){
  const plan=await getJson(input.plan); validatePlan(plan,input);
  const documents=[];
  for await(const page of getPages(plan.inputs)){
    if(page.schemaVersion!==1 || page.releaseId!==input.releaseId || !Array.isArray(page.documents)) fail("REDUCER_DOCUMENT_PAGE_INVALID");
    documents.push(...page.documents);
  }
  documents.sort((a,b)=>a.ordinal-b.ordinal || a.itemKey.localeCompare(b.itemKey));
  const ordinals=new Set(), itemKeys=new Set();
  const totals={title:0,hierarchy:0,article:0,text:0};
  for(const document of documents){
    if(!Number.isSafeInteger(document.ordinal) || document.ordinal<0 || typeof document.itemKey!=="string"
      || document.segmentId!=="current-base-v1" || ordinals.has(document.ordinal) || itemKeys.has(document.itemKey)) {
      fail("REDUCER_DOCUMENT_IDENTITY_INVALID");
    }
    ordinals.add(document.ordinal); itemKeys.add(document.itemKey);
    for(const field of FIELD_NAMES){
      if(!Number.isSafeInteger(document.fieldLengths?.[field]) || document.fieldLengths[field]<0) fail("REDUCER_FIELD_LENGTH_INVALID");
      totals[field]+=document.fieldLengths[field];
    }
  }
  if(documents.length===0) fail("REDUCER_DOCUMENTS_EMPTY");
  const averageFieldLengths=Object.fromEntries(FIELD_NAMES.map(field=>[field,totals[field]/documents.length]));
  const value={schemaVersion:1,releaseId:input.releaseId,segmentId:"current-base-v1",
    statistics:{documentCount:documents.length,averageFieldLengths},documents};
  const file=path.join(directory,"documents.json"); writeJsonFile(file,value);
  const sha256=await shaFile(file);
  const artifact=await putFile(file,outputKey(input,"documents","current-base-v1",sha256),sha256);
  return {schemaVersion:1,kind:"documents",releaseId:input.releaseId,artifact,statistics:value.statistics};
}
function scorePosting(posting,df,statistics,document){
  let score=0; const k1=1.2,b=0.75;
  for(const field of FIELD_NAMES){
    const tf=posting.termFrequencies[field]; if(tf<=0) continue;
    const average=Math.max(1,statistics.averageFieldLengths[field]);
    const idf=Math.log(1+(statistics.documentCount-df+0.5)/(df+0.5));
    const denominator=tf+k1*(1-b+b*document.fieldLengths[field]/average);
    score+=FIELD_WEIGHTS[field]*idf*(tf*(k1+1))/denominator;
  }
  return score;
}
async function reducePartition(input,directory){
  if(!NIBBLE.test(input.partition||"")) fail("REDUCER_PARTITION_INVALID");
  const plan=await getJson(input.plan); validatePlan(plan,input);
  const documentPage=await getJson(input.documents);
  if(documentPage.releaseId!==input.releaseId || !Array.isArray(documentPage.documents)
    || documentPage.statistics?.documentCount!==documentPage.documents.length) fail("REDUCER_DOCUMENT_ARTIFACT_INVALID");
  const documents=new Map(documentPage.documents.map(value=>[value.ordinal,value]));
  const raw=path.join(directory,"records.tsv"), sorted=path.join(directory,"records.sorted.tsv");
  const rawFd=fs.openSync(raw,"wx"); let sourceRecordCount=0;
  for await(const page of getPages(plan.inputs)){
    if(page.schemaVersion!==1 || page.releaseId!==input.releaseId || page.partition!==input.partition || !Array.isArray(page.records)) fail("REDUCER_PARTITION_PAGE_INVALID");
    for(const record of page.records){
      const fieldIndex=FIELD_NAMES.indexOf(record.field);
      if(!SHA.test(record.termHash) || !record.termHash.startsWith(input.partition)
        || !Number.isSafeInteger(record.itemOrdinal) || record.itemOrdinal<0 || fieldIndex<0
        || !Number.isSafeInteger(record.termFrequency) || record.termFrequency<1
        || documents.get(record.itemOrdinal)?.itemKey!==record.itemKey) fail("REDUCER_RECORD_INVALID");
      fs.writeSync(rawFd,record.termHash+"\t"+record.itemOrdinal+"\t"+fieldIndex+"\t"+record.termFrequency+"\n");
      sourceRecordCount++;
    }
  }
  fs.closeSync(rawFd);
  const sort=spawnSync("sort",["--stable","-t","\t","-k1,1","-k2,2n","-k3,3n",raw,"-o",sorted],{
    env:{...process.env,LC_ALL:"C"},stdio:["ignore","ignore","pipe"]
  });
  if(sort.status!==0 || sort.stderr.length>0) fail("REDUCER_EXTERNAL_SORT_FAILED");
  const postingsFile=path.join(directory,"postings.jsonl");
  const locatorFile=path.join(directory,"locators.jsonl");
  const postingsFd=fs.openSync(postingsFile,"wx"), locatorsFd=fs.openSync(locatorFile,"wx");
  let offset=0,termHash=null,currentOrdinal=null,currentPosting=null,postings=[],termCount=0,postingCount=0,seenRecords=0;
  const flushPosting=()=>{ if(currentPosting){ postings.push(currentPosting); postingCount++; currentPosting=null; } };
  const flushTerm=()=>{
    if(termHash===null) return;
    flushPosting();
    const df=postings.length;
    if(df===0) fail("REDUCER_TERM_EMPTY");
    let blockMaximum=0;
    for(const posting of postings){
      const document=documents.get(posting.ordinal); if(!document) fail("REDUCER_POSTING_DOCUMENT_MISSING");
      blockMaximum=Math.max(blockMaximum,scorePosting(posting,df,documentPage.statistics,document));
    }
    const stride=Math.max(1,Math.floor(Math.sqrt(postings.length)));
    const skip=postings.flatMap((posting,index)=>index%stride===0?[{postingIndex:index,ordinal:posting.ordinal}]:[]);
    const bytes=Buffer.from(JSON.stringify({termHash,documentFrequency:df,blockMaximum,skip,postings})+"\n");
    fs.writeSync(postingsFd,bytes);
    fs.writeSync(locatorsFd,JSON.stringify({termHash,offset,length:bytes.length,sha256:shaBytes(bytes),documentFrequency:df,blockMaximum})+"\n");
    offset+=bytes.length; termCount++; postings=[];
  };
  const lines=readline.createInterface({input:fs.createReadStream(sorted),crlfDelay:Infinity});
  for await(const line of lines){
    if(line.length===0) continue;
    const parts=line.split("\t"); if(parts.length!==4) fail("REDUCER_SORTED_RECORD_INVALID");
    const [nextHash,ordinalText,fieldText,frequencyText]=parts;
    const ordinal=Number(ordinalText),fieldIndex=Number(fieldText),frequency=Number(frequencyText);
    if(nextHash!==termHash){ flushTerm(); termHash=nextHash; currentOrdinal=null; }
    if(ordinal!==currentOrdinal){ flushPosting(); currentOrdinal=ordinal;
      currentPosting={ordinal,termFrequencies:{title:0,hierarchy:0,article:0,text:0}};
    }
    const field=FIELD_NAMES[fieldIndex];
    if(!field || currentPosting.termFrequencies[field]!==0) fail("REDUCER_DUPLICATE_FIELD_RECORD");
    currentPosting.termFrequencies[field]=frequency; seenRecords++;
  }
  flushTerm(); fs.closeSync(postingsFd); fs.closeSync(locatorsFd);
  if(seenRecords!==sourceRecordCount) fail("REDUCER_RECORD_COUNT_MISMATCH");
  const postingsSha256=await shaFile(postingsFile);
  const postingsArtifact=await putFile(postingsFile,outputKey(input,"postings",input.partition,postingsSha256),postingsSha256);
  const lexiconFile=path.join(directory,"lexicon.json"); const lexiconFd=fs.openSync(lexiconFile,"wx");
  fs.writeSync(lexiconFd,"{"); let first=true;
  const locatorLines=readline.createInterface({input:fs.createReadStream(locatorFile),crlfDelay:Infinity});
  for await(const line of locatorLines){
    if(!line) continue; const locator=JSON.parse(line); const key=locator.termHash; delete locator.termHash;
    fs.writeSync(lexiconFd,(first?"":",")+JSON.stringify(key)+":"+JSON.stringify({
      key:postingsArtifact.key,sizeBytes:postingsArtifact.sizeBytes,...locator
    })); first=false;
  }
  fs.writeSync(lexiconFd,"}\n"); fs.closeSync(lexiconFd);
  const lexiconSha256=await shaFile(lexiconFile);
  const lexicon=await putFile(lexiconFile,outputKey(input,"lexicon",input.partition,lexiconSha256),lexiconSha256);
  return {schemaVersion:1,kind:"partition",releaseId:input.releaseId,partition:input.partition,
    sourceRecordCount,termCount,postingCount,postings:postingsArtifact,lexicon};
}
async function reduceManifest(input,directory){
  const plan=await getJson(input.plan);
  if(!plan || plan.schemaVersion!==1 || plan.releaseId!==input.releaseId || !Array.isArray(plan.partitions)
    || plan.partitions.length!==16) fail("REDUCER_MANIFEST_PLAN_INVALID");
  const documentPage=await getJson(plan.documents);
  if(documentPage.releaseId!==input.releaseId || documentPage.segmentId!=="current-base-v1") fail("REDUCER_MANIFEST_DOCUMENTS_INVALID");
  const ordered=[...plan.partitions].sort((a,b)=>a.partition.localeCompare(b.partition));
  if(ordered.map(value=>value.partition).join("")!=="0123456789abcdef") fail("REDUCER_MANIFEST_PARTITIONS_INVALID");
  const postings=Object.fromEntries(ordered.map(value=>[value.partition,value.postings]));
  const lexicons=Object.fromEntries(ordered.map(value=>[value.partition,value.lexicon]));
  const manifest={schemaVersion:"custom-bm25-manifest-v1",analyzer:"word-v1",
    statistics:documentPage.statistics,documents:documentPage.documents,
    segments:[{id:"current-base-v1",postings,lexicons}]};
  const file=path.join(directory,"manifest.json"); writeJsonFile(file,manifest);
  const sha256=await shaFile(file);
  const artifact=await putFile(file,outputKey(input,"manifest","word-v1",sha256),sha256);
  return {schemaVersion:1,kind:"manifest",releaseId:input.releaseId,artifact,
    documentCount:manifest.statistics.documentCount,partitionCount:ordered.length,
    sourceRecordCount:ordered.reduce((sum,value)=>sum+value.sourceRecordCount,0)};
}

let body=""; process.stdin.setEncoding("utf8");
for await(const chunk of process.stdin) body+=chunk;
let input; try { input=JSON.parse(body); } catch { fail("REDUCER_REQUEST_INVALID"); }
if(!input || input.schemaVersion!==1 || typeof input.releaseId!=="string"
  || typeof input.outputPrefix!=="string") fail("REDUCER_REQUEST_INVALID");
const directory=fs.mkdtempSync(path.join(os.tmpdir(),"juro-reducer-"));
try {
  const result=input.mode==="documents" ? await reduceDocuments(input,directory)
    : input.mode==="partition" ? await reducePartition(input,directory)
    : input.mode==="manifest" ? await reduceManifest(input,directory)
    : fail("REDUCER_MODE_INVALID");
  process.stdout.write(JSON.stringify(result)+"\n");
} finally { fs.rmSync(directory,{recursive:true,force:true}); }
`;
