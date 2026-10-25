const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'release-files.json'),'utf8'));
const expected=new Set(manifest);
const files=[];
function walk(dir){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    if(['.git','node_modules','.DS_Store'].includes(entry.name))continue;
    const full=path.join(dir,entry.name);
    if(entry.isSymbolicLink())throw new Error('发布目录不能含符号链接：'+entry.name);
    if(entry.isDirectory())walk(full);
    else files.push(path.relative(root,full).split(path.sep).join('/'));
  }
}
walk(root);
for(const file of expected)if(!files.includes(file))throw new Error('缺少发布文件：'+file);
for(const file of files){
  if(!expected.has(file))throw new Error('非白名单文件：'+file);
  if(file.endsWith('.png'))continue;
  const text=fs.readFileSync(path.join(root,file),'utf8');
  if(/(?:\/Users\/|\/home\/|\b(?:tbl|fld)[A-Za-z0-9]{8,}|https?:\/\/[^\s/]+\.feishu\.cn|(?<!\d)1[3-9]\d{9}(?!\d))/.test(text))throw new Error('请核对潜在私有信息：'+file);
}
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(match=>match[1]).join('\n');
new vm.Script(script,{filename:'index.html inline script'});
if(/\bfetch\s*\(|XMLHttpRequest|WebSocket|API_BASE/.test(script))throw new Error('独立版出现非预期网络客户端');
console.log('发布文件、隐私边界与 JavaScript 语法检查通过。');
const tests=files.filter(file=>file.endsWith('.test.cjs')).sort();
const result=spawnSync(process.execPath,['--test',...tests],{cwd:root,stdio:'inherit'});
if(result.error)throw result.error;
process.exit(result.status??1);
