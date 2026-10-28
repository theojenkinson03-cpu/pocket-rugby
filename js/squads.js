// Real players: five for every nation and club, one for each die. Scrum
// Half, a Forward, a Centre, an Outside Back (a wing or full-back) and the
// Fly Half. Picked from recent squads (2025–26, and the 2026–27 line-ups
// where they were known); players move clubs, so some will be out of date.
// Names are used only to label the dice; this is an unofficial fan game, not
// affiliated with or endorsed by any player, club, league or union.

const squad = (S, F, C, W, B) => ({ S, F, C, W, B });

export const SQUADS = {
  // The 24 nations at the 2027 World Cup.
  nzl: squad('C. Roigard', 'A. Savea', 'J. Barrett', 'W. Jordan', 'B. Barrett'),
  aus: squad('T. McDermott', 'R. Valetini', 'L. Ikitau', 'M. Jorgensen', 'T. Lynagh'),
  chi: squad('B. Videla', 'M. Sigren', 'D. Saavedra', 'I. Ayarza', 'S. Videla'),
  hkg: squad('B. Nell', 'J. Hrstich', 'B. Axten-Burrett', 'G. Spanton', 'G. McNeish'),
  rsa: squad('F. de Klerk', 'S. Kolisi', 'D. de Allende', 'C. Kolbe', 'S. Feinberg-Mngomezulu'),
  ita: squad('S. Varney', 'M. Lamaro', 'T. Menoncello', 'A. Capuozzo', 'P. Garbisi'),
  geo: squad('V. Lobzhanidze', 'B. Gorgadze', 'M. Sharikadze', 'D. Niniashvili', 'L. Matkava'),
  rou: squad('F. Surugiu', 'C. Boboc', 'T. Gontineac', 'M. Simionescu', 'H. Vaovasa'),
  arg: squad('G. Bertranou', 'P. Matera', 'L. Cinti', 'M. Carreras', 'T. Albornoz'),
  fij: squad('F. Lomani', 'L. Botia', 'S. Radradra', 'S. Ravutaumada', 'C. Muntz'),
  esp: squad('E. Bay', 'J. Zabala', 'A. Gimeno', 'J. Bell', 'G. Vinuesa'),
  can: squad('R. Braude', 'L. Rumball', 'B. LeSage', 'C. Coats', 'P. Nelson'),
  irl: squad('J. Gibson-Park', 'C. Doris', 'G. Ringrose', 'J. Lowe', 'S. Prendergast'),
  sco: squad('B. White', 'R. Darge', 'S. Tuipulotu', 'B. Kinghorn', 'F. Russell'),
  uru: squad('S. Arata', 'M. Ardao', 'A. Vilaseca', 'B. Amaya', 'F. Etcheverry'),
  por: squad('S. Marques', 'N. Martins', 'J. Lima', 'R. Storti', 'J. Portela'),
  fra: squad('A. Dupont', 'G. Alldritt', 'G. Fickou', 'L. Bielle-Biarrey', 'R. Ntamack'),
  jpn: squad('N. Saito', 'M. Leitch', 'D. Riley', 'K. Matsushima', 'S. Lee'),
  usa: squad('R. de Haas', 'G. Peterson', 'P. Lasike', 'C. Dyer', 'A. MacGinty'),
  sam: squad('J. Taumateine', 'T. McFarland', 'T. Manu', 'N. Ah Wong', 'D. Leuila'),
  eng: squad('A. Mitchell', 'M. Itoje', 'O. Lawrence', 'T. Freeman', 'F. Smith'),
  wal: squad('T. Williams', 'J. Morgan', 'B. Thomas', 'L. Rees-Zammit', 'D. Edwards'),
  ton: squad('S. Takulua', 'V. Fifita', 'P. Ahki', 'S. Kata', 'W. Havili'),
  zim: squad('H. Mudariki', 'G. Muzanargwo', 'B. Mudzekenyedzi', 'T. Mafura', 'I. Prior'),

  // Super Rugby Pacific.
  blues: squad('F. Christie', 'H. Sotutu', 'R. Ioane', 'C. Clarke', 'B. Barrett'),
  chiefs: squad('C. Ratima', 'W. Sititi', 'Q. Tupaea', 'S. Stevenson', 'D. McKenzie'),
  crusaders: squad('N. Hotham', 'E. Blackadder', 'D. Havili', 'W. Jordan', 'T. Kemara'),
  highlanders: squad('F. Fakatava', 'E. de Groot', 'T. Tavatavanawai', 'J. Nareki', 'C. Millar'),
  hurricanes: squad('C. Roigard', 'P. Lakai', 'B. Proctor', 'R. Love', 'B. Cameron'),
  brumbies: squad('R. Lonergan', 'R. Valetini', 'D. Feliuai', 'T. Wright', 'T. Edmed'),
  reds: squad('T. McDermott', 'H. Wilson', 'H. Paisami', 'J. Campbell', 'T. Lynagh'),
  waratahs: squad('J. Gordon', 'C. Gamble', 'J. Suaalii', 'M. Jorgensen', 'L. Creighton'),
  force: squad('N. White', 'J. Williams', 'H. Stewart', 'D. Pietsch', 'B. Donaldson'),
  drua: squad('F. Lomani', 'M. Derenalagi', 'I. Masi', 'S. Ravutaumada', 'I. Armstrong-Ravula'),
  moana: squad('A. Pulu', 'M. Faiilagi', 'F. Inisi', 'S. Alaimalo', 'P. Pellegrini'),

  // The Prem.
  bath: squad('B. Spencer', 'S. Underhill', 'O. Lawrence', 'W. Muir', 'F. Russell'),
  bristol: squad('H. Randall', 'E. Genge', 'S. Bedlow', 'L. Rees-Zammit', 'A. MacGinty'),
  exeter: squad('S. Maunder', 'E. Roots', 'H. Slade', 'I. Feyi-Waboso', 'H. Skinner'),
  gloucester: squad('T. Williams', 'Z. Mercer', 'S. Atkinson', 'O. Thorley', 'G. Barton'),
  harlequins: squad('D. Care', 'A. Dombrandt', 'L. Northmore', 'C. Murley', 'M. Smith'),
  leicester: squad('J. van Poortvliet', 'O. Chessum', 'D. Kelly', 'O. Hassell-Collins', "J. O'Connor"),
  newcastle: squad('M. Young', 'T. Christie', 'M. Orlando', 'A. Radwan', 'B. Connon'),
  northampton: squad('A. Mitchell', 'H. Pollock', 'F. Dingwall', 'T. Freeman', 'F. Smith'),
  sale: squad('G. Warr', 'B. Curry', 'L. James', 'T. Roebuck', 'G. Ford'),
  saracens: squad('I. van Zyl', 'M. Itoje', 'A. Lozowski', 'E. Daly', 'O. Farrell'),

  // The URC.
  leinster: squad('J. Gibson-Park', 'C. Doris', 'G. Ringrose', 'J. Lowe', 'S. Prendergast'),
  munster: squad('C. Murray', 'T. Beirne', 'T. Farrell', 'C. Nash', 'J. Crowley'),
  ulster: squad('N. Doak', 'I. Henderson', 'S. McCloskey', 'J. Stockdale', 'J. Flannery'),
  connacht: squad('C. Blade', 'C. Prendergast', 'B. Aki', 'M. Hansen', 'J. Carty'),
  cardiff: squad('E. Bevan', 'T. Faletau', 'M. Grady', 'C. Winnett', 'C. Sheedy'),
  dragons: squad('R. Williams', 'A. Wainwright', 'N. Tompkins', 'R. Dyer', 'W. Reed'),
  ospreys: squad('K. Hardy', 'J. Morgan', 'O. Watkin', 'K. Giles', 'D. Edwards'),
  scarlets: squad('G. Davies', 'J. Macleod', 'J. Williams', 'B. Murray', 'I. Lloyd'),
  glasgow: squad('G. Horne', 'R. Darge', 'S. Tuipulotu', 'K. Steyn', 'T. Jordan'),
  edinburgh: squad('B. Vellacott', 'M. Bradbury', 'M. Currie', 'D. Graham', 'B. Healy'),
  benetton: squad('A. Garbisi', 'M. Lamaro', 'T. Menoncello', 'M. Ioane', 'T. Albornoz'),
  zebre: squad('A. Fusco', 'D. Fischetti', 'E. Lucchin', 'S. Gesi', 'G. Da Re'),
  bulls: squad('E. Papier', 'E. Louw', 'D. Kriel', 'K. Arendse', 'H. Pollard'),
  lions: squad('M. van den Berg', 'F. Horn', 'M. Louw', 'E. van der Merwe', 'S. Nohamba'),
  sharks: squad('G. Williams', 'S. Kolisi', 'L. Am', 'M. Mapimpi', 'S. Masuku'),
  stormers: squad('P. de Wet', 'E. Roos', 'R. Nel', 'L. Zas', 'M. Libbok'),

  // The Top 14.
  toulouse: squad('A. Dupont', 'F. Cros', 'P. Barassi', 'T. Ramos', 'R. Ntamack'),
  bordeaux: squad('M. Lucu', 'C. Woki', 'Y. Moefana', 'L. Bielle-Biarrey', 'M. Jalibert'),
  toulon: squad('B. Serin', 'C. Ollivon', "L. Fainga'anuku", 'G. Villière', 'I. West'),
  larochelle: squad('N. Le Garrec', 'G. Alldritt', 'J. Danty', 'D. Leyds', 'A. Hastoy'),
  clermont: squad('B. Jauneau', 'A. Fischer', 'I. Simone', 'A. Raka', 'H. Plummer'),
  racing: squad('U. Seunes', 'W. Rowlands', 'H. Chavancy', 'M. Spring', 'G. Prisciantelli'),
  stadefrancais: squad('J. Gimbert', 'S. Macalou', 'J. Marchant', 'L. Barré', 'L. Carbonel'),
  castres: squad('S. Arata', 'F. Babillot', 'V. Botitu', 'G. Palis', 'J. Sinzelle'),
  montpellier: squad('G. Aprasidze', 'L. Nouchi', 'A. Vincent', 'V. Rattez', 'D. Miotti'),
  pau: squad('T. Daubagna', 'L. Whitelock', 'E. Gailleton', 'T. Attissogbe', 'J. Simmonds'),
  bayonne: squad('L. Coly', 'A. Iturria', 'M. Tuilagi', 'S. Maqala', 'J. Segonds'),
  lyon: squad('B. Couilloud', 'M. Guillard', 'J. Maraku', 'E. Dumortier', 'L. Berdeu'),
  perpignan: squad('T. Ecochard', 'J. Ritchie', 'J. de la Fuente', 'L. Dubois', 'T. Tedder'),
  vannes: squad('S. Kuruvoli', 'M. Alemanno', 'R. Taccola', 'B. Stevenson', 'M. Lafage'),
};

// A side's real five, as a roster, or null for a side we don't know.
export const realRoster = id => (SQUADS[id] ? { ...SQUADS[id] } : null);
