/**
 * 仮想スクロールクラス
 */
class VirtualScroll {
    constructor() {
        this.fieldInfoCache = {};
        this.changeFlags = new Map(); // 統合キーで管理
        this.changedFields = new Map(); // 統合キーで管理
        this.originalValues = new Map(); // 統合キーで管理
        this.savedScrollTop = 0; // スクロール位置を保存
        this.ledgerModal = new LedgerDetailsModal(); // モーダルインスタンス
    }
    /**
     * 仮想スクロール対応テーブルを作成
     */
    createVirtualScrollTable(integratedData) {
        // メインコンテナ
        const container = DOMHelper.createElement('div', {}, 'integrated-table-container');
        
        // 動的サイズ調整を適用
        this.applyDynamicSizing(container);
        
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
        
        // 動的CSSを生成してテーブル幅を設定
        DOMHelper.generateTableWidthCSS();
        
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
     * 動的サイズ調整を適用
     */
    applyDynamicSizing(container) {
        // 動的CSSを生成してテーブル幅を設定
        DOMHelper.generateTableWidthCSS();
   
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
            const recordId = this.getRecordId(i);
            this.changeFlags.set(recordId, false);
            this.changedFields.set(recordId, new Set());
            this.originalValues.set(recordId, new Map());
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
            
            const recordId = this.getRecordId(i);
            this.originalValues.set(recordId, originalValuesMap);
        }
    }

    /**
     * 指定レコードの元の値を現在の値でリセット（保存後に使用）
     */
    resetOriginalValues(recordIndex) {
        const recordId = this.getRecordId(recordIndex);
        if (window.tableRenderer && window.tableRenderer.currentSearchResults) {
            const currentRecord = window.tableRenderer.currentSearchResults[recordIndex];
            if (currentRecord) {
                const originalValuesMap = new Map();
                
                CONFIG.integratedTableConfig.columns.forEach(column => {
                    if (!column.isChangeFlag) { // 変更フラグ列は除外
                        originalValuesMap.set(column.key, currentRecord[column.key]);
                    }
                });
                
                this.originalValues.set(recordId, originalValuesMap);
            }
        }
    }

    /**
     * 変更されたレコードのインデックスを取得
     */
    getChangedRecordIndices() {
        const changedIndices = [];
        // 編集フラグ（changeFlags）は統合キーで管理しているが、
        // 保存処理（saveChanges/groupRecordsByApp等）はcurrentSearchResults配列のインデックスで行を参照する設計のため、
        // ここで「統合キー→インデックス」変換を行い、インデックス配列（changedIndices）を返す。
        // これにより、統合キー管理と配列ベースの保存処理の両立を実現している。
        this.changeFlags.forEach((isChanged, recordId) => {
            if (isChanged) {
                // recordIdからcurrentSearchResults内のindexを逆引き（getRecordIdFromRowで統一）
                const index = window.tableRenderer.currentSearchResults.findIndex(r => this.getRecordIdFromRow(r) === recordId);
                if (index !== -1) {
                    const row = window.tableRenderer.currentSearchResults[index];
                    const isAllEmpty = CONFIG.integratedTableConfig.columns.every(col => {
                        if (col.isChangeFlag) return true;
                        const v = row[col.key];
                        return v === '' || v === null || v === undefined || v === '-';
                    });
                    if (!isAllEmpty) {
                        changedIndices.push(index);
                    }
                }
            }
        });
        return changedIndices;
    }

    /**
     * 指定レコードの変更されたフィールドを取得
     */
    getChangedFields(recordIndex) {
        const recordId = this.getRecordId(recordIndex);
        return this.changedFields.get(recordId) || new Set();
    }

    /**
     * 指定レコードに変更されたフィールドを設定
     */
    setChangedField(recordIndex, fieldKey) {
        const recordId = this.getRecordId(recordIndex);
        if (!this.changedFields.has(recordId)) {
            this.changedFields.set(recordId, new Set());
        }
        this.changedFields.get(recordId).add(fieldKey);
        
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
        if (window.tableRenderer && window.tableRenderer.currentSearchResults) {
            const record = window.tableRenderer.currentSearchResults[recordIndex];
            if (record) {
                // 1. 起点台帳の統合キー
                if (record[CONFIG.integrationKey]) {
                    return record[CONFIG.integrationKey];
                }
                // 2. 他の台帳の統合キーを順に探索（CONFIG.appsの順で）
                for (const appId in CONFIG.apps) {
                    const ledgerName = CONFIG.apps[appId].name;
                    const key = `${ledgerName}_${CONFIG.integrationKey}`;
                    if (record[key]) {
                        return record[key];
                    }
                }
            }
        }
        // 3. どれも無ければインデックス
        return `idx_${recordIndex}`;
    }

    // 統合キー取得の共通関数（row単体版）
    getRecordIdFromRow(row) {
        if (row[CONFIG.integrationKey]) {
            return row[CONFIG.integrationKey];
        }
        for (const appId in CONFIG.apps) {
            const ledgerName = CONFIG.apps[appId].name;
            const key = `${ledgerName}_${CONFIG.integrationKey}`;
            if (row[key]) {
                return row[key];
            }
        }
        return null;
    }

    // PC:PC番号|EXT:内線番号|SEAT:座席番号 形式で統合キーを生成
    generateIntegrationKeyFromRow(row) {
        const pc = row['PC台帳_PC番号'] || '';
        const ext = row['内線台帳_内線番号'] || '';
        const seat = row['座席台帳_座席番号'] || '';
        return `PC:${pc}|EXT:${ext}|SEAT:${seat}`;
    }


    /**
     * フィールドの元の値を保存し、現在の値と比較して変更状態を更新
     */
    updateFieldChangeStatus(recordIndex, fieldKey, currentValue) {
        const recordId = this.getRecordId(recordIndex);
        if (!this.originalValues.has(recordId)) {
            this.originalValues.set(recordId, new Map());
        }
        const originalValuesMap = this.originalValues.get(recordId);
        if (!originalValuesMap.has(fieldKey)) {
            console.warn(`⚠️ 元の値が見つかりません: 行${recordIndex} ${fieldKey} - 変更フラグ追加`);
            this.setChangedField(recordIndex, fieldKey);
            return;
        }
        const originalValue = originalValuesMap.get(fieldKey);
        const isOriginalEmpty = this.isEmptyValue(originalValue);
        const isCurrentEmpty = this.isEmptyValue(currentValue);
        if ((isOriginalEmpty && isCurrentEmpty) || currentValue === originalValue) {
            // 元に戻った場合は変更フラグから削除
            this.removeChangedField(recordIndex, fieldKey);
            this.clearCellChangedStyle(recordIndex, fieldKey);
        } else {
            // 変更されている場合は変更フラグに追加
            this.setChangedField(recordIndex, fieldKey);
            this.setCellChangedStyle(recordIndex, fieldKey);
        }
    }

    /**
     * 指定レコードから変更されたフィールドを削除
     */
    removeChangedField(recordIndex, fieldKey) {
        const recordId = this.getRecordId(recordIndex);
        if (this.changedFields.has(recordId)) {
            const fieldSet = this.changedFields.get(recordId);
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
        const recordId = this.getRecordId(recordIndex);
        this.changeFlags.set(recordId, isChanged);
        this.updateChangeCheckbox(recordIndex, isChanged);
        
        // フラグがリセットされた場合は変更フィールドもクリア
        if (!isChanged) {
            this.changedFields.set(recordId, new Set());
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
        const recordId = this.getRecordId(recordIndex);
        // 該当行の全てのセルから.cell-changedクラスを削除
        const cells = document.querySelectorAll(`td[data-record-id="${recordId}"]`);
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
            const appId = window.tableRenderer.currentAppId;
            const ledgerName = CONFIG.apps[appId] && CONFIG.apps[appId].name;
            const integrationKeyField = ledgerName ? `${ledgerName}_${CONFIG.integrationKey}` : CONFIG.integrationKey;
            this.changeFlags.forEach((isChanged, recordId) => {
                const index = window.tableRenderer.currentSearchResults.findIndex(r => {
                    const id = r && (r[integrationKeyField] || r[CONFIG.integrationKey]);
                    return id === recordId;
                });
                if (index !== -1) {
                    this.updateChangeCheckbox(index, isChanged);
                }
            });
            
            // 変更されたセルの背景色も復元
            this.changedFields.forEach((fieldSet, recordId) => {
                const index = window.tableRenderer.currentSearchResults.findIndex(r => {
                    const id = r && (r[integrationKeyField] || r[CONFIG.integrationKey]);
                    return id === recordId;
                });
                if (index !== -1) {
                    fieldSet.forEach(fieldKey => {
                        this.setCellChangedStyle(index, fieldKey);
                    });
                }
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
                // 追加: 統合キー属性
                const recordId = this.getRecordId(i);
                td.setAttribute('data-record-id', recordId);
                
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
                    const isChanged = this.changeFlags.get(this.getRecordId(i)) || false;
                    checkbox.checked = isChanged;
                    checkbox.disabled = true; // 手動変更不可
                    checkbox.setAttribute('data-record-index', i);
                    checkbox.setAttribute('data-field', 'change-flag');
                    td.appendChild(checkbox);
                    td.className = 'change-flag-cell';
                } else if (column.isDetailLink) {
                    // 詳細リンク列の場合はファイル絵文字リンクを作成
                    this.createDetailLinkCell(td, i, record);
                } else if (column.isConsistencyCheck) {
                    // 不整合チェック列の場合
                    const DataIntegratorClass = window.DataIntegrator;
                    const dataIntegrator = new DataIntegratorClass();
                    // 編集中かどうか判定
                    const isEditing = this.changeFlags.get(this.getRecordId(i)) || false;
                    let resultText = '-';
                    if (isEditing) {
                        td.className = 'readonly-cell';
                    } else {
                        // 統合キーを取得
                        let integrationKey = null;
                        for (const appId in CONFIG.apps) {
                            const ledgerName = CONFIG.apps[appId].name;
                            const key = `${ledgerName}_${CONFIG.integrationKey}`;
                            if (record[key]) {
                                integrationKey = record[key];
                                break;
                            }
                        }
                        if (integrationKey) {
                            const parsed = dataIntegrator.parseIntegrationKey(integrationKey);
                            // 実際のフィールド値
                            const pc = record['PC台帳_PC番号'] || '';
                            const ext = record['内線台帳_内線番号'] || '';
                            const seat = record['座席台帳_座席番号'] || '';
                            function isFieldConsistent(a, b) {
                                const isEmpty = v => v === null || v === undefined || v === '';
                                if (isEmpty(a) && isEmpty(b)) return true;
                                return a === b;
                            }
                            // デバッグ出力（削除済み）
                            const isConsistent =
                                isFieldConsistent(parsed.PC, pc) &&
                                isFieldConsistent(parsed.EXT, ext) &&
                                isFieldConsistent(parsed.SEAT, seat);
                            resultText = isConsistent ? '✅' : '❌';
                            td.className = isConsistent ? 'consistency-ok readonly-cell' : 'consistency-ng readonly-cell';
                        } else {
                            td.className = 'null-value readonly-cell';
                        }
                    }
                    td.textContent = resultText;
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
                        if (column.primaryKey && value && value.trim() !== '') {
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
        // 追加: すでに最下部を表示している場合は再描画しない
        const isAtBottom = bufferEnd >= virtualState.data.length && virtualState.endIndex >= virtualState.data.length;

        if ((bufferStart !== virtualState.startIndex || bufferEnd !== virtualState.endIndex) && !isAtBottom) {
            virtualState.startIndex = bufferStart;
            virtualState.endIndex = bufferEnd;
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
        // カラム定義のreadOnlyプロパティで判定
        return !column.readOnly;
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
        const recordId = this.getRecordId(recordIndex);
        if (!this.originalValues.has(recordId)) {
            this.originalValues.set(recordId, new Map());
        }
        
        const originalValuesMap = this.originalValues.get(recordId);
        
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
            const recordId = this.getRecordId(recordIndex);
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
        const recordId = this.getRecordId(recordIndex);
        const cell = this.findCellElementByRecordId(recordId, fieldKey);
        if (cell) {
            cell.classList.add('cell-changed');
        }
    }

    /**
     * 指定セルからcell-changedクラスを削除（背景色クリア）
     */
    clearCellChangedStyle(recordIndex, fieldKey) {
        const recordId = this.getRecordId(recordIndex);
        const cell = this.findCellElementByRecordId(recordId, fieldKey);
        if (cell) {
            cell.classList.remove('cell-changed');
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
            const integrationKey = LedgerDetailsModal.getIntegrationKeyFromRecord(record);
            this.ledgerModal.show(integrationKey, record);
        });

        td.appendChild(link);
        td.className = 'detail-link-cell';
        td.style.cssText = 'text-align: center; vertical-align: middle;';
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

    findCellElementByRecordId(recordId, fieldKey) {
        return document.querySelector(`td[data-record-id="${recordId}"][data-column="${fieldKey}"]`);
    }

    // 空行（全フィールド空）の変更フラグとcell-changedクラスをクリア
    clearFlagsAndClassesForEmptyRows() {
        if (!window.tableRenderer || !window.tableRenderer.currentSearchResults) return;
        window.tableRenderer.currentSearchResults.forEach((row, index) => {
            const isAllEmpty = CONFIG.integratedTableConfig.columns.every(col => {
                if (col.isChangeFlag) return true;
                const v = row[col.key];
                return v === '' || v === null || v === undefined || v === '-';
            });
            if (isAllEmpty) {
                const recordId = this.getRecordIdFromRow(row);
                this.changeFlags.set(recordId, false);
                this.changedFields.set(recordId, new Set());
                this.clearCellChangedStyles(index);
                this.updateChangeCheckbox(index, false);
            }
        });
    }

    // 空欄値の等価判定用ユーティリティ
    isEmptyValue(val) {
        return val === null || val === undefined || val === '' || val === '-';
    }
}

// グローバルに公開
window.VirtualScroll = VirtualScroll; 