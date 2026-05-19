// app.js

// SECURITY NOTE: In production environments, client-side configuration keys should be restricted
// in the Firebase Console (HTTP Referrers / IP restrictions).
const firebaseConfig = {
  apiKey: "AIzaSyCrOIe74W8DK_yFL4iXApgKGJ0Yngwtoj8",
  authDomain: "cinetrack-a6a6a.firebaseapp.com",
  projectId: "cinetrack-a6a6a",
  storageBucket: "cinetrack-a6a6a.firebasestorage.app",
  messagingSenderId: "973119513848",
  appId: "1:973119513848:web:683c8b6764d4843296c70d",
  measurementId: "G-1M316LJ0K8"
};

// Initialize Firebase
if (typeof firebase !== 'undefined') {
  firebase.initializeApp(firebaseConfig);
}
const db = typeof firebase !== 'undefined' ? firebase.firestore() : null;
const auth = typeof firebase !== 'undefined' ? firebase.auth() : null;

// SECURITY NOTE: Hardcoding third-party API Keys on the client side exposes them to theft and quota abuse.
// In production, route requests through a secure server-side API proxy or use build-time environment variables.
const TMDB_API_KEY = '92b418e837b833be308bbfb1fb2aca1e';

const App = {
    currentUser: null,
    state: {
        movies: [],
        series: [],
        books: [],
        goal: 5,
        goalCurrent: 0,
        goalWeek: '',
        streak: 0,
        lastWatchDate: null,
        globalUsers: [],
        currentUserData: null,
        hiddenChats: [],
        dailyPageGoal: 20,
        collections: []
    },
    
    currentTab: 'dashboard',
    editingId: null,
    editingType: null,

    // Helper: convert handle to fake email for Firebase Auth
    handleToEmail(handle) {
        return `${handle}@cinetrack.app`;
    },

    setAuthLoading(loading, msg = 'Lütfen bekleyin...') {
        const overlay = document.getElementById('authLoadingOverlay');
        const text = document.getElementById('authLoadingText');
        if (overlay) overlay.style.display = loading ? 'flex' : 'none';
        if (text) text.innerText = msg;
    },

    init() {
        console.log('App: init() started');
        this.initPullToRefresh();
        this.initHistory();
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW fail', err));
        }

        // Bildirim sistemi başlat
        this.initNotifications();

        // Listen for fullscreen change globally to update WatchParty fullscreen button status
        document.addEventListener('fullscreenchange', () => {
            const btn = document.getElementById('wpFullscreenBtn');
            if (btn) {
                btn.textContent = document.fullscreenElement ? '⊠' : '⛶';
            }
        });

        // Toggle Passwords (always bind these regardless of auth state)
        document.querySelectorAll('.toggle-password').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetId = e.currentTarget.dataset.target;
                const input = document.getElementById(targetId);
                if (input.type === 'password') {
                    input.type = 'text';
                    e.currentTarget.innerText = '🙈';
                } else {
                    input.type = 'password';
                    e.currentTarget.innerText = '👁️';
                }
            });
        });

        // Tab switch between login/register
        if (document.getElementById('showRegisterBtn')) {
            document.getElementById('showRegisterBtn').addEventListener('click', () => {
                document.getElementById('loginCard').classList.add('hidden');
                document.getElementById('registerCard').classList.remove('hidden');
            });
            document.getElementById('showLoginBtn').addEventListener('click', () => {
                document.getElementById('registerCard').classList.add('hidden');
                document.getElementById('loginCard').classList.remove('hidden');
            });

            document.querySelectorAll('.avatar-option').forEach(el => {
                el.addEventListener('click', (e) => {
                    document.querySelectorAll('.avatar-option').forEach(a => a.classList.remove('selected'));
                    e.currentTarget.classList.add('selected');
                });
            });
        }

        // Handle suggestion (check Firestore for taken handles)
        const handleInput = document.getElementById('regHandleInput');
        const suggestionBox = document.getElementById('handleSuggestion');
        if (handleInput && suggestionBox) {
            handleInput.addEventListener('input', async (e) => {
                const handle = e.target.value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
                if (!handle) { suggestionBox.style.display = 'none'; return; }
                // Gracefully skip if not authenticated yet
                if (!db || !auth.currentUser) { suggestionBox.style.display = 'none'; return; }
                try {
                    const snap = await db.collection('users').doc(handle).get();
                    if (snap.exists) {
                        let num = 1;
                        let suggested = `${handle}${num}`;
                        suggestionBox.innerHTML = `Bu ad alınmış. Şunu dene: <span style="font-weight:bold; text-decoration:underline;">@${suggested}</span>`;
                        suggestionBox.style.display = 'block';
                        suggestionBox.onclick = () => { handleInput.value = suggested; suggestionBox.style.display = 'none'; };
                    } else {
                        suggestionBox.style.display = 'none';
                    }
                } catch(e) {
                    suggestionBox.style.display = 'none';
                }
            });
        }

        // LOGIN
        document.getElementById('loginBtn').addEventListener('click', async () => {
            const handle = document.getElementById('usernameInput').value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
            const password = document.getElementById('passwordInput').value.trim();
            if (!handle || !password) return this.showToast('Kullanıcı adı ve şifre gereklidir.', true);

            this.setAuthLoading(true, 'Giriş yapılıyor...');
            try {
                await auth.signInWithEmailAndPassword(this.handleToEmail(handle), password);
                // onAuthStateChanged will handle the rest
            } catch (err) {
                this.setAuthLoading(false);
                if (err.code === 'auth/user-not-found') return this.showToast('Kullanıcı bulunamadı. Lütfen kayıt olun.', true);
                if (err.code === 'auth/wrong-password') return this.showToast('Hatalı şifre.', true);
                this.showToast('Giriş hatası: ' + err.message, true);
            }
        });

        // REGISTER
        if (document.getElementById('registerBtn')) {
            document.getElementById('registerBtn').addEventListener('click', async () => {
                const name = document.getElementById('regNameInput').value.trim();
                const handle = document.getElementById('regHandleInput').value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
                const password = document.getElementById('regPasswordInput').value.trim();
                const avatarEl = document.querySelector('.avatar-option.selected');
                const avatar = avatarEl ? avatarEl.innerText : '👤';

                if (!name || !handle || !password) return this.showToast('Ad, Kullanıcı Adı ve Şifre zorunludur.', true);
                if (password.length < 6) return this.showToast('Şifre en az 6 karakter olmalıdır.', true);

                this.setAuthLoading(true, 'Hesap oluşturuluyor...');
                try {
                    // Create Firebase Auth account (duplicate handle = duplicate email = auth/email-already-in-use)
                    const cred = await auth.createUserWithEmailAndPassword(this.handleToEmail(handle), password);

                    // Save profile to Firestore (user is now authenticated)
                    const userProfile = { handle, name, avatar, createdAt: Date.now(), uid: cred.user.uid };
                    if (db) {
                        await db.collection('users').doc(handle).set(userProfile);
                    }
                    // onAuthStateChanged will handle the rest
                } catch (err) {
                    this.setAuthLoading(false);
                    if (err.code === 'auth/email-already-in-use') return this.showToast('Bu kullanıcı adı zaten alınmış.', true);
                    this.showToast('Kayıt hatası: ' + err.message, true);
                }
            });
        }

        // FIREBASE AUTH STATE OBSERVER
        if (auth) {
            auth.onAuthStateChanged(async (firebaseUser) => {
                console.log('App: Auth state changed', !!firebaseUser);
                if (firebaseUser && firebaseUser.email) {
                    // Extract handle from email
                    const handle = firebaseUser.email.replace('@cinetrack.app', '');
                    await this.login(handle, firebaseUser);
                    
                    const splash = document.getElementById('splash');
                    if (splash) splash.classList.add('hidden');
                    
                    const ls = document.getElementById('loginScreen');
                    if (ls) ls.classList.add('hidden');
                    
                    const app = document.getElementById('app');
                    if (app) app.classList.remove('hidden');
                    
                    this.setAuthLoading(false);
                } else {
                    // Not logged in
                    setTimeout(() => {
                        document.getElementById('splash').classList.add('hidden');
                        document.getElementById('loginScreen').classList.remove('hidden');
                    }, 1500);
                }
            });
        } else {
            // Fallback if Firebase not loaded
            setTimeout(() => {
                document.getElementById('splash').classList.add('hidden');
                document.getElementById('loginScreen').classList.remove('hidden');
            }, 1500);
        }
    },


    async login(username, firebaseUser = null) {
        this.currentUser = username.toLowerCase();

        // Load user profile from Firestore
        if (db) {
            try {
                let snap = await db.collection('users').doc(this.currentUser).get();
                let existingCode = null;
                if (snap.exists) {
                    existingCode = snap.data().friendCode;
                }
                if (!existingCode) {
                    let unique = false;
                    let code = '';
                    let attempts = 0;
                    while (!unique && attempts < 10) {
                        code = 'CT-' + Math.random().toString(36).substring(2, 8).toUpperCase();
                        const checkSnap = await db.collection('users').where('friendCode', '==', code).limit(1).get();
                        if (checkSnap.empty) {
                            unique = true;
                        }
                        attempts++;
                    }
                    existingCode = code;
                }
                
                await db.collection('users').doc(this.currentUser).set({
                    lastSeen: Date.now(),
                    friendCode: existingCode
                }, { merge: true });
                
                await db.collection('userData').doc(this.currentUser).set({
                    lastSeen: Date.now(),
                    friendCode: existingCode
                }, { merge: true });

                snap = await db.collection('users').doc(this.currentUser).get();
                if (snap.exists) {
                    const data = snap.data();
                    this.state.currentUserData = data;
                    this.state.friendCode = data.friendCode;
                    
                    const codeEl = document.getElementById('myFriendCodeDisplay');
                    if (codeEl && data.friendCode) {
                        codeEl.innerText = data.friendCode;
                    }
                    
                    // Also push into globalUsers for social features
                    if (!this.state.globalUsers.find(u => u.handle === this.currentUser)) {
                        this.state.globalUsers.push(data);
                    }
                }

                // Load all users for social tab
                const allUsersSnap = await db.collection('users').get();
                this.state.globalUsers = allUsersSnap.docs.map(d => d.data());
            } catch (e) {
                console.warn('Firestore user load error:', e);
            }
        }

        const userRecord = this.state.currentUserData || { handle: this.currentUser, name: username, avatar: '👤' };

        const und = document.getElementById('userNameDisplay');
        if (und) und.innerText = userRecord.name || this.currentUser;

        const pad = document.getElementById('profileAvatarDisplay');
        if (pad) pad.innerText = userRecord.avatar || '👤';
        
        const profileUserName = document.getElementById('profileUserNameFull');
        if (profileUserName) {
            const escapedName = this._escapeHtml(userRecord.name || this.currentUser || '');
            const escapedHandle = this._escapeHtml(userRecord.handle || '');
            profileUserName.innerHTML = `${escapedName} <span style="font-size:14px; opacity:0.8; font-weight:normal;">@${escapedHandle}</span>`;
        }

        // Easter Egg: 'deniz' ve 'kermode'
        const denizThemeBtn = document.getElementById('themeDeniz');
        if (denizThemeBtn) {
            denizThemeBtn.style.display = (this.currentUser === 'deniz' || this.hasAdminPrivileges()) ? 'flex' : 'none';
        }

        // Sosyal sekme: Herkese açık!
        const navSocial = document.getElementById('navSocial');
        if (navSocial) {
            navSocial.style.display = 'flex';
        }
        
        // Data Migration / Loading (localStorage – will move to Firestore in Step 2)
        if (!localStorage.getItem('cinetrack_migrated') && localStorage.getItem('cinetrack_movies')) {
            this.state.movies = JSON.parse(localStorage.getItem('cinetrack_movies')) || [];
            this.state.series = JSON.parse(localStorage.getItem('cinetrack_series')) || [];
            this.state.goal = parseInt(localStorage.getItem('cinetrack_goal')) || 5;
            this.state.goalCurrent = parseInt(localStorage.getItem('cinetrack_goal_current')) || 0;
            this.state.goalWeek = localStorage.getItem('cinetrack_goal_week') || getStartOfWeek();
            this.state.streak = parseInt(localStorage.getItem('cinetrack_streak')) || 0;
            this.state.lastWatchDate = localStorage.getItem('cinetrack_lastWatchDate') || null;
            localStorage.setItem('cinetrack_migrated', 'true');
            this.save();
        } else {
            this.state.movies = JSON.parse(localStorage.getItem(`cinetrack_${this.currentUser}_movies`)) || [];
            this.state.series = JSON.parse(localStorage.getItem(`cinetrack_${this.currentUser}_series`)) || [];
            this.state.goal = parseInt(localStorage.getItem(`cinetrack_${this.currentUser}_goal`)) || 5;
            this.state.goalCurrent = parseInt(localStorage.getItem(`cinetrack_${this.currentUser}_goal_current`)) || 0;
            this.state.goalWeek = localStorage.getItem(`cinetrack_${this.currentUser}_goal_week`) || getStartOfWeek();
            this.state.streak = parseInt(localStorage.getItem(`cinetrack_${this.currentUser}_streak`)) || 0;
            this.state.lastWatchDate = localStorage.getItem(`cinetrack_${this.currentUser}_lastWatchDate`) || null;
        }
        
        this.state.following = [];
        this.state.followers = [];
        this.state.followRequests = [];
        this.state.sentRequests = [];
        this.state.hiddenChats = [];

        // Load user data from Firestore
        if (db) {
            try {
                const dataSnap = await db.collection('userData').doc(this.currentUser).get();
                if (dataSnap.exists) {
                    const d = dataSnap.data();
                    this.state.movies      = d.movies       || [];
                    this.state.series      = d.series       || [];
                    this.state.books       = d.books        || [];
                    this.state.goal        = d.goal         || 5;
                    this.state.goalCurrent = d.goalCurrent  || 0;
                    this.state.goalWeek    = d.goalWeek     || getStartOfWeek();
                    this.state.streak      = d.streak       || 0;
                    this.state.lastWatchDate = d.lastWatchDate || null;
                    this.state.following   = d.following    || [];
                    this.state.followers   = d.followers    || [];
                    this.state.followRequests = d.followRequests || [];
                    this.state.sentRequests   = d.sentRequests   || [];
                    this.state.hiddenChats    = d.hiddenChats    || [];
                    this.state.collections    = d.collections    || [];
                    this.state.dailyPageGoal  = d.dailyPageGoal  || 20;
                } else {
                    // First login — check for legacy localStorage data to migrate
                    const legacyMovies = localStorage.getItem(`cinetrack_${this.currentUser}_movies`);
                    if (legacyMovies) {
                        this.state.movies      = JSON.parse(legacyMovies) || [];
                        this.state.series      = JSON.parse(localStorage.getItem(`cinetrack_${this.currentUser}_series`)) || [];
                        this.state.books       = JSON.parse(localStorage.getItem(`cinetrack_${this.currentUser}_books`)) || [];
                        this.state.goal        = parseInt(localStorage.getItem(`cinetrack_${this.currentUser}_goal`)) || 5;
                        this.state.goalCurrent = parseInt(localStorage.getItem(`cinetrack_${this.currentUser}_goal_current`)) || 0;
                        this.state.goalWeek    = localStorage.getItem(`cinetrack_${this.currentUser}_goal_week`) || getStartOfWeek();
                        this.state.streak      = parseInt(localStorage.getItem(`cinetrack_${this.currentUser}_streak`)) || 0;
                        this.state.lastWatchDate = localStorage.getItem(`cinetrack_${this.currentUser}_lastWatchDate`) || null;
                        this.state.following   = JSON.parse(localStorage.getItem(`cinetrack_${this.currentUser}_following`)) || [];
                        this.showToast('☁️ Veriler buluta taşındı!');
                    }
                    this.save(); // push legacy or initial data to Firestore immediately
                }

                // Guarantee document existence and initialized flag
                await db.collection('userData').doc(this.currentUser).set({ initialized: true }, { merge: true });

                // Subscribe to live social list updates
                if (this.userDataUnsubscribe) this.userDataUnsubscribe();
                this.userDataUnsubscribe = db.collection('userData').doc(this.currentUser).onSnapshot(doc => {
                    if (doc.exists) {
                        const d = doc.data();
                        this.state.isAdmin        = d.isAdmin        || false;
                        this.state.following      = d.following      || [];
                        this.state.followers      = d.followers      || [];
                        this.state.followRequests = d.followRequests || [];
                        this.state.sentRequests   = d.sentRequests   || [];
                        this.state.hiddenChats    = d.hiddenChats    || [];
                        this.state.collections    = d.collections    || [];
                        this.state.dailyPageGoal  = d.dailyPageGoal  || 20;

                        this.renderFollowRequestsUI();
                        if (this.currentTab === 'social') {
                            this.renderConversationsList();
                            const q = document.getElementById('socialSearchInput')?.value?.trim();
                            if (q) this.renderUserSearch(q);
                        }
                        this.renderProfileStats();
                    }
                });
            } catch (e) {
                console.warn('Firestore userData load error:', e);
            }
        }

        checkGoalWeek();
        if (!this.eventsBound) {
            this.bindEvents();
            this.startClock();
            this.eventsBound = true;
        }
        this.renderAll();
        this.updateUnreadBadges();
        this.renderFollowRequestsUI();
        this._startWpInviteListener();

        // Easter Eggs Check
        if (this.currentUser === 'deniz') {
            this.triggerDenizEasterEgg();
        } else if (this.hasAdminPrivileges()) {
            this.triggerKermodeAdmin();
        } else {
            document.documentElement.style.removeProperty('--primary');
            document.documentElement.style.removeProperty('--bg');
        }

        // Load Theme
        let savedTheme = localStorage.getItem(`cinetrack_${this.currentUser}_theme`);
        if (!savedTheme) {
            savedTheme = (this.currentUser === 'deniz') ? 'deniz' : 'default';
        }
        this.changeTheme(savedTheme, false);
    },

    startClock() {
        const updateClock = () => {
            const now = new Date();
            const timeStr = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
            const dateStr = now.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
            
            const clockEl = document.getElementById('liveClock');
            const dateEl = document.getElementById('liveDate');
            if (clockEl) clockEl.innerText = timeStr;
            if (dateEl) dateEl.innerText = dateStr;
        };
        updateClock();
        setInterval(updateClock, 1000);
    },

    changeTheme(theme, showToast = true) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem(`cinetrack_${this.currentUser}_theme`, theme);
        
        // Update active class on cards
        document.querySelectorAll('.theme-card').forEach(card => {
            if (card.dataset.theme === theme) {
                card.classList.add('active');
            } else {
                card.classList.remove('active');
            }
        });

        if (showToast) {
            this.showToast('Tema değiştirildi');
            // Auto close theme modal after selection
            setTimeout(() => this.closeModals(), 400);
        }
    },

    triggerDenizEasterEgg() {
        const denizThemeBtn = document.getElementById('themeDeniz');
        if (denizThemeBtn) denizThemeBtn.style.display = 'flex';
        
        const audio = new Audio('https://actions.google.com/sounds/v1/cartoon/magic_chime.ogg');
        audio.volume = 0.5;
        audio.play().catch(e => console.log('Audio error:', e));

        if (window.confetti) {
            const duration = 3000;
            const end = Date.now() + duration;

            (function frame() {
                confetti({
                    particleCount: 5,
                    angle: 60,
                    spread: 55,
                    origin: { x: 0 },
                    colors: ['#00f2fe', '#4facfe', '#ffffff']
                });
                confetti({
                    particleCount: 5,
                    angle: 120,
                    spread: 55,
                    origin: { x: 1 },
                    colors: ['#00f2fe', '#4facfe', '#ffffff']
                });

                if (Date.now() < end) {
                    requestAnimationFrame(frame);
                }
            }());
        }
        
        setTimeout(() => this.showToast('Deniz için özel Başkent teması aktif! 🌊✨'), 1000);
    },

    triggerKermodeAdmin() {
        document.body.classList.add('admin-mode');
        setTimeout(() => this.showToast('Kermode Admin Modu Aktif 🛡️'), 1000);
    },

    async logout() {
        if (this.chatUnsubscribe) this.chatUnsubscribe();
        if (this.userDataUnsubscribe) this.userDataUnsubscribe();
        if (this.watchPartyUnsubscribe) this.watchPartyUnsubscribe();
        if (this._wpInviteUnsubscribe) this._wpInviteUnsubscribe();
        this._wpKnownMemberships = {};
        if (this.genreChartInstance) {
            this.genreChartInstance.destroy();
            this.genreChartInstance = null;
        }
        if (auth) await auth.signOut();
        this.currentUser = null;
        this._sessionQuoteIndex = null;
        this.state = { movies: [], series: [], books: [], goal: 5, goalCurrent: 0, goalWeek: '', streak: 0, lastWatchDate: null, globalUsers: [], currentUserData: null, following: [], followers: [], followRequests: [], sentRequests: [], hiddenChats: [] };
        this.eventsBound = false;
        document.getElementById('app').classList.add('hidden');
        document.getElementById('loginScreen').classList.remove('hidden');
    },

    save() {
        if (!this.currentUser) return;
        const payload = {
            movies: this.state.movies,
            series: this.state.series,
            books: this.state.books || [],
            goal: this.state.goal,
            goalCurrent: this.state.goalCurrent,
            goalWeek: this.state.goalWeek,
            streak: this.state.streak,
            lastWatchDate: this.state.lastWatchDate || null,
            following: this.state.following,
            hiddenChats: this.state.hiddenChats || [],
            collections: this.state.collections || [],
            dailyPageGoal: this.state.dailyPageGoal || 20,
            lastSeen: Date.now()
        };
        if (db) {
            db.collection('userData').doc(this.currentUser).set(payload, { merge: true })
              .catch(e => console.warn('Firestore save error:', e));
            db.collection('users').doc(this.currentUser).set({ lastSeen: Date.now() }, { merge: true })
              .catch(e => console.warn('Firestore users save error:', e));
        }
    },

    bindEvents() {
        if (document.getElementById('logoutBtn')) {
            document.getElementById('logoutBtn').addEventListener('click', () => this.logout());
        }

        // Navigation
        document.querySelectorAll('.nav-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = e.currentTarget.dataset.tab;
                this.switchTab(tab);
            });
        });

        // Search
        const st = document.getElementById('searchToggleBtn');
        if (st) st.addEventListener('click', () => {
            const sw = document.getElementById('searchBarWrap');
            if (sw) sw.classList.toggle('open');
            const si = document.getElementById('searchInput');
            if (si) si.focus();
        });

        const scb = document.getElementById('searchClearBtn');
        if (scb) scb.addEventListener('click', () => {
            const si = document.getElementById('searchInput');
            if (si) si.value = '';
            const gsr = document.getElementById('globalSearchResults');
            if (gsr) gsr.classList.add('hidden');
            this.renderMovies();
            this.renderSeries();
            this.renderBooks();
        });

        let globalSearchTimeout = null;
        const si = document.getElementById('searchInput');
        if (si) si.addEventListener('input', (e) => {
            clearTimeout(globalSearchTimeout);
            globalSearchTimeout = setTimeout(() => {
                const query = e.target.value.trim().toLocaleLowerCase('tr');
                const resContainer = document.getElementById('globalSearchResults');
                if (!resContainer) return;
                
                if (query.length < 2) {
                    resContainer.classList.add('hidden');
                    this.renderMovies();
                    this.renderSeries();
                    this.renderBooks();
                    return;
                }

                // Global Search Results
                const matchedMovies = (this.state.movies || []).filter(m => m.title.toLocaleLowerCase('tr').includes(query));
                const matchedSeries = (this.state.series || []).filter(s => s.title.toLocaleLowerCase('tr').includes(query));
                const matchedBooks  = (this.state.books  || []).filter(b => b.title.toLocaleLowerCase('tr').includes(query));
                
                let html = '';
                
                matchedMovies.forEach(m => {
                    const poster = m.poster ? `<img src="${m.poster}" style="width:100%;height:100%;object-fit:cover;border-radius:6px;"/>` : '🎬';
                    html += `
                        <div class="tmdb-item" onclick="document.getElementById('globalSearchResults').classList.add('hidden'); App.openMovieDetail('${m.id}')">
                            <div class="tmdb-poster">${poster}</div>
                            <div class="tmdb-info">
                                <div class="tmdb-title">${this._escapeHtml(m.title)}</div>
                                <div class="tmdb-year">🎬 Film ${m.year ? '- '+m.year : ''}</div>
                            </div>
                        </div>
                    `;
                });
                
                matchedSeries.forEach(s => {
                    const poster = s.poster ? `<img src="${s.poster}" style="width:100%;height:100%;object-fit:cover;border-radius:6px;"/>` : '📺';
                    html += `
                        <div class="tmdb-item" onclick="document.getElementById('globalSearchResults').classList.add('hidden'); App.openSeriesDetail('${s.id}')">
                            <div class="tmdb-poster">${poster}</div>
                            <div class="tmdb-info">
                                <div class="tmdb-title">${this._escapeHtml(s.title)}</div>
                                <div class="tmdb-year">📺 Dizi ${s.year ? '- '+s.year : ''}</div>
                            </div>
                        </div>
                    `;
                });

                matchedBooks.forEach(b => {
                    const cover = b.poster || b.cover;
                    const posterHtml = cover ? `<img src="${cover}" style="width:100%;height:100%;object-fit:cover;border-radius:6px;"/>` : '📚';
                    html += `
                        <div class="tmdb-item" onclick="document.getElementById('globalSearchResults').classList.add('hidden'); App.openBookDetail('${b.id}')">
                            <div class="tmdb-poster">${posterHtml}</div>
                            <div class="tmdb-info">
                                <div class="tmdb-title">${this._escapeHtml(b.title)}</div>
                                <div class="tmdb-year">📚 Kitap ${b.year ? '- '+b.year : ''}</div>
                            </div>
                        </div>
                    `;
                });

                if (html === '') {
                    html = '<div class="tmdb-loading">Sonuç bulunamadı.</div>';
                }
                
                resContainer.innerHTML = html;
                resContainer.classList.remove('hidden');

                // Render current tabs as well
                this.renderMovies();
                this.renderSeries();
                this.renderBooks();
            }, 150);
        });

        // Add Modal
        const addBtn = document.getElementById('addBtn');
        if (addBtn) addBtn.addEventListener('click', () => this.openAddModal('movie'));

        const afm = document.getElementById('addFirstMovieBtn');
        if (afm) afm.addEventListener('click', () => {
            this.switchTab('movies');
            this.openAddModal('movie');
        });

        const afs = document.getElementById('addFirstSeriesBtn');
        if (afs) afs.addEventListener('click', () => {
            this.switchTab('series');
            this.openAddModal('series');
        });

        const mcb = document.getElementById('modalCloseBtn');
        if (mcb) mcb.addEventListener('click', () => this.closeModals());
        
        const mcan = document.getElementById('modalCancelBtn');
        if (mcan) mcan.addEventListener('click', () => this.closeModals());

        document.querySelectorAll('.type-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const type = e.currentTarget.dataset.type;
                document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                
                const tmdbResults = document.getElementById('tmdbResults');
                const bookResults = document.getElementById('bookSearchResults');
                if (tmdbResults) tmdbResults.classList.add('hidden');
                if (bookResults) bookResults.classList.add('hidden');

                if (type === 'movie') {
                    document.getElementById('movieFields').classList.remove('hidden');
                    document.getElementById('seriesFields').classList.add('hidden');
                    document.getElementById('bookFields').classList.add('hidden');
                    document.getElementById('platformFieldWrap').classList.remove('hidden');
                    document.getElementById('formTitle').placeholder = 'Film adı yazın...';
                } else if (type === 'series') {
                    document.getElementById('movieFields').classList.add('hidden');
                    document.getElementById('seriesFields').classList.remove('hidden');
                    document.getElementById('bookFields').classList.add('hidden');
                    document.getElementById('platformFieldWrap').classList.remove('hidden');
                    document.getElementById('formTitle').placeholder = 'Dizi adı yazın...';
                } else if (type === 'book') {
                    document.getElementById('movieFields').classList.add('hidden');
                    document.getElementById('seriesFields').classList.add('hidden');
                    document.getElementById('bookFields').classList.remove('hidden');
                    document.getElementById('platformFieldWrap').classList.add('hidden');
                    document.getElementById('formTitle').placeholder = 'Kitap adı yazın...';
                }
                
                // Re-trigger search with the new type
                const currentTitle = document.getElementById('formTitle').value.trim();
                if (currentTitle.length >= 2) {
                    if (type === 'book') this.searchOpenLibrary(currentTitle);
                    else this.searchTMDB(currentTitle);
                }
            });
        });

        // Close dropdowns when clicking outside
        document.addEventListener('click', (e) => {
            const tmdbResults = document.getElementById('tmdbResults');
            const formTitle = document.getElementById('formTitle');
            if (tmdbResults && !tmdbResults.contains(e.target) && e.target !== formTitle) {
                tmdbResults.classList.add('hidden');
            }

            const globalResults = document.getElementById('globalSearchResults');
            const searchInput = document.getElementById('searchInput');
            if (globalResults && !globalResults.contains(e.target) && e.target !== searchInput) {
                globalResults.classList.add('hidden');
            }
        });

        // Re-show TMDB results when clicking back into formTitle
        document.getElementById('formTitle').addEventListener('focus', (e) => {
            const val = e.target.value.trim();
            if (val.length >= 2 && document.getElementById('tmdbResults').innerHTML !== '') {
                document.getElementById('tmdbResults').classList.remove('hidden');
            }
        });

        // Star Rating
        document.querySelectorAll('.star').forEach(star => {
            star.addEventListener('click', (e) => {
                const val = parseInt(e.target.dataset.val);
                this.setStarRating(val);
            });
        });

        // Search (Real-time) on formTitle
        let tmdbTimeout = null;
        document.getElementById('formTitle').addEventListener('input', (e) => {
            clearTimeout(tmdbTimeout);
            const val = e.target.value.trim();
            if (val.length < 2) {
                document.getElementById('tmdbResults').classList.add('hidden');
                document.getElementById('bookSearchResults').classList.add('hidden');
                return;
            }
            const type = document.querySelector('.type-btn.active').dataset.type;
            if (type === 'book') {
                tmdbTimeout = setTimeout(() => this.searchOpenLibrary(val), 600);
            } else {
                tmdbTimeout = setTimeout(() => this.searchTMDB(val), 500);
            }
        });

        // Save Form
        document.getElementById('modalSaveBtn').addEventListener('click', () => this.saveForm());

        // Detail Modals
        document.getElementById('movieDetailCloseBtn').addEventListener('click', () => this.closeModals());
        document.getElementById('seriesDetailCloseBtn').addEventListener('click', () => this.closeModals());

        if(document.getElementById('shareCloseBtn')) document.getElementById('shareCloseBtn').addEventListener('click', () => this.closeModals());
        if(document.getElementById('wrappedCloseBtn')) document.getElementById('wrappedCloseBtn').addEventListener('click', () => {
            document.getElementById('wrappedModal').classList.remove('open');
        });
        if(document.getElementById('btnWrapped')) document.getElementById('btnWrapped').addEventListener('click', () => this.showWrapped());
        if(document.getElementById('allBadgesCloseBtn')) document.getElementById('allBadgesCloseBtn').addEventListener('click', () => this.closeModals());
        if(document.getElementById('btnAllBadges')) document.getElementById('btnAllBadges').addEventListener('click', () => {
            this.renderAllBadgesModal();
            document.getElementById('allBadgesModal').classList.add('open');
        });
        if(document.getElementById('movieShareBtn')) document.getElementById('movieShareBtn').addEventListener('click', () => this.openShareCard('movie'));
        if(document.getElementById('seriesShareBtn')) document.getElementById('seriesShareBtn').addEventListener('click', () => this.openShareCard('series'));
        if(document.getElementById('bookShareBtn')) document.getElementById('bookShareBtn').addEventListener('click', () => this.openShareCard('books'));

        // Detail Actions
        document.getElementById('movieDetailDeleteBtn').addEventListener('click', () => this.deleteItem('movie'));
        document.getElementById('seriesDetailDeleteBtn').addEventListener('click', () => this.deleteItem('series'));
        if(document.getElementById('movieFavoriteBtn')) document.getElementById('movieFavoriteBtn').addEventListener('click', () => this.toggleFavorite('movie'));
        if(document.getElementById('seriesFavoriteBtn')) document.getElementById('seriesFavoriteBtn').addEventListener('click', () => this.toggleFavorite('series'));

        // V1.5 Beta Social & Chat
        if (document.getElementById('otherProfileCloseBtn')) document.getElementById('otherProfileCloseBtn').addEventListener('click', () => this.closeModals());
        if (document.getElementById('followCloseBtn')) document.getElementById('followCloseBtn').addEventListener('click', () => this.closeModals());
        if (document.getElementById('otherProfileFollowBtn')) document.getElementById('otherProfileFollowBtn').addEventListener('click', () => this.toggleFollow());
        if (document.getElementById('chatCloseBtn')) document.getElementById('chatCloseBtn').addEventListener('click', () => this.closeModals());
        if (document.getElementById('deleteAccountBtn')) document.getElementById('deleteAccountBtn').addEventListener('click', () => this.deleteAccount());
        if (document.getElementById('friendCodeInput')) {
            document.getElementById('friendCodeInput').addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.addFriendByCode();
            });
        }
        if (document.getElementById('chatSendBtn')) {
            document.getElementById('chatSendBtn').addEventListener('click', () => this.sendMessage());
            document.getElementById('chatInput').addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.sendMessage();
            });
        }

        // Watch Party Event Binding
        if (document.getElementById('btnCreateWatchParty')) document.getElementById('btnCreateWatchParty').addEventListener('click', () => this.createWatchParty());
        if (document.getElementById('btnJoinWatchParty')) document.getElementById('btnJoinWatchParty').addEventListener('click', () => {
            const code = prompt('Katılmak istediğin oda kodunu gir:');
            if (code) this.openWatchPartyRoom(code.trim());
        });
        if (document.getElementById('watchPartyCloseBtn')) document.getElementById('watchPartyCloseBtn').addEventListener('click', () => this.closeWatchParty());
        if (document.getElementById('wpClosePartyBtn')) document.getElementById('wpClosePartyBtn').addEventListener('click', () => this.closeWatchParty());
        if (document.getElementById('wpPlayBtn')) document.getElementById('wpPlayBtn').addEventListener('click', () => this.toggleWatchPartyState());
        if (document.getElementById('wpChatSendBtn')) document.getElementById('wpChatSendBtn').addEventListener('click', () => this.sendWatchPartyMessage());
        if (document.getElementById('wpChatInput')) document.getElementById('wpChatInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendWatchPartyMessage();
        });
        if (document.getElementById('wpContentPickerCloseBtn')) document.getElementById('wpContentPickerCloseBtn').addEventListener('click', () => {
            document.getElementById('wpContentPickerModal').classList.remove('open');
            document.getElementById('wpContentPickerModal').style.display = 'none';
        });

        // Filters
        document.querySelectorAll('#tab-movies .filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('#tab-movies .filter-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.renderMovies();
            });
        });
        document.querySelectorAll('#tab-series .filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('#tab-series .filter-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.renderSeries();
            });
        });

        // Sorts & Genre Filters
        document.getElementById('movieSort').addEventListener('change', () => this.renderMovies());
        document.getElementById('seriesSort').addEventListener('change', () => this.renderSeries());
        const mgf = document.getElementById('movieGenreFilter');
        if (mgf) mgf.addEventListener('change', () => this.renderMovies());
        const sgf = document.getElementById('seriesGenreFilter');
        if (sgf) sgf.addEventListener('change', () => this.renderSeries());

        // Books
        if (document.getElementById('addFirstBookBtn')) {
            document.getElementById('addFirstBookBtn').addEventListener('click', () => this.openBookModal());
        }
        if (document.getElementById('bookModalCloseBtn')) {
            document.getElementById('bookModalCloseBtn').addEventListener('click', () => this.closeModals());
        }
        if (document.getElementById('bookModalCancelBtn')) {
            document.getElementById('bookModalCancelBtn').addEventListener('click', () => this.closeModals());
        }
        if (document.getElementById('bookModalSaveBtn')) {
            document.getElementById('bookModalSaveBtn').addEventListener('click', () => this.saveBook());
        }
        if (document.getElementById('bookDetailCloseBtn')) {
            document.getElementById('bookDetailCloseBtn').addEventListener('click', () => this.closeModals());
        }
        if (document.getElementById('bookDeleteBtn')) {
            document.getElementById('bookDeleteBtn').addEventListener('click', () => this.deleteBook());
        }
        if (document.getElementById('bookFavoriteBtn')) {
            document.getElementById('bookFavoriteBtn').addEventListener('click', () => this.toggleBookFavorite());
        }
        if (document.getElementById('bookEditBtn')) {
            document.getElementById('bookEditBtn').addEventListener('click', () => this.openBookModal(true));
        }
        if (document.getElementById('bookSort')) {
            document.getElementById('bookSort').addEventListener('change', () => this.renderBooks());
        }
        if (document.getElementById('bookGenreFilter')) {
            document.getElementById('bookGenreFilter').addEventListener('change', () => this.renderBooks());
        }
        document.querySelectorAll('#tab-books .filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('#tab-books .filter-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.renderBooks();
            });
        });

        // Book title search (Open Library)
        let bookSearchTimeout = null;
        const bookTitleInput = document.getElementById('bookFormTitle');
        if (bookTitleInput) {
            bookTitleInput.addEventListener('input', (e) => {
                clearTimeout(bookSearchTimeout);
                const val = e.target.value.trim();
                if (val.length < 2) {
                    document.getElementById('bookSearchResults').classList.add('hidden');
                    return;
                }
                bookSearchTimeout = setTimeout(() => this.searchOpenLibrary(val), 600);
            });
        }

        // Goal edit toggle
        const editBtn = document.getElementById('goalEditBtn');
        if (editBtn) {
            editBtn.addEventListener('click', () => {
                document.getElementById('goalEditSection').classList.toggle('hidden');
            });
        }

        document.getElementById('goalSetBtn').addEventListener('click', () => {
            const val = parseInt(document.getElementById('goalInput').value);
            if (val > 0) {
                this.state.goal = val;
                this.save();
                this.renderDashboard();
                this.showToast('Hedef güncellendi');
                document.getElementById('goalEditSection').classList.add('hidden');
            }
        });
    },

    switchTab(tab) {
        if (this.currentTab === tab) return;

        const tabs = ['dashboard', 'movies', 'series', 'books', 'social', 'profile'];
        const oldIndex = tabs.indexOf(this.currentTab);
        const newIndex = tabs.indexOf(tab);
        const direction = newIndex > oldIndex ? 'next' : 'prev';

        this.currentTab = tab;
        document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
        const navItem = document.querySelector(`.nav-item[data-tab="${tab}"]`);
        if (navItem) navItem.classList.add('active');
        
        document.querySelectorAll('.tab-content').forEach(c => {
            c.classList.remove('active', 'slide-left', 'slide-right');
        });
        
        const newTab = document.getElementById(`tab-${tab}`);
        if (newTab) {
            newTab.classList.add('active');
            newTab.classList.add(direction === 'next' ? 'slide-left' : 'slide-right');
        }

        if (tab === 'dashboard') this.renderDashboard();
        if (tab === 'movies') this.renderMovies();
        if (tab === 'series') this.renderSeries();
        if (tab === 'books') this.renderBooks();
        if (tab === 'social') {
            this.renderSocialTab();
        }
    },

    // Star rating was removed from the add modal

    async searchTMDB(query) {
        if (!query) return;

        const resultsContainer = document.getElementById('tmdbResults');
        resultsContainer.classList.remove('hidden');
        resultsContainer.innerHTML = '<div class="tmdb-loading">Aranıyor...</div>';

        const type = document.querySelector('.type-btn.active').dataset.type;
        const endpoint = type === 'movie' ? 'movie' : 'tv';
        
        // Force Turkish results, but allow fallback if needed
        const queryIsTurkish = /[ğüşıöçĞÜŞİÖÇ]/.test(query);
        const searchLang = queryIsTurkish ? 'tr-TR' : 'tr-TR'; // We default to Turkish for this app

        try {
            const res = await fetch(`https://api.themoviedb.org/3/search/${endpoint}?api_key=${TMDB_API_KEY}&language=${searchLang}&include_adult=false&query=${encodeURIComponent(query)}`);
            const data = await res.json();
            let results = data.results || [];

            // Sort results to prioritize exact matches to localized title
            results.sort((a, b) => {
                const aTitle = (type === 'movie' ? a.title : a.name) || '';
                const bTitle = (type === 'movie' ? b.title : b.name) || '';
                
                const aExact = aTitle.toLowerCase() === query.toLowerCase() ? 1 : 0;
                const bExact = bTitle.toLowerCase() === query.toLowerCase() ? 1 : 0;
                if (aExact !== bExact) return bExact - aExact;

                return (b.popularity || 0) - (a.popularity || 0);
            });
            
            if (results.length > 0) {
                resultsContainer.innerHTML = results.slice(0, 10).map(item => {
                    const title = type === 'movie' ? item.title : item.name;
                    const dateField = type === 'movie' ? item.release_date : item.first_air_date;
                    const year = dateField ? dateField.split('-')[0] : '';
                    const poster = item.poster_path ? `https://image.tmdb.org/t/p/w200${item.poster_path}` : '';
                    const icon = type === 'movie' ? '🎬' : '📺';
                    
                    const lowerTitle = title.toLowerCase();
                    const exists = type === 'movie' 
                        ? this.state.movies.some(m => m.title.toLowerCase() === lowerTitle)
                        : this.state.series.some(s => s.title.toLowerCase() === lowerTitle);
                        
                    const existingBadge = exists ? `<div class="tmdb-existing-overlay" title="Kütüphanende Ekli">✅</div>` : '';

                    return `
                        <div class="tmdb-item" onclick="App.selectTMDBItem('${item.id}', '${type}')">
                            <div class="tmdb-poster">
                                ${poster ? `<img src="${poster}" style="width:100%;height:100%;object-fit:cover;border-radius:6px;"/>` : icon}
                                ${existingBadge}
                            </div>
                            <div class="tmdb-info">
                                <div class="tmdb-title">${title}</div>
                                <div class="tmdb-year">${year}</div>
                            </div>
                        </div>
                    `;
                }).join('');
            } else {
                resultsContainer.innerHTML = '<div class="tmdb-loading">Sonuç bulunamadı.</div>';
            }
        } catch (err) {
            resultsContainer.innerHTML = '<div class="tmdb-loading">Bir hata oluştu.</div>';
        }
    },

    async selectTMDBItem(id, type) {
        const resultsContainer = document.getElementById('tmdbResults');
        resultsContainer.innerHTML = '<div class="tmdb-loading">Detaylar alınıyor...</div>';

        const endpoint = type === 'movie' ? 'movie' : 'tv';
        const searchLang = 'tr-TR'; // Force Turkish for consistent metadata

        try {
            // Ana detay + IMDb ID'sini aynı anda çek
            const [detailRes, externalRes] = await Promise.all([
                fetch(`https://api.themoviedb.org/3/${endpoint}/${id}?api_key=${TMDB_API_KEY}&language=${searchLang}&append_to_response=credits`),
                fetch(`https://api.themoviedb.org/3/${endpoint}/${id}/external_ids?api_key=${TMDB_API_KEY}`)
            ]);
            const data = await detailRes.json();
            const extData = await externalRes.json();

            // IMDb ID'yi sakla
            this.tempImdbId = extData.imdb_id || null;
            if (type === 'tv') this.tempTmdbId = String(id);
            else this.tempTmdbId = null;

            const title = type === 'movie' ? data.title : data.name;
            const dateField = type === 'movie' ? data.release_date : data.first_air_date;
            const year = dateField ? parseInt(dateField.split('-')[0]) : '';
            const genre = data.genres ? data.genres.map(g => g.name).join(', ') : '';
            const poster = data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : '';
            const overview = data.overview || 'Konu bulunamadı.';
            const cast = data.credits && data.credits.cast ? data.credits.cast.slice(0, 5).map(c => c.name).join(', ') : 'Oyuncu bilgisi yok.';

            document.getElementById('formTitle').value = title || '';
            document.getElementById('formYear').value = year || '';
            document.getElementById('formGenre').value = genre || '';
            document.getElementById('formPoster').value = poster || '';
            document.getElementById('formNote').value = `Konu: ${overview}\n\nOyuncular: ${cast}`;
            
            const voteAvg = data.vote_average ? data.vote_average.toFixed(1) : '';
            document.getElementById('formGlobalRating').value = voteAvg;
            
            if (type === 'movie') {
                const duration = parseInt(data.runtime);
                document.getElementById('formDuration').value = isNaN(duration) ? '' : duration;
            } else {
                document.getElementById('formSeasons').value = data.number_of_seasons || 1;
                document.getElementById('formEpisodes').value = data.number_of_episodes || 10;
                
                if (data.seasons && data.seasons.length > 0) {
                    this.tempSeasonsData = data.seasons
                        .filter(s => s.season_number > 0)
                        .map(s => ({ season: s.season_number, episodes: s.episode_count }));
                } else {
                    this.tempSeasonsData = null;
                }
            }

            resultsContainer.classList.add('hidden');
            this.showToast(this.tempImdbId ? `✅ Bilgiler dolduruldu (IMDb: ${this.tempImdbId})` : 'Bilgiler otomatik dolduruldu!');

        } catch (err) {
            resultsContainer.innerHTML = '<div class="tmdb-loading">Detaylar alınamadı.</div>';
        }
    },

    openAddModal(type) {
        this.editingId = null;
        this.editingType = null;
        document.getElementById('modalTitle').innerText = 'Yeni Ekle';
        document.getElementById('typeSelectorWrap').classList.remove('hidden');
        document.getElementById('tmdbResults').classList.add('hidden');
        document.getElementById('bookSearchResults').classList.add('hidden');
        
        // Reset form
        document.getElementById('formTitle').value = '';
        document.getElementById('formYear').value = '';
        document.getElementById('formGenre').value = '';
        document.getElementById('formPoster').value = '';
        document.getElementById('formNote').value = '';
        document.getElementById('formPlatform').value = '';
        document.getElementById('formDuration').value = '';
        document.getElementById('formMovieStatus').value = 'watchlist';
        
        document.getElementById('formSeriesStatus').value = 'watchlist';
        document.getElementById('formSeasons').value = '1';
        document.getElementById('formEpisodes').value = '1';

        document.getElementById('bookAuthor').value = '';
        document.getElementById('bookPages').value = '';
        document.getElementById('bookStatus').value = 'readlist';
        document.getElementById('formGlobalRating').value = '';
        this.tempSeasonsData = null;
        this.tempImdbId = null;
        this.tempTmdbId = null;

        document.getElementById('addModal').classList.add('open');
        this.pushHistoryState();

        const typeBtn = document.querySelector(`.type-btn[data-type="${type}"]`);
        if (typeBtn) typeBtn.click();
    },

    openEditModal(type) {
        let item;
        if (type === 'movie') item = this.state.movies.find(m => m.id === this.editingId);
        else if (type === 'series') item = this.state.series.find(s => s.id === this.editingId);
        else if (type === 'book') item = this.state.books.find(b => b.id === this.editingId);
        
        if (!item) return;

        this.editingType = type;
        document.getElementById('modalTitle').innerText = 'Düzenle';
        document.getElementById('typeSelectorWrap').classList.add('hidden'); // Hide type switcher
        document.getElementById('tmdbResults').classList.add('hidden');
        document.getElementById('bookSearchResults').classList.add('hidden');
        
        document.getElementById('formTitle').value = item.title;
        document.getElementById('formYear').value = item.year || '';
        document.getElementById('formGenre').value = item.genre || '';
        document.getElementById('formPoster').value = item.poster || item.cover || '';
        document.getElementById('formNote').value = item.note || '';
        document.getElementById('formPlatform').value = item.platform || '';

        if (type === 'movie') {
            document.getElementById('movieFields').classList.remove('hidden');
            document.getElementById('seriesFields').classList.add('hidden');
            document.getElementById('bookFields').classList.add('hidden');
            document.getElementById('formMovieStatus').value = item.status;
            document.getElementById('formDuration').value = item.duration || '';
        } else if (type === 'series') {
            document.getElementById('movieFields').classList.add('hidden');
            document.getElementById('seriesFields').classList.remove('hidden');
            document.getElementById('bookFields').classList.add('hidden');
            document.getElementById('formSeriesStatus').value = item.status;
            document.getElementById('formSeasons').value = item.seasons || 1;
            document.getElementById('formEpisodes').value = item.episodes || 1;
        } else if (type === 'book') {
            document.getElementById('movieFields').classList.add('hidden');
            document.getElementById('seriesFields').classList.add('hidden');
            document.getElementById('bookFields').classList.remove('hidden');
            document.getElementById('bookAuthor').value = item.author || '';
            document.getElementById('bookPages').value = item.pages || '';
            document.getElementById('bookStatus').value = item.status || 'readlist';
        }

        // Directly close all modals without triggering history.back, then open edit modal
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('open'));
        document.getElementById('addModal').classList.add('open');
        this.pushHistoryState();
    },

    closeModals(resetEditing = true, syncHistory = true) {
        const openModals = document.querySelectorAll('.modal-overlay.open');
        if (openModals.length > 0 && syncHistory) {
            history.back();
            return;
        }

        document.querySelectorAll('.modal-overlay').forEach(m => {
            m.classList.remove('open');
            if (m.id === 'wpContentPickerModal') m.style.display = 'none';
        });

        if (resetEditing) {
            this.editingId = null;
            this.editingType = null;
        }
    },

    saveForm() {
        const title = document.getElementById('formTitle').value.trim();
        if (!title) return this.showToast('Başlık gerekli', true);

        const type = document.querySelector('.type-btn.active').dataset.type;
        const isEdit = !!this.editingId;

        // Duplication Check
        if (!isEdit) {
            const lowerTitle = title.toLowerCase();
            let exists = false;
            if (type === 'movie') exists = this.state.movies.some(m => m.title.toLowerCase() === lowerTitle);
            else if (type === 'series') exists = this.state.series.some(s => s.title.toLowerCase() === lowerTitle);
            else if (type === 'book') exists = this.state.books.some(b => b.title.toLowerCase() === lowerTitle);
                
            if (exists) {
                return this.showToast('Bu içerik zaten kütüphanende ekli!', true);
            }
        }

        const baseItem = {
            title,
            year: document.getElementById('formYear').value,
            genre: document.getElementById('formGenre').value,
            poster: document.getElementById('formPoster').value,
            note: document.getElementById('formNote').value,
            platform: document.getElementById('formPlatform').value,
            globalRating: document.getElementById('formGlobalRating').value,
            imdbId: this.tempImdbId || null,
            updatedAt: Date.now()
        };
        this.tempImdbId = null; // reset

        if (type === 'movie') {
            const status = document.getElementById('formMovieStatus').value;
            const duration = document.getElementById('formDuration').value;
            const existing = isEdit ? this.state.movies.find(m => m.id === this.editingId) : null;

            const newItem = {
                ...baseItem,
                type: 'movie',
                status, duration,
                rating: existing ? existing.rating : 0
            };

            if (isEdit) {
                const idx = this.state.movies.findIndex(m => m.id === this.editingId);
                if (idx > -1) {
                    this.state.movies[idx] = { ...this.state.movies[idx], ...newItem };
                }
            } else {
                newItem.id = Date.now().toString();
                newItem.createdAt = Date.now();
                this.state.movies.push(newItem);
            }
        } else if (type === 'series') {
            const status = document.getElementById('formSeriesStatus').value;
            const seasons = parseInt(document.getElementById('formSeasons').value) || 1;
            const episodes = parseInt(document.getElementById('formEpisodes').value) || 1;
            const existing = isEdit ? this.state.series.find(s => s.id === this.editingId) : null;

            const newItem = {
                ...baseItem,
                type: 'series',
                status, seasons, episodes,
                seasonsData: this.tempSeasonsData || (existing ? existing.seasonsData : null),
                tmdbId: this.tempTmdbId || (existing ? existing.tmdbId : null) || null,
                rating: existing ? existing.rating : 0
            };

            if (isEdit) {
                const idx = this.state.series.findIndex(s => s.id === this.editingId);
                if (idx > -1) {
                    if (status === 'completed') {
                        newItem.watchedEps = this.generateAllEps(seasons, episodes, newItem.seasonsData);
                    } else {
                        newItem.watchedEps = (existing && existing.watchedEps) ? existing.watchedEps : [];
                    }
                    this.state.series[idx] = { ...this.state.series[idx], ...newItem };
                }
            } else {
                newItem.id = Date.now().toString();
                newItem.createdAt = Date.now();
                newItem.watchedEps = status === 'completed' ? this.generateAllEps(seasons, episodes, newItem.seasonsData) : [];
                this.state.series.push(newItem);
            }
            
            this.tempSeasonsData = null;
            this.tempTmdbId = null;
        } else if (type === 'book') {
            const author = document.getElementById('bookAuthor').value.trim();
            const pages = parseInt(document.getElementById('bookPages').value) || 0;
            const status = document.getElementById('bookStatus').value;
            const existing = isEdit ? this.state.books.find(b => b.id === this.editingId) : null;

            const newItem = {
                ...baseItem,
                author, pages, status,
                rating: existing ? (existing.rating || 0) : 0,
                favorite: existing ? (existing.favorite || false) : false
            };

            if (isEdit) {
                const idx = this.state.books.findIndex(b => b.id === this.editingId);
                if (idx > -1) {
                    this.state.books[idx] = { ...this.state.books[idx], ...newItem };
                }
            } else {
                newItem.id = Date.now().toString();
                newItem.createdAt = Date.now();
                this.state.books.push(newItem);
            }
        }

        this.save();
        this.closeModals();
        this.renderAll();
        this.showToast(isEdit ? 'Güncellendi' : 'Eklendi');
    },

    async deleteItem(type) {
        if (!await this.showConfirm('İçeriği Sil', 'Silmek istediğine emin misin?', '🗑️')) return;

        if (type === 'movie') {
            const m = this.state.movies.find(x => x.id === this.editingId);
            if (m && m.status === 'watched') {
                this.state.goalCurrent = Math.max(0, this.state.goalCurrent - 1);
            }
            this.state.movies = this.state.movies.filter(x => x.id !== this.editingId);
        } else {
            const s = this.state.series.find(x => x.id === this.editingId);
            if (s && s.watchedEps) {
                this.state.goalCurrent = Math.max(0, this.state.goalCurrent - s.watchedEps.length);
            }
            this.state.series = this.state.series.filter(x => x.id !== this.editingId);
        }

        this.save();
        this.closeModals();
        this.renderAll();
        this.showToast('Silindi');
    },

    showToast(msg, isError = false) {
        const toast = document.getElementById('toast');
        toast.innerText = msg;
        toast.style.color = isError ? 'var(--red)' : 'var(--text)';
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    },

    getRatingColor(rating) {
        if (!rating) return 'var(--text3)';
        if (rating >= 9) return '#00f2fe';
        if (rating >= 7) return '#10b981';
        if (rating >= 5) return '#f59e0b';
        return '#ef4444';
    },

    quickRate(id, type, rating) {
        const arr = type === 'movie' ? this.state.movies : this.state.series;
        const idx = arr.findIndex(x => x.id === id);
        if (idx > -1) {
            arr[idx].rating = rating;
            this.save();
            this.renderAll();
            if (type === 'movie') this.openMovieDetail(id);
            else this.openSeriesDetail(id);
        }
    },

    quickStatus(id, type, status) {
        const arr = type === 'movie' ? this.state.movies : this.state.series;
        const idx = arr.findIndex(x => x.id === id);
        if (idx > -1) {
            arr[idx].status = status;
            if (type === 'series' && status === 'completed') {
                arr[idx].watchedEps = this.generateAllEps(arr[idx].seasons, arr[idx].episodes, arr[idx].seasonsData);
            }
            if (status === 'watched' || status === 'completed' || status === 'watching') this.updateStreak();
            this.save();
            this.renderAll();
            this.showToast('Durum güncellendi');
            if (type === 'series') this.openSeriesDetail(id);
        }
    },

    generateAllEps(seasons, episodes, seasonsData) {
        const arr = [];
        if (seasonsData && seasonsData.length > 0) {
            seasonsData.forEach(sd => {
                for (let j = 1; j <= sd.episodes; j++) {
                    arr.push(`${sd.season}-${j}`);
                }
            });
        } else {
            const epsPerSeason = Math.ceil(episodes / seasons);
            for (let i = 1; i <= seasons; i++) {
                const epsInThisSeason = i === seasons ? (episodes - (i-1)*epsPerSeason) : epsPerSeason;
                for (let j = 1; j <= epsInThisSeason; j++) {
                    arr.push(`${i}-${j}`);
                }
            }
        }
        return arr;
    },

    renderAll() {
        try {
            if (!this._tabSwipeInitialized) {
                this.initTabSwipe();
                this._tabSwipeInitialized = true;
            }
            this.updateBadges();
            this.updateGenreDropdowns();
            this.renderDashboard();
            this.renderMovies();
            this.renderSeries();
            this.renderBooks();
            this.renderProfileStats();
            this.updateUnreadBadges();
        } catch (e) {
            console.error('RenderAll error:', e);
        }
    },

    renderProfileStats() {
        const movies = this.state.movies || [];
        const series = this.state.series || [];
        const books  = this.state.books  || [];

        // Badges & Streak
        const streakEl = document.getElementById('statStreak');
        if (streakEl) streakEl.innerHTML = `🔥 ${this.state.streak || 0}`;
        
        const followingEl = document.getElementById('statFollowing');
        if (followingEl) followingEl.innerText = (this.state.following || []).length;

        const followersEl = document.getElementById('statFollowers');
        if (followersEl) followersEl.innerText = (this.state.followers || []).length;

        // Kütüphane İstatistikleri (Profile Tab)
        const smw = document.getElementById('statMoviesWatched');
        if (smw) smw.innerText = movies.filter(m => m.status === 'watched').length;

        const smwl = document.getElementById('statMoviesWatchlist');
        if (smwl) smwl.innerText = movies.filter(m => m.status === 'watchlist').length;

        const sst = document.getElementById('statSeriesTotal');
        if (sst) sst.innerText = series.length;

        const sew = document.getElementById('statEpsWatched');
        if (sew) {
            let totalEps = 0;
            series.forEach(s => {
                if (s.watchedEps) totalEps += s.watchedEps.length;
            });
            sew.innerText = totalEps;
        }

        // Kitap istatistikleri
        if (document.getElementById('statBooksRead')) {
            document.getElementById('statBooksRead').innerText = books.filter(b => b.status === 'read').length;
        }
        if (document.getElementById('statBooksReading')) {
            document.getElementById('statBooksReading').innerText = books.filter(b => b.status === 'reading').length;
        }
        if (document.getElementById('statBooksReadlist')) {
            document.getElementById('statBooksReadlist').innerText = books.filter(b => b.status === 'readlist').length;
        }
        if (document.getElementById('statBooksPages')) {
            const totalPages = books
                .filter(b => b.status === 'read')
                .reduce((sum, b) => sum + (parseInt(b.pages) || 0), 0);
            document.getElementById('statBooksPages').innerText = totalPages > 999
                ? (totalPages / 1000).toFixed(1) + 'K'
                : totalPages;
        }
        
        let earnedBadges = [];

        // 1. General & Movies
        if (movies.length > 0 || series.length > 0 || books.length > 0) {
            earnedBadges.push({ icon: '👶', name: 'Yeni Kan', desc: 'İlk içerik eklendi' });
        }
        
        const watchedMovies = movies.filter(m => m.status === 'watched').length;
        if (watchedMovies >= 5) earnedBadges.push({ icon: '🎬', name: 'Sinema Sever', desc: '5 film izlendi' });
        if (watchedMovies >= 10) earnedBadges.push({ icon: '🍿', name: 'Sinema Kurdu', desc: '10 film izlendi' });
        if (watchedMovies >= 25) earnedBadges.push({ icon: '🎭', name: 'Film Gurmesi', desc: '25 film izlendi' });
        if (watchedMovies >= 50) earnedBadges.push({ icon: '👑', name: 'Sinema Kralı', desc: '50 film izlendi' });
        if (watchedMovies >= 100) earnedBadges.push({ icon: '📽️', name: 'Yönetmen', desc: '100 film izlendi' });

        // 2. Series & Episodes
        let totalEps = 0;
        series.forEach(s => { if (s.watchedEps) totalEps += s.watchedEps.length; });
        if (totalEps >= 10) earnedBadges.push({ icon: '📺', name: 'Bölüm Avcısı', desc: '10 bölüm izlendi' });
        if (totalEps >= 50) earnedBadges.push({ icon: '🍿', name: 'Dizi Kolik', desc: '50 bölüm izlendi' });
        if (totalEps >= 100) earnedBadges.push({ icon: '🏃', name: 'Maratoncu', desc: '100 bölüm izlendi' });
        if (totalEps >= 250) earnedBadges.push({ icon: '🏆', name: 'Dizi Ustası', desc: '250 bölüm izlendi' });
        if (totalEps >= 500) earnedBadges.push({ icon: '🎭', name: 'Bağımlı', desc: '500 bölüm izlendi' });

        // 3. Books
        const readBooks = books.filter(b => b.status === 'read').length;
        if (readBooks >= 3) earnedBadges.push({ icon: '📖', name: 'Kitap Dostu', desc: '3 kitap okundu' });
        if (readBooks >= 10) earnedBadges.push({ icon: '📚', name: 'Kütüphaneci', desc: '10 kitap okundu' });
        if (readBooks >= 25) earnedBadges.push({ icon: '📜', name: 'Bilge Okur', desc: '25 kitap okundu' });
        if (readBooks >= 50) earnedBadges.push({ icon: '🖋️', name: 'Kelime Gezgini', desc: '50 kitap okundu' });
        if (readBooks >= 100) earnedBadges.push({ icon: '🧙‍♂️', name: 'Kitap Büyücüsü', desc: '100 kitap okundu' });

        // 4. Genre Specific (across all media)
        const allItems = [...movies, ...series, ...books];
        const genresCount = {};
        allItems.forEach(item => {
            if (item.genre) {
                item.genre.split(',').forEach(g => {
                    const cleanG = g.trim().toLowerCase();
                    genresCount[cleanG] = (genresCount[cleanG] || 0) + 1;
                });
            }
        });

        if (genresCount['korku'] >= 5) earnedBadges.push({ icon: '🧟', name: 'Korku Gecesi', desc: '5 korku içeriği' });
        if (genresCount['bilim kurgu'] >= 5 || genresCount['science fiction'] >= 5) earnedBadges.push({ icon: '🚀', name: 'Uzay Yolcusu', desc: '5 bilim kurgu' });
        if (genresCount['romantik'] >= 5 || genresCount['romance'] >= 5) earnedBadges.push({ icon: '💖', name: 'Romantik Ruh', desc: '5 romantik içerik' });
        if (genresCount['aksiyon'] >= 5 || genresCount['action'] >= 5) earnedBadges.push({ icon: '🧨', name: 'Aksiyon Bağımlısı', desc: '5 aksiyon içeriği' });

        // 5. Activity
        const ratedCount = [...movies, ...series, ...books].filter(x => x.rating > 0).length;
        if (ratedCount >= 10) earnedBadges.push({ icon: '⭐', name: 'Eleştirmen', desc: '10 yapıma puan verildi' });
        if (this.state.streak >= 7) earnedBadges.push({ icon: '🔥', name: 'İstikrarlı', desc: '7 günlük giriş serisi' });

        const sbc = document.getElementById('statBadgeCount');
        if (sbc) sbc.innerText = earnedBadges.length;

        const maxDisplayBadges = earnedBadges.slice(0, 3);
        const badgesList = document.getElementById('badgesList');
        if (badgesList) {
            if (earnedBadges.length === 0) {
                badgesList.innerHTML = `<div class="empty-widget" style="width:100%; text-align:center;">Henüz rozet kazanılmadı</div>`;
            } else {
                badgesList.innerHTML = maxDisplayBadges.map(b => `
                    <div style="background:var(--bg2); padding:12px; border-radius:12px; border:1px solid var(--border); min-width:110px; flex:1; text-align:center; display:flex; flex-direction:column; align-items:center; gap:4px;">
                        <span style="font-size:24px;">${b.icon}</span>
                        <span style="font-size:13px; font-weight:600;">${b.name}</span>
                        <span style="font-size:10px; color:var(--text3);">${b.desc}</span>
                    </div>
                `).join('');
            }
        }

        // Chart.js (Genre Distribution)
        const ctx = document.getElementById('genreChart');
        if (!ctx) return;
        
        const type = this._currentChartType || 'movie';
        let items = [];
        if (type === 'movie') items = this.state.movies;
        else if (type === 'series') items = this.state.series;
        else if (type === 'book') items = this.state.books || [];

        const genreCounts = {};
        items.forEach(item => {
            if (item.genre) {
                item.genre.split(',').forEach(g => {
                    const cleanG = g.trim();
                    if (cleanG) {
                        genreCounts[cleanG] = (genreCounts[cleanG] || 0) + 1;
                    }
                });
            }
        });

        const sortedGenres = Object.entries(genreCounts).sort((a,b) => b[1] - a[1]).slice(0, 5);
        
        if (this.genreChartInstance) {
            this.genreChartInstance.destroy();
            this.genreChartInstance = null;
        }

        if (sortedGenres.length === 0) {
            // Nothing to show yet, clear the canvas area
            const canvas = document.getElementById('genreChart');
            if (canvas) {
                const ctx2d = canvas.getContext('2d');
                ctx2d.clearRect(0, 0, canvas.width, canvas.height);
                // Also clear the legend by resetting the chart instance if it exists
                if (this.genreChartInstance) {
                    this.genreChartInstance.destroy();
                    this.genreChartInstance = null;
                }
            }
            return;
        }

        const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

        this.genreChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: sortedGenres.map(g => g[0]),
                datasets: [{
                    data: sortedGenres.map(g => g[1]),
                    backgroundColor: [
                        cssVar('--primary') || '#a855f7',
                        cssVar('--pink') || '#ec4899',
                        cssVar('--blue') || '#3b82f6',
                        cssVar('--amber') || '#f59e0b',
                        cssVar('--green') || '#10b981'
                    ],
                    borderWidth: 0,
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: { color: cssVar('--text') || '#fff', font: { family: 'Inter' } }
                    }
                }
            }
        });
    },
    
    switchChartTab(type, btn) {
        this._currentChartType = type;
        if (btn) {
            const parent = btn.parentElement;
            parent.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        }
        this.renderProfileStats();
    },

    updateGenreDropdowns() {
        const movieGenres = new Set();
        this.state.movies.forEach(m => {
            if (m.genre) m.genre.split(',').forEach(g => movieGenres.add(g.trim()));
        });
        const mSelect = document.getElementById('movieGenreFilter');
        if (mSelect) {
            const currentMVal = mSelect.value;
            mSelect.innerHTML = `<option value="all">Tüm Türler</option>` + 
                Array.from(movieGenres).sort().map(g => `<option value="${g}">${g}</option>`).join('');
            if (Array.from(movieGenres).includes(currentMVal)) mSelect.value = currentMVal;
        }

        const seriesGenres = new Set();
        this.state.series.forEach(s => {
            if (s.genre) s.genre.split(',').forEach(g => seriesGenres.add(g.trim()));
        });
        const sSelect = document.getElementById('seriesGenreFilter');
        if (sSelect) {
            const currentSVal = sSelect.value;
            sSelect.innerHTML = `<option value="all">Tüm Türler</option>` + 
                Array.from(seriesGenres).sort().map(g => `<option value="${g}">${g}</option>`).join('');
            if (Array.from(seriesGenres).includes(currentSVal)) sSelect.value = currentSVal;
        }
    },

    updateBadges() {
        const movieWatchlist = this.state.movies.filter(m => m.status === 'watchlist').length;
        const movieWatched = this.state.movies.filter(m => m.status === 'watched').length;
        const seriesWatching = this.state.series.filter(s => s.status === 'watching').length;
        const seriesCompleted = this.state.series.filter(s => s.status === 'completed').length;
        const booksRead = (this.state.books || []).filter(b => b.status === 'read').length;
        const booksReadlist = (this.state.books || []).filter(b => b.status === 'readlist').length;
        
        const mb = document.getElementById('movieBadge');
        if (mb) mb.innerText = movieWatchlist > 0 ? movieWatchlist : '';
        
        const sb = document.getElementById('seriesBadge');
        if (sb) sb.innerText = seriesWatching > 0 ? seriesWatching : '';

        const bb = document.getElementById('bookBadge');
        if (bb) bb.innerText = booksReadlist > 0 ? booksReadlist : '';

        // Update Header Stats
        const hmw = document.getElementById('headerMoviesWatched');
        if (hmw) hmw.innerText = movieWatched;
        const hmwl = document.getElementById('headerMoviesWatchlist');
        if (hmwl) hmwl.innerText = movieWatchlist;

        const hsc = document.getElementById('headerSeriesCompleted');
        if (hsc) hsc.innerText = seriesCompleted;
        const hsw = document.getElementById('headerSeriesWatchlist');
        if (hsw) hsw.innerText = (this.state.series || []).filter(s => s.status === 'watchlist').length;

        const hbr = document.getElementById('headerBooksRead');
        if (hbr) hbr.innerText = booksRead;
        const hbrl = document.getElementById('headerBooksReadlist');
        if (hbrl) hbrl.innerText = booksReadlist;
    },

    renderDashboard() {
        // Stats
        const smw = document.getElementById('statMoviesWatched');
        if (smw) smw.innerText = this.state.movies.filter(m => m.status === 'watched').length;

        const smwl = document.getElementById('statMoviesWatchlist');
        if (smwl) smwl.innerText = this.state.movies.filter(m => m.status === 'watchlist').length;

        const sst = document.getElementById('statSeriesTotal');
        if (sst) sst.innerText = this.state.series.length;
        
        const sew = document.getElementById('statEpsWatched');
        if (sew) {
            let totalEps = 0;
            this.state.series.forEach(s => {
                if (s.watchedEps) totalEps += s.watchedEps.length;
            });
            sew.innerText = totalEps;
        }

        // Continue Reading (Books)
        // Continue Watching (Series)
        const continueList = document.getElementById('continueList');
        const watching = this.state.series.filter(s => s.status === 'watching');
        if (watching.length === 0) {
            continueList.innerHTML = '<div class="empty-widget">Henüz dizi yok</div>';
        } else {
            continueList.innerHTML = watching.map(s => {
                const total = s.episodes || 1;
                const watched = (s.watchedEps || []).length;
                const perc = Math.min(100, Math.round((watched / total) * 100));
                return `
                <div class="continue-item" onclick="App.openSeriesDetail('${s.id}')">
                    <div class="continue-thumb">
                        ${s.poster ? `<img src="${s.poster}" style="width:100%;height:100%;object-fit:cover;border-radius:6px;" onerror="this.outerHTML='📺'"/>` : '📺'}
                    </div>
                    <div class="continue-info">
                        <div class="continue-title">${s.title}</div>
                        <div class="continue-sub">${watched} / ${total} Bölüm</div>
                        <div class="continue-prog">
                            <div class="continue-prog-bar" style="width: ${perc}%"></div>
                        </div>
                    </div>
                    <button class="continue-play" onclick="event.stopPropagation();App.watchNextEp('${s.id}')">▶</button>
                </div>
                `;
            }).join('');
        }

        // Continue Reading (Books)
        const continueReadingList = document.getElementById('continueReadingList');
        const reading = this.state.books.filter(b => b.status === 'reading');
        if (continueReadingList) {
            if (reading.length === 0) {
                document.getElementById('continueReadingWidget').classList.add('hidden');
            } else {
                document.getElementById('continueReadingWidget').classList.remove('hidden');
                continueReadingList.innerHTML = reading.map(b => {
                    const current = b.currentPage || 0;
                    const total = parseInt(b.pages) || 1;
                    const perc = Math.min(100, Math.round((current / total) * 100));
                    
                    return `
                    <div class="continue-item" onclick="App.openBookDetail('${b.id}')">
                        <div class="continue-thumb">
                            ${b.cover ? `<img src="${b.cover}" style="width:100%;height:100%;object-fit:cover;border-radius:6px;" onerror="this.outerHTML='📚'"/>` : '📚'}
                        </div>
                        <div class="continue-info" style="flex: 1;">
                            <div class="continue-title">${b.title}</div>
                            <div class="continue-sub">${current} / ${total} Sayfa</div>
                            <div class="continue-prog" style="margin-top: 8px;">
                                <div class="continue-prog-bar" style="width: ${perc}%"></div>
                            </div>
                        </div>
                        <div class="continue-perc" style="font-size: 10px; font-weight: 700; color: var(--purple); margin-left: 10px;">%${perc}</div>
                    </div>
                    `;
                }).join('');
            }
        }

        // Recent
        const recentList = document.getElementById('recentList');
        const booksForRecent = (this.state.books || []).map(b => ({...b, type: 'book'}));
        const allItems = [...this.state.movies, ...this.state.series, ...booksForRecent].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5);
        if (allItems.length === 0) {
            recentList.innerHTML = '<div class="empty-widget">Henüz içerik yok</div>';
        } else {
            recentList.innerHTML = allItems.map(item => `
                <div class="recent-item" onclick="App.${item.type === 'movie' ? 'openMovieDetail' : item.type === 'series' ? 'openSeriesDetail' : 'openBookDetail'}('${item.id}')">
                    <div class="recent-type">${item.type === 'movie' ? '🎬' : item.type === 'series' ? '📺' : '📚'}</div>
                    <div class="recent-info">
                        <div class="recent-title">${item.title}</div>
                        <div class="recent-meta">${item.type === 'movie' ? 'Film' : item.type === 'series' ? 'Dizi' : 'Kitap'} • ${new Date(item.createdAt).toLocaleDateString()}</div>
                    </div>
                </div>
            `).join('');
        }

        // Top Rated
        const topRatedList = document.getElementById('topRatedList');
        const topMovies = this.state.movies.filter(m => m.rating > 0).sort((a, b) => b.rating - a.rating).slice(0, 3);
        if (topMovies.length === 0) {
            topRatedList.innerHTML = '<div class="empty-widget">Henüz puanlanmış film yok</div>';
        } else {
            topRatedList.innerHTML = topMovies.map((m, i) => `
                <div class="toprated-item" onclick="App.openMovieDetail('${m.id}')">
                    <div class="toprated-rank">${i + 1}</div>
                    <div class="toprated-info">
                        <div class="toprated-title">${m.title}</div>
                        <div class="toprated-stars">${'★'.repeat(m.rating)}${'☆'.repeat(10 - m.rating)}</div>
                    </div>
                </div>
            `).join('');
        }

        // Discover Carousel
        const discoverWidget = document.getElementById('discoverWidget');
        if (discoverWidget) {
            discoverWidget.classList.remove('hidden');
            const discCarousel = document.getElementById('discoverCarousel');
            if (discCarousel && discCarousel.innerHTML.includes('Yükleniyor')) {
                this.loadDiscoverCarousel();
            }
        }

        // Quote of the Day
        this.renderQuote();

        // Goal
        const gi = document.getElementById('goalInput');
        if (gi) gi.value = this.state.goal;
        
        const gt = document.getElementById('goalTarget');
        if (gt) gt.innerText = this.state.goal;
        
        const gc = document.getElementById('goalCurrent');
        if (gc) gc.innerText = this.state.goalCurrent;
        
        const goalPerc = Math.min(100, Math.round((this.state.goalCurrent / this.state.goal) * 100));
        const offset = 314 - (314 * goalPerc) / 100;
        
        const gr = document.getElementById('goalRing');
        if (gr) gr.style.strokeDashoffset = offset;

        const svgElement = document.querySelector('.goal-svg');
        const rankEl = document.getElementById('goalRank');
        const streakEl = document.getElementById('goalStreak');
        const msgEl = document.getElementById('goalMessage');
        const emojiEl = document.getElementById('goalEmoji');
        
        if (streakEl) {
            streakEl.innerText = `🔥 ${this.state.streak || 0} Günlük Seri`;
        }

        if (goalPerc === 0) {
            rankEl.innerText = 'Başlangıç Çizgisi';
            msgEl.innerText = 'Haftaya yeni başladık, favori dizini açma vakti!';
            emojiEl.innerText = '🍿';
            svgElement.classList.remove('completed');
        } else if (goalPerc < 50) {
            rankEl.innerText = 'Çaylak İzleyici';
            msgEl.innerText = 'Isınma turları! İlerlemeye devam et.';
            emojiEl.innerText = '📺';
            svgElement.classList.remove('completed');
        } else if (goalPerc < 100) {
            rankEl.innerText = 'İstikrarlı İzleyici';
            msgEl.innerText = 'Harika gidiyorsun, hedefine çok az kaldı!';
            emojiEl.innerText = '👀';
            svgElement.classList.remove('completed');
        } else if (this.state.goalCurrent > this.state.goal) {
            rankEl.innerText = 'Efsanevi Sinefil';
            msgEl.innerText = 'Hedefi paramparça ettin! İzlemeye doyamıyorsun!';
            emojiEl.innerText = '🔥';
            svgElement.classList.add('completed');
        } else {
            rankEl.innerText = 'Görev Tamamlandı';
            msgEl.innerText = 'İşte bu! Haftalık hedefine ulaştın.';
            emojiEl.innerText = '🏆';
            svgElement.classList.add('completed');
        }
    },

    renderQuote() {
        const quotes = [
            { t: "Hayat, siz başka planlar yapmakla meşgulken başınıza gelenlerdir.", a: "John Lennon" },
            { t: "Büyük işler başarmak için sadece harekete geçmek yetmez, aynı zamanda hayal etmelisiniz.", a: "Anatole France" },
            { t: "İyi bir film, ancak onu izledikten sonra hayatınızda bir şeyler değişiyorsa iyidir.", a: "Akira Kurosawa" },
            { t: "Kitapsız bir oda, ruhsuz bir vücut gibidir.", a: "Cicero" },
            { t: "Okumak, başka birinin kafasıyla düşünmektir.", a: "Arthur Schopenhauer" },
            { t: "Sinema, hayatın tüm sıkıcı kısımlarının ayıklandığı halidir.", a: "Alfred Hitchcock" },
            { t: "Hayallerinizi küçümseyen insanlardan uzak durun.", a: "Mark Twain" },
            { t: "Bir kitap, dünyayı değiştirmenin en sessiz yoludur.", a: "Pablo Neruda" },
            { t: "Film izlemek, başkasının hayatında bir süreliğine yaşamaktır.", a: "Roger Ebert" },
            { t: "En güzel yolculuklar, bir kitabın sayfaları arasında yapılanlardır.", a: "Voltaire" },
            { t: "Sanat, gerçeği söylemenin yalan söyleme biçimidir.", a: "Pablo Picasso" },
            { t: "Bir filmin sonu, yeni bir düşüncenin başlangıcıdır.", a: "Andrei Tarkovsky" }
        ];

        // Her oturumda rastgele bir söz seç ve session boyunca sabitle
        if (!this._sessionQuoteIndex) {
            this._sessionQuoteIndex = Math.floor(Math.random() * quotes.length);
        }
        const quote = quotes[this._sessionQuoteIndex];
        
        const textEl = document.getElementById('quoteText');
        const authEl = document.getElementById('quoteAuthor');
        if (textEl && authEl) {
            textEl.innerText = `"${quote.t}"`;
            authEl.innerText = `— ${quote.a}`;
        }
    },

    updateBookDetailProgressUI(e, total) {
        const val = parseInt(e.target.value);
        const perc = Math.min(100, Math.round((val / total) * 100));
        const widget = e.target.closest('.stats-widget');
        if (widget) {
            widget.querySelector('b').innerText = `${val} / ${total} Sayfa`;
            widget.querySelector('span[style*="color:var(--purple)"]').innerText = `%${perc}`;
        }
    },

    updateBookProgressUI(e, id, total) {
        const val = parseInt(e.target.value);
        const perc = Math.min(100, Math.round((val / total) * 100));
        const item = e.target.closest('.continue-item');
        if (item) {
            item.querySelector('.continue-sub').innerText = `${val} / ${total} Sayfa`;
            item.querySelector('.continue-perc').innerText = `%${perc}`;
        }
    },

    async saveBookProgress(id, page, total) {
        const pageNum = parseInt(page);
        const bookIndex = this.state.books.findIndex(b => b.id === id);
        if (bookIndex === -1) return;

        const book = { ...this.state.books[bookIndex] };
        book.currentPage = pageNum;

        if (pageNum >= total && total > 0) {
            book.status = 'read';
            this.showToast('Tebrikler! Kitabı bitirdin. 📚');
        }

        this.state.books[bookIndex] = book;
        await this.save();
        this.renderAll();
    },

    renderMovies() {
        const grid = document.getElementById('movieGrid');
        if (!grid) return;

        const si = document.getElementById('searchInput');
        const search = si ? si.value.trim().toLocaleLowerCase('tr') : '';
        const filterBtn = document.querySelector('#tab-movies .filter-btn.active');
        const filter = filterBtn ? filterBtn.dataset.filter : 'all';
        const ms = document.getElementById('movieSort');
        const sort = ms ? ms.value : 'added';
        const mgf = document.getElementById('movieGenreFilter');
        const genreFilter = mgf ? mgf.value : 'all';

        let filtered = this.state.movies.filter(m => {
            if (search && !m.title.toLocaleLowerCase('tr').includes(search)) return false;
            if (filter === 'favorites') {
                if (!m.favorite) return false;
            } else if (filter !== 'all' && m.status !== filter) {
                return false;
            }
            if (genreFilter !== 'all' && (!m.genre || !m.genre.split(',').map(g=>g.trim()).includes(genreFilter))) return false;
            return true;
        });

        filtered.sort((a, b) => {
            if (sort === 'added') return b.createdAt - a.createdAt;
            if (sort === 'rating') return (b.rating || 0) - (a.rating || 0);
            if (sort === 'title') return a.title.localeCompare(b.title);
            if (sort === 'year') return (parseInt(b.year) || 0) - (parseInt(a.year) || 0);
            return 0;
        });

        if (filtered.length === 0) {
            if (this.state.movies.length === 0 && !search && filter === 'all') {
                grid.innerHTML = `
                <div class="empty-state" id="movieEmpty">
                    <div class="empty-icon">🎬</div>
                    <p>Henüz film eklenmedi</p>
                    <button class="btn-primary" id="addFirstMovieBtn">Film Ekle</button>
                </div>`;
                document.getElementById('addFirstMovieBtn').addEventListener('click', () => {
                    this.switchTab('movies');
                    this.openAddModal('movie');
                });
            } else {
                grid.innerHTML = '<div class="empty-state"><p>Sonuç bulunamadı</p></div>';
            }
            grid.style.display = 'block';
        } else {
            grid.style.display = 'grid';
            grid.innerHTML = filtered.map(m => {
                let badge = '';
                if (m.status === 'watched') badge = '<div class="movie-status-badge badge-watched">İzlendi</div>';
                else if (m.status === 'watchlist') badge = '<div class="movie-status-badge badge-watchlist">İzlenecek</div>';
                else if (m.status === 'watching') badge = '<div class="movie-status-badge badge-watching">İzleniyor</div>';

                const starColor = this.getRatingColor(m.rating);
                const starHtml = m.rating ? `<div class="movie-rating" style="color:${starColor}">${'★'.repeat(m.rating)}<span style="color:var(--bg3)">${'★'.repeat(10-m.rating)}</span></div>` : '';
                
                let globalBadge = m.globalRating ? `<div class="global-rating-badge">⭐ ${m.globalRating}</div>` : '';
                let mustWatchBadge = m.rating >= 9 ? `<div class="must-watch-badge">✨ Başyapıt</div>` : '';
                let platformBadge = this.getPlatformBadge(m.platform);

                return `
                <div class="swipe-item" data-id="${m.id}" data-type="movie">
                    <div class="swipe-bg swipe-action-left"><span class="swipe-icon">✅</span></div>
                    <div class="swipe-bg swipe-action-right"><span class="swipe-icon">❤️</span></div>
                    <div class="swipe-item-content">
                        <div class="movie-card" onclick="App.openMovieDetail('${m.id}')">
                            <div class="movie-poster">
                                ${m.poster ? `<img src="${m.poster}" loading="lazy" />` : `<div class="movie-poster-placeholder">🎬</div>`}
                                ${globalBadge}
                                ${mustWatchBadge}
                                ${badge}
                            </div>
                            <div class="movie-info">
                                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom: 2px;">
                                    <div class="movie-title" style="margin-bottom:0;">${m.title} ${platformBadge}</div>
                                    <div onclick="event.stopPropagation(); App.toggleFavoriteFromGrid('${m.id}', 'movie')" style="font-size: 16px; cursor: pointer; transition: transform 0.2s; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));" onmouseover="this.style.transform='scale(1.2)'" onmouseout="this.style.transform='scale(1)'">
                                        ${m.favorite ? '❤️' : '🤍'}
                                    </div>
                                </div>
                                <div class="movie-year">${m.year || ''} ${m.genre ? `• ${m.genre}` : ''}</div>
                                ${starHtml}
                            </div>
                        </div>
                    </div>
                </div>
                `;
            }).join('');
            this.bindSwipeEvents();
        }
        
        // Init SortableJS if no filters/sort applied
        if (sort === 'added' && !search && filter === 'all' && genreFilter === 'all' && filtered.length > 1) {
            if (this.movieSortable) this.movieSortable.destroy();
            this.movieSortable = Sortable.create(grid, {
                animation: 150,
                delay: 100, // For mobile touch drag
                delayOnTouchOnly: true,
                onEnd: (evt) => {
                    const itemEl = evt.item;
                    const oldIndex = evt.oldIndex;
                    const newIndex = evt.newIndex;
                    if (oldIndex !== newIndex) {
                        // Reorder in state
                        const movedItem = this.state.movies.splice(oldIndex, 1)[0];
                        this.state.movies.splice(newIndex, 0, movedItem);
                        this.save();
                    }
                }
            });
        } else if (this.movieSortable) {
            this.movieSortable.destroy();
            this.movieSortable = null;
        }
    },

    renderSeries() {
        const list = document.getElementById('seriesList');
        if (!list) return;

        const si = document.getElementById('searchInput');
        const search = si ? si.value.trim().toLocaleLowerCase('tr') : '';
        const filterBtn = document.querySelector('#tab-series .filter-btn.active');
        const filter = filterBtn ? filterBtn.dataset.filter : 'all';
        const ss = document.getElementById('seriesSort');
        const sort = ss ? ss.value : 'added';
        const sgf = document.getElementById('seriesGenreFilter');
        const genreFilter = sgf ? sgf.value : 'all';

        let filtered = this.state.series.filter(s => {
            if (search && !s.title.toLocaleLowerCase('tr').includes(search)) return false;
            if (filter === 'favorites') {
                if (!s.favorite) return false;
            } else if (filter !== 'all' && s.status !== filter) {
                return false;
            }
            if (genreFilter !== 'all' && (!s.genre || !s.genre.split(',').map(g=>g.trim()).includes(genreFilter))) return false;
            return true;
        });

        filtered.sort((a, b) => {
            if (sort === 'added') return b.createdAt - a.createdAt;
            if (sort === 'title') return a.title.localeCompare(b.title);
            if (sort === 'progress') {
                const pA = (a.watchedEps || []).length / (a.episodes || 1);
                const pB = (b.watchedEps || []).length / (b.episodes || 1);
                return pB - pA;
            }
            return 0;
        });

        if (filtered.length === 0) {
            if (this.state.series.length === 0 && !search && filter === 'all') {
                list.innerHTML = `
                <div class="empty-state" id="seriesEmpty">
                    <div class="empty-icon">📺</div>
                    <p>Henüz dizi eklenmedi</p>
                    <button class="btn-primary" id="addFirstSeriesBtn">Dizi Ekle</button>
                </div>`;
                document.getElementById('addFirstSeriesBtn').addEventListener('click', () => {
                    this.switchTab('series');
                    this.openAddModal('series');
                });
            } else {
                list.innerHTML = '<div class="empty-state"><p>Sonuç bulunamadı</p></div>';
            }
        } else {
            list.innerHTML = filtered.map(s => {
                const total = s.episodes || 1;
                const watched = (s.watchedEps || []).length;
                const perc = Math.min(100, Math.round((watched / total) * 100));

                let statusTag = '';
                if (s.status === 'watching') statusTag = '<span class="series-status-tag status-watching">İzleniyor</span>';
                else if (s.status === 'completed') statusTag = '<span class="series-status-tag status-completed">Bitti</span>';
                else if (s.status === 'paused') statusTag = '<span class="series-status-tag status-paused">Durduruldu</span>';
                else if (s.status === 'watchlist') statusTag = '<span class="series-status-tag status-watchlist">İzlenecek</span>';

                return `
                <div class="swipe-item" data-id="${s.id}" data-type="series">
                    <div class="swipe-bg swipe-action-left"><span class="swipe-icon">✅</span></div>
                    <div class="swipe-bg swipe-action-right"><span class="swipe-icon">❤️</span></div>
                    <div class="swipe-item-content">
                        <div class="series-card" onclick="App.openSeriesDetail('${s.id}')">
                            <div class="series-thumb">
                                ${s.poster ? `<img src="${s.poster}" loading="lazy" />` : `<div class="series-poster-placeholder">📺</div>`}
                                ${statusTag}
                            </div>
                            <div class="series-meta">
                                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom: 2px;">
                                    <div class="series-title" style="margin-bottom:0;">${s.title}</div>
                                    <div onclick="event.stopPropagation(); App.toggleFavoriteFromGrid('${s.id}', 'series')" style="font-size: 16px; cursor: pointer; transition: transform 0.2s;">
                                        ${s.favorite ? '❤️' : '🤍'}
                                    </div>
                                </div>
                                <div class="series-year">${s.year || ''} ${s.genre ? `• ${s.genre}` : ''}</div>
                                <div class="series-prog-wrap">
                                    <div class="series-prog-label">
                                        <span>İlerleme</span>
                                        <span>${watched} / ${total}</span>
                                    </div>
                                    <div class="series-prog">
                                        <div class="series-prog-bar" style="width: ${perc}%"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                `;
            }).join('');
            this.bindSwipeEvents();
        }
        
        // Init SortableJS if no filters/sort applied
        if (sort === 'added' && !search && filter === 'all' && genreFilter === 'all' && filtered.length > 1) {
            if (this.seriesSortable) this.seriesSortable.destroy();
            this.seriesSortable = Sortable.create(list, {
                animation: 150,
                delay: 100, // For mobile touch drag
                delayOnTouchOnly: true,
                onEnd: (evt) => {
                    const oldIndex = evt.oldIndex;
                    const newIndex = evt.newIndex;
                    if (oldIndex !== newIndex) {
                        // Reorder in state
                        const movedItem = this.state.series.splice(oldIndex, 1)[0];
                        this.state.series.splice(newIndex, 0, movedItem);
                        this.save();
                    }
                }
            });
        } else if (this.seriesSortable) {
            this.seriesSortable.destroy();
            this.seriesSortable = null;
        }
    },

    openMovieDetail(idOrItem) {
        let m;
        if (typeof idOrItem === 'object') {
            m = idOrItem;
        } else {
            m = this.state.movies.find(x => x.id === idOrItem);
        }
        if (!m) return;
        
        const id = m.id;
        this.editingId = id;
        
        let starsInteractive = `<div class="interactive-stars" style="margin-top: 10px; display: flex; align-items: center; justify-content: center; gap: 4px;">`;
        for (let i=1; i<=10; i++) {
            starsInteractive += `<span style="font-size: 28px; cursor: pointer; transition: 0.2s; color: ${i <= (m.rating || 0) ? this.getRatingColor(m.rating) : 'var(--bg3)'}" onclick="event.stopPropagation(); App.quickRate('${m.id}', 'movie', ${i})">★</span>`;
        }
        starsInteractive += `<span onclick="event.stopPropagation(); App.quickRate('${m.id}', 'movie', 0)" style="font-size: 16px; margin-left: 10px; cursor: pointer; color: var(--text3); opacity: 0.6; padding: 5px;" title="Puanı Sıfırla">✕</span>`;
        starsInteractive += `</div>`;

        const statusOptions = `
            <select class="detail-status-select" onchange="App.quickStatus('${m.id}', 'movie', this.value)">
                <option value="watchlist" ${m.status === 'watchlist' ? 'selected' : ''}>İzlenecek</option>
                <option value="watching" ${m.status === 'watching' ? 'selected' : ''}>İzleniyor</option>
                <option value="watched" ${m.status === 'watched' ? 'selected' : ''}>İzlendi</option>
            </select>
        `;

        let platformBadge = this.getPlatformBadge(m.platform);

        const body = `
            ${m.poster ? `<div class="detail-poster"><img src="${m.poster}" /></div>` : ''}
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <h3 class="detail-title" style="margin:0;">${m.title} ${platformBadge}</h3>
                ${statusOptions}
            </div>
            <div class="detail-tags">
                ${m.year ? `<span class="detail-tag">${m.year}</span>` : ''}
                ${m.duration ? `<span class="detail-tag">${m.duration} dk</span>` : ''}
                ${m.genre ? `<span class="detail-tag">${m.genre}</span>` : ''}
            </div>
            ${starsInteractive}
            ${m.note ? `<div class="detail-note">${m.note}</div>` : ''}
        `;
        
        document.getElementById('movieDetailBody').innerHTML = body;
        const favBtn = document.getElementById('movieFavoriteBtn');
        if (favBtn) {
            favBtn.innerText = m.favorite ? '❤️ Favoriden Çıkar' : '🤍 Favori';
            favBtn.style.display = m.isSharedTemp ? 'none' : 'block';
        }

        const isTemp = !!m.isSharedTemp;
        const deleteBtn = document.getElementById('movieDetailDeleteBtn');
        if (deleteBtn) {
            if (isTemp) {
                deleteBtn.innerText = '📥 Kütüphaneye Ekle';
                deleteBtn.style.background = 'var(--primary)';
                deleteBtn.style.color = 'white';
                deleteBtn.onclick = () => App.addSharedItemToLibrary('movie', m);
            } else {
                deleteBtn.innerText = '🗑️ Sil';
                deleteBtn.style.background = 'var(--red)';
                deleteBtn.style.color = 'white';
                deleteBtn.onclick = () => App.deleteItem('movie');
            }
        }

        const shareBtn = document.getElementById('movieShareBtn');
        if (shareBtn) {
            shareBtn.style.display = isTemp ? 'none' : 'block';
        }

        document.getElementById('movieDetailModal').classList.add('open');
        this.pushHistoryState();
    },

    openSeriesDetail(idOrItem) {
        let s;
        if (typeof idOrItem === 'object') {
            s = idOrItem;
        } else {
            s = this.state.series.find(x => x.id === idOrItem);
        }
        if (!s) return;
        
        const id = s.id;
        this.editingId = id;
        
        s.seasons = s.seasons || 1;
        s.episodes = s.episodes || 1;
        
        let seasonsHtml = '';
        
        const isTemp = !!s.isSharedTemp;
        
        if (!isTemp) {
            if (s.seasonsData && s.seasonsData.length > 0) {
                s.seasonsData.forEach(sd => {
                    let epsHtml = '';
                    for (let j = 1; j <= sd.episodes; j++) {
                        const epId = `${sd.season}-${j}`;
                        const isWatched = (s.watchedEps || []).includes(epId);
                        epsHtml += `<button class="ep-btn ${isWatched ? 'watched' : ''}" onclick="App.toggleEpisode('${id}', '${epId}', this)">${j}</button>`;
                    }
                    seasonsHtml += `
                        <div class="season-block">
                            <h4>Sezon ${sd.season}</h4>
                            <div class="eps-grid">${epsHtml}</div>
                        </div>
                    `;
                });
            } else {
                const epsPerSeason = Math.ceil(s.episodes / s.seasons);
                for (let i = 1; i <= s.seasons; i++) {
                    let epsHtml = '';
                    const epsInThisSeason = i === s.seasons ? (s.episodes - (i-1)*epsPerSeason) : epsPerSeason;
                    
                    for (let j = 1; j <= epsInThisSeason; j++) {
                        const epId = `${i}-${j}`;
                        const isWatched = (s.watchedEps || []).includes(epId);
                        epsHtml += `<button class="ep-btn ${isWatched ? 'watched' : ''}" onclick="App.toggleEpisode('${id}', '${epId}', this)">${j}</button>`;
                    }
                    
                    seasonsHtml += `
                        <div class="season-block">
                            <h4>Sezon ${i}</h4>
                            <div class="eps-grid">${epsHtml}</div>
                        </div>
                    `;
                }
            }
        }

        let starsInteractive = `<div class="interactive-stars" style="margin-top: 10px; display: flex; align-items: center; justify-content: center; gap: 4px;">`;
        for (let i=1; i<=10; i++) {
            starsInteractive += `<span style="font-size: 28px; cursor: pointer; transition: 0.2s; color: ${i <= (s.rating || 0) ? this.getRatingColor(s.rating) : 'var(--bg3)'}" onclick="event.stopPropagation(); App.quickRate('${s.id}', 'series', ${i})">★</span>`;
        }
        starsInteractive += `<span onclick="event.stopPropagation(); App.quickRate('${s.id}', 'series', 0)" style="font-size: 16px; margin-left: 10px; cursor: pointer; color: var(--text3); opacity: 0.6; padding: 5px;" title="Puanı Sıfırla">✕</span>`;
        starsInteractive += `</div>`;

        const statusOptions = `
            <select class="detail-status-select" onchange="App.quickStatus('${s.id}', 'series', this.value)">
                <option value="watchlist" ${s.status === 'watchlist' ? 'selected' : ''}>İzlenecek</option>
                <option value="watching" ${s.status === 'watching' ? 'selected' : ''}>İzleniyor</option>
                <option value="paused" ${s.status === 'paused' ? 'selected' : ''}>Durduruldu</option>
                <option value="completed" ${s.status === 'completed' ? 'selected' : ''}>Tamamlandı</option>
            </select>
        `;

        let platformBadge = this.getPlatformBadge(s.platform);

        const body = `
            ${s.poster ? `<div class="detail-poster"><img src="${s.poster}" /></div>` : ''}
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <h3 class="detail-title" style="margin:0;">${s.title} ${platformBadge}</h3>
                ${statusOptions}
            </div>
            <div class="detail-tags">
                ${s.year ? `<span class="detail-tag">${s.year}</span>` : ''}
                ${s.genre ? `<span class="detail-tag">${s.genre}</span>` : ''}
            </div>
            ${starsInteractive}
            ${s.note ? `<div class="detail-note">${s.note}</div>` : ''}
            ${isTemp ? '' : `
            <div style="margin: 12px 0 4px;">
                <button onclick="App.refreshSeriesFromTMDB('${s.id}')" style="width:100%; padding:10px; background:rgba(168,85,247,0.12); border:1px solid var(--primary); color:var(--primary); border-radius:10px; font-size:13px; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;">
                    🔄 Sezon/Bölüm Verilerini TMDB'den Güncelle
                </button>
            </div>
            <div class="detail-seasons">
                <h3>Bölümler</h3>
                ${seasonsHtml}
            </div>
            `}
        `;
        
        document.getElementById('seriesDetailBody').innerHTML = body;
        const favBtn = document.getElementById('seriesFavoriteBtn');
        if (favBtn) {
            favBtn.innerText = s.favorite ? '❤️ Favoriden Çıkar' : '🤍 Favoriye Ekle';
            favBtn.style.display = isTemp ? 'none' : 'block';
        }

        const deleteBtn = document.getElementById('seriesDetailDeleteBtn');
        if (deleteBtn) {
            if (isTemp) {
                deleteBtn.innerText = '📥 Kütüphaneye Ekle';
                deleteBtn.style.background = 'var(--primary)';
                deleteBtn.style.color = 'white';
                deleteBtn.onclick = () => App.addSharedItemToLibrary('series', s);
            } else {
                deleteBtn.innerText = '🗑️ Sil';
                deleteBtn.style.background = 'var(--red)';
                deleteBtn.style.color = 'white';
                deleteBtn.onclick = () => App.deleteItem('series');
            }
        }

        const shareBtn = document.getElementById('seriesShareBtn');
        if (shareBtn) {
            shareBtn.style.display = isTemp ? 'none' : 'block';
        }

        document.getElementById('seriesDetailModal').classList.add('open');
        this.pushHistoryState();
    },


    async refreshSeriesFromTMDB(seriesId) {
        const idx = this.state.series.findIndex(s => s.id === seriesId);
        if (idx === -1) return;
        const s = this.state.series[idx];

        this.showToast('🔄 TMDB\'den güncelleniyor...');

        try {
            let tmdbId = s.tmdbId || null;

            if (!tmdbId) {
                const searchRes = await fetch(`https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&language=tr-TR&query=${encodeURIComponent(s.title)}`);
                const searchData = await searchRes.json();
                if (searchData.results && searchData.results.length > 0) {
                    const match = searchData.results.find(r => r.name.toLowerCase() === s.title.toLowerCase()) || searchData.results[0];
                    tmdbId = match.id;
                }
            }

            if (!tmdbId) {
                this.showToast('❌ TMDB\'de bulunamadı', true);
                return;
            }

            const detailRes = await fetch(`https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${TMDB_API_KEY}&language=tr-TR`);
            const data = await detailRes.json();

            const oldSeasons = s.seasons || 1;
            const newSeasons = data.number_of_seasons || oldSeasons;
            const newEpisodes = data.number_of_episodes || s.episodes;
            const newPoster = data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : s.poster;
            const newSeasonsData = data.seasons
                ? data.seasons.filter(season => season.season_number > 0)
                               .map(season => ({ season: season.season_number, episodes: season.episode_count }))
                : s.seasonsData;

            this.state.series[idx] = {
                ...s,
                seasons: newSeasons,
                episodes: newEpisodes,
                poster: newPoster,
                seasonsData: newSeasonsData,
                tmdbId: String(tmdbId),
                updatedAt: Date.now()
            };

            this.save();
            this.renderAll();
            this.openSeriesDetail(seriesId);

            const addedSeasons = newSeasons - oldSeasons;
            if (addedSeasons > 0) {
                this.showToast(`✅ Güncellendi! +${addedSeasons} yeni sezon (${newSeasons} sezon, ${newEpisodes} bölüm)`);
            } else {
                this.showToast(`✅ Güncellendi! ${newSeasons} sezon, ${newEpisodes} bölüm`);
            }
        } catch (err) {
            console.error('TMDB refresh error:', err);
            this.showToast('❌ Güncelleme başarısız', true);
        }
    },

    toggleEpisode(seriesId, epId, btn) {
        const idx = this.state.series.findIndex(s => s.id === seriesId);
        if (idx === -1) return;
        
        const s = this.state.series[idx];
        if (!s.watchedEps) s.watchedEps = [];
        
        const [seasonStr, epStr] = epId.split('-');
        const season = parseInt(seasonStr);
        const ep = parseInt(epStr);

        let otherSeasonsEps = s.watchedEps.filter(e => !e.startsWith(`${season}-`));
        let thisSeasonEps = s.watchedEps.filter(e => e.startsWith(`${season}-`)).map(e => parseInt(e.split('-')[1]));
        
        let maxWatched = thisSeasonEps.length > 0 ? Math.max(...thisSeasonEps) : 0;

        let newThisSeason = [];
        if (maxWatched === ep) {
            // Unwatch this episode (and anything after, though there shouldn't be anything after)
            for (let i = 1; i < ep; i++) {
                newThisSeason.push(`${season}-${i}`);
            }
        } else {
            // Watch up to this episode (handles both jumping forward and rewinding)
            for (let i = 1; i <= ep; i++) {
                newThisSeason.push(`${season}-${i}`);
            }
        }
        
        s.watchedEps = [...otherSeasonsEps, ...newThisSeason];
        
        // Automations
        if (s.watchedEps.length > 0 && s.status === 'watchlist') {
            s.status = 'watching';
        }
        if (s.watchedEps.length > 0) {
            this.updateStreak();
        }
        if (s.watchedEps.length >= s.episodes) {
            if (s.status !== 'completed') {
                s.status = 'completed';
                this.showToast('Tebrikler, dizi bitti! 🎉');
            }
        } else if (s.status === 'completed' && s.watchedEps.length < s.episodes) {
            s.status = 'watching';
        }
        
        this.save();
        this.renderAll();
        // Re-render modal to visually update buttons and status dropdown
        this.openSeriesDetail(seriesId);
    },

    watchNextEp(seriesId) {
        const idx = this.state.series.findIndex(s => s.id === seriesId);
        if (idx === -1) return;
        
        const s = this.state.series[idx];
        if (!s.watchedEps) s.watchedEps = [];
        
        const epsPerSeason = Math.ceil(s.episodes / s.seasons);
        let foundUnwatched = false;

        for (let i = 1; i <= s.seasons; i++) {
            const epsInThisSeason = i === s.seasons ? (s.episodes - (i-1)*epsPerSeason) : epsPerSeason;
            for (let j = 1; j <= epsInThisSeason; j++) {
                const epId = `${i}-${j}`;
                if (!s.watchedEps.includes(epId)) {
                    s.watchedEps.push(epId);
                    foundUnwatched = true;
                    this.state.goalCurrent++;
                    
                    // Automations
                    if (s.status === 'watchlist') {
                        s.status = 'watching';
                    }
                    this.updateStreak();
                    if (s.watchedEps.length >= s.episodes && s.status !== 'completed') {
                        s.status = 'completed';
                        this.showToast('Tebrikler, dizi bitti! 🎉');
                    }
                    
                    break;
                }
            }
            if (foundUnwatched) break;
        }

        if (foundUnwatched) {
            this.save();
            this.renderDashboard();
            this.renderSeries();
            if (s.status !== 'completed') {
                this.showToast('Sonraki bölüm izlendi!');
            }
        } else {
            this.showToast('Tüm bölümler izlenmiş');
        }
    },

    updateStreak() {
        const todayStr = new Date().toDateString();
        if (this.state.lastWatchDate === todayStr) {
            return;
        }
        
        let yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toDateString();

        if (this.state.lastWatchDate === yesterdayStr) {
            this.state.streak++;
        } else {
            this.state.streak = 1;
        }
        
        this.state.lastWatchDate = todayStr;
        this.save();
    },

    getPlatformBadge(platform) {
        if (!platform) return '';
        switch(platform) {
            case 'netflix': return '<span class="platform-icon platform-netflix" title="Netflix">N</span>';
            case 'disney': return '<span class="platform-icon platform-disney" title="Disney+">+</span>';
            case 'prime': return '<span class="platform-icon platform-prime" title="Prime">P</span>';
            case 'mubi': return '<span class="platform-icon platform-mubi" title="Mubi">M</span>';
            case 'blutv': return '<span class="platform-icon platform-blutv" title="BluTV">B</span>';
            default: return '';
        }
    },

    showWrapped() {
        let totalHours = 0;
        let genres = {};
        let topRatedCount = 0;

        this.state.movies.forEach(m => {
            if (m.status === 'watched') {
                totalHours += (parseInt(m.duration) || 100) / 60;
                if (m.genre) {
                    m.genre.split(',').forEach(g => {
                        let tg = g.trim();
                        if(tg) genres[tg] = (genres[tg] || 0) + 1;
                    });
                }
            }
            if (m.rating >= 9) topRatedCount++;
        });

        this.state.series.forEach(s => {
            if (s.watchedEps) {
                totalHours += (s.watchedEps.length * 45) / 60; // assume avg 45 min/ep
            }
            if (s.rating >= 9) topRatedCount++;
            if (s.genre) {
                s.genre.split(',').forEach(g => {
                    let tg = g.trim();
                    if(tg) genres[tg] = (genres[tg] || 0) + 1;
                });
            }
        });

        let topGenre = '?';
        let maxG = 0;
        for (let g in genres) {
            if (genres[g] > maxG) {
                maxG = genres[g];
                topGenre = g;
            }
        }

        const date = new Date();
        const monthNames = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
        const monthName = monthNames[date.getMonth()];
        const year = date.getFullYear();
        document.getElementById('wrappedModalTitle').innerText = `CineTrack ${monthName} ${year} Özeti`;

        document.getElementById('wrappedHours').innerText = Math.round(totalHours);
        document.getElementById('wrappedGenre').innerText = topGenre;
        document.getElementById('wrappedTop').innerText = topRatedCount;

        document.getElementById('wrappedModal').classList.add('open');
        
        if (window.confetti) {
            confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        }
    },

    renderAllBadgesModal() {
        // This should match the logic in renderProfileStats
        let earnedBadges = [];
        const movies = this.state.movies || [];
        const series = this.state.series || [];
        const books  = this.state.books  || [];

        // 1. General & Movies
        if (movies.length > 0 || series.length > 0 || books.length > 0) earnedBadges.push({ icon: '👶', name: 'Yeni Kan', desc: 'İlk içerik eklendi' });
        
        const watchedMovies = movies.filter(m => m.status === 'watched').length;
        if (watchedMovies >= 5) earnedBadges.push({ icon: '🎬', name: 'Sinema Sever', desc: '5 film izlendi' });
        if (watchedMovies >= 10) earnedBadges.push({ icon: '🍿', name: 'Sinema Kurdu', desc: '10 film izlendi' });
        if (watchedMovies >= 25) earnedBadges.push({ icon: '🎭', name: 'Film Gurmesi', desc: '25 film izlendi' });
        if (watchedMovies >= 50) earnedBadges.push({ icon: '👑', name: 'Sinema Kralı', desc: '50 film izlendi' });
        if (watchedMovies >= 100) earnedBadges.push({ icon: '📽️', name: 'Yönetmen', desc: '100 film izlendi' });

        // 2. Series & Episodes
        let totalEps = 0;
        series.forEach(s => { if (s.watchedEps) totalEps += s.watchedEps.length; });
        if (totalEps >= 10) earnedBadges.push({ icon: '📺', name: 'Bölüm Avcısı', desc: '10 bölüm izlendi' });
        if (totalEps >= 50) earnedBadges.push({ icon: '🍿', name: 'Dizi Kolik', desc: '50 bölüm izlendi' });
        if (totalEps >= 100) earnedBadges.push({ icon: '🏃', name: 'Maratoncu', desc: '100 bölüm izlendi' });
        if (totalEps >= 250) earnedBadges.push({ icon: '🏆', name: 'Dizi Ustası', desc: '250 bölüm izlendi' });
        if (totalEps >= 500) earnedBadges.push({ icon: '🎭', name: 'Bağımlı', desc: '500 bölüm izlendi' });

        // 3. Books
        const readBooks = books.filter(b => b.status === 'read').length;
        if (readBooks >= 3) earnedBadges.push({ icon: '📖', name: 'Kitap Dostu', desc: '3 kitap okundu' });
        if (readBooks >= 10) earnedBadges.push({ icon: '📚', name: 'Kütüphaneci', desc: '10 kitap okundu' });
        if (readBooks >= 25) earnedBadges.push({ icon: '📜', name: 'Bilge Okur', desc: '25 kitap okundu' });
        if (readBooks >= 50) earnedBadges.push({ icon: '🖋️', name: 'Kelime Gezgini', desc: '50 kitap okundu' });
        if (readBooks >= 100) earnedBadges.push({ icon: '🧙‍♂️', name: 'Kitap Büyücüsü', desc: '100 kitap okundu' });

        // 4. Special
        const ratedCount = [...movies, ...series, ...books].filter(x => x.rating > 0).length;
        if (ratedCount >= 10) earnedBadges.push({ icon: '⭐', name: 'Eleştirmen', desc: '10 yapıma puan verildi' });
        if (this.state.streak >= 7) earnedBadges.push({ icon: '🔥', name: 'İstikrarlı', desc: '7 günlük giriş serisi' });

        const earnedNames = new Set(earnedBadges.map(b => b.name));

        const allPossibleBadges = [
            { icon: '👶', name: 'Yeni Kan', desc: 'İlk içerik eklendi' },
            { icon: '🎬', name: 'Sinema Sever', desc: '5 film izlendi' },
            { icon: '🍿', name: 'Sinema Kurdu', desc: '10 film izlendi' },
            { icon: '🎭', name: 'Film Gurmesi', desc: '25 film izlendi' },
            { icon: '👑', name: 'Sinema Kralı', desc: '50 film izlendi' },
            { icon: '📽️', name: 'Yönetmen', desc: '100 film izlendi' },
            { icon: '📺', name: 'Bölüm Avcısı', desc: '10 bölüm izlendi' },
            { icon: '🏃', name: 'Maratoncu', desc: '100 bölüm izlendi' },
            { icon: '📖', name: 'Kitap Dostu', desc: '3 kitap okundu' },
            { icon: '📚', name: 'Kütüphaneci', desc: '10 kitap okundu' },
            { icon: '📜', name: 'Bilge Okur', desc: '25 kitap okundu' },
            { icon: '🧙‍♂️', name: 'Kitap Büyücüsü', desc: '100 kitap okundu' },
            { icon: '⭐', name: 'Eleştirmen', desc: '10 yapıma puan verildi' },
            { icon: '🔥', name: 'İstikrarlı', desc: '7 günlük giriş serisi' }
        ];

        const grid = document.getElementById('allBadgesGrid');
        grid.innerHTML = allPossibleBadges.map(b => {
            const isEarned = earnedNames.has(b.name);
            const opacity = isEarned ? '1' : '0.4';
            const filter = isEarned ? 'none' : 'grayscale(100%)';
            return `
                <div style="background:var(--bg2); padding:16px 12px; border-radius:12px; border:1px solid var(--border); text-align:center; display:flex; flex-direction:column; align-items:center; gap:6px; opacity:${opacity}; filter:${filter}; transition: all 0.3s;">
                    <span style="font-size:32px;">${b.icon}</span>
                    <span style="font-size:14px; font-weight:700; color:var(--text);">${b.name}</span>
                    <span style="font-size:11px; color:var(--text3);">${b.desc}</span>
                </div>
            `;
        }).join('');
    },

    openFriendList() {
        document.getElementById('friendNameInput').value = '';
        document.getElementById('commonListResults').classList.add('hidden');
        document.getElementById('friendListModal').classList.add('open');
    },

    findCommonMovies() {
        const friendName = document.getElementById('friendNameInput').value.trim();
        if(!friendName) return this.showToast('Lütfen bir isim gir', true);
        
        const listContainer = document.getElementById('commonListResults');
        listContainer.classList.remove('hidden');
        listContainer.innerHTML = '<div class="tmdb-loading">Eşleşmeler aranıyor...</div>';
        
        // Mock matching by randomly picking 3 items from user's list
        setTimeout(() => {
            let allItems = [...this.state.movies, ...this.state.series];
            if(allItems.length === 0) {
                listContainer.innerHTML = '<div class="empty-widget">Senin listende henüz içerik yok.</div>';
                return;
            }
            allItems.sort(() => 0.5 - Math.random());
            let commonItems = allItems.slice(0, Math.min(3, allItems.length));
            
            listContainer.innerHTML = commonItems.map(item => `
                <div class="recent-item" onclick="document.getElementById('friendListModal').classList.remove('open'); App.${item.type === 'movie' ? 'openMovieDetail' : 'openSeriesDetail'}('${item.id}')">
                    <div class="recent-type">${item.type === 'movie' ? '🎬' : '📺'}</div>
                    <div class="recent-info">
                        <div class="recent-title">${item.title}</div>
                        <div class="recent-meta">${item.type === 'movie' ? 'Film' : 'Dizi'} • İkiniz de eklemişsiniz</div>
                    </div>
                </div>
            `).join('');
            
        }, 1000);
    },

    openShareCard(type) {
        document.getElementById('movieDetailModal').classList.remove('open');
        document.getElementById('seriesDetailModal').classList.remove('open');
        document.getElementById('bookDetailModal').classList.remove('open');
        
        let item = null;
        if (type === 'movie') {
            item = this.state.movies.find(m => m.id === this.editingId);
        } else if (type === 'series') {
            item = this.state.series.find(s => s.id === this.editingId);
        } else if (type === 'books') {
            item = this.state.books.find(b => b.id === this.editingId);
        }
            
        if (!item) return;

        document.getElementById('shareCardTitle').innerText = item.title;
        const posterEl = document.getElementById('shareCardPoster');
        if(item.poster) {
            posterEl.src = item.poster;
            posterEl.style.display = 'block';
            document.getElementById('shareCardBg').style.backgroundImage = `url('${item.poster}')`;
        } else {
            posterEl.style.display = 'none';
            document.getElementById('shareCardBg').style.backgroundImage = 'none';
        }
        
        const ratingStr = item.rating ? '⭐'.repeat(item.rating) : '👀 İzledim';
        document.getElementById('shareCardRating').innerText = ratingStr;

        // Render friends list for direct sharing
        const shareFriendsList = document.getElementById('shareFriendsList');
        if (shareFriendsList) {
            const contacts = this.state.following || [];
            if (contacts.length === 0) {
                shareFriendsList.innerHTML = '<div style="font-size:12px; color:var(--text3); padding:8px 0;">Henüz arkadaşınız yok.</div>';
            } else {
                shareFriendsList.innerHTML = contacts.map(handle => {
                    const u = this.state.globalUsers.find(x => x.handle === handle) || { handle, name: handle, avatar: '👤' };
                    return `
                        <div onclick="App.shareToChat('${type}', '${item.id}', '${handle}')" 
                             style="display:flex; flex-direction:column; align-items:center; gap:6px; cursor:pointer; flex-shrink:0; width:64px; text-align:center;">
                            <div style="font-size:24px; width:36px; height:36px; display:flex; align-items:center; justify-content:center; background:var(--bg3); border-radius:50%; border:1px solid var(--border); transition: transform 0.2s;" onmouseenter="this.style.transform='scale(1.1)'" onmouseleave="this.style.transform='scale(1)'">
                                ${u.avatar || '👤'}
                            </div>
                            <span style="font-size:10px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width:100%; color:var(--text2);">
                                ${u.name.split(' ')[0]}
                            </span>
                        </div>
                    `;
                }).join('');
            }
        }

        document.getElementById('shareModal').classList.add('open');
    },

    async shareToChat(type, itemId, targetHandle) {
        if (!db) return;
        const item = type === 'movie' 
            ? this.state.movies.find(m => m.id === itemId)
            : type === 'series'
                ? this.state.series.find(s => s.id === itemId)
                : this.state.books.find(b => b.id === itemId);
        if (!item) return;

        const chatId = [this.currentUser, targetHandle].sort().join('_');
        const payload = {
            type,
            id: itemId,
            title: item.title,
            poster: item.poster || item.cover || '',
            rating: item.rating || 0
        };
        const text = `[SHARE:${JSON.stringify(payload)}]`;
        try {
            await db.collection('messages').doc(chatId).collection('msgs').add({
                sender: this.currentUser,
                receiver: targetHandle,
                text: text,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                read: false
            });
            this.showToast('🚀 Kart sohbete gönderildi!');
            this.closeModals();
        } catch(e) {
            console.error('Share to chat error:', e);
            this.showToast('Gönderilemedi', true);
        }
    },

    openShareDetail(type, id, title = '', poster = '', rating = 0) {
        this.closeModals();
        this.editingId = id;
        
        let exists = false;
        if (type === 'movie') {
            exists = this.state.movies.some(x => x.id === id);
        } else if (type === 'series') {
            exists = this.state.series.some(x => x.id === id);
        } else if (type === 'books') {
            exists = this.state.books.some(x => x.id === id);
        }

        if (exists) {
            if (type === 'movie') this.openMovieDetail(id);
            else if (type === 'series') this.openSeriesDetail(id);
            else if (type === 'books') this.openBookDetail(id);
        } else {
            // Create a temporary shared item object
            const tempItem = {
                id: id,
                title: title,
                poster: poster,
                rating: rating,
                status: type === 'books' ? 'readlist' : 'watchlist',
                isSharedTemp: true
            };
            if (type === 'movie') this.openMovieDetail(tempItem);
            else if (type === 'series') this.openSeriesDetail(tempItem);
            else if (type === 'books') this.openBookDetail(tempItem);
        }
    },

    async addSharedItemToLibrary(type, item) {
        if (!this.currentUser) return;
        const newItem = {
            id: Date.now().toString(),
            title: item.title,
            poster: item.poster || '',
            rating: item.rating || 0,
            status: type === 'books' ? 'readlist' : 'watchlist',
            type: type,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        if (type === 'movie') {
            this.state.movies.push(newItem);
        } else if (type === 'series') {
            newItem.seasons = 1;
            newItem.episodes = 1;
            this.state.series.push(newItem);
        } else if (type === 'books') {
            newItem.author = '';
            newItem.pages = 100;
            newItem.currentPage = 0;
            this.state.books.push(newItem);
        }
        this.save();
        this.showToast('📥 Kütüphanenize eklendi!');
        this.closeModals();
        this.renderAll();
    },

    openShareDetailFromMessage(msgId, event) {
        if (event) event.stopPropagation();
        if (!this.currentChatMessages) return;
        const msg = this.currentChatMessages.find(m => m.id === msgId);
        if (!msg) return;

        if (msg.text.startsWith('[SHARE:') && msg.text.endsWith(']')) {
            const raw = msg.text.slice(7, -1);
            if (raw.startsWith('{')) {
                try {
                    const data = JSON.parse(raw);
                    this.openShareDetail(data.type, data.id, data.title, data.poster || '', data.rating || 0);
                } catch(e) {
                    console.error('Failed to parse share JSON:', e);
                }
            } else {
                const parts = raw.split(':');
                const shareType = parts[0];
                const shareId = parts[1];
                const shareTitle = parts[2];
                const sharePoster = parts[3] || '';
                const shareRating = parseInt(parts[4]) || 0;
                this.openShareDetail(shareType, shareId, shareTitle, sharePoster, shareRating);
            }
        }
    },

    getFavoriteGenreId() {
        let genreCounts = {};
        const allItems = [...this.state.movies, ...this.state.series];
        allItems.forEach(item => {
            if (item.genre) {
                item.genre.split(',').forEach(g => {
                    let tg = g.trim().toLowerCase();
                    if(tg) genreCounts[tg] = (genreCounts[tg] || 0) + 1;
                });
            }
        });
        
        let topGenre = null;
        let max = 0;
        for (let g in genreCounts) {
            if (genreCounts[g] > max) {
                max = genreCounts[g];
                topGenre = g;
            }
        }
        
        if (!topGenre) return null;

        const map = {
            'aksiyon': 28, 'action': 28,
            'macera': 12, 'adventure': 12,
            'animasyon': 16, 'animation': 16,
            'komedi': 35, 'comedy': 35,
            'suç': 80, 'crime': 80,
            'belgesel': 99, 'documentary': 99,
            'dram': 18, 'drama': 18,
            'aile': 10751, 'family': 10751,
            'fantastik': 14, 'fantasy': 14,
            'tarih': 36, 'history': 36,
            'korku': 27, 'horror': 27,
            'müzik': 10402, 'music': 10402,
            'gizem': 9648, 'mystery': 9648,
            'romantik': 10749, 'romance': 10749,
            'bilim kurgu': 878, 'sci-fi': 878, 'science fiction': 878,
            'gerilim': 53, 'thriller': 53,
            'savaş': 10752, 'war': 10752
        };
        
        return map[topGenre] || null;
    },

    async loadDiscoverCarousel() {
        const carousel = document.getElementById('discoverCarousel');
        carousel.innerHTML = '<div class="tmdb-loading">Yükleniyor...</div>';
        try {
            let url = '';
            const genreId = this.getFavoriteGenreId();
            const randomPage = Math.floor(Math.random() * 5) + 1; // Pick a random page from 1 to 5
            
            if (genreId) {
                const mediaType = Math.random() > 0.5 ? 'movie' : 'tv';
                url = `https://api.themoviedb.org/3/discover/${mediaType}?api_key=${TMDB_API_KEY}&language=tr-TR&with_genres=${genreId}&page=${randomPage}&sort_by=popularity.desc`;
                const widgetTitle = document.querySelector('#discoverWidget .widget-title');
                if (widgetTitle) widgetTitle.innerText = '🌟 Senin İçin Keşfet';
            } else {
                url = `https://api.themoviedb.org/3/trending/all/day?api_key=${TMDB_API_KEY}&language=tr-TR&page=${randomPage}`;
                const widgetTitle = document.querySelector('#discoverWidget .widget-title');
                if (widgetTitle) widgetTitle.innerText = '🌟 Keşfet (Popüler)';
            }

            const res = await fetch(url);
            const data = await res.json();
            
            if(data.results && data.results.length > 0) {
                // Shuffle the results array
                let items = data.results.sort(() => 0.5 - Math.random());
                
                carousel.innerHTML = items.slice(0, 10).map(item => {
                    const title = item.title || item.name;
                    let type = item.media_type;
                    if (!type) {
                        type = url.includes('/discover/movie') ? 'movie' : 'series';
                    } else {
                        type = type === 'tv' ? 'series' : 'movie';
                    }
                    const poster = item.poster_path ? `https://image.tmdb.org/t/p/w200${item.poster_path}` : '';
                    return `
                        <div class="discover-item" onclick="App.openAddModal('${type}'); document.getElementById('formTitle').value='${title.replace(/'/g, "\\'")}'; document.getElementById('formTitle').dispatchEvent(new Event('input'));">
                            <div class="discover-poster">${poster ? `<img src="${poster}" style="width:100%;height:100%;object-fit:cover;border-radius:12px;"/>` : '🎬'}</div>
                            <div class="discover-title">${title}</div>
                        </div>
                    `;
                }).join('');
            } else {
                carousel.innerHTML = '<div class="empty-widget">Öneri bulunamadı.</div>';
            }
        } catch(err) {
            carousel.innerHTML = '<div class="empty-widget">Yüklenemedi.</div>';
        }
    },

    // ==========================================
    // V1.5 BETA - SOCIAL & MESSAGING
    // ==========================================

    renderSocialTab(query = '') {
        this.renderAiSuggestion();
        this.renderConversationsList();
        this.renderFollowRequestsUI();
        this.renderActiveWatchParties();

        // Update Friend Code display
        const codeEl = document.getElementById('myFriendCodeDisplay');
        if (codeEl) {
            codeEl.innerText = this.state.friendCode || 'Yükleniyor...';
        }

        // Hide Watch Party widget for everyone except kermode and deniz
        const wpWidget = document.getElementById('watchPartyWidget');
        if (wpWidget) {
            const canSeeWp = this.currentUser === 'deniz' || this.hasAdminPrivileges();
            wpWidget.style.display = canSeeWp ? 'block' : 'none';
        }
    },

    renderFollowRequestsUI() {
        const section = document.getElementById('followRequestsSection');
        const countSpan = document.getElementById('followRequestsCount');
        const list = document.getElementById('followRequestsList');
        if (!section || !list) return;

        const requests = this.state.followRequests || [];
        if (requests.length === 0) {
            section.style.display = 'none';
            return;
        }

        section.style.display = 'block';
        if (countSpan) countSpan.innerText = requests.length;

        list.innerHTML = requests.map(handle => {
            const u = this.state.globalUsers.find(x => x.handle === handle) || { handle, name: handle, avatar: '👤' };
            return `
            <div style="display:flex; align-items:center; gap:12px; background:var(--bg); padding:10px 14px; border-radius:12px; border:1px solid var(--border);">
                <div style="font-size:24px;">${u.avatar || '👤'}</div>
                <div style="flex:1; min-width:0;">
                    <div style="font-size:13px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${u.name}</div>
                    <div style="font-size:11px; color:var(--text2);">@${u.handle}</div>
                </div>
                <div style="display:flex; gap:6px;">
                    <button onclick="App.acceptFollowRequest('${u.handle}')" style="padding:6px 12px; border-radius:8px; background:var(--primary); color:white; border:none; font-size:11px; font-weight:bold; cursor:pointer;">Onayla</button>
                    <button onclick="App.rejectFollowRequest('${u.handle}')" style="padding:6px 12px; border-radius:8px; background:var(--bg3); color:var(--text); border:1px solid var(--border); font-size:11px; font-weight:bold; cursor:pointer;">Reddet</button>
                </div>
            </div>`;
        }).join('');
    },

    async acceptFollowRequest(handle) {
        if (!db || !this.currentUser) return;
        try {
            // Remove from my requests, add to my followers
            this.state.followRequests = this.state.followRequests.filter(h => h !== handle);
            if (!this.state.followers.includes(handle)) this.state.followers.push(handle);
            
            await db.collection('userData').doc(this.currentUser).set({
                followRequests: firebase.firestore.FieldValue.arrayRemove(handle),
                followers: firebase.firestore.FieldValue.arrayUnion(handle)
            }, { merge: true });

            // Add me to their following, remove me from their sentRequests
            await db.collection('userData').doc(handle).set({
                following: firebase.firestore.FieldValue.arrayUnion(this.currentUser),
                sentRequests: firebase.firestore.FieldValue.arrayRemove(this.currentUser)
            }, { merge: true });

            this.showToast(`✅ @${handle} takip isteği onaylandı`);
            this.renderFollowRequestsUI();
            this.renderProfileStats();
        } catch (e) {
            this.showToast('❌ Onaylama hatası: ' + e.message);
        }
    },

    async rejectFollowRequest(handle) {
        if (!db || !this.currentUser) return;
        try {
            this.state.followRequests = this.state.followRequests.filter(h => h !== handle);
            await db.collection('userData').doc(this.currentUser).set({
                followRequests: firebase.firestore.FieldValue.arrayRemove(handle)
            }, { merge: true });

            await db.collection('userData').doc(handle).set({
                sentRequests: firebase.firestore.FieldValue.arrayRemove(this.currentUser)
            }, { merge: true });

            this.showToast(`❌ @${handle} takip isteği reddedildi`);
            this.renderFollowRequestsUI();
        } catch (e) {
            this.showToast('❌ Hata: ' + e.message);
        }
    },

    renderUserSearch(query) {
        const resultsBox = document.getElementById('userSearchResults');
        if (!resultsBox) return;

        const q = query.trim().toLowerCase();
        let users = this.state.globalUsers.filter(u => u.handle !== this.currentUser);
        if (q) {
            users = users.filter(u =>
                u.handle.toLowerCase().includes(q) ||
                (u.name || '').toLowerCase().includes(q)
            );
        }

        if (users.length === 0) {
            resultsBox.innerHTML = '<div style="padding:16px; text-align:center; color:var(--text3); font-size:13px;">Kullanıcı bulunamadı</div>';
            resultsBox.style.display = 'block';
            return;
        }

        resultsBox.style.display = 'block';
        resultsBox.innerHTML = users.slice(0, 8).map(u => {
            const isFollowing = this.state.following.includes(u.handle);
            const isRequested = (this.state.sentRequests || []).includes(u.handle);

            let btnText = 'Takip Et';
            let btnStyle = 'border:1px solid var(--primary); background:var(--primary); color:white;';
            if (isFollowing) {
                btnText = 'Takip Ediliyor';
                btnStyle = 'border:1px solid var(--border); background:transparent; color:var(--text2);';
            } else if (isRequested) {
                btnText = 'İstek Gönderildi';
                btnStyle = 'border:1px solid var(--border); background:var(--bg3); color:var(--text);';
            }

            const escapedAvatar = this._escapeHtml(u.avatar || '👤');
            const escapedName = this._escapeHtml(u.name || u.handle || '');
            const escapedHandle = this._escapeHtml(u.handle || '');
            
            return `
            <div style="display:flex; align-items:center; gap:12px; padding:12px 16px; border-bottom:1px solid var(--border); cursor:pointer;"
                 onmouseenter="this.style.background='var(--bg3)'" onmouseleave="this.style.background='transparent'">
                <div style="font-size:28px; flex-shrink:0;">${escapedAvatar}</div>
                <div style="flex:1; min-width:0;">
                    <div style="font-size:14px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapedName}</div>
                    <div style="font-size:12px; color:var(--text2);">@${escapedHandle}</div>
                </div>
                <div style="display:flex; gap:8px; flex-shrink:0;">
                    <button onclick="App.quickToggleFollow('${escapedHandle}'); event.stopPropagation();" 
                        style="padding:6px 12px; border-radius:20px; font-size:11px; font-weight:600; cursor:pointer; transition:all 0.2s; ${btnStyle}">
                        ${btnText}
                    </button>
                    <button onclick="App.safeOpenChat('${escapedHandle}'); document.getElementById('userSearchResults').style.display='none'; document.getElementById('socialSearchInput').value=''; event.stopPropagation();"
                        style="padding:6px 12px; border-radius:20px; border:1px solid var(--primary); background:transparent; color:var(--primary); font-size:11px; font-weight:600; cursor:pointer;">
                        Mesaj
                    </button>
                </div>
            </div>`;
        }).join('');
    },

    async quickToggleFollow(handle) {
        if (!db || !this.currentUser) return;
        const isFollowing = this.state.following.includes(handle);
        const isRequested = (this.state.sentRequests || []).includes(handle);

        try {
            // First guarantee target document exists by setting initialized flag safely
            await db.collection('userData').doc(handle).set({ initialized: true }, { merge: true });

            if (isFollowing) {
                // Unfollow directly
                this.state.following = this.state.following.filter(h => h !== handle);
                await db.collection('userData').doc(this.currentUser).set({ following: firebase.firestore.FieldValue.arrayRemove(handle) }, { merge: true });
                await db.collection('userData').doc(handle).set({ followers: firebase.firestore.FieldValue.arrayRemove(this.currentUser) }, { merge: true });
                this.showToast('Takipten çıkıldı');
            } else if (isRequested) {
                // Cancel follow request
                this.state.sentRequests = this.state.sentRequests.filter(h => h !== handle);
                await db.collection('userData').doc(this.currentUser).set({ sentRequests: firebase.firestore.FieldValue.arrayRemove(handle) }, { merge: true });
                await db.collection('userData').doc(handle).set({ followRequests: firebase.firestore.FieldValue.arrayRemove(this.currentUser) }, { merge: true });
                this.showToast('Takip isteği iptal edildi');
            } else {
                // Send follow request
                if (!this.state.sentRequests) this.state.sentRequests = [];
                this.state.sentRequests.push(handle);
                await db.collection('userData').doc(this.currentUser).set({ sentRequests: firebase.firestore.FieldValue.arrayUnion(handle) }, { merge: true });
                await db.collection('userData').doc(handle).set({ followRequests: firebase.firestore.FieldValue.arrayUnion(this.currentUser) }, { merge: true });
                this.showToast('📨 Takip isteği gönderildi');
            }
            this.renderProfileStats();
        } catch(e) {
            this.showToast('❌ Hata: ' + e.message);
        }
    },

    safeOpenChat(handle) {
        // Enforce: only message people you follow (who accepted your request) or admins
        if (!this.hasAdminPrivileges() && !this.state.following.includes(handle)) {
            this.showToast('💬 Sadece takip ettiğiniz (takip isteğinizi onaylayan) kişilere mesaj gönderebilirsiniz.');
            return;
        }
        this.openChat(handle);
    },

    copyFriendCode() {
        if (!this.state.friendCode) {
            this.showToast('Arkadaşlık kodu henüz yüklenmedi.');
            return;
        }
        navigator.clipboard.writeText(this.state.friendCode)
            .then(() => this.showToast('📋 Arkadaşlık kodu kopyalandı!'))
            .catch(() => this.showToast('Kopyalanamadı', true));
    },

    async addFriendByCode() {
        const input = document.getElementById('friendCodeInput');
        if (!input) return;
        const code = input.value.trim().toUpperCase();
        if (!code) {
            this.showToast('Lütfen bir arkadaşlık kodu girin.', true);
            return;
        }

        if (code === this.state.friendCode) {
            this.showToast('Kendi arkadaşlık kodunuzu ekleyemezsiniz.', true);
            return;
        }

        if (!db) {
            this.showToast('Bağlantı hatası: İnternet bağlantınızı kontrol edin.', true);
            return;
        }

        try {
            // Find target user by friendCode
            const snap = await db.collection('users').where('friendCode', '==', code).limit(1).get();
            if (snap.empty) {
                this.showToast('❌ Geçersiz arkadaşlık kodu.', true);
                return;
            }

            const targetUser = snap.docs[0].data();
            const targetHandle = targetUser.handle;

            if (targetHandle === this.currentUser) {
                this.showToast('Kendi kodunuzu ekleyemezsiniz.', true);
                return;
            }

            // Establish mutual follow
            // Current User follows Target User
            await db.collection('userData').doc(this.currentUser).set({
                following: firebase.firestore.FieldValue.arrayUnion(targetHandle),
                followers: firebase.firestore.FieldValue.arrayUnion(targetHandle),
                followRequests: firebase.firestore.FieldValue.arrayRemove(targetHandle),
                sentRequests: firebase.firestore.FieldValue.arrayRemove(targetHandle)
            }, { merge: true });

            // Target User follows Current User
            await db.collection('userData').doc(targetHandle).set({
                following: firebase.firestore.FieldValue.arrayUnion(this.currentUser),
                followers: firebase.firestore.FieldValue.arrayUnion(this.currentUser),
                followRequests: firebase.firestore.FieldValue.arrayRemove(this.currentUser),
                sentRequests: firebase.firestore.FieldValue.arrayRemove(this.currentUser)
            }, { merge: true });

            // Update local state
            if (!this.state.following) this.state.following = [];
            if (!this.state.following.includes(targetHandle)) this.state.following.push(targetHandle);
            if (!this.state.followers) this.state.followers = [];
            if (!this.state.followers.includes(targetHandle)) this.state.followers.push(targetHandle);

            // Re-fetch all users to make sure we have their profiles
            const allUsersSnap = await db.collection('users').get();
            this.state.globalUsers = allUsersSnap.docs.map(d => d.data());

            // Clear input and show success
            input.value = '';
            this.showToast(`🎉 @${targetHandle} ile başarıyla arkadaş olundu!`);

            // Re-render UI elements
            this.renderConversationsList();
            this.renderProfileStats();
        } catch (e) {
            console.error('Add friend error:', e);
            this.showToast('Bir hata oluştu: ' + e.message, true);
        }
    },

    getUserStatusHTML(user) {
        if (!user.lastSeen) return '<span style="color:var(--text3); font-size:11px;">Çevrimdışı</span>';
        const diff = Date.now() - user.lastSeen;
        if (diff < 5 * 60 * 1000) {
            return '<span style="color:var(--green); font-size:11px; display:inline-flex; align-items:center; gap:4px;"><span style="width:6px; height:6px; border-radius:50%; background:var(--green); display:inline-block;"></span>Çevrimiçi</span>';
        } else {
            const date = new Date(user.lastSeen);
            const timeStr = date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            const dateStr = date.toLocaleDateString([], {day: 'numeric', month: 'short'});
            return `<span style="color:var(--text3); font-size:11px;">Son görülme: ${dateStr} ${timeStr}</span>`;
        }
    },

    async onMessageClick(msgId, isMe) {
        if (!isMe) return;
        if (await this.showConfirm('Mesajı Sil', 'Bu mesajı silmek istediğinize emin misiniz?', '🗑️')) {
            const chatId = [this.currentUser, this.currentChatHandle].sort().join('_');
            try {
                await db.collection('messages').doc(chatId).collection('msgs').doc(msgId).delete();
                this.showToast('Mesaj silindi');
            } catch (e) {
                this.showToast('Hata: ' + e.message, true);
            }
        }
    },

    insertChatEmoji(emoji) {
        const input = document.getElementById('chatInput');
        if (input) {
            input.value += emoji;
            input.focus();
        }
    },

    async renderConversationsList() {
        const list = document.getElementById('conversationsList');
        if (!list || !db || !this.currentUser) return;

        const contacts = this.state.following || [];
        const visibleContacts = contacts.filter(h => !(this.state.hiddenChats || []).includes(h));

        if (visibleContacts.length === 0) {
            list.innerHTML = `
                <div class="empty-widget" style="text-align:center; color:var(--text3); padding:32px 16px;">
                    <div style="font-size:36px; margin-bottom:8px;">💬</div>
                    <div>Sohbet listesi boş. Yukarıdan arkadaşlık kodu ile birini ekleyerek sohbete başlayabilirsin!</div>
                </div>`;
            return;
        }

        // Fetch unread message counts per sender
        const unreadSnap = await db.collectionGroup('msgs')
            .where('receiver', '==', this.currentUser)
            .where('read', '==', false)
            .get().catch(() => null);
        const unreadSenders = {};
        if (unreadSnap) {
            unreadSnap.docs.forEach(doc => {
                const d = doc.data();
                if (d.sender) {
                    unreadSenders[d.sender] = (unreadSenders[d.sender] || 0) + 1;
                }
            });
        }

        // Fetch last message previews in parallel
        const lastMsgs = {};
        await Promise.all(visibleContacts.map(async (handle) => {
            const chatId = [this.currentUser, handle].sort().join('_');
            const msgSnap = await db.collection('messages').doc(chatId).collection('msgs')
                .orderBy('timestamp', 'desc')
                .limit(1)
                .get().catch(() => null);
            if (msgSnap && !msgSnap.empty) {
                lastMsgs[handle] = msgSnap.docs[0].data();
            }
        }));

        list.innerHTML = visibleContacts.map(handle => {
            const u = this.state.globalUsers.find(x => x.handle === handle) || { handle, name: handle, avatar: '👤' };
            const unreadCount = unreadSenders[u.handle] || 0;
            const badgeHTML = unreadCount > 0 
                ? `<span style="background:var(--red); color:white; font-size:10px; font-weight:bold; border-radius:50%; width:16px; height:16px; display:inline-flex; align-items:center; justify-content:center; margin-left:8px;">${unreadCount}</span>` 
                : '';

            // Check if online
            const isOnline = u.lastSeen && (Date.now() - u.lastSeen < 5 * 60 * 1000);
            const onlineDot = isOnline 
                ? `<span style="position:absolute; bottom:0; right:0; width:10px; height:10px; border-radius:50%; background:var(--green); border:2px solid var(--bg2); box-shadow:0 0 6px var(--green);"></span>` 
                : '';

            // Prepare preview
            let previewText = `@${u.handle}`;
            const lastMsg = lastMsgs[u.handle];
            if (lastMsg) {
                const prefix = lastMsg.sender === this.currentUser ? 'Sen: ' : '';
                let rawText = lastMsg.text;
                if (rawText.startsWith('[SHARE:') && rawText.endsWith(']')) {
                    const raw = rawText.slice(7, -1);
                    if (raw.startsWith('{')) {
                        try {
                            const data = JSON.parse(raw);
                            rawText = `🎬 [Paylaşım] ${data.title}`;
                        } catch(e) {
                            rawText = `🎬 [Paylaşım]`;
                        }
                    } else {
                        const parts = raw.split(':');
                        rawText = `🎬 [Paylaşım] ${parts[2]}`;
                    }
                }
                previewText = `${prefix}${rawText}`;
                if (previewText.length > 28) {
                    previewText = previewText.substring(0, 25) + '...';
                }
            }

            return `
            <div onclick="App.openChat('${u.handle}')" 
                 onmousedown="App.onConversationPressStart('${u.handle}')"
                 onmouseup="App.onConversationPressEnd()"
                 onmouseleave="App.onConversationPressEnd(); this.style.background='var(--bg2)'"
                 ontouchstart="App.onConversationPressStart('${u.handle}')"
                 ontouchend="App.onConversationPressEnd()"
                 oncontextmenu="event.preventDefault(); App.deleteConversation('${u.handle}'); return false;"
                 style="display:flex; align-items:center; gap:12px; padding:14px 16px; border-radius:12px;
                        background:var(--bg2); border:1px solid var(--border); margin-bottom:10px;
                        cursor:pointer; transition:all 0.2s; user-select:none; -webkit-user-select:none;"
                 onmouseenter="this.style.background='var(--bg3)'"
                 title="Silmek için basılı tut veya sağ tıkla">
                <div style="font-size:32px; flex-shrink:0; position:relative; width:40px; height:40px; display:flex; align-items:center; justify-content:center; background:var(--bg3); border-radius:50%;">
                    ${u.avatar || '👤'}
                    ${onlineDot}
                </div>
                <div style="flex:1; min-width:0;">
                    <div style="font-size:14px; font-weight:700; display:flex; align-items:center; justify-content:between;">
                        <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1;">${u.name}</span>
                        ${badgeHTML}
                    </div>
                    <div style="font-size:12px; color:var(--text2); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-top:2px;">${previewText}</div>
                </div>
                <div style="color:var(--primary); font-size:20px;">›</div>
            </div>`;
        }).join('');
    },

    onConversationPressStart(handle) {
        if (this._pressTimer) clearTimeout(this._pressTimer);
        this._pressTimer = setTimeout(() => {
            this._pressTimer = null;
            this.isLongPressing = true;
            this.deleteConversation(handle);
        }, 600);
    },

    onConversationPressEnd() {
        if (this._pressTimer) {
            clearTimeout(this._pressTimer);
            this._pressTimer = null;
        }
        setTimeout(() => {
            this.isLongPressing = false;
        }, 200);
    },

    async deleteConversation(handle) {
        this.isLongPressing = true;
        setTimeout(() => this.isLongPressing = false, 500);

        const u = this.state.globalUsers.find(x => x.handle === handle) || { name: handle };
        if (!await this.showConfirm('Sohbeti Sil', `${u.name} ile olan sohbeti silmek istediğinize emin misiniz?`, '💬')) {
            return;
        }

        if (!this.state.hiddenChats) this.state.hiddenChats = [];
        if (!this.state.hiddenChats.includes(handle)) {
            this.state.hiddenChats.push(handle);
        }
        this.save();

        this.renderConversationsList();
        this.showToast('🗑️ Sohbet silindi');

        // Optionally delete messages from Firestore collection
        if (db) {
            const chatId = [this.currentUser, handle].sort().join('_');
            try {
                const snap = await db.collection('messages').doc(chatId).collection('msgs').get();
                if (!snap.empty) {
                    const batch = db.batch();
                    snap.docs.forEach(doc => batch.delete(doc.ref));
                    await batch.commit();
                }
            } catch (e) {
                console.warn('Mesaj silme hatası:', e);
            }
        }
    },

    // ==========================================
    // WATCH PARTY — YENİDEN YAZILDI v2.0
    // ==========================================

    // Sadece takipçilere görünen odaları listele
    renderActiveWatchParties() {
        const list = document.getElementById('activeWatchPartiesList');
        if (!list || !db) return;

        if (this.watchPartiesListUnsubscribe) {
            this.watchPartiesListUnsubscribe();
            this.watchPartiesListUnsubscribe = null;
        }

        const myFollowers = this.state.followers || [];
        const myFollowing = this.state.following || [];
        // Benim görebileceğim odalar: host'un benim takipçim veya takip ettiğim biri olması
        const visibleHosts = [...new Set([...myFollowers, ...myFollowing, this.currentUser])];

        this.watchPartiesListUnsubscribe = db.collection('watchparties')
            .where('status', '==', 'open')
            .orderBy('createdAt', 'desc').limit(20)
            .onSnapshot(snap => {
                const myPendingReqs = [];
                let html = '';
                let count = 0;

                snap.forEach(doc => {
                    const p = doc.data();
                    const members = p.members || [];

                    // Otomatik temizlik: odada kimse kalmadıysa veya oda 4 saatten eskiyse listede gösterme (silmeye çalışmak yetkisiz kullanıcılarda sonsuz döngü yaratır)
                    const isStale = p.lastUpdated && (Date.now() - p.lastUpdated > 4 * 60 * 60 * 1000);
                    if (members.length === 0 || isStale) {
                        return;
                    }

                    // Sadece takipçi/takip ağındaki host'ların odaları
                    if (!visibleHosts.includes(p.host)) return;
                    count++;

                    const isHost = p.host === this.currentUser;
                    const pendingJoins = p.pendingJoins || [];
                    const isMember = members.includes(this.currentUser);
                    const isPending = pendingJoins.includes(this.currentUser);

                    let actionBtn = '';
                    if (isHost) {
                        actionBtn = `<button onclick="App.openWatchPartyRoom('${doc.id}')" 
                            style="padding:5px 12px; font-size:11px; border-radius:8px; background:var(--primary); color:white; border:none; cursor:pointer; font-weight:bold; white-space:nowrap;">
                            Odayı Aç
                        </button>`;
                    } else if (isMember) {
                        actionBtn = `<button onclick="App.openWatchPartyRoom('${doc.id}')" 
                            style="padding:5px 12px; font-size:11px; border-radius:8px; background:var(--green); color:white; border:none; cursor:pointer; font-weight:bold; white-space:nowrap;">
                            Geri Dön
                        </button>`;
                    } else if (isPending) {
                        actionBtn = `<button disabled 
                            style="padding:5px 12px; font-size:11px; border-radius:8px; background:var(--bg3); color:var(--text2); border:1px solid var(--border); cursor:default; font-weight:bold; white-space:nowrap;">
                            Onay Bekleniyor...
                        </button>`;
                    } else {
                        actionBtn = `<button onclick="App.requestJoinWatchParty('${doc.id}', '${p.host}')" 
                            style="padding:5px 12px; font-size:11px; border-radius:8px; background:var(--primary); color:white; border:none; cursor:pointer; font-weight:bold; white-space:nowrap;">
                            Katılmak İste
                        </button>`;
                    }

                    // Pending join istekleri — sadece host'a göster
                    let pendingSection = '';
                    if (isHost && pendingJoins.length > 0) {
                        const pendingBtns = pendingJoins.map(handle => {
                            const u = this.state.globalUsers.find(x => x.handle === handle) || { handle, avatar: '👤' };
                            return `<span style="display:inline-flex; align-items:center; gap:4px; background:var(--bg); border:1px solid var(--border); border-radius:8px; padding:3px 8px; font-size:11px; margin:2px;">
                                ${u.avatar} @${handle}
                                <button onclick="App.approveJoinRequest('${doc.id}','${handle}')" style="background:var(--green); color:white; border:none; border-radius:4px; padding:1px 5px; cursor:pointer; font-size:10px;">✓</button>
                                <button onclick="App.denyJoinRequest('${doc.id}','${handle}')" style="background:var(--red); color:white; border:none; border-radius:4px; padding:1px 5px; cursor:pointer; font-size:10px;">✗</button>
                            </span>`;
                        }).join('');
                        pendingSection = `<div style="margin-top:6px; font-size:10px; color:var(--amber); font-weight:bold;">⏳ Katılmak İsteyenler:</div><div style="margin-top:4px;">${pendingBtns}</div>`;
                    }

                    const contentLabel = p.selectedContent 
                        ? `🎬 ${p.selectedContent.title}` 
                        : '🎬 İçerik seçilmedi';

                    html += `
                    <div style="background:var(--bg); padding:10px 12px; border-radius:12px; border:1px solid var(--border); margin-bottom:8px;">
                        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                            <div style="min-width:0; flex:1;">
                                <div style="font-size:12px; font-weight:bold; color:var(--primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">🍿 ${p.roomName}</div>
                                <div style="font-size:10px; color:var(--text2);">Kurucu: @${p.host} · ${members.length} üye</div>
                                <div style="font-size:10px; color:var(--text3); margin-top:2px;">${contentLabel}</div>
                            </div>
                            ${actionBtn}
                        </div>
                        ${pendingSection}
                    </div>`;
                });

                if (count === 0) {
                    list.innerHTML = '<div style="font-size:11px; color:var(--text3); text-align:center; padding:8px;">Takipçi ağında aktif oda yok. İlk sen başlat!</div>';
                } else {
                    list.innerHTML = html;
                }
            }, err => {
                // Firestore index eksikse daha basit sorgu dene
                list.innerHTML = '<div style="font-size:11px; color:var(--amber); text-align:center; padding:8px;">⚠️ Odalar yüklenemedi. Firestore index gerekebilir.</div>';
            });
    },

    async createWatchParty() {
        if (!db || !this.currentUser) return;

        // Her kullanıcı en fazla 1 aktif oda açabilir
        try {
            const querySnapshot = await db.collection('watchparties')
                .where('host', '==', this.currentUser)
                .where('status', '==', 'open')
                .get();
            if (!querySnapshot.empty) {
                this.showToast('⚠️ Zaten aktif bir odanız bulunuyor! Her kullanıcı en fazla 1 oda açabilir.');
                return;
            }
        } catch (e) {
            console.error('Room check failed:', e);
        }

        // Önce oda ismi sor
        const roomName = prompt('Ortak İzleme Odası için bir isim girin:', `${this.currentUser}'ın Odası`);
        if (!roomName) return;

        const partyId = 'wp_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
        try {
            await db.collection('watchparties').doc(partyId).set({
                roomName,
                host: this.currentUser,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                status: 'open',
                state: 'paused',
                videoTime: 0,
                videoStartedAt: null,
                lastUpdated: Date.now(),
                members: [this.currentUser],
                pendingJoins: [],
                selectedContent: null
            });
            this.showToast('✅ Oda oluşturuldu!');
            this.openWatchPartyRoom(partyId);
        } catch (e) {
            this.showToast('❌ Oda oluşturulamadı: ' + e.message);
        }
    },

    async requestJoinWatchParty(partyId, hostHandle) {
        if (!db || !this.currentUser) return;
        try {
            await db.collection('watchparties').doc(partyId).update({
                pendingJoins: firebase.firestore.FieldValue.arrayUnion(this.currentUser)
            });
            this.showToast(`📨 @${hostHandle} onayı bekleniyor...`);
            // Render'ı güncelle
            this.renderActiveWatchParties();
        } catch (e) {
            this.showToast('❌ İstek gönderilemedi');
        }
    },

    async approveJoinRequest(partyId, handle) {
        if (!db || !this.currentUser) return;
        try {
            await db.collection('watchparties').doc(partyId).update({
                pendingJoins: firebase.firestore.FieldValue.arrayRemove(handle),
                members: firebase.firestore.FieldValue.arrayUnion(handle)
            });
            // Onay bildirimi mesajı gönder
            await db.collection('watchparties').doc(partyId).collection('wpmsgs').add({
                sender: 'sistem',
                text: `@${handle} odaya katıldı! 🎉`,
                type: 'system',
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
            this.showToast(`✅ @${handle} odaya kabul edildi`);
        } catch (e) {
            this.showToast('❌ Hata: ' + e.message);
        }
    },

    async denyJoinRequest(partyId, handle) {
        if (!db || !this.currentUser) return;
        try {
            await db.collection('watchparties').doc(partyId).update({
                pendingJoins: firebase.firestore.FieldValue.arrayRemove(handle)
            });
            this.showToast(`❌ @${handle} reddedildi`);
        } catch (e) {
            this.showToast('❌ Hata: ' + e.message);
        }
    },

    openWatchPartyRoom(partyId) {
        this.currentWatchPartyId = partyId;
        const modal = document.getElementById('watchPartyModal');
        modal.style.display = 'flex';
        modal.classList.add('open');

        // Listeners temizle
        if (this.watchPartyUnsubscribe) this.watchPartyUnsubscribe();
        if (this.watchPartyChatUnsubscribe) this.watchPartyChatUnsubscribe();
        if (this.wpTimerInterval) clearInterval(this.wpTimerInterval);

        this._wpLocalTime = 0;
        this._wpPlaying = false;
        this._wpCurrentPartyData = null;

        // Oda verisini dinle
        this._wpPrevMembers = null;
        this.watchPartyUnsubscribe = db.collection('watchparties').doc(partyId)
            .onSnapshot(doc => {
                if (!doc.exists || (doc.data() && doc.data().status === 'closed')) {
                    this.showToast('ℹ️ Oda kapatıldı veya silindi.');
                    this._closeWpModal();
                    return;
                }
                const data = doc.data();
                const prevData = this._wpCurrentPartyData;
                this._wpCurrentPartyData = data;
                const isHost = data.host === this.currentUser;

                // Header güncelle
                const header = document.getElementById('wpRoomHeader');
                if (header) {
                    const members = data.members || [];
                    header.innerHTML = `
                        <div style="font-weight:700; font-size:15px; color:var(--text);">🍿 ${data.roomName}</div>
                        <div style="font-size:11px; color:var(--text2);">@${data.host} · ${members.length} üye</div>
                    `;
                }

                // İçerik bilgisi (sadece değiştiğinde veya iframe yoksa yükle)
                const prevContentId = prevData?.selectedContent?.id;
                const newContentId = data.selectedContent?.id;
                if (prevContentId !== newContentId || !document.getElementById('wpPlayerIframe')) {
                    this._wpUpdateContentDisplay(data, isHost);
                }

                // Oynatıcı senkronu — tüm kullanıcılar için (host dahil)
                // Yeni üye katıldığında: host güncel zamanı Firestore'a yazar
                const currentMembers = data.members || [];
                const prevMembers = this._wpPrevMembers || [];
                if (isHost && prevMembers.length > 0 && currentMembers.length > prevMembers.length) {
                    // Yeni üye geldi — host güncel pozisyonu Firestore'a yaz
                    const currentTime = this._wpLocalTime || 0;
                    const updatePayload = { videoTime: currentTime, lastUpdated: Date.now() };
                    if (data.state === 'playing') updatePayload.videoStartedAt = Date.now();
                    db.collection('watchparties').doc(partyId).update(updatePayload).catch(() => {});
                }
                this._wpPrevMembers = [...currentMembers];

                if (data.state === 'playing' && data.videoStartedAt) {
                    const speed = data.playbackSpeed || 1;
                    const elapsed = (Date.now() - data.videoStartedAt) / 1000;
                    const newTime = (data.videoTime || 0) + (elapsed * speed);
                    // Eğer zaman farkı 3sn'den fazlaysa re-sync yap
                    if (Math.abs(newTime - this._wpLocalTime) > 3 || !this._wpPlaying) {
                        this._wpLocalTime = newTime;
                    }
                    if (!this._wpPlaying) {
                        this._wpPlaying = true;
                        this._wpStartLocalTimer();
                    }
                } else {
                    this._wpPlaying = false;
                    // Eğer seek olduysa zamanı güncelle
                    const remoteTime = data.videoTime || 0;
                    if (Math.abs(remoteTime - this._wpLocalTime) > 1) {
                        this._wpLocalTime = remoteTime;
                    }
                    if (this.wpTimerInterval) { clearInterval(this.wpTimerInterval); this.wpTimerInterval = null; }
                    this._wpRenderTimer(this._wpLocalTime);
                    // Seek slider güncelle
                    const slider = document.getElementById('wpSeekSlider');
                    if (slider && !this._wpSliderDragging) slider.value = Math.floor(this._wpLocalTime);
                }

                // Host kontrolleri
                const controls = document.getElementById('wpHostControls');
                if (controls) controls.style.display = isHost ? 'flex' : 'none';

                const guestNotice = document.getElementById('wpGuestNotice');
                if (guestNotice) guestNotice.style.display = isHost ? 'none' : 'flex';

                // Play/pause butonu güncelle
                const playBtn = document.getElementById('wpPlayBtn');
                if (playBtn) {
                    playBtn.innerHTML = data.state === 'playing'
                        ? '<svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>'
                        : '<svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21"/></svg>';
                }

                // Hız UI
                const speed = data.playbackSpeed || 1;
                this._wpApplySpeedUI(speed);

                // Altyazı UI
                this._wpApplySubtitleUI(!!data.subtitlesOn);

                // Seek slider max güncelle (içerik süresi varsa)
                const content = data.selectedContent;
                if (content) {
                    let durationSec = 7200; // default 2 saat
                    if (content.type === 'movie' && content.duration) durationSec = content.duration * 60;
                    else if (content.type === 'series' && content.episode?.duration) durationSec = content.episode.duration * 60;
                    const slider = document.getElementById('wpSeekSlider');
                    if (slider) slider.max = durationSec;
                }

                // Oda kapatıldıysa modal'ı kapat
                if (data.status === 'closed' && !isHost) {
                    this.showToast('🚪 Oda host tarafından kapatıldı.');
                    this._closeWpModal();
                }
            });

        // Chat dinle
        const chatBox = document.getElementById('watchPartyChat');
        if (chatBox) chatBox.innerHTML = '';

        this.watchPartyChatUnsubscribe = db.collection('watchparties').doc(partyId)
            .collection('wpmsgs')
            .orderBy('timestamp', 'asc').limit(80)
            .onSnapshot(snap => {
                if (!chatBox) return;
                let html = '';
                snap.forEach(mDoc => {
                    const m = mDoc.data();
                    if (m.type === 'system') {
                        html += `<div class="wp-msg-system">— ${m.text} —</div>`;
                    } else {
                        const isMe = m.sender === this.currentUser;
                        const u = this.state.globalUsers.find(x => x.handle === m.sender);
                        const avatar = u ? u.avatar : '👤';
                        const displayName = u ? u.name : m.sender;
                        const ts = m.timestamp ? new Date(m.timestamp.toMillis()).toLocaleTimeString('tr-TR', {hour:'2-digit',minute:'2-digit'}) : '';
                        html += `
                        <div class="wp-msg ${isMe ? 'wp-msg-me' : 'wp-msg-other'}">
                            <div class="wp-msg-avatar">${avatar}</div>
                            <div class="wp-msg-bubble">
                                <div class="wp-msg-sender">${displayName} (@${m.sender})</div>
                                <div class="wp-msg-text">${this._escapeHtml(m.text)}</div>
                                <div class="wp-msg-time">${ts}</div>
                            </div>
                        </div>`;
                    }
                });
                chatBox.innerHTML = html;
                chatBox.scrollTop = chatBox.scrollHeight;
            });
    },

    _escapeHtml(str) {
        return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    },

    _wpUpdateContentDisplay(data, isHost) {
        const contentArea = document.getElementById('wpContentArea');
        if (!contentArea) return;

        const content = data.selectedContent;
        if (!content) {
            contentArea.innerHTML = isHost
                ? `<div style="text-align:center; color:var(--text3); padding:16px 0;">
                    <div style="font-size:28px; margin-bottom:8px;">🎬</div>
                    <div style="font-size:13px; margin-bottom:12px;">Bir film veya dizi seç</div>
                    <button onclick="App.openWpContentPicker()" class="btn-primary" style="padding:8px 20px; font-size:13px;">İçerik Seç</button>
                   </div>`
                : `<div style="text-align:center; color:var(--text3); padding:16px 0; font-size:13px;">⏳ Host içerik seçiyor...</div>`;
            return;
        }

        // playimdb URL
        const playUrl = content.imdbId
            ? `https://www.playimdb.com/title/${content.imdbId}/`
            : null;

        const poster = content.poster
            ? `<img src="${content.poster}" style="width:52px; height:78px; object-fit:cover; border-radius:8px; flex-shrink:0;" onerror="this.style.display='none'"/>`
            : '<div style="width:52px;height:78px;background:var(--bg3);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">🎬</div>';

        let durationInfo = '';
        if (content.type === 'movie' && content.duration) {
            const h = Math.floor(content.duration / 60);
            const m = content.duration % 60;
            durationInfo = `<span style="font-size:11px; color:var(--text3);">⏱️ ${h > 0 ? h + 's ' : ''}${m}dk</span>`;
        } else if (content.type === 'series' && content.episode) {
            durationInfo = `<span style="font-size:11px; color:var(--text3);">📺 S${content.episode.season}E${content.episode.ep}${content.episode.duration ? ' · ' + content.episode.duration + 'dk' : ''}</span>`;
        }

        const changeBtn = isHost
            ? `<button onclick="App.openWpContentPicker()" style="background:none; border:1px solid var(--border); border-radius:8px; color:var(--text2); padding:3px 8px; font-size:11px; cursor:pointer;">↺ Değiştir</button>`
            : '';

        // Oynatıcı bölümü
        let playerHtml = '';
        if (playUrl) {
            const iframeId = 'wpPlayerIframe';
            playerHtml = `
            <div class="wp-player-container" style="margin-top:10px; border-radius:12px; overflow:hidden; position:relative; background:#000; width:100%; aspect-ratio:16/9; box-shadow:0 4px 20px rgba(0,0,0,0.5);">
                <iframe id="${iframeId}"
                    src="${playUrl}"
                    style="width:100%; height:100%; border:none; display:block;"
                    allowfullscreen
                    allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                    sandbox="allow-forms allow-pointer-lock allow-same-origin allow-scripts allow-downloads"
                    onerror="App._wpIframeError()"
                    onload="App._wpIframeLoaded('${iframeId}')">
                </iframe>
                <div id="wpIframeFallback" style="display:none; position:absolute; inset:0; flex-direction:column; align-items:center; justify-content:center; padding:20px; text-align:center; background:rgba(20,20,25,0.95); z-index:5;">
                    <div style="font-size:13px; color:var(--text2); margin-bottom:12px; font-weight:500;">Tarayıcı güvenliği nedeniyle bu oynatıcı pencere içinde açılamadı.</div>
                    <a href="${playUrl}" target="_blank" 
                       style="display:inline-flex; align-items:center; gap:8px; padding:10px 22px; background:var(--primary); color:white; border-radius:12px; text-decoration:none; font-size:13px; font-weight:700; transition:0.2s; box-shadow:0 4px 12px rgba(168,85,247,0.3);"
                       onmouseenter="this.style.transform='scale(1.05)'" onmouseleave="this.style.transform='scale(1)'">
                        🍿 Oynatıcıyı Yeni Sekmede Aç
                    </a>
                </div>
            </div>`;
        } else {
            playerHtml = `
            <div style="margin-top:10px; padding:12px; background:var(--bg3); border-radius:10px; border:1px dashed var(--border); text-align:center;">
                <div style="font-size:12px; color:var(--text3); margin-bottom:6px;">Bu içerik için IMDb ID bulunamadı.</div>
                <div style="font-size:11px; color:var(--text3);">Filmi tekrar silerek TMDB'den ekleyince otomatik alınır.</div>
            </div>`;
        }

        contentArea.innerHTML = `
        <div>
            <div style="display:flex; gap:10px; align-items:flex-start;">
                ${poster}
                <div style="flex:1; min-width:0;">
                    <div style="font-size:13px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${content.title}</div>
                    <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin-top:3px;">
                        <span style="font-size:11px; color:var(--text2);">${content.type === 'movie' ? '🎬 Film' : '📺 Dizi'}${content.year ? ' · ' + content.year : ''}</span>
                        ${durationInfo}
                    </div>
                    <div style="margin-top:6px; display:flex; gap:6px; align-items:center;">
                        ${changeBtn}
                    </div>
                </div>
            </div>
            ${playerHtml}
        </div>`;
    },

    _wpIframeLoaded(iframeId) {
        // iframe yüklenince kontrol et — cross-origin nedeniyle çalışmıyorsa fallback göster
        try {
            const iframe = document.getElementById(iframeId);
            if (!iframe) return;
            // Eğer boş sayfa geldiyse fallback
            setTimeout(() => {
                try {
                    const doc = iframe.contentDocument || iframe.contentWindow.document;
                    if (!doc || doc.body.innerHTML === '') {
                        document.getElementById('wpIframeFallback').style.display = 'flex';
                    }
                } catch(e) {
                    // cross-origin — site yüklendi, sorun yok
                }
            }, 3000);
        } catch(e) {}
    },

    _wpIframeError() {
        const fb = document.getElementById('wpIframeFallback');
        if (fb) fb.style.display = 'flex';
    },

    openWpContentPicker() {
        const modal = document.getElementById('wpContentPickerModal');
        if (!modal) return;

        const allItems = [
            ...this.state.movies.map(m => ({...m, _type: 'movie'})),
            ...this.state.series.map(s => ({...s, _type: 'series'}))
        ];

        const list = document.getElementById('wpContentPickerList');
        if (!list) return;

        if (allItems.length === 0) {
            list.innerHTML = '<div style="text-align:center; color:var(--text3); padding:20px;">Kütüphanende içerik yok. Önce film/dizi ekle!</div>';
        } else {
            list.innerHTML = allItems.map((item, i) => {
                const poster = item.poster ? `<img src="${item.poster}" style="width:44px;height:66px;object-fit:cover;border-radius:6px;" onerror="this.style.display='none'"/>` : '<div style="width:44px;height:66px;background:var(--bg3);border-radius:6px;display:flex;align-items:center;justify-content:center;">🎬</div>';
                const typeLabel = item._type === 'movie' ? '🎬' : '📺';
                return `
                <div onclick="App.selectWpContent('${item.id}', '${item._type}')"
                     style="display:flex; align-items:center; gap:12px; padding:10px; border-radius:10px; cursor:pointer; border:1px solid var(--border); margin-bottom:6px; transition:background 0.2s;"
                     onmouseenter="this.style.background='var(--bg3)'" onmouseleave="this.style.background='transparent'">
                    ${poster}
                    <div style="flex:1; min-width:0;">
                        <div style="font-size:13px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${typeLabel} ${item.title}</div>
                        <div style="font-size:11px; color:var(--text2);">${item.year || ''} ${item.genre ? '· ' + item.genre : ''}</div>
                        ${item._type === 'series' && item.seasons ? `<div style="font-size:10px; color:var(--text3);">${item.seasons} sezon</div>` : ''}
                    </div>
                </div>`;
            }).join('');
        }

        modal.style.display = 'flex';
        modal.classList.add('open');
    },

    async selectWpContent(itemId, type) {
        const arr = type === 'movie' ? this.state.movies : this.state.series;
        const item = arr.find(x => x.id === itemId);
        if (!item || !this.currentWatchPartyId) return;

        if (type === 'series' && item.seasons > 0) {
            // Bölüm seçim ekranı göster
            this._wpShowEpisodePicker(item);
            return;
        }

        // Film — direkt seç
        const contentData = {
            type: 'movie',
            title: item.title,
            poster: item.poster || '',
            year: item.year || '',
            duration: item.duration || null,
            imdbId: item.imdbId || null
        };

        await this._saveWpContent(contentData);
        document.getElementById('wpContentPickerModal').classList.remove('open');
        document.getElementById('wpContentPickerModal').style.display = 'none';
    },

    _wpShowEpisodePicker(seriesItem) {
        const list = document.getElementById('wpContentPickerList');
        const seasons = seriesItem.seasons || 1;

        // Sezon/bölüm yapısını al
        const seasonEps = seriesItem.seasonEps || {};

        let html = `<div style="display:flex; align-items:center; gap:8px; margin-bottom:16px;">
            <button onclick="App.openWpContentPicker()" style="background:none; border:none; color:var(--primary); cursor:pointer; font-size:22px;">←</button>
            <div>
                <div style="font-size:14px; font-weight:700;">${seriesItem.title}</div>
                <div style="font-size:12px; color:var(--text2);">Bir bölüm seç</div>
            </div>
        </div>`;

        for (let s = 1; s <= seasons; s++) {
            const epCount = (seasonEps[s] && seasonEps[s].count) || seriesItem.episodes || 10;
            html += `<div style="margin-bottom:12px;">
                <div style="font-size:12px; font-weight:700; color:var(--primary); margin-bottom:6px; padding:4px 8px; background:var(--bg3); border-radius:6px;">Sezon ${s}</div>
                <div style="display:flex; flex-wrap:wrap; gap:6px;">`;

            for (let e = 1; e <= epCount; e++) {
                const epData = seasonEps[s] && seasonEps[s]['ep_' + e];
                const epName = epData ? epData.name : null;
                const epDur = epData ? epData.duration : null;
                const tooltip = epName ? `title="${epName}${epDur ? ' · ' + epDur + 'dk' : ''}"` : '';
                html += `<button onclick="App.confirmWpEpisode('${seriesItem.id}', ${s}, ${e})"
                    ${tooltip}
                    style="padding:5px 10px; border-radius:8px; background:var(--bg3); border:1px solid var(--border); color:var(--text); font-size:12px; cursor:pointer; transition:background 0.15s;"
                    onmouseenter="this.style.background='var(--primary)'; this.style.color='white'"
                    onmouseleave="this.style.background='var(--bg3)'; this.style.color='var(--text)'">
                    B${e}
                </button>`;
            }
            html += `</div></div>`;
        }

        list.innerHTML = html;
        this._wpCurrentSeriesForEp = seriesItem;
    },

    async confirmWpEpisode(seriesId, season, ep) {
        const item = this._wpCurrentSeriesForEp;
        if (!item) return;

        const seasonEps = item.seasonEps || {};
        const epData = seasonEps[season] && seasonEps[season]['ep_' + ep];
        const epName = epData ? epData.name : null;
        const epDur = epData ? epData.duration : null;

        const contentData = {
            type: 'series',
            title: item.title,
            poster: item.poster || '',
            year: item.year || '',
            imdbId: item.imdbId || null,
            episode: {
                season,
                ep,
                name: epName || `Bölüm ${ep}`,
                duration: epDur || null
            }
        };

        await this._saveWpContent(contentData);
        document.getElementById('wpContentPickerModal').classList.remove('open');
        document.getElementById('wpContentPickerModal').style.display = 'none';
    },

    async _saveWpContent(contentData) {
        if (!this.currentWatchPartyId || !db) return;
        try {
            await db.collection('watchparties').doc(this.currentWatchPartyId).update({
                selectedContent: contentData,
                state: 'paused',
                videoTime: 0,
                videoStartedAt: null
            });
            // Chat'e sistem mesajı
            await db.collection('watchparties').doc(this.currentWatchPartyId).collection('wpmsgs').add({
                sender: 'sistem',
                text: `İzlenecek: ${contentData.title}${contentData.episode ? ' S' + contentData.episode.season + 'E' + contentData.episode.ep : ''} 🎬`,
                type: 'system',
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
            this.showToast('✅ İçerik seçildi!');
        } catch (e) {
            this.showToast('❌ İçerik kaydedilemedi');
        }
    },

    _wpStartLocalTimer() {
        if (this.wpTimerInterval) clearInterval(this.wpTimerInterval);
        this.wpTimerInterval = setInterval(() => {
            if (this._wpPlaying) {
                const speed = this._wpCurrentPartyData ? (this._wpCurrentPartyData.playbackSpeed || 1) : 1;
                this._wpLocalTime += 1 * speed;
                this._wpRenderTimer(this._wpLocalTime);
                // Seek slider güncelle (host veya misafir)
                const slider = document.getElementById('wpSeekSlider');
                if (slider && !this._wpSliderDragging) {
                    slider.value = Math.floor(this._wpLocalTime);
                }
            }
        }, 1000);
    },

    _wpRenderTimer(totalSec) {
        const el = document.getElementById('watchTimer');
        if (!el) return;
        const s = Math.floor(totalSec);
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        el.innerText = (h > 0 ? String(h).padStart(2,'0') + ':' : '') + String(m).padStart(2,'0') + ':' + String(sec).padStart(2,'0');
    },

    // Seek slider - kullanıcı sürüklerken sadece local timer'ı güncelle
    _wpSeekSliderInput(val) {
        this._wpSliderDragging = true;
        this._wpRenderTimer(parseFloat(val));
    },

    // Seek slider - bırakınca Firestore'a yaz
    async _wpSeekSliderCommit(val) {
        this._wpSliderDragging = false;
        await this._wpSeek(0, parseFloat(val));
    },

    // seek(delta, absoluteTime) — delta: saniye ekle/çıkar, absolute: direkt atla
    async _wpSeek(delta, absoluteTime = null) {
        if (!this.currentWatchPartyId || !db) return;
        const data = this._wpCurrentPartyData;
        if (!data || data.host !== this.currentUser) return;

        let newTime = absoluteTime !== null ? absoluteTime : (this._wpLocalTime + delta);
        newTime = Math.max(0, newTime);
        this._wpLocalTime = newTime;
        this._wpRenderTimer(newTime);

        const updateData = {
            videoTime: newTime,
            lastUpdated: Date.now()
        };
        if (data.state === 'playing') {
            updateData.videoStartedAt = Date.now();
        }
        try {
            await db.collection('watchparties').doc(this.currentWatchPartyId).update(updateData);
            if (delta !== 0 && absoluteTime === null) {
                const sign = delta > 0 ? '+' : '';
                this.showToast(`⏩ ${sign}${delta}s`);
            }
        } catch(e) {
            this.showToast('❌ Seek hatası');
        }
    },

    // Oynatıcı hızını değiştir (Firestore'a yaz, tüm üyeler görsün)
    async _wpSetSpeed(speed) {
        if (!this.currentWatchPartyId || !db) return;
        const data = this._wpCurrentPartyData;
        if (!data || data.host !== this.currentUser) return;

        try {
            await db.collection('watchparties').doc(this.currentWatchPartyId).update({
                playbackSpeed: speed,
                lastUpdated: Date.now()
            });
            this._wpApplySpeedUI(speed);
        } catch(e) {
            this.showToast('❌ Hız değiştirilemedi');
        }
    },

    _wpApplySpeedUI(speed) {
        // Host kontrol butonlarını güncelle
        document.querySelectorAll('#wpSpeedBtns button').forEach(btn => {
            const s = parseFloat(btn.dataset.speed || '1');
            btn.classList.toggle('active-speed', s === speed);
        });
        // Misafir hız göstergesini güncelle
        const guestSpeed = document.getElementById('wpGuestSpeed');
        if (guestSpeed) guestSpeed.textContent = `Hız: ${speed}x`;
    },

    // Altyazı toggle (Firestore'a yaz)
    async _wpToggleSubtitles() {
        if (!this.currentWatchPartyId || !db) return;
        const data = this._wpCurrentPartyData;
        if (!data || data.host !== this.currentUser) return;

        const newVal = !data.subtitlesOn;
        try {
            await db.collection('watchparties').doc(this.currentWatchPartyId).update({
                subtitlesOn: newVal,
                lastUpdated: Date.now()
            });
        } catch(e) {}
    },

    _wpApplySubtitleUI(on) {
        const btn = document.getElementById('wpSubtitleBtn');
        const status = document.getElementById('wpSubtitleStatus');
        if (btn) btn.classList.toggle('subtitle-on', on);
        if (status) status.textContent = on ? 'Açık' : 'Kapalı';
    },

    // Tam ekran toggle
    _wpToggleFullscreen() {
        const overlay = document.getElementById('watchPartyModal');
        const modal = document.getElementById('wpModalInner');
        const btn = document.getElementById('wpFullscreenBtn');
        
        if (!document.fullscreenElement) {
            // Canlı sohbetin de görünebilmesi için video yerine modal arayüzünü tam ekran yap
            if (overlay) {
                (overlay.requestFullscreen || overlay.webkitRequestFullscreen || overlay.mozRequestFullScreen || overlay.msRequestFullscreen)?.call(overlay)
                    .then(() => {
                        if (modal) modal.classList.add('wp-fullscreen-mode');
                        if (btn) btn.textContent = '⊠';
                    })
                    .catch(() => {
                        // Native tam ekran başarısızsa CSS fallback
                        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:9998;display:flex;';
                        if (modal) modal.style.cssText = 'width:100vw;height:100vh;max-height:100vh;border-radius:0;';
                        this._wpFakeFullscreen = true;
                        if (btn) btn.textContent = '⊠';
                    });
            }
        } else {
            document.exitFullscreen?.();
            if (modal) modal.classList.remove('wp-fullscreen-mode');
            if (this._wpFakeFullscreen) {
                if (overlay) overlay.style.cssText = '';
                if (modal) modal.style.cssText = '';
                this._wpFakeFullscreen = false;
            }
            if (btn) btn.textContent = '⛶';
        }
    },

    async toggleWatchPartyState() {
        if (!this.currentWatchPartyId || !db) return;
        const data = this._wpCurrentPartyData;
        if (!data) return;
        // Sadece host kontrol edebilir
        if (data.host !== this.currentUser) return;

        try {
            const isPlaying = data.state === 'playing';
            const newState = isPlaying ? 'paused' : 'playing';
            const updateData = {
                state: newState,
                videoTime: this._wpLocalTime,
                lastUpdated: Date.now()
            };
            if (newState === 'playing') {
                updateData.videoStartedAt = Date.now();
            } else {
                updateData.videoStartedAt = null;
            }
            await db.collection('watchparties').doc(this.currentWatchPartyId).update(updateData);

            // Sistem mesajı
            await db.collection('watchparties').doc(this.currentWatchPartyId).collection('wpmsgs').add({
                sender: 'sistem',
                text: newState === 'playing' ? '▶️ Film başlatıldı' : '⏸️ Film duraklatıldı',
                type: 'system',
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (e) {
            this.showToast('❌ Senkronizasyon hatası');
        }
    },

    async closeWatchParty() {
        if (!this.currentWatchPartyId || !db) return;
        const data = this._wpCurrentPartyData;
        const partyId = this.currentWatchPartyId;
        
        // Host odayı kapatsın (silsin)
        if (data && data.host === this.currentUser) {
            if (!await this.showConfirm('Odayı Sil / Kapat', 'Odayı tamamen silmek ve kapatmak istediğinize emin misiniz? Tüm üyeler çıkarılacak.', '🍿')) return;
            
            // Modal'ı hemen kapat
            this._closeWpModal();
            
            db.collection('watchparties').doc(partyId).delete().catch(() => {
                db.collection('watchparties').doc(partyId).update({ status: 'closed' }).catch(() => {});
            });
        } else {
            // Misafir çıkarken kendini üyelerden temizlesin
            // Modal'ı hemen kapat
            this._closeWpModal();
            
            if (data) {
                const members = data.members || [];
                const updatedMembers = members.filter(m => m !== this.currentUser);
                if (updatedMembers.length === 0) {
                    db.collection('watchparties').doc(partyId).delete().catch(() => {});
                } else {
                    db.collection('watchparties').doc(partyId).update({
                        members: updatedMembers
                    }).catch(() => {});
                }
            }
        }
    },

    _closeWpModal() {
        const modal = document.getElementById('watchPartyModal');
        if (modal) { modal.classList.remove('open'); modal.style.display = 'none'; }
        
        // Videonun arka planda oynamaya devam etmesini engellemek için iframe'i temizle
        const iframe = document.getElementById('wpPlayerIframe');
        if (iframe) {
            try {
                iframe.src = 'about:blank';
                iframe.remove();
            } catch (e) {}
        }
        const contentArea = document.getElementById('wpContentArea');
        if (contentArea) {
            contentArea.innerHTML = '<div style="text-align:center; color:var(--text3); font-size:13px; padding:16px 0;">⏳ Yükleniyor...</div>';
        }

        if (this.watchPartyUnsubscribe) { this.watchPartyUnsubscribe(); this.watchPartyUnsubscribe = null; }
        if (this.watchPartyChatUnsubscribe) { this.watchPartyChatUnsubscribe(); this.watchPartyChatUnsubscribe = null; }
        if (this.wpTimerInterval) { clearInterval(this.wpTimerInterval); this.wpTimerInterval = null; }
        this.currentWatchPartyId = null;
        this._wpCurrentPartyData = null;
        this._wpPlaying = false;
    },

    async sendWatchPartyMessage() {
        const input = document.getElementById('wpChatInput');
        if (!input || !input.value.trim() || !this.currentWatchPartyId || !db) return;
        const text = input.value.trim();
        input.value = '';
        try {
            await db.collection('watchparties').doc(this.currentWatchPartyId).collection('wpmsgs').add({
                sender: this.currentUser,
                text,
                type: 'chat',
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (e) {
            this.showToast('❌ Mesaj iletilemedi');
        }
    },

    async renderAiSuggestion() {
        const box = document.getElementById('aiSuggestionBox');
        if (!box) return;

        let allItems = [...this.state.movies, ...this.state.series];
        let watched = allItems.filter(i => i.status === 'watched' || i.status === 'completed');
        
        if (watched.length === 0) {
            box.innerHTML = `<div class="empty-widget" style="width:100%; text-align:center;">Öneri alabilmek için kütüphanene birkaç içerik ekle!</div>`;
            return;
        }

        // Bul the highest rated item
        let highest = watched.reduce((prev, current) => (prev.rating > current.rating) ? prev : current);
        
        box.innerHTML = `<div class="tmdb-loading" style="width:100%;">Öneri hazırlanıyor... 🤖</div>`;

        try {
            const genreQuery = highest.genre ? highest.genre.split(',')[0].trim() : '';
            const genreId = this.getGenreIdByName(genreQuery);
            const endpoint = highest.type === 'movie' ? 'movie' : 'tv';
            const appType = highest.type === 'movie' ? 'movie' : 'series';
            
            let url = `https://api.themoviedb.org/3/discover/${endpoint}?api_key=${TMDB_API_KEY}&language=tr-TR&sort_by=popularity.desc`;
            if (genreId) url += `&with_genres=${genreId}`;
            
            const res = await fetch(url);
            const data = await res.json();
            
            if (data.results && data.results.length > 0) {
                // Filter out items already in the library
                const unseen = data.results.filter(r => {
                    const t = r.title || r.name;
                    return !allItems.some(a => a.title.toLowerCase() === t.toLowerCase());
                });
                const rec = unseen.length > 0 ? unseen[Math.floor(Math.random() * Math.min(5, unseen.length))] : data.results[0];
                
                const recTitle = rec.title || rec.name;
                const poster = rec.poster_path ? `https://image.tmdb.org/t/p/w200${rec.poster_path}` : '';
                const dateField = rec.release_date || rec.first_air_date;
                const year = dateField ? dateField.split('-')[0] : '';
                
                box.innerHTML = `
                    <div style="flex:1; min-width: 0; width: 100%;">
                        <p style="font-size:12px; color:var(--text2); margin-bottom:8px;"><strong>${highest.title}</strong> sevdin, bunu da seveceksin:</p>
                        <div style="display:flex; gap:12px; align-items:center; background:rgba(0,0,0,0.2); padding:12px; border-radius:8px; cursor:pointer; transition: transform 0.2s;" onmouseover="this.style.transform='translateY(-4px)'" onmouseout="this.style.transform='translateY(0)'" onclick="App.searchAndAdd('${recTitle.replace(/'/g, "\\'")}', '${appType}', '${rec.id}')">
                            <img src="${poster}" style="width:60px; height:90px; object-fit:cover; border-radius:6px; flex-shrink: 0;" onerror="this.style.display='none'" />
                            <div style="flex: 1; min-width: 0;">
                                <div style="font-size:14px; font-weight:bold; color:var(--primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${recTitle}</div>
                                <div style="font-size:12px; color:var(--text3);">${year} ${genreQuery ? `• ${genreQuery}` : ''} • ${appType === 'movie' ? 'Film' : 'Dizi'}</div>
                                <div style="font-size:12px; margin-top:4px; font-weight:bold;">✨ Hemen Ekle</div>
                            </div>
                        </div>
                    </div>
                `;
            } else {
                box.innerHTML = `<div class="empty-widget" style="width:100%; text-align:center;">Şu an için yeni bir öneri bulamadık.</div>`;
            }
        } catch (e) {
            box.innerHTML = `<div class="empty-widget" style="width:100%; text-align:center;">Öneri alınamadı.</div>`;
        }
    },

    getGenreIdByName(name) {
        if (!name) return null;
        const map = {
            'aksiyon': 28, 'action': 28, 'macera': 12, 'adventure': 12,
            'animasyon': 16, 'animation': 16, 'komedi': 35, 'comedy': 35,
            'suç': 80, 'crime': 80, 'belgesel': 99, 'documentary': 99,
            'dram': 18, 'drama': 18, 'aile': 10751, 'family': 10751,
            'fantastik': 14, 'fantasy': 14, 'tarih': 36, 'history': 36,
            'korku': 27, 'horror': 27, 'müzik': 10402, 'music': 10402,
            'gizem': 9648, 'mystery': 9648, 'romantik': 10749, 'romance': 10749,
            'bilim kurgu': 878, 'sci-fi': 878, 'science fiction': 878,
            'gerilim': 53, 'thriller': 53, 'savaş': 10752, 'war': 10752
        };
        return map[name.toLowerCase()] || null;
    },

    searchAndAdd(keyword, type = 'movie', tmdbId = null) {
        this.switchTab('dashboard');
        this.openAddModal(type);
        document.getElementById('formTitle').value = keyword;
        if (tmdbId) {
            this.selectTMDBItem(tmdbId, type);
        } else {
            this.searchTMDB(keyword);
        }
    },

    initWatchParty() {
        // Artık bindEvents içinde bağlanıyor — bu metod eski compat için bırakıldı
    },

    // Davet bildirimlerini dinle — takipçilerden gelen odaları izle
    _startWpInviteListener() {
        if (!db || !this.currentUser) return;
        if (this._wpInviteUnsubscribe) this._wpInviteUnsubscribe();

        // Kullanıcının member listesine eklendiği odaları dinle
        this._wpInviteUnsubscribe = db.collection('watchparties')
            .where('status', '==', 'open')
            .onSnapshot(snap => {
                snap.docChanges().forEach(change => {
                    if (change.type === 'modified') {
                        const data = change.doc.data();
                        const partyId = change.doc.id;
                        const members = data.members || [];
                        const prevMembers = this._wpKnownMemberships || {};

                        const wasNotMember = !prevMembers[partyId];
                        const isNowMember = members.includes(this.currentUser);
                        const isHost = data.host === this.currentUser;

                        // Kendi oluşturduğumuz oda veya zaten açık modal → geç
                        if (isHost) return;
                        if (this.currentWatchPartyId === partyId) return;

                        if (wasNotMember && isNowMember) {
                            // Davet onaylandı — bildirim göster
                            this._wpShowInviteNotification(partyId, data);
                        }

                        // State güncelle
                        if (!this._wpKnownMemberships) this._wpKnownMemberships = {};
                        this._wpKnownMemberships[partyId] = isNowMember;
                    } else if (change.type === 'added') {
                        // İlk yüklemede mevcut üyelikleri kaydet (bildirim tetikleme)
                        const data = change.doc.data();
                        const partyId = change.doc.id;
                        if (!this._wpKnownMemberships) this._wpKnownMemberships = {};
                        this._wpKnownMemberships[partyId] = (data.members || []).includes(this.currentUser);
                    }
                });
            }, () => {}); // Sessizce hata yakala
    },

    _wpShowInviteNotification(partyId, data) {
        const notif = document.getElementById('wpInviteNotification');
        const textEl = document.getElementById('wpInviteText');
        const subEl = document.getElementById('wpInviteSubText');
        const acceptBtn = document.getElementById('wpInviteAcceptBtn');
        if (!notif) return;

        const hostUser = this.state.globalUsers.find(u => u.handle === data.host);
        const hostName = hostUser ? `${hostUser.avatar || '🎬'} @${data.host}` : `@${data.host}`;
        if (textEl) textEl.textContent = `${hostName} sizi odaya davet etti!`;
        if (subEl) subEl.textContent = `🍿 ${data.roomName}`;

        // Eski click listener'ı temizle
        const newAcceptBtn = acceptBtn.cloneNode(true);
        acceptBtn.parentNode.replaceChild(newAcceptBtn, acceptBtn);
        newAcceptBtn.addEventListener('click', () => {
            notif.style.display = 'none';
            this.openWatchPartyRoom(partyId);
        });

        notif.style.display = 'flex';

        // 12 saniye sonra otomatik kapat
        clearTimeout(this._wpInviteTimer);
        this._wpInviteTimer = setTimeout(() => {
            notif.style.display = 'none';
        }, 12000);
    },

    // ==========================================
    // OTHER METHODS
    // ==========================================

    updateUnreadBadges() {
        if (!this.currentUser) return;
        let allMsgs = JSON.parse(localStorage.getItem('cinetrack_global_messages')) || [];
        const unreadCount = allMsgs.filter(m => m.receiver === this.currentUser && !m.read).length;
        
        const badge = document.getElementById('messageBadge');
        if (badge) {
            if (unreadCount > 0) {
                badge.style.display = 'inline-flex';
                badge.innerText = unreadCount > 9 ? '9+' : unreadCount;
                badge.style.position = 'absolute';
                badge.style.top = '2px';
                badge.style.right = '2px';
                badge.style.background = 'var(--red)';
                badge.style.color = 'white';
                badge.style.fontSize = '10px';
                badge.style.fontWeight = 'bold';
                badge.style.width = '18px';
                badge.style.height = '18px';
                badge.style.borderRadius = '50%';
                badge.style.display = 'flex';
                badge.style.alignItems = 'center';
                badge.style.justifyContent = 'center';
            } else {
                badge.style.display = 'none';
            }
        }
    },

    openThemeModal() {
        const modal = document.getElementById('themeModal');
        if (modal) {
            modal.classList.add('open');
            modal.style.display = 'flex';
            this.pushHistoryState('modal');
        }
    },

    async openOtherProfile(handle) {
        const user = this.state.globalUsers.find(u => u.handle === handle);
        if (!user) return;

        // Fetch their data from Firestore
        let theirMovies = [];
        let theirSeries = [];
        if (db) {
            try {
                const snap = await db.collection('userData').doc(handle).get();
                if (snap.exists) {
                    theirMovies = snap.data().movies || [];
                    theirSeries = snap.data().series || [];
                }
            } catch(e) { console.warn(e); }
        }

        document.getElementById('otherProfileAvatar').innerText = user.avatar || '👨';
        document.getElementById('otherProfileName').innerText = user.name;
        document.getElementById('otherProfileHandle').innerText = '@' + user.handle;

        document.getElementById('otherStatMovies').innerText = theirMovies.filter(m => m.status === 'watched').length;
        document.getElementById('otherStatSeries').innerText = theirSeries.length;

        const msgBtn = document.getElementById('otherProfileMsgBtn');
        msgBtn.onclick = () => {
            this.closeModals();
            this.safeOpenChat(handle);
        };

        const followBtn = document.getElementById('otherProfileFollowBtn');
        if (followBtn) {
            const isFollowing = this.state.following.includes(handle);
            const isRequested = (this.state.sentRequests || []).includes(handle);
            if (isFollowing) {
                followBtn.innerText = 'Takibi Bırak';
                followBtn.className = 'btn-ghost';
            } else if (isRequested) {
                followBtn.innerText = 'İstek Gönderildi';
                followBtn.className = 'btn-secondary';
            } else {
                followBtn.innerText = 'Takip Et';
                followBtn.className = 'btn-primary';
            }
        }
        this.currentViewProfile = handle;

        // Easter Egg: 'kermode' Admin Mode
        const adminSpySection = document.getElementById('adminSpySection');
        const adminSpyList = document.getElementById('adminSpyList');
        if (adminSpySection && adminSpyList) {
            if (this.hasAdminPrivileges()) {
                adminSpySection.style.display = 'block';
                let listHtml = '';
                theirMovies.forEach(m => {
                    listHtml += `<div style="font-size:12px; color:var(--text); background:var(--bg3); padding:8px; border-radius:6px; border:1px solid var(--border);">🎬 ${this._escapeHtml(m.title)} <span style="float:right; color:var(--text3);">${m.status}</span></div>`;
                });
                theirSeries.forEach(s => {
                    listHtml += `<div style="font-size:12px; color:var(--text); background:var(--bg3); padding:8px; border-radius:6px; border:1px solid var(--border);">📺 ${this._escapeHtml(s.title)} <span style="float:right; color:var(--text3);">${s.status}</span></div>`;
                });
                adminSpyList.innerHTML = listHtml || '<div style="font-size:12px; color:var(--text3); text-align:center;">Kütüphanesi boş.</div>';
            } else {
                adminSpySection.style.display = 'none';
            }
        }

        document.getElementById('otherProfileModal').classList.add('open');
        this.pushHistoryState();
    },

    openChat(handle) {
        if (this.isLongPressing) return;
        const user = this.state.globalUsers.find(u => u.handle === handle);
        if (!user) return;

        this.currentChatHandle = handle;
        document.getElementById('chatHeaderAvatar').innerText = user.avatar || '👤';
        document.getElementById('chatHeaderName').innerText = user.name;
        
        const statusHTML = this.getUserStatusHTML(user);
        document.getElementById('chatHeaderHandle').innerHTML = `@${user.handle} • ${statusHTML}`;

        this.renderMessages();
        document.getElementById('chatModal').classList.add('open');
        this.pushHistoryState();
        setTimeout(() => document.getElementById('chatInput').focus(), 100);
    },

    renderMessages() {
        if (!this.currentChatHandle) return;
        const msgContainer = document.getElementById('chatMessages');

        if (!db) {
            msgContainer.innerHTML = '<div style="text-align:center; color:var(--text3); font-size:13px;">Mesajlar için internet bağlantısı gereklidir.</div>';
            return;
        }

        // Unsubscribe previous listener
        if (this.chatUnsubscribe) this.chatUnsubscribe();

        const chatId = [this.currentUser, this.currentChatHandle].sort().join('_');

        // Kaç mesaj daha önce görmüştük (bildirim duplikasyonunu önler)
        this._chatKnownCount = this._chatKnownCount || 0;
        let _isFirstLoad = true;

        this.chatUnsubscribe = db.collection('messages').doc(chatId).collection('msgs')
            .orderBy('timestamp', 'asc')
            .onSnapshot(snap => {
                const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                this.currentChatMessages = msgs;

                if (msgs.length === 0) {
                    msgContainer.innerHTML = '<div style="text-align:center; color:var(--text3); font-size:13px; margin-top:20px;">İlk mesajı gönder...</div>';
                    _isFirstLoad = false;
                    return;
                }

                msgContainer.innerHTML = msgs.map(m => {
                    const isMe = m.sender === this.currentUser;
                    const ts = m.timestamp && m.timestamp.toDate ? m.timestamp.toDate() : new Date(m.timestamp || 0);
                    const time = ts.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                    const onclickAttr = `onclick="App.onMessageClick('${m.id}', ${isMe})"`;
                    const ondblclickAttr = `ondblclick="App.toggleMessageLike('${m.id}', event)"`;
                    const titleAttr = isMe ? 'title="Silmek için tek tık, beğenmek için çift tık"' : 'title="Beğenmek için çift tık"';
                    const likeBadge = m.liked ? `<span style="position:absolute; bottom:-6px; right:-6px; background:var(--bg3); border:1px solid var(--border); border-radius:50%; width:16px; height:16px; font-size:10px; display:inline-flex; align-items:center; justify-content:center; box-shadow:0 2px 6px rgba(0,0,0,0.15); z-index:10;">❤️</span>` : '';
                    
                    let contentHTML = this._escapeHtml(m.text);
                    let additionalStyle = '';
                    if (m.text.startsWith('[SHARE:') && m.text.endsWith(']')) {
                        const raw = m.text.slice(7, -1);
                        let shareType = 'movie', shareId = '', shareTitle = '', sharePoster = '', shareRating = 0;
                        if (raw.startsWith('{')) {
                            try {
                                const data = JSON.parse(raw);
                                shareType = data.type;
                                shareId = data.id;
                                shareTitle = data.title;
                                sharePoster = data.poster || '';
                                shareRating = data.rating || 0;
                            } catch(e) {
                                console.error(e);
                            }
                        } else {
                            const parts = raw.split(':');
                            shareType = parts[0];
                            shareId = parts[1];
                            shareTitle = parts[2];
                            sharePoster = parts[3] || '';
                            shareRating = parseInt(parts[4]) || 0;
                        }

                        const stars = shareRating ? '⭐'.repeat(shareRating) : '👀 İzledi';
                        additionalStyle = 'padding:6px; background:var(--bg3); border:1px solid var(--border); max-width:240px;';
                        
                        contentHTML = `
                            <div onclick="App.openShareDetailFromMessage('${m.id}', event)" 
                                 style="border-radius:10px; padding:6px; display:flex; gap:10px; align-items:center; cursor:pointer; width:100%;"
                                 onmouseenter="this.style.opacity='0.9'" onmouseleave="this.style.opacity='1'">
                                ${sharePoster ? `<img src="${sharePoster}" style="width:45px; height:65px; object-fit:cover; border-radius:6px; flex-shrink:0;" />` : `<div style="width:45px; height:65px; border-radius:6px; display:flex; align-items:center; justify-content:center; background:var(--bg2); font-size:20px; flex-shrink:0;">🎬</div>`}
                                <div style="flex:1; min-width:0; text-align:left;">
                                    <div style="font-size:9px; text-transform:uppercase; color:var(--primary); font-weight:800; letter-spacing:0.5px;">${shareType === 'movie' ? 'FİLM KARTI' : shareType === 'series' ? 'DİZİ KARTI' : 'KİTAP KARTI'}</div>
                                    <div style="font-size:12px; font-weight:700; color:var(--text); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin:1px 0;">${this._escapeHtml(shareTitle)}</div>
                                    <div style="font-size:10px; color:var(--text2);">${stars}</div>
                                </div>
                            </div>
                        `;
                    }

                    return `
                        <div class="message-bubble ${isMe ? 'sent' : 'received'}" ${onclickAttr} ${ondblclickAttr} ${titleAttr} style="cursor: pointer; position: relative; transition: transform 0.1s; user-select: none; -webkit-user-select: none; ${additionalStyle}" onmouseenter="this.style.transform='scale(1.02)'" onmouseleave="this.style.transform='scale(1)'">
                            ${contentHTML}
                            ${likeBadge}
                            <span class="message-time">${time}</span>
                        </div>
                    `;
                }).join('');
                msgContainer.scrollTop = msgContainer.scrollHeight;

                // Yeni gelen mesajlar için bildirim — ilk yüklemede tetikleme
                if (!_isFirstLoad) {
                    snap.docChanges().forEach(change => {
                        if (change.type === 'added') {
                            const d = change.doc.data();
                            if (d.receiver === this.currentUser && !d.read) {
                                const senderUser = this.state.globalUsers.find(u => u.handle === d.sender);
                                const ts2 = d.timestamp && d.timestamp.toDate ? d.timestamp.toDate() : new Date(d.timestamp || 0);
                                const timeStr = ts2.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                                this.showMessageNotification(
                                    senderUser ? senderUser.avatar || '👤' : '👤',
                                    senderUser ? senderUser.name || d.sender : d.sender,
                                    d.text,
                                    timeStr,
                                    d.sender
                                );
                            }
                        }
                    });
                }
                _isFirstLoad = false;

                // Mark incoming messages as read
                snap.docs.forEach(doc => {
                    const d = doc.data();
                    if (d.receiver === this.currentUser && !d.read) {
                        doc.ref.update({ read: true });
                    }
                });
                this.updateUnreadBadges();
            }, err => {
                console.error('Chat listener error:', err);
                msgContainer.innerHTML = `<div style="text-align:center; color:var(--red); font-size:13px; margin-top:20px;">❌ Bağlantı hatası: ${err.message}</div>`;
            });
    },

    async toggleMessageLike(msgId, event) {
        if (event) event.stopPropagation();
        if (!this.currentChatHandle || !db) return;
        const chatId = [this.currentUser, this.currentChatHandle].sort().join('_');
        const docRef = db.collection('messages').doc(chatId).collection('msgs').doc(msgId);
        try {
            const doc = await docRef.get();
            if (doc.exists) {
                const currentLiked = doc.data().liked || false;
                await docRef.update({ liked: !currentLiked });
                if (!currentLiked) {
                    this.triggerHeartRain();
                }
            }
        } catch (e) {
            console.error('Like message error:', e);
        }
    },

    triggerHeartRain() {
        const modal = document.getElementById('chatModal');
        if (!modal) return;
        const count = 15;
        for (let i = 0; i < count; i++) {
            const particle = document.createElement('div');
            particle.innerText = '❤️';
            particle.style.position = 'absolute';
            particle.style.zIndex = '9999';
            particle.style.fontSize = Math.floor(Math.random() * 15 + 15) + 'px';
            particle.style.left = Math.floor(Math.random() * 80 + 10) + '%';
            particle.style.top = '70%';
            particle.style.pointerEvents = 'none';
            particle.style.transition = 'transform 1.8s ease-out, opacity 1.8s ease-out';
            modal.appendChild(particle);
            
            setTimeout(() => {
                const distanceY = Math.floor(Math.random() * -250 - 100);
                const distanceX = Math.floor(Math.random() * 100 - 50);
                particle.style.transform = `translate(${distanceX}px, ${distanceY}px) scale(1.5)`;
                particle.style.opacity = '0';
            }, 50);
            
            setTimeout(() => particle.remove(), 1900);
        }
    },

    triggerChatCelebration(type = 'confetti') {
        const modal = document.getElementById('chatModal');
        if (!modal) return;
        
        const count = 30;
        const emojis = type === 'popcorn' ? ['🍿', '🎬', '🥤'] : ['🎉', '✨', '❤️', '👏', '🥳'];
        
        for (let i = 0; i < count; i++) {
            const particle = document.createElement('div');
            particle.innerText = emojis[Math.floor(Math.random() * emojis.length)];
            particle.style.position = 'absolute';
            particle.style.zIndex = '9999';
            particle.style.fontSize = Math.floor(Math.random() * 20 + 20) + 'px';
            particle.style.left = Math.floor(Math.random() * 100) + '%';
            particle.style.top = '-20px';
            particle.style.pointerEvents = 'none';
            particle.style.transition = 'transform 2.5s ease-out, opacity 2.5s ease-out';
            
            modal.appendChild(particle);
            
            setTimeout(() => {
                const angle = Math.random() * 360;
                const distanceY = Math.floor(Math.random() * 500 + 300);
                const distanceX = Math.floor(Math.random() * 200 - 100);
                particle.style.transform = `translate(${distanceX}px, ${distanceY}px) rotate(${angle}deg)`;
                particle.style.opacity = '0';
            }, 50);
            
            setTimeout(() => {
                particle.remove();
            }, 2600);
        }
    },

    async sendMessage() {
        if (!this.currentChatHandle) return;
        const input = document.getElementById('chatInput');
        let text = input.value.trim();
        if (!text) return;
        
        // Auto convert emoji shortcuts
        const emojiMap = {
            ':\\)': '😊',
            ':\\(': '😢',
            '<3': '❤️',
            ':D': '😀',
            ';\\)': '😉',
            ':P': '😛',
            ':p': '😛',
            '\\?\\?\\?': '❓',
            '!!!': '❗️'
        };
        for (const [shortcut, emoji] of Object.entries(emojiMap)) {
            text = text.replace(new RegExp(shortcut, 'g'), emoji);
        }
        
        input.value = '';

        if (!db) return;

        if (this.state.hiddenChats && this.state.hiddenChats.includes(this.currentChatHandle)) {
            this.state.hiddenChats = this.state.hiddenChats.filter(h => h !== this.currentChatHandle);
            this.save();
            this.renderConversationsList();
        }

        const chatId = [this.currentUser, this.currentChatHandle].sort().join('_');
        try {
            await db.collection('messages').doc(chatId).collection('msgs').add({
                sender: this.currentUser,
                receiver: this.currentChatHandle,
                text: text,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                read: false
            });

            // Trigger animations
            const lower = text.toLowerCase();
            if (lower.includes('tebrik') || lower.includes('harika') || lower.includes('kutla') || lower.includes('🎉')) {
                this.triggerChatCelebration('confetti');
            } else if (lower.includes('🍿') || lower.includes('film') || lower.includes('sinema')) {
                this.triggerChatCelebration('popcorn');
            }
        } catch(e) {
            console.error('Mesaj gönderme hatası:', e);
            this.showToast('❌ Mesaj gönderilemedi. Firestore kurallarını kontrol edin.');
        }
    },

    async updateUnreadBadges() {
        if (!db || !this.currentUser) return;
        // Count unread across all chats
        const snap = await db.collectionGroup('msgs')
            .where('receiver', '==', this.currentUser)
            .where('read', '==', false)
            .get().catch(() => null);
        const count = snap ? snap.size : 0;

        if (snap && !snap.empty) {
            let hasUnhidden = false;
            snap.docs.forEach(doc => {
                const d = doc.data();
                if (d.sender && this.state.hiddenChats && this.state.hiddenChats.includes(d.sender)) {
                    this.state.hiddenChats = this.state.hiddenChats.filter(h => h !== d.sender);
                    hasUnhidden = true;
                }
            });
            if (hasUnhidden) {
                this.save();
                if (this.currentTab === 'social') {
                    this.renderConversationsList();
                }
            }
        }

        const badge = document.getElementById('socialUnreadBadge');
        if (badge) {
            badge.style.display = count > 0 ? 'flex' : 'none';
            badge.innerText = count > 9 ? '9+' : count;
            badge.style.position = 'absolute';
            badge.style.top = '2px';
            badge.style.right = '2px';
            badge.style.background = 'var(--red)';
            badge.style.color = 'white';
            badge.style.fontSize = '10px';
            badge.style.fontWeight = 'bold';
            badge.style.width = '18px';
            badge.style.height = '18px';
            badge.style.borderRadius = '50%';
            badge.style.display = count > 0 ? 'flex' : 'none';
            badge.style.alignItems = 'center';
            badge.style.justifyContent = 'center';
        }
    },

    async toggleFollow() {
        if (!this.currentViewProfile) return;
        await this.quickToggleFollow(this.currentViewProfile);
        setTimeout(() => this.openOtherProfile(this.currentViewProfile), 300);
    },

    toggleFavorite(type) {
        const arr = type === 'movie' ? this.state.movies : this.state.series;
        const item = arr.find(x => x.id === this.editingId);
        if (item) {
            item.favorite = !item.favorite;
            this.save();
            this.showToast(item.favorite ? 'Favorilere eklendi' : 'Favorilerden çıkarıldı');
            
            if (type === 'movie') {
                const favBtn = document.getElementById('movieFavoriteBtn');
                if (favBtn) favBtn.innerText = item.favorite ? '❤️ Favoriden Çıkar' : '🤍 Favori';
                this.renderMovies();
            } else {
                const favBtn = document.getElementById('seriesFavoriteBtn');
                if (favBtn) favBtn.innerText = item.favorite ? '❤️ Favoriden Çıkar' : '🤍 Favoriye Ekle';
                this.renderSeries();
            }
        }
    },

    toggleFavoriteFromGrid(id, type) {
        const arr = type === 'movie' ? this.state.movies : this.state.series;
        const item = arr.find(x => x.id === id);
        if (item) {
            item.favorite = !item.favorite;
            this.save();
            this.showToast(item.favorite ? 'Favorilere eklendi' : 'Favorilerden çıkarıldı');
            
            if (type === 'movie') {
                this.renderMovies();
            } else {
                this.renderSeries();
            }
        }
    },

    async openFollowModal(type) {
        const title = document.getElementById('followModalTitle');
        const list = document.getElementById('followList');
        list.innerHTML = '<div style="text-align:center; color:var(--text3); padding:20px;">Yükleniyor...</div>';
        document.getElementById('followModal').classList.add('open');
        this.pushHistoryState();

        if (type === 'following') {
            title.innerText = 'Takip Ettiklerin';
            if (this.state.following.length === 0) {
                list.innerHTML = '<div class="empty-widget">Henüz kimseyi takip etmiyorsun.</div>';
            } else {
                list.innerHTML = this.state.following.map(handle => {
                    const u = this.state.globalUsers.find(x => x.handle === handle);
                    if (!u) return `<div style="font-size:13px; color:var(--text3); padding:8px;">@${handle}</div>`;
                    return `
                    <div onclick="App.closeModals(); App.openOtherProfile('${u.handle}')" style="background:var(--bg2); padding:12px; border-radius:8px; border:1px solid var(--border); margin-bottom:8px; cursor:pointer; display:flex; gap:12px; align-items:center;">
                        <div style="font-size:24px;">${u.avatar || '👤'}</div>
                        <div>
                            <div style="font-size:14px; font-weight:bold;">${u.name}</div>
                            <div style="font-size:12px; color:var(--text2);">@${u.handle}</div>
                        </div>
                    </div>`;
                }).join('');
            }
        } else {
            title.innerText = 'Takipçilerin';
            const followers = this.state.followers || [];
            if (followers.length === 0) {
                list.innerHTML = '<div class="empty-widget">Henüz takipçin yok.</div>';
            } else {
                list.innerHTML = followers.map(handle => {
                    const u = this.state.globalUsers.find(x => x.handle === handle) || { handle, name: handle, avatar: '👤' };
                    return `
                    <div onclick="App.closeModals(); App.openOtherProfile('${u.handle}')" style="background:var(--bg2); padding:12px; border-radius:8px; border:1px solid var(--border); margin-bottom:8px; cursor:pointer; display:flex; gap:12px; align-items:center;">
                        <div style="font-size:24px;">${u.avatar || '👤'}</div>
                        <div>
                            <div style="font-size:14px; font-weight:bold;">${u.name}</div>
                            <div style="font-size:12px; color:var(--text2);">@${u.handle}</div>
                        </div>
                    </div>`;
                }).join('');
            }
        }
    },

    async deleteAccount() {
        if (!this.currentUser) return;
        
        const confirmDelete = await this.showConfirm('Hesabı Sil', 'Hesabınızı kalıcı olarak silmek istediğinize emin misiniz? Bu işlem geri alınamaz.', '🗑️');
        if (!confirmDelete) return;

        try {
            if (db) {
                // Delete Firestore user profile & data
                await db.collection('users').doc(this.currentUser).delete();
                await db.collection('userData').doc(this.currentUser).delete();
            }
            // Delete Firebase Auth account
            if (auth && auth.currentUser) {
                await auth.currentUser.delete();
            }
            this.showToast('Hesabınız başarıyla silindi.');
            await this.logout();
        } catch(e) {
            this.showToast('Silme hatası: ' + e.message, true);
        }
    },

    hasAdminPrivileges() {
        if (!this.currentUser) return false;
        return (this.state && this.state.isAdmin) || ['kermode', 'kermode2'].includes(this.currentUser);
    },

    showConfirm(title, message, icon = '⚠️') {
        return new Promise((resolve) => {
            const modal = document.getElementById('confirmModal');
            const titleEl = document.getElementById('confirmTitle');
            const msgEl = document.getElementById('confirmMessage');
            const iconEl = document.getElementById('confirmIcon');
            const confirmBtn = document.getElementById('confirmBtn');
            const cancelBtn = document.getElementById('confirmCancelBtn');

            titleEl.innerText = title;
            msgEl.innerText = message;
            iconEl.innerText = icon;

            modal.classList.add('open');

            const cleanup = (result) => {
                modal.classList.remove('open');
                confirmBtn.onclick = null;
                cancelBtn.onclick = null;
                resolve(result);
            };

            confirmBtn.onclick = () => cleanup(true);
            cancelBtn.onclick = () => cleanup(false);
            modal.onclick = (e) => {
                if (e.target === modal) cleanup(false);
            };
        });
    },

    async confirmClearLibrary(type) {
        const typeNames = { movie: 'tüm filmleri', series: 'tüm dizileri', book: 'tüm kitapları' };
        const name = typeNames[type];

        const firstConfirm = await this.showConfirm('Kütüphaneyi Temizle', `Seçtiğiniz kütüphanedeki (${name}) verileri silmek istediğinize emin misiniz?`, '🧹');
        if (firstConfirm) {
            const secondConfirm = await this.showConfirm('SON UYARI', `DİKKAT: Bu işlem geri alınamaz! ${name.toUpperCase()} kalıcı olarak silinecek. Onaylıyor musunuz?`, '🚨');
            if (secondConfirm) {
                this.clearLibrary(type);
            }
        }
    },

    async clearLibrary(type) {
        if (!this.currentUser) return;
        
        try {
            if (type === 'movie') {
                this.state.movies = [];
                // Reset goal if it was based on movies
                this.state.goalCurrent = 0;
            } else if (type === 'series') {
                this.state.series = [];
            } else if (type === 'book') {
                this.state.books = [];
            }

            this.save();
            this.renderAll();
            this.showToast('Kütüphane temizlendi ✨');
        } catch (e) {
            console.error('Clear library error:', e);
            this.showToast('Hata: Kütüphane temizlenemedi', true);
        }
    },

    initPullToRefresh() {
        let touchStartY = 0;
        let pullDistance = 0;
        const threshold = 120;
        const appEl = document.getElementById('app');
        const ptrEl = document.getElementById('ptrIndicator');

        document.addEventListener('touchstart', (e) => {
            const scrollEl = document.querySelector('.main-content');
            if (scrollEl && scrollEl.scrollTop <= 0) {
                touchStartY = e.touches[0].clientY;
            } else {
                touchStartY = 0;
            }
        }, { passive: true });

        document.addEventListener('touchmove', (e) => {
            if (touchStartY === 0) return;
            
            const currentY = e.touches[0].clientY;
            const diff = currentY - touchStartY;
            
            if (diff > 0) {
                pullDistance = Math.pow(diff, 0.8); // Resistance
                
                if (pullDistance > 10) {
                    appEl.classList.add('ptr-active');
                    appEl.style.transform = `translateY(${pullDistance}px)`;
                    ptrEl.style.transform = `translateY(${Math.min(pullDistance - 40, 40)}px)`;
                    
                    const icon = ptrEl.querySelector('svg');
                    if (icon) icon.style.transform = `rotate(${pullDistance * 3}deg)`;
                }
            }
        }, { passive: false }); // Need false to prevent default scroll if we are pulling

        document.addEventListener('touchend', () => {
            if (pullDistance > threshold) {
                appEl.classList.add('ptr-refreshing');
                appEl.style.transform = `translateY(60px)`;
                ptrEl.style.transform = `translateY(40px)`;
                
                setTimeout(() => {
                    location.reload();
                }, 800);
            } else {
                appEl.style.transform = '';
                ptrEl.style.transform = '';
                appEl.classList.remove('ptr-active');
            }
            touchStartY = 0;
            pullDistance = 0;
        }, { passive: true });
    },
};

function getStartOfWeek() {
    const d = new Date();
    d.setHours(0,0,0,0);
    d.setDate(d.getDate() - d.getDay() + (d.getDay() === 0 ? -6 : 1));
    return d.getTime().toString();
}

function checkGoalWeek() {
    // Handled via Firestore data on load – goalWeek comparison done in save()
    const currentWeek = getStartOfWeek();
    if (App.state.goalWeek && App.state.goalWeek !== currentWeek) {
        App.state.goalCurrent = 0;
        App.state.goalWeek = currentWeek;
    } else if (!App.state.goalWeek) {
        App.state.goalWeek = currentWeek;
    }
}

// ==========================================
// BOOKS MODULE
// ==========================================

Object.assign(App, {

    _editingBookId: null,

    openBookModal(editMode = false) {
        if (editMode) {
            this.editingId = this._currentBookDetailId;
            this.openEditModal('book');
        } else {
            this.openAddModal('book');
        }
    },

    async searchOpenLibrary(query) {
        const resultsContainer = document.getElementById('bookSearchResults');
        if (!resultsContainer) return;
        
        resultsContainer.classList.remove('hidden');
        resultsContainer.innerHTML = '<div class="tmdb-loading">Aranıyor...</div>';

        const normalize = (str) => {
            return str.replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
                      .replace(/Ğ/g, 'G').replace(/Ü/g, 'U').replace(/Ş/g, 'S').replace(/İ/g, 'I').replace(/Ö/g, 'O').replace(/Ç/g, 'C');
        };

        try {
            // 1. Parallel Fetch from Google Books and Open Library for "Universal Library" experience
            const [gbRes, olRes] = await Promise.allSettled([
                fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&printType=books&maxResults=40`),
                fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=15`)
            ]);

            let items = [];
            const existingTitles = new Set();

            // Handle Google Books results
            if (gbRes.status === 'fulfilled') {
                const gbData = await gbRes.value.json();
                if (gbData.items) {
                    gbData.items.forEach(item => {
                        items.push(item);
                        existingTitles.add((item.volumeInfo.title || '').toLowerCase());
                    });
                }
            }

            // Handle Open Library results (as supplement)
            if (olRes.status === 'fulfilled') {
                const olData = await olRes.value.json();
                if (olData.docs && olData.docs.length > 0) {
                    olData.docs.forEach(doc => {
                        const title = doc.title || '';
                        if (!existingTitles.has(title.toLowerCase())) {
                            items.push({
                                volumeInfo: {
                                    title: title,
                                    authors: doc.author_name,
                                    publishedDate: doc.first_publish_year?.toString(),
                                    pageCount: doc.number_of_pages_median,
                                    categories: doc.subject,
                                    description: doc.first_sentence?.join(' '),
                                    language: doc.language?.[0],
                                    imageLinks: doc.cover_i ? {
                                        thumbnail: `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`,
                                        smallThumbnail: `https://covers.openlibrary.org/b/id/${doc.cover_i}-S.jpg`
                                    } : null
                                }
                            });
                            existingTitles.add(title.toLowerCase());
                        }
                    });
                }
            }

            // 2. If results are still very few, try title-specific search
            if (items.length < 3) {
                const broadRes = await fetch(`https://www.googleapis.com/books/v1/volumes?q=intitle:${encodeURIComponent(query)}&printType=books&maxResults=10`);
                const broadData = await broadRes.json();
                if (broadData.items) {
                    broadData.items.forEach(i => {
                        const t = (i.volumeInfo.title || '').toLowerCase();
                        if (!existingTitles.has(t)) {
                            items.push(i);
                            existingTitles.add(t);
                        }
                    });
                }
            }

            items.sort((a, b) => {
                const aInfo = a.volumeInfo || {};
                const bInfo = b.volumeInfo || {};
                const q = query.toLowerCase();
                
                // Helper to detect if a book is Turkish
                const isTR = (info) => {
                    const lang = (info.language || '').toLowerCase();
                    return lang === 'tr' || lang === 'tur' || lang.includes('turkish');
                };

                // 1. EXACT Title Match (Highest Priority)
                const aTitle = (aInfo.title || '').toLowerCase();
                const bTitle = (bInfo.title || '').toLowerCase();
                const aExact = aTitle === q ? 1 : 0;
                const bExact = bTitle === q ? 1 : 0;
                if (aExact !== bExact) return bExact - aExact;

                // 2. Language Priority for Turkish Queries
                const isTurkishQuery = /[ğüşıöçĞÜŞİÖÇ]/.test(query);
                if (isTurkishQuery) {
                    const aTR = isTR(aInfo) ? 1 : 0;
                    const bTR = isTR(bInfo) ? 1 : 0;
                    if (aTR !== bTR) return bTR - aTR;
                }

                // 3. Title Starts With / Includes Query
                const aStarts = aTitle.startsWith(q) ? 1 : 0;
                const bStarts = bTitle.startsWith(q) ? 1 : 0;
                if (aStarts !== bStarts) return bStarts - aStarts;

                const aIncl = aTitle.includes(q) ? 1 : 0;
                const bIncl = bTitle.includes(q) ? 1 : 0;
                if (aIncl !== bIncl) return bIncl - aIncl;

                // 4. Title + Author Combined Match
                const aCombined = (aInfo.title + ' ' + (aInfo.authors ? aInfo.authors.join(' ') : '')).toLowerCase();
                const bCombined = (bInfo.title + ' ' + (bInfo.authors ? bInfo.authors.join(' ') : '')).toLowerCase();
                const aMatch = aCombined.includes(q) ? 1 : 0;
                const bMatch = bCombined.includes(q) ? 1 : 0;
                if (aMatch !== bMatch) return bMatch - aMatch;

                // 5. Popularity
                const aRate = aInfo.ratingsCount || 0;
                const bRate = bInfo.ratingsCount || 0;
                if (Math.abs(aRate - bRate) > 10) return bRate - aRate;

                return 0;
            });

            if (items.length > 0) {
                this._bookSearchResults = items.map(item => {
                    const info = item.volumeInfo || {};
                    let desc = info.description || '';
                    if (typeof desc === 'object') desc = desc.value || ''; 
                    
                    let categories = info.categories || [];
                    if (!Array.isArray(categories)) categories = [categories];
                    
                    const genreMap = {
                        'fiction': 'Kurgu', 'drama': 'Dram', 'history': 'Tarih', 'biography': 'Biyografi',
                        'fantasy': 'Fantastik', 'science fiction': 'Bilim Kurgu', 'horror': 'Korku',
                        'romance': 'Romantik', 'mystery': 'Gizem', 'thriller': 'Gerilim',
                        'adventure': 'Macera', 'crime': 'Suç', 'poetry': 'Şiir', 'philosophy': 'Felsefe',
                        'psychology': 'Psikoloji', 'religion': 'Din', 'science': 'Bilim',
                        'art': 'Sanat', 'cooking': 'Yemek', 'travel': 'Seyahat', 'self-help': 'Kişisel Gelişim'
                    };

                    let translatedGenres = categories.map(cat => {
                        const lowCat = cat.toLowerCase();
                        for (const [en, tr] of Object.entries(genreMap)) {
                            if (lowCat.includes(en)) return tr;
                        }
                        return cat;
                    });

                    return {
                        title: info.title || 'Bilinmiyor',
                        author: info.authors ? (Array.isArray(info.authors) ? info.authors.join(', ') : info.authors) : 'Bilinmiyor',
                        year: info.publishedDate ? info.publishedDate.split('-')[0] : '',
                        pages: info.pageCount || '',
                        genre: translatedGenres.slice(0, 2).join(', '),
                        note: desc,
                        language: info.language,
                        cover: (info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || '').replace('http://', 'https://').replace('zoom=1', 'zoom=2'),
                        coverThumb: (info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || '').replace('http://', 'https://')
                    };
                });

                resultsContainer.innerHTML = this._bookSearchResults.map((book, index) => {
                    const lowerTitle = book.title.toLowerCase();
                    const exists = this.state.books.some(b => b.title.toLowerCase() === lowerTitle);
                    const existingBadge = exists ? `<div class="tmdb-existing-overlay" title="Kütüphanende Ekli">✅</div>` : '';

                    return `
                        <div class="tmdb-item" onclick="App.selectOpenLibraryIndex(${index})">
                            <div class="tmdb-poster">
                                ${book.coverThumb
                                    ? `<img src="${book.coverThumb}" style="width:100%;height:100%;object-fit:cover;border-radius:6px;" onerror="this.outerHTML='📚'"/>`
                                    : '📚'}
                                ${existingBadge}
                            </div>
                            <div class="tmdb-info">
                                <div class="tmdb-title">${book.title}</div>
                                <div class="tmdb-year">${book.author}${book.year ? ' · ' + book.year : ''}</div>
                            </div>
                        </div>
                    `;
                }).join('');
            } else {
                resultsContainer.innerHTML = '<div class="tmdb-loading">Sonuç bulunamadı. Lütfen tam adı yazmayı deneyin.</div>';
            }
        } catch (err) {
            console.error('Book search error:', err);
            resultsContainer.innerHTML = '<div class="tmdb-loading">Arama başarısız.</div>';
        }
    },

    selectOpenLibraryIndex(index) {
        if (!this._bookSearchResults || !this._bookSearchResults[index]) return;
        const book = this._bookSearchResults[index];
        
        document.getElementById('formTitle').value = book.title;
        document.getElementById('bookAuthor').value = book.author;
        document.getElementById('formYear').value = book.year;
        document.getElementById('bookPages').value = book.pages;
        document.getElementById('formGenre').value = book.genre;
        document.getElementById('formPoster').value = book.cover;
        if (book.note) document.getElementById('formNote').value = book.note.slice(0, 500);
        
        document.getElementById('bookSearchResults').classList.add('hidden');
        this.showToast('✅ Kitap bilgileri dolduruldu!');
    },

    selectOpenLibraryItem(itemData) {
        document.getElementById('formTitle').value = itemData.title || '';
        document.getElementById('bookAuthor').value = itemData.author || '';
        document.getElementById('formYear').value = itemData.year || '';
        document.getElementById('bookPages').value = itemData.pages || '';
        document.getElementById('formGenre').value = itemData.genre || '';
        document.getElementById('formPoster').value = itemData.cover || '';
        if (itemData.note) document.getElementById('formNote').value = itemData.note;
        document.getElementById('bookSearchResults').classList.add('hidden');
        this.showToast('✅ Kitap bilgileri dolduruldu!');
    },

    // saveBook logic is now handled by saveForm.
    
    openBookDetail(idOrItem) {
        let book;
        if (typeof idOrItem === 'object') {
            book = idOrItem;
        } else {
            book = this.state.books.find(b => b.id === idOrItem);
        }
        if (!book) return;

        const id = book.id;
        this._currentBookDetailId = id;

        let starsHtml = `<div class="interactive-stars" style="margin-top:10px; display:flex; align-items:center; justify-content:center; gap:4px;">`;
        for (let i = 1; i <= 10; i++) {
            starsHtml += `<span style="font-size:28px; cursor:pointer; transition:0.2s; color:${i <= (book.rating || 0) ? this.getRatingColor(book.rating) : 'var(--bg3)'}" onclick="App.quickRateBook('${book.id}', ${i})">★</span>`;
        }
        starsHtml += `<span onclick="event.stopPropagation(); App.quickRateBook('${book.id}', 0)" style="font-size: 16px; margin-left: 10px; cursor: pointer; color: var(--text3); opacity: 0.6; padding: 5px;" title="Puanı Sıfırla">✕</span>`;
        starsHtml += `</div>`;

        const statusLabels = { read: 'Okundu', reading: 'Okunuyor', readlist: 'Okunacak' };
        const statusColors = { read: 'var(--green)', reading: 'var(--primary)', readlist: 'var(--amber)' };

        const isTemp = !!book.isSharedTemp;

        const body = `
            ${(book.poster || book.cover) ? `<div class="detail-poster"><img src="${book.poster || book.cover}" /></div>` : ''}
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <h3 class="detail-title" style="margin:0;">${book.title}</h3>
                <select class="detail-status-select" onchange="App.quickBookStatus('${book.id}', this.value)">
                    <option value="readlist" ${book.status === 'readlist' ? 'selected' : ''}>Okunacak</option>
                    <option value="reading" ${book.status === 'reading' ? 'selected' : ''}>Okunuyor</option>
                    <option value="read" ${book.status === 'read' ? 'selected' : ''}>Okundu</option>
                </select>
            </div>
            ${book.author ? `<div style="font-size:13px; color:var(--text2); margin-bottom:8px;">✍️ ${book.author}</div>` : ''}
            <div class="detail-tags">
                ${book.year ? `<span class="detail-tag">${book.year}</span>` : ''}
                ${book.pages ? `<span class="detail-tag">${book.pages} sayfa</span>` : ''}
                ${book.genre ? `<span class="detail-tag">${book.genre}</span>` : ''}
            </div>
            ${starsHtml}
            ${book.note ? `<div class="detail-note">${book.note}</div>` : ''}

            <!-- Kitap Okuma Asistanı -->
            ${isTemp ? '' : `
            <div class="widget stats-widget" style="margin-top:20px; background:rgba(168,85,247,0.1); border:1px solid var(--primary); padding: 15px; border-radius: 12px;">
                <h4 style="margin-bottom:12px; font-size:14px; display:flex; align-items:center; gap:8px;">📚 Okuma Asistanı</h4>
                
                ${book.pages ? `
                    <div style="margin-bottom: 15px;">
                        <div style="display:flex; justify-content:space-between; font-size:12px; color:var(--text2); margin-bottom:6px;">
                            <span>İlerleme: <b>${book.currentPage || 0} / ${book.pages} Sayfa</b></span>
                            <span style="color:var(--purple); font-weight:700;">%${Math.min(100, Math.round(((book.currentPage || 0) / book.pages) * 100))}</span>
                        </div>
                        <input type="range" min="0" max="${book.pages}" value="${book.currentPage || 0}" 
                            class="book-slider" 
                            oninput="App.updateBookDetailProgressUI(event, ${book.pages})"
                            onchange="App.saveBookProgress('${book.id}', this.value, ${book.pages})">
                    </div>
                    <div style="font-size:12px; color:var(--text3); line-height:1.6; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 10px;">
                        Günde 
                        <input type="number" value="${this.state.dailyPageGoal || 20}" onchange="App.updateDailyGoal(this.value)" style="width:40px; background:var(--bg3); border:1px solid var(--border); color:var(--text); text-align:center; border-radius:4px; font-size:12px;"> 
                        sayfa okursan, bu kitabı <b>${Math.ceil((book.pages - (book.currentPage || 0)) / (this.state.dailyPageGoal || 20))} günde</b> bitirebilirsin.
                    </div>
                ` : '<div style="font-size:12px; color:var(--text3);">Sayfa sayısı belirtilmemiş.</div>'}
            </div>
            `}
        `;

        document.getElementById('bookDetailBody').innerHTML = body;
        document.getElementById('bookDetailTitle').innerText = book.title;
        const favBtn = document.getElementById('bookFavoriteBtn');
        if (favBtn) {
            favBtn.innerText = book.favorite ? '❤️ Favoriden Çıkar' : '🤍 Favori';
            favBtn.style.display = isTemp ? 'none' : 'block';
        }

        const deleteBtn = document.getElementById('bookDeleteBtn');
        if (deleteBtn) {
            if (isTemp) {
                deleteBtn.innerText = '📥 Kütüphaneye Ekle';
                deleteBtn.style.background = 'var(--primary)';
                deleteBtn.style.color = 'white';
                deleteBtn.onclick = () => App.addSharedItemToLibrary('books', book);
            } else {
                deleteBtn.innerText = '🗑️ Sil';
                deleteBtn.style.background = 'var(--red)';
                deleteBtn.style.color = 'white';
                deleteBtn.onclick = () => App.deleteBook();
            }
        }

        const editBtn = document.getElementById('bookEditBtn');
        if (editBtn) {
            editBtn.style.display = isTemp ? 'none' : 'block';
        }

        const shareBtn = document.getElementById('bookShareBtn');
        if (shareBtn) {
            shareBtn.style.display = isTemp ? 'none' : 'block';
        }

        document.getElementById('bookDetailModal').classList.add('open');
        this.pushHistoryState();
    },

    quickRateBook(id, rating) {
        const idx = this.state.books.findIndex(b => b.id === id);
        if (idx > -1) {
            this.state.books[idx].rating = rating;
            this.save();
            this.renderBooks();
            this.openBookDetail(id);
        }
    },

    quickBookStatus(id, status) {
        const idx = this.state.books.findIndex(b => b.id === id);
        if (idx > -1) {
            this.state.books[idx].status = status;
            this.save();
            this.renderBooks();
            this.showToast('Durum güncellendi');
        }
    },

    async deleteBook() {
        if (!this._currentBookDetailId) return;
        if (!await this.showConfirm('Kitabı Sil', 'Bu kitabı silmek istediğine emin misin?', '📚')) return;
        this.state.books = this.state.books.filter(b => b.id !== this._currentBookDetailId);
        this.save();
        this.closeModals();
        this.renderAll();
        this.showToast('Kitap silindi');
    },

    toggleBookFavorite() {
        const book = this.state.books.find(b => b.id === this._currentBookDetailId);
        if (book) {
            book.favorite = !book.favorite;
            this.save();
            this.showToast(book.favorite ? 'Favorilere eklendi' : 'Favorilerden çıkarıldı');
            const favBtn = document.getElementById('bookFavoriteBtn');
            if (favBtn) favBtn.innerText = book.favorite ? '❤️ Favoriden Çıkar' : '🤍 Favori';
            this.renderBooks();
        }
    },

    updateDailyGoal(val) {
        this.state.dailyPageGoal = parseInt(val) || 20;
        this.save();
        if (this._currentBookDetailId) this.openBookDetail(this._currentBookDetailId);
    },

    bindSwipeEvents() {
        // Swipe disabled to favor tab swiping
        return;
    },

    handleSwipeAction(id, type, direction) {
        if (direction === 'left') {
            if (type === 'movie') this.quickStatus(id, 'movie', 'watched');
            else if (type === 'series') this.quickStatus(id, 'series', 'completed');
            else if (type === 'book') this.quickBookStatus(id, 'read');
            this.showToast('İzlendi/Okundu olarak işaretlendi! ✅');
        } else {
            if (type === 'movie') this.toggleFavoriteFromGrid(id, 'movie');
            else if (type === 'series') this.toggleFavoriteFromGrid(id, 'series');
            else if (type === 'book') this.toggleBookFavGrid(id);
        }
    },

    renderCollections() {
        const list = document.getElementById('collectionsList');
        if (!list) return;

        if (!this.state.collections || this.state.collections.length === 0) {
            list.innerHTML = `
                <div class="empty-widget" style="text-align:center; padding:40px 20px;">
                    <div style="font-size:40px; margin-bottom:12px;">📂</div>
                    <div>Henüz koleksiyonun yok. Hemen bir tane oluştur!</div>
                </div>`;
            return;
        }

        list.innerHTML = this.state.collections.map(c => `
            <div class="collection-card" onclick="App.openCollectionDetail('${c.id}')">
                <div class="collection-title">${c.name}</div>
                <div class="collection-count">${c.items.length} içerik</div>
            </div>
        `).join('');
    },

    openNewCollectionModal() {
        const name = prompt('Koleksiyon adı:');
        if (name) {
            if (!this.state.collections) this.state.collections = [];
            const newColl = {
                id: Date.now().toString(),
                name: name,
                items: [], // {id, type}
                createdAt: Date.now()
            };
            this.state.collections.push(newColl);
            this.save();
            this.renderCollections();
            this.showToast('Koleksiyon oluşturuldu! 📂');
        }
    },

    openCollectionDetail(id) {
        const coll = this.state.collections.find(c => c.id === id);
        if (!coll) return;
        
        document.getElementById('collModalTitle').innerText = coll.name;
        const grid = document.getElementById('collItemsList');
        grid.innerHTML = '';

        if (coll.items.length === 0) {
            grid.innerHTML = '<div class="empty-widget" style="grid-column: 1/-1;">Bu liste henüz boş.</div>';
        } else {
            coll.items.forEach(itemRef => {
                let item;
                if (itemRef.type === 'movie') item = this.state.movies.find(x => x.id === itemRef.id);
                else if (itemRef.type === 'series') item = this.state.series.find(x => x.id === itemRef.id);
                else if (itemRef.type === 'book') item = this.state.books.find(x => x.id === itemRef.id);

                if (item) {
                    const card = document.createElement('div');
                    card.className = 'movie-card';
                    card.innerHTML = `
                        <div class="movie-poster">
                            <img src="${item.poster || item.cover || ''}" onerror="this.outerHTML='<div class=\\'movie-poster-placeholder\\'>🎬</div>'" />
                        </div>
                        <div class="movie-info">
                            <div class="movie-title">${item.title}</div>
                            <div class="movie-year">${item.year || ''}</div>
                        </div>
                    `;
                    card.onclick = () => {
                        this.closeCollModal();
                        if (itemRef.type === 'movie') this.openMovieDetail(item.id);
                        else if (itemRef.type === 'series') this.openSeriesDetail(item.id);
                        else if (itemRef.type === 'book') this.openBookDetail(item.id);
                    };
                    grid.appendChild(card);
                }
            });
        }
        document.getElementById('collectionDetailModal').classList.add('open');
    },

    showCollections() {
        this.switchTab('collections');
        this.renderCollections();
    },

    openCollPicker(itemId, type) {
        const modal = document.getElementById('collPickerModal');
        const body = document.getElementById('collPickerBody');
        if (!this.state.collections || this.state.collections.length === 0) {
            body.innerHTML = `
                <div style="text-align:center; padding:20px;">
                    <p style="font-size:13px; color:var(--text2); margin-bottom:12px;">Henüz bir listen yok.</p>
                    <button class="btn-primary" onclick="App.openNewCollectionModal()">+ Yeni Liste Oluştur</button>
                </div>`;
        } else {
            body.innerHTML = this.state.collections.map(c => `
                <div class="collection-card" onclick="App.addItemToCollection('${c.id}', '${itemId}', '${type}')">
                    <div class="collection-title">${c.name}</div>
                    <div class="collection-count">${c.items.length} içerik</div>
                </div>
            `).join('') + `<button class="btn-primary" onclick="App.openNewCollectionModal()" style="width:100%; margin-top:12px; background:var(--bg3);">+ Başka Liste Oluştur</button>`;
        }
        modal.classList.add('open');
    },

    addItemToCollection(collId, itemId, type) {
        const coll = this.state.collections.find(c => c.id === collId);
        if (coll) {
            if (coll.items.some(x => x.id === itemId)) {
                this.showToast('Bu içerik zaten listede var.');
            } else {
                coll.items.push({ id: itemId, type: type });
                this.save();
                this.showToast('Listeye eklendi! 📁');
                document.getElementById('collPickerModal').classList.remove('open');
                this.renderCollections();
            }
        }
    },

    closeCollModal() {
        document.getElementById('collectionDetailModal').classList.remove('open');
    },

    renderBooks() {
        const grid = document.getElementById('bookGrid');
        if (!grid) return;

        const si = document.getElementById('searchInput');
        const search = si ? si.value.trim().toLocaleLowerCase('tr') : '';
        const filterBtn = document.querySelector('#tab-books .filter-btn.active');
        const filter = filterBtn ? filterBtn.dataset.filter : 'all';
        const bs = document.getElementById('bookSort');
        const sort = bs ? bs.value : 'added';
        const bgf = document.getElementById('bookGenreFilter');
        const genreFilter = bgf ? bgf.value : 'all';

        let filtered = (this.state.books || []).filter(b => {
            if (search && !b.title.toLocaleLowerCase('tr').includes(search)) return false;
            if (filter === 'favorites') {
                if (!b.favorite) return false;
            } else if (filter !== 'all' && b.status !== filter) {
                return false;
            }
            if (genreFilter !== 'all' && (!b.genre || !b.genre.split(',').map(g => g.trim()).includes(genreFilter))) return false;
            return true;
        });

        filtered.sort((a, b) => {
            if (sort === 'added') return (b.createdAt || 0) - (a.createdAt || 0);
            if (sort === 'rating') return (b.rating || 0) - (a.rating || 0);
            if (sort === 'title') return a.title.localeCompare(b.title, 'tr');
            if (sort === 'year') return (parseInt(b.year) || 0) - (parseInt(a.year) || 0);
            return 0;
        });

        // Update genre dropdown
        const bookGenres = new Set();
        (this.state.books || []).forEach(b => {
            if (b.genre) b.genre.split(',').forEach(g => bookGenres.add(g.trim()));
        });
        const gSelect = document.getElementById('bookGenreFilter');
        if (gSelect) {
            const curVal = gSelect.value;
            gSelect.innerHTML = `<option value="all">Tüm Türler</option>` +
                Array.from(bookGenres).sort().map(g => `<option value="${g}">${g}</option>`).join('');
            if (Array.from(bookGenres).includes(curVal)) gSelect.value = curVal;
        }

        // Update book badge
        const readlistCount = (this.state.books || []).filter(b => b.status === 'readlist').length;
        const badge = document.getElementById('bookBadge');
        if (badge) badge.innerText = readlistCount > 0 ? readlistCount : '';

        if (filtered.length === 0) {
            if ((this.state.books || []).length === 0 && filter === 'all') {
                grid.innerHTML = `
                <div class="empty-state" id="bookEmpty">
                    <div class="empty-icon">📚</div>
                    <p>Henüz kitap eklenmedi</p>
                    <button class="btn-primary" id="addFirstBookBtn2">Kitap Ekle</button>
                </div>`;
                const btn2 = document.getElementById('addFirstBookBtn2');
                if (btn2) btn2.addEventListener('click', () => this.openBookModal());
            } else {
                grid.innerHTML = '<div class="empty-state"><p>Sonuç bulunamadı</p></div>';
            }
            grid.style.display = 'block';
            return;
        }

        grid.style.display = 'grid';
        grid.innerHTML = filtered.map(book => {
            let badge = '';
            if (book.status === 'read') badge = '<div class="movie-status-badge badge-watched">Okundu</div>';
            else if (book.status === 'readlist') badge = '<div class="movie-status-badge badge-watchlist">Okunacak</div>';
            else if (book.status === 'reading') badge = '<div class="movie-status-badge badge-watching">Okunuyor</div>';

            const starColor = this.getRatingColor(book.rating);
            const starHtml = book.rating ? `<div class="movie-rating" style="color:${starColor}">${'★'.repeat(book.rating)}<span style="color:var(--bg3)">${'★'.repeat(10 - book.rating)}</span></div>` : '';

            return `
            <div class="swipe-item" data-id="${book.id}" data-type="book">
                <div class="swipe-bg swipe-action-left"><span class="swipe-icon">✅</span></div>
                <div class="swipe-bg swipe-action-right"><span class="swipe-icon">❤️</span></div>
                <div class="swipe-item-content">
                    <div class="movie-card" onclick="App.openBookDetail('${book.id}')">
                        <div class="movie-poster">
                            ${(book.poster || book.cover) ? `<img src="${book.poster || book.cover}" loading="lazy" onerror="this.outerHTML='<div class=\\'movie-poster-placeholder\\'>📚</div>'" />` : `<div class="movie-poster-placeholder">📚</div>`}
                            ${badge}
                        </div>
                        <div class="movie-info">
                            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom:2px;">
                                <div class="movie-title" style="margin-bottom:0;">${book.title}</div>
                                <div onclick="event.stopPropagation(); App.toggleBookFavGrid('${book.id}')" style="font-size:16px; cursor:pointer; transition:transform 0.2s;" onmouseover="this.style.transform='scale(1.2)'" onmouseout="this.style.transform='scale(1)'">
                                    ${book.favorite ? '❤️' : '🤍'}
                                </div>
                            </div>
                            <div class="movie-year">${book.author || ''}${book.year ? ' · ' + book.year : ''}${book.pages ? ' · ' + book.pages + 'sf.' : ''}</div>
                            ${starHtml}
                        </div>
                    </div>
                </div>
            </div>`;
        }).join('');
        this.bindSwipeEvents();
    },

    toggleBookFavGrid(id) {
        const book = this.state.books.find(b => b.id === id);
        if (book) {
            book.favorite = !book.favorite;
            this.save();
            this.renderBooks();
            this.showToast(book.favorite ? 'Favorilere eklendi' : 'Favorilerden çıkarıldı');
        }
    },

    openAvatarModal() {
        const avatars = [
            '👤', '👨‍🚀', '👩‍🚀', '🐱', '🐶', '🦊', '🦁', '🐸', '🐼', '🐨',
            '🐲', '🤖', '👻', '👾', '👽', '🎃', '🧙‍♂️', '🧛‍♂️', '🦸‍♂️', '🥷',
            '🎨', '🎬', '🍿', '🎸', '🎮', '⚽', '🏀', '🍕', '🌮', '🍩',
            '🌈', '🔥', '✨', '💎', '🍀', '🦋', '🐳', '🦉', '🦄', '⚡'
        ];
        const grid = document.getElementById('avatarOptionsGrid');
        if (grid) {
            grid.innerHTML = avatars.map(a => `
                <div class="avatar-option" onclick="App.selectAvatar('${a}')" style="font-size:32px; padding:8px; border-radius:12px; cursor:pointer; text-align:center; transition:0.2s; border:1px solid var(--border); background:var(--bg2);">
                    ${a}
                </div>
            `).join('');
        }
        document.getElementById('avatarModal').classList.add('open');
        this.pushHistoryState();
    },

    async selectAvatar(emoji) {
        if (!this.currentUser) return;
        
        try {
            // Update UI immediately
            const pad = document.getElementById('profileAvatarDisplay');
            if (pad) pad.innerText = emoji;
            
            // Update Firestore 'users' collection
            if (db) {
                await db.collection('users').doc(this.currentUser).update({ avatar: emoji });
            }
            
            // Update local state
            if (this.state.currentUserData) {
                this.state.currentUserData.avatar = emoji;
            }
            
            this.showToast('Profil fotoğrafı güncellendi! ✨');
            document.getElementById('avatarModal').classList.remove('open');
            
            // Re-render everything to reflect change (e.g. in social/friends lists if they use it)
            this.renderAll();
        } catch (e) {
            console.error('Avatar update error:', e);
            this.showToast('Hata: Fotoğraf güncellenemedi', true);
        }
    },
    initTabSwipe() {
        let startX = 0;
        let startY = 0;
        let startTarget = null;
        const main = document.body;
        main.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            startTarget = e.target;
        }, {passive: true});
        main.addEventListener('touchend', (e) => {
            if (document.querySelector('.modal-overlay.open')) return;

            // Filter bar, discover carousel veya yatay kaydırılabilir alanlardan başlayan swipe'ları yoksay
            const scrollableParent = startTarget && startTarget.closest(
                '.filter-bar, .discover-carousel, .tmdb-results, [style*="overflow-x"]'
            );
            if (scrollableParent) return;

            const endX = e.changedTouches[0].clientX;
            const endY = e.changedTouches[0].clientY;
            const diffX = endX - startX;
            const diffY = endY - startY;
            if (Math.abs(diffX) > 80 && Math.abs(diffY) < 60) {
                let tabs = ['dashboard', 'movies', 'series', 'books', 'social', 'profile'];
                const currentTab = this.currentTab || 'dashboard';
                let currentIndex = tabs.indexOf(currentTab);
                if (diffX > 0 && currentIndex > 0) this.switchTab(tabs[currentIndex - 1]);
                else if (diffX < 0 && currentIndex < tabs.length - 1) this.switchTab(tabs[currentIndex + 1]);
            }
        }, {passive: true});
    },

    initHistory() {
        history.replaceState({ type: 'main' }, '');
        window.addEventListener('popstate', (e) => {
            this.handleBackAction(e.state);
        });
    },

    pushHistoryState(type = 'modal') {
        history.pushState({ type }, '');
    },


    // ════════════════════════════════════════════════════════
    //  BİLDİRİM SİSTEMİ
    // ════════════════════════════════════════════════════════

    initNotifications() {
        // Daha önce reddedildiyse paneli gösterme
        if (localStorage.getItem('cinetrack_notif_dismissed') === 'true') return;
        if (!('Notification' in window)) return;

        // Zaten izin verilmişse panel gösterme ama izni kaydet
        if (Notification.permission === 'granted') {
            this._notifGranted = true;
            return;
        }
        if (Notification.permission === 'denied') return;

        // Kullanıcı giriş yaptıktan 3 saniye sonra paneli göster
        const tryShow = () => {
            if (this.currentUser) {
                setTimeout(() => this._showNotifPanel(), 3000);
            } else {
                setTimeout(tryShow, 1000);
            }
        };
        tryShow();
    },

    _showNotifPanel() {
        const panel = document.getElementById('notifPermissionPanel');
        if (!panel) return;

        panel.style.display = 'block';
        // Küçük gecikme sonra visible sınıfını ekle (CSS transition için)
        requestAnimationFrame(() => {
            requestAnimationFrame(() => { panel.classList.add('visible'); });
        });

        document.getElementById('notifAllowBtn').onclick = async () => {
            panel.classList.remove('visible');
            setTimeout(() => { panel.style.display = 'none'; }, 400);
            const perm = await Notification.requestPermission();
            if (perm === 'granted') {
                this._notifGranted = true;
                this.showToast('🔔 Bildirimler açık! Mesaj geldiğinde haberdar olacaksın.');
            }
        };

        document.getElementById('notifDenyBtn').onclick = () => {
            panel.classList.remove('visible');
            setTimeout(() => { panel.style.display = 'none'; }, 400);
            localStorage.setItem('cinetrack_notif_dismissed', 'true');
        };
    },

    showMessageNotification(avatar, name, text, time, senderHandle) {
        let displayBody = text;
        if (text.startsWith('[SHARE:') && text.endsWith(']')) {
            const raw = text.slice(7, -1);
            if (raw.startsWith('{')) {
                try {
                    const data = JSON.parse(raw);
                    displayBody = `🎬 [Paylaşım] ${data.title}`;
                } catch(e) {
                    displayBody = `🎬 [Paylaşım]`;
                }
            } else {
                const parts = raw.split(':');
                displayBody = `🎬 [Paylaşım] ${parts[2]}`;
            }
        }

        // Uygulama ön planda ve chat açıkken sistem bildirimi gönderme,
        // ama in-app toast'u her durumda göster
        this._showInAppMsgToast(avatar, name, displayBody, time, senderHandle);

        // Sistem bildirimi: sadece sayfa arka plandaysa veya chat kapalıysa
        const chatOpen = document.getElementById('chatModal')?.classList.contains('open');
        if (!chatOpen && Notification.permission === 'granted') {
            const notif = new Notification(`${avatar} ${name}`, {
                body: `${time}  •  ${displayBody}`,
                icon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgcng9IjI0IiBmaWxsPSIjYTg1NWY3Ii8+PHRleHQgeT0iNjAiIHg9IjUwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LXNpemU9IjU1IiBmaWxsPSJ3aGl0ZSI+8J+OvzwvdGV4dD48L3N2Zz4=',
                tag: `cinetrack-msg-${senderHandle}`,
                renotify: true,
                silent: false
            });
            notif.onclick = () => {
                window.focus();
                notif.close();
                if (senderHandle) this.openChat(senderHandle);
            };
        }
    },

    _inAppToastTimeout: null,
    _showInAppMsgToast(avatar, name, text, time, senderHandle) {
        // Mevcut toast'u temizle
        let toast = document.getElementById('msgNotifToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'msgNotifToast';
            toast.className = 'msg-notif-toast';
            document.body.appendChild(toast);
        }

        toast.innerHTML = `
            <div class="msg-notif-avatar">${avatar}</div>
            <div class="msg-notif-content">
                <div class="msg-notif-app-label">CineTrack · Mesaj</div>
                <div class="msg-notif-header">
                    <span class="msg-notif-name">${name}</span>
                    <span class="msg-notif-time">${time}</span>
                </div>
                <div class="msg-notif-text">${text}</div>
            </div>
        `;

        toast.onclick = () => {
            toast.classList.remove('show');
            if (senderHandle) this.openChat(senderHandle);
        };

        // Önce gizle, sonra göster (önceki animasyonu sıfırlamak için)
        toast.classList.remove('show');
        clearTimeout(this._inAppToastTimeout);
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                toast.classList.add('show');
                this._inAppToastTimeout = setTimeout(() => {
                    toast.classList.remove('show');
                }, 5000);
            });
        });
    },

    handleBackAction(state) {
        const openModals = document.querySelectorAll('.modal-overlay.open');
        if (openModals.length > 0) {
            this.closeModals(true, false);
        } else if (this.currentTab !== 'dashboard') {
            this.switchTab('dashboard');
        } else {
            if (this._backPressedOnce) {
                // Let history pop normally
            } else {
                this._backPressedOnce = true;
                this.showToast('Çıkmak için tekrar basın');
                history.pushState({ type: 'main' }, '');
                setTimeout(() => { this._backPressedOnce = false; }, 2000);
            }
        }
    }
});

document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
