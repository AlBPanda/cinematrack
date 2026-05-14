// app.js

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

const TMDB_API_KEY = '92b418e837b833be308bbfb1fb2aca1e';

const App = {
    currentUser: null,
    state: {
        movies: [],
        series: [],
        goal: 5,
        goalCurrent: 0,
        goalWeek: '',
        streak: 0,
        lastWatchDate: null,
        globalUsers: [],
        currentUserData: null,
        hiddenChats: []
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
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW fail', err));
        }

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
            if (!handle || !password) return alert('Kullanıcı adı ve şifre gereklidir.');

            this.setAuthLoading(true, 'Giriş yapılıyor...');
            try {
                await auth.signInWithEmailAndPassword(this.handleToEmail(handle), password);
                // onAuthStateChanged will handle the rest
            } catch (err) {
                this.setAuthLoading(false);
                if (err.code === 'auth/user-not-found') return alert('Kullanıcı bulunamadı. Lütfen kayıt olun.');
                if (err.code === 'auth/wrong-password') return alert('Hatalı şifre.');
                alert('Giriş hatası: ' + err.message);
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

                if (!name || !handle || !password) return alert('Ad, Kullanıcı Adı ve Şifre zorunludur.');
                if (password.length < 6) return alert('Şifre en az 6 karakter olmalıdır.');

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
                    if (err.code === 'auth/email-already-in-use') return alert('Bu kullanıcı adı zaten alınmış.');
                    alert('Kayıt hatası: ' + err.message);
                }
            });
        }

        // FIREBASE AUTH STATE OBSERVER
        if (auth) {
            auth.onAuthStateChanged(async (firebaseUser) => {
                if (firebaseUser) {
                    // Extract handle from email
                    const handle = firebaseUser.email.replace('@cinetrack.app', '');
                    await this.login(handle, firebaseUser);
                    document.getElementById('splash').classList.add('hidden');
                    document.getElementById('loginScreen').classList.add('hidden');
                    document.getElementById('app').classList.remove('hidden');
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

    async logout() {
        if (auth) await auth.signOut();
        this.currentUser = null;
        this.state = { movies: [], series: [], goal: 5, goalCurrent: 0, goalWeek: '', streak: 0, lastWatchDate: null, globalUsers: [], currentUserData: null, following: [], followers: [], followRequests: [], sentRequests: [], hiddenChats: [] };
        this.eventsBound = false;
        document.getElementById('app').classList.add('hidden');
        document.getElementById('loginScreen').classList.remove('hidden');
    },

    async login(username, firebaseUser = null) {
        this.currentUser = username.toLowerCase();

        // Load user profile from Firestore
        if (db) {
            try {
                const snap = await db.collection('users').doc(this.currentUser).get();
                if (snap.exists) {
                    const data = snap.data();
                    this.state.currentUserData = data;
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

        document.getElementById('userNameDisplay').innerText = userRecord.name || this.currentUser;
        
        const profileUserName = document.getElementById('profileUserNameFull');
        if (profileUserName) {
            profileUserName.innerHTML = `${userRecord.name || this.currentUser} <span style="font-size:14px; opacity:0.8; font-weight:normal;">@${userRecord.handle}</span>`;
        }

        // Easter Egg: 'deniz'
        const denizThemeBtn = document.getElementById('themeDeniz');
        if (denizThemeBtn) {
            denizThemeBtn.style.display = this.currentUser === 'deniz' ? 'flex' : 'none';
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
                } else {
                    // First login — check for legacy localStorage data to migrate
                    const legacyMovies = localStorage.getItem(`cinetrack_${this.currentUser}_movies`);
                    if (legacyMovies) {
                        this.state.movies      = JSON.parse(legacyMovies) || [];
                        this.state.series      = JSON.parse(localStorage.getItem(`cinetrack_${this.currentUser}_series`)) || [];
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
                        this.state.following      = d.following      || [];
                        this.state.followers      = d.followers      || [];
                        this.state.followRequests = d.followRequests || [];
                        this.state.sentRequests   = d.sentRequests   || [];
                        this.state.hiddenChats    = d.hiddenChats    || [];

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
        } else if (this.currentUser === 'kermode') {
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
        }
    },

    triggerDenizEasterEgg() {
        document.getElementById('themeDeniz').style.display = 'flex';
        
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
        if (auth) await auth.signOut();
        this.currentUser = null;
        this.state = { movies: [], series: [], goal: 5, goalCurrent: 0, goalWeek: '', streak: 0, lastWatchDate: null, globalUsers: [], currentUserData: null, following: [], followers: [], followRequests: [], sentRequests: [], hiddenChats: [] };
        this.eventsBound = false;
        document.getElementById('app').classList.add('hidden');
        document.getElementById('loginScreen').classList.remove('hidden');
    },

    save() {
        if (!this.currentUser) return;
        const payload = {
            movies: this.state.movies,
            series: this.state.series,
            goal: this.state.goal,
            goalCurrent: this.state.goalCurrent,
            goalWeek: this.state.goalWeek,
            streak: this.state.streak,
            lastWatchDate: this.state.lastWatchDate || null,
            following: this.state.following,
            hiddenChats: this.state.hiddenChats || []
        };
        if (db) {
            db.collection('userData').doc(this.currentUser).set(payload, { merge: true })
              .catch(e => console.warn('Firestore save error:', e));
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
        document.getElementById('searchToggleBtn').addEventListener('click', () => {
            document.getElementById('searchBarWrap').classList.toggle('open');
            document.getElementById('searchInput').focus();
        });
        document.getElementById('searchClearBtn').addEventListener('click', () => {
            document.getElementById('searchInput').value = '';
            document.getElementById('globalSearchResults').classList.add('hidden');
            this.renderMovies();
            this.renderSeries();
        });
        document.getElementById('searchInput').addEventListener('input', (e) => {
            const query = e.target.value.trim().toLocaleLowerCase('tr');
            const resContainer = document.getElementById('globalSearchResults');
            
            if (query.length < 2) {
                resContainer.classList.add('hidden');
                this.renderMovies();
                this.renderSeries();
                return;
            }

            // Global Search Results
            const matchedMovies = this.state.movies.filter(m => m.title.toLocaleLowerCase('tr').includes(query));
            const matchedSeries = this.state.series.filter(s => s.title.toLocaleLowerCase('tr').includes(query));
            
            let html = '';
            
            matchedMovies.forEach(m => {
                const poster = m.poster ? `<img src="${m.poster}" style="width:100%;height:100%;object-fit:cover;border-radius:6px;"/>` : '🎬';
                html += `
                    <div class="tmdb-item" onclick="document.getElementById('globalSearchResults').classList.add('hidden'); App.openMovieDetail('${m.id}')">
                        <div class="tmdb-poster">${poster}</div>
                        <div class="tmdb-info">
                            <div class="tmdb-title">${m.title}</div>
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
                            <div class="tmdb-title">${s.title}</div>
                            <div class="tmdb-year">📺 Dizi ${s.year ? '- '+s.year : ''}</div>
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
        });

        // Add Modal
        document.getElementById('addBtn').addEventListener('click', () => this.openAddModal('movie'));
        document.getElementById('addFirstMovieBtn').addEventListener('click', () => {
            this.switchTab('movies');
            this.openAddModal('movie');
        });
        document.getElementById('addFirstSeriesBtn').addEventListener('click', () => {
            this.switchTab('series');
            this.openAddModal('series');
        });
        document.getElementById('modalCloseBtn').addEventListener('click', () => this.closeModals());
        document.getElementById('modalCancelBtn').addEventListener('click', () => this.closeModals());

        document.querySelectorAll('.type-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (this.editingId) return; // Prevent changing type while editing
                const type = e.currentTarget.dataset.type;
                document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                
                if (type === 'movie') {
                    document.getElementById('movieFields').classList.remove('hidden');
                    document.getElementById('seriesFields').classList.add('hidden');
                } else {
                    document.getElementById('movieFields').classList.add('hidden');
                    document.getElementById('seriesFields').classList.remove('hidden');
                }
                
                // Re-trigger TMDB search with the new type
                const currentTitle = document.getElementById('formTitle').value.trim();
                if (currentTitle.length >= 2) {
                    this.searchTMDB(currentTitle);
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

        // TMDB Search (Real-time) on formTitle
        let tmdbTimeout = null;
        document.getElementById('formTitle').addEventListener('input', (e) => {
            clearTimeout(tmdbTimeout);
            const val = e.target.value.trim();
            if (val.length < 2) {
                document.getElementById('tmdbResults').classList.add('hidden');
                return;
            }
            tmdbTimeout = setTimeout(() => this.searchTMDB(val), 500);
        });

        // Save Form
        document.getElementById('modalSaveBtn').addEventListener('click', () => this.saveForm());

        // Detail Modals
        document.getElementById('movieDetailCloseBtn').addEventListener('click', () => this.closeModals());
        document.getElementById('seriesDetailCloseBtn').addEventListener('click', () => this.closeModals());

        if(document.getElementById('shareCloseBtn')) document.getElementById('shareCloseBtn').addEventListener('click', () => this.closeModals());
        if(document.getElementById('wrappedCloseBtn')) document.getElementById('wrappedCloseBtn').addEventListener('click', () => this.closeModals());
        if(document.getElementById('btnWrapped')) document.getElementById('btnWrapped').addEventListener('click', () => this.showWrapped());
        if(document.getElementById('allBadgesCloseBtn')) document.getElementById('allBadgesCloseBtn').addEventListener('click', () => this.closeModals());
        if(document.getElementById('btnAllBadges')) document.getElementById('btnAllBadges').addEventListener('click', () => {
            this.renderAllBadgesModal();
            document.getElementById('allBadgesModal').classList.add('open');
        });
        if(document.getElementById('movieShareBtn')) document.getElementById('movieShareBtn').addEventListener('click', () => this.openShareCard('movie'));

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
        if (document.getElementById('socialSearchInput')) {
            const searchInput = document.getElementById('socialSearchInput');
            searchInput.addEventListener('input', (e) => {
                const q = e.target.value.trim();
                if (q.length === 0) {
                    document.getElementById('userSearchResults').style.display = 'none';
                } else {
                    this.renderUserSearch(q);
                }
            });
            searchInput.addEventListener('focus', (e) => {
                if (e.target.value.trim()) this.renderUserSearch(e.target.value.trim());
            });
            document.addEventListener('click', (e) => {
                if (!e.target.closest('#tab-social .search-bar') && !e.target.closest('#userSearchResults')) {
                    const r = document.getElementById('userSearchResults');
                    if (r) r.style.display = 'none';
                }
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
        if (document.getElementById('watchPartyCloseBtn')) document.getElementById('watchPartyCloseBtn').addEventListener('click', () => this._closeWpModal());
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
        this.currentTab = tab;
        document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
        document.querySelector(`.nav-item[data-tab="${tab}"]`).classList.add('active');
        
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.getElementById(`tab-${tab}`).classList.add('active');

        if (tab === 'dashboard') this.renderDashboard();
        if (tab === 'movies') this.renderMovies();
        if (tab === 'series') this.renderSeries();
        if (tab === 'social') this.renderSocialTab();
        // Profile tab doesn't need specific render logic right now
    },

    // Star rating was removed from the add modal

    async searchTMDB(query) {
        if (!query) return;

        const resultsContainer = document.getElementById('tmdbResults');
        resultsContainer.classList.remove('hidden');
        resultsContainer.innerHTML = '<div class="tmdb-loading">Aranıyor...</div>';

        const type = document.querySelector('.type-btn.active').dataset.type;
        const endpoint = type === 'movie' ? 'movie' : 'tv';
        const userLang = navigator.language || 'tr-TR';

        try {
            const res = await fetch(`https://api.themoviedb.org/3/search/${endpoint}?api_key=${TMDB_API_KEY}&language=${userLang}&query=${encodeURIComponent(query)}`);
            const data = await res.json();
            
            if (data.results && data.results.length > 0) {
                resultsContainer.innerHTML = data.results.slice(0, 10).map(item => {
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
        const userLang = navigator.language || 'tr-TR';

        try {
            // Ana detay + IMDb ID'sini aynı anda çek
            const [detailRes, externalRes] = await Promise.all([
                fetch(`https://api.themoviedb.org/3/${endpoint}/${id}?api_key=${TMDB_API_KEY}&language=${userLang}&append_to_response=credits`),
                fetch(`https://api.themoviedb.org/3/${endpoint}/${id}/external_ids?api_key=${TMDB_API_KEY}`)
            ]);
            const data = await detailRes.json();
            const extData = await externalRes.json();

            // IMDb ID'yi sakla
            this.tempImdbId = extData.imdb_id || null;

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
        this.tempSeasonsData = null;
        this.tempImdbId = null;

        document.querySelector(`.type-btn[data-type="${type}"]`).click();
        
        document.getElementById('addModal').classList.add('open');
    },

    openEditModal(type) {
        const item = type === 'movie' 
            ? this.state.movies.find(m => m.id === this.editingId)
            : this.state.series.find(s => s.id === this.editingId);
        
        if (!item) return;

        this.editingType = type;
        document.getElementById('modalTitle').innerText = 'Düzenle';
        document.getElementById('typeSelectorWrap').classList.add('hidden'); // Hide type switcher
        document.getElementById('tmdbResults').classList.add('hidden');
        
        document.getElementById('formTitle').value = item.title;
        document.getElementById('formYear').value = item.year || '';
        document.getElementById('formGenre').value = item.genre || '';
        document.getElementById('formPoster').value = item.poster || '';
        document.getElementById('formNote').value = item.note || '';
        document.getElementById('formPlatform').value = item.platform || '';

        if (type === 'movie') {
            document.getElementById('movieFields').classList.remove('hidden');
            document.getElementById('seriesFields').classList.add('hidden');
            document.getElementById('formMovieStatus').value = item.status;
            document.getElementById('formDuration').value = item.duration || '';
        } else {
            document.getElementById('movieFields').classList.add('hidden');
            document.getElementById('seriesFields').classList.remove('hidden');
            document.getElementById('formSeriesStatus').value = item.status;
            document.getElementById('formSeasons').value = item.seasons || 1;
            document.getElementById('formEpisodes').value = item.episodes || 1;
        }

        this.closeModals(false); // Close details modal without resetting edit state
        document.getElementById('addModal').classList.add('open');
    },

    closeModals(resetEditing = true) {
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('open'));
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
            const exists = type === 'movie' 
                ? this.state.movies.some(m => m.title.toLowerCase() === lowerTitle)
                : this.state.series.some(s => s.title.toLowerCase() === lowerTitle);
                
            if (exists) {
                return this.showToast('Bu yapım zaten kütüphanende ekli!', true);
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
        } else {
            const status = document.getElementById('formSeriesStatus').value;
            const seasons = parseInt(document.getElementById('formSeasons').value) || 1;
            const episodes = parseInt(document.getElementById('formEpisodes').value) || 1;
            const existing = isEdit ? this.state.series.find(s => s.id === this.editingId) : null;

            const newItem = {
                ...baseItem,
                type: 'series',
                status, seasons, episodes,
                seasonsData: this.tempSeasonsData || (existing ? existing.seasonsData : null),
                rating: existing ? existing.rating : 0
            };

            if (isEdit) {
                const idx = this.state.series.findIndex(s => s.id === this.editingId);
                if (idx > -1) {
                    if (status === 'completed') {
                        newItem.watchedEps = this.generateAllEps(seasons, episodes, newItem.seasonsData);
                    } else {
                        newItem.watchedEps = existing.watchedEps || [];
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
        }

        this.save();
        this.closeModals();
        this.renderAll();
        this.showToast(isEdit ? 'Güncellendi' : 'Eklendi');
    },

    deleteItem(type) {
        if (!confirm('Silmek istediğine emin misin?')) return;

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
        this.updateBadges();
        this.updateGenreDropdowns();
        this.renderDashboard();
        this.renderMovies();
        this.renderSeries();
        this.renderProfileStats();
    },

    renderProfileStats() {
        // Badges & Streak
        document.getElementById('statStreak').innerHTML = `🔥 ${this.state.streak}`;
        
        if (document.getElementById('statFollowing')) {
            document.getElementById('statFollowing').innerText = (this.state.following || []).length;
        }
        if (document.getElementById('statFollowers')) {
            document.getElementById('statFollowers').innerText = (this.state.followers || []).length;
        }

        // Kütüphane İstatistikleri (Profile Tab)
        if (document.getElementById('statMoviesWatched')) {
            document.getElementById('statMoviesWatched').innerText = this.state.movies.filter(m => m.status === 'watched').length;
        }
        if (document.getElementById('statMoviesWatchlist')) {
            document.getElementById('statMoviesWatchlist').innerText = this.state.movies.filter(m => m.status === 'watchlist').length;
        }
        if (document.getElementById('statSeriesTotal')) {
            document.getElementById('statSeriesTotal').innerText = this.state.series.length;
        }
        if (document.getElementById('statEpsWatched')) {
            let totalEps = 0;
            this.state.series.forEach(s => {
                if (s.watchedEps) totalEps += s.watchedEps.length;
            });
            document.getElementById('statEpsWatched').innerText = totalEps;
        }
        
        let earnedBadges = [];
        if (this.state.movies.length > 0 || this.state.series.length > 0) {
            earnedBadges.push({ icon: '👶', name: 'Yeni Kan', desc: 'İlk içerik eklendi' });
        }
        
        const watchedMovies = this.state.movies.filter(m => m.status === 'watched').length;
        if (watchedMovies >= 10) {
            earnedBadges.push({ icon: '🍿', name: 'Sinema Kurdu', desc: '10 film izlendi' });
        } else if (watchedMovies >= 50) {
            earnedBadges.push({ icon: '👑', name: 'Film Gurmesi', desc: '50 film izlendi' });
        }

        let totalEps = 0;
        this.state.series.forEach(s => { if (s.watchedEps) totalEps += s.watchedEps.length; });
        if (totalEps >= 20) {
            earnedBadges.push({ icon: '📺', name: 'Dizi Kolik', desc: '20 bölüm izlendi' });
        }

        document.getElementById('statBadgeCount').innerText = earnedBadges.length;

        const maxDisplayBadges = earnedBadges.slice(0, 3);
        const badgesList = document.getElementById('badgesList');
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

        // Chart.js (Genre Distribution)
        const ctx = document.getElementById('genreChart');
        if (!ctx) return;
        
        const genreCounts = {};
        [...this.state.movies, ...this.state.series].forEach(item => {
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
        
        if (sortedGenres.length === 0) {
            // Nothing to show yet
            return;
        }

        if (this.genreChartInstance) {
            this.genreChartInstance.destroy();
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
        const seriesWatching = this.state.series.filter(s => s.status === 'watching').length;
        
        document.getElementById('movieBadge').innerText = movieWatchlist > 0 ? movieWatchlist : '';
        document.getElementById('seriesBadge').innerText = seriesWatching > 0 ? seriesWatching : '';
    },

    renderDashboard() {
        // Stats
        document.getElementById('statMoviesWatched').innerText = this.state.movies.filter(m => m.status === 'watched').length;
        document.getElementById('statMoviesWatchlist').innerText = this.state.movies.filter(m => m.status === 'watchlist').length;
        document.getElementById('statSeriesTotal').innerText = this.state.series.length;
        
        let totalEps = 0;
        this.state.series.forEach(s => {
            if (s.watchedEps) totalEps += s.watchedEps.length;
        });
        document.getElementById('statEpsWatched').innerText = totalEps;

        // Continue
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

        // Recent
        const recentList = document.getElementById('recentList');
        const allItems = [...this.state.movies, ...this.state.series].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5);
        if (allItems.length === 0) {
            recentList.innerHTML = '<div class="empty-widget">Henüz içerik yok</div>';
        } else {
            recentList.innerHTML = allItems.map(item => `
                <div class="recent-item" onclick="App.${item.type === 'movie' ? 'openMovieDetail' : 'openSeriesDetail'}('${item.id}')">
                    <div class="recent-type">${item.type === 'movie' ? '🎬' : '📺'}</div>
                    <div class="recent-info">
                        <div class="recent-title">${item.title}</div>
                        <div class="recent-meta">${item.type === 'movie' ? 'Film' : 'Dizi'} • ${new Date(item.createdAt).toLocaleDateString()}</div>
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
        discoverWidget.classList.remove('hidden');
        if (document.getElementById('discoverCarousel').innerHTML.includes('Yükleniyor')) {
            this.loadDiscoverCarousel();
        }

        // Goal
        document.getElementById('goalInput').value = this.state.goal;
        document.getElementById('goalTarget').innerText = this.state.goal;
        document.getElementById('goalCurrent').innerText = this.state.goalCurrent;
        
        const goalPerc = Math.min(100, Math.round((this.state.goalCurrent / this.state.goal) * 100));
        const offset = 314 - (314 * goalPerc) / 100;
        document.getElementById('goalRing').style.strokeDashoffset = offset;

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

    renderMovies() {
        const grid = document.getElementById('movieGrid');
        const search = document.getElementById('searchInput').value.trim().toLocaleLowerCase('tr');
        const filterBtn = document.querySelector('#tab-movies .filter-btn.active');
        const filter = filterBtn ? filterBtn.dataset.filter : 'all';
        const sort = document.getElementById('movieSort').value;
        const genreFilter = document.getElementById('movieGenreFilter') ? document.getElementById('movieGenreFilter').value : 'all';

        let filtered = this.state.movies.filter(m => {
            if (search && !m.title.toLocaleLowerCase('tr').includes(search)) return false;
            if (filter !== 'all' && m.status !== filter) return false;
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
                `;
            }).join('');
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
        const search = document.getElementById('searchInput').value.trim().toLocaleLowerCase('tr');
        const filterBtn = document.querySelector('#tab-series .filter-btn.active');
        const filter = filterBtn ? filterBtn.dataset.filter : 'all';
        const sort = document.getElementById('seriesSort').value;
        const genreFilter = document.getElementById('seriesGenreFilter') ? document.getElementById('seriesGenreFilter').value : 'all';

        let filtered = this.state.series.filter(s => {
            if (search && !s.title.toLocaleLowerCase('tr').includes(search)) return false;
            if (filter !== 'all' && s.status !== filter) return false;
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
                else if (s.status === 'completed') statusTag = '<span class="series-status-tag status-completed">Tamamlandı</span>';
                else if (s.status === 'paused') statusTag = '<span class="series-status-tag status-paused">Durduruldu</span>';
                else if (s.status === 'watchlist') statusTag = '<span class="series-status-tag status-watchlist">İzlenecek</span>';

                const starColor = this.getRatingColor(s.rating);
                const starHtml = s.rating ? `<div class="series-rating" style="color:${starColor}">${'★'.repeat(s.rating)}<span style="color:var(--bg3)">${'★'.repeat(10-s.rating)}</span></div>` : '';
                let globalBadge = s.globalRating ? `<div class="global-rating-badge">⭐ ${s.globalRating}</div>` : '';
                let mustWatchBadge = s.rating >= 9 ? `<div class="must-watch-badge">✨ Başyapıt</div>` : '';
                let platformBadge = this.getPlatformBadge(s.platform);

                return `
                <div class="series-card" onclick="App.openSeriesDetail('${s.id}')">
                    <div class="series-thumb">
                        ${s.poster ? `<img src="${s.poster}" loading="lazy"/>` : '<div class="series-poster-placeholder">📺</div>'}
                        ${globalBadge}
                        ${mustWatchBadge}
                        ${statusTag}
                    </div>
                    <div class="series-meta">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom: 2px;">
                            <div class="series-title" style="margin-bottom:0;">${s.title} ${platformBadge}</div>
                            <div onclick="event.stopPropagation(); App.toggleFavoriteFromGrid('${s.id}', 'series')" style="font-size: 16px; cursor: pointer; transition: transform 0.2s; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));" onmouseover="this.style.transform='scale(1.2)'" onmouseout="this.style.transform='scale(1)'">
                                ${s.favorite ? '❤️' : '🤍'}
                            </div>
                        </div>
                        <div class="series-year">${s.year || ''} ${s.genre ? `• ${s.genre}` : ''}</div>
                        ${starHtml}
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
                `;
            }).join('');
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

    openMovieDetail(id) {
        const m = this.state.movies.find(x => x.id === id);
        if (!m) return;
        
        this.editingId = id;
        
        let starsInteractive = `<div class="interactive-stars" style="margin-top: 10px; display: flex; align-items: center; justify-content: center; gap: 4px;">`;
        for (let i=1; i<=10; i++) {
            starsInteractive += `<span style="font-size: 28px; cursor: pointer; transition: 0.2s; color: ${i <= (m.rating || 0) ? this.getRatingColor(m.rating) : 'var(--bg3)'}" onclick="event.stopPropagation(); App.quickRate('${m.id}', 'movie', ${i})">★</span>`;
        }
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
        }
        document.getElementById('movieDetailModal').classList.add('open');
    },

    openSeriesDetail(id) {
        const s = this.state.series.find(x => x.id === id);
        if (!s) return;
        
        this.editingId = id;
        
        let seasonsHtml = '';
        
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

        let starsInteractive = `<div class="interactive-stars" style="margin-top: 10px; display: flex; align-items: center; justify-content: center; gap: 4px;">`;
        for (let i=1; i<=10; i++) {
            starsInteractive += `<span style="font-size: 28px; cursor: pointer; transition: 0.2s; color: ${i <= (s.rating || 0) ? this.getRatingColor(s.rating) : 'var(--bg3)'}" onclick="event.stopPropagation(); App.quickRate('${s.id}', 'series', ${i})">★</span>`;
        }
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
            <div class="detail-seasons">
                <h3>Bölümler</h3>
                ${seasonsHtml}
            </div>
        `;
        
        document.getElementById('seriesDetailBody').innerHTML = body;
        const favBtn = document.getElementById('seriesFavoriteBtn');
        if (favBtn) {
            favBtn.innerText = s.favorite ? '❤️ Favoriden Çıkar' : '🤍 Favoriye Ekle';
        }
        document.getElementById('seriesDetailModal').classList.add('open');
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
        const allPossibleBadges = [
            { id: 'b1', icon: '👶', name: 'Yeni Kan', desc: 'İlk içerik eklendi' },
            { id: 'b2', icon: '🍿', name: 'Sinema Kurdu', desc: '10 film izlendi' },
            { id: 'b3', icon: '👑', name: 'Film Gurmesi', desc: '50 film izlendi' },
            { id: 'b4', icon: '📺', name: 'Dizi Kolik', desc: '20 bölüm izlendi' },
            { id: 'b5', icon: '⭐', name: 'Eleştirmen', desc: '10 yapıma puan verildi' },
            { id: 'b6', icon: '🔥', name: 'İstikrarlı', desc: '7 günlük giriş serisi' }
        ];

        const watchedMovies = this.state.movies.filter(m => m.status === 'watched').length;
        let totalEps = 0;
        this.state.series.forEach(s => { if (s.watchedEps) totalEps += s.watchedEps.length; });
        const ratedCount = [...this.state.movies, ...this.state.series].filter(x => x.rating > 0).length;

        const earnedIds = new Set();
        if (this.state.movies.length > 0 || this.state.series.length > 0) earnedIds.add('b1');
        if (watchedMovies >= 10) earnedIds.add('b2');
        if (watchedMovies >= 50) earnedIds.add('b3');
        if (totalEps >= 20) earnedIds.add('b4');
        if (ratedCount >= 10) earnedIds.add('b5');
        if (this.state.streak >= 7) earnedIds.add('b6');

        const grid = document.getElementById('allBadgesGrid');
        grid.innerHTML = allPossibleBadges.map(b => {
            const isEarned = earnedIds.has(b.id);
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
        
        const item = type === 'movie' 
            ? this.state.movies.find(m => m.id === this.editingId)
            : this.state.series.find(s => s.id === this.editingId);
            
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

        document.getElementById('shareModal').classList.add('open');
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

            return `
            <div style="display:flex; align-items:center; gap:12px; padding:12px 16px; border-bottom:1px solid var(--border); cursor:pointer;"
                 onmouseenter="this.style.background='var(--bg3)'" onmouseleave="this.style.background='transparent'">
                <div style="font-size:28px; flex-shrink:0;">${u.avatar || '👤'}</div>
                <div style="flex:1; min-width:0;">
                    <div style="font-size:14px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${u.name}</div>
                    <div style="font-size:12px; color:var(--text2);">@${u.handle}</div>
                </div>
                <div style="display:flex; gap:8px; flex-shrink:0;">
                    <button onclick="App.quickToggleFollow('${u.handle}'); event.stopPropagation();" 
                        style="padding:6px 12px; border-radius:20px; font-size:11px; font-weight:600; cursor:pointer; transition:all 0.2s; ${btnStyle}">
                        ${btnText}
                    </button>
                    <button onclick="App.safeOpenChat('${u.handle}'); document.getElementById('userSearchResults').style.display='none'; document.getElementById('socialSearchInput').value=''; event.stopPropagation();"
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
            const q = document.getElementById('socialSearchInput')?.value?.trim();
            if (q) this.renderUserSearch(q);
        } catch(e) {
            this.showToast('❌ Hata: ' + e.message);
        }
    },

    safeOpenChat(handle) {
        // Enforce: only message people you follow (who accepted your request) or admins
        if (this.currentUser !== 'kermode' && !this.state.following.includes(handle)) {
            this.showToast('💬 Sadece takip ettiğiniz (takip isteğinizi onaylayan) kişilere mesaj gönderebilirsiniz.');
            return;
        }
        this.openChat(handle);
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
                    <div>Sohbet listesi boş. Yukarıdaki aramadan birini bul ve mesaj at!</div>
                </div>`;
            return;
        }

        list.innerHTML = visibleContacts.map(handle => {
            const u = this.state.globalUsers.find(x => x.handle === handle) || { handle, name: handle, avatar: '👤' };
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
                <div style="font-size:32px; flex-shrink:0;">${u.avatar || '👤'}</div>
                <div style="flex:1; min-width:0;">
                    <div style="font-size:14px; font-weight:700;">${u.name}</div>
                    <div style="font-size:12px; color:var(--text2);">@${u.handle}</div>
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
        if (!confirm(`${u.name} ile olan sohbeti silmek istediğinize emin misiniz?`)) {
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
                    // Sadece takipçi/takip ağındaki host'ların odaları
                    if (!visibleHosts.includes(p.host)) return;
                    count++;

                    const isHost = p.host === this.currentUser;
                    const members = p.members || [];
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

        // Oda verisini dinle
        this._wpPrevMembers = null;
        this.watchPartyUnsubscribe = db.collection('watchparties').doc(partyId)
            .onSnapshot(doc => {
                if (!doc.exists) return;
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

                // İçerik bilgisi
                this._wpUpdateContentDisplay(data, isHost);

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
                    const elapsed = (Date.now() - data.videoStartedAt) / 1000;
                    const newTime = (data.videoTime || 0) + elapsed;
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
                        const ts = m.timestamp ? new Date(m.timestamp.toMillis()).toLocaleTimeString('tr-TR', {hour:'2-digit',minute:'2-digit'}) : '';
                        html += `
                        <div class="wp-msg ${isMe ? 'wp-msg-me' : 'wp-msg-other'}">
                            ${!isMe ? `<div class="wp-msg-avatar">${avatar}</div>` : ''}
                            <div class="wp-msg-bubble">
                                ${!isMe ? `<div class="wp-msg-sender">@${m.sender}</div>` : ''}
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
            <div style="margin-top:10px; border-radius:10px; overflow:hidden; position:relative; background:#000;">
                <iframe id="${iframeId}"
                    src="${playUrl}"
                    style="width:100%; height:200px; border:none; border-radius:10px; display:block;"
                    allowfullscreen
                    allow="autoplay; fullscreen"
                    onerror="App._wpIframeError()"
                    onload="App._wpIframeLoaded('${iframeId}')">
                </iframe>
                <div id="wpIframeFallback" style="display:none; padding:10px; text-align:center; background:var(--bg3); border-radius:0 0 10px 10px;">
                    <div style="font-size:12px; color:var(--text2); margin-bottom:8px;">Site bu pencerede açılmıyor.</div>
                    <a href="${playUrl}" target="_blank" 
                       style="display:inline-flex; align-items:center; gap:6px; padding:8px 18px; background:var(--primary); color:white; border-radius:10px; text-decoration:none; font-size:13px; font-weight:700;">
                        <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21"/></svg>
                        playimdb.com'da İzle
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
                        document.getElementById('wpIframeFallback').style.display = 'block';
                    }
                } catch(e) {
                    // cross-origin — site yüklendi, sorun yok
                }
            }, 3000);
        } catch(e) {}
    },

    _wpIframeError() {
        const fb = document.getElementById('wpIframeFallback');
        if (fb) fb.style.display = 'block';
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
                this._wpLocalTime += 1;
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

    // Oynatma hızını değiştir (Firestore'a yaz, tüm üyeler görsün)
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
            const s = parseFloat(btn.dataset.speed || btn.onclick?.toString().match(/[\d.]+/)?.[0]);
            btn.classList.toggle('active-speed', parseFloat(btn.getAttribute('onclick')?.match(/[\d.]+/)?.[0]) === speed);
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
        const modal = document.getElementById('wpModalInner');
        const btn = document.getElementById('wpFullscreenBtn');
        if (!modal) return;

        if (!document.fullscreenElement) {
            // Önce tarayıcı native fullscreen dene
            const overlay = document.getElementById('watchPartyModal');
            (overlay.requestFullscreen || overlay.webkitRequestFullscreen || overlay.mozRequestFullScreen)?.call(overlay)
                .then(() => {
                    modal.classList.add('wp-fullscreen-mode');
                    if (btn) btn.textContent = '⊠';
                })
                .catch(() => {
                    // Fallback: CSS ile tam ekran
                    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:9998;display:flex;';
                    modal.style.cssText = 'width:100vw;height:100vh;max-height:100vh;border-radius:0;';
                    this._wpFakeFullscreen = true;
                    if (btn) btn.textContent = '⊠';
                });
        } else {
            document.exitFullscreen?.();
            modal.classList.remove('wp-fullscreen-mode');
            if (this._wpFakeFullscreen) {
                const overlay = document.getElementById('watchPartyModal');
                overlay.style.cssText = '';
                modal.style.cssText = '';
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
        // Host odayı kapatsın
        if (data && data.host === this.currentUser) {
            if (!confirm('Odayı kapatmak istediğinize emin misiniz? Tüm üyeler çıkarılacak.')) return;
            try {
                await db.collection('watchparties').doc(this.currentWatchPartyId).update({ status: 'closed' });
            } catch (e) {}
        }
        this._closeWpModal();
    },

    _closeWpModal() {
        const modal = document.getElementById('watchPartyModal');
        if (modal) { modal.classList.remove('open'); modal.style.display = 'none'; }
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
            if (this.currentUser === 'kermode') {
                adminSpySection.style.display = 'block';
                let listHtml = '';
                theirMovies.forEach(m => {
                    listHtml += `<div style="font-size:12px; color:var(--text); background:var(--bg3); padding:8px; border-radius:6px; border:1px solid var(--border);">🎬 ${m.title} <span style="float:right; color:var(--text3);">${m.status}</span></div>`;
                });
                theirSeries.forEach(s => {
                    listHtml += `<div style="font-size:12px; color:var(--text); background:var(--bg3); padding:8px; border-radius:6px; border:1px solid var(--border);">📺 ${s.title} <span style="float:right; color:var(--text3);">${s.status}</span></div>`;
                });
                adminSpyList.innerHTML = listHtml || '<div style="font-size:12px; color:var(--text3); text-align:center;">Kütüphanesi boş.</div>';
            } else {
                adminSpySection.style.display = 'none';
            }
        }

        document.getElementById('otherProfileModal').classList.add('open');
    },

    openChat(handle) {
        if (this.isLongPressing) return;
        const user = this.state.globalUsers.find(u => u.handle === handle);
        if (!user) return;

        this.currentChatHandle = handle;
        document.getElementById('chatHeaderAvatar').innerText = user.avatar || '👤';
        document.getElementById('chatHeaderName').innerText = user.name;
        document.getElementById('chatHeaderHandle').innerText = '@' + user.handle;

        this.renderMessages();
        document.getElementById('chatModal').classList.add('open');
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

        this.chatUnsubscribe = db.collection('messages').doc(chatId).collection('msgs')
            .orderBy('timestamp', 'asc')
            .onSnapshot(snap => {
                const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

                if (msgs.length === 0) {
                    msgContainer.innerHTML = '<div style="text-align:center; color:var(--text3); font-size:13px; margin-top:20px;">İlk mesajı gönder...</div>';
                    return;
                }

                msgContainer.innerHTML = msgs.map(m => {
                    const isMe = m.sender === this.currentUser;
                    // Handle both serverTimestamp (Firestore Timestamp object) and plain numbers
                    const ts = m.timestamp && m.timestamp.toDate ? m.timestamp.toDate() : new Date(m.timestamp || 0);
                    const time = ts.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                    return `
                        <div class="message-bubble ${isMe ? 'sent' : 'received'}">
                            ${m.text}
                            <span class="message-time">${time}</span>
                        </div>
                    `;
                }).join('');
                msgContainer.scrollTop = msgContainer.scrollHeight;

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

    async sendMessage() {
        if (!this.currentChatHandle) return;
        const input = document.getElementById('chatInput');
        const text = input.value.trim();
        if (!text) return;
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
        
        const confirmDelete = confirm('Hesabınızı kalıcı olarak silmek istediğinize emin misiniz? Bu işlem geri alınamaz.');
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
            alert('Hesabınız başarıyla silindi.');
            await this.logout();
        } catch(e) {
            alert('Silme hatası: ' + e.message);
        }
    }
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

document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
