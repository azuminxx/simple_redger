/**
 * テーブル表示クラス
 */
class TableRenderer {
    constructor() {
        this.virtualScroll = new VirtualScroll();
        this.currentSearchResults = []; // 現在の検索結果を保持
        
        // VirtualScrollインスタンスをグローバルに設定
        window.virtualScroll = this.virtualScroll;
        
        // 更新ルール定義（主キー交換対応）
        this.UPDATE_RULES = {
            'PC番号': 'exclude_origin',    // PC番号は他の台帳のみ（PC台帳は除外）
            '内線番号': 'exclude_origin',   // 内線番号は他の台帳のみ（内線台帳は除外）
            '座席番号': 'exclude_origin',   // 座席番号は他の台帳のみ（座席台帳は除外）
            'ユーザーID': 'pc_only',       // PC台帳のみ
            '*': 'origin'                 // その他は元台帳のみ
        };

        // ドラッグアンドドロップ用の主キーフィールド定義
        this.PRIMARY_KEY_FIELDS = ['PC番号', '内線番号', '座席番号'];
        
        // ドラッグアンドドロップの状態管理
        this.dragState = {
            isDragging: false,
            sourceCell: null,
            sourceRowIndex: null,
            sourceColumnKey: null,
            sourceFieldCode: null,
            dragElement: null
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
            
            // デバッグ: 変更フラグの状態を確認
            console.log('🔍 変更フラグの状態確認:');
            console.log('  - changeFlags:', window.virtualScroll.changeFlags);
            console.log('  - changedFields:', window.virtualScroll.changedFields);
            
            const changedIndices = window.virtualScroll.getChangedRecordIndices();
            console.log('🔍 変更されたレコードインデックス:', changedIndices);
            
            if (changedIndices.length === 0) {
                alert('変更されたレコードがありません。');
                return;
            }
            
            console.log(`📝 変更されたレコード: ${changedIndices.length}件`);
            
            // 変更されたレコードのみから各台帳ごとにレコードをグループ化
            const recordsByApp = this.groupRecordsByApp(changedIndices);
            
            // 各台帳のレコードを一括更新（レコードがある場合のみ）
            const updatePromises = [];
            for (const [appId, records] of Object.entries(recordsByApp)) {
                if (records.length > 0) {
                    console.log(`📝 ${CONFIG.apps[appId]?.name || `App ${appId}`}を更新開始 (${records.length}件)`);
                    updatePromises.push(this.updateAppRecordsBatch(appId, records));
                } else {
                    console.log(`⚠️ ${CONFIG.apps[appId]?.name || `App ${appId}`}は更新対象レコードなしのためスキップ`);
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
        console.log(`📝 ${CONFIG.apps[appId].name}のレコードを一括更新中... (${records.length}件)`);
        
        // リクエストボディをログ出力（デバッグ用）
        // console.log(`🔍 ${CONFIG.apps[appId].name} リクエストボディ:`, JSON.stringify(records, null, 2));
        
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
            
            console.log(`✅ ${CONFIG.apps[appId].name} 一括更新完了 (${records.length}件)`);
            // console.log(`📥 kintone API更新レスポンス:`, JSON.stringify(response, null, 2));
            

            
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
     * 主キーフィールドかどうかを判定
     */
    isPrimaryKeyField(fieldCode) {
        return this.PRIMARY_KEY_FIELDS.includes(fieldCode);
    }

    /**
     * 同じ主キータイプかどうかを判定
     */
    isSamePrimaryKeyType(fieldCode1, fieldCode2) {
        return this.isPrimaryKeyField(fieldCode1) && 
               this.isPrimaryKeyField(fieldCode2) && 
               fieldCode1 === fieldCode2;
    }

    /**
     * セルにドラッグアンドドロップ機能を追加
     */
    addDragAndDropToCell(cell, rowIndex, columnKey, fieldCode) {
        // 主キーフィールドのみドラッグ可能
        if (!this.isPrimaryKeyField(fieldCode)) {
            return;
        }

        cell.draggable = true;
        cell.classList.add('draggable-primary-key');
        
        // ドラッグ開始イベント
        cell.addEventListener('dragstart', (e) => {
            this.handleDragStart(e, cell, rowIndex, columnKey, fieldCode);
        });

        // ドラッグオーバーイベント
        cell.addEventListener('dragover', (e) => {
            this.handleDragOver(e, fieldCode);
        });

        // ドラッグリーブイベント（ツールチップ削除用）
        cell.addEventListener('dragleave', (e) => {
            this.removeDropHint(e.currentTarget);
            e.currentTarget.classList.remove('drop-target', 'drop-invalid');
        });

        // ドロップイベント
        cell.addEventListener('drop', (e) => {
            this.handleDrop(e, cell, rowIndex, columnKey, fieldCode);
        });

        // ドラッグ終了イベント
        cell.addEventListener('dragend', (e) => {
            this.handleDragEnd(e);
        });
    }

    /**
     * ドラッグ開始処理
     */
    handleDragStart(e, cell, rowIndex, columnKey, fieldCode) {
        this.dragState.isDragging = true;
        this.dragState.sourceCell = cell;
        this.dragState.sourceRowIndex = rowIndex;
        this.dragState.sourceColumnKey = columnKey;
        this.dragState.sourceFieldCode = fieldCode; // フィールドコードを明示的に保存
        
        // ドラッグ中の視覚効果
        cell.classList.add('dragging');
        
        // ドラッグデータを設定
        e.dataTransfer.setData('text/plain', JSON.stringify({
            rowIndex: rowIndex,
            columnKey: columnKey,
            fieldCode: fieldCode,
            value: cell.textContent || cell.value
        }));
        
        e.dataTransfer.effectAllowed = 'move';
        
        // console.log(`🔄 ドラッグ開始: ${fieldCode} (行${rowIndex}, キー: ${columnKey})`);
    }

    /**
     * ドラッグオーバー処理
     */
    handleDragOver(e, targetFieldCode) {
        if (!this.dragState.isDragging) return;
        
        // 保存されたソースフィールドコードを直接使用
        const sourceFieldCode = this.dragState.sourceFieldCode;
        
        if (!sourceFieldCode) {
            console.warn('⚠️ ソースフィールドコードが取得できません');
            return;
        }
        
        // 同じ主キータイプのみドロップ可能
        if (this.isSamePrimaryKeyType(sourceFieldCode, targetFieldCode)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            e.currentTarget.classList.add('drop-target');
            
            // ツールチップ表示
            this.showDropHint(e.currentTarget, `${targetFieldCode}と交換`);
        } else {
            e.dataTransfer.dropEffect = 'none';
            e.currentTarget.classList.add('drop-invalid');
            
            // 無効なドロップのヒント表示
            this.showDropHint(e.currentTarget, `${sourceFieldCode}同士のみ交換可能`);
            console.log(`❌ ドロップ不可: ${sourceFieldCode} → ${targetFieldCode}`);
        }
    }

    /**
     * ドロップ処理
     */
    handleDrop(e, targetCell, targetRowIndex, targetColumnKey, targetFieldCode) {
        e.preventDefault();
        targetCell.classList.remove('drop-target', 'drop-invalid');
        
        if (!this.dragState.isDragging) return;
        
        try {
            // ドラッグ状態から確実な情報を取得
            const sourceRowIndex = this.dragState.sourceRowIndex;
            const sourceColumnKey = this.dragState.sourceColumnKey;
            const sourceFieldCode = this.dragState.sourceFieldCode;
            
            // console.log(`🎯 ドロップ処理: ${sourceFieldCode} (行${sourceRowIndex}) → ${targetFieldCode} (行${targetRowIndex})`);
            
            // 同じセルの場合は何もしない
            if (sourceRowIndex === targetRowIndex && sourceColumnKey === targetColumnKey) {
                console.log('⚠️ 同じセルへのドロップのためスキップ');
                return;
            }
            
            // 同じ主キータイプのみ交換可能
            if (!this.isSamePrimaryKeyType(sourceFieldCode, targetFieldCode)) {
                console.warn(`❌ 異なる主キータイプは交換できません: ${sourceFieldCode} ⇄ ${targetFieldCode}`);
                return;
            }
            
            // 主キー値を交換
            this.swapPrimaryKeyValues(sourceRowIndex, targetRowIndex, sourceFieldCode);
            
            console.log(`✅ 主キー交換完了: ${sourceFieldCode} (行${sourceRowIndex} ⇄ 行${targetRowIndex})`);
            
        } catch (error) {
            this.logError('ドロップ処理', error);
        }
    }

    /**
     * ドラッグ終了処理
     */
    handleDragEnd(e) {
        // ドラッグ状態をリセット
        if (this.dragState.sourceCell) {
            this.dragState.sourceCell.classList.remove('dragging');
        }
        
        // 全てのドロップターゲットクラスを削除
        document.querySelectorAll('.drop-target, .drop-invalid').forEach(el => {
            el.classList.remove('drop-target', 'drop-invalid');
        });
        
        // ドロップヒントを削除
        this.removeAllDropHints();
        
        this.dragState = {
            isDragging: false,
            sourceCell: null,
            sourceRowIndex: null,
            sourceColumnKey: null,
            sourceFieldCode: null,
            dragElement: null
        };
    }

    /**
     * ドロップヒントを表示
     */
    showDropHint(cell, message) {
        // 既存のヒントを削除
        this.removeDropHint(cell);
        
        const hint = DOMHelper.createElement('div', {}, 'drop-hint');
        hint.textContent = message;
        cell.appendChild(hint);
    }

    /**
     * 特定のセルのドロップヒントを削除
     */
    removeDropHint(cell) {
        const existingHint = cell.querySelector('.drop-hint');
        if (existingHint) {
            existingHint.remove();
        }
    }

    /**
     * 全てのドロップヒントを削除
     */
    removeAllDropHints() {
        document.querySelectorAll('.drop-hint').forEach(hint => {
            hint.remove();
        });
    }

    /**
     * ドラッグアンドドロップによる主キー交換を実行
     * 
     * 【重要】セル交換の核となるロジック
     * ■ 交換対象フィールドの決定ルール：
     *   - PC番号交換時：PC台帳の全フィールド + 他台帳のPC番号フィールド
     *   - 内線番号交換時：内線台帳の全フィールド + 他台帳の内線番号フィールド  
     *   - 座席番号交換時：座席台帳の全フィールド + 他台帳の座席番号フィールド
     * 
     * ■ レコードID交換ルール：
     *   - 起点台帳のレコードIDのみ交換（PC番号交換時はPC台帳のレコードIDのみ）
     *   - 他台帳のレコードIDは交換しない（データの整合性を保つため）
     * 
     * ■ 例：PC番号交換時の動作
     *   - PC台帳：PC番号、ユーザーID、ユーザー名、PC用途等の全フィールドを交換
     *   - 内線台帳：PC番号フィールドのみ交換（内線番号、電話機種別は交換しない）
     *   - 座席台帳：PC番号フィールドのみ交換（座席番号、座席拠点等は交換しない）
     */
    swapPrimaryKeyValues(sourceRowIndex, targetRowIndex, primaryKeyField) {
        // console.log(`🔄 主キー交換開始: ${primaryKeyField} (行${sourceRowIndex} ⇄ 行${targetRowIndex})`);

        const sourceRecord = this.currentSearchResults[sourceRowIndex];
        const targetRecord = this.currentSearchResults[targetRowIndex];
        
        if (!sourceRecord || !targetRecord) {
            console.error('❌ ソースレコードまたはターゲットレコードが見つかりません');
            return;
        }

        // 【重要】主キーフィールドに対応する起点台帳を特定
        // PC番号 → PC台帳、内線番号 → 内線台帳、座席番号 → 座席台帳
        const sourceApp = this.getPrimaryKeySourceApp(primaryKeyField);
        if (!sourceApp) {
            console.error(`❌ 主キー ${primaryKeyField} に対応する台帳が見つかりません`);
            return;
        }

        // console.log(`🎯 主キー交換: ${primaryKeyField} (起点台帳: ${sourceApp})`);
        
        const swappedFields = new Set();
        
        // 【核心ロジック】全台帳を対象に、交換対象フィールドを決定して交換実行
        CONFIG.integratedTableConfig.columns.forEach(column => {
            if (column.isChangeFlag) return; // 変更フラグは除外
            
            const fieldKey = column.key;
            const ledgerName = DOMHelper.getLedgerNameFromKey(fieldKey);
            const fieldCode = DOMHelper.extractFieldCodeFromKey(fieldKey);
            
            // 【重要】各台帳での交換対象フィールド判定
            if (ledgerName === sourceApp) {
                // ■ 起点台帳（例：PC番号交換時のPC台帳）
                // → 全フィールドを交換（PC番号、ユーザーID、ユーザー名、PC用途等すべて）
                this.swapFieldValues(sourceRecord, targetRecord, sourceRowIndex, targetRowIndex, fieldKey, swappedFields);
            } else {
                // ■ 他台帳（例：PC番号交換時の内線台帳・座席台帳）
                // → 該当主キーフィールドのみ交換（PC番号フィールドのみ）
                // → 内線番号、電話機種別、座席拠点等は交換しない
                if (fieldCode === primaryKeyField) {
                    this.swapFieldValues(sourceRecord, targetRecord, sourceRowIndex, targetRowIndex, fieldKey, swappedFields);
                }
            }
        });
        
        // console.log(`🔍 デバッグ: 交換されたフィールド数 = ${swappedFields.size}`);
        // console.log(`🔍 デバッグ: 交換されたフィールド一覧 =`, Array.from(swappedFields));
        
        // 【重要】レコードIDは起点台帳のもののみ交換
        // ■ 理由：データの整合性を保つため
        // ■ 例：PC番号交換時
        //   - PC台帳のレコードIDは交換（6163 ⇄ 6164）
        //   - 内線台帳のレコードIDは交換しない（6158, 6159のまま）
        //   - 座席台帳のレコードIDは交換しない（7713, 7714のまま）
        const recordIdKey = `${sourceApp}_$id`;
        
        if (sourceRecord[recordIdKey] && targetRecord[recordIdKey]) {
            const sourceRecordId = sourceRecord[recordIdKey];
            const targetRecordId = targetRecord[recordIdKey];
            
            // 起点台帳のレコードIDのみを交換
            sourceRecord[recordIdKey] = targetRecordId;
            targetRecord[recordIdKey] = sourceRecordId;
            
            // console.log(`🆔 レコードID交換: ${sourceApp} (${sourceRecordId} ⇄ ${targetRecordId})`);
        } else {
            console.log(`⚠️ ${sourceApp}のレコードIDが見つからないため、レコードID交換をスキップ`);
        }
        
        // console.log(`🔄 全台帳フィールド交換完了: ${primaryKeyField}による行交換 (${swappedFields.size}フィールド + レコードID)`);
        
        // VirtualScrollでテーブルを再描画
        this.refreshVirtualScrollTable();
        
        console.log(`✅ 行交換完了: ${sourceRowIndex}⇄${targetRowIndex} (${swappedFields.size}フィールド)`);
        
        return true;
    }

    /**
     * フィールド値を交換する共通処理
     */
    swapFieldValues(sourceRecord, targetRecord, sourceRowIndex, targetRowIndex, fieldKey, swappedFields) {
        const sourceValue = sourceRecord[fieldKey];
        const targetValue = targetRecord[fieldKey];
        
        // データを交換
        sourceRecord[fieldKey] = targetValue;
        targetRecord[fieldKey] = sourceValue;
        
        // DOM要素も直接交換
        this.exchangeFieldCellsInDOM(sourceRowIndex, targetRowIndex, fieldKey);
        
        swappedFields.add(fieldKey);
        
        // 変更フラグを設定
        window.virtualScroll.setChangedField(sourceRowIndex, fieldKey);
        window.virtualScroll.setChangedField(targetRowIndex, fieldKey);
        
                            // console.log(`🏷️ フィールド交換: 行${sourceRowIndex}⇄${targetRowIndex}, ${fieldKey} (${sourceValue} ⇄ ${targetValue})`);
    }

    /**
     * 主キーフィールドに対応するsourceAppを取得
     */
    getPrimaryKeySourceApp(primaryKeyField) {
        // フィールドマッピング（レガシーシステムのconfig.jsを参考）
        const primaryKeyMappings = {
            'PC番号': 'PC台帳',
            '内線番号': '内線台帳', 
            '座席番号': '座席台帳'
        };
        
        return primaryKeyMappings[primaryKeyField] || null;
    }

    /**
     * 指定されたsourceAppに関連するフィールドキーを取得（レガシーシステム同様）
     */
    getRelatedFieldsBySourceApp(sourceApp) {
        return CONFIG.integratedTableConfig.columns
            .filter(column => {
                if (column.isChangeFlag) return false; // 変更フラグは除外
                
                const ledgerName = DOMHelper.getLedgerNameFromKey(column.key);
                return ledgerName === sourceApp;
            })
            .map(column => column.key);
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
     * 交換されたセルの背景色を更新
     */
    updateSwappedCellsBackground(sourceRowIndex, targetRowIndex, swappedFields) {
        swappedFields.forEach(fieldKey => {
            // ソース行のセルを更新
            const sourceCellSelector = `td[data-row="${sourceRowIndex}"][data-column="${fieldKey}"]`;
            const sourceCell = document.querySelector(sourceCellSelector);
            if (sourceCell) {
                sourceCell.classList.add('cell-changed');
                console.log(`🎨 背景色更新: 行${sourceRowIndex}, フィールド${fieldKey}`);
            } else {
                console.warn(`⚠️ セルが見つかりません: 行${sourceRowIndex}, フィールド${fieldKey}`);
            }
            
            // ターゲット行のセルを更新
            const targetCellSelector = `td[data-row="${targetRowIndex}"][data-column="${fieldKey}"]`;
            const targetCell = document.querySelector(targetCellSelector);
            if (targetCell) {
                targetCell.classList.add('cell-changed');
                console.log(`🎨 背景色更新: 行${targetRowIndex}, フィールド${fieldKey}`);
            } else {
                console.warn(`⚠️ セルが見つかりません: 行${targetRowIndex}, フィールド${fieldKey}`);
            }
        });
        
        console.log(`✅ 背景色更新完了: ${swappedFields.size}フィールド`);
    }

    /**
     * 変更チェックボックスを更新
     */
    updateChangeCheckboxes(sourceRowIndex, targetRowIndex) {
        // ソース行のチェックボックスを更新
        const sourceCheckbox = document.querySelector(`input[data-record-index="${sourceRowIndex}"][data-field="change-flag"]`);
        if (sourceCheckbox) {
            sourceCheckbox.checked = true;
            console.log(`☑️ チェックボックス更新: 行${sourceRowIndex} = checked`);
        } else {
            console.warn(`⚠️ チェックボックスが見つかりません: 行${sourceRowIndex}`);
        }
        
        // ターゲット行のチェックボックスを更新
        const targetCheckbox = document.querySelector(`input[data-record-index="${targetRowIndex}"][data-field="change-flag"]`);
        if (targetCheckbox) {
            targetCheckbox.checked = true;
            console.log(`☑️ チェックボックス更新: 行${targetRowIndex} = checked`);
        } else {
            console.warn(`⚠️ チェックボックスが見つかりません: 行${targetRowIndex}`);
        }
        
        console.log(`✅ 変更チェックボックス更新完了`);
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
            console.log(`🔄 変更フラグリセット: 行${index}`);
            window.virtualScroll.setChangeFlag(index, false);
        });
        console.log(`🔄 変更フラグをリセット (${changedIndices.length}件)`);
    }

    /**
     * DOM要素内の特定フィールドのセル値を直接交換（レガシーシステム同様）
     */
    exchangeFieldCellsInDOM(sourceRowIndex, targetRowIndex, fieldKey) {
        try {
            // 仮想スクロール環境では表示されている行のみ処理
            const tbody = document.querySelector('#virtual-table-body tbody');
            if (!tbody) return;

            const sourceRow = this.findRowByIndex(tbody, sourceRowIndex);
            const targetRow = this.findRowByIndex(tbody, targetRowIndex);

            if (!sourceRow || !targetRow) {
                console.warn(`⚠️ DOM行が見つかりません: ${sourceRowIndex} または ${targetRowIndex}`);
                return;
            }

            // フィールドに対応するセルを取得
            const sourceCell = this.findCellInRow(sourceRow, fieldKey);
            const targetCell = this.findCellInRow(targetRow, fieldKey);

            if (!sourceCell || !targetCell) {
                console.warn(`⚠️ フィールド ${fieldKey} のセルが見つかりません`);
                return;
            }

            // セル値を取得
            const sourceValue = DOMHelper.getCellValue(sourceCell);
            const targetValue = DOMHelper.getCellValue(targetCell);

            // セル値を交換
            DOMHelper.setCellValue(sourceCell, targetValue);
            DOMHelper.setCellValue(targetCell, sourceValue);

            console.log(`🔄 DOM交換: ${fieldKey} (${sourceValue} ⇄ ${targetValue})`);

        } catch (error) {
            console.error('❌ DOM要素交換エラー:', error);
        }
    }

    /**
     * 行インデックスに対応するDOM行を検索
     */
    findRowByIndex(tbody, rowIndex) {
        const rows = tbody.querySelectorAll('tr');
        for (const row of rows) {
            const dataRowIndex = parseInt(row.getAttribute('data-row-index'));
            if (dataRowIndex === rowIndex) {
                return row;
            }
        }
        return null;
    }

    /**
     * 行内で指定フィールドに対応するセルを検索
     */
    findCellInRow(row, fieldKey) {
        const cells = row.querySelectorAll('td[data-field]');
        for (const cell of cells) {
            if (cell.getAttribute('data-field') === fieldKey) {
                return cell;
            }
        }
        return null;
    }
}

// グローバルに公開
window.TableRenderer = TableRenderer; 