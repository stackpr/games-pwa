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
 *
 * WHAT MAY GO IN HERE. Titles are not copyrightable — 37 CFR 202.1(a)
 * excludes names, titles and short phrases — so a title is safe content and
 * a lyric is not. The line this file holds is deliberately further back
 * than the law requires:
 *
 *   - Song and rhyme titles are traditional or public domain, so there is
 *     no live rightsholder even for the work behind the title.
 *   - No lyrics, no quotations, no verse.
 *   - No brands, franchises, characters or film and television titles.
 *     That is a trademark question rather than a copyright one, and it is
 *     the one that actually bites — 'Simon Says' and 'Leap Frog' were both
 *     dropped from Fun and Games over toy brands that share the name.
 *   - Before and After, Rhyme Time and Same Letter are written here rather
 *     than collected from anywhere.
 *
 * Anything that fails those, leave out and raise it. See CLAUDE.md on
 * naming; the same caution applies to what the game puts on the board.
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
    ],

    /*
     * Two phrases sharing a pivot word, read straight through: "ice cream
     * sandwich" plus "sandwich bag". Written here rather than collected —
     * the pivot has to carry both halves, which is why so few of these are
     * any good and why the list is shorter than it looks like it should be.
     */
    'Before and After': [
      'Ice Cream Sandwich Bag',
      'Peanut Butter Fingers',
      'Birthday Cake Walk',
      'Chocolate Chip Shot',
      'Cold Shoulder Bag',
      'Full Moon Walk',
      'Home Run Away',
      'Rain Check Mark',
      'Snow Ball Game',
      'Fire Drill Team',
      'Green Thumb Print',
      'Hot Dog House',
      'Night Light Bulb',
      'Paper Clip Board',
      'Pocket Watch Dog',
      'Sea Shell Game',
      'Sun Flower Pot',
      'Time Out Field',
      'Fish Bowl Game',
      'Book Worm Hole',
      'Card Board Game',
      'Corn Bread Crumbs',
      'Down Town Hall',
      'Foot Ball Field'
    ],

    'Rhyme Time': [
      'Double Trouble',
      'Super Duper',
      'Wear and Tear',
      'Wild Child',
      'Fair Share',
      'Prime Time',
      'Hustle and Bustle',
      'Name Game',
      'Snail Mail',
      'Brain Drain',
      'Chalk Talk',
      'Dream Team',
      'Fender Bender',
      'Hocus Pocus',
      'Legal Eagle',
      'Mumbo Jumbo',
      'Nitty Gritty',
      'Razzle Dazzle',
      'Roly Poly',
      'Silly Billy',
      'Stranger Danger',
      'Wheel and Deal',
      'Meet and Greet',
      'Wine and Dine'
    ],

    'Same Letter': [
      'Big Blue Balloon',
      'Sunny Summer Sunday',
      'Purple Painted Pony',
      'Cool Calm Collected',
      'Silver Silk Scarf',
      'Merry Marching Music',
      'Tiny Tin Trumpet',
      'Wild Winter Wind',
      'Bright Blue Bicycle',
      'Crispy Crunchy Crackers',
      'Gentle Green Grass',
      'Lazy Lions Lounging',
      'Perfectly Pink Peonies',
      'Salty Sea Spray',
      'Tall Trees Towering',
      'Brave Brown Bear',
      'Curious Cats Climbing',
      'Six Silly Sailors',
      'Handsome Happy Horses',
      'Wooden Wagon Wheels'
    ],

    'Food and Drink': [
      'Grilled Cheese Sandwich',
      'Hot Apple Cider',
      'Scrambled Eggs and Toast',
      'Chicken Noodle Soup',
      'Mashed Potatoes and Gravy',
      'Fresh Squeezed Lemonade',
      'Corn on the Cob',
      'Peanut Butter and Jelly',
      'Strawberry Milkshake',
      'Baked Potato',
      'Iced Tea with Lemon',
      'Blueberry Pancakes',
      'Garden Salad',
      'Vanilla Ice Cream',
      'Root Beer Float',
      'Cinnamon Toast',
      'Homemade Soup',
      'Buttered Popcorn',
      'Warm Apple Pie',
      'Cheese and Crackers',
      'Orange Juice',
      'Pot Roast Dinner'
    ],

    'What Are You Doing': [
      'Walking the Dog',
      'Raking the Leaves',
      'Washing the Dishes',
      'Reading a Good Book',
      'Riding a Bicycle',
      'Building a Snowman',
      'Making the Bed',
      'Watering the Garden',
      'Baking Cookies',
      'Folding the Laundry',
      'Climbing a Tree',
      'Painting the Fence',
      'Feeding the Ducks',
      'Packing a Suitcase',
      'Sweeping the Porch',
      'Counting the Stars',
      'Taking a Long Nap',
      'Learning to Swim',
      'Setting the Table',
      'Wrapping a Present',
      'Shoveling the Driveway',
      'Chasing Fireflies'
    ],

    'Fun and Games': [
      'Kick the Can',
      'Musical Chairs',
      'Wheelbarrow Race',
      'Duck Duck Goose',
      'Red Light Green Light',
      'Freeze Tag',
      'Double Dutch',
      'Four Square',
      'Capture the Flag',
      'Three Legged Race',
      'Egg and Spoon Race',
      'Sack Race',
      'Charades',
      'Card Tricks',
      'Water Balloon Toss',
      'Follow the Leader',
      'Twenty Questions',
      'Scavenger Hunt',
      'Obstacle Course',
      'Marco Polo',
      'Rock Paper Scissors',
      'Blind Mans Bluff'
    ],

    /*
     * Traditional and public domain only — see the note at the top. Titles
     * are not copyrightable in the first place, but a folk song has no live
     * rightsholder behind the title either, which takes the question off
     * the table rather than answering it.
     */
    'Song Title': [
      'Amazing Grace',
      'Auld Lang Syne',
      'Home on the Range',
      'Take Me Out to the Ball Game',
      'When the Saints Go Marching In',
      'You Are My Sunshine',
      'Oh Susanna',
      'Camptown Races',
      'Yankee Doodle',
      'Silent Night',
      'Jingle Bells',
      'Danny Boy',
      'Oh My Darling Clementine',
      'Down by the Riverside',
      'Swing Low Sweet Chariot',
      'Scarborough Fair',
      'Simple Gifts',
      'The Yellow Rose of Texas',
      'Sweet Betsy from Pike',
      'Turkey in the Straw',
      'Shenandoah',
      'Greensleeves',
      'The Erie Canal',
      'Beautiful Dreamer'
    ],

    'Nursery Rhyme': [
      'Humpty Dumpty',
      'Jack and Jill',
      'Little Bo Peep',
      'Hey Diddle Diddle',
      'Hickory Dickory Dock',
      'Mary Had a Little Lamb',
      'Old Mother Hubbard',
      'Little Jack Horner',
      'The Muffin Man',
      'Three Blind Mice',
      'Rub a Dub Dub',
      'Pat a Cake',
      'Little Miss Muffet',
      'Old King Cole',
      'Wee Willie Winkie',
      'This Little Piggy',
      'Rock a Bye Baby',
      'The Grand Old Duke of York',
      'Sing a Song of Sixpence',
      'Baa Baa Black Sheep',
      'Twinkle Twinkle Little Star',
      'Row Row Row Your Boat',
      'The Wheels on the Bus',
      'This Old Man'
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
