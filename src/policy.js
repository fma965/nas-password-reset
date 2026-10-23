// The rules for a password somebody chooses themselves: at least 14 characters using at least three of lower case,
// upper case, numbers and symbols; not a common password; not the user name. (Quietly, for safety: at most 128
// characters and no control characters.) The generated password (TrueNAS makes it) does not go through this.
export const MIN_LENGTH = 14;
export const MAX_LENGTH = 128;

export const REQUIREMENTS = [
  `At least ${MIN_LENGTH} characters, using at least three of: lower case, upper case, numbers, symbols`,
  'Not a common password, and not your user name',
];

const COMMON = new Set(`password passw0rd password1 password12 password123 passwort 123456 1234567 12345678 123456789 1234567890
qwerty qwerty1 qwerty123 qwertyuiop azerty abc123 abcd1234 letmein welcome welcome1 welcome123 monkey dragon master sunshine
princess football baseball basketball iloveyou admin admin123 administrator login starwars trustno1 whatever freedom shadow
superman batman spiderman michael jessica charlie hunter harley ranger summer winter spring autumn ashley nicole daniel
thomas george hello hello123 changeme secret computer internet cheese pepper ginger buster soccer hockey killer pokemon
minecraft liverpool arsenal chelsea manchester london england britain cambridge oxford secure security default guest
test test123 testing temp temp123 user username root toor passme letmein1 password! mustang access flower hottie loveme
zaq12wsx 1qaz2wsx qazwsx qazwsxedc f9casa truenas homelab fileserver nas network ilovemydog ilovemycat
trustno1 starwars1 football1 baseball1 superman1 passw0rd1 p4ssw0rd p455w0rd`.split(/\s+/));

const FRAGMENTS = ['password', 'passw0rd', 'letmein', 'welcome', 'qwerty', 'iloveyou', 'admin', 'truenas'];
const LEET = { '@': 'a', 4: 'a', 3: 'e', 1: 'l', '!': 'i', 0: 'o', $: 's', 5: 's', 7: 't' };
const LONG_ENOUGH_TO_SKIP_FRAGMENTS = 20;

function isCommon(password) {
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) return true;
  // "P@ssw0rd2024!" -> strip trailing digits and symbols, undo common letter swaps
  const stem = lower.replace(/[^a-z]+$/, '').replace(/[@43!1$57]/g, (c) => LEET[c] ?? c).replace(/0/g, 'o');
  if (COMMON.has(stem)) return true;
  if ([...password].length < LONG_ENOUGH_TO_SKIP_FRAGMENTS && FRAGMENTS.some((word) => stem.includes(word) || lower.includes(word))) return true;
  return false;
}

// Returns a list of plain-English problems; empty when the password is acceptable.
export function checkPassword(password, { names = [] } = {}) {
  if (typeof password !== 'string' || password.length === 0) return ['Enter a password'];
  const problems = [];
  const length = [...password].length;
  const lower = password.toLowerCase();
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;

  if (length > MAX_LENGTH) problems.push(`Use at most ${MAX_LENGTH} characters`);
  if (/[\u0000-\u001f\u007f]/.test(password)) problems.push('Remove control characters');
  if (length < MIN_LENGTH) problems.push(`Use at least ${MIN_LENGTH} characters`);
  if (classes < 3) problems.push('Use at least three of: lower case, upper case, numbers, symbols');
  if (names.some((name) => name && lower.includes(String(name).toLowerCase()))) problems.push('Do not include your user name');
  if (isCommon(password)) problems.push('That is a common password');
  return problems;
}
