const {install,priceFor}=require('./fixtures/prices.cjs');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
const sandbox={document:{addEventListener(){}},window:{addEventListener(){}},console,setTimeout,clearTimeout};
vm.createContext(sandbox);
vm.runInContext(script,sandbox);install(vm,sandbox);
const run=code=>JSON.parse(JSON.stringify(vm.runInContext(code,sandbox)));
const parse=text=>run(`parseEquipmentText(${JSON.stringify(text)})`);
test('parser is available without DOM or network',()=>assert.equal(vm.runInContext('typeof parseEquipmentText',sandbox),'function'));
test('duplicate quantity is not added; mixed line splits',()=>{
  const r=parse('fx3两台 2台 电池10块 四冲两个');
  assert.deepEqual(r.items.map(i=>i.qty),[2,10,2]);
  assert.equal(r.items[0].name,'索尼FX3');
  assert.equal(r.items[0].issues.length,0); // Identical counts are not genuine ambiguity.
  assert.equal(r.items[2].name,'四充充电器');
  assert.equal(r.items[2].issues.length,0);
});
test('capacity is not quantity and bare second capacity inherits card context',()=>{
  const r=parse('高速卡160g2张 240g 2张\ntf卡256g一张');
  assert.deepEqual(r.items.map(i=>i.qty),[2,2,1]);
  assert.match(r.items[0].name,/160G/i);assert.match(r.items[1].name,/240G/i);
  assert.match(r.items[2].name,/256G/i);
});
test('configuration and model digits protected',()=>{
  const r=parse('大疆小蜜蜂一拖二2套\n三方通话一拖七一套\n大疆action5Pro2套\nFX30 × 2\n两个小三脚架');
  assert.deepEqual(r.items.map(i=>i.qty),[2,1,2,2,2]);
  assert.equal(r.items[2].name,'大疆Action 5 Pro');
  assert.equal(r.items[3].name,'索尼FX30');
});
test('bracket notes including wrapped lines remain notes',()=>{
  const r=parse('pocket4Pro 2套（带延长电池手柄\n和3.5音频线两条）\n棒灯一根');
  assert.equal(r.items.length,2);assert.equal(r.items[0].qty,2);
  assert.match(r.items[0].remark,/音频线两条/);assert.match(r.items[0].name,/pocket4pro/i);
  assert.ok(r.items[0].issues.length);
});
test('Sony GM zoom shorthand defaults to generation II without binding a price',()=>{
  const r=parse('索尼g大师16—35 一个\n24—70 两个\n70—200一个');
  assert.deepEqual(r.items.map(i=>i.qty),[1,2,1]);
  r.items.forEach(i=>{assert.match(i.name,/GM II$/);assert.match(i.inference,/默认二代/);assert.equal(i.priceKey,'');assert.equal(i.issues.length,0);});
  assert.match(r.items[1].name,/索尼/);
});
test('bare zooms and common primes use the configured Sony default',()=>{
  const r=parse('16-35一个\n24—70 两支\n70-200一支\n50定一个\n35定焦头一支\n85mm定焦镜头一支');
  assert.deepEqual(r.items.map(i=>i.qty),[1,2,1,1,1,1]);
  assert.deepEqual(r.items.map(i=>i.name),['索尼16-35mm GM II','索尼24-70mm GM II','索尼70-200mm GM II','索尼50mm GM 定焦','索尼35mm GM 定焦','索尼85mm GM 定焦']);
  r.items.forEach(i=>{assert.equal(i.section,'镜头&滤镜');assert.equal(i.issues.length,0);assert.equal(i.priceKey,'');assert.match(i.inference,/默认/);});
});
test('second-generation trinity shorthand expands to three distinct lenses',()=>{
  for(const text of ['大三元2代镜头','大三元二代','二代大三元一套','索尼大三元II一组']){
    const r=parse(text);
    assert.deepEqual(r.items.map(i=>i.name),['索尼16-35mm GM II','索尼24-70mm GM II','索尼70-200mm GM II']);
    assert.deepEqual(r.items.map(i=>i.qty),[1,1,1]);
    assert.deepEqual(r.items.map(i=>i.id),[1,2,3]);
    r.items.forEach(i=>{assert.equal(i.unit,'支');assert.deepEqual(i.issues,[]);assert.equal(i.raw,text);assert.match(i.inference,/大三元/);assert.match(i.inference,/二代|II/);assert.equal(i.priceKey,'');});
  }
});
test('explicit generation I overrides the default for single zoom lenses',()=>{
  for(const [input,focal] of [['16-35一代一支','16-35'],['一代24-70两支','24-70'],['70-200 1代一支','70-200'],['索尼16-35 GM I一支','16-35'],['24-70镜头一代一支','24-70']]){
    const i=parse(input).items[0];
    assert.equal(i.name,'索尼'+focal+'mm GM I');
    assert.equal(i.issues.length,0);assert.equal(i.priceKey,'');
    assert.match(i.inference,/按原文保留一代/);assert.doesNotMatch(i.inference,/默认二代|未指定.*代际/);
    assert.ok(i.suggestions.every(s=>!/\bII\b|二代|2代/.test(s)));
  }
});
test('generation I bundles expand without becoming generation II',()=>{
  for(const input of ['大三元一代','一代大三元两套','大三元1代三支','大三元I一套']){
    const r=parse(input);
    assert.deepEqual(r.items.map(i=>i.name),['索尼16-35mm GM I','索尼24-70mm GM I','索尼70-200mm GM I']);
    assert.ok(r.items.every(i=>i.qty===(input.includes('两套')?2:1)&&i.issues.length===0&&i.inference.includes('按原文保留一代')));
  }
});
test('explicit generation in attached bracket notes overrides only the default',()=>{
  for(const text of ['16-35一支（一代）','24-70一支（代际：1代）（带包）','大三元一套（一代）']){
    const r=parse(text);
    assert.ok(r.items.every(i=>i.name.endsWith('GM I')&&i.issues.length===0&&i.inference.includes('按原文保留一代')));
    assert.ok(r.items.every(i=>i.remark.includes('代')));
  }
  for(const text of ['16-35二代一支（一代）','索尼16-35 GM II一支（一代）','大三元二代一套（一代）']){
    assert.ok(parse(text).items.every(i=>i.issues.some(s=>s.includes('代际冲突'))));
  }
  assert.equal(parse('索尼16-35 GM II一支（二代）').items[0].unitPrice,priceFor('索尼16-35mm f2.8 GM 二代'));
  const fullConflict=parse('索尼16-35mm f2.8 GM 二代一支（一代）').items[0];
  assert.ok(fullConflict.issues.some(s=>s.includes('代际冲突')));
  assert.equal(fullConflict.priceKey,'');assert.equal(fullConflict.unitPrice,0);
  assert.equal(parse('索尼16-35mm f2.8 GM 二代一支（二代）').items[0].unitPrice,priceFor('索尼16-35mm f2.8 GM 二代'));
  assert.ok(parse('大三元一套（一代）').items.every(i=>i.lensBundle.generation==='I'&&i.lensBundle.explicitGeneration));
  assert.equal(parse('16-35一支（不要一代）').items[0].name,'索尼16-35mm GM II');
});
test('generation defaults keep explicit second-generation and full model price behavior',()=>{
  const r=parse('16-35二代一支\n24-70 2代两支\n70-200 II一支');
  assert.ok(r.items.every(i=>i.name.endsWith('GM II')&&i.issues.length===0&&i.inference.includes('按原文保留二代')));
  const full=parse('索尼16-35 GM II一支').items[0];
  assert.equal(full.priceKey,'索尼16-35mm f2.8 GM 二代');assert.equal(full.unitPrice,priceFor('索尼16-35mm f2.8 GM 二代'));
  const canon=parse('R5一台\n24-70一代一支\n70-200一支');
  assert.equal(canon.items[1].name,'佳能24-70mm L 大三元 I');assert.equal(canon.items[2].name,'佳能70-200mm L 大三元 II');
});
test('generation conflicts and other specifications are not silently overridden',()=>{
  const conflict=parse('一代16-35二代一支').items[0];
  assert.equal(conflict.name,'一代16-35二代');assert.ok(conflict.issues.some(s=>s.includes('代际冲突')));
  for(const input of ['16-35三代一支','索尼16-35 F4一支','适马24-70 Art一支','RF24-70一支']){
    const i=parse(input).items[0];assert.doesNotMatch(i.name,/\bII\b/);
  }
  const duplicate=parse('16-35一支\n16-35二代一支\n16-35一代一支');
  assert.ok(duplicate.items[1].issues.some(s=>s.includes('重复')));
  assert.ok(!duplicate.items[2].issues.some(s=>s.includes('重复')));
});
test('trinity set count multiplies each lens, not the generation digit',()=>{
  for(const text of ['大三元2代2套','两组大三元二代']){
    const r=parse(text);
    assert.deepEqual(r.items.map(i=>i.qty),[2,2,2]);
    assert.ok(r.items.every(i=>i.issues.length===0));
  }
  const total=parse('大三元二代三支');
  assert.deepEqual(total.items.map(i=>i.qty),[1,1,1]);
});
test('trinity keeps existing camera context, explicit brands and Canon caveats',()=>{
  const canon=parse('大三元二代一套\nR5C一台');
  assert.deepEqual(canon.items.slice(0,3).map(i=>i.name),['佳能16-35mm L 大三元 II','佳能24-70mm L 大三元 II','佳能70-200mm L 大三元 II']);
  assert.ok(canon.items[0].issues.some(s=>s.includes('EF')));
  assert.equal(canon.items[1].issues.length,0);
  const explicit=parse('佳能R5一台\n索尼大三元2代一套');
  assert.ok(explicit.items.slice(1).every(i=>i.name.startsWith('索尼')&&i.issues.some(s=>s.includes('品牌'))));
  const mixed=parse('FX3一台\nR5一台\n大三元二代');
  assert.equal(mixed.items.length,5);
  assert.ok(mixed.items.slice(2).every(i=>i.issues.some(s=>s.includes('多品牌'))&&/II/.test(i.name)));
});
test('trinity preserves notes, ownership, duplicate and quantity warnings',()=>{
  const r=parse('租赁 大三元二代一套（带镜头包）\n索尼16-35 GM II一支');
  assert.equal(r.items.length,4);
  assert.ok(r.items.slice(0,3).every(i=>i.remark==='带镜头包'&&i.source==='租赁'));
  assert.ok(r.items[3].issues.some(s=>s.includes('重复')));
  const conflict=parse('大三元二代一套两套');
  assert.equal(conflict.items.length,3);
  assert.ok(conflict.items.every(i=>i.issues.some(s=>s.includes('冲突'))));
  const ambiguous=parse('大三元二代两支');
  assert.equal(ambiguous.items.length,1);
  assert.equal(ambiguous.items[0].qty,2);
  assert.ok(ambiguous.items[0].issues.some(s=>s.includes('套数')));
});
test('only whole trinity bundle names expand, within the final row limit',()=>{
  for(const text of ['大三元二代镜头包一套','大三元F4一套','适马大三元二代一套']){
    const r=parse(text);assert.equal(r.items.length,1);assert.ok(r.items[0].issues.length);
  }
  const bare=parse('大三元一套');
  assert.equal(bare.items.length,3);assert.ok(bare.items.every(i=>i.name.endsWith('GM II')&&i.inference.includes('默认二代')&&!i.inference.includes('按原文保留二代')));
  assert.equal(parse(Array(100).fill('大三元二代').join('\n')).items.length,300);
  assert.throws(()=>parse(Array(101).fill('大三元二代').join('\n')),/300/);
});
test('camera context applies even when the camera is listed last',()=>{
  const r=parse('24-70一支\n70-200两支\n50定一支\nR5C一台');
  assert.equal(r.items[3].name,'佳能R5C');
  assert.deepEqual(r.items.slice(0,3).map(i=>i.name),['佳能24-70mm L 大三元 II','佳能70-200mm L 大三元 II','佳能50mm L 定焦']);
  r.items.slice(0,3).forEach(i=>{assert.equal(i.issues.length,0);assert.match(i.inference,/佳能R5C/);assert.equal(i.priceKey,'');});
});
test('known Sony camera aliases drive lens context without extra confirmation',()=>{
  for(const body of ['FX3','A7S3','索尼A7 IV']){
    const r=parse(body+' 一台\n50定一支');
    assert.equal(r.items[1].name,'索尼50mm GM 定焦');assert.equal(r.items[1].issues.length,0);
    assert.match(r.items[1].inference,/机身/);
  }
});
test('Canon wide zoom keeps 16-35 and flags EF versus RF, not a silent 15-35 swap',()=>{
  const r=parse('佳能R5 一台\n16-35 一支\n15-35一支');
  assert.equal(r.items[1].name,'佳能16-35mm L 大三元 II');
  assert.ok(r.items[1].issues.some(s=>s.includes('EF')&&s.includes('RF')));
  assert.equal(r.items[2].name,'佳能15-35mm L 大三元');assert.equal(r.items[2].issues.length,0);
});
test('mixed camera brands leave unlabeled lenses unresolved',()=>{
  const r=parse('FX3一台\n佳能R5一台\n24-70一支\n50定一支');
  r.items.slice(2).forEach(i=>{assert.doesNotMatch(i.name,/索尼|佳能|GM/);assert.ok(i.issues.some(s=>s.includes('多品牌')));assert.equal(i.priceKey,'');});
});
test('explicit lens brands and non-GM specifications are never overwritten',()=>{
  const r=parse('佳能R5一台\n索尼24-70一支\n适马24-70 Art一支\n索尼16-35 F4一支');
  assert.equal(r.items[1].name,'索尼24-70mm GM II');
  assert.ok(r.items[1].issues.some(s=>s.includes('品牌')&&s.includes('不同')));
  assert.equal(r.items[2].name,'适马24-70 Art');
  assert.match(r.items[3].name,/F4/);assert.doesNotMatch(r.items[3].name,/GM/);
});
test('unknown GM prime focal lengths are preserved and flagged',()=>{
  for(const focal of [20,40,55,999]){
    const i=parse(focal+'定一支').items[0];
    assert.match(i.name,new RegExp(String(focal)));assert.doesNotMatch(i.name,/GM/);
    assert.ok(i.issues.some(s=>s.includes('焦段')));assert.equal(i.priceKey,'');
  }
});
test('other camera systems prevent the no-camera Sony default',()=>{
  const r=parse('松下GH6 一台\n24-70一支');
  assert.doesNotMatch(r.items[1].name,/索尼|佳能/);assert.ok(r.items[1].issues.length);
});
test('explicit RED and Blackmagic body descriptors prevent Sony fallback',()=>{
  for(const body of ['RED机身','Blackmagic相机']){
    const r=parse(body+'一台\n24-70一支');
    assert.equal(r.items[0].cat,'相机');
    assert.doesNotMatch(r.items[1].name,/索尼|佳能/);
    assert.ok(r.items[1].issues.some(s=>s.includes('机身')));
  }
});
test('lens brand context ignores accessories, titles, and bracket notes',()=>{
  const r=parse('佳能拍摄项目：\nFX3一台（备用佳能R5）\n佳能电池2块\n24-70一支');
  assert.equal(r.items.at(-1).name,'索尼24-70mm GM II');
  assert.equal(r.items.at(-1).issues.length,0);
});
test('known camera model digits are not swallowed into quantities',()=>{
  const r=parse('R52台\nC70两台\n24-70一支');
  assert.deepEqual(r.items.map(i=>i.qty),[2,2,1]);
  assert.equal(r.items[0].name,'佳能R5');assert.ok(r.items[0].issues.some(s=>s.includes('连写')));
  assert.match(r.items[2].name,/佳能/);
});
test('Canon R-series aliases keep longer model numbers intact',()=>{
  const r=parse('R50 2台\nR100一台\nR6 Mark II一台\n24-70一支');
  assert.deepEqual(r.items.map(i=>i.name),['佳能R50','佳能R100','佳能R6 Mark II','佳能24-70mm L 大三元 II']);
  assert.deepEqual(r.items.map(i=>i.qty),[2,1,1,1]);
  assert.equal(r.items[3].issues.length,0);
});
test('explicit unsupported camera brands do not fall back to Sony',()=>{
  const r=parse('尼康Z8一台\n50定一支');
  assert.doesNotMatch(r.items[1].name,/索尼|佳能/);assert.ok(r.items[1].issues.some(s=>s.includes('机身')));
});
test('explicit Canon DSLR bodies provide Canon context even outside the catalog',()=>{
  for(const body of ['佳能90D','佳能6D','Canon EOS 5D Mark IV','佳能R5机身']){
    const r=parse(body+'一台\n50定一支\n24-70一支');
    assert.equal(r.items[0].cat,'相机');
    assert.equal(r.items[1].name,'佳能50mm L 定焦');
    assert.equal(r.items[2].name,'佳能24-70mm L 大三元 II');
    assert.equal(r.items[2].issues.length,0);
  }
});
test('lens mount and focal specifications are not mistaken for camera models',()=>{
  for(const lens of ['佳能RF50mm','佳能EF85mm','富士GF50mm']){
    const r=parse('FX3一台\n'+lens+'一支\n24-70一支');
    assert.notEqual(r.items[1].cat,'相机');
    assert.equal(r.items[1].name,lens);
    assert.equal(r.items[2].name,'索尼24-70mm GM II');
    assert.equal(r.items[2].issues.length,0);
  }
});
test('explicit unlisted body descriptors preserve their camera system',()=>{
  const r=parse('佳能新型号机身一台\n50定一支');
  assert.equal(r.items[0].cat,'相机');
  assert.ok(r.items[0].issues.length);
  assert.equal(r.items[1].name,'佳能50mm L 定焦');
});
test('focal length concatenated with quantity is not parsed as negative hundreds',()=>{
  const i=parse('16-352支').items[0];
  assert.equal(i.name,'索尼16-35mm GM II');assert.equal(i.qty,2);
  assert.ok(i.issues.some(s=>s.includes('连写')));
});
test('lens rules preserve raw input, warnings, inference and safe price boundaries',()=>{
  const r=parse('FX3一台\n16-35两支3支\n50定\n索尼16-35 GM II一支');
  assert.ok(r.items[1].issues.some(s=>s.includes('冲突')));assert.equal(r.items[1].raw,'16-35两支3支');
  assert.ok(r.items[2].issues.some(s=>s.includes('数量')));
  assert.equal(r.items[3].priceKey,'索尼16-35mm f2.8 GM 二代');
  assert.match(run(`importItemRemark(${JSON.stringify(r.items[1])})`),/识别说明/);
  const changed=run(`changeImportedItem(${JSON.stringify(r.items[1])},'name','新镜头')`);
  assert.equal(changed.inference,'');
});
test('camera brand edits invalidate inferred lenses without rewriting user choices',()=>{
  assert.equal(vm.runInContext('typeof invalidateImportCameraContext',sandbox),'function');
  const items=parse('FX3一台\n24-70一支\n适马24-70 Art一支').items;
  const changed=run(`(()=>{const items=${JSON.stringify(items)};invalidateImportCameraContext(items,'索尼FX3','佳能R5');return items;})()`);
  assert.equal(changed[1].name,items[1].name);
  assert.ok(changed[1].issues.some(s=>s.includes('机身信息已变化')));
  assert.equal(changed[1].confirmed,false);
  assert.deepEqual(changed[2],items[2]);
});
test('unknown names and missing quantities retained for review',()=>{
  const r=parse('神秘型号Z99\n大疆无人机一套');
  assert.equal(r.items.length,2);assert.equal(r.items[0].qty,1);
  assert.equal(r.items[0].name,'神秘型号Z99');
  assert.ok(r.items[0].issues.some(s=>s.includes('数量')));
  assert.equal(r.items[1].source,'待确认');
});
test('conflicting quantities and duplicate rows remain visible',()=>{
  const r=parse('FX3两台3台\nFX3一台');
  assert.equal(r.items.length,2);assert.equal(r.items[0].qty,2);
  assert.ok(r.items[0].issues.some(s=>s.includes('冲突')));
  assert.ok(r.items[1].issues.some(s=>s.includes('重复')));
});
test('unclosed brackets preserve remainder with warning',()=>{
  const r=parse('FX3 2台（电池国标\n棒灯一根');
  assert.equal(r.items[0].qty,2);assert.match(r.items[0].remark,/棒灯一根/);
  assert.ok(r.items[0].issues.some(s=>s.includes('括号')));
});
test('title, notes, invalid and over-limit input',()=>{
  const r=parse('演示项目：\nFX3 2台\n注意：电池必须有3C标识');
  assert.equal(r.title,'演示项目');assert.equal(r.items.length,1);assert.equal(r.fragments.length,1);
  assert.throws(()=>parse(''),/粘贴/);
  assert.throws(()=>parse('a'.repeat(20001)),/20,000|20000/);
  assert.throws(()=>parse(Array(301).fill('FX3一台').join('\n')),/300/);
});
test('untrusted text preserved as text and escaped for rendering',()=>{
  const value='<img src=x onerror=alert(1)> 一台';
  const r=parse(value);assert.equal(r.items.length,1);assert.match(r.items[0].raw,/onerror/);
  assert.equal(run(`escapeHTML('<script>')`),'&lt;script&gt;');
});
test('precise aliases get price binding but not inventory ownership',()=>{
  const r=parse('如影4pro一套\n影石360 X5一套\nFX3 2台');
  assert.deepEqual(r.items.map(i=>i.priceKey),['大疆 RS4 PRO','Insta360 X5','索尼FX3']);
  r.items.forEach(i=>assert.equal(i.source,'待确认'));
});
test('import entry and review interface exist',()=>{
  assert.match(html,/id="importView"/);assert.match(html,/id="importText"/);assert.match(html,/id="importDraft"/);
});
test('only unresolved or invalid entries need review, not unassigned sources',()=>{
  assert.equal(vm.runInContext('typeof importNeedsReview',sandbox),'function');
  const clean=parse('FX3 两台').items[0];
  assert.equal(run(`importNeedsReview(${JSON.stringify(clean)})`),false);
  const ambiguous=parse('FX3 两台 3台').items[0];
  assert.equal(run(`importNeedsReview(${JSON.stringify(ambiguous)})`),true);
  assert.equal(run(`importNeedsReview({...${JSON.stringify(ambiguous)},confirmed:true})`),false);
  assert.equal(run(`importNeedsReview({...${JSON.stringify(clean)},qty:0,confirmed:true})`),true);
  assert.equal(run(`importNeedsReview({...${JSON.stringify(clean)},name:''})`),true);
});
test('clear entries have no confirmation checkbox',()=>{
  assert.equal(vm.runInContext('typeof importConfirmationHTML',sandbox),'function');
  const clean=parse('FX3 两台').items[0],ambiguous=parse('FX3 两台 3台').items[0];
  assert.equal(run(`importConfirmationHTML(${JSON.stringify(clean)})`),'');
  assert.match(run(`importConfirmationHTML(${JSON.stringify(ambiguous)})`),/type="checkbox"/);
});
test('pending warnings are included in exported remarks until confirmed',()=>{
  assert.match(run(`importItemRemark({remark:'带电池',issues:['型号待核对'],confirmed:false})`),/带电池.*型号待核对/s);
  assert.equal(run(`importItemRemark({remark:'带电池',issues:['型号待核对'],confirmed:true})`),'带电池');
});
test('renaming invalidates old price and confirmation',()=>{
  const item=parse('FX3 两台').items[0];
  const edited=run(`changeImportedItem(${JSON.stringify(item)},'name','另一台相机')`);
  assert.equal(edited.priceKey,'');assert.equal(edited.unitPrice,0);assert.equal(edited.confirmed,false);
});
test('negative and zero quantities are not made positive silently',()=>{
  const r=parse('FX3 -2台\n棒灯0根');assert.equal(r.items[0].qty,-2);assert.equal(r.items[1].qty,0);
  assert.ok(r.items.every(i=>i.issues.some(s=>s.includes('正整数'))));
});
test('adjacent model/count is flagged and ASCII multiplier cannot swallow X5',()=>{
  const r=parse('FX32台\nFX3x2\n影石360X5一套');
  assert.deepEqual(r.items.map(i=>i.qty),[2,2,1]);
  assert.ok(r.items[0].issues.some(s=>s.includes('连写')));
  assert.equal(r.items[2].name,'Insta360 X5');
});
test('ND shorthand is retained without inventing diameter',()=>{
  const item=parse('无极nd2张（配转接环）').items[0];
  assert.equal(item.name,'可变ND滤镜');assert.equal(item.qty,2);assert.equal(item.priceKey,'');
  assert.ok(item.issues.some(s=>s.includes('尺寸')));
});
test('invalid draft fields cannot proceed',()=>{
  assert.match(run(`importValidation([{name:'FX3',qty:0,unit:'台'}],1)`),/正整数/);
  assert.match(run(`importValidation([{name:'',qty:1,unit:'台'}],1)`),/名称/);
  assert.match(run(`importValidation([{name:'FX3',qty:1,unit:'台'}],1.5)`),/天数/);
});
test('notes before quantity stay with their equipment',()=>{
  for(const input of ['FX3（带电池）两台','（带电池）FX3 两台']){
    const r=parse(input);assert.equal(r.items[0].remark,'带电池');
  }
  const r=parse('FX3两台（带卡）电池（备用）10块');
  assert.equal(r.items[0].remark,'带卡');assert.equal(r.items[1].remark,'备用');
});
test('comma separates a new prefixed quantity from duplicate quantities',()=>{
  const r=parse('FX3 两台，三个小三脚架');
  assert.deepEqual(r.items.map(i=>i.qty),[2,3]);
  assert.equal(r.items[1].name,'小三脚架');
});
test('list markers do not corrupt decimal specifications or negative counts',()=>{
  const r=parse('3.5mm音频线2条\n1.5米延长线2根\n-2台FX3\n1. FX3两台\n2、棒灯一根');
  assert.equal(r.items[0].name,'3.5mm音频线');
  assert.equal(r.items[1].name,'1.5米延长线');
  assert.equal(r.items[2].qty,-2);
  assert.ok(r.items[2].issues.some(s=>s.includes('正整数')));
  assert.equal(r.items[3].name,'索尼FX3');
  assert.equal(r.items[4].name,'棒灯');
});
test('selecting a model candidate preserves quantity ambiguity',()=>{
  const item=parse('FX32台').items[0];
  const resolved=run(`resolveImportCandidate(changeImportedItem(${JSON.stringify(item)},'name','索尼FX3 '),'索尼FX3')`);
  assert.ok(resolved.issues.some(s=>s.includes('型号与数量连写')));
  assert.ok(!resolved.issues.some(s=>s.startsWith('名称已修改')));
  assert.equal(resolved.unitPrice,priceFor('索尼FX3'));
});
test('screenshot sample creates 24 explicit rows, without inventing accessories',()=>{
  const text=`演示项目:
fx3两台 2台 电池10块 四冲两个（电池国标3c标识牌不能破看不清，要不然上不了飞机 四充充电器两套）
高速卡160g2张 240g 2张
tf卡256g一张
索尼g大师16—35 一个
24—70 两个
70—200一个
老蛙鱼眼镜头一个
大疆如影4pro一套
影石360 X5一套（＋自拍杆）
手机拍摄一台
大疆action5Pro2套（＋脖颈支架＋头套支架＋充电器＋自拍杆两个）（带卡）
pocket4Pro 2套（带延长电池手柄）
大疆小蜜蜂一拖二2套（带咪头3.5音频线两条＋充电器）
机头麦2套
两个小三脚架
大力胶一卷
棒灯一根
无极nd2张（结合上面三颗镜头配备相应的转接环）
大疆无人机一套
无线小监两套
三方通话一拖七一套`;
  const r=parse(text);assert.equal(r.items.length,24);
  assert.deepEqual(r.items.map(i=>i.qty),[2,10,2,2,2,1,1,2,1,1,1,1,1,2,2,2,2,2,1,1,2,1,2,1]);
});
