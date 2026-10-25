const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const context={document:{addEventListener(){}},window:{addEventListener(){}},console,setTimeout,clearTimeout};
vm.createContext(context);
vm.runInContext([...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n'),context);
const run=code=>JSON.parse(JSON.stringify(vm.runInContext(code,context)));
const parse=text=>run(`parseEquipmentText(${JSON.stringify(text)})`);
const rows=text=>parse(text).items.map(i=>[i.name,i.qty]);
const clear=item=>!run(`importNeedsReview(${JSON.stringify(item)})`);

test('emoji and compact ASCII multipliers work for ordinary equipment',()=>{
  assert.deepEqual(rows('FX3✖️1\n脚架✖️2\n电池x2\n卡X3'),[['索尼FX3',1],['脚架',2],['电池',2],['卡',3]]);
  assert.ok(parse('FX3✖️1\n脚架✖️2\n电池x2\n卡X3').items.every(clear));
});
test('multiplier normalization does not consume model letters and numbers',()=>{
  assert.deepEqual(rows('影石360X5一套\n思瑞150x灯一套\n神秘X2一套'),[['Insta360 X5',1],['思瑞150x灯',1],['神秘X2',1]]);
});
test('bare quantity suffixes split several known devices on one line',()=>{
  assert.deepEqual(rows('fx3*2 电池 5 高速卡1 128卡1'),[['索尼FX3',2],['电池',5],['高速卡',1],['128卡',1]]);
  assert.deepEqual(rows('稳定器 1 电池2\n大疆mic（含领夹线） 1\n机头麦 1'),[['稳定器',1],['电池',2],['大疆mic',1],['机头麦',1]]);
  assert.ok(parse('稳定器 1 电池2\n大疆mic（含领夹线） 1\n机头麦 1').items.every(clear));
});
test('bare quantities cannot eat specifications, decimals, or unknown model suffixes',()=>{
  for(const text of ['电池150Wh','神秘设备99','大疆mic2','思瑞150x灯','爱图仕80C','Nisi vND','3.5mm音频线']){
    const i=parse(text).items[0];assert.equal(i.qty,1);assert.ok(i.issues.some(s=>s.includes('数量')),text);
  }
});
test('a spaced quantity unit is not converted into a second phantom item',()=>{
  assert.deepEqual(rows('机头麦 1 个\n电池 5 块\n卡 2 张'),[['机头麦',1],['电池',5],['卡',2]]);
});
test('invalid multiplier quantities remain invalid, never silently truncated',()=>{
  for(const input of ['电池x-2','电池×1.5','卡*0']){
    const i=parse(input).items[0];
    assert.ok(i.qty<=0||!Number.isInteger(i.qty),input);
    assert.ok(i.issues.some(s=>s.includes('正整数')));
  }
});
test('punctuation and descriptive tails never create phantom devices',()=>{
  assert.deepEqual(rows('百微一支。\nTF小卡一张单独的\nv口电池、两块带充电器'),[['百微',1],['TF小卡',1],['v口电池',2]]);
  assert.match(parse('TF小卡一张单独的').items[0].remark,/单独的/);
  assert.match(parse('v口电池、两块带充电器').items[0].remark,/带充电器/);
});
test('trinity accepts punctuation and multiplier set counts',()=>{
  for(const input of ['索尼g大师大三元。','大三元镜头*1','大三元x1']){
    const items=parse(input).items;assert.equal(items.length,3);
    assert.ok(items.every(i=>i.qty===1&&i.name.endsWith('GM II')&&clear(i)),input);
  }
  assert.deepEqual(parse('大三元镜头×2').items.map(i=>i.qty),[2,2,2]);
  assert.ok(parse('大三元两支').items[0].issues.some(s=>s.includes('套数')));
});
test('compact focal lengths keep generation and camera context',()=>{
  assert.deepEqual(rows('2470 x1'),[['索尼24-70mm GM II',1]]);
  assert.equal(parse('佳能R5一台\n70200一支').items[1].name,'佳能70-200mm L 大三元 II');
  assert.equal(parse('1635一代一支').items[0].name,'索尼16-35mm GM I');
  assert.equal(parse('电池2470mAh两块').items[0].name,'电池2470mAh');
});
test('compact focal lengths are protected before adjacent quantities are scanned',()=>{
  for(const [input,name,qty] of [['24701支','索尼24-70mm GM II',1],['16352个','索尼16-35mm GM II',2]]){
    const i=parse(input).items[0];assert.equal(i.name,name);assert.equal(i.qty,qty);
    assert.ok(i.issues.some(s=>s.includes('连写')));
  }
});
test('confirmed card shorthand survives punctuation, notes and an explicit source',()=>{
  for(const input of ['卡3张2561张80。','卡3张2561张80（备用）','租赁 卡3张2561张80']){
    const r=parse(input);
    assert.deepEqual(r.items.map(i=>[i.name,i.qty]),[['A卡256G',3],['A卡80G',1]],input);
    if(input.includes('备用'))assert.ok(r.items.every(i=>i.remark.includes('备用')));
    if(input.startsWith('租赁'))assert.ok(r.items.every(i=>i.source==='租赁'));
  }
});
test('ASCII x works with confirmed kits, branded focal lengths and catalog aliases',()=>{
  for(const [input,name] of [['360套装x2','Insta360 X5'],['索尼2470x2','索尼24-70mm GM II'],['RS4prox2','大疆 RS4 PRO']]){
    assert.deepEqual(rows(input),[[name,2]],input);assert.ok(clear(parse(input).items[0]));
  }
});
test('ASCII multipliers remain local to each item in a mixed line',()=>{
  assert.deepEqual(rows('FX3*2 RS4prox2 电池x2。'),[['索尼FX3',2],['大疆 RS4 PRO',2],['电池',2]]);
  for(const input of ['FX3*2 电池x2','FX3两台 电池x2'])
    assert.deepEqual(rows(input),[['索尼FX3',2],['电池',2]]);
});
test('multiple focal lengths split while preserving unspecified quantities for review',()=>{
  const r=parse('索尼g大师2代 16—35 24—70 70—200');
  assert.deepEqual(r.items.map(i=>i.name),['索尼16-35mm GM II','索尼24-70mm GM II','索尼70-200mm GM II']);
  assert.ok(r.items.every(i=>i.issues.length===1&&i.issues[0].includes('数量')));
  assert.equal(parse('16-35 24-70各两支').items.length,2);
  assert.ok(parse('16-35 24-70各两支').items.every(i=>i.qty===2&&clear(i)));
});
test('approved x3 means FX3 but explicit alternative brands take priority',()=>{
  assert.deepEqual(rows('x3两台 2台'),[['索尼FX3',2]]);
  assert.ok(clear(parse('x3两台 2台').items[0]));
  assert.equal(parse('x3一台\n50定一支').items[1].name,'索尼50mm GM 定焦');
  assert.doesNotMatch(parse('影石X3一套').items[0].name,/索尼|FX3/);
});
test('approved 360 kit means X5; 360 is not a count and missing quantity is still flagged',()=>{
  const i=parse('360套装').items[0];
  assert.equal(i.name,'Insta360 X5');assert.equal(i.qty,1);
  assert.deepEqual(i.issues,['未写数量，暂按 1，请核对']);
  assert.ok(clear(parse('360套装两套').items[0]));
  assert.equal(parse('影石X3套装一套').items[0].name,'影石X3套装');
});
test('approved compressed card phrase expands to two A-card capacities',()=>{
  const input='卡3张2561张80',r=parse(input);
  assert.deepEqual(r.items.map(i=>[i.name,i.qty]),[['A卡256G',3],['A卡80G',1]]);
  assert.ok(r.items.every(i=>clear(i)&&i.raw===input&&i.priceKey===''));
  assert.ok(parse('卡2张1281张64').items.some(i=>i.issues.length),'Unconfirmed compressed capacities must not be silently guessed');
});
test('same repeated count is deduplicated, conflicting counts still require review',()=>{
  assert.ok(clear(parse('FX3两台 2台').items[0]));
  const conflict=parse('FX3两台 3台').items[0];
  assert.equal(conflict.qty,2);assert.ok(conflict.issues.some(s=>s.includes('冲突')));
});
test('ordinary names are clear without inventing a model or price',()=>{
  const r=parse('原厂电池六块\nA卡四张\n独脚架一个\nTF小卡一张\n读卡器一个\n大疆mic一套\n百微一支\n移轴50一颗\n90微距一颗\n四冲两个');
  assert.ok(r.items.every(clear),JSON.stringify(r.items.filter(i=>!clear(i))));
  assert.ok(r.items.every(i=>i.priceKey===''&&i.unitPrice===0));
  assert.ok(r.items.slice(6,9).every(i=>i.cat==='镜头'));
  assert.equal(r.items[5].cat,'收音');
  assert.ok(!clear(parse('神秘设备Z99一个').items[0]));
  assert.ok(!clear(parse('60b或者80c一套').items[0]));
});
test('spacing and mini variants do not make known equipment uncertain',()=>{
  assert.ok(parse('5张 A 卡\nmini三脚架两个\n电池充电器一套\n折叠反光板一块\n便携灯腿一个').items.every(clear));
});
test('filter and alternative-model prompts explain the actual missing decision',()=>{
  const filter=parse('无极nd2张').items[0];
  assert.equal(filter.issues.length,1);assert.match(filter.issues[0],/尺寸/);
  const choice=parse('60b或者80c一套').items[0];
  assert.ok(choice.issues.some(s=>s.includes('选择')));
});
test('standalone note joins a unique preceding item without creating accessory counts',()=>{
  const r=parse('fx3两台 2台\n（240卡4张、电池8块、充电器两套）');
  assert.equal(r.items.length,1);assert.equal(r.fragments.length,0);
  assert.match(r.items[0].remark,/240卡4张/);
  assert.match(r.items[0].raw,/\n/);
  assert.equal(r.items[0].line,1);
  const mic=parse('大疆小蜜蜂一拖二1套\n（带咪头3.5音频线两条）');
  assert.equal(mic.fragments.length,0);assert.match(mic.items[0].remark,/两条/);
});
test('notes after multiple items remain visibly unassigned',()=>{
  const r=parse('图传发射两个小监一个\n（电池8块）');
  assert.equal(r.fragments.length,1);assert.equal(r.items.length,2);
  assert.ok(r.items.every(i=>i.issues.some(s=>s.includes('备注归属'))));
});
test('a note unambiguously adjacent to its device does not trigger blanket review',()=>{
  const r=parse('FX3两台（带卡）电池（备用）10块');
  assert.ok(r.items.every(clear));assert.deepEqual(r.items.map(i=>i.remark),['带卡','备用']);
});
test('two quantity-free generic devices are preserved separately with quantity warnings',()=>{
  const r=parse('怪手 大力胶');
  assert.deepEqual(r.items.map(i=>i.name),['怪手','大力胶']);
  assert.ok(r.items.every(i=>i.issues.some(s=>s.includes('数量'))));
});
test('large numeric model-like text never produces an unflagged huge count',()=>{
  const i=parse('360相机套装').items[0];
  assert.notEqual(i.qty,360);assert.ok(i.issues.length);
});
test('all 82 annotated real-world source lines match the unchanged assessment reference',()=>{
  const {execFileSync}=require('node:child_process');
  const report=JSON.parse(execFileSync(process.execPath,[
    path.join(__dirname,'evaluate-real-lists.cjs'),
    path.join(__dirname,'fixtures/清单粘贴测试集-2026-10-21.md')
  ],{encoding:'utf8'}));
  assert.equal(report.totals.scoredLines,82);
  assert.deepEqual(report.failures,[]);
});
