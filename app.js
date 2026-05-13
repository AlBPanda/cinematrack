// app.js

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
        lastWatchDate: null
    },
    
    currentTab: 'dashboard',
    editingId: null,
    editingType: null,

    init() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW fail', err));
        }

        const savedUser = localStorage.getItem('cinetrack_currentUser');
        if (savedUser) {
            this.login(savedUser);
            setTimeout(() => {
                document.getElementById('splash').classList.add('hidden');
                document.getElementById('app').classList.remove('hidden');
            }, 1500);
        } else {
            setTimeout(() => {
                document.getElementById('splash').classList.add('hidden');
                document.getElementById('loginScreen').classList.remove('hidden');
            }, 1500);
            
            document.getElementById('loginBtn').addEventListener('click', () => {
                const name = document.getElementById('usernameInput').value.trim();
                if (name) {
                    this.login(name);
                    document.getElementById('loginScreen').classList.add('hidden');
                    document.getElementById('app').classList.remove('hidden');
                }
            });
        }
    },

    login(username) {
        this.currentUser = username.toLowerCase();
        localStorage.setItem('cinetrack_currentUser', username);
        document.getElementById('userNameDisplay').innerText = username;
        
        // Also update profile tab username
        const profileUserName = document.getElementById('profileUserNameFull');
        if (profileUserName) {
            profileUserName.innerText = username;
        }
        
        // Data Migration / Loading
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

        checkGoalWeek();
        if (!this.eventsBound) {
            this.bindEvents();
            this.eventsBound = true;
        }
        this.renderAll();

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

    logout() {
        localStorage.removeItem('cinetrack_currentUser');
        location.reload();
    },

    save() {
        if (!this.currentUser) return;
        localStorage.setItem(`cinetrack_${this.currentUser}_movies`, JSON.stringify(this.state.movies));
        localStorage.setItem(`cinetrack_${this.currentUser}_series`, JSON.stringify(this.state.series));
        localStorage.setItem(`cinetrack_${this.currentUser}_goal`, this.state.goal);
        localStorage.setItem(`cinetrack_${this.currentUser}_goal_current`, this.state.goalCurrent);
        localStorage.setItem(`cinetrack_${this.currentUser}_goal_week`, this.state.goalWeek);
        localStorage.setItem(`cinetrack_${this.currentUser}_streak`, this.state.streak);
        if(this.state.lastWatchDate) localStorage.setItem(`cinetrack_${this.currentUser}_lastWatchDate`, this.state.lastWatchDate);
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

        // V1.4 New Modals & Actions
        if(document.getElementById('shareCloseBtn')) document.getElementById('shareCloseBtn').addEventListener('click', () => this.closeModals());
        if(document.getElementById('wrappedCloseBtn')) document.getElementById('wrappedCloseBtn').addEventListener('click', () => this.closeModals());
        if(document.getElementById('friendListCloseBtn')) document.getElementById('friendListCloseBtn').addEventListener('click', () => this.closeModals());
        if(document.getElementById('btnWrapped')) document.getElementById('btnWrapped').addEventListener('click', () => this.showWrapped());
        if(document.getElementById('btnFriendList')) document.getElementById('btnFriendList').addEventListener('click', () => this.openFriendList());
        if(document.getElementById('findCommonBtn')) document.getElementById('findCommonBtn').addEventListener('click', () => this.findCommonMovies());
        if(document.getElementById('movieShareBtn')) document.getElementById('movieShareBtn').addEventListener('click', () => this.openShareCard('movie'));

        // Detail Actions
        document.getElementById('movieDetailDeleteBtn').addEventListener('click', () => this.deleteItem('movie'));
        document.getElementById('seriesDetailDeleteBtn').addEventListener('click', () => this.deleteItem('series'));

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
            const res = await fetch(`https://api.themoviedb.org/3/${endpoint}/${id}?api_key=${TMDB_API_KEY}&language=${userLang}`);
            const data = await res.json();

            const title = type === 'movie' ? data.title : data.name;
            const dateField = type === 'movie' ? data.release_date : data.first_air_date;
            const year = dateField ? parseInt(dateField.split('-')[0]) : '';
            const genre = data.genres ? data.genres.map(g => g.name).join(', ') : '';
            const poster = data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : '';

            document.getElementById('formTitle').value = title || '';
            document.getElementById('formYear').value = year || '';
            document.getElementById('formGenre').value = genre || '';
            document.getElementById('formPoster').value = poster || '';
            
            const voteAvg = data.vote_average ? data.vote_average.toFixed(1) : '';
            document.getElementById('formGlobalRating').value = voteAvg;
            
            if (type === 'movie') {
                const duration = parseInt(data.runtime);
                document.getElementById('formDuration').value = isNaN(duration) ? '' : duration;
            } else {
                document.getElementById('formSeasons').value = data.number_of_seasons || 1;
                document.getElementById('formEpisodes').value = data.number_of_episodes || 10;
            }

            resultsContainer.classList.add('hidden');
            this.showToast('Bilgiler otomatik dolduruldu!');

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
            updatedAt: Date.now()
        };

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
                rating: existing ? existing.rating : 0
            };

            if (isEdit) {
                const idx = this.state.series.findIndex(s => s.id === this.editingId);
                if (idx > -1) {
                    this.state.series[idx] = { ...this.state.series[idx], ...newItem };
                }
            } else {
                newItem.id = Date.now().toString();
                newItem.createdAt = Date.now();
                newItem.watchedEps = []; // Array of ep IDs like "1-1"
                this.state.series.push(newItem);
            }
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
            if (status === 'watched' || status === 'completed' || status === 'watching') this.updateStreak();
            this.save();
            this.renderAll();
            this.showToast('Durum güncellendi');
        }
    },

    renderAll() {
        this.updateBadges();
        this.updateGenreDropdowns();
        this.renderDashboard();
        this.renderMovies();
        this.renderSeries();
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
                        <div class="movie-title">${m.title} ${platformBadge}</div>
                        <div class="movie-year">${m.year || ''} ${m.genre ? `• ${m.genre}` : ''}</div>
                        ${starHtml}
                    </div>
                </div>
                `;
            }).join('');
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
                        <div class="series-title">${s.title} ${platformBadge}</div>
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
        document.getElementById('movieDetailModal').classList.add('open');
    },

    openSeriesDetail(id) {
        const s = this.state.series.find(x => x.id === id);
        if (!s) return;
        
        this.editingId = id;
        
        const epsPerSeason = Math.ceil(s.episodes / s.seasons);
        let seasonsHtml = '';
        
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

        document.getElementById('wrappedHours').innerText = Math.round(totalHours);
        document.getElementById('wrappedGenre').innerText = topGenre;
        document.getElementById('wrappedTop').innerText = topRatedCount;

        document.getElementById('wrappedModal').classList.add('open');
        
        if (window.confetti) {
            confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        }
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
    }
};

function getStartOfWeek() {
    const d = new Date();
    d.setHours(0,0,0,0);
    d.setDate(d.getDate() - d.getDay() + (d.getDay() === 0 ? -6 : 1));
    return d.getTime().toString();
}

function checkGoalWeek() {
    const currentWeek = getStartOfWeek();
    if (localStorage.getItem('cinetrack_goal_week') !== currentWeek) {
        localStorage.setItem('cinetrack_goal_current', '0');
        localStorage.setItem('cinetrack_goal_week', currentWeek);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
