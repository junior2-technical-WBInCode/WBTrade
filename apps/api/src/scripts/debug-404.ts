async function main() {
  console.log('=== DEBUGGING PRODUCT ENDPOINTS ===');
  
  // Endpoint 1: By ID
  const idUrl = 'http://localhost:5000/api/products/cmn7bjs980ymjumtx6ap8r2mw';
  console.log(`Fetching by ID: ${idUrl}`);
  try {
    const res = await fetch(idUrl);
    console.log(`Response status by ID: ${res.status} ${res.statusText}`);
    if (res.ok) {
      const data = await res.json();
      console.log('Product Name by ID:', data.name);
    }
  } catch (err: any) {
    console.error('Error fetching by ID:', err.message);
  }

  // Endpoint 2: By Slug
  const slugUrl = 'http://localhost:5000/api/products/slug/classic-world-remiza-strazacka-drewniana-garaz-auto-helikopter-figurki-13el';
  console.log(`Fetching by Slug: ${slugUrl}`);
  try {
    const res = await fetch(slugUrl);
    console.log(`Response status by Slug: ${res.status} ${res.statusText}`);
    if (res.ok) {
      const data = await res.json();
      console.log('Product Name by Slug:', data.name);
    }
  } catch (err: any) {
    console.error('Error fetching by Slug:', err.message);
  }
}

main();
