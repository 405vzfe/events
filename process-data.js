const fs = require('fs');
const path = require('path');

function parseCSV(csvText) {
  const lines = csvText.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  
  const data = lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim());
    const row = {};
    
    headers.forEach((header, index) => {
      const value = values[index] || '';
      
      // Convert boolean-like values
      if (header !== 'date') {
        row[header] = value.toLowerCase() === 'true' || value === '1';
      } else {
        row[header] = value;
      }
    });
    
    return row;
  });
  
  return data;
}

function getTodaysData(data) {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
  return data.find(row => row.date === today);
}

function main() {
  try {
    // Read CSV file
    const csvPath = path.join(__dirname, 'data/events.csv');
    const csvText = fs.readFileSync(csvPath, 'utf8');
    
    // Parse CSV
    const data = parseCSV(csvText);
    
    // Get today's data
    const todaysData = getTodaysData(data);
    
    // Create API response in flat format
    let apiResponse;
    if (todaysData) {
      // Return today's data as a flat object
      apiResponse = todaysData;
    } else {
      // No data for today - return date with all false values
      apiResponse = {
        date: new Date().toISOString().split('T')[0],
        opex_minus_one: false
      };
    }
    
    // Write JSON file
    const apiPath = path.join(__dirname, 'events.json');
    fs.writeFileSync(apiPath, JSON.stringify(apiResponse, null, 2));
    
    console.log('✅ Successfully updated events.json');
    console.log('📅 Today\'s data:', todaysData || 'No data for today');
    
  } catch (error) {
    console.error('❌ Error processing data:', error);
    process.exit(1);
  }
}

main();