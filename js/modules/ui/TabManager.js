/**
 * タブ管理クラス
 */
class TabManager {
    constructor() {
        this.currentActiveTab = null;
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

        // 設定タブのタブコンテンツを追加
        const settingsContent = DOMHelper.createElement('div', { id: 'tab-settings' }, 'tab-content');
        // ボタンと説明文を追加
        const exportBtn = DOMHelper.createElement('button', {}, 'export-all-btn');
        exportBtn.textContent = '全データ抽出';
        exportBtn.style.fontSize = '12px';
        exportBtn.addEventListener('click', () => this.exportAllData());
        settingsContent.appendChild(exportBtn);
        const info = DOMHelper.createElement('div', {}, 'export-info');
        info.textContent = '※全台帳を無条件でCSVファイル出力します';
        info.style.fontSize = '12px';
        settingsContent.appendChild(info);
        tabContainer.appendChild(settingsContent);

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

        // 設定タブ（右寄せ）
        const settingsTabButton = DOMHelper.createElement('button', {}, 'tab-button settings-tab');
        settingsTabButton.setAttribute('data-app', 'settings');
        settingsTabButton.textContent = '⚙️ 設定';
        settingsTabButton.addEventListener('click', () => this.switchTab('settings'));
        tabMenu.appendChild(settingsTabButton);

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

    /**
     * エラー用タブコンテンツを作成
     */
    createErrorTabContent(appId, error) {
        const tabContent = DOMHelper.createElement('div', {
            id: `tab-${appId}`
        }, 'tab-content error-tab');

        const errorMessage = DOMHelper.createElement('div', {}, 'error-message');
        errorMessage.innerHTML = `
            <h4>タブの初期化に失敗しました</h4>
            <p>アプリID: ${appId}</p>
            <p>エラー: ${error.message}</p>
            <button onclick="location.reload()">ページを再読み込み</button>
        `;
        
        tabContent.appendChild(errorMessage);
        return tabContent;
    }

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
        }

        this.currentActiveTab = appId;
    }

    /**
     * 個別タブ用のボタングループを作成
     */
    createIndividualButtonGroup(appId) {
        const buttonGroup = DOMHelper.createElement('div', {}, 'button-group');

        const searchButton = DOMHelper.createElement('button', {}, 'search-button');
        searchButton.textContent = '検索';
        searchButton.setAttribute('data-app-id', appId);
        searchButton.addEventListener('click', () => {
            if (window.searchEngine) {
                window.searchEngine.searchRecords(appId);
            }
        });

        const addSearchButton = DOMHelper.createElement('button', {}, 'add-search-button');
        addSearchButton.textContent = '追加検索';
        addSearchButton.setAttribute('data-app-id', appId);
        addSearchButton.addEventListener('click', () => {
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
            // 2. ユーザーリスト抽出
            const userListRecords = await dataIntegrator.searchUserListByUserIds(allLedgerData);
            console.log(userListRecords);
            // 3. データをマージ（統合キーで3台帳をマージ→ユーザーIDでユーザーリストをマージ）
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
            // ② ユーザーリストをユーザーIDでマージ
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
                // ユーザーIDでユーザーリスト情報を付与
                const userId = mergedRecord['PC台帳_ユーザーID'];
                if (userId && userListMap[userId]) {
                    Object.entries(userListMap[userId]).forEach(([field, val]) => {
                        if (field === '$revision') return; // $revisionは除外
                        mergedRecord[`ユーザーリスト_${field}`] = val?.value ?? val;
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
        // 整合判定カラムを追加
        const dataIntegrator = window.dataIntegrator || new DataIntegrator();
        records.forEach(record => {
            const integrationKey = record['統合キー'];
            const parsed = dataIntegrator.parseIntegrationKey(integrationKey);
            let isConsistent = true;
            // PC台帳_PC番号
            let pc = record['PC台帳_PC番号'] ?? '';
            let parsedPC = parsed.PC ?? '';
            if (pc !== parsedPC) isConsistent = false;
            // 内線台帳_内線番号
            let ext = record['内線台帳_内線番号'] ?? '';
            let parsedEXT = parsed.EXT ?? '';
            if (ext !== parsedEXT) isConsistent = false;
            // 座席台帳_座席番号
            let seat = record['座席台帳_座席番号'] ?? '';
            let parsedSEAT = parsed.SEAT ?? '';
            if (seat !== parsedSEAT) isConsistent = false;
            record['整合判定'] = isConsistent ? '整合' : '不整合';
        });

        // 必ずallFieldsを生成・フィルタ
        let allFields = Array.from(new Set(records.flatMap(r => Object.keys(r))));
        allFields = allFields.filter(f => !f.endsWith('_$revision') && !f.endsWith('_$id'));
        allFields = allFields.filter(f => f !== '統合キー' && !f.endsWith('_' + CONFIG.integrationKey));
        // 整合判定を先頭に
        allFields = ['整合判定', '統合キー', ...allFields.filter(f => f !== '整合判定' && f !== '統合キー')];

        // 並び順制御
        const mainOrder = [
            '整合判定',
            '統合キー',
            'PC台帳',
            'ユーザーリスト',
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
        let finalFields = ['整合判定'];
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
}

// グローバルに公開
window.TabManager = TabManager; 