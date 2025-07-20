/**
 * 統合台帳システム v2 - テーブル描画・表示
 * @description テーブル表示・セル作成・レンダリング機能
 * @version 2.0.0
 * 
 * 🎯 **ファイルの責任範囲**
 * ✅ データをテーブルに描画・表示
 * ✅ 各種セル要素の作成（テキスト・入力・選択・リンク・行番号）
 * ✅ ページネーションとの連携
 * ✅ テーブル行・セルのDOM構造作成
 * ✅ スタイル適用・CSS クラス設定
 * 
 * ❌ **やってはいけないこと（責任範囲外）**
 * ❌ ユーザーイベント処理（クリック・ドラッグ等）
 * ❌ インライン編集機能
 * ❌ システム初期化・設定管理
 * ❌ API通信・データ検索
 * ❌ ヘッダー・フィルター作成
 * 
 * 📦 **含まれるクラス**
 * - TableDisplayManager: メインの表示管理クラス
 * 
 * 🔗 **依存関係**
 * - DOMHelper (DOM操作)
 * - StyleManager (スタイル管理)
 * - FieldValueProcessor (値処理)
 * - dataManager (データ管理)
 * - window.paginationManager (ページネーション)
 * 
 * 💡 **使用例**
 * ```javascript
 * const tableManager = new TableDisplayManager();
 * tableManager.displayIntegratedData(records, null, false);
 * ```
 */
(function() {
    'use strict';

    // グローバル名前空間確保
    window.LedgerV2 = window.LedgerV2 || {};
    window.LedgerV2.TableRender = {};

    // =============================================================================
    // テーブル表示管理
    // =============================================================================

    class TableDisplayManager {
        constructor() {
            this.currentData = [];
            this.isEditMode = false;
        }

        /**
         * 統合データをテーブルに表示
         */
        async displayIntegratedData(integratedRecords, targetAppId = null, isPagedData = false) {
            const processId = window.BackgroundProcessMonitor.startProcess('テーブル描画');

            try {
                // グローバルにTableDisplayManagerを保存（ページング処理で使用）
                window.tableDisplayManager = this;

                if (!integratedRecords || integratedRecords.length === 0) {
    
                    window.dataManager.clearTable();
                    this.currentData = [];
                    
                    if (processId) {
                        window.BackgroundProcessMonitor.updateProcess(processId, '完了', 'データなし');
                        setTimeout(() => window.BackgroundProcessMonitor.endProcess(processId), 500);
                    }
                return;
            }

                // 進行状況を更新
                if (processId) {
                    window.BackgroundProcessMonitor.updateProcess(processId, '実行中', 
                        `${integratedRecords.length}件のデータをテーブルに描画中...`);
                }


                
                // 🔄 追加モードの場合は重複を除外
                let recordsToAdd = integratedRecords;
                if (window.dataManager?.appendMode) {
                    const existingKeys = window.dataManager.getExistingRecordKeys();
                    recordsToAdd = integratedRecords.filter(record => 
                        !existingKeys.has(record.integrationKey)
                    );
                }
                
                // データマネージャーにデータを保存
                if (window.dataManager) {
                    window.dataManager.setCurrentData(recordsToAdd);
                }

                // 現在のデータを保存
                this.currentData = recordsToAdd;

                // HTMLで既にテーブルが定義されているので、ヘッダー初期化のみ実行（追加モードでない場合のみ）
                if (!window.dataManager?.appendMode) {
                    await window.LedgerV2.TableHeader.TableCreator.createTable();
                }

                // テーブル本体を描画
                const tbody = document.getElementById('my-tbody');
                if (!tbody) {
                    console.error('❌ テーブル本体が見つかりません');
                    
                    if (processId) {
                        window.BackgroundProcessMonitor.updateProcess(processId, 'エラー', 'テーブル要素エラー');
                        setTimeout(() => window.BackgroundProcessMonitor.endProcess(processId), 1000);
                }
                return;
                }

                // 進行状況を更新
                if (processId) {
                    window.BackgroundProcessMonitor.updateProcess(processId, '実行中', 'ページングとテーブル行を準備中...');
                }

                // DataManagerのclearTable()を使用（追加モード考慮済み）
                window.dataManager.clearTable();

                // 🔄 追加モードの場合は追加件数が0なら処理終了
                if (window.dataManager?.appendMode && recordsToAdd.length === 0) {
                    if (processId) {
                        window.BackgroundProcessMonitor.updateProcess(processId, '完了', '追加対象なし（重複）');
                        setTimeout(() => window.BackgroundProcessMonitor.endProcess(processId), 500);
                    }
                    return;
                }

                // 🔄 ページングが必要かどうかを判定し、適切なデータを決定
                let recordsToDisplay = recordsToAdd;
                let shouldCreatePagination = false;

                // ページング処理
                if (window.paginationManager) {
                    if (!isPagedData && !window.dataManager?.appendMode && recordsToAdd.length > 100) {
                        // ページングが必要な場合：全データをページングマネージャーに設定し、最初の100件のみ表示
                        window.paginationManager.setAllData(recordsToAdd);
                        recordsToDisplay = window.paginationManager.getCurrentPageData();
                        shouldCreatePagination = true;

                    } else if (window.dataManager?.appendMode) {
                        // 追加モードの場合は既存のページング情報を更新
                        window.paginationManager.setAllData([...window.paginationManager.allData, ...recordsToAdd]);
                    }
                }

                // フィールド順序を取得（fieldsConfigから）
                const fieldOrder = window.fieldsConfig ? 
                    window.fieldsConfig.map(field => field.fieldCode) : 
                    [];

                // 表示するレコードを行として追加
                let baseRowNumber = window.dataManager?.appendMode ? window.dataManager.getNextRowNumber() - 1 : 0;
                recordsToDisplay.forEach((record, index) => {
                    const row = this._createTableRow(record, fieldOrder, targetAppId, index, baseRowNumber);
                    tbody.appendChild(row);
                });



                // 🔄 追加モードでない場合のみ最大行番号を設定
                if (!window.dataManager?.appendMode) {
                    this._setMaxRowNumberFromDisplayedData();
                }

                // 📊 不整合統計情報を表示（テーブルの上）
                this._displayInconsistencyStatistics(recordsToDisplay);

                // ページングUIの作成/更新
                if (shouldCreatePagination && window.paginationUI) {
                    setTimeout(() => {
                        window.paginationUI.createPaginationUI();
                    }, 100);
                } else if (window.paginationUI && !isPagedData) {
                setTimeout(() => {
                    window.paginationUI.updatePaginationUI();
                }, 100);
            }

            // 🔄 セル交換機能の再初期化（テーブル描画完了後）
            setTimeout(() => {
                if (window.LedgerV2?.TableInteract?.cellSwapManager?.initializeDragDrop) {
                    window.LedgerV2.TableInteract.cellSwapManager.initializeDragDrop();
                }
            }, 200);

                // 🔍 追加モードでない場合のみオートフィルタ機能を初期化
                if (!window.dataManager?.appendMode) {
                    this._initializeAutoFilter();
                }

                // 完了状態を更新
                if (processId) {
                    window.BackgroundProcessMonitor.updateProcess(processId, '完了', 
                        `${recordsToAdd.length}件のテーブル表示完了`);
                    setTimeout(() => window.BackgroundProcessMonitor.endProcess(processId), 500);
                }

            } catch (error) {
                console.error('❌ テーブル描画エラー:', error);
                
                if (processId) {
                    window.BackgroundProcessMonitor.updateProcess(processId, 'エラー', 'テーブル描画エラー');
                    setTimeout(() => window.BackgroundProcessMonitor.endProcess(processId), 1000);
                }
                throw error;
            }
        }

        /**
         * テーブル行を作成
         */
        _createTableRow(record, fieldOrder, targetAppId, rowIndex = 0, baseRowNumber = 0) {
            const row = document.createElement('tr');
            
            // 行番号を設定（ページング対応）
            const actualRowNumber = window.dataManager?.appendMode ? 
                window.dataManager.getNextRowNumber() : 
                baseRowNumber + rowIndex + 1;
            
            row.setAttribute('data-row-id', actualRowNumber);
            row.setAttribute('data-integration-key', record.integrationKey);

            // 🔧 台帳間不整合の検知と表示
            const inconsistencyInfo = this._detectLedgerInconsistency(record);
            if (inconsistencyInfo.hasInconsistency) {
                row.classList.add('ledger-inconsistent');
                row.setAttribute('data-inconsistency-info', JSON.stringify(inconsistencyInfo));
                
                // 不整合情報をツールチップとして表示
                const tooltip = this._createInconsistencyTooltip(inconsistencyInfo);
                row.title = tooltip;
            }

            // フィールド順序に従ってセルを作成
            fieldOrder.forEach((fieldCode, index) => {
                const cell = this._createDataCell(record, fieldCode, row, rowIndex);
                
                // 🔧 不整合がある場合、関連するセルにマーキング
                if (inconsistencyInfo.hasInconsistency) {
                    const field = window.fieldsConfig.find(f => f.fieldCode === fieldCode);
                    if (field && field.isPrimaryKey) {
                        const inconsistentApps = inconsistencyInfo.inconsistentFields[fieldCode];
                        if (inconsistentApps && inconsistentApps.length > 0) {
                            cell.classList.add('field-inconsistent');
                            cell.setAttribute('data-inconsistent-apps', inconsistentApps.join(','));
                        }
                    }
                }
                
                row.appendChild(cell);
            });

            // 台帳リンクなしスタイルを適用
            this._applyUnlinkedLedgerStyles(row, record);

            return row;
        }

        /**
         * 台帳間の不整合を検知
         */
        _detectLedgerInconsistency(record) {
            const inconsistencyInfo = {
                hasInconsistency: false,
                inconsistentFields: {},
                ledgerCombinations: {},
                summary: ''
            };

            if (!record.ledgerData) {
                return inconsistencyInfo;
            }

            // 各台帳の主キー組み合わせを取得
            const ledgerCombinations = {};
            const primaryKeyFields = window.LedgerV2.Utils.FieldValueProcessor.getAllPrimaryKeyFields();
            
            Object.keys(record.ledgerData).forEach(appType => {
                const ledgerRecord = record.ledgerData[appType];
                if (ledgerRecord) {
                    const combination = {};
                    primaryKeyFields.forEach(fieldCode => {
                        if (ledgerRecord[fieldCode] && ledgerRecord[fieldCode].value) {
                            combination[fieldCode] = ledgerRecord[fieldCode].value;
                        }
                    });
                    ledgerCombinations[appType] = combination;
                }
            });

            // 不整合をチェック
            primaryKeyFields.forEach(fieldCode => {
                const values = new Set();
                const appsWithValue = [];
                
                Object.keys(ledgerCombinations).forEach(appType => {
                    const value = ledgerCombinations[appType][fieldCode];
                    if (value) {
                        values.add(value);
                        appsWithValue.push(appType);
                    }
                });

                // 同じフィールドで異なる値がある場合は不整合
                if (values.size > 1) {
                    inconsistencyInfo.hasInconsistency = true;
                    inconsistencyInfo.inconsistentFields[fieldCode] = appsWithValue;
                }
            });

            inconsistencyInfo.ledgerCombinations = ledgerCombinations;
            
            if (inconsistencyInfo.hasInconsistency) {
                inconsistencyInfo.summary = this._generateInconsistencySummary(ledgerCombinations, inconsistencyInfo.inconsistentFields);
            }

            return inconsistencyInfo;
        }

        /**
         * 不整合情報のサマリーを生成
         */
        _generateInconsistencySummary(ledgerCombinations, inconsistentFields) {
            let summary = '🚨 台帳間不整合検出:\n\n';
            
            Object.keys(ledgerCombinations).forEach(appType => {
                const combination = ledgerCombinations[appType];
                const ledgerName = window.LedgerV2.Utils.FieldValueProcessor.getLedgerNameByApp(appType);
                
                summary += `【${ledgerName}】\n`;
                Object.keys(combination).forEach(fieldCode => {
                    const field = window.fieldsConfig.find(f => f.fieldCode === fieldCode);
                    const fieldLabel = field ? field.label : fieldCode;
                    summary += `  ${fieldLabel}: ${combination[fieldCode]}\n`;
                });
                summary += '\n';
            });

            summary += '不整合フィールド:\n';
            Object.keys(inconsistentFields).forEach(fieldCode => {
                const field = window.fieldsConfig.find(f => f.fieldCode === fieldCode);
                const fieldLabel = field ? field.label : fieldCode;
                summary += `  • ${fieldLabel}\n`;
            });

            return summary;
        }

        /**
         * 不整合情報のツールチップを作成
         */
        _createInconsistencyTooltip(inconsistencyInfo) {
            return inconsistencyInfo.summary;
        }

        /**
         * データセルを作成
         * 🚨 PROTECTED: ②パターン（ページング時の直接input/select生成）で使用 - 削除禁止
         */
        _createDataCell(record, fieldCode, row, rowIndex = 0) {
            const cell = document.createElement('td');
            const field = window.fieldsConfig.find(f => f.fieldCode === fieldCode);
            
            if (!field) {
                cell.textContent = '';
                return cell;
            }

            // セル属性設定
            cell.setAttribute('data-field-code', fieldCode);
            cell.setAttribute('data-source-app', field.sourceApp || '');
            cell.classList.add('table-cell');

            if (field.isPrimaryKey) {
                cell.setAttribute('data-is-primary-key', 'true');
            }
            if (field.isRecordId) {
                cell.setAttribute('data-is-record-id', 'true');
            }
            
            // ユーザーから隠すフィールドの場合、専用クラスを追加
            if (field.isHiddenFromUser) {
                cell.classList.add('cell-hidden-from-user');
            }

            const value = FieldValueProcessor.process(record, fieldCode, '');
            
            // ✨ 初期値をdata属性に保存（ハイライト制御用）
            cell.setAttribute('data-original-value', value || '');
            
            const width = field.width || '100px';

            // セルタイプ別処理
            switch (field.cellType) {
                case 'row_number':
                    this._createRowNumberCell(cell, rowIndex);
                    break;
                case 'modification_checkbox':
                    this._createModificationCheckboxCell(cell, row);
                    break;
                case 'ledger_inconsistency':
                    this._createLedgerInconsistencyCell(cell, record, row);
                    break;
                case 'link':
                    this._createLinkCell(cell, value, record, field);
                    break;
                case 'input':
                    this._createInputCell(cell, value, field, row);
                    break;
                case 'select':
                case 'dropdown':
                    this._createSelectCell(cell, value, field, row);
                    break;
                default:
                    this._createTextCell(cell, value, field);
                    break;
            }

            StyleManager.applyCellStyles(cell, width);
            return cell;
        }

        /**
         * 行番号セルを作成
         */
        _createRowNumberCell(cell, rowIndex) {
            let displayRowNumber;
            let actualRowNumber;
            
            // 通常モード時：ページネーション情報を考慮
            if (window.paginationManager && window.paginationManager.allData.length > 100 && !window.dataManager.appendMode) {
                const paginationInfo = window.paginationManager.getPaginationInfo();
                displayRowNumber = paginationInfo.startRecord + rowIndex;
                actualRowNumber = displayRowNumber; // ページング環境では表示行番号 = 実際の行番号
            }
            // デフォルト（追加モード含む）：渡されたrowIndexをそのまま使用（1ベース）
            else {
                displayRowNumber = rowIndex + 1;
                actualRowNumber = displayRowNumber;
            }
            
            cell.textContent = displayRowNumber;
            cell.classList.add('row-number-cell', 'table-cell');
            
            // 行要素のdata-row-idが未設定の場合のみ設定（重複防止）
            const row = cell.closest('tr');
            if (row && !row.getAttribute('data-row-id')) {
                row.setAttribute('data-row-id', actualRowNumber);
            }
        }

        /**
         * 変更チェックボックスセルを作成
         */
        _createModificationCheckboxCell(cell, row) {
            // セルにスタイルクラスを適用
            cell.classList.add('modification-checkbox-cell', 'table-cell');
            
            // チェックボックス要素を作成
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.classList.add('modification-checkbox');
            
            // 🔧 編集モード状態に応じて初期状態を設定
            const isEditMode = window.editModeManager && window.editModeManager.isEditMode;
            checkbox.disabled = !isEditMode; // 編集モードでは有効化、閲覧モードでは無効化
            
            // 🔧 rowが存在する場合のみrow-modifiedクラスをチェック
            checkbox.checked = row && row.classList ? row.classList.contains('row-modified') : false;
            
            cell.appendChild(checkbox);
        }

        /**
         * 台帳不整合表示セルを作成
         */
        _createLedgerInconsistencyCell(cell, record, row) {
            cell.classList.add('ledger-inconsistency-cell', 'table-cell');
            
            // 不整合を検知
            const inconsistencies = this._detectLedgerInconsistencies(record);
            
            if (inconsistencies.length > 0) {
                // 不整合がある場合 - セルのテキストコンテンツを設定
                cell.textContent = '不整合';
                cell.style.cursor = 'pointer';
                cell.title = '台帳間で不整合があります（クリックで詳細表示）';
                
                // CSSクラスでアイコン表示を制御
                cell.classList.add('inconsistency-warning');
                
                // クリックで詳細表示
                cell.addEventListener('click', () => {
                    this._showInconsistencyDetails(inconsistencies, record);
                });
                
                // 行全体に不整合スタイルを適用
                if (row) {
                    row.classList.add('row-inconsistent');
                }
            } else {
                // 不整合がない場合 - セルのテキストコンテンツを設定
                cell.textContent = '正常';
                cell.title = '台帳間で整合性が取れています';
                
                // CSSクラスでアイコン表示を制御
                cell.classList.add('inconsistency-ok');
            }
        }

        /**
         * リンクセルを作成
         */
        _createLinkCell(cell, value, record, field) {
            if (!value) {
                cell.textContent = '';
                return;
            }

            const link = document.createElement('a');
            link.href = this._buildRecordUrl(record, field);
            link.target = '_blank';
            link.textContent = value;
            link.classList.add('record-link');

            cell.appendChild(link);
        }

        /**
         * 入力セルを作成
         * 🚨 PROTECTED: ②パターン（ページング時の直接input/select生成）で使用 - 削除禁止
         */
        _createInputCell(cell, value, field, row) {
            // 🚨 PROTECTED: ②パターン - 編集モード時の直接input要素作成処理
            const input = document.createElement('input');
            input.type = 'text';
            input.value = value || '';
            input.style.width = '100%';
            input.style.border = 'none';
            input.style.background = 'transparent';
            input.style.outline = 'none';
            
            // フィールド幅に応じたinput幅設定
            const fieldWidth = field.width || '100px';
            const inputWidthClass = this._getInputWidthClass(fieldWidth);
            if (inputWidthClass) {
                input.classList.add(inputWidthClass);
            }

            // 🔧 input要素の値変更時イベントハンドラを設定
            this._attachCellModificationListeners(input, cell, row);

            cell.appendChild(input);
        }

        /**
         * セレクトセルを作成
         * 🚨 PROTECTED: ②パターン（ページング時の直接input/select生成）で使用 - 削除禁止
         */
        _createSelectCell(cell, value, field, row) {
            // 🚨 PROTECTED: ②パターン - 編集モード時の直接select要素作成処理
            const select = document.createElement('select');
            select.style.width = '100%';
            select.style.border = 'none';
            select.style.background = 'white';
            select.style.color = '#333';
            select.style.fontSize = '11px';

            // 🔧 値の優先順位：引数のvalue → data-original-value → 空文字
            let actualValue = value;
            if (!actualValue) {
                const originalValue = cell.getAttribute('data-original-value');
                if (originalValue) {
                    actualValue = originalValue;
                }
            }

            // 空のオプション
            const emptyOption = document.createElement('option');
            emptyOption.value = '';
            emptyOption.textContent = '';
            select.appendChild(emptyOption);

            // オプション追加
            if (field.options) {
                field.options.forEach(option => {
                    const optionElement = document.createElement('option');
                    // オプションが文字列の場合とオブジェクトの場合に対応
                    const optionValue = typeof option === 'string' ? option : option.value;
                    const optionLabel = typeof option === 'string' ? option : option.label;
                    
                    optionElement.value = optionValue;
                    optionElement.textContent = optionLabel;
                    if (optionValue === actualValue) {
                        optionElement.selected = true;
                    }
                    select.appendChild(optionElement);
                });
            }

            select.value = actualValue || '';

            // 🔧 select要素の値変更時イベントハンドラを設定
            this._attachCellModificationListeners(select, cell, row);

            cell.appendChild(select);
        }

        /**
         * テキストセルを作成
         */
        _createTextCell(cell, value, field) {
            // 主キーフィールドの場合は値と分離ボタンを含むコンテナを作成
            if (field && field.isPrimaryKey) {
                this._createPrimaryKeyCell(cell, value, field);
            } else {
                cell.textContent = value || '';
            }
        }

        /**
         * 主キーセルを作成（値 + 分離ボタン）
         */
        _createPrimaryKeyCell(cell, value, field) {
            // コンテナ作成
            const container = document.createElement('div');
            container.classList.add('primary-key-container');

            // 値表示部分
            const valueSpan = document.createElement('span');
            valueSpan.textContent = value || '';
            valueSpan.classList.add('primary-key-value');

            // 分離ボタン
            const separateBtn = document.createElement('button');
            separateBtn.innerHTML = '✂️';
            separateBtn.title = `${field.label}を分離`;
            separateBtn.classList.add('separate-btn');

            // 値が空の場合はボタンを無効化
            const isEmpty = !value || value.trim() === '';
            if (isEmpty) {
                separateBtn.disabled = true;
                //separateBtn.style.opacity = '0.3';
                separateBtn.style.pointerEvents = 'none';
                separateBtn.title = '分離対象の値がないため無効';
            }

            // クリックイベント
            separateBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._handleSeparateClick(cell, field, value);
            });

            container.appendChild(valueSpan);
            container.appendChild(separateBtn);
            cell.appendChild(container);
        }

        /**
         * 分離ボタンクリック処理
         */
        _handleSeparateClick(cell, field, value) {
            
            // 現在のセルの実際の値を取得（セル交換後の値を考慮）
            const currentValue = this._getCellValue(cell, field);
            
            // 空の値の場合は処理を停止
            if (!currentValue || currentValue.trim() === '') {
                console.warn('⚠️ 分離対象の値が空です。分離処理をスキップします。');
                return;
            }
            
            // 行を取得
            const row = cell.closest('tr');
            if (!row) {
                return;
            }

            // 分離処理実行（現在の値を使用）
            this._executeSeparation(row, field, currentValue);
        }

        /**
         * 分離処理実行
         */
        _executeSeparation(row, field, value) {
            try {
                
                // 現在の統合キーを取得
                const integrationKey = row.getAttribute('data-integration-key');
                if (!integrationKey) {
                    throw new Error('統合キーが見つかりません');
                }



                // 統合キーを解析して分離対象を特定
                const keyParts = integrationKey.split('|');


                // 分離対象のフィールドを除いた新しい統合キーを作成
                const newKeyParts = keyParts.filter(part => {
                    if (!part.includes(':')) return false;
                    const [app, val] = part.split(':');
                    const shouldKeep = !(field.sourceApp === app && val === value);

                    return shouldKeep;
                });



                if (newKeyParts.length === keyParts.length) {

                    throw new Error('分離対象が見つかりません');
                }

                // 元の行を更新（分離対象を除去）
                const newIntegrationKey = newKeyParts.join('|');
                row.setAttribute('data-integration-key', newIntegrationKey);
                
                // 分離された項目用の新しい行を作成（元の行をクリアする前に）
                const separatedRow = this._createSeparatedRow(row, field, value, integrationKey);

                // 同じsourceAppのフィールドをすべて元の行からクリア
                this._clearFieldsFromOriginalRow(row, field.sourceApp);

                // 🎨 分離処理後のハイライト処理
                this._updateHighlightsAfterSeparation(row, separatedRow);

            } catch (error) {
                console.error('❌ 分離処理エラー:', error);
                alert(`分離処理中にエラーが発生しました: ${error.message}`);
            }
        }

        /**
         * 分離された行を作成
         */
        _createSeparatedRow(originalRow, separatedField, separatedValue, originalIntegrationKey) {
            // 新しい行を作成
            const newRow = originalRow.cloneNode(true);
            
            // 新しい統合キーを設定（分離されたフィールドのみ）
            const separatedIntegrationKey = `${separatedField.sourceApp}:${separatedValue}`;
            newRow.setAttribute('data-integration-key', separatedIntegrationKey);
            
            // 新しい行番号を取得（最大値管理から）
            const newRowNumber = dataManager.getNextRowNumber();
            
            // 実際の行番号をdata-row-idに設定（表示行番号ではない）
            newRow.setAttribute('data-row-id', newRowNumber);

            // 分離されたsourceApp以外のフィールドをクリアし、すべてのdata-original-valueを空にする
            this._setupSeparatedRow(newRow, separatedField, newRowNumber, originalRow);

            // 元の行の後に新しい行を挿入
            originalRow.parentNode.insertBefore(newRow, originalRow.nextSibling);
            
            // 🔄 分離行にドラッグ&ドロップ機能を設定
            this._setupDragAndDropForSeparatedRow(newRow);
            
            // 新しい行をハイライト
            // newRow.style.backgroundColor = '#e8f5e8';
            // setTimeout(() => {
            //     newRow.style.backgroundColor = '';
            // }, 3000);

            // 戻り値として分離行を返す
            return newRow;
        }

        /**
         * 台帳間の不整合を検知
         */
        _detectLedgerInconsistencies(record) {
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

                    // 値が異なる場合、または片方だけ空欄の場合は不整合
                    if ((baseValue || compareValue) && baseValue !== compareValue) {
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
         * 不整合詳細を表示
         */
        _showInconsistencyDetails(inconsistencies, record) {
            const modal = document.createElement('div');
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

            const content = document.createElement('div');
            content.style.cssText = `
                background: white;
                border-radius: 8px;
                max-width: 1400px;
                max-height: 90vh;
                width: 95%;
                height: 80vh;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
                display: flex;
                overflow: visible;
            `;

            // 左側パネル（詳細情報）
            const leftPanel = document.createElement('div');
            leftPanel.style.cssText = `
                flex: 1;
                padding: 20px;
                overflow-y: auto;
                border-right: 1px solid #e0e0e0;
            `;

            // 右側パネル（インラインフレーム）
            const rightPanel = document.createElement('div');
            rightPanel.style.cssText = `
                flex: 1;
                display: flex;
                flex-direction: column;
                background: #f5f5f5;
            `;

            // 台帳データを整理
            const ledgerData = this._organizeLedgerDataForTable(record, inconsistencies);
            
            let html = `
                <h3 style="margin-top: 0; color: #d32f2f; border-bottom: 2px solid #f44336; padding-bottom: 10px;">⚠️ 台帳間不整合の詳細</h3>
                <p style="margin-bottom: 20px; color: #666;">以下の台帳間で主キーの不整合があります：</p>
                
                <div style="margin-bottom: 20px;">
                    ${this._createInconsistencyTable(ledgerData)}
                </div>
                
                <hr style="margin: 20px 0; border: none; border-top: 1px solid #e0e0e0;">
                <h4 style="color: #1976d2; margin-bottom: 15px;">各台帳の詳細 (クリックで表示)</h4>
            `;
            
            // 台帳リンクボタンを表示
            if (record.ledgerData) {
                Object.entries(record.ledgerData).forEach(([ledgerType, ledgerRecord]) => {
                    const recordId = ledgerRecord.$id?.value || ledgerRecord.レコード番号?.value;
                    const ledgerName = this._getLedgerDisplayName(ledgerType);
                    
                    html += `<div style="margin-bottom: 10px; padding: 10px; border: 1px solid #e0e0e0; border-radius: 4px; background: #f9f9f9; display: flex; justify-content: space-between; align-items: center;">`;
                    html += `<strong style="color: #1976d2;">${ledgerName}</strong>`;
                    
                    if (recordId) {
                        const appId = window.LedgerV2.Config.APP_IDS[ledgerType];
                        const recordUrl = `/k/${appId}/show#record=${recordId}`;
                        html += `
                            <div>
                                <button class="ledger-link-btn" data-url="${recordUrl}" data-ledger="${ledgerType}" 
                                    style="padding: 6px 12px; margin-right: 8px; background: #1976d2; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
                                    📱 フレーム表示
                                </button>
                                <button class="ledger-window-btn" data-url="${recordUrl}" data-ledger="${ledgerType}"
                                    style="padding: 6px 12px; background: #4caf50; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
                                    🔗 新しい窓
                                </button>
                            </div>
                        `;
                    }
                    html += `</div>`;
                });
            }

            html += `
                <div style="text-align: right; margin-top: 20px;">
                    <button id="close-inconsistency-modal" style="
                        padding: 10px 20px;
                        background-color: #1976d2;
                        color: white;
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 14px;
                    ">閉じる</button>
                </div>
            `;

            leftPanel.innerHTML = html;

            // 右側パネルの初期表示
            rightPanel.innerHTML = `
                <div style="padding: 20px; text-align: center; color: #666; display: flex; align-items: center; justify-content: center; height: 100%;">
                    <div>
                        <div style="font-size: 48px; margin-bottom: 10px;">📋</div>
                        <div>台帳リンクをクリックすると<br>ここに詳細が表示されます</div>
                    </div>
                </div>
            `;

            content.appendChild(leftPanel);
            content.appendChild(rightPanel);
            modal.appendChild(content);
            document.body.appendChild(modal);

            // リンクボタンのイベントリスナー
            modal.addEventListener('click', (e) => {
                if (e.target.classList.contains('ledger-link-btn')) {
                    const url = e.target.getAttribute('data-url');
                    const ledgerType = e.target.getAttribute('data-ledger');
                    this._showLedgerInFrame(rightPanel, url, ledgerType);
                } else if (e.target.classList.contains('ledger-window-btn')) {
                    const url = e.target.getAttribute('data-url');
                    window.open(url, '_blank', 'width=1200,height=800,scrollbars=yes,resizable=yes');
                }
            });

            // 閉じるボタンのイベント
            document.getElementById('close-inconsistency-modal').addEventListener('click', () => {
                document.body.removeChild(modal);
            });

            // モーダル外クリックで閉じる
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    document.body.removeChild(modal);
                }
            });
        }

        /**
         * 台帳データをテーブル表示用に整理
         */
        _organizeLedgerDataForTable(record, inconsistencies) {
            const primaryKeyMapping = window.LedgerV2.Utils.FieldValueProcessor.getAppToPrimaryKeyMapping();
            const ledgerTypes = ['PC', 'USER', 'EXT', 'SEAT'];
            const fieldCodes = Object.values(primaryKeyMapping);
            
            // 不整合フィールドを特定
            const inconsistentFields = new Set();
            inconsistencies.forEach(inc => {
                inconsistentFields.add(inc.fieldCode);
            });
            
            const tableData = {
                headers: ['台帳名', ...fieldCodes.map(code => {
                    const field = window.fieldsConfig.find(f => f.fieldCode === code);
                    return field ? field.label : code;
                })],
                rows: [],
                inconsistentFields: inconsistentFields,
                fieldCodes: fieldCodes
            };
            
            ledgerTypes.forEach(ledgerType => {
                if (record.ledgerData[ledgerType]) {
                    const ledgerRecord = record.ledgerData[ledgerType];
                    const row = {
                        ledgerName: this._getLedgerDisplayName(ledgerType),
                        values: fieldCodes.map(fieldCode => {
                            const fieldData = ledgerRecord[fieldCode];
                            return fieldData && fieldData.value ? fieldData.value : '';
                        })
                    };
                    tableData.rows.push(row);
                }
            });
            
            return tableData;
        }

        /**
         * 不整合テーブルを作成
         */
        _createInconsistencyTable(tableData) {
            // 主キーマッピングを取得（フィールドコード → 台帳タイプ）
            const primaryKeyToLedger = this._getPrimaryKeyToLedgerMapping();
            
            let tableHtml = `
                <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 15px;">
                    <thead>
                        <tr style="background: #f5f5f5;">
            `;
            
            // ヘッダー行
            tableData.headers.forEach((header, index) => {
                const isInconsistent = index > 0 && tableData.inconsistentFields.has(tableData.fieldCodes[index - 1]);
                const headerStyle = isInconsistent ? 
                    'padding: 8px; border: 1px solid #ddd; font-weight: bold; background: #ffebee; color: #d32f2f;' :
                    'padding: 8px; border: 1px solid #ddd; font-weight: bold;';
                tableHtml += `<th style="${headerStyle}">${header}</th>`;
            });
            
            tableHtml += `
                        </tr>
                    </thead>
                    <tbody>
            `;
            
            // データ行
            tableData.rows.forEach(row => {
                tableHtml += `<tr>`;
                
                // 台帳名
                tableHtml += `<td style="padding: 8px; border: 1px solid #ddd; font-weight: bold; background: #f9f9f9;">${row.ledgerName}</td>`;
                
                // 各フィールドの値
                row.values.forEach((value, index) => {
                    const fieldCode = tableData.fieldCodes[index];
                    const isInconsistent = tableData.inconsistentFields.has(fieldCode);
                    const isPrimaryKey = this._isPrimaryKeyCell(row.ledgerName, fieldCode, primaryKeyToLedger);
                    
                    let cellStyle = 'padding: 8px; border: 1px solid #ddd;';
                    
                    // 主キーセルの場合
                    if (isPrimaryKey) {
                        if (isInconsistent) {
                            cellStyle += ' background: #d32f2f; color: white; font-weight: bold; border: 2px solid #b71c1c;';
                        } else {
                            cellStyle += ' background: #4caf50; color: white; font-weight: bold; border: 2px solid #2e7d32;';
                        }
                    } else {
                        // 非主キーセルの場合
                        if (isInconsistent) {
                            cellStyle += ' background: #ffebee; color: #d32f2f; font-weight: bold;';
                        }
                    }
                    
                    const displayValue = value || '（空欄）';
                    tableHtml += `<td style="${cellStyle}">${displayValue}</td>`;
                });
                
                tableHtml += `</tr>`;
            });
            
            tableHtml += `
                    </tbody>
                </table>
            `;
            
            // 凡例を追加
            tableHtml += `
                <div style="font-size: 12px; color: #666; margin-top: 10px;">
                    <div style="display: flex; gap: 20px; flex-wrap: wrap;">
                        <div style="display: flex; align-items: center; gap: 5px;">
                            <div style="width: 12px; height: 12px; background: #4caf50; border: 2px solid #2e7d32;"></div>
                            <span>主キー（正常）</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 5px;">
                            <div style="width: 12px; height: 12px; background: #d32f2f; border: 2px solid #b71c1c;"></div>
                            <span>主キー（不整合）</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 5px;">
                            <div style="width: 12px; height: 12px; background: #ffebee; border: 1px solid #ddd;"></div>
                            <span>非主キー（不整合）</span>
                        </div>
                    </div>
                    <div style="margin-top: 8px; font-size: 11px; color: #888;">
                        ※ 空欄の場合は「（空欄）」と表示されます
                    </div>
                </div>
            `;
            
            return tableHtml;
        }

        /**
         * 主キーフィールドと台帳のマッピングを取得
         */
        _getPrimaryKeyToLedgerMapping() {
            // config.jsから主キーフィールドを動的に取得
            const mapping = {};
            
            if (window.fieldsConfig) {
                window.fieldsConfig.forEach(field => {
                    if (field.isPrimaryKey && field.category) {
                        mapping[field.fieldCode] = field.category;
                    }
                });
            }
            
            return mapping;
        }

        /**
         * 指定されたセルが主キーセルかどうかを判定
         */
        _isPrimaryKeyCell(ledgerName, fieldCode, primaryKeyToLedger) {
            const expectedLedger = primaryKeyToLedger[fieldCode];
            return expectedLedger === ledgerName;
        }

        /**
         * 台帳表示名を取得
         */
        _getLedgerDisplayName(ledgerType) {
            // config.jsから台帳表示名を動的に取得
            if (window.fieldsConfig) {
                const field = window.fieldsConfig.find(f => f.sourceApp === ledgerType && f.isPrimaryKey);
                if (field && field.category) {
                    return field.category;
                }
            }
            
            // フォールバック
            return `${ledgerType}台帳`;
        }

        /**
         * 台帳詳細をインラインフレームで表示
         */
        _showLedgerInFrame(rightPanel, url, ledgerType) {
            rightPanel.innerHTML = `
                <div style="padding: 10px; background: #1976d2; color: white; display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: bold;">${ledgerType}台帳の詳細</span>
                    <button id="close-frame-btn" style="background: none; border: none; color: white; cursor: pointer; font-size: 16px;">✕</button>
                </div>
                <iframe src="${url}" style="width: 100%; height: calc(100% - 50px); border: none; background: white;"></iframe>
            `;

            // フレーム閉じるボタン
            document.getElementById('close-frame-btn').addEventListener('click', () => {
                rightPanel.innerHTML = `
                    <div style="padding: 20px; text-align: center; color: #666; display: flex; align-items: center; justify-content: center; height: 100%;">
                        <div>
                            <div style="font-size: 48px; margin-bottom: 10px;">📋</div>
                            <div>台帳リンクをクリックすると<br>ここに詳細が表示されます</div>
                        </div>
                    </div>
                `;
            });
        }

        /**
         * 不整合統計情報を表示
         */
        _displayInconsistencyStatistics(records) {
            // 既存の統計情報を削除
            const existingStats = document.getElementById('inconsistency-statistics');
            if (existingStats) {
                existingStats.remove();
            }

            // 🔧 全件数を取得（ページング対応）
            let allRecords = records;
            if (window.paginationManager && window.paginationManager.allData.length > 0) {
                allRecords = window.paginationManager.allData;
            }

            // 統計情報を計算
            let inconsistentCount = 0;
            let consistentCount = 0;

            allRecords.forEach(record => {
                const inconsistencies = this._detectLedgerInconsistencies(record);
                if (inconsistencies.length > 0) {
                    inconsistentCount++;
                } else {
                    consistentCount++;
                }
            });

            // 統計情報表示エリアを作成
            const statsContainer = document.createElement('div');
            statsContainer.id = 'inconsistency-statistics';
            statsContainer.style.cssText = `
                margin: 10px 0;
                padding: 12px 16px;
                background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
                border: 1px solid #dee2e6;
                border-radius: 8px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            `;

            const totalCount = allRecords.length;
            const inconsistentPercentage = totalCount > 0 ? ((inconsistentCount / totalCount) * 100).toFixed(1) : 0;
            
            // 🔧 ページング情報を追加表示
            const currentPageInfo = window.paginationManager && window.paginationManager.allData.length > 100 
                ? ` (現在${records.length}件表示中)` 
                : '';

            statsContainer.innerHTML = `
                <div style="display: flex; align-items: center; gap: 20px; flex-wrap: wrap;">
                    <div style="font-weight: 600; color: #495057; font-size: 14px;">
                        📊 台帳整合性統計
                    </div>
                    <div style="display: flex; gap: 16px; align-items: center;">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span style="color: #28a745; font-size: 16px;">✓</span>
                            <span style="color: #28a745; font-weight: 500;">正常: ${consistentCount}件</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span style="color: #dc3545; font-size: 16px;">⚠️</span>
                            <span style="color: #dc3545; font-weight: 500;">不整合: ${inconsistentCount}件</span>
                        </div>
                        <div style="color: #6c757d; font-size: 13px;">
                            (全${totalCount}件中 ${inconsistentPercentage}%が不整合${currentPageInfo})
                        </div>
                    </div>
                </div>
            `;

            // テーブルの上に挿入
            const table = document.getElementById('my-table');
            if (table && table.parentNode) {
                table.parentNode.insertBefore(statsContainer, table);
            }
        }

        /**
         * レコードURLを構築
         */
        _buildRecordUrl(record, field) {
            if (!field.sourceApp || !record.recordIds) {
                return '#';
            }

            const sourceApp = field.sourceApp;
            if (!window.LedgerV2.Config.APP_URL_MAPPINGS[sourceApp]) {
                return '#';
            }

            const appId = window.LedgerV2.Config.APP_IDS[sourceApp];
            const recordId = record.recordIds[sourceApp];

            if (!appId || !recordId) {
                return '#';
            }

            return window.LedgerV2.Config.APP_URL_MAPPINGS[sourceApp].replace('{appId}', appId).replace('{recordId}', recordId);
        }

        /**
         * 主キーが紐づいていない台帳フィールドにスタイルを適用
         * 🚨 PROTECTED: ②パターン（ページング時の直接input/select生成）で使用 - 削除禁止
         */
        _applyUnlinkedLedgerStyles(row, record) {
            // 台帳アプリの主キーフィールドをチェック
            const sourceApps = new Set();
            const primaryKeysByApp = {};
            
            // 各フィールドの sourceApp を収集し、主キーフィールドを特定
            window.fieldsConfig.forEach(field => {
                if (field.sourceApp && field.sourceApp !== 'system') {
                    sourceApps.add(field.sourceApp);
                    if (field.isPrimaryKey) {
                        primaryKeysByApp[field.sourceApp] = field.fieldCode;
                    }
                }
            });
            
            // 各台帳アプリについて主キーの値をチェック
            sourceApps.forEach(sourceApp => {
                const primaryKeyField = primaryKeysByApp[sourceApp];
                if (primaryKeyField) {
                    const primaryKeyValue = FieldValueProcessor.process(record, primaryKeyField, '');
                    
                    // 主キーが空の場合、その台帳の全フィールドにクラスを付与
                    if (!primaryKeyValue || primaryKeyValue.trim() === '') {
                        
                        // その台帳のすべてのフィールドセルにクラスを付与
                        const cells = row.querySelectorAll(`td[data-source-app="${sourceApp}"]`);
                        cells.forEach(cell => {
                            cell.classList.add('cell-unlinked-ledger');
                        });
                    }
                }
            });
        }

        /**
         * 入力幅クラスを取得
         * 🚨 PROTECTED: ②パターン（ページング時の直接input/select生成）で使用 - 削除禁止
         */
        _getInputWidthClass(fieldWidth) {
            const widthMap = {
                '68px': 'input-width-68',
                '78px': 'input-width-78',
                '98px': 'input-width-98'
            };
            return widthMap[fieldWidth] || null;
        }

        /**
         * 表示されたデータから最大行番号を設定
         */
        _setMaxRowNumberFromDisplayedData() {
            let maxRowNumber = 0;
            
            // ページングが有効で全データ数が取得できる場合
            if (window.paginationManager && window.paginationManager.allData && window.paginationManager.allData.length > 0) {
                maxRowNumber = window.paginationManager.allData.length;
            } 
            // currentDataから算出
            else if (this.currentData && this.currentData.length > 0) {
                maxRowNumber = this.currentData.length;
            }
            // 最後の手段：実際のテーブルから取得
            else {
                const tbody = DOMHelper.getTableBody();
                if (tbody) {
                    const rows = tbody.querySelectorAll('tr');
                    maxRowNumber = rows.length;
                }
            }

            dataManager.setMaxRowNumber(maxRowNumber);
        }

        /**
         * オートフィルタ機能を初期化
         */
        _initializeAutoFilter() {
            if (!window.LedgerV2?.AutoFilter?.AutoFilterManagerV2) {
                console.warn('⚠️ オートフィルタ機能が見つかりません');
                return;
            }

            try {
                // 新しいオートフィルタマネージャーを作成（既存のクリアは行わない）
                window.autoFilterManager = new window.LedgerV2.AutoFilter.AutoFilterManagerV2();
                
                // 短い遅延後に初期化（DOM構築完了を確実にするため）
                setTimeout(() => {
                    if (window.autoFilterManager) {
                        window.autoFilterManager.initialize();
                    }
                }, 100);

            } catch (error) {
                console.error('❌ オートフィルタ初期化エラー:', error);
            }
        }

        /**
         * 元の行から指定されたsourceAppのフィールドをクリア
         */
        _clearFieldsFromOriginalRow(row, targetSourceApp) {
            const cells = row.querySelectorAll('td[data-field-code]');
            
            cells.forEach(cell => {
                const fieldCode = cell.getAttribute('data-field-code');
                const field = window.fieldsConfig.find(f => f.fieldCode === fieldCode);
                
                if (!field || field.sourceApp !== targetSourceApp) return;
                
                // 主キーフィールドの場合
                if (field.isPrimaryKey) {
                    const container = cell.querySelector('div');
                    if (container) {
                        const valueSpan = container.querySelector('span');
                        if (valueSpan) {
                            valueSpan.textContent = '';
                        }
                    } else {
                        cell.textContent = '';
                    }
                }
                // レコードIDフィールドの場合
                else if (field.isRecordId) {
                    cell.textContent = '';
                }
                // 通常フィールドの場合
                else {
                    const input = cell.querySelector('input, select');
                    if (input) {
                        input.value = '';
                    } else {
                        cell.textContent = '';
                    }
                }
            });
        }

        /**
         * 分離行を設定（指定されたsourceApp以外をクリア）
         */
        _setupSeparatedRow(newRow, separatedField, newRowNumber, originalRow) {
            if (!newRow || !separatedField || !originalRow) {
                console.error('❌ _setupSeparatedRow: 必要なパラメータが不足しています', { newRow, separatedField, originalRow });
                return;
            }

            const cells = newRow.querySelectorAll('td[data-field-code]');
            
            cells.forEach(cell => {
                if (!cell) {
                    console.warn('⚠️ _setupSeparatedRow: セルがnullです');
                    return;
                }
                const fieldCode = cell.getAttribute('data-field-code');
                const field = window.fieldsConfig.find(f => f.fieldCode === fieldCode);
                
                // すべてのセルのdata-original-valueを空にする
                cell.setAttribute('data-original-value', '');
                
                if (!field) return;

                // 行番号セルの場合は新しい番号を設定
                if (field.isRowNumber) {
                    cell.textContent = newRowNumber;
                    return;
                }

                // 分離されたsourceAppと異なるフィールドをクリア
                if (field.sourceApp && field.sourceApp !== separatedField.sourceApp) {
                    
                    // 主キーフィールドの場合
                    if (field.isPrimaryKey) {
                        const container = cell.querySelector('div');
                        if (container) {
                            const valueSpan = container.querySelector('span');
                            if (valueSpan) {
                                valueSpan.textContent = '';
                            }
                        } else {
                            cell.textContent = '';
                        }
                    }
                    // レコードIDフィールドの場合
                    else if (field.isRecordId) {
                        cell.textContent = '';
                    }
                    // 通常フィールドの場合
                    else {
                        const input = cell.querySelector('input, select');
                        if (input) {
                            input.value = '';
                        } else {
                            cell.textContent = '';
                        }
                    }
                } else if (field.sourceApp === separatedField.sourceApp) {
                    // 保持されるフィールドの値を元のレコードデータから取得
                    let currentValue = '';
                    
                    // 元の行のdata-integration-keyから元のレコードを特定
                    const originalIntegrationKey = newRow.getAttribute('data-integration-key')?.replace('_separated', '');
                    
                    // 🔧 元の行から直接値を取得（DOM検索不要）
                    const originalCell = originalRow.querySelector(`td[data-field-code="${fieldCode}"]`);

                    
                    if (originalCell) {
                        currentValue = this._getCellValue(originalCell, field);

                        } else {

                    }
                    
                    // 🔧 分離先のセルに値を正しく設定

                    
                    if (currentValue) {
                        // 分離時専用の値設定（data-original-valueを空のまま保持）
                        this._setCellValueForSeparation(cell, currentValue, field);
                    } else {

                    }
                }
            });
        }

        /**
         * 分離行にドラッグ&ドロップ機能を設定（既存システム再利用）
         */
        _setupDragAndDropForSeparatedRow(newRow) {
            try {
                
                // 既存のCellSwapManagerを使用して行単位で設定
                if (window.LedgerV2 && window.LedgerV2.TableInteract && window.LedgerV2.TableInteract.cellSwapManager) {
                    window.LedgerV2.TableInteract.cellSwapManager.setupDragDropForRow(newRow);
                } else {
                    // フォールバック: 基本的なdraggable設定のみ
                    const primaryKeyCells = newRow.querySelectorAll('td[data-is-primary-key="true"]');
                    primaryKeyCells.forEach(cell => {
                        cell.draggable = true;
                    });
                }
                
            } catch (error) {
                console.error('❌ 分離行ドラッグ&ドロップ設定エラー:', error);
            }
        }

        /**
         * 分離処理後のハイライト処理（既存システム活用）
         */
        _updateHighlightsAfterSeparation(originalRow, separatedRow) {
            try {
                
                // CellStateManagerが利用可能な場合
                if (window.cellStateManager) {
                    // 両方の行の全フィールドを再評価
                    [originalRow, separatedRow].forEach((row, index) => {                        
                        this._updateRowHighlightWithCellStateManager(row);
                    });
                } else {
                    // フォールバック: data-original-value ベースの簡単なハイライト
                    [originalRow, separatedRow].forEach((row, index) => {
                        this._updateRowHighlightFallback(row);
                    });
                }
                
            } catch (error) {
                console.error('❌ 分離後ハイライト処理エラー:', error);
            }
        }

        /**
         * CellStateManagerを使用した行ハイライト更新
         */
        _updateRowHighlightWithCellStateManager(row) {
            if (!row || !window.cellStateManager) return;
            
            const cells = row.querySelectorAll('td[data-field-code]');
            
            // システム列（変更対象外）のフィールドコード
            const systemFields = ['_row_number', '_modification_checkbox', '_ledger_inconsistency', '_hide_button'];
            
            cells.forEach(cell => {
                const fieldCode = cell.getAttribute('data-field-code');
                if (fieldCode && !systemFields.includes(fieldCode)) {
                    try {
                        // 既存の高機能ハイライト更新システムを活用
                        window.cellStateManager.updateHighlightState(row, fieldCode);
                    } catch (error) {
                        console.warn(`⚠️ CellStateManager更新失敗: ${fieldCode}`, error);
                    }
                }
            });
        }

        /**
         * フォールバック: data-original-value ベースのシンプルハイライト（共通ヘルパー使用）
         */
        _updateRowHighlightFallback(row) {
            if (!row) return;
            
            const allCells = Array.from(row.querySelectorAll('td[data-field-code]'));
            
            // システム列（変更対象外）のフィールドコードを除外
            const systemFields = ['_row_number', '_modification_checkbox', '_ledger_inconsistency', '_hide_button'];
            const cells = allCells.filter(cell => {
                const fieldCode = cell.getAttribute('data-field-code');
                return fieldCode && !systemFields.includes(fieldCode);
            });
            
            // 共通ヘルパーで一括処理
            window.CommonHighlightHelper.updateMultipleCellsHighlight(cells);

        }

        /**
         * 🔧 input/select要素の値変更時のイベントハンドラを設定
         * 🚨 PROTECTED: ②パターン（ページング時の直接input/select生成）で使用 - 削除禁止
         */
        _attachCellModificationListeners(inputElement, cell, row) {
            const handleChange = () => {
                // セルハイライト状態を更新
                if (window.LedgerV2?.Utils?.CommonHighlightHelper?.updateCellAndRowHighlight) {
                    window.LedgerV2.Utils.CommonHighlightHelper.updateCellAndRowHighlight(cell, inputElement.value);
                } else {
                    // フォールバック：直接クラス追加
                    const originalValue = cell.getAttribute('data-original-value') || '';
                    const currentValue = inputElement.value || '';
                    
                    if (currentValue !== originalValue) {
                        cell.classList.add('cell-modified');
                        if (row) {
                            row.classList.add('row-modified');
                        }
                    } else {
                        cell.classList.remove('cell-modified');
                        // 行内の他のセルもチェック
                        if (row) {
                            const modifiedCells = row.querySelectorAll('.cell-modified');
                            if (modifiedCells.length === 0) {
                                row.classList.remove('row-modified');
                            }
                        }
                    }
                }
            };

            // input/changeイベント両方に対応
            inputElement.addEventListener('input', handleChange);
            inputElement.addEventListener('change', handleChange);
        }

        /**
         * 🔧 セルから値を取得するヘルパーメソッド
         */
        _getCellValue(cell, field) {
            if (!cell || !field) {

                return '';
            }

            try {


                if (field.isPrimaryKey) {
                    const container = cell.querySelector('div');
                    if (container) {
                        const valueSpan = container.querySelector('span');
                        if (valueSpan) {
                            const value = valueSpan.textContent || '';

                            return value;
                        }
                    } else {
                        const value = cell.textContent || '';

                        return value;
                    }
                } else if (field.isRecordId) {
                    const value = cell.textContent || '';

                    return value;
                } else {
                    const input = cell.querySelector('input, select');

                    
                    if (input) {
                        let value = input.value || '';
                        
                        // 🔧 select要素の値が空の場合、data-original-value属性から取得
                        if (!value && input.tagName === 'SELECT') {
                            const originalValue = cell.getAttribute('data-original-value');
                            if (originalValue) {

                                
                                // select要素の値も正しく設定する
                                input.value = originalValue;
                                value = originalValue;
                            }
                        }
                        

                        return value;
                    } else {
                        const value = cell.textContent || '';

                        return value;
                    }
                }
            } catch (error) {
                console.warn('⚠️ セル値取得エラー:', error, { cell, field });
                return '';
            }
        }

        /**
         * 🔧 分離時専用：セルに値を設定（data-original-valueは空のまま保持）
         */
        _setCellValueForSeparation(cell, value, field) {
            if (!cell || !field) return false;

            try {
                // フィールドタイプに応じて適切に値を設定
                if (field.isPrimaryKey) {
                    const container = cell.querySelector('div');
                    if (container) {
                        const valueSpan = container.querySelector('span');
                        if (valueSpan) {
                            valueSpan.textContent = value;
                        }
                    } else {
                        cell.textContent = value;
                    }
                } else if (field.isRecordId) {
                    cell.textContent = value;
                } else if (field.cellType === 'select' || field.cellType === 'dropdown') {
                    // 🔧 ドロップダウンの場合：select要素に値を設定
                    const select = cell.querySelector('select');
                    if (select) {
                        select.value = value;
                        
                        // 値が正しく設定されているか確認し、なければオプションを追加
                        if (select.value !== value && value) {
                            const option = document.createElement('option');
                            option.value = value;
                            option.textContent = value;
                            option.selected = true;
                            select.appendChild(option);
                        }
                    } else {
                        cell.textContent = value;
                    }
                } else if (field.cellType === 'input') {
                    // 🔧 inputの場合：input要素に値を設定
                    const input = cell.querySelector('input');
                    if (input) {
                        input.value = value;
                    } else {
                        cell.textContent = value;
                    }
                } else {
                    // テキストセルの場合
                    cell.textContent = value;
                }
                
                // 🔧 分離時はdata-original-valueを空のまま保持（cell-modified判定のため）
                // cell.setAttribute('data-original-value', value); ← これをしない

                
                return true;
                
            } catch (error) {
                console.error('❌ 分離時セル値設定エラー:', error, { cell, value, field });
                return false;
            }
        }

        /**
         * 🔧 セルに値を正しく設定するヘルパーメソッド
         */
        _setCellValue(cell, value, field) {
            if (!cell || !field) return false;

            try {
                // フィールドタイプに応じて適切に値を設定
                if (field.isPrimaryKey) {
                    const container = cell.querySelector('div');
                    if (container) {
                        const valueSpan = container.querySelector('span');
                        if (valueSpan) {
                            valueSpan.textContent = value;
                        }
                    } else {
                        cell.textContent = value;
                    }
                } else if (field.isRecordId) {
                    cell.textContent = value;
                } else if (field.cellType === 'select' || field.cellType === 'dropdown') {
                    // 🔧 ドロップダウンの場合：select要素に値を設定
                    const select = cell.querySelector('select');

                    
                    if (select) {
                        // 一旦値を設定してみる
                        select.value = value;
                        
                        // 値が正しく設定されているか確認
                        if (select.value !== value && value) {

                            
                            // 新しいオプションを追加
                            const option = document.createElement('option');
                            option.value = value;
                            option.textContent = value;
                            option.selected = true;
                            select.appendChild(option);
                            
                            // 再度確認

                        } else {

                        }
                    } else {

                        cell.textContent = value;
                    }
                } else if (field.cellType === 'input') {
                    // 🔧 inputの場合：input要素に値を設定
                    const input = cell.querySelector('input');
                    if (input) {
                        input.value = value;
                    } else {
                        cell.textContent = value;
                    }
                } else {
                    // テキストセルの場合
                    cell.textContent = value;
                }
                
                // data-original-valueも更新（分離後のハイライト制御用）
                cell.setAttribute('data-original-value', value);
                
                return true;
                
            } catch (error) {
                console.error('❌ セル値設定エラー:', error, { cell, value, field });
                return false;
            }
        }

 
    }

    // =============================================================================
    // グローバル公開
    // =============================================================================

    window.LedgerV2.TableRender = { 
        TableDisplayManager
    };
    
    window.TableDisplayManager = TableDisplayManager;

})(); 