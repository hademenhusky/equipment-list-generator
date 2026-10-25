const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
function setup(){
  const storage=new Map();
  const elements=new Map();
  const sandbox={console,setTimeout,clearTimeout,
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    document:{addEventListener(){},getElementById:id=>{if(!elements.has(id))elements.set(id,{value:'租赁',classList:{add(){},remove(){},toggle(){}}});return elements.get(id);}},
    window:{addEventListener(){}},confirm:()=>true};
  vm.createContext(sandbox);vm.runInContext(script,sandbox);
  const run=code=>JSON.parse(JSON.stringify(vm.runInContext(code,sandbox))??'null');
  run(`showPreview=()=>{};renderTable=()=>{};updateStats=()=>{};showToast=()=>{};
    answers={project:{name:'演示项目',city:'',type:'TVC',days:3,cameras:1},
    cameras:{main:'索尼FX3',sameAsMain:true,secondary:[]},lens:{extra:[],needExtra:false},
    stabilizer:{need:true,type:'大疆RS4 PRO',tripod:['mini']},transmission:{need:false},drone:{need:false},
    lighting:{type:'专业布光',main:'爱图仕600X'},audio:{useDefault:true,extra:[]},
    special:{need:false,cameras:[],accessories:[]},delivery:['横屏 16:9']};`);
  return {run,storage,sandbox};
}
test('standalone page contains no bridge client or management entry points',()=>{
  assert.doesNotMatch(html,/127\.0\.0\.1:7777|API_BASE|fetch\(|id="(?:loginModal|inventoryView|checkoutView|serverStatus)"/);
});
test('default generation has no supplier quotes or assumed inventory ownership',()=>{
  const {run}=setup();run('generateList()');
  assert.deepEqual(run('PRICE_DB.vendors'),[]);
  assert.ok(run('currentData.length')>5);
  assert.ok(run(`currentData.every(i=>i.source==='待确认'&&i.unitPrice===0&&i.vendor==='')`));
  assert.equal(run('getCompanyData().length'),0);
  assert.equal(run('getRentalData().length'),0);
});
test('wizard source controls support pending and batch allocation',()=>{
  const {run}=setup();run('generateList()');
  assert.match(run('renderEquipmentTable(currentData,false,true)'),/>待确认<\/option>/);
  run('setPreviewSources()');
  assert.ok(run(`currentData.every(i=>i.source==='租赁'&&isUnpriced(i))`));
  assert.match(run('renderEquipmentTable(getRentalData(),true,false,3)'),/待询价/);
  assert.match(run('renderEquipmentTable(getRentalData(),true,false,3)'),/仅含已知价格/);
});
test('wizard edits save one history record and retain the original generated snapshot',()=>{
  const {run,storage}=setup();run('generateList();setPreviewSources();updateField(currentData[0].id,"qty",7);toggleEditMode();toggleEditMode()');
  const histories=[...storage.entries()].filter(([key])=>key==='equipment-list-generator-history-v1');
  assert.equal(histories.length,1);
  const records=JSON.parse(histories[0][1]);
  assert.equal(records.length,1);
  assert.equal(records[0].data[0].qty,7);
  assert.equal(records[0].data[0].source,'租赁');
  assert.equal(records[0].generatedData[0].qty,1);
  assert.equal(records[0].generatedData[0].source,'待确认');
});
test('new rows also require an explicit source',()=>{
  const {run}=setup();run('generateList();addRow()');
  assert.equal(run('currentData.at(-1).source'),'待确认');
});
test('batch rental allocation fills exact configured prices just like individual edits',()=>{
  const {run,sandbox}=setup();
  const {install,priceFor}=require('./fixtures/prices.cjs');
  install(vm,sandbox);
  run('generateList();setPreviewSources()');
  const priced=run('currentData.filter(item=>getPrice(item.priceKey))');
  assert.ok(priced.length>3);
  for(const item of priced){
    assert.equal(item.unitPrice,priceFor(item.priceKey),item.name);
    assert.equal(item.vendor,'测试供应商');
  }
});
test('an unspecified stabilizer never inherits the RS4 reference price',()=>{
  const {run,sandbox}=setup();require('./fixtures/prices.cjs').install(vm,sandbox);
  run(`answers.stabilizer.type='其他';generateList();setPreviewSources()`);
  const item=run(`currentData.find(i=>i.cat==='稳定器')`);
  assert.equal(item.priceKey,'');assert.equal(item.unitPrice,0);
  assert.equal(run(`isUnpriced(currentData.find(i=>i.cat==='稳定器'))`),true);
});
test('the unpriced catalog still recognizes models previously supplied by pricing data',()=>{
  const {run}=setup();
  for(const name of ['大力胶','图瑞思脚架N6t plus碳纤维','南光60B']){
    const items=run(`parseEquipmentText(${JSON.stringify(name+' 1个')}).items`);
    assert.equal(items.length,1);
    assert.equal(items[0].unitPrice,0);
    assert.equal(items[0].vendor,'');
    assert.equal(items[0].issues.length,0);
  }
});
