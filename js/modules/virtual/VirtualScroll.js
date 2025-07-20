/**
 * 仮想スクロールクラス
 */
class VirtualScroll {
    constructor() {
        this.fieldInfoCache = {};
        this.changeFlags = new Map(); // レコードの変更フラグを管理
        this.changedFields = new Map(); // 変更されたフィールドを記録 {recordIndex: Set(fieldKeys)}
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
        
        // 変更フラグを初期化
        this.initializeChangeFlags(integratedData);
        
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
        for (let i = 0; i < data.length; i++) {
            this.changeFlags.set(i, false);
            this.changedFields.set(i, new Set());
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
     * レコードの変更フラグを設定
     */
    setChangeFlag(recordIndex, isChanged) {
        this.changeFlags.set(recordIndex, isChanged);
        this.updateChangeCheckbox(recordIndex, isChanged);
        
        // フラグがリセットされた場合は変更フィールドもクリア
        if (!isChanged) {
            this.changedFields.set(recordIndex, new Set());
        }
    }

    /**
     * チェックボックスの表示を更新
     */
    updateChangeCheckbox(recordIndex, isChanged) {
        const checkbox = document.querySelector(`input[data-record-index="${recordIndex}"][data-field="change-flag"]`);
        if (checkbox) {
            checkbox.checked = isChanged;
        }
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
                
                if (column.isChangeFlag) {
                    // 変更フラグ列の場合はチェックボックスを作成
                    const checkbox = DOMHelper.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.checked = this.changeFlags.get(i) || false;
                    checkbox.disabled = true; // 手動変更不可
                    checkbox.setAttribute('data-record-index', i);
                    checkbox.setAttribute('data-field', 'change-flag');
                    td.appendChild(checkbox);
                    td.className = 'change-flag-cell';
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
                        td.textContent = value;
                        td.className = 'readonly-cell';
                    }
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
        
        // 編集不可のフィールドを定義
        const readOnlyFields = ['PC番号', '内線番号', '座席番号', 'ユーザー名'];
        
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
            'data-column-index': columnIndex,
            'data-field-key': column.key
        }, 'editable-cell-input');

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
            'data-column-index': columnIndex,
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
            console.error(`フィールド情報取得エラー (App ${appId}, Field ${fieldCode}):`, error);
            return { type: 'text' };
        }
    }

    /**
     * セルの値変更を処理
     */
    handleCellValueChange(inputElement) {
        const recordIndex = parseInt(inputElement.getAttribute('data-record-index'));
        const fieldKey = inputElement.getAttribute('data-field-key');
        const newValue = inputElement.value;

        console.log(`📝 セル編集: レコード${recordIndex}, フィールド${fieldKey}, 新しい値: ${newValue}`);

        // TableRendererの現在のデータを更新
        if (window.tableRenderer && window.tableRenderer.currentSearchResults) {
            const currentData = window.tableRenderer.currentSearchResults;
            if (currentData[recordIndex]) {
                currentData[recordIndex][fieldKey] = newValue;
                console.log(`✅ データ更新完了: レコード${recordIndex}[${fieldKey}] = ${newValue}`);
                
                // 変更されたフィールドを記録
                if (!this.changedFields.has(recordIndex)) {
                    this.changedFields.set(recordIndex, new Set());
                }
                this.changedFields.get(recordIndex).add(fieldKey);
                
                // 変更フラグを設定
                this.setChangeFlag(recordIndex, true);
            }
        }
    }
}

// グローバルに公開
window.VirtualScroll = VirtualScroll; 