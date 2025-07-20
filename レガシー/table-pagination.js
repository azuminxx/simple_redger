/**
 * 統合台帳システム v2 - ページネーション機能
 * @description ページネーション管理・UI機能
 * @version 2.0.0
 * 
 * 🎯 **ファイルの責任範囲**
 * ✅ 大量データのページ分割管理
 * ✅ ページネーションUI作成・更新
 * ✅ ページ移動機能（前/次/最初/最後）
 * ✅ フィルタ適用時のページネーション
 * ✅ ページ情報の計算・提供
 * 
 * ❌ **やってはいけないこと（責任範囲外）**
 * ❌ テーブル描画・表示（table-render.jsの責任）
 * ❌ ユーザーイベント処理（table-interact.jsの責任）
 * ❌ API通信・データ検索（core.jsの責任）
 * ❌ システム初期化（table-header.jsの責任）
 * 
 * 📦 **含まれるクラス**
 * - PaginationManager: ページネーション数値管理
 * - PaginationUIManager: ページネーションUI管理
 * 
 * 🔗 **依存関係**
 * - window.fieldsConfig (フィールド設定)
 * - TableDisplayManager (ページデータ表示)
 * 
 * 💡 **使用例**
 * ```javascript
 * const paginationManager = new PaginationManager();
 * paginationManager.setAllData(records);
 * const pageData = paginationManager.getCurrentPageData();
 * ```
 */
(function() {
    'use strict';

    // グローバル名前空間確保
    window.LedgerV2 = window.LedgerV2 || {};
    window.LedgerV2.Pagination = {};

    // =============================================================================
    // ページネーション管理
    // =============================================================================

    class PaginationManager {
        constructor() {
            this.allData = [];           // 全レコードデータ
            this.filteredData = [];      // フィルタ後のデータ
            this.currentPage = 1;        // 現在のページ番号
            this.pageSize = 100;         // 1ページあたりの表示件数
            this.totalPages = 0;         // 総ページ数
            this.currentFilter = null;   // 現在のフィルタ条件
            this.isFiltered = false;     // フィルタ適用中フラグ
        }

        /**
         * 🗂️ 全データを設定（初期読み込み・検索結果）
         */
        setAllData(records) {
            this.allData = records || [];
            this.filteredData = [...this.allData];
            this.isFiltered = false;
            this.currentFilter = null;
            this._recalculatePagination();
            this._resetToFirstPage();
        }

        /**
         * 🔍 フィルタ適用（全データに対して）
         */
        applyFilter(filterConditions) {
            if (!filterConditions || Object.keys(filterConditions).length === 0) {
                // フィルタクリア
                this.filteredData = [...this.allData];
                this.isFiltered = false;
                this.currentFilter = null;
            } else {
                // フィルタ適用（全データに対して）
                this.filteredData = this._filterRecords(this.allData, filterConditions);
                this.isFiltered = true;
                this.currentFilter = filterConditions;
            }

            this._recalculatePagination();
            this._resetToFirstPage();
        }

        /**
         * 📋 現在ページのデータを取得
         */
        getCurrentPageData() {
            const startIndex = (this.currentPage - 1) * this.pageSize;
            const endIndex = startIndex + this.pageSize;
            const pageData = this.filteredData.slice(startIndex, endIndex);
            return pageData;
        }

        /**
         * 📄 ページ移動
         */
        goToPage(pageNumber) {
            if (pageNumber < 1 || pageNumber > this.totalPages) {
                return false;
            }

            this.currentPage = pageNumber;
            return true;
        }

        /**
         * ⬅️ 前のページ
         */
        goToPreviousPage() {
            return this.goToPage(this.currentPage - 1);
        }

        /**
         * ➡️ 次のページ
         */
        goToNextPage() {
            return this.goToPage(this.currentPage + 1);
        }

        /**
         * ⏮️ 最初のページ
         */
        goToFirstPage() {
            return this.goToPage(1);
        }

        /**
         * ⏭️ 最後のページ
         */
        goToLastPage() {
            return this.goToPage(this.totalPages);
        }

        /**
         * 📊 ページネーション情報を取得
         */
        getPaginationInfo() {
            const startRecord = this.totalPages > 0 ? (this.currentPage - 1) * this.pageSize + 1 : 0;
            const endRecord = Math.min(this.currentPage * this.pageSize, this.filteredData.length);

            return {
                currentPage: this.currentPage,
                totalPages: this.totalPages,
                pageSize: this.pageSize,
                totalRecords: this.filteredData.length,
                allRecords: this.allData.length,
                startRecord,
                endRecord,
                isFirstPage: this.currentPage === 1,
                isLastPage: this.currentPage === this.totalPages,
                isFiltered: this.isFiltered,
                filterConditions: this.currentFilter
            };
        }

        /**
         * 🔄 ページネーション再計算
         */
        _recalculatePagination() {
            this.totalPages = Math.ceil(this.filteredData.length / this.pageSize);
            if (this.totalPages === 0) this.totalPages = 1;
        }

        /**
         * 🏠 最初のページにリセット
         */
        _resetToFirstPage() {
            this.currentPage = 1;
        }

        /**
         * 🔍 レコードフィルタリング実行
         */
        _filterRecords(records, filterConditions) {
            return records.filter(record => {
                return Object.entries(filterConditions).every(([fieldCode, filterValue]) => {
                    const field = window.fieldsConfig.find(f => f.fieldCode === fieldCode);
                    const recordValue = record[fieldCode] || '';
                    
                    if (!field || !filterValue) return true;

                    // フィールドタイプに応じたフィルタリング
                    switch (field.searchOperator) {
                        case 'like':
                            return recordValue.toString().toLowerCase().includes(filterValue.toLowerCase());
                        case '=':
                        case 'in':
                            return recordValue.toString() === filterValue.toString();
                        default:
                            return recordValue.toString().toLowerCase().includes(filterValue.toLowerCase());
                    }
                });
            });
        }
    }

    // =============================================================================
    // ページネーションUI管理
    // =============================================================================
    
    class PaginationUIManager {
        constructor(paginationManager) {
            this.paginationManager = paginationManager;
            this.container = null;
        }

        /**
         * 🎨 ページネーションUIを作成
         */
        createPaginationUI() {
            // 既存のUIを削除
            this._removePaginationUI();

            // データが少ない場合はUIを表示しない
            const info = this.paginationManager.getPaginationInfo();
            if (info.totalRecords <= this.paginationManager.pageSize) {
                return;
            }

            const table = document.querySelector('#my-table');
            if (!table || !table.parentNode) {
                console.error('❌ テーブルが見つかりません');
                return;
            }

            // 上部ページネーション作成
            this.topContainer = this._createPaginationContainer('top-pagination-container', 'ページネーション（上部）');
            table.parentNode.insertBefore(this.topContainer, table);

            // 下部ページネーション作成
            this.bottomContainer = this._createPaginationContainer('bottom-pagination-container', 'ページネーション（下部）');
            table.parentNode.insertBefore(this.bottomContainer, table.nextSibling);
        }

        /**
         * 🎨 個別ページネーションコンテナを作成
         */
        _createPaginationContainer(containerId, label) {
            const container = document.createElement('div');
            container.id = containerId;
            container.className = 'pagination-container';

            // ページネーション情報とコントロールを作成
            this._createPaginationInfo(container);
            this._createPaginationControls(container);

            return container;
        }

        /**
         * 🔄 ページネーションUIを更新
         */
        updatePaginationUI() {
            // データが少ない場合はUIを削除
            const info = this.paginationManager.getPaginationInfo();
            if (info.totalRecords <= this.paginationManager.pageSize) {
                this._removePaginationUI();
                return;
            }

            if (!this.topContainer || !this.bottomContainer) {
                this.createPaginationUI();
                return;
            }

            // 上部・下部両方の情報とコントロールを更新
            this._updatePaginationInfo();
            this._updatePaginationControls();
        }

        /**
         * 📊 ページネーション情報表示
         */
        _createPaginationInfo(container) {
            const info = this.paginationManager.getPaginationInfo();
            
            const infoDiv = document.createElement('div');
            infoDiv.className = 'pagination-info';

            // filterConditionsが存在し、オブジェクトであることを確認
            let filterStatusHtml = '';
            if (info.isFiltered && info.filterConditions && typeof info.filterConditions === 'object') {
                const filterEntries = Object.entries(info.filterConditions);
                if (filterEntries.length > 0) {
                    filterStatusHtml = `
                        <div class="filter-status">
                            🔍 フィルタ適用中: ${filterEntries.map(([k,v]) => `${k}="${v}"`).join(', ')}
                        </div>
                    `;
                }
            }

            infoDiv.innerHTML = `
                <div class="pagination-summary">
                    <span class="record-range">${info.startRecord}〜${info.endRecord}件</span>
                    <span class="record-total">（全${info.totalRecords}件${info.isFiltered ? `・元データ${info.allRecords}件` : ''}）</span>
                    <span class="page-info">ページ ${info.currentPage}/${info.totalPages}</span>
                </div>
                ${filterStatusHtml}
            `;

            container.appendChild(infoDiv);
        }

        /**
         * 🎛️ ページネーションコントロール作成
         */
        _createPaginationControls(container) {
            const controlsDiv = document.createElement('div');
            controlsDiv.className = 'pagination-controls';

            const info = this.paginationManager.getPaginationInfo();

            controlsDiv.innerHTML = `
                <div class="pagination-buttons">
                    <button class="pagination-btn first-page-btn" ${info.isFirstPage ? 'disabled' : ''}>
                        ⏮️ 最初
                    </button>
                    <button class="pagination-btn prev-page-btn" ${info.isFirstPage ? 'disabled' : ''}>
                        ⬅️ 前
                    </button>
                    
                    <div class="page-numbers">
                        ${this._generatePageButtons()}
                    </div>
                    
                    <button class="pagination-btn next-page-btn" ${info.isLastPage ? 'disabled' : ''}>
                        次 ➡️
                    </button>
                    <button class="pagination-btn last-page-btn" ${info.isLastPage ? 'disabled' : ''}>
                        最後 ⏭️
                    </button>
                </div>
                
                <div class="page-jump">
                    <input type="number" class="page-jump-input" min="1" max="${info.totalPages}" 
                           value="${info.currentPage}" placeholder="ページ番号">
                    <button class="pagination-btn page-jump-btn">移動</button>
                </div>
            `;

            // イベントリスナー追加
            this._attachPaginationEvents(controlsDiv);
            
            container.appendChild(controlsDiv);
        }

        /**
         * 🔢 ページ番号ボタン生成
         */
        _generatePageButtons() {
            const info = this.paginationManager.getPaginationInfo();
            const maxButtons = 10;
            const currentPage = info.currentPage;
            const totalPages = info.totalPages;

            let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
            let endPage = Math.min(totalPages, startPage + maxButtons - 1);

            if (endPage - startPage < maxButtons - 1) {
                startPage = Math.max(1, endPage - maxButtons + 1);
            }

            let buttons = '';
            
            for (let i = startPage; i <= endPage; i++) {
                const isActive = i === currentPage;
                buttons += `
                    <button class="page-number-btn ${isActive ? 'active' : ''}" 
                            data-page="${i}" ${isActive ? 'disabled' : ''}>
                        ${i}
                    </button>
                `;
            }

            return buttons;
        }

        /**
         * 🎯 イベントリスナー設定
         */
        _attachPaginationEvents(controlsDiv) {
            // ナビゲーションボタン
            controlsDiv.querySelector('.first-page-btn').onclick = async () => await this._navigateToPage(() => this.paginationManager.goToFirstPage());
            controlsDiv.querySelector('.prev-page-btn').onclick = async () => await this._navigateToPage(() => this.paginationManager.goToPreviousPage());
            controlsDiv.querySelector('.next-page-btn').onclick = async () => await this._navigateToPage(() => this.paginationManager.goToNextPage());
            controlsDiv.querySelector('.last-page-btn').onclick = async () => await this._navigateToPage(() => this.paginationManager.goToLastPage());

            // ページ番号ボタン
            controlsDiv.querySelectorAll('.page-number-btn').forEach(btn => {
                btn.onclick = async () => {
                    const pageNum = parseInt(btn.dataset.page);
                    await this._navigateToPage(() => this.paginationManager.goToPage(pageNum));
                };
            });

            // ページジャンプ
            const jumpBtn = controlsDiv.querySelector('.page-jump-btn');
            const jumpInput = controlsDiv.querySelector('.page-jump-input');
            
            jumpBtn.onclick = async () => {
                const pageNum = parseInt(jumpInput.value);
                await this._navigateToPage(() => this.paginationManager.goToPage(pageNum));
            };

            jumpInput.onkeypress = async (e) => {
                if (e.key === 'Enter') {
                    await jumpBtn.click();
                }
            };
        }

        /**
         * 🚀 ページ移動実行
         */
        async _navigateToPage(navigationFunction) {
            try {
                // 🆕 編集モード中のページ切り替え警告チェック（ページ切り替え前に実行）
                if (await this._shouldWarnAboutEditData()) {
                    const shouldProceed = await this._showEditDataWarning();
                    if (!shouldProceed) {
                        // ユーザーがキャンセルした場合は移動しない
                        return;
                    }
                }

                // 🆕 警告チェック後にボタンを無効化（連続クリック防止）
                this._disablePaginationButtons();

                // ページ移動実行
                if (navigationFunction()) {
                    // ページ移動成功 -> データ表示更新
                    this._displayCurrentPage();
                    
                    // UIを再作成して確実に表示を維持
                    setTimeout(() => {
                        this.createPaginationUI();
                    }, 50);
                }
            } finally {
                // 🆕 処理完了後にボタンを再有効化
                setTimeout(() => {
                    this._enablePaginationButtons();
                }, 100);
            }
        }

        /**
         * 🔒 ページネーションボタンを無効化
         */
        _disablePaginationButtons() {
            const buttons = document.querySelectorAll('.pagination-btn, .page-number-btn');
            buttons.forEach(btn => {
                btn.disabled = true;
                
                // アクティブなページボタンは見た目を維持
                if (btn.classList.contains('page-number-btn') && btn.classList.contains('active')) {
                    btn.style.opacity = '1';
                    btn.style.cursor = 'default';
                } else {
                    btn.style.opacity = '0.6';
                    btn.style.cursor = 'not-allowed';
                }
            });
        }

        /**
         * 🔓 ページネーションボタンを有効化
         */
        _enablePaginationButtons() {
            const buttons = document.querySelectorAll('.pagination-btn, .page-number-btn');
            buttons.forEach(btn => {
                btn.disabled = false;
                
                // アクティブなページボタンは無効化状態を維持
                if (btn.classList.contains('page-number-btn') && btn.classList.contains('active')) {
                    btn.disabled = true;
                    btn.style.opacity = '1';
                    btn.style.cursor = 'default';
                } else {
                    btn.style.opacity = '1';
                    btn.style.cursor = 'pointer';
                }
            });
        }

        /**
         * 🚨 編集データ警告が必要かチェック
         */
        async _shouldWarnAboutEditData() {
            // 編集モードでない場合は警告不要
            if (!window.editModeManager || !window.editModeManager.isEditMode) {
                return false;
            }
            
            // 現在のページに編集データがあるかチェック
            const hasEditData = this._hasEditDataOnCurrentPage();
            
            return hasEditData;
        }

        /**
         * 📝 現在のページに編集データがあるかチェック
         */
        _hasEditDataOnCurrentPage() {
            const tbody = document.getElementById('my-tbody');
            if (!tbody) {
                return false;
            }

            // チェックされた修正チェックボックスがあるかチェック
            const checkedBoxes = tbody.querySelectorAll('.modification-checkbox:checked');
            return checkedBoxes.length > 0;
        }



        /**
         * ⚠️ 編集データ警告ダイアログを表示
         */
        async _showEditDataWarning() {
            // 現在のページ番号を保存（キャンセル時の復元用）
            const currentPage = this.paginationManager.currentPage;
            
            return new Promise((resolve) => {
                // モーダルダイアログを作成
                const modal = document.createElement('div');
                modal.className = 'edit-data-warning-modal';
                modal.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background-color: rgba(0, 0, 0, 0.5);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    z-index: 10000;
                `;

                const dialog = document.createElement('div');
                dialog.className = 'edit-data-warning-dialog';
                dialog.style.cssText = `
                    background: white;
                    border-radius: 8px;
                    padding: 24px;
                    max-width: 500px;
                    width: 90%;
                    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
                    text-align: center;
                `;

                dialog.innerHTML = `
                    <div style="margin-bottom: 20px;">
                        <div style="font-size: 48px; color: #ff9800; margin-bottom: 16px;">⚠️</div>
                        <h3 style="margin: 0 0 12px 0; color: #333; font-size: 18px;">編集データの警告</h3>
                        <p style="margin: 0; color: #666; line-height: 1.5;">
                            現在のページで編集中のデータがあります。<br>
                            ページを切り替えると、編集した内容が消えてしまいますがよろしいですか？
                        </p>
                    </div>
                    <div style="display: flex; gap: 12px; justify-content: center;">
                        <button class="cancel-btn" style="
                            padding: 10px 20px;
                            border: 1px solid #ccc;
                            background: white;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 14px;
                        ">キャンセル</button>
                        <button class="proceed-btn" style="
                            padding: 10px 20px;
                            border: 1px solid #ff9800;
                            background: #ff9800;
                            color: white;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 14px;
                        ">続行する</button>
                    </div>
                `;

                modal.appendChild(dialog);
                document.body.appendChild(modal);

                // ボタンイベント設定
                const cancelBtn = dialog.querySelector('.cancel-btn');
                const proceedBtn = dialog.querySelector('.proceed-btn');

                const cleanup = () => {
                    document.body.removeChild(modal);
                };

                // アクティブページ状態を復元する関数
                const restoreActivePageState = () => {
                    // 現在のページに対応するボタンを探してactiveクラスを設定
                    const pageButtons = document.querySelectorAll('.page-number-btn');
                    pageButtons.forEach(btn => {
                        const pageNum = parseInt(btn.dataset.page);
                        if (pageNum === currentPage) {
                            btn.classList.add('active');
                            btn.disabled = true;
                            btn.style.opacity = '1';
                            btn.style.cursor = 'default';
                        } else {
                            btn.classList.remove('active');
                            btn.disabled = false;
                            btn.style.opacity = '1';
                            btn.style.cursor = 'pointer';
                        }
                    });
                };

                cancelBtn.onclick = () => {
                    cleanup();
                    // キャンセル時は現在のページ状態を復元
                    setTimeout(() => {
                        restoreActivePageState();
                    }, 10);
                    resolve(false); // キャンセル
                };

                proceedBtn.onclick = () => {
                    cleanup();
                    resolve(true); // 続行
                };

                // ESCキーでキャンセル
                const handleKeydown = (e) => {
                    if (e.key === 'Escape') {
                        cleanup();
                        document.removeEventListener('keydown', handleKeydown);
                        // ESCキー時も現在のページ状態を復元
                        setTimeout(() => {
                            restoreActivePageState();
                        }, 10);
                        resolve(false);
                    }
                };
                document.addEventListener('keydown', handleKeydown);

                // モーダル背景クリックでキャンセル
                modal.onclick = (e) => {
                    if (e.target === modal) {
                        cleanup();
                        // 背景クリック時も現在のページ状態を復元
                        setTimeout(() => {
                            restoreActivePageState();
                        }, 10);
                        resolve(false);
                    }
                };
            });
        }

        /**
         * 📋 現在ページのデータを表示
         */
        _displayCurrentPage() {
            const pageData = this.paginationManager.getCurrentPageData();
            
            // 既存のTableDisplayManagerを使用してページデータのみを表示
            // 新しいインスタンスを作らずに、テーブル部分のみを更新
            this._updateTableWithPageData(pageData);
        }

        /**
         * 📄 ページデータでテーブル本体のみを更新
         * 🚨 PROTECTED: ②パターン（ページング時の直接input/select生成）で使用 - 削除禁止
         */
        _updateTableWithPageData(pageData) {
            const tbody = document.getElementById('my-tbody');
            if (!tbody) {
                console.error('❌ テーブル本体が見つかりません');
                return;
            }

            // tbody をクリア
            tbody.innerHTML = '';

            // フィールド順序を取得（fieldsConfigから）
            const fieldOrder = window.fieldsConfig ? 
                window.fieldsConfig.map(field => field.fieldCode) : 
                [];

            // 現在ページのレコードを行として追加
            pageData.forEach((record, index) => {
                const row = this._createTableRowForPagination(record, fieldOrder, index);
                tbody.appendChild(row);
            });

            

            // 🔄 ページング後の追加初期化処理
            setTimeout(() => {
                this._initializePageFeatures();
            }, 100);
        }

        /**
         * 📋 ページング用のテーブル行を作成（TableDisplayManagerの処理を参考）
         * 🚨 PROTECTED: ②パターン（ページング時の直接input/select生成）で使用 - 削除禁止
         */
        _createTableRowForPagination(record, fieldOrder, rowIndex) {
            const row = document.createElement('tr');
            const integrationKey = record.integrationKey || '';
            
            // 実際の行番号を計算（ページング環境対応）
            const paginationInfo = this.paginationManager.getPaginationInfo();
            const actualRowNumber = paginationInfo.startRecord + rowIndex;
            
            // data-row-idには実際の行番号を設定
            row.setAttribute('data-row-id', actualRowNumber);
            row.setAttribute('data-integration-key', integrationKey);

            // データセル作成
            fieldOrder.forEach(fieldCode => {
                const cell = this._createDataCellForPagination(record, fieldCode, row, rowIndex);
                row.appendChild(cell);
            });

            // 主キーが紐づいていない台帳フィールドにスタイルを適用
            this._applyUnlinkedLedgerStyles(row, record);

            return row;
        }

        /**
         * 📋 ページング用のデータセルを作成
         */
        /**
         * 🚨 PROTECTED: ②パターン（ページング時の直接input/select生成）のコア処理 - 削除禁止
         */
        _createDataCellForPagination(record, fieldCode, row, rowIndex) {
            // 必ずTableDisplayManagerの処理を使用（一貫性を保つため）
            if (!window.tableDisplayManager || !window.tableDisplayManager._createDataCell) {
                console.error('❌ TableDisplayManagerが利用できません');
                throw new Error('TableDisplayManagerが初期化されていません');
            }

            return window.tableDisplayManager._createDataCell(record, fieldCode, row, rowIndex);
        }

        /**
         * 📋 主キーが紐づいていない台帳フィールドのスタイル適用
         * 🚨 PROTECTED: ②パターン（ページング時の直接input/select生成）で使用 - 削除禁止
         */
        _applyUnlinkedLedgerStyles(row, record) {
            // TableDisplayManagerの処理を利用
            if (window.tableDisplayManager && window.tableDisplayManager._applyUnlinkedLedgerStyles) {
                window.tableDisplayManager._applyUnlinkedLedgerStyles(row, record);
            }
        }

        /**
         * 🔄 ページング後の機能初期化（通常時と同じ処理を実行）
         */
        _initializePageFeatures() {
            try {
                // 1. オートフィルタ機能を再初期化
                if (window.autoFilterManager) {
                    window.autoFilterManager.initialize();
                }

                // 2. セル交換機能の再初期化（重要！）
                if (window.LedgerV2?.TableInteract?.cellSwapManager?.initializeDragDrop) {
                    window.LedgerV2.TableInteract.cellSwapManager.initializeDragDrop();
                }

                // 3. 編集モード対応：現在の編集状態に応じてUIを調整
                this._applyCurrentEditModeToPage();

                // 4. チェックボックスの状態を正しく設定
                this._reinitializeCheckboxes();



            } catch (error) {
                console.error('❌ ページング後の機能初期化エラー:', error);
            }
        }

        /**
         * 🔄 現在の編集モードをページに適用
         * 🚨 PROTECTED: ②パターン（ページング時の直接input/select生成）で使用 - 削除禁止
         */
        _applyCurrentEditModeToPage() {
            if (!window.editModeManager) return;

            const tbody = document.getElementById('my-tbody');
            if (!tbody) return;

            const rows = Array.from(tbody.querySelectorAll('tr'));
            
            if (window.editModeManager.isEditMode) {
                // 編集モード：各行の編集機能を有効化
                rows.forEach(row => {
                    this._enableRowEditingFeatures(row);
                });
            } else {
                // 閲覧モード：各行の編集機能を無効化
                rows.forEach(row => {
                    this._disableRowEditingFeatures(row);
                });
            }
        }

        /**
         * 🔄 行の編集機能を有効化
         */
        _enableRowEditingFeatures(row) {
            // チェックボックスの有効化
            const checkbox = row.querySelector('.modification-checkbox');
            if (checkbox) {
                checkbox.disabled = false;
            }

            // 主キーセルのドラッグ&ドロップ機能を有効化
            const primaryKeyCells = row.querySelectorAll('td[data-is-primary-key="true"]');
            primaryKeyCells.forEach(cell => {
                cell.draggable = true;
                cell.style.cursor = 'grab';
            });

            // 分離ボタンの有効化
            const separateButtons = row.querySelectorAll('.separate-button');
            separateButtons.forEach(button => {
                button.disabled = false;
            });
        }

        /**
         * 🔄 行の編集機能を無効化
         */
        _disableRowEditingFeatures(row) {
            // チェックボックスの無効化
            const checkbox = row.querySelector('.modification-checkbox');
            if (checkbox) {
                checkbox.disabled = true;
            }

            // 主キーセルのドラッグ&ドロップ機能を無効化
            const primaryKeyCells = row.querySelectorAll('td[data-is-primary-key="true"]');
            primaryKeyCells.forEach(cell => {
                cell.draggable = false;
                cell.style.cursor = 'default';
            });

            // 分離ボタンの無効化
            const separateButtons = row.querySelectorAll('.separate-button');
            separateButtons.forEach(button => {
                button.disabled = true;
            });
        }

        /**
         * 🔄 チェックボックスの初期化
         */
        _reinitializeCheckboxes() {
            const tbody = document.getElementById('my-tbody');
            if (!tbody) return;

            const checkboxes = tbody.querySelectorAll('.modification-checkbox');
            checkboxes.forEach(checkbox => {
                const row = checkbox.closest('tr');
                if (row) {
                    // 行の修正状態に応じてチェックボックスの状態を設定
                    checkbox.checked = row.classList.contains('row-modified');
                    
                    // 編集モードでのみ有効化
                    checkbox.disabled = !(window.editModeManager && window.editModeManager.isEditMode);
                }
            });
        }

        /**
         * 🔄 情報部分のみ更新
         */
        _updatePaginationInfo() {
            // 上部コンテナの情報更新
            if (this.topContainer) {
                const infoElement = this.topContainer.querySelector('.pagination-info');
                if (infoElement) {
                    infoElement.remove();
                    this._createPaginationInfo(this.topContainer);
                }
            }

            // 下部コンテナの情報更新
            if (this.bottomContainer) {
                const infoElement = this.bottomContainer.querySelector('.pagination-info');
                if (infoElement) {
                    infoElement.remove();
                    this._createPaginationInfo(this.bottomContainer);
                }
            }
        }

        /**
         * 🔄 コントロール部分のみ更新
         */
        _updatePaginationControls() {
            // 上部コンテナのコントロール更新
            if (this.topContainer) {
                const controlsElement = this.topContainer.querySelector('.pagination-controls');
                if (controlsElement) {
                    controlsElement.remove();
                    this._createPaginationControls(this.topContainer);
                }
            }

            // 下部コンテナのコントロール更新
            if (this.bottomContainer) {
                const controlsElement = this.bottomContainer.querySelector('.pagination-controls');
                if (controlsElement) {
                    controlsElement.remove();
                    this._createPaginationControls(this.bottomContainer);
                }
            }
        }

        /**
         * 🧹 ページネーションUIを削除
         */
        _removePaginationUI() {
            // 上部ページネーション削除
            const topExisting = document.querySelector('#top-pagination-container');
            if (topExisting) {
                topExisting.remove();
            }

            // 下部ページネーション削除
            const bottomExisting = document.querySelector('#bottom-pagination-container');
            if (bottomExisting) {
                bottomExisting.remove();
            }

            this.topContainer = null;
            this.bottomContainer = null;
        }
        
        /**
         * 🆕 全データを取得（EditModeManager用）
         */
        getAllData() {
            return this.paginationManager.filteredData || [];
        }
        
        /**
         * 🆕 現在のページ番号を取得（EditModeManager用）
         */
        getCurrentPage() {
            return this.paginationManager.currentPage;
        }
        
        /**
         * 🆕 ページサイズを取得（EditModeManager用）
         */
        getPageSize() {
            return this.paginationManager.pageSize;
        }
    }

    // =============================================================================
    // グローバル公開
    // =============================================================================

    window.LedgerV2.Pagination = { 
        PaginationManager,
        PaginationUIManager 
    };
    
    window.PaginationManager = PaginationManager;
    window.PaginationUIManager = PaginationUIManager;

})(); 