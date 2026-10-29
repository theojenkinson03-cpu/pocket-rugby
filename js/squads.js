// Real players: a squad of fifteen for every nation and club, by the die
// they play: two Scrum Halves, five Forwards, three Centres, three Outside
// Backs (wings and full-backs) and two Fly Halves. The first at each position
// starts by default. Picked from recent squads (2025–26, and the 2026–27
// line-ups where they were known); players move clubs, so some will be out
// of date. Where we can't name fifteen with confidence (Hong Kong, Spain and
// Zimbabwe most of all, and some clubs' benches), the rest of the squad is
// made up, from the same names as made-up sides, and the same every time.
// Names are used only to label the dice; this is an unofficial fan game, not
// affiliated with or endorsed by any player, club, league or union.

import { POSITIONS } from './dice.js';
import { seededRng } from './engine.js';
import { randomRoster } from './players.js';

// How many of each position a squad has.
export const SQUAD_SHAPE = { S: 2, F: 5, C: 3, W: 3, B: 2 };
const list = names => names.split(',').map(n => n.trim()).filter(Boolean);
const squad = (S, F, C, W, B) => ({ S: list(S), F: list(F), C: list(C), W: list(W), B: list(B) });

export const SQUADS = {
  // The 24 nations at the 2027 World Cup.
  nzl: squad('C. Roigard, C. Ratima', 'A. Savea, S. Barrett, W. Sititi, T. Taylor, E. de Groot', 'J. Barrett, R. Ioane, B. Proctor', 'W. Jordan, M. Telea, S. Reece', 'B. Barrett, D. McKenzie'),
  aus: squad('T. McDermott, J. Gordon', 'R. Valetini, F. McReight, W. Skelton, H. Wilson, A. Alaalatoa', 'L. Ikitau, J. Suaalii, H. Paisami', 'M. Jorgensen, T. Wright, A. Kellaway', 'T. Lynagh, B. Donaldson'),
  chi: squad('B. Videla, M. Torrealba', 'M. Sigren, C. Armstrong, J. Eissmann, S. Pedrero, R. Martínez', 'D. Saavedra, M. Garafulic, N. Garafulic', 'I. Ayarza, F. Urroz, J. Larenas', 'S. Videla, R. Fernández'),
  hkg: squad('B. Nell', 'J. Hrstich, C. McFeat-Smith', 'B. Axten-Burrett', 'G. Spanton, M. Rosslee, M. Denmark', 'G. McNeish'),
  rsa: squad('F. de Klerk, J. Hendrikse', 'S. Kolisi, P. du Toit, E. Etzebeth, M. Marx, O. Nché', 'D. de Allende, J. Kriel, A. Esterhuizen', 'C. Kolbe, K. Arendse, A. Fassi', 'S. Feinberg-Mngomezulu, H. Pollard'),
  ita: squad('S. Varney, A. Garbisi', 'M. Lamaro, S. Negri, F. Ruzza, G. Nicotera, D. Fischetti', 'T. Menoncello, I. Brex, M. Zanon', 'A. Capuozzo, M. Ioane, L. Lynagh', 'P. Garbisi, T. Allan'),
  geo: squad('V. Lobzhanidze, G. Aprasidze', 'B. Gorgadze, S. Mamukashvili, G. Gogichashvili, K. Mikautadze, T. Jalagonia', 'M. Sharikadze, G. Kveseladze, D. Tapladze', 'D. Niniashvili, A. Tabutsadze, M. Modebadze', 'L. Matkava, T. Abzhandadze'),
  rou: squad('F. Surugiu, G. Rupanu', 'C. Boboc, C. Chirică, A. Gordaș, A. Motoc, V. Neculau', 'T. Gontineac, F. Tangimana, J. Tomane', 'M. Simionescu, N. Onuțu, I. Dumitru', 'H. Vaovasa, T. Boldor'),
  arg: squad('G. Bertranou, T. Cubelli', 'P. Matera, J. Montoya, G. Petti, J. González, T. Gallo', 'L. Cinti, M. Moroni, S. Chocobares', 'M. Carreras, J. Mallía, B. Delguy', 'T. Albornoz, S. Carreras'),
  fij: squad('F. Lomani, S. Kuruvoli', 'L. Botia, V. Mata, A. Tuisue, T. Ikanivere, E. Mawi', 'S. Radradra, W. Nayacalevu, I. Masi', 'S. Ravutaumada, J. Tuisova, I. Armstrong-Ravula', 'C. Muntz, B. Volavola'),
  esp: squad('E. Bay', 'J. Zabala, T. Futeu', 'A. Gimeno', 'J. Bell', 'G. Vinuesa'),
  can: squad('R. Braude', 'L. Rumball, J. Larsen, D. Sears-Duru, A. Quattrin, M. Flesch', 'B. LeSage, N. Benn', 'C. Coats, K. Lloyd, T. McMullin', "P. Nelson, S. O'Leary"),
  irl: squad('J. Gibson-Park, C. Casey', 'C. Doris, T. Beirne, J. van der Flier, D. Sheehan, T. Furlong', 'G. Ringrose, B. Aki, R. Henshaw', 'J. Lowe, H. Keenan, M. Hansen', 'S. Prendergast, J. Crowley'),
  sco: squad('B. White, G. Horne', 'R. Darge, J. Ritchie, G. Gilchrist, Z. Fagerson, M. Fagerson', 'S. Tuipulotu, H. Jones, S. McDowall', 'B. Kinghorn, D. van der Merwe, K. Steyn', 'F. Russell, A. Hastings'),
  uru: squad('S. Arata, B. Basso', 'M. Ardao, G. Kessler, M. Sanguinetti, M. Diana, S. Civetta', 'A. Vilaseca, N. Freitas', 'B. Amaya, R. Silva, G. Mieres', 'F. Etcheverry, F. Berchesi'),
  por: squad('S. Marques, J. Belo', 'N. Martins, M. Tadjer, D. Hasse Ferreira, J. Granate, R. Simões', 'J. Lima, T. Appleton, P. Bettencourt', 'R. Storti, V. Pinto, N. Sousa Guedes', 'J. Portela, J. Moura'),
  fra: squad('A. Dupont, M. Lucu', 'G. Alldritt, F. Cros, C. Ollivon, J. Marchand, U. Atonio', 'G. Fickou, Y. Moefana, E. Gailleton', 'L. Bielle-Biarrey, D. Penaud, T. Ramos', 'R. Ntamack, M. Jalibert'),
  jpn: squad('N. Saito, Y. Nagare', 'M. Leitch, K. Himeno, W. Dearns, A. Sakate, K. Inagaki', 'D. Riley, R. Nakamura, T. Osada', 'K. Matsushima, J. Naikabula, Y. Yazaki', 'S. Lee, R. Matsuda'),
  usa: squad('R. de Haas, N. Augspurger', "G. Peterson, H. Germishuys, K. Pifeleti, D. Ainu'u, C. Dolan", 'P. Lasike, B. Campbell', 'C. Dyer, W. Hooley', 'A. MacGinty, L. Carty'),
  sam: squad('J. Taumateine, M. Matavao', 'T. McFarland, S. Lam, M. Alaalatoa, F. Lee, S. Luatua', "T. Manu, U. Seuteni, D. Paia'aua", 'N. Ah Wong, B. Lam, D. Toala', 'D. Leuila, L. Sopoaga'),
  eng: squad('A. Mitchell, J. van Poortvliet', 'M. Itoje, B. Earl, T. Curry, E. Genge, J. George', 'O. Lawrence, F. Dingwall, H. Slade', 'T. Freeman, T. Roebuck, F. Steward', 'F. Smith, G. Ford'),
  wal: squad('T. Williams, R. Williams', 'J. Morgan, D. Jenkins, A. Wainwright, D. Lake, G. Thomas', 'B. Thomas, N. Tompkins, J. Hawkins', 'L. Rees-Zammit, T. Rogers, B. Murray', 'D. Edwards, S. Costelow'),
  ton: squad('S. Takulua, A. Pulu', 'V. Fifita, B. Tameifuna, S. Lousi, P. Ngauamo, T. Halaifonua', 'P. Ahki, M. Fekitoa, G. Moala', 'S. Kata, C. Piutau, A. Taumoepeau', 'W. Havili, P. Pellegrini'),
  zim: squad('H. Mudariki', 'G. Muzanargwo, J. Fraser, A. Burnett', 'B. Mudzekenyedzi, M. McNab', 'T. Mafura', 'I. Prior'),

  // Super Rugby Pacific.
  blues: squad('F. Christie, S. Nock', "H. Sotutu, P. Tuipulotu, D. Papali'i, K. Eklund, O. Tu'ungafasi", 'R. Ioane, A. Lam', 'C. Clarke, M. Telea, Z. Sullivan', 'B. Barrett, S. Perofeta'),
  chiefs: squad('C. Ratima, X. Roe', "W. Sititi, L. Jacobson, S. Taukei'aho, J. Lord, T. Vaa'i", 'Q. Tupaea, A. Lienert-Brown, D. Rona', 'S. Stevenson, E. Narawa, L. Carter', 'D. McKenzie, J. Debreczeni'),
  crusaders: squad('N. Hotham, M. Drummond', 'E. Blackadder, S. Barrett, C. Taylor, G. Bower, C. Lio-Willie', 'D. Havili, B. Ennor, L. Aumua', 'W. Jordan, S. Reece, M. Springer', "T. Kemara, R. Mo'unga"),
  highlanders: squad('F. Fakatava', 'E. de Groot, B. Harmon, F. Holland, J. Ainsley, H. Renton', 'T. Tavatavanawai, T. Umaga-Jensen', 'J. Nareki, J. Lowe, C. Tangitau', 'C. Millar, A. Faleafaga'),
  hurricanes: squad('C. Roigard', 'P. Lakai, D. Kirifi, I. Walker-Leawere, A. Aumua, T. Lomax', 'B. Proctor, J. Barrett, P. Umaga-Jensen', 'R. Love, J. Moorby, K. Naholo', 'B. Cameron'),
  brumbies: squad('R. Lonergan', 'R. Valetini, T. Hooper, N. Frost, B. Pollard, A. Alaalatoa', 'D. Feliuai, L. Ikitau', 'T. Wright, C. Toole, A. Muirhead', 'T. Edmed, N. Lolesio'),
  reds: squad('T. McDermott, K. Thomas', 'H. Wilson, F. McReight, L. Wright, J. Nasser, S. Uru', 'H. Paisami, J. Flook', 'J. Campbell, F. Daugunu, T. Ryan', 'T. Lynagh, H. McLaughlin-Phillips'),
  waratahs: squad('J. Gordon', 'C. Gamble, L. Gleeson, J. Holloway, A. Bell, D. Porecki', 'J. Suaalii, L. Foketi, I. Perese', 'M. Jorgensen, A. Kellaway, D. Lancaster', 'L. Creighton, J. Bowen'),
  force: squad('N. White, I. Fines-Leleiwasa', 'J. Williams, C. Tizzano, N. Champion de Crespigny, T. Robertson', 'H. Stewart, K. Godwin', 'D. Pietsch, Z. Kibirige', 'B. Donaldson'),
  drua: squad('F. Lomani', 'M. Derenalagi, M. Doge, T. Ikanivere, I. Nasilasila, K. Salawa', 'I. Masi', 'S. Ravutaumada, T. Rakuro', 'I. Armstrong-Ravula, C. Muntz'),
  moana: squad('A. Pulu', 'M. Faiilagi, S. Havili Talitui, E. Lindenmuth', 'F. Inisi, L. Lalomilo', 'S. Alaimalo', 'P. Pellegrini, W. Havili'),

  // The Prem.
  bath: squad('B. Spencer, T. Carr-Smith', 'S. Underhill, T. Dunn, C. Ewels, T. du Toit, A. Barbeary', 'O. Lawrence, C. Redpath, M. Ojomoh', 'W. Muir, J. Cokanasiga, T. de Glanville', 'F. Russell, O. Bailey'),
  bristol: squad('H. Randall', 'E. Genge, F. Harding, H. Thacker, J. Joyce', 'S. Bedlow, B. Janse van Rensburg', 'L. Rees-Zammit, G. Ibitoye, K. Ravouvou', 'A. MacGinty'),
  exeter: squad('S. Maunder', 'E. Roots, G. Fisilau, R. Vintcent, J. Yeandle, D. Jenkins', 'H. Slade, O. Devoto', 'I. Feyi-Waboso, J. Hodge, T. Wyatt', 'H. Skinner'),
  gloucester: squad('T. Williams, C. Chapman', 'Z. Mercer, R. Ackermann, F. Clarke, F. Balmain, S. Socino', 'S. Atkinson, C. Harris, M. Llewellyn', 'O. Thorley, J. May, S. Carreras', 'G. Barton, A. Hastings'),
  harlequins: squad('D. Care', 'A. Dombrandt, C. Cunningham-South, W. Evans, F. Baxter, J. Walker', 'L. Northmore, O. Beard, A. Esterhuizen', 'C. Murley, T. Green, N. David', 'M. Smith, J. Evans'),
  leicester: squad('J. van Poortvliet', 'O. Chessum, H. Liebenberg, T. Reffell, J. Heyes', 'D. Kelly, S. Kata, M. Scott', 'O. Hassell-Collins, F. Steward', "J. O'Connor"),
  newcastle: squad('M. Young', 'T. Christie, C. Chick, J. Blamire', 'M. Orlando', 'A. Radwan', 'B. Connon'),
  northampton: squad('A. Mitchell, T. James', 'H. Pollock, A. Coles, C. Langdon, E. Iyogun, S. Graham', 'F. Dingwall, R. Hutchinson, B. Odendaal', 'T. Freeman, O. Sleightholme, G. Hendy', 'F. Smith'),
  sale: squad('G. Warr, R. Quirke', 'B. Curry, T. Curry, J. du Preez, B. Rodd, L. Cowan-Dickie', 'L. James, R. du Preez, S. James', 'T. Roebuck, A. Reed, J. Carpenter', 'G. Ford'),
  saracens: squad('I. van Zyl', 'M. Itoje, B. Earl, J. George, T. McFarland, T. Willis', 'A. Lozowski, O. Hartley, L. Cinti', 'E. Daly, R. Segun, M. Malins', 'O. Farrell, F. Burke'),

  // The URC.
  leinster: squad('J. Gibson-Park, L. McGrath', 'C. Doris, J. van der Flier, D. Sheehan, T. Furlong, J. Ryan', 'G. Ringrose, R. Henshaw, J. Osborne', "J. Lowe, H. Keenan, T. O'Brien", 'S. Prendergast, H. Byrne'),
  munster: squad('C. Murray, C. Casey', "T. Beirne, G. Coombes, D. Barron, J. Kleyn, J. O'Donoghue", "T. Farrell, A. Nankivell, S. O'Brien", 'C. Nash, S. Daly, M. Haley', 'J. Crowley'),
  ulster: squad('N. Doak', "I. Henderson, N. Timoney, T. Stewart, K. Treadwell, T. O'Toole", 'S. McCloskey, J. Postlethwaite, S. Moore', 'J. Stockdale, R. Baloucoune, Z. Ward', 'J. Flannery'),
  connacht: squad('C. Blade, M. Devine', 'C. Prendergast, P. Boyle, D. Heffernan, F. Bealham, J. Murphy', 'B. Aki, C. Forde, D. Hawkshaw', 'M. Hansen, S. Bolton, F. Treacy', 'J. Carty, S. Gilbert'),
  cardiff: squad('E. Bevan', 'T. Faletau, L. Belcher, C. Domachowski, J. Turnbull', 'M. Grady, B. Thomas, R. Lee-Lo', 'C. Winnett, J. Adams, T. Cabango', 'C. Sheedy'),
  dragons: squad('R. Williams', 'A. Wainwright, B. Carter, E. Dee, T. Basham', 'N. Tompkins, S. Tomkinson', 'R. Dyer, J. Rosser, A. Hewitt', "W. Reed, A. O'Brien"),
  ospreys: squad('K. Hardy, R. Morgan-Williams', 'J. Morgan, D. Lake, A. Beard, G. Thomas, M. Morris', 'O. Watkin, K. Williams', 'K. Giles, L. Morgan, J. Walsh', 'D. Edwards'),
  scarlets: squad('G. Davies, A. Hughes', 'J. Macleod, R. Elias, J. Price, V. Fifita, S. Lousi', 'J. Williams, J. Roberts, E. James', 'B. Murray, R. Conbeer, T. Rogers', 'I. Lloyd, S. Costelow'),
  glasgow: squad('G. Horne, J. Dobie', 'R. Darge, S. Cummings, Z. Fagerson, J. Matthews, M. Fagerson', 'S. Tuipulotu, H. Jones, S. McDowall', 'K. Steyn, K. Rowe, S. Cancelliere', 'T. Jordan, R. Thompson'),
  edinburgh: squad('B. Vellacott, A. Price', 'M. Bradbury, G. Gilchrist, P. Schoeman, E. Ashman, B. Muncaster', 'M. Currie, J. Lang', 'D. Graham, D. van der Merwe, H. Paterson', 'B. Healy'),
  benetton: squad('A. Garbisi', 'M. Lamaro, S. Negri, F. Ruzza, L. Cannone, R. Favretto', 'T. Menoncello, I. Brex', 'M. Ioane, R. Smith, I. Mendy', 'T. Albornoz, J. Umaga'),
  zebre: squad('A. Fusco', 'D. Fischetti, G. Zilocchi', 'E. Lucchin, T. Boni', 'S. Gesi, G. Bertaccini', 'G. Da Re'),
  bulls: squad('E. Papier', 'E. Louw, R. Nortjé, M. van Staden, J. Grobbelaar, W. Louw', 'D. Kriel, H. Vorster, S. Gans', 'K. Arendse, C. Moodie, W. le Roux', 'H. Pollard, J. Goosen'),
  lions: squad('M. van den Berg', 'F. Horn, R. Venter, P. Botha', 'M. Louw, H. van Wyk', 'E. van der Merwe, Q. Horn', 'S. Nohamba, J. Hendrikse'),
  sharks: squad('G. Williams, J. Hendrikse', 'S. Kolisi, E. Etzebeth, B. Mbonambi, O. Nché, P. Buthelezi', 'L. Am, E. Hooker', 'M. Mapimpi, A. Fassi', 'S. Masuku, C. Bosch'),
  stormers: squad('P. de Wet, H. Jantjies', 'E. Roos, S. Moerat, D. Fourie, F. Malherbe, R. Elstadt', 'R. Nel, D. Willemse, D. du Plessis', 'L. Zas, S. Hartzenberg, W. Gelant', 'M. Libbok'),

  // The Top 14.
  toulouse: squad('A. Dupont, P. Graou', 'F. Cros, A. Jelonch, P. Mauvaka, C. Baille, E. Meafou', 'P. Barassi, P. Ahki, S. Chocobares', 'T. Ramos, M. Lebel, J. Mallía', 'R. Ntamack'),
  bordeaux: squad('M. Lucu', 'C. Woki, P. Samu, B. Tameifuna, M. Lamothe, G. Petti', 'Y. Moefana, N. Depoortère, P. Uberti', 'L. Bielle-Biarrey, D. Penaud, R. Buros', 'M. Jalibert, J. Carbery'),
  toulon: squad('B. Serin', 'C. Ollivon, T. Baubigny, D. Priso, D. Ribbans, L. Ludlam', "L. Fainga'anuku", 'G. Villière, J. Wainiqolo, M. Jaminet', 'I. West'),
  larochelle: squad('N. Le Garrec, T. Kerr-Barlow', 'G. Alldritt, L. Botia, W. Skelton, U. Atonio, O. Jégou', 'J. Danty, U. Seuteni', 'D. Leyds, T. Thomas, B. Dulin', 'A. Hastoy'),
  clermont: squad('B. Jauneau', 'A. Fischer, F. Lee, T. Lanen, P. Jedrasiak', 'I. Simone, G. Moala', 'A. Raka', 'H. Plummer, A. Belleau'),
  racing: squad('U. Seunes', 'W. Rowlands, I. Diallo, H. Kolingar, P. Narisia', 'H. Chavancy, G. Fickou', 'M. Spring, J. Tuisova', 'G. Prisciantelli'),
  stadefrancais: squad('J. Gimbert', 'S. Macalou, G. Melikidze, P. Alo-Emile', 'J. Marchant, T. Vili', 'L. Barré', 'L. Carbonel, Z. Henry'),
  castres: squad('S. Arata, J. Fernandez', 'F. Babillot', 'V. Botitu', 'G. Palis', 'J. Sinzelle, P. Popelin'),
  montpellier: squad('G. Aprasidze', 'L. Nouchi, P. Willemse, M. Haouas, A. Bécognée', 'A. Vincent', "V. Rattez, A. Bouthier, G. N'Gandebe", 'D. Miotti'),
  pau: squad('T. Daubagna', 'L. Whitelock', 'E. Gailleton, F. Brau-Boirie', 'T. Attissogbe', 'J. Simmonds'),
  bayonne: squad('L. Coly', 'A. Iturria, U. Cassiem', 'M. Tuilagi', 'S. Maqala, A. Luc', 'J. Segonds'),
  lyon: squad('B. Couilloud', 'M. Guillard, D. Cretin, K. Geraci', 'J. Maraku', 'E. Dumortier, D. Niniashvili', 'L. Berdeu'),
  perpignan: squad('T. Ecochard', 'J. Ritchie', 'J. de la Fuente', 'L. Dubois, A. Duguivalu', 'T. Tedder'),
  vannes: squad('S. Kuruvoli', 'M. Alemanno', 'R. Taccola, F. Saili', 'B. Stevenson, S. Rayasi', 'M. Lafage'),
};

// A side's real starting five, as a roster, or null for a side we don't know.
export const realRoster = id => (SQUADS[id] ? Object.fromEntries(POSITIONS.map(p => [p, SQUADS[id][p][0]])) : null);

// A number from a side's id, so its made-up players are always the same.
const seedOf = id => [...id].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);

// A side's squad of fifteen, [{name, pos}] in position order, the starters
// first at each position. Places we can't fill with real players get made-up
// names in the side's `flavour`; a side we don't know is made up entirely.
export function realSquad(id, flavour = 'any') {
  const known = SQUADS[id] || { S: [], F: [], C: [], W: [], B: [] };
  const rng = seededRng(seedOf(id));
  const surname = name => name.replace(/^[A-Z]\.\s*/, '');
  const taken = new Set(POSITIONS.flatMap(p => known[p].map(surname)));
  const squad = [];
  for (const pos of POSITIONS) {
    const names = [...known[pos]];
    for (let guard = 0; names.length < SQUAD_SHAPE[pos] && guard < 400; guard++) {
      const name = randomRoster(flavour, rng)[pos];
      // A new surname if there's one left; any new name after that.
      if (!taken.has(surname(name)) || (guard > 200 && !names.includes(name))) {
        taken.add(surname(name));
        names.push(name);
      }
    }
    for (const name of names) squad.push({ name, pos });
  }
  return squad;
}
