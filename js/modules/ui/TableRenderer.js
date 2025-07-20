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
        
        // 更新ルール定義（主キー交換対応）
        this.UPDATE_RULES = {
            'PC番号': 'exclude_origin',    // PC番号は他の台帳のみ（PC台帳は除外）
            '内線番号': 'exclude_origin',   // 内線番号は他の台帳のみ（内線台帳は除外）
            '座席番号': 'exclude_origin',   // 座席番号は他の台帳のみ（座席台帳は除外）
            'ユーザーID': 'pc_only',       // PC台帳のみ
            '*': 'origin'                 // その他は元台帳のみ
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
            
            console.log(`📝 保存開始: ${changedIndices.length}件のレコードを更新`);
            
            // 変更されたレコードのみから各台帳ごとにレコードをグループ化
            const recordsByApp = this.groupRecordsByApp(changedIndices);
            
            // 各台帳のレコードを一括更新（レコードがある場合のみ）
            const updatePromises = [];
            for (const [appId, records] of Object.entries(recordsByApp)) {
                if (records.length > 0) {
                    updatePromises.push(this.updateAppRecordsBatch(appId, records));
                }
            }
            
            await Promise.all(updatePromises);
            
            // 変更フラグをリセット
            this.resetChangeFlags(changedIndices);
            
            console.log('✅ 保存完了: 全ての変更がkintoneに反映されました');
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
     * DOMから変更されたレコードを台帳ごとにグループ化（全台帳対応版）
     */
    groupRecordsByApp(changedIndices = null) {

        

        
        // 【重要】kintone更新用レコードオブジェクト作成
        // ■ 各台帳の交換されたデータを、kintone REST API形式に変換
        // ■ 形式：{id: レコードID, record: {フィールド名: {value: 値}}}
        const updateRecordsByApp = {};
        
        changedIndices.forEach(rowIndex => {
            ['PC台帳', '内線台帳', '座席台帳'].forEach(ledgerName => {
                const recordIdKey = `${ledgerName}_$id`;
                const recordId = this.currentSearchResults[rowIndex][recordIdKey];
                
                if (recordId) {
                    // appIdを取得
                    const appId = this.getAppIdByLedgerName(ledgerName);
                    if (!appId) return;
                    
                    // updateRecordsByAppに追加
                    if (!updateRecordsByApp[appId]) {
                        updateRecordsByApp[appId] = [];
                    }
                    
                    let updateRecord = {
                        id: parseInt(recordId),
                        record: {}
                    };
                    
                    if (ledgerName === 'PC台帳') {
                        // 【重要】PC台帳の更新フィールド構成
                        const userId = this.currentSearchResults[rowIndex]['PC台帳_ユーザーID'];
                        const pcUsage = this.currentSearchResults[rowIndex]['PC台帳_PC用途'];
                        const test1 = this.currentSearchResults[rowIndex]['PC台帳_test1'];
                        const sample = this.currentSearchResults[rowIndex]['PC台帳_sample'];
                        const extensionNumber = this.currentSearchResults[rowIndex]['内線台帳_内線番号'];
                        const seatNumber = this.currentSearchResults[rowIndex]['座席台帳_座席番号'];
                        
                        updateRecord.record = {
                            "ユーザーID": { value: userId },
                            "PC用途": { value: pcUsage },
                            "test1": { value: test1 },
                            "sample": { value: sample },
                            "内線番号": { value: extensionNumber },
                            "座席番号": { value: seatNumber }
                        };
                        
                    } else if (ledgerName === '内線台帳') {
                        // 内線台帳の更新フィールド
                        const phoneType = this.currentSearchResults[rowIndex]['内線台帳_電話機種別'];
                        const pcNumber = this.currentSearchResults[rowIndex]['PC台帳_PC番号'];
                        const seatNumber = this.currentSearchResults[rowIndex]['座席台帳_座席番号'];
                        
                        updateRecord.record = {
                            "電話機種別": { value: phoneType },
                            "PC番号": { value: pcNumber },
                            "座席番号": { value: seatNumber }
                        };
                        
                    } else if (ledgerName === '座席台帳') {
                        // 座席台帳の更新フィールド
                        const seatLocation = this.currentSearchResults[rowIndex]['座席台帳_座席拠点'];
                        const floor = this.currentSearchResults[rowIndex]['座席台帳_階数'];
                        const seatDepartment = this.currentSearchResults[rowIndex]['座席台帳_座席部署'];
                        const pcNumber = this.currentSearchResults[rowIndex]['PC台帳_PC番号'];
                        const extensionNumber = this.currentSearchResults[rowIndex]['内線台帳_内線番号'];
                        
                        updateRecord.record = {
                            "座席拠点": { value: seatLocation },
                            "階数": { value: floor },
                            "座席部署": { value: seatDepartment },
                            "PC番号": { value: pcNumber },
                            "内線番号": { value: extensionNumber }
                        };
                    }
                    
                    updateRecordsByApp[appId].push(updateRecord);
                }
            });
        });
        
        // console.log(`🔚 フィールド値の出力が完了しました。実際の更新処理を開始します。`);
        // console.log(`📦 更新対象アプリ:`, Object.keys(updateRecordsByApp));
        
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
        const fieldCode = this.extractFieldCodeFromKey(fieldKey);
        
        // 更新ルールに基づいて判定
        const rule = this.UPDATE_RULES[fieldCode] || this.UPDATE_RULES['*'];
        
        switch (rule) {
            case 'all':
                // 全台帳で更新
                return Object.keys(CONFIG.apps);
                
            case 'exclude_origin':
                // 元の台帳以外で更新（主キー交換用）
                const originLedgerName = this.extractLedgerNameFromKey(fieldKey);
                const targetApps = Object.keys(CONFIG.apps).filter(appId => 
                    CONFIG.apps[appId].name !== originLedgerName
                );
                console.log(`🔄 ${fieldCode} 更新対象: ${originLedgerName}を除外 → [${targetApps.map(id => CONFIG.apps[id].name).join(', ')}]`);
                return targetApps;
                
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
     * 特定のアプリのレコードを一括更新
     */
    async updateAppRecordsBatch(appId, records) {
        
        try {
            // 一括更新用のデータを準備
            const updateRecords = records.map((record, index) => {
                // 新しい形式 {id: 6163, record: {...}} と旧形式 {$id: {value: 6163}, ...} の両方に対応
                const recordIdValue = record.id || record.$id?.value;
                if (!recordIdValue) {
                    throw new Error(`レコードIDが見つかりません`);
                }
                
                // console.log(`📋 レコード${index + 1}の更新データ準備開始 (ID: ${recordIdValue})`);
                
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
            
            // console.log(`📤 kintone API更新リクエスト全体:`, JSON.stringify({
            //     app: appId,
            //     records: updateRecords
            // }, null, 2));
            
            // API実行回数をカウント
            window.apiCounter.count(appId, 'レコード一括更新');
            
            // kintone REST API の一括更新を実行
            const response = await kintone.api(kintone.api.url('/k/v1/records', true), 'PUT', {
                app: appId,
                records: updateRecords
            });
            
            console.log(`✅ ${CONFIG.apps[appId].name} 更新完了 (${records.length}件)`);
            

            
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
                
                // console.log(`🔄 変更フラグ保持: ${currentChangeFlags.size}件のフラグ, ${currentChangedFields.size}件のフィールド`);
                
                // 新しいVirtualScrollテーブルを作成
                const newTableContainer = this.virtualScroll.createVirtualScrollTable(this.currentSearchResults);
                
                // 変更フラグを復元
                this.virtualScroll.changeFlags = currentChangeFlags;
                this.virtualScroll.changedFields = currentChangedFields;
                
                // 既存のテーブルコンテナを新しいものと置き換え
                tableContainer.parentNode.replaceChild(newTableContainer, tableContainer);
                
                // console.log('✅ VirtualScrollテーブル再描画完了（変更フラグ復元済み）');
            } else {
                console.warn('⚠️ テーブルコンテナまたは検索結果が見つかりません');
            }
        } catch (error) {
            this.logError('VirtualScrollテーブル再描画', error);
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
        console.log(`✅ 変更フラグリセット完了 (${changedIndices.length}件)`);
    }


}

// グローバルに公開
window.TableRenderer = TableRenderer; 