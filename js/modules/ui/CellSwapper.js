/**
 * セル交換機能クラス
 * ドラッグアンドドロップによる主キーフィールドの交換を管理
 */
class CellSwapper {
    constructor(tableRenderer) {
        this.tableRenderer = tableRenderer;
        
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
     *   - PC台帳：PC番号、ユーザーID、ユーザー名、PC用途等の全フィールドを交換
     *   - 内線台帳：PC番号フィールドのみ交換（内線番号、電話機種別は交換しない）
     *   - 座席台帳：PC番号フィールドのみ交換（座席番号、座席拠点等は交換しない）
     */
    swapPrimaryKeyValues(sourceRowIndex, targetRowIndex, primaryKeyField) {
        const sourceRecord = this.tableRenderer.currentSearchResults[sourceRowIndex];
        const targetRecord = this.tableRenderer.currentSearchResults[targetRowIndex];
        
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
        
        // 【重要】レコードIDは起点台帳のもののみ交換
        // ■ 理由：データの整合性を保つため
        // ■ 例：PC番号交換時
        //   - PC台帳のレコードIDは交換（6163 ⇄ 6164）
        //   - 内線台帳のレコードIDは交換しない（6158, 6159のまま）
        //   - 座席台帳のレコードIDは交換しない（7713, 7714のまま）
        const recordIdKey = `${sourceApp}_$id`;
        
        if (sourceRecord[recordIdKey] || targetRecord[recordIdKey]) {
            const sourceRecordId = sourceRecord[recordIdKey];
            const targetRecordId = targetRecord[recordIdKey];
            
            // 起点台帳のレコードIDを交換（どちらか一方がnullでも交換）
            sourceRecord[recordIdKey] = targetRecordId;
            targetRecord[recordIdKey] = sourceRecordId;
            
            console.log(`🔄 ${sourceApp}レコードID交換: ${sourceRecordId} ⇄ ${targetRecordId}`);
        } else {
            console.log(`⚠️ ${sourceApp}のレコードIDが両方の行で見つからないため、レコードID交換をスキップ`);
        }
        
        // VirtualScrollでテーブルを再描画
        this.tableRenderer.refreshVirtualScrollTable();
        
        console.log(`✅ セル交換完了: ${primaryKeyField} 行${sourceRowIndex}⇄${targetRowIndex} (${swappedFields.size}フィールド)`);
        
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
        
        // セル交換時の元の値保存と変更状態管理
        window.virtualScroll.updateFieldChangeStatusForSwap(sourceRowIndex, fieldKey, sourceValue, targetValue);
        window.virtualScroll.updateFieldChangeStatusForSwap(targetRowIndex, fieldKey, targetValue, sourceValue);
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

            // DOM交換の詳細ログは省略（パフォーマンス向上）

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
        console.error(`❌ ${operation}エラー:`, error);
    }
}

// グローバルに公開
window.CellSwapper = CellSwapper; 