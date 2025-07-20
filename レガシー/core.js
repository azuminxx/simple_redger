/**
 * 🚀 統合台帳システム v2 - コアシステム
 * @description データ管理・API通信・検索機能の統合
 * @version 2.0.0
 * 
 * 🎯 **ファイルの責任範囲**
 * ✅ kintone API通信・大量データ取得
 * ✅ 検索条件構築・クエリ生成
 * ✅ 複数台帳間のデータ統合処理
 * ✅ テーブル基本データ管理
 * ✅ セル・行の変更状態管理
 * 
 * ❌ **やってはいけないこと（責任範囲外）**
 * ❌ UI描画・DOM操作（table-render.jsの責任）
 * ❌ ユーザーイベント処理（table-interact.jsの責任）
 * ❌ ページネーション処理（table-pagination.jsの責任）
 * ❌ システム初期化（table-header.jsの責任）
 * 
 * 📦 **含まれるクラス**
 * - APIManager: API通信・データ取得
 * - SearchManager: 検索条件管理・クエリ構築
 * - DataIntegrationManager: 複数台帳データ統合
 * - DataManager: テーブル基本データ管理
 * - StateManager: 変更状態管理
 * 
 * 🔗 **依存関係**
 * - kintone API
 * - window.LedgerV2.Config (設定)
 * - window.fieldsConfig (フィールド設定)
 * 
 * 💡 **使用例**
 * ```javascript
 * const result = await searchManager.executeSearch(conditions, null);
 * const integratedData = await dataIntegrationManager.fetchAllLedgerData(conditions);
 * ```
 */
(function() {
    'use strict';

    // グローバル名前空間確保
    window.LedgerV2 = window.LedgerV2 || {};
    window.LedgerV2.Core = {};

    // =============================================================================
    // 📊 API通信管理
    // =============================================================================

    class APIManager {
        /**
         * 500件以上のレコードを取得
         * @param {number} appId - アプリID
         * @param {string} query - 検索クエリ
         * @param {string} contextInfo - 呼び出し元情報
         * @returns {Array} 全レコード配列
         */
        static async fetchAllRecords(appId, query = '', contextInfo = '') {
            // バックグラウンド処理監視を開始
            let processId = null;
            if (window.BackgroundProcessMonitor) {
                processId = window.BackgroundProcessMonitor.startProcess('データ取得', `${contextInfo || 'データ'}取得中...`);
            }

            try {
                const allRecords = [];
                const limit = 500;
                let offset = 0;
                let finished = false;
                let apiCallCount = 0;

                const appName = this._getAppNameById(appId);
                const logPrefix = `🔍 ${appName}${contextInfo ? ` (${contextInfo})` : ''}`;

                while (!finished) {
                    const queryWithPagination = query 
                        ? `${query} limit ${limit} offset ${offset}`
                        : `limit ${limit} offset ${offset}`;

                    try {
                        apiCallCount++;

                        // 進行状況を更新
                        if (processId) {
                            window.BackgroundProcessMonitor.updateProcess(processId, '実行中', 
                                `${apiCallCount}回目のAPI呼び出し中... (${allRecords.length}件取得済み)`);
                        }

                        const res = await kintone.api('/k/v1/records', 'GET', {
                            app: appId,
                            query: queryWithPagination,
                            totalCount: true  // 総件数を取得
                        });
                        allRecords.push(...res.records);
                        const afterCount = allRecords.length;

                        // 総件数が分かる場合は、それを基準に終了判定
                        if (res.totalCount && afterCount >= res.totalCount) {
                            finished = true;
                        } else if (res.records.length < limit) {
                            finished = true;
                        } else {
                            offset += limit;
                        }

                    } catch (error) {
                        console.error(`❌ ${logPrefix}: API呼び出し${apiCallCount}回目でエラー:`, error);
                        console.error(`❌ 失敗クエリ: "${queryWithPagination}"`);
                        
                        // エラー状態を更新
                        if (processId) {
                            window.BackgroundProcessMonitor.updateProcess(processId, 'エラー', 'API呼び出しエラー');
                            setTimeout(() => window.BackgroundProcessMonitor.endProcess(processId), 1000);
                        }
                        throw error;
                    }
                }
                // 完了状態を更新
                if (processId) {
                    window.BackgroundProcessMonitor.updateProcess(processId, '完了', `${allRecords.length}件取得完了`);
                    setTimeout(() => window.BackgroundProcessMonitor.endProcess(processId), 500);
                }
                
                return allRecords;
                
            } catch (error) {
                if (processId) {
                    window.BackgroundProcessMonitor.updateProcess(processId, 'エラー', 'データ取得エラー');
                    setTimeout(() => window.BackgroundProcessMonitor.endProcess(processId), 1000);
                }
                throw error;
            }
        }

        static _getAppNameById(appId) {
            const appIdToName = {};
            Object.entries(window.LedgerV2.Config.APP_IDS).forEach(([name, id]) => {
                appIdToName[id] = name;
            });
            return appIdToName[appId] || `App${appId}`;
        }

        /**
         * バッチサイズを動的計算
         */
        static _calculateOptimalBatchSize(keys, fieldName) {
            if (keys.length === 0) return 100;

            const avgKeyLength = keys.slice(0, 10).reduce((sum, key) => sum + String(key).length, 0) / Math.min(10, keys.length);
            const baseQueryLength = fieldName.length + 20; // " in ()" の余裕を追加
            const perKeyLength = avgKeyLength + 4; // クォート2文字 + カンマ + スペース
            const maxQueryLength = 7000; // 余裕を持たせて7KB
            const availableLength = maxQueryLength - baseQueryLength;
            const maxBatchSize = Math.floor(availableLength / perKeyLength);
            
            const calculatedSize = Math.max(10, Math.min(500, maxBatchSize));
            
            // 500件まで引き上げ（kintone APIの1回あたり最大取得件数）
            return calculatedSize;
        }
    }

    // =============================================================================
    // 🔍 検索・フィルタ管理
    // =============================================================================

    class SearchManager {
        constructor() {
            this.currentConditions = '';
            this.currentLedger = '';
        }

        /**
         * フィルター条件を収集
         */
        collectConditions() {
            const conditions = [];
            const appliedFields = []; // 🆕 検索条件に使用されたフィールドを記録
            const filterInputs = document.querySelectorAll('#my-filter-row input, #my-filter-row select');

            // 🚫 無条件検索チェック
            let hasValidConditions = false;

            filterInputs.forEach(input => {
                const fieldCode = input.getAttribute('data-field');
                const value = input.value.trim();

                if (fieldCode && value && fieldCode !== '$ledger_type') {
                    hasValidConditions = true; // 🚫 有効な条件を発見
                    appliedFields.push(fieldCode); // 🆕 適用フィールドを記録
                    const condition = this._buildCondition(fieldCode, value);
                    if (condition) {
                        conditions.push(condition);
                    }
                }
            });

            // 🚫 無条件検索チェック
            if (!hasValidConditions) {
                this._showNoConditionError();
                return null; // 🚫 検索を実行させない
            }

            // 🚦 複数台帳チェック
            const crossLedgerValidation = this._validateCrossLedgerSearch(appliedFields);
            if (!crossLedgerValidation.isValid) {
                this._showCrossLedgerError(crossLedgerValidation);
                return null; // 🚫 検索を実行させない
            }

            const finalQuery = conditions.length > 0 ? conditions.join(' and ') : '';

            return finalQuery;
        }

        /**
         * 🚦 複数台帳検索の検証
         * @param {Array<string>} appliedFields - 検索条件に使用されたフィールドコード一覧
         * @returns {Object} 検証結果
         */
        _validateCrossLedgerSearch(appliedFields) {
            if (appliedFields.length <= 1) {
                // 検索フィールドが1つ以下の場合は問題なし
                return { isValid: true };
            }

            // 各フィールドの台帳を取得
            const fieldAppMap = new Map();
            const usedApps = new Set();

            appliedFields.forEach(fieldCode => {
                // 主キーフィールドは特別扱い（全台帳共通）
                const fieldConfig = window.fieldsConfig.find(f => f.fieldCode === fieldCode);
                if (fieldConfig) {
                    if (fieldConfig.isPrimaryKey) {
                        // 主キーフィールドの場合は台帳共通扱い
                        return;
                    } else if (fieldConfig.sourceApp) {
                        fieldAppMap.set(fieldCode, fieldConfig.sourceApp);
                        usedApps.add(fieldConfig.sourceApp);
                    }
                }
            });

            // 複数台帳が検出された場合
            if (usedApps.size > 1) {
                const appFieldGroups = {};
                fieldAppMap.forEach((app, fieldCode) => {
                    if (!appFieldGroups[app]) {
                        appFieldGroups[app] = [];
                    }
                    appFieldGroups[app].push(fieldCode);
                });

                return {
                    isValid: false,
                    errorType: 'CROSS_LEDGER_SEARCH',
                    usedApps: Array.from(usedApps),
                    fieldAppMap: Object.fromEntries(fieldAppMap),
                    appFieldGroups
                };
            }

            return { isValid: true };
        }

        /**
         * 🚨 複数台帳エラーメッセージを表示
         * @param {Object} validation - 検証結果
         */
        _showCrossLedgerError(validation) {
            // 既存のエラーメッセージを削除
            this._clearErrorMessages();

            const errorDiv = document.createElement('div');
            errorDiv.id = 'cross-ledger-error';
            errorDiv.style.cssText = `
                background-color: #ffebee;
                border: 2px solid #f44336;
                border-radius: 4px;
                padding: 12px;
                margin: 8px 0;
                font-size: 12px;
                color: #c62828;
                font-weight: bold;
                position: relative;
                white-space: pre-line;
            `;

            // 閉じるボタンを作成
            const closeButton = document.createElement('button');
            closeButton.textContent = '×';
            closeButton.style.cssText = `
                position: absolute;
                top: 8px;
                right: 8px;
                background-color: transparent;
                border: none;
                font-size: 16px;
                font-weight: bold;
                color: #c62828;
                cursor: pointer;
                padding: 2px 6px;
                border-radius: 2px;
            `;
            closeButton.title = 'エラーメッセージを閉じる';

            // 閉じるボタンのホバー効果
            closeButton.addEventListener('mouseenter', () => {
                closeButton.style.backgroundColor = '#ffcdd2';
            });
            closeButton.addEventListener('mouseleave', () => {
                closeButton.style.backgroundColor = 'transparent';
            });

            // 閉じるボタンのクリックイベント
            closeButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this._clearErrorMessages();
            });

            // エラーメッセージの構築
            let errorMessage = '🚫 複数台帳を跨いだ検索はできません\n\n';
            
            // 台帳別のフィールド一覧
            errorMessage += '【検索条件で使用された台帳とフィールド】\n';
            Object.entries(validation.appFieldGroups).forEach(([app, fields]) => {
                const appName = this._getAppDisplayName(app);
                const fieldLabels = fields.map(fieldCode => {
                    const field = window.fieldsConfig.find(f => f.fieldCode === fieldCode);
                    return field ? field.label : fieldCode;
                });
                errorMessage += `• ${appName}: ${fieldLabels.join('、')}\n`;
            });

            errorMessage += '\n【解決方法】\n';
            errorMessage += '• 同じ台帳のフィールドのみを使用して検索してください\n';
            // 主キーフィールドを動的に取得してメッセージに追加
            const primaryKeys = window.LedgerV2.Utils.FieldValueProcessor.getAllPrimaryKeyFields();
            const primaryKeyList = primaryKeys.join('・');
            errorMessage += `• または、主キー（${primaryKeyList}）は台帳に関係なく使用できます`;

            errorDiv.textContent = errorMessage;

            // 閉じるボタンを追加
            errorDiv.appendChild(closeButton);

            // エラーメッセージを表示（テーブルの上部）
            const table = document.getElementById('my-table');
            if (table && table.parentNode) {
                table.parentNode.insertBefore(errorDiv, table);
            }
        }

        /**
         * 無条件検索エラーを表示
         */
        _showNoConditionError() {
            // 既存のエラーメッセージを削除
            const existingError = document.querySelector('.no-condition-error');
            if (existingError) {
                existingError.remove();
            }

            // エラーメッセージを作成
            const errorDiv = document.createElement('div');
            errorDiv.className = 'no-condition-error';
            errorDiv.style.cssText = `
                background-color: #fff3cd;
                border: 1px solid #ffeaa7;
                border-radius: 4px;
                color: #856404;
                padding: 12px 16px;
                margin: 10px 0;
                font-size: 14px;
                font-weight: 500;
                display: flex;
                align-items: center;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
                z-index: 1000;
                position: relative;
            `;
            errorDiv.innerHTML = `
                <span style="margin-right: 8px;">⚠️</span>
                <span>検索条件を1つ以上入力してください。無条件での検索は実行できません。</span>
            `;

            // テーブルの上に挿入
            const tableContainer = document.querySelector('#table-container') || document.querySelector('#my-table');
            if (tableContainer && tableContainer.parentNode) {
                tableContainer.parentNode.insertBefore(errorDiv, tableContainer);
            } else {
                // フォールバック：bodyに追加
                document.body.appendChild(errorDiv);
            }

            // 5秒後に自動で削除
            setTimeout(() => {
                if (errorDiv && errorDiv.parentNode) {
                    errorDiv.remove();
                }
            }, 5000);
        }

        /**
         * 🧹 エラーメッセージをクリア
         */
        _clearErrorMessages() {
            const existingError = document.getElementById('cross-ledger-error');
            if (existingError) {
                existingError.remove();
            }
            // 無条件検索エラーもクリア
            const noConditionError = document.querySelector('.no-condition-error');
            if (noConditionError) {
                noConditionError.remove();
            }
        }

        /**
         * 🏷️ アプリタイプの表示名を取得
         * @param {string} appType - アプリタイプ
         * @returns {string} 表示名
         */
        _getAppDisplayName(appType) {
            return window.LedgerV2.Utils.FieldValueProcessor.getLedgerNameByApp(appType);
        }

        /**
         * 検索条件を構築
         */
        _buildCondition(fieldCode, value) {
            // 特別フィールド処理
            if (fieldCode === '$id') {
                const values = this._parseInputValues(value);
                if (values.length === 1) {
                    return `${fieldCode} = ${values[0]}`;
                } else {
                    const conditions = values.map(v => `${fieldCode} = ${v}`);
                    return `(${conditions.join(' or ')})`;
                }
            }

            // 通常フィールド処理
            const field = window.fieldsConfig.find(f => f.fieldCode === fieldCode);
            if (!field) return null;

            const inputValue = value.trim();
            if (!inputValue) return null;

            // filterType に基づいてクエリ構築方法を決定
            return this._buildConditionByFilterType(fieldCode, inputValue, field);
        }

        /**
         * filterType に基づく条件構築
         */
        _buildConditionByFilterType(fieldCode, inputValue, field) {
            const filterType = field.filterType || 'text';

            switch (filterType) {
                case 'dropdown':
                    // selectbox の場合は「in」を使用
                    return this._buildDropdownCondition(fieldCode, inputValue, field);

                case 'text':
                default:
                    // input の場合は「=」を使用（元の処理）
                    return this._buildMultiValueCondition(fieldCode, inputValue, field.searchOperator, field.searchValueFormatter);
            }
        }

        /**
         * ドロップダウン用条件構築（selectbox → in）
         */
        _buildDropdownCondition(fieldCode, inputValue, field) {
            const values = this._parseInputValues(inputValue);
            if (values.length === 0) return null;

            // ドロップダウンは常に「in」演算子を使用
            if (values.length === 1) {
                const formattedValue = this._formatSearchValue(values[0], field.searchValueFormatter);
                return `${fieldCode} in (${formattedValue})`;
            } else {
                const formattedValues = values.map(v => this._formatSearchValue(v, field.searchValueFormatter));
                return `${fieldCode} in (${formattedValues.join(', ')})`;
            }
        }

        _parseInputValues(input) {
            return input.split(/[,，\s]+/)
                .map(v => v.trim())
                .filter(v => v.length > 0);
        }

        _buildMultiValueCondition(fieldCode, inputValue, operator, formatter) {
            const values = this._parseInputValues(inputValue);
            if (values.length === 0) return null;

            if (values.length === 1) {
                const formattedValue = this._formatSearchValue(values[0], formatter, operator);
                return `${fieldCode} ${operator} ${formattedValue}`;
            }

            return this._buildMultiValueQuery(fieldCode, values, operator, formatter);
        }

        _buildMultiValueQuery(fieldCode, values, operator, formatter) {
            if (operator === 'in') {
                const formattedValues = values.map(v => this._formatSearchValue(v, formatter, operator));
                return `${fieldCode} in (${formattedValues.join(', ')})`;
            } else {
                const conditions = values.map(v => {
                    const formattedValue = this._formatSearchValue(v, formatter, operator);
                    return `${fieldCode} ${operator} ${formattedValue}`;
                });
                return `(${conditions.join(' or ')})`;
            }
        }

        _formatSearchValue(value, formatter, operator = null) {
            switch (formatter) {
                case 'exact':
                    return `"${value}"`;
                case 'prefix':
                    return `"${value}%"`;
                case 'list':
                    return `"${value}"`;
                default:
                    return `"${value}"`;
            }
        }

        /**
         * フィルターをクリア
         */
        clearFilters(preserveLedgerType = false) {
            const filterInputs = document.querySelectorAll('#my-filter-row input, #my-filter-row select');
            filterInputs.forEach(input => {
                if (preserveLedgerType && input.getAttribute('data-field') === '$ledger_type') {
                    return;
                }
                if (input.tagName.toLowerCase() === 'select') {
                    input.selectedIndex = 0;
                } else {
                    input.value = '';
                }
            });

            // 🧹 エラーメッセージもクリア
            this._clearErrorMessages();
        }

        /**
         * 検索実行
         */
        async executeSearch(conditions, selectedLedger) {
            try {
                // フィルター条件を収集
                const queryConditions = this.collectConditions();
                
                // 🚦 複数台帳エラーの場合は検索を中止
                if (queryConditions === null) {
                    return { integratedRecords: [] };
                }

                LoadingManager.show('データを検索中...');

                if (selectedLedger && selectedLedger !== 'all') {
                    return await this._searchSpecificLedger(queryConditions, selectedLedger);
                } else {
                    return await this._searchAllLedgers(queryConditions);
                }
            } catch (error) {
                console.error('❌ 検索実行エラー:', error);
                throw error;
            } finally {
                LoadingManager.hide();
            }
        }

        async _searchAllLedgers(conditions) {
            // 検索実行前に生データをクリア（追加モード時は除く）
            if (window.dataIntegrationManager && !window.dataManager?.appendMode) {
                window.dataIntegrationManager.clearAllRawData();
            }
            
            const dataIntegration = new DataIntegrationManager();
            return await dataIntegration.fetchAllLedgerData(conditions);
        }

        async _searchSpecificLedger(conditions, selectedLedger) {
            // 検索実行前に生データをクリア（追加モード時は除く）
            if (window.dataIntegrationManager && !window.dataManager?.appendMode) {
                window.dataIntegrationManager.clearAllRawData();
            }
            
            const appId = window.LedgerV2.Config.APP_IDS[selectedLedger.toUpperCase()];
            if (!appId) {
                throw new Error(`無効な台帳タイプ: ${selectedLedger}`);
            }

            const records = await APIManager.fetchAllRecords(appId, conditions, `${selectedLedger}台帳検索`);
            
            // 単一台帳検索の場合も生データを保存
            if (window.dataIntegrationManager && records.length > 0) {
                // 各台帳の主キーフィールドマッピング（configから取得）
                const primaryKeyMapping = window.LedgerV2.Utils.FieldValueProcessor.getAppToPrimaryKeyMapping();

                const primaryKeyField = primaryKeyMapping[selectedLedger.toUpperCase()];
                if (primaryKeyField) {
                    records.forEach(record => {
                        const primaryKeyValue = record[primaryKeyField]?.value;
                        if (primaryKeyValue) {
                            window.dataIntegrationManager.saveRawData(selectedLedger.toUpperCase(), primaryKeyValue, record);
                        }
                    });
                }
            }

            return records;
        }
    }

    // =============================================================================
    // 📊 データ統合管理
    // =============================================================================

    class DataIntegrationManager {
        constructor() {
            // HISTORY台帳を除外したアプリIDリストを作成
            const allAppIds = window.LedgerV2.Config.APP_IDS;
            this.appIds = {};
            Object.entries(allAppIds).forEach(([appType, appId]) => {
                if (appType !== 'HISTORY') {
                    this.appIds[appType] = appId;
                }
            });
            
            // 各台帳の生データを保管するMap
            this.rawLedgerData = new Map(); // 台帳タイプ → Map(レコードID → 生データ)
            this._initializeRawDataMaps();
        }

        /**
         * 各台帳の生データMapを初期化
         */
        _initializeRawDataMaps() {
            const ledgerTypes = ['PC', 'USER', 'SEAT', 'EXT'];
            ledgerTypes.forEach(ledgerType => {
                this.rawLedgerData.set(ledgerType, new Map());
            });
        }

        /**
         * 生データを保存
         * @param {string} ledgerType - 台帳タイプ (PC, USER, SEAT, EXT)
         * @param {string} primaryKeyValue - 主キーの値
         * @param {Object} rawRecord - kintoneから取得した生データ
         */
        saveRawData(ledgerType, primaryKeyValue, rawRecord) {
            try {
                if (!ledgerType || !primaryKeyValue || !rawRecord) {
                    return;
                }

                const ledgerMap = this.rawLedgerData.get(ledgerType);
                if (!ledgerMap) {
                    return;
                }

                // 生データを保存（保存時刻も記録）
                const dataWithTimestamp = {
                    ...rawRecord,
                    _savedAt: new Date().toISOString()
                };

                ledgerMap.set(primaryKeyValue, dataWithTimestamp);

            } catch (error) {
                console.error('❌ 生データ保存エラー:', error);
            }
        }

        /**
         * 生データを取得
         * @param {string} ledgerType - 台帳タイプ
         * @param {string} primaryKeyValue - 主キーの値
         * @returns {Object|null} 生データ
         */
        getRawData(ledgerType, primaryKeyValue) {
            try {
                const ledgerMap = this.rawLedgerData.get(ledgerType);
                if (!ledgerMap) {
                    return null;
                }

                return ledgerMap.get(primaryKeyValue) || null;
            } catch (error) {
                console.error('❌ 生データ取得エラー:', error);
                return null;
            }
        }

        /**
         * 台帳の全生データを取得
         * @param {string} ledgerType - 台帳タイプ
         * @returns {Map|null} 台帳の全生データMap
         */
        getAllRawDataByLedger(ledgerType) {
            try {
                return this.rawLedgerData.get(ledgerType) || null;
            } catch (error) {
                console.error('❌ 台帳全生データ取得エラー:', error);
                return null;
            }
        }

        /**
         * 生データを削除
         * @param {string} ledgerType - 台帳タイプ
         * @param {string} primaryKeyValue - 主キーの値 (省略時は台帳の全データを削除)
         */
        removeRawData(ledgerType, primaryKeyValue = null) {
            try {
                const ledgerMap = this.rawLedgerData.get(ledgerType);
                if (!ledgerMap) {
                    return;
                }

                if (primaryKeyValue) {
                    // 特定のレコードのみ削除
                    ledgerMap.delete(primaryKeyValue);
                } else {
                    // 台帳の全データを削除
                    ledgerMap.clear();
                }
            } catch (error) {
                console.error('❌ 生データ削除エラー:', error);
            }
        }

        /**
         * 生データの統計情報を取得
         * @returns {Object} 統計情報
         */
        getRawDataStats() {
            try {
                const stats = {
                    ledgerCounts: {},
                    totalRecords: 0
                };

                for (const [ledgerType, ledgerMap] of this.rawLedgerData.entries()) {
                    const count = ledgerMap.size;
                    stats.ledgerCounts[ledgerType] = count;
                    stats.totalRecords += count;
                }

                return stats;
            } catch (error) {
                console.error('❌ 生データ統計取得エラー:', error);
                return null;
            }
        }

        /**
         * 全生データをクリア
         */
        clearAllRawData() {
            try {
                for (const [ledgerType, ledgerMap] of this.rawLedgerData.entries()) {
                    ledgerMap.clear();
                }
            } catch (error) {
                console.error('❌ 全生データクリアエラー:', error);
            }
        }

        /**
         * 全台帳からデータを取得（2段階検索ロジック）
         * @param {string} conditions - 検索条件
         * @returns {Object} 全台帳のデータと統合結果
         */
        async fetchAllLedgerData(conditions) {
            const allData = {};
            const primaryKeys = window.LedgerV2.Utils.FieldValueProcessor.getAppToPrimaryKeyMapping();

            // 第1段階：直接検索（検索条件に該当するフィールドを持つ台帳から検索）
            const firstStageResults = await this._executeFirstStageSearch(conditions);

            // 第2段階：関連検索（第1段階で取得した主キーを使って他の台帳を検索）
            // 🚫 第2段階を無効化（コメントアウト）
            // const secondStageResults = await this._executeSecondStageSearch(
            //     firstStageResults,
            //     primaryKeys
            // );
            
            // 🔧 第2段階を無効化：空の結果を使用
            const secondStageResults = { SEAT: [], PC: [], EXT: [], USER: [] };

            // 🔧 第3段階：統合キーベース検索（補完検索）
            const thirdStageResults = await this._executeThirdStageSearch(
                firstStageResults,
                secondStageResults
            );

            // 結果をマージ
            Object.keys(this.appIds).forEach((appType) => {
                allData[appType] = [
                    ...(firstStageResults[appType] || []),
                    ...(secondStageResults[appType] || []),
                    ...(thirdStageResults[appType] || []),
                ];

                // 重複除去
                allData[appType] = this._removeDuplicateRecords(allData[appType]);
            });

            // 🆕 各台帳の生データを保存
            this._saveRawDataFromAllLedgers(allData);

            // legacy形式との互換性のためintegrateDataを呼び出し
            const integratedRecords = this.integrateData(allData);

            return {
                integratedRecords,
                targetAppId: null
            };
        }

        /**
         * 全台帳データから生データを保存
         * @param {Object} allLedgerData - 全台帳のデータ
         */
        _saveRawDataFromAllLedgers(allLedgerData) {
            try {
                // 各台帳の主キーフィールドマッピング（configから取得）
                const primaryKeyMapping = window.LedgerV2.Utils.FieldValueProcessor.getAppToPrimaryKeyMapping();

                Object.keys(allLedgerData).forEach((appType) => {
                    // HISTORY台帳は生データ保存の対象外
                    if (appType === 'HISTORY') {
                        return;
                    }

                    const records = allLedgerData[appType] || [];
                    const primaryKeyField = primaryKeyMapping[appType];

                    if (!primaryKeyField) {
                        return;
                    }

                    records.forEach((record) => {
                        const primaryKeyValue = record[primaryKeyField]?.value;
                        if (primaryKeyValue) {
                            // ローカルインスタンスに保存
                            this.saveRawData(appType, primaryKeyValue, record);
                            
                            // グローバルインスタンスにも保存
                            if (window.dataIntegrationManager && window.dataIntegrationManager !== this) {
                                window.dataIntegrationManager.saveRawData(appType, primaryKeyValue, record);
                            }
                        }
                    });
                });

            } catch (error) {
                console.error('❌ 生データ一括保存エラー:', error);
            }
        }

        /**
         * 第1段階：検索条件で直接検索
         */
        async _executeFirstStageSearch(conditions) {
            const startTime = performance.now();
            const results = {};

            // 検索条件からフィールドを抽出して、どの台帳で検索すべきかを判定
            const targetApps = this._determineTargetApps(conditions);

            // ✅ 第1段階で実行した台帳を記録（第3段階で除外するため）
            this.firstStageExecutedApps = new Set();

            for (const [appType, appId] of Object.entries(this.appIds)) {
                try {
                    // 検索条件が存在し、かつ対象台帳でない場合はスキップ
                    if (conditions && !targetApps.includes(appType)) {
                        results[appType] = [];
                        continue;
                    }

                    const records = await APIManager.fetchAllRecords(appId, conditions, `第1段階-${appType}`);
                    results[appType] = records;
                    
                    // ✅ 第1段階で実行した台帳を記録
                    this.firstStageExecutedApps.add(appType);
                } catch (error) {
                    console.error(`❌ ${appType}台帳の直接検索エラー:`, error);
                    results[appType] = [];
                }
            }

            const endTime = performance.now();
            const totalDuration = endTime - startTime;
            const totalRecords = Object.values(results).reduce((sum, records) => sum + records.length, 0);

            return results;
        }

        /**
         * 検索条件から対象台帳を判定
         */
        _determineTargetApps(conditions) {
            if (!conditions) {
                // 検索条件がない場合は全台帳を対象
                return Object.keys(this.appIds);
            }

            const targetApps = new Set();

            // fieldsConfigの各フィールドをチェックして、検索条件に含まれているかを確認
            window.fieldsConfig.forEach((fieldConfig) => {
                // integration_keyフィールドは検索対象外とする
                if (fieldConfig.fieldCode === "integration_key") {
                    return;
                }

                if (
                    fieldConfig.sourceApp &&
                    conditions.includes(fieldConfig.fieldCode)
                ) {
                    targetApps.add(fieldConfig.sourceApp);
                }
            });

            // 対象台帳が見つからない場合
            if (targetApps.size === 0) {
                return Object.keys(this.appIds);
            }

            const result = Array.from(targetApps);
            return result;
        }

        /**
         * 第1段階の結果から各台帳の主キーを抽出
         */
        _extractPrimaryKeysFromResults(firstStageResults, primaryKeys) {
            const extractedKeys = {};

            Object.keys(this.appIds).forEach((appType) => {
                extractedKeys[appType] = [];

                const records = firstStageResults[appType] || [];
                const primaryKeyField = primaryKeys[appType];

                records.forEach((record) => {
                    if (record[primaryKeyField]) {
                        const keyValue = record[primaryKeyField].value;
                        if (keyValue && !extractedKeys[appType].includes(keyValue)) {
                            extractedKeys[appType].push(keyValue);
                        }
                    }
                });
            });

            return extractedKeys;
        }

        /**
         * 第2段階：第1段階の結果から主キーを抽出して関連検索
         */
        async _executeSecondStageSearch(firstStageResults, primaryKeys) {
            const startTime = performance.now();
            const results = {};
            let totalBatches = 0;

            // 各台帳から主キーを抽出
            const extractedKeys = this._extractPrimaryKeysFromResults(
                firstStageResults,
                primaryKeys
            );

            // 抽出した主キーで他の台帳を検索
            for (const [appType, appId] of Object.entries(this.appIds)) {
                results[appType] = [];

                for (const [sourceAppType, keys] of Object.entries(extractedKeys)) {
                    if (sourceAppType === appType || keys.length === 0) continue;

                    const targetFieldName = primaryKeys[sourceAppType]; // 他の台帳にある主キーフィールド名

                    // 対象台帳に該当フィールドが存在するかチェック
                    if (!this._fieldExistsInApp(appType, targetFieldName)) {
                        continue;
                    }

                    try {
                        // 🔧 検索対象の主キー数を制限（URLが長すぎることを防ぐ）
                        const maxKeys = APIManager._calculateOptimalBatchSize(keys, targetFieldName);
                        const keyBatches = [];
                        for (let i = 0; i < keys.length; i += maxKeys) {
                            keyBatches.push(keys.slice(i, i + maxKeys));
                        }

                        for (const keyBatch of keyBatches) {
                            totalBatches++;
                            // 主キーの値でIN検索
                            const keyConditions = keyBatch.map((key) => `"${key}"`).join(",");
                            const query = `${targetFieldName} in (${keyConditions})`;

                            const records = await APIManager.fetchAllRecords(appId, query, `第2段階-${sourceAppType}→${appType}-バッチ${totalBatches}`);

                            results[appType].push(...records);
                        }
                    } catch (error) {
                        console.error(
                            `${appType}台帳の関連検索エラー(${sourceAppType}基準):`,
                            error
                        );
                    }
                }

                // 台帳内の重複除去
                results[appType] = this._removeDuplicateRecords(results[appType]);
            }

            const endTime = performance.now();
            const totalDuration = endTime - startTime;
            const totalRecords = Object.values(results).reduce((sum, records) => sum + records.length, 0);

            return results;
        }

        /**
         * 🔧 指定された台帳に特定のフィールドが存在するかチェック
         * @param {string} appType - アプリタイプ
         * @param {string} fieldName - フィールド名
         * @returns {boolean} フィールドが存在するかどうか
         */
        _fieldExistsInApp(appType, fieldName) {
            if (!window.fieldsConfig) {
                console.warn("fieldsConfigが見つかりません");
                return false;
            }

            // fieldsConfigから該当アプリに該当フィールドが定義されているかチェック
            const fieldExists = window.fieldsConfig.some(
                (field) => field.sourceApp === appType && field.fieldCode === fieldName
            );
            return fieldExists;
        }

        /**
         * レコードの重複除去（レコードIDベース）
         */
        _removeDuplicateRecords(records) {
            const seen = new Set();
            return records.filter((record) => {
                const recordId = record.$id.value;
                if (seen.has(recordId)) {
                    return false;
                }
                seen.add(recordId);
                return true;
            });
        }

        /**
         * 第3段階：統合キーベース検索（補完検索）
         */
        async _executeThirdStageSearch(firstStageResults, secondStageResults) {
            const results = {};

            // 各台帳を初期化
            Object.keys(this.appIds).forEach((appType) => {
                results[appType] = [];
            });

            // 第1段階と第2段階の結果から統合キーを抽出
            const allIntegrationKeys = new Set();

            [firstStageResults, secondStageResults].forEach((stageResults) => {
                Object.values(stageResults).forEach((records) => {
                    records.forEach((record) => {
                        const integrationKey = this._extractIntegrationKey(record);
                        if (integrationKey) {
                            allIntegrationKeys.add(integrationKey);
                        }
                    });
                });
            });

            // 第1段階で実行済みの台帳は補完検索から除外
            // 補完検索の実行（第1段階で実行済みの台帳は除外）
            const appToPrimaryKeyMapping = window.LedgerV2.Utils.FieldValueProcessor.getAppToPrimaryKeyMapping();
            
            // 各台帳について補完検索を実行
            for (const [appType, primaryKeyField] of Object.entries(appToPrimaryKeyMapping)) {
                if (!this.firstStageExecutedApps || !this.firstStageExecutedApps.has(appType)) {
                    if (primaryKeyField) {
                        await this._executeSupplementarySearch(allIntegrationKeys, results, appType, primaryKeyField);
                    }
                }
            }

            return results;
        }

        /**
         * 統合キーを抽出
         */
        _extractIntegrationKey(record) {
            // 全主キーから統合キーを生成
            const appMapping = window.LedgerV2.Utils.FieldValueProcessor.getAppToPrimaryKeyMapping();
            const keyParts = [];

            Object.entries(appMapping).forEach(([appType, fieldCode]) => {
                const fieldValue = record[fieldCode] ? record[fieldCode].value : "";
                if (fieldValue) {
                    keyParts.push(`${appType}:${fieldValue}`);
                }
            });

            // 統合キーを生成（値が存在する組み合わせ）
            const integrationKey =
                keyParts.length > 0 ? keyParts.join("|") : `RECORD_${record.$id.value}`;

            return integrationKey;
        }

        /**
         * 補完検索ヘルパー
         */
        async _executeSupplementarySearch(integrationKeys, results, appType, fieldName) {
            const targetIds = new Set();
            const pattern = new RegExp(`${appType}:([^|]+)`);

            integrationKeys.forEach((integrationKey) => {
                const match = integrationKey.match(pattern);
                if (match) {
                    targetIds.add(match[1]);
                }
            });

            if (targetIds.size > 0) {
                try {
                    const idArray = Array.from(targetIds);
                    const idBatches = [];
                    const maxKeys = APIManager._calculateOptimalBatchSize(idArray, fieldName);

                    for (let i = 0; i < idArray.length; i += maxKeys) {
                        idBatches.push(idArray.slice(i, i + maxKeys));
                    }

                    for (const batch of idBatches) {
                        const conditions = batch.map((id) => `"${id}"`).join(",");
                        const query = `${fieldName} in (${conditions})`;

                        const records = await APIManager.fetchAllRecords(this.appIds[appType], query, `補完検索-${appType}`);

                        results[appType].push(...records);
                    }
                } catch (error) {
                    console.error(`${appType}台帳補完検索エラー:`, error);
                }
            }
        }

        /**
         * 4つの台帳データを統合キーで統合
         * @param {Object} allLedgerData - 全台帳のデータ
         * @returns {Array} 統合されたレコード配列
         */
        integrateData(allLedgerData) {
            const integratedData = new Map();

            // 🔧 統合キーの正規化とマッチング用のヘルパー
            const normalizeIntegrationKey = (keyParts) => {
                // 主キーの順序を統一（SEAT, PC, EXT, USER）
                const appOrder = ['SEAT', 'PC', 'EXT', 'USER'];
                const sortedParts = [];
                
                appOrder.forEach(app => {
                    const part = keyParts.find(p => p.startsWith(`${app}:`));
                    if (part) {
                        sortedParts.push(part);
                    }
                });
                
                return sortedParts.join('|');
            };

            // 🔧 部分キーマッチング用のマップ
            const partialKeyMap = new Map(); // 部分キー -> 完全統合キー のマッピング

            // 各台帳のデータを統合キーでグループ化
            Object.keys(allLedgerData).forEach((appType) => {
                const records = allLedgerData[appType] || [];

                records.forEach((record) => {
                    const originalIntegrationKey = this._extractIntegrationKey(record);
                    const keyParts = originalIntegrationKey.split('|');
                    const normalizedKey = normalizeIntegrationKey(keyParts);

                    // 🔧 既存の統合レコードとのマッチングを試行
                    let targetIntegrationKey = normalizedKey;
                    let existingRecord = integratedData.get(targetIntegrationKey);

                    // 完全マッチしない場合、部分マッチを試行
                    if (!existingRecord) {
                        for (const [existingKey, existingData] of integratedData.entries()) {
                            const existingParts = existingKey.split('|');
                            const newParts = keyParts;

                            // 共通する主キーがあるかチェック
                            let hasCommonKey = false;
                            for (const newPart of newParts) {
                                if (existingParts.includes(newPart)) {
                                    hasCommonKey = true;
                                    break;
                                }
                            }

                            if (hasCommonKey) {
                                // 既存のレコードに統合
                                targetIntegrationKey = existingKey;
                                existingRecord = existingData;
                                
                                // 統合キーを更新（新しい主キーを追加）
                                const mergedParts = [...new Set([...existingParts, ...newParts])];
                                const mergedKey = normalizeIntegrationKey(mergedParts);
                                
                                // 古いキーを削除し、新しいキーで再登録
                                integratedData.delete(existingKey);
                                targetIntegrationKey = mergedKey;
                                existingRecord.integrationKey = mergedKey;
                                break;
                            }
                        }
                    }

                    // 統合レコードが存在しない場合は新規作成
                    if (!existingRecord) {
                        existingRecord = {
                            integrationKey: targetIntegrationKey,
                            ledgerData: {},
                            recordIds: {}
                        };
                    }

                    // データを統合
                    existingRecord.ledgerData[appType] = record;
                    existingRecord.recordIds[appType] = record.$id.value;
                    
                    // マップに登録
                    integratedData.set(targetIntegrationKey, existingRecord);
                });
            });

            const result = Array.from(integratedData.values());
            return result;
        }
    }

    // =============================================================================
    // 🗃️ データ管理
    // =============================================================================

    class DataManager {
        constructor() {
            this.draggedElement = null;
            this.showRowNumbers = true;
            this.cachedFieldOrder = null;
            this.appendMode = false; // 追加モード制御
            this.maxRowNumber = 0; // 最大行番号管理
            this.currentData = null;
        }

        /**
         * 追加モードの設定
         */
        setAppendMode(enabled) {
            this.appendMode = enabled;
        }

        /**
         * 行番号カウンターをリセット
         */
        resetRowCounter() {
            this.maxRowNumber = 0;
        }

        /**
         * 最大行番号を設定（テーブル初期表示時）
         */
        setMaxRowNumber(rowCount) {
            this.maxRowNumber = rowCount;
        }

        /**
         * 新しい行番号を取得（インクリメント）
         */
        getNextRowNumber() {
            this.maxRowNumber++;
            return this.maxRowNumber;
        }

        /**
         * 現在の最大行番号を取得
         */
        getCurrentMaxRowNumber() {
            return this.maxRowNumber;
        }

        clearTable() {
            const tbody = DOMHelper.getTableBody();
            if (tbody) {
                if (!this.appendMode) {
                    tbody.innerHTML = '';
                    this.resetRowCounter();
                } else {
                    // 追加モードでも初期メッセージセルがある場合は削除
                    const initialMessageCell = tbody.querySelector('.initial-message-cell');
                    if (initialMessageCell) {
                        const initialRow = initialMessageCell.closest('tr');
                        if (initialRow) {
                            initialRow.remove();
                        }
                    }
                }
            }
        }

        /**
         * 既存のレコードキーを取得（重複防止用）
         */
        getExistingRecordKeys() {
            const tbody = DOMHelper.getTableBody();
            const existingKeys = new Set();
            
            if (tbody && this.appendMode) {
                const rows = Array.from(tbody.querySelectorAll('tr'));
                
                rows.forEach((row, index) => {
                    const integrationKey = row.getAttribute('data-integration-key');
                    if (integrationKey) {
                        existingKeys.add(integrationKey);
                    }
                });
            }
            
            return existingKeys;
        }

        getFieldOrder() {
            if (this.cachedFieldOrder) {
                return this.cachedFieldOrder;
            }

            this.cachedFieldOrder = DOMHelper.getFieldOrderFromHeader();
            return this.cachedFieldOrder;
        }

        displayNoResults(tbody) {
            tbody.innerHTML = '';
            const noDataRow = document.createElement('tr');
            const noDataCell = document.createElement('td');
            noDataCell.colSpan = window.fieldsConfig.length;
            noDataCell.textContent = '検索条件に該当するデータが見つかりませんでした。';
            noDataCell.style.textAlign = 'center';
            noDataCell.style.padding = '20px';
            noDataCell.style.color = '#666';
            noDataRow.appendChild(noDataCell);
            tbody.appendChild(noDataRow);
        }

        /**
         * 現在のデータを設定
         */
        setCurrentData(data) {
            this.currentData = data;
        }

        /**
         * 現在のデータを取得
         */
        getCurrentData() {
            return this.currentData || [];
        }


    }

    // =============================================================================
    // 🎯 状態管理（シンプル版）
    // =============================================================================

    class StateManager {
        constructor() {
            this.modifiedCells = new Set();
            this.modifiedRows = new Set();
            this.rowStates = new Map();
        }

        markCellAsModified(cell, row) {
            StyleManager.highlightModifiedCell(cell);
            this.modifiedCells.add(cell);
            this.markRowAsModified(row);
        }

        markRowAsModified(row) {
            StyleManager.highlightModifiedRow(row);
            this.modifiedRows.add(row);
        }

        clearModifications() {
            this.modifiedCells.forEach(cell => StyleManager.removeHighlight(cell));
            this.modifiedRows.forEach(row => StyleManager.removeHighlight(row));
            this.modifiedCells.clear();
            this.modifiedRows.clear();
        }

        isCellModified(cell) {
            return this.modifiedCells.has(cell);
        }

        isRowModified(row) {
            return this.modifiedRows.has(row);
        }
    }

    // =============================================================================
    // 🌐 グローバル公開
    // =============================================================================

    // クラスをグローバルスコープに公開
    window.LedgerV2.Core = {
        APIManager,
        SearchManager,
        DataIntegrationManager,
        DataManager,
        StateManager
    };

    // レガシー互換性のため主要クラスを直接公開
    window.APIManager = APIManager;
    window.SearchManager = SearchManager;
    window.DataIntegrationManager = DataIntegrationManager;
    window.DataManager = DataManager;
    window.StateManager = StateManager;

    // グローバルインスタンス作成
    window.searchManager = new SearchManager();
    window.dataManager = new DataManager();
    window.stateManager = new StateManager();
    window.dataIntegrationManager = new DataIntegrationManager(); // 生データ管理用グローバルインスタンス

})();
