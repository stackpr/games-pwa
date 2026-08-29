/*
 * Twenty themed sets: a title and the words that belong to it.
 *
 * These are the game's own, not js/lib/vocab.js's. The shared vocabulary is
 * written for the describing games — its categories are broad ("Animals")
 * and its terms carry the words you would say while describing them, which
 * is a different job. Here the theme IS the clue, so it has to be tight
 * enough that "oh, they are all X" is a moment rather than a shrug.
 *
 * Each set wants **far more words than any one puzzle uses**. The builder
 * takes six to nine and sizes the board to what it took, so the pool is what
 * decides whether a theme is worth meeting again. These run to thirty-odd
 * apiece, which puts the chance of two puzzles drawing the same words at
 * roughly nil — a set of eight would deal the same board twice a week.
 *
 * Rules for adding one:
 *   - Four to eleven letters, lower case, letters only. Shorter than four
 *     is noise in a grid; longer than eleven cannot be laid on a small one.
 *   - No two words in a set where one contains the other (`ant` in `plant`),
 *     which makes a found word ambiguous.
 *   - Aim for thirty. Twenty is the floor the spec enforces.
 */
window.SquiggleSets = (function () {
  const SETS = [
    { title: 'In the kitchen', words: [
      'kettle', 'toaster', 'blender', 'spatula', 'colander', 'saucepan',
      'whisk', 'ladle', 'grater', 'skillet', 'oven', 'fridge', 'freezer',
      'cupboard', 'teapot', 'peeler', 'sieve', 'tongs', 'apron', 'cutlery',
      'dishcloth', 'griddle', 'mixer', 'napkin', 'pantry', 'platter',
      'ramekin', 'saucer', 'scales', 'stove', 'timer', 'trivet', 'tureen',
      'utensil', 'strainer', 'crockery', 'chopping', 'whistle'] },

    { title: 'Weather report', words: [
      'thunder', 'drizzle', 'blizzard', 'sunshine', 'lightning', 'hailstone',
      'rainbow', 'humid', 'breeze', 'frost', 'downpour', 'overcast',
      'cyclone', 'monsoon', 'flurry', 'sleet', 'gale', 'muggy', 'squall',
      'tempest', 'twister', 'typhoon', 'drought', 'puddle', 'shower',
      'sunburn', 'thaw', 'windchill', 'forecast', 'barometer',
      'icicle', 'mist', 'sultry', 'balmy', 'gusty'] },

    { title: 'Playing an instrument', words: [
      'trumpet', 'clarinet', 'piano', 'violin', 'drums', 'guitar', 'flute',
      'cello', 'harp', 'banjo', 'trombone', 'ukulele', 'oboe', 'bassoon',
      'keyboard', 'tambourine', 'accordion', 'bagpipes', 'bugle', 'cymbal',
      'fiddle', 'harmonica', 'kazoo', 'mandolin', 'maracas', 'panpipes',
      'organ', 'piccolo', 'recorder', 'saxophone', 'sitar', 'triangle',
      'tuba', 'viola', 'xylophone', 'zither'] },

    { title: 'Creatures of the sea', words: [
      'dolphin', 'octopus', 'jellyfish', 'starfish', 'seahorse', 'lobster',
      'urchin', 'stingray', 'walrus', 'barnacle', 'plankton', 'manatee',
      'narwhal', 'oyster', 'coral', 'shrimp', 'anemone', 'anchovy',
      'clam', 'cuttlefish', 'dugong', 'grouper', 'haddock', 'halibut',
      'herring', 'krill', 'mackerel', 'mussel', 'nautilus', 'porpoise',
      'sardine', 'scallop', 'seaweed', 'sponge', 'squid', 'swordfish',
      'tuna', 'turtle'] },

    { title: 'Getting around town', words: [
      'bicycle', 'scooter', 'tram', 'subway', 'taxi', 'ferry', 'skateboard',
      'monorail', 'rickshaw', 'trolley', 'gondola', 'moped', 'shuttle',
      'carriage', 'cablecar', 'sidewalk', 'crossing', 'commute', 'minibus',
      'timetable', 'terminal', 'platform', 'turnstile', 'roundabout',
      'junction', 'underpass', 'flyover', 'kerb', 'lamppost', 'layby',
      'parking', 'pavement', 'traffic', 'tunnel'] },

    { title: 'Things with wings', words: [
      'sparrow', 'dragonfly', 'pelican', 'ladybird', 'airplane', 'glider',
      'falcon', 'moth', 'heron', 'beetle', 'seagull', 'hornet', 'penguin',
      'ostrich', 'condor', 'bumblebee', 'albatross', 'buzzard', 'cormorant',
      'cuckoo', 'eagle', 'flamingo', 'goose', 'hummingbird', 'kestrel',
      'kingfisher', 'lapwing', 'magpie', 'osprey', 'parrot', 'pheasant',
      'puffin', 'raven', 'starling', 'swallow', 'vulture', 'wasp', 'wren'] },

    { title: 'At the campsite', words: [
      'tent', 'lantern', 'campfire', 'compass', 'canteen', 'hammock',
      'kindling', 'backpack', 'trail', 'marshmallow', 'flask', 'canoe',
      'firewood', 'thermos', 'binoculars', 'bedroll', 'billycan', 'bracken',
      'clearing', 'embers', 'groundsheet', 'guyrope', 'kayak', 'mallet',
      'mosquito', 'paddle', 'pitching', 'rucksack', 'skewer', 'stargazing',
      'tinder', 'torch', 'whittle', 'woodsmoke'] },

    { title: 'Words for happy', words: [
      'cheerful', 'delighted', 'joyful', 'thrilled', 'content', 'elated',
      'merry', 'gleeful', 'upbeat', 'jolly', 'radiant', 'sunny',
      'pleased', 'buoyant', 'chipper', 'blissful', 'beaming', 'bright',
      'chuffed', 'ecstatic', 'exultant', 'glad', 'grinning', 'jovial',
      'jubilant', 'carefree', 'overjoyed', 'perky', 'rapturous',
      'satisfied', 'tickled', 'uplifted'] },

    { title: 'Breakfast table', words: [
      'pancake', 'omelette', 'porridge', 'toast', 'bacon', 'cereal',
      'yogurt', 'muffin', 'waffle', 'bagel', 'grapefruit', 'sausage',
      'marmalade', 'oatmeal', 'crumpet', 'kipper', 'brioche', 'butter',
      'coffee', 'compote', 'croissant', 'granola', 'griddlecake', 'honey',
      'juice', 'kedgeree', 'muesli', 'pastry', 'poached', 'scramble',
      'smoothie', 'teacup'] },

    { title: 'Under the ground', words: [
      'tunnel', 'burrow', 'cavern', 'roots', 'bunker', 'fossil', 'mineshaft',
      'catacomb', 'pipeline', 'earthworm', 'magma', 'aquifer', 'cellar',
      'grotto', 'sinkhole', 'badger', 'bedrock', 'boreholes', 'crypt',
      'dungeon', 'foundation', 'gopher', 'mole', 'sediment', 'seam',
      'stalactite', 'subway', 'termite', 'topsoil', 'trench', 'truffle',
      'vault', 'warren'] },

    { title: 'A game of cards', words: [
      'shuffle', 'diamond', 'spades', 'clubs', 'hearts', 'joker', 'trump',
      'dealer', 'wager', 'bluff', 'discard', 'trick', 'ante', 'flush',
      'suits', 'kitty', 'blackjack', 'cribbage', 'cutting', 'deuce',
      'facedown', 'gambit', 'knave', 'melds', 'patience', 'pontoon',
      'rummy', 'sequence', 'solitaire', 'stacked', 'straight', 'wildcard'] },

    { title: 'Building a house', words: [
      'hammer', 'chisel', 'plaster', 'scaffold', 'rafter', 'mortar',
      'trowel', 'shingle', 'timber', 'girder', 'concrete', 'blueprint',
      'foundation', 'brickwork', 'plumbing', 'gutter', 'architect', 'beam',
      'cladding', 'cornice', 'drywall', 'eaves', 'insulation', 'joist',
      'lintel', 'masonry', 'panelling', 'rendering', 'skirting', 'stucco',
      'threshold', 'underlay'] },

    { title: 'Ways of walking', words: [
      'stroll', 'saunter', 'trudge', 'stride', 'march',
      'wander', 'stagger', 'tiptoe', 'plod', 'hike', 'strut', 'scamper',
      'meander', 'traipse', 'clomp', 'dawdle', 'hobble', 'limp', 'lollop',
      'lumber', 'mosey', 'pace', 'parade', 'prowl', 'ramble', 'scuttle',
      'shamble', 'stalk', 'stomp', 'totter', 'waddle'] },

    { title: 'Space and stars', words: [
      'planet', 'comet', 'asteroid', 'galaxy', 'nebula', 'orbit', 'eclipse',
      'meteor', 'crater', 'satellite', 'telescope', 'gravity', 'rocket',
      'astronaut', 'cosmos', 'lunar', 'aurora', 'blackhole', 'stardust',
      'cosmonaut', 'equinox', 'gantry', 'launchpad', 'lightyear', 'module',
      'moonrise', 'observatory', 'quasar', 'solstice', 'spacesuit',
      'starlight', 'supernova', 'telemetry', 'universe'] },

    { title: 'On a farm', words: [
      'tractor', 'barn', 'harvest', 'meadow', 'pasture', 'silo', 'plough',
      'scarecrow', 'orchard', 'haystack', 'trough', 'paddock', 'livestock',
      'furrow', 'stable', 'granary', 'baler', 'bushel', 'combine', 'dairy',
      'fodder', 'gatepost', 'harrow', 'henhouse', 'irrigation', 'manure',
      'milking', 'pitchfork', 'poultry', 'shearing', 'thresher', 'windmill'] },

    { title: 'Fabrics and cloth', words: [
      'cotton', 'velvet', 'linen', 'denim', 'satin', 'flannel', 'corduroy',
      'tweed', 'chiffon', 'burlap', 'cashmere', 'muslin', 'taffeta',
      'canvas', 'suede', 'lace', 'brocade', 'calico', 'chambray', 'damask',
      'fleece', 'gabardine', 'gingham', 'hessian', 'jersey', 'moleskin',
      'organza', 'poplin', 'seersucker', 'silk', 'tartan', 'velour'] },

    { title: 'Sweet things', words: [
      'caramel', 'toffee', 'liquorice', 'nougat', 'praline', 'fudge',
      'meringue', 'sherbet', 'marzipan', 'truffle', 'lollipop', 'brittle',
      'gumdrop', 'custard', 'syrup', 'bonbon', 'buttercream', 'candyfloss',
      'chocolate', 'divinity', 'eclair', 'fondant', 'ganache', 'humbug',
      'jellybean', 'macaroon', 'marshmallow', 'parfait', 'peppermint',
      'shortbread', 'sorbet', 'treacle'] },

    { title: 'Feeling sleepy', words: [
      'drowsy', 'yawning', 'pillow', 'blanket', 'slumber', 'snooze',
      'dreaming', 'nightcap', 'weary', 'bedtime', 'nodding', 'mattress',
      'lullaby', 'quilt', 'doze', 'bedside', 'bolster', 'coverlet',
      'dozy', 'duvet', 'eiderdown', 'hibernate', 'insomnia', 'listless',
      'nightgown', 'pyjamas', 'restful', 'sandman', 'siesta', 'sluggish',
      'snoring', 'tired'] },

    { title: 'Rivers and lakes', words: [
      'current', 'rapids', 'estuary', 'delta', 'tributary', 'waterfall',
      'riverbed', 'marsh', 'lagoon', 'reservoir', 'shallows', 'pebble',
      'reeds', 'bank', 'ripple', 'backwater', 'brook', 'cascade',
      'channel', 'creek', 'ferryman', 'floodplain', 'ford', 'gorge',
      'headwater', 'inlet', 'meander', 'millpond', 'oxbow', 'rowboat',
      'sandbar', 'sluice', 'stream', 'undertow', 'weir', 'wetland'] },

    { title: 'Tools in the shed', words: [
      'wrench', 'pliers', 'screwdriver', 'sandpaper', 'clamp', 'mallet',
      'crowbar', 'hacksaw', 'drill', 'ratchet', 'vice', 'file', 'level',
      'anvil', 'rasp', 'bradawl', 'caliper', 'chisel', 'dibber', 'gouge',
      'grinder', 'hammer', 'jigsaw', 'plane', 'pruners', 'punch', 'scythe',
      'shears', 'sledge', 'spanner', 'trowel', 'workbench'] }
  ];

  /** Sets whose words are usable, in a stable order. */
  function all() {
    return SETS.map(set => ({
      title: set.title,
      words: set.words.filter(w => /^[a-z]{4,11}$/.test(w))
    })).filter(set => set.words.length >= 20);
  }

  return { all, count: () => SETS.length };
})();
