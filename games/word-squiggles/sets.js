/*
 * A hundred and twenty themed sets: a title and the words that belong to it.
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
 *   - A title nobody already has, and a theme that does not overlap one —
 *     two sets drawing the same words are one set that repeats itself.
 *
 * All four rules are mechanical, and checking a hundred of them by eye is
 * how `bin`, `masthood` and a duplicate `ode` got as far as they did. Write
 * new ones somewhere a script can read, run the rules over the lot, then
 * paste the survivors in.
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
      'shears', 'sledge', 'spanner', 'trowel', 'workbench'] },

    { title: 'Fruit bowl', words: [
      'apricot', 'banana', 'cherry', 'damson', 'grape', 'lemon', 'mango',
      'nectarine', 'orange', 'papaya', 'peach', 'pear', 'plum', 'quince',
      'raisin', 'cranberry', 'rhubarb', 'satsuma', 'tangerine', 'apple',
      'guava', 'lychee', 'melon', 'raspberry', 'date', 'kiwi',
      'pomegranate', 'coconut', 'avocado', 'olive'] },

    { title: 'Vegetable patch', words: [
      'asparagus', 'aubergine', 'beetroot', 'broccoli', 'cabbage', 'carrot',
      'cauliflower', 'celery', 'courgette', 'cucumber', 'leek', 'lettuce',
      'marrow', 'onion', 'parsnip', 'potato', 'pumpkin', 'radish',
      'shallot', 'spinach', 'swede', 'sweetcorn', 'turnip', 'artichoke',
      'chicory', 'endive', 'fennel', 'kale', 'okra', 'pepper'] },

    { title: 'Trees', words: [
      'alder', 'aspen', 'beech', 'birch', 'cedar', 'cypress', 'elder',
      'hazel', 'hawthorn', 'hickory', 'holly', 'juniper', 'larch', 'maple',
      'poplar', 'rowan', 'sequoia', 'spruce', 'sycamore', 'walnut',
      'willow', 'chestnut', 'cottonwood', 'eucalyptus', 'magnolia',
      'mahogany', 'mulberry', 'redwood', 'teak', 'laburnum'] },

    { title: 'Flowers', words: [
      'anemone', 'aster', 'bluebell', 'buttercup', 'carnation', 'clematis',
      'crocus', 'daffodil', 'dahlia', 'daisy', 'foxglove', 'freesia',
      'geranium', 'hyacinth', 'iris', 'jasmine', 'lavender', 'lilac',
      'lily', 'lupin', 'marigold', 'orchid', 'pansy', 'peony', 'petunia',
      'poppy', 'snowdrop', 'sunflower', 'tulip', 'violet'] },

    { title: 'Wild animals', words: [
      'antelope', 'badger', 'bison', 'buffalo', 'cheetah', 'cougar',
      'coyote', 'elephant', 'gazelle', 'gibbon', 'gorilla', 'hyena',
      'jackal', 'jaguar', 'leopard', 'lemur', 'lynx', 'meerkat', 'mongoose',
      'otter', 'panther', 'porcupine', 'rhinoceros', 'wildebeest',
      'wolverine', 'zebra', 'bobcat', 'caribou', 'gopher', 'marmot'] },

    { title: 'Dogs', words: [
      'alsatian', 'beagle', 'bloodhound', 'boxer', 'bulldog', 'collie',
      'corgi', 'dachshund', 'dalmatian', 'doberman', 'greyhound', 'harrier',
      'husky', 'labrador', 'malamute', 'mastiff', 'pointer', 'poodle',
      'foxhound', 'retriever', 'rottweiler', 'saluki', 'samoyed',
      'schnauzer', 'setter', 'sheepdog', 'spaniel', 'terrier', 'whippet',
      'wolfhound'] },

    { title: 'Garden birds', words: [
      'blackbird', 'bullfinch', 'chaffinch', 'chiffchaff', 'dunnock',
      'fieldfare', 'goldcrest', 'goldfinch', 'greenfinch', 'jackdaw',
      'linnet', 'nightingale', 'nuthatch', 'pigeon', 'redwing', 'robin',
      'siskin', 'skylark', 'sparrowhawk', 'starling', 'swift', 'thrush',
      'blackcap', 'treecreeper', 'wagtail', 'warbler', 'waxwing',
      'woodpecker', 'wren', 'bluetit'] },

    { title: 'Creepy crawlies', words: [
      'aphid', 'beetle', 'caterpillar', 'centipede', 'cicada', 'cockroach',
      'cricket', 'earwig', 'firefly', 'grasshopper', 'hoverfly', 'ladybug',
      'locust', 'maggot', 'mantis', 'mayfly', 'midge', 'millipede',
      'mosquito', 'silverfish', 'slug', 'snail', 'spider', 'tarantula',
      'termite', 'tick', 'weevil', 'woodlouse', 'worm'] },

    { title: 'Freshwater fish', words: [
      'barbel', 'bream', 'carp', 'chub', 'dace', 'grayling', 'gudgeon',
      'minnow', 'perch', 'pike', 'roach', 'rudd', 'salmon', 'sturgeon',
      'tench', 'trout', 'catfish', 'goldfish', 'guppy', 'lamprey', 'loach',
      'mullet', 'piranha', 'bullhead', 'sunfish', 'tetra', 'walleye',
      'whitefish', 'stickleback'] },

    { title: 'Reptiles and amphibians', words: [
      'adder', 'alligator', 'anaconda', 'sidewinder', 'bullfrog',
      'chameleon', 'cobra', 'crocodile', 'gecko', 'iguana', 'lizard',
      'mamba', 'monitor', 'newt', 'python', 'rattlesnake', 'salamander',
      'skink', 'slowworm', 'terrapin', 'toad', 'tortoise', 'viper',
      'axolotl', 'caiman', 'gharial', 'komodo', 'tuatara', 'treefrog'] },

    { title: 'The human body', words: [
      'ankle', 'artery', 'collarbone', 'eardrum', 'elbow', 'eyebrow',
      'eyelash', 'femur', 'fingernail', 'forearm', 'forehead', 'heart',
      'kidney', 'knuckle', 'liver', 'lungs', 'muscle', 'nostril',
      'pancreas', 'ribcage', 'shoulder', 'skeleton', 'spleen', 'stomach',
      'tendon', 'thumb', 'tongue', 'vertebra', 'windpipe', 'wrist'] },

    { title: 'Getting dressed', words: [
      'anorak', 'blazer', 'blouse', 'cardigan', 'dungarees', 'fleece',
      'gilet', 'jacket', 'jumper', 'kimono', 'leggings', 'overalls',
      'pinafore', 'poncho', 'pullover', 'pyjamas', 'raincoat', 'sarong',
      'shawl', 'shirt', 'shorts', 'skirt', 'sweater', 'trousers', 'tunic',
      'waistcoat', 'cloak', 'gown', 'jeans', 'smock'] },

    { title: 'On your feet', words: [
      'ballet', 'boots', 'brogues', 'clogs', 'espadrille', 'flipflop',
      'galoshes', 'loafers', 'moccasin', 'plimsoll', 'sandal', 'slipper',
      'sneaker', 'stiletto', 'trainer', 'wellington', 'anklet', 'mules',
      'buckle', 'heel', 'overshoe', 'lace', 'sock', 'stocking', 'tights',
      'toecap', 'sole', 'wedge', 'instep'] },

    { title: 'Hats and headwear', words: [
      'balaclava', 'bandana', 'beanie', 'beret', 'bonnet', 'bowler',
      'cloche', 'coronet', 'crown', 'deerstalker', 'earmuffs', 'fedora',
      'nightcap', 'hairband', 'headscarf', 'helmet', 'hijab', 'hood',
      'panama', 'sombrero', 'stetson', 'sunhat', 'tiara', 'topper',
      'trilby', 'turban', 'veil', 'visor', 'wreath', 'skullcap'] },

    { title: 'Jewellery box', words: [
      'amber', 'amethyst', 'anklet', 'bangle', 'bracelet', 'brooch',
      'cameo', 'charm', 'choker', 'diamond', 'emerald', 'garnet', 'locket',
      'necklace', 'opal', 'pearl', 'pendant', 'platinum', 'ruby',
      'sapphire', 'signet', 'silver', 'tiepin', 'topaz', 'turquoise',
      'bead', 'cufflink', 'diadem', 'earring', 'jade'] },

    { title: 'Colours', words: [
      'amber', 'apricot', 'auburn', 'azure', 'beige', 'burgundy',
      'charcoal', 'chestnut', 'cobalt', 'crimson', 'cyan', 'ebony',
      'emerald', 'fuchsia', 'indigo', 'ivory', 'khaki', 'lavender', 'lilac',
      'magenta', 'maroon', 'mauve', 'ochre', 'olive', 'plum', 'russet',
      'saffron', 'scarlet', 'turquoise', 'violet'] },

    { title: 'Shapes', words: [
      'circle', 'cone', 'crescent', 'cube', 'cylinder', 'decagon',
      'diamond', 'ellipse', 'heptagon', 'hexagon', 'kite', 'nonagon',
      'oblong', 'octagon', 'oval', 'polygon', 'pentagon', 'prism',
      'pyramid', 'quadrant', 'rectangle', 'rhombus', 'chevron', 'sphere',
      'spiral', 'square', 'trapezium', 'triangle', 'wedge', 'helix'] },

    { title: 'Counting', words: [
      'billion', 'couple', 'dozen', 'eight', 'nought', 'eleven', 'fifteen',
      'fifty', 'forty', 'fourteen', 'hundred', 'million', 'nineteen',
      'ninety', 'quartet', 'seventeen', 'seventy', 'sixteen', 'sixty',
      'thirteen', 'thirty', 'thousand', 'three', 'trillion', 'twelve',
      'twenty', 'twice', 'quintet', 'septet', 'myriad'] },

    { title: 'Furniture', words: [
      'armchair', 'bookcase', 'bureau', 'cabinet', 'chaise', 'chest',
      'commode', 'couch', 'cupboard', 'desk', 'dresser', 'drawers', 'divan',
      'hammock', 'highchair', 'lectern', 'lounger', 'ottoman', 'pouffe',
      'recliner', 'settee', 'shelves', 'sideboard', 'sofa', 'stool',
      'table', 'trolley', 'wardrobe', 'workbench', 'bunk'] },

    { title: 'In the bathroom', words: [
      'bathmat', 'bathrobe', 'bathtub', 'bidet', 'cistern', 'cologne',
      'conditioner', 'cotton', 'flannel', 'loofah', 'mirror', 'mouthwash',
      'plughole', 'plunger', 'razor', 'shampoo', 'shaver', 'shower', 'soap',
      'sponge', 'nailbrush', 'toothbrush', 'toothpaste', 'towel',
      'tweezers', 'washbasin', 'washcloth', 'cabinet', 'drain', 'scales'] },

    { title: 'In the bedroom', words: [
      'alarm', 'blanket', 'bolster', 'bunkbed', 'candle', 'ceiling',
      'closet', 'coathanger', 'comforter', 'curtain', 'cushion', 'dresser',
      'duvet', 'eiderdown', 'headboard', 'lamp', 'mattress', 'mirror',
      'nightstand', 'pillow', 'bedstead', 'quilt', 'nightgown', 'sheet',
      'slippers', 'wardrobe', 'bedspread', 'bedside', 'bookshelf',
      'radiator'] },

    { title: 'Herbs and spices', words: [
      'basil', 'borage', 'caraway', 'cardamom', 'chervil', 'chilli',
      'chives', 'cinnamon', 'clove', 'coriander', 'cumin', 'dill',
      'fenugreek', 'ginger', 'juniper', 'lovage', 'mace', 'marjoram',
      'nutmeg', 'oregano', 'paprika', 'parsley', 'rosemary', 'saffron',
      'sage', 'sorrel', 'tarragon', 'thyme', 'turmeric', 'vanilla'] },

    { title: 'Cleaning up', words: [
      'bleach', 'broom', 'brush', 'bucket', 'detergent', 'duster',
      'dustpan', 'hoover', 'mopping', 'polish', 'rinsing', 'scouring',
      'scrubbing', 'sponge', 'sweeping', 'vacuum', 'washing', 'wiping',
      'cobweb', 'disinfect', 'dustbin', 'grime', 'lather', 'rubbish',
      'scrubber', 'spotless', 'suds', 'tidying', 'hygiene', 'sanitise'] },

    { title: 'Laundry day', words: [
      'airer', 'basket', 'bleach', 'clothesline', 'crease', 'detergent',
      'dryer', 'fabric', 'fold', 'hanger', 'ironing', 'linen', 'mangle',
      'hamper', 'pressing', 'rinse', 'softener', 'whites', 'stain',
      'starch', 'steam', 'tumble', 'washer', 'washing', 'wringer',
      'wrinkle', 'clothespin', 'laundry', 'lint', 'soak'] },

    { title: 'At sea', words: [
      'anchor', 'beacon', 'breakers', 'buoy', 'captain', 'compass',
      'current', 'dinghy', 'fathom', 'flotilla', 'galley', 'harbour',
      'hull', 'jetty', 'keel', 'lighthouse', 'mainsail', 'mast', 'navigate',
      'porthole', 'quay', 'rigging', 'rudder', 'sailor', 'schooner',
      'starboard', 'stern', 'tiller', 'trawler', 'yacht'] },

    { title: 'Countries', words: [
      'albania', 'algeria', 'angola', 'armenia', 'austria', 'belarus',
      'belgium', 'bolivia', 'brazil', 'bulgaria', 'cambodia', 'canada',
      'chile', 'colombia', 'croatia', 'denmark', 'ecuador', 'egypt',
      'estonia', 'ethiopia', 'finland', 'france', 'georgia', 'germany',
      'ghana', 'greece', 'hungary', 'iceland', 'ireland', 'jamaica'] },

    { title: 'Capital cities', words: [
      'amsterdam', 'ankara', 'athens', 'beijing', 'berlin', 'bogota',
      'brussels', 'bucharest', 'budapest', 'cairo', 'canberra', 'caracas',
      'copenhagen', 'dublin', 'havana', 'helsinki', 'jakarta', 'kingston',
      'lisbon', 'madrid', 'manila', 'moscow', 'nairobi', 'ottawa', 'paris',
      'prague', 'riyadh', 'stockholm', 'tehran', 'vienna'] },

    { title: 'On the map', words: [
      'archipelago', 'atoll', 'canyon', 'cliff', 'continent', 'delta',
      'desert', 'equator', 'estuary', 'fjord', 'glacier', 'gulf',
      'hemisphere', 'island', 'isthmus', 'lagoon', 'latitude', 'meridian',
      'mountain', 'oasis', 'peninsula', 'plateau', 'prairie', 'ravine',
      'savanna', 'steppe', 'strait', 'tundra', 'valley', 'volcano'] },

    { title: 'Volcanoes and earthquakes', words: [
      'aftershock', 'ashfall', 'caldera', 'crater', 'dormant', 'epicentre',
      'eruption', 'extinct', 'fault', 'fissure', 'geyser', 'lahar',
      'landslide', 'lava', 'magma', 'mantle', 'molten', 'pumice', 'richter',
      'rumble', 'seismic', 'shockwave', 'sulphur', 'tectonic', 'tremor',
      'tsunami', 'vent', 'volcanic', 'crust', 'plume'] },

    { title: 'Trains and railways', words: [
      'buffet', 'buffer', 'carriage', 'conductor', 'coupling', 'crossing',
      'cutting', 'depot', 'diesel', 'embankment', 'engine', 'express',
      'freight', 'gauge', 'junction', 'locomotive', 'luggage', 'platform',
      'points', 'porter', 'rails', 'semaphore', 'shunting', 'siding',
      'sleeper', 'station', 'timetable', 'tunnel', 'viaduct', 'wagon'] },

    { title: 'Rocks and minerals', words: [
      'agate', 'anthracite', 'basalt', 'bauxite', 'calcite', 'chalk',
      'dolomite', 'copper', 'corundum', 'feldspar', 'flint', 'gneiss',
      'granite', 'graphite', 'gypsum', 'limestone', 'magnetite',
      'malachite', 'marble', 'mica', 'obsidian', 'pumice', 'pyrite',
      'quartz', 'sandstone', 'schist', 'shale', 'slate', 'talc', 'gabbro'] },

    { title: 'Chemistry class', words: [
      'acetone', 'alkaline', 'ammonia', 'argon', 'barium', 'beaker',
      'benzene', 'bunsen', 'burette', 'calcium', 'catalyst', 'chlorine',
      'crucible', 'distil', 'electron', 'enzyme', 'flask', 'helium',
      'hydrogen', 'iodine', 'isotope', 'krypton', 'magnesium', 'molecule',
      'neutron', 'nitrogen', 'oxide', 'pipette', 'solvent', 'titration'] },

    { title: 'Maths class', words: [
      'addition', 'algebra', 'angle', 'average', 'bisect', 'calculus',
      'symmetry', 'decimal', 'denominator', 'diameter', 'division',
      'equation', 'exponent', 'factor', 'fraction', 'geometry', 'gradient',
      'integer', 'logarithm', 'matrix', 'multiply', 'numerator',
      'percentage', 'perimeter', 'probability', 'quotient', 'radius',
      'remainder', 'subtract', 'tangent', 'vector'] },

    { title: 'At the doctor', words: [
      'allergy', 'antibiotic', 'bandage', 'blister', 'bruise', 'checkup',
      'clinic', 'diagnosis', 'dosage', 'fever', 'fracture', 'infection',
      'injection', 'medicine', 'nausea', 'ointment', 'patient', 'pharmacy',
      'plaster', 'thermometer', 'pulse', 'rash', 'recovery', 'splint',
      'stethoscope', 'surgery', 'symptom', 'syringe', 'vaccine', 'ward'] },

    { title: 'In the classroom', words: [
      'assembly', 'blackboard', 'chalk', 'classroom', 'compass', 'corridor',
      'curriculum', 'detention', 'diary', 'eraser', 'exercise', 'homework',
      'lesson', 'library', 'lunchbox', 'notebook', 'pencil', 'playground',
      'protractor', 'pupil', 'register', 'revision', 'ruler', 'satchel',
      'staffroom', 'stationery', 'syllabus', 'teacher', 'textbook',
      'timetable'] },

    { title: 'Reading a book', words: [
      'anthology', 'author', 'biography', 'blurb', 'bookmark', 'chapter',
      'character', 'contents', 'dedication', 'dialogue', 'edition',
      'epilogue', 'fiction', 'foreword', 'glossary', 'hardback', 'spine',
      'index', 'manuscript', 'narrator', 'novel', 'reprint', 'paperback',
      'paragraph', 'plot', 'preface', 'prologue', 'publisher', 'sequel',
      'synopsis'] },

    { title: 'Writing it down', words: [
      'adjective', 'capital', 'apostrophe', 'brackets', 'clause', 'colon',
      'comma', 'conjunction', 'consonant', 'dictionary', 'grammar',
      'hyphen', 'italic', 'metaphor', 'noun', 'paragraph', 'phrase',
      'predicate', 'preposition', 'plural', 'punctuation', 'tense',
      'sentence', 'simile', 'spelling', 'syllable', 'syntax', 'verb',
      'vocabulary', 'vowel'] },

    { title: 'Newspapers', words: [
      'byline', 'caption', 'circulation', 'classified', 'column',
      'broadsheet', 'deadline', 'newsprint', 'editorial', 'exclusive',
      'feature', 'gazette', 'headline', 'horoscope', 'interview',
      'journalist', 'masthead', 'obituary', 'opinion', 'photograph',
      'printer', 'publisher', 'reporter', 'scoop', 'subeditor', 'tabloid',
      'typeface', 'bulletin', 'dispatch', 'syndicate'] },

    { title: 'Making a film', words: [
      'actor', 'animation', 'backdrop', 'camera', 'casting', 'cinema',
      'climax', 'closeup', 'costume', 'credits', 'director', 'dubbing',
      'editing', 'footage', 'genre', 'lighting', 'location', 'montage',
      'narrator', 'producer', 'projector', 'rehearsal', 'scene', 'screen',
      'script', 'sequel', 'stunt', 'subtitle', 'trailer', 'wardrobe'] },

    { title: 'At the theatre', words: [
      'applause', 'audience', 'backstage', 'balcony', 'ballet', 'cabaret',
      'costume', 'curtain', 'dressing', 'encore', 'ensemble', 'gallery',
      'interval', 'matinee', 'monologue', 'opera', 'orchestra',
      'performance', 'prompter', 'puppet', 'rehearsal', 'scenery',
      'soliloquy', 'spotlight', 'stagehand', 'stalls', 'tragedy', 'troupe',
      'understudy', 'usher'] },

    { title: 'Painting a picture', words: [
      'acrylic', 'brush', 'canvas', 'charcoal', 'collage', 'frame',
      'composition', 'crayon', 'easel', 'etching', 'foreground', 'fresco',
      'gallery', 'gouache', 'highlight', 'landscape', 'mosaic', 'mural',
      'palette', 'pastel', 'perspective', 'pigment', 'portrait', 'primer',
      'sketch', 'stencil', 'texture', 'turpentine', 'varnish', 'watercolour'] },

    { title: 'Photography', words: [
      'aperture', 'backdrop', 'camera', 'closeup', 'composition',
      'darkroom', 'develop', 'enlarger', 'exposure', 'filter', 'flash',
      'focus', 'grain', 'lens', 'lighting', 'negative', 'panorama',
      'portrait', 'printing', 'processing', 'shutter', 'silhouette',
      'snapshot', 'studio', 'telephoto', 'timer', 'tripod', 'viewfinder',
      'zoom', 'framing'] },

    { title: 'Playing football', words: [
      'attacker', 'corner', 'crossbar', 'defender', 'dribble', 'equaliser',
      'formation', 'foul', 'goalkeeper', 'halftime', 'handball', 'header',
      'kickoff', 'linesman', 'manager', 'midfield', 'offside', 'penalty',
      'referee', 'scoreline', 'sending', 'stadium', 'striker', 'substitute',
      'tackle', 'terrace', 'throwin', 'touchline', 'volley', 'whistle'] },

    { title: 'Playing cricket', words: [
      'allrounder', 'appeal', 'batsman', 'bouncer', 'boundary', 'bowler',
      'century', 'crease', 'declaration', 'delivery', 'fielder', 'googly',
      'innings', 'leather', 'maiden', 'fielding', 'outfield', 'pavilion',
      'runout', 'scorer', 'seamer', 'session', 'sightscreen', 'spinner',
      'stumps', 'sweep', 'umpire', 'wicket', 'yorker', 'slips'] },

    { title: 'On the racetrack', words: [
      'bookmaker', 'bridle', 'canter', 'chestnut', 'colt', 'dressage',
      'fence', 'filly', 'furlong', 'gallop', 'gelding', 'grandstand',
      'groom', 'hurdle', 'jockey', 'jodhpurs', 'mare', 'paddock',
      'photofinish', 'racecourse', 'saddle', 'stable', 'stallion',
      'starter', 'handicap', 'stirrup', 'favourite', 'trainer', 'trotting',
      'winner'] },

    { title: 'At the gym', words: [
      'aerobics', 'barbell', 'bench', 'cardio', 'circuit', 'crunches',
      'dumbbell', 'endurance', 'exercise', 'flexibility', 'interval',
      'kettlebell', 'lifting', 'lunges', 'muscle', 'press', 'pullup',
      'pushup', 'reps', 'rowing', 'sitting', 'skipping', 'spinning',
      'squat', 'stamina', 'stretching', 'training', 'treadmill', 'warmup',
      'workout'] },

    { title: 'Winter sports', words: [
      'avalanche', 'bobsleigh', 'chairlift', 'curling', 'downhill',
      'freestyle', 'goggles', 'halfpipe', 'iceskating', 'luge', 'mogul',
      'mountaineer', 'piste', 'sledge', 'slalom', 'snowboard', 'snowplough',
      'snowshoe', 'icerink', 'stopwatch', 'toboggan', 'chalet', 'snowfield',
      'salopettes', 'crampons', 'crevasse', 'icefall', 'summit', 'skiing',
      'skater'] },

    { title: 'Water sports', words: [
      'backstroke', 'plunge', 'butterfly', 'canoeing', 'capsize', 'diving',
      'flippers', 'freestyle', 'goggles', 'kayak', 'lifeguard', 'oarsman',
      'paddle', 'poolside', 'regatta', 'rowing', 'rudder', 'sailing',
      'snorkel', 'splash', 'springboard', 'surfboard', 'surfing',
      'swimming', 'lifebelt', 'waterpolo', 'waves', 'wetsuit', 'windsurf',
      'yachting'] },

    { title: 'Board games', words: [
      'bishop', 'blockade', 'board', 'bonus', 'castle', 'checkers',
      'checkmate', 'counter', 'dice', 'draughts', 'endgame', 'gambit',
      'knight', 'ludo', 'opponent', 'pawn', 'piece', 'player', 'rolling',
      'rook', 'rules', 'scoring', 'shuffle', 'spinner', 'square',
      'stalemate', 'strategy', 'tactics', 'token', 'turn'] },

    { title: 'A day at the fair', words: [
      'bigwheel', 'bumper', 'candyfloss', 'carousel', 'coconut', 'dodgems',
      'mirrors', 'fairground', 'fortune', 'ghosttrain', 'hoopla', 'juggler',
      'prize', 'popcorn', 'roundabout', 'showman', 'sideshow', 'stall',
      'swingboat', 'targets', 'teacup', 'ticket', 'toffeeapple', 'tombola',
      'turnstile', 'waltzer', 'ringmaster', 'arcade', 'bunting', 'ringtoss'] },

    { title: 'Jobs and trades', words: [
      'accountant', 'architect', 'baker', 'blacksmith', 'builder',
      'butcher', 'carpenter', 'chemist', 'cobbler', 'dentist',
      'electrician', 'engineer', 'farmer', 'firefighter', 'florist',
      'gardener', 'glazier', 'jeweller', 'journalist', 'librarian',
      'locksmith', 'mechanic', 'midwife', 'optician', 'plumber',
      'solicitor', 'surveyor', 'teacher', 'upholsterer', 'nurse'] },

    { title: 'In the office', words: [
      'appointment', 'binder', 'briefcase', 'calendar', 'clipboard',
      'colleague', 'conference', 'deadline', 'directory', 'envelope',
      'filing', 'folder', 'highlighter', 'invoice', 'ledger', 'meeting',
      'memorandum', 'minutes', 'notepad', 'paperclip', 'photocopier',
      'printer', 'receipt', 'reception', 'schedule', 'shredder', 'stapler',
      'stationery', 'swivel', 'whiteboard'] },

    { title: 'Money matters', words: [
      'account', 'balance', 'banknote', 'borrow', 'budget', 'cashier',
      'cheque', 'coinage', 'credit', 'currency', 'debit', 'deposit',
      'dividend', 'earnings', 'expense', 'income', 'interest', 'invoice',
      'lending', 'mortgage', 'overdraft', 'payment', 'pension', 'profit',
      'refund', 'salary', 'savings', 'spending', 'taxation', 'wallet'] },

    { title: 'At the shops', words: [
      'aisle', 'arcade', 'assistant', 'bargain', 'basket', 'bazaar',
      'boutique', 'browsing', 'catalogue', 'changing', 'checkout',
      'customer', 'delivery', 'discount', 'emporium', 'grocer', 'haggle',
      'hamper', 'markdown', 'market', 'merchant', 'purchase', 'queue',
      'receipt', 'refund', 'shelves', 'shopper', 'stockroom', 'trolley',
      'voucher'] },

    { title: 'Buildings', words: [
      'abbey', 'apartment', 'arcade', 'bandstand', 'barracks', 'basilica',
      'bungalow', 'cathedral', 'chapel', 'chateau', 'cottage', 'farmhouse',
      'fortress', 'granary', 'lighthouse', 'mansion', 'minaret',
      'monastery', 'mosque', 'observatory', 'pagoda', 'palace', 'pavilion',
      'rotunda', 'skyscraper', 'temple', 'terrace', 'townhouse',
      'warehouse', 'windmill'] },

    { title: 'Rooms in a house', words: [
      'attic', 'ballroom', 'basement', 'bathroom', 'bedroom', 'cellar',
      'chamber', 'boxroom', 'corridor', 'cupboard', 'dining', 'drawing',
      'dungeon', 'foyer', 'garage', 'hallway', 'kitchen', 'landing',
      'larder', 'library', 'lounge', 'nursery', 'pantry', 'parlour',
      'porch', 'scullery', 'snug', 'storeroom', 'study', 'workshop'] },

    { title: 'Doors and windows', words: [
      'architrave', 'awning', 'bolt', 'casement', 'catch', 'doorbell',
      'doorknob', 'doorstep', 'frame', 'glazing', 'handle', 'hinge', 'jamb',
      'keyhole', 'knocker', 'latch', 'letterbox', 'lintel', 'louvre',
      'mullion', 'pane', 'porch', 'sash', 'shutter', 'sill', 'skylight',
      'threshold', 'transom', 'bracket', 'mortice'] },

    { title: 'Roads and traffic', words: [
      'asphalt', 'bollard', 'bypass', 'carriageway', 'chevron',
      'congestion', 'crossing', 'crossroads', 'cyclepath', 'diversion',
      'flyover', 'gridlock', 'junction', 'kerb', 'lamppost', 'layby',
      'motorway', 'overpass', 'pavement', 'pothole', 'roadworks',
      'roundabout', 'signpost', 'sliproad', 'tailback', 'traffic', 'tarmac',
      'tollbooth', 'underpass', 'verge'] },

    { title: 'Cars', words: [
      'accelerator', 'airbag', 'alternator', 'battery', 'bonnet', 'bumper',
      'carburettor', 'chassis', 'clutch', 'dashboard', 'exhaust', 'gearbox',
      'handbrake', 'headlight', 'ignition', 'indicator', 'mudguard',
      'odometer', 'pedal', 'piston', 'radiator', 'seatbelt', 'speedometer',
      'spoiler', 'steering', 'suspension', 'throttle', 'windscreen',
      'wiper', 'wheel'] },

    { title: 'Boats and ships', words: [
      'barge', 'canoe', 'caravel', 'catamaran', 'clipper', 'coracle',
      'cruiser', 'dhow', 'dinghy', 'dredger', 'ferry', 'freighter',
      'frigate', 'galleon', 'gondola', 'hovercraft', 'hydrofoil', 'junk',
      'kayak', 'ketch', 'launch', 'liner', 'longboat', 'pontoon', 'punt',
      'wherry', 'sampan', 'tanker', 'tugboat', 'yawl'] },

    { title: 'Aeroplanes', words: [
      'aileron', 'airframe', 'airliner', 'altimeter', 'autopilot',
      'biplane', 'cabin', 'cargo', 'cockpit', 'copilot', 'elevator',
      'flaps', 'fuselage', 'galley', 'glider', 'hangar', 'joystick',
      'landing', 'monoplane', 'nosecone', 'propeller', 'rudder', 'runway',
      'seaplane', 'steward', 'tailfin', 'taxiing', 'turbine', 'airspeed',
      'wingtip'] },

    { title: 'At the airport', words: [
      'arrivals', 'baggage', 'boarding', 'carousel', 'checkin', 'concourse',
      'conveyor', 'customs', 'departures', 'duty', 'gateway', 'immigration',
      'jetway', 'lounge', 'luggage', 'passenger', 'passport', 'pilot',
      'runway', 'security', 'shuttle', 'stopover', 'suitcase', 'terminal',
      'ticket', 'transfer', 'transit', 'trolley', 'visa', 'carrier'] },

    { title: 'Going on holiday', words: [
      'adventure', 'beachfront', 'booking', 'brochure', 'cabin', 'campsite',
      'coastline', 'cruise', 'deckchair', 'excursion', 'guidebook',
      'hostel', 'hotel', 'itinerary', 'journey', 'packing', 'postcard',
      'resort', 'seaside', 'sightseeing', 'souvenir', 'sunblock',
      'sunglasses', 'swimsuit', 'tourist', 'traveller', 'vacation', 'villa',
      'voyage', 'wanderlust'] },

    { title: 'A birthday party', words: [
      'balloon', 'banner', 'blowout', 'bunting', 'frosting', 'candle',
      'confetti', 'crackers', 'cupcake', 'garland', 'gifts', 'glitter',
      'guests', 'hooter', 'icing', 'invitation', 'jelly', 'lemonade',
      'napkin', 'parcel', 'party', 'present', 'ribbon', 'sandwich',
      'sparkler', 'streamer', 'surprise', 'tablecloth', 'trifle', 'wrapping'] },

    { title: 'Mountains and climbing', words: [
      'abseil', 'altitude', 'ascent', 'avalanche', 'belay', 'bivouac',
      'boulder', 'buttress', 'cairn', 'carabiner', 'chimney', 'cliff',
      'crampon', 'crevasse', 'descent', 'expedition', 'foothill', 'glacier',
      'gully', 'harness', 'overhang', 'pinnacle', 'piton', 'plateau',
      'ridge', 'rockface', 'rope', 'scramble', 'summit', 'traverse'] },

    { title: 'Down on the coast', words: [
      'barnacle', 'causeway', 'beachcomber', 'breakwater', 'cliff', 'cove',
      'driftwood', 'dune', 'erosion', 'estuary', 'groyne', 'harbour',
      'headland', 'inlet', 'jetty', 'lighthouse', 'mudflat', 'pebble',
      'pier', 'promenade', 'rockpool', 'spray', 'seagull', 'seaweed',
      'shingle', 'shoreline', 'surf', 'tideline', 'undertow', 'wave'] },

    { title: 'In the desert', words: [
      'arid', 'barren', 'bedouin', 'cactus', 'camel', 'canyon', 'caravan',
      'dromedary', 'dunes', 'drought', 'expanse', 'gecko', 'horizon',
      'jackal', 'mirage', 'nomad', 'oasis', 'outcrop', 'parched', 'plateau',
      'quicksand', 'sandstorm', 'scorpion', 'scrubland', 'shimmer',
      'sunbaked', 'tumbleweed', 'vulture', 'wadi', 'waterhole'] },

    { title: 'In the jungle', words: [
      'anaconda', 'bamboo', 'canopy', 'chimpanzee', 'clearing', 'creeper',
      'foliage', 'humid', 'jaguar', 'liana', 'macaw', 'machete', 'monkey',
      'mosquito', 'orchid', 'parrot', 'python', 'rainforest', 'sloth',
      'swamp', 'tapir', 'tarantula', 'thicket', 'toucan', 'treetop',
      'tropical', 'undergrowth', 'vine', 'waterfall'] },

    { title: 'Polar regions', words: [
      'arctic', 'aurora', 'blizzard', 'blubber', 'caribou', 'frostbite',
      'glacier', 'husky', 'iceberg', 'icecap', 'icefloe', 'igloo', 'lichen',
      'midnight', 'narwhal', 'permafrost', 'polarbear', 'reindeer', 'seal',
      'sledge', 'snowdrift', 'snowfield', 'subzero', 'tundra', 'walrus',
      'whiteout', 'windchill', 'penguin', 'krill', 'tusk'] },

    { title: 'Insects up close', words: [
      'abdomen', 'antenna', 'beeswax', 'burrow', 'chrysalis', 'cocoon',
      'colony', 'compound', 'drone', 'exoskeleton', 'feelers', 'grub',
      'honeycomb', 'hatching', 'hive', 'larva', 'mandible', 'stinger',
      'migration', 'moulting', 'nectar', 'nymph', 'pollen', 'proboscis',
      'pupa', 'queen', 'swarm', 'thorax', 'wingbeat', 'nesting'] },

    { title: 'Farmyard sounds', words: [
      'bellow', 'bleat', 'bray', 'cackle', 'chirp', 'cluck', 'chatter',
      'crow', 'gobble', 'grunt', 'honk', 'hoot', 'screech', 'neigh', 'oink',
      'purr', 'quack', 'roar', 'snort', 'squawk', 'squeal', 'trumpet',
      'twitter', 'warble', 'whinny', 'yelp', 'bark', 'growl', 'howl',
      'snuffle'] },

    { title: 'Words for cold', words: [
      'arctic', 'biting', 'bleak', 'bracing', 'brisk', 'chilled', 'chilly',
      'clammy', 'crisp', 'draughty', 'freezing', 'frigid', 'frosty',
      'frozen', 'glacial', 'icebound', 'shivering', 'nippy', 'numbing',
      'perishing', 'polar', 'frostbitten', 'shivery', 'sleety', 'snowy',
      'subzero', 'unheated', 'wintry', 'cool', 'bitter'] },

    { title: 'Words for big', words: [
      'ample', 'bulky', 'colossal', 'whopping', 'enormous', 'expansive',
      'extensive', 'gargantuan', 'generous', 'giant', 'gigantic', 'grand',
      'great', 'hefty', 'huge', 'hulking', 'immense', 'jumbo', 'mammoth',
      'massive', 'mighty', 'monstrous', 'outsize', 'prodigious', 'roomy',
      'spacious', 'substantial', 'titanic', 'towering', 'vast'] },

    { title: 'Words for small', words: [
      'compact', 'cramped', 'diminutive', 'dinky', 'dwarfish', 'slimline',
      'little', 'meagre', 'microscopic', 'midget', 'miniature', 'minor',
      'minuscule', 'minute', 'modest', 'narrow', 'paltry', 'petite',
      'pintsize', 'pocket', 'puny', 'scanty', 'short', 'skimpy', 'slender',
      'slight', 'teeny', 'tiny', 'undersized', 'titchy'] },

    { title: 'Words for fast', words: [
      'agile', 'breakneck', 'brisk', 'fleet', 'flying', 'hasty', 'headlong',
      'hurried', 'hurtling', 'lively', 'nimble', 'pacy', 'prompt', 'quick',
      'rapid', 'rushing', 'scampering', 'sharpish', 'speedy', 'spirited',
      'sprightly', 'sudden', 'swift', 'whirlwind', 'winged', 'zippy',
      'blistering', 'galloping', 'dashing', 'racing'] },

    { title: 'Words for angry', words: [
      'aggrieved', 'annoyed', 'apoplectic', 'bristling', 'cross', 'enraged',
      'exasperated', 'fuming', 'furious', 'heated', 'incensed', 'indignant',
      'infuriated', 'irate', 'irked', 'livid', 'narked', 'nettled',
      'outraged', 'peeved', 'raging', 'riled', 'seething', 'shirty',
      'stroppy', 'sullen', 'tetchy', 'vexed', 'wrathful', 'huffy'] },

    { title: 'Words for tired', words: [
      'bushed', 'drained', 'drooping', 'drowsy', 'exhausted', 'fatigued',
      'flagging', 'groggy', 'jaded', 'knackered', 'languid', 'listless',
      'nodding', 'overworked', 'shattered', 'sleepy', 'sluggish',
      'somnolent', 'spent', 'tired', 'weakened', 'weary', 'wilting',
      'worndown', 'yawning', 'zonked', 'dozy', 'fagged', 'jetlagged', 'limp'] },

    { title: 'Words for brave', words: [
      'adventurous', 'audacious', 'bold', 'courageous', 'daring',
      'dauntless', 'doughty', 'fearless', 'gallant', 'gritty', 'gutsy',
      'heroic', 'intrepid', 'lionhearted', 'manful', 'mettlesome', 'plucky',
      'resolute', 'spirited', 'stalwart', 'staunch', 'nerveless', 'spunky',
      'unafraid', 'undaunted', 'unflinching', 'valiant', 'valorous',
      'venturesome', 'dogged'] },

    { title: 'Words for quiet', words: [
      'faint', 'hushed', 'inaudible', 'reticent', 'muffled', 'murmured',
      'mute', 'noiseless', 'peaceful', 'placid', 'restful', 'sedate',
      'silent', 'soothing', 'soundless', 'still', 'taciturn', 'subdued',
      'tranquil', 'unspoken', 'untroubled', 'voiceless', 'whispered',
      'whispering', 'calm', 'gentle', 'lulled', 'mellow', 'serene'] },

    { title: 'Ways of talking', words: [
      'babble', 'bellow', 'blurt', 'boast', 'chatter', 'chuntering',
      'declare', 'drawl', 'exclaim', 'gabble', 'gossip', 'grumble',
      'jabber', 'lecture', 'mumble', 'murmur', 'mutter', 'natter',
      'prattle', 'preach', 'ramble', 'rant', 'recite', 'splutter',
      'stammer', 'stutter', 'waffle', 'whisper', 'witter', 'yammer'] },

    { title: 'Ways of looking', words: [
      'admire', 'behold', 'blink', 'examine', 'eyeball', 'gape', 'gawp',
      'gaze', 'glance', 'glare', 'glimpse', 'goggle', 'inspect', 'leer',
      'observe', 'ogle', 'peek', 'peep', 'peer', 'regard', 'scan', 'scowl',
      'scrutinise', 'skim', 'spot', 'squint', 'stare', 'study', 'survey',
      'watch'] },

    { title: 'Ways of laughing', words: [
      'beam', 'cackle', 'chortle', 'chuckle', 'giggle', 'grin', 'guffaw',
      'hoot', 'roaring', 'smile', 'smirk', 'snicker', 'snigger', 'titter',
      'chirrup', 'crowing', 'gurgle', 'jollity', 'howling', 'merriment',
      'mirth', 'rejoice', 'roars', 'simper', 'snort', 'amusement',
      'tickled', 'twinkle', 'whoop', 'hilarity'] },

    { title: 'Feeling nervous', words: [
      'agitated', 'anxious', 'nailbiting', 'edgy', 'fearful', 'flustered',
      'fretful', 'frightened', 'jittery', 'jumpy', 'nervy', 'panicky',
      'petrified', 'queasy', 'quivering', 'rattled', 'restless', 'shaky',
      'skittish', 'startled', 'strung', 'tense', 'terrified', 'timid',
      'trembling', 'twitchy', 'uneasy', 'unsettled', 'worried', 'fidgety'] },

    { title: 'Being polite', words: [
      'apology', 'courteous', 'curtsey', 'deference', 'etiquette',
      'gallant', 'genteel', 'gracious', 'greeting', 'handshake', 'manners',
      'obliging', 'pardon', 'please', 'politeness', 'respect', 'tactful',
      'thanks', 'thoughtful', 'welcome', 'wellbred', 'civility', 'courtesy',
      'decorum', 'diplomacy', 'bowing', 'kindly', 'mannerly', 'regards'] },

    { title: 'Fairytales', words: [
      'beanstalk', 'cauldron', 'chariot', 'cobbler', 'courtier', 'curse',
      'dragon', 'dwarves', 'enchanted', 'fairy', 'giant', 'glass', 'goblin',
      'kingdom', 'knight', 'magic', 'mermaid', 'ogre', 'potion', 'princess',
      'quest', 'slipper', 'sorcerer', 'spell', 'troll', 'unicorn', 'wand',
      'wicked', 'wizard'] },

    { title: 'Myths and legends', words: [
      'amulet', 'centaur', 'chimera', 'cyclops', 'griffin', 'harpy',
      'hydra', 'kraken', 'labyrinth', 'minotaur', 'nymph', 'odyssey',
      'oracle', 'pegasus', 'phoenix', 'prophecy', 'quest', 'siren',
      'sphinx', 'talisman', 'titan', 'trident', 'valkyrie', 'wyvern',
      'basilisk', 'chalice', 'deity', 'mermaid', 'pantheon', 'satyr'] },

    { title: 'Pirates', words: [
      'anchor', 'blunderbuss', 'boarding', 'buccaneer', 'captain',
      'cutlass', 'doubloon', 'galleon', 'grog', 'hoard', 'hornpipe',
      'jollyroger', 'keelhaul', 'lookout', 'marooned', 'mutiny', 'parrot',
      'crewman', 'plank', 'plunder', 'privateer', 'spyglass', 'ransom',
      'rigging', 'scallywag', 'scurvy', 'shipwreck', 'stowaway', 'treasure',
      'yardarm'] },

    { title: 'Knights and castles', words: [
      'armour', 'banner', 'battlement', 'castle', 'chainmail', 'chivalry',
      'crossbow', 'dungeon', 'gauntlet', 'heraldry', 'jousting', 'keep',
      'lance', 'moat', 'pageboy', 'parapet', 'portcullis', 'rampart',
      'shield', 'siege', 'squire', 'standard', 'steed', 'sword',
      'tournament', 'turret', 'vassal', 'visor', 'drawbridge', 'tabard'] },

    { title: 'Ancient Egypt', words: [
      'amulet', 'anubis', 'cartouche', 'chariot', 'cobra', 'dynasty',
      'embalming', 'granite', 'hieroglyph', 'horus', 'obelisk', 'oasis',
      'papyrus', 'pharaoh', 'pyramid', 'reeds', 'sarcophagus', 'scarab',
      'scribe', 'sphinx', 'temple', 'tomb', 'vizier', 'canopic', 'mummy',
      'nile', 'pylon', 'shrine', 'sistrum', 'ankh'] },

    { title: 'Detective story', words: [
      'alibi', 'accomplice', 'clue', 'confession', 'culprit', 'disguise',
      'evidence', 'fingerprint', 'forensic', 'hunch', 'inquest',
      'inspector', 'deduction', 'motive', 'mystery', 'notebook', 'prowler',
      'pursuit', 'ransom', 'sleuth', 'stakeout', 'statement', 'suspect',
      'testimony', 'theft', 'trail', 'verdict', 'witness', 'whodunnit',
      'shadowing'] },

    { title: 'Magic tricks', words: [
      'abracadabra', 'applause', 'assistant', 'cabinet', 'cards',
      'conjuror', 'deception', 'disappear', 'dove', 'flourish', 'hoodwink',
      'illusion', 'levitation', 'magician', 'mindreading', 'mystify',
      'patter', 'performance', 'escapology', 'rabbit', 'reveal', 'ribbons',
      'showmanship', 'sleight', 'stagecraft', 'topper', 'trapdoor',
      'vanishing', 'wand', 'silks'] },

    { title: 'At the circus', words: [
      'acrobat', 'aerialist', 'bareback', 'bigtop', 'clown', 'gymnast',
      'costume', 'juggler', 'lasso', 'lion', 'netting', 'parade',
      'performer', 'hoops', 'ringmaster', 'sawdust', 'seals', 'somersault',
      'spangles', 'stilts', 'strongman', 'tamer', 'tightrope', 'trampoline',
      'trapeze', 'tumbler', 'unicycle', 'wirewalker', 'cannon', 'trick'] },

    { title: 'Music words', words: [
      'anthem', 'ballad', 'chorus', 'composer', 'concerto', 'crescendo',
      'duet', 'ensemble', 'harmony', 'interlude', 'lyric', 'melody',
      'minuet', 'octave', 'overture', 'quaver', 'refrain', 'rhythm',
      'scale', 'semibreve', 'serenade', 'sonata', 'staccato', 'symphony',
      'tempo', 'treble', 'tremolo', 'tuning', 'verse', 'vibrato'] },

    { title: 'Dancing', words: [
      'ballroom', 'bolero', 'cancan', 'charleston', 'conga', 'fandango',
      'flamenco', 'foxtrot', 'jitterbug', 'jive', 'lambada', 'mambo',
      'mazurka', 'minuet', 'pirouette', 'polka', 'quickstep', 'reel',
      'rumba', 'salsa', 'samba', 'shimmy', 'tango', 'tapdance', 'twirl',
      'twist', 'waltz', 'boogie', 'pasodoble', 'hornpipe'] },

    { title: 'Poetry', words: [
      'acrostic', 'caesura', 'ballad', 'couplet', 'elegy', 'epic', 'haiku',
      'imagery', 'limerick', 'lyric', 'metre', 'villanelle', 'pentameter',
      'quatrain', 'refrain', 'rhyme', 'rhythm', 'scansion', 'sonnet',
      'stanza', 'stress', 'syllable', 'verse', 'assonance', 'anapaest',
      'cadence', 'eclogue', 'idyll', 'iambic', 'sestina'] },

    { title: 'Sewing basket', words: [
      'applique', 'backstitch', 'basting', 'bobbin', 'bodkin', 'buttonhole',
      'cotton', 'crochet', 'darning', 'dressmaking', 'embroidery', 'fabric',
      'hemline', 'interfacing', 'lining', 'needle', 'overlock', 'patchwork',
      'pincushion', 'pinking', 'quilting', 'reels', 'ribbon', 'scissors',
      'seam', 'selvedge', 'sewing', 'tacking', 'thimble', 'yarn'] },

    { title: 'Knitting', words: [
      'aran', 'bobble', 'chenille', 'casting', 'chunky', 'crochet',
      'decrease', 'double', 'fairisle', 'garter', 'gauge', 'increase',
      'intarsia', 'jumper', 'looping', 'merino', 'mohair', 'moss',
      'needles', 'pattern', 'purl', 'ribbing', 'rowcount', 'skein',
      'slipknot', 'stitch', 'stocking', 'tension', 'worsted', 'yarn'] },

    { title: 'Baking a cake', words: [
      'batter', 'beating', 'buttercream', 'caster', 'creaming', 'crumb',
      'currants', 'dredging', 'dusting', 'eggwhites', 'flouring', 'folding',
      'frosting', 'glaze', 'greasing', 'icing', 'kneading', 'layering',
      'marzipan', 'meringue', 'mixing', 'piping', 'preheat', 'rising',
      'sieving', 'sponge', 'sugarpaste', 'tinfoil', 'vanilla', 'whisking'] },

    { title: 'Making bread', words: [
      'baguette', 'bloomer', 'brioche', 'ciabatta', 'crumb', 'crust',
      'granary', 'caraway', 'flour', 'focaccia', 'gluten', 'kneading',
      'leaven', 'loaf', 'oven', 'proving', 'batch', 'rising', 'rolls',
      'rustic', 'slicing', 'scoring', 'sourdough', 'starter', 'wheat',
      'wholemeal', 'yeast', 'bakery', 'bagel', 'ferment'] },

    { title: 'Cheese and pickles', words: [
      'brie', 'caerphilly', 'camembert', 'cheddar', 'cheshire', 'chutney',
      'havarti', 'crumbly', 'edam', 'emmental', 'feta', 'gherkin', 'gouda',
      'gruyere', 'halloumi', 'manchego', 'mascarpone', 'mozzarella',
      'parmesan', 'pecorino', 'piccalilli', 'pickle', 'ploughman', 'relish',
      'ricotta', 'roquefort', 'sauerkraut', 'stilton', 'wensleydale',
      'gorgonzola'] }
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
