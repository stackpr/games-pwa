/*
 * Puzzles for Spin Words, and only for Spin Words.
 *
 * The shared library in js/lib/vocab.js is single words with the words you
 * would say while describing them — exactly what Forbidden Words, Star Words
 * and What Am I need, and exactly the wrong shape here: a puzzle board wants
 * something with spaces in it, and nothing wants a list of giveaway hints.
 *
 * So this file sits in the game rather than in js/lib/, which is what keeps
 * these out of the other three games. Adding them to Vocab would have put
 * "Better late than never" on a Forbidden Words card. There is a spec
 * asserting no other game's page loads this file.
 *
 * One string per puzzle, grouped by the category the board shows. Kept to a
 * sixth-grade reading level like the shared library, and free of
 * apostrophes and hyphens — every character on the board is either a letter
 * somebody has to call or a space, with nothing in between to explain.
 */
window.SpinPhrases = (function () {
  const DATA = {
    'Phrase': [
      'Break the ice',
      'Piece of cake',
      'Better late than never',
      'Under the weather',
      'Hit the road',
      'Once in a blue moon',
      'Bite the bullet',
      'Call it a day',
      'Cross your fingers',
      'Down to earth',
      'Easy as pie',
      'Face the music',
      'Get out of hand',
      'Give it a shot',
      'Hang in there',
      'In the same boat',
      'Keep your chin up',
      'Out of the blue',
      'On thin ice',
      'No pain no gain',
      'Back to square one',
      'Beat around the bush',
      'Hit the nail on the head',
      'The ball is in your court'
    ],

    'Saying': [
      'Actions speak louder',
      'All bark and no bite',
      'Look before you leap',
      'Practice makes perfect',
      'Two heads are better',
      'Better safe than sorry',
      'Curiosity killed the cat',
      'Haste makes waste',
      'Home sweet home',
      'Live and learn',
      'Money talks',
      'Never say never',
      'Rome was not built in a day',
      'Seeing is believing',
      'Slow and steady wins',
      'The early bird gets the worm',
      'There is no place like home',
      'When it rains it pours',
      'Time flies',
      'Every cloud has a lining',
      'Do not judge a book by its cover',
      'The grass is always greener'
    ],

    'Place': [
      'Grand Canyon',
      'Times Square',
      'The Great Wall',
      'Niagara Falls',
      'Yellowstone Park',
      'Golden Gate Bridge',
      'Mount Everest',
      'The Amazon River',
      'Central Park',
      'The North Pole',
      'Death Valley',
      'Rocky Mountains',
      'Big Ben',
      'The Sahara Desert',
      'Statue of Liberty',
      'Great Barrier Reef',
      'Machu Picchu',
      'The Eiffel Tower',
      'Mount Rushmore',
      'Pacific Ocean',
      'Old Faithful',
      'Redwood Forest',
      'Victoria Falls',
      'Grand Central Station'
    ],

    'Event': [
      'Family Reunion',
      'Summer Vacation',
      'Birthday Party',
      'Winter Break',
      'Grand Opening',
      'Talent Show',
      'Ribbon Race',
      'Ribbon Cutting',
      'Camping Trip',
      'Road Trip',
      'Fireworks Show',
      'Bake Sale',
      'Block Party',
      'Garage Sale',
      'Snow Day',
      'Movie Night',
      'Class Reunion',
      'Potluck Dinner',
      'County Fair',
      'Parade of Lights',
      'Opening Night',
      'Sleep Over'
    ],

    'Occupation': [
      'Stunt Performer',
      'Glass Blower',
      'School Principal',
      'Fire Fighter',
      'Toy Designer',
      'Dog Walker',
      'Video Game Designer',
      'Puppet Maker',
      'Deep Sea Diver',
      'Pastry Chef',
      'News Reporter',
      'Music Teacher',
      'Zoo Keeper',
      'Kite Builder',
      'Flight Attendant',
      'Software Engineer',
      'Race Car Driver',
      'Large Animal Vet',
      'Ice Sculptor',
      'Storm Chaser',
      'Museum Curator',
      'Camp Counselor'
    ],

    'Thing': [
      'Bowl of Cereal',
      'Cup of Coffee',
      'Warm Blanket',
      'Bowl of Soup',
      'Roll of Tape',
      'Sack of Potatoes',
      'Ice Cream Cone',
      'Bundle of Sticks',
      'Fire Escape',
      'Rocking Chair',
      'Jar of Marbles',
      'Traffic Light',
      'Kitchen Sink',
      'Loaf of Bread',
      'Bar of Soap',
      'Chocolate Chip Cookie',
      'Pile of Laundry',
      'Rain Boots',
      'Water Slide',
      'Front Porch Swing',
      'Box of Crayons',
      'Stack of Pancakes'
    ]
  };

  const CATEGORIES = Object.keys(DATA);

  const POOL = CATEGORIES.reduce((out, category) => {
    for (const text of DATA[category]) out.push({ text, category });
    return out;
  }, []);

  function categories() {
    return CATEGORIES.slice();
  }

  /** Every phrase, as { text, category }. A fresh array each call. */
  function pool() {
    return POOL.map(p => ({ text: p.text, category: p.category }));
  }

  return { categories, pool, COUNT: POOL.length };
})();
