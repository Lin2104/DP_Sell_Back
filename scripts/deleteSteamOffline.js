require('dotenv').config();
const mongoose = require('mongoose');

const CATEGORY_NAME = 'Steam Offline';
const DRY_RUN = process.argv[2] !== '--confirm';

// ── Minimal inline schemas ──────────────────────────────────────────────────
const Category = mongoose.model('Category', new mongoose.Schema({ name: String }));
const Game = mongoose.model('Game', new mongoose.Schema({ name: String, categoryId: mongoose.Schema.Types.ObjectId }));
const Product = mongoose.model('Product', new mongoose.Schema({ name: String, gameId: mongoose.Schema.Types.ObjectId }));

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB\n');

  // 1. Find the category
  const category = await Category.findOne({ name: new RegExp(`^${CATEGORY_NAME}$`, 'i') });
  if (!category) {
    console.log(`❌ Category "${CATEGORY_NAME}" not found. Nothing to delete.`);
    return;
  }
  console.log(`📂 Found category: "${category.name}" (${category._id})\n`);

  // 2. Find all games under this category
  const games = await Game.find({ categoryId: category._id });
  const gameIds = games.map(g => g._id);

  console.log(`🎮 Games found (${games.length}):`);
  games.forEach(g => console.log(`   - ${g.name} (${g._id})`));

  // 3. Find all products under those games
  const products = gameIds.length > 0 ? await Product.find({ gameId: { $in: gameIds } }) : [];

  console.log(`\n📦 Products found (${products.length}):`);
  products.forEach(p => console.log(`   - ${p.name} (${p._id})`));

  if (DRY_RUN) {
    console.log('\n──────────────────────────────────────────');
    console.log('🔍 DRY RUN — no changes made.');
    console.log(`   Would delete: ${products.length} product(s), ${games.length} game(s)`);
    console.log('   Re-run with --confirm to actually delete.');
    console.log('──────────────────────────────────────────');
    return;
  }

  // 4. Delete products first, then games
  console.log('\n──────────────────────────────────────────');
  console.log('🗑️  DELETING...');
  if (products.length > 0) {
    const pResult = await Product.deleteMany({ gameId: { $in: gameIds } });
    console.log(`   ✅ Deleted ${pResult.deletedCount} product(s)`);
  }
  if (games.length > 0) {
    const gResult = await Game.deleteMany({ categoryId: category._id });
    console.log(`   ✅ Deleted ${gResult.deletedCount} game(s)`);
  }
  console.log('──────────────────────────────────────────');
  console.log('✅ Done. Category itself was kept (only games/products removed).');
}

main()
  .catch(err => { console.error('❌ Error:', err.message); process.exit(1); })
  .finally(() => mongoose.disconnect());

