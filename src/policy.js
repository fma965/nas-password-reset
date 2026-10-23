// The rules for a password somebody chooses themselves. Length matters most; a long passphrase is allowed
// without mixing character types. The generated password (TrueNAS makes it) does not go through this.
export const MIN_LENGTH = 14;
export const PASSPHRASE_LENGTH = 20;
export const MAX_LENGTH = 128;

export const REQUIREMENTS = [
  `At least ${MIN_LENGTH} characters, mixing at least three of: lower case, upper case, numbers, symbols; or a passphrase of ${PASSPHRASE_LENGTH} or more characters`,
  `No more than ${MAX_LENGTH} characters, and no space at the start or end`,
  'Not a common password, and not your user name',
  'No runs of the same character (aaaa) or of a sequence (1234, abcd, qwer)',
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
const SEQUENCES = [
  'abcdefghijklmnopqrstuvwxyz',
  '0123456789',
  'qwertyuiop',
  'asdfghjkl',
  'zxcvbnm',
  '1qaz2wsx3edc',
];

function hasSequence(lower) {
  const chars = [...lower];
  for (let i = 0; i + 4 <= chars.length; i++) {
    const run = chars.slice(i, i + 4).join('');
    const reversed = [...run].reverse().join('');
    if (SEQUENCES.some((s) => s.includes(run) || s.includes(reversed))) return true;
  }
  return false;
}

function isCommon(password) {
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) return true;
  // "P@ssw0rd2024!" -> strip trailing digits and symbols, undo common letter swaps
  const stem = lower.replace(/[^a-z]+$/, '').replace(/[@43!1$57]/g, (c) => LEET[c] ?? c).replace(/0/g, 'o');
  if (COMMON.has(stem)) return true;
  if ([...password].length < PASSPHRASE_LENGTH && FRAGMENTS.some((word) => stem.includes(word) || lower.includes(word))) return true;
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
  if (password !== password.trim()) problems.push('Remove the space at the start or end');
  if (length < MIN_LENGTH) problems.push(`Use at least ${MIN_LENGTH} characters`);
  else if (length < PASSPHRASE_LENGTH && classes < 3) {
    problems.push(`Mix at least three of: lower case, upper case, numbers, symbols (or use ${PASSPHRASE_LENGTH} or more characters)`);
  }
  if (new Set(password).size < 8) problems.push('Use more different characters');
  if (/(.)\1{3,}/u.test(password)) problems.push('Avoid four of the same character in a row');
  if (hasSequence(lower)) problems.push('Avoid runs such as 1234, abcd or qwer');
  if (names.some((name) => name && lower.includes(String(name).toLowerCase()))) problems.push('Do not include your user name');
  if (isCommon(password)) problems.push('That is a common password');
  return problems;
}
