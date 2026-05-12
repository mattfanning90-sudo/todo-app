  const ADJECTIVES = ['Fluffy','Bouncy','Sleepy','Sparkly','Dizzy','Fuzzy','Wiggly','Wobbly','Zippy','Bubbly','Giggly','Squishy','Crunchy','Goofy','Wacky','Zany','Loopy','Nutty','Snappy','Perky','Peppy','Clumsy','Grumpy','Jumpy','Funky','Chunky','Spunky','Quirky','Ditzy','Kooky','Daffy','Blobby','Noodly','Bonkers','Swirly','Twirly','Pudgy','Floppy','Droopy','Squirmy'];
  const NOUNS = ['Penguin','Waffle','Noodle','Biscuit','Pickle','Muffin','Panda','Narwhal','Platypus','Hedgehog','Capybara','Quokka','Axolotl','Sloth','Lemur','Meerkat','Puffin','Wombat','Dumpling','Crumpet','Bagel','Pretzel','Donut','Brownie','Pudding','Sprinkle','Marshmallow','Jellybean','Cookie','Cupcake','Taco','Burrito','Blobfish','Salamander','Armadillo','Croissant','Scone','Churro','Macaron','Turnip'];

  function randomUsername() {
    const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const n = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    return `${a}${n}`;
  }

  const errors = {
    invalid: 'Invalid email or password.',
    taken: 'An account with that email already exists.',
    username_taken: 'That username is already taken — try another or generate a random one.',
    username_invalid: 'Username must be 3–30 characters: letters, numbers and underscores only.',
    weak: 'Password must be at least 12 characters with upper and lower case letters and a number.',
    short: 'Password must be at least 12 characters with upper and lower case letters and a number.',
    missing: 'Email and password are required.',
    server: 'Something went wrong. Please try again.',
  };

  const params = new URLSearchParams(location.search);
  let isSignup = params.get('mode') === 'signup';
  let usernameMode = 'random';
  let checkTimer = null;
  let currentStatus = 'available';

  function setUsernameMode(mode) {
    usernameMode = mode;
    const input = document.getElementById('username-input');
    const genBtn = document.getElementById('gen-btn');
    const row = document.getElementById('username-row');

    document.getElementById('tab-random').classList.toggle('active', mode === 'random');
    document.getElementById('tab-custom').classList.toggle('active', mode === 'custom');

    if (mode === 'random') {
      input.readOnly = true;
      genBtn.style.display = '';
      input.style.color = '';
      refreshUsername();
    } else {
      input.readOnly = false;
      genBtn.style.display = 'none';
      input.value = '';
      input.placeholder = 'cooluser42';
      input.focus();
      setStatus('hint', '✨ Choose your @handle');
      row.className = 'username-row';
      currentStatus = null;
    }
  }

  function refreshUsername() {
    const input = document.getElementById('username-input');
    const btn = document.getElementById('gen-btn');
    const candidate = randomUsername();
    input.value = candidate;
    btn.querySelector('svg').style.transform = 'rotate(360deg)';
    setTimeout(() => btn.querySelector('svg').style.transform = '', 300);
    checkAvailability(candidate, true);
  }

  function setStatus(type, msg) {
    const el = document.getElementById('username-status');
    el.className = 'username-status ' + type;
    el.textContent = msg;
    const row = document.getElementById('username-row');
    row.classList.remove('valid', 'invalid');
    if (type === 'available') { row.classList.add('valid'); currentStatus = 'available'; }
    else if (type === 'taken') { row.classList.add('invalid'); currentStatus = 'taken'; }
    else { currentStatus = null; }
    updateSubmitState();
  }

  function updateSubmitState() {
    const btn = document.getElementById('submit-btn');
    if (isSignup) {
      btn.disabled = currentStatus !== 'available';
    } else {
      btn.disabled = false;
    }
  }

  async function checkAvailability(username, silent = false) {
    if (!username) { setStatus('hint', '✨ Your unique @handle'); return; }
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
      setStatus('taken', '✗ 3–30 chars, letters/numbers/underscores only');
      return;
    }
    if (!silent) setStatus('checking', 'Checking…');
    try {
      const res = await fetch(`/api/check-username?username=${encodeURIComponent(username)}`);
      const data = await res.json();
      if (data.available) setStatus('available', '✓ Available');
      else setStatus('taken', '✗ Already taken');
    } catch {
      setStatus('hint', '✨ Your unique @handle');
    }
  }

  function updateGoogleBtn() {
    const remember = document.getElementById('remember');
    document.getElementById('google-btn').href = remember.checked ? '/auth/google?remember=1' : '/auth/google';
  }

  function applyMode() {
    const form = document.getElementById('auth-form');
    form.action = isSignup ? '/auth/signup' : '/auth/login';
    document.getElementById('form-title').textContent = isSignup ? 'Create account' : 'Welcome back';
    document.getElementById('submit-btn').textContent = isSignup ? 'Create Account' : 'Sign In';
    document.getElementById('subtitle').textContent = isSignup ? 'Get started for free.' : 'Sign in to access your tasks.';
    document.getElementById('toggle-text').textContent = isSignup ? 'Already have an account?' : "Don't have an account?";
    document.getElementById('toggle-link').textContent = isSignup ? 'Sign in' : 'Create one';
    document.getElementById('remember-row').style.display = isSignup ? 'none' : 'flex';
    document.getElementById('name-group').style.display = isSignup ? 'block' : 'none';
    document.getElementById('username-group').style.display = isSignup ? 'block' : 'none';
    if (isSignup) {
      setUsernameMode('random');
    } else {
      updateSubmitState();
    }
  }

  function toggleMode() {
    isSignup = !isSignup;
    document.getElementById('error-box').style.display = 'none';
    applyMode();
  }

  // Live validation for custom username
  document.getElementById('username-input').addEventListener('input', e => {
    if (usernameMode !== 'custom') return;
    const val = e.target.value.trim();
    clearTimeout(checkTimer);
    if (!val) { setStatus('hint', '✨ Your unique @handle'); return; }
    setStatus('checking', 'Checking…');
    checkTimer = setTimeout(() => checkAvailability(val), 450);
  });

  const error = params.get('error');
  if (error && errors[error]) {
    const box = document.getElementById('error-box');
    box.textContent = errors[error];
    box.style.display = 'block';
  }

  document.getElementById('remember').addEventListener('change', updateGoogleBtn);

  // Handle invite link
  const inviteToken = params.get('invite');
  const inviteEmail = params.get('email');
  if (inviteToken) {
    isSignup = true;
    document.getElementById('invite-token').value = inviteToken;
    if (inviteEmail) {
      document.getElementById('email').value = inviteEmail;
      document.getElementById('email').readOnly = true;
      document.getElementById('email').style.opacity = '0.7';
    }
    fetch(`/api/invite/${inviteToken}`)
      .then(r => r.json())
      .then(data => {
        if (data.inviterName) {
          const banner = document.getElementById('invite-banner');
          document.getElementById('invite-banner-text').textContent =
            `${data.inviterName} invited you to collaborate on their board. Create an account to join.`;
          banner.style.display = 'block';
        }
      })
      .catch(() => {});
  }

  document.addEventListener('click', e => {
    const modeBtn = e.target.closest('[data-username-mode]');
    if (modeBtn) { setUsernameMode(modeBtn.dataset.usernameMode); return; }
    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;
    const map = { refreshUsername, toggleMode };
    const fn = map[actionEl.dataset.action];
    if (fn) fn();
  });

  applyMode();
