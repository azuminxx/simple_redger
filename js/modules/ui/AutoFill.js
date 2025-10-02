/**
 * オートフィル機能クラス
 * Excelライクなフィルハンドルによる値のコピー機能を提供
 */
class AutoFill {
    constructor() {
        this.fillState = {
            isFilling: false,
            sourceCell: null,
            sourceInput: null,
            sourceValue: null,
            sourceRowIndex: null,
            sourceColumnKey: null,
            targetCells: [],
            fillHandle: null
        };
        
        // 自動スクロール用
        this.autoScrollInterval = null;
        this.autoScrollSpeed = 0;
        
        // マウスイベントのバインド
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
    }

    /**
     * 編集可能セルにフィルハンドル機能を追加
     */
    addFillHandleToCell(cell, input, rowIndex, columnKey) {
        // セルに右下フィルハンドルエリアのクラスを追加
        cell.classList.add('has-fill-handle');
        
        // マウス移動イベントでカーソルを動的に変更
        cell.addEventListener('mousemove', (e) => {
            const rect = cell.getBoundingClientRect();
            const isInFillHandleArea = 
                e.clientX >= rect.right - 10 && 
                e.clientY >= rect.bottom - 10;
            
            if (isInFillHandleArea) {
                cell.style.cursor = 'crosshair';
            } else {
                cell.style.cursor = '';
            }
        });
        
        // マウスがセルから離れたらカーソルをリセット
        cell.addEventListener('mouseleave', () => {
            cell.style.cursor = '';
        });
        
        // マウスダウンイベント（セル全体ではなく右下エリアのみで判定）
        cell.addEventListener('mousedown', (e) => {
            // セルの右下10px四方の領域でのみフィル開始
            const rect = cell.getBoundingClientRect();
            const isInFillHandleArea = 
                e.clientX >= rect.right - 10 && 
                e.clientY >= rect.bottom - 10;
            
            if (isInFillHandleArea) {
                e.preventDefault();
                e.stopPropagation();
                this.handleFillStart(e, cell, input, rowIndex, columnKey);
            }
        });
    }

    /**
     * フィル開始処理
     */
    handleFillStart(e, cell, input, rowIndex, columnKey) {
        e.preventDefault();
        e.stopPropagation();
        
        // フィル状態を初期化
        this.fillState.isFilling = true;
        this.fillState.sourceCell = cell;
        this.fillState.sourceInput = input;
        this.fillState.sourceValue = this.getInputValue(input);
        this.fillState.sourceRowIndex = rowIndex;
        this.fillState.sourceColumnKey = columnKey;
        this.fillState.targetCells = [];
        this.fillState.fillHandle = e.target;
        
        // ソースセルにハイライトを追加
        cell.classList.add('autofill-source');
        
        // グローバルマウスイベントをリスン
        document.addEventListener('mousemove', this.handleMouseMove);
        document.addEventListener('mouseup', this.handleMouseUp);
        
        // カーソルをcrosshairに変更
        document.body.style.cursor = 'crosshair';
    }

    /**
     * マウス移動処理（ドラッグ中の範囲選択）
     */
    handleMouseMove(e) {
        if (!this.fillState.isFilling) return;
        
        // スクロールコンテナを取得
        const scrollContainer = document.querySelector('.virtual-scroll-container');
        if (!scrollContainer) return;
        
        // 自動スクロールの判定と実行
        this.handleAutoScroll(e, scrollContainer);
        
        // マウス位置の要素を取得
        const element = document.elementFromPoint(e.clientX, e.clientY);
        if (!element) return;
        
        // セルまたはその子要素を探す
        const cell = element.closest('td[data-record-index][data-column]');
        if (!cell) return;
        
        const targetRowIndex = parseInt(cell.getAttribute('data-record-index'));
        const targetColumnKey = cell.getAttribute('data-column');
        
        // 同じ列のセルのみ対象（下方向のみ）
        if (targetColumnKey !== this.fillState.sourceColumnKey) return;
        if (targetRowIndex <= this.fillState.sourceRowIndex) {
            // 上方向は無視（既存のハイライトをクリア）
            this.clearTargetHighlights();
            return;
        }
        
        // 範囲内のセルを収集
        this.updateTargetCells(this.fillState.sourceRowIndex + 1, targetRowIndex, targetColumnKey);
    }

    /**
     * 自動スクロール処理
     */
    handleAutoScroll(e, scrollContainer) {
        const rect = scrollContainer.getBoundingClientRect();
        const threshold = 50; // スクロール開始のしきい値（ピクセル）
        const maxSpeed = 20; // 最大スクロール速度
        
        // マウスがコンテナの下端に近い場合
        const distanceFromBottom = rect.bottom - e.clientY;
        
        if (distanceFromBottom < threshold && distanceFromBottom > 0) {
            // 下方向にスクロール
            const speed = Math.ceil((threshold - distanceFromBottom) / threshold * maxSpeed);
            this.startAutoScroll(scrollContainer, speed);
        } else {
            // 自動スクロールを停止
            this.stopAutoScroll();
        }
    }
    
    /**
     * 自動スクロールを開始
     */
    startAutoScroll(scrollContainer, speed) {
        // 既に同じ速度でスクロール中の場合は何もしない
        if (this.autoScrollInterval && this.autoScrollSpeed === speed) return;
        
        // 既存のインターバルをクリア
        this.stopAutoScroll();
        
        this.autoScrollSpeed = speed;
        this.autoScrollInterval = setInterval(() => {
            scrollContainer.scrollTop += speed;
            
            // スクロール後に範囲を再計算（マウス位置は変わっていないが、セルが移動した）
            // 最新のマウスイベントを再利用できないため、最後のターゲットセルを基準に拡張
            if (this.fillState.targetCells.length > 0) {
                const lastTarget = this.fillState.targetCells[this.fillState.targetCells.length - 1];
                const nextRowIndex = lastTarget.rowIndex + 1;
                const nextCell = this.findCellByRowAndColumn(nextRowIndex, this.fillState.sourceColumnKey);
                
                if (nextCell) {
                    // 次の行が表示されていれば、範囲を拡張
                    this.updateTargetCells(
                        this.fillState.sourceRowIndex + 1, 
                        nextRowIndex, 
                        this.fillState.sourceColumnKey
                    );
                }
            }
        }, 50); // 50msごとにスクロール
    }
    
    /**
     * 自動スクロールを停止
     */
    stopAutoScroll() {
        if (this.autoScrollInterval) {
            clearInterval(this.autoScrollInterval);
            this.autoScrollInterval = null;
            this.autoScrollSpeed = 0;
        }
    }
    
    /**
     * ターゲットセルを更新
     */
    updateTargetCells(startRowIndex, endRowIndex, columnKey) {
        // 既存のハイライトをクリア
        this.clearTargetHighlights();
        
        // 新しい範囲のセルを取得してハイライト
        this.fillState.targetCells = [];
        
        for (let i = startRowIndex; i <= endRowIndex; i++) {
            const targetCell = this.findCellByRowAndColumn(i, columnKey);
            
            // セルが表示されていればハイライトを追加
            if (targetCell) {
                targetCell.classList.add('autofill-target');
            }
            
            // DOM上に存在しなくても、行インデックスと列キーは保持
            // （仮想スクロールで非表示になったセルもオートフィル対象にするため）
            this.fillState.targetCells.push({
                cell: targetCell, // nullの場合もある
                rowIndex: i,
                columnKey: columnKey
            });
        }
    }

    /**
     * マウスアップ処理（フィル実行）
     */
    handleMouseUp(e) {
        if (!this.fillState.isFilling) return;
        
        // フィル実行
        this.executeFill();
        
        // クリーンアップ
        this.cleanup();
    }

    /**
     * フィル実行
     */
    executeFill() {
        if (this.fillState.targetCells.length === 0) return;
        
        const sourceValue = this.fillState.sourceValue;
        
        // 各ターゲットセルに値をコピー
        this.fillState.targetCells.forEach(target => {
            const targetCell = target.cell;
            const targetRowIndex = target.rowIndex;
            const targetColumnKey = target.columnKey;
            
            // データを直接更新（仮想スクロールで非表示のセルにも対応）
            if (window.tableRenderer && window.tableRenderer.currentSearchResults) {
                const record = window.tableRenderer.currentSearchResults[targetRowIndex];
                if (record) {
                    // 元の値を保存
                    if (window.virtualScroll) {
                        const recordId = window.virtualScroll.getRecordId(targetRowIndex);
                        if (!window.virtualScroll.originalValues.has(recordId)) {
                            window.virtualScroll.originalValues.set(recordId, new Map());
                        }
                        const originalValuesMap = window.virtualScroll.originalValues.get(recordId);
                        if (!originalValuesMap.has(targetColumnKey)) {
                            originalValuesMap.set(targetColumnKey, record[targetColumnKey]);
                        }
                    }
                    
                    // データを更新
                    record[targetColumnKey] = sourceValue;
                    
                    // 変更状態を更新
                    if (window.virtualScroll) {
                        window.virtualScroll.updateFieldChangeStatus(targetRowIndex, targetColumnKey, sourceValue);
                    }
                }
            }
            
            // DOM要素が存在する場合（表示中のセル）は、input要素も更新
            if (targetCell) {
                const targetInput = targetCell.querySelector('input, select');
                if (targetInput) {
                    // 値を設定
                    this.setInputValue(targetInput, sourceValue);
                    
                    // 変更イベントをトリガー（VirtualScrollの変更検知を起動）
                    const changeEvent = new Event('change', { bubbles: true });
                    targetInput.dispatchEvent(changeEvent);
                    
                    // blurイベントもトリガー（バリデーションを起動）
                    const blurEvent = new Event('blur', { bubbles: true });
                    targetInput.dispatchEvent(blurEvent);
                }
            }
        });
        
        // changeイベントの処理後に確実にcell-changedクラスを適用
        setTimeout(() => {
            this.fillState.targetCells.forEach(target => {
                const targetRowIndex = target.rowIndex;
                const targetColumnKey = target.columnKey;
                const targetCell = target.cell;
                
                // cell-changedクラスを追加
                if (window.virtualScroll) {
                    window.virtualScroll.setCellChangedStyle(targetRowIndex, targetColumnKey);
                }
                
                // セル自体にもクラスを直接追加（保険）
                if (targetCell) {
                    targetCell.classList.add('cell-changed');
                }
            });
        }, 10);
    }

    /**
     * ターゲットセルのハイライトをクリア
     */
    clearTargetHighlights() {
        this.fillState.targetCells.forEach(target => {
            // 仮想スクロールでDOM要素が削除されている場合があるのでnullチェック
            if (target.cell && target.cell.classList) {
                target.cell.classList.remove('autofill-target');
            }
        });
        this.fillState.targetCells = [];
    }

    /**
     * クリーンアップ
     */
    cleanup() {
        // 自動スクロールを停止
        this.stopAutoScroll();
        
        // ハイライトをクリア
        this.clearTargetHighlights();
        
        if (this.fillState.sourceCell) {
            this.fillState.sourceCell.classList.remove('autofill-source');
            // セル自体のカーソルもリセット
            this.fillState.sourceCell.style.cursor = '';
        }
        
        // イベントリスナーを削除
        document.removeEventListener('mousemove', this.handleMouseMove);
        document.removeEventListener('mouseup', this.handleMouseUp);
        
        // カーソルを確実に元に戻す
        document.body.style.cursor = '';
        
        // すべての編集可能セルのカーソルをリセット
        const allEditableCells = document.querySelectorAll('.editable-cell.has-fill-handle');
        allEditableCells.forEach(cell => {
            cell.style.cursor = '';
        });
        
        // 状態をリセット
        this.fillState = {
            isFilling: false,
            sourceCell: null,
            sourceInput: null,
            sourceValue: null,
            sourceRowIndex: null,
            sourceColumnKey: null,
            targetCells: [],
            fillHandle: null
        };
    }

    /**
     * 行インデックスと列キーからセルを検索
     */
    findCellByRowAndColumn(rowIndex, columnKey) {
        return document.querySelector(
            `td[data-record-index="${rowIndex}"][data-column="${columnKey}"]`
        );
    }

    /**
     * 入力要素から値を取得
     */
    getInputValue(input) {
        if (!input) return '';
        
        if (input.tagName === 'SELECT') {
            if (input.multiple) {
                // 複数選択の場合
                return Array.from(input.selectedOptions).map(opt => opt.value);
            } else {
                return input.value;
            }
        } else {
            return input.value;
        }
    }

    /**
     * 入力要素に値を設定
     */
    setInputValue(input, value) {
        if (!input) return;
        
        if (input.tagName === 'SELECT') {
            if (input.multiple) {
                // 複数選択の場合
                const values = Array.isArray(value) ? value : [value];
                Array.from(input.options).forEach(opt => {
                    opt.selected = values.includes(opt.value);
                });
            } else {
                input.value = value;
            }
        } else {
            input.value = value;
        }
    }
}

// グローバルに公開
window.AutoFill = AutoFill;

