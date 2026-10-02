import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {copyFile,mkdir,readFile,rm,stat,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';

const sharp=createRequire(import.meta.url)('sharp');
const root=fileURLToPath(new URL('../',import.meta.url));
const visualDir=resolve(root,process.env.MODEL_VISUAL_EVIDENCE_DIR||'ux-screenshots/visual-v2/visual-audit');
const sourceDir=resolve(root,'ux-screenshots/visual-v2/posters');
const reviewDir=resolve(root,'ux-screenshots/visual-v2/review');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const exists=async path=>{try{await stat(path);return true;}catch{return false;}};
const sourceCommit=process.env.GITHUB_SHA||execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
await rm(reviewDir,{recursive:true,force:true});
await mkdir(reviewDir,{recursive:true});
await writeFile(resolve(reviewDir,'evidence-status.json'),JSON.stringify({status:'incomplete',reason:'Evidence preparation has not completed.',sourceCommit},null,2)+'\n');
const manifestPath=resolve(root,'site/assets/model-posters/manifest.json');
const auditPath=resolve(visualDir,'audit.json');
if(!(await exists(manifestPath))) {
  await writeFile(resolve(reviewDir,'evidence-status.json'),JSON.stringify({status:'incomplete',reason:'Poster capture did not produce a manifest.',sourceCommit:process.env.GITHUB_SHA||null},null,2)+'\n');
  process.exitCode=1;
} else {
  const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
  assert.equal(manifest.capture.sourceCommit,sourceCommit,'Poster manifest must come from this exact checked-out source commit');
  assert.equal(manifest.capture.sourceWorkingTreeClean,true,'Poster capture source inputs must come from a clean source tree');
  const audit=await exists(auditPath)?JSON.parse(await readFile(auditPath,'utf8')):null;
  const cleanAudit=value=>{
    if(Array.isArray(value))return value.map(cleanAudit);
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!['path','screenshot'].includes(key)).map(([key,item])=>[key,cleanAudit(item)]));
    return value;
  };
  if(audit)await writeFile(resolve(reviewDir,'visual-audit.json'),JSON.stringify(cleanAudit(audit),null,2)+'\n');
  await copyFile(manifestPath,resolve(reviewDir,'poster-manifest.json'));
  const selections=[['phone','light',3],['desktop','light',2]],files=[];
  for(const [name,theme,density] of selections) {
    const asset=manifest.assets.find(item=>item.name===name&&item.theme===theme&&item.density===density);
    assert.ok(asset,`Missing representative poster ${name}/${theme}/${density}x`);
    const masterPath=resolve(root,asset.capturePNG.evidenceFile),detailPath=resolve(root,asset.visualEvidence.runningDetailFile);
    const master=await readFile(masterPath),detail=await readFile(detailPath);
    assert.equal(hash(master),asset.capturePNG.sha256,`${name}/${density}x lossless master SHA-256`);
    assert.equal(hash(detail),asset.visualEvidence.runningDetailSha256,`${name}/${density}x running detail SHA-256`);
    const posterName=asset.selectedFormat==='avif'?asset.avifFile:asset.file;
    const posterPath=resolve(root,'site/assets/model-posters',posterName),poster=await readFile(posterPath);
    assert.equal(hash(poster),asset.selectedFormat==='avif'?asset.avifSha256:asset.sha256,`${name}/${density}x encoded poster SHA-256`);
    const metadata=await sharp(master).metadata(),detailMetadata=await sharp(detail).metadata();
    assert.equal(metadata.width,asset.decodedPixels.width);assert.equal(metadata.height,asset.decodedPixels.height);
    assert.equal(detailMetadata.width,metadata.width);assert.equal(detailMetadata.height,metadata.height);
    const background=theme==='dark'?'#050712':'#f4f9fd',densityScale=asset.density;
    const box=asset.graphGeometryBounds.all,padding=8;
    const left=Math.max(0,Math.floor(box.left-padding)*densityScale),top=Math.max(0,Math.floor(box.top-padding)*densityScale);
    const right=Math.min(metadata.width,Math.ceil(box.right+padding)*densityScale),bottom=Math.min(metadata.height,Math.ceil(box.bottom+padding)*densityScale);
    const crop={left,top,width:right-left,height:bottom-top};
    assert.ok(crop.width>0&&crop.height>0,`${name}/${density}x native crop bounds`);
    const cropOutput=async(input,path)=>{
      const normalized=await sharp(input).flatten({background}).toColourspace('srgb').png().toBuffer();
      const output=await sharp(normalized).extract(crop).png().toBuffer();
      await writeFile(resolve(reviewDir,path),output);
      const decoded=await sharp(output).metadata();assert.equal(decoded.width,crop.width);assert.equal(decoded.height,crop.height);
      return {path,sha256:hash(output),pixels:{width:decoded.width,height:decoded.height}};
    };
    const stem=`${name}-${asset.cssViewport.width}x${asset.cssViewport.height}-dpr${density}`;
    const poweredDownCrop=await cropOutput(master,`${stem}-lossless-crop.png`);
    const posterCrop=await cropOutput(poster,`${stem}-poster-crop.png`);
    const detailCrop=await cropOutput(detail,`${stem}-running-detail-frame145-crop.png`);
    const comparison=await sharp({create:{width:crop.width*3,height:crop.height,channels:3,background}})
      .composite([
        {input:resolve(reviewDir,poweredDownCrop.path),left:0,top:0},
        {input:resolve(reviewDir,posterCrop.path),left:crop.width,top:0},
        {input:resolve(reviewDir,detailCrop.path),left:crop.width*2,top:0},
      ]).png().toBuffer();
    const comparisonName=`${stem}-native-comparison.png`;
    await writeFile(resolve(reviewDir,comparisonName),comparison);
    const comparisonMeta=await sharp(comparison).metadata();
    assert.equal(comparisonMeta.width,crop.width*3);assert.equal(comparisonMeta.height,crop.height);
    const masterName=`${stem}-lossless-master.png`,detailName=`${stem}-running-detail-frame145.png`,posterCopyName=`${stem}-poster.${asset.selectedFormat}`;
    await copyFile(masterPath,resolve(reviewDir,masterName));await copyFile(detailPath,resolve(reviewDir,detailName));
    await copyFile(posterPath,resolve(reviewDir,posterCopyName));
    for(const [path,bytes] of [[masterName,master],[detailName,detail],[posterCopyName,poster]])files.push({path,bytes:bytes.length,sha256:hash(bytes)});
    files.push(...[poweredDownCrop,posterCrop,detailCrop,{path:comparisonName,bytes:comparison.length,sha256:hash(comparison)}]);
    files.push({path:`${name}/fidelity`,format:asset.selectedFormat,decodedPixels:asset.decodedPixels,
      comparisonMetrics:asset.compressionComparison[asset.selectedFormat],cropCss:{left:left/densityScale,top:top/densityScale,width:crop.width/densityScale,height:crop.height/densityScale},cropPixels:crop,
      sideBySideOrder:['lossless powered-down master','decoded selected poster','live running detail at frame 145']});
  }
  const evidence={schemaVersion:1,status:audit?.failure?'visual-audit-failed':audit?'captured':'incomplete',sourceCommit:manifest.capture.sourceCommit,
    sourceBase:manifest.capture.sourceBase,provenanceVerified:manifest.capture.provenanceVerified,servedSourceHashes:manifest.capture.servedSourceHashes,
    selectedRepresentatives:selections.map(([name,theme,density])=>({name,theme,density})),auditSummary:audit?.failure||
      (audit?'Model visual audit measurements preserved in visual-audit.json.':'Native poster comparisons were captured; the visual audit did not produce a receipt.'),files,
    totalBytes:files.reduce((sum,file)=>sum+(file.bytes||0),0),retentionDays:3,
    note:'Crops are native decoded pixels. The three-panel comparison is unscaled and uses the same crop rectangle for lossless capture, selected encoded poster and frame-145 live detail.'};
  await writeFile(resolve(reviewDir,'evidence-status.json'),JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify({status:evidence.status,sourceCommit:evidence.sourceCommit,totalBytes:evidence.totalBytes,files:files.length,reviewDir},null,2));
  if(!manifest.capture.provenanceVerified)process.exitCode=1;
}
