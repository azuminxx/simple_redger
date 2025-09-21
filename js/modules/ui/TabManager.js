/**
 * タブ管理クラス
 */
class TabManager {
    constructor() {
        this.currentActiveTab = null;
        this.seatMap = null;
    }

    /**
     * 検索メニューを初期化（非同期対応）
     */
    async initializeSearchMenu() {
        const searchMenuContainer = document.getElementById(CONFIG.system.searchMenuId);
        if (!searchMenuContainer) {
            console.error(CONFIG.system.messages.elementNotFound);
            return;
        }

        // タブコンテナを作成
        const tabContainer = await this.createTabContainer();
        searchMenuContainer.appendChild(tabContainer);

        // 開閉トグルボタンを下部に追加
        const toggleBtn = document.createElement('button');
        toggleBtn.id = 'toggle-search-form';
        toggleBtn.className = 'search-toggle-btn';
        toggleBtn.textContent = '▲';
        // ここでのstyle設定は削除（CSSで統一）
        searchMenuContainer.appendChild(toggleBtn);

        // タブボタン以外の.tab-contentをまとめて取得
        const updateTabContentVisibility = (open) => {
            const tabContents = tabContainer.querySelectorAll('.tab-content');
            tabContents.forEach(tabContent => {
                if (open) {
                    tabContent.style.height = 'auto';
                    tabContent.style.overflow = 'visible';
                } else {
                    tabContent.style.height = '0px';
                    tabContent.style.overflow = 'hidden';
                }
            });
        };
        // 初期状態は開いている
        updateTabContentVisibility(true);

        toggleBtn.addEventListener('click', () => {
            const isClosed = Array.from(tabContainer.querySelectorAll('.tab-content')).every(tc => tc.style.height === '0px');
            if (isClosed) {
                updateTabContentVisibility(true);
                toggleBtn.textContent = '▲';
            } else {
                updateTabContentVisibility(false);
                toggleBtn.textContent = '▼';
            }
            if (window.adjustTableHeight) window.adjustTableHeight();
        });

        const firstAppId = Object.keys(CONFIG.apps)[0];
        this.switchTab(firstAppId);
    }

    /**
     * タブコンテナを作成
     */
    async createTabContainer() {
        const tabContainer = DOMHelper.createElement('div', {}, 'tab-container');

        const tabMenu = this.createTabMenu();
        tabContainer.appendChild(tabMenu);

        // 各台帳のタブコンテンツを作成
        for (const appId of Object.keys(CONFIG.apps)) {
            try {
                const tabContent = await this.createTabContent(appId);
                tabContainer.appendChild(tabContent);
            } catch (error) {
                console.error(`App ${appId}のタブ作成エラー:`, error);
                
                // エラー時は基本的なタブを作成
                const errorTabContent = DOMHelper.createElement('div', {
                    id: `tab-${appId}`
                }, 'tab-content');
                
                const errorMessage = DOMHelper.createElement('div', {}, 'error-message');
                errorMessage.textContent = `${CONFIG.apps[appId].name}のタブ初期化に失敗しました`;
                errorTabContent.appendChild(errorMessage);
                
                tabContainer.appendChild(errorTabContent);
            }
        }

        // 貸出管理タブのタブコンテンツを追加
        const lendingContent = DOMHelper.createElement('div', { id: 'tab-lending' }, 'tab-content');
        try {
            this.lendingManager = new LendingManager();
            const lendingView = this.lendingManager.buildTabContent();
            lendingContent.appendChild(lendingView);
        } catch (e) {
            const errorMessage = DOMHelper.createElement('div', {}, 'error-message');
            errorMessage.textContent = '貸出管理タブの初期化に失敗しました';
            lendingContent.appendChild(errorMessage);
        }
        tabContainer.appendChild(lendingContent);

        // 座席表タブのタブコンテンツを追加（Konva）
        const seatmapContent = DOMHelper.createElement('div', { id: 'tab-seatmap' }, 'tab-content');
        try {
            this.seatMap = new SeatMap();
            const seatmapView = this.seatMap.buildTabContent();
            seatmapContent.appendChild(seatmapView);
        } catch (e) {
            const errorMessage = DOMHelper.createElement('div', {}, 'error-message');
            errorMessage.textContent = '座席表タブの初期化に失敗しました';
            seatmapContent.appendChild(errorMessage);
        }
        tabContainer.appendChild(seatmapContent);

        // 更新履歴タブのタブコンテンツを追加
        const historyContent = DOMHelper.createElement('div', { id: 'tab-history' }, 'tab-content');
        const historyContainer = DOMHelper.createElement('div', {}, 'history-container');
        // 初期表示用の空テーブル（列ヘッダのみ）
        try {
            const table = document.createElement('table');
            table.className = 'history-table';
            const thead = document.createElement('thead');
            thead.innerHTML = '<tr><th>レコードID</th><th>台帳名</th><th>主キー</th><th>結果</th><th>更新内容</th><th>バッチID</th><th>時刻</th></tr>';
            table.appendChild(thead);
            const tbody = document.createElement('tbody');
            table.appendChild(tbody);
            historyContainer.appendChild(table);
        } catch (e) { /* noop */ }
        historyContent.appendChild(historyContainer);
        tabContainer.appendChild(historyContent);

        // 設定タブのタブコンテンツを追加
        const settingsContent = DOMHelper.createElement('div', { id: 'tab-settings' }, 'tab-content');

        // テーブル化（1列目: ボタン、2列目: 説明）
        const settingsTable = document.createElement('table');
        settingsTable.className = 'settings-table';
        const tbodySettings = document.createElement('tbody');

        const addSettingsRow = (buttonEl, description) => {
            const tr = document.createElement('tr');
            const tdBtn = document.createElement('td');
            const tdDesc = document.createElement('td');
            tdBtn.appendChild(buttonEl);
            tdDesc.textContent = description || '';
            tr.appendChild(tdBtn);
            tr.appendChild(tdDesc);
            tbodySettings.appendChild(tr);
        };

        // アプリの設定ボタン
        const appSettingsBtn = DOMHelper.createElement('button', {}, 'app-settings-btn');
        appSettingsBtn.textContent = 'アプリの設定';
        appSettingsBtn.style.fontSize = '12px';
        appSettingsBtn.addEventListener('click', () => {
            const appId = kintone.app.getId();
            const baseUrl = CONFIG.system.baseUrl;
            const settingsUrl = `${baseUrl}/admin/app/flow?app=${appId}#section=settings`;
            window.open(settingsUrl, '_blank');
        });
        addSettingsRow(appSettingsBtn, 'kintoneアプリ設定画面を開きます');

        // フィールド情報キャッシュクリア
        const clearCacheBtn = DOMHelper.createElement('button', {}, 'clear-field-cache-btn');
        clearCacheBtn.textContent = 'フィールド情報キャッシュをクリア';
        clearCacheBtn.style.fontSize = '12px';
        clearCacheBtn.addEventListener('click', () => {
            try {
                const prefix = (window.fieldInfoAPI && window.fieldInfoAPI.localStoragePrefix) ? window.fieldInfoAPI.localStoragePrefix : 'fieldInfo_';
                const keysToRemove = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith(prefix)) keysToRemove.push(key);
                }
                keysToRemove.forEach(key => localStorage.removeItem(key));
                if (window.fieldInfoAPI) {
                    if (window.fieldInfoAPI.fieldCache && typeof window.fieldInfoAPI.fieldCache.clear === 'function') window.fieldInfoAPI.fieldCache.clear();
                    if (window.fieldInfoAPI.loadingPromises && typeof window.fieldInfoAPI.loadingPromises.clear === 'function') window.fieldInfoAPI.loadingPromises.clear();
                }
                alert('フィールド情報キャッシュをクリアしました。次回の取得はAPIから実行されます。\nブラウザをリロードしてください。');
            } catch (e) {
                alert('キャッシュクリア中にエラーが発生しました。');
                console.error('キャッシュクリアエラー:', e);
            }
        });
        addSettingsRow(clearCacheBtn, 'FieldInfoAPIのメモリ/ローカルキャッシュを削除します');

        // 全データ抽出
        const exportBtn = DOMHelper.createElement('button', {}, 'export-all-btn');
        exportBtn.textContent = '全データ抽出';
        exportBtn.style.fontSize = '12px';
        exportBtn.addEventListener('click', async () => {
            if (!window.PermissionChecker) {
                console.error('PermissionCheckerが見つかりません');
                return;
            }
            const hasPermission = await window.PermissionChecker.hasAddRecordPermission();
            if (!hasPermission) {
                window.PermissionChecker.showPermissionError();
                return;
            }
            this.exportAllData();
        });
        addSettingsRow(exportBtn, '全台帳を無条件でCSVファイル出力します');

        settingsTable.appendChild(tbodySettings);
        settingsContent.appendChild(settingsTable);
        tabContainer.appendChild(settingsContent);

        // 不整合タブのタブコンテンツを追加（設定タブと同様にテーブル化）
        const inconsistencyContent = DOMHelper.createElement('div', { id: 'tab-inconsistency' }, 'tab-content');
        const inconsistencyTable = document.createElement('table');
        inconsistencyTable.className = 'settings-table';
        const tbodyInconsistency = document.createElement('tbody');

        const addInconsistencyRow = (buttonEl, description) => {
            const tr = document.createElement('tr');
            const tdBtn = document.createElement('td');
            const tdDesc = document.createElement('td');
            tdBtn.appendChild(buttonEl);
            tdDesc.textContent = description || '';
            tr.appendChild(tdBtn);
            tr.appendChild(tdDesc);
            tbodyInconsistency.appendChild(tr);
        };

        try {
            const runBtn = DOMHelper.createElement('button', {}, 'inconsistency-run-btn');
            runBtn.textContent = '不整合抽出';
            runBtn.style.fontSize = '12px';
            runBtn.addEventListener('click', () => this.runInconsistencyExtraction());
            addInconsistencyRow(runBtn, '全台帳を対象に不整合（キー分断）を抽出します');
        } catch (e) { /* noop */ }

        inconsistencyTable.appendChild(tbodyInconsistency);
        inconsistencyContent.appendChild(inconsistencyTable);
        tabContainer.appendChild(inconsistencyContent);

        // 座席表タブ 追加済み

        return tabContainer;
    }

    /**
     * タブメニューを作成
     */
    createTabMenu() {
        const tabMenu = DOMHelper.createElement('div', {}, 'tab-menu');

        // 検索用タブ（左寄せ）
        const ledgerIcons = {
            'PC台帳': '💻',
            '内線台帳': '📞',
            '座席台帳': '💺'
        };
        Object.entries(CONFIG.apps).forEach(([appId, appConfig]) => {
            const tabButton = DOMHelper.createElement('button', {}, 'tab-button');
            tabButton.setAttribute('data-app', appId);
            const icon = ledgerIcons[appConfig.name] || '';
            tabButton.textContent = icon + ' ' + appConfig.name;
            tabButton.addEventListener('click', () => this.switchTab(appId));
            tabMenu.appendChild(tabButton);
        });

        // 座席表タブ（座席台帳のすぐ隣）
        const seatmapTabButton = DOMHelper.createElement('button', {}, 'tab-button seatmap-tab');
        seatmapTabButton.setAttribute('data-app', 'seatmap');
        seatmapTabButton.textContent = '🗺️ 座席表';
        seatmapTabButton.addEventListener('click', () => this.switchTab('seatmap'));
        tabMenu.appendChild(seatmapTabButton);

        // 更新履歴タブ（座席表の隣）
        const historyTabButton = DOMHelper.createElement('button', {}, 'tab-button history-tab');
        historyTabButton.setAttribute('data-app', 'history');
        historyTabButton.textContent = '📋 更新履歴';
        historyTabButton.addEventListener('click', () => this.switchTab('history'));
        tabMenu.appendChild(historyTabButton);

        // 貸出管理タブ（更新履歴の直後）
        const lendingTabButton = DOMHelper.createElement('button', {}, 'tab-button lending-tab');
        lendingTabButton.setAttribute('data-app', 'lending');
        lendingTabButton.textContent = '📦 貸出管理（テスト中）';
        lendingTabButton.addEventListener('click', () => this.switchTab('lending'));
        tabMenu.appendChild(lendingTabButton);

        // 不整合タブ（更新履歴の隣）
        const inconsistencyTabButton = DOMHelper.createElement('button', {}, 'tab-button inconsistency-tab');
        inconsistencyTabButton.setAttribute('data-app', 'inconsistency');
        inconsistencyTabButton.textContent = '⚠️ 不整合（テスト中）';
        inconsistencyTabButton.addEventListener('click', () => this.switchTab('inconsistency'));
        tabMenu.appendChild(inconsistencyTabButton);

        // 設定タブ（右寄せ）
        const settingsTabButton = DOMHelper.createElement('button', {}, 'tab-button settings-tab');
        settingsTabButton.setAttribute('data-app', 'settings');
        settingsTabButton.textContent = '⚙️ 設定';
        settingsTabButton.addEventListener('click', () => this.switchTab('settings'));
        tabMenu.appendChild(settingsTabButton);

        // 座席表タブ 追加済み

        return tabMenu;
    }

    /**
     * タブコンテンツを作成（非同期対応）
     */
    async createTabContent(appId) {
        const appConfig = CONFIG.apps[appId];
        
        const tabContent = DOMHelper.createElement('div', {
            id: `tab-${appId}`
        }, 'tab-content');

        // ローディング表示を追加
        const loadingMessage = DOMHelper.createElement('div', {}, 'loading-message');
        loadingMessage.textContent = 'フィールド情報を読み込み中...';
        tabContent.appendChild(loadingMessage);

        try {
            // FormBuilderインスタンスを作成
            const formBuilder = new FormBuilder();
            
            // 指定されたappIdの検索フォームを作成
            const formHTML = await formBuilder.buildSearchForm(appId);
            
            // ローディングメッセージを削除
            tabContent.removeChild(loadingMessage);
            
            // フォームHTMLを直接挿入
            tabContent.innerHTML = formHTML;
            
            // 個別タブ用の検索ボタンとクリアボタンを追加
            const buttonGroup = this.createIndividualButtonGroup(appId);
            tabContent.appendChild(buttonGroup);
            
        } catch (error) {
            // ローディングメッセージを削除
            if (tabContent.contains(loadingMessage)) {
                tabContent.removeChild(loadingMessage);
            }
            
            // エラーメッセージを表示
            const errorMessage = DOMHelper.createElement('div', {}, 'error-message');
            errorMessage.textContent = `タブの初期化に失敗しました: ${error.message}`;
            tabContent.appendChild(errorMessage);
            
            throw error;
        }

        return tabContent;
    }

    // /**
    //  * エラー用タブコンテンツを作成
    //  */
    // createErrorTabContent(appId, error) {
    //     const tabContent = DOMHelper.createElement('div', {
    //         id: `tab-${appId}`
    //     }, 'tab-content error-tab');

    //     const errorMessage = DOMHelper.createElement('div', {}, 'error-message');
    //     errorMessage.innerHTML = `
    //         <h4>タブの初期化に失敗しました</h4>
    //         <p>アプリID: ${appId}</p>
    //         <p>エラー: ${error.message}</p>
    //         <button onclick="location.reload()">ページを再読み込み</button>
    //     `;
        
    //     tabContent.appendChild(errorMessage);
    //     return tabContent;
    // }

    /**
     * タブを切り替え
     */
    switchTab(appId) {
        // 全てのタブボタンから active クラスを削除
        const tabButtons = document.querySelectorAll('.tab-button');
        tabButtons.forEach(button => button.classList.remove('active'));

        // 全てのタブコンテンツを非表示
        const tabContents = document.querySelectorAll('.tab-content');
        tabContents.forEach(content => content.classList.remove('active'));

        // 指定されたタブボタンに active クラスを追加
        const activeButton = document.querySelector(`[data-app="${appId}"]`);
        if (activeButton) {
            activeButton.classList.add('active');
        }

        // 指定されたタブコンテンツを表示
        const activeContent = document.getElementById(`tab-${appId}`);
        if (activeContent) {
            activeContent.classList.add('active');
            // タブ毎に必要なレイアウト高さを再調整
            try {
                setTimeout(() => { if (window.adjustTableHeight) window.adjustTableHeight(); }, 0);
            } catch (e) { /* noop */ }
        }

        // 更新履歴タブが選択された場合、履歴データを読み込む
        if (appId === 'history') {
            this.loadHistoryData();
            
            // 更新履歴タブが開かれた際、検索メニューが閉じられていた場合は開く
            this.openSearchMenuIfClosed();
        }
        
        // 設定タブが選択された場合、検索メニューが閉じられていた場合は開く
        if (appId === 'settings' || appId === 'lending') {
            this.openSearchMenuIfClosed();
        }

        // 不整合タブが選択された場合、不整合抽出を実行
        if (appId === 'inconsistency') {
            // 自動抽出は行わない（ボタン押下時に実行）
            this.openSearchMenuIfClosed();
        }

        // 座席表タブ: 表示時にsearch-resultsは非表示（toggleSearchResultsVisibilityで制御）
        if (appId === 'seatmap') {
            // 必要があればここで追加の初期化を行う
        }

        // search-results要素の表示・非表示を切り替え
        this.toggleSearchResultsVisibility(appId);

        this.currentActiveTab = appId;
    }

    /**
     * 検索メニューが閉じられている場合に開く
     */
    openSearchMenuIfClosed() {
        const tabContainer = document.querySelector('.tab-container');
        if (!tabContainer) return;

        const tabContents = tabContainer.querySelectorAll('.tab-content');
        const isSearchMenuClosed = Array.from(tabContents).every(tc => tc.style.height === '0px');
        
        if (isSearchMenuClosed) {
            // 検索メニューを開く
            tabContents.forEach(tabContent => {
                tabContent.style.height = 'auto';
                tabContent.style.overflow = 'visible';
            });
            
            // トグルボタンのテキストを更新
            const toggleBtn = document.getElementById('toggle-search-form');
            if (toggleBtn) {
                toggleBtn.textContent = '▲';
            }
            
            // テーブル高さを調整
            if (window.adjustTableHeight) {
                window.adjustTableHeight();
            }
        }
    }

    /**
     * 個別タブ用のボタングループを作成
     */
    createIndividualButtonGroup(appId) {
        const buttonGroup = DOMHelper.createElement('div', {}, 'button-group');

        const searchButton = DOMHelper.createElement('button', {}, 'search-button');
        searchButton.textContent = '検索';
        searchButton.setAttribute('data-app-id', appId);
        // 権限チェック付きの検索ボタン
        searchButton.addEventListener('click', async () => {
            // 権限チェック
            if (!window.PermissionChecker) {
                console.error('PermissionCheckerが見つかりません');
                return;
            }
            
            const hasPermission = await window.PermissionChecker.hasAddRecordPermission();
            if (!hasPermission) {
                window.PermissionChecker.showPermissionError();
                return;
            }
            
            // 権限がある場合は検索実行
            if (window.searchEngine) {
                window.searchEngine.searchRecords(appId);
            }
        });

        const addSearchButton = DOMHelper.createElement('button', {}, 'add-search-button');
        addSearchButton.textContent = '追加検索';
        addSearchButton.setAttribute('data-app-id', appId);
        // 権限チェック付きの追加検索ボタン
        addSearchButton.addEventListener('click', async () => {
            // 権限チェック
            if (!window.PermissionChecker) {
                console.error('PermissionCheckerが見つかりません');
                return;
            }
            
            const hasPermission = await window.PermissionChecker.hasAddRecordPermission();
            if (!hasPermission) {
                window.PermissionChecker.showPermissionError();
                return;
            }
            
            // 権限がある場合は追加検索実行
            if (window.searchEngine) {
                window.searchEngine.addSearchRecords(appId);
            }
        });

        const clearButton = DOMHelper.createElement('button', {}, 'clear-button');
        clearButton.textContent = 'クリア';
        clearButton.addEventListener('click', () => this.clearForm(appId));

        buttonGroup.appendChild(searchButton);
        buttonGroup.appendChild(addSearchButton);
        buttonGroup.appendChild(clearButton);

        return buttonGroup;
    }

    /**
     * 指定されたタブのフォームをクリア
     */
    clearForm(appId) {
        const tabContent = document.querySelector(`#tab-${appId}`);
        if (!tabContent) return;
        
        // テキスト入力をクリア
        const inputs = tabContent.querySelectorAll('input[type="text"], input[type="number"], input[type="date"], input[type="datetime-local"]');
        inputs.forEach(input => {
            input.value = '';
        });

        // セレクトボックスをリセット
        const selects = tabContent.querySelectorAll('select');
        selects.forEach(select => {
            if (select.multiple) {
                // 複数選択リストボックスは全て未選択に
                Array.from(select.options).forEach(option => option.selected = false);
            } else {
                select.selectedIndex = 0;
            }
        });

        // チェックボックスをクリア
        const checkboxes = tabContent.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.checked = false;
        });
    }

    // 全データエクスポート処理
    async exportAllData() {
        try {
            // DataIntegratorインスタンス取得
            const dataIntegrator = window.dataIntegrator || new DataIntegrator();
            // 1. 各台帳の全件取得
            const allLedgerData = {};
            for (const appId of Object.keys(CONFIG.apps)) {
                // 検索条件なしで全件取得
                allLedgerData[appId] = await window.searchEngine.searchRecordsWithQuery(appId, '');
            }
            console.log(allLedgerData);
            // 2. ユーザー台帳抽出
            const userListRecords = await dataIntegrator.searchUserListByUserIds(allLedgerData);
            console.log(userListRecords);
            // 3. データをマージ（統合キーで3台帳をマージ→BSSIDでユーザー台帳をマージ）
            // ① 3台帳を統合キーでマージ
            const mergedByIntegrationKey = {};
            for (const appId of Object.keys(CONFIG.apps)) {
                const ledgerName = CONFIG.apps[appId].name;
                (allLedgerData[appId] || []).forEach(record => {
                    const key = record[CONFIG.integrationKey]?.value;
                    if (!key) return;
                    if (!mergedByIntegrationKey[key]) mergedByIntegrationKey[key] = {};
                    mergedByIntegrationKey[key][ledgerName] = record;
                });
            }
            // ② ユーザー台帳をBSSIDでマージ
            const userListMap = {};
            userListRecords.forEach(user => {
                const userId = user[CONFIG.userList.primaryKey]?.value;
                if (userId) userListMap[userId] = user;
            });
            const finalMerged = [];
            Object.entries(mergedByIntegrationKey).forEach(([integrationKey, ledgerGroup]) => {
                const mergedRecord = {};
                // 各台帳のフィールドを展開
                Object.entries(ledgerGroup).forEach(([ledgerName, record]) => {
                    Object.entries(record).forEach(([field, val]) => {
                        // 各台帳の統合キーフィールドは除外
                        if (field === CONFIG.integrationKey) return;
                        mergedRecord[`${ledgerName}_${field}`] = val?.value ?? val;
                    });
                });
                // 統合キーを1つだけ追加
                mergedRecord['統合キー'] = integrationKey;
                // BSSIDでユーザー台帳情報を付与
                const userId = mergedRecord['PC台帳_BSSID'];
                if (userId && userListMap[userId]) {
                    Object.entries(userListMap[userId]).forEach(([field, val]) => {
                        if (field === '$revision') return; // $revisionは除外
                        mergedRecord[`ユーザー台帳_${field}`] = val?.value ?? val;
                    });
                }
                finalMerged.push(mergedRecord);
            });
            // 4. CSV出力
            const csv = this.convertToCSV(finalMerged);
            this.downloadCSV(csv, 'all_data_export.csv');
        } catch (error) {
            alert('エクスポート中にエラーが発生しました: ' + error.message);
            console.error(error);
        }
    }

    // 配列→CSV変換
    convertToCSV(records) {
        if (!records.length) return '';
        // // 整合判定カラムを追加（廃止）
        // const dataIntegrator = window.dataIntegrator || new DataIntegrator();
        // records.forEach(record => {
        //     const integrationKey = record['統合キー'];
        //     const parsed = dataIntegrator.parseIntegrationKey(integrationKey);
        //     let isConsistent = true;
        //     let pc = record['PC台帳_PC番号'] ?? '';
        //     let parsedPC = parsed.PC ?? '';
        //     if (pc !== parsedPC) isConsistent = false;
        //     let ext = record['内線台帳_内線番号'] ?? '';
        //     let parsedEXT = parsed.EXT ?? '';
        //     if (ext !== parsedEXT) isConsistent = false;
        //     let seat = record['座席台帳_座席番号'] ?? '';
        //     let parsedSEAT = parsed.SEAT ?? '';
        //     if (seat !== parsedSEAT) isConsistent = false;
        //     record['整合判定'] = isConsistent ? '整合' : '不整合';
        // });

        // 必ずallFieldsを生成・フィルタ
        let allFields = Array.from(new Set(records.flatMap(r => Object.keys(r))));
        allFields = allFields.filter(f => !f.endsWith('_$revision') && !f.endsWith('_$id'));
        allFields = allFields.filter(f => f !== '統合キー' && !f.endsWith('_' + CONFIG.integrationKey));
        // 整合判定列は廃止
        // allFields = ['整合判定', '統合キー', ...allFields.filter(f => f !== '整合判定' && f !== '統合キー')];
        allFields = ['統合キー', ...allFields.filter(f => f !== '統合キー')];

        // 並び順制御
        const mainOrder = [
            // '整合判定',
            '統合キー',
            'PC台帳',
            'ユーザー台帳',
            '内線台帳',
            '座席台帳'
        ];
        const fieldOrder = [
            'レコード番号', '作成者', '作成日時', '更新者', '更新日時', 'PC番号', '内線番号', '座席番号'
        ];

        // --- ここから必須ユーティリティ関数（削除禁止） ---
        // ISO8601（Z付き）形式かどうか
        function isISO8601Z(str) {
            return typeof str === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(str);
        }
        // JST変換関数
        function formatToJST(datetimeStr) {
            if (!datetimeStr) return '';
            const date = new Date(datetimeStr);
            if (isNaN(date)) return datetimeStr;
            const yyyy = date.getFullYear();
            const mm = String(date.getMonth() + 1).padStart(2, '0');
            const dd = String(date.getDate()).padStart(2, '0');
            const hh = String(date.getHours()).padStart(2, '0');
            const min = String(date.getMinutes()).padStart(2, '0');
            return `${yyyy}/${mm}/${dd} ${hh}:${min}`;
        }
        // --- ここまで必須ユーティリティ関数（削除禁止） ---
        function groupFields(fields, groupName) {
            return fields.filter(f => f.startsWith(groupName + '_'));
        }
        function sortGroupFields(fields, groupName) {
            const ordered = [];
            fieldOrder.forEach(field => {
                const fullName = groupName + '_' + field;
                const idx = fields.indexOf(fullName);
                if (idx !== -1) {
                    ordered.push(fullName);
                    fields.splice(idx, 1);
                }
            });
            // 残りはそのまま
            return [...ordered, ...fields];
        }
        let finalFields = [];
        mainOrder.forEach(group => {
            if (group === '統合キー') {
                finalFields.push('統合キー');
            } else {
                let groupFieldsArr = groupFields(allFields, group);
                groupFieldsArr = sortGroupFields(groupFieldsArr, group);
                finalFields.push(...groupFieldsArr);
            }
        });
        // 残りのフィールド（どのグループにも属さないもの）
        const used = new Set(finalFields);
        finalFields = finalFields.concat(allFields.filter(f => !used.has(f)));

        // 1行目: 台帳名
        const ledgerRow = finalFields.map(f => f === '統合キー' ? '統合キー' : f.split('_')[0]).join(',');
        // 2行目: フィールド名
        const fieldRow = finalFields.map(f => f === '統合キー' ? '統合キー' : f.split('_').slice(1).join('_')).join(',');
        const rows = records.map(r =>
            finalFields.map(f => {
                let v = r[f];
                if (v && typeof v === 'object' && 'value' in v) v = v.value;
                // 作成者・更新者など{code, name}オブジェクトの場合はcodeのみ出力
                if (v && typeof v === 'object' && 'code' in v && 'name' in v) v = v.code;
                if (v === undefined || v === null) v = '';
                // ISO8601（Z付き）形式ならJST変換
                if (isISO8601Z(v)) {
                    v = formatToJST(v);
                }
                v = String(v).replace(/"/g, '""');
                if (v.includes(',') || v.includes('"') || v.includes('\n')) v = `"${v}"`;
                return v;
            }).join(',')
        );
        return [ledgerRow, fieldRow, ...rows].join('\r\n');
    }

    // CSVダウンロード
    downloadCSV(csv, filename) {
        // UTF-8 BOMを付与
        const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
        const blob = new Blob([bom, csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
    }

    /**
     * 更新履歴データを読み込んで表示
     */
    async loadHistoryData() {
        const historyContainer = document.querySelector('#tab-history .history-container');
        if (!historyContainer) return;

        // ローディング表示
        historyContainer.innerHTML = '<div class="loading-message">履歴データを読み込み中...</div>';

        try {
            // 履歴管理アプリからデータを取得
            const historyRecords = await this.fetchHistoryRecords();
            
            if (historyRecords.length === 0) {
                historyContainer.innerHTML = '<div class="no-results-message">更新履歴がありません</div>';
                return;
            }

            // 履歴テーブルを作成
            const historyTable = this.createHistoryTable(historyRecords);
            historyContainer.innerHTML = '';
            historyContainer.appendChild(historyTable);

        } catch (error) {
            console.error('履歴データ読み込みエラー:', error);
            historyContainer.innerHTML = `<div class="error-message">履歴データの読み込みに失敗しました: ${error.message}</div>`;
        }
    }

    /**
     * 履歴管理アプリからデータを取得
     */
    async fetchHistoryRecords() {
        const appId = CONFIG.historyApp.appId;
        const query = 'order by $id desc limit 500'; // 最新500件を取得

        try {
            const response = await kintone.api(kintone.api.url('/k/v1/records', true), 'GET', {
                app: appId,
                query: query
            });
            console.log(`履歴データ取得:}`, response);
            return response.records || [];
        } catch (error) {
            console.error('履歴データ取得エラー:', error);
            throw error;
        }
    }

    /**
     * 履歴テーブルを作成（行単位: 変更前/変更後を2行で表示）
     */
    createHistoryTable(records) {
        const table = DOMHelper.createElement('table', {}, 'history-table');

        // ヘッダー
        const thead = DOMHelper.createElement('thead');
		const headerRow = DOMHelper.createElement('tr');
		const headers = ['バッチ日時', '更新者', 'バッチID', 'PC台帳', '内線台帳', '座席台帳', '統合キー―', '更新内容', '結果', '詳細'];
		headers.forEach(text => {
			const th = DOMHelper.createElement('th');
			th.textContent = text;
			if (text === 'PC台帳') th.className = 'col-pc';
			if (text === '内線台帳') th.className = 'col-ext';
			if (text === '座席台帳') th.className = 'col-seat';
			headerRow.appendChild(th);
		});
        thead.appendChild(headerRow);
        table.appendChild(thead);

        // 本文
        const tbody = DOMHelper.createElement('tbody');

        // ソート: バッチIDに含まれる日時（秒精度）を優先して降順
        const batchIdToEpoch = (id) => {
            if (!id || typeof id !== 'string') return 0;
            const m = id.match(/^batch_(\d{8})_(\d{6})_/);
            if (!m) return 0;
            const d = m[1];
            const t = m[2];
            const yyyy = parseInt(d.slice(0,4), 10);
            const MM   = parseInt(d.slice(4,6), 10);
            const dd   = parseInt(d.slice(6,8), 10);
            const hh   = parseInt(t.slice(0,2), 10);
            const mm   = parseInt(t.slice(2,4), 10);
            const ss   = parseInt(t.slice(4,6), 10);
            const date = new Date(yyyy, MM - 1, dd, hh, mm, ss);
            return date.getTime() || 0;
        };

		const sorted = [...records].sort((a, b) => {
            const ab = a[CONFIG.historyApp.fields.batchId]?.value || '';
            const bb = b[CONFIG.historyApp.fields.batchId]?.value || '';
            const ae = batchIdToEpoch(ab);
            const be = batchIdToEpoch(bb);
            if (ae !== be) return be - ae; // バッチ時刻で降順
            return bb.localeCompare(ab);    // 同秒の場合はID文字列で降順
        });

        // 集約: 同一バッチで (前PC/前内線/前座席/後PC/後内線/後座席) が同じものは1件にまとめ、
        // 各レコードの「その他（前/後）」を結合して1件に集約
        const aggregatedMap = new Map();
        const parseIk = (ikText, comp /* 'PC' | 'EXT' | 'SEAT' */) => {
            if (!ikText) return '';
            try {
                const di = window.dataIntegrator || new DataIntegrator();
                const parsed = di.parseIntegrationKey(ikText);
                return (parsed && parsed[comp]) ? parsed[comp] : '';
            } catch (e) { return ''; }
        };
        const valOf = (rec, field) => {
            const v = rec[field];
            return v && v.value !== undefined ? v.value : (v || '');
        };
        // 更新内容テキストから変更フィールド名集合を抽出
        const parseChangedFields = (rec) => {
            try {
                const text = valOf(rec, CONFIG.historyApp.fields.changeContent) || '';
                const set = new Set();
                text.split('\n').forEach(line => {
                    const m = line.match(/^【(.+?)】/);
                    if (m && m[1]) set.add(m[1].trim());
                });
                return set;
            } catch (e) { return new Set(); }
        };
        const mergeCsv = (base, add) => {
            if (!base) return add || '';
            if (!add) return base || '';
            const set = new Set();
            base.split(',').filter(Boolean).forEach(v => set.add(v));
            add.split(',').filter(Boolean).forEach(v => set.add(v));
            return Array.from(set).join(',');
        };

		// 指定セル内リンクをセル幅に合わせて縮小
		const shrinkAnchorToFit = (anchorEl, containerTd, minPx = 9, basePx = 12) => {
			try {
				const apply = () => {
					if (!anchorEl || !containerTd) return;
					let fontSize = basePx;
					anchorEl.style.fontSize = fontSize + 'px';
					const maxWidth = containerTd.clientWidth || parseInt(getComputedStyle(containerTd).width || '0', 10);
					if (!maxWidth) return;
					let guard = 6; // 最大6段階
					while (guard-- > 0 && fontSize > minPx && anchorEl.scrollWidth > maxWidth) {
						fontSize -= 1;
						anchorEl.style.fontSize = fontSize + 'px';
					}
				};
				requestAnimationFrame(apply);
			} catch (e) { /* noop */ }
		};

		sorted.forEach(r => {
            const batchId = r[CONFIG.historyApp.fields.batchId]?.value || '';
            const bPC = valOf(r, CONFIG.historyApp.fields.beforePCNumber)  || parseIk(r[CONFIG.historyApp.fields.integrationKeyBefore]?.value, 'PC');
            const bEX = valOf(r, CONFIG.historyApp.fields.beforeExtNumber) || parseIk(r[CONFIG.historyApp.fields.integrationKeyBefore]?.value, 'EXT');
            const bSE = valOf(r, CONFIG.historyApp.fields.beforeSeatNumber)|| parseIk(r[CONFIG.historyApp.fields.integrationKeyBefore]?.value, 'SEAT');
            const aPC = valOf(r, CONFIG.historyApp.fields.afterPCNumber)   || parseIk(r[CONFIG.historyApp.fields.integrationKeyAfter]?.value, 'PC');
            const aEX = valOf(r, CONFIG.historyApp.fields.afterExtNumber)  || parseIk(r[CONFIG.historyApp.fields.integrationKeyAfter]?.value, 'EXT');
            const aSE = valOf(r, CONFIG.historyApp.fields.afterSeatNumber) || parseIk(r[CONFIG.historyApp.fields.integrationKeyAfter]?.value, 'SEAT');
            const key = [batchId, bPC, bEX, bSE, aPC, aEX, aSE].join('\u0001');
            const bPCO = valOf(r, CONFIG.historyApp.fields.beforePCOthers) || '';
            const bEXO = valOf(r, CONFIG.historyApp.fields.beforeExtOthers) || '';
            const bSEO = valOf(r, CONFIG.historyApp.fields.beforeSeatOthers) || '';
            const aPCO = valOf(r, CONFIG.historyApp.fields.afterPCOthers) || '';
            const aEXO = valOf(r, CONFIG.historyApp.fields.afterExtOthers) || '';
            const aSEO = valOf(r, CONFIG.historyApp.fields.afterSeatOthers) || '';
            const ledgerNm = r[CONFIG.historyApp.fields.ledgerName]?.value || '';
            const changeTxt = valOf(r, CONFIG.historyApp.fields.changeContent) || '';
            const linkAppId = valOf(r, CONFIG.historyApp.fields.appId) || '';
            const linkRecordId = valOf(r, CONFIG.historyApp.fields.recordId) || '';
            if (!aggregatedMap.has(key)) {
                const entry = { base: r, bPC, bEX, bSE, aPC, aEX, aSE, bPCO, bEXO, bSEO, aPCO, aEXO, aSEO, ledgerNames: new Set(), changeLines: new Set(), ledgerLinks: new Map() };
                if (ledgerNm) entry.ledgerNames.add(ledgerNm);
                (String(changeTxt).split('\n').map(s => s.trim()).filter(Boolean)).forEach(line => entry.changeLines.add(line));
                if (ledgerNm && linkAppId && linkRecordId) {
                    const token = `${String(linkAppId)}|${String(linkRecordId)}`;
                    const set = entry.ledgerLinks.get(ledgerNm) || new Set();
                    set.add(token);
                    entry.ledgerLinks.set(ledgerNm, set);
                }
                aggregatedMap.set(key, entry);
            } else {
                const agg = aggregatedMap.get(key);
                agg.bPCO = mergeCsv(agg.bPCO, bPCO);
                agg.bEXO = mergeCsv(agg.bEXO, bEXO);
                agg.bSEO = mergeCsv(agg.bSEO, bSEO);
                agg.aPCO = mergeCsv(agg.aPCO, aPCO);
                agg.aEXO = mergeCsv(agg.aEXO, aEXO);
                agg.aSEO = mergeCsv(agg.aSEO, aSEO);
                if (ledgerNm) agg.ledgerNames.add(ledgerNm);
                (String(changeTxt).split('\n').map(s => s.trim()).filter(Boolean)).forEach(line => agg.changeLines.add(line));
                if (ledgerNm && linkAppId && linkRecordId) {
                    const token = `${String(linkAppId)}|${String(linkRecordId)}`;
                    const set = agg.ledgerLinks.get(ledgerNm) || new Set();
                    set.add(token);
                    agg.ledgerLinks.set(ledgerNm, set);
                }
            }
        });

        const textOr = (val) => (val && typeof val === 'string') ? val : (val && val.value !== undefined ? val.value : (val || ''));

		// 空値を「(空)」で明示表示
		const formatEmpty = (v) => (v === undefined || v === null || v === '' ? '(空)' : v);

		// その他カラム用: CSV("階:21,備考:...") を Map に解釈
		const parseOthersCsv = (csv) => {
			const map = new Map();
			(String(csv || ''))
				.split(',')
				.map(s => s.trim())
				.filter(Boolean)
				.forEach(token => {
					const idx = token.indexOf(':');
					if (idx === -1) {
						// ラベルのみの場合は値なしとして扱う
						map.set(token, '');
					} else {
						const key = token.slice(0, idx).trim();
						const val = token.slice(idx + 1).trim();
						map.set(key, val);
					}
				});
			return map;
		};

		// その他カラム用: 前後のキーを突合し、欠落側は「ラベル:(空)」で整形
		const buildOthersTexts = (beforeCsv, afterCsv) => {
			const bMap = parseOthersCsv(beforeCsv);
			const aMap = parseOthersCsv(afterCsv);
			const keys = Array.from(new Set([...bMap.keys(), ...aMap.keys()]));
			const beforeText = keys.map(k => `${k}:${formatEmpty(bMap.get(k) ?? '')}`).join(',');
			const afterText  = keys.map(k => `${k}:${formatEmpty(aMap.get(k) ?? '')}`).join(',');
			return { beforeText, afterText };
		};

		// 値ノードを生成（(空)はピル表示、変更後は強調）
		const createValueNode = (value, isAfter = false) => {
			const text = formatEmpty(value);
			if (text === '(空)') {
				const badge = document.createElement('span');
				badge.className = 'pill';
				badge.textContent = '(空)';
				return badge;
			}
			const span = document.createElement('span');
			if (isAfter) span.className = 'v-after';
			span.textContent = String(text);
			return span;
		};

        // バッチIDの表示短縮（末尾6文字）
        const shortBatchId = (id) => {
            if (!id) return '';
            return id.length <= 10 ? id : '…' + id.slice(-6);
        };

        // バッチIDから日時文字列を生成（YYYY/MM/DD HH:MM:SS）
        const formatBatchTime = (id) => {
            if (!id || typeof id !== 'string') return '';
            const m = id.match(/^batch_(\d{8})_(\d{6})_/);
            if (!m) return '';
            const d = m[1];
            const t = m[2];
            const yyyy = d.slice(0,4);
            const MM   = d.slice(4,6);
            const dd   = d.slice(6,8);
            const hh   = t.slice(0,2);
            const mm   = t.slice(2,4);
            const ss   = t.slice(4,6);
            return `${yyyy}/${MM}/${dd} ${hh}:${mm}:${ss}`;
        };

        // フィールド→台帳のマップ（その他の列判定に使用）
        const fieldToLedger = new Map();
        try { CONFIG.integratedTableConfig.columns.forEach(col => { if (col && col.fieldCode) fieldToLedger.set(col.fieldCode, col.ledger); }); } catch (ee) { /* noop */ }

        let currentBatchId = null;
        let alternate = false;
        const seen = new Set();
        Array.from(aggregatedMap.values()).forEach(entry => {
            const rec = entry.base;
            const updater = rec[CONFIG.historyApp.fields.updater]?.value || {};
            const updaterName = updater?.name || '';
            const batchId = rec[CONFIG.historyApp.fields.batchId]?.value || '';

            if (batchId !== currentBatchId) { alternate = !alternate; currentBatchId = batchId; }

            // 重複抑止（同一バッチ・同一統合キー前後は1回のみ）
            let ikBefore = textOr(rec[CONFIG.historyApp.fields.integrationKeyBefore]) || '';
            let ikAfter  = textOr(rec[CONFIG.historyApp.fields.integrationKeyAfter]) || '';
            const sig = [batchId, ikBefore, ikAfter].join('|');
            if (seen.has(sig)) return;
            seen.add(sig);

            // 統合キー統合: 前後の差分を1セルに凝縮
            ikBefore = textOr(rec[CONFIG.historyApp.fields.integrationKeyBefore]) || '';
            ikAfter  = textOr(rec[CONFIG.historyApp.fields.integrationKeyAfter]) || '';
            const splitIk = (txt) => {
                const res = { PC: '', EXT: '', SEAT: '' };
                (String(txt).split('|').map(s => s.trim()).filter(Boolean)).forEach(part => {
                    const idx = part.indexOf(':');
                    if (idx === -1) return;
                    const k = part.slice(0, idx).trim();
                    const v = part.slice(idx + 1).trim();
                    if (k in res) res[k] = v;
                });
                return res;
            };
            const b = splitIk(ikBefore), a = splitIk(ikAfter);
            const buildKeyNode = (label, bv, av) => {
                const same = (bv || '') === (av || '');
                const frag = document.createElement('span');
                const lbl = document.createElement('span'); lbl.textContent = `${label}:`;
                frag.appendChild(lbl);
                if (same) {
                    frag.appendChild(document.createTextNode(`${bv || '(空)'} | `));
                    return frag;
                }
                // 変更あり → 矢印（→）と赤太字
                const before = document.createElement('span'); before.textContent = bv || '(空)'; before.className = 'diff-before';
                const arrow = document.createElement('span'); arrow.textContent = '→'; arrow.className = 'diff-arrow';
                const after = document.createElement('span'); after.textContent = av || '(空)'; after.className = 'diff-after';
                frag.appendChild(before);
                frag.appendChild(arrow);
                frag.appendChild(after);
                frag.appendChild(document.createTextNode(' | '));
                return frag;
            };

            // 更新内容（主キーは非表示に統合済みのため除外）
            const contentLines = Array.from(entry.changeLines || [])
                .filter(line => {
                    const m = line.match(/^【(.+?)】/);
                    if (!m) return false;
                    const f = m[1];
                    return !(f === 'PC番号' || f === '内線番号' || f === '座席番号');
                });

            const tr = DOMHelper.createElement('tr');
            if (alternate) tr.style.backgroundColor = '#e6f3ff';

            const c0 = DOMHelper.createElement('td'); c0.textContent = formatBatchTime(batchId);
            const c1 = DOMHelper.createElement('td'); c1.textContent = updaterName;
            const c2 = DOMHelper.createElement('td'); c2.textContent = batchId;
            // 台帳別リンク（PC/内線/座席）
			const makeLedgerCell = (ledgerLabel) => {
                const td = DOMHelper.createElement('td');
                if (ledgerLabel === 'PC台帳') td.className = 'col-pc';
                if (ledgerLabel === '内線台帳') td.className = 'col-ext';
                if (ledgerLabel === '座席台帳') td.className = 'col-seat';
                const baseUrl = CONFIG.system.baseUrl || '';
                try {
                    const linksSet = entry.ledgerLinks ? entry.ledgerLinks.get(ledgerLabel) : null;
                    const tokens = linksSet ? Array.from(linksSet) : [];
                    if (!tokens.length) { td.textContent = ''; return td; }
					tokens.forEach((token, idx) => {
                        const [appIdStr, recIdStr] = String(token).split('|');
                        if (appIdStr && recIdStr) {
                            const a = document.createElement('a');
                            a.href = `${baseUrl}/${appIdStr}/show#record=${recIdStr}`;
                            a.textContent = recIdStr;
                            a.target = '_blank';
                            a.style.textDecoration = 'underline';
                            a.style.color = '#0066cc';
                            td.appendChild(a);
							// セル幅に合わせてフォントを縮小
							shrinkAnchorToFit(a, td);
                            if (idx < tokens.length - 1) td.appendChild(document.createTextNode(', '));
                        }
                    });
                } catch (e) { td.textContent = ''; }
                return td;
            };

            const c3 = makeLedgerCell('PC台帳');
            const c4 = makeLedgerCell('内線台帳');
            const c5 = makeLedgerCell('座席台帳');

            const c6 = DOMHelper.createElement('td');
            // build compactKey nodes
            const keyWrap = document.createElement('span');
            keyWrap.appendChild(buildKeyNode('PC', b.PC, a.PC));
            keyWrap.appendChild(buildKeyNode('内線', b.EXT, a.EXT));
            keyWrap.appendChild(buildKeyNode('座席', b.SEAT, a.SEAT));
            // trim trailing separator
            if (keyWrap.lastChild && keyWrap.lastChild.nodeType === Node.TEXT_NODE) {
                keyWrap.lastChild.textContent = keyWrap.lastChild.textContent.replace(/\s\|\s?$/, '');
            }
            c6.appendChild(keyWrap);
            const c7 = DOMHelper.createElement('td');
            // 1行ずつ構築し、「→」以降（変更後の値）を太字・赤で表示
            contentLines.forEach(line => {
                const row = document.createElement('div');
                // ラベル【...】がある場合はラベル部分は装飾せず、その後ろの値のみを装飾
                const labelMatch = line.match(/^【[^】]+】\s*/);
                let rest = line;
                if (labelMatch) {
                    const labelText = labelMatch[0];
                    row.appendChild(document.createTextNode(labelText));
                    rest = line.slice(labelText.length);
                }
                const idx = rest.indexOf('→');
                if (idx !== -1) {
                    const beforeText = rest.slice(0, idx);
                    const afterText = rest.slice(idx + 1);
                    const before = document.createElement('span');
                    before.className = 'diff-before';
                    before.textContent = beforeText;
                    row.appendChild(before);
                    const arrow = document.createElement('span');
                    arrow.className = 'diff-arrow';
                    arrow.textContent = '→';
                    row.appendChild(arrow);
                    const after = document.createElement('span');
                    after.className = 'diff-after';
                    after.textContent = afterText;
                    row.appendChild(after);
                } else {
                    // 矢印がない行はそのまま（ラベルがあればラベルのみ追加済）
                    if (!labelMatch) {
                        row.textContent = line;
                    }
                }
                c7.appendChild(row);
            });
            // 結果
            const c8 = DOMHelper.createElement('td');
            const resultVal = rec[CONFIG.historyApp.fields.result]?.value || '';
            c8.textContent = resultVal;
            c8.className = resultVal === 'success' ? 'success' : (resultVal ? 'failure' : '');

            // 詳細（request/response をモーダルで表示）
            const c9 = DOMHelper.createElement('td');
            const detailBtn = DOMHelper.createElement('button', {}, 'detail-btn');
            detailBtn.textContent = '詳細';
            detailBtn.addEventListener('click', () => {
                try {
                    const req = rec[CONFIG.historyApp.fields.request]?.value || '';
                    const res = rec[CONFIG.historyApp.fields.response]?.value || '';
                    const err = rec[CONFIG.historyApp.fields.error]?.value || '';
                    const parts = [];
                    if (req) parts.push(`Request:\n${req}`);
                    if (res) parts.push(`Response:\n${res}`);
                    if (err) parts.push(`Error:\n${err}`);
                    const text = parts.join('\n\n') || '詳細情報がありません';
                    alert(text);
                } catch (e) {
                    alert('詳細の取得に失敗しました');
                }
            });
            c9.appendChild(detailBtn);

            [c0,c1,c2,c3,c4,c5,c6,c7,c8,c9].forEach(td => tr.appendChild(td));
            tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        try { this.mergeHistoryTableCells(table); } catch (e) { /* noop */ }
        return table;
    }

    // バッチIDが同じ行に限り、同一値のセルを縦結合
    mergeHistoryTableCells(table) {
        if (!table) return;
        const tbody = table.querySelector('tbody');
        if (!tbody) return;
        // 現在のヘッダー構成に基づく列インデックス
        // 0:バッチ日時,1:更新者,2:バッチID,3:PC台帳,4:内線台帳,5:座席台帳,6:統合キー―,7:更新内容,8:結果,9:詳細
        const batchColIdx = 2;
        const maxCols = 10;
        // 更新内容(7)・詳細(9)は結合しない（結果(8)は結合対象）
        const colsToMerge = [0,1,2,3,4,5,6,8];
        colsToMerge.forEach(colIdx => {
            let prevCell = null;
            let prevValue = null;
            let prevBatch = null;
            let rowspan = 1;
            const rows = Array.from(tbody.rows);
            rows.forEach((tr, i) => {
                if (tr.cells.length < maxCols) return; // 保険
                const batchCell = tr.cells[batchColIdx];
                const cell = tr.cells[colIdx];
                if (!cell || !batchCell) return;
                const batchVal = batchCell.textContent || '';
                const value = cell.textContent || '';
                if (prevCell && batchVal === prevBatch && value === prevValue) {
                    rowspan += 1;
                    prevCell.rowSpan = rowspan;
                    cell.style.display = 'none';
                } else {
                    // リセット
                    prevCell = cell;
                    prevValue = value;
                    prevBatch = batchVal;
                    rowspan = 1;
                }
            });
        });
    }

    /**
     * ISO8601形式の日時をJST（+9時間）に変換してYYYY/MM/DD HH:MM:SS形式で返す
     */
    formatUpdatedTime(iso8601String) {
        if (!iso8601String) return '';
        
        try {
            const date = new Date(iso8601String);
            
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hour = String(date.getHours()).padStart(2, '0');
            const minute = String(date.getMinutes()).padStart(2, '0');
            //const second = String(date.getSeconds()).padStart(2, '0');
            
            //return `${year}/${month}/${day} ${hour}:${minute}:${second}`;
            return `${year}/${month}/${day} ${hour}:${minute}`;
        } catch (error) {
            console.error('日時フォーマットエラー:', error);
            return iso8601String;
        }
    }

    /**
     * 履歴テーブルの行を作成
     */
    createHistoryTableRow(record, isAlternateRow = false) {
        const row = DOMHelper.createElement('tr');
        
        // バッチIDが同じ行は背景色を設定
        if (isAlternateRow) {
            row.style.backgroundColor = '#e6f3ff';
        }
        
        // 更新日時
        const updatedTimeCell = DOMHelper.createElement('td');
        const updatedTime = record[CONFIG.historyApp.fields.updatedTime]?.value;
        updatedTimeCell.textContent = this.formatUpdatedTime(updatedTime);
        row.appendChild(updatedTimeCell);

        // 更新者 (code)
        const updaterCodeCell = DOMHelper.createElement('td');
        const updater = record[CONFIG.historyApp.fields.updater]?.value;
        updaterCodeCell.textContent = updater?.code || '';
        row.appendChild(updaterCodeCell);

        // 更新者 (name)
        const updaterNameCell = DOMHelper.createElement('td');
        updaterNameCell.textContent = updater?.name || '';
        row.appendChild(updaterNameCell);
   
        // バッチID
        const batchIdCell = DOMHelper.createElement('td');
        batchIdCell.textContent = record[CONFIG.historyApp.fields.batchId]?.value || '';
        row.appendChild(batchIdCell);
   
        // 統合キー(変更前)
        const ikBeforeCell = DOMHelper.createElement('td');
        this.renderIntegrationKeyCell(ikBeforeCell, record[CONFIG.historyApp.fields.integrationKeyBefore]?.value || '');
        // append later in order
   
        // 統合キー(変更後)
        const ikAfterCell = DOMHelper.createElement('td');
        this.renderIntegrationKeyCell(ikAfterCell, record[CONFIG.historyApp.fields.integrationKeyAfter]?.value || '');
        // append later in order

        // 台帳名
        const ledgerNameCell = DOMHelper.createElement('td');
        ledgerNameCell.textContent = record[CONFIG.historyApp.fields.ledgerName]?.value || '';
        // append later in order

        // レコードID（リンク）
        const recordIdCell = DOMHelper.createElement('td');
        const recordId = record[CONFIG.historyApp.fields.recordId]?.value;
        const appId = record[CONFIG.historyApp.fields.appId]?.value;
        
        if (recordId && appId) {
            const recordLink = DOMHelper.createElement('a');
            recordLink.href = `${CONFIG.system.baseUrl}/${appId}/show#record=${recordId}`;
            recordLink.textContent = recordId;
            recordLink.target = '_blank';
            recordLink.style.textDecoration = 'underline';
            recordLink.style.color = '#0066cc';
            recordIdCell.appendChild(recordLink);
        } else {
            recordIdCell.textContent = recordId || '';
        }
        // append later in order

        // 主キー（表示専用）
        const primaryKeyCell = DOMHelper.createElement('td');
        primaryKeyCell.textContent = record[CONFIG.historyApp.fields.primaryKey]?.value || '';
        // append later in order

        // 更新内容
        const changeCell = DOMHelper.createElement('td');
        changeCell.textContent = record[CONFIG.historyApp.fields.changeContent]?.value || '';
        // 改行を反映して表示
        changeCell.style.whiteSpace = 'pre-line';
        // append later in order

        // 結果
        const resultCell = DOMHelper.createElement('td');
        const result = record[CONFIG.historyApp.fields.result]?.value || '';
        resultCell.textContent = result;
        resultCell.className = result === 'success' ? 'success' : 'failure';
        // append later in order

        // 詳細ボタン
        const detailCell = DOMHelper.createElement('td');
        const detailBtn = DOMHelper.createElement('button', {}, 'detail-btn');
        detailBtn.textContent = '詳細';
        detailBtn.addEventListener('click', () => this.showHistoryDetail(record));
        detailCell.appendChild(detailBtn);
        // append later in order

        // === append cells in requested order ===
        row.appendChild(ikBeforeCell);    // 統合キー(変更前)
        row.appendChild(ikAfterCell);     // 統合キー(変更後)
        row.appendChild(recordIdCell);    // レコードID
        row.appendChild(ledgerNameCell);  // 台帳名
        row.appendChild(primaryKeyCell);  // 主キー
        row.appendChild(changeCell);      // 更新内容
        row.appendChild(resultCell);      // 結果
        row.appendChild(detailCell);      // 詳細

        return row;
    }

    // 履歴テーブル用: 統合キーを「ＰＣ/内線/座席」の複数行で表示（空は非表示）
    renderIntegrationKeyCell(td, integrationKeyText) {
        try {
            while (td.firstChild) td.removeChild(td.firstChild);
            const text = typeof integrationKeyText === 'string' ? integrationKeyText : '';
            if (!text) { td.textContent = ''; return; }
            const labels = { PC: 'ＰＣ', EXT: '内線', SEAT: '座席' };
            const values = { PC: '', EXT: '', SEAT: '' };
            text.split('|').forEach(part => {
                const idx = part.indexOf(':');
                if (idx === -1) return;
                const key = part.slice(0, idx).trim();
                const val = part.slice(idx + 1).trim();
                if (key in values) values[key] = val;
            });
            let printed = false;
            ['PC','EXT','SEAT'].forEach(k => {
                const v = values[k];
                if (v) {
                    const line = document.createElement('div');
                    line.textContent = `${labels[k]}:${v}`;
                    if (k === 'PC') line.className = 'ik-line-pc';
                    else if (k === 'EXT') line.className = 'ik-line-ext';
                    else if (k === 'SEAT') line.className = 'ik-line-seat';
                    td.appendChild(line);
                    printed = true;
                }
            });
            if (!printed) td.textContent = '';
        } catch (e) {
            // フォールバック: 生文字表示
            td.textContent = integrationKeyText || '';
        }
    }

    /**
     * 履歴詳細を表示
     */
    showHistoryDetail(record) {
        const updater = record[CONFIG.historyApp.fields.updater]?.value;
        const detail = {
            '更新日時': this.formatUpdatedTime(record[CONFIG.historyApp.fields.updatedTime]?.value),
            '更新者 (code)': updater?.code || '',
            '更新者 (name)': updater?.name || '',
            'バッチID': record[CONFIG.historyApp.fields.batchId]?.value || '',
            '統合キー(変更前)': record[CONFIG.historyApp.fields.integrationKeyBefore]?.value || '',
            '統合キー(変更後)': record[CONFIG.historyApp.fields.integrationKeyAfter]?.value || '',
            'レコードID': record[CONFIG.historyApp.fields.recordId]?.value || '',
            'アプリID': record[CONFIG.historyApp.fields.appId]?.value || '',
            '台帳名': record[CONFIG.historyApp.fields.ledgerName]?.value || '',
            '結果': record[CONFIG.historyApp.fields.result]?.value || '',
            '更新内容': record[CONFIG.historyApp.fields.changeContent]?.value || '',
            'リクエスト': record[CONFIG.historyApp.fields.request]?.value || '',
            'レスポンス': record[CONFIG.historyApp.fields.response]?.value || '',
            'エラー': record[CONFIG.historyApp.fields.error]?.value || ''
        };

        let detailText = '';
        Object.entries(detail).forEach(([key, value]) => {
            if (value) {
                detailText += `${key}: ${value}\n`;
            }
        });

        alert(detailText || '詳細情報がありません');
    }

    /**
     * search-results要素の表示・非表示を切り替え
     */
    toggleSearchResultsVisibility(appId) {
        const searchResultsElement = document.getElementById(CONFIG.system.resultsContainerId);
        if (!searchResultsElement) {
            console.warn('search-results要素が見つかりません');
            return;
        }

        // 設定タブ/更新履歴タブ/座席表タブ/貸出管理 の場合は非表示（貸出は独自ビューをタブ内に表示）
        if (appId === 'settings' || appId === 'history' || appId === 'seatmap' || appId === 'lending') {
            searchResultsElement.style.display = 'none';
            console.log(`📋 ${appId}タブ: search-results要素を非表示`);
        } else {
            // その他のタブ（台帳タブ）の場合は表示
            searchResultsElement.style.display = 'block';
            console.log(`📋 ${CONFIG.apps[appId]?.name || appId}タブ: search-results要素を表示`);

            // 表示切替直後は高さ計算がずれるため、非同期で再計算
            try {
                setTimeout(() => { if (window.adjustTableHeight) window.adjustTableHeight(); }, 0);
            } catch (e) { /* noop */ }
        }
    }

    /**
     * 不整合データを抽出して表示
     */
    async runInconsistencyExtraction() {
        try {
            const resultsContainer = document.getElementById(CONFIG.system.resultsContainerId);
            if (resultsContainer) {
                resultsContainer.innerHTML = '<div class="loading-message">不整合データを抽出中...</div>';
            }

            const dataIntegrator = window.dataIntegrator || new DataIntegrator();
            const allLedgerData = {};
            for (const appId of Object.keys(CONFIG.apps)) {
                allLedgerData[appId] = await window.searchEngine.searchRecordsWithQuery(appId, '');
            }

            const integrated = await dataIntegrator.buildInconsistencyIntegratedData(allLedgerData);
            if (window.tableRenderer) {
                const sorted = dataIntegrator.sortIntegratedRowsByRelatedness(integrated || []);

                // 並び順の統合キーをログ出力
                try {
                    const lines = (sorted || []).map((row, idx) => {
                        let key = '';
                        try {
                            if (window.virtualScroll && typeof window.virtualScroll.generateIntegrationKeyFromRow === 'function') {
                                key = window.virtualScroll.generateIntegrationKeyFromRow(row) || '';
                            } else {
                                const pc = row['PC台帳_PC番号'] || '';
                                const ext = row['内線台帳_内線番号'] || '';
                                const seat = row['座席台帳_座席番号'] || '';
                                key = `PC:${pc}|EXT:${ext}|SEAT:${seat}`;
                            }
                        } catch (e) { /* noop */ }
                        return `${String(idx + 1).padStart(4, ' ')}: ${key}`;
                    });
                    console.log(`\n==== 不整合タブ 並び替え結果 (${sorted.length}件) ====`);
                    lines.forEach(l => console.log(l));
                    console.log('==== ここまで ====' );
                } catch (e) { /* noop */ }

                // ローディングを消去
                try {
                    const rc = document.getElementById(CONFIG.system.resultsContainerId);
                    if (rc) {
                        const lm = rc.querySelector('.loading-message');
                        if (lm) lm.remove();
                    }
                } catch (e) { /* noop */ }

                // 通常の列構成で表示
                window.tableRenderer.displayIntegratedTable('inconsistency', sorted);
            }
        } catch (error) {
            console.error('不整合抽出エラー:', error);
            // ローディングを消去
            try {
                const rc = document.getElementById(CONFIG.system.resultsContainerId);
                if (rc) {
                    const lm = rc.querySelector('.loading-message');
                    if (lm) lm.remove();
                }
            } catch (e) { /* noop */ }
            alert(`不整合抽出中にエラーが発生しました。\n詳細: ${error.message}`);
        }
    }
}

// グローバルに公開
window.TabManager = TabManager; 