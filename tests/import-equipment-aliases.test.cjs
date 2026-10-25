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
const one=text=>{const result=parse(text);assert.equal(result.items.length,1,text);return result.items[0];};
const clear=item=>!run(`importNeedsReview(${JSON.stringify(item)})`);
const names={rs:'大疆 RS4 PRO',light:'爱图仕 STORM 80c',stand:'04灯架',bar:'爱图仕 INFINIBAR PB6 2尺灯棒'};

test('local RS4 and Ronin 4 shorthand defaults to RS4 Pro with explicit counts',()=>{
  for(const text of ['rs4稳定器两套','RS4x2','大疆rs4两套','如影4两套','DJI RS 4 Pro 稳定器两套']){
    const i=one(text);assert.equal(i.name,names.rs,text);assert.equal(i.qty,2);assert.ok(clear(i),text);
    assert.equal(i.cat,'稳定器');assert.equal(i.priceKey,'大疆 RS4 PRO');
  }
});
test('explicit RS4 standard and Mini versions override the local Pro default',()=>{
  for(const text of ['RS4普通版一套','RS4标准版一套','RS4非Pro一套','RS4（普通版）一套','RS4（不要Pro）一套']){
    const i=one(text);assert.equal(i.name,'大疆 RS4 标准版',text);assert.ok(clear(i),text);assert.equal(i.priceKey,'');
  }
  for(const text of ['大疆RS4 Mini一套','RS4（Mini版）一套']){
    const i=one(text);assert.equal(i.name,'大疆 RS4 Mini',text);assert.ok(clear(i),text);assert.equal(i.priceKey,'');
  }
});
test('contradictory RS4 versions stay unpriced and require a specific review',()=>{
  for(const text of ['RS4 Pro（普通版）一套','RS4 Mini（Pro版）一套']){
    const i=one(text);assert.ok(!clear(i));assert.ok(i.issues.some(s=>s.includes('版本冲突')),text);
    assert.equal(i.priceKey,'');assert.equal(i.unitPrice,0);
  }
});
test('80c variants resolve to STORM 80c without inventing a rental price',()=>{
  for(const text of ['80c两台','爱图仕80C两台','STORM 80c x2','Aputure STORM 80C两台','８０Ｃ两台','爱图仕80c灯两台']){
    const i=one(text);assert.equal(i.name,names.light,text);assert.equal(i.qty,2);assert.ok(clear(i),text);
    assert.equal(i.cat,'灯光');assert.equal(i.priceKey,'');assert.equal(i.unitPrice,0);
  }
});
test('04 legs normalize only to a generic light stand, not a brand or camera tripod',()=>{
  for(const text of ['04腿两根','04灯腿x2','04号腿两个','04灯架两支','04号灯腿两根']){
    const i=one(text);assert.equal(i.name,names.stand,text);assert.equal(i.qty,2);assert.ok(clear(i),text);
    assert.equal(i.section,'其他');assert.equal(i.cat,'灯光');assert.equal(i.priceKey,'');assert.equal(i.unitPrice,0);
  }
});
test('INF two-foot and PB6 variants map to the researched two-foot light bar',()=>{
  for(const text of ['inf2尺两根','INF 2ft x2','inf二尺两根','INFINIBAR 2英尺两支','爱图仕PB6两根','INFINIBAR PB6两根','PB6两根','INF 2尺灯棒两根','inf2英尺两根']){
    const i=one(text);assert.equal(i.name,names.bar,text);assert.equal(i.qty,2);assert.ok(clear(i),text);
    assert.equal(i.cat,'灯光');assert.equal(i.priceKey,'');assert.equal(i.unitPrice,0);
  }
});
test('canonical lighting names can be pasted again without losing their meaning',()=>{
  for(const name of Object.values(names)){
    const i=one(name+'一套');assert.equal(i.name,name);assert.ok(clear(i),name);
  }
});
test('model numbers and bar lengths do not replace missing equipment quantities',()=>{
  for(const [text,name] of [['rs4',names.rs],['80c',names.light],['04腿',names.stand],['inf2尺',names.bar],['PB6',names.bar]]){
    const i=one(text);assert.equal(i.name,name);assert.equal(i.qty,1);
    assert.deepEqual(i.issues,['未写数量，暂按 1，请核对'],text);
  }
});
test('spaced bare counts and ASCII multipliers work across the new aliases',()=>{
  for(const [text,name] of [['rs4 2',names.rs],['80c 2',names.light],['04腿 2',names.stand],['inf2尺 2',names.bar],['PB6x2',names.bar]]){
    const i=one(text);assert.equal(i.name,name);assert.equal(i.qty,2);assert.ok(clear(i),text);
  }
});
test('separated quantity units and physical units are not converted into phantom rows',()=>{
  for(const [text,name] of [['RS4 2 套',names.rs],['80c 2 台',names.light],['04腿 2 根',names.stand],['PB6 2 ft 两根',names.bar],['INFINIBAR PB6 2 英尺 两根',names.bar]]){
    const i=one(text);assert.equal(i.name,name,text);assert.equal(i.qty,2);assert.ok(clear(i),text);
  }
});
test('standalone version and length notes apply before final model, price and duplicate checks',()=>{
  const standard=one('RS4一套\n（普通版）');
  assert.equal(standard.name,'大疆 RS4 标准版');assert.equal(standard.priceKey,'');assert.ok(clear(standard));
  const conflict=one('RS4Pro一套\n（普通版）');
  assert.ok(conflict.issues.some(s=>s.includes('版本冲突')));assert.equal(conflict.unitPrice,0);
  const bar=one('PB6一根\n（4尺）');
  assert.ok(bar.issues.some(s=>s.includes('长度冲突')));
  const different=parse('RS4一套\nRS4一套\n（普通版）').items;
  assert.ok(different.every(clear),'Different explicit RS4 variants are not duplicate equipment');
  const duplicates=parse('RS4普通版一套\nRS4一套\n（普通版）').items;
  assert.ok(duplicates[1].issues.some(s=>s.includes('重复')));
});
test('adjacent numeric model and quantity digits are split but explicitly reviewed',()=>{
  for(const [text,name] of [['RS42套',names.rs],['PB62根',names.bar]]){
    const i=one(text);assert.equal(i.name,name,text);assert.equal(i.qty,2,text);
    assert.ok(i.issues.some(s=>s.includes('连写')),text);
  }
  for(const text of ['80c2台','04腿2根','inf2尺2根']){
    const i=one(text);assert.equal(i.qty,2);assert.ok(clear(i),text);
  }
});
test('mixed equipment remains separate with notes, quantities and explicit sources preserved',()=>{
  const text='租赁 rs4稳定器2套 80c灯3台（带柔光箱）04腿4根 inf2尺2根';
  const r=parse(text);
  assert.deepEqual(r.items.map(i=>[i.name,i.qty]),[[names.rs,2],[names.light,3],[names.stand,4],[names.bar,2]]);
  assert.ok(r.items.every(clear));assert.equal(r.items[0].source,'租赁');
  assert.equal(r.items[1].remark,'带柔光箱');assert.ok(r.items.every(i=>i.raw===text));
});
test('multiple bare alias counts and compact multipliers stay local to each item',()=>{
  for(const text of ['RS4 2 PB6 3 80c 4 04腿 5','RS4x2 PB6x3 80cx4 04腿x5']){
    const items=parse(text).items;
    assert.deepEqual(items.map(i=>[i.name,i.qty]),[[names.rs,2],[names.bar,3],[names.light,4],[names.stand,5]],text);
    assert.ok(items.every(clear));
  }
  for(const text of ['RS4 x3','PB6 x3']){
    const i=one(text);assert.equal(i.qty,3,text);assert.ok(clear(i),text);
  }
});
test('unverified brands, model variants and accessory names are never overwritten',()=>{
  for(const text of ['神牛80c一台','南光inf2尺一根','索尼RS4一套','RS4电池两块','80c柔光箱一套','PB6连接器一个','04腿脚轮一组','RS4X一套','PB60一根']){
    const i=one(text);assert.ok(!Object.values(names).includes(i.name),text);
    assert.equal(i.priceKey,'');assert.ok(!clear(i),text);
  }
});
test('unverified INF lengths or conflicting PB6 lengths remain uncertain',()=>{
  for(const text of ['inf一根','inf4尺一根','INFINIBAR PB6 4尺一根','2尺灯棒一根']){
    const i=one(text);assert.notEqual(i.name,names.bar,text);assert.ok(!clear(i),text);
  }
  const i=one('PB6（4尺）一根');
  assert.ok(i.issues.some(s=>s.includes('长度冲突')));assert.equal(i.priceKey,'');
});
test('alternative models, omitted counts and invalid counts still require review',()=>{
  const choice=one('60b或者80c一套');
  assert.equal(choice.name,'60b或者80c');assert.ok(choice.issues.some(s=>s.includes('选择')));
  for(const text of ['80cx0','inf2尺x-2','04腿x1.5']){
    const i=one(text);assert.ok(i.issues.some(s=>s.includes('正整数')),text);
  }
});
test('duplicate detection uses canonical identity across new aliases',()=>{
  for(const text of ['80c一台\nSTORM80c一台','inf2尺一根\nPB6一根','rs4一套\nRS4PRO一套','04腿一个\n04灯架一个']){
    const r=parse(text);assert.equal(r.items.length,2);
    assert.ok(clear(r.items[0]));assert.ok(r.items[1].issues.some(s=>s.includes('重复')),text);
  }
});
test('light and stabilizer alias recognition does not create camera or lens inference',()=>{
  const r=parse('RS4一套\n80c一台\ninf2尺一根\n50定一颗');
  assert.equal(r.items[3].name,'索尼50mm GM 定焦');
  assert.ok(r.items.slice(0,3).every(i=>!i.inference));
});
test('Chinese physical units are specifications, not bare quantities',()=>{
  for(const text of ['PB6 60 厘米 两根','PB6 604 毫米 两根','80c 80 瓦 两台','80c 20 伏 两台','04腿 3 米 两根']){
    const i=one(text);assert.equal(i.qty,2,text);assert.ok(!clear(i),text);
  }
});
test('RS4 version labels and suffix variants are honored instead of defaulting to Pro',()=>{
  for(const text of ['RS4（非Pro版）一套','RS4一套\n（版本：标准版）','RS4（普通款）一套']){
    const i=one(text);assert.equal(i.name,'大疆 RS4 标准版',text);assert.ok(clear(i));assert.equal(i.priceKey,'');
  }
  for(const text of ['RS4（版本：Mini）一套','RS4一套\n（型号：Mini版）']){
    const i=one(text);assert.equal(i.name,'大疆 RS4 Mini',text);assert.ok(clear(i));assert.equal(i.priceKey,'');
  }
  const i=one('RS4Pro（非Pro版）一套');
  assert.ok(i.issues.some(s=>s.includes('版本冲突')));assert.equal(i.priceKey,'');
});
test('explicit light brand notes cannot be overwritten by a local Aputure default',()=>{
  for(const text of ['80c一台\n（神牛）','inf2尺一根\n（南光）','PB6（品牌：其他品牌）一根']){
    const i=one(text);assert.ok(i.issues.some(s=>s.includes('品牌冲突')),text);
    assert.ok(!i.name.includes('爱图仕'),text);assert.equal(i.priceKey,'');
  }
  for(const text of ['80c（品牌：爱图仕）一台','PB6（带南光灯架）一根']){
    const i=one(text);assert.ok(clear(i),text);
  }
});
test('PB6 metric lengths are checked against its two-foot nominal length',()=>{
  for(const text of ['PB6（4米）一根','inf2尺（长度：120厘米）一根','PB6（1200毫米）一根']){
    const i=one(text);assert.ok(i.issues.some(s=>s.includes('长度冲突')),text);assert.equal(i.priceKey,'');
  }
  for(const text of ['PB6（60厘米）一根','PB6（604毫米）一根','PB6（0.6米）一根','PB6（带4米电源线）一根']){
    assert.ok(clear(one(text)),text);
  }
});
test('X3 camera names and spaced count multipliers remain distinguishable',()=>{
  for(const [text,qty] of [['X3 x2',2],['X3 x3',3],['索尼 X3 x2',2],['x3x2',2],['RS4 x3',3],['PB6 x3',3]]){
    const i=one(text);assert.equal(i.qty,qty,text);assert.ok(clear(i),text);
    if(/^(?:索尼 )?x3/i.test(text))assert.equal(i.name,'索尼FX3');
  }
});
