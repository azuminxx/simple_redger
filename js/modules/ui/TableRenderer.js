/**
 * テーブル表示クラス
 */
class TableRenderer {
    constructor() {
        this.virtualScroll = new VirtualScroll();
        this.currentSearchResults = []; // 現在の検索結果を保持
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
            
            // 各台帳ごとにレコードをグループ化
            const recordsByApp = this.groupRecordsByApp();
            
            // 各台帳のレコードを更新
            const updatePromises = [];
            for (const [appId, records] of Object.entries(recordsByApp)) {
                if (records.length > 0) {
                    updatePromises.push(this.updateAppRecords(appId, records));
                }
            }
            
            await Promise.all(updatePromises);
            
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
     * レコードを台帳ごとにグループ化
     */
    groupRecordsByApp() {
        const recordsByApp = {};
        
        // 各台帳のレコードを初期化
        Object.keys(CONFIG.apps).forEach(appId => {
            recordsByApp[appId] = [];
        });
        
        this.currentSearchResults.forEach(integratedRecord => {
            // 各台帳からフィールドを抽出
            Object.entries(CONFIG.apps).forEach(([appId, appConfig]) => {
                const ledgerName = appConfig.name;
                const record = { $id: null };
                let hasData = false;
                
                // 統合キーを取得
                const integrationKeyValue = integratedRecord[`${ledgerName}_${CONFIG.integrationKey}`];
                if (integrationKeyValue) {
                    // 統合キーから実際のレコードIDを取得する必要があります
                    // ここでは簡略化のため統合キーを使用
                    record[CONFIG.integrationKey] = { value: integrationKeyValue };
                    hasData = true;
                }
                
                // 各フィールドの値を設定
                CONFIG.getDisplayFields(appId).forEach(fieldCode => {
                    const fieldKey = `${ledgerName}_${fieldCode}`;
                    if (integratedRecord.hasOwnProperty(fieldKey)) {
                        record[fieldCode] = { value: integratedRecord[fieldKey] };
                        hasData = true;
                    }
                });
                
                if (hasData) {
                    recordsByApp[appId].push(record);
                }
            });
        });
        
        return recordsByApp;
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
                // 統合キーでレコードを検索してIDを取得
                const integrationKeyValue = record[CONFIG.integrationKey]?.value;
                if (!integrationKeyValue) {
                    throw new Error('統合キーが見つかりません');
                }
                
                // レコード検索
                const query = `${CONFIG.integrationKey} = "${integrationKeyValue}"`;
                const searchResult = await window.searchEngine.searchRecordsWithQuery(appId, query);
                
                if (searchResult.length === 0) {
                    console.warn(`統合キー ${integrationKeyValue} のレコードが見つかりません`);
                    return;
                }
                
                const targetRecord = searchResult[0];
                const recordId = targetRecord.$id.value;
                
                // レコード更新用のデータを準備
                const updateData = { $id: { value: recordId } };
                Object.keys(record).forEach(fieldCode => {
                    if (fieldCode !== '$id' && fieldCode !== CONFIG.integrationKey) {
                        updateData[fieldCode] = record[fieldCode];
                    }
                });
                
                // レコードを更新
                await kintone.api(kintone.api.url('/k/v1/record', true), 'PUT', {
                    app: appId,
                    id: recordId,
                    record: updateData
                });
                
                console.log(`✅ ${CONFIG.apps[appId].name} レコードID ${recordId} を更新`);
                
            } catch (error) {
                console.error(`❌ ${CONFIG.apps[appId].name} レコード更新エラー:`, error);
                throw error;
            }
        });
        
        await Promise.all(updatePromises);
    }
}

// グローバルに公開
window.TableRenderer = TableRenderer; 