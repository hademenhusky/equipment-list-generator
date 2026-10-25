// Read-only diagnostic benchmark, not a production parser or a replacement for unit tests.
// Usage: node tests/evaluate-real-lists.cjs /absolute/path/to/清单粘贴测试集.md
// Reference meanings: x3 = Sony FX3; 卡3张2561张80 = A卡256G × 3 + A卡80G × 1,
// explicitly confirmed by the user on 2026-10-21.
// Scoring checks entire input-line decomposition + meaningful item names + quantities.
// Categories, exact catalog/model completion, prices, units and remarks are NOT scored here.
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
if(!process.argv[2])throw new Error('Usage: node tests/evaluate-real-lists.cjs <test-set.md>');
const source=fs.readFileSync(process.argv[2],'utf8');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
const context={document:{addEventListener(){}},window:{addEventListener(){}},console,setTimeout,clearTimeout};
vm.createContext(context);vm.runInContext(scripts,context);
const normalize=value=>value.normalize('NFKC').toLowerCase().replace(/[—–－]/g,'-').replace(/\s/g,'');
const lensSet=['16-35','24-70','70-200'].map(f=>['索尼'+f+'mm GM II',1]);
const camera=n=>['索尼FX3',n],rs=['大疆 RS4 PRO',1],nd=n=>['可变ND滤镜',n];
// Lines with no stated quantity are excluded, except the user's fixed one-set trinity convention.
// Parenthesized standalone continuation lines and quantity-free lists are reviewed separately.
const expected={
  1:{1:[camera(1)],3:[['大疆mic2麦克风',1]],4:[['机头麦',1]],5:lensSet,6:[['Nisi vND',2]],9:[['A卡',5]],10:[['原厂电池',6]]},
  2:{1:[camera(1)],2:lensSet,3:[rs],4:[['大疆小蜜蜂',1]],5:[['独脚架',1]],6:[['电池',8]],7:[['A卡',4]]},
  3:{1:[camera(2),['电池',10],['四充充电器',2]],2:[['高速卡160G',2],['高速卡240G',2]],3:[['tf卡256G',1]],
    5:[['移轴50',1]],6:[rs],7:[['大疆Action 5 Pro',2]],9:[['大疆小蜜蜂一拖二',1]],10:[['机头麦',2]],
    11:[['小三脚架',2]],12:[['大力胶',1]],13:[['棒灯',1]],14:[['60b或者80c',1],['150V口电池',2],['双充',1]],15:[nd(2)],16:[['大疆无人机',1]],18:[['TF小卡',1]]},
  4:{1:[camera(1)],2:[['机头麦',1]],3:[['麦克风',1]],4:lensSet,5:[['脚架',2]],6:[['ND滤镜',2]],7:[['稳定器',1]],
    8:[['排插',1]],9:[['卡',4],['电池',6]],10:[['露营车',1]],11:[['zoom h6',1]],
    12:[[['A卡256G','256G A卡'],3],[['A卡80G','80G A卡'],1]]},
  5:{1:[camera(2)],3:lensSet,4:[['90微距',1]],5:[nd(2)],6:[['百微',1]],7:[['图传发射',2],['小监',1]],11:[['v口电池',2]]},
  6:{1:[camera(1)],2:[['稳定器',1]],3:[['麦克风',1]],4:[['机头麦',1]],5:lensSet,6:[['棒灯',1]],7:[['ND滤镜',2]]},
  7:{1:[camera(2)],2:lensSet,4:[['百微',1]],5:[['大疆小蜜蜂一拖二',1]],9:[['v口电池',4]]},
  8:{1:[camera(2),['电池',8],['四充充电器',2]],2:[['高速卡160G',2],['高速卡240G',2]],4:[rs],5:[['影石360',1]],
    6:[['大疆Action 5 Pro',1]],7:[['大疆小蜜蜂一拖二',2]],8:[['机头麦',2]],9:[['HDMI线材',3]],10:[['mini三脚架',2]],11:[['棒灯',1]],12:[nd(2)]},
  9:{1:[camera(2),['电池',5],['高速卡',1],[['128卡','卡128G','高速卡128G'],1]],2:[['读卡器',1]],3:lensSet,
    4:[['大疆mic',1]],5:[['稳定器',1],['电池',2]],6:[['机头麦',1]],9:[['ND滤镜',2]]},
  10:{1:[camera(1)],2:[['索尼24-70mm GM II',1]],3:[['电池',2]],4:[['卡',2]]}
};
const blocks=[];
for(const line of source.split(/\r?\n/)){
  if(/^\s*(?:[1-9]|10)\s*$/.test(line))blocks.push({id:Number(line.trim()),lines:[]});
  else if(blocks.length)blocks.at(-1).lines.push(line);
}
if(blocks.map(b=>b.id).join(',')!=='1,2,3,4,5,6,7,8,9,10')throw new Error('Expected 10 numbered test cases');
const report={sourceSHA256:crypto.createHash('sha256').update(source).digest('hex'),htmlSHA256:crypto.createHash('sha256').update(html).digest('hex'),cases:[],failures:[],excluded:[],totals:{sourceLines:0,outputRows:0,clearRows:0,pendingRows:0,fragments:0,scoredLines:0,passedLines:0}};
for(const block of blocks){
  const parsed=vm.runInContext('parseEquipmentText('+JSON.stringify(block.lines.join('\n'))+')',context);
  const clear=parsed.items.filter(i=>!vm.runInContext('importNeedsReview('+JSON.stringify(i)+')',context)).length;
  const caseResult={id:block.id,sourceLines:block.lines.filter(l=>l.trim()).length,outputRows:parsed.items.length,clearRows:clear,pendingRows:parsed.items.length-clear,fragments:parsed.fragments.length,scoredLines:0,passedLines:0};
  for(const [index,raw] of block.lines.entries()){
    if(!raw.trim())continue;
    const line=index+1,gold=expected[block.id][line];
    if(!gold){report.excluded.push({case:block.id,line,raw});continue;}
    const actual=parsed.items.filter(i=>i.line===line);
    const pass=actual.length===gold.length&&gold.every(([names,qty],i)=>[].concat(names).some(n=>normalize(n)===normalize(actual[i].name))&&actual[i].qty===qty);
    caseResult.scoredLines++;if(pass)caseResult.passedLines++;
    else report.failures.push({case:block.id,line,raw,expected:gold,actual:actual.map(i=>({name:i.name,qty:i.qty,unit:i.unit,issues:i.issues}))});
  }
  report.cases.push(caseResult);
  for(const key of Object.keys(report.totals))report.totals[key]+=caseResult[key];
}
report.totals.structuralAccuracy=Number((report.totals.passedLines/report.totals.scoredLines*100).toFixed(1));
report.totals.automaticAcceptance=Number((report.totals.clearRows/report.totals.outputRows*100).toFixed(1));
console.log(JSON.stringify(report,null,2));
