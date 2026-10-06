import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// 1. Manually parse .env using Node's built-in fs (no dotenv package needed)
function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    throw new Error('.env file not found in current directory!');
  }
  const content = fs.readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx !== -1) {
      const key = trimmed.slice(0, idx).trim();
      let val = trimmed.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      env[key] = val;
    }
  }
  return env;
}

const env = loadEnv();
const SUPABASE_URL = env.EXPO_PUBLIC_SUPABASE_URL || env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const SUPABASE_KEY = env.EXPO_PUBLIC_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Parsed keys:', Object.keys(env));
  throw new Error('Could not find Supabase URL or Key in your .env file.');
}

console.log('Connecting to:', SUPABASE_URL);
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const menuItems = [
  // TEA
  { name: 'Classic Tea', price: 20.0, category: 'Tea', is_available: true },
  { name: 'Ginger Tea', price: 25.0, category: 'Tea', is_available: true },
  { name: 'Cardamom Tea', price: 25.0, category: 'Tea', is_available: true },
  { name: 'Black Tea', price: 20.0, category: 'Tea', is_available: true },
  { name: 'Lemon Tea', price: 20.0, category: 'Tea', is_available: true },
  { name: 'Podi Chai', price: 25.0, category: 'Tea', is_available: true },

  // COFFEE
  { name: 'Instant Coffee', price: 30.0, category: 'Coffee', is_available: true },
  { name: 'Filter Coffee', price: 35.0, category: 'Coffee', is_available: true },
  { name: 'Black Coffee', price: 20.0, category: 'Coffee', is_available: true },
  { name: 'Karuppati Black Coffee', price: 25.0, category: 'Coffee', is_available: true },
  { name: 'Sukku Malli Coffee', price: 25.0, category: 'Coffee', is_available: true },
  { name: 'Special Coorg Filter Coffee (Large)', price: 95.0, category: 'Coffee', is_available: true },

  // HOT BEVERAGES
  { name: 'Milk', price: 30.0, category: 'Hot Beverages', is_available: true },
  { name: 'Boost', price: 35.0, category: 'Hot Beverages', is_available: true },
  { name: 'Horlicks', price: 35.0, category: 'Hot Beverages', is_available: true },
  { name: 'Bournvita', price: 35.0, category: 'Hot Beverages', is_available: true },
  { name: 'Milo', price: 35.0, category: 'Hot Beverages', is_available: true },
  { name: 'Masala Milk (Pepper, Turmeric and Palm Sugar)', price: 40.0, category: 'Hot Beverages', is_available: true },

  // SOFT DRINKS
  { name: 'Coke', price: 40.0, category: 'Soft Drinks', is_available: true },
  { name: 'Sprite', price: 40.0, category: 'Soft Drinks', is_available: true },

  // MILKSHAKES
  { name: 'Rose Milk', price: 70.0, category: 'Milkshakes', is_available: true },
  { name: 'Mango Milkshake', price: 80.0, category: 'Milkshakes', is_available: true },
  { name: 'Chocolate Milkshake', price: 80.0, category: 'Milkshakes', is_available: true },
  { name: 'Classic Vanilla Shake', price: 80.0, category: 'Milkshakes', is_available: true },
  { name: 'Oreo Milkshake', price: 90.0, category: 'Milkshakes', is_available: true },
  { name: 'KitKat Milkshake', price: 90.0, category: 'Milkshakes', is_available: true },
  { name: 'Bourbon Milkshake', price: 90.0, category: 'Milkshakes', is_available: true },
  { name: 'Gems Milkshake', price: 90.0, category: 'Milkshakes', is_available: true },
  { name: 'Mixed Fruit Cream Shake', price: 90.0, category: 'Milkshakes', is_available: true },

  // FRESHERS
  { name: 'Fresh Lime', price: 50.0, category: 'Freshers', is_available: true },
  { name: 'Mint Mojito', price: 60.0, category: 'Freshers', is_available: true },
  { name: 'Nannari Sharbat', price: 60.0, category: 'Freshers', is_available: true },

  // SANDWICH
  { name: 'Bread Butter Jam', price: 50.0, category: 'Sandwich', is_available: true },
  { name: 'Bread Ghee Gulkand', price: 60.0, category: 'Sandwich', is_available: true },
  { name: 'Cheese Toast', price: 55.0, category: 'Sandwich', is_available: true },
  { name: 'Classic Bread Omelette', price: 70.0, category: 'Sandwich', is_available: true },
  { name: 'Veg Sandwich', price: 80.0, category: 'Sandwich', is_available: true },
  { name: 'Paneer Sandwich', price: 90.0, category: 'Sandwich', is_available: true },
  { name: 'Double Cheese Veg Sandwich', price: 90.0, category: 'Sandwich', is_available: true },

  // CRUNCHES
  { name: 'French Fries', price: 90.0, category: 'Crunches', is_available: true },
  { name: 'Salted Popcorn', price: 60.0, category: 'Crunches', is_available: true },
  { name: 'Butter Popcorn', price: 90.0, category: 'Crunches', is_available: true },

  // CHATS
  { name: 'Pani Puri', price: 50.0, category: 'Chats', is_available: true },
  { name: 'Bhel Puri', price: 60.0, category: 'Chats', is_available: true },
  { name: 'Masala Puri', price: 70.0, category: 'Chats', is_available: true },
  { name: 'Dahi Papdi Chat', price: 60.0, category: 'Chats', is_available: true },
  { name: 'Sev Puri', price: 70.0, category: 'Chats', is_available: true },
  { name: 'Cheese Corn Shots', price: 110.0, category: 'Chats', is_available: true },
  { name: 'Spicy Capsicum Chat', price: 110.0, category: 'Chats', is_available: true },
  { name: 'Crunchy Mixture Chat (Chatters Special)', price: 70.0, category: 'Chats', is_available: true },

  // COUNTRY CHATS
  { name: 'Podi Idly', price: 70.0, category: 'Country Chats', is_available: true },
  { name: 'Kuli Paniyaram', price: 80.0, category: 'Country Chats', is_available: true },
  { name: 'Chilli Garlic Idli', price: 70.0, category: 'Country Chats', is_available: true },
  { name: 'Potato Bhaji', price: 60.0, category: 'Country Chats', is_available: true },
  { name: 'Vazhakkai Bhaji', price: 60.0, category: 'Country Chats', is_available: true },
  { name: 'Mini Bonda', price: 80.0, category: 'Country Chats', is_available: true },
  { name: 'Sprouts Protein Bowl (Chatters Special)', price: 110.0, category: 'Country Chats', is_available: true },

  // EGG ITEMS
  { name: 'Omelette', price: 25.0, category: 'Egg Items', is_available: true },
  { name: 'Double Egg Omelette', price: 50.0, category: 'Egg Items', is_available: true },
  { name: 'Egg Masala Chat', price: 120.0, category: 'Egg Items', is_available: true },

  // HOME DOSA
  { name: 'Onion Dosa', price: 80.0, category: 'Home Dosa', is_available: true },
  { name: 'Carrot Dosa', price: 80.0, category: 'Home Dosa', is_available: true },
  { name: 'Tomato Dosa', price: 80.0, category: 'Home Dosa', is_available: true },
  { name: 'Podi Dosa', price: 80.0, category: 'Home Dosa', is_available: true },
  { name: 'Murungai Podi Dosa', price: 80.0, category: 'Home Dosa', is_available: true },
  { name: 'Curry Leaf Podi Dosa', price: 80.0, category: 'Home Dosa', is_available: true },
  { name: 'Masala Dosa', price: 80.0, category: 'Home Dosa', is_available: true },
  { name: 'Vegetable Uthapam', price: 80.0, category: 'Home Dosa', is_available: true },
  { name: 'Chilli Garlic Dosa (Spicy)', price: 80.0, category: 'Home Dosa', is_available: true },
  { name: 'Ghee Dosa', price: 90.0, category: 'Home Dosa', is_available: true },
  { name: 'Vendhayam Dosa', price: 80.0, category: 'Home Dosa', is_available: true },
  { name: 'Plain Butter Uthapam', price: 80.0, category: 'Home Dosa', is_available: true },
  { name: 'Dhavangere Butter Masala Dosa (Chatters Special)', price: 110.0, category: 'Home Dosa', is_available: true },
];

async function run() {
  console.log('Cleaning old menu items...');
  const { error: delErr } = await supabase
    .from('menu_items')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');

  if (delErr) {
    console.error('Delete warning:', delErr.message);
  } else {
    console.log('Old items cleared.');
  }

  console.log(`Inserting ${menuItems.length} menu items...`);
  const { error: insErr } = await supabase.from('menu_items').insert(menuItems);

  if (insErr) {
    console.error('Insert error:', insErr.message);
  } else {
    console.log('Successfully seeded all Chatters Café items into Supabase!');
  }
}

run();