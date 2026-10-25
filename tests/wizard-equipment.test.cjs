const {install,priceFor}=require('./fixtures/prices.cjs');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
function setup(){
  const sandbox={document:{addEventListener(){}},window:{addEventListener(){}},console,setTimeout,clearTimeout};
  vm.createContext(sandbox);vm.runInContext(script,sandbox);install(vm,sandbox);
  const run=code=>JSON.parse(JSON.stringify(vm.runInContext(code,sandbox))??'null');
  run(`saveProjectToHistory=()=>{};showPreview=()=>{};showToast=message=>{globalThis.lastToast=message};
    answers={
      project:{name:'向导回归',city:'杭州',type:'TVC',days:3,cameras:1},
      cameras:{main:'索尼FX3',sameAsMain:true,secondary:[]},lens:{extra:[],needExtra:false},
      stabilizer:{need:false,tripod:[]},transmission:{need:false},drone:{need:false},
      lighting:{type:'自然光为主'},audio:{useDefault:true,extra:[]},
      special:{need:false,cameras:[],accessories:[]},delivery:['横屏 16:9']
    };`);
  return run;
}
test('manual lenses reach the list with names and quantities for Sony and Canon',()=>{
  for(const camera of ['索尼FX3','佳能R5']){
    const run=setup();
    run(`answers.cameras.main=${JSON.stringify(camera)};
      answers.lens.custom=[{name:'  手动镜头 "35" <测试>  ',qty:2},{name:'Cooke 50mm',qty:3}];
      generateList();`);
    const lenses=run(`currentData.filter(i=>i.cat==='镜头')`);
    assert.equal(lenses.length,camera==='索尼FX3'?5:2);
    assert.deepEqual(lenses.slice(-2).map(i=>[i.name,i.qty]),[['手动镜头 "35" <测试>',2],['Cooke 50mm',3]]);
    assert.ok(lenses.slice(-2).every(i=>i.source==='待确认'&&i.unitPrice===0&&i.priceKey===''));
    const review=run('renderReview()');
    assert.match(review,/&lt;测试&gt;/);assert.doesNotMatch(review,/<测试>/);
    assert.match(review,/Cooke 50mm × 3/);
    if(camera==='佳能R5')assert.doesNotMatch(review,/大三元套装/);
  }
});
test('light roles and additional lights keep independent quantities, units and exact prices',()=>{
  const run=setup();
  run(`answers.lighting={type:'专业布光',main:'爱图仕 LS 1200d Pro',fill:'爱图仕600X',back:'爱图仕600X',
    quantities:{main:2,fill:3,back:4},extra:[{name:'爱图仕 amaran Ray 660c',qty:5,role:'氛围'},{name:'自定义灯',qty:2,role:'主光'},{name:'棒灯',qty:6,role:'逆光'}]};
    generateList();`);
  const lights=run(`currentData.filter(i=>i.cat==='灯光')`);
  assert.deepEqual(lights.map(i=>[i.spec,i.qty]),[['主光',2],['面光',3],['逆光',4],['氛围',5],['主光',2],['逆光',6]]);
  assert.equal(lights[1].unitPrice,priceFor('爱图仕600X'));assert.equal(lights[1].priceKey,'爱图仕600X');
  assert.ok([lights[0],lights[3],lights[4]].every(i=>i.unitPrice===0&&i.priceKey===''));
  assert.equal(lights[5].unit,'根');assert.equal(lights[5].source,'待确认');
  assert.equal(run(`calcAmount(currentData.find(i=>i.name==='爱图仕600X'),3)`),9*priceFor('爱图仕600X'));
  assert.match(run('renderReview()'),/660c × 5/);
});
test('audio quantities apply to the default combination and individual selection',()=>{
  const run=setup();
  run(`answers.audio.quantities={'大疆小蜜蜂一拖二':3,'罗德枪麦':2};generateList();`);
  assert.deepEqual(run(`currentData.filter(i=>i.section==='收音设备').map(i=>[i.name,i.qty])`),[['Dji mic2一拖二',3],['罗德枪麦',2]]);
  run(`answers.audio.useDefault=false;answers.audio.extra=['罗德一拖二','机头麦'];
    answers.audio.quantities={'罗德一拖二':4,'机头麦':5};generateList();`);
  assert.deepEqual(run(`currentData.filter(i=>i.section==='收音设备').map(i=>[i.name,i.qty])`),[['罗德一拖二',4],['机头麦',5]]);
  assert.match(run('renderReview()'),/机头麦 × 5/);
});
test('old answers still generate one per selected item and unchanged default devices',()=>{
  const run=setup();
  run(`answers.lens.extra=['匹滋伐55'];answers.lens.needExtra=true;
    answers.lighting={type:'专业布光',main:'爱图仕600X',fill:'爱图仕300X',back:'棒灯'};generateList();`);
  assert.deepEqual(run(`currentData.filter(i=>i.cat==='灯光').map(i=>i.qty)`),[1,1,1]);
  assert.deepEqual(run(`currentData.filter(i=>i.section==='收音设备').map(i=>i.qty)`),[1,1]);
  assert.equal(run(`currentData.find(i=>i.name==='匹滋伐55').unitPrice`),priceFor('匹滋伐55'));
  run(`answers.lighting={type:'基础补光',sticks:7};generateList();`);
  assert.equal(run(`currentData.find(i=>i.name==='棒灯').qty`),7);
});
test('unpriced wizard rentals are visibly pending and excluded from the known-price total',()=>{
  const run=setup();
  run(`answers.lighting={type:'专业布光',main:'爱图仕 LS 1200d Pro'};generateList();`);
  run(`currentData.forEach(item=>item.source='租赁')`);
  const table=run(`renderEquipmentTable(getRentalData(),true,false,3)`);
  assert.match(table,/待询价/);
  assert.match(table,/仅含已知价格/);
});
test('invalid active counts and blank added names block generation without replacing the list',()=>{
  for(const qty of [0,-1,1.5,'',null]){
    for(const change of [
      `answers.lens.custom=[{name:'手动镜头',qty:${JSON.stringify(qty)}}]`,
      `answers.lighting={type:'专业布光',main:'爱图仕600X',quantities:{main:${JSON.stringify(qty)}}}`,
      `answers.audio.quantities={'大疆小蜜蜂一拖二':${JSON.stringify(qty)}}`
    ]){
      const run=setup();
      run(`currentData=[{name:'保留的清单'}];${change};generateList();`);
      assert.deepEqual(run('currentData'),[{name:'保留的清单'}],change);
      assert.match(run('lastToast'),/数量/);
    }
  }
  const run=setup();
  run(`answers.lens.custom=[{name:'  ',qty:1}];generateList();`);
  assert.match(run('lastToast'),/名称/);
});
