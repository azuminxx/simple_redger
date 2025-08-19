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
        
        // 新しい絞り込み機能の状態管理
        this.checkedRows = new Set(); // チェックされた行のインデックスを保存
        this.filterFlag = 'FILTER_SELECTED_ROW'; // DOM側に埋め込むフラグ文字列
        this.isFiltered = false; // 絞り込み状態を管理
        // 保存後に実行するタスク（セル分離の遅延反映など）
        this.postSaveTasks = [];
    }

    // 保存後タスクを追加
    addPostSaveTask(task) {
        if (typeof task === 'function') this.postSaveTasks.push(task);
    }

    // 保存後タスクを実行
    runPostSaveTasks() {
        if (!this.postSaveTasks || this.postSaveTasks.length === 0) return;
        try {
            this.postSaveTasks.forEach(fn => {
                try { fn(); } catch (e) { /* noop */ }
            });
        } finally {
            this.postSaveTasks = [];
        }
    }

    // 内部ヘルパー: _originalIntegratedData を統合キーで同期
    syncOriginalDataRowByKeys(oldKey, newKey, newRow) {
        try {
            if (!Array.isArray(this._originalIntegratedData)) return;
            let idx = this._originalIntegratedData.findIndex(r => window.virtualScroll.getRecordIdFromRow(r) === oldKey);
            if (idx === -1) {
                idx = this._originalIntegratedData.findIndex(r => window.virtualScroll.getRecordIdFromRow(r) === newKey);
            }
            if (idx !== -1) {
                this._originalIntegratedData[idx] = { ...newRow };
            }
        } catch (e) {
            console.warn('syncOriginalDataRowByKeys error:', e);
        }
    }

    // 内部ヘルパー: 整合性マップ更新と表示セル反映
    updateConsistencyForIndices(indices) {
        if (!indices || indices.length === 0) return;
        if (!window.consistencyMap) window.consistencyMap = new Map();
        const colIdx = CONFIG.integratedTableConfig.columns.findIndex(col => col.isConsistencyCheck);
        const tdIndex = colIdx >= 0 ? (1 + colIdx) : -1; // 先頭のチェックボックス列ぶん+1
        indices.forEach(index => {
            const row = this.currentSearchResults[index];
            const recordId = window.virtualScroll.getRecordIdFromRow(row);
            const label = this.getConsistencyResult(row);
            const isConsistent = label === '整合' ? true : (label === '不整合' ? false : null);
            window.consistencyMap.set(recordId, isConsistent);
            if (tdIndex >= 0) {
                const tr = document.querySelector(`tr[data-record-index="${index}"]`);
                if (tr && tr.children && tr.children[tdIndex]) {
                    const td = tr.children[tdIndex];
                    let text = '-';
                    if (isConsistent === true) {
                        text = '✅';
                        td.className = 'consistency-ok readonly-cell';
                    } else if (isConsistent === false) {
                        text = '❌';
                        td.className = 'consistency-ng readonly-cell';
                    } else {
                        td.className = 'null-value readonly-cell';
                    }
                    td.textContent = text;
                }
            }
        });
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

        // テーブル内検索結果件数表示用
        const searchResultTitle = DOMHelper.createElement('span', {}, 'table-search-result-count');
        searchResultTitle.textContent = `テーブル内検索結果：${integratedData.length}件`;
        searchResultTitle.style.marginLeft = '20px';
        searchResultTitle.style.fontSize = '14px';
        searchResultTitle.style.color = '#007bff';
        searchResultTitle.style.fontWeight = '600';
        titleContainer.appendChild(searchResultTitle);
        
        // 保存ボタンを作成
        const saveButton = DOMHelper.createElement('button', {}, 'save-changes-button');
        saveButton.textContent = '変更を保存';
        saveButton.addEventListener('click', () => {
            this.saveChanges();
        });
        titleContainer.appendChild(saveButton);

        // エクスポートボタンを作成
        const exportButton = DOMHelper.createElement('button', {}, 'export-data-button');
        exportButton.textContent = 'Excel出力';
        exportButton.addEventListener('click', () => {
            this.exportToExcel();
        });
        titleContainer.appendChild(exportButton);

        integratedResultsContainer.appendChild(titleContainer);

        // 検索・絞込 UI を分離クラスで構築
        if (!window.SearchAndFilter) {
            // minimal: fail silent
        } else {
            if (!this.searchAndFilter) this.searchAndFilter = new window.SearchAndFilter(this);
            this.searchAndFilter.build(integratedResultsContainer);
        }

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
        
        // チェックボックスカラム用のヘッダー（絞り込み・解除ボタン付き）
        const checkboxTh = DOMHelper.createElement('th');
        checkboxTh.className = 'header-ledger-cell checkbox-header';
        checkboxTh.rowSpan = 2; // 2行分を結合
        
        // ボタンコンテナを作成
        const buttonContainer = DOMHelper.createElement('div', {}, 'filter-button-container');
        
        // トグルボタンを作成
        const toggleButton = DOMHelper.createElement('button', {}, 'header-toggle-button');
        this.updateToggleButtonState(toggleButton); // 初期状態を設定
        toggleButton.addEventListener('click', () => {
            this.toggleFilter(toggleButton);
        });
        
        buttonContainer.appendChild(toggleButton);
        checkboxTh.appendChild(buttonContainer);
        row.appendChild(checkboxTh);
        
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
        
        // チェックボックスカラムは1行目で2行分結合済みなのでスキップ
        
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
                    // _originalIntegratedData も同期（古い値が検索に残らないようにする）
                    this.syncOriginalDataRowByKeys(oldKey, newKey, row);
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

                // 保存後に整合性マップを最新化し、表示も更新
                this.updateConsistencyForIndices(changedIndices);
            }
            
            // 保存成功後に遅延タスクを実行（セル分離後の統合キー再生成や同期など）
            this.runPostSaveTasks();
            
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
                        // 起点台帳も必ず対象に含める（主キー交換時に自台帳の主キーも更新対象にするため）
                        affectedLedgers.add(ledgerName);
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
            
            // info log removed
            
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
        if (!this.exportAndHistory && window.ExportAndHistory) {
            this.exportAndHistory = new window.ExportAndHistory(this);
        }
        if (this.exportAndHistory && typeof this.exportAndHistory.uploadHistoryToApp === 'function') {
            return this.exportAndHistory.uploadHistoryToApp(appId);
        }
        // controller missing: no-op
    }

    /**
     * エラーログを統一フォーマットで出力
     */
    logError(operation, error) { /* minimal */ }

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

    /**
     * 検索結果をExcelファイルにエクスポート
     */
    exportToExcel() {
        if (!this.exportAndHistory && window.ExportAndHistory) {
            this.exportAndHistory = new window.ExportAndHistory(this);
        }
        if (this.exportAndHistory && typeof this.exportAndHistory.exportToExcel === 'function') {
            return this.exportAndHistory.exportToExcel();
        }
        console.error('ExportAndHistory が利用できず、exportToExcel を実行できません');
    }

    /**
     * エクスポート用カラムを台帳ごとにグループ化
     */
    groupExportColumnsByLedger(columns) {
        if (!this.exportAndHistory && window.ExportAndHistory) {
            this.exportAndHistory = new window.ExportAndHistory(this);
        }
        if (this.exportAndHistory && typeof this.exportAndHistory.groupExportColumnsByLedger === 'function') {
            return this.exportAndHistory.groupExportColumnsByLedger(columns);
        }
        return [];
    }

    /**
     * テーブル内検索結果件数を更新
     */
    updateSearchResultCount(count) {
        const searchResultTitle = document.querySelector('.table-search-result-count');
        if (searchResultTitle) {
            searchResultTitle.textContent = `テーブル内検索結果：${count}件`;
        }
    }

    /**
     * 検索対象となる値のみを取得（DOM属性由来のプロパティを除外）
     */
    getSearchableValues(row) {
        return Object.keys(row)
            .filter(key => {
                // 除外するプロパティパターン
                // - レコードID: *_$id
                // - リビジョン: *_$revision  
                // - 各台帳の統合キー: *_{CONFIG.integrationKey}（古い値が残るため検索対象から除外）
                // グローバル統合キー（CONFIG.integrationKey）は残す
                return !key.endsWith('_$id') && 
                       !key.endsWith('_$revision') &&
                       !(key.endsWith('_' + CONFIG.integrationKey));
            })
            .map(key => row[key])
            .filter(value => value !== null && value !== undefined);
    }

    /**
     * 指定行のDOM要素からフラグ属性を取得
     * @param {number} rowIndex - 行インデックス
     * @returns {Array} フラグの配列
     */
    getDOMFlagsForRow(rowIndex) {
        if (this.searchAndFilter && typeof this.searchAndFilter.getDOMFlagsForRow === 'function') {
            return this.searchAndFilter.getDOMFlagsForRow(rowIndex);
        }
        return [];
    }

    /**
     * 行の整合性チェック結果を取得
     */
    getConsistencyResult(row) {
        // 可能なら現在の行データから統合キーを再生成（最も信頼できる現状値）
        let integrationKey = null;
        if (window.virtualScroll && typeof window.virtualScroll.generateIntegrationKeyFromRow === 'function') {
            integrationKey = window.virtualScroll.generateIntegrationKeyFromRow(row);
        } else {
            // フォールバック: 既存の台帳別統合キーから取得
            for (const appId in CONFIG.apps) {
                const ledgerName = CONFIG.apps[appId].name;
                const key = `${ledgerName}_${CONFIG.integrationKey}`;
                if (row[key]) {
                    integrationKey = row[key];
                    break;
                }
            }
        }

        if (integrationKey) {
            const DataIntegratorClass = window.DataIntegrator;
            const dataIntegrator = new DataIntegratorClass();
            const parsed = dataIntegrator.parseIntegrationKey(integrationKey);
            const pc = row['PC台帳_PC番号'] || '';
            const ext = row['内線台帳_内線番号'] || '';
            const seat = row['座席台帳_座席番号'] || '';
            
            function isFieldConsistent(a, b) {
                const isEmpty = v => v === null || v === undefined || v === '';
                if (isEmpty(a) && isEmpty(b)) return true;
                return a === b;
            }
            
            const isConsistent =
                isFieldConsistent(parsed.PC, pc) &&
                isFieldConsistent(parsed.EXT, ext) &&
                isFieldConsistent(parsed.SEAT, seat);
            
            return isConsistent ? '整合' : '不整合';
        }
        return '';
    }

    /**
     * テーブル内検索を活用した絞り込み実行
     */
    executeFilterBySearch() {
        if (this.searchAndFilter && typeof this.searchAndFilter.executeFilterBySearch === 'function') {
            return this.searchAndFilter.executeFilterBySearch();
        }
    }

    /**
     * テーブル内検索による絞り込み解除
     */
    clearFilterBySearch() {
        if (this.searchAndFilter && typeof this.searchAndFilter.clearFilterBySearch === 'function') {
            return this.searchAndFilter.clearFilterBySearch();
        }
    }

    /**
     * トグルボタンの状態を更新
     */
    updateToggleButtonState(button) {
        if (this.searchAndFilter && typeof this.searchAndFilter.updateToggleButtonState === 'function') {
            return this.searchAndFilter.updateToggleButtonState(button);
        }
    }

    /**
     * フィルターのトグル処理
     */
    toggleFilter(button) {
        console.log(`🎯 トグル開始: 現在のisFiltered=${this.isFiltered}`);
        
        if (this.isFiltered) {
            this.clearFilterBySearch();
        } else {
            this.executeFilterBySearch();
        }
        
        console.log(`🎯 トグル後: isFiltered=${this.isFiltered}`);
        
        // ボタン状態を更新
        this.updateToggleButtonState(button);
        
        // さらに、現在のページ上のすべてのトグルボタンを更新
        this.updateAllToggleButtons();
    }

    /**
     * ページ上のすべてのトグルボタンの状態を更新
     */
    updateAllToggleButtons() {
        if (this.searchAndFilter && typeof this.searchAndFilter.updateAllToggleButtons === 'function') {
            return this.searchAndFilter.updateAllToggleButtons();
        }
    }

    /**
     * 全てのチェックボックスをクリアする
     */
    clearAllCheckboxes() {
        if (this.searchAndFilter && typeof this.searchAndFilter.clearAllCheckboxes === 'function') {
            return this.searchAndFilter.clearAllCheckboxes();
        }
    }

    /**
     * 絞り込み状態をリセットする（テーブル検索クリア時用）
     */
    resetFilterState() {
        if (this.searchAndFilter && typeof this.searchAndFilter.resetFilterState === 'function') {
            return this.searchAndFilter.resetFilterState();
        }
    }

}

// グローバルに公開
window.TableRenderer = TableRenderer; 