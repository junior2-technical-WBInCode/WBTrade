const fs = require('fs');

function main() {
  const xmlContent = fs.readFileSync('sample_leker.xml', 'utf-8');
  
  // Search for LEKER DB SKUs in the XML
  console.log("Does XML contain '44503'?", xmlContent.includes('44503'));
  console.log("Does XML contain 'ME14887'?", xmlContent.includes('ME14887'));
  console.log("Does XML contain '038244'?", xmlContent.includes('038244'));
  console.log("Does XML contain '29702'?", xmlContent.includes('29702'));
  console.log("Does XML contain '46873'?", xmlContent.includes('46873'));
}

main();
