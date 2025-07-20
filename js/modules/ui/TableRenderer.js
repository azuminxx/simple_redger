/**
 * テーブル表示クラス
 */
class TableRenderer {
    constructor() {
        this.virtualScroll = new VirtualScroll();
        this.currentSearchResults = []; // 現在の検索結果を保持
        
        // VirtualScrollインスタンスをグローバルに設定
        window.virtualScroll = this.virtualScroll;
        
        // 更新ルール定義（単純化）
        this.UPDATE_RULES = {
            'PC番号': 'all',      // 全台帳
            '内線番号': 'all',     // 全台帳
            '座席番号': 'all',     // 全台帳
            'ユーザーID': 'pc_only', // PC台帳のみ
            '*': 'origin'         // その他は元台帳のみ
        };
    }

    /**
     * 統合データをテーブル表示
     */
    displayIntegratedTable(appId, integratedData) {
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
        
        const title = DOMHelper.createElement('h3');
        title.textContent = `統合検索結果（${integratedData.length}件）`;
        titleContainer.appendChild(title);
        
        // 保存ボタンを作成
        const saveButton = DOMHelper.createElement('button', {}, 'save-changes-button');
        saveButton.textContent = '変更を保存';
        saveButton.addEventListener('click', () => {
            this.saveChanges();
        });
        titleContainer.appendChild(saveButton);
        
        integratedResultsContainer.appendChild(titleContainer);

        // 仮想スクロール対応のテーブルコンテナを作成
        const tableContainer = this.virtualScroll.createVirtualScrollTable(integratedData);
        
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
        const title = DOMHelper.createElement('h3');
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
            console.log('📤 変更保存開始...');
            
            // 変更されたレコードのインデックスを取得
            if (!window.virtualScroll) {
                throw new Error('VirtualScrollインスタンスが見つかりません');
            }
            
            const changedIndices = window.virtualScroll.getChangedRecordIndices();
            
            if (changedIndices.length === 0) {
                alert('変更されたレコードがありません。');
                return;
            }
            
            console.log(`📝 変更されたレコード: ${changedIndices.length}件`);
            
            // 変更されたレコードのみから各台帳ごとにレコードをグループ化
            const recordsByApp = this.groupRecordsByApp(changedIndices);
            
            // 各台帳のレコードを一括更新
            const updatePromises = [];
            for (const [appId, records] of Object.entries(recordsByApp)) {
                if (records.length > 0) {
                    updatePromises.push(this.updateAppRecordsBatch(appId, records));
                }
            }
            
            await Promise.all(updatePromises);
            
            // 変更フラグをリセット
            this.resetChangeFlags(changedIndices);
            
            console.log('✅ 全ての変更が保存されました');
            alert('変更が正常に保存されました。');
            
        } catch (error) {
            console.error('❌ 保存エラー:', error);
            alert(`保存中にエラーが発生しました。\n詳細: ${error.message}`);
        } finally {
            if (saveButton) {
                saveButton.disabled = false;
                saveButton.textContent = '変更を保存';
            }
        }
    }

    /**
     * レコードを台帳ごとにグループ化（更新要件に基づく）
     */
    groupRecordsByApp(changedIndices = null) {
        const recordsByApp = {};
        
        // 各台帳のレコードを初期化
        Object.keys(CONFIG.apps).forEach(appId => {
            recordsByApp[appId] = [];
        });
        
        // 処理対象のレコードを決定（変更されたレコードのみまたは全レコード）
        const targetRecords = changedIndices 
            ? changedIndices.map(index => this.currentSearchResults[index])
            : this.currentSearchResults;
        
        targetRecords.forEach((integratedRecord, index) => {
            // 各台帳のレコードを準備
            const recordsToUpdate = {};
            
            // 実際のレコードインデックスを取得（changedIndicesを使用している場合）
            const actualRecordIndex = changedIndices ? changedIndices[index] : index;
            
            // 変更されたフィールドのみを取得
            const changedFieldKeys = window.virtualScroll.getChangedFields(actualRecordIndex);
            
            if (changedFieldKeys.size === 0) {
                console.warn(`⚠️ レコード${actualRecordIndex}に変更されたフィールドがありません`);
                return;
            }
            
            console.log(`🔍 レコード${actualRecordIndex}の変更フィールド:`, Array.from(changedFieldKeys));
            
            // 全台帳のレコードIDを取得
            Object.entries(CONFIG.apps).forEach(([appId, appConfig]) => {
                const ledgerName = appConfig.name;
                const recordIdValue = integratedRecord[`${ledgerName}_$id`];
                
                if (recordIdValue) {
                    recordsToUpdate[appId] = {
                        $id: { value: recordIdValue },
                        ledgerName: ledgerName
                    };
                    
                    // 統合キーを設定
                    const integrationKeyValue = integratedRecord[`${ledgerName}_${CONFIG.integrationKey}`];
                    if (integrationKeyValue) {
                        recordsToUpdate[appId][CONFIG.integrationKey] = { value: integrationKeyValue };
                    }
                }
            });
            
            // 変更されたフィールドのみを各台帳に振り分け
            changedFieldKeys.forEach(fieldKey => {
                const value = integratedRecord[fieldKey];
                const updateTargets = this.getUpdateTargetsForField(fieldKey);
                const fieldCode = this.extractFieldCodeFromKey(fieldKey);
                
                updateTargets.forEach(appId => {
                    if (recordsToUpdate[appId]) {
                        recordsToUpdate[appId][fieldCode] = { value: value };
                    }
                });
            });
            
            // 各台帳のレコードを追加
            Object.entries(recordsToUpdate).forEach(([appId, record]) => {
                // レコードIDと統合キー、ledgerName以外のフィールドがある場合のみ追加
                const updateFields = Object.keys(record).filter(key => 
                    key !== '$id' && key !== CONFIG.integrationKey && key !== 'ledgerName'
                );
                const hasUpdateFields = updateFields.length > 0;
                
                if (hasUpdateFields) {
                    recordsByApp[appId].push(record);
                }
            });
        });
        
        return recordsByApp;
    }

    /**
     * フィールドの更新対象台帳を取得（単純化版）
     */
    getUpdateTargetsForField(fieldKey) {
        const fieldCode = this.extractFieldCodeFromKey(fieldKey);
        
        // 更新ルールに基づいて判定
        const rule = this.UPDATE_RULES[fieldCode] || this.UPDATE_RULES['*'];
        
        switch (rule) {
            case 'all':
                // 全台帳で更新
                return Object.keys(CONFIG.apps);
                
            case 'pc_only':
                // PC台帳のみ更新
                return Object.keys(CONFIG.apps).filter(appId => CONFIG.apps[appId].name === 'PC台帳');
                
            case 'origin':
            default:
                // 元の台帳のみ更新
                const ledgerName = this.extractLedgerNameFromKey(fieldKey);
                return Object.keys(CONFIG.apps).filter(appId => CONFIG.apps[appId].name === ledgerName);
        }
    }

    /**
     * フィールドキーからフィールドコードを抽出
     */
    extractFieldCodeFromKey(fieldKey) {
        // "台帳名_フィールドコード" の形式からフィールドコードを抽出
        const parts = fieldKey.split('_');
        return parts.slice(1).join('_'); // 台帳名を除いた部分
    }

    /**
     * フィールドキーから台帳名を抽出
     */
    extractLedgerNameFromKey(fieldKey) {
        // "台帳名_フィールドコード" の形式から台帳名を抽出
        const parts = fieldKey.split('_');
        return parts[0]; // 最初の部分が台帳名
    }

    /**
     * 特定のアプリのレコードを更新
     */
    async updateAppRecords(appId, records) {
        console.log(`📝 ${CONFIG.apps[appId].name}のレコードを更新中... (${records.length}件)`);
        
        // レコードの更新処理
        // 注意: この実装は簡略化されています。実際の実装では以下が必要です：
        // 1. 統合キーから実際のレコードIDを取得
        // 2. 既存レコードの検索と更新
        // 3. エラーハンドリング
        
        const updatePromises = records.map(async (record) => {
            try {
                // レコードIDを取得
                const recordIdValue = record.$id?.value;
                if (!recordIdValue) {
                    console.warn(`${CONFIG.apps[appId].name} レコードIDが見つかりません - スキップします`);
                    return;
                }
                
                // レコード更新用のデータを準備
                const updateData = {};
                Object.keys(record).forEach(fieldCode => {
                    if (fieldCode !== '$id' && fieldCode !== CONFIG.integrationKey) {
                        updateData[fieldCode] = record[fieldCode];
                    }
                });
                
                // レコードを更新
                await kintone.api(kintone.api.url('/k/v1/record', true), 'PUT', {
                    app: appId,
                    id: recordIdValue,
                    record: updateData
                });
                
                console.log(`✅ ${CONFIG.apps[appId].name} レコードID ${recordIdValue} を更新`);
                
            } catch (error) {
                this.logError(`${CONFIG.apps[appId].name} レコード更新`, error);
                throw error;
            }
        });
        
        await Promise.all(updatePromises);
    }

    /**
     * 特定のアプリのレコードを一括更新
     */
    async updateAppRecordsBatch(appId, records) {
        console.log(`📝 ${CONFIG.apps[appId].name}のレコードを一括更新中... (${records.length}件)`);
        
        try {
            // 一括更新用のデータを準備
            const updateRecords = records.map(record => {
                const recordIdValue = record.$id?.value;
                if (!recordIdValue) {
                    throw new Error(`レコードIDが見つかりません`);
                }
                
                // 更新データを準備（$idと統合キーを除外）
                const updateData = {};
                Object.keys(record).forEach(fieldCode => {
                    if (fieldCode !== '$id' && fieldCode !== CONFIG.integrationKey) {
                        updateData[fieldCode] = record[fieldCode];
                    }
                });
                
                return {
                    id: recordIdValue,
                    record: updateData
                };
            });
            
            // API実行回数をカウント
            window.apiCounter.count(appId, 'レコード一括更新');
            
            // kintone REST API の一括更新を実行
            const response = await kintone.api(kintone.api.url('/k/v1/records', true), 'PUT', {
                app: appId,
                records: updateRecords
            });
            
            console.log(`✅ ${CONFIG.apps[appId].name} 一括更新完了 (${records.length}件)`);
            return response;
            
        } catch (error) {
            this.logError(`${CONFIG.apps[appId].name} 一括更新`, error);
            throw error;
        }
    }

    /**
     * エラーログを統一フォーマットで出力
     */
    logError(operation, error) {
        console.error(`❌ ${operation}エラー:`, error);
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
        console.log(`🔄 変更フラグをリセット (${changedIndices.length}件)`);
    }
}

// グローバルに公開
window.TableRenderer = TableRenderer; 