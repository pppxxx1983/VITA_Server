const DEFAULT_PLAYER_NAMES = [
  '\u6e05\u98ce\u5ba2', '\u661f\u6cb3\u65c5\u4eba', '\u7af9\u5f71\u542c\u96e8', '\u4e91\u4e0a\u68cb\u624b', '\u6708\u4e0b\u95f2\u4eba', '\u677e\u95f4\u660e\u6708',
  '\u5c0f\u6ee1\u672a\u6ee1', '\u534a\u590f\u5fae\u51c9', '\u5357\u5c71\u6709\u5c40', '\u5317\u5df7\u5f52\u4eba', '\u9752\u706f\u591c\u8bfb', '\u843d\u5b50\u65e0\u58f0',
  '\u542c\u98ce\u5165\u5c40', '\u4e00\u5ff5\u82b1\u5f00', '\u5c71\u6d77\u540c\u884c', '\u6eaa\u6865\u65e7\u68a6', '\u767d\u9732\u672a\u665e', '\u957f\u5b89\u5c0f\u7b51',
  'RiverStone', 'MoonTile', 'LuckyBreeze', 'QuietNova', 'SilverMaple', 'PuzzleMint',
  'BlueLantern', 'CloudNook', 'ZenPebble', 'StarHarbor', 'SunnyOrbit', 'AmberWay',
  'TileWalker', 'GentleComet', 'MistyVale', 'EchoGarden', 'NorthPixel', 'CalmRiddle',
  '\ud558\ub298\ubc14\ub78c', '\ub2ec\ube5b\uc5ec\ud589', '\ubcc4\ube5b\uc815\uc6d0', '\uace0\uc694\ud55c\ub3cc', '\ud478\ub978\uc0c8\ubcbd', '\uad6c\ub984\uc0b0\ucc45',
  '\uc791\uc740\uae30\uc801', '\uc740\ud558\uc218\uae38', '\ubc14\ub78c\uce5c\uad6c', '\ub9d1\uc740\ud558\ub8e8', '\uc18c\ub098\ubb34\ube5b', '\uc870\uc6a9\ud55c\ubcc4',
  '\ud589\uc6b4\ud0c0\uc77c', '\ubd04\ube44\uc18c\ub9ac', '\ub178\uc744\ub9c8\uc74c', '\uc544\uce68\ud37c\uc990', '\ubbf8\uc18c\uc5ec\ud589', '\uc794\uc794\ud55c\ub2ec',
];

function hashString(value) {
  const text = String(value || '');
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getDefaultPlayerName(seed) {
  const index = hashString(seed) % DEFAULT_PLAYER_NAMES.length;
  return DEFAULT_PLAYER_NAMES[index];
}

module.exports = {
  DEFAULT_PLAYER_NAMES,
  getDefaultPlayerName,
};
