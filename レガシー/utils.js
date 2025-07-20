/**
 * 🛠️ 統合台帳システム v2 - ユーティリティ
 * @description シンプル化された共通ユーティリティ機能
 * @version 2.0.0
 */
(function() {
    'use strict';

    // グローバル名前空間確保
    window.LedgerV2 = window.LedgerV2 || {};
    window.LedgerV2.Utils = {};

    // =============================================================================
    // 🎯 編集モード管理（パフォーマンス改善用）
    // =============================================================================

    class EditModeManager {
        constructor() {
            this.isEditMode = false;
            this.enabledRows = new Set();
            this.isInitialLoad = true;
        }

        async enableEditMode() {
            // バックグラウンド処理監視を開始
            let processId = null;
            if (window.BackgroundProcessMonitor) {
                processId = window.BackgroundProcessMonitor.startProcess('編集モード切り替え', '編集モードに切り替え中...');
            }

            // ローディング表示開始
            LoadingManager.show('編集モードに切り替え中...');
            const startTime = Date.now();
            
            this.isEditMode = true;
            this.isInitialLoad = false;
            
            try {
                // 進行状況を更新
                if (processId) {
                    window.BackgroundProcessMonitor.updateProcess(processId, '実行中', 'テーブル要素を編集可能に変更中...');
                }

                // 非同期で処理を実行
                await this._applyEditModeToTableAsync();
                
                // 🆕 他モジュールに編集モード変更を通知
                this._notifyEditModeChange(true);
                
                // 完了状態を更新
                if (processId) {
                    window.BackgroundProcessMonitor.updateProcess(processId, '完了', '編集モード切り替え完了');
                }
                
            } catch (error) {
                if (processId) {
                    window.BackgroundProcessMonitor.updateProcess(processId, 'エラー', '編集モード切り替えエラー');
                }
            } finally {
                // 最小表示時間（300ms）を保証
                const elapsedTime = Date.now() - startTime;
                const minDisplayTime = 300;
                
                if (elapsedTime < minDisplayTime) {
                    await new Promise(resolve => setTimeout(resolve, minDisplayTime - elapsedTime));
                }
                
                // 処理完了後にローディング表示終了
                LoadingManager.hide();
                
                // バックグラウンド処理監視を終了
                if (processId) {
                    setTimeout(() => window.BackgroundProcessMonitor.endProcess(processId), 500);
                }
            }
        }

        async disableEditMode() {
            // バックグラウンド処理監視を開始
            let processId = null;
            if (window.BackgroundProcessMonitor) {
                processId = window.BackgroundProcessMonitor.startProcess('閲覧モード切り替え', '閲覧モードに切り替え中...');
            }

            // ローディング表示開始
            LoadingManager.show('閲覧モードに切り替え中...');
            const startTime = Date.now();
            
            this.isEditMode = false;
            this.enabledRows.clear();
            
            try {
                // 進行状況を更新
                if (processId) {
                    window.BackgroundProcessMonitor.updateProcess(processId, '実行中', 'テーブル要素を閲覧専用に変更中...');
                }

                // 非同期でDOM操作を実行
                await this._applyViewModeToTableAsync();
                
                // 🆕 他モジュールに編集モード変更を通知
                this._notifyEditModeChange(false);
                
                // 完了状態を更新
                if (processId) {
                    window.BackgroundProcessMonitor.updateProcess(processId, '完了', '閲覧モード切り替え完了');
                }
                
            } catch (error) {
                if (processId) {
                    window.BackgroundProcessMonitor.updateProcess(processId, 'エラー', '閲覧モード切り替えエラー');
                }
            } finally {
                // 最小表示時間（300ms）を保証
                const elapsedTime = Date.now() - startTime;
                const minDisplayTime = 300;
                
                if (elapsedTime < minDisplayTime) {
                    await new Promise(resolve => setTimeout(resolve, minDisplayTime - elapsedTime));
                }
                
                // 処理完了後にローディング表示終了
                LoadingManager.hide();
                
                // バックグラウンド処理監視を終了
                if (processId) {
                    setTimeout(() => window.BackgroundProcessMonitor.endProcess(processId), 500);
                }
            }
        }

        enableRowEditing(rowId) {
            this.enabledRows.add(rowId);
        }

        disableRowEditing(rowId) {
            this.enabledRows.delete(rowId);
        }

        isRowEditable(rowId) {
            return this.isEditMode && this.enabledRows.has(rowId);
        }

        /**
         * 🚨 PROTECTED: ②パターン（ページング時の直接input/select生成）で使用 - 削除禁止
         */
        isLightweightMode() {
            return !this.isEditMode && this.isInitialLoad;
        }
        
        async _applyEditModeToTableAsync() {
            const tbody = document.querySelector('#my-tbody');
            if (tbody) {
                tbody.classList.remove('view-mode-active');
            }
            document.body.classList.remove('view-mode-active');
            document.body.classList.add('edit-mode-active');
            
            // テーブルを再描画せず、既存のテーブルに編集機能を適用
            await this._enableEditModeOnExistingTable();
        }

        async _enableEditModeOnExistingTable() {
            const tbody = document.querySelector('#my-tbody');
            if (!tbody) return;
            
            const rows = tbody.querySelectorAll('tr[data-row-id]');
            
            // 既存の行に編集機能を有効化
            rows.forEach(row => {
                this._enableRowInteraction(row);
            });
            
            // 編集モード機能を初期化
            await this._initializeEditModeFeatures();
        }

        async _redrawTableForEditMode() {
            // 編集モード切り替え時はテーブルを再描画しない
            // 既存のテーブルに編集機能を適用するのみ
            await this._enableEditModeOnExistingTable();
        }
        
        async _initializeEditModeFeatures() {
            // 🆕 ページング情報を保持
            let currentPage = 1;
            let paginationInfo = null;
            
            if (window.paginationUIManager) {
                // 現在のページング状態を保存
                currentPage = window.paginationUIManager.getCurrentPage();
                paginationInfo = window.paginationUIManager.paginationManager.getPaginationInfo();
            }
            
            if (window.paginationUIManager && window.paginationUIManager._initializePageFeatures) {
                await window.paginationUIManager._initializePageFeatures();
                
                // 🆕 ページング情報を復元
                if (paginationInfo && paginationInfo.totalPages > 1) {
                    // 現在のページに戻す
                    window.paginationUIManager.paginationManager.goToPage(currentPage);
                    // ページングUIを更新
                    window.paginationUIManager.updatePaginationUI();
                }
            } else {
                if (window.autoFilterManager) {
                    window.autoFilterManager.initialize();
                }
                
                // セル交換機能に編集モード変更を通知
                if (window.LedgerV2?.TableInteract?.cellSwapManager?.initializeDragDrop) {
                    window.LedgerV2.TableInteract.cellSwapManager.initializeDragDrop();
                }
            }
        }
        
        // 🆕 閲覧モード状態を全体に適用（非同期バッチ処理版）
        async _applyViewModeToTableAsync() {
            // 🆕 ページング情報を保持
            let currentPage = 1;
            let paginationInfo = null;
            
            if (window.paginationUIManager) {
                // 現在のページング状態を保存
                currentPage = window.paginationUIManager.getCurrentPage();
                paginationInfo = window.paginationUIManager.paginationManager.getPaginationInfo();
            }
            
            // tbody要素に閲覧モードクラスを設定
            document.body.classList.remove('edit-mode-active');
            
            const tbody = document.querySelector('#my-tbody');
            if (!tbody) return;
            
            const rows = tbody.querySelectorAll('tr[data-row-id]');
            const totalRows = rows.length;
            
            // 大量行をバッチ処理（100行ずつ処理）
            const batchSize = 100;
            
            for (let i = 0; i < rows.length; i += batchSize) {
                const batch = Array.from(rows).slice(i, i + batchSize);
                
                // バッチ処理
                batch.forEach(row => {
                    this._disableRowInteraction(row);
                });
                
                // UIの応答性を保つため次のフレームまで待機
                await new Promise(resolve => requestAnimationFrame(resolve));
            }
            
            // 🆕 ページング情報を復元
            if (window.paginationUIManager && paginationInfo && paginationInfo.totalPages > 1) {
                // 現在のページに戻す
                window.paginationUIManager.paginationManager.goToPage(currentPage);
                // ページングUIを更新
                window.paginationUIManager.updatePaginationUI();
            }
        }
        
        // 🆕 閲覧モード状態を全体に適用
        _applyViewModeToTable() {
            // 🆕 ページング情報を保持
            let currentPage = 1;
            let paginationInfo = null;
            
            if (window.paginationUIManager) {
                // 現在のページング状態を保存
                currentPage = window.paginationUIManager.getCurrentPage();
                paginationInfo = window.paginationUIManager.paginationManager.getPaginationInfo();
            }
            
            // tbody要素に閲覧モードクラスを設定
            document.body.classList.remove('edit-mode-active');
            
            const tbody = document.querySelector('#my-tbody');
            if (!tbody) return;
            
            tbody.classList.add('view-mode-active');
            
            const rows = tbody.querySelectorAll('tr[data-row-id]');
            rows.forEach(row => {
                this._disableRowInteraction(row);
            });
            
            // 🆕 ページング情報を復元
            if (window.paginationUIManager && paginationInfo && paginationInfo.totalPages > 1) {
                // 現在のページに戻す
                window.paginationUIManager.paginationManager.goToPage(currentPage);
                // ページングUIを更新
                window.paginationUIManager.updatePaginationUI();
            }
        }
        

        // 🆕 行レベルの編集機能を有効化
        _enableRowInteraction(row) {
            const cells = row.querySelectorAll('td[data-field-code]');
            
            cells.forEach(cell => {
                // 1. 分離ボタンを有効化
                this._enableSeparateButton(cell);
                
                // 2. ドラッグ&ドロップ属性を有効化
                this._enableDragDrop(cell);
                
                // 3. セルクリック・フォーカスを有効化
                this._enableCellInteraction(cell);
                
                // 4. チェックボックスを有効化
                this._enableModificationCheckbox(cell);
            });
        }
        
        // 🆕 行レベルの編集機能を無効化
        _disableRowInteraction(row) {
            const cells = row.querySelectorAll('td[data-field-code]');
            
            cells.forEach(cell => {
                // 1. 分離ボタンを無効化
                this._disableSeparateButton(cell);
                
                // 2. ドラッグ&ドロップ属性を無効化
                this._disableDragDrop(cell);
                
                // 3. セルクリック・フォーカスを無効化
                this._disableCellInteraction(cell);
                
                // 4. チェックボックスを無効化
                this._disableModificationCheckbox(cell);
            });
        }
        
        // 🆕 分離ボタン制御
        _enableSeparateButton(cell) {
            const separateBtn = cell.querySelector('.separate-btn');
            if (separateBtn) {
                separateBtn.disabled = false;
                separateBtn.style.opacity = '1';
                separateBtn.style.pointerEvents = 'auto';
            }
        }
        
        _disableSeparateButton(cell) {
            const separateBtn = cell.querySelector('.separate-btn');
            if (separateBtn) {
                separateBtn.disabled = true;
                /*separateBtn.style.opacity = '0.3'; */
                separateBtn.style.pointerEvents = 'none';
            }
        }
        
        // 🆕 ドラッグ&ドロップ制御
        _enableDragDrop(cell) {
            const fieldCode = cell.getAttribute('data-field-code');
            const field = window.fieldsConfig?.find(f => f.fieldCode === fieldCode);
            
            // 主キーフィールドまたはドラッグ許可フィールドの場合のみ有効化
            if (field && (field.isPrimaryKey || field.allowCellDragDrop)) {
                cell.setAttribute('draggable', 'true');
                cell.classList.add('draggable-cell');
                cell.style.cursor = 'grab';
            }
        }
        
        _disableDragDrop(cell) {
            cell.removeAttribute('draggable');
            cell.classList.remove('draggable-cell');
            cell.style.cursor = 'default';
        }
        
        // 🆕 セルインタラクション制御
        _enableCellInteraction(cell) {
            // フォーカス可能にする
            cell.style.pointerEvents = 'auto';
            
            // tabindex設定（キーボードナビゲーション対応）
            const fieldCode = cell.getAttribute('data-field-code');
            const field = window.fieldsConfig?.find(f => f.fieldCode === fieldCode);
            
            // ポインターカーソルは編集可能またはドラッグ可能な場合のみ
            const isEditable = field && this._isEditableField(field);
            const isDraggable = cell.getAttribute('data-is-primary-key') === 'true';
            
            if (isEditable) {
                cell.style.cursor = 'text';
                cell.setAttribute('tabindex', '0');
            } else if (isDraggable) {
                cell.style.cursor = 'grab';
            } else {
                cell.style.cursor = 'default';
            }
        }
        
        _disableCellInteraction(cell) {
            // フォーカス不可にする
            cell.style.pointerEvents = 'none';
            cell.style.cursor = 'default';
            cell.removeAttribute('tabindex');
        }
        
        // 🆕 チェックボックスを有効化
        _enableModificationCheckbox(cell) {
            const fieldCode = cell.getAttribute('data-field-code');
            if (fieldCode === '_modification_checkbox') {
                const checkbox = cell.querySelector('.modification-checkbox');
                if (checkbox) {
                    checkbox.disabled = false;
                }
            }
        }
        
        // 🆕 チェックボックスを無効化
        _disableModificationCheckbox(cell) {
            const fieldCode = cell.getAttribute('data-field-code');
            if (fieldCode === '_modification_checkbox') {
                const checkbox = cell.querySelector('.modification-checkbox');
                if (checkbox) {
                    checkbox.disabled = true;
                }
            }
        }
        
        // 🆕 編集可能フィールド判定
        _isEditableField(field) {
            if (!field) return false;
            
            // 静的フィールドは編集不可
            if (field.editableFrom === 'static') {
                return false;
            }
            
            // 編集可能なセルタイプかチェック
            const editableCellTypes = ['input', 'select', 'dropdown'];
            return editableCellTypes.includes(field.cellType);
        }
        
        // 🆕 デバッグ情報取得
        getDebugInfo() {
            return {
                isEditMode: this.isEditMode,
                isLightweightMode: this.isLightweightMode(),
                enabledRows: Array.from(this.enabledRows),
                isInitialLoad: this.isInitialLoad
            };
        }
        
        // 🆕 他モジュールへの編集モード変更通知
        _notifyEditModeChange(isEditMode) {
            // CellSwapManagerに通知（将来の拡張用）
            if (window.LedgerV2?.TableInteract?.cellSwapManager?.onEditModeChanged) {
                window.LedgerV2.TableInteract.cellSwapManager.onEditModeChanged(isEditMode);
            }
        }
        
        // 🆕 編集モード切り替えボタンを作成
        createEditModeToggleButton() {
            const button = document.createElement('button');
            button.textContent = this.isEditMode ? '閲覧モード' : '編集モード';
            button.id = 'edit-mode-toggle-btn';
            button.style.cssText = `
                margin-left: 10px;
                padding: 8px 16px;
                font-size: 14px;
                border: 1px solid #ccc;
                border-radius: 4px;
                background-color: ${this.isEditMode ? '#fff8e1' : '#f0f8ff'};
                border-color: ${this.isEditMode ? '#ff9800' : '#007acc'};
                color: ${this.isEditMode ? '#ff9800' : '#007acc'};
                cursor: pointer;
                transition: all 0.2s ease;
            `;
            
            button.addEventListener('click', async () => {
                // 連続クリック防止
                button.disabled = true;
                
                try {
                    await this._toggleEditMode();
                    this._updateToggleButtonAppearance(button);
                } catch (error) {
                    // エラーハンドリング
                } finally {
                    // 処理完了後にボタンを再有効化
                    button.disabled = false;
                }
            });
            
            // ホバー効果
            button.addEventListener('mouseenter', () => {
                button.style.opacity = '0.8';
            });
            
            button.addEventListener('mouseleave', () => {
                button.style.opacity = '1';
            });
            
            return button;
        }
        
        // 🆕 編集モード切り替え処理
        async _toggleEditMode() {
            if (this.isEditMode) {
                await this.disableEditMode();
            } else {
                await this.enableEditMode();
            }
        }
        
        // 🆕 トグルボタンの外観更新
        _updateToggleButtonAppearance(button) {
            button.textContent = this.isEditMode ? '閲覧モード' : '編集モード';
            button.style.backgroundColor = this.isEditMode ? '#fff8e1' : '#f0f8ff';
            button.style.borderColor = this.isEditMode ? '#ff9800' : '#007acc';
            button.style.color = this.isEditMode ? '#ff9800' : '#007acc';
        }
    }

    // =============================================================================
    // 🎨 スタイル管理
    // =============================================================================

    /**
     * 🚨 PROTECTED: ②パターン（ページング時の直接input/select生成）で使用 - 削除禁止
     */
    class StyleManager {
        static applyCellStyles(cell, width) {
            // 基本のtable-cellクラスを追加
            cell.classList.add('table-cell');
            
            // 📏 セル幅もconfig.jsのwidth値を直接参照（ヘッダーと統一）
            if (width) {
                cell.style.width = width;
            }
        }

        static applyInputStyles(input, width) {
            if (input.tagName.toLowerCase() === 'select') {
                input.classList.add('table-select');
            } else {
                input.classList.add('table-input');
            }
        }

        static highlightModifiedCell(cell) {
            // cell.style.backgroundColor = window.LedgerV2.Config.UI_SETTINGS.HIGHLIGHT_COLOR;
            cell.classList.add('cell-modified');
        }

        static highlightModifiedRow(row) {
            // row.style.backgroundColor = window.LedgerV2.Config.UI_SETTINGS.HIGHLIGHT_COLOR;
            row.classList.add('row-modified');
            
            // チェックボックスを自動的にONにする
            this._updateModificationCheckbox(row, true);
        }

        static removeHighlight(element) {
            if (!element) {
                return;
            }
            // element.style.backgroundColor = '';
            element.classList.remove('cell-modified', 'row-modified');
            
            // 行からrow-modifiedが削除された場合、チェックボックスをOFFにする
            if (element.tagName === 'TR' && !element.classList.contains('row-modified')) {
                this._updateModificationCheckbox(element, false);
            }
        }
        
        // 🆕 チェックボックス状態を更新
        static _updateModificationCheckbox(row, isChecked) {
            const checkboxCell = row.querySelector('td[data-field-code="_modification_checkbox"]');
            if (checkboxCell) {
                const checkbox = checkboxCell.querySelector('.modification-checkbox');
                if (checkbox) {
                    checkbox.checked = isChecked;
                }
            }
        }
    }

    // =============================================================================
    // 🏗️ DOM操作ヘルパー
    // =============================================================================

    class DOMHelper {
        static getTableBody() {
            return document.querySelector('#my-tbody');
        }

        // static getTableHeader() {
        //     return document.querySelector('#my-thead-row');
        // }

        static getHeaderRow() {
            return document.querySelector('#my-filter-row');
        }

        static findCellInRow(row, fieldCode) {
            return row.querySelector(`[data-field-code="${fieldCode}"]`);
        }

        static getFieldOrderFromHeader() {
            const headerRow = this.getHeaderRow();
            if (!headerRow) return [];
            
            // inputとselectの両方を取得
            const filterElements = headerRow.querySelectorAll('input[data-field-code], select[data-field-code]');
            const fieldOrder = Array.from(filterElements).map(element => element.getAttribute('data-field-code')).filter(Boolean);

            return fieldOrder;
        }

        static getAllRowsInTable() {
            const tbody = this.getTableBody();
            return tbody ? Array.from(tbody.querySelectorAll('tr[data-row-id]')) : [];
        }
    }

    // =============================================================================
    // 📝 セル値操作ヘルパー
    // =============================================================================

    class CellValueHelper {
        static getValue(cell, field = null) {
            if (!cell) return '';

            const input = cell.querySelector('input, select');
            if (input) {
                return input.value || '';
            }

            const link = cell.querySelector('a');
            if (link) {
                return link.textContent || '';
            }

            // 主キーセル（分離ボタン付き）の場合、値spanから取得
            const valueSpan = cell.querySelector('div > span');
            if (valueSpan) {
                return valueSpan.textContent || '';
            }

            return cell.textContent || '';
        }

        static setValue(cell, value, field = null) {
            if (!cell) return false;

            const input = cell.querySelector('input, select');
            if (input) {
                input.value = value;
                return true;
            }

            // 主キーセル（分離ボタン付き）の場合、値spanに設定
            const valueSpan = cell.querySelector('div > span');
            if (valueSpan) {
                valueSpan.textContent = value;
                return true;
            }

            cell.textContent = value;
            return true;
        }

        static isEditable(cell) {
            return cell.querySelector('input, select') !== null;
        }
    }

    // =============================================================================
    // 🎨 共通ハイライトヘルパー（重複コード統一）
    // =============================================================================

    /**
     * 🚨 PROTECTED: ②パターン（ページング時の直接input/select生成）で使用 - 削除禁止
     */
    class CommonHighlightHelper {
        /**
         * セルのハイライト状態を更新（data-original-value ベース）
         * @param {HTMLElement} cell - 対象セル
         * @param {string} newValue - 新しい値（オプション、指定しない場合は現在値を使用）
         */
        static updateCellHighlight(cell, newValue = null) {
            if (!cell) return false;

            // システム列（変更対象外）のフィールドコードをチェック
            const fieldCode = cell.getAttribute('data-field-code');
            const systemFields = ['_row_number', '_modification_checkbox', '_ledger_inconsistency', '_hide_button'];
            
            if (fieldCode && systemFields.includes(fieldCode)) {
                // システム列の場合はハイライトを削除して終了
                this._removeCellHighlight(cell);
                return false;
            }

            const originalValue = cell.getAttribute('data-original-value') || '';
            const currentValue = newValue !== null ? newValue : CellValueHelper.getValue(cell);
            
            const isModified = currentValue !== originalValue;
            
            if (isModified) {
                this._applyCellHighlight(cell);
            } else {
                this._removeCellHighlight(cell);
            }
            
            return isModified;
        }

        /**
         * 行のハイライト状態を更新（行内の変更セル数に基づく）
         * @param {HTMLElement} row - 対象行
         */
        static updateRowHighlight(row) {
            if (!row) return;

            // 行内で変更されているセル（cell-modifiedクラス付き）をカウント
            const modifiedCellsInRow = row.querySelectorAll('.cell-modified');
            
            if (modifiedCellsInRow.length > 0) {
                this._applyRowHighlight(row);
            } else {
                this._removeRowHighlight(row);
            }
        }

        /**
         * セルとその行のハイライトを同時に更新
         * @param {HTMLElement} cell - 対象セル
         * @param {string} newValue - 新しい値（オプション）
         */
        static updateCellAndRowHighlight(cell, newValue = null) {
            if (!cell) return;

            const isModified = this.updateCellHighlight(cell, newValue);
            const row = cell.closest('tr');
            if (row) {
                this.updateRowHighlight(row);
            }
            
            return isModified;
        }

        /**
         * CellStateManagerが利用可能な場合はそちらを使用、フォールバックで簡易ハイライト
         * @param {HTMLElement} cell - 対象セル
         * @param {string} fieldCode - フィールドコード
         */
        static updateCellHighlightSmart(cell, fieldCode = null) {
            if (!cell) return;

            const row = cell.closest('tr');
            const actualFieldCode = fieldCode || cell.getAttribute('data-field-code');
            
            // CellStateManagerが利用可能で行番号がある場合
            if (window.cellStateManager && row && actualFieldCode) {
                const rowId = row.getAttribute('data-row-id');
                if (rowId) {
                    try {
                        window.cellStateManager.updateHighlightState(row, actualFieldCode);
                        return;
                    } catch (error) {
                        // フォールバック処理へ
                    }
                }
            }

            // フォールバック: data-original-value ベースの簡易ハイライト
            this.updateCellAndRowHighlight(cell);
        }

        /**
         * 複数セルのハイライトを一括更新
         * @param {HTMLElement[]} cells - 対象セルの配列
         */
        static updateMultipleCellsHighlight(cells) {
            if (!cells || !Array.isArray(cells)) return;

            const affectedRows = new Set();
            
            cells.forEach(cell => {
                this.updateCellHighlight(cell);
                const row = cell.closest('tr');
                if (row) {
                    affectedRows.add(row);
                }
            });

            // 影響を受けた行のハイライトを更新
            affectedRows.forEach(row => {
                this.updateRowHighlight(row);
            });
        }

        // =============================================================================
        // 内部メソッド
        // =============================================================================

        /**
         * セルハイライトを適用（v2統一システム）
         */
        static _applyCellHighlight(cell) {
            window.StyleManager.highlightModifiedCell(cell);
        }

        /**
         * セルハイライトを削除（v2統一システム）
         */
        static _removeCellHighlight(cell) {
            window.StyleManager.removeHighlight(cell);
        }

        /**
         * 行ハイライトを適用（v2統一システム）
         */
        static _applyRowHighlight(row) {
            window.StyleManager.highlightModifiedRow(row);
        }

        /**
         * 行ハイライトを削除（v2統一システム）
         */
        static _removeRowHighlight(row) {
            window.StyleManager.removeHighlight(row);
        }
    }

    // =============================================================================
    // 🔑 統合キー管理
    // =============================================================================

    class IntegrationKeyHelper {
        static generateFromRow(row) {
            const primaryKeys = [];
            
            // fieldsConfigから各アプリの主キーを収集
            const apps = FieldValueProcessor.getAllSourceApps();
            apps.forEach(app => {
                const fieldCode = FieldValueProcessor.getPrimaryKeyFieldByApp(app);
                if (fieldCode) {
                    const cell = DOMHelper.findCellInRow(row, fieldCode);
                    if (cell) {
                        const value = CellValueHelper.getValue(cell);
                        if (value && value.trim()) {
                            primaryKeys.push(`${app}:${value}`);
                        }
                    }
                }
            });

            return primaryKeys.length > 0 ? primaryKeys.join('|') : null;
        }

        static getPrimaryFieldForApp(appType) {
            return FieldValueProcessor.getPrimaryKeyFieldByApp(appType);
        }

        static extractAppAndValueFromKey(integrationKey) {
            const parts = integrationKey.split('|');
            const result = {};
            
            parts.forEach(part => {
                const [app, value] = part.split(':');
                if (app && value) {
                    result[app] = value;
                }
            });
            
            return result;
        }
    }

    // =============================================================================
    // 💼 ローディング管理
    // =============================================================================

    class LoadingManager {
        static show(message = 'データを読み込み中...') {
            let loader = document.getElementById('loading-overlay');
            if (!loader) {
                loader = document.createElement('div');
                loader.id = 'loading-overlay';
                loader.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background-color: rgba(0, 0, 0, 0.6);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    z-index: 99999;
                    color: white;
                    font-size: 18px;
                    font-weight: bold;
                    text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
                    pointer-events: auto;
                `;
                document.body.appendChild(loader);
            }
            loader.textContent = message;
            loader.style.display = 'flex';
        }

        static hide() {
            const loader = document.getElementById('loading-overlay');
            if (loader) {
                loader.style.display = 'none';
            }
        }

        static updateMessage(message) {
            const loader = document.getElementById('loading-overlay');
            if (loader) {
                loader.textContent = message;
            }
        }
    }

    // =============================================================================
    // 🎯 フィールド値処理
    // =============================================================================

    /**
     * 🚨 PROTECTED: ②パターン（ページング時の直接input/select生成）で使用 - 削除禁止
     */
    class FieldValueProcessor {
        static process(record, fieldCode, defaultValue = '') {
            if (!record || !fieldCode) return defaultValue;

            // レコードIDフィールドの処理
            if (fieldCode.endsWith('_record_id')) {
                const appType = this.getSourceAppFromRecordId(fieldCode);
                if (appType && record.recordIds && record.recordIds[appType]) {
                    return record.recordIds[appType];
                }
                return defaultValue;
            }

            // 統合レコードの場合
            if (record.ledgerData) {
                for (const appType of Object.keys(record.ledgerData)) {
                    const appData = record.ledgerData[appType];
                    if (appData && appData[fieldCode] && appData[fieldCode].value !== undefined) {
                        return appData[fieldCode].value;
                    }
                }
            }

            // 🔧 統合キーから主キーフィールドの値を抽出（レコードIDが空の場合の対応）
            if (record.integrationKey) {
                const field = window.fieldsConfig?.find(f => f.fieldCode === fieldCode);
                if (field && field.isPrimaryKey && field.sourceApp) {
                    const keyParts = record.integrationKey.split('|');
                    for (const part of keyParts) {
                        const [appType, value] = part.split(':');
                        if (appType === field.sourceApp && value) {
                            return value;
                        }
                    }
                }
            }

            // 直接値の場合
            if (record[fieldCode] !== undefined) {
                return record[fieldCode];
            }

            return defaultValue;
        }

        static getSourceApp(fieldCode) {
            const field = window.fieldsConfig.find(f => f.fieldCode === fieldCode);
            return field ? field.sourceApp : null;
        }

        /**
         * 全ての主キーフィールドコードを取得
         */
        static getAllPrimaryKeyFields() {
            if (!window.fieldsConfig) return [];
            return window.fieldsConfig
                .filter(field => field.isPrimaryKey)
                .map(field => field.fieldCode);
        }

        /**
         * アプリタイプから主キーフィールドコードを取得
         */
        static getPrimaryKeyFieldByApp(sourceApp) {
            if (!window.fieldsConfig) return null;
            const field = window.fieldsConfig.find(f => f.sourceApp === sourceApp && f.isPrimaryKey);
            return field ? field.fieldCode : null;
        }

        /**
         * 全てのアプリタイプを取得
         */
        static getAllSourceApps() {
            if (!window.fieldsConfig) return [];
            const sourceApps = new Set();
            window.fieldsConfig.forEach(field => {
                if (field.sourceApp && field.sourceApp !== 'system') {
                    sourceApps.add(field.sourceApp);
                }
            });
            return Array.from(sourceApps);
        }

        /**
         * アプリタイプと主キーフィールドのマッピングを取得
         */
        static getAppToPrimaryKeyMapping() {
            if (!window.fieldsConfig) return {};
            const mapping = {};
            window.fieldsConfig
                .filter(field => field.isPrimaryKey && field.sourceApp)
                .forEach(field => {
                    mapping[field.sourceApp] = field.fieldCode;
                });
            return mapping;
        }

        /**
         * レコードIDフィールドからアプリタイプを取得
         */
        static getSourceAppFromRecordId(recordIdField) {
            if (!window.fieldsConfig) return null;
            const field = window.fieldsConfig.find(f => f.fieldCode === recordIdField && f.isRecordId);
            return field ? field.sourceApp : null;
        }

        /**
         * レコードIDフィールドとアプリタイプのマッピングを取得
         */
        static getRecordIdToAppMapping() {
            if (!window.fieldsConfig) return {};
            const mapping = {};
            window.fieldsConfig
                .filter(field => field.isRecordId && field.sourceApp)
                .forEach(field => {
                    mapping[field.fieldCode] = field.sourceApp;
                });
            return mapping;
        }

        /**
         * アプリタイプから台帳名を取得
         */
        static getLedgerNameByApp(sourceApp) {
            // fieldsConfigから台帳名を取得できれば理想的だが、現在はハードコーディングで対処
            // 将来的にはfieldConfigに台帳名を追加することも検討
            const categoryMapping = {
                'SEAT': '座席台帳',
                'PC': 'PC台帳',
                'EXT': '内線台帳',
                'USER': 'ユーザー台帳'
            };
            return categoryMapping[sourceApp] || sourceApp;
        }
    }

    // =============================================================================
    // 🌐 グローバル公開
    // =============================================================================

    // クラスをグローバルスコープに公開
    window.LedgerV2.Utils = {
        EditModeManager,
        StyleManager,
        DOMHelper,
        CellValueHelper,
        CommonHighlightHelper,
        IntegrationKeyHelper,
        LoadingManager,
        FieldValueProcessor
    };

    // レガシー互換性のため主要クラスを直接公開
    window.EditModeManager = EditModeManager;
    window.StyleManager = StyleManager;
    window.DOMHelper = DOMHelper;
    window.CellValueHelper = CellValueHelper;
    window.CommonHighlightHelper = CommonHighlightHelper;
    window.IntegrationKeyHelper = IntegrationKeyHelper;
    window.LoadingManager = LoadingManager;
    window.FieldValueProcessor = FieldValueProcessor;

    // v2環境用のグローバルインスタンス作成
    window.editModeManager = new EditModeManager();

   // 🆕 システム初期化時に閲覧モードを設定
    document.addEventListener('DOMContentLoaded', function() {
        // テーブルが作成された後にtbodyに閲覧モードクラスを追加
        const checkTbody = () => {
            const tbody = document.querySelector('#my-tbody');
            if (tbody) {
                tbody.classList.add('view-mode-active');
            } else {
                // テーブルがまだ作成されていない場合は少し待ってから再試行
                setTimeout(checkTbody, 100);
            }
        };
        checkTbody();
    });

})();
