/*
 * Twenty themed sets: a title and the words that belong to it.
 *
 * These are the game's own, not js/lib/vocab.js's. The shared vocabulary is
 * written for the describing games — its categories are broad ("Animals")
 * and its terms carry the words you would say while describing them, which
 * is a different job. Here the theme IS the clue, so it has to be tight
 * enough that "oh, they are all X" is a moment rather than a shrug.
 *
 * Each set wants **more words than any one puzzle uses**. The builder takes
 * six to nine of them and sizes the board to what it took, so a set of
 * sixteen is a different puzzle nearly every time it comes round — which is
 * the whole reason the grid is never predetermined. A set of eight would
 * hand out the same board twice a week.
 *
 * Rules for adding one:
 *   - Four to eleven letters, lower case, letters only. Shorter than four
 *     is noise in a grid; longer than eleven cannot be laid on a small one.
 *   - No two words in a set where one contains the other (`ant` in `plant`),
 *     which makes a found word ambiguous.
 *   - Aim for at least fourteen. Twelve is the floor the spec enforces.
 */
window.SquiggleSets = (function () {
  const SETS = [
    { title: 'In the kitchen', words: [
      'kettle', 'toaster', 'blender', 'spatula', 'colander', 'saucepan',
      'whisk', 'ladle', 'grater', 'skillet', 'oven', 'fridge', 'freezer',
      'cupboard', 'teapot', 'peeler', 'sieve', 'tongs'] },
    { title: 'Weather report', words: [
      'thunder', 'drizzle', 'blizzard', 'sunshine', 'lightning', 'hailstone',
      'rainbow', 'humid', 'breeze', 'frost', 'downpour', 'overcast',
      'cyclone', 'monsoon', 'flurry', 'sleet', 'gale'] },
    { title: 'Playing an instrument', words: [
      'trumpet', 'clarinet', 'piano', 'violin', 'drums', 'guitar', 'flute',
      'cello', 'harp', 'banjo', 'trombone', 'ukulele', 'oboe', 'bassoon',
      'keyboard', 'tambourine'] },
    { title: 'Creatures of the sea', words: [
      'dolphin', 'octopus', 'jellyfish', 'starfish', 'seahorse', 'lobster',
      'urchin', 'stingray', 'walrus', 'barnacle', 'plankton', 'eel',
      'manatee', 'narwhal', 'oyster', 'coral', 'shrimp'] },
    { title: 'Getting around town', words: [
      'bicycle', 'scooter', 'tram', 'subway', 'taxi', 'ferry', 'skateboard',
      'monorail', 'rickshaw', 'trolley', 'gondola', 'moped', 'shuttle',
      'carriage', 'cablecar', 'sidewalk'] },
    { title: 'Things with wings', words: [
      'sparrow', 'dragonfly', 'pelican', 'ladybird', 'airplane', 'glider',
      'falcon', 'moth', 'heron', 'beetle', 'seagull', 'hornet', 'penguin',
      'ostrich', 'condor', 'bumblebee'] },
    { title: 'At the campsite', words: [
      'tent', 'lantern', 'campfire', 'sleeping', 'compass', 'canteen',
      'hammock', 'kindling', 'backpack', 'trail', 'marshmallow', 'flask',
      'canoe', 'firewood', 'thermos', 'binoculars'] },
    { title: 'Words for happy', words: [
      'cheerful', 'delighted', 'joyful', 'thrilled', 'content', 'elated',
      'merry', 'gleeful', 'upbeat', 'jolly', 'radiant', 'sunny',
      'pleased', 'buoyant', 'chipper', 'blissful'] },
    { title: 'Breakfast table', words: [
      'pancake', 'omelette', 'porridge', 'toast', 'bacon', 'cereal',
      'yogurt', 'muffin', 'waffle', 'bagel', 'grapefruit', 'sausage',
      'marmalade', 'oatmeal', 'crumpet', 'kipper'] },
    { title: 'Under the ground', words: [
      'tunnel', 'burrow', 'cavern', 'roots', 'bunker', 'fossil', 'mineshaft',
      'catacomb', 'pipeline', 'earthworm', 'magma', 'aquifer', 'cellar',
      'grotto', 'sinkhole', 'badger'] },
    { title: 'A game of cards', words: [
      'shuffle', 'diamond', 'spades', 'clubs', 'hearts', 'joker', 'trump',
      'dealer', 'wager', 'bluff', 'discard', 'trick', 'ante', 'flush',
      'suits', 'kitty'] },
    { title: 'Building a house', words: [
      'hammer', 'chisel', 'plaster', 'scaffold', 'rafter', 'mortar',
      'trowel', 'shingle', 'timber', 'girder', 'concrete', 'blueprint',
      'foundation', 'brickwork', 'plumbing', 'gutter'] },
    { title: 'Ways of walking', words: [
      'stroll', 'amble', 'saunter', 'trudge', 'stride', 'shuffle', 'march',
      'wander', 'stagger', 'tiptoe', 'plod', 'hike', 'strut', 'scamper',
      'meander', 'traipse'] },
    { title: 'Space and stars', words: [
      'planet', 'comet', 'asteroid', 'galaxy', 'nebula', 'orbit', 'eclipse',
      'meteor', 'crater', 'satellite', 'telescope', 'gravity', 'rocket',
      'astronaut', 'cosmos', 'lunar'] },
    { title: 'On a farm', words: [
      'tractor', 'barn', 'harvest', 'meadow', 'pasture', 'silo', 'plough',
      'scarecrow', 'orchard', 'haystack', 'trough', 'paddock', 'livestock',
      'furrow', 'stable', 'granary'] },
    { title: 'Fabrics and cloth', words: [
      'cotton', 'velvet', 'linen', 'denim', 'satin', 'flannel', 'corduroy',
      'tweed', 'chiffon', 'burlap', 'cashmere', 'muslin', 'taffeta',
      'canvas', 'suede', 'lace'] },
    { title: 'Sweet things', words: [
      'caramel', 'toffee', 'liquorice', 'nougat', 'praline', 'fudge',
      'meringue', 'sherbet', 'marzipan', 'butterscotch', 'truffle',
      'lollipop', 'brittle', 'gumdrop', 'custard', 'syrup'] },
    { title: 'Feeling sleepy', words: [
      'drowsy', 'yawning', 'pillow', 'blanket', 'slumber', 'snooze',
      'dreaming', 'nightcap', 'weary', 'bedtime', 'nodding', 'mattress',
      'lullaby', 'quilt', 'nap', 'doze'] },
    { title: 'Rivers and lakes', words: [
      'current', 'rapids', 'estuary', 'delta', 'tributary', 'waterfall',
      'riverbed', 'marsh', 'lagoon', 'reservoir', 'meander', 'shallows',
      'pebble', 'reeds', 'bank', 'ripple'] },
    { title: 'Tools in the shed', words: [
      'wrench', 'pliers', 'screwdriver', 'sandpaper', 'clamp', 'mallet',
      'crowbar', 'hacksaw', 'drill', 'ratchet', 'vice', 'file', 'level',
      'anvil', 'awl', 'rasp'] }
  ];

  /** Sets whose words are usable, in a stable order. */
  function all() {
    return SETS.map(set => ({
      title: set.title,
      words: set.words.filter(w => /^[a-z]{4,11}$/.test(w))
    })).filter(set => set.words.length >= 12);
  }

  return { all, count: () => SETS.length };
})();
