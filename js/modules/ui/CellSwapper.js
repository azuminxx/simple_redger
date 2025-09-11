/**
 * セル交換機能クラス
 * ドラッグアンドドロップによる主キーフィールドの交換を管理
 */
class CellSwapper {
    constructor(tableRenderer) {
        this.tableRenderer = tableRenderer;
        
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
     * 同じ主キータイプかどうかを判定
     */
    isSamePrimaryKeyType(fieldCode1, fieldCode2) {
        // フィールドコードから台帳名を取得
        const ledgerName1 = this.getLedgerNameFromFieldCode(fieldCode1);
        const ledgerName2 = this.getLedgerNameFromFieldCode(fieldCode2);

        // 台帳名が同じで、フィールドコードが同じかどうかを判定
        return ledgerName1 === ledgerName2 && fieldCode1 === fieldCode2;
    }

    /**
     * セルにドラッグアンドドロップ機能を追加
     */
    addDragAndDropToCell(cell, rowIndex, columnKey, fieldCode) {
        // フィールドコードから台帳名を取得
        const ledgerName = this.getLedgerNameFromFieldCode(fieldCode);
        const column = CONFIG.integratedTableConfig.columns.find(col => 
            col.key === columnKey
        );

        // 主キーフィールドのみドラッグ可能
        if (!column || !column.primaryKey) {
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
    }

    /**
     * ドラッグオーバー処理
     */
    handleDragOver(e, targetFieldCode) {
        if (!this.dragState.isDragging) return;
        
        // 保存されたソースフィールドコードを直接使用
        const sourceFieldCode = this.dragState.sourceFieldCode;
        
        if (!sourceFieldCode) {
            // skip: source field code missing
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
            // invalid drop
        }
    }

    /**
     * ドロップ処理
     */
    async handleDrop(e, targetCell, targetRowIndex, targetColumnKey, targetFieldCode) {
        e.preventDefault();
        targetCell.classList.remove('drop-target', 'drop-invalid');
        
        if (!this.dragState.isDragging) return;
        
        try {
            // ドラッグ状態から確実な情報を取得
            const sourceRowIndex = this.dragState.sourceRowIndex;
            const sourceColumnKey = this.dragState.sourceColumnKey;
            const sourceFieldCode = this.dragState.sourceFieldCode;
            
            // 同じセルの場合は何もしない
            if (sourceRowIndex === targetRowIndex && sourceColumnKey === targetColumnKey) {
                // same cell, skip
                return;
            }
            
            // 同じ主キータイプのみ交換可能
            if (!this.isSamePrimaryKeyType(sourceFieldCode, targetFieldCode)) {
                // incompatible primary key type
                return;
            }
            
            // 主キー値を交換
            await this.swapPrimaryKeyValues(sourceRowIndex, targetRowIndex, sourceFieldCode);
            
            // 主キー交換の詳細ログは swapPrimaryKeyValues で出力
            
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
     *   - PC台帳：PC番号、BSSID、氏名漢字、PC用途等の全フィールドを交換
     *   - 内線台帳：PC番号フィールドのみ交換（内線番号、電話機種別は交換しない）
     *   - 座席台帳：PC番号フィールドのみ交換（座席番号、座席拠点等は交換しない）
     */
    async swapPrimaryKeyValues(sourceRowIndex, targetRowIndex, primaryKeyField) {
        const sourceRecord = this.tableRenderer.currentSearchResults[sourceRowIndex];
        const targetRecord = this.tableRenderer.currentSearchResults[targetRowIndex];
        
        if (!sourceRecord || !targetRecord) {
            // missing source/target
            return;
        }

        // 【重要】主キーフィールドに対応する起点台帳を特定
        // PC番号 → PC台帳、内線番号 → 内線台帳、座席番号 → 座席台帳
        const sourceApp = this.getPrimaryKeySourceApp(primaryKeyField);
        if (!sourceApp) {
            // missing ledger
            return;
        }
        
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
                // → 全フィールドを交換（PC番号、BSSID、氏名漢字、PC用途等すべて）
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
        
        // 【重要】CONFIG.integratedTableConfig.columnsに含まれていないが、
        // CONFIG.getLedgerUpdateFieldsで含まれる他台帳の主キーフィールドも交換する
        CONFIG.ledgerNames.forEach(ledgerName => {
            if (ledgerName !== sourceApp) {
                // 他台帳の主キーフィールドで、primaryKeyFieldと一致するものを交換
                const crossLedgerFieldKey = `${ledgerName}_${primaryKeyField}`;
                if (sourceRecord[crossLedgerFieldKey] !== undefined || targetRecord[crossLedgerFieldKey] !== undefined) {
                    this.swapFieldValues(sourceRecord, targetRecord, sourceRowIndex, targetRowIndex, crossLedgerFieldKey, swappedFields);
                }
            }
        });
        
        // $idフィールドは CONFIG.integratedTableConfig.columns に含まれていないため、
        // 明示的に処理する必要がある
        const recordIdKey = `${sourceApp}_$id`;
        if (sourceRecord[recordIdKey] !== undefined || targetRecord[recordIdKey] !== undefined) {
            this.swapFieldValues(sourceRecord, targetRecord, sourceRowIndex, targetRowIndex, recordIdKey, swappedFields);
        }
        
        // スクロール位置を事前に保存（空行削除前）
        const scrollContainer = document.querySelector('.virtual-scroll-container');
        const savedScrollTop = scrollContainer ? scrollContainer.scrollTop : 0;
        
        // セル交換後に空行をチェックして削除（スクロール位置を渡す）
        this.removeEmptyRowsAfterSwap(savedScrollTop);

        // 交換後の行をバリデーション
        try {
            if (window.validation) {
                await window.validation.validateRow(sourceRowIndex);
                await window.validation.validateRow(targetRowIndex);
            }
        } catch (e) {
            // バリデーション失敗は致命ではないためログのみ
            // validation fail ignored
        }
        
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
        
        // DOM要素交換（$idフィールドは表示されていないためスキップ）
        if (!fieldKey.includes('_$id')) {
            this.exchangeFieldCellsInDOM(sourceRowIndex, targetRowIndex, fieldKey);
        }
        
        swappedFields.add(fieldKey);
        
        // セル交換時の元の値保存と変更状態管理
        window.virtualScroll.updateFieldChangeStatusForSwap(sourceRowIndex, fieldKey, sourceValue, targetValue);
        window.virtualScroll.updateFieldChangeStatusForSwap(targetRowIndex, fieldKey, targetValue, sourceValue);
    }

    /**
     * 主キーフィールドに対応するsourceAppを取得
     */
    getPrimaryKeySourceApp(primaryKeyField) {
        // CONFIG.jsのフィールドマッピングから取得
        const col = CONFIG.integratedTableConfig.columns.find(c => c.fieldCode === primaryKeyField && c.primaryKey);
        return col ? col.ledger : null;
    }

    /**
     * DOM要素内の特定フィールドのセル値を直接交換（仮想スクロール対応）
     */
    exchangeFieldCellsInDOM(sourceRowIndex, targetRowIndex, fieldKey) {
        try {
            // 仮想スクロール環境では表示されている行のみ処理
            const tbody = document.querySelector('.virtual-scroll-content tbody');
            if (!tbody) return;

            const sourceRow = this.findRowByIndex(tbody, sourceRowIndex);
            const targetRow = this.findRowByIndex(tbody, targetRowIndex);

            if (!sourceRow || !targetRow) {
                return;
            }

            // フィールドに対応するセルを取得
            const sourceCell = this.findCellInRow(sourceRow, fieldKey);
            const targetCell = this.findCellInRow(targetRow, fieldKey);

            if (!sourceCell || !targetCell) {
                return;
            }

            // セル値を取得
            const sourceValue = DOMHelper.getCellValue(sourceCell);
            const targetValue = DOMHelper.getCellValue(targetCell);

            // セル値を交換
            DOMHelper.setCellValue(sourceCell, targetValue);
            DOMHelper.setCellValue(targetCell, sourceValue);

            // DOM交換の詳細ログは省略（パフォーマンス向上）

        } catch (error) {
            // dom swap error
        }
    }

    /**
     * 行インデックスに対応するDOM行を検索
     */
    findRowByIndex(tbody, rowIndex) {
        const rows = tbody.querySelectorAll('tr');
        for (const row of rows) {
            const recordIndex = parseInt(row.getAttribute('data-record-index'));
            if (recordIndex === rowIndex) {
                return row;
            }
        }
        return null;
    }

    /**
     * 行内で指定フィールドに対応するセルを検索
     */
    findCellInRow(row, fieldKey) {
        const cells = row.querySelectorAll('td[data-column]');
        for (const cell of cells) {
            if (cell.getAttribute('data-column') === fieldKey) {
                return cell;
            }
        }
        return null;
    }



    /**
     * エラーログを統一フォーマットで出力
     */
    logError(operation, error) {
        // minimal
    }

    /**
     * 空行を作成して指定位置に挿入
     */
    createEmptyRow(insertAfterIndex = null) {
        const emptyRow = {};
        
        // 統合キーは空の一意な値を設定
        emptyRow[CONFIG.integrationKey] = `EMPTY_${Date.now()}`;
        
        // 各台帳のフィールドを空に設定
        CONFIG.integratedTableConfig.columns.forEach(column => {
            if (!column.isChangeFlag && column.key !== CONFIG.integrationKey) {
                emptyRow[column.key] = '';
            }
        });
        
        // 変更フラグは false に設定
        emptyRow['change-flag'] = false;
        
        // 空行識別フラグを設定
        emptyRow.isVirtualEmptyRow = true;
        
        let newRowIndex;
        
        if (insertAfterIndex !== null) {
            // 指定した行の直下に挿入
            const insertIndex = insertAfterIndex + 1;
            this.tableRenderer.currentSearchResults.splice(insertIndex, 0, emptyRow);
            newRowIndex = insertIndex;
        } else {
            // 最終行に追加（従来の動作）
            this.tableRenderer.currentSearchResults.push(emptyRow);
            newRowIndex = this.tableRenderer.currentSearchResults.length - 1;
        }
        
        return newRowIndex;
    }

    /**
     * 指定台帳の全フィールドを取得（$idフィールドも含む）
     */
    getLedgerFields(ledgerName) {
        const fields = CONFIG.integratedTableConfig.columns.filter(column => 
            !column.isChangeFlag && 
            DOMHelper.getLedgerNameFromKey(column.key) === ledgerName
        );
        
        // $idフィールドも追加（統一処理のため）
        const recordIdField = {
            key: `${ledgerName}_$id`,
            fieldCode: '$id',
            ledger: ledgerName
        };
        fields.push(recordIdField);
        
        return fields;
    }

    /**
     * 台帳分離処理
     */
    async separateLedger(recordIndex, fieldCode) {
        const sourceRecord = this.tableRenderer.currentSearchResults[recordIndex];
        
        if (!sourceRecord) {
            // missing record
            return false;
        }

        // フィールドコードから台帳名を特定
        const ledgerName = this.getLedgerNameFromFieldCode(fieldCode);
        if (!ledgerName) {
            // missing ledger for fieldCode
            return false;
        }

        // 空行を分離元の行の直下に作成
        // 元の統合キーを保持（_originalIntegratedData 同期のため）
        const oldSourceKey = window.virtualScroll?.getRecordIdFromRow?.(sourceRecord) || null;
        const emptyRowIndex = this.createEmptyRow(recordIndex);
        
        // 台帳の全フィールドを取得
        const ledgerFields = this.getLedgerFields(ledgerName);
        
        // 各フィールドをセル交換で移動
        // 注意: 空行挿入により元のレコードのインデックスは変わらないが、
        // 空行が挿入されたことで配列の参照を再取得する
        const updatedSourceRecord = this.tableRenderer.currentSearchResults[recordIndex];
        const emptyRecord = this.tableRenderer.currentSearchResults[emptyRowIndex];
        
        ledgerFields.forEach(field => {
            const sourceValue = updatedSourceRecord[field.key];
            const targetValue = emptyRecord[field.key];
            
            // セル交換を実行
            updatedSourceRecord[field.key] = targetValue;
            emptyRecord[field.key] = sourceValue;
            
            // VirtualScrollで変更状態を管理（セル交換と同様の処理）
            if (window.virtualScroll) {
                // 元レコードの変更状態を記録
                window.virtualScroll.updateFieldChangeStatusForSwap(
                    recordIndex, 
                    field.key, 
                    sourceValue, 
                    targetValue
                );
                
                // 空行の変更状態を記録
                window.virtualScroll.updateFieldChangeStatusForSwap(
                    emptyRowIndex, 
                    field.key, 
                    targetValue, 
                    sourceValue
                );
            }
        });
        
        // 分離後の統合キー更新と各種同期は、保存完了後に遅延実行する（変更管理キーの不整合回避）
        if (window.tableRenderer && typeof window.tableRenderer.addPostSaveTask === 'function' && window.virtualScroll && typeof window.virtualScroll.generateIntegrationKeyFromRow === 'function') {
            const renderer = window.tableRenderer;
            const indexAfterSplit = { sourceIndex: recordIndex, emptyIndex: emptyRowIndex };
            const sourceSnapshot = this.tableRenderer.currentSearchResults[recordIndex];
            const emptySnapshot = this.tableRenderer.currentSearchResults[emptyRowIndex];
            renderer.addPostSaveTask(() => {
                try {
                    const newSourceKey = window.virtualScroll.generateIntegrationKeyFromRow(sourceSnapshot);
                    const newEmptyKey = window.virtualScroll.generateIntegrationKeyFromRow(emptySnapshot);
                    sourceSnapshot[CONFIG.integrationKey] = newSourceKey;
                    emptySnapshot[CONFIG.integrationKey] = newEmptyKey;
                    // _originalIntegratedData 同期
                    if (Array.isArray(renderer._originalIntegratedData)) {
                        try {
                            const oldKey = oldSourceKey;
                            renderer.syncOriginalDataRowByKeys(oldKey, newSourceKey, sourceSnapshot);
                            // 直後に挿入した空行は検索ベースにも追加（位置は厳密でなくてもよい）
                            const exists = renderer._originalIntegratedData.some(r => window.virtualScroll.getRecordIdFromRow(r) === newEmptyKey);
                            if (!exists) renderer._originalIntegratedData.push({ ...emptySnapshot });
                        } catch (e) { /* noop */ }
                    }
                    // 整合性マップ更新（廃止）
                    // if (!window.consistencyMap) window.consistencyMap = new Map();
                    // [indexAfterSplit.sourceIndex, indexAfterSplit.emptyIndex].forEach(idx => {
                    //     const row = this.tableRenderer.currentSearchResults[idx];
                    //     const recordId = window.virtualScroll.getRecordIdFromRow(row);
                    //     const label = renderer.getConsistencyResult(row);
                    //     const isConsistent = label === '整合' ? true : (label === '不整合' ? false : null);
                    //     window.consistencyMap.set(recordId, isConsistent);
                    // });
                } catch (e) { /* noop */ }
            });
        }

        // 上記の_originalIntegratedData同期は保存後タスクで実施

        // 整合性マップ更新も保存後タスクで実施（廃止）

        // 変更フラグを設定
        window.virtualScroll.setChangeFlag(recordIndex, true);
        window.virtualScroll.setChangeFlag(emptyRowIndex, true);
        
        // 分離処理後はテーブル再描画が必要（データが変更されたため）
        this.tableRenderer.refreshVirtualScrollTable();

        // 分離後の両行をバリデーション
        try {
            if (window.validation) {
                await window.validation.validateRow(recordIndex);
                await window.validation.validateRow(emptyRowIndex);
            }
        } catch (e) {
            // validation fail ignored
        }
        
        return true;
    }

    /**
     * フィールドコードから台帳名を取得
     */
    getLedgerNameFromFieldCode(fieldCode) {
        // CONFIG.integratedTableConfig.columns から該当するフィールドを検索
        const column = CONFIG.integratedTableConfig.columns.find(col => 
            col.fieldCode === fieldCode
        );
        
        if (column) {
            return DOMHelper.getLedgerNameFromKey(column.key);
        }
        
        return null;
    }

    /**
     * 台帳名とフィールドコードからフィールドキーを取得
     */
    getFieldKeyFromCode(fieldCode, ledgerName) {
        const column = CONFIG.integratedTableConfig.columns.find(col => 
            col.fieldCode === fieldCode && 
            DOMHelper.getLedgerNameFromKey(col.key) === ledgerName
        );
        
        return column ? column.key : null;
    }

    /**
     * セル交換後に完全に空の行を自動削除する機能
     */
    removeEmptyRowsAfterSwap(preservedScrollTop = 0) {
        // 空行削除は行わず、テーブル再描画とスクロール復元のみ実行
        this.tableRenderer.refreshVirtualScrollTableWithScrollPreservation(preservedScrollTop);
    }

}

// グローバルに公開
window.CellSwapper = CellSwapper; 