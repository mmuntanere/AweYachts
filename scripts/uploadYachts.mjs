import { createClient } from '@supabase/supabase-js';
import yachtsData from '../src/data/yachts.js'; // Note: it exports default object

const supabaseUrl = 'https://yxzztturzwlvjneeafsr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl4enp0dHVyendsdmpuZWVhZnNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzOTYzODYsImV4cCI6MjA5NTk3MjM4Nn0.HlErHxqxvortdJoXOJ9X_4G2J5iTvSLXLG8PEK-PXhw';

const supabase = createClient(supabaseUrl, supabaseKey);

async function upload() {
  const rows = Object.entries(yachtsData).map(([id, data]) => ({
    id,
    name: data.name,
    type: data.type,
    price: data.price,
    length: data.length,
    guests: data.guests,
    cabins: data.cabins,
    year: data.year,
    builder: data.builder,
    speed: data.speed,
    description: data.description,
    main_image: data.mainImage,
    gallery: data.gallery
  }));

  console.log(`Preparing to insert ${rows.length} yachts...`);

  const { data, error } = await supabase
    .from('yachts')
    .upsert(rows);

  if (error) {
    console.error('Error inserting data:', error);
  } else {
    console.log('Successfully inserted all yachts!');
  }
}

upload();
