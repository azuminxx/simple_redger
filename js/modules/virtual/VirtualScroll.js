/**
 * 仮想スクロールクラス
 */
class VirtualScroll {
    constructor() {
        this.fieldInfoCache = {};
        this.changeFlags = new Map(); // レコードの変更フラグを管理
        this.changedFields = new Map(); // 変更されたフィールドを記録 {recordIndex: Set(fieldKeys)}
        this.originalValues = new Map(); // 元の値を保存 {recordIndex: Map(fieldKey: originalValue)}
        this.savedScrollTop = 0; // スクロール位置を保存
    }
    /**
     * 仮想スクロール対応テーブルを作成
     */
    createVirtualScrollTable(integratedData) {
        // メインコンテナ
        const container = DOMHelper.createElement('div', {}, 'integrated-table-container');
        
        // 仮想スクロールコンテナ（ボディ専用）
        const scrollContainer = DOMHelper.createElement('div', {}, 'virtual-scroll-container');
        
        // 全体の高さを表すスペーサー
        const spacer = DOMHelper.createElement('div', {}, 'virtual-scroll-spacer');
        const totalHeight = integratedData.length * CONFIG.virtualScroll.rowHeight;
        spacer.style.height = `${totalHeight}px`;
        
        // 実際のコンテンツ領域
        const content = DOMHelper.createElement('div', {}, 'virtual-scroll-content');
        
        // ボディテーブル（仮想スクロール）
        const bodyTable = DOMHelper.createElement('table', {}, 'integrated-table virtual-body');
        const colgroup = this.createColgroup();
        bodyTable.appendChild(colgroup);
        const tbody = DOMHelper.createElement('tbody');
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
        
        // グローバルに保存（getRecordIdで使用）
        window.virtualState = virtualState;
        
        // 変更フラグを初期化
        this.initializeChangeFlags(integratedData);
        
        // 元の値は動的に管理（セル交換時のみ保存）
        
        // 初期レンダリング
        this.renderVirtualRows(virtualState);
        
        // スクロールイベント
        scrollContainer.addEventListener('scroll', () => {
            this.handleVirtualScroll(scrollContainer, virtualState);
            // ヘッダーの横スクロールを同期
            this.syncHeaderScroll(headerTable, scrollContainer);
            // スクロール位置を保存
            this.savedScrollTop = scrollContainer.scrollTop;
        });
        
        scrollContainer.appendChild(spacer);
        scrollContainer.appendChild(content);
        container.appendChild(scrollContainer);
        
        // 保存されたスクロール位置を復元
        if (this.savedScrollTop > 0) {
            setTimeout(() => {
                scrollContainer.scrollTop = this.savedScrollTop;
            }, 0);
        }
        
        return container;
    }

    /**
     * ヘッダーテーブルを作成（固定表示用）
     */
    createHeaderTable() {
        const table = DOMHelper.createElement('table', {}, 'integrated-table virtual-header');
        
        const colgroup = this.createColgroup();
        table.appendChild(colgroup);
        
        const thead = DOMHelper.createElement('thead');
        
        // 1行目：台帳名（結合あり）
        const ledgerRow = window.tableRenderer.createLedgerHeaderRow();
        thead.appendChild(ledgerRow);
        
        // 2行目：フィールド名
        const fieldRow = window.tableRenderer.createFieldHeaderRow();
        thead.appendChild(fieldRow);
        
        table.appendChild(thead);
        return table;
    }

    /**
     * 変更フラグを初期化
     */
    initializeChangeFlags(data) {
        this.changeFlags.clear();
        this.changedFields.clear();
        this.originalValues.clear();
        for (let i = 0; i < data.length; i++) {
            this.changeFlags.set(i, false);
            this.changedFields.set(i, new Set());
            this.originalValues.set(i, new Map());
        }
    }

        /**
     * 元の値を保存
     */
    saveOriginalValues(data) {
        for (let i = 0; i < data.length; i++) {
            const record = data[i];
            const originalValuesMap = new Map();
            
            // 各フィールドの元の値を保存
            CONFIG.integratedTableConfig.columns.forEach(column => {
                if (!column.isChangeFlag) { // 変更フラグ列は除外
                    originalValuesMap.set(column.key, record[column.key]);
                }
            });
            
            this.originalValues.set(i, originalValuesMap);
        }
    }

    /**
     * 指定レコードの元の値を現在の値でリセット（保存後に使用）
     */
    resetOriginalValues(recordIndex) {
        if (window.tableRenderer && window.tableRenderer.currentSearchResults) {
            const currentRecord = window.tableRenderer.currentSearchResults[recordIndex];
            if (currentRecord) {
                const originalValuesMap = new Map();
                
                CONFIG.integratedTableConfig.columns.forEach(column => {
                    if (!column.isChangeFlag) { // 変更フラグ列は除外
                        originalValuesMap.set(column.key, currentRecord[column.key]);
                    }
                });
                
                this.originalValues.set(recordIndex, originalValuesMap);
            }
        }
    }

    /**
     * 変更されたレコードのインデックスを取得
     */
    getChangedRecordIndices() {
        const changedIndices = [];
        this.changeFlags.forEach((isChanged, index) => {
            if (isChanged) {
                changedIndices.push(index);
            }
        });
        return changedIndices;
    }

    /**
     * 指定レコードの変更されたフィールドを取得
     */
    getChangedFields(recordIndex) {
        return this.changedFields.get(recordIndex) || new Set();
    }

    /**
     * 指定レコードに変更されたフィールドを設定
     */
    setChangedField(recordIndex, fieldKey) {
        if (!this.changedFields.has(recordIndex)) {
            this.changedFields.set(recordIndex, new Set());
        }
        this.changedFields.get(recordIndex).add(fieldKey);
        
        // 変更フラグも設定
        this.setChangeFlag(recordIndex, true);
    }

    /**
     * セル交換時のフィールド変更状態を更新
     */
    updateFieldChangeStatusForSwap(recordIndex, fieldKey, originalValue, newValue) {
        // レコードの統合キーを取得
        const recordId = this.getRecordId(recordIndex);
        const sessionKey = `${recordId}_${fieldKey}`;
        
        // セッション全体の元の値を管理するマップ（存在しない場合は作成）
        if (!window.swapSessionOriginalValues) {
            window.swapSessionOriginalValues = new Map();
        }
        
        // 空行（EMPTY_で始まる統合キー）の場合は特別処理
        if (recordId.startsWith('EMPTY_')) {
            // 空行の場合、値が空でない場合は変更とみなす
            // $idフィールドの場合はundefinedも空とみなす
            const isEmpty = !newValue || newValue === '' || newValue === '-' || 
                           newValue === null || newValue === undefined || newValue === 'undefined';
            
            if (!isEmpty) {
                this.setChangedField(recordIndex, fieldKey);
            } else {
                this.removeChangedField(recordIndex, fieldKey);
            }
            return;
        }
        
        // 通常レコードの場合：初回交換時に元の値を保存（セッション全体で一意）
        if (!window.swapSessionOriginalValues.has(sessionKey)) {
            window.swapSessionOriginalValues.set(sessionKey, originalValue);
        }
        
        // 保存された元の値と現在値を比較
        const savedOriginalValue = window.swapSessionOriginalValues.get(sessionKey);
        
        // $idフィールドの場合、undefinedと"undefined"を同一視
        const normalizedSavedValue = (savedOriginalValue === undefined || savedOriginalValue === 'undefined' || savedOriginalValue === null) ? null : savedOriginalValue;
        const normalizedNewValue = (newValue === undefined || newValue === 'undefined' || newValue === null) ? null : newValue;
        
        if (normalizedSavedValue === normalizedNewValue) {
            // 元の値に戻った場合
            this.removeChangedField(recordIndex, fieldKey);
            // セッションからも削除（初期状態に戻す）
            window.swapSessionOriginalValues.delete(sessionKey);
        } else {
            // まだ変更状態
            this.setChangedField(recordIndex, fieldKey);
        }
    }

    /**
     * レコードIDを取得（レコードを一意に識別）
     */
    getRecordId(recordIndex) {
        // 統合キーを使用してレコードを一意に識別
        if (window.tableRenderer && window.tableRenderer.currentSearchResults) {
            const record = window.tableRenderer.currentSearchResults[recordIndex];
            if (record) {
                // 統合キーを直接取得を試行
                if (record[CONFIG.integrationKey]) {
                    return record[CONFIG.integrationKey];
                }
                
                // 各台帳の統合キーを試行（CONFIG.jsから動的取得）
                const pcLedgerName = CONFIG.fieldMappings.primaryKeyToLedger['PC番号']; // 'PC台帳'
                const integrationKeyField = `${pcLedgerName}_${CONFIG.fieldMappings.integrationKey}`;
                const integrationKeyValue = record[integrationKeyField];
                if (integrationKeyValue) {
                    return integrationKeyValue;
                }
            }
        }
        // フォールバック：レコードインデックス
        return `idx_${recordIndex}`;
    }



    /**
     * フィールドの元の値を保存し、現在の値と比較して変更状態を更新
     */
    updateFieldChangeStatus(recordIndex, fieldKey, currentValue) {
        // 元の値のマップを初期化（必要に応じて）
        if (!this.originalValues.has(recordIndex)) {
            this.originalValues.set(recordIndex, new Map());
        }
        
        const originalValuesMap = this.originalValues.get(recordIndex);
        
        // 元の値が保存されていない場合はエラー（フォーカス時に保存されるはず）
        if (!originalValuesMap.has(fieldKey)) {
            console.warn(`⚠️ 元の値が見つかりません: 行${recordIndex} ${fieldKey} - 変更フラグ追加`);
            this.setChangedField(recordIndex, fieldKey);
            return;
        }
        
        const originalValue = originalValuesMap.get(fieldKey);
        
        // 現在の値が元の値と同じかどうかを判定
        if (currentValue === originalValue) {
            // 元に戻った場合は変更フラグから削除
            this.removeChangedField(recordIndex, fieldKey);
            // 背景色もクリア
            this.clearCellChangedStyle(recordIndex, fieldKey);
        } else {
            // 変更されている場合は変更フラグに追加
            this.setChangedField(recordIndex, fieldKey);
            // 背景色を設定
            this.setCellChangedStyle(recordIndex, fieldKey);
        }
    }

    /**
     * 指定レコードから変更されたフィールドを削除
     */
    removeChangedField(recordIndex, fieldKey) {
        if (this.changedFields.has(recordIndex)) {
            const fieldSet = this.changedFields.get(recordIndex);
            fieldSet.delete(fieldKey);
            
            // セルの背景色もクリア
            this.clearCellChangedStyle(recordIndex, fieldKey);
            
            // 変更されたフィールドがなくなった場合は変更フラグもリセット
            if (fieldSet.size === 0) {
                this.setChangeFlag(recordIndex, false);
            }
        }
    }

    /**
     * レコードの変更フラグを設定
     */
    setChangeFlag(recordIndex, isChanged) {
        this.changeFlags.set(recordIndex, isChanged);
        this.updateChangeCheckbox(recordIndex, isChanged);
        
        // フラグがリセットされた場合は変更フィールドもクリア
        if (!isChanged) {
            this.changedFields.set(recordIndex, new Set());
            // 対応するセルの背景色もクリア
            this.clearCellChangedStyles(recordIndex);
            // 元の値もリセット（保存後の新しい状態を元の値とする）
            this.resetOriginalValues(recordIndex);
        }
    }

    /**
     * 指定行のセルから変更スタイル（背景色）をクリア
     */
    clearCellChangedStyles(recordIndex) {
        // 該当行の全てのセルから.cell-changedクラスを削除
        const cells = document.querySelectorAll(`td[data-record-index="${recordIndex}"]`);
        cells.forEach(cell => {
            cell.classList.remove('cell-changed');
        });
        // 背景色クリアの詳細ログは省略
    }

    /**
     * 変更フラグのチェックボックスUIを更新
     */
    updateChangeCheckbox(recordIndex, isChanged) {
        const checkbox = document.querySelector(`input[data-record-index="${recordIndex}"][data-field="change-flag"]`);
        if (checkbox) {
            checkbox.checked = isChanged;
        }
    }

    /**
     * 変更フラグUIを復元（再描画後に実行）
     */
    restoreChangeFlagsUI() {
        // 少し遅延を入れてDOM更新完了後に実行
        setTimeout(() => {
            this.changeFlags.forEach((isChanged, recordIndex) => {
                this.updateChangeCheckbox(recordIndex, isChanged);
            });
            
            // 変更されたセルの背景色も復元
            this.changedFields.forEach((fieldSet, recordIndex) => {
                fieldSet.forEach(fieldKey => {
                    this.setCellChangedStyle(recordIndex, fieldKey);
                });
            });
        }, 100);
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
     * 仮想スクロールの行をレンダリング
     */
    async renderVirtualRows(virtualState) {
        const { data, startIndex, endIndex, tbody, headerTable, bodyTable } = virtualState;
        
        // 既存の行をクリア
        tbody.innerHTML = '';
        
        // 表示範囲の行を作成
        for (let i = startIndex; i < endIndex; i++) {
            if (i >= data.length) break;
            
            const record = data[i];
            const row = DOMHelper.createElement('tr');
            row.setAttribute('data-record-index', i);
            

            
            // 各カラムのセルを作成
            for (let columnIndex = 0; columnIndex < CONFIG.integratedTableConfig.columns.length; columnIndex++) {
                const column = CONFIG.integratedTableConfig.columns[columnIndex];
                const td = DOMHelper.createElement('td');
                const value = record[column.key];
                
                // セルにデータ属性を追加（ドラッグアンドドロップ用）
                td.setAttribute('data-record-index', i);
                td.setAttribute('data-column', column.key);
                td.setAttribute('data-field-code', column.fieldCode || '');
                
                // レコードIDを埋め込み（台帳別）
                if (column.ledger && column.ledger !== '共通' && column.ledger !== '操作') {
                    const recordIdKey = `${column.ledger}_$id`;
                    const recordIdValue = record[recordIdKey];
                    if (recordIdValue) {
                        td.setAttribute(`data-record-id-${column.ledger}`, recordIdValue);
                    }
                }
                
                if (column.isChangeFlag) {
                    // 変更フラグ列の場合はチェックボックスを作成
                    const checkbox = DOMHelper.createElement('input');
                    checkbox.type = 'checkbox';
                    const isChanged = this.changeFlags.get(i) || false;
                    checkbox.checked = isChanged;
                    checkbox.disabled = true; // 手動変更不可
                    checkbox.setAttribute('data-record-index', i);
                    checkbox.setAttribute('data-field', 'change-flag');
                    td.appendChild(checkbox);
                    td.className = 'change-flag-cell';
                } else if (column.isDetailLink) {
                    // 詳細リンク列の場合はファイル絵文字リンクを作成
                    this.createDetailLinkCell(td, i, record);
                } else if (this.isEditableField(column)) {
                    // 編集可能フィールドの場合は入力要素を作成
                    const inputElement = await this.createEditableInput(column, value, i, columnIndex);
                    td.appendChild(inputElement);
                    td.className = 'editable-cell';
                } else {
                    // 読み取り専用フィールドの場合は通常のテキスト表示
                    if (value === null || value === undefined || value === '') {
                        td.textContent = '-';
                        td.className = 'null-value readonly-cell';
                    } else {
                        // 主キーフィールドの場合は分離ボタンも追加
                        if (this.isPrimaryKeyField(column.fieldCode) && value && value.trim() !== '') {
                            this.createCellWithSeparateButton(td, value, i, column);
                        } else {
                            td.textContent = value;
                        }
                        td.className = 'readonly-cell';
                    }
                }
                
                // 変更されたフィールドの背景色を適用
                const changedFields = this.getChangedFields(i);
                if (changedFields.has(column.key)) {
                    td.classList.add('cell-changed');
                } else {
                    // 変更フィールドに含まれていない場合は背景色クラスを削除
                    td.classList.remove('cell-changed');
                }
                
                // ドラッグアンドドロップ機能を追加（CellSwapper経由）
                if (window.tableRenderer && window.tableRenderer.cellSwapper && column.fieldCode) {
                    window.tableRenderer.cellSwapper.addDragAndDropToCell(td, i, column.key, column.fieldCode);
                }
                
                row.appendChild(td);
            }
            
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
            // 非同期レンダリングを実行
            this.renderVirtualRows(virtualState).catch(error => {
                console.error('仮想スクロール再レンダリングエラー:', error);
            });
        }
    }

    /**
     * ヘッダーの横スクロールを同期
     */
    syncHeaderScroll(headerTable, scrollContainer) {
        headerTable.style.transform = `translateX(-${scrollContainer.scrollLeft}px)`;
    }

    /**
     * フィールドが編集可能かどうかを判定
     */
    isEditableField(column) {
        // 変更フラグ列は編集不可
        if (column.isChangeFlag) {
            return false;
        }
        
        // 編集不可のフィールドを定義（CONFIG.jsから取得）
        const readOnlyFields = CONFIG.fieldPermissions.readOnlyFields;
        
        return !readOnlyFields.includes(column.fieldCode);
    }

    /**
     * 編集可能な入力要素を作成
     */
    async createEditableInput(column, value, recordIndex, columnIndex) {
        const displayValue = value === null || value === undefined ? '' : value;
        
        try {
            // フィールド情報を取得してフィールドタイプを判定
            const fieldInfo = await this.getFieldInfo(column.appId, column.fieldCode);
            
            if (fieldInfo && (fieldInfo.type === 'dropdown' || fieldInfo.type === 'radio')) {
                // ドロップダウン/ラジオボタンの場合
                return this.createSelectInput(column, displayValue, recordIndex, columnIndex, fieldInfo.options);
            } else {
                // その他の場合はテキストボックス
                return this.createTextInput(column, displayValue, recordIndex, columnIndex);
            }
        } catch (error) {
            console.warn(`フィールド情報取得エラー (${column.fieldCode}):`, error);
            // エラー時はテキストボックスにフォールバック
            return this.createTextInput(column, displayValue, recordIndex, columnIndex);
        }
    }

    /**
     * テキスト入力要素を作成
     */
    createTextInput(column, value, recordIndex, columnIndex) {
        const input = DOMHelper.createElement('input', {
            type: 'text',
            value: value,
            'data-record-index': recordIndex,
            'data-field-key': column.key
        }, 'editable-cell-input');

        // フォーカス時に元の値を保存
        input.addEventListener('focus', (event) => {
            this.saveOriginalValueOnEdit(event.target);
        });

        // 値変更時のイベントリスナー
        input.addEventListener('change', (event) => {
            this.handleCellValueChange(event.target);
        });

        return input;
    }

    /**
     * セレクト入力要素を作成
     */
    createSelectInput(column, value, recordIndex, columnIndex, options) {
        const select = DOMHelper.createElement('select', {
            'data-record-index': recordIndex,
            'data-field-key': column.key
        }, 'editable-cell-select');

        // 空の選択肢を追加
        const emptyOption = DOMHelper.createElement('option', { value: '' });
        emptyOption.textContent = '-';
        select.appendChild(emptyOption);

        // 選択肢を追加
        if (options && options.length > 0) {
            options.forEach(option => {
                const optionElement = DOMHelper.createElement('option', { value: option });
                optionElement.textContent = option;
                if (option === value) {
                    optionElement.selected = true;
                }
                select.appendChild(optionElement);
            });
        }

        // 現在の値が選択肢にない場合は選択状態をクリア
        if (value && !options.includes(value)) {
            select.value = '';
        }

        // フォーカス時に元の値を保存
        select.addEventListener('focus', (event) => {
            this.saveOriginalValueOnEdit(event.target);
        });

        // 値変更時のイベントリスナー
        select.addEventListener('change', (event) => {
            this.handleCellValueChange(event.target);
        });

        return select;
    }

        /**
     * フィールド情報を取得（フィールドレベルキャッシュ付き）
     */
    async getFieldInfo(appId, fieldCode) {
        try {
            // フィールドレベルの静的キャッシュを使用
            if (!this.fieldInfoCache) {
                this.fieldInfoCache = {};
            }
            
            const cacheKey = `${appId}_${fieldCode}`;
            if (this.fieldInfoCache[cacheKey]) {
                return this.fieldInfoCache[cacheKey];
            }

            // グローバルのFieldInfoAPIインスタンスを使用
            if (!window.fieldInfoAPI) {
                console.error('FieldInfoAPIインスタンスが見つかりません');
                return { type: 'text' };
            }
            
            const fields = await window.fieldInfoAPI.getAppFields(appId);
            const fieldInfo = fields.find(field => field.code === fieldCode) || { type: 'text' };
            
            // フィールドレベルキャッシュに保存
            this.fieldInfoCache[cacheKey] = fieldInfo;
            
            return fieldInfo;
        } catch (error) {
            this.logError(`フィールド情報取得 (App ${appId}, Field ${fieldCode})`, error);
            return { type: 'text' };
        }
    }

    /**
     * エラーログを統一フォーマットで出力
     */
    logError(operation, error) {
        console.error(`❌ ${operation}エラー:`, error);
    }

    /**
     * セル編集開始時に元の値を保存
     */
    saveOriginalValueOnEdit(inputElement) {
        const recordIndex = parseInt(inputElement.getAttribute('data-record-index'));
        const fieldKey = inputElement.getAttribute('data-field-key');
        const currentValue = inputElement.value;

        // 元の値のマップを初期化（必要に応じて）
        if (!this.originalValues.has(recordIndex)) {
            this.originalValues.set(recordIndex, new Map());
        }
        
        const originalValuesMap = this.originalValues.get(recordIndex);
        
        // まだ元の値が保存されていない場合のみ保存
        if (!originalValuesMap.has(fieldKey)) {
            originalValuesMap.set(fieldKey, currentValue);
        }
    }

    /**
     * セルの値変更を処理
     */
    handleCellValueChange(inputElement) {
        const recordIndex = parseInt(inputElement.getAttribute('data-record-index'));
        const fieldKey = inputElement.getAttribute('data-field-key');
        const newValue = inputElement.value;

        // TableRendererの現在のデータを更新
        if (window.tableRenderer && window.tableRenderer.currentSearchResults) {
            const currentData = window.tableRenderer.currentSearchResults;
            if (currentData[recordIndex]) {
                currentData[recordIndex][fieldKey] = newValue;
                
                // 元の値と比較して変更状態を更新
                this.updateFieldChangeStatus(recordIndex, fieldKey, newValue);
            }
        }
    }

    /**
     * 指定セルにcell-changedクラスを付与（背景色変更）
     */
    setCellChangedStyle(recordIndex, fieldKey) {
        const cell = this.findCellElement(recordIndex, fieldKey);
        if (cell) {
            cell.classList.add('cell-changed');
        } else {
            // $idフィールドは表示されていないため、警告を抑制
            if (!fieldKey.includes('_$id')) {
                console.warn(`⚠️ セル要素が見つかりません: 行${recordIndex} ${fieldKey}`);
            }
        }
    }

    /**
     * 指定セルからcell-changedクラスを削除（背景色クリア）
     */
    clearCellChangedStyle(recordIndex, fieldKey) {
        const cell = this.findCellElement(recordIndex, fieldKey);
        if (cell) {
            cell.classList.remove('cell-changed');
        } else {
            // $idフィールドは表示されていないため、警告を抑制
            if (!fieldKey.includes('_$id')) {
                console.warn(`⚠️ セル要素が見つかりません（クリア時）: 行${recordIndex} ${fieldKey}`);
            }
        }
    }

    /**
     * セル要素を検索
     */
    findCellElement(recordIndex, fieldKey) {
        // データ属性でセルを検索
        const selector = `td[data-record-index="${recordIndex}"][data-column="${fieldKey}"]`;
        return document.querySelector(selector);
    }

    /**
     * 主キーフィールドかどうかを判定
     */
    isPrimaryKeyField(fieldCode) {
        // 主キーとして扱うフィールドコードを定義（CONFIG.jsから取得、$idも含む）
        const primaryKeyFields = ['$id', ...CONFIG.primaryKeyFields];
        return primaryKeyFields.includes(fieldCode);
    }

    /**
     * 詳細リンクセルを作成（ファイル絵文字）
     */
    createDetailLinkCell(td, recordIndex, record) {
        const link = DOMHelper.createElement('a', {
            href: '#',
            'data-record-index': recordIndex
        });
        link.textContent = '📁';
        link.style.cssText = `
            color: #007bff;
            text-decoration: none;
            font-size: 18px;
            cursor: pointer;
            display: block;
            text-align: center;
            padding: 4px;
        `;
        
        // ホバーエフェクト
        link.addEventListener('mouseenter', () => {
            link.style.transform = 'scale(1.2)';
            link.style.transition = 'transform 0.2s ease';
        });
        link.addEventListener('mouseleave', () => {
            link.style.transform = 'scale(1)';
        });

        // クリックイベント
        link.addEventListener('click', (event) => {
            event.preventDefault();
            // 統合キーを取得
            const integrationKey = this.getIntegrationKeyFromRecord(record);
            this.showLedgerDetailsModal(integrationKey, record);
        });

        td.appendChild(link);
        td.className = 'detail-link-cell';
        td.style.cssText = 'text-align: center; vertical-align: middle;';
    }

    /**
     * レコードから統合キーを取得
     */
    getIntegrationKeyFromRecord(record) {
        // 各台帳の統合キーフィールドから値を取得
        const pcLedgerName = CONFIG.fieldMappings.primaryKeyToLedger['PC番号']; // 'PC台帳'
        const integrationKeyField = `${pcLedgerName}_${CONFIG.fieldMappings.integrationKey}`;
        return record[integrationKeyField] || 'Unknown';
    }

    /**
     * 3つの台帳詳細をモーダルで表示
     */
    showLedgerDetailsModal(integrationKey, record) {
        // 既存のモーダルを削除
        const existingModal = document.querySelector('.ledger-details-modal');
        if (existingModal) {
            existingModal.remove();
        }

        // モーダル要素を作成
        const modal = DOMHelper.createElement('div', {}, 'ledger-details-modal');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            z-index: 10000;
            display: flex;
            justify-content: center;
            align-items: center;
        `;

        const content = DOMHelper.createElement('div');
        content.style.cssText = `
            background: white;
            border-radius: 8px;
            padding: 20px;
            max-width: 1200px;
            max-height: 95vh;
            width: 95%;
            overflow-y: auto;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        `;

        // ヘッダー
        const header = DOMHelper.createElement('div');
        header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 2px solid #dee2e6;
        `;

        const title = DOMHelper.createElement('h3');
        title.textContent = `統合キー: ${integrationKey} の詳細`;
        title.style.cssText = 'font-size: 18px; font-weight: bold; color: #495057; margin: 0;';

        const closeButton = DOMHelper.createElement('button');
        closeButton.textContent = '閉じる';
        closeButton.style.cssText = `
            background: #dc3545;
            color: white;
            border: none;
            border-radius: 4px;
            padding: 8px 16px;
            cursor: pointer;
            font-weight: bold;
        `;
        closeButton.addEventListener('click', () => modal.remove());

        header.appendChild(title);
        header.appendChild(closeButton);

        // 各台帳のセクション
        const body = DOMHelper.createElement('div');
        body.style.cssText = 'display: flex; flex-direction: column; gap: 20px;';

        // 3つの台帳をiframeで上中下に表示
        CONFIG.ledgerNames.forEach(ledgerName => {
            const iframeSection = this.createLedgerIframeSection(ledgerName, record);
            body.appendChild(iframeSection);
        });

        content.appendChild(header);
        content.appendChild(body);
        modal.appendChild(content);

        // クリックで閉じる
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });

        document.body.appendChild(modal);
    }

    /**
     * 台帳iframeセクションを作成
     */
    createLedgerIframeSection(ledgerName, record) {
        const baseUrl = 'https://fps62oxtrbhh.cybozu.com/k';
        const appId = CONFIG.getAppIdByLedgerName(ledgerName);
        
        const section = DOMHelper.createElement('div');
        section.style.cssText = `
            border: 1px solid #dee2e6;
            border-radius: 8px;
            overflow: hidden;
            height: 250px;
        `;

        // レコードIDを取得
        const recordIdKey = `${ledgerName}_$id`;
        const recordId = record[recordIdKey];
        
        if (recordId) {
            const recordUrl = `${baseUrl}/${appId}/show#record=${recordId}`;
            
            // iframeコンテナを作成（縮小表示用）
            const iframeContainer = DOMHelper.createElement('div');
            iframeContainer.style.cssText = `
                width: 100%;
                height: 250px;
                overflow: hidden;
                position: relative;
            `;

            // iframeを作成（縮小表示）
            const iframe = DOMHelper.createElement('iframe');
            iframe.src = recordUrl;
            iframe.style.cssText = `
                width: 166.67%;
                height: 416px;
                border: none;
                background: white;
                transform: scale(0.6);
                transform-origin: top left;
                position: absolute;
                top: 0;
                left: 0;
            `;
            
            // iframe読み込みエラー対応
            iframe.addEventListener('error', () => {
                const errorMsg = DOMHelper.createElement('div');
                errorMsg.textContent = 'レコードの読み込みに失敗しました';
                errorMsg.style.cssText = `
                    padding: 20px;
                    text-align: center;
                    color: #dc3545;
                    height: 250px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                `;
                section.appendChild(errorMsg);
                return;
            });
            
            iframeContainer.appendChild(iframe);
            section.appendChild(iframeContainer);
        } else {
            const noDataMessage = DOMHelper.createElement('div');
            noDataMessage.textContent = 'この台帳にはデータがありません';
            noDataMessage.style.cssText = `
                color: #6c757d;
                font-style: italic;
                text-align: center;
                padding: 20px;
                height: 250px;
                display: flex;
                align-items: center;
                justify-content: center;
            `;
            
            section.appendChild(noDataMessage);
        }
        
        return section;
    }

    /**
     * 主キーフィールドのセルに分離ボタンを追加
     */
    createCellWithSeparateButton(td, value, recordIndex, column) {
        // テキストを表示
        td.textContent = value;

        // 分離ボタンを作成
        const separateButton = DOMHelper.createElement('button', {
            type: 'button',
            'data-record-index': recordIndex,
            'data-field-key': column.key,
            'data-field-code': column.fieldCode
        }, 'separate-button');
        separateButton.textContent = '分離';

        // ボタンのイベントリスナー
        separateButton.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            
            const fieldCode = event.target.getAttribute('data-field-code');
            
            // CellSwapperの分離処理を呼び出し
            if (window.tableRenderer && window.tableRenderer.cellSwapper) {
                window.tableRenderer.cellSwapper.separateLedger(recordIndex, fieldCode);
            } else {
                console.error('❌ CellSwapperが見つかりません');
            }
        });

        // ボタンをセルに追加
        td.appendChild(separateButton);
    }
}

// グローバルに公開
window.VirtualScroll = VirtualScroll; 