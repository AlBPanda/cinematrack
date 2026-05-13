// app.js

const TMDB_API_KEY = '92b418e837b833be308bbfb1fb2aca1e';

const App = {
    currentUser: null,
    state: {
        movies: [],
        series: [],
        goal: 5,
        goalCurrent: 0,
        goalWeek: ''
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
        
        // Data Migration / Loading
        if (!localStorage.getItem('cinetrack_migrated') && localStorage.getItem('cinetrack_movies')) {
            this.state.movies = JSON.parse(localStorage.getItem('cinetrack_movies')) || [];
            this.state.series = JSON.parse(localStorage.getItem('cinetrack_series')) || [];
            this.state.goal = parseInt(localStorage.getItem('cinetrack_goal')) || 5;
            this.state.goalCurrent = parseInt(localStorage.getItem('cinetrack_goal_current')) || 0;
            this.state.goalWeek = localStorage.getItem('cinetrack_goal_week') || getStartOfWeek();
            
            localStorage.setItem('cinetrack_migrated', 'true');
            this.save();
        } else {
            this.state.movies = JSON.parse(localStorage.getItem(`cinetrack_${this.currentUser}_movies`)) || [];
            this.state.series = JSON.parse(localStorage.getItem(`cinetrack_${this.currentUser}_series`)) || [];
            this.state.goal = parseInt(localStorage.getItem(`cinetrack_${this.currentUser}_goal`)) || 5;
            this.state.goalCurrent = parseInt(localStorage.getItem(`cinetrack_${this.currentUser}_goal_current`)) || 0;
            this.state.goalWeek = localStorage.getItem(`cinetrack_${this.currentUser}_goal_week`) || getStartOfWeek();
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
            document.documentElement.style.setProperty('--primary', '#6366f1');
            document.documentElement.style.setProperty('--bg', '#0d0f14');
        }
    },

    triggerDenizEasterEgg() {
        document.documentElement.style.setProperty('--primary', '#00f2fe');
        document.documentElement.style.setProperty('--bg', '#020b14');
        
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
        
        setTimeout(() => this.showToast('Deniz için özel efektler aktif! 🌊✨'), 1000);
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
            this.renderMovies();
            this.renderSeries();
        });
        document.getElementById('searchInput').addEventListener('input', () => {
            if (this.currentTab === 'dashboard') {
                this.switchTab('movies');
            }
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
            });
        });

        // Star Rating
        document.querySelectorAll('.star').forEach(star => {
            star.addEventListener('click', (e) => {
                const val = parseInt(e.target.dataset.val);
                this.setStarRating(val);
            });
        });

        // TMDB Search (Real-time)
        let tmdbTimeout = null;
        document.getElementById('tmdbInput').addEventListener('input', (e) => {
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

        // Detail Actions
        document.getElementById('movieDetailEditBtn').addEventListener('click', () => this.openEditModal('movie'));
        document.getElementById('movieDetailDeleteBtn').addEventListener('click', () => this.deleteItem('movie'));
        document.getElementById('seriesDetailEditBtn').addEventListener('click', () => this.openEditModal('series'));
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

        // Sorts
        document.getElementById('movieSort').addEventListener('change', () => this.renderMovies());
        document.getElementById('seriesSort').addEventListener('change', () => this.renderSeries());

        // Goal Setting
        document.getElementById('goalSetBtn').addEventListener('click', () => {
            const val = parseInt(document.getElementById('goalInput').value);
            if (val > 0) {
                this.state.goal = val;
                this.save();
                this.renderDashboard();
                this.showToast('Hedef güncellendi');
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
    },

    setStarRating(val) {
        document.querySelectorAll('.star').forEach(star => {
            if (parseInt(star.dataset.val) <= val) {
                star.classList.add('active');
            } else {
                star.classList.remove('active');
            }
        });
        document.getElementById('ratingDisplay').innerText = val > 0 ? `${val} / 10` : 'Puan seç';
        document.getElementById('starRating').dataset.rating = val;
    },

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
                    
                    return `
                        <div class="tmdb-item" onclick="App.selectTMDBItem('${item.id}', '${type}')">
                            <div class="tmdb-poster">${poster ? `<img src="${poster}" style="width:100%;height:100%;object-fit:cover;border-radius:6px;"/>` : icon}</div>
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
            
            if (type === 'movie') {
                const duration = parseInt(data.runtime);
                document.getElementById('formDuration').value = isNaN(duration) ? '' : duration;
            } else {
                document.getElementById('formSeasons').value = data.number_of_seasons || 1;
                document.getElementById('formEpisodes').value = data.number_of_episodes || 10;
            }

            resultsContainer.classList.add('hidden');
            document.getElementById('tmdbInput').value = '';
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
        document.getElementById('tmdbWrap').classList.remove('hidden');
        document.getElementById('tmdbInput').value = '';
        document.getElementById('tmdbResults').classList.add('hidden');
        
        // Reset form
        document.getElementById('formTitle').value = '';
        document.getElementById('formYear').value = '';
        document.getElementById('formGenre').value = '';
        document.getElementById('formPoster').value = '';
        document.getElementById('formNote').value = '';
        document.getElementById('formDuration').value = '';
        this.setStarRating(0);
        document.getElementById('formMovieStatus').value = 'watchlist';
        
        document.getElementById('formSeriesStatus').value = 'watching';
        document.getElementById('formSeasons').value = 1;
        document.getElementById('formEpisodes').value = 10;

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
        document.getElementById('tmdbWrap').classList.add('hidden'); // Hide TMDB search on edit
        
        document.getElementById('formTitle').value = item.title;
        document.getElementById('formYear').value = item.year || '';
        document.getElementById('formGenre').value = item.genre || '';
        document.getElementById('formPoster').value = item.poster || '';
        document.getElementById('formNote').value = item.note || '';

        if (type === 'movie') {
            document.getElementById('movieFields').classList.remove('hidden');
            document.getElementById('seriesFields').classList.add('hidden');
            document.getElementById('formMovieStatus').value = item.status;
            document.getElementById('formDuration').value = item.duration || '';
            this.setStarRating(item.rating || 0);
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

        const baseItem = {
            title,
            year: document.getElementById('formYear').value,
            genre: document.getElementById('formGenre').value,
            poster: document.getElementById('formPoster').value,
            note: document.getElementById('formNote').value,
            updatedAt: Date.now()
        };

        if (type === 'movie') {
            const status = document.getElementById('formMovieStatus').value;
            const rating = parseInt(document.getElementById('starRating').dataset.rating) || 0;
            const duration = document.getElementById('formDuration').value;

            const newItem = {
                ...baseItem,
                type: 'movie',
                status, rating, duration
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

            const newItem = {
                ...baseItem,
                type: 'series',
                status, seasons, episodes
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

    renderAll() {
        this.updateBadges();
        this.renderDashboard();
        this.renderMovies();
        this.renderSeries();
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

        // Goal
        document.getElementById('goalInput').value = this.state.goal;
        document.getElementById('goalTarget').innerText = this.state.goal;
        document.getElementById('goalCurrent').innerText = this.state.goalCurrent;
        document.getElementById('goalCurrentText').innerText = this.state.goalCurrent;
        
        const goalPerc = Math.min(100, Math.round((this.state.goalCurrent / this.state.goal) * 100));
        const offset = 201 - (201 * goalPerc) / 100;
        document.getElementById('goalRing').style.strokeDashoffset = offset;
    },

    renderMovies() {
        const grid = document.getElementById('movieGrid');
        const search = document.getElementById('searchInput').value.toLowerCase();
        const filterBtn = document.querySelector('#tab-movies .filter-btn.active');
        const filter = filterBtn ? filterBtn.dataset.filter : 'all';
        const sort = document.getElementById('movieSort').value;

        let filtered = this.state.movies.filter(m => {
            if (search && !m.title.toLowerCase().includes(search)) return false;
            if (filter !== 'all' && m.status !== filter) return false;
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
                grid.innerHTML = document.getElementById('movieEmpty').outerHTML;
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

                return `
                <div class="movie-card" onclick="App.openMovieDetail('${m.id}')">
                    <div class="movie-poster">
                        ${m.poster ? `<img src="${m.poster}" loading="lazy" />` : `<div class="movie-poster-placeholder">🎬</div>`}
                        ${badge}
                    </div>
                    <div class="movie-info">
                        <div class="movie-title">${m.title}</div>
                        <div class="movie-year">${m.year || ''} ${m.genre ? `• ${m.genre}` : ''}</div>
                        ${m.rating ? `<div class="movie-rating">${'★'.repeat(m.rating)}</div>` : ''}
                    </div>
                </div>
                `;
            }).join('');
        }
    },

    renderSeries() {
        const list = document.getElementById('seriesList');
        const search = document.getElementById('searchInput').value.toLowerCase();
        const filterBtn = document.querySelector('#tab-series .filter-btn.active');
        const filter = filterBtn ? filterBtn.dataset.filter : 'all';
        const sort = document.getElementById('seriesSort').value;

        let filtered = this.state.series.filter(s => {
            if (search && !s.title.toLowerCase().includes(search)) return false;
            if (filter !== 'all' && s.status !== filter) return false;
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
                list.innerHTML = document.getElementById('seriesEmpty').outerHTML;
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

                return `
                <div class="series-card" onclick="App.openSeriesDetail('${s.id}')">
                    <div class="series-header">
                        <div class="series-thumb">
                            ${s.poster ? `<img src="${s.poster}" loading="lazy"/>` : '📺'}
                        </div>
                        <div class="series-meta">
                            <div class="series-title">${s.title}</div>
                            <div class="series-info-row">
                                ${statusTag}
                                ${s.year ? `<span class="series-tag">${s.year}</span>` : ''}
                                ${s.genre ? `<span class="series-tag">${s.genre}</span>` : ''}
                            </div>
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
                `;
            }).join('');
        }
    },

    openMovieDetail(id) {
        const m = this.state.movies.find(x => x.id === id);
        if (!m) return;
        
        this.editingId = id;
        
        let statusText = { watched: 'İzlendi', watchlist: 'İzlenecek', watching: 'İzleniyor' }[m.status];
        
        const body = `
            ${m.poster ? `<div class="detail-poster"><img src="${m.poster}" /></div>` : ''}
            <h3 class="detail-title">${m.title}</h3>
            <div class="detail-tags">
                <span class="detail-tag">${statusText}</span>
                ${m.year ? `<span class="detail-tag">${m.year}</span>` : ''}
                ${m.duration ? `<span class="detail-tag">${m.duration} dk</span>` : ''}
                ${m.genre ? `<span class="detail-tag">${m.genre}</span>` : ''}
            </div>
            ${m.rating ? `<div class="detail-rating">${'★'.repeat(m.rating)}${'☆'.repeat(10 - m.rating)} <span style="font-size:12px;color:var(--text3)">${m.rating}/10</span></div>` : ''}
            ${m.note ? `<div class="detail-note">${m.note}</div>` : ''}
        `;
        
        document.getElementById('movieDetailBody').innerHTML = body;
        document.getElementById('movieDetailModal').classList.add('open');
    },

    openSeriesDetail(id) {
        const s = this.state.series.find(x => x.id === id);
        if (!s) return;
        
        this.editingId = id;
        
        let statusText = { watching: 'İzleniyor', completed: 'Tamamlandı', paused: 'Durduruldu', watchlist: 'İzlenecek' }[s.status];
        
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

        const body = `
            ${s.poster ? `<div class="detail-poster"><img src="${s.poster}" /></div>` : ''}
            <h3 class="detail-title">${s.title}</h3>
            <div class="detail-tags">
                <span class="detail-tag">${statusText}</span>
                ${s.year ? `<span class="detail-tag">${s.year}</span>` : ''}
                ${s.genre ? `<span class="detail-tag">${s.genre}</span>` : ''}
            </div>
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
        
        if (s.watchedEps.includes(epId)) {
            s.watchedEps = s.watchedEps.filter(e => e !== epId);
            btn.classList.remove('watched');
            if (this.state.goalCurrent > 0) this.state.goalCurrent--;
        } else {
            s.watchedEps.push(epId);
            btn.classList.add('watched');
            this.state.goalCurrent++;
            this.showToast('Bölüm izlendi!');
        }
        
        this.save();
        this.renderDashboard();
        
        // Re-render series list to update progress bars without closing modal
        this.renderSeries();
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
                    break;
                }
            }
            if (foundUnwatched) break;
        }

        if (foundUnwatched) {
            this.save();
            this.renderDashboard();
            this.renderSeries();
            this.showToast('Sonraki bölüm izlendi!');
        } else {
            this.showToast('Tüm bölümler izlenmiş');
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
