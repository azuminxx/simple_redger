/**
 * テーブル表示クラス
 */
class TableRenderer {
    constructor() {
        this.virtualScroll = new VirtualScroll();
        this.currentSearchResults = []; // 現在の検索結果を保持
        
        // VirtualScrollインスタンスをグローバルに設定
        window.virtualScroll = this.virtualScroll;
        
        // セル交換機能を初期化
        this.cellSwapper = new CellSwapper(this);
        
        // 更新ルール定義（主キー交換対応）- CONFIG.jsから動的に生成
        this.UPDATE_RULES = this.generateUpdateRules();
        
        // 更新履歴データを台帳別に保存するMap
        this.updateHistoryMap = new Map(); // 台帳別のMapを格納するMap
    }

    /**
     * 更新ルールを動的に生成
     */
    generateUpdateRules() {
        const rules = {};
        
        // 主キーフィールドは全て exclude_origin ルール
        CONFIG.integratedTableConfig.columns.forEach(column => {
            if (column.primaryKey) {
                rules[column.fieldCode] = 'exclude_origin';
            }
        });
        
        // BSSIDは PC台帳のみ
        rules[CONFIG.userList.primaryKey] = 'pc_only';
        
        // その他のフィールドは元台帳のみ
        rules['*'] = 'origin';
        
        return rules;
    }

    /**
     * 統合データをテーブル表示
     */
    displayIntegratedTable(appId, integratedData) {
        // console.log('[DEBUG] displayIntegratedTable called', { appId, integratedDataLength: integratedData.length });
        // 結果表示エリアを取得
        const resultsContainer = document.getElementById(CONFIG.system.resultsContainerId);
        if (!resultsContainer) {
            console.error(`結果表示エリア（${CONFIG.system.resultsContainerId}）が見つかりません`);
            return;
        }

        // 既存の統合結果テーブルを削除
        const existingResults = resultsContainer.querySelector('.integrated-results');
        if (existingResults) {
            existingResults.remove();
        }

        // 現在の検索結果を更新
        this.currentSearchResults = integratedData;

        // 検索用データの保持
        this._originalIntegratedData = integratedData.slice();

        // データが0件の場合は0件メッセージを表示
        if (integratedData.length === 0) {
            this.displayNoResultsMessage();
            return;
        }

        // 動的CSSを生成してテーブル幅を設定
        CSSGenerator.generateTableWidthCSS();

        // 統合結果コンテナを作成
        const integratedResultsContainer = DOMHelper.createElement('div', {}, 'integrated-results');

        // タイトルと保存ボタンのコンテナを作成
        const titleContainer = DOMHelper.createElement('div', {}, 'results-title-container');

        // 仮想スクロール対応のテーブルコンテナを作成
        const tableContainer = this.virtualScroll.createVirtualScrollTable(integratedData);

        // --- ここでconsistencyMapが生成されるので、ここから下でカウント ---
        let normalCount = 0;
        let inconsistentCount = 0;
        if (window.consistencyMap && this.currentSearchResults) {
            this.currentSearchResults.forEach((row, idx) => {
                const key = window.virtualScroll.getRecordIdFromRow(row);
                const val = window.consistencyMap.get(key);
                if (val === true) normalCount++;
                else if (val === false) inconsistentCount++;
            });
        }
        // --- ここまで追加 ---

        // 件数表示を拡張
        const title = DOMHelper.createElement('h5');
        title.textContent = `統合検索結果：${integratedData.length}件（` +
            `正常：${normalCount}件／不整合：${inconsistentCount}件）`;
        titleContainer.appendChild(title);
        
        // 保存ボタンを作成
        const saveButton = DOMHelper.createElement('button', {}, 'save-changes-button');
        saveButton.textContent = '変更を保存';
        saveButton.addEventListener('click', () => {
            this.saveChanges();
        });
        titleContainer.appendChild(saveButton);

        integratedResultsContainer.appendChild(titleContainer);

        // ===== 検索ボックス追加（肯定系・否定系分離） =====
        const searchBoxWrapper = DOMHelper.createElement('div', {}, 'search-box-wrapper');
        searchBoxWrapper.style.fontSize = '12px';

        // 肯定系検索
        const positiveInput = DOMHelper.createElement('input', { type: 'text', id: 'positive-search-input', placeholder: 'カンマ、スペース、改行で複数指定可（列名は 列名:検索値 で指定可）', autocomplete: 'off' }, 'positive-search-input');
        positiveInput.style.marginRight = '1em';
        positiveInput.style.fontSize = '12px';
        positiveInput.style.height = '32px';
        positiveInput.style.width = '500px';
        positiveInput.style.border = '1px solid #ced4da';

        // 否定系検索
        const negativeInput = DOMHelper.createElement('input', { type: 'text', id: 'negative-search-input', placeholder: 'カンマ、スペース、改行で複数指定可（列名は 列名:検索値 で指定可）', autocomplete: 'off' }, 'negative-search-input');
        negativeInput.style.fontSize = '12px';
        negativeInput.style.height = '32px';
        negativeInput.style.width = '500px';
        negativeInput.style.border = '1px solid #ced4da';

        // 条件結合方法選択
        const positiveLogicLabel = DOMHelper.createElement('label');
        positiveLogicLabel.textContent = '➕検索条件:';
        positiveLogicLabel.setAttribute('for', 'positive-logic-select');

        // 条件結合方法選択
        const positiveLogicSelect = DOMHelper.createElement('select', { id: 'positive-logic-select' }, 'positive-logic-select');
        const positiveOrOption = DOMHelper.createElement('option', { value: 'or' }, 'positive-or-option');
        positiveOrOption.textContent = 'OR';
        const positiveAndOption = DOMHelper.createElement('option', { value: 'and' }, 'positive-and-option');
        positiveAndOption.textContent = 'AND';
        positiveLogicSelect.style.fontSize = '12px';
        positiveLogicSelect.style.height = '37.2px';
        positiveLogicSelect.style.border = '1px solid #ced4da';
        positiveLogicSelect.appendChild(positiveOrOption);
        positiveLogicSelect.appendChild(positiveAndOption);

        // 条件結合方法選択
        const negativeLogicLabel = DOMHelper.createElement('label');
        negativeLogicLabel.textContent = '➖除外条件:';
        negativeLogicLabel.setAttribute('for', 'negative-logic-select');

        // 条件結合方法選択
        const negativeLogicSelect = DOMHelper.createElement('select', { id: 'negative-logic-select' }, 'negative-logic-select');
        const negativeOrOption = DOMHelper.createElement('option', { value: 'or' }, 'negative-or-option');
        negativeOrOption.textContent = 'OR';
        const negativeAndOption = DOMHelper.createElement('option', { value: 'and' }, 'negative-and-option');
        negativeAndOption.textContent = 'AND';
        negativeLogicSelect.style.fontSize = '12px';
        negativeLogicSelect.style.height = '37.2px';
        negativeLogicSelect.style.border = '1px solid #ced4da';
        negativeLogicSelect.appendChild(negativeOrOption);
        negativeLogicSelect.appendChild(negativeAndOption);

        searchBoxWrapper.appendChild(positiveLogicLabel);
        searchBoxWrapper.appendChild(positiveLogicSelect);
        //searchBoxWrapper.appendChild(positiveLabel);
        searchBoxWrapper.appendChild(positiveInput);
        searchBoxWrapper.appendChild(negativeLogicLabel);
        searchBoxWrapper.appendChild(negativeLogicSelect);
        //searchBoxWrapper.appendChild(negativeLabel);
        searchBoxWrapper.appendChild(negativeInput);

        // クリアボタンを作成
        const clearButton = DOMHelper.createElement('button', { type: 'button' }, 'clear-search-button');
        clearButton.textContent = '条件をクリアする';
        clearButton.style.fontSize = '12px';
        clearButton.style.height = '32px';
        clearButton.style.border = '1px solid #ced4da';
        clearButton.style.backgroundColor = '#f8f9fa';
        clearButton.style.cursor = 'pointer';
        clearButton.style.marginLeft = '0.5em';
        clearButton.addEventListener('click', () => {
            positiveInput.value = '';
            negativeInput.value = '';
            handleSearch();
        });

        searchBoxWrapper.appendChild(clearButton);
        integratedResultsContainer.appendChild(searchBoxWrapper);
        // ===== ここまで追加 =====

        // 検索イベント（両inputで発火）
        const handleSearch = () => {
            const positiveRaw = positiveInput.value.trim();
            const negativeRaw = negativeInput.value.trim();
            const positiveKeywords = positiveRaw.split(/[\s,\r\n]+/).filter(Boolean);
            const negativeKeywords = negativeRaw.split(/[\s,\r\n]+/).filter(Boolean);
            const positiveLogic = positiveLogicSelect.value;
            const negativeLogic = negativeLogicSelect.value;
            let filteredData;
            if (positiveKeywords.length === 0 && negativeKeywords.length === 0) {
                filteredData = this._originalIntegratedData;
            } else {
                filteredData = this._originalIntegratedData.filter(row => {
                    // 肯定系条件: 選択されたロジックに応じてOR/AND判定
                    const positiveOk = positiveKeywords.length === 0 || (positiveLogic === 'or' ? 
                        positiveKeywords.some(keyword => {
                            if (keyword.includes(':')) {
                                const [fieldName, searchValue] = keyword.split(':', 2);
                                // フィールド名に部分一致するキーをすべて探す
                                const matchingKeys = Object.keys(row).filter(key => {
                                    const column = CONFIG.integratedTableConfig.columns.find(col => col.key === key);
                                    return column && column.label.toLowerCase().includes(fieldName.toLowerCase());
                                });
                                // いずれかのフィールド値が部分一致すればOK
                                return matchingKeys.some(matchingKey => {
                                    const value = row[matchingKey];
                                    // 空欄条件の判定
                                    if (searchValue === '""' || searchValue === "''") {
                                        return !value || value.toString().trim() === '';
                                    }
                                    // 通常の部分一致
                                    return value && value.toString().toLowerCase().includes(searchValue.toLowerCase());
                                });
                            }
                            // 通常の検索（部分一致）
                            return Object.values(row).some(val => val && val.toString().toLowerCase().includes(keyword.toLowerCase()));
                        }) : 
                        positiveKeywords.every(keyword => {
                            if (keyword.includes(':')) {
                                const [fieldName, searchValue] = keyword.split(':', 2);
                                // フィールド名に部分一致するキーをすべて探す
                                const matchingKeys = Object.keys(row).filter(key => {
                                    const column = CONFIG.integratedTableConfig.columns.find(col => col.key === key);
                                    return column && column.label.toLowerCase().includes(fieldName.toLowerCase());
                                });
                                // いずれかのフィールド値が部分一致すればOK
                                return matchingKeys.some(matchingKey => {
                                    const value = row[matchingKey];
                                    // 空欄条件の判定
                                    if (searchValue === '""' || searchValue === "''") {
                                        return !value || value.toString().trim() === '';
                                    }
                                    // 通常の部分一致
                                    return value && value.toString().toLowerCase().includes(searchValue.toLowerCase());
                                });
                            }
                            // 通常の検索（部分一致）
                            return Object.values(row).some(val => val && val.toString().toLowerCase().includes(keyword.toLowerCase()));
                        })
                    );

                    // 否定系条件: 選択されたロジックに応じてOR/AND判定
                    const negativeOk = negativeKeywords.length === 0 || (negativeLogic === 'or' ? 
                        negativeKeywords.every(keyword => {
                            if (keyword.includes(':')) {
                                const [fieldName, searchValue] = keyword.split(':', 2);
                                // フィールド名に部分一致するキーをすべて探す
                                const matchingKeys = Object.keys(row).filter(key => {
                                    const column = CONFIG.integratedTableConfig.columns.find(col => col.key === key);
                                    return column && column.label.toLowerCase().includes(fieldName.toLowerCase());
                                });
                                // いずれかのフィールド値が「含まれていない」ならOK
                                return matchingKeys.every(matchingKey => {
                                    const value = row[matchingKey];
                                    // 空欄条件の判定
                                    if (searchValue === '""' || searchValue === "''") {
                                        return value && value.toString().trim() !== '';
                                    }
                                    // 通常の否定条件
                                    return !(value && value.toString().toLowerCase().includes(searchValue.toLowerCase()));
                                });
                            }
                            // 通常の否定条件（全フィールド）
                            return !Object.values(row).some(val => val && val.toString().toLowerCase().includes(keyword.toLowerCase()));
                        }) : 
                        negativeKeywords.some(keyword => {
                            if (keyword.includes(':')) {
                                const [fieldName, searchValue] = keyword.split(':', 2);
                                // フィールド名に部分一致するキーをすべて探す
                                const matchingKeys = Object.keys(row).filter(key => {
                                    const column = CONFIG.integratedTableConfig.columns.find(col => col.key === key);
                                    return column && column.label.toLowerCase().includes(fieldName.toLowerCase());
                                });
                                // いずれかのフィールド値が「含まれていない」ならOK
                                return matchingKeys.every(matchingKey => {
                                    const value = row[matchingKey];
                                    // 空欄条件の判定
                                    if (searchValue === '""' || searchValue === "''") {
                                        return value && value.toString().trim() !== '';
                                    }
                                    // 通常の否定条件
                                    return !(value && value.toString().toLowerCase().includes(searchValue.toLowerCase()));
                                });
                            }
                            // 通常の否定条件（全フィールド）
                            return !Object.values(row).some(val => val && val.toString().toLowerCase().includes(keyword.toLowerCase()));
                        })
                    );

                    return negativeOk && positiveOk;
                });
            }
            // 仮想テーブル再描画
            this.currentSearchResults = filteredData;
            
            // 既存のテーブルコンテナを取得
            const oldTable = integratedResultsContainer.querySelector('.integrated-table-container');
            
            // 編集状態を保存（検索前の状態を保持）
            let savedChangeFlags = null;
            let savedChangedFields = null;
            let savedOriginalValues = null;
            let savedScrollTop = 0;
            
            if (window.virtualScroll && oldTable) {
                // 変更フラグを保存
                savedChangeFlags = new Map(window.virtualScroll.changeFlags);
                savedChangedFields = new Map(window.virtualScroll.changedFields);
                savedOriginalValues = new Map(window.virtualScroll.originalValues);
                
                // スクロール位置を保存
                const scrollContainer = oldTable.querySelector('.virtual-scroll-container');
                if (scrollContainer) {
                    savedScrollTop = scrollContainer.scrollTop;
                }
            }
            
            // 新しいテーブルを作成
            const newTable = this.virtualScroll.createVirtualScrollTable(filteredData);
            
            // 編集状態を復元
            if (window.virtualScroll && savedChangeFlags) {
                // 変更フラグを復元
                window.virtualScroll.changeFlags = savedChangeFlags;
                window.virtualScroll.changedFields = savedChangedFields;
                window.virtualScroll.originalValues = savedOriginalValues;
                
                // 変更フラグUIを復元
                window.virtualScroll.restoreChangeFlagsUI();
                
                // スクロール位置を復元
                if (savedScrollTop > 0) {
                    setTimeout(() => {
                        const newScrollContainer = newTable.querySelector('.virtual-scroll-container');
                        if (newScrollContainer) {
                            newScrollContainer.scrollTop = savedScrollTop;
                        }
                    }, 100);
                }
            }
            
            if (oldTable && newTable) {
                oldTable.parentNode.replaceChild(newTable, oldTable);
            }
        };
        positiveInput.addEventListener('input', handleSearch.bind(this));
        negativeInput.addEventListener('input', handleSearch.bind(this));
        positiveLogicSelect.addEventListener('change', handleSearch.bind(this));
        negativeLogicSelect.addEventListener('change', handleSearch.bind(this));

        integratedResultsContainer.appendChild(tableContainer);
        
        resultsContainer.appendChild(integratedResultsContainer);
    }

    /**
     * 検索結果0件のメッセージを表示
     */
    displayNoResultsMessage() {
        const resultsContainer = document.getElementById(CONFIG.system.resultsContainerId);
        if (!resultsContainer) {
            console.error(`結果表示エリア（${CONFIG.system.resultsContainerId}）が見つかりません`);
            return;
        }

        // 統合結果コンテナを作成
        const integratedResultsContainer = DOMHelper.createElement('div', {}, 'integrated-results');

        // タイトルを作成
        const title = DOMHelper.createElement('h5');
        title.textContent = '統合検索結果（0件）';
        integratedResultsContainer.appendChild(title);

        // 0件メッセージを作成
        const noResultsMessage = DOMHelper.createElement('div', {}, 'no-results-message');
        noResultsMessage.textContent = CONFIG.system.messages.noResults;
        integratedResultsContainer.appendChild(noResultsMessage);

        resultsContainer.appendChild(integratedResultsContainer);
    }

    /**
     * 台帳名ヘッダー行を作成（結合あり）
     */
    createLedgerHeaderRow() {
        const row = DOMHelper.createElement('tr');
        
        // 台帳名ごとにグループ化
        const ledgerGroups = this.groupColumnsByLedger();
        
        ledgerGroups.forEach(group => {
            const th = DOMHelper.createElement('th');
            th.textContent = group.ledgerName;
            th.className = 'header-ledger-cell';
            th.colSpan = group.columns.length;
            
            row.appendChild(th);
        });
        
        return row;
    }

    /**
     * フィールド名ヘッダー行を作成
     */
    createFieldHeaderRow() {
        const row = DOMHelper.createElement('tr');
        
        CONFIG.integratedTableConfig.columns.forEach(column => {
            const th = DOMHelper.createElement('th');
            th.textContent = column.label;
            th.className = 'header-field-cell';
            
            // data-field-code属性を追加（主キーフィールドのスタイル適用用）
            if (column.fieldCode) {
                th.setAttribute('data-field-code', column.fieldCode);
            }
            
            row.appendChild(th);
        });
        
        return row;
    }

    /**
     * colgroup要素を作成してカラム幅を定義
     */
    createColgroup() {
        const colgroup = DOMHelper.createElement('colgroup');
        
        CONFIG.integratedTableConfig.columns.forEach((column, index) => {
            const col = DOMHelper.createElement('col');
            // インラインCSSを避け、クラス名で幅を制御
            col.className = `col-${index}`;
            colgroup.appendChild(col);
        });
        
        return colgroup;
    }

    /**
     * カラムを台帳名でグループ化
     */
    groupColumnsByLedger() {
        const groups = [];
        let currentGroup = null;
        
        CONFIG.integratedTableConfig.columns.forEach(column => {
            const ledgerName = DOMHelper.getLedgerNameFromKey(column.key);
            
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
     * 現在の検索結果を取得
     */
    getCurrentSearchResults() {
        return this.currentSearchResults;
    }

    /**
     * 検索結果をクリア
     */
    clearSearchResults() {
        this.currentSearchResults = [];
    }

    /**
     * 変更を保存
     */
    async saveChanges() {
        if (!this.currentSearchResults || this.currentSearchResults.length === 0) {
            alert('保存する変更がありません。');
            return;
        }

        const saveButton = document.querySelector('.save-changes-button');
        if (saveButton) {
            saveButton.disabled = true;
            saveButton.textContent = '保存中...';
        }

        try {
            // 保存前バリデーション
            if (window.validation) {
                const changedIndices = window.virtualScroll?.getChangedRecordIndices?.() || [];
                const ok = await window.validation.validateBeforeSave(changedIndices);
                if (!ok) {
                    // 不正あり → 保存中断
                    return;
                }
            }
            // 変更されたレコードのインデックスを取得
            if (!window.virtualScroll) {
                throw new Error('VirtualScrollインスタンスが見つかりません');
            }
            const changedIndices = window.virtualScroll.getChangedRecordIndices();
            if (changedIndices.length === 0) {
                alert('変更されたレコードがありません。');
                return;
            }
            
            // バッチIDを生成（一括更新全体で共通）
            const batchId = this.generateBatchId();
            
            // 変更されたレコードのみから各台帳ごとにレコードをグループ化
            const recordsByApp = this.groupRecordsByApp(changedIndices);
            console.log(`🔄 変更されたレコードの台帳別グループ化:`, recordsByApp);
            // 各台帳のレコードを一括更新（レコードがある場合のみ）
            const updatePromises = [];
            for (const [appId, records] of Object.entries(recordsByApp)) {
                if (records.length > 0) {
                    updatePromises.push(this.updateAppRecordsBatch(appId, records, batchId));
                }
            }
            
            await Promise.all(updatePromises);
            
            // 変更フラグをリセット
            this.resetChangeFlags(changedIndices);
            // 空行のフラグ・クラスもクリア
            if (window.virtualScroll) {
                window.virtualScroll.clearFlagsAndClassesForEmptyRows();
                // 変更対象行の統合キーを再生成し、MAPも新しい統合キーで更新
                changedIndices.forEach(index => {
                    const row = this.currentSearchResults[index];
                    const oldKey = window.virtualScroll.getRecordIdFromRow(row);
                    const newKey = window.virtualScroll.generateIntegrationKeyFromRow(row);
                    // currentSearchResultsの統合キーも更新
                    row[CONFIG.integrationKey] = newKey;
                    // MAPのキーも新しい統合キーに移し替え
                    if (oldKey !== newKey) {
                        if (window.virtualScroll.changeFlags.has(oldKey)) {
                            window.virtualScroll.changeFlags.set(newKey, window.virtualScroll.changeFlags.get(oldKey));
                            window.virtualScroll.changeFlags.delete(oldKey);
                        }
                        if (window.virtualScroll.changedFields.has(oldKey)) {
                            window.virtualScroll.changedFields.set(newKey, window.virtualScroll.changedFields.get(oldKey));
                            window.virtualScroll.changedFields.delete(oldKey);
                        }
                        if (window.virtualScroll.originalValues.has(oldKey)) {
                            window.virtualScroll.originalValues.set(newKey, window.virtualScroll.originalValues.get(oldKey));
                            window.virtualScroll.originalValues.delete(oldKey);
                        }
                    }
                });
            }
            
            // 成功メッセージをトーストで表示
            this.showToast('変更が完了しました', 'success');
            
        } catch (error) {
            console.error('❌ 保存エラー:', error);
            // エラーメッセージをトーストで表示
            this.showToast('変更が失敗しました', 'error');
            alert(`保存中にエラーが発生しました。\n詳細: ${error.message}`);
        } finally {
            if (saveButton) {
                saveButton.disabled = false;
                saveButton.textContent = '変更を保存';
            }
        }
    }

    /**
     * DOMから変更されたレコードを台帳ごとにグループ化（全台帳対応版）
     */
    groupRecordsByApp(changedIndices = null) {
        // 【重要】kintone更新用レコードオブジェクト作成
        // ■ 各台帳の交換されたデータを、kintone REST API形式に変換
        // ■ 形式：{id: レコードID, record: {フィールド名: {value: 値}}}
        const updateRecordsByApp = {};
        
        changedIndices.forEach(rowIndex => {
            // 変更されたフィールドを取得
            const changedFields = window.virtualScroll.getChangedFields(rowIndex);
            
            // 変更されたフィールドから台帳を特定（主キー交換対応）
            const affectedLedgers = new Set();
            const primaryKeyChanges = new Set(); // 主キー変更を追跡
            
            changedFields.forEach(fieldKey => {
                const fieldCode = DOMHelper.extractFieldCodeFromKey(fieldKey);
                const ledgerName = DOMHelper.extractLedgerNameFromKey(fieldKey);
                
                if (ledgerName) {
                    // 主キーフィールドかどうかをチェック
                    const isPrimaryKey = CONFIG.integratedTableConfig.columns.some(col => 
                        col.fieldCode === fieldCode && col.primaryKey
                    );
                    
                    if (isPrimaryKey) {
                        // 主キー変更の場合、更新ルールに基づいて対象台帳を決定
                        const updateTargets = this.getUpdateTargetsForField(fieldKey);
                        updateTargets.forEach(appId => {
                            const targetLedgerName = CONFIG.apps[appId].name;
                            affectedLedgers.add(targetLedgerName);
                        });
                        primaryKeyChanges.add(fieldCode);
                    } else {
                        // 通常フィールドの場合、元の台帳のみ
                        affectedLedgers.add(ledgerName);
                    }
                }
            });
            
            // 変更された台帳のみを処理
            affectedLedgers.forEach(ledgerName => {
                const recordIdKey = `${ledgerName}_$id`;
                const recordId = this.currentSearchResults[rowIndex][recordIdKey];
                
                if (recordId) {
                    const appId = this.getAppIdByLedgerName(ledgerName);
                    if (!appId) return;
                    
                    if (!updateRecordsByApp[appId]) {
                        updateRecordsByApp[appId] = [];
                    }
                    
                    let updateRecord = {
                        id: parseInt(recordId),
                        record: {}
                    };
                    
                    // 【重要】変更されたフィールドのみをリクエストボディに含める
                    const changedFieldsForLedger = new Set();
                    
                    changedFields.forEach(fieldKey => {
                        const fieldCode = DOMHelper.extractFieldCodeFromKey(fieldKey);
                        const fieldLedgerName = DOMHelper.extractLedgerNameFromKey(fieldKey);
                        
                        // この台帳に関連する変更フィールドを特定
                        if (fieldLedgerName === ledgerName) {
                            // 自台帳の変更フィールド
                            changedFieldsForLedger.add(fieldCode);
                        } else if (primaryKeyChanges.has(fieldCode)) {
                            // 他台帳の主キー変更で、この台帳に影響するフィールド
                            changedFieldsForLedger.add(fieldCode);
                        }
                    });
                    
                    // 主キー変更がある場合、関連フィールドも含める
                    if (primaryKeyChanges.size > 0) {
                        const relatedFields = this.getRelatedFieldsForPrimaryKeyChange(primaryKeyChanges, ledgerName);
                        relatedFields.forEach(fieldCode => {
                            changedFieldsForLedger.add(fieldCode);
                        });
                    }
                    
                    // 変更されたフィールドのみをリクエストボディに含める
                    const updateFields = CONFIG.getLedgerUpdateFields(ledgerName);
                    Object.entries(updateFields).forEach(([fieldCode, fieldConfig]) => {
                        if (changedFieldsForLedger.has(fieldCode)) {
                            const value = this.currentSearchResults[rowIndex][fieldConfig.sourceKey];
                            updateRecord.record[fieldCode] = { value: value };
                        }
                    });
                    
                    updateRecordsByApp[appId].push(updateRecord);
                }
            });
        });
        
        return updateRecordsByApp;
    }

    /**
     * 台帳名からappIdを取得
     */
    getAppIdByLedgerName(ledgerName) {
        const appEntry = Object.entries(CONFIG.apps).find(([appId, appConfig]) => 
            appConfig.name === ledgerName
        );
        return appEntry ? appEntry[0] : null;
    }

    /**
     * フィールドの更新対象台帳を取得（主キー交換対応版）
     */
    getUpdateTargetsForField(fieldKey) {
        const fieldCode = DOMHelper.extractFieldCodeFromKey(fieldKey);
        
        // 更新ルールに基づいて判定
        const rule = this.UPDATE_RULES[fieldCode] || this.UPDATE_RULES['*'];
        
        switch (rule) {
            case 'all':
                // 全台帳で更新
                return Object.keys(CONFIG.apps);
                
            case 'exclude_origin':
                // 元の台帳以外で更新（主キー交換用）
                const originLedgerName = DOMHelper.extractLedgerNameFromKey(fieldKey);
                const targetApps = Object.keys(CONFIG.apps).filter(appId => 
                    CONFIG.apps[appId].name !== originLedgerName
                );
                console.log(`🔄 ${fieldCode} 更新対象: ${originLedgerName}を除外 → [${targetApps.map(id => CONFIG.apps[id].name).join(', ')}]`);
                return targetApps;
                
            case 'pc_only':
                // PC台帳のみ更新（CONFIG.jsから動的取得）
                const pcLedgerName = CONFIG.integratedTableConfig.columns.find(c => c.fieldCode === 'PC番号' && c.primaryKey).ledger;
                return Object.keys(CONFIG.apps).filter(appId => CONFIG.apps[appId].name === pcLedgerName);
                
            case 'origin':
            default:
                // 元の台帳のみ更新
                const ledgerName = DOMHelper.extractLedgerNameFromKey(fieldKey);
                return Object.keys(CONFIG.apps).filter(appId => CONFIG.apps[appId].name === ledgerName);
        }
    }

    /**
     * 主キー変更時の関連フィールドを取得
     */
    getRelatedFieldsForPrimaryKeyChange(primaryKeyChanges, ledgerName) {
        const relatedFields = new Set();
        
        primaryKeyChanges.forEach(primaryKeyField => {
            const sourceApp = this.getPrimaryKeySourceApp(primaryKeyField);
            
            if (ledgerName === sourceApp) {
                // 起点台帳の場合、全フィールドを含める
                const updateFields = CONFIG.getLedgerUpdateFields(ledgerName);
                Object.keys(updateFields).forEach(fieldCode => {
                    relatedFields.add(fieldCode);
                });
            } else {
                // 他台帳の場合、該当主キーフィールドのみ
                relatedFields.add(primaryKeyField);
            }
        });
        
        return relatedFields;
    }

    /**
     * 主キーフィールドに対応するsourceAppを取得
     */
    getPrimaryKeySourceApp(primaryKeyField) {
        const col = CONFIG.integratedTableConfig.columns.find(c => c.fieldCode === primaryKeyField && c.primaryKey);
        return col ? col.ledger : null;
    }

    /**
     * 特定のアプリのレコードを一括更新
     */
    async updateAppRecordsBatch(appId, records, batchId) {
        
        // 一括更新用のデータを準備
        const updateRecords = records.map((record, index) => {
            // 新しい形式 {id: 6163, record: {...}} と旧形式 {$id: {value: 6163}, ...} の両方に対応
            const recordIdValue = record.id || record.$id?.value;
            if (!recordIdValue) {
                throw new Error(`レコードIDが見つかりません`);
            }
            
            // 新しい形式の場合は直接recordオブジェクトを使用、旧形式の場合は従来の処理
            if (record.id && record.record) {
                // 新しい形式: {id: 6163, record: {...}}
                return {
                    id: recordIdValue,
                    record: record.record
                };
            }
            
            // 旧形式は現在サポートしていません
            throw new Error(`旧形式のレコードはサポートされていません: ${JSON.stringify(record)}`);
        });

        try {
            
            // API実行回数をカウント
            window.apiCounter.count(appId, 'レコード一括更新');
            
            // kintone REST API の一括更新を実行
            const response = await kintone.api(kintone.api.url('/k/v1/records', true), 'PUT', {
                app: appId,
                records: updateRecords
            });
            // 更新履歴データを保存
            const ledgerName = CONFIG.apps[appId].name;
            const timestamp = new Date().toISOString();
            
            // 台帳別のMapを取得または作成
            if (!this.updateHistoryMap.has(appId)) {
                this.updateHistoryMap.set(appId, new Map());
            }
            const ledgerHistoryMap = this.updateHistoryMap.get(appId);
            
            records.forEach((record, index) => {
                const recordIdValue = record.id || record.$id?.value;
                const historyKey = `${recordIdValue}_${timestamp}`;
                
                // リクエストデータを取得（updateRecordsから該当するレコードを検索）
                const requestData = updateRecords.find(reqRecord => reqRecord.id === parseInt(recordIdValue)) || null;
                
                const historyData = {
                    appId: appId,
                    ledgerName: ledgerName,
                    recordId: recordIdValue,
                    updateResult: 'success',
                    timestamp: timestamp,
                    batchId: batchId,
                    request: requestData,
                    response: (response && Array.isArray(response.records) && response.records[index]) ? response.records[index] : null
                };
                
                ledgerHistoryMap.set(historyKey, historyData);
            });
            
            console.log(`✅ ${ledgerName} 更新完了 (${records.length}件)`);
            
            // 更新されたレコードのURLリンクをログ出力
            //this.logUpdatedRecordLinks(appId, records);
            
            // 台帳別に履歴データを投入
            await this.uploadHistoryToApp(appId);
            
            return response;
            
        } catch (error) {
            // エラー時も履歴データを保存
            const ledgerName = CONFIG.apps[appId].name;
            const timestamp = new Date().toISOString();
            
            // 台帳別のMapを取得または作成
            if (!this.updateHistoryMap.has(appId)) {
                this.updateHistoryMap.set(appId, new Map());
            }
            const ledgerHistoryMap = this.updateHistoryMap.get(appId);
            
            records.forEach((record) => {
                const recordIdValue = record.id || record.$id?.value;
                const historyKey = `${recordIdValue}_${timestamp}`;
                
                // リクエストデータを取得（updateRecordsから該当するレコードを検索）
                const requestData = updateRecords.find(reqRecord => reqRecord.id === parseInt(recordIdValue)) || null;
                
                const historyData = {
                    appId: appId,
                    ledgerName: ledgerName,
                    recordId: recordIdValue,
                    updateResult: 'failure',
                    timestamp: timestamp,
                    batchId: batchId,
                    request: requestData,
                    error: error // Store the full error object
                };
                
                ledgerHistoryMap.set(historyKey, historyData);
            });
            
            // エラー時も履歴データを投入
            await this.uploadHistoryToApp(appId);
            
            this.logError(`${ledgerName} 一括更新`, error);
            throw error;
        }
    }



    /**
     * バッチIDを生成
     */
    generateBatchId() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        
        const timestamp = `${year}${month}${day}_${hours}${minutes}${seconds}`;
        const random = Math.random().toString(36).substring(2, 8);
        return `batch_${timestamp}_${random}`;
    }

    /**
     * 履歴管理アプリに台帳別に投入
     */
    async uploadHistoryToApp(appId = null) {
        try {
            // appIdが指定されている場合はその台帳のデータのみ処理
            if (appId) {
                const ledgerHistoryMap = this.updateHistoryMap.get(appId);
                if (!ledgerHistoryMap || ledgerHistoryMap.size === 0) {
                    console.log(`📝 台帳 ${appId} の履歴データがありません`);
                    return;
                }

                // 指定された台帳の履歴データを収集
                const ledgerHistoryData = [];
                for (const [historyKey, historyData] of ledgerHistoryMap) {
                    ledgerHistoryData.push(historyData);
                }

                if (ledgerHistoryData.length === 0) {
                    console.log(`📝 台帳 ${appId} の履歴データがありません`);
                    return;
                }

                // 履歴データをレコード形式に変換
                const records = ledgerHistoryData.map(historyData => {
                    const record = {
                        [CONFIG.historyApp.fields.batchId]: { value: historyData.batchId },
                        [CONFIG.historyApp.fields.recordId]: { value: historyData.recordId },
                        [CONFIG.historyApp.fields.appId]: { value: historyData.appId },
                        [CONFIG.historyApp.fields.ledgerName]: { value: historyData.ledgerName },
                        [CONFIG.historyApp.fields.result]: { value: historyData.updateResult }
                    };

                    // request, response, errorはオブジェクト形式で投入
                    if (historyData.request) {
                        record[CONFIG.historyApp.fields.request] = { value: JSON.stringify(historyData.request) };
                    }
                    if (historyData.response) {
                        record[CONFIG.historyApp.fields.response] = { value: JSON.stringify(historyData.response) };
                    }
                    if (historyData.error) {
                        record[CONFIG.historyApp.fields.error] = { value: JSON.stringify(historyData.error) };
                    }

                    return record;
                });

                // kintone REST API で台帳別に登録
                const response = await kintone.api(kintone.api.url('/k/v1/records', true), 'POST', {
                    app: CONFIG.historyApp.appId,
                    records: records
                });

                console.log(`✅ 台帳 ${appId} の履歴管理アプリへの投入完了 (${records.length}件)`);
                console.log('📊 投入された履歴データ:', response.ids);

                // 該当台帳の履歴データをクリア
                this.updateHistoryMap.delete(appId);

            } else {
                // appIdが指定されていない場合は全台帳のデータを処理（従来の動作）
                if (this.updateHistoryMap.size === 0) {
                    console.log('📝 履歴データがありません');
                    return;
                }

                // 全台帳の履歴データを収集
                const allHistoryData = [];
                for (const [appId, ledgerHistoryMap] of this.updateHistoryMap) {
                    for (const [historyKey, historyData] of ledgerHistoryMap) {
                        allHistoryData.push(historyData);
                    }
                }

                if (allHistoryData.length === 0) {
                    console.log('📝 履歴データがありません');
                    return;
                }

                // 履歴データをレコード形式に変換
                const records = allHistoryData.map(historyData => {
                    const record = {
                        [CONFIG.historyApp.fields.batchId]: { value: historyData.batchId },
                        [CONFIG.historyApp.fields.recordId]: { value: historyData.recordId },
                        [CONFIG.historyApp.fields.appId]: { value: historyData.appId },
                        [CONFIG.historyApp.fields.ledgerName]: { value: historyData.ledgerName },
                        [CONFIG.historyApp.fields.result]: { value: historyData.updateResult }
                    };

                    // request, response, errorはオブジェクト形式で投入
                    if (historyData.request) {
                        record[CONFIG.historyApp.fields.request] = { value: JSON.stringify(historyData.request) };
                    }
                    if (historyData.response) {
                        record[CONFIG.historyApp.fields.response] = { value: JSON.stringify(historyData.response) };
                    }
                    if (historyData.error) {
                        record[CONFIG.historyApp.fields.error] = { value: JSON.stringify(historyData.error) };
                    }

                    return record;
                });

                // kintone REST API で一括登録
                const response = await kintone.api(kintone.api.url('/k/v1/records', true), 'POST', {
                    app: CONFIG.historyApp.appId,
                    records: records
                });

                console.log(`✅ 履歴管理アプリへの投入完了 (${records.length}件)`);
                console.log('📊 投入された履歴データ:', response.ids);

                // 履歴データをクリア
                this.updateHistoryMap.clear();
            }

        } catch (error) {
            console.error('❌ 履歴管理アプリへの投入エラー:', error);
            // エラーが発生しても処理を継続（履歴データは保持）
        }
    }

    /**
     * エラーログを統一フォーマットで出力
     */
    logError(operation, error) {
        console.error(`❌ ${operation}エラー:`, error);
    }

    /**
     * VirtualScrollテーブルを再描画
     */
    refreshVirtualScrollTable() {
        try {
            // 既存のテーブルコンテナを取得
            const resultsContainer = document.getElementById(CONFIG.system.resultsContainerId);
            const integratedResults = resultsContainer?.querySelector('.integrated-results');
            const tableContainer = integratedResults?.querySelector('.integrated-table-container');
            
            if (tableContainer && this.currentSearchResults) {
                // 現在のスクロール位置を保存
                const scrollContainer = tableContainer.querySelector('.virtual-scroll-container');
                if (scrollContainer) {
                    this.virtualScroll.savedScrollTop = scrollContainer.scrollTop;
                }
                
                // 変更フラグを保持（再描画前に現在の状態を保存）
                const currentChangeFlags = new Map(this.virtualScroll.changeFlags);
                const currentChangedFields = new Map(this.virtualScroll.changedFields);
                
                // 新しいVirtualScrollテーブルを作成
                const newTableContainer = this.virtualScroll.createVirtualScrollTable(this.currentSearchResults);
                
                // 変更フラグを復元
                this.virtualScroll.changeFlags = currentChangeFlags;
                this.virtualScroll.changedFields = currentChangedFields;
                
                // 既存のテーブルコンテナを新しいものと置き換え
                tableContainer.parentNode.replaceChild(newTableContainer, tableContainer);
                
                // 変更フラグUIを復元
                this.virtualScroll.restoreChangeFlagsUI();
                // バリデーションハイライトも復元
                if (window.validation && typeof window.validation.restoreInvalidStylesUI === 'function') {
                    window.validation.restoreInvalidStylesUI();
                }
                // バリデーションハイライトも復元
                if (window.validation) {
                    window.validation.restoreInvalidStylesUI();
                }
                
                console.log(`✅ VirtualScrollテーブル再描画完了 (${this.currentSearchResults.length}件)`);
            }
        } catch (error) {
            this.logError('VirtualScrollテーブル再描画', error);
        }
    }

    /**
     * スクロール位置を保持してテーブルを再描画
     */
    refreshVirtualScrollTableWithScrollPreservation(forcedScrollTop = null) {
        try {
            // スクロールコンテナを取得
            const resultsContainer = document.getElementById(CONFIG.system.resultsContainerId);
            const integratedResults = resultsContainer?.querySelector('.integrated-results');
            const tableContainer = integratedResults?.querySelector('.integrated-table-container');
            const scrollContainer = tableContainer?.querySelector('.virtual-scroll-container');
            
            // スクロール位置を保存
            let savedScrollTop = forcedScrollTop; // 強制指定を優先
            if (savedScrollTop === null && scrollContainer) {
                savedScrollTop = scrollContainer.scrollTop;
            }
            
            if (savedScrollTop > 0) {
                // VirtualScrollのプロパティにも保存
                this.virtualScroll.savedScrollTop = savedScrollTop;
            }
            
            // 通常の再描画を実行
            this.refreshVirtualScrollTable();
            
            // 再描画後に強制的にスクロール位置を復元
            if (savedScrollTop > 0) {
                setTimeout(() => {
                    const newScrollContainer = document.querySelector('.virtual-scroll-container');
                    if (newScrollContainer) {
                        newScrollContainer.scrollTop = savedScrollTop;
                    }
                }, 150); // 十分な時間を確保
            }
            // バリデーションハイライトも復元
            if (window.validation) {
                window.validation.restoreInvalidStylesUI();
            }
            
        } catch (error) {
            this.logError('スクロール位置保持テーブル再描画', error);
        }
    }


    /**
     * 変更フラグをリセット
     */
    resetChangeFlags(changedIndices) {
        if (!window.virtualScroll) {
            console.warn('VirtualScrollインスタンスが見つかりません - フラグリセットをスキップ');
            return;
        }
        
        changedIndices.forEach(index => {
            window.virtualScroll.setChangeFlag(index, false);
        });
    }

    /**
     * トーストメッセージを表示
     */
    showToast(message, type = 'info') {
        let toast = document.getElementById('save-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'save-toast';
            toast.style.position = 'fixed';
            toast.style.bottom = '40px';
            toast.style.left = '50%';
            toast.style.transform = 'translateX(-50%)';
            toast.style.padding = '8px 24px';
            toast.style.borderRadius = '6px';
            toast.style.zIndex = 9999;
            toast.style.fontSize = '1.1em';
            document.body.appendChild(toast);
        }
        
        // タイプに応じてスタイルを変更
        if (type === 'success') {
            toast.style.background = 'rgba(40, 167, 69, 0.9)'; // 緑色
            toast.style.color = '#fff';
        } else if (type === 'error') {
            toast.style.background = 'rgba(220, 53, 69, 0.9)'; // 赤色
            toast.style.color = '#fff';
        } else {
            toast.style.background = 'rgba(0,0,0,0.8)'; // デフォルト
            toast.style.color = '#fff';
        }
        
        toast.textContent = message;
        toast.style.display = 'block';
        setTimeout(() => {
            toast.style.display = 'none';
        }, 2000); // 成功・エラーは2秒間表示
    }

}

// グローバルに公開
window.TableRenderer = TableRenderer; 