import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

interface CommonCrop {
  botanicalName: string
  commonNames: string[]
  canonicalName?: string  // set only when current DB name is likely still the botanical name
}

const COMMON_CROPS: CommonCrop[] = [
  // Vegetables
  { botanicalName: 'Solanum lycopersicum', commonNames: ['Tomato', 'Garden Tomato'] },
  { botanicalName: 'Solanum tuberosum', commonNames: ['Potato', 'Garden Potato'] },
  { botanicalName: 'Solanum melongena', commonNames: ['Eggplant', 'Aubergine', 'Brinjal'] },
  { botanicalName: 'Daucus carota', commonNames: ['Carrot', 'Wild Carrot'] },
  { botanicalName: 'Allium cepa', commonNames: ['Onion', 'Bulb Onion', 'Common Onion'] },
  { botanicalName: 'Allium sativum', commonNames: ['Garlic', 'Common Garlic'] },
  { botanicalName: 'Allium ampeloprasum', commonNames: ['Leek', 'Wild Leek', 'Broadleaf Wild Leek'] },
  { botanicalName: 'Allium schoenoprasum', commonNames: ['Chives', 'Wild Chives'] },
  { botanicalName: 'Brassica oleracea', commonNames: ['Cabbage', 'Kale', 'Broccoli', 'Cauliflower', 'Brussels Sprouts', 'Kohlrabi', 'Collard Greens', 'Wild Cabbage'] },
  { botanicalName: 'Lactuca sativa', commonNames: ['Lettuce', 'Garden Lettuce', 'Salad'] },
  { botanicalName: 'Spinacia oleracea', commonNames: ['Spinach', 'Common Spinach'] },
  { botanicalName: 'Pisum sativum', commonNames: ['Pea', 'Garden Pea', 'Green Pea'] },
  { botanicalName: 'Phaseolus vulgaris', commonNames: ['Bean', 'French Bean', 'Green Bean', 'Common Bean', 'Runner Bean', 'String Bean', 'Snap Bean'] },
  { botanicalName: 'Phaseolus coccineus', commonNames: ['Runner Bean', 'Scarlet Runner Bean', 'Multiflora Bean'] },
  { botanicalName: 'Cucumis sativus', commonNames: ['Cucumber', 'Garden Cucumber'] },
  {
    botanicalName: 'Cucurbita pepo',
    canonicalName: 'Zucchini / Pumpkin',
    commonNames: ['Zucchini', 'Courgette', 'Pumpkin', 'Summer Squash', 'Marrow', 'Acorn Squash', 'Spaghetti Squash'],
  },
  { botanicalName: 'Cucurbita maxima', commonNames: ['Squash', 'Winter Squash', 'Giant Pumpkin', 'Hubbard Squash', 'Buttercup Squash'] },
  { botanicalName: 'Cucurbita moschata', commonNames: ['Butternut Squash', 'Butternut Pumpkin', 'Crookneck Squash'] },
  { botanicalName: 'Capsicum annuum', commonNames: ['Pepper', 'Bell Pepper', 'Sweet Pepper', 'Chili Pepper', 'Hot Pepper', 'Paprika', 'Cayenne'] },
  { botanicalName: 'Zea mays', commonNames: ['Corn', 'Maize', 'Sweetcorn', 'Sweet Corn', 'Field Corn'] },
  { botanicalName: 'Beta vulgaris', commonNames: ['Beetroot', 'Beet', 'Swiss Chard', 'Chard', 'Sugar Beet', 'Garden Beet'] },
  { botanicalName: 'Brassica rapa', commonNames: ['Turnip', 'Chinese Cabbage', 'Bok Choy', 'Pak Choi', 'Napa Cabbage', 'Rapini'] },
  { botanicalName: 'Raphanus sativus', commonNames: ['Radish', 'Garden Radish', 'Daikon'] },
  { botanicalName: 'Apium graveolens', commonNames: ['Celery', 'Celeriac', 'Turnip-rooted Celery'] },
  { botanicalName: 'Asparagus officinalis', commonNames: ['Asparagus', 'Garden Asparagus', 'Sparrow Grass'] },
  { botanicalName: 'Vicia faba', commonNames: ['Broad Bean', 'Fava Bean', 'Horse Bean', 'Windsor Bean'] },
  { botanicalName: 'Glycine max', commonNames: ['Soybean', 'Soya Bean', 'Edamame'] },
  { botanicalName: 'Pastinaca sativa', commonNames: ['Parsnip', 'Wild Parsnip', 'Cow Parsnip'] },
  { botanicalName: 'Solanum tuberosum', commonNames: ['Potato'] },
  { botanicalName: 'Ipomoea batatas', commonNames: ['Sweet Potato', 'Kumara', 'Yam'] },
  { botanicalName: 'Brassica napus', commonNames: ['Swede', 'Rutabaga', 'Turnip-rooted Cabbage', 'Rapeseed'] },
  { botanicalName: 'Cichorium intybus', commonNames: ['Chicory', 'Common Chicory', 'Radicchio'] },
  { botanicalName: 'Cichorium endivia', commonNames: ['Endive', 'Escarole', 'Frisée'] },
  { botanicalName: 'Cynara scolymus', commonNames: ['Artichoke', 'Globe Artichoke', 'French Artichoke'] },
  // Herbs
  { botanicalName: 'Ocimum basilicum', commonNames: ['Basil', 'Sweet Basil', 'Common Basil', 'Italian Basil'] },
  { botanicalName: 'Petroselinum crispum', commonNames: ['Parsley', 'Common Parsley', 'Curly Parsley', 'Flat-leaf Parsley', 'Italian Parsley'] },
  { botanicalName: 'Anethum graveolens', commonNames: ['Dill', 'Garden Dill'] },
  { botanicalName: 'Foeniculum vulgare', commonNames: ['Fennel', 'Common Fennel', 'Sweet Fennel'] },
  { botanicalName: 'Mentha spicata', commonNames: ['Spearmint', 'Mint', 'Common Mint', 'Garden Mint'] },
  { botanicalName: 'Mentha piperita', commonNames: ['Peppermint', 'Mint'] },
  { botanicalName: 'Salvia officinalis', commonNames: ['Sage', 'Garden Sage', 'Common Sage'] },
  { botanicalName: 'Thymus vulgaris', commonNames: ['Thyme', 'Common Thyme', 'Garden Thyme'] },
  { botanicalName: 'Salvia rosmarinus', commonNames: ['Rosemary', 'Garden Rosemary'] },
  { botanicalName: 'Lavandula angustifolia', commonNames: ['Lavender', 'Common Lavender', 'English Lavender', 'True Lavender'] },
  { botanicalName: 'Origanum majorana', commonNames: ['Marjoram', 'Sweet Marjoram'] },
  { botanicalName: 'Origanum vulgare', commonNames: ['Oregano', 'Wild Marjoram', 'Common Oregano'] },
  { botanicalName: 'Melissa officinalis', commonNames: ['Lemon Balm', 'Balm', 'Common Balm'] },
  { botanicalName: 'Hyssopus officinalis', commonNames: ['Hyssop', 'Common Hyssop'] },
  { botanicalName: 'Borago officinalis', commonNames: ['Borage', 'Starflower', 'Common Borage'] },
  { botanicalName: 'Coriandrum sativum', commonNames: ['Coriander', 'Cilantro', 'Chinese Parsley', 'Dhania'] },
  { botanicalName: 'Ocimum tenuiflorum', commonNames: ['Holy Basil', 'Tulsi', 'Thai Basil'] },
  { botanicalName: 'Allium tuberosum', commonNames: ['Garlic Chives', 'Chinese Chives', 'Oriental Garlic'] },
  { botanicalName: 'Levisticum officinale', commonNames: ['Lovage', 'Garden Lovage', 'Old English Lovage'] },
  { botanicalName: 'Armoracia rusticana', commonNames: ['Horseradish', 'Horse Radish', 'Red Cole'] },
  // Flowers & companion plants
  {
    botanicalName: 'Helianthus annuus',
    canonicalName: 'Common Sunflower',
    commonNames: ['Sunflower', 'Common Sunflower', 'Annual Sunflower'],
  },
  { botanicalName: 'Tagetes erecta', commonNames: ['Marigold', 'African Marigold', 'Mexican Marigold'] },
  { botanicalName: 'Tagetes patula', commonNames: ['French Marigold', 'Dwarf Marigold'] },
  { botanicalName: 'Tropaeolum majus', commonNames: ['Nasturtium', 'Garden Nasturtium', 'Common Nasturtium'] },
  { botanicalName: 'Matricaria chamomilla', commonNames: ['Chamomile', 'German Chamomile', 'Wild Chamomile'] },
  { botanicalName: 'Tanacetum vulgare', commonNames: ['Tansy', 'Common Tansy', 'Bitter Buttons'] },
  { botanicalName: 'Achillea millefolium', commonNames: ['Yarrow', 'Common Yarrow', 'Milfoil'] },
  { botanicalName: 'Artemisia absinthium', commonNames: ['Wormwood', 'Absinth Wormwood', 'Grand Wormwood'] },
  { botanicalName: 'Ruta graveolens', commonNames: ['Rue', 'Common Rue', 'Herb-of-Grace'] },
  { botanicalName: 'Calendula officinalis', commonNames: ['Pot Marigold', 'Calendula', 'Common Marigold'] },
  { botanicalName: 'Phacelia tanacetifolia', commonNames: ['Phacelia', 'Lacy Phacelia', 'Blue Tansy', 'Purple Tansy'] },
  // Fruit
  { botanicalName: 'Fragaria ananassa', commonNames: ['Strawberry', 'Garden Strawberry', 'Pineapple Strawberry'] },
  { botanicalName: 'Malus domestica', commonNames: ['Apple', 'Common Apple', 'Domestic Apple'] },
  { botanicalName: 'Ribes rubrum', commonNames: ['Currant', 'Red Currant', 'White Currant'] },
  { botanicalName: 'Ribes nigrum', commonNames: ['Blackcurrant', 'Black Currant', 'Cassis'] },
  { botanicalName: 'Rubus idaeus', commonNames: ['Raspberry', 'Red Raspberry', 'European Raspberry'] },
  { botanicalName: 'Rubus fruticosus', commonNames: ['Blackberry', 'Common Blackberry', 'Bramble'] },
  { botanicalName: 'Vaccinium corymbosum', commonNames: ['Blueberry', 'Highbush Blueberry', 'Swamp Blueberry'] },
]

async function main() {
  let updated = 0
  let skipped = 0

  for (const crop of COMMON_CROPS) {
    const result = await prisma.crop.updateMany({
      where: { botanicalName: crop.botanicalName },
      data: {
        commonNames: crop.commonNames,
        isCommonCrop: true,
      },
    })
    if (result.count > 0) {
      updated++
      // Fix name only when it's still set to the botanical name and we have a canonical override
      if (crop.canonicalName) {
        await prisma.crop.updateMany({
          where: { botanicalName: crop.botanicalName, name: crop.botanicalName },
          data: { name: crop.canonicalName },
        })
      }
    } else {
      skipped++
    }
  }

  console.log(`Common crops seed: ${updated} updated, ${skipped} not found in DB (run import first)`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
