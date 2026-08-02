/*
 * The hives. One row per puzzle:
 *
 *     'acehiry|ache,acre,arch,…'
 *      ^ centre letter, then the six outer ones, then every answer
 *
 * The answers ARE the dictionary — the game looks a guess up in this list and
 * nowhere else, so what is here is exactly what scores. Built offline from
 * public word lists rather than at run time; see _README.md for the recipe and
 * why a whole dictionary does not ship to a phone.
 */
window.Hives = (function () {
  const DATA = [
    'acehiry|ache,acre,arch,archer,cache,care,career,carrier,carry,chair,each,hair,hairy,hare,harry,hear,hierarchy,race,racer,reach,yeah,year',
    'acehlnv|ache,acne,avalanche,cache,canal,cancel,cane,cave,chance,channel,clan,clean,each,enhance,hale,have,haven,heal,heave,heaven,lace,lance,lane,lean,leave,naval,valve,veal',
    'adehorv|adore,adored,ahead,dare,dared,dear,dread,dreaded,evade,hard,harder,hare,have,head,headed,header,hear,heard,heave,overhead,overheard,rave,read,reader,redhead,road',
    'eacdhiv|ache,achieve,achieved,advice,ahead,aide,cache,cave,decade,deceive,deceived,decide,decided,device,dice,dive,divide,divided,each,evade,have,head,headache,headed,heave,hide,hive,iced,idea,vice',
    'eachkmt|ache,ahem,cache,cake,came,cheat,check,checkmate,cheek,cheetah,each,hatchet,hate,heat,heath,heck,mace,machete,make,mate,meat,meth,take,tame,teach,team,teammate,them,theme,theta',
    'eahmpty|ahem,attempt,empathy,empty,hate,heap,heat,heath,hype,mate,mayhem,meat,meth,petty,tame,tape,team,teammate,temp,tempt,them,theme,theta,they,type,yeah',
    'eaikltv|alike,alive,elite,evil,kale,kettle,kite,lake,late,latte,leak,leave,like,lite,little,live,take,tale,talkative,teal,tile,title,valet,valve,veal,veil,velvet,vile',
    'ebdhort|better,border,bore,bored,bother,bothered,bred,breed,brother,brotherhood,debt,ether,herb,herd,hero,hotter,order,ordered,other,otter,redo,retro,robbed,robber,robe,rode,rodeo,rooted,terror,there,three,tore',
    'ecdhimo|chemo,chime,choice,code,coded,come,decide,decided,demo,dice,dime,dome,doomed,echo,hide,home,homicide,iced,medic,mice,mode,modem',
    'eghimnt|eight,eighteen,eighth,eminent,engine,genie,getting,height,ignite,imminent,intent,item,meeting,meth,mine,nighttime,nineteen,tenth,them,theme,then,thine,tighten,time',
    'ehlnopt|elope,hello,help,hole,hope,hotel,lent,lone,nope,note,open,opponent,people,phone,poet,pole,pollen,potent,telephone,tenth,then,tone',
    'ghilnrt|giggling,girl,grill,grin,grinning,highlight,hiring,hitting,light,lighting,lightning,ling,lining,night,right,ring,ringing,thigh,thing,thrilling,tight,ting,tiring',
    'habekrt|bath,bathe,breath,breathe,breather,earth,ether,hare,hart,hate,hear,heart,heartbeat,heartbreak,heat,heater,heath,heather,herb,rather,rehab,theater,theatre,there,theta,threat,three',
    'hacerty|ache,arch,archer,attach,cache,catch,catcher,catchy,character,chart,charter,chat,chatter,cheat,cheater,cheer,cheetah,cherry,each,earth,ether,hare,harry,hart,hatch,hatchet,hate,hear,heart,heartache,hearty,heat,heater,heath,heather,rather,reach,teach,teacher,thatcher,theater,theatre,there,theta,they,threat,three,treachery,yacht,yeah',
    'hadegrt|aargh,ahead,death,earth,ether,gather,gathered,hard,harder,hare,hart,hate,hated,hatred,head,headed,header,hear,heard,heart,heat,heated,heater,heath,heather,hedge,herd,rather,redhead,theater,theatre,there,theta,thread,threat,three',
    'hadenrt|ahead,death,earth,ether,hand,handed,hard,hardened,harder,hare,hart,hate,hated,hatred,head,headed,header,hear,heard,heart,heat,heated,heater,heath,heathen,heather,herd,rather,redhead,tenth,than,theater,theatre,then,there,theta,thread,threat,threaten,threatened,three',
    'haderty|ahead,death,dehydrated,earth,ether,hard,harder,hardy,hare,harry,hart,hate,hated,hatred,head,headed,header,hear,heard,heart,hearty,heat,heated,heater,heath,heather,herd,hydra,rather,redhead,theater,theatre,there,theta,they,thread,threat,three,yeah',
    'haeflrt|athlete,earth,ether,farther,father,feather,hale,half,halt,hare,hart,hate,heal,healer,health,hear,heart,heartfelt,heat,heater,heath,heather,hereafter,leather,lethal,rather,theater,theatre,theft,there,thereafter,theta,threat,three',
    'haegirt|aargh,earth,eight,eighth,either,ether,gather,hair,hare,hart,hate,hear,heart,heat,heater,heath,heather,height,heir,heritage,higher,hire,rather,right,theater,theatre,their,there,theta,thigh,threat,three,tight,tighter',
    'haeilrt|athlete,earth,either,ether,hail,hair,hale,halt,hare,hart,hate,heal,healer,health,healthier,hear,heart,heat,heater,heath,heather,heir,hire,leather,lethal,rather,theater,theatre,their,there,theta,threat,three,thrill,thriller',
    'haelmrt|ahem,athlete,earth,ether,hale,halt,hamlet,hammer,hare,harem,harm,hart,hate,heal,healer,health,hear,heart,heat,heater,heath,heather,helm,helmet,leather,lethal,math,meth,rather,theater,theatre,them,theme,there,thermal,theta,threat,three',
    'haelrty|athlete,earth,earthly,ether,hale,halt,hare,harry,hart,hate,heal,healer,health,healthy,hear,heart,hearty,heat,heater,heath,heather,leather,lethal,rather,theater,theatre,there,theta,they,threat,three,yeah',
    'haenort|another,earth,ether,hare,hart,hate,hear,heart,heat,heater,heath,heathen,heather,hero,honor,horn,hornet,hotter,north,northern,oath,other,rather,tenth,than,theater,theatre,then,there,theta,thorn,threat,threaten,three,throat,throne',
    'haenprt|earth,ether,happen,hare,harp,harper,hart,hate,heap,hear,heart,heat,heater,heath,heathen,heather,panther,path,rather,tenth,than,theater,theatre,then,there,theta,threat,threaten,three',
    'haeprty|earth,ether,happy,hare,harp,harper,harry,hart,hate,heap,hear,heart,hearty,heat,heater,heath,heather,hype,path,rather,theater,theatre,therapy,there,theta,they,threat,three,yeah',
    'haertvw|earth,ether,hare,hart,hate,have,hear,heart,heat,heater,heath,heather,heave,rather,thaw,theater,theatre,there,theta,threat,three,threw,weather,what,whatever,wheat,where,wherever,whether,wrath',
    'hdeinrt|either,ether,heir,herd,herein,hidden,hide,hind,hint,hire,hired,inherit,inherited,neither,ninth,tenth,their,then,there,thin,thine,thinner,third,thirteen,three',
    'hefgirt|eight,eighth,either,ether,fifth,fight,fighter,freight,freighter,fright,height,heir,higher,hire,right,theft,their,there,thief,thigh,three,tight,tighter',
    'hegortu|ether,hero,hotter,hour,huge,hurt,other,ought,rough,there,thorough,thou,though,thought,three,through,throughout,thru,thug,together,tough,tougher,truth',
    'iegmnot|eminent,emotion,engine,genie,getting,going,ignite,ignition,imminent,intent,intention,into,item,meeting,mention,mentioning,mine,mining,mint,motion,nineteen,nominee,notion,ointment,ongoing,time,timing,ting',
    'ighnotw|going,hint,hitting,ignition,into,night,nightgown,ninth,nothing,notion,ongoing,owing,owning,thigh,thin,thing,tight,ting,tonight,twig,twin,whining,wing,winning,with,within',
    'macdeot|accommodate,atom,came,coma,come,comet,dame,demo,dome,doomed,mace,madame,made,mate,mead,meat,mode,modem,tame,team,teammate,tomato',
    'macehnt|ahem,amen,anthem,attachment,came,cement,mace,machete,manhattan,match,mate,math,mean,meant,meat,menace,meth,name,tame,team,teammate,them,theme',
    'macenor|amen,armor,aroma,came,camera,cameraman,carmen,coma,come,commence,commerce,common,cram,cream,mace,manner,mano,manor,marc,mare,mean,menace,moan,more,morn,moron,name,norm,omen,roam,roman,romance',
    'maceopr|armor,aroma,came,camera,camp,camper,coma,come,commerce,comp,compare,cram,cramp,cream,emperor,mace,marc,mare,more,poem,prom,promo,ramp,roam',
    'maefnor|amen,armor,aroma,fame,farm,farmer,foam,foreman,form,former,frame,freeman,from,manner,mano,manor,mare,mean,moan,more,morn,moron,name,norm,omen,reform,roam,roman',
    'mceinot|cement,come,comet,comic,commence,comment,commit,commitment,committee,common,commotion,economic,eminence,eminent,emotion,imminent,income,item,memento,mention,mice,mine,mint,moment,monte,motion,nominee,ointment,omen,time',
    'ncehikt|cent,chicken,chin,ethnic,hence,hint,inch,intent,kitchen,kitten,knit,neck,nice,nick,niece,nineteen,ninth,tenth,then,thin,thine,think',
    'ndfgilo|digging,ding,dingo,dining,dodging,doing,filing,filling,find,finding,fling,flooding,folding,fond,fooling,giggling,going,info,ling,lining,lion,lodging,long,longing,ongoing',
    'nekortw|enter,knew,knot,know,known,kroner,network,newt,newton,note,owner,renew,rent,rotten,token,tone,toner,torn,town,went,woken,wont,worn',
    'oaelmrv|armor,aroma,evolve,love,lover,mole,moral,morale,more,moreover,move,oral,oval,over,overall,removal,remove,revolver,roam,role,roller,rover',
    'oamrtuy|armor,armory,armour,aroma,atom,aurora,auto,mayo,mayor,mortar,mortuary,motor,roam,rotary,rumor,rumour,tomato,tour,trout,tumor,tutor,your',
    'ocelmpt|cello,clot,cole,collect,come,comet,comp,compel,compete,complete,cope,elope,mole,motel,omelet,omelette,people,plot,poem,poet,pole,tempo',
    'ocemnry|ceremony,come,commence,commerce,common,concern,cone,core,corn,corner,corny,coroner,cory,economy,encore,memory,money,more,morn,moron,norm,omen,once,recon',
    'ofgimnr|form,forming,frog,from,going,groin,groom,grooming,ignoring,info,inform,informing,iron,ironing,minor,mirror,morn,morning,moron,noir,norm,ongoing,origin,rigor',
    'ogiknrw|going,gown,groin,grow,growing,grown,ignoring,iron,ironing,know,knowing,known,noir,ongoing,origin,owing,owning,rigor,rowing,work,working,worn,wrong',
    'rcehikt|cheer,creek,cricket,critic,either,erect,ether,heir,hire,recite,retire,rice,rich,richer,rick,rite,their,there,thicker,three,tier,tire,trek,trick',
    'reghilt|either,ether,girl,girlie,glitter,greet,grill,heir,higher,hire,letter,lighter,liter,litter,regret,retire,right,rite,teller,their,there,three,thrill,thriller,tier,tiger,tighter,tire,trigger',
    'tacdehw|acted,attach,attached,cadet,catch,chat,cheat,cheated,cheetah,date,dated,death,detached,detect,detected,hatch,hatched,hatchet,hate,hated,heat,heated,heath,teach,thaw,theta,watch,watched,what,wheat',
    'tadehkn|ante,antenna,attend,attendant,attended,date,dated,death,dent,eaten,hate,hated,heat,heated,heath,heathen,neat,take,taken,tank,tenant,tend,tended,tenth,than,thank,thanked,then,theta',
    'taehlwy|athlete,halt,hate,health,healthy,heat,heath,late,lately,latte,lethal,tale,tally,teal,thaw,theta,they,wallet,wealth,wealthy,what,wheat',
    'taghikn|anti,attain,giant,hating,hint,hitting,knight,knit,knitting,night,ninth,taking,tank,than,thank,thanking,thigh,thin,thing,think,thinking,tight,ting,titan',
    'tbcehru|better,brute,butch,butcher,butter,chute,curt,cute,cuter,cutter,erect,ether,hurt,hutch,there,three,thru,truce,true,truth,tube,utter',
    'tbeghir|better,birth,bite,bitter,bright,brighter,eight,eighth,either,ether,greet,height,rebirth,regret,retire,right,rite,their,there,thigh,three,tier,tiger,tight,tighter,tire,tribe,trigger',
    'tcehipr|cite,critic,either,erect,ether,hectic,hitch,itch,peter,petite,pitch,pitcher,prettier,receipt,recite,retire,rite,their,there,three,tier,tire,trip',
    'tdehilr|delete,deleted,diet,dirt,edit,edited,either,elite,ether,letter,lite,liter,litter,little,retire,retired,rite,teller,their,there,third,three,thrill,thrilled,thriller,tide,tied,tier,tile,tire,tired,title,tried',
    'tdehirw|diet,dirt,edit,edited,either,ether,retire,retired,rewrite,rite,their,there,third,three,threw,tide,tied,tier,tire,tired,tried,whether,white,width,with,withdrew,wither,writ,write,writer',
    'tdehnru|dent,duet,enter,entered,ether,hunt,hunted,hunter,hurt,rent,rented,return,returned,runt,tend,tended,tender,tenth,tenure,then,there,three,thru,thunder,trend,true,truth,tune,tuned,turn,turned,turner,untrue,utter',
    'tehiknr|either,enter,entire,ether,hint,inherit,intent,inter,intern,kite,kitten,knit,neither,nineteen,ninth,rent,rethink,retire,rite,tenth,their,then,there,thin,thine,think,thinner,thirteen,three,tier,tire,trek',
    'tghinru|grunt,hint,hitting,hunt,hunting,hurt,hurting,intriguing,night,ninth,right,runt,thigh,thin,thing,thru,thug,tight,ting,tiring,truth,tung,tuning,turn,turning,unit'
  ];

  // Parsed once. Sixty rows of a few hundred bytes each is cheaper to unpack
  // up front than to re-split every time a game starts.
  return DATA.map(row => {
    const parts = row.split('|');
    const letters = parts[0].split('');
    const words = parts[1].split(',');
    const set = new Set(letters);
    return {
      centre: letters[0],
      outer: letters.slice(1),
      letters: letters,
      words: words,
      // A pangram uses all seven. Worth knowing per word, not per guess.
      pangrams: words.filter(w => new Set(w).size === set.size)
    };
  });
})();
