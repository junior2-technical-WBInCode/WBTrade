const fs = require('fs');

function main() {
  const xmlContent = fs.readFileSync('sample_do_firmy.xml', 'utf-8');
  console.log("Does DoFirmy XML contain '5906142964109'?", xmlContent.includes('5906142964109'));
  console.log("Does DoFirmy XML contain 'G157-100'?", xmlContent.includes('G157-100'));
}

main();
