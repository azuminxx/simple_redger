(function() {
    'use strict';

    /**
     * 統合台帳検索システム
     */
    class LedgerSearchSystem {
        constructor() {
            this.currentActiveTab = null;
            this.init();
        }

        /**
         * システムを初期化
         */
        init() {
            kintone.events.on('app.record.index.show', (event) => {
                if (event.viewName != CONFIG.system.viewName) {
                    return;
                }
                this.initializeSearchMenu();
                return event;
            });
        }

        /**
         * 検索メニューを初期化
         */
        initializeSearchMenu() {
            const searchMenuContainer = document.getElementById(CONFIG.system.searchMenuId);
            if (!searchMenuContainer) {
                console.error(CONFIG.system.messages.elementNotFound);
                return;
            }

            const tabContainer = this.createTabContainer();
            searchMenuContainer.appendChild(tabContainer);

            const firstAppId = Object.keys(CONFIG.apps)[0];
            this.switchTab(firstAppId);
        }

        /**
         * タブコンテナを作成
         */
        createTabContainer() {
            const tabContainer = document.createElement('div');
            tabContainer.className = 'tab-container';

            const tabMenu = this.createTabMenu();
            tabContainer.appendChild(tabMenu);

            Object.keys(CONFIG.apps).forEach(appId => {
                const tabContent = this.createTabContent(appId);
                tabContainer.appendChild(tabContent);
            });

            return tabContainer;
        }

        /**
         * タブメニューを作成
         */
        createTabMenu() {
            const tabMenu = document.createElement('div');
            tabMenu.className = 'tab-menu';

            Object.entries(CONFIG.apps).forEach(([appId, appConfig]) => {
                const tabButton = document.createElement('button');
                tabButton.className = 'tab-button';
                tabButton.setAttribute('data-app', appId);
                tabButton.textContent = appConfig.name;
                tabButton.addEventListener('click', () => this.switchTab(appId));
                
                tabMenu.appendChild(tabButton);
            });

            return tabMenu;
        }

        /**
         * タブコンテンツを作成
         */
        createTabContent(appId) {
            const appConfig = CONFIG.apps[appId];
            
            const tabContent = document.createElement('div');
            tabContent.className = 'tab-content';
            tabContent.id = `tab-${appId}`;

            const searchForm = this.createSearchForm(appId, appConfig);
            tabContent.appendChild(searchForm);

            return tabContent;
        }

        /**
         * 検索フォームを作成
         */
        createSearchForm(appId, appConfig) {
            const searchForm = document.createElement('div');
            searchForm.className = 'search-form';

            const fields = CONFIG.getAppFields(appId);
            fields.forEach(field => {
                const fieldGroup = document.createElement('div');
                fieldGroup.className = 'field-group';

                const label = document.createElement('label');
                label.textContent = field.label + ':';
                label.setAttribute('for', `${field.code}-${appId}`);

                let inputElement;

                if (field.type === 'dropdown') {
                    inputElement = this.createDropdownElement(field, appId);
                } else {
                    inputElement = this.createTextInputElement(field, appId);
                }

                fieldGroup.appendChild(label);
                fieldGroup.appendChild(inputElement);
                searchForm.appendChild(fieldGroup);
            });

            const buttonGroup = this.createButtonGroup(appId);
            searchForm.appendChild(buttonGroup);

            return searchForm;
        }

        /**
         * ドロップダウン要素を作成
         */
        createDropdownElement(field, appId) {
            const inputElement = this.createElement('select', {
                id: `${field.code}-${appId}`,
                name: field.code
            });

            field.options.forEach(option => {
                const optionElement = this.createElement('option', {
                    value: option
                });
                optionElement.textContent = option === '' ? '選択してください' : option;
                inputElement.appendChild(optionElement);
            });

            return inputElement;
        }

        /**
         * テキスト入力要素を作成
         */
        createTextInputElement(field, appId) {
            return this.createElement('input', {
                type: 'text',
                id: `${field.code}-${appId}`,
                name: field.code,
                placeholder: field.placeholder
            });
        }

        /**
         * DOM要素を作成するヘルパー関数
         */
        createElement(tagName, attributes = {}, className = '') {
            const element = document.createElement(tagName);
            
            Object.entries(attributes).forEach(([key, value]) => {
                if (value !== undefined && value !== null) {
                    element.setAttribute(key, value);
                }
            });
            
            if (className) {
                element.className = className;
            }
            
            return element;
        }

        /**
         * ボタングループを作成
         */
        createButtonGroup(appId) {
            const buttonGroup = document.createElement('div');
            buttonGroup.className = 'button-group';

            const searchButton = document.createElement('button');
            searchButton.className = 'search-button';
            searchButton.textContent = '検索';
            searchButton.addEventListener('click', () => this.searchRecords(appId));

            const clearButton = document.createElement('button');
            clearButton.className = 'clear-button';
            clearButton.textContent = 'クリア';
            clearButton.addEventListener('click', () => this.clearForm(appId));

            buttonGroup.appendChild(searchButton);
            buttonGroup.appendChild(clearButton);

            return buttonGroup;
        }

        /**
         * タブを切り替え
         */
        switchTab(appId) {
            document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            
            const targetButton = document.querySelector(`[data-app="${appId}"]`);
            const targetContent = document.querySelector(`#tab-${appId}`);
            
            if (targetButton && targetContent) {
                targetButton.classList.add('active');
                targetContent.classList.add('active');
                this.currentActiveTab = appId;
            }
        }

        /**
         * レコードを検索
         */
        searchRecords(appId) {
            const searchConditions = this.getSearchConditions(appId);
            
            if (Object.keys(searchConditions).length === 0) {
                alert(CONFIG.system.messages.noSearchCondition);
                return;
            }

            const query = this.buildSearchQuery(searchConditions, appId);
            
            console.log(`App ${appId}（${CONFIG.apps[appId].name}）で検索実行:`, query);
            
            // メインの台帳を検索
            this.searchRecordsWithQuery(appId, query)
                .then((records) => {
                    console.log(`${CONFIG.apps[appId].name}の検索結果（${records.length}件）:`, records);
                    
                    if (records.length > 0) {
                        // 統合キーを抽出して他の台帳も検索
                        return this.searchAllLedgersWithIntegrationKeys(appId, records);
                    } else {
                        console.log(CONFIG.system.messages.noResults);
                        return null;
                    }
                })
                .then((integratedData) => {
                    if (integratedData) {
                        console.log('=== 統合データベース ===');
                        console.log(`統合されたレコード数: ${integratedData.length}件`);
                        console.log('統合データ:', integratedData);
                        
                        // テーブル表示
                        this.displayIntegratedTable(appId, integratedData);
                    }
                })
                .catch((error) => {
                    console.error('検索エラー:', error);
                    alert(CONFIG.system.messages.searchError);
                });
        }

        /**
         * フォームをクリア
         */
        clearForm(appId) {
            const tabContent = document.querySelector(`#tab-${appId}`);
            if (!tabContent) return;
            
            const inputs = tabContent.querySelectorAll('input[type="text"]');
            inputs.forEach(input => {
                input.value = '';
            });

            const selects = tabContent.querySelectorAll('select');
            selects.forEach(select => {
                select.selectedIndex = 0;
            });
        }

        /**
         * 検索条件を取得
         */
        getSearchConditions(appId) {
            const conditions = {};
            const fields = CONFIG.getAppFields(appId);
            
            if (!fields) return conditions;

            fields.forEach(field => {
                const input = document.getElementById(`${field.code}-${appId}`);
                if (input && input.value && input.value.trim() !== '') {
                    conditions[field.code] = input.value.trim();
                }
            });

            return conditions;
        }

        /**
         * 検索クエリを構築（AND条件）
         */
        buildSearchQuery(conditions, appId) {
            const queryParts = [];
            const fields = CONFIG.getAppFields(appId);

            for (const [fieldCode, value] of Object.entries(conditions)) {
                const fieldConfig = fields.find(field => field.code === fieldCode);
                
                if (fieldConfig && fieldConfig.type === 'dropdown') {
                    queryParts.push(`${fieldCode} in ("${value}")`);
                } else {
                    queryParts.push(`${fieldCode} like "${value}"`);
                }
            }

            return queryParts.join(' and ');
        }

        /**
         * クエリでレコードを検索（カーソルAPI使用）
         */
        searchRecordsWithQuery(appId, query) {
            return this.createCursor(appId, query)
                .then((cursorId) => {
                    console.log('検索用カーソルが作成されました:', cursorId);
                    return this.getAllRecordsFromCursor(cursorId);
                });
        }

        /**
         * カーソルを作成
         */
        createCursor(appId, query) {
            const body = {
                app: appId,
                query: query || '',
                size: CONFIG.system.cursorSize
            };

            return kintone.api(kintone.api.url('/k/v1/records/cursor.json', true), 'POST', body)
                .then((response) => {
                    return response.id;
                });
        }

        /**
         * カーソルを使用して全レコードを取得
         */
        getAllRecordsFromCursor(cursorId) {
            const allRecords = [];

            const fetchRecords = () => {
                const body = {
                    id: cursorId
                };

                return kintone.api(kintone.api.url('/k/v1/records/cursor.json', true), 'GET', body)
                    .then((response) => {
                        allRecords.push(...response.records);
                        
                        console.log('現在までに取得したレコード数:', allRecords.length);
                        
                        if (response.next) {
                            return fetchRecords();
                        } else {
                            return allRecords;
                        }
                    });
            };

            return fetchRecords();
        }

        /**
         * 統合キーを使って全台帳を検索
         */
        searchAllLedgersWithIntegrationKeys(originalAppId, originalRecords) {
            // 統合キーを抽出
            const integrationKeys = this.extractIntegrationKeys(originalRecords);
            
            if (integrationKeys.length === 0) {
                console.log(CONFIG.system.messages.noIntegrationKeys);
                return Promise.resolve([]);
            }

            console.log(`抽出された統合キー（${integrationKeys.length}個）:`, integrationKeys);

            // 全台帳のデータを格納するオブジェクト
            const allLedgerData = {};
            allLedgerData[originalAppId] = originalRecords;

            // 他の台帳を検索するPromiseを作成（ユーザーリストは除外）
            const searchPromises = [];
            
            Object.keys(CONFIG.apps).forEach(appId => {
                if (appId !== originalAppId) {
                    const promise = this.searchByIntegrationKeys(appId, integrationKeys)
                        .then(records => {
                            allLedgerData[appId] = records;
                            console.log(`${CONFIG.apps[appId].name}の統合検索結果（${records.length}件）:`, records);
                            return records;
                        });
                    searchPromises.push(promise);
                }
            });

            // ユーザーリストをユーザーIDで検索するPromiseを追加
            const userListPromise = this.searchUserListByUserIds(allLedgerData)
                .then(userListData => {
                    console.log(`ユーザーリストの検索結果（${userListData.length}件）:`, userListData);
                    return userListData;
                });
            searchPromises.push(userListPromise);

            // 全ての検索が完了したらデータを統合
            return Promise.all(searchPromises)
                .then((results) => {
                    // 最後の結果がユーザーリストデータ
                    const userListData = results.pop();
                    return this.integrateAllLedgerDataWithUserList(allLedgerData, integrationKeys, userListData);
                });
        }

        /**
         * レコードから統合キーを抽出
         */
        extractIntegrationKeys(records) {
            const integrationKeys = new Set();
            
            records.forEach(record => {
                const keyField = record[CONFIG.integrationKey];
                if (keyField && keyField.value) {
                    integrationKeys.add(keyField.value);
                }
            });

            return Array.from(integrationKeys);
        }

        /**
         * 統合キーを使って特定の台帳を検索
         */
        searchByIntegrationKeys(appId, integrationKeys) {
            // IN演算子で統合キーの配列を検索
            const keyList = integrationKeys.map(key => `"${key}"`).join(',');
            const query = `${CONFIG.integrationKey} in (${keyList})`;
            
            return this.searchRecordsWithQuery(appId, query);
        }

        /**
         * 全台帳からユーザーIDを抽出してユーザーリストを検索
         */
        searchUserListByUserIds(allLedgerData) {
            const userIds = new Set();
            
            // 全台帳からユーザーIDを抽出
            Object.values(allLedgerData).forEach(records => {
                records.forEach(record => {
                    const userIdField = record['ユーザーID'];
                    if (userIdField && userIdField.value) {
                        userIds.add(userIdField.value);
                    }
                });
            });

            if (userIds.size === 0) {
                console.log('ユーザーIDが見つかりませんでした。');
                return Promise.resolve([]);
            }

            // ユーザーIDでユーザーリストを検索
            const userIdList = Array.from(userIds).map(id => `"${id}"`).join(',');
            const query = `ユーザーID in (${userIdList})`;
            
            return this.searchRecordsWithQuery(CONFIG.userList.appId, query);
        }

        /**
         * 全台帳のデータを統合キーで統合し、ユーザーリストからユーザー名を取得
         */
        integrateAllLedgerDataWithUserList(allLedgerData, integrationKeys, userListData) {
            const integratedData = [];

            // ユーザーリストをユーザーIDでマップ化
            const userMap = new Map();
            userListData.forEach(user => {
                const userId = user['ユーザーID'] && user['ユーザーID'].value;
                const userName = user['ユーザー名'] && user['ユーザー名'].value;
                if (userId) {
                    userMap.set(userId, userName || '');
                }
            });

            integrationKeys.forEach(integrationKey => {
                const integratedRecord = {
                    [CONFIG.integrationKey]: integrationKey
                };

                // 各台帳からこの統合キーに対応するレコードを取得
                let recordUserId = null;
                
                Object.entries(allLedgerData).forEach(([appId, records]) => {
                    const matchingRecord = records.find(record => {
                        const keyField = record[CONFIG.integrationKey];
                        return keyField && keyField.value === integrationKey;
                    });

                    const ledgerName = CONFIG.apps[appId].name;
                    
                    if (matchingRecord) {
                        // レコードが存在する場合、全フィールドを追加（統合キーは除く）
                        Object.entries(matchingRecord).forEach(([fieldCode, fieldValue]) => {
                            if (fieldCode !== CONFIG.integrationKey && 
                                fieldCode !== '$id' && 
                                fieldCode !== '$revision') {
                                
                                const displayValue = fieldValue && fieldValue.value !== undefined 
                                    ? fieldValue.value 
                                    : fieldValue;
                                
                                integratedRecord[`${ledgerName}_${fieldCode}`] = displayValue;
                                
                                // ユーザーIDを記録
                                if (fieldCode === 'ユーザーID' && displayValue) {
                                    recordUserId = displayValue;
                                }
                            }
                        });
                    } else {
                        // レコードが存在しない場合、nullで埋める
                        const fields = CONFIG.getAppFields(appId);
                        fields.forEach(field => {
                            if (field.code !== CONFIG.integrationKey) {
                                integratedRecord[`${ledgerName}_${field.code}`] = null;
                            }
                        });
                    }
                });

                // ユーザーリストからユーザー名を取得
                if (recordUserId && userMap.has(recordUserId)) {
                    integratedRecord['ユーザー名'] = userMap.get(recordUserId);
                } else {
                    integratedRecord['ユーザー名'] = null;
                }

                integratedData.push(integratedRecord);
            });

            return integratedData;
        }

        /**
         * 全台帳のデータを統合キーで統合（旧版・未使用）
         */
        integrateAllLedgerData(allLedgerData, integrationKeys) {
            const integratedData = [];

            integrationKeys.forEach(integrationKey => {
                const integratedRecord = {
                    [CONFIG.integrationKey]: integrationKey
                };

                // 各台帳からこの統合キーに対応するレコードを取得
                Object.entries(allLedgerData).forEach(([appId, records]) => {
                    const matchingRecord = records.find(record => {
                        const keyField = record[CONFIG.integrationKey];
                        return keyField && keyField.value === integrationKey;
                    });

                    const ledgerName = CONFIG.apps[appId].name;
                    
                    if (matchingRecord) {
                        // レコードが存在する場合、全フィールドを追加（統合キーは除く）
                        Object.entries(matchingRecord).forEach(([fieldCode, fieldValue]) => {
                            if (fieldCode !== CONFIG.integrationKey && 
                                fieldCode !== '$id' && 
                                fieldCode !== '$revision') {
                                
                                const displayValue = fieldValue && fieldValue.value !== undefined 
                                    ? fieldValue.value 
                                    : fieldValue;
                                
                                integratedRecord[`${ledgerName}_${fieldCode}`] = displayValue;
                            }
                        });
                    } else {
                        // レコードが存在しない場合、nullで埋める
                        const fields = CONFIG.getAppFields(appId);
                        fields.forEach(field => {
                            if (field.code !== CONFIG.integrationKey) {
                                integratedRecord[`${ledgerName}_${field.code}`] = null;
                            }
                        });
                    }
                });

                integratedData.push(integratedRecord);
            });

            return integratedData;
        }

        /**
         * 統合データをテーブル表示
         */
        displayIntegratedTable(appId, integratedData) {
            const tabContent = document.querySelector(`#tab-${appId}`);
            if (!tabContent) return;

            // 既存の統合結果テーブルを削除
            const existingResults = tabContent.querySelector('.integrated-results');
            if (existingResults) {
                existingResults.remove();
            }

            // 動的CSSを生成してテーブル幅を設定
            this.generateTableWidthCSS();

            // 統合結果コンテナを作成
            const resultsContainer = document.createElement('div');
            resultsContainer.className = 'integrated-results';

            // タイトルを作成
            const title = document.createElement('h3');
            title.textContent = `統合検索結果（${integratedData.length}件）`;
            resultsContainer.appendChild(title);

            // 仮想スクロール対応のテーブルコンテナを作成
            const tableContainer = this.createVirtualScrollTable(integratedData);
            
            resultsContainer.appendChild(tableContainer);
            tabContent.appendChild(resultsContainer);
        }

        /**
         * 統合テーブルを作成
         */
        createIntegratedTable(integratedData) {
            const table = document.createElement('table');
            table.className = 'integrated-table';

            // テーブル全体の幅はCSSで制御

            // colgroup要素でカラム幅を定義
            const colgroup = this.createColgroup();
            table.appendChild(colgroup);

            // ヘッダーを作成（2行構成）
            const thead = document.createElement('thead');
            
            // 1行目：台帳名（結合あり）
            const ledgerRow = this.createLedgerHeaderRow();
            thead.appendChild(ledgerRow);
            
            // 2行目：フィールド名
            const fieldRow = this.createFieldHeaderRow();
            thead.appendChild(fieldRow);

            table.appendChild(thead);

            // ボディを作成
            const tbody = document.createElement('tbody');

            integratedData.forEach(record => {
                const row = document.createElement('tr');

                CONFIG.integratedTableConfig.columns.forEach(column => {
                    const td = document.createElement('td');
                    const value = record[column.key];
                    
                    if (value === null || value === undefined || value === '') {
                        td.textContent = '-';
                        td.className = 'null-value';
                    } else {
                        td.textContent = value;
                    }

                    // colgroupで幅を定義するため、ここでは幅設定しない

                    row.appendChild(td);
                });

                tbody.appendChild(row);
            });

            table.appendChild(tbody);
            return table;
        }

        /**
         * 台帳名ヘッダー行を作成（結合あり）
         */
        createLedgerHeaderRow() {
            const row = document.createElement('tr');
            
            // 台帳名ごとにグループ化
            const ledgerGroups = this.groupColumnsByLedger();
            
            ledgerGroups.forEach(group => {
                const th = document.createElement('th');
                th.textContent = group.ledgerName;
                th.className = 'header-ledger-cell';
                th.colSpan = group.columns.length;
                
                // 結合セルには幅を設定しない（フィールド行に委ねる）
                
                row.appendChild(th);
            });
            
            return row;
        }

        /**
         * colgroup要素を作成してカラム幅を定義
         */
        createColgroup() {
            const colgroup = document.createElement('colgroup');
            
            CONFIG.integratedTableConfig.columns.forEach((column, index) => {
                const col = document.createElement('col');
                // インラインCSSを避け、クラス名で幅を制御
                col.className = `col-${index}`;
                colgroup.appendChild(col);
            });
            
            return colgroup;
        }

        /**
         * フィールド名ヘッダー行を作成
         */
        createFieldHeaderRow() {
            const row = document.createElement('tr');
            
            CONFIG.integratedTableConfig.columns.forEach(column => {
                const th = document.createElement('th');
                th.textContent = column.label;
                th.className = 'header-field-cell';
                
                // colgroupで幅を定義するため、ここでは幅設定しない
                
                row.appendChild(th);
            });
            
            return row;
        }

        /**
         * カラムを台帳名でグループ化
         */
        groupColumnsByLedger() {
            const groups = [];
            let currentGroup = null;
            
            CONFIG.integratedTableConfig.columns.forEach(column => {
                const ledgerName = this.getLedgerNameFromKey(column.key);
                
                if (!currentGroup || currentGroup.ledgerName !== ledgerName) {
                    // 新しいグループを開始
                    currentGroup = {
                        ledgerName: ledgerName,
                        columns: []
                    };
                    groups.push(currentGroup);
                }
                
                currentGroup.columns.push(column);
            });
            
            return groups;
        }

        /**
         * 動的CSSを生成してテーブル幅を設定（シンプル版）
         */
        generateTableWidthCSS() {
            // 既存の動的CSSを削除
            this.removeExistingStyle('dynamic-table-width');

            // 新しいCSSを生成
            let css = '';
            let totalWidth = 0;
            
            CONFIG.integratedTableConfig.columns.forEach((column, index) => {
                const width = column.width || CONFIG.system.defaultColumnWidth;
                css += `.integrated-table .col-${index} { width: ${width} !important; }\n`;
                css += `.integrated-table th:nth-child(${index + 1}) { width: ${width} !important; }\n`;
                css += `.integrated-table td:nth-child(${index + 1}) { width: ${width} !important; }\n`;
                totalWidth += this.parseWidth(width);
            });
            
            css += `.integrated-table { width: ${totalWidth}px !important; table-layout: fixed !important; }\n`;

            // スタイル要素を作成して追加
            this.createStyleElement('dynamic-table-width', css);
        }

        /**
         * 既存のスタイル要素を削除
         */
        removeExistingStyle(id) {
            const existingStyle = document.getElementById(id);
            if (existingStyle) {
                existingStyle.remove();
            }
        }

        /**
         * スタイル要素を作成
         */
        createStyleElement(id, css) {
            const style = document.createElement('style');
            style.id = id;
            style.textContent = css;
            document.head.appendChild(style);
        }

        /**
         * 幅の文字列から数値を抽出
         */
        parseWidth(widthStr) {
            return parseInt(widthStr.replace('px', '')) || 120;
        }

        /**
         * キーから台帳名を取得
         */
        getLedgerNameFromKey(key) {
            if (key === CONFIG.integrationKey) {
                return '共通';
            }
            
            // キーから台帳名を抽出（例：'PC台帳_PC番号' → 'PC台帳'）
            const parts = key.split('_');
            if (parts.length >= 2) {
                return parts[0];
            }
            
            return '不明';
        }

        /**
         * 仮想スクロール対応テーブルを作成
         */
        createVirtualScrollTable(integratedData) {
            // メインコンテナ
            const container = this.createElement('div', {}, 'integrated-table-container');
            
            // 仮想スクロールコンテナ（ボディ専用）
            const scrollContainer = this.createElement('div', {}, 'virtual-scroll-container');
            
            // 全体の高さを表すスペーサー
            const spacer = this.createElement('div', {}, 'virtual-scroll-spacer');
            const totalHeight = integratedData.length * CONFIG.virtualScroll.rowHeight;
            spacer.style.height = `${totalHeight}px`;
            
            // 実際のコンテンツ領域
            const content = this.createElement('div', {}, 'virtual-scroll-content');
            
            // ボディテーブル（仮想スクロール）
            const bodyTable = this.createElement('table', {}, 'integrated-table virtual-body');
            const colgroup = this.createColgroup();
            bodyTable.appendChild(colgroup);
            const tbody = this.createElement('tbody');
            bodyTable.appendChild(tbody);
            content.appendChild(bodyTable);
            
            // ヘッダーテーブル（固定表示、スクロール外）- ボディテーブル作成後に作成
            const headerTable = this.createHeaderTable();
            container.appendChild(headerTable);
            
            // 仮想スクロール状態を管理
            const virtualState = {
                data: integratedData,
                startIndex: 0,
                endIndex: Math.min(CONFIG.virtualScroll.visibleRows, integratedData.length),
                tbody: tbody,
                headerTable: headerTable,
                bodyTable: bodyTable
            };
            
            // 初期レンダリング
            this.renderVirtualRows(virtualState);
            
            // スクロールイベント
            scrollContainer.addEventListener('scroll', () => {
                this.handleVirtualScroll(scrollContainer, virtualState);
                // ヘッダーの横スクロールを同期
                this.syncHeaderScroll(headerTable, scrollContainer);
            });
            
            scrollContainer.appendChild(spacer);
            scrollContainer.appendChild(content);
            container.appendChild(scrollContainer);
            
            return container;
        }

        /**
         * ヘッダーテーブルを作成（固定表示用）
         */
        createHeaderTable() {
            const table = this.createElement('table', {}, 'integrated-table virtual-header');
            
            const colgroup = this.createColgroup();
            table.appendChild(colgroup);
            
            const thead = this.createElement('thead');
            
            // 1行目：台帳名（結合あり）
            const ledgerRow = this.createLedgerHeaderRow();
            thead.appendChild(ledgerRow);
            
            // 2行目：フィールド名
            const fieldRow = this.createFieldHeaderRow();
            thead.appendChild(fieldRow);
            
            table.appendChild(thead);
            return table;
        }

        /**
         * 仮想スクロールの行をレンダリング
         */
        renderVirtualRows(virtualState) {
            const { data, startIndex, endIndex, tbody, headerTable, bodyTable } = virtualState;
            
            // 既存の行をクリア
            tbody.innerHTML = '';
            
            // 表示範囲の行を作成
            for (let i = startIndex; i < endIndex; i++) {
                if (i >= data.length) break;
                
                const record = data[i];
                const row = this.createElement('tr');
                
                CONFIG.integratedTableConfig.columns.forEach(column => {
                    const td = this.createElement('td');
                    const value = record[column.key];
                    
                    if (value === null || value === undefined || value === '') {
                        td.textContent = '-';
                        td.className = 'null-value';
                    } else {
                        td.textContent = value;
                    }
                    
                    row.appendChild(td);
                });
                
                tbody.appendChild(row);
            }
            
            // オフセット設定（上部の空白を作る）
            const offsetTop = startIndex * CONFIG.virtualScroll.rowHeight;
            tbody.style.transform = `translateY(${offsetTop}px)`;
            
            // 初回レンダリング完了
            if (startIndex === 0 && !tbody._initialized) {
                tbody._initialized = true;
            }
        }

        /**
         * 仮想スクロールハンドラー
         */
        handleVirtualScroll(scrollContainer, virtualState) {
            const scrollTop = scrollContainer.scrollTop;
            const { rowHeight, visibleRows, bufferRows } = CONFIG.virtualScroll;
            
            // 現在の表示開始インデックスを計算
            const newStartIndex = Math.floor(scrollTop / rowHeight);
            const bufferStart = Math.max(0, newStartIndex - bufferRows);
            const bufferEnd = Math.min(
                virtualState.data.length,
                newStartIndex + visibleRows + bufferRows
            );
            
            // 表示範囲が変わった場合のみ再レンダリング
            if (bufferStart !== virtualState.startIndex || bufferEnd !== virtualState.endIndex) {
                virtualState.startIndex = bufferStart;
                virtualState.endIndex = bufferEnd;
                this.renderVirtualRows(virtualState);
            }
        }

        /**
         * ヘッダーの横スクロールを同期
         */
        syncHeaderScroll(headerTable, scrollContainer) {
            headerTable.style.transform = `translateX(-${scrollContainer.scrollLeft}px)`;
        }


    }

    // システムを初期化
    new LedgerSearchSystem();

})(); 