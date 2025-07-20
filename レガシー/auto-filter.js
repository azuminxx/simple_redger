/**
 * 🔍 オートフィルタ機能モジュール v2
 * @description Excelライクなテーブルフィルタ機能を提供（全レコード対応）
 * 
 * ■主な機能:
 * ・各列のヘッダーにフィルタドロップダウンボタンを追加
 * ・列ごとの値一覧をチェックボックスで表示/非表示選択
 * ・複数列のフィルタ組み合わせによる絞り込み
 * ・フィルタ状態の視覚的表示（アクティブボタンの色変更）
 * ・フィルタのクリア機能
 * ・全レコードデータ対応（ページング関係なし）
 * 
 * ■動作:
 * 1. kintone APIで全レコードを取得してキャッシュ
 * 2. テーブル表示後に initialize() で各ヘッダーにボタン追加
 * 3. ボタンクリックでドロップダウン表示（全データの値一覧）
 * 4. チェックボックス操作でレコードの表示/非表示制御
 * 5. 複数フィルタは AND 条件で適用
 */

(() => {
    'use strict';

    /**
     * 🔍 オートフィルタ管理クラス v2（全レコード対応）
     * @description テーブルの各列にフィルタ機能を提供
     */
    class AutoFilterManagerV2 {
        constructor() {
            this.filters = new Map(); // 実際に適用されているフィルタ
            this.tempFilters = new Map(); // ドロップダウン内での一時的なフィルタ選択
            this.cachedRecords = null;
            this.allRecordsCache = new Map();
            this.originalRowsMap = new Map();
            
            // 全レコードデータ関連
            this.allRecords = []; // kintone APIから取得した全レコード
            this.isLoadingRecords = false;
            
            // 無限ループ防止フラグ
            this.isUpdatingTable = false;

            // 🔄 並び替え機能用のプロパティを追加
            this.originalRowOrder = null; // 元の行順序を保存
            this.currentSortState = null; // 現在の並び替え状態
            this.originalDropdownValues = null; // ドロップダウン値の元の順序
            this.originalDataOrder = null; // 全データの元の順序
            this.columnSortStates = new Map(); // 列ごとの並び替え状態を管理
        }

        /**
         * オートフィルタを初期化
         */
        initialize() {
            if (this.isInitialized) return;
            
            // フィルタ行での検索実行中の場合は初期化をスキップ
            if (window.isFilterRowSearchActive) {
                return;
            }
            
            // キャッシュされた全レコードを取得
            this._loadCachedRecords();
            
            // テーブルの行データを保存
            this._saveOriginalRows();
            
            // ヘッダーにフィルタボタンを追加
            this._addFilterButtonsToHeaders();
            
            // 🔄 フィルタボタンの状態を初期化
            this._updateFilterButtonStates();
            
            // 🔄 初期化完了後にセル交換機能を確認・再初期化
            setTimeout(() => {
                this._reinitializeCellSwap();
            }, 200);
            
            this.isInitialized = true;
        }

        /**
         * キャッシュされた全レコードを取得
         */
        _loadCachedRecords() {
            try {
                // paginationManagerのallDataから全レコードを取得
                if (window.paginationManager && window.paginationManager.allData) {
                    this.allRecords = window.paginationManager.allData;
                } else {
                    this.allRecords = [];
                }

                // 元の行番号を確実に保存
                this._ensureOriginalRowNumbers();

                // 列ごとの値キャッシュを作成
                this._buildAllRecordsCache();

                    } catch (error) {
            this.allRecords = [];
        }
        }

        /**
         * 元の行番号を確実に保存
         */
        _ensureOriginalRowNumbers() {
            if (!this.allRecords) return;

            
            // レコードに元の行番号を設定（データ取得時の順序を保持）
            this.allRecords.forEach((record, index) => {
                if (record._originalRowNumber === undefined) {
                    record._originalRowNumber = index + 1;
                }
            });
        }

        /**
         * 全レコードから列ごとの値キャッシュを作成
         */
        _buildAllRecordsCache() {
                    if (!window.fieldsConfig || this.allRecords.length === 0) {
            return;
        }

            this.allRecordsCache.clear();

            // 各フィールドの値を収集
            window.fieldsConfig.forEach((field, fieldIndex) => {
                const fieldCode = field.fieldCode;
                // 行番号、チェックボックス、非表示ボタンはスキップ、不整合フィールドは含める
                if (!fieldCode || fieldCode === '_row_number' || fieldCode === '_modification_checkbox' || fieldCode === '_hide_button') return;

                const values = new Set();

                this.allRecords.forEach((record, recordIndex) => {
                    // 統合レコード対応の値抽出
                    let displayValue = this._extractRecordValue(record, fieldCode);
                    values.add(displayValue);
                });

                this.allRecordsCache.set(fieldCode, Array.from(values).sort((a, b) => {
                    // 空白を最後に
                    if (a === '' && b !== '') return 1;
                    if (a !== '' && b === '') return -1;
                    if (a === '' && b === '') return 0;
                    
                    // 数値として比較できる場合は数値として比較
                    const numA = parseFloat(a);
                    const numB = parseFloat(b);
                    if (!isNaN(numA) && !isNaN(numB)) {
                        return numA - numB;
                    }
                    
                    // 文字列として比較
                    return a.localeCompare(b, 'ja');
                }));

            });
        }

        /**
         * 元の行データを保存
         */
        _saveOriginalRows() {
            const tbody = this._getTableBody();
            if (!tbody) return;

            this.originalRows = Array.from(tbody.querySelectorAll('tr')).map((row, index) => ({
                element: row,
                index: index,
                isVisible: true
            }));

            this.filteredRows = [...this.originalRows];
        }

        /**
         * ヘッダーにフィルタボタンを追加
         */
        _addFilterButtonsToHeaders() {
                    const headerRow = this._getTableHeaderRow();
        if (!headerRow) {
            return;
        }

            let buttonCount = 0;
            Array.from(headerRow.children).forEach((th, columnIndex) => {
                // filter-input要素からfieldCodeを取得
                const filterInput = th.querySelector('.filter-input[data-field-code]');
                if (!filterInput) {
                    return;
                }
                
                const fieldCode = filterInput.getAttribute('data-field-code');
                const headerLabel = th.querySelector('.header-label')?.textContent?.trim() || '';
                
                // 行番号列やボタン列はスキップ（不整合フィールドは含める）
                if (!fieldCode || fieldCode === '_row_number' || fieldCode === '_modification_checkbox' || fieldCode === '_hide_button') {
                    return;
                }

                // フィールド設定を取得
                const field = window.fieldsConfig?.find(f => f.fieldCode === fieldCode);
                if (!field) {
                    return;
                }

                this._addFilterButtonToHeader(th, columnIndex, field.label, fieldCode);
                buttonCount++;
            });
        }

        /**
         * 個別のヘッダーにフィルタボタンを追加
         */
        _addFilterButtonToHeader(headerCell, columnIndex, fieldLabel, fieldCode) {
            // 既にフィルタボタンがある場合はスキップ
            if (headerCell.querySelector('.auto-filter-button')) {
                return;
            }

            // ヘッダーセルにクラスを追加（CSSでスタイリング）
            headerCell.classList.add('has-filter-button');
            
            // フィルタボタンを作成
            const filterButton = document.createElement('button');
            filterButton.innerHTML = '<span style="font-size: 8px;">▼</span>'; // サイズ調整可能なアイコン
            filterButton.className = 'auto-filter-button';
            filterButton.title = `${fieldLabel}でフィルタ`;
            filterButton.setAttribute('data-field-code', fieldCode);
            filterButton.setAttribute('data-column-index', columnIndex);

            // クリックイベント
            filterButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this._showFilterDropdown(filterButton, columnIndex, fieldLabel, fieldCode);
            });

            headerCell.appendChild(filterButton);
        }

        /**
         * フィルタドロップダウンを表示
         */
        _showFilterDropdown(button, columnIndex, fieldLabel, fieldCode) {
            // 既存のドロップダウンを閉じる
            this._closeAllDropdowns();

            // 先に一時フィルタを設定（ドロップダウン作成前）
            const currentFilter = this.filters.get(columnIndex);
            const uniqueValues = this._getUniqueColumnValues(columnIndex, fieldCode);
            
            if (currentFilter) {
                // フィルタが既に設定されている場合は、その選択状態をコピー
                this.tempFilters.set(columnIndex, new Set(currentFilter));
            } else {
                // フィルタが未設定の場合は、すべての値を選択状態にする（現在の表示状態を反映）
                this.tempFilters.set(columnIndex, new Set(uniqueValues));
            }

            // 一時フィルタ設定後にドロップダウンを作成
            const dropdown = this._createFilterDropdown(columnIndex, fieldLabel, fieldCode);
            document.body.appendChild(dropdown);
            this._positionDropdown(dropdown, button);
            
            // アクティブ状態をボタンに設定
            button.classList.add('active');
            dropdown.setAttribute('data-column', columnIndex);
        }

        /**
         * フィルタドロップダウンを作成
         */
        _createFilterDropdown(columnIndex, fieldLabel, fieldCode) {
            const dropdown = document.createElement('div');
            dropdown.className = 'filter-dropdown';

            // ヘッダー部分
            const header = document.createElement('div');
            header.className = 'filter-header';
            header.innerHTML = `<span class="filter-icon">🏠</span> ${fieldLabel} でフィルタ`;
            
            // ドラッグ機能を追加
            this._addDragFunctionality(dropdown, header);

            // 🔄 並び替えボタン部分を追加
            const sortContainer = document.createElement('div');
            sortContainer.className = 'filter-sort-container';
            sortContainer.style.cssText = `
                padding: 10px 12px;
                border-bottom: 1px solid #e9ecef;
                background: #ffffff;
                display: flex;
                align-items: center;
                gap: 6px;
                justify-content: center;
            `;

            // 並び替えラベル
            const sortLabel = document.createElement('span');
            sortLabel.textContent = '並び替え:';
            sortLabel.style.cssText = `
                font-size: 12px;
                color: #666;
                font-weight: 500;
                margin-right: 4px;
            `;

            // 昇順ボタン
            const ascButton = document.createElement('button');
            ascButton.innerHTML = '🔼 昇順';
            ascButton.className = 'filter-sort-btn filter-sort-asc';
            ascButton.title = `${fieldLabel}を昇順で並び替え`;
            ascButton.style.cssText = `
                padding: 4px 8px;
                font-size: 11px;
                font-weight: 500;
                border: 1px solid #74b9ff;
                border-radius: 3px;
                background: #74b9ff;
                color: white;
                cursor: pointer;
                transition: all 0.2s ease;
                min-width: 50px;
            `;

            // 降順ボタン
            const descButton = document.createElement('button');
            descButton.innerHTML = '🔽 降順';
            descButton.className = 'filter-sort-btn filter-sort-desc';
            descButton.title = `${fieldLabel}を降順で並び替え`;
            descButton.style.cssText = `
                padding: 4px 8px;
                font-size: 11px;
                font-weight: 500;
                border: 1px solid #a29bfe;
                border-radius: 3px;
                background: #a29bfe;
                color: white;
                cursor: pointer;
                transition: all 0.2s ease;
                min-width: 50px;
            `;

            // 元の順序に戻すボタン
            const resetButton = document.createElement('button');
            resetButton.innerHTML = '↩️ 元順序';
            resetButton.className = 'filter-sort-btn filter-sort-reset';
            resetButton.title = '元の順序に戻す';
            resetButton.style.cssText = `
                padding: 4px 8px;
                font-size: 11px;
                font-weight: 500;
                border: 1px solid #fd79a8;
                border-radius: 3px;
                background: #fd79a8;
                color: white;
                cursor: pointer;
                transition: all 0.2s ease;
                min-width: 55px;
            `;

            // ボタンのホバー効果
            [ascButton, descButton, resetButton].forEach(button => {
                button.addEventListener('mouseenter', () => {
                    button.style.opacity = '0.8';
                    button.style.transform = 'translateY(-1px)';
                });
                button.addEventListener('mouseleave', () => {
                    button.style.opacity = '1';
                    button.style.transform = 'translateY(0)';
                });
                button.addEventListener('mousedown', () => {
                    button.style.transform = 'translateY(0) scale(0.95)';
                });
                button.addEventListener('mouseup', () => {
                    button.style.transform = 'translateY(-1px) scale(1)';
                });
            });

            // 並び替えボタンのイベントリスナー
            ascButton.addEventListener('click', () => {
                this._sortDropdownValues(dropdown, columnIndex, fieldCode, 'asc');
            });

            descButton.addEventListener('click', () => {
                this._sortDropdownValues(dropdown, columnIndex, fieldCode, 'desc');
            });

            resetButton.addEventListener('click', () => {
                this._sortDropdownValues(dropdown, columnIndex, fieldCode, 'original');
            });

            sortContainer.appendChild(sortLabel);
            sortContainer.appendChild(ascButton);
            sortContainer.appendChild(descButton);
            sortContainer.appendChild(resetButton);

            // 🔍 検索入力ボックス部分を追加
            const searchContainer = document.createElement('div');
            searchContainer.className = 'filter-search-container';
            searchContainer.style.cssText = `
                padding: 12px;
                border-bottom: 1px solid #e9ecef;
                background: #f8f9fa;
                display: flex;
                flex-direction: column;
                gap: 8px;
            `;

            // 検索入力行
            const searchInputRow = document.createElement('div');
            searchInputRow.style.cssText = `
                display: flex;
                align-items: center;
                gap: 8px;
            `;

            const searchInput = document.createElement('input');
            searchInput.type = 'text';
            searchInput.placeholder = '検索... (入力完了後0.5秒で検索、カンマ区切り可能)';
            searchInput.className = 'filter-search-input';


            const clearButton = document.createElement('button');
            clearButton.innerHTML = '×';
            clearButton.className = 'filter-clear-button';
            clearButton.title = '検索をクリア';
            clearButton.style.cssText = `
                width: 24px;
                height: 24px;
                border: 1px solid #ddd;
                border-radius: 4px;
                background: white;
                color: #666;
                cursor: pointer;
                font-size: 16px;
                font-weight: bold;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s ease;
            `;

            // 検索結果件数表示
            const searchResultCount = document.createElement('div');
            searchResultCount.className = 'filter-search-result-count';
            searchResultCount.style.cssText = `
                font-size: 12px;
                color: #666;
                text-align: center;
                padding: 4px 8px;
                background: rgba(76, 175, 80, 0.1);
                border-radius: 4px;
                border: 1px solid rgba(76, 175, 80, 0.2);
                display: none;
            `;

            searchInputRow.appendChild(searchInput);
            searchInputRow.appendChild(clearButton);
            searchContainer.appendChild(searchInputRow);
            searchContainer.appendChild(searchResultCount);

            // ×ボタンのホバー効果
            clearButton.addEventListener('mouseenter', () => {
                clearButton.style.background = '#f5f5f5';
                clearButton.style.color = '#333';
            });
            clearButton.addEventListener('mouseleave', () => {
                clearButton.style.background = 'white';
                clearButton.style.color = '#666';
            });



            // コントロール部分
            const controls = document.createElement('div');
            controls.className = 'filter-controls';

            // 左側のボタングループ
            const leftButtons = document.createElement('div');
            leftButtons.className = 'filter-left-buttons';

            // すべて選択ボタン
            const selectAllBtn = document.createElement('button');
            selectAllBtn.className = 'filter-btn filter-btn-outline';
            selectAllBtn.textContent = 'すべて選択';
            selectAllBtn.addEventListener('click', () => {
                const uniqueValues = this._getUniqueColumnValues(columnIndex, fieldCode);
                this.tempFilters.set(columnIndex, new Set(uniqueValues));
                this._updateDropdownCheckboxes(dropdown, this.tempFilters.get(columnIndex));
            });

            // すべて解除ボタン
            const deselectAllBtn = document.createElement('button');
            deselectAllBtn.className = 'filter-btn filter-btn-outline';
            deselectAllBtn.textContent = 'すべて解除';
            deselectAllBtn.addEventListener('click', () => {
                this.tempFilters.set(columnIndex, new Set());
                this._updateDropdownCheckboxes(dropdown, this.tempFilters.get(columnIndex));
            });

            // 右側のボタングループ
            const rightButtons = document.createElement('div');
            rightButtons.className = 'filter-right-buttons';

            // OKボタン（新規追加）
            const okBtn = document.createElement('button');
            okBtn.className = 'filter-btn filter-btn-primary';
            okBtn.textContent = 'OK';
            okBtn.addEventListener('click', () => {
                // 一時フィルタを実際のフィルタに適用
                const tempFilter = this.tempFilters.get(columnIndex);
                const uniqueValues = this._getUniqueColumnValues(columnIndex, fieldCode);
                
                if (tempFilter && tempFilter.size > 0) {
                    // すべての値が選択されている場合は、フィルタを削除（全件表示）
                    if (tempFilter.size === uniqueValues.length) {
                        this.filters.delete(columnIndex);
                    } else {
                        // 一部のみ選択されている場合は、フィルタを設定
                        this.filters.set(columnIndex, new Set(tempFilter));
                    }
                } else {
                    // 何も選択されていない場合は、フィルタを削除
                    this.filters.delete(columnIndex);
                }
                
                // 🔄 並び替え状態も適用
                if (this.currentSortState) {
                    this._applySortingToAllData(this.currentSortState.columnIndex, this.currentSortState.fieldCode, this.currentSortState.sortType);
                }
                
                this._applyFilters();
                this._closeAllDropdowns();
                
                // 🔄 フィルタ適用後に少し遅延してセル交換機能を再初期化
                setTimeout(() => {
                    this._reinitializeCellSwap();
                }, 100);
            });

            // キャンセルボタン（閉じるボタンから変更）
            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'filter-btn filter-btn-secondary';
            cancelBtn.textContent = 'キャンセル';
            cancelBtn.addEventListener('click', () => {
                // 一時フィルタをクリア（変更を破棄）
                this.tempFilters.delete(columnIndex);
                this._closeAllDropdowns();
            });

            leftButtons.appendChild(selectAllBtn);
            leftButtons.appendChild(deselectAllBtn);
            rightButtons.appendChild(okBtn);
            rightButtons.appendChild(cancelBtn);
            
            controls.appendChild(leftButtons);
            controls.appendChild(rightButtons);

            // 値一覧部分
            const valueList = document.createElement('div');
            valueList.className = 'filter-value-list';

            // 列の値を取得してチェックボックス一覧を作成
            const uniqueValues = this._getUniqueColumnValues(columnIndex, fieldCode);
            
            // 🔍 一時フィルタの初期化（既存フィルタがあればそれを、なければ全選択状態に）
            let currentTempFilter = this.tempFilters.get(columnIndex);
            if (!currentTempFilter) {
                const existingFilter = this.filters.get(columnIndex);
                if (existingFilter && existingFilter.size > 0) {
                    currentTempFilter = new Set(existingFilter);
                } else {
                    currentTempFilter = new Set(uniqueValues);
                }
                this.tempFilters.set(columnIndex, currentTempFilter);
            }

            // 🔍 検索機能の実装
            const originalValues = [...uniqueValues]; // 元の値リストを保存
            let searchTimeout = null; // デバウンス用のタイマー
            
            // 🔄 前回の並び替え状態を復元
            const previousSortState = this.columnSortStates.get(columnIndex);
            let displayValues = [...uniqueValues];
            
            if (previousSortState && previousSortState.sortType !== 'original') {
                // 前回の並び替え状態に基づいて値リストを並び替え
                displayValues = this._sortValues(uniqueValues, previousSortState.sortType);
                
                // 並び替えボタンの見た目を更新
                this._updateSortButtonStates(dropdown, previousSortState.sortType);
            }
            
            // 検索入力のイベントリスナー（デバウンス機能付き）
            searchInput.addEventListener('input', () => {
                // 既存のタイマーをクリア
                if (searchTimeout) {
                    clearTimeout(searchTimeout);
                }
                
                // 検索中の視覚的フィードバック
                if (searchInput.value.trim() !== '') {
                    searchInput.style.borderColor = '#ffc107';
                    searchInput.style.backgroundColor = '#fff8e1';
                }
                
                // 入力完了を待ってから検索実行（500ms後）
                searchTimeout = setTimeout(() => {
                    // 検索実行
                    this._handleSearchInput(searchInput.value, dropdown, columnIndex, fieldCode, originalValues, searchResultCount);
                    
                    // 検索完了後の視覚的フィードバック
                    if (searchInput.value.trim() !== '') {
                        searchInput.style.borderColor = '#4CAF50';
                        searchInput.style.backgroundColor = '#f1f8e9';
                    } else {
                        searchInput.style.borderColor = '#ddd';
                        searchInput.style.backgroundColor = 'white';
                    }
                }, 500);
            });

            // ×ボタンのイベントリスナー
            clearButton.addEventListener('click', () => {
                // タイマーをクリア
                if (searchTimeout) {
                    clearTimeout(searchTimeout);
                }
                searchInput.value = '';
                
                // 検索ボックスの見た目をリセット
                searchInput.style.borderColor = '#ddd';
                searchInput.style.backgroundColor = 'white';
                
                // 検索結果件数表示を非表示
                searchResultCount.style.display = 'none';
                
                // 🔍 一時フィルタを元の状態に戻す（既存のフィルタがあればそれを、なければ全選択状態に）
                const existingFilter = this.filters.get(columnIndex);
                if (existingFilter && existingFilter.size > 0) {
                    this.tempFilters.set(columnIndex, new Set(existingFilter));
                } else {
                    // 既存フィルタがない場合は全選択状態に
                    const allValues = this._getUniqueColumnValues(columnIndex, fieldCode);
                    this.tempFilters.set(columnIndex, new Set(allValues));
                }
                
                this._handleSearchInput('', dropdown, columnIndex, fieldCode, originalValues, searchResultCount);
                searchInput.focus();
            });

            // 初期表示（前回の並び替え状態を反映）
            this._renderValueList(valueList, displayValues, currentTempFilter, columnIndex);

            dropdown.appendChild(header);
            dropdown.appendChild(sortContainer);
            dropdown.appendChild(searchContainer);
            dropdown.appendChild(controls);
            dropdown.appendChild(valueList);

            // 🔄 現在の並び替え状態を反映
            const currentSortState = this.columnSortStates.get(columnIndex);
            if (currentSortState && currentSortState.sortType) {
                // 並び替えボタンの状態を更新
                this._updateSortButtonStates(dropdown, currentSortState.sortType);

            } else {
                // デフォルト状態（元順序）を設定
                this._updateSortButtonStates(dropdown, 'original');
            }

            return dropdown;
        }

        /**
         * 🔍 検索入力を処理
         */
        _handleSearchInput(searchText, dropdown, columnIndex, fieldCode, originalValues, searchResultCount = null) {
            const valueList = dropdown.querySelector('.filter-value-list');
            
            let filteredValues;
            if (searchText.trim() === '') {
                // 検索テキストが空の場合は全ての値を表示
                filteredValues = [...originalValues];
                
                // 検索結果件数表示を非表示
                if (searchResultCount) {
                    searchResultCount.style.display = 'none';
                }
                
                // 🔍 一時フィルタを既存フィルタの状態に戻す（なければ全選択）
                const existingFilter = this.filters.get(columnIndex);
                if (existingFilter && existingFilter.size > 0) {
                    this.tempFilters.set(columnIndex, new Set(existingFilter));
                } else {
                    // 既存フィルタがない場合は全選択状態に
                    this.tempFilters.set(columnIndex, new Set(originalValues));
                }
            } else {
                // 複数キーワード対応（カンマ区切り）
                const keywords = searchText.split(',').map(k => k.trim().toLowerCase()).filter(k => k);
                
                filteredValues = originalValues.filter(value => {
                    const valueStr = value.toString().toLowerCase();
                    // いずれかのキーワードにマッチすればOK（OR条件）
                    return keywords.some(keyword => valueStr.includes(keyword));
                });
                
                // 検索結果件数を表示
                if (searchResultCount) {
                    const totalCount = originalValues.length;
                    const matchCount = filteredValues.length;
                    searchResultCount.textContent = `🔍 検索結果: ${matchCount}件 / 全${totalCount}件`;
                    searchResultCount.style.display = 'block';
                    
                    // 件数に応じて色を変更
                    if (matchCount === 0) {
                        searchResultCount.style.background = 'rgba(220, 53, 69, 0.1)';
                        searchResultCount.style.borderColor = 'rgba(220, 53, 69, 0.2)';
                        searchResultCount.style.color = '#dc3545';
                    } else if (matchCount < totalCount * 0.3) {
                        searchResultCount.style.background = 'rgba(255, 193, 7, 0.1)';
                        searchResultCount.style.borderColor = 'rgba(255, 193, 7, 0.2)';
                        searchResultCount.style.color = '#856404';
                    } else {
                        searchResultCount.style.background = 'rgba(76, 175, 80, 0.1)';
                        searchResultCount.style.borderColor = 'rgba(76, 175, 80, 0.2)';
                        searchResultCount.style.color = '#666';
                    }
                }
                
                // 🔍 検索結果を一時フィルタに自動反映
                this.tempFilters.set(columnIndex, new Set(filteredValues));
            }
            
            // 🔄 現在の並び替え状態を適用
            const currentSortState = this.columnSortStates.get(columnIndex);
            if (currentSortState && currentSortState.sortType !== 'original') {
                filteredValues = this._sortValues(filteredValues, currentSortState.sortType);
            }
            
            // フィルタされた値でリストを更新（検索時は全ての値を表示するが、チェック状態は検索結果に基づく）
            const displayValues = searchText.trim() === '' ? filteredValues : originalValues;
            const tempFilterForDisplay = this.tempFilters.get(columnIndex);
            this._renderValueList(valueList, displayValues, tempFilterForDisplay, columnIndex);
        }

        /**
         * 🔍 値リストをレンダリング
         */
        _renderValueList(valueList, values, currentTempFilter, columnIndex) {
            // 既存の内容をクリア
            valueList.innerHTML = '';
            
            values.forEach(value => {
                const item = document.createElement('div');
                item.addEventListener('mouseenter', () => {
                    item.style.backgroundColor = '#f0f0f0';
                });
                item.addEventListener('mouseleave', () => {
                    item.style.backgroundColor = 'transparent';
                });

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                const isChecked = currentTempFilter ? currentTempFilter.has(value) : false;
                checkbox.checked = isChecked;
                checkbox.setAttribute('data-filter-value', value);

                const label = document.createElement('span');
                label.textContent = value === '' ? '(空白)' : value;

                item.appendChild(checkbox);
                item.appendChild(label);

                // チェックボックスの変更イベント（フィルタリングはしない）
                checkbox.addEventListener('change', () => {
                    this._updateTempFilterSelection(columnIndex, value, checkbox.checked);
                });

                // アイテム全体のクリックでチェックボックスを切り替え
                item.addEventListener('click', (e) => {
                    if (e.target !== checkbox) {
                        checkbox.checked = !checkbox.checked;
                        this._updateTempFilterSelection(columnIndex, value, checkbox.checked);
                    }
                });

                valueList.appendChild(item);
            });
        }

        /**
         * ドロップダウンの位置を調整
         */
        _positionDropdown(dropdown, button) {
            const rect = button.getBoundingClientRect();
            const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

            // 初期位置設定（ボタンの下）
            dropdown.style.left = `${rect.left + scrollLeft}px`;
            dropdown.style.top = `${rect.bottom + scrollTop + 2}px`;

            // 画面外に出る場合の調整
            const windowWidth = window.innerWidth;
            const windowHeight = window.innerHeight;
            
            // ドロップダウンのサイズを取得するために一時的に表示
            dropdown.style.visibility = 'hidden';
            dropdown.style.display = 'block';
            const dropdownRect = dropdown.getBoundingClientRect();
            dropdown.style.visibility = 'visible';

            // 右端を超える場合
            if (dropdownRect.right > windowWidth - 10) {
                dropdown.style.left = `${windowWidth - dropdownRect.width - 10 + scrollLeft}px`;
            }

            // 左端を超える場合
            if (dropdownRect.left < 10) {
                dropdown.style.left = `${10 + scrollLeft}px`;
            }

            // 下端を超える場合、または上部に十分なスペースがある場合
            const spaceBelow = windowHeight - rect.bottom;
            const spaceAbove = rect.top;
            
            if (dropdownRect.height > spaceBelow && spaceAbove > dropdownRect.height) {
                // 上に表示
                dropdown.style.top = `${rect.top + scrollTop - dropdownRect.height - 2}px`;
            } else if (dropdownRect.bottom > windowHeight - 10) {
                // 下端調整
                dropdown.style.top = `${windowHeight - dropdownRect.height - 10 + scrollTop}px`;
            }

            // 上端を超える場合
            const finalRect = dropdown.getBoundingClientRect();
            if (finalRect.top < 10) {
                dropdown.style.top = `${10 + scrollTop}px`;
            }
        }

        /**
         * 列の一意な値を取得（全レコード対応）
         */
        _getUniqueColumnValues(columnIndex, fieldCode) {
            // 不整合フィールドの場合は特別処理
            if (fieldCode === '_ledger_inconsistency') {
                return this._getInconsistencyValues();
            }

            // 全レコードキャッシュから値を取得
            if (this.allRecordsCache.has(fieldCode)) {
                return this.allRecordsCache.get(fieldCode);
            }

            // フォールバック：現在表示されている行から取得
            const tbody = this._getTableBody();
            if (!tbody) return [];

            const values = new Set();
            const rows = tbody.querySelectorAll('tr');

            rows.forEach(row => {
                const cell = row.children[columnIndex];
                if (cell) {
                    const value = this._extractCellValue(cell, fieldCode);
                    values.add(value);
                }
            });

            return Array.from(values).sort((a, b) => {
                // 空白を最後に
                if (a === '' && b !== '') return 1;
                if (a !== '' && b === '') return -1;
                if (a === '' && b === '') return 0;
                
                // 数値として比較できる場合は数値として比較
                const numA = parseFloat(a);
                const numB = parseFloat(b);
                if (!isNaN(numA) && !isNaN(numB)) {
                    return numA - numB;
                }
                
                // 文字列として比較
                return a.localeCompare(b, 'ja');
            });
        }

        /**
         * 不整合フィールドの値を取得
         */
        _getInconsistencyValues() {
            // 全レコードから不整合状態を計算
            if (!this.allRecords || this.allRecords.length === 0) {
                return ['正常', '不整合'];
            }

            const values = new Set();
            
            this.allRecords.forEach(record => {
                // 不整合検知ロジック（table-render.jsと同じ）
                const inconsistencies = this._detectRecordInconsistencies(record);
                if (inconsistencies.length > 0) {
                    values.add('不整合');
                } else {
                    values.add('正常');
                }
            });

            return Array.from(values).sort();
        }

        /**
         * レコードの不整合を検知（table-render.jsのロジックを複製）
         */
        _detectRecordInconsistencies(record) {
            const inconsistencies = [];
            
            if (!record || !record.ledgerData) {
                return inconsistencies;
            }

            // 主キーフィールドのマッピングを取得
            const primaryKeyMapping = window.LedgerV2.Utils.FieldValueProcessor.getAppToPrimaryKeyMapping();
            const ledgerTypes = ['SEAT', 'PC', 'EXT', 'USER'];
            
            // 各台帳の主キー値を収集
            const ledgerPrimaryKeys = {};
            ledgerTypes.forEach(ledgerType => {
                if (record.ledgerData[ledgerType]) {
                    const keys = {};
                    Object.entries(primaryKeyMapping).forEach(([app, fieldCode]) => {
                        const fieldData = record.ledgerData[ledgerType][fieldCode];
                        if (fieldData && fieldData.value) {
                            keys[app] = fieldData.value;
                        }
                    });
                    ledgerPrimaryKeys[ledgerType] = keys;
                }
            });

            // 不整合をチェック
            const allLedgers = Object.keys(ledgerPrimaryKeys);
            if (allLedgers.length <= 1) {
                return inconsistencies; // 1つ以下の台帳しかない場合は不整合なし
            }

            // 基準となる台帳（最初の台帳）
            const baseLedger = allLedgers[0];
            const baseKeys = ledgerPrimaryKeys[baseLedger];

            // 他の台帳と比較
            for (let i = 1; i < allLedgers.length; i++) {
                const compareLedger = allLedgers[i];
                const compareKeys = ledgerPrimaryKeys[compareLedger];

                // 各主キーを比較
                Object.entries(primaryKeyMapping).forEach(([app, fieldCode]) => {
                    const baseValue = baseKeys[app];
                    const compareValue = compareKeys[app];

                    // 両方に値があり、かつ異なる場合は不整合
                    if (baseValue && compareValue && baseValue !== compareValue) {
                        inconsistencies.push({
                            fieldCode: fieldCode,
                            app: app,
                            baseLedger: baseLedger,
                            baseValue: baseValue,
                            compareLedger: compareLedger,
                            compareValue: compareValue
                        });
                    }
                });
            }

            return inconsistencies;
        }

        /**
         * セルから値を抽出
         */
        _extractCellValue(cell, fieldCode) {
            if (!cell) return '';

            try {
                // data-original-valueから取得を試行
                const originalValue = cell.getAttribute('data-original-value');
                if (originalValue !== null) {
                    return originalValue;
                }

                // 分離ボタン付きセル（primary-key-container）
                const primaryKeyValue = cell.querySelector('.primary-key-value');
                if (primaryKeyValue) {
                    return primaryKeyValue.textContent.trim();
                }

                // フレックスコンテナの値（.flex-value）
                const flexValue = cell.querySelector('.flex-value');
                if (flexValue) {
                    return flexValue.textContent.trim();
                }

                // 入力要素がある場合
                const input = cell.querySelector('input, select, textarea');
                if (input) {
                    return input.value || input.textContent || '';
                }

                // 通常のテキストセル
                let text = cell.textContent || '';
                
                // オートフィルタボタンの▼を除去
                text = text.replace(/▼$/, '').replace(/▲$/, '');
                
                return text.trim();
            } catch (error) {
                return '';
            }
        }

        /**
         * 一時フィルタ選択状態を更新（フィルタリングは実行しない）
         */
        _updateTempFilterSelection(columnIndex, value, isSelected) {
            const tempFilter = this.tempFilters.get(columnIndex) || new Set();
            
            if (isSelected) {
                tempFilter.add(value);
            } else {
                tempFilter.delete(value);
            }
            
            this.tempFilters.set(columnIndex, tempFilter);
        }

        /**
         * フィルタ選択状態を更新（実際のフィルタ適用用）
         */
        _updateFilterSelection(columnIndex, value, isSelected) {
            const filter = this.filters.get(columnIndex) || new Set();
            
            if (isSelected) {
                filter.add(value);
            } else {
                filter.delete(value);
            }
            
            // フィルタが空の場合は削除、そうでなければ設定
            if (filter.size === 0) {
                this.filters.delete(columnIndex);
            } else {
                this.filters.set(columnIndex, filter);
            }
            this._applyFilters();
        }

        /**
         * フィルタ状況の要約を取得（デバッグ用）
         */
        _getFilterSummary() {
            const summary = {};
            this.filters.forEach((filter, columnIndex) => {
                summary[`列${columnIndex}`] = Array.from(filter);
            });
            return summary;
        }

        /**
         * フィルタを適用
         */
        _applyFilters() {
            // フィルタ行での検索が実行中の場合は、オートフィルタを適用しない
            if (window.isFilterRowSearchActive) {
                return;
            }
            
            if (this.filters.size === 0) {
                this._clearPaginationFilter();
                this._updateFilterButtonStates();
                // 🔄 フィルタクリア後もセル交換機能を再初期化
                this._reinitializeCellSwap();
                return;
            }

            // 📋 全レコードデータを確認・構築
            if (!this.allRecords || this.allRecords.length === 0) {
                this._loadCachedRecords();
            }

            if (!this.allRecords || this.allRecords.length === 0) {
                // ページングマネージャーから全データを取得
                if (window.paginationManager && window.paginationManager.allData) {
                    this.allRecords = window.paginationManager.allData;
                } else {
                    return;
                }
            }

            // 🔍 フィルタリング実行
            const filteredRecords = this._filterCachedRecords();
            
            // 🔄 ページングマネージャーと連携してフィルタ結果を表示
            this._applyFilterWithPagination(filteredRecords);

            this._updateFilterButtonStates();
            
            // 🔄 フィルタ適用後にセル交換機能を再初期化
            this._reinitializeCellSwap();
        }

        /**
         * キャッシュレコードをフィルタリング
         */
        _filterCachedRecords() {
            if (!this.allRecords || this.allRecords.length === 0) {
                return [];
            }

            // フィルタ条件とフィールドコードを事前に準備（無限ループ防止）
            const filterConditions = [];
            for (const [columnIndex, filter] of this.filters) {
                if (!filter || filter.size === 0) {
                    continue;
                }
                
                const fieldCode = this._getFieldCodeByColumnIndex(columnIndex);
                if (!fieldCode) continue;
                
                filterConditions.push({
                    fieldCode: fieldCode,
                    values: filter
                });
            }

            if (filterConditions.length === 0) {
                return this.allRecords;
            }

            const filteredRecords = this.allRecords.filter(record => {
                // 各フィルタ条件をAND条件でチェック
                return filterConditions.every(condition => {
                    const recordValue = this._extractRecordValue(record, condition.fieldCode);
                    return condition.values.has(recordValue);
                });
            });
            
            return filteredRecords;
        }

        /**
         * レコードからフィールド値を抽出
         */
        _extractRecordValue(record, fieldCode) {
            if (!record || !fieldCode) return '';

            // 不整合フィールドの特別処理
            if (fieldCode === '_ledger_inconsistency') {
                const inconsistencies = this._detectRecordInconsistencies(record);
                return inconsistencies.length > 0 ? '不整合' : '正常';
            }

            // 1. 統合レコードの場合（ledgerDataを持つ）
            if (record.ledgerData) {
                for (const [ledgerType, ledgerRecord] of Object.entries(record.ledgerData)) {
                    if (ledgerRecord && ledgerRecord[fieldCode]) {
                        const fieldValue = ledgerRecord[fieldCode];
                        return this._extractFieldValue(fieldValue);
                    }
                }
            }

            // 2. 通常のkintoneレコードの場合（直接フィールドを持つ）
            if (record[fieldCode]) {
                const fieldValue = record[fieldCode];
                return this._extractFieldValue(fieldValue);
            }

            // 3. 統合レコードで主要な台帳から検索
            if (record.ledgerData) {
                // SEAT, PC, EXT, USER の順で検索
                const ledgerTypes = ['SEAT', 'PC', 'EXT', 'USER'];
                for (const ledgerType of ledgerTypes) {
                    const ledgerRecord = record.ledgerData[ledgerType];
                    if (ledgerRecord) {
                        // レコード内の全フィールドをチェック
                        for (const [key, value] of Object.entries(ledgerRecord)) {
                            if (key === fieldCode) {
                                return this._extractFieldValue(value);
                            }
                        }
                    }
                }
            }

            // 4. レコードのすべてのプロパティを検索（フォールバック）
            for (const [key, value] of Object.entries(record)) {
                if (key === fieldCode) {
                    return this._extractFieldValue(value);
                }
            }

            return '';
        }

        /**
         * フィールド値から表示値を抽出
         */
        _extractFieldValue(fieldValue) {
            if (fieldValue === null || fieldValue === undefined) return '';

            // 1. 文字列・数値の場合
            if (typeof fieldValue === 'string' || typeof fieldValue === 'number') {
                return fieldValue.toString();
            }

            // 2. kintoneフィールド形式（{value: ...}）の場合
            if (fieldValue.value !== undefined) {
                if (Array.isArray(fieldValue.value)) {
                    // 配列の場合（複数選択、ユーザー選択など）
                    return fieldValue.value.map(item => {
                        if (typeof item === 'string') return item;
                        if (item.name) return item.name;
                        if (item.code) return item.code;
                        return item.toString();
                    }).join(', ');
                } else {
                    return fieldValue.value.toString();
                }
            }

            // 3. オブジェクトで直接値を持つ場合
            if (typeof fieldValue === 'object') {
                // nameプロパティがある場合（ユーザー情報など）
                if (fieldValue.name) return fieldValue.name;
                // codeプロパティがある場合
                if (fieldValue.code) return fieldValue.code;
                // labelプロパティがある場合
                if (fieldValue.label) return fieldValue.label;
                // textプロパティがある場合
                if (fieldValue.text) return fieldValue.text;
            }

            // 4. 配列の場合
            if (Array.isArray(fieldValue)) {
                return fieldValue.map(item => {
                    if (typeof item === 'string') return item;
                    if (item.name) return item.name;
                    if (item.code) return item.code;
                    return item.toString();
                }).join(', ');
            }

            // 5. その他（フォールバック）
            return fieldValue.toString();
        }

        /**
         * ページングマネージャーと連携してフィルタ適用
         */
        _applyFilterWithPagination(filteredRecords) {
            if (!window.paginationManager) {
                return;
            }

            // フィルタ結果をページングマネージャーに設定（直接filteredDataを更新）
            window.paginationManager.filteredData = filteredRecords;
            window.paginationManager.isFiltered = true;
            window.paginationManager._recalculatePagination();
            window.paginationManager._resetToFirstPage();
            
            // ページングUIとテーブル表示を更新
            if (window.paginationUI) {
                window.paginationUI.updatePaginationUI();
            }
            
            // フィルタ結果の最初のページを表示
            this._displayFilteredPage();
        }

        /**
         * フィルタ結果のページを表示
         */
        _displayFilteredPage() {
            if (this.isUpdatingTable) {
                return;
            }
            
            if (!window.paginationManager) {
                return;
            }
            
            this.isUpdatingTable = true;
            
            try {
                const pageData = window.paginationManager.getCurrentPageData();
                
                // 直接テーブルボディを更新（TableDisplayManagerを使わない）
                this._updateTableDirectly(pageData);
                
            } finally {
                this.isUpdatingTable = false;
            }
        }

        /**
         * テーブルを直接更新（無限ループ回避）
         */
        _updateTableDirectly(pageData) {
            const tbody = this._getTableBody();
            if (!tbody) {
                return;
            }

            // テーブルボディをクリア
            tbody.innerHTML = '';

            if (!pageData || pageData.length === 0) {
                return;
            }

            // フィールド順序を取得
            const fieldOrder = window.fieldsConfig ? 
                window.fieldsConfig.map(field => field.fieldCode) : 
                [];

            // 各レコードを行として追加
            pageData.forEach((record, index) => {
                const row = this._createTableRowDirectly(record, fieldOrder, index);
                tbody.appendChild(row);
            });
        }

        /**
         * テーブル行を直接作成（簡易版）
         */
        _createTableRowDirectly(record, fieldOrder, rowIndex) {
            const row = document.createElement('tr');
            const integrationKey = record.integrationKey || '';
            
            // レコードに紐づく元の行番号を使用
            const originalRowNumber = record._originalRowNumber;
            row.setAttribute('data-row-id', originalRowNumber);
            row.setAttribute('data-integration-key', integrationKey);

            // フィールドごとにセルを作成
            fieldOrder.forEach(fieldCode => {
                const cell = this._createCellDirectly(record, fieldCode, rowIndex, row, originalRowNumber);
                row.appendChild(cell);
            });

            return row;
        }

        /**
         * セルを直接作成（TableDisplayManagerを使用して一貫性を保つ）
         */
        _createCellDirectly(record, fieldCode, rowIndex, row = null, originalRowNumber = null) {
            // 行番号セルの場合は特別処理
            const field = window.fieldsConfig?.find(f => f.fieldCode === fieldCode);
            if (field && field.cellType === 'row_number' && originalRowNumber) {
                const cell = document.createElement('td');
                cell.textContent = originalRowNumber;
                cell.classList.add('row-number-cell', 'table-cell');
                cell.setAttribute('data-field-code', fieldCode);
                return cell;
            }

            // その他のセルは通常通りTableDisplayManagerを使用
            if (!window.tableDisplayManager || !window.tableDisplayManager._createDataCell) {
                console.error('❌ TableDisplayManagerが利用できません（オートフィルタ）');
                throw new Error('TableDisplayManagerが初期化されていません');
            }

            return window.tableDisplayManager._createDataCell(record, fieldCode, row, rowIndex);
        }

        /**
         * ページングフィルタをクリア
         */
        _clearPaginationFilter() {
            if (window.paginationManager) {
                // フィルタ状態をリセット
                window.paginationManager.filteredData = [...window.paginationManager.allData];
                window.paginationManager.isFiltered = false;
                window.paginationManager.currentFilter = null;
                window.paginationManager._recalculatePagination();
                window.paginationManager._resetToFirstPage();
                
                // ページングUIを更新
                if (window.paginationUI) {
                    window.paginationUI.updatePaginationUI();
                }
                
                // フィルタ行検索実行中の場合は、テーブル再描画をスキップ
                if (!window.isFilterRowSearchActive) {
                    // 最初のページを表示
                    this._displayFilteredPage();
                }
            }
        }

        /**
         * フィルタボタンの状態を更新
         */
        _updateFilterButtonStates() {
            const headerRow = this._getTableHeaderRow();
            if (!headerRow) return;

            Array.from(headerRow.children).forEach((th, columnIndex) => {
                const filterButton = th.querySelector('.auto-filter-button');
                if (!filterButton) return;

                const filter = this.filters.get(columnIndex);
                const hasActiveFilter = filter && filter.size > 0;
                const allValues = this._getUniqueColumnValues(columnIndex, this._getFieldCodeByColumnIndex(columnIndex));
                const isFiltered = hasActiveFilter && filter.size < allValues.length;

                if (isFiltered) {
                    // フィルタが適用されている場合
                    filterButton.style.backgroundColor = '#007acc';
                    filterButton.style.color = 'white';
                    filterButton.style.borderColor = '#005999';
                    filterButton.style.fontWeight = 'bold';
                    filterButton.textContent = '▲';
                } else {
                    // フィルタが適用されていない場合
                    filterButton.style.backgroundColor = '#f5f5f5';
                    filterButton.style.color = 'black';
                    filterButton.style.borderColor = '#ccc';
                    filterButton.style.fontWeight = 'normal';
                    filterButton.textContent = '▼';
                }

                // 🔄 並び替え状態をヘッダーに反映
                this._updateHeaderSortIndicator(th, columnIndex);
            });
        }

        /**
         * 🔄 ヘッダーに並び替えインジケーターを表示
         */
        _updateHeaderSortIndicator(headerCell, columnIndex) {
            // 既存の並び替えインジケーターを削除
            const existingIndicator = headerCell.querySelector('.sort-indicator');
            if (existingIndicator) {
                existingIndicator.remove();
            }

            // 現在の並び替え状態を取得
            const sortState = this.columnSortStates.get(columnIndex);
            if (!sortState || sortState.sortType === 'original') {
                return; // 並び替えが適用されていない場合は何も表示しない
            }

            // 並び替えインジケーターを作成
            const indicator = document.createElement('span');
            indicator.className = 'sort-indicator';
            indicator.style.cssText = `
                display: inline-flex;
                align-items: center;
                justify-content: center;
                margin-right: 6px;
                font-size: 16px;
                font-weight: 1500;
                color: white;
                text-shadow: 1px 1px 2px black;
                flex-shrink: 0;
                width: 16px;
                height: 16px;
            `;

            // 並び替えタイプに応じてアイコンを設定
            switch (sortState.sortType) {
                case 'asc':
                    indicator.textContent = '↑';
                    indicator.title = '昇順で並び替え中';
                    break;
                case 'desc':
                    indicator.textContent = '↓';
                    indicator.title = '降順で並び替え中';
                    break;
            }

            // ヘッダーラベルの前に挿入
            const headerLabel = headerCell.querySelector('.header-label');
            if (headerLabel) {
                headerLabel.insertBefore(indicator, headerLabel.firstChild);
            } else {
                // フォールバック：ヘッダーセルの最初に挿入
                headerCell.insertBefore(indicator, headerCell.firstChild);
            }
        }

        /**
         * ドロップダウン内のチェックボックス状態を更新
         */
        _updateDropdownCheckboxes(dropdown, filter) {
            const checkboxes = dropdown.querySelectorAll('input[type="checkbox"]');
            checkboxes.forEach(checkbox => {
                const value = checkbox.getAttribute('data-filter-value');
                checkbox.checked = filter.has(value);
            });
        }

        /**
         * すべてのドロップダウンを閉じる
         */
        _closeAllDropdowns() {
            document.querySelectorAll('.filter-dropdown').forEach(dropdown => {
                dropdown.remove();
            });

            document.querySelectorAll('.active').forEach(button => {
                button.classList.remove('active');
            });
        }

        /**
         * すべてのフィルタをクリア
         */
        clearAllFilters() {
            this._closeAllDropdowns();
            this.filters.clear();
            this.columnSortStates.clear(); // 🔄 並び替え状態もクリア
            this._clearPaginationFilter();
            this._updateFilterButtonStates();
        }

        /**
         * 指定列のフィルタをクリア
         */
        clearColumnFilter(columnIndex) {
            this.filters.delete(columnIndex);
            this._applyFilters();
        }

        /**
         * すべての行を表示
         */
        _showAllRows() {
            const tbody = this._getTableBody();
            if (!tbody) return;

            const rows = tbody.querySelectorAll('tr');
            rows.forEach(row => {
                row.style.display = '';
            });
        }

        /**
         * フィルタ状態を取得
         */
        getFilterStatus() {
            const status = {};
            for (const [columnIndex, filter] of this.filters) {
                const fieldCode = this._getFieldCodeByColumnIndex(columnIndex);
                status[fieldCode] = Array.from(filter);
            }
            return status;
        }

        /**
         * テーブル更新時に再初期化（キャッシュデータ対応）
         */
        refreshOnTableUpdate() {
            this.isInitialized = false;
            this.filters.clear();
            this.allRecordsCache.clear();
            this._closeAllDropdowns();
            this.initialize();
        }

        /**
         * テーブルヘッダー行を取得（統一メソッド）
         */
        _getTableHeaderRow() {
            // フィルター行を直接取得（これが実際のヘッダー行）
            const filterRow = document.querySelector('#my-filter-row');
            if (filterRow) {
                return filterRow;
            }
            return null;
        }

        /**
         * テーブルボディを取得（統一メソッド）
         */
        _getTableBody() {
            // 1. V2のDOMHelperを試行
            if (window.LedgerV2?.Utils?.DOMHelper?.getTableBody) {
                const tbody = window.LedgerV2.Utils.DOMHelper.getTableBody();
                if (tbody) return tbody;
            }
            
            // 2. 直接セレクタで取得
            const selectors = ['#my-tbody', 'tbody', '.table-body'];
            for (const selector of selectors) {
                const element = document.querySelector(selector);
                if (element) return element;
            }
            
            return null;
        }

        /**
         * 列インデックスからフィールドコードを取得
         */
        _getFieldCodeByColumnIndex(columnIndex) {
            if (!window.fieldsConfig) {
                return null;
            }
            
            // 列インデックスは0ベースだが、実際のフィールド配列も0ベース
            if (columnIndex >= 0 && columnIndex < window.fieldsConfig.length) {
                const field = window.fieldsConfig[columnIndex];
                return field.fieldCode;
            }
            
            return null;
        }

        /**
         * 🔄 値を比較（データタイプ自動判定）
         */
        _compareValues(valueA, valueB) {
            // 空白値の処理
            if (valueA === '' && valueB === '') return 0;
            if (valueA === '') return 1;  // 空白は最後
            if (valueB === '') return -1;

            // 数値判定
            const numA = this._parseNumber(valueA);
            const numB = this._parseNumber(valueB);
            
            if (!isNaN(numA) && !isNaN(numB)) {
                // 両方とも数値の場合
                return numA - numB;
            }

            // 日付判定
            const dateA = this._parseDate(valueA);
            const dateB = this._parseDate(valueB);
            
            if (dateA && dateB) {
                // 両方とも日付の場合
                return dateA.getTime() - dateB.getTime();
            }

            // 文字列比較（自然順序対応）
            return this._naturalCompare(valueA.toString(), valueB.toString());
        }

        /**
         * 🔄 数値解析
         */
        _parseNumber(value) {
            if (typeof value === 'number') return value;
            
            // カンマ区切りの数値に対応
            const cleaned = value.toString().replace(/[,\s]/g, '');
            const num = parseFloat(cleaned);
            
            return isNaN(num) ? NaN : num;
        }

        /**
         * 🔄 日付解析
         */
        _parseDate(value) {
            if (value instanceof Date) return value;
            
            try {
                // 様々な日付フォーマットに対応
                const dateStr = value.toString().trim();
                if (dateStr === '') return null;
                
                // ISO形式、日本語形式など
                const date = new Date(dateStr);
                return isNaN(date.getTime()) ? null : date;
            } catch {
                return null;
            }
        }

        /**
         * 🔄 自然順序比較（数字を含む文字列の正しい並び替え）
         */
        _naturalCompare(a, b) {
            const reA = /[^a-zA-Z]/g;
            const reN = /[^0-9]/g;
            
            const aA = a.replace(reA, '');
            const bA = b.replace(reA, '');
            
            if (aA === bA) {
                const aN = parseInt(a.replace(reN, ''), 10);
                const bN = parseInt(b.replace(reN, ''), 10);
                return aN === bN ? 0 : aN > bN ? 1 : -1;
            } else {
                return aA > bA ? 1 : -1;
            }
        }

        /**
         * 🔄 ドロップダウン内の値を並び替え
         */
        _sortDropdownValues(dropdown, columnIndex, fieldCode, sortType) {
            const valueList = dropdown.querySelector('.filter-value-list');
            const currentTempFilter = this.tempFilters.get(columnIndex);
            
            // 元の値リストを取得
            let originalValues = this._getUniqueColumnValues(columnIndex, fieldCode);
            
            // 元の順序を保存（初回のみ）
            if (!this.originalDropdownValues) {
                this.originalDropdownValues = new Map();
            }
            if (!this.originalDropdownValues.has(columnIndex)) {
                this.originalDropdownValues.set(columnIndex, [...originalValues]);
            }
            
            let sortedValues;
            if (sortType === 'original') {
                // 元の順序に戻す
                sortedValues = this.originalDropdownValues.get(columnIndex);
            } else {
                // 昇順または降順で並び替え
                sortedValues = this._sortValues(originalValues, sortType);
            }
            
            // 🔄 列ごとの並び替え状態を保存
            this.columnSortStates.set(columnIndex, {
                fieldCode,
                sortType,
                timestamp: Date.now()
            });
            
            // 並び替え状態を保存（OKボタン押下時に使用）
            this.currentSortState = {
                columnIndex,
                fieldCode,
                sortType
            };
            
            // 🔄 並び替えボタンの見た目を更新
            this._updateSortButtonStates(dropdown, sortType);
            
            // ドロップダウンの値リストを更新
            this._renderValueList(valueList, sortedValues, currentTempFilter, columnIndex);
            
            // 🔄 ヘッダーの並び替えインジケーターを更新
            setTimeout(() => {
                this._updateFilterButtonStates();
            }, 100);
        }

        /**
         * 🔄 値配列を並び替え
         */
        _sortValues(values, sortType) {
            return values.slice().sort((a, b) => {
                const comparison = this._compareValues(a, b);
                return sortType === 'asc' ? comparison : -comparison;
            });
        }

        /**
         * 🔄 全データに並び替えを適用
         */
        _applySortingToAllData(columnIndex, fieldCode, sortType) {
            
            try {
                // 全レコードデータを取得
                if (!this.allRecords || this.allRecords.length === 0) {
                    this._loadCachedRecords();
                }
                
                if (!this.allRecords || this.allRecords.length === 0) {
                    console.warn('⚠️ 並び替え対象のデータがありません');
                    return;
                }

                // 並び替え前に元の行番号を確実に保存
                this._ensureOriginalRowNumbers();

                // 元の順序を保存（初回のみ）
                if (!this.originalDataOrder) {
                    this.originalDataOrder = [...this.allRecords];
                }

                let sortedData;
                if (sortType === 'original') {
                    // 元の順序に戻す
                    sortedData = [...this.originalDataOrder];
                } else {
                    // 昇順または降順で並び替え
                    sortedData = this._sortDataByColumn(this.allRecords, fieldCode, sortType);
                }

                // 並び替え結果を全データに適用
                this.allRecords = sortedData;
                
                // ページングマネージャーにも反映
                if (window.paginationManager) {
                    window.paginationManager.allData = sortedData;
                    // フィルタが適用されている場合は、フィルタ後のデータも並び替え
                    if (window.paginationManager.isFiltered) {
                        const filteredData = this._filterRecordsArray(sortedData);
                        window.paginationManager.filteredData = filteredData;
                    } else {
                        window.paginationManager.filteredData = [...sortedData];
                    }
                    window.paginationManager._recalculatePagination();
                }

            } catch (error) {
                console.error('❌ 全データ並び替えエラー:', error);
            }
        }

        /**
         * 🔄 データ配列を指定列で並び替え
         */
        _sortDataByColumn(dataArray, fieldCode, sortType) {
            return dataArray.slice().sort((recordA, recordB) => {
                try {
                    const valueA = this._extractRecordValue(recordA, fieldCode);
                    const valueB = this._extractRecordValue(recordB, fieldCode);

                    // データタイプを判定して適切な比較を行う
                    const comparison = this._compareValues(valueA, valueB);
                    
                    // 昇順または降順
                    return sortType === 'asc' ? comparison : -comparison;
                    
                } catch (error) {
                    console.warn('⚠️ レコード比較エラー:', error);
                    return 0;
                }
            });
        }

        /**
         * 🔄 レコード配列をフィルタ
         */
        _filterRecordsArray(dataArray) {
            if (this.filters.size === 0) {
                return [...dataArray];
            }

            return dataArray.filter(record => {
                // すべてのフィルタ条件をチェック（AND条件）
                for (const [columnIndex, filterValues] of this.filters) {
                    const fieldCode = this._getFieldCodeByColumnIndex(columnIndex);
                    if (!fieldCode) continue;

                    const recordValue = this._extractRecordValue(record, fieldCode);
                    
                    // フィルタ値に含まれていない場合は除外
                    if (!filterValues.has(recordValue)) {
                        return false;
                    }
                }
                return true;
            });
        }

        /**
         * 🔄 並び替えボタンの見た目を更新
         */
        _updateSortButtonStates(dropdown, currentSortType) {
            const ascButton = dropdown.querySelector('.filter-sort-asc');
            const descButton = dropdown.querySelector('.filter-sort-desc');
            const resetButton = dropdown.querySelector('.filter-sort-reset');
            
            if (!ascButton || !descButton || !resetButton) return;
            
            // すべてのボタンを通常状態にリセット
            ascButton.innerHTML = '🔼 昇順';
            ascButton.style.opacity = '1';
            ascButton.style.fontWeight = '500';
            ascButton.style.boxShadow = 'none';
            ascButton.style.transform = 'translateY(0)';
            ascButton.style.background = '#74b9ff';
            ascButton.style.border = '1px solid #74b9ff';
            
            descButton.innerHTML = '🔽 降順';
            descButton.style.opacity = '1';
            descButton.style.fontWeight = '500';
            descButton.style.boxShadow = 'none';
            descButton.style.transform = 'translateY(0)';
            descButton.style.background = '#a29bfe';
            descButton.style.border = '1px solid #a29bfe';
            
            resetButton.innerHTML = '↩️ 元順序';
            resetButton.style.opacity = '1';
            resetButton.style.fontWeight = '500';
            resetButton.style.boxShadow = 'none';
            resetButton.style.transform = 'translateY(0)';
            resetButton.style.background = '#fd79a8';
            resetButton.style.border = '1px solid #fd79a8';
            
            // 現在アクティブなボタンを強調表示
            let activeButton = null;
            switch (currentSortType) {
                case 'asc':
                    activeButton = ascButton;
                    ascButton.innerHTML = '✅ 昇順 (適用中)';
                    ascButton.style.background = '#0984e3';
                    ascButton.style.border = '2px solid #0984e3';
                    break;
                case 'desc':
                    activeButton = descButton;
                    descButton.innerHTML = '✅ 降順 (適用中)';
                    descButton.style.background = '#6c5ce7';
                    descButton.style.border = '2px solid #6c5ce7';
                    break;
                case 'original':
                    activeButton = resetButton;
                    resetButton.innerHTML = '✅ 元順序 (適用中)';
                    resetButton.style.background = '#e84393';
                    resetButton.style.border = '2px solid #e84393';
                    break;
            }
            
            if (activeButton) {
                activeButton.style.fontWeight = '700';
                activeButton.style.boxShadow = '0 3px 6px rgba(0,0,0,0.3)';
                activeButton.style.transform = 'translateY(-2px)';
            }
        }

        /**
         * 🎯 ドラッグアンドドロップ機能を追加
         */
        _addDragFunctionality(dropdown, header) {
            let isDragging = false;
            let startX = 0;
            let startY = 0;
            let initialLeft = 0;
            let initialTop = 0;

            // マウスダウンイベント（ドラッグ開始）
            header.addEventListener('mousedown', (e) => {
                // テキスト選択を防止
                e.preventDefault();
                
                isDragging = true;
                startX = e.clientX;
                startY = e.clientY;
                
                // 現在の位置を取得
                const rect = dropdown.getBoundingClientRect();
                initialLeft = rect.left;
                initialTop = rect.top;
                
                // ドラッグ中のスタイルを適用
                dropdown.classList.add('dragging');
                header.style.cursor = 'grabbing';
                
                // ドキュメント全体にイベントリスナーを追加
                document.addEventListener('mousemove', handleMouseMove);
                document.addEventListener('mouseup', handleMouseUp);
            });

            // マウス移動イベント（ドラッグ中）
            const handleMouseMove = (e) => {
                if (!isDragging) return;
                
                e.preventDefault();
                
                // 移動距離を計算
                const deltaX = e.clientX - startX;
                const deltaY = e.clientY - startY;
                
                // 新しい位置を計算
                const newLeft = initialLeft + deltaX;
                const newTop = initialTop + deltaY;
                
                // 画面境界チェック
                const dropdownRect = dropdown.getBoundingClientRect();
                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;
                
                // 左右の境界チェック
                const clampedLeft = Math.max(0, Math.min(newLeft, viewportWidth - dropdownRect.width));
                // 上下の境界チェック
                const clampedTop = Math.max(0, Math.min(newTop, viewportHeight - dropdownRect.height));
                
                // 位置を更新
                dropdown.style.left = `${clampedLeft}px`;
                dropdown.style.top = `${clampedTop}px`;
            };

            // マウスアップイベント（ドラッグ終了）
            const handleMouseUp = (e) => {
                if (!isDragging) return;
                
                isDragging = false;
                
                // ドラッグ中のスタイルを解除
                dropdown.classList.remove('dragging');
                header.style.cursor = 'move';
                
                // イベントリスナーを削除
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            };

            // タッチイベント対応（モバイル）
            header.addEventListener('touchstart', (e) => {
                e.preventDefault();
                const touch = e.touches[0];
                
                isDragging = true;
                startX = touch.clientX;
                startY = touch.clientY;
                
                const rect = dropdown.getBoundingClientRect();
                initialLeft = rect.left;
                initialTop = rect.top;
                
                dropdown.classList.add('dragging');
            });

            header.addEventListener('touchmove', (e) => {
                if (!isDragging) return;
                
                e.preventDefault();
                const touch = e.touches[0];
                
                const deltaX = touch.clientX - startX;
                const deltaY = touch.clientY - startY;
                
                const newLeft = initialLeft + deltaX;
                const newTop = initialTop + deltaY;
                
                const dropdownRect = dropdown.getBoundingClientRect();
                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;
                
                const clampedLeft = Math.max(0, Math.min(newLeft, viewportWidth - dropdownRect.width));
                const clampedTop = Math.max(0, Math.min(newTop, viewportHeight - dropdownRect.height));
                
                dropdown.style.left = `${clampedLeft}px`;
                dropdown.style.top = `${clampedTop}px`;
            });

            header.addEventListener('touchend', (e) => {
                if (!isDragging) return;
                
                isDragging = false;
                dropdown.classList.remove('dragging');
            });
        }

        /**
         * フィルタ適用後にセル交換機能を再初期化
         */
        _reinitializeCellSwap() {
            try {
                // セル交換機能の再初期化
                if (window.LedgerV2 && window.LedgerV2.TableInteract && window.LedgerV2.TableInteract.cellSwapManager) {
                    window.LedgerV2.TableInteract.cellSwapManager.initializeDragDrop();
                } else {
                    console.warn('⚠️ セル交換マネージャーが見つかりません');
                }
            } catch (error) {
                console.error('❌ セル交換機能再初期化エラー:', error);
            }
        }

        /**
         * フィルタ行での検索実行時にオートフィルタをクリア
         */
        clearFiltersOnRowSearch() {
            // 全てのフィルタをクリア
            this.filters.clear();
            this.tempFilters.clear();
            
            // フィルタボタンの状態を更新
            this._updateFilterButtonStates();
            
            // ドロップダウンを閉じる
            this._closeAllDropdowns();
        }
    }

    // グローバルに公開
    if (!window.LedgerV2) {
        window.LedgerV2 = {};
    }
    if (!window.LedgerV2.AutoFilter) {
        window.LedgerV2.AutoFilter = {};
    }
    
    window.LedgerV2.AutoFilter.AutoFilterManagerV2 = AutoFilterManagerV2;

    // ドキュメント外クリックでドロップダウンを閉じる
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.filter-dropdown') &&
            !e.target.closest('.auto-filter-button')) {
            if (window.autoFilterManager) {
                window.autoFilterManager._closeAllDropdowns();
            }
        }
    });

})(); 