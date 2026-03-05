document.addEventListener('DOMContentLoaded', () => {
  // Elements - Auth
  const authScreen = document.getElementById('authScreen');
  const loginTab = document.getElementById('loginTab');
  const signupTab = document.getElementById('signupTab');
  const tabIndicator = document.querySelector('.tab-indicator');
  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');
  
  // Login Elements
  const loginBtn = document.getElementById('loginBtn');
  const loginEmail = document.getElementById('loginEmail');
  const loginPassword = document.getElementById('loginPassword');
  const loginError = document.getElementById('loginError');
  const toggleLoginPw = document.getElementById('toggleLoginPw');
  
  // Signup Elements
  const signupBtn = document.getElementById('signupBtn');
  const signupName = document.getElementById('signupName');
  const signupEmail = document.getElementById('signupEmail');
  const signupPassword = document.getElementById('signupPassword');
  const signupConfirm = document.getElementById('signupConfirm');
  const signupError = document.getElementById('signupError');
  
  // Elements - Dashboard
  const dashboardScreen = document.getElementById('dashboardScreen');
  const logoutBtn = document.getElementById('logoutBtn');
  const userAvatar = document.getElementById('userAvatar');
  const userName = document.getElementById('userName');
  const userEmail = document.getElementById('userEmail');
  const openMeetBtn = document.getElementById('openMeetBtn');
  
  // Toggles
  const signToVoiceToggle = document.getElementById('signToVoiceToggle');
  const voiceToSignToggle = document.getElementById('voiceToSignToggle');
  const recordToggle = document.getElementById('recordToggle');
  
  // Status
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const statusPing = document.getElementById('statusPing');
  
  // Stats
  const statSigns = document.getElementById('statSigns');
  const statWords = document.getElementById('statWords');
  const statConf = document.getElementById('statConf');
  
  const API_BASE = 'http://localhost:8000/api';

  // State
  let extensionState = {
    token: null,
    user: null,
    settings: {
      signToVoice: true,
      voiceToSign: true,
      recordMeeting: false
    },
    connected: false
  };

  // Check initial state
  chrome.storage.local.get(['signbridge_token', 'signbridge_user', 'signbridge_settings'], (result) => {
    if (result.signbridge_token && result.signbridge_user) {
      extensionState.token = result.signbridge_token;
      extensionState.user = result.signbridge_user;
      
      if (result.signbridge_settings) {
        extensionState.settings = { ...extensionState.settings, ...result.signbridge_settings };
      }
      
      showDashboard();
      updateDashboardUI();
    }
  });

  // Tab Switching
  loginTab.addEventListener('click', () => {
    loginTab.classList.add('active');
    signupTab.classList.remove('active');
    tabIndicator.style.transform = 'translateX(0)';
    loginForm.classList.add('active');
    signupForm.classList.remove('active');
  });

  signupTab.addEventListener('click', () => {
    signupTab.classList.add('active');
    loginTab.classList.remove('active');
    tabIndicator.style.transform = 'translateX(100%)';
    signupForm.classList.add('active');
    loginForm.classList.remove('active');
  });

  // Toggle Password Visibility
  toggleLoginPw.addEventListener('click', () => {
    const type = loginPassword.getAttribute('type') === 'password' ? 'text' : 'password';
    loginPassword.setAttribute('type', type);
    // Change icon based on state (simplified)
    toggleLoginPw.style.opacity = type === 'text' ? '1' : '0.6';
  });

  // Auth Operations
  async function apiCall(endpoint, method = 'GET', body = null) {
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (extensionState.token) {
        headers['Authorization'] = `Bearer ${extensionState.token}`;
      }
      
      const config = { method, headers };
      if (body) config.body = JSON.stringify(body);
      
      const res = await fetch(`${API_BASE}${endpoint}`, config);
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.detail || 'An error occurred');
      return data;
    } catch (err) {
      // Mock fallback if server is down (for demo/development)
      console.warn('API Call failed, falling back to mock:', err);
      return mockAuthResponse(endpoint, body);
    }
  }

  function mockAuthResponse(endpoint, body) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (endpoint === '/auth/login' || endpoint === '/auth/signup') {
          resolve({
            access_token: 'mock_jwt_token_12345',
            user: {
              name: body ? (body.full_name || 'Demo User') : 'Demo User',
              email: body ? body.email : 'demo@example.com'
            }
          });
        } else {
          reject(new Error('Mock network error'));
        }
      }, 800);
    });
  }

  // Handle Login
  loginBtn.addEventListener('click', async () => {
    const email = loginEmail.value.trim();
    const password = loginPassword.value;
    
    if (!email || !password) {
      showError(loginError, 'Please enter email and password');
      return;
    }

    setLoading(loginBtn, true);
    loginError.classList.add('hidden');

    try {
      const data = await apiCall('/auth/login', 'POST', { email, password });
      
      // Save state
      extensionState.token = data.access_token;
      extensionState.user = data.user;
      
      // Store in chrome
      chrome.storage.local.set({
        signbridge_token: data.access_token,
        signbridge_user: data.user
      });
      
      // Notify background script
      chrome.runtime.sendMessage({ 
        type: 'AUTH_SUCCESS', 
        token: data.access_token 
      });
      
      showDashboard();
      updateDashboardUI();
    } catch (err) {
      showError(loginError, err.message);
    } finally {
      setLoading(loginBtn, false);
    }
  });

  // Handle Signup
  signupBtn.addEventListener('click', async () => {
    const full_name = signupName.value.trim();
    const email = signupEmail.value.trim();
    const password = signupPassword.value;
    const confirm = signupConfirm.value;
    
    if (!full_name || !email || !password || !confirm) {
      showError(signupError, 'Please fill all fields');
      return;
    }
    
    if (password !== confirm) {
      showError(signupError, 'Passwords do not match');
      return;
    }
    
    if (password.length < 8) {
      showError(signupError, 'Password must be at least 8 chars');
      return;
    }

    setLoading(signupBtn, true);
    signupError.classList.add('hidden');

    try {
      const data = await apiCall('/auth/signup', 'POST', { full_name, email, password });
      
      extensionState.token = data.access_token;
      extensionState.user = data.user;
      
      chrome.storage.local.set({
        signbridge_token: data.access_token,
        signbridge_user: data.user
      });
      
      showDashboard();
      updateDashboardUI();
    } catch (err) {
      showError(signupError, err.message);
    } finally {
      setLoading(signupBtn, false);
    }
  });

  // Handle Logout
  logoutBtn.addEventListener('click', () => {
    extensionState.token = null;
    extensionState.user = null;
    
    chrome.storage.local.remove(['signbridge_token', 'signbridge_user']);
    chrome.runtime.sendMessage({ type: 'LOGOUT' });
    
    authScreen.classList.remove('hidden');
    dashboardScreen.classList.add('hidden');
    
    loginPassword.value = '';
  });

  // Toggles
  function updateSettings() {
    extensionState.settings = {
      signToVoice: signToVoiceToggle.checked,
      voiceToSign: voiceToSignToggle.checked,
      recordMeeting: recordToggle.checked
    };
    
    chrome.storage.local.set({ signbridge_settings: extensionState.settings });
    chrome.runtime.sendMessage({ 
      type: 'SETTINGS_UPDATED', 
      settings: extensionState.settings 
    });
  }

  signToVoiceToggle.addEventListener('change', updateSettings);
  voiceToSignToggle.addEventListener('change', updateSettings);
  recordToggle.addEventListener('change', updateSettings);

  // Open Google Meet
  openMeetBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://meet.google.com' });
  });

  // UI Helpers
  function showDashboard() {
    authScreen.classList.add('hidden');
    dashboardScreen.classList.remove('hidden');
  }

  function updateDashboardUI() {
    if (!extensionState.user) return;
    
    // Set user info
    const name = extensionState.user.name || extensionState.user.full_name || 'User';
    userName.textContent = name;
    userEmail.textContent = extensionState.user.email;
    
    // Initials for avatar
    const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    userAvatar.textContent = initials;
    
    // Set toggles
    signToVoiceToggle.checked = extensionState.settings.signToVoice;
    voiceToSignToggle.checked = extensionState.settings.voiceToSign;
    recordToggle.checked = extensionState.settings.recordMeeting;
    
    // Get stats from background script
    requestStatsUpdate();
  }

  function showError(el, msg) {
    el.textContent = msg;
    el.classList.remove('hidden');
  }

  function setLoading(btn, isLoading) {
    const text = btn.querySelector('.btn-text');
    const spinner = btn.querySelector('.btn-spinner');
    
    if (isLoading) {
      text.classList.add('hidden');
      spinner.classList.add('active');
      btn.disabled = true;
    } else {
      text.classList.remove('hidden');
      spinner.classList.remove('active');
      btn.disabled = false;
    }
  }

  // Real-time Updates via Message Passing
  function requestStatsUpdate() {
    chrome.runtime.sendMessage({ type: 'GET_STATS' }, (response) => {
      if (response) {
        updateStatsUI(response);
      }
    });
  }

  function updateStatsUI(stats) {
    if (stats.connected) {
      statusDot.classList.add('connected');
      statusText.textContent = 'Connected to SignBridge AI';
      statusPing.textContent = `${stats.ping || 42}ms`;
    } else {
      statusDot.classList.remove('connected');
      statusText.textContent = 'Waiting for Google Meet...';
      statusPing.textContent = '';
    }
    
    statSigns.textContent = stats.signsCount || 0;
    statWords.textContent = stats.wordsCount || 0;
    statConf.textContent = stats.avgConfidence ? `${(stats.avgConfidence * 100).toFixed(0)}%` : '—';
  }

  // Listen for background updates
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'STATS_UPDATE') {
      updateStatsUI(msg.stats);
    } else if (msg.type === 'MEETING_ENDED' && msg.hasSummary) {
      const pdfBtn = document.getElementById('downloadPdfBtn');
      pdfBtn.classList.remove('hidden');
      pdfBtn.onclick = () => {
        chrome.tabs.create({ url: `http://localhost:8000/api/meeting/pdf/${msg.meetingId}` });
      };
    }
  });

  // Initial poll for status if in dashboard
  if (extensionState.token) {
    setInterval(requestStatsUpdate, 1000);
  }
});
