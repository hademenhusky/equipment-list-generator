// Synthetic values for testing only. These are not supplier quotes.
const names=[
  "索尼FX3",
  "索尼16-35mm f2.8 GM 二代",
  "索尼24-70mm f2.8 GM 二代",
  "佳能8-15mm f4鱼眼",
  "大疆 RS4 PRO",
  "Action5pro",
  "Insta360 X5",
  "图瑞思脚架N6t plus碳纤维",
  "南光60C",
  "爱图仕600X",
  "爱图仕300X",
  "南光60B",
  "爱图仕MC一套（四灯套）",
  "d21一拖二",
  "82mmND+转接环",
  "匹滋伐55",
  "老蛙8-15",
  "大力胶"
];
const items=names.map((name,index)=>({name,unit_price:11+index,pricing_type:name==='大力胶'?'次':'天'}));
module.exports={
  priceFor:name=>items.find(item=>item.name===name)?.unit_price,
  install:(vm,context)=>vm.runInContext('PRICE_DB.vendors.push('+JSON.stringify({name:'测试供应商',brand:'测试数据',contact:'',items})+')',context)
};
